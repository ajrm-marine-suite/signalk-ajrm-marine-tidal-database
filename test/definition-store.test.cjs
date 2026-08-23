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
	PREVIOUS_CONTRACT,
	createDefinitionStore,
	mergeBundledDefinitions,
	validate,
} = require("../plugin/definition-store.cjs");

function port(locationId = "parent") {
	return {
		locationId,
		cachedLocationName:"Parent",
		kind:"standard",
		referenceLevels:{ mhws:4, mhwn:3, mlwn:2, mlws:1 },
		prediction:{ mode:"provider", providerId:"test", stationId:locationId },
	};
}

function catalogue({ ports = [port()], areas = [] } = {}) {
	return { contract:CONTRACT, contractVersion:3, ports, areas };
}

function reopenLegacyWithV072Semantics(value) {
	if (value?.contract !== LEGACY_CONTRACT || value?.contractVersion !== 1) {
		throw new Error("v0.7.2 cannot open this definitions contract.");
	}
	if (!Array.isArray(value.gates) || !Array.isArray(value.gateTombstones)) {
		throw new Error("v0.7.2 cannot open malformed gate migration data.");
	}
	const { gates:_gates,gateTombstones:_gateTombstones,...tidal } = structuredClone(value);
	const reopened = { ...tidal,contract:PREVIOUS_CONTRACT,contractVersion:2 };
	const portIds = new Set();
	for (const entry of reopened.ports || []) {
		if (!entry.locationId || portIds.has(entry.locationId)) throw new Error("v0.7.2 needs unique port Location ids.");
		if (Object.hasOwn(entry,"cachedLocationName") || !String(entry.name || "").trim()) throw new Error("v0.7.2 needs legacy port names.");
		if (!["standard","secondary"].includes(entry.kind)) throw new Error("v0.7.2 needs a valid port kind.");
		if (!["provider","corrections","unavailable"].includes(entry.prediction?.mode)) throw new Error("v0.7.2 needs a valid prediction mode.");
		portIds.add(entry.locationId);
	}
	const areaIds = new Set();
	for (const entry of reopened.areas || []) {
		if (!entry.locationId || areaIds.has(entry.locationId)) throw new Error("v0.7.2 needs unique area Location ids.");
		if (Object.hasOwn(entry,"cachedLocationName") || !String(entry.name || "").trim()) throw new Error("v0.7.2 needs legacy area names.");
		if (!portIds.has(entry.portLocationId)) throw new Error("v0.7.2 needs a valid serving port.");
		areaIds.add(entry.locationId);
	}
	for (const entry of reopened.areas || []) {
		if (entry.parentAreaLocationId && !areaIds.has(entry.parentAreaLocationId)) throw new Error("v0.7.2 needs a valid parent area.");
	}
	return reopened;
}

test("bundled definitions add missing ids without replacing any durable user fields", () => {
	const correction={ timeOffsetPeriodMinutes:720,highWaterTimeOffsets:[{ referenceTimeMinutes:0,offsetMinutes:7 }],lowWaterTimeOffsets:[{ referenceTimeMinutes:0,offsetMinutes:8 }],heightDifferencesM:{ mhws:1,mhwn:1,mlwn:1,mlws:1 } };
	const stored=catalogue({ ports:[
		{ ...port("parent"), automaticPreferredPortLocationId:null, advisory:{ status:"caution",message:"User wording" } },
		{ locationId:"entered",cachedLocationName:"Entered",kind:"secondary",prediction:{ mode:"corrections",parentLocationId:"parent",corrections:correction } },
	] });
	const bundled=catalogue({ ports:[
		{ ...stored.ports[0],automaticPreferredPortLocationId:"direct",advisory:{ status:"caution",message:"Package wording" } },
		{ ...stored.ports[1],prediction:{ ...stored.ports[1].prediction,corrections:{ ...correction,highWaterTimeOffsets:[{ referenceTimeMinutes:0,offsetMinutes:99 }] } } },
		{ ...port("direct"),cachedLocationName:"Direct" },
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

test("bundled merging renames only the exact prior Oban port and area names", () => {
	const portId = "e0e5661f-1675-4dbb-8fa0-ea8566c62ef4";
	const areaId = "f297596a-4959-47ff-b665-18ac2cb74924";
	const oldPort = { ...port(portId), cachedLocationName:"Oban tidal prediction port" };
	const newPort = { ...oldPort, cachedLocationName:"Oban port" };
	const oldArea = { locationId:areaId,cachedLocationName:"Oban tidal prediction port tidal area",portLocationId:portId,parentAreaLocationId:null };
	const newArea = { ...oldArea,cachedLocationName:"Oban port tidal area" };
	const merged = mergeBundledDefinitions(
		catalogue({ ports:[oldPort],areas:[oldArea] }),
		catalogue({ ports:[newPort],areas:[newArea] }),
	);
	assert.equal(merged.ports[0].cachedLocationName,"Oban port");
	assert.equal(merged.areas[0].cachedLocationName,"Oban port tidal area");

	const custom = mergeBundledDefinitions(
		catalogue({ ports:[{ ...oldPort,cachedLocationName:"My Oban" }],areas:[{ ...oldArea,cachedLocationName:"My Oban area" }] }),
		catalogue({ ports:[newPort],areas:[newArea] }),
	);
	assert.equal(custom.ports[0].cachedLocationName,"My Oban");
	assert.equal(custom.areas[0].cachedLocationName,"My Oban area");
});

test("active v3 catalogues reject editable names and Planning-owned gate fields", () => {
	assert.throws(() => validate({ ...catalogue(),gates:[] }),/cannot contain Planning-owned gate data/);
	assert.throws(() => validate({ ...catalogue(),gateTombstones:[] }),/cannot contain Planning-owned gate data/);
	assert.throws(() => validate(catalogue({ ports:[{ ...port(),name:"Duplicate" }] })),/cached Location name/);
});

test("v2 editable names migrate explicitly to v3 cached Location names", async (t) => {
	const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "ajrm-tidal-v2-names-"));
	t.after(() => fsp.rm(directory, { recursive:true, force:true }));
	const filename = path.join(directory,"definitions.json");
	const previous = {
		contract:PREVIOUS_CONTRACT,
		contractVersion:2,
		ports:[{ ...port(),name:"Location-owned",cachedLocationName:undefined }],
		areas:[],
	};
	fs.writeFileSync(filename,`${JSON.stringify(previous,null,2)}\n`);
	const store = createDefinitionStore(filename,catalogue());
	assert.equal(store.read().contract,CONTRACT);
	assert.equal(store.read().contractVersion,3);
	assert.equal(store.read().ports[0].cachedLocationName,"Location-owned");
	assert.equal(Object.hasOwn(store.read().ports[0],"name"),false);
	const durable = JSON.parse(await fsp.readFile(filename,"utf8"));
	assert.equal(durable.contract,CONTRACT);
	assert.equal(durable.contractVersion,3);
});

test("stored definition contracts enforce exact versions and v3 rejects legacy names", async (t) => {
	const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "ajrm-tidal-strict-contract-"));
	t.after(() => fsp.rm(directory, { recursive:true, force:true }));
	const filename = path.join(directory,"definitions.json");
	fs.writeFileSync(filename,`${JSON.stringify({ ...catalogue(),contractVersion:2 },null,2)}\n`);
	assert.throws(() => createDefinitionStore(filename,catalogue()),/contract and version are not supported/);
	fs.writeFileSync(filename,`${JSON.stringify(catalogue({ ports:[{ ...port(),name:"Forbidden duplicate" }] }),null,2)}\n`);
	assert.throws(() => createDefinitionStore(filename,catalogue()),/cannot contain an editable Location name/);
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
	const store = createDefinitionStore(filename,catalogue({ ports:[port(),{ ...port("bundled"),cachedLocationName:"Bundled" }] }));
	const active = store.read();
	assert.equal(active.contract,CONTRACT);
	assert.equal(active.contractVersion,3);
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

	await store.setPort({ ...port("user-port"),cachedLocationName:"User port" });
	durable = JSON.parse(await fsp.readFile(filename,"utf8"));
	assert.ok(durable.ports.some((entry) => entry.locationId === "user-port"));
	assert.deepEqual(durable.gates,gates);
	assert.deepEqual(durable.gateTombstones,gateTombstones);

	const completed = await store.completeGateMigration();
	assert.deepEqual(completed,{ ok:true,completed:true,gateCount:1,tombstoneCount:1 });
	assert.equal(store.readGateMigration(),null);
	durable = JSON.parse(await fsp.readFile(filename,"utf8"));
	assert.equal(durable.contract,CONTRACT);
	assert.equal(durable.contractVersion,3);
	assert.equal(Object.hasOwn(durable,"gates"),false);
	assert.equal(Object.hasOwn(durable,"gateTombstones"),false);
	assert.ok(durable.ports.some((entry) => entry.locationId === "user-port"));
	const restarted = createDefinitionStore(filename,catalogue());
	assert.equal(restarted.readGateMigration(),null);
});

test("pending gate migration writes remain reopenable by v0.7.2 after cached-name and definition mutations", async (t) => {
	const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "ajrm-tidal-migration-rollback-"));
	t.after(() => fsp.rm(directory, { recursive:true, force:true }));
	const filename = path.join(directory,"definitions.json");
	const gates = [{ contract:"ajrm-tidal-gate-constants-v1",locationId:"gate-a",name:"User gate",revision:7 }];
	const gateTombstones = [{ locationId:"gate-b",revision:4,deletedAt:"2026-08-22T10:00:00.000Z" }];
	const legacy = {
		contract:LEGACY_CONTRACT,
		contractVersion:1,
		updatedAt:"2026-08-22T11:00:00.000Z",
		ports:[{ ...port(),cachedLocationName:undefined,name:"Legacy parent" }],
		areas:[{ locationId:"area",name:"Legacy area",portLocationId:"parent",parentAreaLocationId:null }],
		gates,
		gateTombstones,
	};
	fs.writeFileSync(filename,`${JSON.stringify(legacy,null,2)}\n`);
	const bundled = catalogue({
		ports:[port()],
		areas:[{ locationId:"area",cachedLocationName:"Legacy area",portLocationId:"parent",parentAreaLocationId:null }],
	});
	const store = createDefinitionStore(filename,bundled);

	await store.cacheLocationNames(new Map([
		["parent","Location-owned parent"],
		["area","Location-owned area"],
	]));
	await store.setPort({ ...port("user-port"),cachedLocationName:"User port" });
	await store.setArea({ locationId:"user-area",cachedLocationName:"User area",portLocationId:"user-port",parentAreaLocationId:"area" });

	const durable = JSON.parse(await fsp.readFile(filename,"utf8"));
	assert.equal(durable.contract,LEGACY_CONTRACT);
	assert.equal(durable.contractVersion,1);
	assert.deepEqual(durable.gates,gates);
	assert.deepEqual(durable.gateTombstones,gateTombstones);
	assert.ok([...durable.ports,...durable.areas].every((entry) => Object.hasOwn(entry,"name")));
	assert.ok([...durable.ports,...durable.areas].every((entry) => !Object.hasOwn(entry,"cachedLocationName")));

	const reopened = reopenLegacyWithV072Semantics(durable);
	assert.equal(reopened.ports.find((entry) => entry.locationId === "parent").name,"Location-owned parent");
	assert.equal(reopened.areas.find((entry) => entry.locationId === "area").name,"Location-owned area");
	assert.equal(reopened.ports.find((entry) => entry.locationId === "user-port").name,"User port");
	assert.equal(reopened.areas.find((entry) => entry.locationId === "user-area").name,"User area");
});

test("a fresh store has no migration registry and persists only the v3 definition contract", async (t) => {
	const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "ajrm-tidal-fresh-"));
	t.after(() => fsp.rm(directory, { recursive:true, force:true }));
	const filename = path.join(directory, "definitions.json");
	const store = createDefinitionStore(filename,catalogue());
	assert.equal(store.readGateMigration(),null);
	await store.setPort({ ...port("fresh"),cachedLocationName:"Fresh" });
	const durable = JSON.parse(await fsp.readFile(filename,"utf8"));
	assert.equal(durable.contract,CONTRACT);
	assert.equal(durable.contractVersion,3);
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
	await assert.rejects(store.setPort({ ...port("unsaved"),cachedLocationName:"Unsaved" }));
	assert.equal(store.read().ports.some((entry) => entry.locationId === "unsaved"),false);
});
