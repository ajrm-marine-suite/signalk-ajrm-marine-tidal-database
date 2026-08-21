# Changelog

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
