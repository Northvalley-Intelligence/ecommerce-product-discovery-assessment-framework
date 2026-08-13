---
name: catalog-capture
description: Capture an ecommerce retailer's own taxonomy — category nodes, the facet filters each exposes, and the SKUs behind them — into catalog.json. Produces the answer keys every later recall measurement depends on, and the guardrail that separates a search bug from an assortment gap. Use as stage 1 of an ecommerce search assessment, or when asked what a store stocks, its category structure, or its filter rails.
---

# Catalog capture

**Stage 1 of 8.** Enforces **L04**, **L05**, **L14**. See `framework/search-eval/LESSONS.md`.

| | |
|---|---|
| **Input** | a retailer domain |
| **Output** | `catalog.json` — `schemas/search-eval/catalog.schema.json` |
| **Gate** | `facet_provenance` recorded; per-facet `null_rate` computed; `sibling_blocklist` emitted |

Everything downstream keys off this. Recall has no denominator without it, and a
zero-result cannot be classified without it — a store that returns nothing for
`welding boots` is broken if it stocks them and merely honest if it doesn't.

## 1. Enumerate nodes

Sitemap first (`/sitemap.xml`, `/sitemap_index.xml`), then the nav tree, then the
PLP's own category JSON. Record for each: `node_id`, `node_name`, `parent_id`,
`depth`, `url`, `sku_count`.

Also record `singular` — the node name in the form a shopper types. `Chairs` → `chair`,
`Women's Loafers` → `loafer`. Stage 2 synthesizes queries from this, and getting it
from the catalog beats guessing later.

**Keep the parent links.** The sibling blocklist and the hyponym directions both come
from the tree, and reconstructing it afterwards is not possible.

## 2. Enumerate facets per node

For each node, the filter rails it exposes and each value's result count. That count
is a candidate answer key size.

Two things must be recorded alongside it, because both determine whether the key can
be trusted (**L05**):

- **`null_rate`** — the share of the node's SKUs with no value for this facet. Compute it, don't assume it. A facet null on a third of the node produces a key that is too small, and a too-small key inverts the precision reading downstream.
- **`cross_cutting`** — true when the facet spans siblings. Closure (`slip-on` / `lace-up`) covers loafers, mules and slides; material covers most of the catalog. These produce `node_attr` relations in stage 2, never node equivalences (**L07**).

## 3. Record facet provenance — this is a gate

Ask how the facet actually gets populated:

| Provenance | Key confidence |
|---|---|
| `merchandiser`, `supplier_feed`, `manual_review` | may be high |
| `text_classifier` | capped at **low** |
| `unknown` | capped at **low** |

If a text classifier assigned the facet by reading product titles, and search indexes
those same titles, then recall measures the classifier agreeing with itself. The number
looks like a measurement and is a tautology. Find out before capturing, and write the
answer down.

## 4. Emit the sibling blocklist

Every pair of nodes sharing a parent, as `[node_id, node_id]`. Stage 2 applies it
before any synonym candidate is proposed, which is what stops `loafers`/`oxfords` from
ever being suggested as equivalent (**L06**).

## 5. SKUs

`sku`, `title`, `node_ids`, `attrs`. Titles are what stage 2 diffs to mine synonym
candidates, so capture them verbatim — no normalising, no truncation.

Where the store exposes no catalog API (most enterprise sites), capture what the PLPs
give and **fill `limitations`**. A partial catalog honestly labelled is usable; a
partial catalog presented as complete makes every downstream recall number wrong in a
direction nobody can see.

## Politeness

**L14.** ~1/sec, `Northvalley-Ecommerce-Inspection/0.1`, robots respected, no crawling
loops. Category and facet pages are cheap; there is no reason to be fast.

## Do / Don't

- **Do** compute null rates rather than assuming, keep parent links, record provenance honestly, capture titles verbatim, declare limitations.
- **Don't** infer a facet's population from its value counts, drop the tree after flattening, treat a classifier-assigned facet as ground truth, or present a partial catalog as complete.
