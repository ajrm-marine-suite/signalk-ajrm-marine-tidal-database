# Tidal-gate source review: Segment 5A

Review date: 2026-08-22. This review covers only candidates 9–10. The
user-supplied pilot-book photographs are evidence; this note records compact
facts and image provenance without reproducing publication passages. The
publication title, edition and page number are not visible.

The visible heading-to-image index is:

- `IMG_5401.jpeg`: **Corran Narrows**. Its complete Tides block supplies
  candidate 9.
- `IMG_5402.jpeg`: **Loch Eil**. Its timing text concerns Annat Narrows, not a
  Segment 5A candidate, and none of those facts are imported.
- `IMG_5400.jpeg`: **Loch Leven**. After the first two headings established the
  filename offset, this immediately preceding image supplied the complete
  candidate-10 Tides block. `IMG_5403.jpeg` was not inspected.

The pages print signed offsets against Oban. The `HW` interpretation reuses the
notation key already source-checked and released in Segment 3B; that older
image was not reopened during this review.

| Candidate | HW Oban evidence | Rate and locality limits | Spatial/result treatment |
| --- | --- | --- | --- |
| Corran Narrows | In-going begins `-360 min`; out-going begins `+5 min`. | One gate-wide lower bound of more than `5 kn` at springs, without turn-specific exact rates. | Native v2 `reference-only`; Location `55187907-2b6d-4c9b-9073-3848e2679a07`, an OS named-channel representative point, not a surveyed gate line, fairway, safe-water point or ferry track. |
| Loch Leven Narrows | At the narrows, in-going begins `-315 min`; out-going begins `+60 min`. | More than `5 kn` is stated jointly for the narrows and Caolas nan Con, with no turn or spring/neap assignment. Caolas nan Con has separate timing that is not merged. | Native v2 `reference-only`; Location `47683dc5-1b7e-477c-95fb-4e7a54244995`, the Caolas Mhic Phadruig named-channel representative point at the Ballachulish Bridge locus, not a surveyed gate line or passage waypoint. |

Both records preserve the printed in-going/out-going labels without inventing
true bearings. The beginnings are regime-neutral, so their signed nominal
offsets remain in sourced unavailable reasons rather than spring/neap numeric
fields. The lower bounds remain blocking uncertainty and
`rateObservations` stays empty. No stream duration or slack interval is derived
from the spacing between the two beginnings, and no flow curve or regime
interpolation is manufactured. Separate local tidal-constant statements and
the spring/neap height table are not stream-beginning or stream-rate evidence
and are not imported into either gate record.
