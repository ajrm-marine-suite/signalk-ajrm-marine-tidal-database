/** Verifies Segment 7A's Corryvreckan evidence and fail-closed eligibility. */

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const definitions = require("../defaults/tidal-definitions.json");
const {
	catalogueDiagnostics,
	normalizeGate,
	operationalReadinessIssues,
	validateGateV2,
} = require("../plugin/gate-contract.cjs");

const OBAN = "e0e5661f-1675-4dbb-8fa0-ea8566c62ef4";
const LEGACY_CORRYVRECKAN = "c21dcbcc-41bf-4ad0-9db9-7697c92c7bcb";
const NATIVE_CORRYVRECKAN = "2bb1ebac-58eb-41d1-8b78-ef6e4494baf4";
const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const gate = definitions.gates.find((entry) => entry.locationId === NATIVE_CORRYVRECKAN);

test("Segment 7A preserves the source's regimes and directions without inventing operational values", () => {
	assert.ok(gate);
	assert.equal(gate.contract,"ajrm-tidal-gate-constants-v2");
	assert.equal(Object.hasOwn(gate,"name"),false);
	assert.equal(validateGateV2(gate).readiness.state,"reference-only");
	assert.deepEqual(gate.reference,{
		portLocationId:OBAN,
		event:"HW",
		sourceIds:["img-5389-corryvreckan-tides","img-5408-hw-notation"],
	});
	assert.deepEqual(gate.turns.map((turn) => [turn.id,turn.name,turn.direction.label]),[
		["flood-west-going","Flood begins westwards","Flood / west-going stream"],
		["ebb-east-going","Ebb begins eastwards","Ebb / east-going stream"],
	]);
	const expected = [
		{ turn:gate.turns[0],spring:"+270 min",neap:"+315 min" },
		{ turn:gate.turns[1],spring:"-105 min",neap:"-60 min" },
	];
	for (const item of expected) {
		assert.equal(item.turn.direction.bearingDegreesTrue.state,"unavailable");
		assert.match(item.turn.direction.bearingDegreesTrue.reason,/no true current-towards bearing/);
		for (const regime of ["spring","neap"]) {
			assert.equal(item.turn.offsets[regime].state,"unavailable");
			assert.ok(item.turn.offsets[regime].reason.includes(item[regime]));
			assert.match(item.turn.offsets[regime].reason,/average.*strong west winds.*advance timing considerably.*no exact turn instant or precision bound/);
		}
	}
	assert.equal(gate.flowModel.kind,"unavailable");
	assert.equal(gate.regimeInterpolation.kind,"unavailable");
	assert.deepEqual(gate.rateObservations,[]);
});

test("Corryvreckan slack remains passage-level context and is never copied into either turn", () => {
	for (const turn of gate.turns) {
		assert.equal(turn.slack.spring.semantics,"unavailable");
		assert.match(turn.slack.spring.reason,/passage-level 15-minute spring.*does not assign it to this turn.*total-centred versus before\/after/);
		assert.equal(turn.slack.neap.semantics,"unavailable");
		assert.match(turn.slack.neap.reason,/passage-level 60-minute neap.*does not assign it to this turn.*total-centred versus before\/after/);
		for (const regime of ["spring","neap"]) {
			assert.equal(Object.hasOwn(turn.slack[regime],"total"),false);
			assert.equal(Object.hasOwn(turn.slack[regime],"before"),false);
			assert.equal(Object.hasOwn(turn.slack[regime],"after"),false);
		}
	}
	const slack = gate.uncertainty.find((entry) => entry.id === "passage-slack-periods-not-turn-placed");
	assert.match(slack.summary,/15 minutes at springs and 60 minutes at neaps.*does not assign either to an individual turn.*centred, before or after/);
	assert.ok(slack.blocking);
});

test("Corryvreckan rates and hazards retain their exact direction and locality scope", () => {
	const rates = gate.uncertainty.find((entry) => entry.id === "mid-channel-rates-not-turn-locus-records");
	assert.match(rates.summary,/both flood and ebb reach 8\.5 kn at springs and 6\.5 kn at neaps in mid-channel within the first two hours/);
	assert.match(rates.summary,/not copied into both turn records.*broad OS name point.*exact gate-local observations/);
	assert.ok(rates.blocking);
	assert.deepEqual(gate.rateObservations,[]);
	const flood = gate.hazards.find((entry) => entry.id === "flood-shelf-overfalls-and-westerly-swell");
	assert.match(flood.summary,/For the flood.*shelf overfall southwest of Camas nam Bairneach.*westerly swell/);
	assert.doesNotMatch(flood.summary,/For the ebb/);
	const ebb = gate.hazards.find((entry) => entry.id === "ebb-shelf-turbulence-after-westerlies");
	assert.match(ebb.summary,/For the ebb.*less severe than on flood.*dangerous overfalls.*strong westerly winds/);
	const general = gate.hazards.find((entry) => entry.id === "current-eddy-boundaries-and-whirlpool");
	assert.match(general.summary,/strong current.*eddy boundaries.*wind opposes stream.*whirlpool.*29-metre least-depth rock/);
	for (const hazard of gate.hazards) {
		assert.deepEqual(hazard.sourceIds,["img-5389-corryvreckan-tides"]);
		assert.equal(hazard.blocking,true);
	}
});

test("Segment 7A records the complete positive eligibility failure list", () => {
	assert.deepEqual(gate.readiness,{
		state:"reference-only",
		reasons:[
			"average-turn-beginnings-have-no-exact-precision",
			"named-sea-point-not-exact-turn-slack-rate-overfall-whirlpool-locus",
			"west-east-labels-not-true-bearings",
			"passage-slack-periods-not-assigned-to-individual-turns",
			"slack-placement-before-after-centred-not-stated",
			"mid-channel-both-direction-rates-not-copied-to-turns",
			"rate-observations-not-exact-gate-local-per-turn",
			"flow-model-not-stated",
			"regime-interpolation-not-stated",
			"structured-publication-citation-incomplete",
			"directions-paragraph-incomplete-in-provided-photographs",
			"flood-ebb-overfall-whirlpool-eddy-wind-hazards-not-operationally-modelled",
		],
	});
	const issues = operationalReadinessIssues(gate);
	for (const required of [
		"meaningful-structured-source-required",
		"reference-event-source-required",
		"blocking-cautions",
		"blocking-hazards",
		"blocking-uncertainty",
		"unsupported-or-unknown-flow-model",
		"unsupported-or-unknown-regime-interpolation",
		"turn:flood-west-going:direction-unknown",
		"turn:flood-west-going:spring-needs-one-usable-gate-peak-rate",
		"turn:ebb-east-going:neap-slack-not-operational",
	]) assert.ok(issues.includes(required),required);
	assert.throws(() => validateGateV2({
		...structuredClone(gate),
		readiness:{ state:"operational",reasons:[] },
	}),/cannot be operational/);
});

test("Segment 7A's visible heading index excludes Sound of Luing and Grey Dogs", () => {
	const review = fs.readFileSync(path.join(__dirname,"../docs/tidal-gate-source-review-segment-7a.md"),"utf8");
	assert.match(review,/`IMG_5389\.jpeg`: \*\*Gulf of Corryvreckan\*\*.*page 60/s);
	assert.match(review,/`IMG_5390\.jpeg`: \*\*Sound of Luing\*\*.*excluded/s);
	assert.match(review,/`IMG_5391\.jpeg`: \*\*Grey Dogs\*\*.*excluded/s);
	assert.match(review,/Directions paragraph is clipped.*Neither adjacent image.*continues the clipped Corryvreckan Directions paragraph/is);
	assert.match(review,/HW interpretation reuses the notation key.*older image was not reopened/is);
	assert.match(review,/positive.*operational-eligibility assessment/is);
});

test("Segment 7A preserves every prior gate and the conflicting Corryvreckan v1 object", () => {
	const priorGates = definitions.gates.slice(0,29);
	assert.equal(digest(priorGates),"ca285bf17774498bd7cf175573de8e33f35e3715529b5928c8e20a604b429386");
	assert.equal(digest(priorGates.slice(0,15)),"d645ee950dd6e6ef4651d7e8a4b0a614de995654597f005a2eabadf98f0e19fe");
	const legacy = priorGates.find((entry) => entry.locationId === LEGACY_CORRYVRECKAN);
	assert.equal(digest(legacy),"10a0e1fd8349479e40083733ff30e621af11f8295f1e499c04e688f6104cf5b8");
	assert.deepEqual({
		floodSet:legacy.floodSet,
		ebbSet:legacy.ebbSet,
		springPeakFlowKnots:legacy.springPeakFlowKnots,
		neapPeakFlowKnots:legacy.neapPeakFlowKnots,
		floodSpringAfter:legacy.floodSpringAfter,
		floodNeapAfter:legacy.floodNeapAfter,
		floodSpringSlack:legacy.floodSpringSlack,
		floodNeapSlack:legacy.floodNeapSlack,
		ebbSpringAfter:legacy.ebbSpringAfter,
		ebbNeapAfter:legacy.ebbNeapAfter,
		ebbSpringSlack:legacy.ebbSpringSlack,
		ebbNeapSlack:legacy.ebbNeapSlack,
	}, {
		floodSet:"W",ebbSet:"E",springPeakFlowKnots:8.5,neapPeakFlowKnots:4,
		floodSpringAfter:"4:10:00",floodNeapAfter:"4:10:00",
		floodSpringSlack:"0:12:00",floodNeapSlack:"0:40:00",
		ebbSpringAfter:"-2:10:00",ebbNeapAfter:"-2:10:00",
		ebbSpringSlack:"0:12:00",ebbNeapSlack:"0:40:00",
	});
	const normalizedLegacy = normalizeGate(legacy);
	assert.equal(digest(normalizedLegacy),"0525709b250e87a5fde062089500b2f5c9b471604646a4781fe03f8935ecf35b");
	assert.equal(digest(normalizedLegacy.legacy.record),"10a0e1fd8349479e40083733ff30e621af11f8295f1e499c04e688f6104cf5b8");
	assert.equal(digest(definitions.ports),"4832fc46950e1f5acbaf58fab9985487b88101ea03c9399570385fe02ac244f4");
	assert.equal(digest(definitions.areas),"6ee4406b43b66a39b45949a3bb8da3e6d5aa1ac1386b8b4efaf41d0d56901315");
});

test("Corryvreckan joins one-to-one with zero unsafe operational exposure", () => {
	assert.equal(definitions.sourcePackage,"signalk-ajrm-marine-location-editor@0.6.49");
	assert.equal(new Set([LEGACY_CORRYVRECKAN,NATIVE_CORRYVRECKAN]).size,2);
	assert.equal(definitions.gates.filter((entry) => entry.locationId === LEGACY_CORRYVRECKAN).length,1);
	assert.equal(definitions.gates.filter((entry) => entry.locationId === NATIVE_CORRYVRECKAN).length,1);
	assert.equal(new Set(definitions.gates.map((entry) => entry.locationId)).size,32);
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
	assert.equal(gates.filter((entry) => !entry.legacy).length,17);
	assert.equal(diagnostics.valid,true);
	assert.deepEqual(diagnostics.operationalLocationIds,[]);
	assert.deepEqual(diagnostics.summary,{
		gateCount:32,
		declaredOperationalCount:0,
		operationalCount:0,
		nonOperationalCount:32,
		legacyMigrationCount:15,
		locationGateCount:32,
		errorCount:0,
		warningCount:47,
	});
	assert.ok(diagnostics.issues.some((entry) => entry.code === "gate-not-operational" && entry.locationId === NATIVE_CORRYVRECKAN));
	assert.equal(diagnostics.issues.some((entry) => entry.severity === "error" && entry.locationId === NATIVE_CORRYVRECKAN),false);
});
