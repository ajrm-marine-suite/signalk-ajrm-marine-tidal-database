/** Implements the first provider adapter for UKHO high/low-water event predictions. */

const { normalizeTideEvents } = require("../tide-calculation.cjs");

const ENDPOINTS = [
	"https://admiraltyapi.azure-api.net/uktidalapi/v1/Stations",
	"https://admiraltyapi.azure-api.net/uktidalapi/api/v1/Stations",
];

function createUkhoProvider(options = {}) {
	const fetchFn = options.fetchFn || globalThis.fetch;
	return Object.freeze({
		id: "ukhoTidalEvents",
		name: "UK Hydrographic Office Tidal API",
		configured: Boolean(options.apiKey),
		persistentCachePermitted: ["foundation", "premium"].includes(String(options.subscriptionTier || "discovery").toLowerCase()),
		async fetchEvents(station) {
			if (!options.apiKey) throw new Error("Configure a UKHO Tidal API subscription key in Tidal Database.");
			let lastError;
			for (const endpoint of ENDPOINTS) {
				try {
					const response = await fetchFn(`${endpoint}/${encodeURIComponent(station.stationId)}/TidalEvents`, {
						headers: { "Ocp-Apim-Subscription-Key": options.apiKey },
						signal: AbortSignal.timeout(15000),
					});
					if (!response.ok) throw new Error(`UKHO Tidal API returned ${response.status} ${response.statusText}.`);
					const events = normalizeTideEvents(await response.json());
					if (events.length < 2) throw new Error("UKHO Tidal API returned insufficient high/low-water events.");
					return { events, timestampContract: "ukho-gmt-v1" };
				} catch (error) {
					lastError = error;
				}
			}
			throw lastError || new Error("UKHO Tidal API did not respond.");
		},
	});
}

module.exports = { createUkhoProvider };
