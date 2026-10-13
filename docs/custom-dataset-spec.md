# Custom Search-Evaluation Dataset — Spec (portable)

A **custom dataset** is a self-contained JSON file that defines a set of search queries and the relation each query has to a counterpart term or an expected product. **Anyone or any tool can produce one from this document alone** — no knowledge of the evaluation host's internals is needed. If your file conforms, the host will ingest it, score it by type, price it from your inline demand, and include it in the board and report.

Machine-checkable contract: `schemas/search-eval/custom-dataset.schema.json` (validate with any JSON-Schema validator). This page explains the meaning.

## Principles

1. **Portable.** Producing a dataset requires only this spec + the schema.
2. **One relation type per file.** A dataset is homogeneous — all `synonym`, or all `hyponym`, etc. Don't mix.
3. **Self-describing.** `built_from` explains how it was made and generates the dataset's label.
4. **Demand inline.** Each record may carry `monthly_volume`, so revenue/impact is computed without a separate demand pass.
5. **Extensible.** Records may carry extra fields (e.g. `interchange`, `evidence`); the host reads what it understands and ignores the rest.

## File shape

```json
{
  "custom_dataset_version": "1",
  "dataset_id": "short-stable-id",
  "name": "Human readable name",
  "type": "synonym | hypernym | hyponym | one_to_one",
  "built_from": "One paragraph: what these terms are, where they came from, and how each relation was established.",
  "label": "optional short chip label (else derived from type)",
  "records": [ ... ]
}
```

## The four types — what each asserts, and how it's scored

| `type` | Each record relates `term` → | "Good" means | Host scoring |
|---|---|---|---|
| `synonym` | term **≡** counterpart | result **counts stay ~equal** and result sets overlap | relational: count parity + overlap |
| `hyponym` | term is **narrower** than counterpart (`bucket tip` → `ground engaging tools`) | count(term) **≤** count(counterpart); term results ⊆ counterpart (**decreasing/subset**) | relational: count-direction + subset |
| `hypernym` | term is **broader** than counterpart (`battery` → `heavy duty battery`) | count(term) **≥** count(counterpart); superset (**increasing**) | relational: count-direction + superset |
| `one_to_one` | term maps to exactly one `expected` product | expected product is **retrievable** (rank + title fidelity) | retrieval: found@rank + title match |

## Records by type

**Relational (`synonym` / `hypernym` / `hyponym`)** — each record needs `term`, `counterpart`, and (optionally) `monthly_volume`:

```json
{ "term": "bucket tip", "counterpart": "ground engaging tools", "monthly_volume": 2400 }
```

**`one_to_one`** — each record needs `term`, `expected.{sku,title}`, and (optionally) `monthly_volume`:

```json
{ "term": "1R-1808", "expected": { "sku": "1R-1808", "title": "Engine Oil Filter" }, "monthly_volume": 8100 }
```

## The 1-1 nuance: a 1-1 dataset does NOT mean 1-1 results

Mapping a query to one expected product does not require the results page to return exactly one result. The host grades **where and how** the expected product shows up — all of these are legitimate, in decreasing quality:

| Outcome | Quality |
|---|---|
| Expected product is the **sole result, exact title** | ideal |
| Expected product **@ rank 1** among several | strong |
| Expected product **present, not first** | partial (scaled by rank) |
| **Sole result, but title is a variation** of the expected | strong-partial |
| Expected product **present with a title variation, not first** | partial |
| Expected product **not found at all** | failure (full impact loss) |

So author 1-1 records honestly: the `expected` is the *right* product; the host decides how well search surfaced it.

## `built_from` → label

`built_from` is required and human-readable. The host derives the dataset's chip **label** from it (or uses your explicit `label`) and shows the full `built_from` text as the tooltip. Write it so a reader understands provenance without opening the records — e.g. *"Paired each GET leaf category with the shopper's narrower word for a specific tool; relation established from the catalog taxonomy."*

## Demand (inline)

Put the term's monthly search volume in `monthly_volume` per record. This lets the host compute impact/revenue for just your dataset, without re-running demand for the whole evaluation. Records without it are scored but contribute $0 impact until demand is added.

## Optional extensions

Records may carry additional fields. Two are recognized by the schema so they validate cleanly:

- **`interchange`** — a cross-reference / equivalent identifier (or list), e.g. a competitor part number equivalent to a Cat part number.
- **`evidence`** — provenance a human can use to verify the relation later: `{ "source": "<url or file>", "page": <n>, "line": <n> }`.

Example (a cross-reference dataset extends `one_to_one`):

```json
{
  "term": "1R-1808",
  "expected": { "sku": "1R-1808", "title": "Engine Oil Filter" },
  "interchange": ["Fleetguard LF9080", "Baldwin B7577"],
  "evidence": { "source": "https://example.com/cross-ref-guide.pdf", "page": 12, "line": 4 },
  "monthly_volume": 8100
}
```

Additive fields must not change the meaning of the required ones. Hosts ignore fields they don't understand.

## Validate before you hand it over

```
# any JSON-Schema validator against schemas/search-eval/custom-dataset.schema.json
node framework/search-eval/scripts/load-custom-dataset.mjs your-dataset.json
```

The loader reports `ok`, any `errors` (missing required core per type), `warnings` (missing demand, duplicate terms), and a `preview` (derived label, record count, total volume, samples) — the same preview the host shows for confirmation before ingesting.

## What the host guarantees for a conforming file

1. Validate + show a preview (label, type, records, demand) for confirmation.
2. Capture each `term`'s live search response.
3. Score by `type` (relational count-direction / overlap, or 1-1 retrieval).
4. Compute impact from your inline `monthly_volume`.
5. Fold the dataset into the board and regenerate the report, labeled from `built_from`.

## Authoring checklist

- [ ] One `type` for the whole file.
- [ ] `custom_dataset_version`, `dataset_id`, `built_from`, `records` present.
- [ ] Relational records have `counterpart`; `one_to_one` records have `expected.{sku,title}`.
- [ ] `monthly_volume` on records you want priced.
- [ ] For evidenced datasets: `evidence.source` (+ page/line) on each relation you assert.
- [ ] Passes `load-custom-dataset.mjs` with no errors.
