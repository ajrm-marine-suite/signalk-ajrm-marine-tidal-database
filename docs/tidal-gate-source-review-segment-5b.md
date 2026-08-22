# Tidal-gate source review: Segment 5B

Review date: 2026-08-22. This review covers only candidates 11–12. The
user-supplied pilot-book photographs are evidence; this note records compact
facts and image provenance without reproducing publication passages. The
publication title, edition and page number are not visible.

The visible heading-to-image index is:

- `IMG_5400.jpeg`: **Loch Leven**. Caolas nan Con is a subordinate locality in
  the complete Tides block. The already released Loch Leven Narrows candidate
  10 on the same page remains byte-for-byte unchanged.
- `IMG_5399.jpeg`: **Lynn of Morvern**. Its complete Tides block ends before
  the Directions heading and supplies candidate 12.
- `IMG_5398.jpeg` was not inspected because candidate 12 has no heading or
  tidal-table continuation requiring it.

The pages print signed offsets against Oban. The `HW` interpretation reuses the
notation key already source-checked and released in Segment 3B; that older
image was not reopened during this review.

| Candidate | HW Oban evidence | Rate and locality limits | Spatial/result treatment |
| --- | --- | --- | --- |
| Caolas nan Con | In-going begins 45 minutes after the narrows' `-315 min`, deriving `-270 min`; out-going begins at the same time as the narrows, `+60 min`. | The lower bound of more than `5 kn` is shared with the Loch Leven narrows and has no direction or spring/neap assignment. | Native v2 `reference-only`; Location `fbd3ab30-6bf6-4e70-bf91-f7141d9586fc`, a distinct OS named-channel representative point, not candidate 10 or an exact timing/passage waypoint. |
| Lynn of Morvern | North-going begins `-345 min`; south-going begins `+25 min`. | Main-body `1 kn`, a localized flood stream at `2.5 kn`, and a different springs-only localized ebb stream at `4 kn` have separate scopes. None is a passage-wide turn/regime rate. | Native v2 `reference-only`; Location `dd2f8629-e052-42ac-84b3-07e49390c7b1`, a broad OS named-sea point, not an entrance, fairway, route, safe-water point or local-stream position. |

All four events mean that the named stream **begins**; the photographs do not
state turn/slack semantics or a slack/duration interval. They give no true
bearings, supported flow model or spring/neap interpolation. The rate bounds
and localized rates therefore remain only sourced blocking uncertainty, while
`rateObservations` stays empty. The Lynn ebb eddy and localized springs
overfalls remain separately scoped cautions.

Lynn's separate local tidal-constant line and height table are water-level
material, not stream-beginning or stream-rate evidence, and are not imported
into the gate contract.

The old generic Sound of Mull v1 record happens to carry the same nominal
`-345/+25 min` pair as Lynn, but it has a different Location, direction labels,
shared rates and modelled slack. It remains byte-for-byte unchanged and is not
reused or reinterpreted as candidate 12.
