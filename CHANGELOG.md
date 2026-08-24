# Changelog

## 0.8.1 — 2026-08-24

- Retain the 24 hours of cached historical extrema preceding each successful
  due provider refresh, while making the fresh response authoritative from its
  first event onward and pruning every older cached event at that refresh.
- Normalize, deduplicate and sort the merged station events, recompute their
  coverage, and persist the complete result so Planning can use the preceding
  tide cycle for current-day midnight coverage.
- Leave the previous cache unchanged when refresh or persistence fails, never
  carry cached future predictions over a fresh response, and retain the
  Discovery licence-year boundary.

## 0.8.0 — 2026-08-23

- Advance the intentionally breaking in-process service, published/HTTP status
  and diagnostic snapshot surfaces to explicit v2 contracts after gate
  ownership was removed; retain the unchanged tide resolver v1 projection.
- Advance durable definitions to v3, migrate v1/v2 `name` values losslessly to
  explicit `cachedLocationName` fallbacks, and expose current Location-owned
  names as read-only joined values with their source and join health.
- Make service port/area lists asynchronous, validate Location ids, names and
  exactly one standard/secondary classification before writes, report missing
  or mismatched joins as degraded, and recursively exclude corrected
  secondaries whose Location-valid parent chain does not end at a
  provider-backed standard port from status provenance, recommendations and
  resolution.
- Keep a pending gate-migration file genuinely v1 and rollback-compatible after
  name-cache, port or area writes by serializing legacy `name` fields until
  Planning acknowledges the complete migration.
- Remove duplicate name and port-class editing from the webapp, complete the
  OpenAPI operation/request/response/error/auth schemas including `/stations`,
  register reads with Signal K `readonly` and mutations with `readwrite`, and
  verify scopes plus documented HTTP method/path parity in tests.
- Move the Map Core development dependency and lock entry to public HTTPS and
  bundle Map Core v0.7.15.

## 0.7.2 — 2026-08-23

- List tidal-port Locations alphabetically in the port table, spatial Location
  and parent-port selectors, and station Used by summaries, using
  case-insensitive natural numeric ordering with deterministic Location-id
  tie-breaking.
- Keep the shared cursor time-and-height readout visible above the native tide
  graph dialog, using the same interpolation and formatting as Display.

## 0.7.1 — 2026-08-23

- Rename the bundled Oban standard prediction-port definition to `Oban port`
  and its assigned tidal area to `Oban port tidal area`, preserving their
  Location UUID joins.
- Upgrade only definitions that still have the exact prior bundled names, so
  locally customised names remain untouched.

## 0.7.0 — 2026-08-23

- Move durable tidal-gate constants, source reviews, operational assumptions,
  contracts and mutation APIs out of Tidal Database; AJRM Marine Planning now
  owns that data and workflow, while Location Editor remains the spatial owner.
- Advance active Tidal definitions to
  `ajrm-marine-tidal-database-definitions-v2`, containing ports and tidal-region
  relationships only, and remove gate data from normal service, HTTP, status,
  diagnostics, OpenAPI and package payloads.
- Preserve deployed gate edits and deletion tombstones in a bounded one-time
  migration registry until Planning explicitly acknowledges a verified import;
  acknowledgement atomically rewrites the Tidal definitions file without the
  quarantined payload.

## 0.1.21 — 2026-08-22

- Backfill the provisional Greenock reference range when upgrading an exact
  prior bundled Greenock station record whose range is still blank, allowing
  the Sanda Sound and close-west Mull profiles to become operational on
  existing installations as well as fresh installs.
- Preserve any user-entered Greenock reference range and refuse the backfill
  when the provider or station identity has been changed.

## 0.1.20 — 2026-08-22

- Add seven source-reviewed native-v2 records for Sound of Jura, west of
  Islay, Sound of Islay, West Loch Tarbert on Jura, Sound of Gigha, Sanda
  Sound and close west of the Mull of Kintyre.
- Make all seven immediately calculable through visible estimated profiles,
  including explicit provisional rate assumptions where the source supplies
  no neap rate or no rate at all; every calculation warns users to take it
  with a pinch of salt.
- Use Greenock as the stated reference for the two Mull of Kintyre localities
  and add a provisional Greenock reference range so the interpolation model
  can operate, while retaining the raw evidence and all safety hazards for
  inspection.
- Preserve the legacy Mull of Kintyre and Sound of Islay records unchanged and
  raise the completed operational-with-assumptions set from 17 to 24 gates.

## 0.1.19 — 2026-08-22

- Add explicit operational-with-assumptions profiles for all 17 completed
  source-reviewed named-channel records while preserving their original
  reference-only evidence records byte-for-byte under `sourceReview`.
- Publish estimated bearings, turn inputs, slack placement, rates and flow/
  interpolation models separately from source facts; estimated rates use the
  `approximate` qualifier and are never described as definitive.
- Expose the 17 profiles through the effective operational allow-list, retain
  all cautions, hazards and uncertainty, and leave unfinished legacy-only
  records non-operational.

## 0.1.18 — 2026-08-22

- Add distinct native-v2 reference records for Sound of Luing and Dorus Mòr,
  joined to fresh OS named-sea and named-channel Location IDs while preserving
  both legacy v1 objects and every prior gate byte-for-byte.
- Apply the full positive operational checklist and keep both fail-closed:
  average or unbounded wind-variable beginnings, no true bearings, per-turn
  slack placement, exact gate-local turn rates, supported flow/interpolation
  models or complete structured publication/hazard evidence.
- Encode thirteen stable blockers per candidate, keep all machine timing,
  bearing and slack values unavailable, retain empty rate observations and
  prove the effective Planning allow-list remains empty.

## 0.1.17 — 2026-08-22

- Add a distinct native-v2 Gulf of Corryvreckan record joined to a fresh OS
  named-sea Location while preserving the conflicting legacy v1 object and all
  prior gates byte-for-byte.
- Keep the gate reference-only: average wind-variable beginnings, missing true
  bearings, turn-ambiguous slack, broad mid-channel rates, unsupported models,
  incomplete publication/Directions evidence and severe localized hazards
  prevent operational use.
- Keep every timing, bearing and slack machine field unavailable, rates empty
  and the effective allow-list at zero, with focused heading, source-scope,
  hazard, blocker, join and legacy-digest tests.

## 0.1.16 — 2026-08-22

- Add distinct native-v2 Cuan Sound and Grey Dogs / Bealach a' Choin Ghlais
  records joined to fresh OS named-channel Location IDs, preserving the legacy
  Cuan timing/secondary-port data and prior Grey Dogs Location byte-for-byte.
- Apply the positive operational checklist and keep both reference-only:
  approximate beginnings, missing true bearings/models, Cuan's absent slack
  and rate scoping, and Grey Dogs' turn-ambiguous slack and conflicting spring
  rate prevent native-v2 operation.
- Keep every timing and slack machine field unavailable, rate observations
  empty and the effective operational allow-list at zero, with focused
  source-index, preservation, direction/regime/slack/rate and join tests.

## 0.1.15 — 2026-08-22

- Add distinct native-v2 reference-only records for Loch Feochan and a fresh
  Firth of Lorn representative, preserving the imported legacy Firth identity
  and v1 gate byte-for-byte.
- Retain regime-neutral/approximate HW Oban timings only in unavailable
  reasons; keep Loch Feochan's asymmetric duration context and every general or
  localized rate statement outside operational turn-rate fields.
- Leave bearings, slack and calculation models unavailable, keep the effective
  operational allow-list empty and add focused source-index, locality, join,
  unavailable-semantics and prior-record hash tests.

## 0.1.14 — 2026-08-22

- Add separate native-v2 reference-only records for Caolas nan Con and Lynn of
  Morvern, joined to fresh Location IDs rather than candidate 10 or legacy
  Sound of Mull identities.
- Preserve their regime-neutral HW Oban stream beginnings only in sourced
  unavailable reasons, including Caolas nan Con's explicit 45-minute
  derivation from the Loch Leven narrows.
- Keep the shared more-than 5 kn bound and Lynn's main-body, flood-local and
  springs-ebb-local rates outside structured turn/regime observations; leave
  bearings, slack and calculation models unavailable and the effective
  operational allow-list empty.
- Add focused heading-index, locality, conflict, one-to-one join, unavailable
  semantics and prior-record byte-preservation tests.

## 0.1.13 — 2026-08-22

- Add distinct native v2 reference-only timing records for Corran Narrows and
  the Loch Leven narrows at Caolas Mhic Phadruig.
- Preserve printed regime-neutral HW Oban stream beginnings only in sourced
  unavailable reasons; do not assign them to spring or neap numeric fields.
- Keep each more-than 5 kn lower bound outside turn/regime rate observations,
  leave all calculation models unavailable and expose neither record through
  the effective operational allow-list.
- Add focused heading-index, locality-separation, one-to-one join, legacy-byte
  preservation and zero-operational-exposure tests.

## 0.1.12 — 2026-08-22

- Add distinct native v2 reference-only records for the Sound of Mull
  southeast end and the source locus three miles southeast of Calve Island.
- Preserve approximate regime-neutral HW Oban offsets only in unavailable
  spring/neap reasons; retain regional up-to rate ceilings and incomplete
  duration evidence only as blocking uncertainty.
- Keep the conflicting legacy Duart Point and generic Sound of Mull records
  unchanged, using fresh Location joins instead of silently reinterpreting
  either identity.
- Add focused source-index, locality, rate/duration and effective fail-closed
  tests.

## 0.1.11 — 2026-08-22

- Add photo-verified native v2 reference records for Northwest Mull and Loch
  Sunart, preserving signed HW Oban timing evidence without assigning
  regime-neutral or approximate values to spring/neap fields.
- Keep Caliach Point/Rubh' a' Chaoil, Treshnish, outer-loch, Carna/Loch Teacuis
  and Laudale Narrows rate statements distinct and outside turn/regime rate
  observations.
- Withhold south-end Tiree because its vague timing locus has no defensible
  spatial join, and document the corrected photograph index.
- Add focused catalogue, locality and effective fail-closed tests.

## 0.1.10 — 2026-08-22

- Add photo-verified native v2 reference records for Sound of Iona and Gunna
  Sound, preserving signed HW Oban timing evidence, independent direction
  names, shared up-to bounds, source cautions and uncertainty without assigning
  regime-neutral facts to unsupported spring/neap or turn-specific fields.
- Keep both gates display-only: the photographs do not supply exact
  turn/regime rates, true bearings, slack or supported calculation models, and
  Iona's turn times are explicitly only guidance.
- Add focused catalogue, v1-coexistence, Location-join and effective
  fail-closed tests.
- Record compact photograph and spatial provenance, including why the
  southeast-Coll Passage of Tiree candidate was withheld.

## 0.1.9 — 2026-08-22

- Add the documented `ajrm-tidal-gate-constants-v2` contract with stable
  Location joins, explicit HW/LW references, independently named/directed
  turns, explicit timing/slack states, bounded qualified rate observations,
  structured provenance/review and fail-closed readiness.
- Migrate durable and bundled v1 gates losslessly to visible `needs-review` v2
  records without assigning cardinal text to true bearings, shared rates to
  directions, ambiguous slack to a placement or missing values to zero.
- Add contract/unit/readiness validation, effective Location/reference-port
  catalogue diagnostics and an operational allow-list that fails closed when
  joined services or capabilities are unavailable.
- Expose the v2 catalogue through the additive service, HTTP API and OpenAPI;
  add revisioned gate PUT/DELETE operations to the timing-data owner.
- Preserve every durable port, area and gate when a bundled record with the
  same ID changes; package seeds now add missing records only.
- Serialize definition mutations through unique atomic writes, retain durable
  revisioned tombstones for deleted bundled gates, and leave in-memory state
  unchanged when persistence fails.
- Preserve invalid negative v1 rate/slack edits as explicit unknown legacy
  values instead of failing the whole durable-catalogue migration.
- Require meaningful citations for operational no-slack assertions and notes,
  honour blocking cautions/hazards as well as uncertainty, and diagnose broken
  named-locality Location joins.
- Align OpenAPI strict unions and additional-property rules with runtime v2
  validation, with focused parity tests.

## 0.1.8 — 2026-08-22

- Add Portsmouth and correct the previously omitted/incomplete Bucklers Hard
  secondary-port definition from Admiralty table 5600.
- Prefer ten matching direct provider stations during automatic selection while
  preserving explicitly selected entered corrections for comparison.
- Add visible cautions for anomalous source-checked corrections and suppress
  current-height/curve claims for high-only or low-only stations.
- Merge package safety metadata and newly bundled ports into durable catalogues
  without overwriting user-edited prediction data.

## 0.1.7 — 2026-08-21

- Align eight secondary-port references and the Seil Sound tidal-region
  reference with their canonical Location Editor records.

## 0.1.6 — 2026-08-21

- Aligns documentation with the standalone Weather Database peer and the
  Location/Tidal topology contract now checked by Console BITE.

## 0.1.5 — 2026-08-21

- Label the tidal curve as a smooth estimate interpolated between UKHO-predicted high- and low-water events, not an official UKHO interval-height prediction.

## 0.1.4 — 2026-08-21

- Replace the misleading disabled Spatial location select with a clearly read-only field while editing an existing port.
- Add a tide icon beside every port and a resizable, size-preserving Display-style Details/Graph validation dialog.
- Use the shared AJRM tide-curve renderer for the one-to-seven-day graph, datum reference lines and interactive time/height hover readout.

## 0.1.3 — 2026-08-21

- Add validated create, update and removal operations for tidal-region serving-port assignments and parent-region hierarchy.
- Expose those operations through the lifecycle-safe service and authenticated HTTP API so Location Editor can present one joined editor without duplicating tidal data.

## 0.1.2 — 2026-08-21

- Hide standard-port datum and absolute reference-level inputs when editing a secondary port.
- Store correction-based secondary ports without redundant absolute overrides and always derive their datum and MHWS/MHWN/MLWN/MLWS levels from the parent standard port.
- Ignore legacy blank/null secondary overrides during calculation.

## 0.1.1 — 2026-08-21

- Serialize and pace all UKHO requests, stop duplicate endpoint calls after a 429, and honour `Retry-After` with provider-wide backoff.
- Coalesce simultaneous requests for the same physical station.
- Persist Discovery records for restart-safe day-to-day use, reject them at the UTC year boundary, and retain the 24-hour refresh floor.

## 0.1.0 — 2026-08-21

- Add the standalone provider-neutral Tidal Database service and webapp.
- Add UKHO event predictions, strict per-station 24-hour refresh gating, offline backoff and licensed durable caching.
- Add automatic maintenance for all configured stations and cache/coverage tables.
- Move bundled direct-station mappings, entered secondary-port corrections and tidal-region mappings into a dedicated definition catalogue.
- Add a web editor for provider-backed standard/secondary ports and Reeds-style
  entered secondary-port differences, linked by stable Location id.
- Add a diagnostics contract for Snapshot and BITE without exposing credentials.
