/** Exercises the Signal K lifecycle, service contract and HTTP status surface. */

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const createPlugin = require("../plugin/index.cjs");
const definitions = require("../defaults/tidal-definitions.json");

const GATE_MIGRATION_SYMBOL = Symbol.for("mcdonaldajr.ajrmMarineTidalGateMigration");
const PLANNING_SYMBOL = Symbol.for("mcdonaldajr.ajrmMarinePlanning");

function response() { return { statusCode:200, status(code){ this.statusCode=code; return this; }, json(body){ this.body=body; return this; } }; }

async function fixture(t, { legacyGateMigration = null, mutateLocations = null } = {}) {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ajrm-tidal-plugin-"));
	t.after(() => fs.rm(directory, { recursive:true, force:true }));
	const messages = [];
	if (legacyGateMigration) {
		await fs.writeFile(path.join(directory,"definitions.json"),`${JSON.stringify({
			...definitions,
			contract:"ajrm-marine-tidal-database-definitions-v1",
			contractVersion:1,
			updatedAt:"2026-08-22T11:00:00.000Z",
			gates:legacyGateMigration.gates,
			gateTombstones:legacyGateMigration.gateTombstones,
		},null,2)}\n`);
	}
	const port = definitions.ports.find((entry) => entry.prediction.mode === "provider");
	const locations = [
		...definitions.ports.map((entry) => ({ id:entry.locationId,name:entry.cachedLocationName,types:[`tidal${entry.kind === "standard" ? "Standard" : "Secondary"}Port`] })),
		...definitions.areas.map((entry) => ({ id:entry.locationId,name:entry.cachedLocationName,types:["tidalRegion"] })),
	];
	mutateLocations?.(locations);
	locations.find((entry) => entry.id === port.locationId).feature = { geometry:{ type:"Point",coordinates:[-5.47,56.41] } };
	const app = {
		getDataDirPath:() => directory, setPluginStatus(){}, handleMessage(_pluginId,message){ messages.push(message); },
		ajrmMarineLocations:{ list:async () => locations },
	};
	const routes = new Map(); const router = {};
	for (const method of ["get","post","put","delete"]) router[method] = (route,handler) => routes.set(`${method.toUpperCase()} ${route}`,handler);
	const plugin = createPlugin(app); plugin.registerWithRouter(router); plugin.start({ automaticMaintenance:false });
	async function call(method,route,req={}) { const res=response(); await routes.get(`${method} ${route}`)({ query:{},body:{},...req },res); return res; }
	return { app,plugin,call,locations,port,routes,messages };
}

async function waitForValue(read, timeoutMs = 1000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const value = read();
		if (value) return value;
		await new Promise((resolve) => setTimeout(resolve,5));
	}
	throw new Error("Timed out waiting for published test value.");
}

test("startup publishes enabled status when automatic maintenance is disabled", async (t) => {
	const { plugin,messages } = await fixture(t);
	const status = await waitForValue(() => messages
		.flatMap((message) => message.updates || [])
		.flatMap((update) => update.values || [])
		.find((value) => value.path === "plugins.ajrmMarineTidalDatabase")?.value);
	assert.equal(status.contract,"ajrm-marine-tidal-database-status-v2");
	assert.equal(status.contractVersion,2);
	assert.equal(status.enabled,true);
	await plugin.stop();
});

test("the standalone service owns only tidal-provider data and exposes all seeded ports", async (t) => {
	const { app,plugin,call,port,routes } = await fixture(t);
	assert.equal(app.ajrmMarineTidalDatabase.contract, "ajrm-marine-tidal-database-service-v2");
	assert.equal(app.ajrmMarineTidalDatabase.contractVersion,2);
	assert.equal((await app.ajrmMarineTidalDatabase.listPorts()).length, definitions.ports.length);
	assert.equal((await app.ajrmMarineTidalDatabase.listAreas()).length, definitions.areas.length);
	for (const key of ["gateContract","listGates","getGate","getGateCatalogue","gateDiagnostics","setGate","removeGate"]) assert.equal(Object.hasOwn(app.ajrmMarineTidalDatabase,key),false,key);
	assert.ok([...routes.keys()].every((route) => !route.includes("/gates")));
	assert.equal(globalThis[GATE_MIGRATION_SYMBOL],undefined);
	const status = await call("GET","/status");
	assert.equal(status.body.contract, "ajrm-marine-tidal-database-status-v2");
	assert.equal(status.body.contractVersion,2);
	assert.equal(status.body.locationJoins.state,"ready");
	assert.equal(status.body.summary.stationCount, new Set(definitions.ports.filter((entry)=>entry.prediction.mode==="provider").map((entry)=>`${entry.prediction.providerId}:${entry.prediction.stationId}`)).size);
	assert.equal(status.body.policy.refreshFloorHours, 24);
	assert.equal(status.body.policy.discoveryCacheUtcYearBounded, true);
	assert.equal(status.body.policy.requestIntervalSeconds, 5);
	assert.equal(status.body.ports.length, definitions.ports.length);
	assert.equal(Object.hasOwn(status.body,"gateCatalogue"),false);
	const activeDefinitions = await call("GET","/definitions");
	assert.equal(activeDefinitions.body.contract,"ajrm-marine-tidal-database-definitions-v3");
	assert.equal(activeDefinitions.body.contractVersion,3);
	assert.equal(activeDefinitions.body.nameOwnership,"ajrm-marine-locations");
	assert.ok(activeDefinitions.body.ports.every((entry) => entry.nameSource === "location" && entry.locationJoin === "valid"));
	assert.ok(activeDefinitions.body.ports.every((entry) => !Object.hasOwn(entry,"cachedLocationName")));
	assert.equal(Object.hasOwn(activeDefinitions.body,"gates"),false);
	assert.equal(Object.hasOwn(activeDefinitions.body,"gateTombstones"),false);
	const diagnostics = await app.ajrmMarineTidalDiagnostics.snapshot();
	assert.equal(app.ajrmMarineTidalDiagnostics.contract,"ajrm-marine-tidal-database-diagnostics-v2");
	assert.equal(app.ajrmMarineTidalDiagnostics.contractVersion,2);
	assert.equal(Object.hasOwn(diagnostics,"gateCatalogue"),false);
	assert.equal(Object.hasOwn(diagnostics.definitions,"gates"),false);
	const projection = await call("GET","/tides/status",{ query:{ portId:port.locationId } });
	assert.equal(projection.body.contract, "ajrm-marine-tide-resolver-v1");
	assert.equal(projection.body.selectedPort.id, port.locationId);
	assert.match(projection.body.error, /subscription key/);
	await plugin.stop();
	assert.equal(app.ajrmMarineTidalDatabase, undefined);
	assert.equal(app.ajrmMarineTidalDiagnostics, undefined);
});

test("HTTP routes use Signal K readonly and readwrite scopes while retaining the mutation guard", async (t) => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ajrm-tidal-router-access-"));
	t.after(() => fs.rm(directory, { recursive:true, force:true }));
	const app = { getDataDirPath:() => directory, setPluginStatus(){}, handleMessage(){} };
	const plugin = createPlugin(app);
	const accessLevels = [];
	const registrations = [];
	const routes = new Map();
	const router = { access(level) {
		accessLevels.push(level);
		const scoped = {};
		for (const method of ["get","post","put","delete"]) scoped[method] = (route,handler) => {
			registrations.push({ method:method.toUpperCase(),route,level });
			routes.set(`${method.toUpperCase()} ${route}`,handler);
		};
		return scoped;
	} };
	plugin.registerWithRouter(router);
	assert.deepEqual(accessLevels,["readonly","readwrite"]);
	assert.deepEqual(registrations,[
		{ method:"GET",route:"/status",level:"readonly" },
		{ method:"GET",route:"/stations",level:"readonly" },
		{ method:"GET",route:"/definitions",level:"readonly" },
		{ method:"PUT",route:"/definitions/ports/:locationId",level:"readwrite" },
		{ method:"DELETE",route:"/definitions/ports/:locationId",level:"readwrite" },
		{ method:"PUT",route:"/definitions/areas/:locationId",level:"readwrite" },
		{ method:"DELETE",route:"/definitions/areas/:locationId",level:"readwrite" },
		{ method:"POST",route:"/stations/update",level:"readwrite" },
		{ method:"GET",route:"/tides/status",level:"readonly" },
		{ method:"POST",route:"/tides/pin",level:"readwrite" },
		{ method:"POST",route:"/tides/refresh",level:"readwrite" },
	]);
	const operations = Object.values(plugin.getOpenApi().paths).flatMap((definition) =>
		Object.entries(definition).filter(([method]) => ["post","put","delete","patch"].includes(method)).map(([,operation]) => operation));
	assert.equal(operations.length,7);
	for (const operation of operations) {
		assert.deepEqual(operation.security,[{ SignalKAuth:[] }]);
		assert.equal(operation["x-signalk-access"],"readwrite");
		assert.ok(operation.responses["403"]);
	}
	async function callPin(request) {
		const res = response();
		await routes.get("POST /tides/pin")({ method:"POST",body:{ portId:null },...request },res);
		return res;
	}
	assert.equal((await callPin({ skIsAuthenticated:false })).statusCode,403);
	assert.equal((await callPin({ skIsAuthenticated:true,skPrincipal:{ permissions:"readonly" } })).statusCode,403);
	assert.equal((await callPin({ skIsAuthenticated:true,skPrincipal:{ permissions:"readwrite" } })).statusCode,200);
	assert.equal((await callPin({})).statusCode,200,"security-disabled Signal K keeps legacy local access");
});

test("router registration falls back to the base router on older Signal K", async (t) => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ajrm-tidal-router-fallback-"));
	t.after(() => fs.rm(directory, { recursive:true, force:true }));
	const plugin = createPlugin({ getDataDirPath:() => directory });
	const registrations = [];
	const router = {};
	for (const method of ["get","post","put","delete"]) router[method] = (route) => registrations.push(`${method.toUpperCase()} ${route}`);
	plugin.registerWithRouter(router);
	assert.deepEqual(registrations,[
		"GET /status",
		"GET /stations",
		"GET /definitions",
		"PUT /definitions/ports/:locationId",
		"DELETE /definitions/ports/:locationId",
		"PUT /definitions/areas/:locationId",
		"DELETE /definitions/areas/:locationId",
		"POST /stations/update",
		"GET /tides/status",
		"POST /tides/pin",
		"POST /tides/refresh",
	]);
});

test("the seed includes corrected Bucklers Hard data and explicit direct-station preferences", () => {
	const portsmouth=definitions.ports.find((entry)=>entry.cachedLocationName==="Portsmouth tidal prediction port");
	const bucklers=definitions.ports.find((entry)=>entry.cachedLocationName==="Bucklers Hard");
	assert.equal(portsmouth.prediction.stationId,"0065");
	assert.equal(bucklers.prediction.parentLocationId,portsmouth.locationId);
	assert.deepEqual(bucklers.prediction.corrections.heightDifferencesM,{ mhws:-1,mhwn:-0.8,mlwn:-0.2,mlws:-0.3 });
	assert.equal(bucklers.prediction.corrections.highWaterTimeOffsets.length,4);
	assert.equal(definitions.ports.filter((entry)=>entry.automaticPreferredPortLocationId).length,10);
	for (const name of ["Port Ellen","Craighouse moorings","Gigha Sound"]) assert.equal(definitions.ports.find((entry)=>entry.cachedLocationName===name).advisory.status,"caution");
});

test("OpenAPI and webapp metadata are present", async (t) => {
	const { plugin,routes } = await fixture(t);
	const openApi = plugin.getOpenApi();
	assert.equal(openApi.info.title, "AJRM Marine Tidal Database");
	assert.ok(Object.keys(openApi.paths).every((route) => !route.includes("gate")));
	assert.ok(Object.keys(openApi.components.schemas).every((name) => !name.toLowerCase().includes("gate")));
	const documented = Object.entries(openApi.paths).flatMap(([route,definition]) => Object.keys(definition)
		.filter((method) => ["get","post","put","delete"].includes(method))
		.map((method) => `${method.toUpperCase()} ${route.replace(/\{([^}]+)\}/g,":$1")}`)).sort();
	assert.deepEqual(documented,[...routes.keys()].sort());
	assert.ok(openApi.paths["/stations"]?.get);
	assert.ok(openApi.components.securitySchemes.SignalKAuth);
	for (const schema of ["DefinitionsResponse","PortDefinitionWrite","AreaDefinitionWrite","TidalDatabaseStatus","TideResolverProjection","Error"]) assert.ok(openApi.components.schemas[schema],schema);
	const packageJson = require("../package.json");
	assert.equal(packageJson.signalk.appIcon, "./icon-120.png");
	await plugin.stop();
});

test("legacy gate data is exposed only through the bounded Planning migration registry", async (t) => {
	const gates = [{ contract:"ajrm-tidal-gate-constants-v1",locationId:"legacy-gate",name:"Legacy gate" }];
	const gateTombstones = [{ locationId:"deleted-gate",revision:3,deletedAt:"2026-08-22T10:00:00.000Z" }];
	let offered = null;
	globalThis[PLANNING_SYMBOL] = { importLegacyTidalGates(registry) { offered = registry; } };
	t.after(() => { delete globalThis[PLANNING_SYMBOL]; delete globalThis[GATE_MIGRATION_SYMBOL]; });
	const { app,plugin,call } = await fixture(t,{ legacyGateMigration:{ gates,gateTombstones } });
	const registry = globalThis[GATE_MIGRATION_SYMBOL];
	assert.equal(offered,registry);
	assert.equal(registry.contract,"ajrm-marine-tidal-to-planning-gate-migration-v1");
	assert.equal(registry.contractVersion,1);
	assert.deepEqual(registry.read().gates,gates);
	assert.deepEqual((await registry.snapshot()).gateTombstones,gateTombstones);
	const activeDefinitions = await call("GET","/definitions");
	assert.equal(Object.hasOwn(activeDefinitions.body,"gates"),false);
	assert.equal(Object.hasOwn((await app.ajrmMarineTidalDiagnostics.snapshot()).definitions,"gates"),false);
	assert.equal(Object.hasOwn((await call("GET","/status")).body,"gateCatalogue"),false);
	const completed = await registry.ack();
	assert.deepEqual(completed,{ ok:true,completed:true,gateCount:1,tombstoneCount:1 });
	assert.equal(globalThis[GATE_MIGRATION_SYMBOL],undefined);
	const durable = JSON.parse(await fs.readFile(path.join(app.getDataDirPath(),"definitions.json"),"utf8"));
	assert.equal(durable.contract,"ajrm-marine-tidal-database-definitions-v3");
	assert.equal(durable.contractVersion,3);
	assert.equal(Object.hasOwn(durable,"gates"),false);
	assert.equal(Object.hasOwn(durable,"gateTombstones"),false);
	await plugin.stop();
});

test("tidal settings are editable while Location-owned names and classifications remain read-only", async (t) => {
	const { plugin,call,locations,port } = await fixture(t);
	const initial = await call("GET","/definitions");
	const candidate = initial.body.ports.find((entry) => entry.prediction.mode === "unavailable");
	assert.ok(candidate);
	const rejectedName = await call("PUT","/definitions/ports/:locationId",{
		params:{ locationId:candidate.locationId }, body:{ ...candidate,name:`${candidate.name} edited` },
	});
	assert.equal(rejectedName.statusCode,400);
	assert.match(rejectedName.body.error,/does not match the Location-owned name/);
	const rejectedKind = await call("PUT","/definitions/ports/:locationId",{
		params:{ locationId:candidate.locationId }, body:{ ...candidate,name:undefined,kind:candidate.kind === "standard" ? "secondary" : "standard" },
	});
	assert.equal(rejectedKind.statusCode,400);
	assert.match(rejectedKind.body.error,/Port class is owned by Location Editor/);
	const { name:_name, nameSource:_nameSource, locationJoin:_locationJoin, kind:_kind, ...writeCandidate } = candidate;
	const saved = await call("PUT","/definitions/ports/:locationId",{ params:{ locationId:candidate.locationId },body:writeCandidate });
	assert.equal(saved.body.ok,true);
	assert.equal(saved.body.port.name,candidate.name);
	assert.equal(saved.body.port.nameSource,"location");
	const removed = await call("DELETE","/definitions/ports/:locationId",{ params:{ locationId:candidate.locationId } });
	assert.equal(removed.body.ok,true);
	assert.equal(removed.body.status.ports.some((entry)=>entry.locationId===candidate.locationId),false);
	const region = initial.body.areas.find((entry) => !entry.parentAreaLocationId);
	const changedArea = await call("PUT","/definitions/areas/:locationId",{
		params:{ locationId:region.locationId }, body:{ portLocationId:port.locationId,parentAreaLocationId:region.parentAreaLocationId },
	});
	assert.equal(changedArea.body.ok,true);
	assert.equal(changedArea.body.area.portLocationId,port.locationId);
	const newAreaId = "f2770daf-61ba-4e78-8734-c79687155cb4";
	locations.push({ id:newAreaId,name:"Test child tidal region",types:["tidalRegion"] });
	const child = await call("PUT","/definitions/areas/:locationId",{
		params:{ locationId:newAreaId }, body:{ portLocationId:port.locationId,parentAreaLocationId:region.locationId },
	});
	assert.equal(child.body.area.parentAreaLocationId,region.locationId);
	const parentRemoval = await call("DELETE","/definitions/areas/:locationId",{ params:{ locationId:region.locationId } });
	assert.equal(parentRemoval.statusCode,400);
	assert.match(parentRemoval.body.error,/parent/);
	const childRemoval = await call("DELETE","/definitions/areas/:locationId",{ params:{ locationId:newAreaId } });
	assert.equal(childRemoval.body.ok,true);
	await plugin.stop();
});

test("Location names override divergent cached labels and stale writes are rejected", async (t) => {
	let renamedId;
	const { app,plugin,call } = await fixture(t,{ mutateLocations(locations) {
		const location = locations.find((entry) => entry.types.includes("tidalStandardPort"));
		renamedId = location.id;
		location.name = "Authoritative renamed port";
	} });
	const definitionsResponse = await call("GET","/definitions");
	const joined = definitionsResponse.body.ports.find((entry) => entry.locationId === renamedId);
	assert.equal(joined.name,"Authoritative renamed port");
	assert.equal(joined.nameSource,"location");
	const servicePort = (await app.ajrmMarineTidalDatabase.listPorts()).find((entry) => entry.locationId === renamedId);
	assert.equal(servicePort.name,"Authoritative renamed port");
	const rejected = await call("PUT","/definitions/ports/:locationId",{
		params:{ locationId:renamedId },body:{ ...joined,name:"Stale cached name" },
	});
	assert.equal(rejected.statusCode,400);
	assert.match(rejected.body.error,/does not match the Location-owned name/);
	await plugin.stop();
});

test("missing or misclassified Location joins are degraded and cannot resolve tides", async (t) => {
	let brokenId;
	const { plugin,call } = await fixture(t,{ mutateLocations(locations) {
		const location = locations.find((entry) => entry.types.includes("tidalStandardPort"));
		brokenId = location.id;
		location.types = ["pointOfInterest"];
	} });
	const status = await call("GET","/status");
	assert.equal(status.body.locationJoins.state,"degraded");
	assert.ok(status.body.locationJoins.typeMismatchCount > 0);
	assert.equal(status.body.ports.find((entry) => entry.locationId === brokenId).locationJoin,"type-mismatch");
	const projection = await call("GET","/tides/status",{ query:{ portId:brokenId } });
	assert.equal(projection.body.valid,false);
	assert.match(projection.body.error,/type-mismatch Location join/);
	const missing = await call("GET","/tides/status",{ query:{ portId:"6b279bcb-d58f-4a76-87f5-c23fc3813867" } });
	assert.equal(missing.body.valid,false);
	assert.match(missing.body.error,/definition does not exist/);
	await plugin.stop();
});

test("dual tidal-port classifications fail closed in service projections and tide resolution", async (t) => {
	let brokenId;
	const { app,plugin,call } = await fixture(t,{ mutateLocations(locations) {
		const location = locations.find((entry) => entry.types.includes("tidalStandardPort"));
		brokenId = location.id;
		location.types = ["tidalStandardPort", "tidalSecondaryPort"];
	} });
	const servicePort = (await app.ajrmMarineTidalDatabase.listPorts())
		.find((entry) => entry.locationId === brokenId);
	assert.equal(servicePort.nameSource,"location");
	assert.equal(servicePort.locationJoin,"type-mismatch");
	const definitionsResponse = await call("GET","/definitions");
	const projectedPort = definitionsResponse.body.ports.find((entry) => entry.locationId === brokenId);
	assert.equal(projectedPort.nameSource,"location");
	assert.equal(projectedPort.locationJoin,"type-mismatch");
	const status = await call("GET","/status");
	assert.equal(status.body.locationJoins.state,"degraded");
	assert.ok(status.body.locationJoins.typeMismatchCount > 0);
	const statusPort = status.body.ports.find((entry) => entry.locationId === brokenId);
	assert.equal(statusPort.nameSource,"location");
	assert.equal(statusPort.locationJoin,"type-mismatch");
	const serviceProjection = await app.ajrmMarineTidalDatabase.status({ portId:brokenId });
	assert.equal(serviceProjection.valid,false);
	assert.equal(serviceProjection.selectedPort,null);
	assert.match(serviceProjection.error,/type-mismatch Location join/);
	const projection = await call("GET","/tides/status",{ query:{ portId:brokenId } });
	assert.equal(projection.body.valid,false);
	assert.equal(projection.body.selectedPort,null);
	assert.match(projection.body.error,/type-mismatch Location join/);
	await plugin.stop();
});

test("regional recommendations ignore type-mismatched joined definitions", async (t) => {
	const candidateArea = definitions.areas.find((area) => {
		const port = definitions.ports.find((entry) => entry.locationId === area.portLocationId);
		return port?.kind === "secondary" && port.prediction.mode !== "unavailable";
	});
	assert.ok(candidateArea);
	const { app,plugin } = await fixture(t,{ mutateLocations(locations) {
		const location = locations.find((entry) => entry.id === candidateArea.locationId);
		location.types = ["pointOfInterest"];
		location.feature = { geometry:{ type:"Polygon",coordinates:[[[-5.6,56.3],[-5.4,56.3],[-5.4,56.5],[-5.6,56.5],[-5.6,56.3]]] } };
	} });
	const result = await app.ajrmMarineTidalDatabase.recommendSecondary({ position:{ latitude:56.4,longitude:-5.5 } });
	assert.equal(result.port,null);
	assert.equal(result.reason,"outside-tidal-areas");
	await plugin.stop();
});

test("an invalid reference-port join removes otherwise valid secondaries from status, recommendation and resolution", async (t) => {
	const secondary = definitions.ports.find((entry) =>
		entry.prediction.mode === "corrections" &&
		!entry.automaticPreferredPortLocationId &&
		definitions.areas.some((area) => area.portLocationId === entry.locationId));
	const parent = definitions.ports.find((entry) => entry.locationId === secondary?.prediction.parentLocationId);
	const area = definitions.areas.find((entry) => entry.portLocationId === secondary?.locationId);
	assert.ok(secondary);
	assert.ok(parent);
	assert.ok(area);
	const position = { latitude:56.4,longitude:-5.5 };
	const { app,plugin,call } = await fixture(t,{ mutateLocations(locations) {
		locations.find((entry) => entry.id === parent.locationId).types = ["pointOfInterest"];
		locations.find((entry) => entry.id === secondary.locationId).feature = { geometry:{ type:"Point",coordinates:[position.longitude,position.latitude] } };
		locations.find((entry) => entry.id === area.locationId).feature = { geometry:{ type:"Polygon",coordinates:[[[-5.6,56.3],[-5.4,56.3],[-5.4,56.5],[-5.6,56.5],[-5.6,56.3]]] } };
	} });

	const joinedSecondary = (await app.ajrmMarineTidalDatabase.listPorts())
		.find((entry) => entry.locationId === secondary.locationId);
	assert.equal(joinedSecondary.locationJoin,"valid","the secondary's own exact Location join remains valid");
	const status = await call("GET","/status");
	const statusSecondary = status.body.ports.find((entry) => entry.locationId === secondary.locationId);
	assert.equal(status.body.locationJoins.state,"degraded");
	assert.equal(status.body.ports.find((entry) => entry.locationId === parent.locationId).locationJoin,"type-mismatch");
	assert.equal(statusSecondary.locationJoin,"valid");
	assert.equal(statusSecondary.providerId,null);
	assert.equal(statusSecondary.stationId,null);
	assert.equal(statusSecondary.parent,null);
	assert.equal(statusSecondary.status,"unavailable");

	const recommendation = await app.ajrmMarineTidalDatabase.recommendSecondary({ position });
	assert.equal(recommendation.port,null);
	assert.equal(recommendation.reason,"outside-tidal-areas");
	const projection = await call("GET","/tides/status",{ query:{ portId:secondary.locationId } });
	assert.equal(projection.body.valid,false);
	assert.equal(projection.body.selectedPort,null);
	assert.match(projection.body.error,/invalid or unavailable reference-port chain/);
	await plugin.stop();
});
