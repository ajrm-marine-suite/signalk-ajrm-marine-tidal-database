/** Verifies Segment 4 photo facts, distinct Sound of Mull loci and fail-closed joins. */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const definitions = require("../defaults/tidal-definitions.json");
const { catalogueDiagnostics, normalizeGate, validateGateV2 } = require("../plugin/gate-contract.cjs");

const OBAN = "e0e5661f-1675-4dbb-8fa0-ea8566c62ef4";
const expected = [
	{
		locationId:"c37604e9-f6e7-442f-91c3-c3135fc2e215",
		turns:[["Northwest-going stream begins","-360"],["Southeast-going stream begins","-45"]],
		spatialUncertainty:"entrance-endpoint-representative",
		rate:/regional ceiling of up to 2 kn at the southeast entrance/,
		duration:/about 5\.25 hours at the southeast end/,
	},
	{
		locationId:"74846a1d-67f1-4176-b74b-b7956df2386e",
		turns:[["Northwest-going stream begins","+300"],["Southeast-going stream begins","-45"]],
		spatialUncertainty:"calve-island-anchor-not-offshore-locus",
		rate:/generic ceiling of up to 1 kn elsewhere in the Sound/,
		duration:/about 6\.75 hours at the northwest end/,
	},
];

test("Segment 4 keeps approximate regime-neutral timing out of spring and neap fields", () => {
	for (const item of expected) {
		const gate = definitions.gates.find((entry) => entry.locationId === item.locationId);
		assert.equal(validateGateV2(gate).readiness.state,"reference-only");
		assert.equal(gate.reference.portLocationId,OBAN);
		assert.equal(gate.reference.event,"HW");
		assert.ok(gate.provenance.sources.some((source) => source.imageRef.includes("IMG_5404.jpeg")));
		assert.deepEqual(gate.turns.map((turn) => turn.name),item.turns.map((entry) => entry[0]));
		for (const [index,turn] of gate.turns.entries()) for (const regime of ["spring","neap"]) {
			assert.equal(turn.offsets[regime].state,"unavailable");
			assert.ok(turn.offsets[regime].reason.includes(`${item.turns[index][1]} min`));
			assert.match(turn.offsets[regime].reason,/explicitly approximate, regime-neutral/);
		}
		assert.ok(gate.turns.every((turn) => turn.direction.bearingDegreesTrue.state === "unavailable"));
		assert.ok(gate.turns.every((turn) => turn.slack.spring.semantics === "unavailable" && turn.slack.neap.semantics === "unavailable"));
		assert.equal(gate.flowModel.kind,"unavailable");
		assert.equal(gate.regimeInterpolation.kind,"unavailable");
		assert.deepEqual(gate.rateObservations,[]);
		assert.ok(gate.uncertainty.some((entry) => entry.id === item.spatialUncertainty && entry.blocking));
		const summaries = gate.uncertainty.map((entry) => entry.summary).join(" ");
		assert.match(summaries,item.rate);
		assert.match(summaries,item.duration);
	}
});

test("the Calve record does not turn generic rate or contextual duration into operational data", () => {
	const gate = definitions.gates.find((entry) => entry.locationId === expected[1].locationId);
	const summaries = gate.uncertainty.map((entry) => entry.summary).join(" ");
	assert.match(summaries,/not a Calve-locus, turn-specific or spring\/neap rate observation/);
	assert.match(summaries,/sentence does not explicitly restate the Calve timing locus/);
	assert.match(summaries,/no exact offshore bearing, origin point or coordinate is asserted/);
	assert.deepEqual(gate.rateObservations,[]);
});

test("Segment 4 preserves conflicting legacy Duart and generic Sound records unchanged", () => {
	const duart = definitions.gates.find((entry) => entry.locationId === "dd71c30b-b105-4d2f-a61e-3d6b9695e863");
	const generic = definitions.gates.find((entry) => entry.locationId === "2f25fd92-fbd0-4942-a883-17084a7b2eb2");
	assert.equal(duart.contract,"ajrm-tidal-gate-constants-v1");
	assert.equal(duart.name,"Duart Point");
	assert.equal(duart.floodSpringAfter,"-6:00:00");
	assert.equal(duart.ebbSpringAfter,"-0:45:00");
	assert.equal(generic.contract,"ajrm-tidal-gate-constants-v1");
	assert.equal(generic.name,"Sound of Mull");
	assert.equal(generic.floodSpringAfter,"-5:45:00");
	assert.equal(generic.ebbSpringAfter,"0:25:00");
	assert.equal(generic.floodSpringSlack,"0:00:00");
	assert.ok(expected.every((item) => item.locationId !== duart.locationId && item.locationId !== generic.locationId));
});

test("Segment 4 heading index excludes the Lismore figures from both Sound loci", () => {
	const review = fs.readFileSync(path.join(__dirname,"../docs/tidal-gate-source-review-segment-4.md"),"utf8");
	assert.match(review,/`IMG_5403\.jpeg`: \*\*Lismore to the Sound of Mull\*\*/);
	assert.match(review,/separate north\/south stream figures belong to\s+the Lismore approach and are not either Segment 4 locus/);
	assert.match(review,/`IMG_5404\.jpeg`: \*\*Sound of Mull\*\*/);
	assert.match(review,/does not reuse `Duart Point`/);
	assert.match(review,/does not reuse generic `Sound\s+of Mull`/);
});

test("Segment 4 joins coexist with all prior records and leave the effective allow-list empty", () => {
	assert.equal(definitions.sourcePackage,"signalk-ajrm-marine-location-editor@0.6.44");
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
	assert.equal(gates.filter((entry) => !entry.legacy).length,8);
	assert.equal(diagnostics.valid,true);
	assert.deepEqual(diagnostics.operationalLocationIds,[]);
	assert.equal(diagnostics.summary.gateCount,23);
	assert.equal(diagnostics.summary.nonOperationalCount,23);
	for (const item of expected) {
		assert.ok(diagnostics.issues.some((entry) => entry.code === "gate-not-operational" && entry.locationId === item.locationId));
		assert.equal(diagnostics.issues.some((entry) => entry.severity === "error" && entry.locationId === item.locationId),false);
	}
});
