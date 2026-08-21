/** Owns durable provider responses, 24-hour refresh gating, offline backoff and corrected-port calculations. */

const fs = require("node:fs/promises");
const path = require("node:path");
const { applyReferenceLevelCorrections, applySecondaryCorrections } = require("./secondary-corrections.cjs");

const RECORD_CONTRACT = "ajrm-marine-tidal-station-cache-v1";
const MINIMUM_REFRESH_MS = 24 * 3600000;
const OFFLINE_RETRY_MS = 60 * 60000;

function safePart(value) {
	const text = String(value || "").trim();
	if (!/^[A-Za-z0-9._-]{1,100}$/.test(text)) throw new Error("Tidal provider or station identifier is invalid.");
	return text;
}

function coverage(events = []) {
	const times = events.map((event) => Date.parse(event.at)).filter(Number.isFinite);
	return times.length ? {
		startAt: new Date(Math.min(...times)).toISOString(),
		endAt: new Date(Math.max(...times)).toISOString(),
	} : { startAt: null, endAt: null };
}

function createTidalDatabase(options) {
	const directory = options.directory;
	const providers = options.providers;
	const memory = new Map();
	const attempts = new Map();
	const inflight = new Map();
	let networkBackoffUntil = 0;

	function key(providerId, stationId) {
		return `${safePart(providerId)}:${safePart(stationId)}`;
	}

	function file(providerId, stationId) {
		return path.join(directory, safePart(providerId), `${safePart(stationId)}.json`);
	}

	async function writeAtomic(filename, value) {
		await fs.mkdir(path.dirname(filename), { recursive: true });
		const temporary = `${filename}.${process.pid}.tmp`;
		await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
		await fs.rename(temporary, filename);
	}

	async function read(providerId, stationId, nowMs = Date.now()) {
		const cacheKey = key(providerId, stationId);
		if (memory.has(cacheKey)) {
			const value = memory.get(cacheKey);
			if (!value.cacheUseUntil || nowMs < Date.parse(value.cacheUseUntil)) return value;
			memory.delete(cacheKey);
		}
		if (!providers.get(providerId).persistentCachePermitted) return null;
		try {
			const value = JSON.parse(await fs.readFile(file(providerId, stationId), "utf8"));
			if (value.contract !== RECORD_CONTRACT || !Array.isArray(value.events)) return null;
			if (value.cacheUseUntil && nowMs >= Date.parse(value.cacheUseUntil)) {
				await fs.unlink(file(providerId, stationId)).catch((error) => { if (error.code !== "ENOENT") throw error; });
				return null;
			}
			memory.set(cacheKey, value);
			return value;
		} catch (error) {
			if (error.code === "ENOENT") return null;
			throw error;
		}
	}

	async function stationDataOnce(station, request = {}) {
		const provider = providers.get(station.providerId);
		const cacheKey = key(station.providerId, station.stationId);
		const now = new Date(request.now || Date.now());
		const nowMs = now.getTime();
		const cached = await read(station.providerId, station.stationId, nowMs);
		const ageMs = cached ? nowMs - Date.parse(cached.fetchedAt) : Infinity;
		// A manual update means "update if due". It never bypasses the minimum
		// 24-hour station gate and therefore cannot burn quota by repeated clicks.
		if (cached && ageMs <= MINIMUM_REFRESH_MS) return { ...cached, cache: "hit", due: false };
		const lastAttempt = attempts.get(cacheKey);
		const retryAt = Math.max(networkBackoffUntil, lastAttempt?.failedAt ? lastAttempt.failedAt + OFFLINE_RETRY_MS : 0);
		if (nowMs < retryAt) {
			if (cached) return { ...cached, cache: "staleFallback", due: true, fallbackReason: lastAttempt?.error || "Provider retry is deferred while offline.", retryAt: new Date(retryAt).toISOString() };
			throw new Error(`No cached data; provider retry deferred until ${new Date(retryAt).toISOString()}.`);
		}
		attempts.set(cacheKey, { attemptedAt: nowMs });
		try {
			const fetched = await provider.fetchEvents(station);
			const eventCoverage = coverage(fetched.events);
			const result = {
				contract: RECORD_CONTRACT,
				contractVersion: 1,
				providerId: station.providerId,
				stationId: station.stationId,
				stationName: station.stationName || station.stationId,
				fetchedAt: now.toISOString(),
				coverage: eventCoverage,
				events: fetched.events,
				timestampContract: fetched.timestampContract || "explicit-offset-v1",
				cacheUseUntil: provider.cacheUseUntil?.(now) || null,
			};
			memory.set(cacheKey, result);
			attempts.set(cacheKey, { attemptedAt: nowMs, succeededAt: nowMs });
			networkBackoffUntil = 0;
			if (provider.persistentCachePermitted) await writeAtomic(file(station.providerId, station.stationId), result);
			return { ...result, cache: "network", due: false };
		} catch (error) {
			attempts.set(cacheKey, { attemptedAt: nowMs, failedAt: nowMs, error: error.message });
			networkBackoffUntil = nowMs + Math.max(OFFLINE_RETRY_MS, Number(error.retryAfterMs) || 0);
			if (cached) return { ...cached, cache: "staleFallback", due: true, fallbackReason: error.message, retryAt: new Date(networkBackoffUntil).toISOString() };
			throw error;
		}
	}

	async function stationData(station, request = {}) {
		const cacheKey = key(station.providerId, station.stationId);
		if (inflight.has(cacheKey)) return inflight.get(cacheKey);
		const operation = stationDataOnce(station, request);
		inflight.set(cacheKey, operation);
		try {
			return await operation;
		} finally {
			if (inflight.get(cacheKey) === operation) inflight.delete(cacheKey);
		}
	}

	async function resolvePort(port, byId, request = {}, visited = new Set()) {
		if (!port || visited.has(port.locationId)) throw new Error("Tidal-port correction relationship is invalid or cyclic.");
		const nextVisited = new Set(visited).add(port.locationId);
		if (port.prediction.mode === "provider") {
			const data = await stationData(port.prediction, request);
			return { ...data, datum: port.datum, referenceLevels: port.referenceLevels, rootPort: port, correctionChain: [] };
		}
		if (port.prediction.mode === "corrections") {
			const parent = byId.get(port.prediction.parentLocationId);
			const parentData = await resolvePort(parent, byId, request, nextVisited);
			return {
				...parentData,
				events: applySecondaryCorrections(parentData.events, port.prediction.corrections, parentData.referenceLevels),
				datum: parentData.datum,
				referenceLevels: applyReferenceLevelCorrections(parentData.referenceLevels, port.prediction.corrections),
				correctionChain: [...parentData.correctionChain, { locationId: port.locationId, name: port.name, parentLocationId: parent.locationId }],
			};
		}
		throw new Error(`No prediction source is configured for ${port.name}.`);
	}

	async function inspectStation(station, now = new Date()) {
		const cached = await read(station.providerId, station.stationId, new Date(now).getTime());
		const provider = providers.get(station.providerId);
		const ageMs = cached ? new Date(now).getTime() - Date.parse(cached.fetchedAt) : Infinity;
		const endMs = cached?.coverage?.endAt ? Date.parse(cached.coverage.endAt) : Number.NaN;
		return {
			providerId: station.providerId,
			providerName: provider.name,
			stationId: station.stationId,
			stationName: station.stationName,
			configured: provider.configured,
			persistent: provider.persistentCachePermitted,
			fetchedAt: cached?.fetchedAt || null,
			ageHours: Number.isFinite(ageMs) ? ageMs / 3600000 : null,
			due: !cached || ageMs > MINIMUM_REFRESH_MS,
			coverageStartAt: cached?.coverage?.startAt || null,
			coverageEndAt: cached?.coverage?.endAt || null,
			coveredNow: Boolean(cached && Date.parse(cached.coverage?.startAt) <= new Date(now).getTime() && endMs >= new Date(now).getTime()),
			eventCount: cached?.events?.length || 0,
			lastError: attempts.get(key(station.providerId, station.stationId))?.error || null,
		};
	}

	return Object.freeze({ stationData, resolvePort, inspectStation, providers: providers.list, refreshHours: 24 });
}

module.exports = { MINIMUM_REFRESH_MS, createTidalDatabase, coverage };
