# Home Depot — Browser-Driven Search Evaluation

**Target:** homedepot.com (custom enterprise platform, Akamai-fronted)  
**Method:** real logged-in browser session; same-origin `/s/<query>` fetches; read the embedded Apollo `SearchModel` + rendered product titles. No external API calls, no token replay, no crawling beyond the query set.  
**Search API:** GraphQL operation `searchModel` on `apionline.homedepot.com`; response SSR-hydrated into `window.__APOLLO_STATE__`.  
**Queries run:** 15

## Headline: search is strong, but the evaluation surfaced real failures

### Findings
- **[High] Synonym collapse: "sheetrock" returns ~1% of the drywall assortment** — "sheetrock" and "sheet rock" redirect to a narrow USG-brand category with 33 products, while "drywall" returns 2411 and "drywall sheets" returns 921. A shopper using the everyday word "sheetrock" is shown 33 of ~2400 drywall products.
- **[Medium] Dimension unit conflation: "1/2 ft" returns 1/2-inch products** — "1/2 ft" (half a foot) and "1/2 ft screw" return 1/2-INCH items (plywood, PVC conduit, 1/2 in screws). The fraction 1/2 is matched but the unit "ft" is dropped, so half-foot intent yields half-inch results.
- **[Medium] Format-based count inconsistency for the same lumber query** — "2x4", "2 by 4", and "2 x 4" all return correct 2x4 lumber up top but with 757 / 1043 / 4586 results respectively — a 6x swing in result-set size driven purely by spacing/format normalization.

### What passed (search is genuinely good here)
- Pro/trade names map correctly: romex -> Romex NM-B wire (1797), unistrut -> strut channel (1759).
- Spelled fractions handled: "half inch drywall" -> 1/2 in drywall panels (953).
- Dimension queries with product context are relevant: "1/2 in screw", "#2 phillips bit", "3/4 plywood".
- Concept queries redirect to the right category: "cordless drill" -> Cordless Drills, "hammer" -> Hammers.

### Per-query evidence (each links to its exact search)
| Query | Kind | Results | Behavior | Top result |
|---|---|---|---|---|
| sheetrock | synonym | 33 | -> category | 1/2 in. x 4 ft. x 8 ft. USG Sheetrock Brand UltraLight Drywa |
| sheet rock | synonym | 33 | -> category | 1/2 in. x 4 ft. x 8 ft. USG Sheetrock Brand UltraLight Drywa |
| drywall sheets | synonym | 921 | search | 1/2 in. x 4 ft. x 8 ft. USG Sheetrock Brand UltraLight Drywa |
| drywall | synonym | 2411 | search | 1/2 in. x 4 ft. x 8 ft. USG Sheetrock Brand UltraLight Drywa |
| 1/2 in screw | dimension | 4955 | search | #8 x 1/2 in. Philips Truss-Head Standard Thread Wood Screw Z |
| 1/2 ft | dimension | 825 | search | 12mm - Sande Plywood ( 1/2 in. Category x 4 ft. x 8 ft. ...) |
| 1/2 ft screw | dimension | 1047 | search | 8 x 1/2 in. Phillips Truss Head Sharp Point Lath Screws (260 |
| #2 phillips bit | dimension | 300 | search | SHOCKWAVE Impact Duty 2 in. Phillips #2 Alloy Steel Screw Dr |
| 3/4 plywood | dimension | 219 | search | 23/32 in. x 4 ft. x 8 ft. RTD Southern Yellow Pine Wood Shea |
| half inch drywall | spelled | 953 | search | 1/2 in. x 4 ft. x 8 ft. USG Sheetrock Brand UltraLight Drywa |
| 2x4 | format | 757 | search | 2 in. x 4 in. x 96 in. #2 Premium Grade KD-HT Stud |
| 2 by 4 | format | 1043 | search | 2 in. x 4 in. x 96 in. #2 Premium Grade KD-HT Stud |
| 2 x 4 | format | 4586 | search | 2 in. x 4 in. x 96 in. #2 Premium Grade KD-HT Stud |
| romex | pro | 1797 | search | 250 ft. 12/2 Solid Romex SIMpull CU NM-B W/G Wire |
| unistrut | pro | 1759 | search | 10 ft. 12-Gauge Half Slotted Metal Framing Strut Channel in  |

_Every row is reproducible: navigate the browser to https://www.homedepot.com/s/<query>._
