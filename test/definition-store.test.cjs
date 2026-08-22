/** Verifies safe package migrations of durable tidal definitions. */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { CONTRACT, createDefinitionStore, mergeBundledDefinitions } = require("../plugin/definition-store.cjs");

function port(locationId = "parent") {
	return {
		locationId,
		name:"Parent",
		kind:"standard",
		referenceLevels:{ mhws:4, mhwn:3, mlwn:2, mlws:1 },
		prediction:{ mode:"provider", providerId:"test", stationId:locationId },
	};
}

function legacyGate(overrides = {}) {
	return {
		locationId:"gate",
		name:"User gate name snapshot",
		contract:"ajrm-tidal-gate-constants-v1",
		standardPortRef:"/resources/locations/parent",
		floodSet:"W",
		ebbSet:"E",
		springPeakFlowKnots:7,
		neapPeakFlowKnots:null,
		floodSpringAfter:"1:23:00",
		floodNeapAfter:"",
		floodSpringSlack:"0:00:00",
		floodNeapSlack:"",
		ebbSpringAfter:"-1:00:00",
		ebbNeapAfter:"-0:30:00",
		ebbSpringSlack:"0:15:00",
		ebbNeapSlack:"0:20:00",
		source:"User-edited legacy citation",
		...overrides,
	};
}

function catalogue({ ports = [port()], gates = [] } = {}) {
	return { contract:CONTRACT, ports, areas:[], gates };
}

test("bundled definitions add missing ids without replacing any durable user fields", () => {
	const correction={ timeOffsetPeriodMinutes:720,highWaterTimeOffsets:[{ referenceTimeMinutes:0,offsetMinutes:7 }],lowWaterTimeOffsets:[{ referenceTimeMinutes:0,offsetMinutes:8 }],heightDifferencesM:{ mhws:1,mhwn:1,mlwn:1,mlws:1 } };
	const stored=catalogue({ ports:[
		{ ...port("parent"), automaticPreferredPortLocationId:null, advisory:{ status:"caution",message:"User wording" } },
		{ locationId:"entered",name:"Entered",kind:"secondary",prediction:{ mode:"corrections",parentLocationId:"parent",corrections:correction } },
	] });
	const bundled=catalogue({ ports:[
		{ ...stored.ports[0],automaticPreferredPortLocationId:"direct",advisory:{ status:"caution",message:"Package wording" } },
		{ ...stored.ports[1],prediction:{ ...stored.ports[1].prediction,corrections:{ ...correction,highWaterTimeOffsets:[{ referenceTimeMinutes:0,offsetMinutes:99 }] } } },
		{ ...port("direct"),name:"Direct" },
	] });
	const merged=mergeBundledDefinitions(stored,bundled);
	const entered=merged.ports.find((entry)=>entry.locationId==="entered");
	const parent=merged.ports.find((entry)=>entry.locationId==="parent");
	assert.equal(entered.prediction.corrections.highWaterTimeOffsets[0].offsetMinutes,7);
	assert.equal(parent.automaticPreferredPortLocationId,null);
	assert.equal(parent.advisory.message,"User wording");
	assert.ok(merged.ports.some((entry)=>entry.locationId==="direct"));
});

test("durable v1 gates migrate losslessly once and bundled changes do not overwrite them", async (t) => {
	const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "ajrm-gate-store-"));
	t.after(() => fsp.rm(directory, { recursive:true, force:true }));
	const filename = path.join(directory, "definitions.json");
	const original = legacyGate();
	fs.writeFileSync(filename, `${JSON.stringify(catalogue({ gates:[original] }), null, 2)}\n`);
	const changedSeed = catalogue({ gates:[legacyGate({ floodSpringAfter:"2:00:00", source:"Changed package source" })] });
	const store = createDefinitionStore(filename, changedSeed);
	const migrated = store.read().gates[0];
	assert.equal(migrated.contract,"ajrm-tidal-gate-constants-v2");
	assert.equal(migrated.revision,1);
	assert.equal(migrated.turns[0].offsets.spring.value,83);
	assert.equal(migrated.turns[0].offsets.neap.state,"unknown");
	assert.equal(migrated.turns[0].slack.spring.semantics,"legacy-ambiguous");
	assert.equal(migrated.turns[0].slack.spring.reported.value,0);
	assert.equal(migrated.rateObservations[0].turnId,null);
	assert.equal(migrated.rateObservations[0].lowerBound.state,"unknown");
	assert.equal(migrated.readiness.state,"needs-review");
	assert.deepEqual(migrated.legacy.record,original);
	const persisted = JSON.parse(await fsp.readFile(filename,"utf8"));
	assert.equal(persisted.gates[0].contract,"ajrm-tidal-gate-constants-v2");
	const restarted = createDefinitionStore(filename, changedSeed).read().gates[0];
	assert.deepEqual(restarted,migrated);
});

test("concurrent gate mutations serialize without temp-file races or lost revisions", async (t) => {
	const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "ajrm-gate-concurrency-"));
	t.after(() => fsp.rm(directory, { recursive:true, force:true }));
	const filename = path.join(directory, "definitions.json");
	const bundled = catalogue({ gates:[legacyGate({ locationId:"gate-a" }),legacyGate({ locationId:"gate-b" })] });
	const store = createDefinitionStore(filename,bundled);
	const gateA = store.read().gates.find((entry) => entry.locationId === "gate-a");
	const gateB = store.read().gates.find((entry) => entry.locationId === "gate-b");
	await Promise.all([
		store.setGate({ ...gateA,revision:2 }),
		store.setGate({ ...gateB,revision:2 }),
	]);
	assert.deepEqual(store.read().gates.map((entry) => [entry.locationId,entry.revision]),[["gate-a",2],["gate-b",2]]);
	const restarted = createDefinitionStore(filename,bundled);
	assert.deepEqual(restarted.read().gates.map((entry) => [entry.locationId,entry.revision]),[["gate-a",2],["gate-b",2]]);
});

test("a failed durable write does not publish an unsaved gate revision", async (t) => {
	const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "ajrm-gate-write-failure-"));
	t.after(() => fsp.rm(directory, { recursive:true, force:true }));
	const filename = path.join(directory, "definitions.json");
	const bundled = catalogue({ gates:[legacyGate()] });
	const store = createDefinitionStore(filename,bundled);
	const replacement = { ...store.read().gates[0],revision:2 };
	await fsp.mkdir(filename);
	await assert.rejects(store.setGate(replacement));
	assert.equal(store.read().gates[0].revision,1);
});

test("gate deletion survives bundled seed merging and restoration advances the deleted revision", async (t) => {
	const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "ajrm-gate-tombstone-"));
	t.after(() => fsp.rm(directory, { recursive:true, force:true }));
	const filename = path.join(directory, "definitions.json");
	const bundled = catalogue({ gates:[legacyGate()] });
	let store = createDefinitionStore(filename,bundled);
	const deleted = store.read().gates[0];
	await store.removeGate(deleted.locationId,deleted.revision);
	assert.deepEqual(store.read().gates,[]);
	assert.deepEqual(store.read().gateTombstones.map((entry) => [entry.locationId,entry.revision]),[[deleted.locationId,2]]);
	store = createDefinitionStore(filename,bundled);
	assert.deepEqual(store.read().gates,[]);
	await assert.rejects(store.setGate({ ...deleted,revision:2 }),/revision 3/);
	await store.setGate({ ...deleted,revision:3 });
	assert.equal(store.read().gates[0].revision,3);
	assert.deepEqual(store.read().gateTombstones,[]);
	store = createDefinitionStore(filename,catalogue({ gates:[legacyGate({ floodSpringAfter:"9:00:00" })] }));
	assert.equal(store.read().gates[0].revision,3);
	assert.equal(store.read().gates[0].turns[0].offsets.spring.value,83);
});

test("a concurrent stale PUT cannot resurrect a successfully deleted gate", async (t) => {
	const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "ajrm-gate-delete-race-"));
	t.after(() => fsp.rm(directory, { recursive:true, force:true }));
	const filename = path.join(directory, "definitions.json");
	const bundled = catalogue({ gates:[legacyGate()] });
	const store = createDefinitionStore(filename,bundled);
	const existing = store.read().gates[0];
	const [removed,replaced] = await Promise.allSettled([
		store.removeGate(existing.locationId,existing.revision),
		store.setGate({ ...existing,revision:existing.revision + 1 }),
	]);
	assert.equal(removed.status,"fulfilled");
	assert.equal(replaced.status,"rejected");
	assert.match(replaced.reason.message,/revision 3/);
	assert.deepEqual(store.read().gates,[]);
	assert.equal(store.read().gateTombstones[0].revision,2);
});
