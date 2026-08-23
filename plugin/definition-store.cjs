/** Persists editable tidal prediction, correction and area definitions separately from Locations. */

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const LEGACY_CONTRACT = "ajrm-marine-tidal-database-definitions-v1";
const CONTRACT = "ajrm-marine-tidal-database-definitions-v2";
const MIGRATION_CONTRACT = "ajrm-marine-tidal-to-planning-gate-migration-v1";
const SAFE_PORT_BACKFILLS = Object.freeze({
	"29910eb5-6c47-4796-8af7-592742737562": { providerId:"ukhoTidalEvents", stationId:"0404" },
});
const SAFE_NAME_RENAMES = Object.freeze({
	"e0e5661f-1675-4dbb-8fa0-ea8566c62ef4": Object.freeze({ from:"Oban tidal prediction port", to:"Oban port" }),
	"f297596a-4959-47ff-b665-18ac2cb74924": Object.freeze({ from:"Oban tidal prediction port tidal area", to:"Oban port tidal area" }),
});

function activeCatalogue(value) {
	if (!value || !Array.isArray(value.ports) || !Array.isArray(value.areas)) throw new Error("Tidal definition catalogue is invalid.");
	const { gates: _gates, gateTombstones: _gateTombstones, ...tidal } = structuredClone(value);
	return { ...tidal, contract:CONTRACT, contractVersion:2 };
}

function validate(value) {
	if (value?.contract !== CONTRACT || value?.contractVersion !== 2 || !Array.isArray(value.ports) || !Array.isArray(value.areas)) throw new Error("Tidal definition catalogue is invalid.");
	if (Object.hasOwn(value,"gates") || Object.hasOwn(value,"gateTombstones")) throw new Error("Tidal definition catalogue cannot contain Planning-owned gate data.");
	value = structuredClone(value);
	const ids = new Set();
	for (const port of value.ports) {
		if (!port?.locationId || ids.has(port.locationId)) throw new Error("Each tidal port needs one unique Location id.");
		ids.add(port.locationId);
		if (!["standard","secondary"].includes(port.kind)) throw new Error(`${port.name || port.locationId} has an invalid port kind.`);
		if (!["provider","corrections","unavailable"].includes(port.prediction?.mode)) throw new Error(`${port.name || port.locationId} has an invalid prediction mode.`);
		if (port.prediction.mode === "provider" && (!port.prediction.providerId || !port.prediction.stationId)) throw new Error(`${port.name} needs a provider and station id.`);
		if (port.automaticPreferredPortLocationId === port.locationId) throw new Error(`${port.name} cannot prefer itself for automatic selection.`);
		if (port.prediction.mode === "corrections") {
			if (!port.prediction.parentLocationId || port.prediction.parentLocationId === port.locationId) throw new Error(`${port.name} needs a different parent standard port.`);
			const correction = port.prediction.corrections;
			if (!correction || !Array.isArray(correction.highWaterTimeOffsets) || !Array.isArray(correction.lowWaterTimeOffsets)) throw new Error(`${port.name} needs complete entered corrections.`);
			for (const point of [...correction.highWaterTimeOffsets,...correction.lowWaterTimeOffsets]) {
				if (!Number.isFinite(point?.referenceTimeMinutes) || !Number.isFinite(point?.offsetMinutes)) throw new Error(`${port.name} needs numeric times and differences in all four time-correction columns.`);
			}
			for (const key of ["mhws","mhwn","mlwn","mlws"]) if (!Number.isFinite(correction.heightDifferencesM?.[key])) throw new Error(`${port.name} needs all four height differences.`);
		}
	}
	for (const port of value.ports.filter((entry) => entry.prediction.mode === "corrections")) {
		const parent = value.ports.find((entry) => entry.locationId === port.prediction.parentLocationId);
		if (!parent || parent.kind !== "standard" || parent.prediction.mode !== "provider") throw new Error(`${port.name} must use a provider-backed standard port as its parent.`);
	}
	for (const port of value.ports.filter((entry) => entry.automaticPreferredPortLocationId)) {
		const preferred = value.ports.find((entry) => entry.locationId === port.automaticPreferredPortLocationId);
		if (!preferred || preferred.prediction.mode !== "provider") {
			throw new Error(`${port.name} must prefer an existing provider-backed port.`);
		}
	}
	const areaIds = new Set();
	for (const area of value.areas) {
		if (!area?.locationId || areaIds.has(area.locationId)) throw new Error("Each tidal area needs one unique Location id.");
		areaIds.add(area.locationId);
		if (!area.name || !ids.has(area.portLocationId)) throw new Error(`${area.name || area.locationId} needs a valid serving tidal port.`);
		if (area.parentAreaLocationId === area.locationId) throw new Error(`${area.name} cannot be its own parent tidal region.`);
	}
	for (const area of value.areas) {
		if (area.parentAreaLocationId && !areaIds.has(area.parentAreaLocationId)) throw new Error(`${area.name} refers to an unknown parent tidal region.`);
		const seen = new Set([area.locationId]);
		let parentId = area.parentAreaLocationId;
		while (parentId) {
			if (seen.has(parentId)) throw new Error(`${area.name} creates a cycle in the tidal-region hierarchy.`);
			seen.add(parentId);
			parentId = value.areas.find((entry) => entry.locationId === parentId)?.parentAreaLocationId || null;
		}
	}
	return value;
}

function migrationSnapshot(value) {
	if (Object.hasOwn(value || {},"gates") && !Array.isArray(value.gates)) throw new Error("Legacy tidal-gate migration data is invalid; refusing to discard it.");
	if (Object.hasOwn(value || {},"gateTombstones") && !Array.isArray(value.gateTombstones)) throw new Error("Legacy tidal-gate tombstone migration data is invalid; refusing to discard it.");
	const gates = Array.isArray(value?.gates) ? structuredClone(value.gates) : [];
	const gateTombstones = Array.isArray(value?.gateTombstones) ? structuredClone(value.gateTombstones) : [];
	if (!gates.length && !gateTombstones.length) return null;
	return {
		contract:MIGRATION_CONTRACT,
		contractVersion:1,
		sourceDefinitionsContract:typeof value.contract === "string" ? value.contract : null,
		sourceUpdatedAt:typeof value.updatedAt === "string" ? value.updatedAt : null,
		gates,
		gateTombstones,
	};
}

function mergeBundledDefinitions(current, bundled) {
	const next = validate(activeCatalogue(current));
	const incoming = validate(activeCatalogue(bundled));
	const portById = new Map(next.ports.map((entry) => [entry.locationId, entry]));
	for (const bundledPort of incoming.ports) {
		const existing = portById.get(bundledPort.locationId);
		if (!existing) {
			next.ports.push(structuredClone(bundledPort));
		} else {
			const rename = SAFE_NAME_RENAMES[bundledPort.locationId];
			if (rename && existing.name === rename.from && bundledPort.name === rename.to) existing.name = rename.to;
			const backfill = SAFE_PORT_BACKFILLS[bundledPort.locationId];
			const bundledLevels = bundledPort.referenceLevels;
			if (backfill
				&& existing.referenceLevels == null
				&& existing.prediction?.providerId === backfill.providerId
				&& existing.prediction?.stationId === backfill.stationId
				&& ["mhws","mhwn","mlwn","mlws"].every((key) => Number.isFinite(bundledLevels?.[key]))) {
				existing.referenceLevels = structuredClone(bundledLevels);
			}
		}
	}
	const areaById = new Map(next.areas.map((entry) => [entry.locationId, entry]));
	for (const area of incoming.areas) {
		const existing = areaById.get(area.locationId);
		if (!existing) {
			next.areas.push(structuredClone(area));
			continue;
		}
		const rename = SAFE_NAME_RENAMES[area.locationId];
		if (rename && existing.name === rename.from && area.name === rename.to) existing.name = rename.to;
	}
	return validate(next);
}

function createDefinitionStore(filename, bundled) {
	let current;
	let pendingMigration = null;
	let mutationQueue = Promise.resolve();

	function writeSync(value) {
		fs.mkdirSync(path.dirname(filename), { recursive:true });
		const temporary = `${filename}.${process.pid}.seed.tmp`;
		fs.writeFileSync(temporary, `${JSON.stringify(value,null,2)}\n`, { mode:0o600 });
		fs.renameSync(temporary, filename);
	}

	try {
		const storedSource = JSON.parse(fs.readFileSync(filename,"utf8"));
		if (![LEGACY_CONTRACT,CONTRACT].includes(storedSource?.contract)) throw new Error("Tidal definition catalogue is invalid.");
		pendingMigration = migrationSnapshot(storedSource);
		const stored = validate(activeCatalogue(storedSource));
		current = mergeBundledDefinitions(stored, bundled);
		if (!pendingMigration && JSON.stringify(current) !== JSON.stringify(storedSource)) writeSync(current);
	}
	catch (error) {
		if (error.code !== "ENOENT") throw error;
		current = validate(activeCatalogue(bundled));
	}

	async function writeAtomic(value) {
		await fsp.mkdir(path.dirname(filename),{ recursive:true });
		const temporary = `${filename}.${process.pid}.${randomUUID()}.tmp`;
		try {
			await fsp.writeFile(temporary,`${JSON.stringify(value,null,2)}\n`,{ mode:0o600 });
			await fsp.rename(temporary,filename);
		} catch (error) {
			await fsp.rm(temporary,{ force:true }).catch(() => {});
			throw error;
		}
	}

	async function persist(next) {
		const validated = validate({ ...structuredClone(next), contract:CONTRACT, contractVersion:2, updatedAt:new Date().toISOString() });
		const stored = pendingMigration
			? { ...structuredClone(validated), contract:LEGACY_CONTRACT, contractVersion:1, gates:structuredClone(pendingMigration.gates), gateTombstones:structuredClone(pendingMigration.gateTombstones) }
			: validated;
		await writeAtomic(stored);
		current = validated;
		return read();
	}

	function mutate(change) {
		const operation = mutationQueue.then(() => {
			const next = read();
			change(next);
			return persist(next);
		});
		mutationQueue = operation.catch(() => {});
		return operation;
	}

	function read() { return structuredClone(current); }
	function readGateMigration() { return pendingMigration ? structuredClone(pendingMigration) : null; }

	async function completeGateMigration() {
		const operation = mutationQueue.then(async () => {
			if (!pendingMigration) return { ok:true, completed:false, gateCount:0, tombstoneCount:0 };
			const gateCount = pendingMigration.gates.length;
			const tombstoneCount = pendingMigration.gateTombstones.length;
			const validated = validate({ ...read(), updatedAt:new Date().toISOString() });
			await writeAtomic(validated);
			current = validated;
			pendingMigration = null;
			return { ok:true, completed:true, gateCount, tombstoneCount };
		});
		mutationQueue = operation.catch(() => {});
		return operation;
	}

	async function setPort(port) {
		return mutate((next) => {
			const index=next.ports.findIndex((entry)=>entry.locationId===port.locationId);
			if(index<0) next.ports.push(port); else next.ports[index]=port;
		});
	}
	async function removePort(locationId) {
		return mutate((next) => {
			if(next.ports.some((entry)=>entry.prediction?.parentLocationId===locationId)) throw new Error("This standard port is the parent of one or more secondary ports.");
			next.ports=next.ports.filter((entry)=>entry.locationId!==locationId);
			next.areas=next.areas.filter((entry)=>entry.portLocationId!==locationId);
		});
	}
	async function setArea(area) {
		return mutate((next) => {
			const index=next.areas.findIndex((entry)=>entry.locationId===area.locationId);
			if(index<0) next.areas.push(area); else next.areas[index]=area;
		});
	}
	async function removeArea(locationId) {
		return mutate((next) => {
			if(next.areas.some((entry)=>entry.parentAreaLocationId===locationId)) throw new Error("This tidal region is the parent of one or more smaller regions.");
			next.areas=next.areas.filter((entry)=>entry.locationId!==locationId);
		});
	}
	return Object.freeze({ completeGateMigration, read, readGateMigration, removeArea, removePort, setArea, setPort });
}

module.exports = { CONTRACT, LEGACY_CONTRACT, MIGRATION_CONTRACT, createDefinitionStore, mergeBundledDefinitions, validate };
