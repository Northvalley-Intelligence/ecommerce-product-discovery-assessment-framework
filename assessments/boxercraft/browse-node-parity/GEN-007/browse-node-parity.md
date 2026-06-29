# Boxercraft Browse Node Parity Evaluation

Generated: 2026-06-29T17:34:45.299Z
Generation: GEN-007

## Summary

- Public collections discovered: 96
- Evaluated non-empty browse nodes: 93
- Scored category/fan-shop browse nodes: 60
- Exact search/browse product-set parity on core nodes: 5/60
- Core nodes with search-only products: 13
- Core nodes with browse-only products: 51
- Core nodes with no autocomplete browse product hit: 47
- Collection metadata/feed count mismatches: 74

## Blankets Finding

The Blankets node used query `blankets`. Browse returned 2 products; search returned 3 products; autocomplete reported 3 total products and returned 3 product suggestions. Search-only products: Lambert Soccer Everest Blanket.

## Top Core Nodes With Search-Only Products

| Browse node | Query | Browse products | Search products | Autocomplete products | Search-only | Browse-only |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Fleece Collection | fleece | 19 | 89 | 5 | 70 | 0 |
| Women's Pullovers & Layers | womens layers | 23 | 46 | 5 | 34 | 11 |
| Men's Layers & Pullovers | mens layers | 19 | 40 | 5 | 29 | 8 |
| Men's Polos & Tee Shirts | mens shirts | 9 | 19 | 5 | 13 | 3 |
| Quarter-Zip Pullovers | quarter zip pullovers | 14 | 27 | 5 | 13 | 0 |
| Women's Outerwear | womens outerwear | 8 | 19 | 5 | 12 | 1 |
| Easy Essentials | essentials | 89 | 21 | 5 | 8 | 76 |
| Women's Dresses | womens dresses | 4 | 11 | 5 | 7 | 0 |
| Men's Lounge Pants & Shorts | mens bottoms | 8 | 3 | 3 | 3 | 8 |
| Women's Bottoms | womens bottoms | 28 | 3 | 3 | 3 | 28 |
| All Kinds of Cozy | sherpa | 17 | 2 | 2 | 2 | 17 |
| Men's Outerwear | mens outerwear | 5 | 4 | 4 | 2 | 3 |

## Top Core Nodes With Browse-Only Products

| Browse node | Query | Browse products | Search products | Autocomplete products | Search-only | Browse-only |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Women's Clothing | womens clothing | 106 | 0 | 0 | 0 | 106 |
| Easy Essentials | essentials | 89 | 21 | 5 | 8 | 76 |
| Loungewear | loungewear | 62 | 0 | 0 | 0 | 62 |
| Lambert High School Spiritwear | Lambert High School Spiritwear | 54 | 0 | 0 | 0 | 54 |
| Women's Loungewear | womens loungewear | 48 | 0 | 0 | 0 | 48 |
| Women's Tees & Tops | womens tees tops | 44 | 0 | 0 | 0 | 44 |
| Activewear | activewear | 42 | 0 | 0 | 0 | 42 |
| New Boxercraft Apparel | new arrivals | 42 | 0 | 0 | 0 | 42 |
| Lambert Soccer Spiritwear | Lambert Soccer Spiritwear | 41 | 0 | 0 | 0 | 41 |
| Men's Clothing | mens clothing | 41 | 0 | 0 | 0 | 41 |
| Cuddle Soft | cuddle soft | 42 | 2 | 2 | 0 | 40 |
| Layers for Men & Women | transitional layers | 40 | 0 | 0 | 0 | 40 |

## Method

- Public browse nodes came from `/collections.json`.
- Browse products came from `/collections/{handle}/products.json` with pagination.
- Search products came from the Boost search API with pagination.
- Autocomplete products came from the Boost suggestion API. The suggestion API returns a smaller product list than full search, so autocomplete parity is scored separately from full search/browse parity.
- Global catalog and empty collections are recorded but excluded from the core parity denominator.
