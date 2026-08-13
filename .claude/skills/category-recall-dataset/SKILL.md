---
name: category-recall-dataset
description: Build a search-eval query pack from the retailer's own category nodes and facet filters, so every term ships with a known answer key and a real recall number instead of a hand-typed guess. Produces query-pack.json plus directional synonym candidates with SKU-level evidence. Use as stage 2 of an ecommerce search assessment, or when a query pack needs a denominator, or a synonym dataset has orphan or one-sided pairs.
---

# Category-recall dataset

**Stage 2 of 8.** Enforces **L05**, **L06**, **L07**. See `framework/search-eval/LESSONS.md`.

| | |
|---|---|
| **Input** | `catalog.json` |
| **Output** | `query-pack.json` — `schemas/search-eval/query-pack.schema.json` |
| **Gate** | every term declares `has_key`; keyed terms carry `null_rate` and `confidence`; `orphans` listed |

Query packs used to be hand-authored word lists — `build-terms.mjs` had
`'moccasins', 'slip ons', 'loafers', ... 'oxfords'` typed as literals. That gives the
judge something to grade but leaves the pack with **no denominator**: a grade says
whether what came back is relevant, never what was missed. A term can score 3.0 on
eight results while the catalog holds forty.

It also produced silent orphans. `compared_to` was assigned after the fact, so
`oxfords` ended up with no partner — not because the taxonomy lacks one, but because
nobody typed `lace ups`.

A category node plus a facet filter is a query with a known answer:

```
node "Chairs" + filter material=plastic → 24 SKUs
query "plastic chair"                   → the engine's answer
recall = |search ∩ those 24| / 24
```

Nobody grades anything to get that. The merchandiser already did, when they filed the SKU.

## 1. Synthesize the queries

For each node × facet value, build the term from `query_template`, usually
`{facet_value} {node.singular}` → "plastic chair".

Record the template. The synthesized string is a **proxy** for shopper phrasing — real
queries are "stackable plastic chairs", "plastic garden chair" — and the report must
not present it as one. Real phrasing arrives with the demand overlay.

## 2. Decide whether each key can be trusted — the gate

**L05.** Two ways a key lies, and both are silent:

**Hollow.** If `material` is null on a third of the node, the filter returns 24 when the
truth is 36. Search returns 30, twelve outside the key, and the board reports
over-expansion — when search actually found chairs the *facet* forgot. Acting on that
means deleting correct synonyms.

**Circular.** If the facet was assigned by a text classifier over titles and search
indexes those same titles, recall measures the classifier agreeing with itself.

| Condition | Action |
|---|---|
| facet `null_rate` > 0.30 | **emit no key** — `has_key: false` |
| `facet_provenance` is `text_classifier` or `unknown` | `confidence: low` |
| `null_rate` 0.10–0.30 | `confidence: medium` |
| clean merchandiser/feed data, low nulls | `confidence: high` |

A `low` confidence key may still be measured; it may not drive a precision finding.

## 3. Label the relation — not everything is an equivalence

**L06, L07.**

| Relation | Example | Direction |
|---|---|---|
| `node_equivalence` | sneakers / trainers | may be `bi` if proven |
| `hyponym` | loafers → shoes | `uni`, upward only |
| `node_attr` | loafers × closure=slip-on | `uni` |
| *sibling* | loafers / oxfords | **never emitted** |

`slip ons` is a closure value spanning loafers, mules, slides and espadrilles. It is not
a node, not a sibling, not a parent — mark it `node_attr` or it gets read as an
equivalence and over-expands.

Apply the catalog's `sibling_blocklist` before anything reaches the pack. Default every
direction to `uni`; `bi` requires both directions proven, because bidirectional pairs
chain transitively — `shoe ↔ boot`, `boot ↔ trunk`, footwear returns car parts.

## 4. Keep the keyless datasets, and say they're keyless

`job_function` ("boots for standing all day") and `intent` ("something waterproof for
winter") have no node and no filter, so they have no key. Carry them with
`has_key: false`.

This is not a gap to apologise for — it is the honest boundary of the method, and the
board depends on it to avoid computing recall across a denominator that doesn't exist.

## 5. List the orphans

Any synonym-dataset term with neither `compared_to` nor a variant pointing at it goes
in `orphans`. The hand-authored pack produced these invisibly; surfacing them is the
point. An orphan is either a lead with no variants yet, or a term whose partner nobody
thought of — and the two look identical until you look.

## 6. Label how each term was selected — `source`

Every term carries a **`source`** naming how it entered the dataset, so the board can show,
per term, whether it is grounded in the retailer's own catalog or is a shopper word we chose
to test. This is not the answer-key/`has_key` flag and not the catalog-node label — it is the
selection method, and it travels with the term through every downstream stage.

| `source` | Meaning | How it is set |
|---|---|---|
| `catalog_node` | Matches a real category node the store organizes products under | term maps to a node (`{node.singular}`) |
| `catalog_facet` | Synthesized from a node × a catalog filter value (a refinement the store exposes) | node × facet generation |
| `authored` | Hand-authored shopper vocabulary the taxonomy has no category for — chosen to test whether search maps it | synonym/attribute with no node, or a brand/model literal |
| `use_case` | A job/task phrasing ("boots for standing all day") probing use-case understanding | `job_function` dataset |
| `natural_language` | A conversational, full-sentence query probing NL understanding | `intent` dataset |
| `mined` | Discovered from search-result gaps (recall misses), not hand-picked | added by mine-synonyms / synonym-candidates |

Downstream (`search-board`) renders `source` as a per-term chip with a tooltip for any label
that is not self-explanatory. A one-word chip that needs no gloss (e.g. `mined`) may omit it;
`catalog_node`, `catalog_facet`, `authored`, `use_case`, `natural_language` always carry one.

## What this does not cover

Node × facet generates the head and torso. It does not generate `job_function` or
`intent`, and it never will. Those stay authored or demand-mined.

## Do / Don't

- **Do** compute confidence from real null rates, label relations, default to `uni`, apply the sibling blocklist, declare keyless datasets honestly, surface orphans.
- **Don't** build a key on a sparse facet, present a synthesized query as a shopper query, emit `bi` without proof, or let an embedding propose a pair the taxonomy says is a sibling.
