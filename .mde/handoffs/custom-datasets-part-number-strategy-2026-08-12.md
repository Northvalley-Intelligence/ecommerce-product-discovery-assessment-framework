# Handoff — Generic custom datasets + part-number strategy

**Date:** 2026-08-12
**Origin:** parts.cat.com (Heavy Duty sector) assessment, stages 1–5 complete and contract-valid.
**For:** the next working session. Ferosh will author a custom dataset offline and bring it; Claude builds the upload → validate → recompute flow.

## Build status (2026-08-12) — backend plumbing DONE + tested

The generic backend (§9 items 1–4) is built and validated end-to-end against the 4 real not-found part numbers captured this session:

- `schemas/search-eval/custom-dataset.schema.json`, `dataset-manifest.schema.json` — added.
- `framework/search-eval/scripts/load-custom-dataset.mjs` — validates type-specific record shape, derives the chip label, warns on missing demand.
- `framework/search-eval/scripts/score-custom-dataset.mjs` — type-aware: `one_to_one` retrieval (rank + title fidelity, not-found = full loss) and `relational` count-direction/overlap.
- `framework/search-eval/scripts/estimate-custom-impact.mjs` — inline-demand × type-aware loss_fraction → annual $ at risk.
- Proof: `assessments/partscat/search-eval/SE-20260812/part-number-1to1.sample.json` → `scored-part-number-1to1.json` (100% not-found) → `custom-impact.json` (**base ~$11K/yr from 4 placeholder-volume terms**).

**Remaining (§9 items 5–6, the dashboard UI):** upload + validate/preview panel, manifest-driven generic dataset rendering, the 8-stage pipeline strip, and wiring custom impact into the board's `revenue_loss`. So bringing the real dataset is now: **upload → validate in UI → gentle-capture the new terms → recompute** — no backend rebuild.

---

## 1. Why this exists

The 5 default datasets (`synonym`, `attribute`, `job_function`, `intent`, `literal/brand`) were built for consumer retail. On parts.cat.com they mostly miss: the real demand is **part numbers, serial/model lookups, and cross-references**, none of which the category-recall method can generate. The graded eval proved the blind spot from both sides:

- **Method can't generate** part-number queries (stage 2: 9/69 terms keyed, all one battery branch).
- **Engine can't answer** them (stage 5: 4/4 exact part numbers → 0 results; `1R-1808` appears under "oil filter for C15 engine" but returns 0 for the query "1R-1808" — the index is on descriptions, not part numbers).

So the pipeline needs to stop assuming the 5 fixed datasets and instead take a **per-eval dataset manifest**: drop defaults that don't fit, add **custom, single-type datasets** with their own evaluation logic, demand, scoring, impact, and report treatment.

---

## 2. Core model

### 2.1 A custom dataset is ONE homogeneous relation type

Each custom dataset holds exactly one `type`. No mixing.

| `type` | Each record relates `term` → `counterpart`/`expected` | What "good" means |
|---|---|---|
| `synonym` | term ≡ counterpart | result **counts stay ~equal** and result sets overlap strongly |
| `hyponym` | term is **narrower** than counterpart (e.g. `bucket tip` → `ground engaging tools`) | count(term) **≤** count(counterpart); term results ⊆ counterpart results (**decreasing/subset**) |
| `hypernym` | term is **broader** than counterpart (e.g. `battery` → `heavy duty battery`) | count(term) **≥** count(counterpart); counterpart results ⊆ term results (**increasing/superset**) |
| `one_to_one` | term maps to exactly one `expected` product (e.g. part# → its product) | expected product is **retrievable**; position + title-variation graded (see 2.3) |

### 2.2 `built_from` drives the label

Every custom dataset carries a prose `built_from` explaining how it was constructed. The board derives the **per-term source chip** (the existing `source`/label mechanism) from it — either an explicit `label` field or a short slug generated from `built_from`. This keeps provenance honest and visible, exactly like the `catalog_node` / `authored` chips today.

### 2.3 1-1 does NOT mean results are 1-1

A `one_to_one` record maps a query to ONE expected product, but the results page can legitimately look several ways. The scoring rubric must encode the gradations, not demand a single result:

| Outcome | Score band | Note |
|---|---|---|
| Expected product is the **sole result, exact title** | best (3) | ideal |
| Expected product **@ rank 1** among several | strong (2.5–3) | fine |
| Expected product **present, not first** | partial (1.5–2), scaled by rank | findable but buried |
| **Sole result but title variation** (Cortex confirms same product) | strong-partial (2.5) | wording differs, product right |
| Expected product **present with title variation, not first** | partial | |
| **Not found at all** | fail (0) | the parts.cat.com part-number case → full impact loss |

Cortex's role for 1-1: judge **title-variation equivalence** ("is this result the same product as the expected one, despite different wording?") and rank relevance. The count-direction checks do not apply to 1-1.

---

## 3. Proposed dataset file format (what Ferosh brings)

One self-contained JSON per custom dataset, demand inline so we never re-run the whole set's Keyword Planner.

**Relational (synonym / hyponym / hypernym):**
```json
{
  "custom_dataset_version": "1",
  "dataset_id": "get-hyponyms",
  "name": "GET hyponyms",
  "type": "hyponym",
  "built_from": "Took each Ground Engaging Tools leaf category name as the broad counterpart and paired it with the shopper's narrower word for a specific tool (bucket tip -> ground engaging tools). Tests whether searching the specific term returns a subset of the broad term, i.e. the engine understands the is-a relation.",
  "label": "hyponym",                     // optional; else derived from built_from
  "records": [
    { "term": "bucket tip", "counterpart": "ground engaging tools", "monthly_volume": 2400 },
    { "term": "grouser bar", "counterpart": "undercarriage", "monthly_volume": 880 }
  ]
}
```

**1-1 (part number → product):**
```json
{
  "custom_dataset_version": "1",
  "dataset_id": "part-number-1to1",
  "name": "Part number -> Product",
  "type": "one_to_one",
  "built_from": "Sampled high-velocity Cat part numbers from PLP capture; each pairs the EXACT part number (query) with the product page that IS that part (expected). Built to test whether the search box resolves a part number to its own product.",
  "label": "part number",
  "records": [
    { "term": "1R-1808", "expected": { "sku": "1R-1808", "title": "Engine Oil Filter" }, "monthly_volume": 8100 },
    { "term": "326-1644", "expected": { "sku": "326-1644", "title": "Fuel Water Separator" }, "monthly_volume": 1300 }
  ]
}
```

Field rules to enforce on upload:
- `type` ∈ {synonym, hypernym, hyponym, one_to_one}; the whole file is that one type.
- relational records require `term`, `counterpart`, `monthly_volume`.
- one_to_one records require `term`, `expected.{sku,title}`, `monthly_volume`.
- `built_from` required (non-empty) — it generates the label.

A JSON Schema (`schemas/search-eval/custom-dataset.schema.json`) should be added and wired into `pipeline-status`.

---

## 4. Generic dataset manifest (drop defaults + add custom)

Add a per-eval **manifest** (e.g. `dataset-manifest.json` in the assessment dir, or a field on the board) listing which datasets are active and how each is scored:

```json
{
  "datasets": [
    { "id": "synonym", "kind": "default", "scoring": "grade_recall", "include": true },
    { "id": "attribute", "kind": "default", "include": false },
    { "id": "job_function", "kind": "default", "include": false },
    { "id": "intent", "kind": "default", "include": false },
    { "id": "literal", "kind": "default", "include": false },
    { "id": "part-number-1to1", "kind": "custom", "type": "one_to_one", "scoring": "retrieval", "file": "part-number-1to1.json" },
    { "id": "get-hyponyms", "kind": "custom", "type": "hyponym", "scoring": "relational", "file": "get-hyponyms.json" }
  ]
}
```

The board, impact model, and report must iterate the manifest instead of the hardcoded `dsOrder`. Every place that currently assumes 5 datasets (`build-eval-board.mjs`, `dashboard-server.mjs` `loadRetailBoard`, `estimate-search-revenue-loss.mjs`, the report generator) reads the manifest.

---

## 5. Type-aware scoring (Cortex + rules)

| Dataset kind | Scoring mode | Signal |
|---|---|---|
| default (`synonym`, `attribute`, …) | `grade_recall` (unchanged) | per-result 0–3 + recall vs catalog key |
| custom `synonym` | `relational` | \|count(a) − count(b)\| within tolerance; set overlap (Jaccard) high; Cortex grades a's top results against b's intent → **same** |
| custom `hyponym` | `relational` | count(term) ≤ count(counterpart) AND term-results ⊆ counterpart-results → **subset/decreasing** holds or is violated |
| custom `hypernym` | `relational` | inverse of hyponym → **superset/increasing** |
| custom `one_to_one` | `retrieval` | is `expected.sku` in results, at what rank; Cortex confirms title-variation equivalence; score per the 2.3 rubric |

Each mode emits a per-record score + a per-dataset roll-up (e.g. one_to_one: % found@1, % found, % not-found; relational: % direction-holds).

---

## 6. Impact dollars by type

Extend `estimate-search-revenue-loss.mjs` to read **inline `monthly_volume`** from the manifest datasets and apply a **type-aware `loss_fraction`**:

- `one_to_one`: not-found = **full loss** (shopper searched the exact part, got nothing); found@1 = 0; found@n = partial (scaled by rank); title-variation-only = small loss.
- `relational`: loss when the direction is violated (e.g. a hyponym returning MORE than its hypernym, or a synonym pair with wildly divergent counts) + Cortex grade.
- default: existing grade-based model.

Because demand is inline per record, no full-set Keyword Planner pass is needed for the custom terms. Keep the millions-format + 1000-term extrapolation conventions from the existing revenue skill.

---

## 7. Upload → validate → recompute flow (the session's build)

1. **Upload affordance on the board** (like the demand-overlay paste box): operator uploads the custom dataset JSON (+ optional manifest include/exclude toggles for the 5 defaults).
2. **Validate in the UI first** (Ferosh emphasized this): parse, schema-check, then show a **preview panel** — type, derived label (from `built_from`), N records, sample term ↔ counterpart/expected pairs, inline demand, and any parse warnings — so the operator confirms "this makes sense" before anything runs.
3. On confirm → **capture** the custom terms' search responses. NOTE: for Akamai/enterprise sites (parts.cat.com) this is **browser-eval and needs the Claude browser session** — it is not a pure server button. Reuse the gentle-capture discipline: ≥10 s pacing, Access-Denied detection, `capture-bridge` export before any navigation.
4. **Cortex score by type** (§5).
5. **Recompute** board + impact dollars (§6) + **regenerate report**.

Honest constraint to bake in: steps 3–5 are Claude-in-the-loop for bot-protected sites; the UI upload/validate (steps 1–2) can be self-serve, then it hands the captured set to the scoring/recompute run.

---

## 8. Related UI gap (raised same session)

**No visual for the 8 pipeline stages in the dashboard.** Add a **pipeline-stages strip** to the board (or site header): the 8 stages (catalog-capture → category-recall-dataset → search-engine-profile → search-capture → search-grade → finding-verify → search-board → search-report) with per-stage status (ok / partial / not-run) sourced from `pipeline-status.mjs` output. This makes "where is this assessment" legible and pairs naturally with the dataset manifest (which datasets fed which stage).

---

## 9. Touch-points (where the code lives)

- `schemas/search-eval/` — add `custom-dataset.schema.json`, `dataset-manifest.schema.json`; the query-pack schema already carries `part_number` in its dataset + source enums (added this session).
- `framework/search-eval/scripts/build-category-keys.mjs` — already emits `source` incl. `part_number`; the partial-capture guard is in place.
- `framework/search-eval/scripts/capture-bridge.mjs` — reusable browser export (window.name transport), built this session; reuse for custom-term capture.
- `assessments/partscat/search-eval/SE-20260812/build-eval-board.mjs` — generalize from `dsOrder` to the manifest.
- `src/evaluator/dashboard-server.mjs` `loadRetailBoard` — add upload+validate panel, render custom datasets + source chips generically, add the pipeline-stages strip.
- `scripts/estimate-search-revenue-loss.mjs` — inline-demand + type-aware loss.
- the report generator — iterate the manifest; render custom-dataset sections with their `built_from` label.

---

## 10. First concrete deliverable for Ferosh

Build **one `one_to_one` part-number dataset for parts.cat.com** using the §3 template:
- ~30–40 real Cat part numbers (sample from `assessments/partscat/search-eval/SE-20260812/catalog.json` skus + famous ones: 1R-1808, 1R-0749, 326-1644, 9X-3404, 153-5710 …),
- each with its `expected.{sku,title}`,
- each with a `monthly_volume` (bring the Google monthly counts for just these terms),
- a `built_from` paragraph.

Bring it next session; Claude wires the upload+validate panel, captures the responses gently, scores retrieval via Cortex, and recomputes board/impact/report for the part-number dataset — which we already expect to show a near-total not-found failure worth real impact dollars.

---

## 11. Open decisions (Ferosh's call)

1. **Manifest location** — per-assessment `dataset-manifest.json`, or a field inside the served board? (Recommend a file, referenced by the board.)
2. **Relational tolerance** — what count-delta counts as "same" for synonyms (e.g. ±20%)? And is a hyponym allowed to slightly exceed its hypernym before it's a violation?
3. **1-1 rank scoring curve** — linear by rank, or top-3 vs beyond? And how much to penalize title-variation-only.
4. **Should custom datasets fully REPLACE recall** for a sector, or coexist? (parts.cat.com: recall is near-useless; retrieval + relational are the real signals.)
5. **Report framing** — keep the 5-dataset scaffold as an appendix, or drop unused defaults entirely from the client-facing report.
