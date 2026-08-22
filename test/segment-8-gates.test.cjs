const assert = require("node:assert/strict");
const test = require("node:test");
const definitions = require("../defaults/tidal-definitions.json");
const { validateGateV2 } = require("../plugin/gate-contract.cjs");
const { applyOperationalProfiles } = require("../plugin/provisional-gate-profiles.cjs");

const expected = new Map([
	["513807ca-dafc-48fd-a81a-76961c645e23", {reference:"e0e5661f-1675-4dbb-8fa0-ea8566c62ef4", offsets:[345,-15], rates:[3.5,3.5]}],
	["81ce9a21-efb6-4d14-ab26-280c8bfd4035", {reference:"e0e5661f-1675-4dbb-8fa0-ea8566c62ef4", offsets:[330,-40], rates:[8,4]}],
	["f9c17ddc-8fcc-49bd-8000-422f715d5697", {reference:"e0e5661f-1675-4dbb-8fa0-ea8566c62ef4", offsets:[280,-100], rates:[5,5]}],
	["f8a16397-5b14-46be-b769-555b3300af72", {reference:"e0e5661f-1675-4dbb-8fa0-ea8566c62ef4", offsets:[270,-120], rates:[1,1]}],
	["7c0e9a0d-4e6f-46e7-ac72-1b355f7a7e5d", {reference:"e0e5661f-1675-4dbb-8fa0-ea8566c62ef4", offsets:[270,-120], rates:[1,1]}],
	["b1b21e35-0cb5-4ab9-b8ac-1bb3795f2e17", {reference:"29910eb5-6c47-4796-8af7-592742737562", offsets:[-150,220], rates:[5,2.5]}],
	["9221ab63-c01f-4461-bf49-b7f566941013", {reference:"29910eb5-6c47-4796-8af7-592742737562", offsets:[-170,190], rates:[5,2.5]}],
]);

test("Segment 8 preserves source evidence and makes all seven candidates operational with estimates", () => {
	const projected = applyOperationalProfiles(definitions.gates);
	for (const [id, item] of expected) {
		const source = definitions.gates.find((entry) => entry.locationId === id);
		const gate = projected.find((entry) => entry.locationId === id);
		assert.equal(validateGateV2(source).readiness.state, "reference-only");
		assert.equal(source.reference.portLocationId, item.reference);
		assert.ok(source.cautions.some((entry) => /pinch of salt/i.test(entry.summary)));
		assert.equal(gate.readiness.state, "operational");
		assert.deepEqual(gate.sourceReview, source);
		assert.match(gate.calculationBasis.warning, /Every value is an estimate.*pinch of salt/i);
		assert.deepEqual(gate.turns.map((turn) => turn.offsets.spring.value), item.offsets);
		assert.deepEqual(gate.turns.map((turn) => gate.rateObservations.find((rate) => rate.turnId === turn.id && rate.regime === "spring").reportedValue.value), [item.rates[0],item.rates[0]]);
		assert.deepEqual(gate.turns.map((turn) => gate.rateObservations.find((rate) => rate.turnId === turn.id && rate.regime === "neap").reportedValue.value), [item.rates[1],item.rates[1]]);
	}
});

test("Greenock has an explicit provisional reference range for its two source-relative gates", () => {
	const greenock = definitions.ports.find((entry) => entry.locationId === "29910eb5-6c47-4796-8af7-592742737562");
	assert.equal(greenock.kind, "standard");
	assert.deepEqual(greenock.referenceLevels, {mhws:3.4,mhwn:2.8,mlwn:1,mlws:0.3});
	assert.equal(greenock.prediction.stationId, "0404");
});

test("Segment 8 appends without replacing legacy Mull and Sound of Islay records", () => {
	assert.equal(definitions.gates.length, 39);
	assert.equal(new Set(definitions.gates.map((entry) => entry.locationId)).size, 39);
	assert.ok(definitions.gates.find((entry) => entry.locationId === "bc8ddb8f-ba38-4b60-8d31-443dc2a96d1a"));
	assert.ok(definitions.gates.find((entry) => entry.locationId === "f2e31a99-65af-4188-8743-c4ae67e2cf3d"));
});
