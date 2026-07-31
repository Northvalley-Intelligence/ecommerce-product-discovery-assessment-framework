# Ecommerce Discovery Evaluation: Industry West

**Store:** https://www.industrywest.com/  
**Platform:** WooCommerce  
**Evaluated:** 2026-07-30T04:31:12.547Z  
**Readiness:** bounded · **Surface coverage:** 60% (3 pass · 2 warn · 1 not inspectable)

## Catalog
- **246 SKUs** across **148 browse nodes** (134 substantive), **1 level** (flat).
- **52 product attributes** (52 filterable). Top facet: care_instructions (68 terms).

## Discovery surfaces
- **Catalog** — PASS: 246 SKUs across 148 browse nodes (134 substantive), 1 level.
- **Search** — WARN: Literal 4/4, intent 0/4. Intent/category queries return nothing — relevance gap.
- **Autocomplete** — PASS: Type-ahead available via prefix product search (no native WooCommerce autocomplete endpoint).
- **Facets** — PASS: 52 attributes, 52 filterable; top facet care_instructions (68 terms). 15/15 sampled products carry attributes.
- **Recommendations** — LIMITED (capture limitation): Not exposed via the WooCommerce Store API (related/upsell products are rendered server-side). Needs rendered capture to inspect.
- **Browse** — WARN: 148 category nodes, flat (no hierarchy).

## Findings
- **[High] Search: discovery gap** — Literal 4/4, intent 0/4. Intent/category queries return nothing — relevance gap.
- **[Info] Recommendations not inspectable via the Store API** — Not exposed via the WooCommerce Store API (related/upsell products are rendered server-side). Needs rendered capture to inspect.
- **[Medium] Browse: discovery gap** — 148 category nodes, flat (no hierarchy).

## Recommended fixes
- **Search** (High): Add synonym/intent handling (or a search app) so category and concept queries ("sofa", "seating") return products, not just literal product names.
- **Browse** (Medium): Introduce a hierarchical category structure (parent/child) so shoppers can drill down instead of scanning a flat list.

*Mid-size catalog (246 SKUs): search starts to matter for findability. Flat browse (1 level): no hierarchical navigation depth, so faceted/nested browse is not a strong signal here. 134 substantive browse nodes after filtering operational/merchandising categories.*

_Note: Recommendations and rendered UI are not exposed by the WooCommerce Store API; rendered (browser) capture is a pending inspection slice._
