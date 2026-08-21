# AJRM Marine Tidal Database

Signal K tidal-data service for AJRM Marine Suite. It separates tidal provider access, station mappings, entered secondary-port corrections and cached predictions from the spatial Location Editor.

Version 0.1.0 provides a UKHO adapter behind a provider-neutral registry, a durable station database where licensing permits it, a strict 24-hour minimum refresh interval per physical station, offline fallback/backoff, automatic maintenance of every configured station, locally calculated entered-data secondary ports, spatial port selection and a web table showing cache coverage and provenance.

## Responsibilities

- **Location Editor** owns names, coordinates, geometry, location type and containment relationships.
- **Tidal Database** owns prediction providers, credentials, station mappings, secondary-port correction tables, cached events and tidal calculations.
- **Display and Marine Planning** consume the Tidal Database service; they do not fetch or cache provider data themselves.
- A future weather application will be a separate peer service with its own providers, cache and interface.

The plugin exposes `app.ajrmMarineTidalDatabase` and `Symbol.for("mcdonaldajr.ajrmMarineTidalDatabase")` with contract `ajrm-marine-tidal-database-service-v1`. Its web API retains the `ajrm-marine-tide-resolver-v1` projection consumed by the suite.

## Offline and refresh behaviour

Each provider station is fetched only when it has no usable record or its last successful fetch is **more than 24 hours old**. Repeated manual refreshes do not bypass this floor. Automatic maintenance checks hourly and covers all configured stations, not merely the currently selected route or vessel area. Locally entered secondary ports reuse their parent station cache and perform no provider request.

If a provider cannot be reached, the latest permitted disk-backed record remains available and the provider enters a one-hour retry backoff. UKHO Discovery responses remain memory-only; Foundation or Premium must be selected before UKHO cache records are retained across Signal K restarts.

## Setup

Install and enable AJRM Marine Location Editor first, then this plugin. Configure the provider key and subscription tier in Signal K **Server → Plugin Config → AJRM Marine Tidal Database**. Open the Tidal Database webapp to inspect station coverage, update due stations, and edit prediction settings for tidal-port Locations. Port position and geometry continue to be edited only in Location Editor.

```sh
cd ~/.signalk
npm install git+https://github.com/ajrm-marine-suite/signalk-ajrm-marine-tidal-database.git#v0.1.0 --omit=dev --no-package-lock
sudo systemctl restart signalk
```

Tidal predictions assist planning but are not a substitute for current official publications, local observations or the skipper’s judgement.
