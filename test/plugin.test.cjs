/** Exercises the Signal K lifecycle, service contract and HTTP status surface. */

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const createPlugin = require("../plugin/index.cjs");
const definitions = require("../defaults/tidal-definitions.json");

function response() { return { statusCode:200, status(code){ this.statusCode=code; return this; }, json(body){ this.body=body; return this; } }; }

async function fixture(t) {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ajrm-tidal-plugin-"));
	t.after(() => fs.rm(directory, { recursive:true, force:true }));
	const port = definitions.ports.find((entry) => entry.prediction.mode === "provider");
	const locations = [
		...definitions.ports.map((entry) => ({ id:entry.locationId,name:entry.name,types:[`tidal${entry.kind === "standard" ? "Standard" : "Secondary"}Port`] })),
		...definitions.gates.map((entry) => ({ id:entry.locationId,name:entry.name,types:["tidalGate"] })),
	];
	locations.find((entry) => entry.id === port.locationId).feature = { geometry:{ type:"Point",coordinates:[-5.47,56.41] } };
	const app = {
		getDataDirPath:() => directory, setPluginStatus(){}, handleMessage(){},
		ajrmMarineLocations:{ list:async () => locations },
	};
	const routes = new Map(); const router = {};
	for (const method of ["get","post","put","delete"]) router[method] = (route,handler) => routes.set(`${method.toUpperCase()} ${route}`,handler);
	const plugin = createPlugin(app); plugin.registerWithRouter(router); plugin.start({ automaticMaintenance:false });
	async function call(method,route,req={}) { const res=response(); await routes.get(`${method} ${route}`)({ query:{},body:{},...req },res); return res; }
	return { app,plugin,call,port };
}

test("the standalone service owns tidal data and exposes all seeded ports", async (t) => {
	const { app,plugin,call,port } = await fixture(t);
	assert.equal(app.ajrmMarineTidalDatabase.contract, "ajrm-marine-tidal-database-service-v1");
	assert.equal(app.ajrmMarineTidalDatabase.gateContract,"ajrm-tidal-gate-constants-v2");
	assert.equal(app.ajrmMarineTidalDatabase.listPorts().length, definitions.ports.length);
	assert.ok(app.ajrmMarineTidalDatabase.listGates().every((entry) => entry.contract === "ajrm-tidal-gate-constants-v2"));
	const gateCatalogue = await app.ajrmMarineTidalDatabase.getGateCatalogue();
	assert.equal(gateCatalogue.contract,"ajrm-tidal-gate-catalogue-v2");
	assert.equal(gateCatalogue.gates.length,definitions.gates.length);
	assert.deepEqual(gateCatalogue.operationalLocationIds,[]);
	assert.equal(gateCatalogue.diagnostics.summary.legacyMigrationCount,definitions.gates.length);
	const status = await call("GET","/status");
	assert.equal(status.body.contract, "ajrm-marine-tidal-database-status-v1");
	assert.equal(status.body.summary.stationCount, new Set(definitions.ports.filter((entry)=>entry.prediction.mode==="provider").map((entry)=>`${entry.prediction.providerId}:${entry.prediction.stationId}`)).size);
	assert.equal(status.body.policy.refreshFloorHours, 24);
	assert.equal(status.body.policy.discoveryCacheUtcYearBounded, true);
	assert.equal(status.body.policy.requestIntervalSeconds, 5);
	assert.equal(status.body.ports.length, definitions.ports.length);
	assert.equal(status.body.gateCatalogue.summary.operationalCount,0);
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
	assert.equal(plugin.getOpenApi().info.title, "AJRM Marine Tidal Database");
	assert.ok(plugin.getOpenApi().components.schemas.TidalGateV2);
	const packageJson = require("../package.json");
	assert.equal(packageJson.signalk.appIcon, "./icon-120.png");
	await plugin.stop();
});

test("gate HTTP mutation is revisioned, joined and owned by Tidal Database", async (t) => {
	const { app,plugin,call } = await fixture(t);
	const catalogue = await call("GET","/definitions/gates");
	const existing = catalogue.body.gates[0];
	const replacement = { ...existing, revision:existing.revision + 1 };
	let saved = await call("PUT","/definitions/gates/:locationId",{
		params:{ locationId:existing.locationId },body:replacement,
	});
	assert.equal(saved.statusCode,200);
	assert.equal(saved.body.gate.revision,2);
	assert.equal(app.ajrmMarineTidalDatabase.getGate(existing.locationId).revision,2);
	saved = await call("PUT","/definitions/gates/:locationId",{
		params:{ locationId:existing.locationId },body:replacement,
	});
	assert.equal(saved.statusCode,400);
	assert.match(saved.body.error,/revision conflict/);
	const mismatch = await call("PUT","/definitions/gates/:locationId",{
		params:{ locationId:existing.locationId },body:{ ...replacement,locationId:"different",revision:3 },
	});
	assert.equal(mismatch.statusCode,400);
	assert.match(mismatch.body.error,/must match/);
	const forbidden = await call("DELETE","/definitions/gates/:locationId",{
		params:{ locationId:existing.locationId },query:{ expectedRevision:"2" },skPrincipal:{ permissions:"readonly" },
	});
	assert.equal(forbidden.statusCode,403);
	const removed = await call("DELETE","/definitions/gates/:locationId",{
		params:{ locationId:existing.locationId },query:{ expectedRevision:"2" },
	});
	assert.equal(removed.statusCode,200);
	assert.equal(app.ajrmMarineTidalDatabase.getGate(existing.locationId),null);
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
