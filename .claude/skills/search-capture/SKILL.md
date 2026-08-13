---
name: search-capture
description: Run a query pack through the profiled shopper-facing search engine in paced chunks and record organic results, totals, empty-states and redirects into captures.json — plus recall against catalog answer keys and mined synonym candidates. Use as stage 4 of an ecommerce search assessment, or when asked to capture search results for a store.
---

# Search capture

**Stage 4 of 8.** Enforces **L09**, **L11**, **L14**. See `framework/search-eval/LESSONS.md`.

| | |
|---|---|
| **Input** | `engine-profile.json`, `query-pack.json`, `catalog.json` |
| **Output** | `captures.json` — `schemas/search-eval/captures.schema.json` |
| **Gate** | profile's `verified_against_live_ui.matches === true`; every row carries `chunk_id` and `organic_grid_found` |

## 1. Refuse to start on an unverified profile

Stage 3's control check is the precondition. If `matches` is false or absent, stop.
This is the whole reason the profile stage exists.

## 2. Capture in paced chunks

Chunk size and interval come from the profile, not from impatience. **L11**: the limit
is cumulative per visitor, not per burst — even 1.7s-spaced calls tripped a block after
~20 calls.

Each chunk records `chunk_id`, its terms, `captured_at`, and `blocked` if it hit one.
Chunking is not bookkeeping: it is what lets stage 5 grade chunk N while chunk N+1
captures, and the cooldown between chunks *is* the pipeline slack.

If a block lands, wait it out. Probe at most once per long quiet window — each probe
during a block resets its clock. A partial capture that says so beats a complete one
obtained by evasion.

## 3. Read organic results only

**L09.** Big-box PLPs interleave *Related to your search*, *Recommended for you* and
sponsored carousels that render above — or instead of — the organic grid.

In order of preference:

1. The clean organic API with sponsored excluded. Reliable.
2. A DOM read that excludes carousel ancestry, using the selectors from the profile.
3. If no organic grid renders: `organic_grid_found: false`, `items: []`, `total: 0`.

**Never fall back to carousel tiles.** That single mistake produced a Target board
showing `dyson v8 → Clorox cleaning wipes` and made a working engine look broken.

## 4. Distinguish empty from broken

Record `no_results_msg` — the engine's own empty-state text — separately from
`total: 0`. Without it, "the store genuinely stocks none" and "the capture failed" are
the same row, and only one of them is a finding.

Record `redirected` and `redirect_target` too. A brand query that 302s to a curated
page is answered, not empty (**L10**).

## 5. Measure recall where a key exists

For every term with `has_key: true`:

```
intersection = captured SKUs ∩ key SKUs
recall       = |intersection| / key_size
extras       = captured − key
```

Match on SKU where the engine exposes one; fall back to exact normalised title only if
it doesn't, and say which was used.

**Extras are not errors.** Results outside the key that genuinely match are facet
backfill candidates — search telling the catalog what it's missing. Record them in
`extra_skus` for stage 7 rather than counting them as precision loss (**L05**).

Terms with `has_key: false` produce no recall row. That is correct, not a gap.

## 6. Mine synonym candidates from what was missed

Take the key members search missed, diff their title vocabulary against the members it
found, keep high-lift terms:

> Loafers node, 47 SKUs, query returns 32. Of the 15 missing, 12 say *moccasin*,
> *driving shoe* or *penny* and never *loafer* → `moccasin → loafers`.

Each candidate carries `evidence_skus` and `direction: uni` — the node name is the
target, the missing vocabulary is the source. Apply the catalog's `sibling_blocklist`
first and mark anything it rejects rather than dropping it silently (**L06**).

## Politeness

**L14.** Bounded and paced, inspection UA, robots respected. These are live storefronts
serving real shoppers.

## Do / Don't

- **Do** honour the profile's pacing, chunk for pipelining, exclude carousels structurally, record empty-states, treat extras as backfill candidates.
- **Don't** start on an unverified profile, read carousel tiles when the grid is missing, rotate identities to clear a block, or infer recall for keyless terms.
