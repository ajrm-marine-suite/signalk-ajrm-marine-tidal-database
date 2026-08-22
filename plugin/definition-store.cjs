/** Persists editable tidal prediction, correction, area and gate definitions separately from Locations. */

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { normalizeGate, validateGateV2 } = require("./gate-contract.cjs");

const CONTRACT = "ajrm-marine-tidal-database-definitions-v1";

function validate(value) {
	if (value?.contract !== CONTRACT || !Array.isArray(value.ports) || !Array.isArray(value.areas) || !Array.isArray(value.gates)) throw new Error("Tidal definition catalogue is invalid.");
	value = structuredClone(value);
	if (value.gateTombstones === undefined) value.gateTombstones = [];
	if (!Array.isArray(value.gateTombstones)) throw new Error("Tidal-gate tombstones must be an array.");
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
	const gateIds = new Set();
	value.gates = value.gates.map((entry) => normalizeGate(entry));
	for (const gate of value.gates) {
		validateGateV2(gate);
		if (gateIds.has(gate.locationId)) throw new Error(`More than one tidal gate uses Location id ${gate.locationId}.`);
		gateIds.add(gate.locationId);
		const referencePort = value.ports.find((entry) => entry.locationId === gate.reference.portLocationId);
		if (!referencePort || referencePort.kind !== "standard") throw new Error(`Gate ${gate.locationId} needs an existing standard reference port.`);
	}
	const tombstoneIds = new Set();
	for (const tombstone of value.gateTombstones) {
		if (!tombstone || typeof tombstone.locationId !== "string" || !tombstone.locationId.trim()) throw new Error("Each tidal-gate tombstone needs a Location id.");
		if (tombstoneIds.has(tombstone.locationId)) throw new Error(`More than one tidal-gate tombstone uses Location id ${tombstone.locationId}.`);
		if (gateIds.has(tombstone.locationId)) throw new Error(`Tidal gate ${tombstone.locationId} cannot be both live and deleted.`);
		if (!Number.isInteger(tombstone.revision) || tombstone.revision < 1) throw new Error(`Tidal-gate tombstone ${tombstone.locationId} needs the deleted positive revision.`);
		if (typeof tombstone.deletedAt !== "string" || Number.isNaN(Date.parse(tombstone.deletedAt))) throw new Error(`Tidal-gate tombstone ${tombstone.locationId} needs a valid deletion time.`);
		tombstoneIds.add(tombstone.locationId);
	}
	return value;
}

function mergeBundledDefinitions(current, bundled) {
	const next = validate(current);
	const incoming = validate({ ...structuredClone(bundled), contract: CONTRACT });
	const portById = new Map(next.ports.map((entry) => [entry.locationId, entry]));
	for (const bundledPort of incoming.ports) {
		const existing = portById.get(bundledPort.locationId);
		if (!existing) {
			next.ports.push(structuredClone(bundledPort));
		}
	}
	for (const key of ["areas", "gates"]) {
		const ids = new Set(next[key].map((entry) => entry.locationId || entry.id));
		for (const entry of incoming[key]) {
			const id = entry.locationId || entry.id;
			if (key === "gates" && next.gateTombstones.some((tombstone) => tombstone.locationId === id)) continue;
			if (!ids.has(id)) next[key].push(structuredClone(entry));
		}
	}
	return validate(next);
}

function createDefinitionStore(filename, bundled) {
	let current;
	let mutationQueue = Promise.resolve();
	try {
		const storedSource = JSON.parse(fs.readFileSync(filename,"utf8"));
		const stored = validate(storedSource);
		current = mergeBundledDefinitions(stored, bundled);
		if (JSON.stringify(current) !== JSON.stringify(storedSource)) {
			fs.mkdirSync(path.dirname(filename), { recursive:true });
			const temporary = `${filename}.${process.pid}.seed.tmp`;
			fs.writeFileSync(temporary, `${JSON.stringify(current,null,2)}\n`, { mode:0o600 });
			fs.renameSync(temporary, filename);
		}
	}
	catch (error) {
		if (error.code !== "ENOENT") throw error;
		current = validate({ ...structuredClone(bundled), contract:CONTRACT });
	}
	async function persist(next) {
		const validated = validate({ ...structuredClone(next), contract:CONTRACT, updatedAt:new Date().toISOString() });
		await fsp.mkdir(path.dirname(filename),{ recursive:true });
		const temporary = `${filename}.${process.pid}.${randomUUID()}.tmp`;
		try {
			await fsp.writeFile(temporary,`${JSON.stringify(validated,null,2)}\n`,{ mode:0o600 });
			await fsp.rename(temporary,filename);
		} catch (error) {
			await fsp.rm(temporary,{ force:true }).catch(() => {});
			throw error;
		}
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
	async function setGate(gate) {
		const normalized = validateGateV2(gate);
		return mutate((next) => {
			const index = next.gates.findIndex((entry) => entry.locationId === normalized.locationId);
			const tombstoneIndex = next.gateTombstones.findIndex((entry) => entry.locationId === normalized.locationId);
			if (index < 0) {
				const expectedRevision = tombstoneIndex < 0 ? 1 : next.gateTombstones[tombstoneIndex].revision + 1;
				if (normalized.revision !== expectedRevision) throw new Error(`A ${tombstoneIndex < 0 ? "new" : "restored"} tidal-gate definition must use revision ${expectedRevision}.`);
				if (tombstoneIndex >= 0) next.gateTombstones.splice(tombstoneIndex,1);
				next.gates.push(normalized);
			} else {
				if (normalized.revision !== next.gates[index].revision + 1) throw new Error(`Tidal-gate revision conflict; expected revision ${next.gates[index].revision + 1}.`);
				next.gates[index] = normalized;
			}
		});
	}
	async function removeGate(locationId, expectedRevision) {
		return mutate((next) => {
			const existing = next.gates.find((entry) => entry.locationId === locationId);
			if (!existing) throw new Error("The tidal-gate definition does not exist.");
			if (!Number.isInteger(expectedRevision) || expectedRevision !== existing.revision) throw new Error(`Tidal-gate revision conflict; expected current revision ${existing.revision}.`);
			next.gates = next.gates.filter((entry) => entry.locationId !== locationId);
			next.gateTombstones.push({ locationId, revision:existing.revision + 1, deletedAt:new Date().toISOString() });
		});
	}
	return Object.freeze({ read, removeArea, removeGate, removePort, setArea, setGate, setPort });
}

module.exports = { CONTRACT, createDefinitionStore, mergeBundledDefinitions, validate };
