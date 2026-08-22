# Tidal-gate source review: Segment 7A

Review date: 2026-08-22. This review covers only candidate 17, the Gulf of
Corryvreckan. The user-supplied pilot-book photographs are evidence; this note
records compact facts and image provenance without reproducing publication
passages. Page `60` is visible, but the publication title, publisher and
edition are not.

The corrected visible heading-to-image index is:

- `IMG_5389.jpeg`: **Gulf of Corryvreckan**, page 60. The target heading,
  Tides block, hazard discussion and start of Directions are visible. The
  Directions paragraph is clipped at the bottom of this photograph.
- `IMG_5390.jpeg`: **Sound of Luing**. It was the requested starting image and
  was checked for continuation, but it is a separately headed section and is
  excluded from candidate 17 evidence.
- `IMG_5391.jpeg`: **Grey Dogs**. It was checked as the other adjacent image,
  but it is also separately headed and excluded. Neither adjacent image
  continues the clipped Corryvreckan Directions paragraph.

The photographs' SHA-256 values are, respectively,
`3b459d46a87b0244b2f258b6d9c590ef9c1428fac2ca5ac560582d5adfdfe60b`,
`f48eff0d2fe7eefc41399a0f97a4e08b8297bccd5484e171ddb4d977a5c8c7b2`
and `5cb05473bfa8d0af56f790f70f9a744a3cd280ff92b0a9940b4a91e75f52e9b6`.

The target page prints signed offsets against Oban but does not itself print
`HW`. The HW interpretation reuses the notation key source-checked and released
in Segment 3B from `IMG_5408.jpeg`; that older image was not reopened for this
review. Dover alternatives are not imported because Oban is the joined
reference port.

## Verified source scope

- Flood runs east-to-west and the following west-going stream begins at
  `+270 min` springs and `+315 min` neaps relative to HW Oban.
- Ebb runs west-to-east and the following east-going stream begins at
  `-105 min` springs and `-60 min` neaps.
- The page frames the changes as average and says prevailing strong west winds
  can advance timing considerably. No numerical precision or correction bound
  is supplied, so none of the four beginnings is an exact machine turn.
- A single passage-level slack duration is printed for each regime: `15 min`
  springs and `60 min` neaps. It is not assigned to either turn and is not
  defined as centred, before or after the beginning.
- One mid-channel sentence applies `8.5 kn` springs and `6.5 kn` neaps to both
  flood and ebb and says the rates are reached within the first two hours.
  Those passage-wide values are not duplicated into turn records or assigned
  to the broad name point as exact rate-locus observations.
- The source distinguishes flood and ebb hazards. Flood hazards include the
  Scarba shelf overfall and amplification after westerly swell; ebb overfalls
  are described as less severe but can remain dangerous after westerlies.
  General hazards include strong current, eddy-boundary turbulence, wind
  against stream and a whirlpool at a separately described least-depth rock.
  Visible passage advice favours calm weather at slack, especially neaps, but
  the rest of the Directions paragraph is not captured.

## Spatial and legacy audit

The fresh licensed OS Open Names 2026-07 record
`osgb4000000074789965` classifies **Gulf of Corryvreckan** as
`hydrography/Sea`, not `Channel`. Its BNG representative point
`168706,701445` transforms to `[-5.72536661, 56.14941904]`; the source extent
`166772,700072–170789,702833` is roughly `4.02 × 2.76 km`. Location
`2bb1ebac-58eb-41d1-8b78-ef6e4494baf4` therefore names the broad sea feature.
It is not a surveyed gate, fairway, route, safe-water point or exact stream,
turn, slack, rate, shelf, overfall or whirlpool locus.

The previous Location and v1 timing record remain under
`c21dcbcc-41bf-4ad0-9db9-7697c92c7bcb`. That legacy object says `+250 min`
for both flood regimes, `-130 min` for both ebb regimes, `8.5/4 kn` rates and
`12/40 min` ambiguous slack. These conflict with the reviewed source and are
preserved exactly as historical v1 data; they are neither averaged, replaced
nor joined to the new native-v2 identity.

## Positive operational-eligibility assessment

Candidate 17 was checked positively against every current v2 operational
requirement and is **not enabled**:

- the OS point supplies a defensible broad named-sea identity, but no exact
  operational gate or observation locus;
- direction names and separate spring/neap regimes are present, but timing is
  average, wind-variable and lacks a precision bound;
- west/east labels are not sourced true current-towards bearings;
- the mid-channel rates are passage-wide rather than exact gate-local turn
  observations, and are not copied into both turns;
- slack durations lack individual-turn scope and centred/before/after
  placement;
- neither the supported sinusoidal-between-turns flow model nor the required
  reference-range interpolation and pairing rule is stated;
- the physical hazards are substantial and locally/directionally variable,
  while the provided Directions are incomplete; and
- the visible page lacks a complete structured publication citation.

Consequently every timing, bearing and slack machine field is `unavailable`,
`rateObservations` is empty, both calculation models are unavailable, all
twelve exact blockers are listed in `readiness.reasons`, and the effective
operational allow-list remains empty. Planning receives the distinct record as
display-only and cannot calculate a passage from either the new v2 object or
the preserved legacy v1 object.
