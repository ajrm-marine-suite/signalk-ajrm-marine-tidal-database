/** Implements the first provider adapter for UKHO high/low-water event predictions. */

const { normalizeTideEvents } = require("../tide-calculation.cjs");

const ENDPOINTS = [
	"https://admiraltyapi.azure-api.net/uktidalapi/v1/Stations",
	"https://admiraltyapi.azure-api.net/uktidalapi/api/v1/Stations",
];

const DEFAULT_REQUEST_INTERVAL_MS = 5000;
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 15 * 60000;

function retryAfterMilliseconds(value, nowMs = Date.now()) {
	const text = String(value || "").trim();
	if (!text) return DEFAULT_RATE_LIMIT_BACKOFF_MS;
	const seconds = Number(text);
	if (Number.isFinite(seconds) && seconds >= 0) return Math.max(1000, seconds * 1000);
	const dateMs = Date.parse(text);
	return Number.isFinite(dateMs) ? Math.max(1000, dateMs - nowMs) : DEFAULT_RATE_LIMIT_BACKOFF_MS;
}

function createUkhoProvider(options = {}) {
	const fetchFn = options.fetchFn || globalThis.fetch;
	const nowFn = options.nowFn || Date.now;
	const sleepFn = options.sleepFn || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
	const requestIntervalMs = Math.max(1000, Number(options.requestIntervalMs) || DEFAULT_REQUEST_INTERVAL_MS);
	const subscriptionTier = String(options.subscriptionTier || "discovery").toLowerCase();
	let queue = Promise.resolve();
	let nextRequestAt = 0;

	function enqueue(operation) {
		const scheduled = queue.then(async () => {
			const waitMs = Math.max(0, nextRequestAt - nowFn());
			if (waitMs) await sleepFn(waitMs);
			try {
				return await operation();
			} finally {
				nextRequestAt = nowFn() + requestIntervalMs;
			}
		});
		queue = scheduled.catch(() => {});
		return scheduled;
	}

	return Object.freeze({
		id: "ukhoTidalEvents",
		name: "UK Hydrographic Office Tidal API",
		configured: Boolean(options.apiKey),
		persistentCachePermitted: true,
		cacheUseUntil(now = new Date()) {
			if (subscriptionTier !== "discovery") return null;
			return new Date(Date.UTC(new Date(now).getUTCFullYear() + 1, 0, 1)).toISOString();
		},
		requestIntervalMs,
		async fetchEvents(station) {
			if (!options.apiKey) throw new Error("Configure a UKHO Tidal API subscription key in Tidal Database.");
			return enqueue(async () => {
				let lastError;
				for (const endpoint of ENDPOINTS) {
					try {
						const response = await fetchFn(`${endpoint}/${encodeURIComponent(station.stationId)}/TidalEvents`, {
							headers: { "Ocp-Apim-Subscription-Key": options.apiKey },
							signal: AbortSignal.timeout(15000),
						});
						if (response.status === 429) {
							const error = new Error(`UKHO Tidal API returned 429 Too Many Requests; retry is deferred.`);
							error.code = "UKHO_RATE_LIMITED";
							error.retryAfterMs = retryAfterMilliseconds(response.headers?.get?.("retry-after"), nowFn());
							throw error;
						}
						if (!response.ok) throw new Error(`UKHO Tidal API returned ${response.status} ${response.statusText}.`);
						const events = normalizeTideEvents(await response.json());
						if (events.length < 2) throw new Error("UKHO Tidal API returned insufficient high/low-water events.");
						return { events, timestampContract: "ukho-gmt-v1" };
					} catch (error) {
						if (error.code === "UKHO_RATE_LIMITED") throw error;
						lastError = error;
					}
				}
				throw lastError || new Error("UKHO Tidal API did not respond.");
			});
		},
	});
}

module.exports = { DEFAULT_REQUEST_INTERVAL_MS, createUkhoProvider, retryAfterMilliseconds };
