/**
 * Explicit operational-with-assumptions profiles for completed source reviews.
 *
 * These values are deliberately separate from the evidence records in
 * defaults/tidal-definitions.json.  They make the reviewed records calculable
 * without rewriting approximate, bounded or spatially scoped source material
 * as exact observations.  Planning must surface calculationBasis warnings.
 */

const CONTRACT = "ajrm-tidal-gate-operational-profile-v1";

const profiles = Object.freeze({
	"1957fe61-93dd-4eb2-a27b-e8f7fa958270": { bearings:[0,180], offsets:[[315,315],[-15,-15]], rates:[[2.5,2.5],[2.5,2.5]], slack:[0,0], basis:"Regime-neutral guidance is used for both regimes; the published up-to rate is used in both directions." },
	"6211fb34-5f92-4ea9-887c-201ddb550792": { bearings:[315,135], offsets:[[335,335],[-80,-80]], rates:[[3,3],[3,3]], slack:[0,0], basis:"Regime-neutral times and the gate-wide up-to rate are used for both regimes and directions." },
	"b4ff0772-bcba-4392-90e0-2f6d955a46f3": { bearings:[0,180], offsets:[[-310,-310],[75,75]], rates:[[2.5,2.5],[2.5,2.5]], slack:[0,0], basis:"Regime-neutral times and the highest reviewed headland up-to rate are used as a broad planning envelope." },
	"511edf0a-5ecc-419c-8f81-9a4553e559bf": { bearings:[90,270], offsets:[[-300,-300],[90,90]], rates:[[3.5,3.5],[3.5,3.5]], slack:[0,0], basis:"Approximate regime-neutral times and the highest reviewed local rate are used as a conservative whole-loch envelope; in/out bearings are explicit planning assumptions." },
	"c37604e9-f6e7-442f-91c3-c3135fc2e215": { bearings:[315,135], offsets:[[-360,-360],[-45,-45]], rates:[[2,2],[2,2]], slack:[0,0], basis:"Approximate regime-neutral starts and the regional up-to rate are used for both regimes." },
	"74846a1d-67f1-4176-b74b-b7956df2386e": { bearings:[315,135], offsets:[[300,300],[-45,-45]], rates:[[1,1],[1,1]], slack:[0,0], basis:"Approximate regime-neutral starts and the generic elsewhere up-to rate are used for both regimes." },
	"55187907-2b6d-4c9b-9073-3848e2679a07": { bearings:[0,180], offsets:[[-360,-360],[5,5]], rates:[[5,5],[5,5]], slack:[0,0], basis:"Regime-neutral beginnings and the published more-than-5-knot threshold are modelled at 5 kn; actual flow may be higher." },
	"47683dc5-1b7e-477c-95fb-4e7a54244995": { bearings:[90,270], offsets:[[-315,-315],[60,60]], rates:[[5,5],[5,5]], slack:[0,0], basis:"Regime-neutral beginnings and the shared more-than-5-knot threshold are modelled at 5 kn; actual flow may be higher and in/out bearings are assumptions." },
	"fbd3ab30-6bf6-4e70-bf91-f7141d9586fc": { bearings:[90,270], offsets:[[-270,-270],[60,60]], rates:[[5,5],[5,5]], slack:[0,0], basis:"Derived regime-neutral beginnings and the shared more-than-5-knot threshold are modelled at 5 kn; actual flow may be higher and in/out bearings are assumptions." },
	"dd2f8629-e052-42ac-84b3-07e49390c7b1": { bearings:[0,180], offsets:[[-345,-345],[25,25]], rates:[[4,4],[4,4]], slack:[0,0], basis:"Regime-neutral beginnings and the highest reviewed local rate are used as a broad planning envelope for both regimes and directions." },
	"98553f02-f25a-4789-9f9a-ee41395e1e8c": { bearings:[90,270], offsets:[[-235,-235],[0,0]], rates:[[5,3],[5,3]], slack:[0,0], basis:"Regime-neutral beginnings are used for both regimes; published spring/neap rates are shared across turns and in/out bearings are assumptions." },
	"c0af534c-269b-40c6-952c-c7b37aaa6a32": { bearings:[45,225], offsets:[[270,270],[-115,-115]], rates:[[3,1.5],[3,1.5]], slack:[0,0], basis:"Approximate regime-neutral progressive-turn times use cardinal bearings; reviewed spring local maxima and general neap rate are used as a broad envelope." },
	"5270b58c-5b74-4a30-92ea-e8de3050f024": { bearings:[270,90], offsets:[[270,315],[-105,-60]], rates:[[7,5],[7,5]], slack:[0,0], basis:"Approximate spring/neap beginnings are used as turn instants; western-part rate values are shared across both directions." },
	"a3df95d7-a216-476b-a10f-1d8909810c47": { bearings:[270,90], offsets:[[270,315],[-105,-60]], rates:[[8.5,6.5],[8.5,6.5]], slack:[15,60], basis:"Approximate beginnings are used as turn instants; passage-level slack is centred on both turns and the 8.5/6.5 kn passage values are shared across directions." },
	"2bb1ebac-58eb-41d1-8b78-ef6e4494baf4": { bearings:[270,90], offsets:[[270,315],[-105,-60]], rates:[[8.5,6.5],[8.5,6.5]], slack:[15,60], basis:"Average wind-variable beginnings are used as turn instants; passage-level slack is centred on both turns and mid-channel values are shared across directions." },
	"53ae1e7e-ec00-40f7-ab23-784644740f0b": { bearings:[0,180], offsets:[[270,315],[-105,-60]], rates:[[7,5],[7,5]], slack:[15,60], basis:"Average beginnings are used as turn instants; passage-level slack is centred on both turns and Fladda maxima are shared across directions." },
	"83192cc1-65da-4abc-b4ae-51c6c4ab54ad": { bearings:[270,90], offsets:[[270,315],[-105,-60]], rates:[[8,6],[8,6]], slack:[15,60], basis:"Wind-variable beginnings are used as turn instants; passage-level slack is centred on both turns and passage rates are shared across directions. Strong west winds can materially advance the turn." },
	"513807ca-dafc-48fd-a81a-76961c645e23": { bearings:[0,180], offsets:[[345,345],[-15,-15]], rates:[[3.5,3.5],[3.5,3.5]], slack:[0,0], basis:"Greater-Sound regime-neutral beginnings and the Skervuile-area 3 to 3.5 kn upper value are used as a broad estimate. The separate Ruadh Sgeir timing and 4 kn locality remain cautions, not silently merged inputs." },
	"81ce9a21-efb6-4d14-ab26-280c8bfd4035": { bearings:[315,135], offsets:[[330,330],[-40,-40]], rates:[[8,4],[8,4]], slack:[0,0], basis:"Approximate regime-neutral beginnings and the 8 kn Orsay spring maximum are used for both directions. With no neap rate in the source, 4 kn is an explicit half-spring planning estimate." },
	"f9c17ddc-8fcc-49bd-8000-422f715d5697": { bearings:[0,180], offsets:[[280,280],[-100,-100]], rates:[[5,5],[5,5]], slack:[0,0], basis:"Approximate regime-neutral beginnings and the source's up-to 5 kn narrows value are used for both regimes and directions as a deliberately broad envelope." },
	"f8a16397-5b14-46be-b769-555b3300af72": { bearings:[90,270], offsets:[[270,270],[-120,-120]], rates:[[1,1],[1,1]], slack:[0,0], basis:"Approximate regime-neutral in/out beginnings are used. The source states no stream rate, so 1 kn is a conspicuous provisional planning estimate; east/west in/out bearings are assumptions." },
	"7c0e9a0d-4e6f-46e7-ac72-1b355f7a7e5d": { bearings:[0,180], offsets:[[270,270],[-120,-120]], rates:[[1,1],[1,1]], slack:[0,0], basis:"Approximate regime-neutral beginnings are used. The source states no stream rate, so 1 kn is a conspicuous provisional planning estimate." },
	"b1b21e35-0cb5-4ab9-b8ac-1bb3795f2e17": { bearings:[270,90], offsets:[[-150,-150],[220,220]], rates:[[5,2.5],[5,2.5]], slack:[0,0], basis:"Approximate Greenock-referenced beginnings and the source's 5 kn spring value are used for both directions. With no neap rate, 2.5 kn is an explicit half-spring planning estimate." },
	"9221ab63-c01f-4461-bf49-b7f566941013": { bearings:[0,180], offsets:[[-170,-170],[190,190]], rates:[[5,2.5],[5,2.5]], slack:[0,0], basis:"Approximate Greenock-referenced beginnings and the source's 5 kn spring value are used for both directions. With no neap rate, 2.5 kn is an explicit half-spring planning estimate." },
});

function known(value) {
	return { state:"known", value, sourceIds:[] };
}

function centred(total) {
	return total === 0
		? { semantics:"none", sourceIds:[] }
		: { semantics:"total-centered-on-turn", total:known(total), sourceIds:[] };
}

function operationalProfile(record) {
	const profile = profiles[record?.locationId];
	if (!profile || record?.contractVersion !== 2 || !Array.isArray(record.turns) || record.turns.length !== 2) return null;
	const turns = record.turns.map((turn,index) => ({
		...structuredClone(turn),
		direction:{ ...structuredClone(turn.direction), bearingDegreesTrue:known(profile.bearings[index]) },
		offsets:{ unit:"minutes", spring:known(profile.offsets[index][0]), neap:known(profile.offsets[index][1]) },
		slack:{ unit:"minutes", spring:centred(profile.slack[0]), neap:centred(profile.slack[1]) },
	}));
	const rateObservations = turns.flatMap((turn,index) => ["spring","neap"].map((regime,regimeIndex) => {
		const value = profile.rates[index][regimeIndex];
		return {
			id:`assumed-${turn.id}-${regime}-peak`, kind:"phase-peak", turnId:turn.id, regime,
			locality:{ scope:"gate", locationId:record.locationId }, unit:"kn", qualifier:"approximate",
			reportedValue:known(value), lowerBound:known(value), upperBound:known(value),
		};
	}));
	return {
		...structuredClone(record),
		revision:record.revision + 1,
		flowModel:{ kind:"sinusoidal-between-turns-v1", peakTiming:"midpoint-between-turns", zeroAtTurns:true, sourceIds:[] },
		regimeInterpolation:{ kind:"linear-reference-range-v1", rangePairing:"mean-adjacent-opposite-events", outOfRange:"unavailable", sourceIds:[] },
		turns,
		rateObservations,
		readiness:{ state:"operational", reasons:["operational-with-explicit-assumptions"] },
		calculationBasis:{
			contract:CONTRACT, contractVersion:1, mode:"operational-with-assumptions", sourceReadiness:record.readiness?.state || null,
			warning:"For passage planning assistance only. Every value is an estimate: take it with a pinch of salt. Explicit assumptions do not replace current official tidal-stream publications, local observations, weather assessment or safe navigation judgement.",
			assumptions:[profile.basis,"A sinusoidal flow between named turns is assumed.","Linear interpolation between published or assumed spring/neap inputs uses the mean of adjacent opposite tidal extrema.",...(profile.slack[0] === 0 ? ["No sourced slack duration is available, so the model uses a zero-duration slack window."] : [])],
		},
		sourceReview:structuredClone(record),
	};
}

function applyOperationalProfiles(records) {
	return (records || []).map((record) => operationalProfile(record) || structuredClone(record));
}

module.exports = { CONTRACT, applyOperationalProfiles, operationalProfile, profileLocationIds:Object.freeze(Object.keys(profiles)) };
