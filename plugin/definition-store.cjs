/** Persists editable tidal prediction, correction, area and gate definitions separately from Locations. */

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const CONTRACT = "ajrm-marine-tidal-database-definitions-v1";

function validate(value) {
	if (value?.contract !== CONTRACT || !Array.isArray(value.ports) || !Array.isArray(value.areas) || !Array.isArray(value.gates)) throw new Error("Tidal definition catalogue is invalid.");
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
	return structuredClone(value);
}

function mergeBundledDefinitions(current, bundled) {
	const next = structuredClone(current);
	const portById = new Map(next.ports.map((entry) => [entry.locationId, entry]));
	for (const bundledPort of bundled.ports || []) {
		const existing = portById.get(bundledPort.locationId);
		if (!existing) {
			next.ports.push(structuredClone(bundledPort));
			continue;
		}
		// These package-authored fields express safety and automatic-selection
		// policy. User-entered corrections and provider details remain untouched.
		for (const key of ["automaticPreferredPortLocationId", "advisory"]) {
			if (Object.hasOwn(bundledPort, key)) existing[key] = structuredClone(bundledPort[key]);
		}
	}
	{
		const ids = new Set(next.areas.map((entry) => entry.locationId || entry.id));
		for (const entry of bundled.areas || []) {
			const id = entry.locationId || entry.id;
			if (!ids.has(id)) next.areas.push(structuredClone(entry));
		}
	}
	const bundledGateImport = typeof bundled.gateCatalogueImport === "string" ? bundled.gateCatalogueImport : "";
	if (bundledGateImport && next.gateCatalogueImport !== bundledGateImport) {
		// This explicit migration replaces incompatible gate contracts once. The
		// marker then prevents later package starts from overwriting user edits.
		next.gates = structuredClone(bundled.gates || []);
		next.gateCatalogueImport = bundledGateImport;
		if (Array.isArray(next.gateTombstones)) {
			const importedIds = new Set(next.gates.map((entry) => entry.locationId || entry.id));
			next.gateTombstones = next.gateTombstones.filter((entry) => !importedIds.has(entry.locationId || entry.id));
		}
	}
	else {
		const ids = new Set(next.gates.map((entry) => entry.locationId || entry.id));
		for (const entry of bundled.gates || []) {
			const id = entry.locationId || entry.id;
			if (!ids.has(id)) next.gates.push(structuredClone(entry));
		}
	}
	return validate(next);
}

function createDefinitionStore(filename, bundled) {
	let current;
	try {
		const stored = validate(JSON.parse(fs.readFileSync(filename,"utf8")));
		current = mergeBundledDefinitions(stored, bundled);
		if (JSON.stringify(current) !== JSON.stringify(stored)) {
			fs.mkdirSync(path.dirname(filename), { recursive:true });
			if (current.gateCatalogueImport && current.gateCatalogueImport !== stored.gateCatalogueImport) {
				const backup = `${filename}.before-gate-catalogue-import.backup`;
				if (!fs.existsSync(backup)) {
					fs.copyFileSync(filename, backup);
					fs.chmodSync(backup, 0o600);
				}
			}
			const temporary = `${filename}.${process.pid}.seed.tmp`;
			fs.writeFileSync(temporary, `${JSON.stringify(current,null,2)}\n`, { mode:0o600 });
			fs.renameSync(temporary, filename);
		}
	}
	catch (error) {
		if (error.code !== "ENOENT") throw error;
		current = validate({ ...structuredClone(bundled), contract:CONTRACT });
	}
	async function save(next) {
		current = validate({ ...structuredClone(next), contract:CONTRACT, updatedAt:new Date().toISOString() });
		await fsp.mkdir(path.dirname(filename),{ recursive:true });
		const temporary = `${filename}.${process.pid}.tmp`;
		await fsp.writeFile(temporary,`${JSON.stringify(current,null,2)}\n`,{ mode:0o600 });
		await fsp.rename(temporary,filename);
		return read();
	}
	function read() { return structuredClone(current); }
	async function setPort(port) {
		const next=read(); const index=next.ports.findIndex((entry)=>entry.locationId===port.locationId);
		if(index<0) next.ports.push(port); else next.ports[index]=port;
		return save(next);
	}
	async function removePort(locationId) {
		const next=read();
		if(next.ports.some((entry)=>entry.prediction?.parentLocationId===locationId)) throw new Error("This standard port is the parent of one or more secondary ports.");
		next.ports=next.ports.filter((entry)=>entry.locationId!==locationId);
		next.areas=next.areas.filter((entry)=>entry.portLocationId!==locationId);
		return save(next);
	}
	async function setArea(area) {
		const next=read(); const index=next.areas.findIndex((entry)=>entry.locationId===area.locationId);
		if(index<0) next.areas.push(area); else next.areas[index]=area;
		return save(next);
	}
	async function removeArea(locationId) {
		const next=read();
		if(next.areas.some((entry)=>entry.parentAreaLocationId===locationId)) throw new Error("This tidal region is the parent of one or more smaller regions.");
		next.areas=next.areas.filter((entry)=>entry.locationId!==locationId);
		return save(next);
	}
	return Object.freeze({ read, removeArea, removePort, save, setArea, setPort });
}

module.exports = { CONTRACT, createDefinitionStore, mergeBundledDefinitions, validate };
