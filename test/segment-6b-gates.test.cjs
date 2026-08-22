/** Verifies Segment 6B's positive v2 assessment and fail-closed source scoping. */

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const definitions = require("../defaults/tidal-definitions.json");
const { catalogueDiagnostics, normalizeGate, validateGateV2 } = require("../plugin/gate-contract.cjs");

const OBAN = "e0e5661f-1675-4dbb-8fa0-ea8566c62ef4";
const LEGACY_CUAN = "0b9ecfef-3260-4f1e-a41f-5f2fdf7dfbec";
const LEGACY_GREY_DOGS = "6bb68eda-0423-46e9-9f9a-2c309ee7cf0b";
const expected = [
	{
		locationId:"5270b58c-5b74-4a30-92ea-e8de3050f024",
		image:"IMG_5392.jpeg",
		turns:[
			{ name:"Flood begins westwards", direction:"Flood / west-going stream", spring:"+270 min", neap:"+315 min" },
			{ name:"Ebb begins eastwards", direction:"Ebb / east-going stream", spring:"-105 min", neap:"-60 min" },
		],
	},
	{
		locationId:"a3df95d7-a216-476b-a10f-1d8909810c47",
		image:"IMG_5391.jpeg",
		turns:[
			{ name:"Flood begins westwards", direction:"Flood / west-going stream", spring:"+270 min", neap:"+315 min" },
			{ name:"Ebb begins eastwards", direction:"Ebb / east-going stream", spring:"-105 min", neap:"-60 min" },
		],
	},
];

const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

test("Segment 6B keeps every approximate regime beginning unavailable", () => {
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
		assert.deepEqual(gate.turns.map((turn) => turn.name),item.turns.map((turn) => turn.name));
		for (const [index,turn] of gate.turns.entries()) {
			assert.equal(turn.direction.label,item.turns[index].direction);
			assert.doesNotMatch(turn.direction.label,/north|south/i);
			assert.equal(turn.direction.bearingDegreesTrue.state,"unavailable");
			for (const regime of ["spring","neap"]) {
				assert.equal(turn.offsets[regime].state,"unavailable");
				assert.ok(turn.offsets[regime].reason.includes(item.turns[index][regime]));
				assert.match(turn.offsets[regime].reason,/about|approximate/);
				assert.ok(turn.offsets[regime].sourceIds.length >= 2);
			}
		}
		assert.equal(gate.flowModel.kind,"unavailable");
		assert.equal(gate.regimeInterpolation.kind,"unavailable");
		assert.deepEqual(gate.rateObservations,[]);
	}
});

test("Cuan retains rate locality and missing slack without copying either into turns", () => {
	const gate = definitions.gates.find((entry) => entry.locationId === expected[0].locationId);
	assert.ok(gate.turns.every((turn) => turn.slack.spring.semantics === "unavailable" && turn.slack.neap.semantics === "unavailable"));
	assert.ok(gate.turns.every((turn) => !Object.hasOwn(turn.slack.spring,"total") && !Object.hasOwn(turn.slack.neap,"total")));
	const rates = gate.uncertainty.find((entry) => entry.id === "western-part-rates-not-complete-turn-observations");
	assert.match(rates.summary,/western part.*spring rate of 7 kn explicitly in both directions.*neap rate up to 5 kn without expressly repeating the both-directions scope.*not copied into exact gate-local per-turn rate observations/);
	assert.ok(rates.blocking);
	assert.ok(gate.cautions.some((entry) => entry.id === "western-part-eddies-near-an-cleiteadh" && entry.blocking));
	assert.ok(gate.cautions.some((entry) => entry.id === "passage-with-or-against-tide-warning" && entry.blocking));
	assert.deepEqual(gate.rateObservations,[]);
});

test("Grey Dogs keeps passage slack and conflicting rates out of turn machine values", () => {
	const gate = definitions.gates.find((entry) => entry.locationId === expected[1].locationId);
	for (const turn of gate.turns) {
		assert.equal(turn.slack.spring.semantics,"unavailable");
		assert.match(turn.slack.spring.reason,/passage-level 15-minute spring.*does not assign it to this turn.*centred versus before\/after/);
		assert.equal(turn.slack.neap.semantics,"unavailable");
		assert.match(turn.slack.neap.reason,/passage-level 60-minute neap.*does not assign it to this turn.*centred versus before\/after/);
		for (const regime of ["spring","neap"]) {
			assert.equal(Object.hasOwn(turn.slack[regime],"total"),false);
			assert.equal(Object.hasOwn(turn.slack[regime],"before"),false);
			assert.equal(Object.hasOwn(turn.slack[regime],"after"),false);
		}
	}
	assert.match(gate.uncertainty.find((entry) => entry.id === "turn-beginnings-approximate-and-locally-unpredictable").summary,/within an hour either side/);
	assert.match(gate.uncertainty.find((entry) => entry.id === "passage-rates-not-turn-locus-records").summary,/8\.5 kn at springs and 6\.5 kn at neaps on flood and ebb.*not copied into both turn directions/);
	assert.match(gate.uncertainty.find((entry) => entry.id === "spring-rate-wording-conflict").summary,/about 8 kn.*8\.5 kn springs.*no exact structured spring maximum/);
	assert.ok(gate.cautions.some((entry) => entry.id === "eddies-standing-waves-and-loss-of-control" && entry.blocking));
	assert.ok(gate.cautions.some((entry) => entry.id === "ebb-sets-toward-islets" && entry.blocking));
	assert.ok(gate.cautions.some((entry) => entry.id === "quiet-weather-near-slack-only" && entry.blocking));
	assert.deepEqual(gate.rateObservations,[]);
});

test("Segment 6B records every failed positive operational requirement", () => {
	const required = {
		[expected[0].locationId]:[
			"spring-neap-beginnings-explicitly-approximate",
			"named-channel-point-not-western-rate-locus",
			"west-east-labels-not-true-bearings",
			"cuan-neap-rate-not-explicitly-per-direction",
			"rate-observations-not-exact-gate-local-per-turn",
			"slack-not-stated",
			"flow-model-not-stated",
			"regime-interpolation-not-stated",
			"structured-publication-citation-incomplete",
		],
		[expected[1].locationId]:[
			"turn-beginnings-explicitly-approximate-and-locally-unpredictable",
			"named-channel-point-not-exact-turn-slack-rate-locus",
			"west-east-labels-not-true-bearings",
			"passage-slack-periods-not-assigned-to-individual-turns",
			"slack-placement-before-after-centred-not-stated",
			"passage-wide-rates-not-copied-to-turns",
			"spring-rate-eight-versus-eight-and-a-half-conflict",
			"rate-observations-not-exact-gate-local-per-turn",
			"flow-model-not-stated",
			"regime-interpolation-not-stated",
			"structured-publication-citation-incomplete",
		],
	};
	for (const item of expected) {
		const gate = definitions.gates.find((entry) => entry.locationId === item.locationId);
		assert.equal(gate.readiness.state,"reference-only");
		for (const reason of required[item.locationId]) assert.ok(gate.readiness.reasons.includes(reason),reason);
	}
});

test("Segment 6B heading index records only target evidence and the failed continuation check", () => {
	const review = fs.readFileSync(path.join(__dirname,"../docs/tidal-gate-source-review-segment-6b.md"),"utf8");
	assert.match(review,/`IMG_5392\.jpeg`: \*\*Cuan Sound\*\*/);
	assert.match(review,/`IMG_5391\.jpeg`: \*\*Grey Dogs\*\*/);
	assert.match(review,/`IMG_5390\.jpeg` and `IMG_5393\.jpeg` were checked only because.*Neither contains a\s+Grey Dogs continuation, and no unrelated material was imported/s);
	assert.match(review,/HW interpretation reuses the notation key.*Segment 3B.*older image was not reopened/s);
	assert.match(review,/positive.*operational-eligibility assessment/is);
});

test("Segment 6B preserves every prior gate plus legacy Cuan timing, port and area byte", () => {
	const priorGates = definitions.gates.slice(0,27);
	assert.equal(digest(priorGates),"1286f1cace6e572a78ea2f726dc89376a02501e791a2e42fa79b0a784d59c664");
	assert.equal(digest(priorGates.slice(0,15)),"d645ee950dd6e6ef4651d7e8a4b0a614de995654597f005a2eabadf98f0e19fe");
	assert.equal(digest(priorGates.find((entry) => entry.locationId === LEGACY_CUAN)),"5daaa7b3b9080f6c3dde24604d80f1f77bb6c22191c9bf2b073bd42ee2cfd0f2");
	assert.equal(digest(definitions.ports.find((entry) => entry.locationId === LEGACY_CUAN)),"96c3aa2b0b4f8bbec9d70326a8cdcb3b8bb47867c0fd0597f451b605748828e7");
	assert.equal(digest(definitions.areas.find((entry) => entry.locationId === "8889a579-1cf6-4ca3-a217-6413a6d4921a")),"cb5520aded5f565349f9471707dfa388a2a6128c623ab356c92bfa05d5e1d4db");
	assert.equal(definitions.gates.some((entry) => entry.locationId === LEGACY_GREY_DOGS),false);
});

test("Segment 6B joins are one-to-one and have zero effective operational exposure", () => {
	assert.equal(definitions.sourcePackage,"signalk-ajrm-marine-location-editor@0.6.48");
	assert.equal(new Set(expected.map((entry) => entry.locationId)).size,2);
	assert.equal(new Set([...expected.map((entry) => entry.locationId),LEGACY_CUAN,LEGACY_GREY_DOGS]).size,4);
	assert.equal(new Set(definitions.gates.map((entry) => entry.locationId)).size,30);
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
	assert.equal(gates.filter((entry) => !entry.legacy).length,15);
	assert.equal(diagnostics.valid,true);
	assert.deepEqual(diagnostics.operationalLocationIds,[]);
	assert.equal(diagnostics.summary.gateCount,30);
	assert.equal(diagnostics.summary.nonOperationalCount,30);
	for (const item of expected) {
		assert.ok(diagnostics.issues.some((entry) => entry.code === "gate-not-operational" && entry.locationId === item.locationId));
		assert.equal(diagnostics.issues.some((entry) => entry.severity === "error" && entry.locationId === item.locationId),false);
	}
});
