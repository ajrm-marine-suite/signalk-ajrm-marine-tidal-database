# AJRM Marine Tidal Database

Signal K tidal-data service for AJRM Marine Suite. It separates tidal provider access, station mappings, entered secondary-port corrections and cached predictions from the spatial Location Editor.

Version 0.1.19 adds explicit operational-with-assumptions profiles for all 17
completed source-reviewed named-channel records. The original evidence records
remain preserved for inspection. The profiles turn reviewed published guidance
into estimated planning inputs with visible assumptions for bearings, regime
copying, slack placement, rate scope and the sine/interpolation model. None of
these values is definitive; all must be taken with a pinch of salt and checked
against current official information and observed conditions.

## Responsibilities

- **Location Editor** owns names, coordinates, geometry and location type, and presents joined tidal-region assignment controls.
- **Tidal Database** owns prediction providers, credentials, station mappings, secondary-port correction tables, tidal-region serving-port and parent-region relationships, versioned gate timing/stream observations, cached events and tidal calculations.
- **Display and Marine Planning** consume the Tidal Database service; they do not fetch or cache provider data themselves.
- **Weather Database** is the peer service for weather providers, cache and forecasts.

The plugin exposes `app.ajrmMarineTidalDatabase` and `Symbol.for("mcdonaldajr.ajrmMarineTidalDatabase")` with additive contract `ajrm-marine-tidal-database-service-v1`. The service advertises gate contract v2 and exposes `getGateCatalogue()`, definition-only `listGates()`, `getGate()`, revisioned `setGate()`/`removeGate()` and catalogue diagnostics. Its web API retains the `ajrm-marine-tide-resolver-v1` projection consumed by the suite.

## Tidal-gate contract

The v2 contract uses stable gate and reference-port Location IDs, explicit HW
or LW references, independent named turns, true current-towards bearings,
spring/neap timing states, unambiguous slack variants and direction/regime/
locality-specific rate observations with units, bounds and qualifiers. It also
stores structured citation metadata, review, cautions, hazards, uncertainty and
readiness without embedding publication page text.

Strict evidence-backed operational records retain the positive v2 eligibility
rules. Completed reviews may additionally publish a separately identified
`operational-with-assumptions` profile. That profile never changes the retained
source record or turns an approximate/bounded statement into a definitive fact;
Planning must display its warning and assumptions with the calculation.

Unknown and unavailable values never become zero or the other regime's value.
Planning must use the catalogue's computed `operationalLocationIds`; stored
readiness alone does not bypass Location joins or reference-port capability.
Where an estimated operational profile is present, its scalar model input is
kept explicitly separate from the approximate, bounded, up-to, more-than or
named-locality observation that informed it.

See [AJRM tidal-gate constants v2](docs/tidal-gate-contract-v2.md) and the
plugin's OpenAPI document for the full representation, migration semantics,
effective readiness rules and revisioned GET/PUT/DELETE boundary. Gate timing
mutation belongs here; Location Editor continues to own spatial records only.
The compact [Segment 3A source review](docs/tidal-gate-source-review-segment-3a.md)
maps the reviewed photographs, imported facts and withheld southeast-Coll
candidate without copying publication prose. The [Segment 3B source review](docs/tidal-gate-source-review-segment-3b.md)
records the corrected heading-to-image index, locality separation and withheld
south-end Tiree candidate. The [Segment 4 source review](docs/tidal-gate-source-review-segment-4.md)
separates the two Sound of Mull timing regimes, their spatial anchors and the
conflicting legacy records. The [Segment 5A source review](docs/tidal-gate-source-review-segment-5a.md)
records the corrected Corran/Loch Eil/Loch Leven image index, separates the
Loch Leven narrows from Caolas nan Con and documents both fail-closed joins.
The [Segment 5B source review](docs/tidal-gate-source-review-segment-5b.md)
records the Caolas nan Con derivation, the complete Lynn locality split and
the legacy Sound of Mull conflict without changing prior records.
The [Segment 6A source review](docs/tidal-gate-source-review-segment-6a.md)
records the corrected two-file offset, Loch Feochan's asymmetric entrance
cycle, the Firth's progressive fairway turns and every separate rate locality.
The [Segment 6B source review](docs/tidal-gate-source-review-segment-6b.md)
records the corrected Cuan/Grey Dogs image index, positive operational
assessment, passage/locality rate limits and turn-ambiguous Grey Dogs slack.
The [Segment 7A source review](docs/tidal-gate-source-review-segment-7a.md)
records the corrected Corryvreckan heading index, distinct OS named-sea join,
legacy conflict, direction/regime/slack/rate scope, physical hazards and the
complete positive operational-eligibility failure.
The [Segment 7B source review](docs/tidal-gate-source-review-segment-7b.md)
records the Sound of Luing column boundary, the incomplete Dorus Mòr heading
and continuation index, distinct OS joins, exact direction/regime/slack/rate
scope, structured hazards and both complete positive eligibility failures.

## Offline and refresh behaviour

Each provider station is fetched only when it has no usable record or its last successful fetch is **more than 24 hours old**. Repeated manual refreshes do not bypass this floor. Automatic maintenance checks hourly and covers all configured stations, not merely the currently selected route or vessel area. Locally entered secondary ports reuse their parent station cache and perform no provider request.

If a provider cannot be reached, the latest permitted disk-backed record remains available and the provider enters a one-hour retry backoff. Calls are serialized and spaced by five seconds by default; a 429 stops alternate-endpoint retries and honours UKHO's `Retry-After` response. Concurrent requests for one station share one fetch.

UKHO responses are retained on disk so ordinary restarts and offline operation do not repeat requests. Discovery records are scoped to the UTC calendar/licence year in which they were fetched and are rejected at the year boundary; Foundation and Premium records are retained under their configured subscription. All tiers still use the same 24-hour minimum refresh floor.

## Setup

Install and enable AJRM Marine Location Editor first, then this plugin. Configure the provider key and subscription tier in Signal K **Server → Plugin Config → AJRM Marine Tidal Database**. Open the Tidal Database webapp to inspect station coverage, update due stations, and edit prediction settings for tidal-port Locations. Select the tide icon at the left of any port to inspect its current height, next high/low water, source freshness, spring/neap estimate and interactive one-to-seven-day curve. Port position and geometry continue to be edited only in Location Editor.

Automatic preference is explicit catalogue data, not fuzzy name matching.
Package catalogues add genuinely missing IDs only. Existing durable port,
area and gate records always win, so a changed bundle cannot overwrite local
edits. An explicit gate deletion leaves a revisioned tombstone, preventing a
bundled seed from recreating it on restart; deletion consumes a revision and an
explicit restore must advance that deleted revision. Existing v1 gates are migrated losslessly and retain
their complete raw record under compatibility metadata.

```sh
cd ~/.signalk
npm install git+https://github.com/ajrm-marine-suite/signalk-ajrm-marine-tidal-database.git#v0.1.19 --omit=dev --no-package-lock
sudo systemctl restart signalk
```

Tidal predictions assist planning but are not a substitute for current official publications, local observations or the skipper’s judgement.
