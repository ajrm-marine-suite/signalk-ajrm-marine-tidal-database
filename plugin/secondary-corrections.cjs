/** Applies entered secondary-port time and height differences to parent-port extremes. */

function interpolate(points, referenceMinutes, periodMinutes = 720) {
	const sorted = [...points].sort((a, b) => a.referenceTimeMinutes - b.referenceTimeMinutes);
	if (!sorted.length) throw new Error("Secondary-port correction table is empty.");
	if (sorted.length === 1) return sorted[0].offsetMinutes;
	const period = Number(periodMinutes) || 720;
	const target = ((referenceMinutes % period) + period) % period;
	for (let index = 0; index < sorted.length; index += 1) {
		const left = sorted[index];
		const right = sorted[(index + 1) % sorted.length];
		const leftTime = left.referenceTimeMinutes;
		const rightTime = index + 1 < sorted.length ? right.referenceTimeMinutes : right.referenceTimeMinutes + period;
		const adjustedTarget = target < leftTime ? target + period : target;
		if (adjustedTarget >= leftTime && adjustedTarget <= rightTime) {
			const fraction = rightTime === leftTime ? 0 : (adjustedTarget - leftTime) / (rightTime - leftTime);
			return left.offsetMinutes + (right.offsetMinutes - left.offsetMinutes) * fraction;
		}
	}
	return sorted[0].offsetMinutes;
}

function referenceMinutes(at) {
	const date = new Date(at);
	return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function heightDifference(type, parentHeight, corrections, referenceLevels = {}) {
	const differences = corrections.heightDifferencesM || {};
	const springHigh = Number(referenceLevels.mhws);
	const neapHigh = Number(referenceLevels.mhwn);
	const neapLow = Number(referenceLevels.mlwn);
	const springLow = Number(referenceLevels.mlws);
	if (type === "high" && Number.isFinite(springHigh) && Number.isFinite(neapHigh) && springHigh !== neapHigh) {
		const fraction = Math.max(0, Math.min(1, (parentHeight - neapHigh) / (springHigh - neapHigh)));
		return Number(differences.mhwn) + (Number(differences.mhws) - Number(differences.mhwn)) * fraction;
	}
	if (type === "low" && Number.isFinite(neapLow) && Number.isFinite(springLow) && springLow !== neapLow) {
		const fraction = Math.max(0, Math.min(1, (parentHeight - neapLow) / (springLow - neapLow)));
		return Number(differences.mlwn) + (Number(differences.mlws) - Number(differences.mlwn)) * fraction;
	}
	return type === "high"
		? (Number(differences.mhws) + Number(differences.mhwn)) / 2
		: (Number(differences.mlws) + Number(differences.mlwn)) / 2;
}

function applySecondaryCorrections(events, corrections, referenceLevels) {
	const period = corrections.timeOffsetPeriodMinutes || 720;
	return events.map((event) => {
		const points = event.type === "high" ? corrections.highWaterTimeOffsets : corrections.lowWaterTimeOffsets;
		const timeOffsetMinutes = interpolate(points, referenceMinutes(event.at), period);
		const heightOffsetM = heightDifference(event.type, event.heightM, corrections, referenceLevels);
		return {
			...event,
			at: new Date(Date.parse(event.at) + timeOffsetMinutes * 60000).toISOString(),
			heightM: event.heightM + heightOffsetM,
		};
	}).sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
}

function applyReferenceLevelCorrections(referenceLevels, corrections) {
	if (!referenceLevels) return null;
	const differences = corrections?.heightDifferencesM || {};
	const result = {};
	for (const key of ["mhws", "mhwn", "mlwn", "mlws"]) {
		const parent = Number(referenceLevels[key]);
		const difference = Number(differences[key]);
		result[key] = Number.isFinite(parent) && Number.isFinite(difference) ? parent + difference : null;
	}
	return Object.values(result).some(Number.isFinite) ? result : null;
}

module.exports = { applyReferenceLevelCorrections, applySecondaryCorrections, interpolate };
