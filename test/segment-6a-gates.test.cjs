/** Verifies Segment 6A source/locality scoping and zero operational exposure. */

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const definitions = require("../defaults/tidal-definitions.json");
const { catalogueDiagnostics, normalizeGate, validateGateV2 } = require("../plugin/gate-contract.cjs");

const OBAN = "e0e5661f-1675-4dbb-8fa0-ea8566c62ef4";
const LEGACY_FIRTH_OF_LORN = "73849d2d-5faf-4d15-acb5-c3c29e655a3a";
const expected = [
	{
		locationId:"98553f02-f25a-4789-9f9a-ee41395e1e8c",
		image:"IMG_5394.jpeg",
		turns:[["Flood begins to enter Loch Feochan","-235"],["Ebb begins","0"]],
	},
	{
		locationId:"c0af534c-269b-40c6-952c-c7b37aaa6a32",
		image:"IMG_5393.jpeg",
		turns:[["Progressive turn to northeast-going setting","+270"],["Progressive turn to southwest-going setting","-115"]],
	},
];

const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

test("Segment 6A preserves nominal turns only in unavailable regime reasons", () => {
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
			assert.match(turn.offsets[regime].reason,/regime-neutral/);
			assert.ok(turn.offsets[regime].sourceIds.length >= 1);
		}
		assert.ok(gate.turns.every((turn) => turn.direction.bearingDegreesTrue.state === "unavailable"));
		assert.ok(gate.turns.every((turn) => turn.slack.spring.semantics === "unavailable" && turn.slack.neap.semantics === "unavailable"));
		assert.equal(gate.flowModel.kind,"unavailable");
		assert.equal(gate.regimeInterpolation.kind,"unavailable");
		assert.deepEqual(gate.rateObservations,[]);
	}
});

test("Loch Feochan keeps asymmetric duration and spring/neap rates non-operational", () => {
	const gate = definitions.gates.find((entry) => entry.locationId === expected[0].locationId);
	assert.match(gate.turns[0].offsets.neap.reason,/less pronounced at neaps/);
	assert.match(gate.turns[1].offsets.spring.reason,/HW Oban \(0 min\)/);
	const duration = gate.uncertainty.find((entry) => entry.id === "asymmetric-duration-not-a-flow-model");
	const rates = gate.uncertainty.find((entry) => entry.id === "spring-neap-rates-not-turn-locus-qualified");
	assert.match(duration.summary,/flood runs for just four hours.*ebb continues until two hours after LW.*no regime-complete turn\/slack series.*operational model/);
	assert.match(rates.summary,/spring 5 kn and neap 3 kn.*without explicitly assigning.*flood or ebb.*precise entrance locus.*peak semantic.*per-turn observation/);
	assert.equal(duration.blocking,true);
	assert.equal(rates.blocking,true);
	assert.ok(gate.cautions.some((entry) => entry.id === "entrance-shoal-delay" && entry.blocking));
	assert.deepEqual(gate.rateObservations,[]);
});

test("Firth of Lorn separates fairway, localized spring rates, eddy and races", () => {
	const gate = definitions.gates.find((entry) => entry.locationId === expected[1].locationId);
	assert.ok(gate.turns.every((turn) => turn.offsets.spring.reason.includes("explicitly approximate")));
	const general = gate.uncertainty.find((entry) => entry.id === "general-fairway-rate-not-turn-regime-specific");
	const garvellachs = gate.uncertainty.find((entry) => entry.id === "garvellachs-spring-rate-localized");
	const local = gate.uncertainty.find((entry) => entry.id === "fladda-easdale-loch-don-spring-rates-localized");
	assert.match(general.summary,/general 1 to 1\.5 kn.*not assigned to either progressive turn.*spring\/neap regime.*not a structured rate observation/);
	assert.match(garvellachs.summary,/spring 2 to 3 kn.*only southeast of the Garvellachs.*separately scoped eddy described only as after half-flood.*not a fairway-wide or per-turn rate/);
	assert.match(local.summary,/spring 3 kn.*between Fladda and Easdale.*similar rate off Loch Don.*separate locality observations.*no turn assignment or neap counterpart/);
	assert.ok([general,garvellachs,local].every((entry) => entry.blocking));
	assert.ok(gate.cautions.some((entry) => entry.id === "garvellachs-half-flood-eddy" && entry.blocking));
	assert.ok(gate.cautions.some((entry) => entry.id === "lismore-mull-wind-tide-races" && entry.blocking));
	assert.ok(gate.uncertainty.some((entry) => entry.id === "legacy-firth-of-lorn-conflict" && entry.blocking));
	assert.notEqual(gate.locationId,LEGACY_FIRTH_OF_LORN);
	assert.deepEqual(gate.rateObservations,[]);
});

test("Segment 6A heading index captures the two-file offset and no continuation", () => {
	const review = fs.readFileSync(path.join(__dirname,"../docs/tidal-gate-source-review-segment-6a.md"),"utf8");
	assert.match(review,/`IMG_5393\.jpeg`: \*\*6\. Firth of Lorn\*\*/);
	assert.match(review,/`IMG_5394\.jpeg`: \*\*Loch Feochan\*\*/);
	assert.match(review,/`IMG_5395\.jpeg`: \*\*Kerrera Sound\*\*/);
	assert.match(review,/`IMG_5396\.jpeg`: \*\*Oban\*\*/);
	assert.match(review,/`IMG_5397\.jpeg`: \*\*Loch Spelve\*\*/);
	assert.match(review,/`IMG_5398\.jpeg`: \*\*Lynn of Lorn\*\*/);
	assert.match(review,/Only the two target pages supply Segment 6A data.*four supporting headings.*unrelated material is not imported/s);
	assert.match(review,/no target continuation is required/g);
	assert.match(review,/minimum-depth statements are not gate\s+timing\/rate data and are not imported/s);
});

test("Segment 6A appends records without changing any prior or legacy Firth byte", () => {
	const priorGates = definitions.gates.slice(0,25);
	assert.equal(digest(priorGates),"5624fae8853cda8218f27db20919bf39839f2eac22550ef9ee8341b4162e62eb");
	assert.equal(digest(priorGates.slice(0,15)),"d645ee950dd6e6ef4651d7e8a4b0a614de995654597f005a2eabadf98f0e19fe");
	assert.equal(digest(priorGates.find((entry) => entry.locationId === LEGACY_FIRTH_OF_LORN)),"a3f1054f5c1b851483b423777403b7b64135935ae041597ae9989af3be6f6885");
});

test("Segment 6A joins are one-to-one and have zero effective operational exposure", () => {
	assert.equal(definitions.sourcePackage,"signalk-ajrm-marine-location-editor@0.6.50");
	assert.equal(new Set(expected.map((entry) => entry.locationId)).size,2);
	assert.equal(new Set(definitions.gates.map((entry) => entry.locationId)).size,39);
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
	assert.equal(gates.filter((entry) => !entry.legacy).length,24);
	assert.equal(diagnostics.valid,true);
	assert.deepEqual(diagnostics.operationalLocationIds,[]);
	assert.equal(diagnostics.summary.gateCount,39);
	assert.equal(diagnostics.summary.nonOperationalCount,39);
	for (const item of expected) {
		assert.equal(definitions.gates.filter((entry) => entry.locationId === item.locationId).length,1);
		assert.ok(diagnostics.issues.some((entry) => entry.code === "gate-not-operational" && entry.locationId === item.locationId));
		assert.equal(diagnostics.issues.some((entry) => entry.severity === "error" && entry.locationId === item.locationId),false);
	}
});
