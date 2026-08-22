/** Focused tests for the v2 gate contract, migration and effective readiness. */

const assert = require("node:assert/strict");
const test = require("node:test");
const openApi = require("../plugin/openApi.json");
const {
	GATE_CONTRACT_V2,
	catalogueDiagnostics,
	migrateGateV1ToV2,
	validateGateV2,
} = require("../plugin/gate-contract.cjs");

const known = (value) => ({ state:"known", value, sourceIds:["source-1"] });

function operationalGate(overrides = {}) {
	const turns = [
		{ id:"west-going", name:"West-going stream begins", bearing:270, springOffset:240, neapOffset:270, springSlack:20, neapSlack:30, springRate:4, neapRate:2 },
		{ id:"east-going", name:"East-going stream begins", bearing:90, springOffset:-120, neapOffset:-90, springSlack:10, neapSlack:15, springRate:5, neapRate:3 },
	];
	return {
		contract:GATE_CONTRACT_V2,
		contractVersion:2,
		revision:1,
		locationId:"gate",
		conventions:{ offsetSign:"positive-after-reference-event", directionBearing:"degrees-true-current-towards" },
		reference:{ portLocationId:"port", event:"HW", sourceIds:["source-1"] },
		flowModel:{ kind:"sinusoidal-between-turns-v1", peakTiming:"midpoint-between-turns", zeroAtTurns:true },
		regimeInterpolation:{ kind:"linear-reference-range-v1", rangePairing:"preceding-opposite-event", outOfRange:"unavailable" },
		turns:turns.map((entry) => ({
			id:entry.id,
			name:entry.name,
			direction:{ label:entry.name.replace(" stream begins",""), bearingDegreesTrue:known(entry.bearing) },
			offsets:{ unit:"minutes", spring:known(entry.springOffset), neap:known(entry.neapOffset) },
			slack:{ unit:"minutes", spring:{ semantics:"total-centered-on-turn", total:known(entry.springSlack) }, neap:{ semantics:"total-centered-on-turn", total:known(entry.neapSlack) } },
		})),
		rateObservations:turns.flatMap((entry) => [["spring",entry.springRate],["neap",entry.neapRate]].map(([regime,rate]) => ({
			id:`${entry.id}-${regime}`,
			kind:"phase-peak",
			turnId:entry.id,
			regime,
			locality:{ scope:"gate", locationId:"gate" },
			unit:"kn",
			qualifier:"exact",
			reportedValue:known(rate),
			lowerBound:known(rate),
			upperBound:known(rate),
		}))),
		provenance:{
			sources:[{ id:"source-1",kind:"pilot-book",title:"Test publication",publisher:"Test publisher",edition:"2026",page:"10",imageRef:"review-image-1",url:null,retrievedAt:"2026-08-22T12:00:00.000Z" }],
			review:{ state:"reviewed",reviewedBy:"Test reviewer",reviewedAt:"2026-08-22T13:00:00.000Z",notes:null },
		},
		cautions:[],
		hazards:[],
		uncertainty:[],
		readiness:{ state:"operational",reasons:[] },
		...overrides,
	};
}

function legacyGate(overrides = {}) {
	return {
		contract:"ajrm-tidal-gate-constants-v1",locationId:"gate",name:"Legacy gate",
		standardPortRef:"/resources/locations/port",floodSet:"W",ebbSet:"E",
		springPeakFlowKnots:4,neapPeakFlowKnots:null,
		floodSpringAfter:"1:00:30",floodNeapAfter:"",ebbSpringAfter:"-0:30:00",ebbNeapAfter:"0:99:00",
		floodSpringSlack:"0:00:00",floodNeapSlack:"",ebbSpringSlack:"0:10:00",ebbNeapSlack:"0:20:00",
		source:"Legacy user citation",...overrides,
	};
}

function definitions(gate = operationalGate(), portOverrides = {}) {
	return {
		ports:[{ locationId:"port",name:"Port",kind:"standard",referenceLevels:{ mhws:4,mhwn:3,mlwn:2,mlws:1 },prediction:{ mode:"provider",providerId:"provider",stationId:"station" },...portOverrides }],
		areas:[],gates:[gate],
	};
}

const locations = [
	{ id:"gate",name:"Gate",types:["tidalGate"] },
	{ id:"port",name:"Port",types:["tidalStandardPort"] },
	{ id:"spatial-only",name:"Spatial only",types:["tidalGate"] },
];

test("v1 migration preserves explicit zero, keeps missing values unknown and claims no bearing or directional rate", () => {
	const original = legacyGate();
	const migrated = migrateGateV1ToV2(original);
	assert.equal(migrated.turns[0].offsets.spring.value,60.5);
	assert.equal(migrated.turns[0].offsets.neap.state,"unknown");
	assert.equal(migrated.turns[1].offsets.neap.state,"unknown");
	assert.equal(migrated.turns[0].slack.spring.reported.value,0);
	assert.equal(migrated.turns[0].slack.neap.reported.state,"unknown");
	assert.equal(migrated.turns[0].direction.bearingDegreesTrue.state,"unknown");
	assert.equal(migrated.rateObservations[0].turnId,null);
	assert.equal(migrated.rateObservations[0].reportedValue.value,4);
	assert.equal(migrated.rateObservations[0].lowerBound.state,"unknown");
	assert.equal(migrated.rateObservations[1].reportedValue.state,"unknown");
	assert.equal(migrated.readiness.state,"needs-review");
	assert.ok(migrated.uncertainty.every((entry) => entry.blocking));
	assert.deepEqual(migrated.legacy.record,original);
});

test("v1 migration keeps invalid negative slack and rates non-operational without failing the catalogue", () => {
	const original = legacyGate({ springPeakFlowKnots:-1, floodSpringSlack:"-0:10:00",ebbSpringAfter:`${"9".repeat(400)}:00:00` });
	const migrated = migrateGateV1ToV2(original);
	assert.equal(migrated.rateObservations[0].reportedValue.state,"unknown");
	assert.match(migrated.rateObservations[0].reportedValue.reason,/non-negative range/);
	assert.equal(migrated.turns[0].slack.spring.reported.state,"unknown");
	assert.match(migrated.turns[0].slack.spring.reported.reason,/valid range/);
	assert.equal(migrated.turns[1].offsets.spring.state,"unknown");
	assert.match(migrated.turns[1].offsets.spring.reason,/finite numeric range/);
	assert.equal(migrated.readiness.state,"needs-review");
	assert.deepEqual(migrated.legacy.record,original);
});

test("v1 migration accepts only the documented resource reference shape", () => {
	assert.throws(() => migrateGateV1ToV2(legacyGate({ standardPortRef:"port" })),/reference-port/);
	assert.throws(() => migrateGateV1ToV2(legacyGate({ standardPortRef:"/resources/locations/port/extra" })),/reference-port/);
});

test("a fully sourced, reviewed and explicit v2 record can declare operational readiness", () => {
	const gate = validateGateV2(operationalGate());
	assert.equal(gate.readiness.state,"operational");
	assert.equal(gate.turns[1].direction.bearingDegreesTrue.value,90);
});

test("operational readiness rejects unknown data, approximate scalar rates and blocking uncertainty", () => {
	let gate = operationalGate();
	gate.turns[0].offsets.neap = { state:"unknown" };
	assert.throws(() => validateGateV2(gate),/cannot be operational/);
	gate = operationalGate();
	gate.rateObservations[0].qualifier="approximate";
	assert.throws(() => validateGateV2(gate),/cannot be operational/);
	gate = operationalGate({ uncertainty:[{ id:"review-blocker",summary:"Pending verification",sourceIds:["source-1"],blocking:true }] });
	assert.throws(() => validateGateV2(gate),/blocking-uncertainty/);
	gate = operationalGate({ hazards:[{ id:"hazard-blocker",summary:"Operational use is blocked",sourceIds:["source-1"],blocking:true }] });
	assert.throws(() => validateGateV2(gate),/blocking-hazards/);
	gate = operationalGate({ cautions:[{ id:"unsourced-note",summary:"Needs evidence",sourceIds:[] }] });
	assert.throws(() => validateGateV2(gate),/meaningful-source-required/);
});

test("operational none slack is an explicitly sourced assertion", () => {
	let gate = operationalGate();
	gate.turns[0].slack.spring = { semantics:"none" };
	assert.throws(() => validateGateV2(gate),/slack-none-source-required/);
	gate = operationalGate();
	gate.turns[0].slack.spring = { semantics:"none",sourceIds:["source-1"] };
	assert.equal(validateGateV2(gate).readiness.state,"operational");
});

test("shape and qualifier validation reject implicit units and contradictory bounds", () => {
	let gate = operationalGate({ readiness:{ state:"reference-only",reasons:["bounded-rate"] } });
	gate.turns[0].offsets.unit="hours";
	assert.throws(() => validateGateV2(gate),/minutes/);
	gate = operationalGate({ readiness:{ state:"reference-only",reasons:["bounded-rate"] } });
	const rate=gate.rateObservations[0];
	rate.qualifier="up-to";
	rate.lowerBound=known(1);
	assert.throws(() => validateGateV2(gate),/up-to/);
	gate = operationalGate({ readiness:{ state:"reference-only",reasons:["outside-range"] } });
	gate.regimeInterpolation.outOfRange="clamp";
	assert.throws(() => validateGateV2(gate),/does not clamp or extrapolate/);
});

test("catalogue diagnostics compute effective readiness from joins and port capability", () => {
	let result = catalogueDiagnostics(definitions(),locations);
	assert.deepEqual(result.operationalLocationIds,["gate"]);
	assert.equal(result.summary.operationalCount,1);
	assert.equal(result.summary.locationGateCount,2);
	assert.ok(result.issues.some((entry) => entry.code==="gate-definition-missing" && entry.locationId==="spatial-only"));
	result = catalogueDiagnostics(definitions(operationalGate(),{ referenceLevels:null }),locations);
	assert.deepEqual(result.operationalLocationIds,[]);
	assert.ok(result.issues.some((entry) => entry.code==="reference-port-levels-unavailable"));
	result = catalogueDiagnostics(definitions(),[],"Location Editor is unavailable.");
	assert.deepEqual(result.operationalLocationIds,[]);
	assert.equal(result.valid,false);
});

test("catalogue diagnostics reject a supplied named-locality Location id that does not join", () => {
	const gate = operationalGate();
	gate.rateObservations.push({
		...structuredClone(gate.rateObservations[0]),
		id:"named-locality",
		locality:{ scope:"named",label:"Nearby narrows",locationId:"missing-locality" },
	});
	const result = catalogueDiagnostics(definitions(gate),locations);
	assert.deepEqual(result.operationalLocationIds,[]);
	assert.ok(result.issues.some((entry) => entry.code === "rate-locality-location-missing" && entry.locationId === "gate"));
});

test("OpenAPI strict unions mirror runtime structural validation", () => {
	const schemas = openApi.components.schemas;
	assert.ok(schemas.ExplicitMeasurement.oneOf.every((entry) => entry.additionalProperties === false));
	assert.ok(schemas.SlackValue.oneOf.every((entry) => entry.additionalProperties === false));
	assert.ok(schemas.SlackValue.oneOf.find((entry) => entry.properties.semantics.enum.includes("none")).properties.sourceIds);
	assert.ok(schemas.TidalGateV2.properties.flowModel.oneOf.every((entry) => entry.additionalProperties === false));
	assert.ok(schemas.TidalGateV2.properties.regimeInterpolation.oneOf.every((entry) => entry.additionalProperties === false));
	assert.ok(schemas.RateObservation.properties.locality.oneOf.every((entry) => entry.additionalProperties === false));
	assert.ok(schemas.ProvenanceSource.oneOf.every((entry) => entry.additionalProperties === false));
	assert.equal(schemas.TidalGateV2.additionalProperties,false);

	let gate = operationalGate({ readiness:{ state:"reference-only",reasons:["shape-test"] } });
	gate.turns[0].offsets.spring.extra = true;
	assert.throws(() => validateGateV2(gate),/not part of the v2 contract/);
	gate = operationalGate({ readiness:{ state:"reference-only",reasons:["shape-test"] } });
	gate.turns[0].offsets.spring.reason = "Contradicts a known value";
	assert.throws(() => validateGateV2(gate),/not part of the v2 contract/);
	gate = operationalGate({ readiness:{ state:"reference-only",reasons:["shape-test"] },flowModel:{ kind:"sinusoidal-between-turns-v1" } });
	assert.throws(() => validateGateV2(gate),/must explicitly peak/);
	gate = operationalGate({ readiness:{ state:"reference-only",reasons:["shape-test"] } });
	gate.provenance.sources[0].legacyText = "Not allowed on a structured source";
	assert.throws(() => validateGateV2(gate),/not part of the v2 contract/);
	gate = operationalGate({ readiness:{ state:"reference-only",reasons:["shape-test"] } });
	gate.rateObservations[0].locality.label = "Conflicting named locality";
	assert.throws(() => validateGateV2(gate),/not part of the v2 contract/);
});

module.exports = { operationalGate };
