# Changelog

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
