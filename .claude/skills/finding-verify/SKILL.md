---
name: finding-verify
description: Independently re-check the worst-scoring search terms through a different capture path before any of them ships as a finding, separating real search failures from capture artifacts. Produces verified-findings.json and gates the report. Use as stage 6 of an ecommerce search assessment, or when asked to confirm findings, sanity-check the worst results, or validate a board before reporting.
---

# Finding verification

**Stage 6 of 8.** Enforces **L08**, **L10**. See `framework/search-eval/LESSONS.md`.

| | |
|---|---|
| **Input** | `eval-board.json` (draft), `captures.json`, `grades.json` |
| **Output** | `verified-findings.json` — `schemas/search-eval/verified-findings.schema.json` |
| **Gate** | `verification_path ≠ original_path`. The report refuses to run without this file. |

A term scores badly for one of two reasons: **search really failed**, or **the capture
failed**. The bottom of the ranking is disproportionately the second. Every finding in
a report comes from that bottom, so this is the stage that decides whether the report
is true.

> A Target board showed `dyson v8 → Clorox cleaning wipes, grade 0.60`. The capture had
> grabbed a *Recommended for you* carousel. Searching `dyson v8` on the live site
> returns Dyson. The engine was fine; the finding was ours.

## 1. Independence means a different path

This is the part that carries the weight. Re-running the same endpoint, or re-grading
the same capture with the same judge, **confirms the artifact instead of testing it** —
a contaminated capture re-read the same way is contaminated identically, and the judge
will faithfully grade the carousel again.

| Original | Verify through |
|---|---|
| `json_api` | the live shopper UI |
| `browser_dom` | the organic API |
| `storefront_html` | the live UI in a fresh session |
| `storefront_graphql` | the rendered search page |

Record both in `original_path` and `verification_path`. Equal values are a gate failure,
not a warning.

## 2. Select deliberately, and say what you selected

Typical rule: **bottom 20 by mean grade, plus every zero-result on a term the catalog
says is stocked.** Whatever you use, record it in `selection.rule` with `count` and
`population`.

The report states verification coverage from this. Silently checking 20 of 245 rows and
implying the whole board was verified is the failure this stage exists to prevent.

## 3. Verdicts

| Verdict | Meaning | May ship as a finding? |
|---|---|---|
| `confirmed` | the failure reproduces through an independent path | **yes** |
| `refuted` | the original was an artifact of how we captured | **no** |
| `inconclusive` | could not be re-checked (blocked, page gone) | **no** |

`inconclusive` is not a soft pass. An unverifiable finding stays out of the report and
is listed as unverified.

## 4. Refuted rows are data, not deletions

Every refuted row gets a `reclassified_as`:

`capture_artifact` · `carousel_contamination` · `brand_redirect` · `sponsored_tiles` ·
`rate_block` · `true_empty` · `assortment_gap`

Two of these are findings about the *store*, not about us — `true_empty` and
`assortment_gap` mean search behaved correctly and the catalog is the story
(**L04**). The rest are findings about our own method.

**If the refuted share is high, set `capture_quality_flag`.** Several
`capture_artifact` reclassifications in one run means the capture method is degrading
and the whole run needs re-examining before anything ships — not just the rows that
happened to be checked.

## 5. Evidence must be replayable

Every row carries a live URL a human can open and see for themselves. Not a screenshot,
not a description. The client's search team will re-run these, and a finding that
doesn't reproduce in front of them costs more than the finding was worth.

## Do / Don't

- **Do** verify through a genuinely different path, record the selection rule, keep refuted rows with a reclassification, flag capture quality, attach replayable URLs.
- **Don't** re-grade the same capture and call it verification, ship an inconclusive row, drop refuted rows silently, or imply full-board verification from a bottom-N sample.
