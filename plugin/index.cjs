/** Signal K entry point for the provider-neutral durable Tidal Database and prediction service. */

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const bundledDefinitions = require("../defaults/tidal-definitions.json");
const { calculateTide } = require("./tide-calculation.cjs");
const { createProviderRegistry } = require("./provider-registry.cjs");
const { createUkhoProvider } = require("./providers/ukho.cjs");
const { createTidalDatabase } = require("./database.cjs");
const { MIGRATION_CONTRACT, createDefinitionStore } = require("./definition-store.cjs");
const { recommendSecondary, selectPort } = require("./spatial-selection.cjs");

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
const SERVICE_SYMBOL = Symbol.for("mcdonaldajr.ajrmMarineTidalDatabase");
const DIAGNOSTICS_SYMBOL = Symbol.for("mcdonaldajr.ajrmMarineTidalDiagnostics");
const LOCATION_SYMBOL = Symbol.for("mcdonaldajr.ajrmMarineLocations");
const PLANNING_SYMBOL = Symbol.for("mcdonaldajr.ajrmMarinePlanning");
const GATE_MIGRATION_SYMBOL = Symbol.for("mcdonaldajr.ajrmMarineTidalGateMigration");
const STATUS_PATH = "plugins.ajrmMarineTidalDatabase";
const TIDE_PATH = "plugins.ajrmMarineTidalDatabase.tide";

function eventSummary(event) {
	return event ? { at: event.at, heightM: event.heightM } : null;
}

function uniqueProviderStations(definitions) {
	const values = new Map();
	for (const port of definitions.ports.filter((entry) => entry.prediction.mode === "provider")) {
		const station = port.prediction;
		const key = `${station.providerId}:${station.stationId}`;
		if (!values.has(key)) values.set(key, { ...station, ports: [] });
		values.get(key).ports.push({ locationId: port.locationId, name: port.name, kind: port.kind });
	}
	return [...values.values()];
}

function portKindFromLocation(location) {
	const standard = location?.types?.includes("tidalStandardPort");
	const secondary = location?.types?.includes("tidalSecondaryPort");
	if (standard === secondary) {
		throw new Error("The selected Location must have exactly one tidal standard-port or tidal secondary-port classification.");
	}
	return standard ? "standard" : "secondary";
}

function assertLocationName(value, location) {
	const supplied = String(value?.name || "").trim();
	if (supplied && supplied !== location.name) {
		throw new Error(`The supplied name does not match the Location-owned name for ${location.id}. Refresh Location Editor data and try again.`);
	}
}

function normalizePortDefinition(locationId, value = {}, location) {
	if (!location || location.id !== String(locationId || "")) throw new Error("The selected tidal-port Location does not exist.");
	assertLocationName(value, location);
	const kind = portKindFromLocation(location);
	if (value.kind && value.kind !== kind) throw new Error(`Port class is owned by Location Editor and must be ${kind}.`);
	const mode = String(value.prediction?.mode || "unavailable");
	if (mode === "corrections" && kind !== "secondary") throw new Error("Entered corrections require a Location classified as a tidal secondary port.");
	const port = {
		locationId:String(locationId || ""), cachedLocationName:String(location.name || "").trim(),
		kind,
		datum:String(value.datum || "").trim() || null,
		referenceLevels:value.referenceLevels || null,
		automaticPreferredPortLocationId:String(value.automaticPreferredPortLocationId || "").trim() || null,
		advisory:value.advisory && typeof value.advisory === "object" ? {
			status:String(value.advisory.status || "").trim() || "caution",
			message:String(value.advisory.message || "").trim(),
		} : null,
		prediction:{ mode },
	};
	if (!port.locationId || !port.cachedLocationName) throw new Error("A tidal definition needs a valid named Location.");
	if (mode === "provider") Object.assign(port.prediction,{
		providerId:String(value.prediction.providerId || "").trim(), stationId:String(value.prediction.stationId || "").trim(),
		stationName:String(value.prediction.stationName || port.cachedLocationName).trim(),
	});
	if (mode === "corrections") Object.assign(port.prediction,{
		parentLocationId:String(value.prediction.parentLocationId || "").trim(),
		corrections:structuredClone(value.prediction.corrections || {}),
	});
	return port;
}

function normalizeAreaDefinition(locationId, value = {}, location) {
	if (!location || location.id !== String(locationId || "")) throw new Error("The selected tidal-region Location does not exist.");
	if (!location.types?.includes("tidalRegion")) throw new Error("The selected Location is not classified as a tidal region.");
	assertLocationName(value, location);
	const area = {
		locationId: String(locationId || ""),
		cachedLocationName: String(location.name || "").trim(),
		portLocationId: String(value.portLocationId || "").trim(),
		parentAreaLocationId: String(value.parentAreaLocationId || "").trim() || null,
	};
	if (!area.locationId || !area.cachedLocationName || !area.portLocationId) {
		throw new Error("A tidal-region assignment needs a valid named Location and serving tidal port.");
	}
	return area;
}

async function readState(file) {
	try {
		const value = JSON.parse(await fsp.readFile(file, "utf8"));
		return { pinnedPortId: typeof value.pinnedPortId === "string" ? value.pinnedPortId : null };
	} catch (error) {
		if (error.code === "ENOENT") return { pinnedPortId: null };
		throw error;
	}
}

async function writeState(file, value) {
	await fsp.mkdir(path.dirname(file), { recursive: true });
	const temporary = `${file}.${process.pid}.tmp`;
	await fsp.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
	await fsp.rename(temporary, file);
}

module.exports = function ajrmMarineTidalDatabase(app) {
	const plugin = {};
	const dataDirectory = app.getDataDirPath?.() || path.join(process.cwd(), ".ajrm-tidal-database");
	const stateFile = path.join(dataDirectory, "selection.json");
	const definitionStore = createDefinitionStore(path.join(dataDirectory,"definitions.json"),bundledDefinitions);
	let running = false;
	let database;
	let providers;
	let pinnedPortId = null;
	let maintenanceTimer = null;
	let maintenanceDelay = null;
	let maintenancePromise = null;
	let initialized = Promise.resolve();
	let latestProjection = null;
	let latestPosition = null;
	let gateMigrationRegistry = null;
	let lastMaintenance = { running: false, startedAt: null, completedAt: null, updated: 0, cached: 0, failed: 0, error: "" };
	let unsubscribes = [];

	plugin.id = "signalk-ajrm-marine-tidal-database";
	plugin.name = "AJRM Marine Tidal Database";
	plugin.description = "Provider-neutral durable tidal prediction cache and calculation service";
	plugin.schema = {
		type: "object",
		properties: {
			ukhoApiKey: { type: "string", title: "UKHO Tidal API subscription key", format: "password" },
			ukhoSubscriptionTier: {
				type: "string",
				title: "UKHO subscription tier",
				enum: ["discovery", "foundation", "premium"],
				default: "discovery",
				description: "Select the tier attached to this key. Discovery records are stored only within the current UTC licence year.",
			},
			ukhoRequestIntervalSeconds: {
				type: "number", title: "Minimum seconds between UKHO requests", default: 5, minimum: 1, maximum: 60,
				description: "A conservative provider-wide pacing interval. UKHO Retry-After responses are also honoured.",
			},
			automaticMaintenance: { type: "boolean", title: "Keep all configured prediction stations up to date", default: true },
		},
	};

	plugin.start = (configured = {}) => {
		if (running) return;
		running = true;
		providers = createProviderRegistry([createUkhoProvider({
			apiKey: configured.ukhoApiKey || process.env.UKHO_API_KEY || "",
			subscriptionTier: configured.ukhoSubscriptionTier || "discovery",
			requestIntervalMs: Math.max(1, Number(configured.ukhoRequestIntervalSeconds) || 5) * 1000,
		})]);
		database = createTidalDatabase({ directory: path.join(dataDirectory, "stations"), providers });
		const definitions = definitionStore.read();
		initialized = Promise.all([
			readState(stateFile).then((state) => { pinnedPortId = state.pinnedPortId; }),
			refreshLocationNameCache(),
		]).catch((error) => app.error?.(error.message));
		const service = Object.freeze({
			contract: "ajrm-marine-tidal-database-service-v2",
			contractVersion: 2,
			configured: providers.list().some((provider) => provider.configured),
			status: (request = {}) => resolve(request),
			refresh: (request = {}) => resolve(request),
			databaseStatus: () => databaseStatus(),
			listPorts: async () => (await joinedDefinitions()).ports,
			listAreas: async () => (await joinedDefinitions()).areas,
			setArea: async (locationId, value) => {
				const locations = await locationMapForWrite();
				const area = normalizeAreaDefinition(locationId, value, locations.get(String(locationId || "")));
				validateAreaLocationReferences(area, locations);
				await definitionStore.setArea(area);
				return (await joinedDefinitions({ locations })).areas.find((entry) => entry.locationId === area.locationId);
			},
			removeArea: (locationId) => definitionStore.removeArea(String(locationId || "")),
			recommendSecondary: async (request = {}) => {
				const locations = await listLocations();
				const definitions = operationalDefinitions(joinDefinitions(definitionStore.read(), locations).catalogue);
				const result = recommendSecondary(definitions, locations, request.position || latestPosition);
				return {
					...result,
					port: result.port ? { id:result.port.locationId, name:result.port.name } : null,
					tidalRegion: result.tidalRegion ? { id:result.tidalRegion.locationId, name:result.tidalRegion.name } : null,
				};
			},
			updateDue: () => maintainAll(),
			pin: async (portId) => {
				pinnedPortId = portId || null;
				await writeState(stateFile, { pinnedPortId, updatedAt: new Date().toISOString() });
				return resolve();
			},
		});
		app.ajrmMarineTidalDatabase = service;
		globalThis[SERVICE_SYMBOL] = service;
		const diagnostics = Object.freeze({
			contract:"ajrm-marine-tidal-database-diagnostics-v2",
			contractVersion:2,
			snapshot:async () => {
				const definitions = await joinedDefinitions();
				return { ...(await databaseStatus(definitions)), definitions, latestProjection };
			},
		});
		app.ajrmMarineTidalDiagnostics = diagnostics;
		globalThis[DIAGNOSTICS_SYMBOL] = diagnostics;
		installGateMigrationRegistry();
		subscribePosition();
		if (configured.automaticMaintenance !== false) {
			maintenanceDelay = setTimeout(() => maintainAll(), 5000);
			maintenanceDelay.unref?.();
			maintenanceTimer = setInterval(() => maintainAll(), 60 * 60000);
			maintenanceTimer.unref?.();
		}
		initialized
			.then(() => databaseStatus())
			.then((status) => { if (running) publish(STATUS_PATH, status); })
			.catch((error) => app.error?.(`Could not publish Tidal Database startup status: ${error.message}`));
		resolve().catch(() => {});
		app.setPluginStatus?.(`Started v${packageJson.version}; ${uniqueProviderStations(definitions).length} provider stations`);
	};

	plugin.stop = async () => {
		running = false;
		clearTimeout(maintenanceDelay);
		clearInterval(maintenanceTimer);
		for (const unsubscribe of unsubscribes.splice(0)) unsubscribe?.();
		await Promise.allSettled([maintenancePromise].filter(Boolean));
		if (globalThis[SERVICE_SYMBOL] === app.ajrmMarineTidalDatabase) delete globalThis[SERVICE_SYMBOL];
		if (globalThis[DIAGNOSTICS_SYMBOL] === app.ajrmMarineTidalDiagnostics) delete globalThis[DIAGNOSTICS_SYMBOL];
		if (globalThis[GATE_MIGRATION_SYMBOL] === gateMigrationRegistry) delete globalThis[GATE_MIGRATION_SYMBOL];
		gateMigrationRegistry = null;
		delete app.ajrmMarineTidalDatabase;
		delete app.ajrmMarineTidalDiagnostics;
		publish(STATUS_PATH, null);
		publish(TIDE_PATH, null);
		app.setPluginStatus?.("Stopped");
	};

	plugin.registerWithRouter = (router) => {
		const readRouter = typeof router.access === "function" ? router.access("readonly") : router;
		const writeRouter = typeof router.access === "function" ? router.access("readwrite") : router;
		readRouter.get("/status", async (_req, res) => res.json(await databaseStatus()));
		readRouter.get("/stations", async (_req, res) => res.json(await databaseStatus()));
		readRouter.get("/definitions", async (_req,res) => res.json(await joinedDefinitions()));
		writeRouter.put("/definitions/ports/:locationId", write(async (req,res) => {
			const locations = await locationMapForWrite();
			const port = normalizePortDefinition(req.params.locationId,req.body,locations.get(String(req.params.locationId || "")));
			validatePortLocationReferences(port, locations);
			await definitionStore.setPort(port);
			const definitions = await joinedDefinitions({ locations });
			res.json({ ok:true,port:definitions.ports.find((entry) => entry.locationId === port.locationId),status:await databaseStatus(definitions) });
		}));
		writeRouter.delete("/definitions/ports/:locationId", write(async (req,res) => {
			await definitionStore.removePort(req.params.locationId);
			res.json({ ok:true,status:await databaseStatus() });
		}));
		writeRouter.put("/definitions/areas/:locationId", write(async (req,res) => {
			const locations = await locationMapForWrite();
			const area = normalizeAreaDefinition(req.params.locationId,req.body,locations.get(String(req.params.locationId || "")));
			validateAreaLocationReferences(area, locations);
			await definitionStore.setArea(area);
			const definitions = await joinedDefinitions({ locations });
			res.json({ ok:true,area:definitions.areas.find((entry) => entry.locationId === area.locationId),definitions });
		}));
		writeRouter.delete("/definitions/areas/:locationId", write(async (req,res) => {
			await definitionStore.removeArea(req.params.locationId);
			res.json({ ok:true,definitions:await joinedDefinitions() });
		}));
		writeRouter.post("/stations/update", write(async (_req, res) => res.json(await maintainAll())));
		readRouter.get("/tides/status", async (req, res) => {
			try { res.json(await resolve(tideRequest(req))); } catch (error) { res.status(400).json({ error: error.message }); }
		});
		writeRouter.post("/tides/pin", write(async (req, res) => {
			pinnedPortId = req.body?.portId || null;
			await writeState(stateFile, { pinnedPortId, updatedAt: new Date().toISOString() });
			res.json(await resolve(tideRequest(req)));
		}));
		writeRouter.post("/tides/refresh", write(async (req, res) => res.json(await resolve(tideRequest(req)))));
	};
	plugin.getOpenApi = () => JSON.parse(fs.readFileSync(path.join(__dirname, "openApi.json"), "utf8"));

	function locationsService() {
		return app.ajrmMarineLocations || globalThis[LOCATION_SYMBOL] || null;
	}

	async function listLocations() {
		const service = locationsService();
		if (!service?.list) throw new Error("AJRM Marine Location Editor is unavailable.");
		const locations = await service.list({ workspace: "all" });
		if (!Array.isArray(locations)) throw new Error("AJRM Marine Location Editor returned an invalid Location list.");
		return locations;
	}

	function joinDefinitions(stored, locations = null, locationError = null) {
		const byId = locations instanceof Map
			? locations
			: new Map((Array.isArray(locations) ? locations : []).map((location) => [location.id,location]));
		function typeMatches(location, expectedType) {
			if (expectedType === "tidalStandardPort" || expectedType === "tidalSecondaryPort") {
				try {
					const kind = portKindFromLocation(location);
					return expectedType === `tidal${kind === "standard" ? "Standard" : "Secondary"}Port`;
				} catch {
					return false;
				}
			}
			return Boolean(location?.types?.includes(expectedType));
		}
		function joined(entry, expectedType) {
			const { cachedLocationName, ...definition } = entry;
			const location = byId.get(entry.locationId) || null;
			const locationName = String(location?.name || "").trim();
			const typeValid = typeMatches(location, expectedType);
			return {
				...definition,
				name:locationName || cachedLocationName,
				nameSource:locationName ? "location" : "cached",
				locationJoin:locationError ? "service-unavailable" : !location ? "missing-location" : typeValid ? "valid" : "type-mismatch",
			};
		}
		return {
			catalogue:{
				...stored,
				nameOwnership:"ajrm-marine-locations",
				locationJoinError:locationError?.message || null,
				ports:stored.ports.map((port) => joined(port, `tidal${port.kind === "standard" ? "Standard" : "Secondary"}Port`)),
				areas:stored.areas.map((area) => joined(area, "tidalRegion")),
			},
			byId,
		};
	}

	async function refreshLocationNameCache(locations = null) {
		const values = locations instanceof Map ? [...locations.values()] : locations || await listLocations();
		const namesById = new Map(values.map((location) => [location.id,String(location.name || "").trim()]));
		await definitionStore.cacheLocationNames(namesById);
		return values;
	}

	async function joinedDefinitions(options = {}) {
		let locations = options.locations || null;
		let locationError = null;
		if (!locations) {
			try { locations = await listLocations(); }
			catch (error) { locationError = error; }
		}
		if (locations) {
			try { await refreshLocationNameCache(locations); }
			catch (error) { app.error?.(`Could not refresh cached Location names: ${error.message}`); }
		}
		return joinDefinitions(definitionStore.read(), locations, locationError).catalogue;
	}

	async function locationMapForWrite() {
		return new Map((await listLocations()).map((location) => [location.id,location]));
	}

	function validatePortLocationReferences(port, locations) {
		const definitions = definitionStore.read();
		for (const [locationId,label] of [
			[port.prediction.parentLocationId,"parent standard port"],
			[port.automaticPreferredPortLocationId,"automatically preferred port"],
		]) {
			if (!locationId) continue;
			const referenced = definitions.ports.find((entry) => entry.locationId === locationId);
			const location = locations.get(locationId);
			if (!referenced || !location) throw new Error(`The ${label} must join to an existing tidal-port Location and definition.`);
			if (portKindFromLocation(location) !== referenced.kind) throw new Error(`The ${label} classification does not match its Tidal Database definition.`);
		}
	}

	function validateAreaLocationReferences(area, locations) {
		const definitions = definitionStore.read();
		const port = definitions.ports.find((entry) => entry.locationId === area.portLocationId);
		const portLocation = locations.get(area.portLocationId);
		if (!port || !portLocation) throw new Error("The serving tidal port must join to an existing tidal-port Location and definition.");
		if (portKindFromLocation(portLocation) !== port.kind) throw new Error("The serving tidal-port classification does not match its Tidal Database definition.");
		if (area.parentAreaLocationId) {
			const parent = definitions.areas.find((entry) => entry.locationId === area.parentAreaLocationId);
			const parentLocation = locations.get(area.parentAreaLocationId);
			if (!parent || !parentLocation?.types?.includes("tidalRegion")) throw new Error("The parent tidal region must join to an existing tidal-region Location and definition.");
		}
	}

	function operationalDefinitions(definitions) {
		const joinedPorts = new Map(definitions.ports.map((port) => [port.locationId,port]));
		function hasOperationalCorrectionSource(port, seen = new Set()) {
			if (!port || port.locationJoin !== "valid" || seen.has(port.locationId)) return false;
			if (port.prediction.mode === "provider") return port.kind === "standard";
			if (port.prediction.mode !== "corrections") return false;
			return hasOperationalCorrectionSource(
				joinedPorts.get(port.prediction.parentLocationId),
				new Set(seen).add(port.locationId),
			);
		}
		const ports = definitions.ports.filter((port) =>
			port.locationJoin === "valid" &&
			(port.prediction.mode !== "corrections" || hasOperationalCorrectionSource(
				joinedPorts.get(port.prediction.parentLocationId),
				new Set([port.locationId]),
			)),
		);
		const portIds = new Set(ports.map((port) => port.locationId));
		return {
			...definitions,
			ports,
			areas:definitions.areas.filter((area) => area.locationJoin === "valid" && portIds.has(area.portLocationId)),
		};
	}

	async function resolve(request = {}) {
		await initialized;
		const now = new Date(request.now || Date.now());
		let locations;
		try { locations = await listLocations(); } catch (error) { return emptyProjection(error.message, now); }
		const joined = joinDefinitions(definitionStore.read(), locations).catalogue;
		const definitions = operationalDefinitions(joined);
		const requestedDefinitionId = request.portId || pinnedPortId;
		const requestedDefinition = requestedDefinitionId
			? joined.ports.find((port) => port.locationId === requestedDefinitionId)
			: null;
		if (requestedDefinitionId && !requestedDefinition) {
			return emptyProjection("The selected tidal-port definition does not exist. Clear or replace the selected port before requesting predictions.", now);
		}
		if (requestedDefinition && requestedDefinition.locationJoin !== "valid") {
			return emptyProjection(`The selected tidal-port definition has a ${requestedDefinition.locationJoin} Location join. Repair it in Location Editor before requesting predictions.`, now);
		}
		if (requestedDefinition && !definitions.ports.some((port) => port.locationId === requestedDefinition.locationId)) {
			return emptyProjection("The selected secondary port has an invalid or unavailable reference-port chain. Repair its reference port in Location Editor before requesting predictions.", now);
		}
		const selection = selectPort(definitions, locations, {
			...request,
			position: request.position || latestPosition,
			pinnedPortId,
		});
		if (!selection.port) return emptyProjection("No suitable tidal port was selected.", now, selection);
		try {
			const byId = new Map(definitions.ports.map((port) => [port.locationId, port]));
			const data = await database.resolvePort(selection.port, byId, { now });
			const calculated = calculateTide(data.events, now);
			const covered = calculated.valid;
			const availability = {
				...calculated.capabilities,
				currentHeight: calculated.valid,
				nextHighWater: Boolean(calculated.nextHighWater),
				nextLowWater: Boolean(calculated.nextLowWater),
			};
			const ageSeconds = Math.max(0, (now.getTime() - Date.parse(data.fetchedAt)) / 1000);
			const freshness = {
				state: covered ? "available" : "outside-coverage",
				ageSeconds,
				refreshAfterSeconds: 24 * 3600,
				refreshDue: ageSeconds > 24 * 3600,
				predictionExpiresAt: null,
				coverageStartAt: data.coverage?.startAt || data.events[0]?.at || null,
				coverageEndAt: data.coverage?.endAt || data.events.at(-1)?.at || null,
			};
			const result = {
				contract: "ajrm-marine-tide-resolver-v1",
				contractVersion: 1,
				valid: covered,
				availability,
				calculationReferenceAt: now.toISOString(),
				selectedPort: { id: selection.port.locationId, name: selection.port.name, types: [`tidal${selection.port.kind === "standard" ? "Standard" : "Secondary"}Port`] },
				selection: { reason: selection.reason, pinned: selection.pinned, tidalRegion: selection.area ? { id: selection.area.locationId, name: selection.area.name } : null, automaticPreference: selection.automaticPreference || null },
				heightNowM: covered ? calculated.heightNowM : null,
				nextHighWater: eventSummary(calculated.nextHighWater),
				nextLowWater: eventSummary(calculated.nextLowWater),
				trend: calculated.trend,
				datum: data.datum,
				referenceLevels: data.referenceLevels,
				advisory: selection.port.advisory || null,
				station: { providerId: data.providerId, id: data.stationId, name: data.stationName, standardPort: { id: data.rootPort.locationId, name: data.rootPort.name } },
				source: { provider: providers.get(data.providerId).name, fetchedAt: data.fetchedAt, cache: data.cache, persistent: providers.get(data.providerId).persistentCachePermitted, fallbackReason: data.fallbackReason || null, interpolation: calculated.interpolation || null, secondaryPortCorrections: data.correctionChain },
				freshness,
				curve: calculated.curve,
				events: request.includeEvents ? data.events : undefined,
				error: covered ? "" : !availability.completeExtrema
					? `Provider supplies ${availability.highWater ? "high-water" : availability.lowWater ? "low-water" : "no usable"} events only; current height and a full tidal curve are unavailable.`
					: "Cached tidal events do not cover the requested time.",
			};
			latestProjection = result;
			publish(TIDE_PATH, { ...result, curve: undefined });
			return result;
		} catch (error) {
			return emptyProjection(error.message, now, selection);
		}
	}

	function emptyProjection(error, now, selection = {}) {
		return {
			contract: "ajrm-marine-tide-resolver-v1", contractVersion: 1, valid: false,
			calculationReferenceAt: now.toISOString(), selectedPort: selection.port ? { id: selection.port.locationId, name: selection.port.name } : null,
			selection: { reason: selection.reason || "unavailable", pinned: selection.pinned || false },
			heightNowM: null, nextHighWater: null, nextLowWater: null, trend: "unknown", datum: null,
			referenceLevels: null, station: null, source: null, freshness: null, curve: [], advisory: null,
			availability: { highWater:false, lowWater:false, completeExtrema:false, curve:false, currentHeight:false, nextHighWater:false, nextLowWater:false }, error,
		};
	}

	async function databaseStatus(definitions = null) {
		definitions ||= await joinedDefinitions();
		const operational = operationalDefinitions(definitions);
		const operationalPortById = new Map(operational.ports.map((port) => [port.locationId,port]));
		const stations = [];
		for (const station of uniqueProviderStations(operational)) {
			const status = await database.inspectStation(station);
			stations.push({ ...status, ports: station.ports });
		}
		const summary = {
			stationCount: stations.length,
			cachedCount: stations.filter((station) => station.fetchedAt).length,
			coveredCount: stations.filter((station) => station.coveredNow).length,
			dueCount: stations.filter((station) => station.due).length,
			errorCount: stations.filter((station) => station.lastError).length,
		};
		const joins = [...definitions.ports,...definitions.areas];
		const locationJoins = {
			state:joins.every((entry) => entry.locationJoin === "valid") ? "ready" : "degraded",
			validCount:joins.filter((entry) => entry.locationJoin === "valid").length,
			degradedCount:joins.filter((entry) => entry.locationJoin !== "valid").length,
			missingCount:joins.filter((entry) => entry.locationJoin === "missing-location").length,
			typeMismatchCount:joins.filter((entry) => entry.locationJoin === "type-mismatch").length,
			serviceUnavailableCount:joins.filter((entry) => entry.locationJoin === "service-unavailable").length,
			error:definitions.locationJoinError,
		};
		const stationByKey = new Map(stations.map((station) => [`${station.providerId}:${station.stationId}`, station]));
		function sourceFor(port, seen = new Set()) {
			if (!port || seen.has(port.locationId)) return null;
			if (port.prediction.mode === "provider") return {
				mode: "provider", providerId: port.prediction.providerId, stationId: port.prediction.stationId,
				station: stationByKey.get(`${port.prediction.providerId}:${port.prediction.stationId}`) || null,
			};
			if (port.prediction.mode === "corrections") {
				const parent = operationalPortById.get(port.prediction.parentLocationId);
				const root = sourceFor(parent, new Set(seen).add(port.locationId));
				return root ? { ...root, mode: "corrections", parent: parent ? { id: parent.locationId, name: parent.name } : null } : null;
			}
			return null;
		}
		const ports = definitions.ports.map((port) => {
			const source = sourceFor(operationalPortById.get(port.locationId));
			return {
				locationId: port.locationId, name: port.name, nameSource:port.nameSource, locationJoin:port.locationJoin, kind: port.kind,
				predictionMode: port.prediction.mode,
				parent: source?.parent || null,
				providerId: source?.providerId || null,
				stationId: source?.stationId || null,
				fetchedAt: source?.station?.fetchedAt || null,
				coverageStartAt: source?.station?.coverageStartAt || null,
				coverageEndAt: source?.station?.coverageEndAt || null,
				coveredNow: source?.station?.coveredNow || false,
				due: source?.station?.due ?? true,
				advisory: port.advisory || null,
				status: !source ? "unavailable" : source.station?.fetchedAt ? (source.station.coveredNow ? "ready" : "cached-outside-coverage") : "not-cached",
			};
		});
		return {
			contract: "ajrm-marine-tidal-database-status-v2", contractVersion: 2,
			plugin: plugin.id, version: packageJson.version, enabled: running,
			providers: providers?.list() || [], summary, locationJoins, maintenance: lastMaintenance,
			policy:{ refreshFloorHours:24, offlineRetryHours:1, discoveryCacheUtcYearBounded:true, requestIntervalSeconds:(providers?.list()?.[0]?.requestIntervalMs || 5000) / 1000 },
			latestProjection: latestProjection ? { valid: latestProjection.valid, selectedPort: latestProjection.selectedPort, freshness: latestProjection.freshness, error: latestProjection.error } : null,
			stations, ports,
		};
	}

	function installGateMigrationRegistry() {
		if (!definitionStore.readGateMigration()) return;
		const acknowledge = async () => {
			const result = await definitionStore.completeGateMigration();
			if (!definitionStore.readGateMigration() && globalThis[GATE_MIGRATION_SYMBOL] === gateMigrationRegistry) {
				delete globalThis[GATE_MIGRATION_SYMBOL];
			}
			return result;
		};
		gateMigrationRegistry = Object.freeze({
			contract:MIGRATION_CONTRACT,
			contractVersion:1,
			read:() => definitionStore.readGateMigration(),
			snapshot:() => definitionStore.readGateMigration(),
			complete:acknowledge,
			ack:acknowledge,
		});
		globalThis[GATE_MIGRATION_SYMBOL] = gateMigrationRegistry;
		app.debug?.("Planning-owned tidal-gate migration data is available for one-time import.");
		const planning = globalThis[PLANNING_SYMBOL];
		if (typeof planning?.importLegacyTidalGates === "function") {
			Promise.resolve(planning.importLegacyTidalGates(gateMigrationRegistry)).catch((error) => {
				app.error?.(`Could not offer legacy tidal-gate data to AJRM Marine Planning: ${error.message}`);
			});
		}
	}

	async function maintainAll() {
		if (maintenancePromise) return maintenancePromise;
		maintenancePromise = (async () => {
			const startedAt = new Date().toISOString();
			lastMaintenance = { running: true, startedAt, completedAt: null, updated: 0, cached: 0, failed: 0, error: "" };
			const definitions = operationalDefinitions(await joinedDefinitions());
			for (const station of uniqueProviderStations(definitions)) {
				try {
					const result = await database.stationData(station);
					if (result.cache === "network") lastMaintenance.updated += 1;
					else lastMaintenance.cached += 1;
				} catch (error) {
					lastMaintenance.failed += 1;
					lastMaintenance.error ||= error.message;
				}
			}
			lastMaintenance = { ...lastMaintenance, running: false, completedAt: new Date().toISOString() };
			publish(STATUS_PATH, await databaseStatus());
			return databaseStatus();
		})().finally(() => { maintenancePromise = null; });
		return maintenancePromise;
	}

	function subscribePosition() {
		latestPosition = normalizePosition(app.getSelfPath?.("navigation.position"));
		if (!app.subscriptionmanager?.subscribe) return;
		app.subscriptionmanager.subscribe({ context: "vessels.self", subscribe: [{ path: "navigation.position", policy: "instant", format: "delta" }] }, unsubscribes, () => {}, (delta) => {
			for (const update of delta?.updates || []) for (const value of update.values || []) if (value.path === "navigation.position") latestPosition = normalizePosition(value.value);
		});
	}

	function normalizePosition(value) {
		const latitude = Number(value?.latitude);
		const longitude = Number(value?.longitude);
		return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
	}

	function tideRequest(req) {
		const values = req.method === "POST" ? req.body || {} : req.query || {};
		const latitude = Number(values.latitude);
		const longitude = Number(values.longitude);
		return { portId: values.portId || undefined, position: Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : undefined };
	}

	function publish(pathName, value) {
		app.handleMessage?.(plugin.id, { context: "vessels.self", updates: [{ source: { label: plugin.id }, timestamp: new Date().toISOString(), values: [{ path: pathName, value }] }] });
	}

	function write(handler) {
		return async (req, res) => {
			const permission = req.skPrincipal?.permissions;
			if (!(permission === "admin" || permission === "readwrite" || (permission === undefined && req.skIsAuthenticated !== false))) {
				return res.status(403).json({ error: "Tidal Database updates require Signal K read/write or admin access." });
			}
			try { return await handler(req, res); }
			catch (error) { return res.status(400).json({ error:error.message }); }
		};
	}

	return plugin;
};
