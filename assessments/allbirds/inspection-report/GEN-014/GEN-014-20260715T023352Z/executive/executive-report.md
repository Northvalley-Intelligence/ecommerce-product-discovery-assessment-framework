# Product Discovery Executive Report: Allbirds

**Site:** https://allbirds.com/  
**Evidence basis:** Inspection `GEN-014-20260715T023352Z` (2026-07-15T02:38:09.725Z), partial inspection, Medium confidence, 70% component coverage.  
**Method:** Generated entirely from the referenced Inspection Report and its retained evidence. No new site inspection was performed.

## Executive Summary

Allbirds runs on shopify (detected at High confidence). Across 3 observed discovery surfaces, 2 strengths and 1 issue were identified from the retained evidence. 3 surfaces were not observable in this inspection and carry no claims here.

## Scorecard

| Surface | Score | Basis | Observations | Confidence |
|---|---|---|---|---|
| Search | not observed | 5/11 submitted search observations completed. | 11 | Medium |
| Autocomplete | 100/100 | typed prefixes receiving at least one suggestion / prefixes attempted | 11 | Medium |
| Filters & Facets | not observed | 0/2 facet markup observations completed. | 2 | Low |
| Recommendations | 100/100 | successful probes / probes attempted | 3 | Medium |
| Mobile Experience | not observed | 0/2 mobile user-agent observations completed. HTTP-level only; rendered mobile capture remains a platform capability gap. | 2 | Low |
| Rendered Storefront | 100/100 | queries whose rendered page showed products / queries captured | 5 | High |

Scores are directional and explainable: each is the stated ratio over the bounded observation set, not a weighted model.

## What Is Working

- **Autocomplete:** Every typed prefix received suggestions (11 of 11). Assisted queries convert better than unassisted ones.
- **Rendered Storefront:** Every rendered search page showed products to the customer (5 of 5), verified in a real browser with screenshots retained. Endpoint-level results are confirmed as customer-visible, strengthening every search claim in this report.

## Issues Observed

- **[Medium] Rendered Storefront:** No visible autocomplete dropdown was captured for any typed query, while the suggest endpoint returns suggestions. Customers may not be receiving the type-ahead assistance the endpoint evidence implies. *Recommendation:* Verify whether the storefront uses a third-party search app or a theme that suppresses the native dropdown.

## Opportunity Matrix

| Classification | Surface | Opportunity |
|---|---|---|
| Strategic Improvement | Rendered Storefront | Verify whether the storefront uses a third-party search app or a theme that suppresses the native dropdown. |

## What This Report Does Not Claim

- Rate limited: 429 https://allbirds.com/search?q=apparel+-+excluding+face+masks
- Rate limited: 429 https://allbirds.com/search?q=underwear
- Rate limited: 429 https://allbirds.com/search?q=add+on+essentials
- Rate limited: 429 https://allbirds.com/search?q=shoes
- Rate limited: 429 https://allbirds.com/search?q=return%2Cpackage_protection
- Rate limited: 429 https://allbirds.com/search?q=socks
- Rate limited: 429 https://allbirds.com/collections/109-tree-dashers-for-outlet-discount-code
- Rate limited: 429 https://allbirds.com/collections/30-off-tree-runner-go-tree-gliders
- Rate limited: 429 https://allbirds.com/
- Rate limited: 429 https://allbirds.com/search?q=shoes+-+men%27s+and+women%27s
- Visible search input not found: 200 https://allbirds.com/search?q=shoes%20-%20men's%20and%20women's
- Visible search input not found: 200 https://allbirds.com/search?q=tier%202-4%20products
- Visible search input not found: 200 https://allbirds.com/search?q=msrp%20products
- Visible search input not found: 200 https://allbirds.com/search?q=full%20price%20shoes
- Visible search input not found: 200 https://allbirds.com/search?q=shoes%20-%20search
- Scores are directional, computed from 19 bounded observations, not a full catalog benchmark.
- Rendered evidence covers desktop search pages, autocomplete dropdowns, and mobile-viewport search pages; rendered browse and product-page capture are not yet included.

## Evidence References

- Autocomplete: `assessments/allbirds/inspection-report/GEN-014/GEN-014-20260715T023352Z/evidence/experiments/autocomplete.jsonl`
- Recommendations: `assessments/allbirds/inspection-report/GEN-014/GEN-014-20260715T023352Z/evidence/experiments/recommendations.jsonl`
- Rendered Storefront: `assessments/allbirds/inspection-report/GEN-014/GEN-014-20260715T023352Z/evidence/experiments/rendered-search.jsonl`
- Inspection Report: `assessments/allbirds/inspection-report/GEN-014/GEN-014-20260715T023352Z/inspection-report.json`

