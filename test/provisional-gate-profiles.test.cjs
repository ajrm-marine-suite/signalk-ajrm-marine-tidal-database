const assert = require("node:assert/strict");
const test = require("node:test");
const definitions = require("../defaults/tidal-definitions.json");
const { applyOperationalProfiles, profileLocationIds } = require("../plugin/provisional-gate-profiles.cjs");

test("all completed source reviews receive explicit estimated operational profiles", () => {
	const gates = applyOperationalProfiles(definitions.gates);
	assert.equal(profileLocationIds.length,24);
	for (const locationId of profileLocationIds) {
		const original = definitions.gates.find((gate) => gate.locationId === locationId);
		const gate = gates.find((entry) => entry.locationId === locationId);
		assert.equal(original.readiness.state,"reference-only");
		assert.deepEqual(gate.sourceReview,original);
		assert.equal(gate.readiness.state,"operational");
		assert.equal(gate.calculationBasis.mode,"operational-with-assumptions");
		assert.match(gate.calculationBasis.warning,/estimate.*pinch of salt.*assumptions/i);
		assert.ok(gate.turns.every((turn) => Number.isFinite(turn.direction.bearingDegreesTrue.value)));
		assert.ok(gate.turns.every((turn) => ["spring","neap"].every((regime) => Number.isFinite(turn.offsets[regime].value))));
		assert.equal(gate.rateObservations.length,4);
		assert.ok(gate.rateObservations.every((entry) => entry.qualifier === "approximate"));
	}
});

test("unfinished and legacy-only records are not manufactured into operational profiles", () => {
	const gates = applyOperationalProfiles(definitions.gates);
	for (const gate of gates.filter((entry) => !profileLocationIds.includes(entry.locationId))) {
		assert.equal(gate.calculationBasis,undefined);
		assert.notEqual(gate.readiness?.state,"operational");
	}
});
