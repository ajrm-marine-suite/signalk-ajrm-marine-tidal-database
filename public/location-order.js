/** Shared deterministic ordering for user-visible Location lists. */

(function exposeLocationOrder(root, factory) {
	const api = factory();
	if (typeof module === "object" && module.exports) module.exports = api;
	else root.AJRMLocationOrder = api;
})(typeof globalThis === "object" ? globalThis : this, function createLocationOrder() {
	const nameCollator = new Intl.Collator("en-GB", { usage:"sort", sensitivity:"base", numeric:true });

	function displayName(entry) {
		return entry?.name == null ? "" : String(entry.name);
	}

	function locationId(entry) {
		if (entry?.locationId != null) return String(entry.locationId);
		return entry?.id == null ? "" : String(entry.id);
	}

	function deterministicText(left, right) {
		return left < right ? -1 : left > right ? 1 : 0;
	}

	function compareLocationsByName(left, right) {
		const byName = nameCollator.compare(displayName(left), displayName(right));
		if (byName) return byName;
		const byId = deterministicText(locationId(left), locationId(right));
		if (byId) return byId;
		return deterministicText(displayName(left), displayName(right));
	}

	function sortLocationsByName(entries) {
		return Array.from(entries || [], (entry, index) => ({ entry, index }))
			.sort((left, right) => compareLocationsByName(left.entry, right.entry) || left.index - right.index)
			.map(({ entry }) => entry);
	}

	return Object.freeze({ compareLocationsByName, sortLocationsByName });
});
