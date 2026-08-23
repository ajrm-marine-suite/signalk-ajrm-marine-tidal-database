# Changelog

## 0.6.0 — 2026-08-23

- Keep the `v0.1.8` runtime behaviour and legacy v1 gate contract expected by
  AJRM Marine Planning `v0.5.19`/`v0.6.0`.
- Replace the bundled gate seed with all 42 rows imported from
  `AJRM-Tidal-Gates-Simplified.xlsx`: 29 complete calculation rows and 13
  deliberately incomplete rows where the spreadsheet lacks required values.
- Convert explicit true bearings to the exactly equivalent 16-point cardinal
  labels required by the legacy Planning format; do not invent missing ports,
  rates, timings or slack durations.
- Include a gates-only import file so an existing durable catalogue can replace
  its gate array without discarding locally configured ports or tidal regions.

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
