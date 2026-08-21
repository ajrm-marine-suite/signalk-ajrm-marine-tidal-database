/** Renders the Tidal Database cache, provider and port-definition status tables. */

const state = { status: null, definitions: null, locations: [] };
const API_BASE = "/plugins/signalk-ajrm-marine-tidal-database";
const LOCATION_API = "/plugins/signalk-ajrm-marine-location-editor";
const byId = (id) => document.getElementById(id);

function text(value) { return value == null || value === "" ? "—" : String(value); }
function time(value) { return value ? new Date(value).toLocaleString() : "Never"; }
function escapeHtml(value) { return text(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }
function stateBadge(value) { return `<span class="state ${escapeHtml(value)}">${escapeHtml(value).replaceAll("-", " ")}</span>`; }

function render() {
	const status = state.status;
	if (!status) return;
	const summary = status.summary;
	byId("summary").innerHTML = [
		["Provider stations", summary.stationCount], ["Cached", summary.cachedCount], ["Covering now", summary.coveredCount],
		["Due", summary.dueCount], ["Errors", summary.errorCount], ["Refresh floor", "24 hours"],
	].map(([label, value]) => `<article class="card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
	renderStations();
	renderPorts();
}

function renderStations() {
	const query = byId("stationFilter").value.trim().toLowerCase();
	byId("stations").innerHTML = state.status.stations.filter((entry) => JSON.stringify(entry).toLowerCase().includes(query)).map((entry) => {
		const condition = entry.lastError ? "error" : entry.due ? "due" : entry.coveredNow ? "ready" : "cached-outside-coverage";
		const usedBy = entry.ports.map((port) => port.name).join(", ");
		return `<tr><td><strong>${escapeHtml(entry.stationName)}</strong><br><span class="muted">${escapeHtml(entry.stationId)}</span></td><td>${escapeHtml(entry.providerName)}<br><span class="muted">${entry.configured ? "configured" : "key required"}; ${entry.persistent ? "disk-backed" : "memory only"}</span></td><td>${escapeHtml(usedBy)}</td><td>${escapeHtml(time(entry.fetchedAt))}</td><td>${escapeHtml(time(entry.coverageStartAt))}<br>${escapeHtml(time(entry.coverageEndAt))}</td><td>${escapeHtml(entry.eventCount)}</td><td>${stateBadge(condition)}${entry.lastError ? `<br>${escapeHtml(entry.lastError)}` : ""}</td></tr>`;
	}).join("");
}

function renderPorts() {
	const query = byId("portFilter").value.trim().toLowerCase();
	byId("ports").innerHTML = state.status.ports.filter((entry) => JSON.stringify(entry).toLowerCase().includes(query)).map((entry) => `<tr><td><strong>${escapeHtml(entry.name)}</strong><br><span class="muted">${escapeHtml(entry.locationId)}</span></td><td>${escapeHtml(entry.kind)}</td><td>${escapeHtml(entry.predictionMode === "corrections" ? "Entered corrections" : entry.predictionMode === "provider" ? "Provider events" : "Not configured")}</td><td>${escapeHtml(entry.providerId)} ${escapeHtml(entry.stationId)}</td><td>${escapeHtml(entry.parent?.name)}</td><td>${stateBadge(entry.status)}</td><td><button type="button" class="edit-port" data-location-id="${escapeHtml(entry.locationId)}">Edit</button></td></tr>`).join("");
	for (const button of document.querySelectorAll(".edit-port")) button.addEventListener("click", () => openDefinition(button.dataset.locationId));
}

async function load() {
	const [statusResponse,definitionResponse,locationResponse] = await Promise.all([
		fetch(`${API_BASE}/status`, { credentials:"include", cache:"no-store" }),
		fetch(`${API_BASE}/definitions`, { credentials:"include", cache:"no-store" }),
		fetch(`${LOCATION_API}/locations?workspace=tides`, { credentials:"include", cache:"no-store" }),
	]);
	if (!statusResponse.ok) throw new Error(`Status request failed (${statusResponse.status}).`);
	if (!definitionResponse.ok) throw new Error(`Definition request failed (${definitionResponse.status}).`);
	state.status = await statusResponse.json();
	state.definitions = await definitionResponse.json();
	state.locations = locationResponse.ok ? normalizeLocations(await locationResponse.json()) : [];
	render();
}

function normalizeLocations(value) {
	const values = Array.isArray(value) ? value : value.locations || [];
	return values.filter((entry) => (entry.types || []).some((type) => type === "tidalStandardPort" || type === "tidalSecondaryPort"));
}

function numberOrNull(id) { const value = byId(id).value; return value === "" ? null : Number(value); }
function minutes(value) { if (!value) return null; const [hour,minute] = value.split(":").map(Number); return hour * 60 + minute; }
function clock(value) { if (!Number.isFinite(Number(value))) return ""; const total = ((Number(value) % 1440) + 1440) % 1440; return `${String(Math.floor(total / 60)).padStart(2,"0")}:${String(total % 60).padStart(2,"0")}`; }
function setValue(id,value) { byId(id).value = value == null ? "" : value; }

function renderDefinitionChoices(selectedId = "") {
	const existing = new Set((state.definitions?.ports || []).map((entry) => entry.locationId));
	const locationsById = new Map(state.locations.map((entry) => [entry.id,entry]));
	for (const port of state.definitions?.ports || []) if (!locationsById.has(port.locationId)) locationsById.set(port.locationId,{ id:port.locationId,name:port.name });
	const locations = [...locationsById.values()].sort((a,b) => String(a.name).localeCompare(String(b.name)));
	byId("definitionLocation").innerHTML = locations.map((entry) => `<option value="${escapeHtml(entry.id)}" ${entry.id === selectedId ? "selected" : ""}>${escapeHtml(entry.name)}${existing.has(entry.id) && entry.id !== selectedId ? " (configured)" : ""}</option>`).join("");
	const standardPorts = (state.definitions?.ports || []).filter((entry) => entry.kind === "standard" && entry.prediction.mode === "provider");
	byId("parentPortId").innerHTML = standardPorts.map((entry) => `<option value="${escapeHtml(entry.locationId)}">${escapeHtml(entry.name)}</option>`).join("");
}

function updateDefinitionFields() {
	const mode = byId("definitionMode").value;
	byId("providerFields").hidden = mode !== "provider";
	byId("correctionFields").hidden = mode !== "corrections";
	byId("heightDifferenceFields").hidden = mode !== "corrections";
	if (mode === "corrections") byId("definitionKind").value = "secondary";
}

function openDefinition(locationId = "") {
	const definition = (state.definitions?.ports || []).find((entry) => entry.locationId === locationId) || null;
	renderDefinitionChoices(locationId);
	const location = state.locations.find((entry) => entry.id === locationId);
	setValue("definitionLocation",locationId || state.locations.find((entry) => !(state.definitions?.ports || []).some((port) => port.locationId === entry.id))?.id || "");
	setValue("definitionName",definition?.name || location?.name || "");
	setValue("definitionKind",definition?.kind || "secondary");
	setValue("definitionMode",definition?.prediction?.mode || "unavailable");
	setValue("providerId",definition?.prediction?.providerId || "ukhoTidalEvents");
	setValue("stationId",definition?.prediction?.stationId);
	setValue("stationName",definition?.prediction?.stationName);
	setValue("parentPortId",definition?.prediction?.parentLocationId);
	const corrections = definition?.prediction?.corrections || {};
	const high = corrections.highWaterTimeOffsets || [];
	const low = corrections.lowWaterTimeOffsets || [];
	setValue("hwTime1",clock(high[0]?.referenceTimeMinutes)); setValue("hwOffset1",high[0]?.offsetMinutes);
	setValue("hwTime2",clock(high[1]?.referenceTimeMinutes)); setValue("hwOffset2",high[1]?.offsetMinutes);
	setValue("lwTime1",clock(low[0]?.referenceTimeMinutes)); setValue("lwOffset1",low[0]?.offsetMinutes);
	setValue("lwTime2",clock(low[1]?.referenceTimeMinutes)); setValue("lwOffset2",low[1]?.offsetMinutes);
	setValue("definitionDatum",definition?.datum);
	for (const [id,key] of [["mhws","mhws"],["mhwn","mhwn"],["mlwn","mlwn"],["mlws","mlws"]]) setValue(id,definition?.referenceLevels?.[key]);
	for (const [id,key] of [["diffMhws","mhws"],["diffMhwn","mhwn"],["diffMlwn","mlwn"],["diffMlws","mlws"]]) setValue(id,corrections.heightDifferencesM?.[key]);
	byId("deleteDefinition").hidden = !definition;
	byId("definitionLocation").disabled = Boolean(definition);
	updateDefinitionFields();
	byId("definitionDialog").showModal();
}

function buildDefinition() {
	const locationId = byId("definitionLocation").value;
	const mode = byId("definitionMode").value;
	const referenceLevels = Object.fromEntries([["mhws","mhws"],["mhwn","mhwn"],["mlwn","mlwn"],["mlws","mlws"]].map(([key,id]) => [key,numberOrNull(id)]));
	const definition = { locationId, name:byId("definitionName").value.trim(), kind:byId("definitionKind").value, datum:byId("definitionDatum").value.trim() || null, referenceLevels, prediction:{ mode } };
	if (mode === "provider") Object.assign(definition.prediction,{ providerId:byId("providerId").value, stationId:byId("stationId").value.trim(), stationName:byId("stationName").value.trim() || definition.name });
	if (mode === "corrections") {
		definition.kind = "secondary";
		Object.assign(definition.prediction,{ parentLocationId:byId("parentPortId").value, corrections:{
			contract:"ajrm-secondary-port-corrections-v4", timeOffsetPeriodMinutes:720,
			highWaterTimeOffsets:[{ referenceTimeMinutes:minutes(byId("hwTime1").value), offsetMinutes:numberOrNull("hwOffset1") },{ referenceTimeMinutes:minutes(byId("hwTime2").value), offsetMinutes:numberOrNull("hwOffset2") }],
			lowWaterTimeOffsets:[{ referenceTimeMinutes:minutes(byId("lwTime1").value), offsetMinutes:numberOrNull("lwOffset1") },{ referenceTimeMinutes:minutes(byId("lwTime2").value), offsetMinutes:numberOrNull("lwOffset2") }],
			heightDifferencesM:{ mhws:numberOrNull("diffMhws"), mhwn:numberOrNull("diffMhwn"), mlwn:numberOrNull("diffMlwn"), mlws:numberOrNull("diffMlws") },
		} });
	}
	return definition;
}

async function busy(button, task, message) {
	button.disabled = true;
	button.classList.add("busy");
	byId("message").className = "message";
	byId("message").textContent = message;
	try { await task(); byId("message").textContent = "Tidal database status updated."; }
	catch (error) { byId("message").className = "message error"; byId("message").textContent = error.message; }
	finally { button.disabled = false; button.classList.remove("busy"); }
}

byId("refreshStatus").addEventListener("click", (event) => busy(event.currentTarget, load, "Refreshing status…"));
byId("updateDue").addEventListener("click", (event) => busy(event.currentTarget, async () => {
	const response = await fetch(`${API_BASE}/stations/update`, { method:"POST", credentials:"include", headers:{ "Content-Type":"application/json" }, body:"{}" });
	if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || `Update failed (${response.status}).`);
	state.status = await response.json(); render();
}, "Updating stations that are more than 24 hours old…"));
byId("stationFilter").addEventListener("input", renderStations);
byId("portFilter").addEventListener("input", renderPorts);
byId("newDefinition").addEventListener("click", () => openDefinition());
byId("definitionMode").addEventListener("change", updateDefinitionFields);
byId("definitionLocation").addEventListener("change", () => { const location=state.locations.find((entry)=>entry.id===byId("definitionLocation").value); if(location) setValue("definitionName",location.name); });
for (const id of ["closeDefinition","cancelDefinition"]) byId(id).addEventListener("click", () => byId("definitionDialog").close());
byId("definitionForm").addEventListener("submit", (event) => {
	event.preventDefault();
	busy(byId("saveDefinition"),async () => {
		const definition=buildDefinition();
		const response=await fetch(`${API_BASE}/definitions/ports/${encodeURIComponent(definition.locationId)}`,{ method:"PUT",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify(definition) });
		if(!response.ok) throw new Error((await response.json().catch(()=>null))?.error || `Save failed (${response.status}).`);
		byId("definitionDialog").close(); await load();
	},"Saving tidal definition…");
});
byId("deleteDefinition").addEventListener("click", () => {
	const locationId=byId("definitionLocation").value;
	if(!confirm(`Remove the tidal prediction definition for ${byId("definitionName").value}? The spatial Location is retained.`)) return;
	busy(byId("deleteDefinition"),async () => {
		const response=await fetch(`${API_BASE}/definitions/ports/${encodeURIComponent(locationId)}`,{ method:"DELETE",credentials:"include" });
		if(!response.ok) throw new Error((await response.json().catch(()=>null))?.error || `Remove failed (${response.status}).`);
		byId("definitionDialog").close(); await load();
	},"Removing tidal definition…");
});
load().catch((error) => { byId("message").className = "message error"; byId("message").textContent = error.message; });
