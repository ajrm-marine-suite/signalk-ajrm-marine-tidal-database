/** Verifies refresh gating, durable recovery, offline fallback and secondary correction calculations. */

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createProviderRegistry } = require("../plugin/provider-registry.cjs");
const { createTidalDatabase, MINIMUM_REFRESH_MS } = require("../plugin/database.cjs");

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
	const secondary = { locationId:"child", name:"Child", prediction:{ mode:"corrections", parentLocationId:"parent", corrections:{ timeOffsetPeriodMinutes:720, highWaterTimeOffsets:[{ referenceTimeMinutes:0, offsetMinutes:30 }], lowWaterTimeOffsets:[{ referenceTimeMinutes:0, offsetMinutes:-15 }], heightDifferencesM:{ mhws:.2, mhwn:.1, mlwn:-.1, mlws:-.2 } } } };
	const result = await value.db.resolvePort(secondary, new Map([["parent",parent],["child",secondary]]), { now:"2026-08-21T00:00:00Z" });
	assert.equal(value.calls(), 1);
	assert.equal(result.events[0].at, "2026-08-20T23:45:00.000Z");
	assert.equal(result.referenceLevels.mhws, 4.2);
	assert.equal(result.referenceLevels.mlws, .8);
});

test("memory-only providers do not recover forbidden disk records", async (t) => {
	const value = await fixture(t);
	const station = { providerId:"test", stationId:"one", stationName:"One" };
	await value.db.stationData(station, { now:"2026-08-21T00:00:00Z" });
	const memoryOnly = createProviderRegistry([{ id:"test", name:"Test", configured:true, persistentCachePermitted:false, async fetchEvents(){ throw new Error("no network"); } }]);
	const restarted = createTidalDatabase({ directory:value.directory, providers:memoryOnly });
	await assert.rejects(restarted.stationData(station, { now:"2026-08-21T01:00:00Z" }), /no network/);
});
