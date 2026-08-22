# AJRM tidal-gate constants v2

`ajrm-tidal-gate-constants-v2` is the durable timing and stream-observation
contract owned by AJRM Marine Tidal Database. AJRM Marine Location Editor owns
the joined location's stable name, types, geometry, spatial revision and
spatial provenance. A gate record therefore identifies that object only by
`locationId`.

The contract is deliberately fail-closed. Missing information is represented
as `unknown` or `unavailable`; it is never copied from another regime and never
means zero. Stored `readiness.state: operational` is necessary but not
sufficient: consumers must use the catalogue's computed
`operationalLocationIds`, which also checks Location joins and the usable
reference-port definition.

## Record shape

```json
{
  "contract": "ajrm-tidal-gate-constants-v2",
  "contractVersion": 2,
  "revision": 1,
  "locationId": "gate-location-id",
  "conventions": {
    "offsetSign": "positive-after-reference-event",
    "directionBearing": "degrees-true-current-towards"
  },
  "reference": {
    "portLocationId": "standard-port-location-id",
    "event": "LW",
    "sourceIds": ["source-1"]
  },
  "flowModel": {
    "kind": "sinusoidal-between-turns-v1",
    "peakTiming": "midpoint-between-turns",
    "zeroAtTurns": true
  },
  "regimeInterpolation": {
    "kind": "linear-reference-range-v1",
    "rangePairing": "following-opposite-event",
    "outOfRange": "unavailable"
  },
  "turns": [
    {
      "id": "west-going",
      "name": "West-going stream begins",
      "direction": {
        "label": "West-going",
        "bearingDegreesTrue": {
          "state": "known",
          "value": 270,
          "sourceIds": ["source-1"]
        }
      },
      "offsets": {
        "unit": "minutes",
        "spring": { "state": "known", "value": 210, "sourceIds": ["source-1"] },
        "neap": { "state": "unknown", "reason": "Not available in the reviewed evidence" }
      },
      "slack": {
        "unit": "minutes",
        "spring": {
          "semantics": "before-and-after-turn",
          "before": { "state": "known", "value": 10, "sourceIds": ["source-1"] },
          "after": { "state": "known", "value": 15, "sourceIds": ["source-1"] }
        },
        "neap": { "semantics": "unknown", "reason": "Not reviewed" }
      }
    },
    {
      "id": "east-going",
      "name": "East-going stream begins",
      "direction": {
        "label": "East-going",
        "bearingDegreesTrue": { "state": "unknown" }
      },
      "offsets": {
        "unit": "minutes",
        "spring": { "state": "unknown" },
        "neap": { "state": "unavailable" }
      },
      "slack": {
        "unit": "minutes",
        "spring": { "semantics": "unknown" },
        "neap": { "semantics": "unavailable" }
      }
    }
  ],
  "rateObservations": [
    {
      "id": "west-spring-whole-gate",
      "kind": "phase-peak",
      "turnId": "west-going",
      "regime": "spring",
      "locality": { "scope": "gate", "locationId": "gate-location-id" },
      "unit": "kn",
      "qualifier": "up-to",
      "reportedValue": { "state": "known", "value": 5, "sourceIds": ["source-1"] },
      "lowerBound": { "state": "unknown" },
      "upperBound": { "state": "known", "value": 5, "sourceIds": ["source-1"] }
    }
  ],
  "provenance": {
    "sources": [
      {
        "id": "source-1",
        "kind": "pilot-book",
        "title": "Publication title",
        "publisher": "Publisher",
        "edition": "Edition identifier",
        "page": "Page reference",
        "imageRef": "local-review-image-id",
        "url": null,
        "retrievedAt": "2026-08-22T12:00:00.000Z"
      }
    ],
    "review": {
      "state": "needs-review",
      "reviewedBy": null,
      "reviewedAt": null,
      "notes": null
    }
  },
  "cautions": [],
  "hazards": [],
  "uncertainty": [
    {
      "id": "missing-neap-values",
      "summary": "Neap timing and direction remain unreviewed.",
      "sourceIds": ["source-1"],
      "blocking": true
    }
  ],
  "readiness": {
    "state": "needs-review",
    "reasons": ["missing-neap-values"]
  }
}
```

The example is synthetic contract documentation, not gate data.

## Explicit values and units

Every measurement has one state:

- `known` requires a finite numeric `value` and operational values require
  field-level `sourceIds`.
- `unknown` means the value is not known.
- `unavailable` means the reviewed source or data path does not provide it.

Offsets and slack use explicit `minutes`. Offsets are signed and positive means
after the named HW/LW reference. Slack and rate values are non-negative. Rate
observations use `kn`. A known numeric zero is distinct from unknown.

Directions use true degrees and describe where the current flows towards. Text
labels remain labels; a cardinal label is never converted into a true bearing.

## Turn and slack semantics

Each gate has at least two independently identified and named turns. Each turn
has its own direction, spring/neap offsets, slack and turn-specific rate
observations. The contract does not force the local terms `flood` and `ebb`.

Slack is a strict union for each regime:

- `total-centered-on-turn` supplies an explicitly centred total duration;
- `before-and-after-turn` supplies separate before and after durations;
- `none` is an explicit, sourced assertion that there is no slack window;
- `unknown` and `unavailable` carry no numeric value;
- `legacy-ambiguous` preserves a v1 reported duration but cannot be operational.

## Rate observations and calculation limits

Each observation names its turn, regime and locality. It carries a reported
value, lower bound and upper bound as explicit measurement states plus one of:
`exact`, `approximate`, `range`, `up-to`, `more-than`, `unknown`, `unavailable`
or migration-only `legacy-unspecified`.

Segment 2 operational calculation accepts exactly one gate-local,
turn-specific, `phase-peak`, `exact` observation for spring and neap for each
turn. Approximate, range, up-to, more-than and named-locality observations are
preserved and displayed but are reference-only. Planning does not choose a
bound because the supposedly conservative choice reverses between fair and
foul streams.

The only operational flow curve currently supported is
`sinusoidal-between-turns-v1`, explicitly zero at named turns and peaking at
their midpoint. No fallback cycle is repeated beyond fully defined turn
instances.

Spring/neap interpolation is linear between the reference port's explicit
MHWS/MHWN/MLWN/MLWS ranges. `rangePairing` states whether the preceding,
following or mean of both adjacent opposite extrema is used. A factor outside
the spring/neap range is `unavailable`; v2 does not clamp or extrapolate it.

## Provenance, review and effective readiness

Sources contain citation metadata only: source kind, title, publisher,
edition, page reference, evidence-image identifier, URL and retrieval time.
Copyrighted page text is not stored. Cautions, hazards and uncertainties refer
to meaningful structured source IDs for operational records. `blocking: true`
on any caution, hazard or uncertainty prevents operational use.

An operational record requires meaningful structured citation metadata,
field-level source references for every known value and any explicit `none`
slack assertion, sourced notes, a named reviewer, a valid review time, no
blocking note, complete supported timing/slack/model semantics, known true
bearings and exact direction-specific rates.

The asynchronous catalogue then checks that:

- the gate Location exists and is typed `tidalGate`;
- its reference-port definition exists, is a provider-backed standard port and
  has explicit reference levels;
- the reference-port Location exists and is typed `tidalStandardPort`.
- every supplied named rate-locality Location ID exists.

Consumers must use `operationalLocationIds` from
`getGateCatalogue()`/`GET /definitions/gates`, not stored readiness alone. A
Location service outage produces an empty effective allow-list without
rewriting durable data.

## v1 compatibility and durable migration

On load, each `ajrm-tidal-gate-constants-v1` durable record is migrated once to
v2 and the complete original record is preserved under `legacy.record`.
Unambiguous duration syntax is converted exactly; blanks and malformed values
become `unknown`. An explicit legacy zero remains a known zero. The old shared
spring/neap rates are not assigned to either direction, cardinal labels are not
converted to bearings, and legacy slack remains `legacy-ambiguous`.

Every migrated record is `needs-review` and non-operational. The existing 15
bundled records follow this path; no new gate is added. Package seeds add only
missing IDs. They never overwrite a durable port, area or gate with the same
ID, including user edits. Deleting a bundled gate writes a durable tombstone,
so the package seed does not recreate it on restart.

## Mutation and revisions

Tidal Database owns gate timing mutation through its in-process service and:

- `GET /definitions/gates`
- `GET /definitions/gates/diagnostics`
- `PUT /definitions/gates/{locationId}`
- `DELETE /definitions/gates/{locationId}?expectedRevision=N`

Location Editor remains the spatial editor. New gate definitions start at
revision 1. Replacement PUTs must increment the durable revision by exactly
one; DELETE requires the current revision and records deletion as the next
revision in a definition-catalogue tombstone. Restoring an explicitly deleted
gate requires the following revision and removes the tombstone. Read/write or admin Signal K
access is required. The OpenAPI document is the machine-readable schema for the
same boundary.
