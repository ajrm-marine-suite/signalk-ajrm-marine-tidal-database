# Tidal-gate source review: Segment 6B

Review date: 2026-08-22. This review covers only candidates 15–16. The
user-supplied pilot-book photographs are evidence; this note records compact
facts and image provenance without reproducing publication passages. The
publication title, publisher, edition and page number are not visible.

The corrected visible heading-to-image index is:

- `IMG_5392.jpeg`: **Cuan Sound**. Its complete target Tides block is visible.
- `IMG_5391.jpeg`: **Grey Dogs**. Its target timing, rate and slack text is
  visible; the Directions warning continues beyond the photographed frame.
- `IMG_5390.jpeg` and `IMG_5393.jpeg` were checked only because that cropped
  warning appeared to continue into an adjacent photograph. Neither contains a
  Grey Dogs continuation, and no unrelated material was imported.

The two target pages print signed offsets against Oban but do not themselves
print `HW`. The HW interpretation reuses the notation key source-checked and
released in Segment 3B from `IMG_5408.jpeg`; that older image was not reopened
for this review. Dover alternatives are not imported because Oban is the joined
reference port.

| Candidate | Regime/direction evidence | Rate, slack and warning limits | Spatial/result treatment |
| --- | --- | --- | --- |
| Cuan Sound | Flood begins **about** westwards at `+270 min` springs and `+315 min` neaps; ebb begins **about** eastwards at `-105 min` springs and `-60 min` neaps, relative to HW Oban. These are approximate beginnings, not exact turn/slack centres. | In the western part, spring `7 kn` expressly applies in both directions; neap `up to 5 kn` does not expressly repeat that direction scope. Greatest strength is only “soon after” turning. No slack duration is stated. Strong eddies near An Cleiteadh and problems both with and against the tide remain blocking cautions. | Native v2 `reference-only`; Location `5270b58c-5b74-4a30-92ea-e8de3050f024`, an OS named-channel point, not the narrows, western rate locus, fairway, route or safe-water point. The legacy Cuan Location, secondary port and v1 gate remain unchanged. |
| Grey Dogs / Bealach a' Choin Ghlais | Flood begins **about** westwards at `+270 min` springs and `+315 min` neaps; ebb begins **about** eastwards at `-105 min` springs and `-60 min` neaps, relative to HW Oban. The source separately says the turn may be difficult to forecast within an hour either side. | The passage description reports `8.5 kn` springs and `6.5 kn` neaps on flood and ebb, while a later line calls the spring rate **about 8 kn**. Passage-level slack periods are `15 min` springs and `60 min` neaps, but no individual-turn scope or centred/before/after placement is supplied. Eddies, standing waves, loss of control, ebb set toward islets and quiet-weather/near-slack advice remain blocking cautions. | Native v2 `reference-only`; Location `a3df95d7-a216-476b-a10f-1d8909810c47`, an OS named-channel point, not the narrowest part, fairway, islet-clearance line, route, safe-water point or exact turn/slack/rate locus. The prior Grey Dogs Location remains unchanged. |

## Positive operational-eligibility assessment

Each candidate was checked positively against every current v2 operational
requirement. Neither is enabled:

- both lack exact machine turn offsets because every printed beginning is
  qualified as approximate; Grey Dogs adds substantial local forecast
  uncertainty;
- west/east text labels are not sourced true current-towards bearings;
- neither OS naming point is an exact rate-observation locus;
- Cuan has no slack data, while Grey Dogs' durations cannot be assigned to an
  individual turn or a centred/before/after semantic;
- Cuan's neap rate is not expressly per-direction, and Grey Dogs has both a
  passage-wide duplication prohibition and conflicting spring wording;
- neither source supplies the supported sinusoidal-between-turns flow model or
  the required reference-range interpolation rule; and
- the visible photographs do not complete the structured publication citation.

Consequently all timing and slack machine fields are `unavailable`,
`rateObservations` is empty, both calculation models are unavailable, every
missing or ambiguous field is listed in `readiness.reasons`, and the effective
operational allow-list remains empty. No north/south directions, bearings,
interpolation, duration or operational applicability were inferred.
