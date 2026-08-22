/** Verifies Segment 5A source facts, one-to-one joins and zero operational exposure. */

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const definitions = require("../defaults/tidal-definitions.json");
const { catalogueDiagnostics, normalizeGate, validateGateV2 } = require("../plugin/gate-contract.cjs");

const OBAN = "e0e5661f-1675-4dbb-8fa0-ea8566c62ef4";
const expected = [
	{
		locationId:"55187907-2b6d-4c9b-9073-3848e2679a07",
		image:"IMG_5401.jpeg",
		turns:[["In-going stream begins","-360"],["Out-going stream begins","+5"]],
		rateUncertainty:"shared-more-than-spring-rate",
		rate:/gate-wide lower-bound statement of more than 5 kn at springs/,
	},
	{
		locationId:"47683dc5-1b7e-477c-95fb-4e7a54244995",
		image:"IMG_5400.jpeg",
		turns:[["In-going stream begins","-315"],["Out-going stream begins","+60"]],
		rateUncertainty:"shared-multi-locality-more-than-rate",
		rate:/more than 5 kn jointly for the narrows and Caolas nan Con/,
	},
];

test("Segment 5A preserves nominal beginnings only in unavailable regime reasons", () => {
	for (const item of expected) {
		const matches = definitions.gates.filter((entry) => entry.locationId === item.locationId);
		assert.equal(matches.length,1);
		const [gate] = matches;
		assert.equal(gate.contract,"ajrm-tidal-gate-constants-v2");
		assert.equal(Object.hasOwn(gate,"name"),false);
		assert.equal(validateGateV2(gate).readiness.state,"reference-only");
		assert.equal(gate.reference.portLocationId,OBAN);
		assert.equal(gate.reference.event,"HW");
		assert.ok(gate.provenance.sources.some((source) => source.imageRef.includes(item.image)));
		assert.deepEqual(gate.turns.map((turn) => turn.name),item.turns.map((entry) => entry[0]));
		for (const [index,turn] of gate.turns.entries()) for (const regime of ["spring","neap"]) {
			assert.equal(turn.offsets[regime].state,"unavailable");
			assert.ok(turn.offsets[regime].reason.includes(`${item.turns[index][1]} min`));
			assert.match(turn.offsets[regime].reason,/regime-neutral nominal beginning offset/);
			assert.ok(turn.offsets[regime].sourceIds.length >= 2);
		}
		assert.ok(gate.turns.every((turn) => turn.direction.bearingDegreesTrue.state === "unavailable"));
		assert.ok(gate.turns.every((turn) => turn.slack.spring.semantics === "unavailable" && turn.slack.neap.semantics === "unavailable"));
		assert.equal(gate.flowModel.kind,"unavailable");
		assert.equal(gate.regimeInterpolation.kind,"unavailable");
		assert.deepEqual(gate.rateObservations,[]);
		const rate = gate.uncertainty.find((entry) => entry.id === item.rateUncertainty);
		assert.equal(rate?.blocking,true);
		assert.match(rate.summary,item.rate);
	}
});

test("Loch Leven keeps Caolas nan Con timing and locality separate", () => {
	const gate = definitions.gates.find((entry) => entry.locationId === expected[1].locationId);
	const summaries = gate.uncertainty.map((entry) => entry.summary).join(" ");
	assert.match(summaries,/Caolas nan Con has separately scoped stream timing/);
	assert.match(summaries,/not merged into the Loch Leven narrows turns or joined Location/);
	assert.deepEqual(gate.rateObservations,[]);
});

test("Segment 5A heading index records the offset and excludes Loch Eil facts", () => {
	const review = fs.readFileSync(path.join(__dirname,"../docs/tidal-gate-source-review-segment-5a.md"),"utf8");
	assert.match(review,/`IMG_5401\.jpeg`: \*\*Corran Narrows\*\*/);
	assert.match(review,/`IMG_5402\.jpeg`: \*\*Loch Eil\*\*/);
	assert.match(review,/Annat Narrows,\s+not a\s+Segment 5A candidate/);
	assert.match(review,/`IMG_5400\.jpeg`: \*\*Loch Leven\*\*/);
	assert.match(review,/`IMG_5403\.jpeg` was not inspected/);
	assert.match(review,/No stream duration or slack interval is derived/);
});

test("Segment 5A appends records without changing any prior gate or legacy byte", () => {
	const priorGates = definitions.gates.slice(0,21);
	const allDigest = crypto.createHash("sha256").update(JSON.stringify(priorGates)).digest("hex");
	const legacyDigest = crypto.createHash("sha256").update(JSON.stringify(priorGates.slice(0,15))).digest("hex");
	assert.equal(allDigest,"c5749d7df70a9700bf84ce1717c66ff55a8833b164b7334173a2da7e7e58cf81");
	assert.equal(legacyDigest,"d645ee950dd6e6ef4651d7e8a4b0a614de995654597f005a2eabadf98f0e19fe");
});

test("Segment 5A joins are one-to-one and have zero effective operational exposure", () => {
	assert.equal(definitions.sourcePackage,"signalk-ajrm-marine-location-editor@0.6.47");
	assert.equal(new Set(expected.map((entry) => entry.locationId)).size,2);
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
	assert.equal(gates.filter((entry) => !entry.legacy).length,14);
	assert.equal(diagnostics.valid,true);
	assert.deepEqual(diagnostics.operationalLocationIds,[]);
	assert.equal(diagnostics.summary.gateCount,29);
	assert.equal(diagnostics.summary.nonOperationalCount,29);
	for (const item of expected) {
		assert.equal(definitions.gates.filter((entry) => entry.locationId === item.locationId).length,1);
		assert.ok(diagnostics.issues.some((entry) => entry.code === "gate-not-operational" && entry.locationId === item.locationId));
		assert.equal(diagnostics.issues.some((entry) => entry.severity === "error" && entry.locationId === item.locationId),false);
	}
});
