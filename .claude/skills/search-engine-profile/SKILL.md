---
name: search-engine-profile
description: Identify and prove the retailer's real shopper-facing search engine before any evaluation runs — the endpoint, its parse rules, its pacing limits, and the brand queries that redirect. Produces engine-profile.json. Use as stage 3 of an ecommerce search assessment, or when asked which endpoint a store's search box actually calls, or why captured results disagree with the live site.
---

# Search engine profile

**Stage 3 of 8.** Enforces **L01**, **L10**, **L14**. See `framework/search-eval/LESSONS.md`.

| | |
|---|---|
| **Input** | a retailer domain |
| **Output** | `engine-profile.json` — `schemas/search-eval/engine-profile.schema.json` |
| **Gate** | `verified_against_live_ui.matches === true` on ≥1 control term. **Capture cannot run without it.** |

This stage exists because **L01** is the single biggest source of invalid evaluations,
and it fails silently. A convenience API returns plausible numbers; nothing looks
wrong; every downstream figure is measuring the wrong engine. Woo, Shopify and Target
were each got wrong mid-project, and the story flipped once fixed.

## 1. Detect the platform

Response headers, `/cdn/shop/` paths, `wp-content`, `__NEXT_DATA__`, Salesforce SFRA
route shapes. Record it — the capture method follows from it.

## 2. Find the path the search BOX uses

Not the path that exists. The path the shopper's own search box calls, observed
in-session:

| Platform | Use | Never |
|---|---|---|
| WooCommerce | storefront `?s=<term>&post_type=product` | `/wp-json/wc/store/v1/products?search=` — a different, sparser engine |
| Shopify headless | the page's actual in-session predictive request (AND-of-prefix per word, `first:8`) | a loose `products(query:)` — much fuzzier |
| Enterprise custom | the organic API with sponsored excluded | DOM scraping (**L09**) |

Reference material: `framework/search-eval/reference/shopify-predictive-capture.md`,
`framework/search-eval/reference/enterprise-browser-read.md`.

## 3. Prove it — the gate

Pick control terms with **known, checkable** answers: a house brand, a flagship model,
one head category term. Run each through the profiled path, then open the same term in
the live shopper UI and compare count and top-3.

Record all of it in `verified_against_live_ui`, including the live and profiled values.
If they disagree, the profile is wrong — fix the profile, do not proceed and do not
"note the discrepancy". A discrepancy here silently multiplies through every number in
the report.

## 4. Record what will look like failure but isn't

**Brand redirects (L10).** A pure house-brand query returns 0 from the keyword API
while the shopper sees thousands, because the site 302s to a curated brand page. Log
these in `known_redirects` with `count_as_answered: true`. Otherwise the store's
biggest strength enters the board as a total failure.

**Carousel selectors (L09).** If the capture will read the DOM, record the containers
whose descendants must never be counted as organic. Pass them to stage 4 rather than
letting it rediscover them.

## 5. Establish pacing before capture, not during

**L11.** Bot protection rate-limits on *cumulative* calls per visitor, and the block is
durable — one did not clear for hours, only overnight. Each probe during a block resets
its clock.

Record `min_interval_ms`, `chunk_size` (15–20 for enterprise), `cooldown_ms`, and
`identity: single_session`.

A fresh visitor ID works immediately. **Deliberately rotating synthetic visitor IDs to
punch through a limit is bypassing bot protection and is prohibited.** Recovery is
waiting. If a run is blocked, the honest outcome is a partial capture that says so.

## Do / Don't

- **Do** observe the real in-session request, verify against the live UI before anything else runs, log brand redirects and carousel selectors, set pacing from observation.
- **Don't** substitute a documented API for the observed one, proceed on a failed control check, rotate identities, or solve CAPTCHAs.
