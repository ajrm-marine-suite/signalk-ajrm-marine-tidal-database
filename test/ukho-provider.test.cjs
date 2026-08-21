/** Verifies UKHO pacing, rate-limit handling and explicit persistence policy. */

const assert = require("node:assert/strict");
const test = require("node:test");
const { createUkhoProvider, retryAfterMilliseconds } = require("../plugin/providers/ukho.cjs");

const events = [
	{ DateTime:"2026-08-21T00:00:00Z", EventType:"LowWater", Height:1 },
	{ DateTime:"2026-08-21T06:00:00Z", EventType:"HighWater", Height:4 },
];

test("Retry-After supports seconds and HTTP dates", () => {
	assert.equal(retryAfterMilliseconds("30", 1000), 30000);
	assert.equal(retryAfterMilliseconds("Thu, 01 Jan 1970 00:01:01 GMT", 1000), 60000);
});

test("a 429 is not repeated against the alternate endpoint", async () => {
	let calls = 0;
	const provider = createUkhoProvider({
		apiKey:"test", requestIntervalMs:1000,
		fetchFn:async () => { calls += 1; return { ok:false, status:429, statusText:"Too Many Requests", headers:{ get:() => "45" } }; },
	});
	await assert.rejects(provider.fetchEvents({ stationId:"station" }), (error) => {
		assert.equal(error.code, "UKHO_RATE_LIMITED");
		assert.equal(error.retryAfterMs, 45000);
		return true;
	});
	assert.equal(calls, 1);
});

test("queued station calls are separated by the configured interval", async () => {
	let now = 0;
	const waits = [];
	const provider = createUkhoProvider({
		apiKey:"test", requestIntervalMs:5000, nowFn:() => now,
		sleepFn:async (milliseconds) => { waits.push(milliseconds); now += milliseconds; },
		fetchFn:async () => ({ ok:true, json:async () => events }),
	});
	await Promise.all([
		provider.fetchEvents({ stationId:"one" }),
		provider.fetchEvents({ stationId:"two" }),
	]);
	assert.deepEqual(waits, [5000]);
});

test("Discovery persists only within its UTC licence year", () => {
	const discovery = createUkhoProvider({ apiKey:"x", subscriptionTier:"discovery" });
	assert.equal(discovery.persistentCachePermitted, true);
	assert.equal(discovery.cacheUseUntil("2026-08-21T00:00:00Z"), "2027-01-01T00:00:00.000Z");
	const foundation = createUkhoProvider({ apiKey:"x", subscriptionTier:"foundation" });
	assert.equal(foundation.persistentCachePermitted, true);
	assert.equal(foundation.cacheUseUntil("2026-08-21T00:00:00Z"), null);
});
