/** Verifies Segment 7B's source-scoped evidence and fail-closed eligibility. */

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const definitions = require("../defaults/tidal-definitions.json");
const locationFixture = require("./fixtures/location-editor-0.6.49-segment-7b.json");
const {
	catalogueDiagnostics,
	normalizeGate,
	operationalReadinessIssues,
	validateGateV2,
} = require("../plugin/gate-contract.cjs");

const OBAN = "e0e5661f-1675-4dbb-8fa0-ea8566c62ef4";
const LEGACY_LUING = "79d09bf4-933b-4834-a835-177c9a53400c";
const LEGACY_DORUS = "9d4cf5a6-7fd3-49e7-b486-d9ac16b6ff67";
const NATIVE_LUING = "53ae1e7e-ec00-40f7-ab23-784644740f0b";
const NATIVE_DORUS = "83192cc1-65da-4abc-b4ae-51c6c4ab54ad";
const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const gate = (id) => definitions.gates.find((entry) => entry.locationId === id);

test("Segment 7B preserves attributable beginnings without inventing operational timing or bearings", () => {
	const cases = [
		{
			id:NATIVE_LUING,
			source:"img-5390-sound-of-luing-tides",
			turns:[
				["flood-north-going","Flood begins northwards","Flood / north-going stream","+270 min","+315 min"],
				["ebb-south-going","Ebb begins southwards","Ebb / south-going stream","-105 min","-60 min"],
			],
			timing:/on average.*no exact turn instant or precision bound/,
			direction:/no true current-towards bearing/,
		},
		{
			id:NATIVE_DORUS,
			source:"img-5387-5388-dorus-mor-section",
			turns:[
				["flood-north-or-west-going","Flood begins northwards or westwards","Flood / north- or west-going stream","+270 min","+315 min"],
				["ebb-south-or-east-going","Ebb begins southwards or eastwards","Ebb / south- or east-going stream","-105 min","-60 min"],
			],
			timing:/prolonged strong west winds.*advance.*considerably.*no exact turn instant, correction or precision bound/,
			direction:/no true current-towards bearing.*191 and 151 degree values.*clearing-mark instructions, not the stream/,
		},
	];
	for (const item of cases) {
		const record = gate(item.id);
		assert.ok(record,item.id);
		assert.equal(record.contract,"ajrm-tidal-gate-constants-v2");
		assert.equal(Object.hasOwn(record,"name"),false);
		assert.equal(validateGateV2(record).readiness.state,"reference-only");
		assert.deepEqual(record.reference,{
			portLocationId:OBAN,
			event:"HW",
			sourceIds:[item.source,"img-5408-hw-notation"],
		});
		assert.deepEqual(record.turns.map((turn) => [turn.id,turn.name,turn.direction.label]),item.turns.map((turn) => turn.slice(0,3)));
		for (let index = 0; index < record.turns.length; index += 1) {
			const turn = record.turns[index];
			assert.equal(turn.direction.bearingDegreesTrue.state,"unavailable");
			assert.match(turn.direction.bearingDegreesTrue.reason,item.direction);
			for (const [regime,valueIndex] of [["spring",3],["neap",4]]) {
				assert.equal(turn.offsets[regime].state,"unavailable");
				assert.ok(turn.offsets[regime].reason.includes(item.turns[index][valueIndex]));
				assert.match(turn.offsets[regime].reason,item.timing);
			}
		}
		assert.equal(record.flowModel.kind,"unavailable");
		assert.equal(record.regimeInterpolation.kind,"unavailable");
		assert.deepEqual(record.rateObservations,[]);
	}
});

test("Segment 7B keeps passage slack out of every individual turn", () => {
	for (const record of [gate(NATIVE_LUING),gate(NATIVE_DORUS)]) {
		for (const turn of record.turns) {
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
		const slack = record.uncertainty.find((entry) => entry.id === "passage-slack-periods-not-turn-placed");
		assert.match(slack.summary,/15 minutes at springs and 60 minutes at neaps.*does not assign either to an individual turn.*centred, before or after/);
		assert.equal(slack.blocking,true);
	}
});

test("Sound of Luing rates and hazards retain their passage and named-locality scope", () => {
	const record = gate(NATIVE_LUING);
	const rates = record.uncertainty.find((entry) => entry.id === "spatially-varying-rates-not-turn-locus-records");
	assert.match(rates.summary,/jointly to flood and ebb.*3 kn springs at Ardluing.*7 kn springs and 5 kn neaps.*islands around Fladda/);
	assert.match(rates.summary,/no Ardluing neap value.*not copied into turn records.*broad OS point.*exact gate-local observations/);
	assert.deepEqual(record.rateObservations,[]);
	const asynchronous = record.cautions.find((entry) => entry.id === "local-ebb-persists-after-mid-channel-flood");
	assert.match(asynchronous.summary,/Lunga shore.*approximately 60 minutes after the flood begins in mid-channel.*no route-specific asynchronous-turn model/);
	const race = record.hazards.find((entry) => entry.id === "flood-race-and-directional-eddies");
	assert.match(race.summary,/flood race north of Rubha Fiola.*west of Ormsa and Belnahua.*Rubha na Lic.*side changes between flood and ebb/);
	const rocks = record.hazards.find((entry) => entry.id === "southeast-entrance-drying-island-and-rocks");
	assert.match(rocks.summary,/drying Rubh Ard Luing.*rocks.*buoy\/berth instruction.*continues into the right column.*clipped outer\/lower text.*not a safe-water or clearance position/);
	const belnahua = record.hazards.find((entry) => entry.id === "clipped-belnahua-drying-obstruction");
	assert.match(belnahua.summary,/Belnahua.*extending about 3 cables.*drying 0\.3 metre.*feature and direction are clipped.*no actionable hazard geometry/);
	const directions = record.cautions.find((entry) => entry.id === "clipped-directions-course-keeping");
	assert.match(directions.summary,/overfalls and current.*set off course under sail in light winds.*right edge clips wording and locality.*no route or manoeuvring rule/);
	assert.deepEqual(record.uncertainty.find((entry) => entry.id === "named-sea-representative-not-passage-locus").sourceIds,[]);
	for (const note of [...record.cautions,...record.hazards,...record.uncertainty]) assert.equal(note.blocking,true);
});

test("Dorus Mòr rates, clearing bearings and direction-specific hazards remain correctly scoped", () => {
	const record = gate(NATIVE_DORUS);
	const rates = record.uncertainty.find((entry) => entry.id === "passage-rates-not-turn-locus-records");
	assert.match(rates.summary,/both flood and ebb reach 8 kn at springs and 6 kn at neaps.*fastest rate within the first two hours/);
	assert.match(rates.summary,/no exact rate locus.*not copied into individual turn records.*broad OS channel point/);
	assert.deepEqual(record.rateObservations,[]);
	const clearing = record.cautions.find((entry) => entry.id === "clearing-bearings-are-not-stream-bearings");
	assert.match(clearing.summary,/191 and 151 degree bearings.*clearing-mark alignments, not current-towards bearings/);
	const flood = record.hazards.find((entry) => entry.id === "flood-races-eddies-branches-and-area-turbulence");
	assert.match(flood.summary,/For the flood.*race east of Reisa Mhic Phaidean.*eddies at Craignish Point and Garbh Reisa.*Dorus Mòr, Reisa an t-Sruith and Coiresa/);
	const ebb = record.hazards.find((entry) => entry.id === "ebb-overfalls-southerly-wind-and-confused-seas");
	assert.match(ebb.summary,/For the ebb.*south side near Garbh Reisa.*southeast of Rubha na Una.*heavy northwest-entrance overfalls.*strong southerly wind/);
	const rock = record.hazards.find((entry) => entry.id === "submerged-rock-and-incomplete-clearing-marks");
	assert.match(rock.summary,/half a mile northwest of Craignish Point toward Coiresa.*0\.6 metre.*details are clipped/);
	assert.deepEqual(record.uncertainty.find((entry) => entry.id === "named-channel-representative-not-passage-locus").sourceIds,[]);
	for (const note of [...record.cautions,...record.hazards,...record.uncertainty]) assert.equal(note.blocking,true);
});

test("Segment 7B records complete stable positive-eligibility failure lists", () => {
	const expected = new Map([
		[NATIVE_LUING,[
			"average-turn-beginnings-have-no-exact-precision",
			"named-sea-point-not-exact-turn-slack-rate-eddy-race-locus",
			"north-south-labels-not-true-bearings",
			"passage-slack-periods-not-assigned-to-individual-turns",
			"slack-placement-before-after-centred-not-stated",
			"spatially-varying-passage-rates-not-copied-to-turns",
			"rate-observations-not-exact-gate-local-per-turn",
			"flow-model-not-stated",
			"regime-interpolation-not-stated",
			"structured-publication-citation-incomplete",
			"sound-of-luing-dangers-incomplete-in-provided-photograph",
			"local-ebb-persists-after-mid-channel-flood-not-modelled",
			"tidal-race-eddy-rock-and-local-flow-hazards-not-operationally-modelled",
		]],
		[NATIVE_DORUS,[
			"wind-variable-turn-beginnings-have-no-exact-precision",
			"named-channel-point-not-exact-turn-slack-rate-eddy-race-overfall-locus",
			"north-west-south-east-labels-not-true-bearings",
			"clearing-line-bearings-not-current-bearings",
			"passage-slack-periods-not-assigned-to-individual-turns",
			"slack-placement-before-after-centred-not-stated",
			"passage-wide-both-direction-rates-not-copied-to-turns",
			"rate-observations-not-exact-gate-local-per-turn",
			"flow-model-not-stated",
			"regime-interpolation-not-stated",
			"structured-publication-citation-incomplete",
			"dorus-heading-directions-and-dangers-incomplete-in-provided-photographs",
			"wind-overfall-eddy-race-rock-and-confused-sea-hazards-not-operationally-modelled",
		]],
	]);
	for (const [id,reasons] of expected) {
		const record = gate(id);
		assert.deepEqual(record.readiness,{ state:"reference-only",reasons });
		const issues = operationalReadinessIssues(record);
		for (const required of [
			"meaningful-structured-source-required",
			"reference-event-source-required",
			"blocking-cautions",
			"blocking-hazards",
			"blocking-uncertainty",
			"unsupported-or-unknown-flow-model",
			"unsupported-or-unknown-regime-interpolation",
		]) assert.ok(issues.includes(required),`${id}: ${required}`);
		assert.ok(issues.some((entry) => /:direction-unknown$/.test(entry)),id);
		assert.ok(issues.some((entry) => /:spring-slack-not-operational$/.test(entry)),id);
		assert.ok(issues.some((entry) => /:neap-needs-one-usable-gate-peak-rate$/.test(entry)),id);
		assert.throws(() => validateGateV2({
			...structuredClone(record),
			readiness:{ state:"operational",reasons:[] },
		}),/cannot be operational/);
	}
});

test("Segment 7B's heading index prevents cross-passage attribution", () => {
	const review = fs.readFileSync(path.join(__dirname,"../docs/tidal-gate-source-review-segment-7b.md"),"utf8");
	assert.match(review,/`IMG_5387\.jpeg`: visibly headed \*\*Sound of Jura – east side\*\*.*heading begins \*\*Approach to …\*\*.*does\s+not prove a complete Dorus Mòr heading/s);
	assert.match(review,/`IMG_5388\.jpeg`: begins inside a section at \*\*Tides\*\*.*attributable continuation evidence.*primary heading and page identity remain incomplete/s);
	assert.match(review,/`IMG_5389\.jpeg`: visibly headed \*\*Gulf of Corryvreckan\*\*, page 60.*excluded from Dorus Mòr evidence/s);
	assert.match(review,/`IMG_5390\.jpeg`: visibly headed \*\*Sound of Luing\*\*.*Dangers.*continues.*top of the right column.*initial Sound Directions.*paragraph beginning.*The\s+photograph….*Corryvreckan-focused and excluded.*Anchorage.*outside\s+gate evidence/is);
	assert.match(review,/133ab6989e6658c95a5ff1edbedd6e94d44af0d5677aabd420b707723a14d4bb/);
	assert.match(review,/a62ad89b095c4f2ddcbac69b2a6a11bd35d10188b9db26e3732307101cdd50da/);
	assert.match(review,/3b459d46a87b0244b2f258b6d9c590ef9c1428fac2ca5ac560582d5adfdfe60b/);
	assert.match(review,/f48eff0d2fe7eefc41399a0f97a4e08b8297bccd5484e171ddb4d977a5c8c7b2/);
	assert.match(review,/HW interpretation reuses the notation key.*older image.*not reopened for Segment 7B/is);
	assert.match(review,/Positive operational-eligibility assessment/);
	const soundSource = gate(NATIVE_LUING).provenance.sources.find((entry) => entry.id === "img-5390-sound-of-luing-tides");
	assert.deepEqual({ title:soundSource.title,publisher:soundSource.publisher,edition:soundSource.edition,page:soundSource.page,url:soundSource.url },{
		title:null,publisher:null,edition:null,page:null,url:null,
	});
	assert.match(soundSource.imageRef,/visibly headed Sound of Luing.*Dangers continue.*top of the right column.*initial Sound Directions.*paragraph beginning 'The photograph\.\.\.'.*Corryvreckan-focused and excluded.*Anchorage.*outside gate evidence/);
	const dorusSource = gate(NATIVE_DORUS).provenance.sources.find((entry) => entry.id === "img-5387-5388-dorus-mor-section");
	assert.deepEqual({ title:dorusSource.title,publisher:dorusSource.publisher,edition:dorusSource.edition,page:dorusSource.page,url:dorusSource.url },{
		title:null,publisher:null,edition:null,page:null,url:null,
	});
	assert.match(dorusSource.imageRef,/Sound of Jura - east side.*clipped new 'Approach to \.\.\.' heading.*IMG_5388.*Dorus Mòr continuation.*IMG_5389 begins separately headed Gulf of Corryvreckan page 60 and is excluded/);
});

test("Segment 7B preserves every prior gate and both legacy candidate objects byte-for-byte", () => {
	const priorGates = definitions.gates.slice(0,30);
	assert.equal(digest(priorGates),"6e677736293bcd20933e54b061663094fc1e194f47b32e38d64c6b0377edec89");
	assert.equal(digest(priorGates.slice(0,15)),"d645ee950dd6e6ef4651d7e8a4b0a614de995654597f005a2eabadf98f0e19fe");
	const legacyLuing = priorGates.find((entry) => entry.locationId === LEGACY_LUING);
	const legacyDorus = priorGates.find((entry) => entry.locationId === LEGACY_DORUS);
	assert.equal(digest(legacyLuing),"13ca0e681df8ab535f55ab23a6d66ef2c44225099644250430b443b2ef78f9a7");
	assert.equal(digest(legacyDorus),"59accfad53247e109c9cfbac825349803c61e7341bba2e8b8cae08dbd64a52e5");
	const normalizedLuing = normalizeGate(legacyLuing);
	const normalizedDorus = normalizeGate(legacyDorus);
	assert.equal(digest(normalizedLuing),"a68862b754be00441ae6a24c54506e6b8d7e1c1f204b20774e95d838a69a6221");
	assert.equal(digest(normalizedDorus),"992b14c0c9c190a6b86c8dabe09d68e3d65ef476593c29bbe4e547bbd7527a99");
	assert.equal(digest(normalizedLuing.legacy.record),digest(legacyLuing));
	assert.equal(digest(normalizedDorus.legacy.record),digest(legacyDorus));
	assert.equal(digest(definitions.ports),"f505b80ae86c86caa5875be91d37de6e1cd5f41b0f8fd319038753cf86d37efb");
	assert.equal(digest(definitions.areas),"6ee4406b43b66a39b45949a3bb8da3e6d5aa1ac1386b8b4efaf41d0d56901315");
});

test("Segment 7B joins the pinned Location export one-to-one with an empty effective allow-list", () => {
	assert.equal(definitions.sourcePackage,"signalk-ajrm-marine-location-editor@0.6.50");
	assert.equal(locationFixture.contract,"ajrm-location-editor-segment-7b-test-export-v1");
	assert.equal(locationFixture.sourcePackage,"signalk-ajrm-marine-location-editor@0.6.49");
	assert.equal(locationFixture.priorCount,309);
	assert.equal(locationFixture.priorSha256,"108da13ca8ac25d8ceebeb0313631211aa82f4288d87502b9464d47fce068192");
	assert.equal(locationFixture.catalogueCount,311);
	assert.equal(digest(locationFixture.locations),locationFixture.locationsSha256);
	assert.equal(locationFixture.locationsSha256,"a2a5e18d75163ba84aa1eaff062508e20b499e93b1fde76b9f859979ecf952b5");
	assert.deepEqual(locationFixture.locations.map((entry) => digest(entry)),[
		"f08718b168aba5f282a1a866725ef7e0f37cfdfe0f944a35088bcfda5c591647",
		"e901cf591cc654d6c825b591750701502f1c982204912bb7b506c7cb77f4de01",
	]);
	assert.equal(new Set([LEGACY_LUING,NATIVE_LUING,LEGACY_DORUS,NATIVE_DORUS]).size,4);
	for (const id of [LEGACY_LUING,NATIVE_LUING,LEGACY_DORUS,NATIVE_DORUS]) {
		assert.equal(definitions.gates.filter((entry) => entry.locationId === id).length,1,id);
	}
	assert.equal(definitions.gates.length,39);
	assert.equal(new Set(definitions.gates.map((entry) => entry.locationId)).size,39);
	const gates = definitions.gates.map(normalizeGate);
	const nativeIds = new Set([NATIVE_LUING,NATIVE_DORUS]);
	const locations = [
		...definitions.ports.map((entry) => ({
			id:entry.locationId,
			name:entry.name,
			types:[entry.kind === "standard" ? "tidalStandardPort" : "tidalSecondaryPort"],
		})),
		...gates.filter((entry) => !nativeIds.has(entry.locationId)).map((entry) => ({ id:entry.locationId,name:entry.locationId,types:["tidalGate"] })),
		...locationFixture.locations,
	];
	for (const id of nativeIds) {
		assert.equal(locations.filter((entry) => entry.id === id).length,1,id);
		assert.equal(definitions.gates.filter((entry) => entry.locationId === id).length,1,id);
	}
	const diagnostics = catalogueDiagnostics({ ...definitions,gates },locations);
	assert.equal(gates.filter((entry) => entry.legacy?.fromContract === "ajrm-tidal-gate-constants-v1").length,15);
	assert.equal(gates.filter((entry) => !entry.legacy).length,24);
	assert.equal(diagnostics.valid,true);
	assert.deepEqual(diagnostics.operationalLocationIds,[]);
	assert.deepEqual(diagnostics.summary,{
		gateCount:39,
		declaredOperationalCount:0,
		operationalCount:0,
		nonOperationalCount:39,
		legacyMigrationCount:15,
		locationGateCount:39,
		errorCount:0,
		warningCount:54,
	});
	for (const id of [NATIVE_LUING,NATIVE_DORUS]) {
		assert.ok(diagnostics.issues.some((entry) => entry.code === "gate-not-operational" && entry.locationId === id));
		assert.equal(diagnostics.issues.some((entry) => entry.severity === "error" && entry.locationId === id),false);
		assert.equal(diagnostics.operationalLocationIds.includes(id),false);
	}
});
