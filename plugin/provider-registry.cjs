/** Registers explicitly identified tide-provider adapters without leaking provider details into consumers. */

function createProviderRegistry(providers = []) {
	const byId = new Map(providers.map((provider) => [provider.id, provider]));
	return Object.freeze({
		get(id) {
			const provider = byId.get(id);
			if (!provider) throw new Error(`Tidal provider ${id || "not specified"} is not installed.`);
			return provider;
		},
		list() {
			return [...byId.values()].map(({ id, name, configured, persistentCachePermitted }) => ({
				id, name, configured, persistentCachePermitted,
			}));
		},
	});
}

module.exports = { createProviderRegistry };
