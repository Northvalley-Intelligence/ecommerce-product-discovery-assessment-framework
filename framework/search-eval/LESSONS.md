# Search-eval lessons

Every lesson here is a regression that already happened on a real engagement. They
were prose inside one long skill, which meant they held only if the reading agent
noticed them. Split across stages, each one is now owned by exactly one stage and
checked at its gate.

**Every stage skill declares the IDs it enforces.** The orchestrator checks that
every ID below is claimed by some stage. A lesson nobody claims is a gap, and the
gate fails rather than letting the split quietly drop it.

| ID | Lesson | Owned by |
|---|---|---|
| L01 | Measure the real shopper engine | `search-engine-profile` |
| L02 | Pin the judge rubric | `search-grade` |
| L03 | Validate the judge on a gold set | `search-grade` |
| L04 | Use the catalog as a guardrail | `catalog-capture`, `search-board` |
| L05 | Answer keys can be hollow or circular | `category-recall-dataset` |
| L06 | Siblings are not synonyms; direction comes from the tree | `category-recall-dataset` |
| L07 | Cross-cutting attributes are a third relation | `category-recall-dataset` |
| L08 | Verify the worst before reporting | `finding-verify` |
| L09 | Enterprise DOM reads are contaminated by carousels | `search-capture` |
| L10 | Brand queries redirect and look like total failure | `search-engine-profile` |
| L11 | Bot protection is cumulative and durable | `search-capture` |
| L12 | Rank by demand, never fabricate volume | `search-demand-revenue` |
| L13 | Coverage is not quality on enterprise engines | `search-board` |
| L14 | No server load | all capture stages |

---

## L01 — Measure the real shopper engine, not a convenience API

The single biggest source of invalid evaluations. A WooCommerce Store API returned
**0** for `accent chair` where the storefront returned **6** — a different, sparser
engine. Woo, Shopify and Target mistakes were each made and corrected mid-project,
and the story flipped once fixed.

- **WooCommerce** — storefront `?s=<term>&post_type=product`. Never `/wp-json/wc/store/v1/products?search=`.
- **Shopify (custom/headless)** — the search box builds an AND-of-prefix Storefront GraphQL query per word, `first:8`. A loose `products(query:)` is far fuzzier. Capture the page's actual in-session request.
- **Enterprise** — the store's clean organic API with sponsored excluded, captured in-session at human pace.

**Gate:** `engine-profile.json` requires `verified_against_live_ui` with at least one
control term whose profiled result matches the live UI. Capture will not run without it.

## L02 — Pin the judge rubric

The judge's default rubric can change, so results are deterministic only at a fixed
rubric. Record `rubric_hash` on every job; re-run everything under one hash.

**Gate:** `grades.json` requires `rubric_hash`, identical across all jobs in the eval.

## L03 — Validate the judge

~30 hand-labeled (query, product) pairs, scored on **binary** relevant-vs-not
agreement (Industry West reached 94%). The judge under-penalizes cross-category junk
— grades 1 where a human says 0 — which is conservative for a noisy-search finding
and must be stated rather than hidden.

**Gate:** `grades.json` requires `gold_validation` with ≥20 pairs and a recorded
agreement figure.

## L04 — Use the catalog as a guardrail

A zero-result is a **search bug** only if the store stocks the thing. Otherwise it is
**true-empty** or an **assortment gap** — merchandising, not search. Without the
catalog these are indistinguishable, and calling an assortment gap a search bug
discredits the whole report.

**Gate:** no row may be classified `search_bug` unless catalog evidence supports it.

## L05 — Answer keys can be hollow or circular

Two ways a catalog-derived key lies:

**Hollow.** If `material` is null on a third of the chairs, the filter returns 24 when
the truth is 36. Search returns 30, twelve outside the key, and the board reports
over-expansion — when search actually found chairs the *facet* forgot. Acting on that
means deleting correct synonyms.

**Circular.** If the facet was assigned by a text classifier over product titles and
search indexes those same titles, recall measures the classifier agreeing with itself.

**Gate:** every key carries `null_rate` and `confidence`; `facet_provenance` is
required on the catalog; keys above ~0.30 null rate are not emitted, and
`text_classifier`/`unknown` provenance caps confidence at low.

Corollary: results outside the key that genuinely match are **facet backfill
candidates** — search telling the catalog what it is missing — and must be read before
being counted as precision loss.

## L06 — Siblings are not synonyms; direction comes from the tree

`Loafers` and `Oxfords` share a parent and sit at opposite ends of the axis that
matters to a shopper. Embeddings and LLM expansion both merge them because they occur
in identical contexts; the taxonomy already separates them.

Parent edges are hyponym relations: `loafers → shoes` is safe upward, unsafe downward.
Default every candidate to unidirectional. Bidirectional pairs chain transitively —
`shoe ↔ boot`, `boot ↔ trunk`, and footwear starts returning car parts.

**Gate:** `sibling_blocklist` is emitted from the tree and applied before any candidate
reaches the pack; `direction` defaults to `uni` and `bi` requires both directions proven.

## L07 — Cross-cutting attributes are a third relation

`slip ons` is a closure value spanning loafers, mules, slides and espadrilles — not a
node, not a sibling, not a parent. Node×facet pairs are legitimate but must be labelled
`relation: node_attr`, or they get read as node equivalences and over-expand.

## L08 — Verify the worst before reporting

A term scores badly for one of two reasons: search really failed, or the **capture**
failed. The bottom of the ranking is disproportionately the latter. A Target board
showed `dyson v8 → Clorox cleaning wipes, grade 0.60`; the capture had grabbed a
*Recommended for you* carousel, and the live site returns Dyson.

Verification must run through a **different path** than the one that produced the
finding. Re-grading the same capture ratifies the artifact instead of testing it.

Refuted rows are not discarded — a run with several `capture_artifact`
reclassifications is telling you the capture method is degrading, which is its own
finding.

**Gate:** `verified-findings.json` requires `verification_path ≠ original_path`, and
the report generator refuses to run on unverified bottom-N rows.

## L09 — Enterprise DOM reads are contaminated by carousels

Big-box PLPs interleave *Related to your search* / *Recommended for you* / sponsored
carousels that render above or instead of the organic grid, and the organic grid
sometimes does not render at all in an automated session. A naive `a[href*="/p/"]`
selector then captures carousel tiles and makes the store look far worse than it is.

In order of preference: (a) the clean organic API with `include_sponsored=false`;
(b) DOM reads that exclude carousel ancestry; (c) treat "no organic grid found" as
**0 organic** — never fall back to carousel tiles.

## L10 — Brand queries redirect and look like total failure

A pure house-brand query returns **0** from the keyword API while the shopper sees
thousands: the site 302-redirects to a curated brand page. So a brand query looks like
total search failure and is actually a strength.

**Gate:** any surprising zero on a known brand is re-opened live; if it redirects to a
brand page, record the brand page's results and count it answered.

## L11 — Bot protection is cumulative and durable

PerimeterX rate-blocks after ~15–28 **cumulative** calls per visitor in a session, and
the block is long-lived — it did not clear after 20–40 minutes of quiet, only after an
overnight gap. Each re-probe during a block resets its clock, so probe at most once per
long quiet window.

A fresh visitor ID works immediately, but **deliberately rotating synthetic visitor IDs
to punch through the limit is bypassing bot protection and is prohibited.** Recover by
waiting. Single session identity.

Practical cadence: capture ~15–20 term chunks, then leave the store untouched until the
block genuinely clears. That cooldown *is* the pipeline slack — fill it by grading the
previous chunk.

## L12 — Rank by demand, never fabricate volume

Priority is search failure × real Google volume. If Keyword Planner data is missing,
list failing terms worst-first and state that volumes will rank them once imported.
Never invent a number. Flag head terms whose national volume is off-vertical
(`buffet` = food, `console table` partly gaming) as indicative only.

## L13 — Coverage is not quality on enterprise engines

Boutique and enterprise engines fail differently:

- **Boutique** (Woo, Shopify): narrow — returns **0** for synonyms, attributes, intent. The problem is *recall*.
- **Enterprise** (Target): wide — handles synonyms and attributes boutiques miss, but natural-language intent is **shallow, not dead**. `furnish a living room` → 200 vases and candle holders. The problem is *precision*.

So for big-box the eval must weight grade quality and shallow-answer rate. Do not port
the furniture "% zero-result" headline to a general retailer without this adjustment.

## L14 — No server load

Bounded, paced reads (~1/sec), plain inspection UA
(`Northvalley-Ecommerce-Inspection/0.1`), robots respected, no crawling loops. Never
bypass bot protection or solve CAPTCHAs. Read only what a real shopper's browser
legitimately serves.
