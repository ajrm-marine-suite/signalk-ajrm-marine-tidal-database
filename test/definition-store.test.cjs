/** Verifies safe package migrations of durable tidal definitions. */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
	CONTRACT,
	LEGACY_CONTRACT,
	MIGRATION_CONTRACT,
	createDefinitionStore,
	mergeBundledDefinitions,
	validate,
} = require("../plugin/definition-store.cjs");

function port(locationId = "parent") {
	return {
		locationId,
		name:"Parent",
		kind:"standard",
		referenceLevels:{ mhws:4, mhwn:3, mlwn:2, mlws:1 },
		prediction:{ mode:"provider", providerId:"test", stationId:locationId },
	};
}

function catalogue({ ports = [port()], areas = [] } = {}) {
	return { contract:CONTRACT, contractVersion:2, ports, areas };
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
	assert.equal(Object.hasOwn(merged,"gates"),false);
});

test("the Greenock reference range backfills only the exact prior blank station record", () => {
	const greenockId = "29910eb5-6c47-4796-8af7-592742737562";
	const levels = {mhws:3.4,mhwn:2.8,mlwn:1,mlws:0.3};
	const greenock = { ...port(greenockId),referenceLevels:null,prediction:{mode:"provider",providerId:"ukhoTidalEvents",stationId:"0404"} };
	const bundledGreenock = { ...greenock,referenceLevels:levels };
	assert.deepEqual(mergeBundledDefinitions(catalogue({ports:[greenock]}),catalogue({ports:[bundledGreenock]})).ports[0].referenceLevels,levels);
	const custom = { ...greenock,referenceLevels:{mhws:9,mhwn:8,mlwn:7,mlws:6} };
	assert.deepEqual(mergeBundledDefinitions(catalogue({ports:[custom]}),catalogue({ports:[bundledGreenock]})).ports[0].referenceLevels,custom.referenceLevels);
	const differentStation = { ...greenock,prediction:{...greenock.prediction,stationId:"user-station"} };
	assert.equal(mergeBundledDefinitions(catalogue({ports:[differentStation]}),catalogue({ports:[bundledGreenock]})).ports[0].referenceLevels,null);
});

test("active v2 catalogues reject Planning-owned gate fields", () => {
	assert.throws(() => validate({ ...catalogue(),gates:[] }),/cannot contain Planning-owned gate data/);
	assert.throws(() => validate({ ...catalogue(),gateTombstones:[] }),/cannot contain Planning-owned gate data/);
});

test("a malformed legacy gate payload blocks startup instead of being silently discarded", async (t) => {
	const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "ajrm-tidal-invalid-migration-"));
	t.after(() => fsp.rm(directory, { recursive:true, force:true }));
	const filename = path.join(directory,"definitions.json");
	fs.writeFileSync(filename,`${JSON.stringify({ ...catalogue(),contract:LEGACY_CONTRACT,contractVersion:1,gates:{ unexpected:true } },null,2)}\n`);
	assert.throws(() => createDefinitionStore(filename,catalogue()),/refusing to discard/);
});

test("legacy gate payload stays quarantined and durable until Planning acknowledges it", async (t) => {
	const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "ajrm-tidal-migration-"));
	t.after(() => fsp.rm(directory, { recursive:true, force:true }));
	const filename = path.join(directory, "definitions.json");
	const gates = [{ contract:"ajrm-tidal-gate-constants-v1",locationId:"gate-a",name:"User gate",revision:7,userValue:"preserve exactly" }];
	const gateTombstones = [{ locationId:"gate-b",revision:4,deletedAt:"2026-08-22T10:00:00.000Z" }];
	const legacy = { ...catalogue(),contract:LEGACY_CONTRACT,contractVersion:1,updatedAt:"2026-08-22T11:00:00.000Z",gates,gateTombstones };
	fs.writeFileSync(filename,`${JSON.stringify(legacy,null,2)}\n`);
	const store = createDefinitionStore(filename,catalogue({ ports:[port(),{ ...port("bundled"),name:"Bundled" }] }));
	const active = store.read();
	assert.equal(active.contract,CONTRACT);
	assert.equal(active.contractVersion,2);
	assert.equal(active.ports.length,2);
	assert.equal(Object.hasOwn(active,"gates"),false);
	assert.equal(Object.hasOwn(active,"gateTombstones"),false);
	assert.deepEqual(store.readGateMigration(),{
		contract:MIGRATION_CONTRACT,
		contractVersion:1,
		sourceDefinitionsContract:LEGACY_CONTRACT,
		sourceUpdatedAt:"2026-08-22T11:00:00.000Z",
		gates,
		gateTombstones,
	});
	let durable = JSON.parse(await fsp.readFile(filename,"utf8"));
	assert.equal(durable.contract,LEGACY_CONTRACT);
	assert.deepEqual(durable.gates,gates);
	assert.deepEqual(durable.gateTombstones,gateTombstones);

	await store.setPort({ ...port("user-port"),name:"User port" });
	durable = JSON.parse(await fsp.readFile(filename,"utf8"));
	assert.ok(durable.ports.some((entry) => entry.locationId === "user-port"));
	assert.deepEqual(durable.gates,gates);
	assert.deepEqual(durable.gateTombstones,gateTombstones);

	const completed = await store.completeGateMigration();
	assert.deepEqual(completed,{ ok:true,completed:true,gateCount:1,tombstoneCount:1 });
	assert.equal(store.readGateMigration(),null);
	durable = JSON.parse(await fsp.readFile(filename,"utf8"));
	assert.equal(durable.contract,CONTRACT);
	assert.equal(durable.contractVersion,2);
	assert.equal(Object.hasOwn(durable,"gates"),false);
	assert.equal(Object.hasOwn(durable,"gateTombstones"),false);
	assert.ok(durable.ports.some((entry) => entry.locationId === "user-port"));
	const restarted = createDefinitionStore(filename,catalogue());
	assert.equal(restarted.readGateMigration(),null);
});

test("a fresh store has no migration registry and persists only the v2 definition contract", async (t) => {
	const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "ajrm-tidal-fresh-"));
	t.after(() => fsp.rm(directory, { recursive:true, force:true }));
	const filename = path.join(directory, "definitions.json");
	const store = createDefinitionStore(filename,catalogue());
	assert.equal(store.readGateMigration(),null);
	await store.setPort({ ...port("fresh"),name:"Fresh" });
	const durable = JSON.parse(await fsp.readFile(filename,"utf8"));
	assert.equal(durable.contract,CONTRACT);
	assert.equal(durable.contractVersion,2);
	assert.equal(Object.hasOwn(durable,"gates"),false);
	assert.equal(Object.hasOwn(durable,"gateTombstones"),false);
	assert.deepEqual(await store.completeGateMigration(),{ ok:true,completed:false,gateCount:0,tombstoneCount:0 });
});

test("a failed durable write does not publish an unsaved port edit", async (t) => {
	const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "ajrm-tidal-write-failure-"));
	t.after(() => fsp.rm(directory, { recursive:true, force:true }));
	const filename = path.join(directory, "definitions.json");
	const store = createDefinitionStore(filename,catalogue());
	await fsp.mkdir(filename);
	await assert.rejects(store.setPort({ ...port("unsaved"),name:"Unsaved" }));
	assert.equal(store.read().ports.some((entry) => entry.locationId === "unsaved"),false);
});
