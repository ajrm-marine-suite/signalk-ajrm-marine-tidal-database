/** Selects the appropriate tidal port from Location geometry and Tidal Database area mappings. */

function pointInRing(position, ring) {
	let inside = false;
	for (let left = 0, right = ring.length - 1; left < ring.length; right = left++) {
		const [x1, y1] = ring[left];
		const [x2, y2] = ring[right];
		const intersects = ((y1 > position.latitude) !== (y2 > position.latitude)) &&
			(position.longitude < (x2 - x1) * (position.latitude - y1) / ((y2 - y1) || Number.EPSILON) + x1);
		if (intersects) inside = !inside;
	}
	return inside;
}

function contains(location, position) {
	const geometry = location?.feature?.geometry;
	if (!geometry || !position) return false;
	if (geometry.type === "Polygon") {
		return pointInRing(position, geometry.coordinates[0]) &&
			!geometry.coordinates.slice(1).some((ring) => pointInRing(position, ring));
	}
	if (geometry.type === "MultiPolygon") {
		return geometry.coordinates.some((polygon) => pointInRing(position, polygon[0]) &&
			!polygon.slice(1).some((ring) => pointInRing(position, ring)));
	}
	return false;
}

function representativePosition(location) {
	const geometry = location?.feature?.geometry;
	if (geometry?.type === "Point") return { longitude: geometry.coordinates[0], latitude: geometry.coordinates[1] };
	const ring = geometry?.type === "Polygon" ? geometry.coordinates[0] : geometry?.type === "MultiPolygon" ? geometry.coordinates[0]?.[0] : null;
	if (!ring?.length) return null;
	const points = ring.slice(0, -1);
	return {
		longitude: points.reduce((sum, point) => sum + point[0], 0) / points.length,
		latitude: points.reduce((sum, point) => sum + point[1], 0) / points.length,
	};
}

function areaSize(location) {
	const ring = location?.feature?.geometry?.type === "Polygon" ? location.feature.geometry.coordinates[0] : [];
	if (ring.length < 4) return Infinity;
	return Math.abs(ring.slice(0, -1).reduce((sum, point, index) => {
		const next = ring[(index + 1) % (ring.length - 1)];
		return sum + point[0] * next[1] - next[0] * point[1];
	}, 0) / 2);
}

function distanceM(left, right) {
	const latitudeM = (left.latitude - right.latitude) * 111320;
	const longitudeM = (left.longitude - right.longitude) * 111320 * Math.cos((left.latitude + right.latitude) * Math.PI / 360);
	return Math.hypot(latitudeM, longitudeM);
}

function automaticPreference(port, ports) {
	const preferredId = port?.automaticPreferredPortLocationId;
	const preferred = preferredId ? ports.get(preferredId) : null;
	return preferred?.prediction?.mode === "provider"
		? { port: preferred, replaced: port }
		: { port, replaced: null };
}

function selectPort(definitions, locations, request = {}) {
	const byLocationId = new Map(locations.map((location) => [location.id, location]));
	const ports = new Map(definitions.ports.map((port) => [port.locationId, port]));
	const requestedId = request.portId || request.pinnedPortId;
	if (requestedId && ports.has(requestedId)) {
		return { port: ports.get(requestedId), reason: request.portId ? "selected" : "pinned", pinned: !request.portId };
	}
	if (!request.position) return { port: null, reason: "no-position", pinned: false };
	const containing = definitions.areas
		.map((area) => ({ area, location: byLocationId.get(area.locationId) }))
		.filter(({ area, location }) => ports.has(area.portLocationId) && contains(location, request.position))
		.sort((left, right) => areaSize(left.location) - areaSize(right.location));
	if (containing.length) {
		const selected = automaticPreference(ports.get(containing[0].area.portLocationId), ports);
		return {
			port: selected.port,
			reason: selected.replaced ? "preferred-direct-provider" : "containing-tidal-area",
			pinned: false,
			area: containing[0].area,
			automaticPreference: selected.replaced ? { id:selected.replaced.locationId, name:selected.replaced.name } : null,
		};
	}
	const nearest = definitions.ports
		.filter((port) => port.prediction.mode !== "unavailable")
		.map((port) => ({ port, position: representativePosition(byLocationId.get(port.locationId)) }))
		.filter((entry) => entry.position)
		.sort((left, right) => distanceM(left.position, request.position) - distanceM(right.position, request.position))[0];
	const selected = automaticPreference(nearest?.port || null, ports);
	return {
		port: selected.port || null,
		reason: selected.replaced ? "preferred-direct-provider" : nearest ? "nearest-prediction-port" : "no-port",
		pinned: false,
		automaticPreference: selected.replaced ? { id:selected.replaced.locationId, name:selected.replaced.name } : null,
	};
}

function recommendSecondary(definitions, locations, position) {
	if (!position) return { port:null, tidalRegion:null, reason:"no-position" };
	const byLocationId = new Map(locations.map((location) => [location.id, location]));
	const areaById = new Map(definitions.areas.map((area) => [area.locationId, area]));
	const containing = definitions.areas
		.map((area) => ({ area, location:byLocationId.get(area.locationId) }))
		.filter(({ location }) => contains(location, position))
		.sort((left,right) => areaSize(left.location) - areaSize(right.location));
	if (!containing.length) return { port:null, tidalRegion:null, reason:"outside-tidal-areas" };
	const region = containing.at(-1).area;
	function belongs(area) {
		const seen = new Set();
		for (let current = area; current && !seen.has(current.locationId); current = areaById.get(current.parentAreaLocationId)) {
			if (current.locationId === region.locationId) return true;
			seen.add(current.locationId);
		}
		return false;
	}
	const secondaryIds = new Set(definitions.ports.filter((port) => port.kind === "secondary" && port.prediction.mode !== "unavailable").map((port) => port.locationId));
	const candidates = definitions.areas.filter((area) => secondaryIds.has(area.portLocationId) && belongs(area))
		.map((area) => {
			const port = definitions.ports.find((entry) => entry.locationId === area.portLocationId);
			const point = representativePosition(byLocationId.get(port.locationId));
			return point ? { port, distanceM:distanceM(point,position) } : null;
		}).filter(Boolean).sort((left,right) => left.distanceM - right.distanceM);
	const ports = new Map(definitions.ports.map((port) => [port.locationId, port]));
	const selected = automaticPreference(candidates[0]?.port || null, ports);
	return {
		port:selected.port || null,
		tidalRegion:region,
		distanceM:candidates[0]?.distanceM || null,
		reason:selected.replaced ? "preferredDirectProviderInTidalRegion" : candidates.length ? "nearestSecondaryPortInTidalRegion" : "no-secondary-in-region",
		automaticPreference:selected.replaced ? { id:selected.replaced.locationId, name:selected.replaced.name } : null,
	};
}

module.exports = { contains, recommendSecondary, selectPort };
