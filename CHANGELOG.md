# Changelog

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
