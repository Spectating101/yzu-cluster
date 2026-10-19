# Discover semantic relevance — what has been measured

Written so the next person does not re-derive it. Everything here is measured
against the live desk and the live catalog, not reasoned from the code.

## The defect

`clinical trial outcomes` returns three held datasets, none of them about
clinical trials: NHANES demographics, Taiwan governance misconduct, NHANES
health files. Nonsense strings correctly return zero, so the gate works; the
failure is a *plausible* query whose subject the corpus does not hold.

## No score threshold can fix it

Top-similarity and its distribution overlap between subjects the corpus holds
and subjects it does not:

| query | top | z-score | corpus holds it |
|---|---|---|---|
| stock returns | 0.394 | 2.37 | yes |
| patent citations | 0.317 | 2.67 | yes |
| carbon emissions by country | 0.407 | 4.16 | yes |
| taiwan governance | 0.526 | 6.54 | yes |
| crypto prices | 0.548 | 4.26 | yes |
| clinical trial outcomes | 0.244 | 4.20 | **no** |
| sea surface salinity | 0.370 | 4.07 | partly |
| ocean salinity measurements | 0.413 | 4.10 | partly |
| zzqvjjk plmxxc | 0.281 | 2.95 | **no** |

`clinical trial outcomes` (absent) scores z=4.20, higher than `stock returns`
(present) at 2.37. Raising the floor, tuning the reserve, or any statistic over
the score distribution trades one error class for the other. This was tested and
rejected — do not spend the day on it again.

Related earlier measurement on the 60,610-row curated corpus: real subject
queries top out at 0.26–0.48, nonsense at 0.12–0.24, and Sol found
`zzqvjjk plmxxc` at 0.2725 defeating a 0.25 floor. Same conclusion.

## What the embedding is actually matching

Form, not subject. For `sea surface salinity` the top hit is
"Daily US risk snapshot from Refinitiv" — a *daily snapshot* resembles
*measurements*.

## What does separate them

Subject-word overlap between the query and the document text:

| query | top-3 semantic hits kept by shared subject word |
|---|---|
| clinical trial outcomes | 0 of 3 — every false positive dies |
| stock returns | 3 of 3 |
| carbon emissions by country | 3 of 3 (carbon ↔ CO₂) |
| taiwan governance | 3 of 3 |
| crypto prices | 2 of 3 |

Two cautions found while measuring:

- Plain overlap admits spurious single-word matches: "Daily US risk snapshot"
  survived `sea surface salinity` on one common word. Weight by inverse document
  frequency so a shared *rare* word counts and a shared common word does not.
- Do not gate on the query's words alone. "Fama-French 3 Factors" is a correct
  hit for `stock returns` and shares no title word — the document text, not the
  title, carries the overlap.

## Corrections to earlier readings

`sea surface salinity` was described as returning irrelevant results. Two of its
hits — NOAA Sea Surface Temperature Metadata, Leigh Marine Lab sea surface
temperature — are legitimately related; the desk does hold sea-surface
oceanographic data. The false positive there is narrower than it first looked.
