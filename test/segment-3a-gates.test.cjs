/** Verifies Segment 3A photo evidence, v1 coexistence and fail-closed joins. */

const assert = require("node:assert/strict");
const test = require("node:test");
const definitions = require("../defaults/tidal-definitions.json");
const { catalogueDiagnostics, normalizeGate, validateGateV2 } = require("../plugin/gate-contract.cjs");

const OBAN = "e0e5661f-1675-4dbb-8fa0-ea8566c62ef4";
const expected = [
	{
		locationId:"1957fe61-93dd-4eb2-a27b-e8f7fa958270",
		image:"IMG_5410.jpeg",
		turns:[["North-going stream begins","+315"],["South-going stream begins","-15"]],
		upperBound:2.5,
		uncertainty:"turn-times-explicitly-guidance",
	},
	{
		locationId:"6211fb34-5f92-4ea9-887c-201ddb550792",
		image:"IMG_5409.jpeg",
		turns:[["Northwest-going stream begins","+335"],["Southeast-going stream begins","-80"]],
		upperBound:3,
		uncertainty:"shared-up-to-rate",
	},
];

test("Segment 3A native records preserve exact source facts without assigning missing regimes or turns", () => {
	for (const item of expected) {
		const gate = definitions.gates.find((entry) => entry.locationId === item.locationId);
		assert.equal(validateGateV2(gate).readiness.state,"reference-only");
		assert.deepEqual(gate.reference,{ portLocationId:OBAN,event:"HW",sourceIds:gate.reference.sourceIds });
		assert.equal(gate.provenance.sources[0].imageRef.includes(item.image),true);
		assert.equal(gate.provenance.sources[0].page,null);
		assert.deepEqual(gate.turns.map((turn) => turn.name),item.turns.map((entry) => entry[0]));
		for (const [index,turn] of gate.turns.entries()) for (const regime of ["spring","neap"]) {
			assert.equal(turn.offsets[regime].state,"unavailable");
			assert.match(turn.offsets[regime].reason,new RegExp(`\\${item.turns[index][1]} min`));
		}
		assert.ok(gate.turns.every((turn) => turn.direction.bearingDegreesTrue.state === "unavailable"));
		assert.ok(gate.turns.every((turn) => turn.slack.spring.semantics === "unavailable" && turn.slack.neap.semantics === "unavailable"));
		assert.equal(gate.flowModel.kind,"unavailable");
		assert.equal(gate.regimeInterpolation.kind,"unavailable");
		assert.deepEqual(gate.rateObservations,[]);
		assert.ok(gate.uncertainty.some((entry) => entry.summary.includes(`up-to ${item.upperBound} kn`)));
		for (const [,nominal] of item.turns) assert.ok(gate.uncertainty.some((entry) => entry.summary.includes(`${nominal} min`)));
		assert.ok(gate.uncertainty.some((entry) => entry.id === item.uncertainty && entry.blocking));
	}
});

test("native Segment 3A records coexist with lossless v1 migration and remain outside the effective allow-list", () => {
	const gates = definitions.gates.map(normalizeGate);
	const locations = [
		...definitions.ports.map((entry) => ({
			id:entry.locationId,
			name:entry.name,
			types:[entry.kind === "standard" ? "tidalStandardPort" : "tidalSecondaryPort"],
		})),
		...gates.map((entry) => ({ id:entry.locationId,name:entry.locationId,types:["tidalGate"] })),
	];
	const diagnostics = catalogueDiagnostics({ ...definitions,gates },locations);
	assert.equal(gates.filter((entry) => entry.legacy?.fromContract === "ajrm-tidal-gate-constants-v1").length,15);
	assert.equal(gates.filter((entry) => !entry.legacy).length,4);
	assert.equal(diagnostics.valid,true);
	assert.deepEqual(diagnostics.operationalLocationIds,[]);
	assert.equal(diagnostics.summary.gateCount,19);
	assert.equal(diagnostics.summary.nonOperationalCount,19);
	for (const item of expected) {
		assert.ok(diagnostics.issues.some((entry) => entry.code === "gate-not-operational" && entry.locationId === item.locationId));
		assert.equal(diagnostics.issues.some((entry) => entry.severity === "error" && entry.locationId === item.locationId),false);
	}
});
