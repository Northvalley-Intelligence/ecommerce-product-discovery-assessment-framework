---
name: furniture-search-eval
description: Evaluate on-site search relevance for a furniture (or similar) ecommerce store, overlay real Google demand, and produce a demand-ranked findings board plus a branded Northvalley PDF report. Use when asked to assess or benchmark a retailer's on-site search, compare an old vs new / migrating storefront, find broken searches, rank search fixes by demand, or build a search-relevance evaluation board or report for an ecommerce store.
---

# Furniture Search-Relevance Evaluation

Turn-key workflow to evaluate a furniture ecommerce store's on-site search, grade result relevance with a local LLM judge, overlay Google demand, surface the highest-value fixes, and ship a branded report + dashboard board. Reusable across furniture retailers (and adaptable to other verticals by swapping the query pack).

## When to use
- "Evaluate / benchmark <store>'s search", "why is <store>'s search bad", "find broken searches".
- Compare a legacy storefront to a new one it is migrating to (e.g. WooCommerce → Shopify).
- Rank search fixes by real demand; produce a client-ready findings report or an evaluation board.

## READ FIRST — the lessons that make or break validity

1. **Measure the REAL shopper search engine, not a convenience API.** This is the single biggest trap.
   - **WooCommerce:** shoppers use the storefront search `https://<domain>/?s=<term>&post_type=product` (theme/plugin search). Do **NOT** use the Store API `/wp-json/wc/store/v1/products?search=` — it is a *different, sparser* engine (e.g. `accent chair` → 0 on the API but 6 on the storefront). Capture the storefront HTML (server-rendered) and parse product titles.
   - **Shopify (custom/headless):** the search box usually builds a **structured AND-of-prefix Storefront GraphQL query**, e.g. per word `(title:WORD* OR product_type:WORD* OR vendor:WORD* OR tag:WORD*)`, all ANDed, `first: 8`. A loose `products(query:"coffee table")` is *much fuzzier* and does NOT match what shoppers see. Capture the page's **actual** request in-session (intercept `fetch`) and replicate its query construction. See `reference/shopify-predictive-capture.md`.
   - When numbers look surprising, verify against the live UI before trusting them. Both mistakes above were made and corrected mid-project; the story flipped once fixed.
   - **VERIFY THE WORST BEFORE REPORTING.** The lowest-scoring terms are the most likely to be *capture* artifacts, not real failures. Before any bottom-N (lowest NDCG / lowest grade) term becomes a finding, re-open it in the live shopper UI and confirm the captured results match what a shopper sees. (In a sibling general-retail eval, a `dyson v8 → cleaning wipes, grade 0.60` finding was a false negative — the capture had grabbed a "Recommended for you" carousel, not real results.) Always sanity-check the worst before you ship them. See the `retail-search-eval` skill for the enterprise DOM-contamination details.

2. **Pin the judge rubric.** Cortex's default rubric can change over time. Always record `rubric_hash` with each job (`cortex-poll.mjs` does). The judge is deterministic *at a fixed rubric*; results only reproduce when the rubric is pinned. Re-run everything under one pinned `rubric_hash`.

3. **Validate the judge before trusting grades.** Hand-label ~30 (query, product) pairs and compare to the model. Target: high **binary** relevant-vs-not agreement (Industry West hit 94%); exact-grade agreement will be lower on a 4-point scale, that's fine. The judge tends to under-penalize cross-category junk (grades it 1 not 0) — conservative for a "noisy search" finding.

4. **Use the catalog as a guardrail.** Profile stocked types/materials. A zero-result is only a *search bug* if the store stocks it; otherwise it is a *true-empty* (correctly zero) or an *assortment gap* (high demand, not stocked → merchandising, not search). Never conflate these.

5. **No server load.** Bounded, paced reads (~1/sec), plain inspection user-agent (`Northvalley-Ecommerce-Inspection/0.1`), robots respected, no crawling, no scraping loops. Say so in the report.

6. **Rank by demand.** Search failure alone isn't a priority; **failure × Google search volume** is. Flag ambiguous head terms whose national volume is non-furniture (e.g. "buffet" = food) as indicative only.

## The flow (each step is a script or a documented procedure)

1. **Profile the store** → platform, real search engine, catalog (SKUs, categories, stocked types/materials).
2. **Dataset** → reuse `assets/furniture-queries.json` (synonym/category, attribute material+type, job-function/intent, head terms) + optional literal (product-name) and intent (category-label) probes.
3. **Capture** against the real shopper engine (Woo: `scripts/capture-storefront.mjs`; Shopify: `reference/shopify-predictive-capture.md`). Store per term: total, top-8 titles.
4. **Grade** → `scripts/cortex-submit.mjs` + `scripts/cortex-poll.mjs` (Cortex at `127.0.0.1:7077`, judge `llama3.2:3b`, temp 0, pinned rubric). NDCG + per-product 0–3 grades.
   - **PIPELINE capture ‖ grade.** Both are slow — overlap them. Flush each capture chunk to disk and immediately submit it to Cortex (background job) while the next chunk captures; poll all job_ids at the end. Wall-clock ≈ max(capture, grade). See the `retail-search-eval` skill for the full pipeline pattern (including the clipboard→`pbpaste` trick for moving browser captures to disk fast).
5. **Analyze** → coverage (zero-result rate), precision (mean grade, %not-relevant), guardrail (recall-miss vs true-empty vs assortment-gap), and old-vs-new if migrating.
6. **Demand overlay** → `scripts/export-terms.mjs` emits a comma line for Google Keyword Planner + a CSV. Paste KP results back; parse with the sibling `~/code/demand-data-generation` (`scripts/parse-keyword-planner-paste.js`) or the dashboard's `/api/demand/import`. Join volume → split **search-bugs** (stocked, fails) vs **assortment-gaps** (not stocked).
7. **Eval board** → assemble `eval-board.json` and render it in the dashboard (`src/evaluator/dashboard-server.mjs`, the `loadEvalBoard` panel: macro verdict cards + per-dataset coverage bars + collapsed drill-down + Copy-terms/Import-KP + PDF link). **Every board must also include a Findings panel (from `eval-board.json` `findings[]`, severity-ranked) and the demand overlay affordance** — see the sibling `retail-search-eval` skill steps 7–8 for the required-sections checklist that applies to both boutique and enterprise boards. Serve via `/artifact` and `/api/eval-board` / `/api/eval/rerun-ndcg`.
8. **Report** → `scripts/gen-report.mjs` reads a `report-data.json` and emits a **Northvalley-branded** LaTeX PDF (cover → Summary/How-we-measured → **Findings** → **Demand-ranked quick-wins** → How-we-can-help → details → appendix). Needs `northvalley-brand.sty` + logo (see below). Compile with `pdflatex` twice.

## eval-board.json shape (drives the board and the report)
```
{ eval_id, sector, rubric_hash, judge, stores: {IW:{name,platform,...}, SB:{...}},
  catalog_context: { skus, categories, types:[{name,count}], materials:[{name,count}] },
  macro: { datasets:[{id,name,terms,takeaway,per_store:{IW:{answered,zero,median_results,mean_ndcg}, SB:{...}}}],
           totals:{IW:{search_calls,answered,zero_rate_pct,mean_ndcg,mean_grade,pct_not_relevant,verdict}, SB:{...}, search_calls_all, ...} },
  rows: [{store, dataset, q, total, search_call, items:[titles], ndcg_pinned, grades_pinned}],
  findings: [{severity, area, title, detail}] }
```
`report-data.json` (for `gen-report.mjs`) is derived from `eval-board.json` + the demand volumes — see `scripts/gen-report.mjs` header for the exact fields (`totals`, `datasets`, `bugs`, `gaps`, `strengths`, `allTerms` with `iw/sb/iw_ndcg/sb_ndcg`, `catalog`).

## Datasets (what each tests)
- **synonym / category** — equivalence: does the engine map accent chair ↔ lounge chair, credenza ↔ sideboard? Guardrail: if one variant returns and another is 0, the 0 is a recall miss.
- **attribute (material + type)** — walnut/marble/velvet + type. Usually the weakest area.
- **job-function / intent** — natural language ("furnish a living room"). Usually dead on basic engines.
- **head terms** — common product types (dining table, bar stool). Should work; the baseline.
- **literal (product names)** and **intent (category labels)** — optional internal probes; exclude from the demand overlay (no real Google demand).

## Branded report assets
The report uses the Northvalley template (`northvalley-brand.sty` + `northvalley-logo.png`). Copy them from `~/code/northvalley-receipts-invoices-flyers/shared/styles/` and `.../assets/` into a `northvalley-template-assets/` folder next to the `.tex`, then compile. `gen-report.mjs` already targets `northvalley-template-assets/`. Colors: `NVIInk`, `NVIAccent`, `NVIAccentDark`, `NVIPanel`, `NVIRule`. Macros: `\ReportSection`, `\ReportDarkCard`, `\MetricCard`, `\ReportKicker/Body/Fine`. See the `northvalley-pdf-templates` skill for the full template family.

## Adapting to a new store (checklist)
1. Detect platform + confirm the **real** search engine (lesson 1). Add a target/site entry if wiring the dashboard.
2. Profile the catalog (SKUs, categories, stocked types/materials).
3. Capture with the matching capture method; store per-term totals + top-8 titles.
4. Grade with Cortex under a pinned rubric; validate the judge on a gold set.
5. Build `eval-board.json`; classify recall-miss vs true-empty vs assortment-gap using the catalog guardrail.
6. Export terms → Keyword Planner → import volume → split search-bugs vs assortment-gaps, rank by demand.
7. Derive `report-data.json`; run `gen-report.mjs`; compile the branded PDF; wire the board + PDF link.
8. Record findings and a validation note in the MDE artifacts if the project uses MDE.

## Do / Don't
- **Do** measure the shopper-facing engine, pin the rubric, validate the judge, use the catalog guardrail, rank by demand, keep reads bounded.
- **Don't** use a Store API or loose GraphQL as a proxy for shopper search, present head-term volume as addressable revenue, fabricate screenshots (this sandbox can't save them — use live URLs or captured result text), or claim reproducibility without a pinned `rubric_hash`.
