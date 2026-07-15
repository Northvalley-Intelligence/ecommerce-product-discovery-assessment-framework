# Product Discovery Executive Report: Brooklinen

**Site:** https://brooklinen.com/  
**Evidence basis:** Inspection `GEN-014-20260715T024207Z` (2026-07-15T02:45:42.440Z), partial inspection, Medium confidence, 80% component coverage.  
**Method:** Generated entirely from the referenced Inspection Report and its retained evidence. No new site inspection was performed.

## Executive Summary

Brooklinen runs on shopify (detected at High confidence). Across 5 observed discovery surfaces, 0 strengths and 11 issues were identified from the retained evidence. 1 surface was not observable in this inspection and carry no claims here.

## Scorecard

| Surface | Score | Basis | Observations | Confidence |
|---|---|---|---|---|
| Search | not observed | 3/11 submitted search observations completed. | 11 | Medium |
| Autocomplete | 55/100 | typed prefixes receiving at least one suggestion / prefixes attempted | 11 | Medium |
| Filters & Facets | 100/100 | successful probes / probes attempted | 2 | Medium |
| Recommendations | 100/100 | successful probes / probes attempted | 3 | Medium |
| Mobile Experience | 100/100 | successful probes / probes attempted | 2 | Medium |
| Rendered Storefront | 0/100 | queries whose rendered page showed products / queries captured | 5 | High |

Scores are directional and explainable: each is the stated ratio over the bounded observation set, not a weighted model.

## Issues Observed

- **[Medium] Autocomplete:** Typing "allow discounts" produced no suggestions. Customers typing this get no assistance and must compose the full query themselves. *Recommendation:* Review suggestion coverage for "allow discounts" and similar prefixes.
- **[Medium] Autocomplete:** Typing "allow discounts no last call" produced no suggestions. Customers typing this get no assistance and must compose the full query themselves. *Recommendation:* Review suggestion coverage for "allow discounts no last call" and similar prefixes.
- **[Medium] Autocomplete:** Typing "sheets 2 0" produced no suggestions. Customers typing this get no assistance and must compose the full query themselves. *Recommendation:* Review suggestion coverage for "sheets 2 0" and similar prefixes.
- **[Medium] Autocomplete:** Typing "brooklinen dabito" produced no suggestions. Customers typing this get no assistance and must compose the full query themselves. *Recommendation:* Review suggestion coverage for "brooklinen dabito" and similar prefixes.
- **[Medium] Autocomplete:** Typing "brooklinen kule" produced no suggestions. Customers typing this get no assistance and must compose the full query themselves. *Recommendation:* Review suggestion coverage for "brooklinen kule" and similar prefixes.
- **[High] Rendered Storefront:** The rendered page for "allow discounts" loaded but showed no products, even though the search endpoint returns results. Customers see an empty or broken results page despite matching inventory existing. *Recommendation:* Inspect the storefront theme or search app rendering for this query pattern.
- **[High] Rendered Storefront:** The rendered page for "allow discounts no last call" loaded but showed no products, even though the search endpoint returns results. Customers see an empty or broken results page despite matching inventory existing. *Recommendation:* Inspect the storefront theme or search app rendering for this query pattern.
- **[High] Rendered Storefront:** The rendered page for "sheets 2 0" loaded but showed no products, even though the search endpoint returns results. Customers see an empty or broken results page despite matching inventory existing. *Recommendation:* Inspect the storefront theme or search app rendering for this query pattern.
- **[High] Rendered Storefront:** The rendered page for "bedding" loaded but showed no products, even though the search endpoint returns results. Customers see an empty or broken results page despite matching inventory existing. *Recommendation:* Inspect the storefront theme or search app rendering for this query pattern.
- **[High] Rendered Storefront:** The rendered page for "bath" loaded but showed no products, even though the search endpoint returns results. Customers see an empty or broken results page despite matching inventory existing. *Recommendation:* Inspect the storefront theme or search app rendering for this query pattern.
- **[Medium] Rendered Storefront:** No visible autocomplete dropdown was captured for any typed query, while the suggest endpoint returns suggestions. Customers may not be receiving the type-ahead assistance the endpoint evidence implies. *Recommendation:* Verify whether the storefront uses a third-party search app or a theme that suppresses the native dropdown.

## Opportunity Matrix

| Classification | Surface | Opportunity |
|---|---|---|
| Strategic Improvement | Autocomplete | Review suggestion coverage for "allow discounts" and similar prefixes. |
| Strategic Improvement | Autocomplete | Review suggestion coverage for "allow discounts no last call" and similar prefixes. |
| Strategic Improvement | Autocomplete | Review suggestion coverage for "sheets 2 0" and similar prefixes. |
| Strategic Improvement | Autocomplete | Review suggestion coverage for "brooklinen dabito" and similar prefixes. |
| Strategic Improvement | Autocomplete | Review suggestion coverage for "brooklinen kule" and similar prefixes. |
| Quick Win | Rendered Storefront | Inspect the storefront theme or search app rendering for this query pattern. |
| Quick Win | Rendered Storefront | Inspect the storefront theme or search app rendering for this query pattern. |
| Quick Win | Rendered Storefront | Inspect the storefront theme or search app rendering for this query pattern. |
| Quick Win | Rendered Storefront | Inspect the storefront theme or search app rendering for this query pattern. |
| Quick Win | Rendered Storefront | Inspect the storefront theme or search app rendering for this query pattern. |
| Strategic Improvement | Rendered Storefront | Verify whether the storefront uses a third-party search app or a theme that suppresses the native dropdown. |

## What This Report Does Not Claim

- Rate limited: 429 https://brooklinen.com/
- Rate limited: 429 https://brooklinen.com/robots.txt
- Rate limited: 429 https://brooklinen.com/search?q=allow+discounts
- Rate limited: 429 https://brooklinen.com/search?q=allow+discounts+no+last+call
- Rate limited: 429 https://brooklinen.com/search?q=sheets+2+0
- Rate limited: 429 https://brooklinen.com/search?q=bedding
- Rate limited: 429 https://brooklinen.com/search?q=bath
- Rate limited: 429 https://brooklinen.com/search?q=bed+blankets
- Rate limited: 429 https://brooklinen.com/search?q=brooklinen+dabito
- Rate limited: 429 https://brooklinen.com/search?q=brooklinen+kule
- Visible search input not found: 429 https://brooklinen.com/search?q=allow%20discounts
- Visible search input not found: 429 https://brooklinen.com/search?q=allow%20discounts%20no%20last%20call
- Visible search input not found: 429 https://brooklinen.com/search?q=sheets%202%200
- Visible search input not found: 429 https://brooklinen.com/search?q=bedding
- Visible search input not found: 429 https://brooklinen.com/search?q=bath
- Scores are directional, computed from 23 bounded observations, not a full catalog benchmark.
- Rendered evidence covers desktop search pages, autocomplete dropdowns, and mobile-viewport search pages; rendered browse and product-page capture are not yet included.

## Evidence References

- Autocomplete: `assessments/brooklinen/inspection-report/GEN-014/GEN-014-20260715T024207Z/evidence/experiments/autocomplete.jsonl`
- Filters & Facets: `assessments/brooklinen/inspection-report/GEN-014/GEN-014-20260715T024207Z/evidence/experiments/facets.jsonl`
- Recommendations: `assessments/brooklinen/inspection-report/GEN-014/GEN-014-20260715T024207Z/evidence/experiments/recommendations.jsonl`
- Mobile Experience: `assessments/brooklinen/inspection-report/GEN-014/GEN-014-20260715T024207Z/evidence/experiments/mobile.jsonl`
- Rendered Storefront: `assessments/brooklinen/inspection-report/GEN-014/GEN-014-20260715T024207Z/evidence/experiments/rendered-search.jsonl`
- Inspection Report: `assessments/brooklinen/inspection-report/GEN-014/GEN-014-20260715T024207Z/inspection-report.json`

