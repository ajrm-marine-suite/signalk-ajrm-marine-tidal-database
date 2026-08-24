/** Verifies refresh gating, durable recovery, offline fallback and secondary correction calculations. */

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createProviderRegistry } = require("../plugin/provider-registry.cjs");
const { createTidalDatabase, HISTORY_RETENTION_MS, MINIMUM_REFRESH_MS, mergeRefreshEvents } = require("../plugin/database.cjs");

const events = [
	{ at:"2026-08-21T00:00:00Z", type:"low", heightM:1 },
	{ at:"2026-08-21T06:00:00Z", type:"high", heightM:4 },
];

async function fixture(t, provider = {}) {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ajrm-tidal-db-"));
	t.after(() => fs.rm(directory, { recursive:true, force:true }));
	let calls = 0;
	const adapter = {
		id:"test", name:"Test provider", configured:true, persistentCachePermitted:true,
		async fetchEvents() { calls += 1; if (provider.fail) throw new Error("offline"); return { events }; },
		...provider,
	};
	const registry = createProviderRegistry([adapter]);
	return { directory, registry, db:createTidalDatabase({ directory, providers:registry }), calls:() => calls };
}

test("a station is never fetched twice inside the 24-hour floor", async (t) => {
	const value = await fixture(t);
	const station = { providerId:"test", stationId:"one", stationName:"One" };
	const first = await value.db.stationData(station, { now:"2026-08-21T00:00:00Z" });
	const second = await value.db.stationData(station, { now:new Date(Date.parse("2026-08-21T00:00:00Z") + MINIMUM_REFRESH_MS).toISOString() });
	assert.equal(first.cache, "network");
	assert.equal(second.cache, "hit");
	assert.equal(value.calls(), 1);
});

test("simultaneous requests for one station share a single provider fetch", async (t) => {
	let release;
	let calls = 0;
	const wait = new Promise((resolve) => { release = resolve; });
	const value = await fixture(t, { async fetchEvents() { calls += 1; await wait; return { events }; } });
	const station = { providerId:"test", stationId:"one", stationName:"One" };
	const first = value.db.stationData(station, { now:"2026-08-21T00:00:00Z" });
	const second = value.db.stationData(station, { now:"2026-08-21T00:00:00Z" });
	release();
	const [left, right] = await Promise.all([first, second]);
	assert.equal(left.fetchedAt, right.fetchedAt);
	assert.equal(calls, 1);
});

test("licensed provider records survive a database restart", async (t) => {
	const value = await fixture(t);
	const station = { providerId:"test", stationId:"one", stationName:"One" };
	await value.db.stationData(station, { now:"2026-08-21T00:00:00Z" });
	const restarted = createTidalDatabase({ directory:value.directory, providers:value.registry });
	const result = await restarted.stationData(station, { now:"2026-08-21T01:00:00Z" });
	assert.equal(result.cache, "hit");
	assert.equal(value.calls(), 1);
});

test("a successful refresh retains only the preceding 24 hours and replaces future predictions", async (t) => {
	const initialEvents = [
		{ at:"2026-08-24T05:59:00Z",type:"low",heightM:1.0 },
		{ at:"2026-08-24T06:00:00Z",type:"high",heightM:4.0 },
		{ at:"2026-08-24T12:00:00Z",type:"low",heightM:1.1 },
		{ at:"2026-08-24T18:00:00Z",type:"high",heightM:4.1 },
		{ at:"2026-08-25T00:00:00Z",type:"low",heightM:1.2 },
		{ at:"2026-08-25T06:00:00Z",type:"low",heightM:0.8 },
		{ at:"2026-08-25T12:00:00Z",type:"low",heightM:1.0 },
	];
	const refreshedEvents = [
		{ at:"2026-08-25T18:00:00Z",type:"high",heightM:4.3 },
		{ at:"2026-08-25T12:05:00Z",type:"low",heightM:1.3 },
		{ at:"2026-08-25T06:00:00Z",type:"high",heightM:4.2 },
	];
	let fetchCount = 0;
	const value = await fixture(t, {
		async fetchEvents() {
			fetchCount += 1;
			return { events: fetchCount === 1 ? initialEvents : refreshedEvents };
		},
	});
	const station = { providerId:"test",stationId:"history",stationName:"History" };
	await value.db.stationData(station,{ now:"2026-08-24T05:00:00Z" });
	const refreshedAt = "2026-08-25T06:00:00Z";
	const refreshed = await value.db.stationData(station,{ now:refreshedAt });
	const cutoffMs = Date.parse(refreshedAt) - HISTORY_RETENTION_MS;

	assert.equal(refreshed.cache,"network");
	assert.equal(fetchCount,2);
	assert.deepEqual(refreshed.events, [
		{ at:"2026-08-24T06:00:00.000Z",type:"high",heightM:4.0 },
		{ at:"2026-08-24T12:00:00.000Z",type:"low",heightM:1.1 },
		{ at:"2026-08-24T18:00:00.000Z",type:"high",heightM:4.1 },
		{ at:"2026-08-25T00:00:00.000Z",type:"low",heightM:1.2 },
		{ at:"2026-08-25T06:00:00.000Z",type:"high",heightM:4.2 },
		{ at:"2026-08-25T12:05:00.000Z",type:"low",heightM:1.3 },
		{ at:"2026-08-25T18:00:00.000Z",type:"high",heightM:4.3 },
	]);
	assert.ok(refreshed.events.every((event) => Date.parse(event.at) >= cutoffMs));
	assert.equal(refreshed.events.some((event) => event.at === "2026-08-25T12:00:00.000Z"),false);
	assert.deepEqual(refreshed.coverage,{ startAt:"2026-08-24T06:00:00.000Z",endAt:"2026-08-25T18:00:00.000Z" });

	const restarted = createTidalDatabase({ directory:value.directory,providers:value.registry });
	const recovered = await restarted.stationData(station,{ now:"2026-08-25T07:00:00Z" });
	assert.equal(recovered.cache,"hit");
	assert.deepEqual(recovered.events,refreshed.events);
});

test("fresh duplicate events collapse only when their time, type and height agree", () => {
	const identical = { at:"2026-08-25T06:00:00Z",type:"high",heightM:4.2 };
	assert.deepEqual(mergeRefreshEvents([], [identical,identical],Date.parse("2026-08-25T05:00:00Z")), [
		{ at:"2026-08-25T06:00:00.000Z",type:"high",heightM:4.2 },
	]);
	for (const conflict of [
		{ at:"2026-08-25T06:00:00Z",type:"low",heightM:4.2 },
		{ at:"2026-08-25T06:00:00Z",type:"high",heightM:4.3 },
	]) {
		assert.throws(
			() => mergeRefreshEvents([], [identical,conflict],Date.parse("2026-08-25T05:00:00Z")),
			/Tide provider returned conflicting events/,
		);
	}
});

test("high-only and low-only stations retain their preceding one-type history", () => {
	for (const [type,heightM] of [["high",4],["low",1]]) {
		const result = mergeRefreshEvents([
			{ at:"2026-08-24T12:00:00Z",type,heightM },
			{ at:"2026-08-25T00:00:00Z",type,heightM },
		], [
			{ at:"2026-08-25T12:00:00Z",type,heightM },
			{ at:"2026-08-26T00:00:00Z",type,heightM },
		], Date.parse("2026-08-25T06:00:00Z"));
		assert.deepEqual(result.map((event) => event.at), [
			"2026-08-24T12:00:00.000Z",
			"2026-08-25T00:00:00.000Z",
			"2026-08-25T12:00:00.000Z",
			"2026-08-26T00:00:00.000Z",
		]);
	}
});

test("a conflicting duplicate instant in retained history is omitted instead of guessed", () => {
	const result = mergeRefreshEvents([
		{ at:"2026-08-25T00:00:00Z",type:"high",heightM:4 },
		{ at:"2026-08-25T00:00:00Z",type:"low",heightM:1 },
		{ at:"2026-08-25T03:00:00Z",type:"low",heightM:1.1 },
	], [
		{ at:"2026-08-25T12:00:00Z",type:"high",heightM:4.1 },
		{ at:"2026-08-25T18:00:00Z",type:"low",heightM:1.2 },
	], Date.parse("2026-08-25T06:00:00Z"));
	assert.equal(result.some((event) => event.at === "2026-08-25T00:00:00.000Z"),false);
	assert.equal(result[0].at,"2026-08-25T03:00:00.000Z");
});

test("the retained Oban tail preserves the tide cycle preceding Sound of Luing's current day", async (t) => {
	const cachedEvents = [
		{ at:"2026-08-23T09:10:00Z",type:"low",heightM:1.9 },
		{ at:"2026-08-23T15:11:00Z",type:"high",heightM:3.2 },
		{ at:"2026-08-23T21:30:00Z",type:"low",heightM:1.8 },
		{ at:"2026-08-24T03:17:00Z",type:"high",heightM:2.9 },
		{ at:"2026-08-24T09:00:00Z",type:"low",heightM:1.7 },
	];
	const freshEvents = [
		{ at:"2026-08-24T21:15:00Z",type:"low",heightM:1.8 },
		{ at:"2026-08-24T15:11:00Z",type:"high",heightM:3.2 },
		{ at:"2026-08-24T09:10:00Z",type:"low",heightM:1.9 },
		{ at:"2026-08-24T03:18:00Z",type:"high",heightM:3.0 },
	];
	let fetchCount = 0;
	const value = await fixture(t, {
		async fetchEvents() {
			fetchCount += 1;
			return { events: fetchCount === 1 ? cachedEvents : freshEvents };
		},
	});
	const station = { providerId:"test",stationId:"oban",stationName:"Oban" };
	await value.db.stationData(station,{ now:"2026-08-23T05:54:00Z" });
	const result = await value.db.stationData(station,{ now:"2026-08-24T05:55:00Z" });

	assert.deepEqual(result.events, [
		{ at:"2026-08-23T09:10:00.000Z",type:"low",heightM:1.9 },
		{ at:"2026-08-23T15:11:00.000Z",type:"high",heightM:3.2 },
		{ at:"2026-08-23T21:30:00.000Z",type:"low",heightM:1.8 },
		{ at:"2026-08-24T03:18:00.000Z",type:"high",heightM:3.0 },
		{ at:"2026-08-24T09:10:00.000Z",type:"low",heightM:1.9 },
		{ at:"2026-08-24T15:11:00.000Z",type:"high",heightM:3.2 },
		{ at:"2026-08-24T21:15:00.000Z",type:"low",heightM:1.8 },
	]);
	assert.equal(result.coverage.startAt,"2026-08-23T09:10:00.000Z");
	assert.equal(result.events.find((event) => event.at === "2026-08-24T03:18:00.000Z").heightM,3.0);
	assert.equal(result.events.some((event) => event.at === "2026-08-24T03:17:00.000Z"),false);
	assert.equal(result.events.some((event) => event.at === "2026-08-24T09:00:00.000Z"),false);
});

test("a failed refresh leaves the complete previous cache unchanged", async (t) => {
	let fetchCount = 0;
	const value = await fixture(t, {
		async fetchEvents() {
			fetchCount += 1;
			if (fetchCount > 1) throw new Error("offline");
			return { events };
		},
	});
	const station = { providerId:"test",stationId:"offline-history",stationName:"Offline history" };
	const original = await value.db.stationData(station,{ now:"2026-08-21T00:00:00Z" });
	const fallback = await value.db.stationData(station,{ now:"2026-08-22T01:00:00Z" });

	assert.equal(fallback.cache,"staleFallback");
	assert.equal(fallback.fetchedAt,original.fetchedAt);
	assert.deepEqual(fallback.events,original.events);
	assert.deepEqual(fallback.coverage,original.coverage);
});

test("a persistence failure leaves both memory and the prior disk record authoritative", async (t) => {
	let fetchCount = 0;
	const value = await fixture(t, {
		async fetchEvents() {
			fetchCount += 1;
			return { events: fetchCount === 1 ? events : [
				{ at:"2026-08-22T06:00:00Z",type:"high",heightM:4.2 },
				{ at:"2026-08-22T12:00:00Z",type:"low",heightM:1.2 },
			] };
		},
	});
	const station = { providerId:"test",stationId:"persistence",stationName:"Persistence" };
	const original = await value.db.stationData(station,{ now:"2026-08-21T00:00:00Z" });
	const failing = createTidalDatabase({
		directory:value.directory,
		providers:value.registry,
		async writeRecord() { throw new Error("disk full"); },
	});
	const fallback = await failing.stationData(station,{ now:"2026-08-22T01:00:00Z" });
	const memoryFallback = await failing.stationData(station,{ now:"2026-08-22T01:10:00Z" });
	const restarted = createTidalDatabase({ directory:value.directory,providers:value.registry });
	const diskRecord = await restarted.stationData(station,{ now:"2026-08-21T01:00:00Z" });

	assert.equal(fallback.cache,"staleFallback");
	assert.match(fallback.fallbackReason,/disk full/);
	assert.deepEqual(fallback.events,original.events);
	assert.deepEqual(memoryFallback.events,original.events);
	assert.equal(diskRecord.cache,"hit");
	assert.deepEqual(diskRecord.events,original.events);
});

test("a persisted provider record is rejected at its declared licence boundary", async (t) => {
	let calls = 0;
	const value = await fixture(t, {
		cacheUseUntil(now) { return new Date(Date.UTC(new Date(now).getUTCFullYear() + 1, 0, 1)).toISOString(); },
		async fetchEvents() { calls += 1; return { events }; },
	});
	const station = { providerId:"test", stationId:"one", stationName:"One" };
	await value.db.stationData(station, { now:"2026-12-31T23:00:00Z" });
	const restarted = createTidalDatabase({ directory:value.directory, providers:value.registry });
	const result = await restarted.stationData(station, { now:"2027-01-01T00:00:00Z" });
	assert.equal(result.cache, "network");
	assert.equal(calls, 2);
});

test("a locally corrected secondary reuses its parent provider record", async (t) => {
	const value = await fixture(t);
	const parent = { locationId:"parent", name:"Parent", datum:"CD", referenceLevels:{ mhws:4, mhwn:3, mlwn:2, mlws:1 }, prediction:{ mode:"provider", providerId:"test", stationId:"one", stationName:"One" } };
	const secondary = { locationId:"child", name:"Child", datum:"Incorrect override", referenceLevels:{ mhws:null, mhwn:null, mlwn:null, mlws:null }, prediction:{ mode:"corrections", parentLocationId:"parent", corrections:{ timeOffsetPeriodMinutes:720, highWaterTimeOffsets:[{ referenceTimeMinutes:0, offsetMinutes:30 }], lowWaterTimeOffsets:[{ referenceTimeMinutes:0, offsetMinutes:-15 }], heightDifferencesM:{ mhws:.2, mhwn:.1, mlwn:-.1, mlws:-.2 } } } };
	const result = await value.db.resolvePort(secondary, new Map([["parent",parent],["child",secondary]]), { now:"2026-08-21T00:00:00Z" });
	assert.equal(value.calls(), 1);
	assert.equal(result.events[0].at, "2026-08-20T23:45:00.000Z");
	assert.equal(result.referenceLevels.mhws, 4.2);
	assert.equal(result.referenceLevels.mlws, .8);
	assert.equal(result.datum, "CD");
});

test("secondary height differences extrapolate linearly beyond mean spring and neap levels", async (t) => {
	const value = await fixture(t, { async fetchEvents() { return { events:[
		{ at:"2026-08-21T00:00:00Z",type:"low",heightM:.8 },
		{ at:"2026-08-21T06:00:00Z",type:"high",heightM:4.2 },
	] }; } });
	const parent = { locationId:"parent",name:"Parent",datum:"CD",referenceLevels:{ mhws:4,mhwn:3,mlwn:2,mlws:1 },
		prediction:{ mode:"provider",providerId:"test",stationId:"one",stationName:"One" } };
	const secondary = { locationId:"child",name:"Child",prediction:{ mode:"corrections",parentLocationId:"parent",corrections:{
		timeOffsetPeriodMinutes:720,
		highWaterTimeOffsets:[{ referenceTimeMinutes:0,offsetMinutes:0 }],
		lowWaterTimeOffsets:[{ referenceTimeMinutes:0,offsetMinutes:0 }],
		heightDifferencesM:{ mhws:.2,mhwn:.1,mlwn:-.1,mlws:-.2 },
	} } };
	const result = await value.db.resolvePort(secondary,new Map([["parent",parent],["child",secondary]]),{ now:"2026-08-21T00:00:00Z" });
	assert.equal(result.events.find((event) => event.type === "high").heightM,4.42);
	assert.ok(Math.abs(result.events.find((event) => event.type === "low").heightM - .58) < 1e-12);
});

test("memory-only providers do not recover forbidden disk records", async (t) => {
	const value = await fixture(t);
	const station = { providerId:"test", stationId:"one", stationName:"One" };
	await value.db.stationData(station, { now:"2026-08-21T00:00:00Z" });
	const memoryOnly = createProviderRegistry([{ id:"test", name:"Test", configured:true, persistentCachePermitted:false, async fetchEvents(){ throw new Error("no network"); } }]);
	const restarted = createTidalDatabase({ directory:value.directory, providers:memoryOnly });
	await assert.rejects(restarted.stationData(station, { now:"2026-08-21T01:00:00Z" }), /no network/);
});

test("station inspection reports when a provider supplies high water only", async (t) => {
	const value = await fixture(t, { async fetchEvents() { return { events:[{ at:"2026-08-21T06:00:00Z",type:"high",heightM:4 }] }; } });
	const station = { providerId:"test",stationId:"high-only",stationName:"High only" };
	await value.db.stationData(station,{ now:"2026-08-21T00:00:00Z" });
	const inspected = await value.db.inspectStation(station,{ now:"2026-08-21T00:00:00Z" });
	assert.deepEqual(inspected.eventCapabilities,{ highWater:true,lowWater:false,completeExtrema:false,curve:false });
});
