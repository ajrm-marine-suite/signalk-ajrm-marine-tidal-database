/** Verifies Segment 3B photo facts, locality separation and fail-closed joins. */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const definitions = require("../defaults/tidal-definitions.json");
const { catalogueDiagnostics, normalizeGate, validateGateV2 } = require("../plugin/gate-contract.cjs");

const OBAN = "e0e5661f-1675-4dbb-8fa0-ea8566c62ef4";
const expected = [
	{
		locationId:"b4ff0772-bcba-4392-90e0-2f6d955a46f3",
		images:["IMG_5407.jpeg","IMG_5408.jpeg"],
		turns:[["North-going stream begins","-310"],["South-going stream begins","+75"]],
	},
	{
		locationId:"511edf0a-5ecc-419c-8f81-9a4553e559bf",
		images:["IMG_5405.jpeg","IMG_5406.jpeg","IMG_5408.jpeg"],
		turns:[["In-going stream begins","-300"],["Out-going stream begins","+90"]],
	},
];

test("Segment 3B records preserve nominal timing only as unavailable regime-neutral evidence", () => {
	for (const item of expected) {
		const gate = definitions.gates.find((entry) => entry.locationId === item.locationId);
		assert.equal(validateGateV2(gate).readiness.state,"reference-only");
		assert.equal(gate.reference.portLocationId,OBAN);
		assert.equal(gate.reference.event,"HW");
		for (const image of item.images) assert.ok(gate.provenance.sources.some((source) => source.imageRef.includes(image)));
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
	}
});

test("Northwest Mull keeps the two-headland rate and Treshnish statement separate", () => {
	const gate = definitions.gates.find((entry) => entry.locationId === expected[0].locationId);
	const summaries = gate.uncertainty.map((entry) => entry.summary).join(" ");
	assert.match(summaries,/up-to 2\.5 kn observation is limited to off Caliach Point and Rubh' a' Chaoil/);
	assert.match(summaries,/Treshnish Isles without a numeric rate/);
	assert.ok(gate.uncertainty.every((entry) => entry.blocking));
});

test("Loch Sunart retains approximate timing and distinct rate localities without a false entrance rate", () => {
	const gate = definitions.gates.find((entry) => entry.locationId === expected[1].locationId);
	assert.ok(gate.uncertainty.some((entry) => entry.id === "turn-times-explicitly-approximate" && entry.blocking));
	const summaries = gate.uncertainty.map((entry) => entry.summary).join(" ");
	assert.match(summaries,/generally below 1 kn/);
	assert.match(summaries,/2\.5 kn statement applies north of Carna and in the entrances to Loch Teacuis/);
	assert.match(summaries,/Laudale Narrows is a separate 3-3\.5 kn range/);
	assert.doesNotMatch(summaries,/Loch Sunart entrances[^.]*2\.5 kn/i);
});

test("candidate 4 remains documented as spatially withheld and image headings are indexed exactly", () => {
	const review = fs.readFileSync(path.join(__dirname,"../docs/tidal-gate-source-review-segment-3b.md"),"utf8");
	assert.match(review,/candidate 4, south end of Tiree: immediately adjacent `IMG_5408\.jpeg`/);
	assert.match(review,/candidate 5, Northwest Mull: `IMG_5407\.jpeg`/);
	assert.match(review,/candidate 6, Central and Outer Loch Sunart: `IMG_5406\.jpeg` and\s+`IMG_5405\.jpeg`/);
	assert.match(review,/Withheld: “towards the south end” and the partial chartlet establish no defensible gate point/);
});

test("Segment 3B joins coexist with prior records and leave the effective allow-list empty", () => {
	assert.equal(definitions.sourcePackage,"signalk-ajrm-marine-location-editor@0.6.43");
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
	assert.equal(gates.filter((entry) => !entry.legacy).length,6);
	assert.equal(diagnostics.valid,true);
	assert.deepEqual(diagnostics.operationalLocationIds,[]);
	assert.equal(diagnostics.summary.gateCount,21);
	assert.equal(diagnostics.summary.nonOperationalCount,21);
	for (const item of expected) {
		assert.ok(diagnostics.issues.some((entry) => entry.code === "gate-not-operational" && entry.locationId === item.locationId));
		assert.equal(diagnostics.issues.some((entry) => entry.severity === "error" && entry.locationId === item.locationId),false);
	}
});
