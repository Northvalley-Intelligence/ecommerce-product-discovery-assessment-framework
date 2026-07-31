# Ecommerce Discovery Evaluation: Legion Athletics

**Store:** https://legionathletics.com/  
**Platform:** WooCommerce  
**Evaluated:** 2026-07-30T04:31:48.151Z  
**Readiness:** bounded · **Surface coverage:** 60% (3 pass · 2 warn · 1 not inspectable)

## Catalog
- **97 SKUs** across **63 browse nodes** (46 substantive), **1 level** (flat).
- **22 product attributes** (9 filterable). Top facet: Flavor (87 terms).

## Discovery surfaces
- **Catalog** — PASS: 97 SKUs across 63 browse nodes (46 substantive), 1 level.
- **Search** — WARN: Literal 4/4, intent 0/4. Intent/category queries return nothing — relevance gap.
- **Autocomplete** — PASS: Type-ahead available via prefix product search (no native WooCommerce autocomplete endpoint).
- **Facets** — PASS: 22 attributes, 9 filterable; top facet Flavor (87 terms). 9/15 sampled products carry attributes.
- **Recommendations** — LIMITED (capture limitation): Not exposed via the WooCommerce Store API (related/upsell products are rendered server-side). Needs rendered capture to inspect.
- **Browse** — WARN: 63 category nodes, flat (no hierarchy).

## Findings
- **[High] Search: discovery gap** — Literal 4/4, intent 0/4. Intent/category queries return nothing — relevance gap.
- **[Info] Recommendations not inspectable via the Store API** — Not exposed via the WooCommerce Store API (related/upsell products are rendered server-side). Needs rendered capture to inspect.
- **[Medium] Browse: discovery gap** — 63 category nodes, flat (no hierarchy).

## Recommended fixes
- **Search** (High): Add synonym/intent handling (or a search app) so category and concept queries ("sofa", "seating") return products, not just literal product names.
- **Browse** (Medium): Introduce a hierarchical category structure (parent/child) so shoppers can drill down instead of scanning a flat list.

*Small catalog (97 SKUs): search is likely a lower priority; category/browse coverage matters more than deep search relevance. Flat browse (1 level): no hierarchical navigation depth, so faceted/nested browse is not a strong signal here. 46 substantive browse nodes after filtering operational/merchandising categories.*

_Note: Recommendations and rendered UI are not exposed by the WooCommerce Store API; rendered (browser) capture is a pending inspection slice._
