/** Renders the Tidal Database cache, provider and port-definition status tables. */

const state = { status: null, definitions: null, locations: [], tide: null, tidePortId: null, tideHover: null };
const API_BASE = "/plugins/signalk-ajrm-marine-tidal-database";
const LOCATION_API = "/plugins/signalk-ajrm-marine-location-editor";
const TIDE_GRAPH_DAYS_KEY = "ajrmMarineTidalDatabase.tideGraphDays";
const TIDE_DIALOG_SIZE_KEY = "ajrmMarineTidalDatabase.tideDialogSize";
const tideCurveTools = import("./tide-curve.mjs?v=0.1.13");
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
		const capabilities=entry.eventCapabilities || {}, eventLabel=capabilities.completeExtrema ? `${entry.eventCount} high/low` : capabilities.highWater ? `${entry.eventCount} high only` : capabilities.lowWater ? `${entry.eventCount} low only` : `${entry.eventCount}`;
		return `<tr><td><strong>${escapeHtml(entry.stationName)}</strong><br><span class="muted">${escapeHtml(entry.stationId)}</span></td><td>${escapeHtml(entry.providerName)}<br><span class="muted">${entry.configured ? "configured" : "key required"}; ${entry.persistent ? "disk-backed" : "memory only"}</span></td><td>${escapeHtml(usedBy)}</td><td>${escapeHtml(time(entry.fetchedAt))}</td><td>${escapeHtml(time(entry.coverageStartAt))}<br>${escapeHtml(time(entry.coverageEndAt))}</td><td>${escapeHtml(eventLabel)}</td><td>${stateBadge(condition)}${entry.lastError ? `<br>${escapeHtml(entry.lastError)}` : ""}</td></tr>`;
	}).join("");
}

function renderPorts() {
	const query = byId("portFilter").value.trim().toLowerCase();
	byId("ports").innerHTML = state.status.ports.filter((entry) => JSON.stringify(entry).toLowerCase().includes(query)).map((entry) => `<tr><td><button type="button" class="view-tide" data-location-id="${escapeHtml(entry.locationId)}" title="View and validate the tidal prediction for ${escapeHtml(entry.name)}" aria-label="View tidal prediction for ${escapeHtml(entry.name)}">≈</button></td><td><strong>${escapeHtml(entry.name)}</strong>${entry.advisory ? `<br><span class="state caution">${escapeHtml(entry.advisory.status)}</span> <span class="muted">${escapeHtml(entry.advisory.message)}</span>` : ""}<br><span class="muted">${escapeHtml(entry.locationId)}</span></td><td>${escapeHtml(entry.kind)}</td><td>${escapeHtml(entry.predictionMode === "corrections" ? "Entered corrections" : entry.predictionMode === "provider" ? "Provider events" : "Not configured")}</td><td>${escapeHtml(entry.providerId)} ${escapeHtml(entry.stationId)}</td><td>${escapeHtml(entry.parent?.name)}</td><td>${stateBadge(entry.status)}</td><td><button type="button" class="edit-port" data-location-id="${escapeHtml(entry.locationId)}">Edit</button></td></tr>`).join("");
	for (const button of document.querySelectorAll(".view-tide")) button.addEventListener("click", () => openTide(button.dataset.locationId));
	for (const button of document.querySelectorAll(".edit-port")) button.addEventListener("click", () => openDefinition(button.dataset.locationId));
}

function height(value) { return value != null && Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)} m` : "—"; }
function eventTime(value) { return value && !Number.isNaN(Date.parse(value)) ? new Intl.DateTimeFormat(undefined,{ weekday:"short",hour:"2-digit",minute:"2-digit",timeZoneName:"short" }).format(new Date(value)) : "—"; }
function phaseName(index) { return ((index % 2) + 2) % 2 === 0 ? "spring" : "neap"; }
function springNeap(now = Date.now()) {
	const dayMs=86400000, interval=(29.530588853/4)*dayMs, epoch=Date.UTC(2000,0,6,18,15), at=new Date(now).getTime();
	if (!Number.isFinite(at)) return null;
	const index=Math.floor((at-epoch)/interval), previousAt=epoch+index*interval, nextAt=previousAt+interval;
	const previous=phaseName(index), next=phaseName(index+1), daysAfter=(at-previousAt)/dayMs, daysBefore=(nextAt-at)/dayMs;
	const near=daysAfter<=.5?previous:daysBefore<=.5?next:null;
	return { status:near?`Near ${near} tides`:next==="spring"?"Building toward spring tides":"Easing toward neap tides", timing:`${Math.max(0,daysAfter).toFixed(1)} days after ${previous}; ${Math.max(0,daysBefore).toFixed(1)} days before ${next}` };
}

function showTideTab(name) {
	const details=name==="details";
	byId("tideDetailsPane").hidden=!details;
	byId("tideGraphPane").hidden=details;
	for (const [id,active] of [["tideDetailsTab",details],["tideGraphTab",!details]]) {
		byId(id).classList.toggle("active",active); byId(id).setAttribute("aria-selected",String(active));
	}
}

async function renderTideProjection() {
	const tide=state.tide, valid=tide?.valid===true, name=tide?.selectedPort?.name || state.status?.ports.find((entry)=>entry.locationId===state.tidePortId)?.name || "No tidal port";
	byId("tideDialogTitle").textContent=`Tidal prediction — ${name}`;
	byId("tideDetailsPortName").textContent=name;
	byId("tideGraphPortName").textContent=`${name} — tidal curve`;
	const availability=tide?.availability || {}, hasEvents=availability.highWater || availability.lowWater;
	byId("tideUnavailable").hidden=valid && !tide?.advisory;
	byId("tideUnavailable").textContent=[valid?null:tide?.error || "No valid tidal prediction is available.",tide?.advisory?.message].filter(Boolean).join(" ");
	byId("tideHeightNow").textContent=valid?height(tide.heightNowM):"—";
	byId("tideTrend").textContent=valid?tide.trend || "—":"—";
	byId("tideNextHigh").textContent=availability.nextHighWater&&tide.nextHighWater?`${eventTime(tide.nextHighWater.at)} · ${height(tide.nextHighWater.heightM)}`:"—";
	byId("tideNextLow").textContent=availability.nextLowWater&&tide.nextLowWater?`${eventTime(tide.nextLowWater.at)} · ${height(tide.nextLowWater.heightM)}`:"—";
	const fall=valid&&Number.isFinite(Number(tide.heightNowM))&&Number.isFinite(Number(tide.nextLowWater?.heightM))?Number(tide.heightNowM)-Number(tide.nextLowWater.heightM):null;
	byId("tideDistanceToFall").textContent=height(fall);
	byId("tideDatum").textContent=(valid||hasEvents)?tide.datum || "—":"—";
	byId("tideStation").textContent=(valid||hasEvents)&&tide.station?`${tide.station.name} (${tide.station.id})`:"—";
	const age=Number.isFinite(Number(tide?.freshness?.ageSeconds))?`${(Number(tide.freshness.ageSeconds)/3600).toFixed(1)} h old`:"age unknown";
	byId("tideSourceFreshness").textContent=(valid||hasEvents)&&tide.source?`${tide.source.provider} · ${tide.freshness?.state || "unknown"} · ${age}`:"—";
	const phase=springNeap(tide?.calculationReferenceAt || Date.now());
	byId("tideSpringNeapStatus").textContent=phase?.status || "—";
	byId("tideSpringNeapTiming").textContent=phase?.timing || "—";
	const tools=await tideCurveTools, days=tools.tideGraphDays(byId("tideGraphDays").value), events=tools.tideCurveEventsForDays(tide?.curve || [],tide?.calculationReferenceAt || Date.now(),days);
	state.tideHover?.destroy();
	byId("tideCurve").innerHTML=tools.tideCurveSvg(events,tide?.calculationReferenceAt || Date.now(),valid?tide.referenceLevels:null);
	state.tideHover=tools.attachTideCurveHover(byId("tideCurve"),events);
}

async function requestTide(locationId,{ refresh=false }={}) {
	state.tidePortId=locationId;
	const url=refresh?`${API_BASE}/tides/refresh`:`${API_BASE}/tides/status?portId=${encodeURIComponent(locationId)}`;
	const response=await fetch(url,{ method:refresh?"POST":"GET",credentials:"include",cache:"no-store",headers:refresh?{ "Content-Type":"application/json" }:undefined,body:refresh?JSON.stringify({ portId:locationId }):undefined });
	const body=await response.json().catch(()=>({}));
	if(!response.ok) throw new Error(body.error || `Tidal prediction request failed (${response.status}).`);
	state.tide=body; await renderTideProjection();
}

async function openTide(locationId) {
	state.tide={ valid:false,selectedPort:{ id:locationId,name:state.status?.ports.find((entry)=>entry.locationId===locationId)?.name },curve:[],error:"Loading tidal prediction…" };
	showTideTab("details"); byId("tideDialog").showModal(); await renderTideProjection();
	try { await requestTide(locationId); } catch(error) { state.tide={ ...state.tide,error:error.message }; await renderTideProjection(); }
}

function restoreTideDialogSize() {
	try {
		const size=JSON.parse(localStorage.getItem(TIDE_DIALOG_SIZE_KEY));
		if(Number.isFinite(size?.width)&&Number.isFinite(size?.height)) {
			byId("tideDialog").style.width=`${Math.min(size.width,window.innerWidth-24)}px`;
			byId("tideDialog").style.height=`${Math.min(size.height,window.innerHeight-24)}px`;
		}
	} catch { localStorage.removeItem(TIDE_DIALOG_SIZE_KEY); }
}

function saveTideDialogSize() {
	const bounds=byId("tideDialog").getBoundingClientRect();
	if(bounds.width>0&&bounds.height>0) localStorage.setItem(TIDE_DIALOG_SIZE_KEY,JSON.stringify({ width:Math.round(bounds.width),height:Math.round(bounds.height) }));
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
	if (mode === "corrections") byId("definitionKind").value = "secondary";
	const secondary = byId("definitionKind").value === "secondary";
	byId("providerFields").hidden = mode !== "provider";
	byId("correctionFields").hidden = mode !== "corrections";
	byId("heightDifferenceFields").hidden = mode !== "corrections";
	byId("absoluteReferenceFields").hidden = secondary;
	byId("definitionKind").disabled = mode === "corrections";
}

function openDefinition(locationId = "") {
	const definition = (state.definitions?.ports || []).find((entry) => entry.locationId === locationId) || null;
	renderDefinitionChoices(locationId);
	const location = state.locations.find((entry) => entry.id === locationId);
	setValue("definitionLocation",locationId || state.locations.find((entry) => !(state.definitions?.ports || []).some((port) => port.locationId === entry.id))?.id || "");
	setValue("definitionLocationName",location?.name || definition?.name || "");
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
	byId("definitionLocationChoice").hidden = Boolean(definition);
	byId("definitionLocationReadOnly").hidden = !definition;
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
		definition.datum = null;
		definition.referenceLevels = null;
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
byId("definitionKind").addEventListener("change", updateDefinitionFields);
byId("definitionLocation").addEventListener("change", () => { const location=state.locations.find((entry)=>entry.id===byId("definitionLocation").value); if(location) setValue("definitionName",location.name); });
for (const id of ["closeDefinition","cancelDefinition"]) byId(id).addEventListener("click", () => byId("definitionDialog").close());
for (const id of ["closeTide","closeTideBottom"]) byId(id).addEventListener("click", () => byId("tideDialog").close());
byId("tideDialog").addEventListener("close",()=>{ saveTideDialogSize(); state.tideHover?.destroy(); state.tideHover=null; });
byId("tideDetailsTab").addEventListener("click",()=>showTideTab("details"));
byId("tideGraphTab").addEventListener("click",()=>showTideTab("graph"));
byId("tideGraphDays").value=String(Math.max(1,Math.min(7,Number(localStorage.getItem(TIDE_GRAPH_DAYS_KEY))||7)));
byId("tideGraphDays").addEventListener("change",()=>{ localStorage.setItem(TIDE_GRAPH_DAYS_KEY,byId("tideGraphDays").value); renderTideProjection(); });
byId("refreshTide").addEventListener("click",(event)=>busy(event.currentTarget,()=>requestTide(state.tidePortId,{ refresh:true }),"Refreshing the selected station if it is due…"));
restoreTideDialogSize();
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
