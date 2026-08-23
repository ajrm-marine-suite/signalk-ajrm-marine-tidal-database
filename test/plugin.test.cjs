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

async function fixture(t, { legacyGateMigration = null } = {}) {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ajrm-tidal-plugin-"));
	t.after(() => fs.rm(directory, { recursive:true, force:true }));
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
	const locations = definitions.ports.map((entry) => ({ id:entry.locationId,name:entry.name,types:[`tidal${entry.kind === "standard" ? "Standard" : "Secondary"}Port`] }));
	locations.find((entry) => entry.id === port.locationId).feature = { geometry:{ type:"Point",coordinates:[-5.47,56.41] } };
	const app = {
		getDataDirPath:() => directory, setPluginStatus(){}, handleMessage(){},
		ajrmMarineLocations:{ list:async () => locations },
	};
	const routes = new Map(); const router = {};
	for (const method of ["get","post","put","delete"]) router[method] = (route,handler) => routes.set(`${method.toUpperCase()} ${route}`,handler);
	const plugin = createPlugin(app); plugin.registerWithRouter(router); plugin.start({ automaticMaintenance:false });
	async function call(method,route,req={}) { const res=response(); await routes.get(`${method} ${route}`)({ query:{},body:{},...req },res); return res; }
	return { app,plugin,call,port,routes };
}

test("the standalone service owns only tidal-provider data and exposes all seeded ports", async (t) => {
	const { app,plugin,call,port,routes } = await fixture(t);
	assert.equal(app.ajrmMarineTidalDatabase.contract, "ajrm-marine-tidal-database-service-v1");
	assert.equal(app.ajrmMarineTidalDatabase.listPorts().length, definitions.ports.length);
	assert.equal(app.ajrmMarineTidalDatabase.listAreas().length, definitions.areas.length);
	for (const key of ["gateContract","listGates","getGate","getGateCatalogue","gateDiagnostics","setGate","removeGate"]) assert.equal(Object.hasOwn(app.ajrmMarineTidalDatabase,key),false,key);
	assert.ok([...routes.keys()].every((route) => !route.includes("/gates")));
	assert.equal(globalThis[GATE_MIGRATION_SYMBOL],undefined);
	const status = await call("GET","/status");
	assert.equal(status.body.contract, "ajrm-marine-tidal-database-status-v1");
	assert.equal(status.body.summary.stationCount, new Set(definitions.ports.filter((entry)=>entry.prediction.mode==="provider").map((entry)=>`${entry.prediction.providerId}:${entry.prediction.stationId}`)).size);
	assert.equal(status.body.policy.refreshFloorHours, 24);
	assert.equal(status.body.policy.discoveryCacheUtcYearBounded, true);
	assert.equal(status.body.policy.requestIntervalSeconds, 5);
	assert.equal(status.body.ports.length, definitions.ports.length);
	assert.equal(Object.hasOwn(status.body,"gateCatalogue"),false);
	const activeDefinitions = await call("GET","/definitions");
	assert.equal(activeDefinitions.body.contract,"ajrm-marine-tidal-database-definitions-v2");
	assert.equal(activeDefinitions.body.contractVersion,2);
	assert.equal(Object.hasOwn(activeDefinitions.body,"gates"),false);
	assert.equal(Object.hasOwn(activeDefinitions.body,"gateTombstones"),false);
	const diagnostics = await app.ajrmMarineTidalDiagnostics.snapshot();
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

test("the seed includes corrected Bucklers Hard data and explicit direct-station preferences", () => {
	const portsmouth=definitions.ports.find((entry)=>entry.name==="Portsmouth tidal prediction port");
	const bucklers=definitions.ports.find((entry)=>entry.name==="Bucklers Hard");
	assert.equal(portsmouth.prediction.stationId,"0065");
	assert.equal(bucklers.prediction.parentLocationId,portsmouth.locationId);
	assert.deepEqual(bucklers.prediction.corrections.heightDifferencesM,{ mhws:-1,mhwn:-0.8,mlwn:-0.2,mlws:-0.3 });
	assert.equal(bucklers.prediction.corrections.highWaterTimeOffsets.length,4);
	assert.equal(definitions.ports.filter((entry)=>entry.automaticPreferredPortLocationId).length,10);
	for (const name of ["Port Ellen","Craighouse moorings","Gigha Sound"]) assert.equal(definitions.ports.find((entry)=>entry.name===name).advisory.status,"caution");
});

test("OpenAPI and webapp metadata are present", async (t) => {
	const { plugin } = await fixture(t);
	const openApi = plugin.getOpenApi();
	assert.equal(openApi.info.title, "AJRM Marine Tidal Database");
	assert.ok(Object.keys(openApi.paths).every((route) => !route.includes("gate")));
	assert.ok(Object.keys(openApi.components.schemas).every((name) => !name.toLowerCase().includes("gate")));
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
	assert.equal(durable.contract,"ajrm-marine-tidal-database-definitions-v2");
	assert.equal(Object.hasOwn(durable,"gates"),false);
	assert.equal(Object.hasOwn(durable,"gateTombstones"),false);
	await plugin.stop();
});

test("tidal definitions are editable without altering spatial Locations", async (t) => {
	const { plugin,call,port } = await fixture(t);
	const initial = await call("GET","/definitions");
	const candidate = initial.body.ports.find((entry) => entry.prediction.mode === "unavailable");
	assert.ok(candidate);
	const saved = await call("PUT","/definitions/ports/:locationId",{
		params:{ locationId:candidate.locationId }, body:{ ...candidate,name:`${candidate.name} edited` },
	});
	assert.equal(saved.body.ok,true);
	assert.equal(saved.body.port.name,`${candidate.name} edited`);
	const removed = await call("DELETE","/definitions/ports/:locationId",{ params:{ locationId:candidate.locationId } });
	assert.equal(removed.body.ok,true);
	assert.equal(removed.body.status.ports.some((entry)=>entry.locationId===candidate.locationId),false);
	const region = initial.body.areas.find((entry) => !entry.parentAreaLocationId);
	const changedArea = await call("PUT","/definitions/areas/:locationId",{
		params:{ locationId:region.locationId }, body:{ ...region,portLocationId:port.locationId },
	});
	assert.equal(changedArea.body.ok,true);
	assert.equal(changedArea.body.area.portLocationId,port.locationId);
	const newAreaId = "f2770daf-61ba-4e78-8734-c79687155cb4";
	const child = await call("PUT","/definitions/areas/:locationId",{
		params:{ locationId:newAreaId }, body:{ name:"Test child tidal region",portLocationId:port.locationId,parentAreaLocationId:region.locationId },
	});
	assert.equal(child.body.area.parentAreaLocationId,region.locationId);
	const parentRemoval = await call("DELETE","/definitions/areas/:locationId",{ params:{ locationId:region.locationId } });
	assert.equal(parentRemoval.statusCode,400);
	assert.match(parentRemoval.body.error,/parent/);
	const childRemoval = await call("DELETE","/definitions/areas/:locationId",{ params:{ locationId:newAreaId } });
	assert.equal(childRemoval.body.ok,true);
	await plugin.stop();
});
