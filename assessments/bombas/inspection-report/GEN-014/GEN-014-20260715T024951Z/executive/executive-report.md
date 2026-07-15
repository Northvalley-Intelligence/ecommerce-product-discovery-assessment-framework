# Product Discovery Executive Report: Bombas

**Site:** https://bombas.com/  
**Evidence basis:** Inspection `GEN-014-20260715T024951Z` (2026-07-15T02:51:20.450Z), partial inspection, Low confidence, 40% component coverage.  
**Method:** Generated entirely from the referenced Inspection Report and its retained evidence. No new site inspection was performed.

## Executive Summary

Bombas runs on unknown (detected at Medium confidence). Across 3 observed discovery surfaces, 1 strength and 6 issues were identified from the retained evidence. 3 surfaces were not observable in this inspection and carry no claims here.

## Scorecard

| Surface | Score | Basis | Observations | Confidence |
|---|---|---|---|---|
| Search | 0/100 | queries returning at least one result / queries attempted | 5 | Medium |
| Autocomplete | not observed | 0/5 autocomplete observations returned suggestions. | 5 | Low |
| Filters & Facets | not observed | 0/1 facet markup observations completed. | 1 | Low |
| Recommendations | not observed | 0/1 recommendations endpoint observations completed. | 1 | Low |
| Mobile Experience | 100/100 | successful probes / probes attempted | 2 | Medium |
| Rendered Storefront | 100/100 | queries whose rendered page showed products / queries captured | 5 | High |

Scores are directional and explainable: each is the stated ratio over the bounded observation set, not a weighted model.

## What Is Working

- **Rendered Storefront:** Every rendered search page showed products to the customer (5 of 5), verified in a real browser with screenshots retained. Endpoint-level results are confirmed as customer-visible, strengthening every search claim in this report.

## Issues Observed

- **[High] Search:** The query "new arrivals" returned zero results. Customers using this wording hit a dead end and must guess new terms or leave. *Recommendation:* Check catalog coverage, synonyms, and normalization for "new arrivals", and design the zero-result page to offer recovery paths.
- **[High] Search:** The query "best sellers" returned zero results. Customers using this wording hit a dead end and must guess new terms or leave. *Recommendation:* Check catalog coverage, synonyms, and normalization for "best sellers", and design the zero-result page to offer recovery paths.
- **[High] Search:** The query "sale" returned zero results. Customers using this wording hit a dead end and must guess new terms or leave. *Recommendation:* Check catalog coverage, synonyms, and normalization for "sale", and design the zero-result page to offer recovery paths.
- **[High] Search:** The query "gift" returned zero results. Customers using this wording hit a dead end and must guess new terms or leave. *Recommendation:* Check catalog coverage, synonyms, and normalization for "gift", and design the zero-result page to offer recovery paths.
- **[High] Search:** The query "black" returned zero results. Customers using this wording hit a dead end and must guess new terms or leave. *Recommendation:* Check catalog coverage, synonyms, and normalization for "black", and design the zero-result page to offer recovery paths.
- **[Medium] Rendered Storefront:** No visible autocomplete dropdown was captured for any typed query, while the suggest endpoint returns suggestions. Customers may not be receiving the type-ahead assistance the endpoint evidence implies. *Recommendation:* Verify whether the storefront uses a third-party search app or a theme that suppresses the native dropdown.

## Opportunity Matrix

| Classification | Surface | Opportunity |
|---|---|---|
| Quick Win | Search | Check catalog coverage, synonyms, and normalization for "new arrivals", and design the zero-result page to offer recovery paths. |
| Quick Win | Search | Check catalog coverage, synonyms, and normalization for "best sellers", and design the zero-result page to offer recovery paths. |
| Quick Win | Search | Check catalog coverage, synonyms, and normalization for "sale", and design the zero-result page to offer recovery paths. |
| Quick Win | Search | Check catalog coverage, synonyms, and normalization for "gift", and design the zero-result page to offer recovery paths. |
| Quick Win | Search | Check catalog coverage, synonyms, and normalization for "black", and design the zero-result page to offer recovery paths. |
| Strategic Improvement | Rendered Storefront | Verify whether the storefront uses a third-party search app or a theme that suppresses the native dropdown. |

## What This Report Does Not Claim

- HTTP error: 404 https://bombas.com/products.json?limit=10
- HTTP error: 404 https://bombas.com/collections.json?limit=20
- HTTP error: 404 https://bombas.com/search/suggest.json?q=wallet&resources%5Btype%5D=product%2Ccollection%2Cquery%2Cpage&resources%5Blimit%5D=5
- HTTP error: 404 https://bombas.com/search/suggest.json?q=new+arrivals&resources%5Btype%5D=product%2Ccollection%2Cquery%2Cpage&resources%5Blimit%5D=8
- HTTP error: 404 https://bombas.com/search/suggest.json?q=best+sellers&resources%5Btype%5D=product%2Ccollection%2Cquery%2Cpage&resources%5Blimit%5D=8
- HTTP error: 404 https://bombas.com/search/suggest.json?q=sale&resources%5Btype%5D=product%2Ccollection%2Cquery%2Cpage&resources%5Blimit%5D=8
- HTTP error: 404 https://bombas.com/search/suggest.json?q=gift&resources%5Btype%5D=product%2Ccollection%2Cquery%2Cpage&resources%5Blimit%5D=8
- HTTP error: 404 https://bombas.com/search/suggest.json?q=black&resources%5Btype%5D=product%2Ccollection%2Cquery%2Cpage&resources%5Blimit%5D=8
- HTTP error: 404 https://bombas.com/collections.json?limit=5
- HTTP error: 404 https://bombas.com/products.json?limit=3
- Visible search input not found: 200 https://bombas.com/search?q=new%20arrivals
- Visible search input not found: 200 https://bombas.com/search?q=best%20sellers
- Visible search input not found: 200 https://bombas.com/search?q=sale
- Visible search input not found: 200 https://bombas.com/search?q=gift
- Visible search input not found: 200 https://bombas.com/search?q=black
- Scores are directional, computed from 12 bounded observations, not a full catalog benchmark.
- Rendered evidence covers desktop search pages, autocomplete dropdowns, and mobile-viewport search pages; rendered browse and product-page capture are not yet included.

## Evidence References

- Search: `assessments/bombas/inspection-report/GEN-014/GEN-014-20260715T024951Z/evidence/experiments/submitted-search.jsonl`
- Mobile Experience: `assessments/bombas/inspection-report/GEN-014/GEN-014-20260715T024951Z/evidence/experiments/mobile.jsonl`
- Rendered Storefront: `assessments/bombas/inspection-report/GEN-014/GEN-014-20260715T024951Z/evidence/experiments/rendered-search.jsonl`
- Inspection Report: `assessments/bombas/inspection-report/GEN-014/GEN-014-20260715T024951Z/inspection-report.json`

