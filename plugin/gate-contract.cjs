/** Versioned tidal-gate contract, conservative v1 migration and catalogue diagnostics. */

const GATE_CONTRACT_V1 = "ajrm-tidal-gate-constants-v1";
const GATE_CONTRACT_V2 = "ajrm-tidal-gate-constants-v2";
const GATE_DIAGNOSTICS_CONTRACT = "ajrm-tidal-gate-catalogue-diagnostics-v1";

const READINESS_STATES = new Set(["draft", "needs-review", "reference-only", "operational", "retired"]);
const REVIEW_STATES = new Set(["unreviewed", "needs-review", "reviewed"]);
const MEASUREMENT_STATES = new Set(["known", "unknown", "unavailable"]);
const RATE_QUALIFIERS = new Set(["exact", "approximate", "range", "up-to", "more-than", "unknown", "unavailable", "legacy-unspecified"]);
const SOURCE_KINDS = new Set(["pilot-book", "official-data", "almanac", "user-observation", "other", "legacy-free-text"]);
const SLACK_SEMANTICS = new Set(["total-centered-on-turn", "before-and-after-turn", "none", "unknown", "unavailable", "legacy-ambiguous"]);

function object(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function objectProperties(value, allowed, pathName) {
	for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${pathName}.${key} is not part of the v2 contract.`);
}

function text(value, pathName, options = {}) {
	if (typeof value !== "string" || (!options.allowEmpty && !value.trim())) throw new Error(`${pathName} must be a non-empty string.`);
	return value;
}

function nullableText(value, pathName) {
	if (value !== null && typeof value !== "string") throw new Error(`${pathName} must be a string or null.`);
	return value;
}

function isoTimestamp(value) {
	return typeof value === "string" && /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value));
}

function sourceIdList(value, pathName, required = false) {
	if (value === undefined && !required) return [];
	if (!Array.isArray(value) || (required && value.length === 0)) throw new Error(`${pathName} must be ${required ? "a non-empty" : "an"} array of source ids.`);
	for (const sourceId of value) text(sourceId, `${pathName}[]`);
	if (new Set(value).size !== value.length) throw new Error(`${pathName} contains a duplicate source id.`);
	return [...value];
}

function measurement(value, pathName, options = {}) {
	if (!object(value) || !MEASUREMENT_STATES.has(value.state)) throw new Error(`${pathName} needs an explicit known, unknown or unavailable state.`);
	if (value.state === "known") {
		objectProperties(value,["state","value","sourceIds"],pathName);
		if (!Number.isFinite(value.value)) throw new Error(`${pathName}.value must be finite when its state is known.`);
		if (options.minimum !== undefined && value.value < options.minimum) throw new Error(`${pathName}.value must be at least ${options.minimum}.`);
		if (options.maximumExclusive !== undefined && value.value >= options.maximumExclusive) throw new Error(`${pathName}.value must be below ${options.maximumExclusive}.`);
	} else {
		objectProperties(value,["state","reason","sourceIds"],pathName);
		if (Object.hasOwn(value, "value")) throw new Error(`${pathName} cannot carry a numeric value when its state is ${value.state}.`);
	}
	if (Object.hasOwn(value, "reason")) nullableText(value.reason, `${pathName}.reason`);
	if (Object.hasOwn(value, "sourceIds")) sourceIdList(value.sourceIds, `${pathName}.sourceIds`);
	return structuredClone(value);
}

function slackValue(value, pathName) {
	if (!object(value) || !SLACK_SEMANTICS.has(value.semantics)) throw new Error(`${pathName} needs explicit slack semantics.`);
	if (value.semantics === "total-centered-on-turn") {
		objectProperties(value,["semantics","total","sourceIds"],pathName);
		measurement(value.total, `${pathName}.total`, { minimum: 0 });
	}
	if (value.semantics === "before-and-after-turn") {
		objectProperties(value,["semantics","before","after","sourceIds"],pathName);
		measurement(value.before, `${pathName}.before`, { minimum: 0 });
		measurement(value.after, `${pathName}.after`, { minimum: 0 });
	}
	if (value.semantics === "legacy-ambiguous") {
		objectProperties(value,["semantics","reported","sourceIds"],pathName);
		measurement(value.reported, `${pathName}.reported`, { minimum: 0 });
	}
	if (value.semantics === "none") objectProperties(value,["semantics","sourceIds"],pathName);
	if (["unknown", "unavailable"].includes(value.semantics)) objectProperties(value,["semantics","reason","sourceIds"],pathName);
	if (["unknown", "unavailable"].includes(value.semantics) && Object.hasOwn(value, "reason")) nullableText(value.reason, `${pathName}.reason`);
	if (Object.hasOwn(value,"sourceIds")) sourceIdList(value.sourceIds,`${pathName}.sourceIds`);
	return structuredClone(value);
}

function validateFlowModel(value) {
	if (!object(value) || !["sinusoidal-between-turns-v1", "legacy-unspecified", "unavailable"].includes(value.kind)) {
		throw new Error("flowModel.kind is invalid.");
	}
	if (value.kind === "sinusoidal-between-turns-v1") {
		objectProperties(value,["kind","peakTiming","zeroAtTurns","sourceIds"],"flowModel");
		if (value.peakTiming !== "midpoint-between-turns" || value.zeroAtTurns !== true) {
			throw new Error("The sinusoidal flow model must explicitly peak midway between turns and be zero at turns.");
		}
	} else objectProperties(value,["kind","sourceIds"],"flowModel");
	if (Object.hasOwn(value, "sourceIds")) sourceIdList(value.sourceIds, "flowModel.sourceIds");
	return structuredClone(value);
}

function validateRegimeInterpolation(value) {
	if (!object(value) || !["linear-reference-range-v1", "legacy-unspecified", "unavailable"].includes(value.kind)) {
		throw new Error("regimeInterpolation.kind is invalid.");
	}
	if (value.kind === "linear-reference-range-v1") {
		objectProperties(value,["kind","rangePairing","outOfRange","sourceIds"],"regimeInterpolation");
		if (!["preceding-opposite-event", "following-opposite-event", "mean-adjacent-opposite-events"].includes(value.rangePairing)) {
			throw new Error("regimeInterpolation.rangePairing is invalid.");
		}
		if (value.outOfRange !== "unavailable") throw new Error("regimeInterpolation.outOfRange must be unavailable; v2 does not clamp or extrapolate beyond spring/neap reference ranges.");
	} else objectProperties(value,["kind","sourceIds"],"regimeInterpolation");
	if (Object.hasOwn(value, "sourceIds")) sourceIdList(value.sourceIds, "regimeInterpolation.sourceIds");
	return structuredClone(value);
}

function validateTurn(value, gate, index) {
	const prefix = `gates[${gate.locationId}].turns[${index}]`;
	if (!object(value)) throw new Error(`${prefix} must be an object.`);
	objectProperties(value,["id","name","direction","offsets","slack"],prefix);
	text(value.id, `${prefix}.id`);
	text(value.name, `${prefix}.name`);
	if (!object(value.direction)) throw new Error(`${prefix}.direction must be an object.`);
	objectProperties(value.direction,["label","bearingDegreesTrue"],`${prefix}.direction`);
	text(value.direction.label, `${prefix}.direction.label`);
	measurement(value.direction.bearingDegreesTrue, `${prefix}.direction.bearingDegreesTrue`, { minimum: 0, maximumExclusive: 360 });
	if (!object(value.offsets) || value.offsets.unit !== "minutes") throw new Error(`${prefix}.offsets must use minutes.`);
	objectProperties(value.offsets,["unit","spring","neap"],`${prefix}.offsets`);
	measurement(value.offsets.spring, `${prefix}.offsets.spring`);
	measurement(value.offsets.neap, `${prefix}.offsets.neap`);
	if (!object(value.slack) || value.slack.unit !== "minutes") throw new Error(`${prefix}.slack must use minutes.`);
	objectProperties(value.slack,["unit","spring","neap"],`${prefix}.slack`);
	slackValue(value.slack.spring, `${prefix}.slack.spring`);
	slackValue(value.slack.neap, `${prefix}.slack.neap`);
	return structuredClone(value);
}

function validateRate(value, gate, turnIds, index) {
	const prefix = `gates[${gate.locationId}].rateObservations[${index}]`;
	if (!object(value)) throw new Error(`${prefix} must be an object.`);
	objectProperties(value,["id","kind","turnId","regime","locality","unit","qualifier","reportedValue","lowerBound","upperBound"],prefix);
	text(value.id, `${prefix}.id`);
	if (!["phase-peak", "legacy-unspecified"].includes(value.kind)) throw new Error(`${prefix}.kind is invalid.`);
	if (value.turnId !== null && (typeof value.turnId !== "string" || !turnIds.has(value.turnId))) throw new Error(`${prefix}.turnId must identify a turn in the same gate.`);
	if (value.turnId === null && value.qualifier !== "legacy-unspecified") throw new Error(`${prefix}.turnId may be null only for a legacy-unspecified observation.`);
	if (!["spring", "neap", "mean", "other"].includes(value.regime)) throw new Error(`${prefix}.regime is invalid.`);
	if (!object(value.locality) || !["gate", "named"].includes(value.locality.scope)) throw new Error(`${prefix}.locality.scope is invalid.`);
	if (value.locality.scope === "gate") {
		objectProperties(value.locality,["scope","locationId"],`${prefix}.locality`);
		if (value.locality.locationId !== gate.locationId) throw new Error(`${prefix}.locality must identify its gate Location.`);
	}
	if (value.locality.scope === "named") {
		objectProperties(value.locality,["scope","label","locationId"],`${prefix}.locality`);
		text(value.locality.label, `${prefix}.locality.label`);
		if (value.locality.locationId !== null && value.locality.locationId !== undefined) text(value.locality.locationId, `${prefix}.locality.locationId`);
	}
	if (value.unit !== "kn") throw new Error(`${prefix}.unit must be kn.`);
	if (!RATE_QUALIFIERS.has(value.qualifier)) throw new Error(`${prefix}.qualifier is invalid.`);
	const reported = measurement(value.reportedValue, `${prefix}.reportedValue`, { minimum: 0 });
	const lower = measurement(value.lowerBound, `${prefix}.lowerBound`, { minimum: 0 });
	const upper = measurement(value.upperBound, `${prefix}.upperBound`, { minimum: 0 });
	if (value.qualifier === "exact") {
		if ([reported, lower, upper].some((entry) => entry.state !== "known") || reported.value !== lower.value || reported.value !== upper.value) {
			throw new Error(`${prefix} exact observations need equal known reported, lower and upper values.`);
		}
	}
	if (value.qualifier === "approximate" && reported.state !== "known") throw new Error(`${prefix} approximate observations need a known reported value.`);
	if (value.qualifier === "approximate") {
		if (lower.state === "known" && upper.state === "known" && (lower.value > reported.value || upper.value < reported.value || lower.value > upper.value)) throw new Error(`${prefix} approximate bounds must contain the reported value.`);
	}
	if (value.qualifier === "range" && (lower.state !== "known" || upper.state !== "known" || lower.value > upper.value || (reported.state === "known" && (reported.value < lower.value || reported.value > upper.value)))) throw new Error(`${prefix} ranges need ordered known bounds containing any reported value.`);
	if (value.qualifier === "up-to" && (upper.state !== "known" || lower.state === "known" || reported.state !== "known" || reported.value !== upper.value)) throw new Error(`${prefix} up-to observations need a matching reported/upper value and no known lower bound.`);
	if (value.qualifier === "more-than" && (lower.state !== "known" || upper.state === "known" || reported.state !== "known" || reported.value !== lower.value)) throw new Error(`${prefix} more-than observations need a matching reported/lower value and no known upper bound.`);
	if (value.qualifier === "unknown" && [reported, lower, upper].some((entry) => entry.state !== "unknown")) throw new Error(`${prefix} unknown observations must keep every value explicitly unknown.`);
	if (value.qualifier === "unavailable" && [reported, lower, upper].some((entry) => entry.state !== "unavailable")) throw new Error(`${prefix} unavailable observations must keep every value explicitly unavailable.`);
	return structuredClone(value);
}

function validateSource(value, index) {
	const prefix = `provenance.sources[${index}]`;
	if (!object(value)) throw new Error(`${prefix} must be an object.`);
	objectProperties(value,["id","kind","title","publisher","edition","page","imageRef","url","retrievedAt",...(value.kind === "legacy-free-text" ? ["legacyText"] : [])],prefix);
	text(value.id, `${prefix}.id`);
	if (!SOURCE_KINDS.has(value.kind)) throw new Error(`${prefix}.kind is invalid.`);
	for (const key of ["title", "publisher", "edition", "page", "imageRef", "url", "retrievedAt"]) nullableText(value[key] ?? null, `${prefix}.${key}`);
	if (value.retrievedAt !== null && value.retrievedAt !== undefined && !isoTimestamp(value.retrievedAt)) throw new Error(`${prefix}.retrievedAt must be an ISO timestamp.`);
	if (value.kind === "legacy-free-text") nullableText(value.legacyText ?? null, `${prefix}.legacyText`);
	else if (Object.hasOwn(value, "legacyText")) throw new Error(`${prefix}.legacyText is reserved for migrated legacy citations.`);
	return structuredClone(value);
}

function validateNote(value, pathName, sourceIds) {
	if (!object(value)) throw new Error(`${pathName} must be an object.`);
	objectProperties(value,["id","summary","sourceIds","blocking"],pathName);
	text(value.id, `${pathName}.id`);
	text(value.summary, `${pathName}.summary`);
	if (!Object.hasOwn(value,"sourceIds")) throw new Error(`${pathName}.sourceIds is required.`);
	const noteSourceIds = sourceIdList(value.sourceIds,`${pathName}.sourceIds`);
	for (const sourceId of noteSourceIds) if (!sourceIds.has(sourceId)) throw new Error(`${pathName} refers to an unknown source id.`);
	if (Object.hasOwn(value, "blocking") && typeof value.blocking !== "boolean") throw new Error(`${pathName}.blocking must be boolean.`);
	return structuredClone(value);
}

function gateMeasurements(gate) {
	const values = [gate.turns.flatMap((turn) => [turn.direction.bearingDegreesTrue, turn.offsets.spring, turn.offsets.neap])].flat();
	for (const turn of gate.turns) for (const regime of ["spring", "neap"]) {
		const slack = turn.slack[regime];
		for (const key of ["total", "before", "after", "reported"]) if (slack[key]) values.push(slack[key]);
	}
	for (const rate of gate.rateObservations) values.push(rate.reportedValue, rate.lowerBound, rate.upperBound);
	return values;
}

function operationalReadinessIssues(gate) {
	const issues = [];
	if (gate.provenance.review.state !== "reviewed" || !gate.provenance.review.reviewedBy?.trim() || !isoTimestamp(gate.provenance.review.reviewedAt)) issues.push("review-not-complete");
	const meaningfulSourceIds = new Set(gate.provenance.sources.filter((source) => source.kind !== "legacy-free-text" && source.title?.trim() && (source.publisher?.trim() || source.url?.trim()) && (source.edition?.trim() || source.page?.trim() || source.imageRef?.trim() || source.retrievedAt?.trim())).map((source) => source.id));
	if (!meaningfulSourceIds.size) issues.push("meaningful-structured-source-required");
	if (!gate.reference.sourceIds?.some((sourceId) => meaningfulSourceIds.has(sourceId))) issues.push("reference-event-source-required");
	if (gateMeasurements(gate).some((entry) => entry.state === "known" && !entry.sourceIds?.some((sourceId) => meaningfulSourceIds.has(sourceId)))) issues.push("known-value-source-required");
	for (const key of ["cautions","hazards","uncertainty"]) for (const note of gate[key]) {
		if (!note.sourceIds.some((sourceId) => meaningfulSourceIds.has(sourceId))) issues.push(`${key}:${note.id}:meaningful-source-required`);
		if (note.blocking === true) issues.push(`blocking-${key}`);
	}
	if (gate.flowModel.kind !== "sinusoidal-between-turns-v1") issues.push("unsupported-or-unknown-flow-model");
	if (gate.regimeInterpolation.kind !== "linear-reference-range-v1") issues.push("unsupported-or-unknown-regime-interpolation");
	for (const turn of gate.turns) {
		if (turn.direction.bearingDegreesTrue.state !== "known") issues.push(`turn:${turn.id}:direction-unknown`);
		for (const regime of ["spring", "neap"]) {
			if (turn.offsets[regime].state !== "known") issues.push(`turn:${turn.id}:${regime}-offset-unknown`);
			const slack = turn.slack[regime];
			if (slack.semantics === "total-centered-on-turn" && slack.total.state !== "known") issues.push(`turn:${turn.id}:${regime}-slack-unknown`);
			else if (slack.semantics === "before-and-after-turn" && (slack.before.state !== "known" || slack.after.state !== "known")) issues.push(`turn:${turn.id}:${regime}-slack-unknown`);
			else if (slack.semantics === "none" && !slack.sourceIds?.some((sourceId) => meaningfulSourceIds.has(sourceId))) issues.push(`turn:${turn.id}:${regime}-slack-none-source-required`);
			else if (!["total-centered-on-turn", "before-and-after-turn", "none"].includes(slack.semantics)) issues.push(`turn:${turn.id}:${regime}-slack-not-operational`);
			const rates = gate.rateObservations.filter((entry) => entry.turnId === turn.id && entry.regime === regime && entry.locality.scope === "gate");
			const usable = rates.filter((entry) => entry.kind === "phase-peak" && entry.qualifier === "exact" && entry.reportedValue.state === "known");
			if (usable.length !== 1) issues.push(`turn:${turn.id}:${regime}-needs-one-usable-gate-peak-rate`);
		}
	}
	return [...new Set(issues)];
}

function validateGateV2(value) {
	if (!object(value) || value.contract !== GATE_CONTRACT_V2 || value.contractVersion !== 2) throw new Error(`Gate records must use ${GATE_CONTRACT_V2}.`);
	objectProperties(value,["contract","contractVersion","revision","locationId","conventions","reference","flowModel","regimeInterpolation","turns","rateObservations","provenance","cautions","hazards","uncertainty","readiness","legacy"],"gate");
	text(value.locationId, "gate.locationId");
	if (!Number.isInteger(value.revision) || value.revision < 1) throw new Error(`Gate ${value.locationId} needs a positive integer revision.`);
	if (!object(value.conventions) || value.conventions.offsetSign !== "positive-after-reference-event" || value.conventions.directionBearing !== "degrees-true-current-towards") {
		throw new Error(`Gate ${value.locationId} must declare positive-after offsets and true current-towards bearings.`);
	}
	objectProperties(value.conventions,["offsetSign","directionBearing"],`gates[${value.locationId}].conventions`);
	if (!object(value.reference)) throw new Error(`Gate ${value.locationId} needs a reference object.`);
	objectProperties(value.reference,["portLocationId","event","sourceIds"],`gates[${value.locationId}].reference`);
	text(value.reference.portLocationId, `gates[${value.locationId}].reference.portLocationId`);
	if (!["HW", "LW"].includes(value.reference.event)) throw new Error(`Gate ${value.locationId} reference.event must be HW or LW.`);
	if (!Object.hasOwn(value.reference,"sourceIds")) throw new Error(`gates[${value.locationId}].reference.sourceIds is required.`);
	sourceIdList(value.reference.sourceIds, `gates[${value.locationId}].reference.sourceIds`);
	validateFlowModel(value.flowModel);
	validateRegimeInterpolation(value.regimeInterpolation);
	if (!Array.isArray(value.turns) || value.turns.length < 2) throw new Error(`Gate ${value.locationId} needs at least two independently named turns.`);
	const turns = value.turns.map((turn, index) => validateTurn(turn, value, index));
	const turnIds = new Set();
	const turnNames = new Set();
	for (const turn of turns) {
		if (turnIds.has(turn.id)) throw new Error(`Gate ${value.locationId} has duplicate turn id ${turn.id}.`);
		if (turnNames.has(turn.name)) throw new Error(`Gate ${value.locationId} has duplicate turn name ${turn.name}.`);
		turnIds.add(turn.id);
		turnNames.add(turn.name);
	}
	if (!Array.isArray(value.rateObservations)) throw new Error(`Gate ${value.locationId} needs a rateObservations array.`);
	const rateIds = new Set();
	for (const [index, rate] of value.rateObservations.entries()) {
		validateRate(rate, value, turnIds, index);
		if (rateIds.has(rate.id)) throw new Error(`Gate ${value.locationId} has duplicate rate observation id ${rate.id}.`);
		rateIds.add(rate.id);
	}
	if (!object(value.provenance) || !Array.isArray(value.provenance.sources) || !object(value.provenance.review)) throw new Error(`Gate ${value.locationId} needs structured provenance and review state.`);
	objectProperties(value.provenance,["sources","review"],`gates[${value.locationId}].provenance`);
	objectProperties(value.provenance.review,["state","reviewedBy","reviewedAt","notes"],`gates[${value.locationId}].provenance.review`);
	const sources = value.provenance.sources.map(validateSource);
	const sourceIds = new Set();
	for (const source of sources) {
		if (sourceIds.has(source.id)) throw new Error(`Gate ${value.locationId} has duplicate source id ${source.id}.`);
		sourceIds.add(source.id);
	}
	const referencedSourceIds = [
		...(value.reference.sourceIds || []),
		...(value.flowModel.sourceIds || []),
		...(value.regimeInterpolation.sourceIds || []),
		...value.turns.flatMap((turn) => ["spring","neap"].flatMap((regime) => turn.slack[regime].sourceIds || [])),
		...gateMeasurements(value).flatMap((entry) => entry.sourceIds || []),
	];
	for (const sourceId of referencedSourceIds) if (!sourceIds.has(sourceId)) throw new Error(`Gate ${value.locationId} refers to unknown source id ${sourceId}.`);
	if (!REVIEW_STATES.has(value.provenance.review.state)) throw new Error(`Gate ${value.locationId} review state is invalid.`);
	for (const key of ["reviewedBy", "reviewedAt", "notes"]) nullableText(value.provenance.review[key] ?? null, `provenance.review.${key}`);
	if (value.provenance.review.reviewedAt !== null && value.provenance.review.reviewedAt !== undefined && !isoTimestamp(value.provenance.review.reviewedAt)) throw new Error(`Gate ${value.locationId} review time must be an ISO timestamp.`);
	const noteIds = new Set();
	for (const key of ["cautions", "hazards", "uncertainty"]) {
		if (!Array.isArray(value[key])) throw new Error(`Gate ${value.locationId} needs a ${key} array.`);
		value[key].forEach((entry, index) => {
			validateNote(entry, `${key}[${index}]`, sourceIds);
			if (noteIds.has(entry.id)) throw new Error(`Gate ${value.locationId} has duplicate caution/hazard/uncertainty id ${entry.id}.`);
			noteIds.add(entry.id);
		});
	}
	if (!object(value.readiness) || !READINESS_STATES.has(value.readiness.state) || !Array.isArray(value.readiness.reasons)) throw new Error(`Gate ${value.locationId} readiness is invalid.`);
	objectProperties(value.readiness,["state","reasons"],`gates[${value.locationId}].readiness`);
	for (const reason of value.readiness.reasons) text(reason, `gates[${value.locationId}].readiness.reasons[]`);
	if (value.readiness.state === "operational") {
		const issues = operationalReadinessIssues(value);
		if (value.readiness.reasons.length || issues.length) throw new Error(`Gate ${value.locationId} cannot be operational: ${[...value.readiness.reasons, ...issues].join(", ")}.`);
	}
	if (Object.hasOwn(value, "legacy") && !object(value.legacy)) throw new Error(`Gate ${value.locationId} legacy metadata must be an object.`);
	return structuredClone(value);
}

function legacyDuration(value, sourceIds = [], options = {}) {
	if (typeof value !== "string") return { state: "unknown", reason: "The v1 field did not contain a duration string." };
	const match = value.trim().match(/^(-)?(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
	if (!match || Number(match[3]) >= 60 || Number(match[4] || 0) >= 60) return { state: "unknown", reason: "The v1 duration could not be converted without guessing." };
	const minutes = (Number(match[2]) * 60) + Number(match[3]) + (Number(match[4] || 0) / 60);
	const signedMinutes = (match[1] ? -1 : 1) * minutes;
	if (!Number.isFinite(signedMinutes)) return { state: "unknown", reason: "The v1 duration was outside the finite numeric range and was not converted." };
	if (options.minimum !== undefined && signedMinutes < options.minimum) return { state: "unknown", reason: `The v1 duration was outside the valid range and was not converted.` };
	return { state: "known", value: signedMinutes, ...(sourceIds.length ? { sourceIds } : {}) };
}

function legacyRate(value, sourceIds = []) {
	return Number.isFinite(value) && value >= 0 ? { state: "known", value, ...(sourceIds.length ? { sourceIds } : {}) } : { state: "unknown", reason: "The v1 rate was missing, non-numeric or outside the valid non-negative range." };
}

function migrateGateV1ToV2(value) {
	if (!object(value) || value.contract !== GATE_CONTRACT_V1) throw new Error(`Only ${GATE_CONTRACT_V1} records can use the v1 migration.`);
	text(value.locationId, "legacy gate.locationId");
	const referenceMatch = typeof value.standardPortRef === "string" ? value.standardPortRef.match(/^\/resources\/locations\/([^/]+)$/) : null;
	const referenceId = referenceMatch?.[1] || "";
	if (!referenceId) throw new Error(`Legacy gate ${value.locationId} has no usable reference-port Location id.`);
	const hasLegacySource = typeof value.source === "string" && value.source.trim();
	const legacySourceIds = hasLegacySource ? ["legacy-v1-source"] : [];
	const sources = hasLegacySource ? [{
		id: "legacy-v1-source",
		kind: "legacy-free-text",
		title: null,
		publisher: null,
		edition: null,
		page: null,
		imageRef: null,
		url: null,
		retrievedAt: null,
		legacyText: value.source,
	}] : [];
	const turns = [
		{ id: "legacy-flood", name: "Legacy flood turn", set: value.floodSet, offsetSpring: value.floodSpringAfter, offsetNeap: value.floodNeapAfter, slackSpring: value.floodSpringSlack, slackNeap: value.floodNeapSlack },
		{ id: "legacy-ebb", name: "Legacy ebb turn", set: value.ebbSet, offsetSpring: value.ebbSpringAfter, offsetNeap: value.ebbNeapAfter, slackSpring: value.ebbSpringSlack, slackNeap: value.ebbNeapSlack },
	].map((turn) => ({
		id: turn.id,
		name: turn.name,
		direction: {
			label: String(turn.set || "").trim() || "Unspecified legacy direction",
			bearingDegreesTrue: { state: "unknown", reason: "A v1 cardinal/set label is not an explicit true bearing." },
		},
		offsets: { unit: "minutes", spring: legacyDuration(turn.offsetSpring, legacySourceIds), neap: legacyDuration(turn.offsetNeap, legacySourceIds) },
		slack: {
			unit: "minutes",
			spring: { semantics: "legacy-ambiguous", reported: legacyDuration(turn.slackSpring, legacySourceIds, { minimum:0 }) },
			neap: { semantics: "legacy-ambiguous", reported: legacyDuration(turn.slackNeap, legacySourceIds, { minimum:0 }) },
		},
	}));
	const rateObservations = [
		{ id: "legacy-spring-peak", regime: "spring", value: value.springPeakFlowKnots },
		{ id: "legacy-neap-peak", regime: "neap", value: value.neapPeakFlowKnots },
	].map((entry) => ({
		id: entry.id,
		kind: "legacy-unspecified",
		turnId: null,
		regime: entry.regime,
		locality: { scope: "gate", locationId: value.locationId },
		unit: "kn",
		qualifier: "legacy-unspecified",
		reportedValue: legacyRate(entry.value, legacySourceIds),
		lowerBound: { state: "unknown", reason: "v1 did not distinguish a lower bound." },
		upperBound: { state: "unknown", reason: "v1 did not distinguish an upper bound." },
	}));
	return validateGateV2({
		contract: GATE_CONTRACT_V2,
		contractVersion: 2,
		revision: 1,
		locationId: value.locationId,
		conventions: { offsetSign: "positive-after-reference-event", directionBearing: "degrees-true-current-towards" },
		reference: { portLocationId: referenceId, event: "HW", sourceIds:legacySourceIds },
		flowModel: { kind: "legacy-unspecified" },
		regimeInterpolation: { kind: "legacy-unspecified" },
		turns,
		rateObservations,
		provenance: { sources, review: { state: "needs-review", reviewedBy: null, reviewedAt: null, notes: null } },
		cautions: [],
		hazards: [],
		uncertainty: [
			{ id: "legacy-reference-event", summary: "v1 calculations assumed HW; confirm the intended HW or LW reference event.", sourceIds: [], blocking:true },
			{ id: "legacy-directions", summary: "v1 set labels were not explicit true bearings.", sourceIds: [], blocking:true },
			{ id: "legacy-slack", summary: "v1 slack values did not say whether they were total, centred, before or after a turn.", sourceIds: [], blocking:true },
			{ id: "legacy-rates", summary: "v1 reused one spring/neap rate pair without turn, direction, locality, bounds or qualifier semantics.", sourceIds: [], blocking:true },
			{ id: "legacy-models", summary: "v1 did not declare its flow curve or reference-range interpolation model.", sourceIds: [], blocking:true },
		],
		readiness: { state: "needs-review", reasons: ["migrated-v1", "ambiguous-slack", "direction-unspecified-rates", "explicit-bearings-required", "calculation-models-required", "structured-source-review-required"] },
		legacy: { fromContract: GATE_CONTRACT_V1, record: structuredClone(value) },
	});
}

function normalizeGate(value) {
	if (value?.contract === GATE_CONTRACT_V1) return migrateGateV1ToV2(value);
	return validateGateV2(value);
}

function catalogueDiagnostics(definitions, locations = [], locationError = "") {
	const issues = [];
	const gates = Array.isArray(definitions?.gates) ? definitions.gates : [];
	const ports = new Map((definitions?.ports || []).map((entry) => [entry.locationId, entry]));
	const locationList = Array.isArray(locations) ? locations : [];
	const locationById = new Map(locationList.map((entry) => [entry.id, entry]));
	const gateIds = new Set();
	let declaredOperationalCount = 0;
	let legacyMigrationCount = 0;
	if (locationError) issues.push({ severity: "error", code: "location-catalogue-unavailable", locationId: null, message: locationError });
	for (const gate of gates) {
		if (gateIds.has(gate.locationId)) issues.push({ severity: "error", code: "duplicate-gate-location-id", locationId: gate.locationId, message: "More than one gate definition uses this Location id." });
		gateIds.add(gate.locationId);
		let normalized;
		try { normalized = validateGateV2(gate); }
		catch (error) {
			issues.push({ severity: "error", code: "gate-contract-invalid", locationId: gate?.locationId || null, message: error.message });
			continue;
		}
		if (normalized.readiness.state === "operational") declaredOperationalCount += 1;
		if (normalized.legacy?.fromContract === GATE_CONTRACT_V1) {
			legacyMigrationCount += 1;
			issues.push({ severity: "warning", code: "legacy-v1-needs-review", locationId: normalized.locationId, message: "This v1 record was preserved as a non-operational v2 migration and needs explicit review." });
		}
		if (normalized.readiness.state !== "operational") issues.push({ severity: "warning", code: "gate-not-operational", locationId: normalized.locationId, message: `Readiness is ${normalized.readiness.state}: ${normalized.readiness.reasons.join(", ") || "no operational declaration"}.` });
		const location = locationById.get(normalized.locationId);
		if (!location && !locationError) issues.push({ severity: "error", code: "gate-location-missing", locationId: normalized.locationId, message: "The gate Location does not exist in Location Editor." });
		else if (location && !location.types?.includes("tidalGate")) issues.push({ severity: "error", code: "gate-location-type-invalid", locationId: normalized.locationId, message: "The joined Location is not typed tidalGate." });
		const port = ports.get(normalized.reference.portLocationId);
		if (!port) issues.push({ severity: "error", code: "reference-port-definition-missing", locationId: normalized.locationId, message: "The reference port has no Tidal Database port definition." });
		else if (port.kind !== "standard") issues.push({ severity: "error", code: "reference-port-not-standard", locationId: normalized.locationId, message: "A gate reference port must be a standard tidal port." });
		else if (port.prediction?.mode !== "provider" || !port.prediction.providerId || !port.prediction.stationId) issues.push({ severity: "error", code: "reference-port-prediction-unavailable", locationId: normalized.locationId, message: "The standard reference port needs a usable provider-backed station." });
		else if (!["mhws", "mhwn", "mlwn", "mlws"].every((key) => Number.isFinite(port.referenceLevels?.[key]))) issues.push({ severity: "error", code: "reference-port-levels-unavailable", locationId: normalized.locationId, message: "The standard reference port needs explicit MHWS, MHWN, MLWN and MLWS levels for regime interpolation." });
		const portLocation = locationById.get(normalized.reference.portLocationId);
		if (!portLocation && !locationError) issues.push({ severity: "error", code: "reference-port-location-missing", locationId: normalized.locationId, message: "The reference-port Location does not exist in Location Editor." });
		else if (portLocation && !portLocation.types?.includes("tidalStandardPort")) issues.push({ severity: "error", code: "reference-port-location-type-invalid", locationId: normalized.locationId, message: "The reference-port Location is not typed tidalStandardPort." });
		if (!locationError) for (const observation of normalized.rateObservations.filter((entry) => entry.locality.scope === "named" && entry.locality.locationId)) {
			if (!locationById.has(observation.locality.locationId)) issues.push({ severity:"error", code:"rate-locality-location-missing", locationId:normalized.locationId, message:`Rate observation ${observation.id} refers to missing locality Location ${observation.locality.locationId}.` });
		}
		}
	if (!locationError) {
		for (const location of locationList.filter((entry) => entry.types?.includes("tidalGate"))) {
			if (!gateIds.has(location.id)) issues.push({ severity: "warning", code: "gate-definition-missing", locationId: location.id, message: "This tidalGate Location has no timing definition in Tidal Database." });
		}
	}
	const errorCount = issues.filter((entry) => entry.severity === "error").length;
	const warningCount = issues.filter((entry) => entry.severity === "warning").length;
	const catalogueLevelError = issues.some((entry) => entry.severity === "error" && entry.locationId === null);
	const operationalLocationIds = gates.filter((gate) => gate.readiness?.state === "operational" && !catalogueLevelError && !issues.some((entry) => entry.severity === "error" && entry.locationId === gate.locationId)).map((gate) => gate.locationId);
	return {
		contract: GATE_DIAGNOSTICS_CONTRACT,
		contractVersion: 1,
		valid: errorCount === 0,
		summary: {
			gateCount: gates.length,
			declaredOperationalCount,
			operationalCount:operationalLocationIds.length,
			nonOperationalCount: gates.length - operationalLocationIds.length,
			legacyMigrationCount,
			locationGateCount: locationList.filter((entry) => entry.types?.includes("tidalGate")).length,
			errorCount,
			warningCount,
		},
		operationalLocationIds,
		issues,
	};
}

module.exports = {
	GATE_CONTRACT_V1,
	GATE_CONTRACT_V2,
	GATE_DIAGNOSTICS_CONTRACT,
	catalogueDiagnostics,
	migrateGateV1ToV2,
	normalizeGate,
	operationalReadinessIssues,
	validateGateV2,
};
