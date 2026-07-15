# Product Discovery Executive Report: Gymshark

**Site:** https://gymshark.com/  
**Evidence basis:** Inspection `GEN-014-20260715T024800Z` (2026-07-15T02:49:49.448Z), partial inspection, Medium confidence, 90% component coverage.  
**Method:** Generated entirely from the referenced Inspection Report and its retained evidence. No new site inspection was performed.

## Executive Summary

Gymshark runs on shopify (detected at High confidence). Across 6 observed discovery surfaces, 2 strengths and 11 issues were identified from the retained evidence.

## Scorecard

| Surface | Score | Basis | Observations | Confidence |
|---|---|---|---|---|
| Search | 0/100 | queries returning at least one result / queries attempted | 10 | Medium |
| Autocomplete | 100/100 | typed prefixes receiving at least one suggestion / prefixes attempted | 10 | Medium |
| Filters & Facets | 100/100 | successful probes / probes attempted | 2 | Medium |
| Recommendations | 100/100 | successful probes / probes attempted | 3 | Medium |
| Mobile Experience | 100/100 | successful probes / probes attempted | 2 | Medium |
| Rendered Storefront | 100/100 | queries whose rendered page showed products / queries captured | 5 | High |

Scores are directional and explainable: each is the stated ratio over the bounded observation set, not a weighted model.

## What Is Working

- **Autocomplete:** Every typed prefix received suggestions (10 of 10). Assisted queries convert better than unassisted ones.
- **Rendered Storefront:** Every rendered search page showed products to the customer (5 of 5), verified in a real browser with screenshots retained. Endpoint-level results are confirmed as customer-visible, strengthening every search claim in this report.

## Issues Observed

- **[High] Search:** The query "5 inch shorts" returned zero results. Customers using this wording hit a dead end and must guess new terms or leave. *Recommendation:* Check catalog coverage, synonyms, and normalization for "5 inch shorts", and design the zero-result page to offer recovery paths.
- **[High] Search:** The query "4 inch" returned zero results. Customers using this wording hit a dead end and must guess new terms or leave. *Recommendation:* Check catalog coverage, synonyms, and normalization for "4 inch", and design the zero-result page to offer recovery paths.
- **[High] Search:** The query "3 inch" returned zero results. Customers using this wording hit a dead end and must guess new terms or leave. *Recommendation:* Check catalog coverage, synonyms, and normalization for "3 inch", and design the zero-result page to offer recovery paths.
- **[High] Search:** The query "2 in 1 shorts" returned zero results. Customers using this wording hit a dead end and must guess new terms or leave. *Recommendation:* Check catalog coverage, synonyms, and normalization for "2 in 1 shorts", and design the zero-result page to offer recovery paths.
- **[High] Search:** The query "315" returned zero results. Customers using this wording hit a dead end and must guess new terms or leave. *Recommendation:* Check catalog coverage, synonyms, and normalization for "315", and design the zero-result page to offer recovery paths.
- **[High] Search:** The query "2 inch" returned zero results. Customers using this wording hit a dead end and must guess new terms or leave. *Recommendation:* Check catalog coverage, synonyms, and normalization for "2 inch", and design the zero-result page to offer recovery paths.
- **[High] Search:** The query "womens ss tops" returned zero results. Customers using this wording hit a dead end and must guess new terms or leave. *Recommendation:* Check catalog coverage, synonyms, and normalization for "womens ss tops", and design the zero-result page to offer recovery paths.
- **[High] Search:** The query "womens ls tops" returned zero results. Customers using this wording hit a dead end and must guess new terms or leave. *Recommendation:* Check catalog coverage, synonyms, and normalization for "womens ls tops", and design the zero-result page to offer recovery paths.
- **[High] Search:** The query "mens>apparel>pullovers>hoodie" returned zero results. Customers using this wording hit a dead end and must guess new terms or leave. *Recommendation:* Check catalog coverage, synonyms, and normalization for "mens>apparel>pullovers>hoodie", and design the zero-result page to offer recovery paths.
- **[High] Search:** The query "mens>apparel>ss tops>t_shirt" returned zero results. Customers using this wording hit a dead end and must guess new terms or leave. *Recommendation:* Check catalog coverage, synonyms, and normalization for "mens>apparel>ss tops>t_shirt", and design the zero-result page to offer recovery paths.
- **[Medium] Rendered Storefront:** No visible autocomplete dropdown was captured for any typed query, while the suggest endpoint returns suggestions. Customers may not be receiving the type-ahead assistance the endpoint evidence implies. *Recommendation:* Verify whether the storefront uses a third-party search app or a theme that suppresses the native dropdown.

## Opportunity Matrix

| Classification | Surface | Opportunity |
|---|---|---|
| Quick Win | Search | Check catalog coverage, synonyms, and normalization for "5 inch shorts", and design the zero-result page to offer recovery paths. |
| Quick Win | Search | Check catalog coverage, synonyms, and normalization for "4 inch", and design the zero-result page to offer recovery paths. |
| Quick Win | Search | Check catalog coverage, synonyms, and normalization for "3 inch", and design the zero-result page to offer recovery paths. |
| Quick Win | Search | Check catalog coverage, synonyms, and normalization for "2 in 1 shorts", and design the zero-result page to offer recovery paths. |
| Quick Win | Search | Check catalog coverage, synonyms, and normalization for "315", and design the zero-result page to offer recovery paths. |
| Quick Win | Search | Check catalog coverage, synonyms, and normalization for "2 inch", and design the zero-result page to offer recovery paths. |
| Quick Win | Search | Check catalog coverage, synonyms, and normalization for "womens ss tops", and design the zero-result page to offer recovery paths. |
| Quick Win | Search | Check catalog coverage, synonyms, and normalization for "womens ls tops", and design the zero-result page to offer recovery paths. |
| Quick Win | Search | Check catalog coverage, synonyms, and normalization for "mens>apparel>pullovers>hoodie", and design the zero-result page to offer recovery paths. |
| Quick Win | Search | Check catalog coverage, synonyms, and normalization for "mens>apparel>ss tops>t_shirt", and design the zero-result page to offer recovery paths. |
| Strategic Improvement | Rendered Storefront | Verify whether the storefront uses a third-party search app or a theme that suppresses the native dropdown. |

## What This Report Does Not Claim

- Visible search input not found: 200 https://gymshark.com/search?q=5%20inch%20shorts
- Visible search input not found: 200 https://gymshark.com/search?q=4%20inch
- Visible search input not found: 200 https://gymshark.com/search?q=3%20inch
- Visible search input not found: 200 https://gymshark.com/search?q=2%20in%201%20shorts
- Visible search input not found: 200 https://gymshark.com/search?q=315
- Scores are directional, computed from 32 bounded observations, not a full catalog benchmark.
- Rendered evidence covers desktop search pages, autocomplete dropdowns, and mobile-viewport search pages; rendered browse and product-page capture are not yet included.

## Evidence References

- Search: `assessments/gymshark/inspection-report/GEN-014/GEN-014-20260715T024800Z/evidence/experiments/submitted-search.jsonl`
- Autocomplete: `assessments/gymshark/inspection-report/GEN-014/GEN-014-20260715T024800Z/evidence/experiments/autocomplete.jsonl`
- Filters & Facets: `assessments/gymshark/inspection-report/GEN-014/GEN-014-20260715T024800Z/evidence/experiments/facets.jsonl`
- Recommendations: `assessments/gymshark/inspection-report/GEN-014/GEN-014-20260715T024800Z/evidence/experiments/recommendations.jsonl`
- Mobile Experience: `assessments/gymshark/inspection-report/GEN-014/GEN-014-20260715T024800Z/evidence/experiments/mobile.jsonl`
- Rendered Storefront: `assessments/gymshark/inspection-report/GEN-014/GEN-014-20260715T024800Z/evidence/experiments/rendered-search.jsonl`
- Inspection Report: `assessments/gymshark/inspection-report/GEN-014/GEN-014-20260715T024800Z/inspection-report.json`

