---
name: search-board
description: Assemble captures, grades, recall, verification and revenue loss into eval-board.json and render it in the dashboard — classifying every row as search bug, assortment gap, true empty or shallow answer. Use as stage 7 of an ecommerce search assessment, or when asked to build or render a search findings board.
---

# Search board

**Stage 7 of 8.** Enforces **L04**, **L13**. See `framework/search-eval/LESSONS.md`.

| | |
|---|---|
| **Input** | `captures.json`, `grades.json`, `verified-findings.json`, `catalog.json`, `demand-volume.json`, `revenue-loss.json` |
| **Output** | `eval-board.json` — `schemas/search-eval/eval-board.schema.json` |
| **Gate** | `verification.ran === true`; no finding rests on a `refuted` or `inconclusive` row |

Replaces the per-store `build-board.mjs` copies. There is one board builder.

## 1. Classify every row — this is the analytical work

A zero-result is only a **search bug** if the store stocks the thing (**L04**). Without
the catalog these are indistinguishable, and calling an assortment gap a search bug is
the fastest way to lose a client's search team.

| Classification | Condition |
|---|---|
| `search_bug` | catalog stocks it, search returned nothing or junk |
| `true_empty` | catalog genuinely has none |
| `assortment_gap` | catalog has none **and** demand is high — merchandising, not search |
| `shallow_answer` | returned plausible results, low grades — answered the department, not the ask |
| `capture_artifact` | verification refuted it |
| `brand_redirect` | 302s to a curated brand page; answered, not empty (**L10**) |

## 2. Report recall only where keys exist

`synonym` and `attribute` carry catalog answer keys. `job_function` and `intent` do not
— they have no node and no filter. Set `has_keys` per dataset and leave `mean_recall`
null where it doesn't apply.

A board showing an overall recall figure computed across keyless datasets is inventing
a denominator. Aggregate recall over keyed datasets only, and label it as such.

Exclude `low` confidence keys from the numerator (**L05**).

## 3. Pick the headline the engine deserves

**L13.** Boutique and enterprise engines fail differently, and the wrong headline makes
a real problem invisible:

- **Boutique** (Woo, Shopify) — narrow. Returns 0 for synonyms, attributes, intent. Headline the **zero-result rate**; the problem is recall.
- **Enterprise** (big-box) — wide. Returns something for nearly anything, so coverage looks excellent while answers are shallow. Headline **mean grade and shallow-answer rate**; the problem is precision.

Porting the furniture "% zero-result" headline to a general retailer reports a store
with a real precision problem as healthy.

## 4. Carry verification through to the findings

Every finding resting on a bottom-N row carries `verified: "confirmed"`. Rows verified
`refuted` may appear in the board with `classification: capture_artifact` but **must
not** appear in `findings[]` as search failures.

Populate `verification` from stage 6, including `capture_quality_flag`. If that flag is
set, the board says so at the top — a run whose capture method was degrading is not a
run you present quietly.

## 5. Every board ships the same parts

No exceptions for single-store or enterprise renders. The single-store path
(`loadRetailBoard`) originally omitted the demand overlay and findings panel and had to
be back-filled to match the boutique render (`loadEvalBoard`).

- verdict card(s)
- **one combined dataset table** — each row shows the dataset's metrics (Coverage, NDCG, Mean grade, Not-relevant, Recall where keyed) **and expands in place** to reveal its worst-first terms. Do not render the metric table and the term drill-down as two separate panels that repeat the dataset names — that duplicates the header and wastes vertical space. One expandable table, metrics as the row header, terms as the body.
- per-term rows carry a **selection-source chip** from the pack's `source` (category-recall skill §6): `catalog` / `facet` / `authored` / `use-case` / `natural language` / `mined`, each with a tooltip where the one-word label is not self-explanatory. This states *how the term entered the dataset* — distinct from the answer-key/recall it carries. Synonym rows also show `term vs canonical`.
- demand overlay affordance — Copy-terms + Paste-Keyword-Planner wired to `/api/demand/import?retailer=<id>&eval=<evalId>`
- findings panel from `findings[]`, severity-ranked
- verification summary
- synonym candidates with evidence SKUs
- PDF link

Routes: `/api/eval-board`, `/api/eval/rerun-ndcg`, `/api/demand/import`.

## Do / Don't

- **Do** classify against the catalog, aggregate recall over keyed datasets only, headline by engine type, carry verification into findings, ship every panel.
- **Don't** compute recall across keyless datasets, let a refuted row become a finding, or render a board without the demand overlay and findings panel.
