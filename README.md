# AJRM Marine Tidal Database

Signal K tidal-data service for AJRM Marine Suite. It separates tidal provider access, station mappings, entered secondary-port corrections and cached predictions from the spatial Location Editor.

> This software is Alpha Release and has not been tested in live environments and must not be relied upon for navigation or safety. The Authors do not accept any responsibility for loss or damage as a result of using this software.

The active definitions contract is `ajrm-marine-tidal-database-definitions-v3`.
It contains tidal ports and tidal-region relationships only. Tidal-gate
constants and their editing, calculation, import, export and merge workflow
belong to AJRM Marine Planning. Durable definitions store only an explicit
`cachedLocationName` fallback; joined APIs expose the current Location-owned
`name`, its `nameSource` and the `locationJoin` state. A cached label is used
only when the Location service or record is unavailable and is never editable
as a second name.

## Responsibilities

- **Location Editor** owns names, coordinates, geometry and location type, including the spatial records for tidal gates, and presents joined tidal-region assignment controls.
- **Tidal Database** owns prediction providers, credentials, station mappings, secondary-port correction tables, tidal-region serving-port and parent-region relationships, cached events and tidal calculations.
- **Marine Planning** owns the flat tidal-gate calculation constants and their insert, update, delete, calculation, export, import and merge operations. It does not retain per-row revision history or tombstones.
- **Display and Marine Planning** consume the Tidal Database service; they do not fetch or cache provider data themselves.
- **Weather Database** is the peer service for weather providers, cache and forecasts.

The plugin exposes `app.ajrmMarineTidalDatabase` and
`Symbol.for("mcdonaldajr.ajrmMarineTidalDatabase")` with contract
`ajrm-marine-tidal-database-service-v2`. Its asynchronous `listPorts()` and
`listAreas()` methods return Location-joined definitions. Status uses
`ajrm-marine-tidal-database-status-v2`; read-only diagnostic snapshots use
`ajrm-marine-tidal-database-diagnostics-v2`. These v2 contracts deliberately
correct the breaking v0.7 removal of gate fields from the former v1 surfaces.
The tide projection itself remains `ajrm-marine-tide-resolver-v1` because its
shape and semantics did not change. HTTP reads register with Signal K's
`readonly` scope; updates register as `readwrite`, retain an explicit mutation
guard and remain available locally when Signal K security is disabled.

## One-time gate migration

If an older durable definitions file still contains gate records or deletion
tombstones, the plugin excludes them from its active definitions, normal service,
HTTP API, status and diagnostics. It exposes the preserved payload only through
the bounded process-local registry
`globalThis[Symbol.for("mcdonaldajr.ajrmMarineTidalGateMigration")]`, contract
`ajrm-marine-tidal-to-planning-gate-migration-v1`.

The registry's synchronous `read()` and `snapshot()` methods return the migration
envelope. `complete()` and its `ack()` alias atomically rewrite the durable Tidal
Database definitions file as v3 with no gate payload. Planning must acknowledge
only after it has imported, persisted and verified the complete live-record and
tombstone state. Until that acknowledgement, later port/area edits continue to
preserve the quarantined payload durably in a genuine v1 definitions envelope
with legacy `name` fields, so a rollback to v0.7.2 can still reopen it. The file
advances to v3 only after acknowledgement. Fresh installations create no
migration registry.

## Offline and refresh behaviour

Each provider station is fetched only when it has no usable record or its last successful fetch is **more than 24 hours old**. Repeated manual refreshes do not bypass this floor. Automatic maintenance checks hourly and covers all configured stations, not merely the currently selected route or vessel area. Locally entered secondary ports reuse their parent station cache and perform no provider request.

If a provider cannot be reached, the latest permitted disk-backed record remains available and the provider enters a one-hour retry backoff. Calls are serialized and spaced by five seconds by default; a 429 stops alternate-endpoint retries and honours UKHO's `Retry-After` response. Concurrent requests for one station share one fetch.

UKHO responses are retained on disk so ordinary restarts and offline operation do not repeat requests. Discovery records are scoped to the UTC calendar/licence year in which they were fetched and are rejected at the year boundary; Foundation and Premium records are retained under their configured subscription. All tiers still use the same 24-hour minimum refresh floor.

## Setup

For the breaking v0.8 contract correction, install Marine Location Editor first,
Marine Planning second, then Tidal Database, and restart Signal K only after all
three packages are installed. Do not mix the old v1 Tidal service with current
consumers. This order also ensures the one-time gate migration receiver is
present. Configure the provider
key and subscription tier in Signal K **Server → Plugin Config → AJRM Marine
Tidal Database**. Open the Tidal Database webapp to inspect station coverage,
Location-join health, update due stations, and edit prediction settings for
tidal-port Locations. Names and port classifications are read-only here and are
edited in Location Editor. Every write validates the Location id, current name
and required classification; each port must have exactly one standard or
secondary tidal-port type. Missing or mismatched joins are reported as degraded
and cannot be selected for a tide calculation. A corrected secondary is also
excluded from status provenance, recommendations and resolution unless its
complete operational parent chain ends at a provider-backed standard port;
tidal regions served by an excluded port are excluded from automatic selection.
Select the tide icon at the left of any port to inspect its current height, next
high/low water, source freshness, spring/neap estimate and interactive
one-to-seven-day curve. Tidal-port rows, spatial Location choices, parent-port
choices and each station's Used by Locations are listed alphabetically by name,
with natural numeric ordering. Moving the cursor over the graph shows the same
interpolated time and height as Display. Port position and geometry continue to
be edited only in Location Editor.

Automatic preference is explicit catalogue data, not fuzzy name matching.
Package catalogues normally add genuinely missing IDs only, and existing
durable port and area settings win. On upgrade, v1/v2 definition names migrate
losslessly to explicit cached labels and are then refreshed from the matching
Location whenever Location Editor is available.

```sh
cd ~/.signalk
npm install git+https://github.com/ajrm-marine-suite/signalk-ajrm-marine-location-editor.git#v0.7.2 --omit=dev --no-package-lock
npm install git+https://github.com/ajrm-marine-suite/signalk-ajrm-marine-planning.git#v0.10.2 --omit=dev --no-package-lock
npm install git+https://github.com/ajrm-marine-suite/signalk-ajrm-marine-tidal-database.git#v0.8.0 --omit=dev --no-package-lock
sudo systemctl restart signalk
```

Tidal predictions assist planning but are not a substitute for current official publications, local observations or the skipper’s judgement.
