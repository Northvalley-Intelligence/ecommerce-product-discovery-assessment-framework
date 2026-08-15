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

## 2. The dataset contract is a PORTABLE SPEC — not this project's internals

**A dataset producer needs nothing from this repo.** The format, the four relation types, the 1-1 nuance, `built_from → label`, demand inline, and the optional `interchange`/`evidence` extension are defined once, producer-agnostically, in:

- **`docs/custom-dataset-spec.md`** — the human spec (anyone/any tool can author against it).
- **`schemas/search-eval/custom-dataset.schema.json`** — the machine contract (validate with any JSON-Schema validator; extensible via `additionalProperties`).

Conformance is the only requirement: produce a file that passes the schema and it drops into any host that accepts this contract. **Everything below this line is the CONSUMER side — how *this* project ingests a conforming dataset.** It is not needed to create one.

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

Build **one `one_to_one` part-number dataset for parts.cat.com** following `docs/custom-dataset-spec.md`:
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
