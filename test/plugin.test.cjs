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
	const app = {
		getDataDirPath:() => directory, setPluginStatus(){}, handleMessage(){},
		ajrmMarineLocations:{ list:async () => [{ id:port.locationId, name:port.name, types:["tidalStandardPort"], geometry:{ type:"Point", coordinates:[-5.47,56.41] } }] },
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
	assert.equal(app.ajrmMarineTidalDatabase.listPorts().length, definitions.ports.length);
	const status = await call("GET","/status");
	assert.equal(status.body.contract, "ajrm-marine-tidal-database-status-v1");
	assert.equal(status.body.summary.stationCount, new Set(definitions.ports.filter((entry)=>entry.prediction.mode==="provider").map((entry)=>`${entry.prediction.providerId}:${entry.prediction.stationId}`)).size);
	assert.equal(status.body.policy.refreshFloorHours, 24);
	assert.equal(status.body.policy.discoveryCacheUtcYearBounded, true);
	assert.equal(status.body.policy.requestIntervalSeconds, 5);
	assert.equal(status.body.ports.length, definitions.ports.length);
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
	const packageJson = require("../package.json");
	assert.equal(packageJson.signalk.appIcon, "./icon-120.png");
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
