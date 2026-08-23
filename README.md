# AJRM Marine Tidal Database

Signal K tidal-data service for AJRM Marine Suite. It separates tidal provider access, station mappings, entered secondary-port corrections and cached predictions from the spatial Location Editor.

The active definitions contract is `ajrm-marine-tidal-database-definitions-v2`.
It contains tidal ports and tidal-region relationships only. Tidal-gate
constants and their editing, calculation, import, export and merge workflow
belong to AJRM Marine Planning.

## Responsibilities

- **Location Editor** owns names, coordinates, geometry and location type, including the spatial records for tidal gates, and presents joined tidal-region assignment controls.
- **Tidal Database** owns prediction providers, credentials, station mappings, secondary-port correction tables, tidal-region serving-port and parent-region relationships, cached events and tidal calculations.
- **Marine Planning** owns tidal-gate constants, revisions, calculations and data-management operations.
- **Display and Marine Planning** consume the Tidal Database service; they do not fetch or cache provider data themselves.
- **Weather Database** is the peer service for weather providers, cache and forecasts.

The plugin exposes `app.ajrmMarineTidalDatabase` and
`Symbol.for("mcdonaldajr.ajrmMarineTidalDatabase")` with additive contract
`ajrm-marine-tidal-database-service-v1`. It provides tide status/refresh,
database status, port and area definitions, regional selection, maintenance and
port pinning. Its web API retains the `ajrm-marine-tide-resolver-v1` projection
consumed by the suite.

## One-time gate migration

If an older durable definitions file still contains gate records or deletion
tombstones, the plugin excludes them from its active definitions, normal service,
HTTP API, status and diagnostics. It exposes the preserved payload only through
the bounded process-local registry
`globalThis[Symbol.for("mcdonaldajr.ajrmMarineTidalGateMigration")]`, contract
`ajrm-marine-tidal-to-planning-gate-migration-v1`.

The registry's synchronous `read()` and `snapshot()` methods return the migration
envelope. `complete()` and its `ack()` alias atomically rewrite the durable Tidal
Database definitions file as v2 with no gate payload. Planning must acknowledge
only after it has imported, persisted and verified the complete live-record and
tombstone state. Until that acknowledgement, later port/area edits continue to
preserve the quarantined payload durably. Fresh installations create no migration
registry.

## Offline and refresh behaviour

Each provider station is fetched only when it has no usable record or its last successful fetch is **more than 24 hours old**. Repeated manual refreshes do not bypass this floor. Automatic maintenance checks hourly and covers all configured stations, not merely the currently selected route or vessel area. Locally entered secondary ports reuse their parent station cache and perform no provider request.

If a provider cannot be reached, the latest permitted disk-backed record remains available and the provider enters a one-hour retry backoff. Calls are serialized and spaced by five seconds by default; a 429 stops alternate-endpoint retries and honours UKHO's `Retry-After` response. Concurrent requests for one station share one fetch.

UKHO responses are retained on disk so ordinary restarts and offline operation do not repeat requests. Discovery records are scoped to the UTC calendar/licence year in which they were fetched and are rejected at the year boundary; Foundation and Premium records are retained under their configured subscription. All tiers still use the same 24-hour minimum refresh floor.

## Setup

For the v0.7 ownership upgrade, install Marine Location Editor first, Marine
Planning second, then Tidal Database, and restart Signal K only after all three
packages are installed. That provides coordinated spatial deletion and ensures
the migration receiver is present before the retired active gate API is
removed. Configure the provider
key and subscription tier in Signal K **Server → Plugin Config → AJRM Marine
Tidal Database**. Open the Tidal Database webapp to inspect station coverage,
update due stations, and edit prediction settings for tidal-port Locations.
Select the tide icon at the left of any port to inspect its current height, next
high/low water, source freshness, spring/neap estimate and interactive
one-to-seven-day curve. Tidal-port rows, spatial Location choices, parent-port
choices and each station's Used by Locations are listed alphabetically by name,
with natural numeric ordering. Moving the cursor over the graph shows the same
interpolated time and height as Display. Port position and geometry continue to
be edited only in Location Editor.

Automatic preference is explicit catalogue data, not fuzzy name matching.
Package catalogues normally add genuinely missing IDs only, and existing
durable port and area records win. The one bounded exception is the v0.7.1
Oban display-name migration: it changes only the two stable Oban IDs while
their names still exactly match the prior bundled names; customised names are
preserved.

```sh
cd ~/.signalk
npm install git+https://github.com/ajrm-marine-suite/signalk-ajrm-marine-location-editor.git#v0.7.1 --omit=dev --no-package-lock
npm install git+https://github.com/ajrm-marine-suite/signalk-ajrm-marine-planning.git#v0.10.1 --omit=dev --no-package-lock
npm install git+https://github.com/ajrm-marine-suite/signalk-ajrm-marine-tidal-database.git#v0.7.2 --omit=dev --no-package-lock
sudo systemctl restart signalk
```

Tidal predictions assist planning but are not a substitute for current official publications, local observations or the skipper’s judgement.
