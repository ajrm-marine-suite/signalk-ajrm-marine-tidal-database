/** Verifies Segment 5B source scoping, distinct joins and zero operational exposure. */

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const definitions = require("../defaults/tidal-definitions.json");
const { catalogueDiagnostics, normalizeGate, validateGateV2 } = require("../plugin/gate-contract.cjs");

const OBAN = "e0e5661f-1675-4dbb-8fa0-ea8566c62ef4";
const LOCH_LEVEN_NARROWS = "47683dc5-1b7e-477c-95fb-4e7a54244995";
const LEGACY_SOUND_OF_MULL = "2f25fd92-fbd0-4942-a883-17084a7b2eb2";
const expected = [
	{
		locationId:"fbd3ab30-6bf6-4e70-bf91-f7141d9586fc",
		image:"IMG_5400.jpeg",
		turns:[["In-going stream begins","-270"],["Out-going stream begins","+60"]],
	},
	{
		locationId:"dd2f8629-e052-42ac-84b3-07e49390c7b1",
		image:"IMG_5399.jpeg",
		turns:[["North-going stream begins","-345"],["South-going stream begins","+25"]],
	},
];

const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

test("Segment 5B preserves beginnings only in unavailable regime reasons", () => {
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
			assert.match(turn.offsets[regime].reason,/regime-neutral nominal/);
			assert.ok(turn.offsets[regime].sourceIds.length >= 2);
		}
		assert.ok(gate.turns.every((turn) => turn.direction.bearingDegreesTrue.state === "unavailable"));
		assert.ok(gate.turns.every((turn) => turn.slack.spring.semantics === "unavailable" && turn.slack.neap.semantics === "unavailable"));
		assert.equal(gate.flowModel.kind,"unavailable");
		assert.equal(gate.regimeInterpolation.kind,"unavailable");
		assert.deepEqual(gate.rateObservations,[]);
	}
});

test("Caolas nan Con remains separate from candidate 10 and keeps the shared lower bound unstructured", () => {
	const gate = definitions.gates.find((entry) => entry.locationId === expected[0].locationId);
	assert.match(gate.turns[0].offsets.spring.reason,/45 minutes after the narrows' -315 min beginning/);
	assert.match(gate.turns[1].offsets.spring.reason,/same time as the narrows/);
	const sharedRate = gate.uncertainty.find((entry) => entry.id === "shared-multi-locality-more-than-rate");
	assert.equal(sharedRate?.blocking,true);
	assert.match(sharedRate.summary,/more than 5 kn jointly for the Loch Leven narrows and Caolas nan Con/);
	assert.ok(gate.readiness.reasons.includes("loch-leven-narrows-identity-separate"));
	assert.notEqual(gate.locationId,LOCH_LEVEN_NARROWS);
	assert.deepEqual(gate.rateObservations,[]);
});

test("Lynn of Morvern keeps passage, flood-local and springs-ebb rates separate", () => {
	const gate = definitions.gates.find((entry) => entry.locationId === expected[1].locationId);
	const main = gate.uncertainty.find((entry) => entry.id === "main-body-rate-not-turn-specific");
	const flood = gate.uncertainty.find((entry) => entry.id === "lismore-shuna-flood-rate-localized");
	const ebb = gate.uncertainty.find((entry) => entry.id === "morvern-bernera-spring-ebb-rate-localized");
	assert.match(main.summary,/one-knot statement applies to the main body.*without a turn, direction or spring\/neap assignment/);
	assert.match(flood.summary,/2\.5 kn flood.*Lismore lighthouse.*Morvern shore.*Shuna Island.*not a passage-wide north-going rate or spring\/neap observation/);
	assert.match(ebb.summary,/4 kn.*springs-only on the ebb.*Morvern shore northwest of Bernera.*setting southeast with overfalls.*not a passage-wide south-going or neap rate/);
	assert.ok([main,flood,ebb].every((entry) => entry.blocking));
	assert.ok(gate.cautions.some((entry) => entry.id === "bernera-bay-ebb-eddy"));
	assert.ok(gate.cautions.some((entry) => entry.id === "morvern-bernera-springs-overfalls" && entry.blocking));
	assert.ok(gate.uncertainty.some((entry) => entry.id === "legacy-sound-of-mull-conflict"));
	assert.deepEqual(gate.rateObservations,[]);
});

test("Segment 5B heading index confines the source pages and requires no continuation", () => {
	const review = fs.readFileSync(path.join(__dirname,"../docs/tidal-gate-source-review-segment-5b.md"),"utf8");
	assert.match(review,/`IMG_5400\.jpeg`: \*\*Loch Leven\*\*/);
	assert.match(review,/Caolas nan Con is a subordinate locality/);
	assert.match(review,/candidate\s+10.*remains byte-for-byte unchanged/s);
	assert.match(review,/`IMG_5399\.jpeg`: \*\*Lynn of Morvern\*\*/);
	assert.match(review,/complete Tides block ends before\s+the Directions heading/);
	assert.match(review,/`IMG_5398\.jpeg` was not inspected/);
	assert.match(review,/do not\s+state turn\/slack semantics or a slack\/duration interval/);
	assert.match(review,/local tidal-constant line and height table are water-level\s+material, not stream-beginning or stream-rate evidence/);
});

test("Segment 5B appends records without changing any prior or conflicting record byte", () => {
	const priorGates = definitions.gates.slice(0,23);
	assert.equal(digest(priorGates),"0ebf98e7b26c4ee5e06079bab44f659352cd833efc1f55f037bc4c75d84e7108");
	assert.equal(digest(priorGates.slice(0,15)),"d645ee950dd6e6ef4651d7e8a4b0a614de995654597f005a2eabadf98f0e19fe");
	assert.equal(digest(priorGates.find((entry) => entry.locationId === LOCH_LEVEN_NARROWS)),"577f7e937e2c69e1e31f843a0e99f294357722dbb3e16d09a2ab69aaef84627c");
	assert.equal(digest(priorGates.find((entry) => entry.locationId === LEGACY_SOUND_OF_MULL)),"149e8d5a2c9f409dd5da73b8016f9d2f3a86c8e47b01d352ae0c4f978f9201c5");
});

test("Segment 5B joins are one-to-one and have zero effective operational exposure", () => {
	assert.equal(definitions.sourcePackage,"signalk-ajrm-marine-location-editor@0.6.45");
	assert.equal(new Set(expected.map((entry) => entry.locationId)).size,2);
	assert.equal(new Set(definitions.gates.map((entry) => entry.locationId)).size,25);
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
	assert.equal(gates.filter((entry) => !entry.legacy).length,10);
	assert.equal(diagnostics.valid,true);
	assert.deepEqual(diagnostics.operationalLocationIds,[]);
	assert.equal(diagnostics.summary.gateCount,25);
	assert.equal(diagnostics.summary.nonOperationalCount,25);
	for (const item of expected) {
		assert.equal(definitions.gates.filter((entry) => entry.locationId === item.locationId).length,1);
		assert.ok(diagnostics.issues.some((entry) => entry.code === "gate-not-operational" && entry.locationId === item.locationId));
		assert.equal(diagnostics.issues.some((entry) => entry.severity === "error" && entry.locationId === item.locationId),false);
	}
});
