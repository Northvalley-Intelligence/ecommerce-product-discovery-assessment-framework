---
name: search-report
description: Generate the Northvalley-branded PDF search-relevance report from a verified eval board — findings, demand-ranked quick wins, synonym equivalence and the full term appendix. Use as stage 8 of an ecommerce search assessment, or when asked for the client-facing search report or PDF.
---

# Search report

**Stage 8 of 8.** Enforces **L08**, **L12**. See `framework/search-eval/LESSONS.md`.

| | |
|---|---|
| **Input** | `eval-board.json`, `verified-findings.json`, `demand-volume.json`, `revenue-loss.json` |
| **Output** | `report-data.json` + a branded PDF |
| **Gate** | **refuses to run** unless `verification.ran === true` and every finding is `verified: "confirmed"` |
| **Scripts** | `framework/search-eval/scripts/gen-report.mjs` |

This is the client-facing artifact. Everything upstream exists so this document is
true.

## 1. The gate is a refusal, not a warning

If verification did not run, or a finding rests on a `refuted` or `inconclusive` row,
**do not generate the report.** Say which findings are unverified and stop.

The failure this prevents is specific: a capture artifact reaching a client as a
statement about their engineering. `dyson v8 → Clorox cleaning wipes` in a Target
report would have been our bug, described as theirs, in a document with our name on it.

If `capture_quality_flag` is set on the board, the run is re-examined before any
report is generated.

## 2. Sections, in order

1. Cover
2. Summary
3. How this was measured — engine, judge, `rubric_hash`, gold-set agreement, **verification path and coverage**
4. Findings — severity-ranked, one fix candidate each
5. Demand-ranked quick wins
6. Synonym equivalence — canonical vs variant with Δ, plus mined candidates with evidence SKUs
7. Recall against catalog — keyed datasets only, stated as such
8. How we can help
9. Per-dataset details
10. Shallowest searches
11. Appendix — every term with count, NDCG, grade, recall where keyed

Section 3 now carries verification. A reader must be able to see how many findings were
independently re-checked, through which path, and how many were thrown out. That number
is evidence of rigour, and hiding it forfeits the credibility it earned.

## 3. Never fabricate demand

**L12.** If `demand-volume.json` exists, rank quick wins by real Keyword Planner volume.
If it doesn't, list failing-term fix candidates worst-first (grade < 1.5 on
demand-mappable datasets) and **state that volumes will rank them once imported**.

Never invent a volume. Flag head terms whose national volume is off-vertical
(`buffet` = food, `console table` partly gaming) as indicative only.

## 4. Revenue figures are modeled, and say so

Any dollar figure carries its disclaimer, its assumptions, and the
conservative–aggressive band. Headline the base scenario, never the aggressive one.

**Check the disclaimer names the right retailer.** Catfootwear's `revenue-loss.json`
shipped with *"a production figure needs Target's own query logs"* — boilerplate
carried over from another engagement, in a client-facing artifact. Per-store copies are
how that happens; the shared generator is the fix, but the check stays.

## 5. Build

Needs `northvalley-template-assets/` (brand.sty + logo). Compile with `pdflatex` twice.
Never fabricate screenshots — use live URLs and captured result text.

## Do / Don't

- **Do** refuse on unverified findings, report verification coverage in How-this-was-measured, rank by real volume only, band every dollar figure, check the disclaimer names this client.
- **Don't** generate from an unverified board, present modeled revenue as audited, invent volumes, or ship a report whose boilerplate names another retailer.
