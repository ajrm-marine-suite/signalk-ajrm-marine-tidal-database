# AJRM Marine Tidal Database

Signal K tidal-data service for AJRM Marine Suite. It separates tidal provider access, station mappings, entered secondary-port corrections and cached predictions from the spatial Location Editor.

Version 0.1.8 adds Portsmouth and a corrected Bucklers Hard definition, and makes automatic selection prefer a matching direct provider station over entered secondary-port corrections. An explicitly selected entered definition remains available for comparison. Source-checked but anomalous definitions carry visible caution messages. Stations that publish only one kind of extreme are labelled high-only or low-only; their genuine events remain visible, but the service does not invent current height, the missing extreme, or a tidal curve.

## Responsibilities

- **Location Editor** owns names, coordinates, geometry and location type, and presents joined tidal-region assignment controls.
- **Tidal Database** owns prediction providers, credentials, station mappings, secondary-port correction tables, tidal-region serving-port and parent-region relationships, cached events and tidal calculations.
- **Display and Marine Planning** consume the Tidal Database service; they do not fetch or cache provider data themselves.
- **Weather Database** is the peer service for weather providers, cache and forecasts.

The plugin exposes `app.ajrmMarineTidalDatabase` and `Symbol.for("mcdonaldajr.ajrmMarineTidalDatabase")` with contract `ajrm-marine-tidal-database-service-v1`. Its web API retains the `ajrm-marine-tide-resolver-v1` projection consumed by the suite.

## Offline and refresh behaviour

Each provider station is fetched only when it has no usable record or its last successful fetch is **more than 24 hours old**. Repeated manual refreshes do not bypass this floor. Automatic maintenance checks hourly and covers all configured stations, not merely the currently selected route or vessel area. Locally entered secondary ports reuse their parent station cache and perform no provider request.

If a provider cannot be reached, the latest permitted disk-backed record remains available and the provider enters a one-hour retry backoff. Calls are serialized and spaced by five seconds by default; a 429 stops alternate-endpoint retries and honours UKHO's `Retry-After` response. Concurrent requests for one station share one fetch.

UKHO responses are retained on disk so ordinary restarts and offline operation do not repeat requests. Discovery records are scoped to the UTC calendar/licence year in which they were fetched and are rejected at the year boundary; Foundation and Premium records are retained under their configured subscription. All tiers still use the same 24-hour minimum refresh floor.

## Setup

Install and enable AJRM Marine Location Editor first, then this plugin. Configure the provider key and subscription tier in Signal K **Server → Plugin Config → AJRM Marine Tidal Database**. Open the Tidal Database webapp to inspect station coverage, update due stations, and edit prediction settings for tidal-port Locations. Select the tide icon at the left of any port to inspect its current height, next high/low water, source freshness, spring/neap estimate and interactive one-to-seven-day curve. Port position and geometry continue to be edited only in Location Editor.

Automatic preference is explicit catalogue data, not fuzzy name matching. Existing durable catalogues receive package safety fields and newly bundled ports on startup without overwriting locally edited prediction or correction data.

```sh
cd ~/.signalk
npm install git+https://github.com/ajrm-marine-suite/signalk-ajrm-marine-tidal-database.git#v0.1.8 --omit=dev --no-package-lock
sudo systemctl restart signalk
```

Tidal predictions assist planning but are not a substitute for current official publications, local observations or the skipper’s judgement.
