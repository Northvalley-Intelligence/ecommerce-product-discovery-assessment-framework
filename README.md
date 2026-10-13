# Ecommerce Search-Relevance Inspection Framework

An MDE-managed, reusable framework — and a local application — for **inspecting the on-site search relevance of any ecommerce store**, classifying what's broken, quantifying the revenue at risk, and producing an executive-ready report. Built to be a monetizable consulting asset that works across verticals: apparel, footwear, industrial/auto parts, distributors, and specialty retail.

## Overall goal

Turn "is this store's search any good?" into **defensible, reproducible evidence with a dollar figure**. Concretely, the local application:

1. **Runs** a bounded, polite search-relevance inspection on a public ecommerce URL — no crawling, no scraping, reading only what a shopper sees.
2. **Classifies** each result as a genuine search bug, a shallow answer, or an honest assortment gap (broken search vs. "they just don't stock it").
3. **Quantifies** revenue-at-risk from real search demand × relevance quality.
4. **Verifies** its worst findings through an independent path before reporting them.
5. **Reports** it all in a branded, executive-ready PDF and an operational dashboard.

The guiding separation: **inspection** ("what did we observe?") stays free of interpretation; **interpretation** ("what does it mean, what's it worth, how to fix it") is a downstream consumer of that evidence.

## Architecture — an 8-stage contract pipeline

Each stage is a **skill** (`.claude/skills/*`), governed by a **JSON-Schema contract** (`schemas/search-eval/*`), producing a versioned **artifact**. The orchestrator `framework/search-eval/scripts/pipeline-status.mjs` reports, per stage, `ok / partial / not-run` against its contract. A phase exits only on two independent clean validation passes.

```
1 catalog-capture        catalog.json        the store's own taxonomy, facets, SKUs
        │                                     → answer keys + the "do they stock it?" guardrail (L04)
2 category-recall-dataset query-pack.json     terms + answer keys + per-term source label
        │                                     → recall gets a denominator, not a hand-typed guess
3 search-engine-profile   engine-profile.json how to reach the REAL shopper engine, verified vs live UI (L01)
        │
4 search-capture          captures.json       what the engine returned per term (organic only, L09)
        │
5 search-grade            grades.json         0–3 per result + NDCG from a PINNED local judge + gold check (L02/L03)
        │
6 finding-verify          verified-findings   worst findings re-checked through a DIFFERENT path (L08)
        │
7 search-board            eval-board.json     classified rows + recall + revenue-at-risk + verification
        │
8 search-report           report-data.json    → branded executive PDF
```

Hard-won failure modes are codified as **Lessons L01–L14** (`framework/search-eval/LESSONS.md`) and each is claimed by a skill.

## Key concepts

- **The catalog is the ground truth.** A zero-result is a *search bug* only if the store stocks the thing; otherwise it's an *assortment gap* (merchandising, not search). Classifications: `search_bug`, `shallow_answer`, `assortment_gap`, `true_empty`, `capture_artifact`, `brand_redirect`.
- **Recall with a real denominator.** `recall = |search ∩ catalog answer-key products| / answer-key`. A category node × a facet value is a query with a known answer — the number a relevance grade cannot give.
- **A pinned, validated judge.** Relevance is graded 0–3 by a local **Cortex** service (`127.0.0.1:7077`, `llama3.2:3b`, temperature 0) at a **fixed rubric hash**, so results are reproducible; ~24+ hand-labeled pairs (`gold_validation`) keep the judge honest and its bias stated.
- **Independent verification (L08).** A finding produced by one capture path is re-checked through a *different* one before it can appear in the report.
- **Revenue-at-risk.** Per term: `volume × market_share × conversion × AOV × loss_fraction`, from **real Google Keyword Planner** volumes (never fabricated), reported as a range in millions with a 1,000-term extrapolation.
- **Provenance labels.** Every term shows *how it was selected* (`catalog` / `facet` / `authored` / `mined` / `part_number` …) as a chip with a tooltip — no black-box datasets.
- **Query datasets.** Five defaults (`synonym`, `attribute`, `job_function`, `intent`, `literal/brand`) — plus, in progress, **custom single-type datasets** (`synonym` / `hypernym` / `hyponym` / `one_to_one`) selected per-eval via a dataset manifest, so a sector can drop defaults that don't fit and add ones that do (e.g. a part-number 1-1 dataset for a parts catalog). See `.mde/handoffs/custom-datasets-part-number-strategy-2026-08-12.md`.
- **Browser-eval for hardened sites.** Many enterprise stores (Target/PerimeterX, Caterpillar/Akamai) block server-side reads. Capture then runs in a real browser at polite pacing, **never bypassing bot protection** — recover by waiting, never by rotating identity. `framework/search-eval/scripts/capture-bridge.mjs` exports large in-browser captures to disk.

## The application surface

`src/evaluator/dashboard-server.mjs` (port 4173) — the operational dashboard to run, review, compare, and decide report-readiness across sites: per-dataset metrics with in-place term drill-down, recall + verification panels, a demand overlay (paste Keyword Planner), a revenue-at-risk panel, and a per-store PDF link. It is the seed of the product, not a debug view.

## Repository layout

| Path | What |
|---|---|
| `.claude/skills/` | one skill per pipeline stage (+ `ecommerce-search-assessment` umbrella) |
| `schemas/search-eval/` | the JSON-Schema contract for each stage's artifact |
| `framework/search-eval/` | shared scripts (`pipeline-status`, `build-category-keys`, `measure-recall`, `capture-bridge`, …) + `LESSONS.md` |
| `assessments/<retailer>/search-eval/SE-<date>/` | per-site evaluation artifacts (catalog, pack, captures, grades, board, report) |
| `sectors/` , `targets/` | sector definitions and per-site capture profiles |
| `scripts/estimate-search-revenue-loss.mjs` | the revenue-at-risk model |
| `src/evaluator/` | the dashboard server + validators |
| `.mde/` | mission-driven-engineering state, generations, findings, handoffs |

## Sites inspected so far

Target, Cat Footwear, Timberland PRO (footwear), Industry West (furniture), Allbirds, Home Depot / Lowe's (home improvement), and **parts.cat.com** (Heavy Duty / industrial parts). The parts.cat.com run surfaced the current strategic thread: on a part-number-heavy B2B catalog the default datasets miss the real demand, and the live engine returns **zero results for exact part numbers** — motivating the custom-dataset work now in progress.

## Share site

A read-only copy of the search-relevance boards (Big Green Egg, Cat Footwear, Cat Parts Store, Target) is published at `https://search-eval.demo.northvalleyintel.com` for an outside advisor. It is a static snapshot, not a live dashboard: `scripts/export-share-site.mjs` starts the real dashboard on a free localhost port, drives it with Playwright (all non-localhost traffic blocked), records every `/api/*` and `/artifact*` GET the four boards make, and writes them with a share-mode `index.html` (`dashboardPage({ share: true })`, no operator controls) into `share-dist/`. `share/worker.mjs` (`wrangler.jsonc`, Worker `search-eval-share`) serves only those recorded URLs, `GET` only.

Access is enforced by Cloudflare Access, configured outside this repo; the Worker itself has no login. `.github/workflows/deploy-share.yml` rebuilds the snapshot and deploys on every push to `main` (needs the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets). To build locally: `node scripts/export-share-site.mjs`, then `npx wrangler dev --local`.

## Getting started

Read `MISSION.md`, then `.mde/state.json` and `.mde/validation-strategy.json`. Run `node framework/search-eval/scripts/pipeline-status.mjs <assessment-dir>` to see where any site's inspection stands against its contracts.
