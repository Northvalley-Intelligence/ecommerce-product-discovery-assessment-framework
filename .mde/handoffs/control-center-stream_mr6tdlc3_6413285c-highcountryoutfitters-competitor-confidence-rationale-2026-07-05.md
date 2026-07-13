# Control Center Handoff: High Country Competitor Comparison Confidence Rationale

Date: 2026-07-05

Project: `ecommmerce-eval` / Ecommerce Evaluation Reports

Stream: `stream_mr6tdlc3_6413285c`

## Operator Question

Why is confidence low on the High Country Outfitters competitor comparison, especially for browse/category navigation?

Scope for this handoff:

- Do not run a new competitor benchmark.
- Do not edit the customer-facing report yet.
- Use saved High Country evidence and the existing blocker handoff.
- Explain what is supported, what is unsupported, what would be inference, and what evidence would raise confidence enough to update pages 1-2.

## Short Answer

Confidence is not uniformly low. It is medium to medium-high for the same-query rendered-search comparison and medium for the public suggest/autocomplete comparison between High Country Outfitters, Half-Moon Outfitters, and Mast General Store. It is low for any browse/category competitor win/loss comparison because the saved evidence does not contain a comparable competitor browse/category-navigation lane.

The current evidence can honestly support:

- High Country trails Half-Moon Outfitters on rendered search in the protected 175-query set.
- High Country leads Mast General Store on rendered search in the same set.
- High Country leads both usable regional benchmarks on public suggest/autocomplete averages.
- All three sites have weak autocomplete support for query expansion, document enrichment, and Spanish/bilingual discovery.
- High Country itself has strong browse/category evidence: 569 public collections, sampled public collection handles, rendered collection pages, product samples, filter groups, and location-inventory filters.

The current evidence cannot honestly support:

- High Country wins browse/category navigation versus Half-Moon or Mast.
- Half-Moon or Mast wins browse/category navigation versus High Country.
- Public Lands, REI, or Backcountry are weaker browse/category competitors because earlier public fetches were blocked or low-signal.
- Autocomplete collection suggestions are equivalent to browsable category architecture.

## Evidence Paths Cited

Primary saved evidence:

- `assessments/high-country-outfitters/expanded-ir-evidence/GEN-011/highcountryoutfitters-expanded-ir-evidence.json`
- `assessments/high-country-outfitters/ecommerce-evidence/GEN-010/highcountryoutfitters-ecommerce-evidence.json`

Existing blocker handoff:

- `.mde/handoffs/control-center-stream_mr6tdlc3_6413285c-highcountryoutfitters-competitor-browse-blocker-2026-07-04.md`

Report artifacts inspected for context only, not edited:

- `highcountryoutfitters-combined-ecommerce-report.pdf`
- `reports/highcountryoutfitters-combined-ecommerce-report.tex`
- `assessments/high-country-outfitters/owner-outreach-report/GEN-011/highcountryoutfitters-owner-outreach-report.md`
- `assessments/high-country-outfitters/owner-outreach-report/GEN-011/highcountryoutfitters-owner-outreach-report.json`

MDE context:

- `MISSION.md`
- `.mde/state.json`
- `.mde/validation-strategy.json`
- `.mde/failing-bdds.json`
- `.mde/generations/GEN-011.json`
- `.mde/validation-runs/VAL-042.json`
- `.mde/findings.json`
- `.mde/validator-effectiveness.json`
- `deploy/release-checks.json`

## Existing Evidence By Site

### High Country Outfitters

High Country has the richest saved evidence because it is the target site.

Supported search evidence:

- GEN-011 expanded evidence records 175 public search/autocomplete examples across seven concepts.
- Search average: 94.
- Strong search rate: 95%.
- Uniform search/autocomplete assistance rate: 43%.
- Search worked much more consistently than autocomplete: 92 examples had strong or usable search but weak or missing autocomplete help.
- Collection method: rendered search pages plus browser-context Shopify suggest API responses.

Supported concept evidence for High Country:

- Normalization: search 99, autocomplete 82.
- Tokenization: search 97, autocomplete 48.
- Synonyms: search 96, autocomplete 74.
- Ranking And Field Weighting: search 99, autocomplete 72.
- Query Expansion: search 83, autocomplete 17.
- Document Enrichment: search 97, autocomplete 19.
- Spanish/Bilingual Discovery: search 86, autocomplete 0.

Supported older rendered-search evidence from GEN-010:

- `patagonia`: 151 rendered results.
- `hoka`: 26 rendered results.
- `yeti cooler`: 58 rendered results.
- `hiking boots`: 77 rendered results.
- `rain jacket`: 93 rendered results.
- `camp chair`: 183 rendered results.
- `camp chairs`: 184 rendered results.
- `women's sandals`: 96 rendered results.
- `atlanta braves hat`: 39 rendered results.
- `kayak rental`: 5 rendered results.
- `patgonia`: 146 rendered results.
- `zzzznotaproduct`: 0 rendered results.

Supported autocomplete/suggest evidence:

- High Country exposes Shopify `search/suggest.json`.
- GEN-010 follow-up for `camp` matched the user-observed visible dropdown.
- Suggestions included query suggestions `camp snap`, `camp chairs`, `campeones`, and `camping`; collection suggestions `Camp Snap`, `Summer Camp`, and `Camp Kitchen`; and product suggestions such as `Camp Cutlery Set`.
- GEN-011 public suggest evidence is broad across 175 examples, but full visible dropdown screenshots across the protected set were not captured.

Supported browse/category evidence:

- Shopify collections are available.
- GEN-010 catalog evidence records 569 public collections.
- GEN-010 selected browse handles: `gear`, `camping`, `paddlesports`, `packs-travel`, `ski-gear`, `yeti-coolers`, `footwear`, `mens-clothing`, `womens-clothing`, `kids-apparel`, `accessories`, `patagonia`, `hoka`, and `sale`.
- Product sample counts and collection counts were captured for many handles:
  - `gear`: 24 sampled products, 1,250 catalog products.
  - `camping`: 24 sampled products, 541 catalog products.
  - `paddlesports`: 6 sampled products, 52 catalog products.
  - `ski-gear`: 24 sampled products, 225 catalog products.
  - `yeti-coolers`: 8 sampled products, 17 catalog products.
  - `footwear`: 24 sampled products, 534 catalog products.
  - `mens-clothing`: 24 sampled products, 1,173 catalog products.
  - `womens-clothing`: 24 sampled products, 1,459 catalog products.
  - `kids-apparel`: 22 sampled products, 49 catalog products.
  - `accessories`: 24 sampled products, 1,313 catalog products.
  - `patagonia`: 24 sampled products, 396 catalog products.
  - `sale`: 24 sampled products, 1,832 catalog products.
- `packs-travel` and `hoka` were reachable public collection handles but had zero sampled products and no catalog title/count in this capture. That is useful nuance and should not be hidden if browse is discussed.
- Rendered collection pages were captured for Camping, Paddlesports, and Patagonia.
- Rendered Camping, Paddlesports, and Patagonia pages each exposed 9 filter groups.
- Captured filter groups include product type, vendor, availability, location inventory, size, price, color/pattern, and target gender.
- Location-inventory filter samples included Alpharetta - The Avalon, Athens - Downtown, Buckhead - Flagship Store, and East Cobb - The Avenue.

Confidence on High Country itself:

- Search: medium-high for public-evidence assessment.
- Autocomplete/suggest: medium, because broad API evidence exists, but full visible dropdown QA does not.
- Browse/category: medium-high for High Country alone, because both public collection API evidence and rendered category-page evidence exist.
- Browse/category versus competitors: low, because competitor browse/category evidence does not exist in the saved benchmark.

### Half-Moon Outfitters

Supported evidence:

- Classified as a regional outdoor specialty retailer benchmark.
- Overlap: outdoor apparel, footwear, accessories, and lifestyle/outdoor gear in the Southeast.
- GEN-011 same-query benchmark has 175 protected query rows.
- Usable rendered-search rows: 175/175.
- Public suggest rows: 175/175.
- Search average: 99.
- Autocomplete average: 38.
- Strong search rate: 100%.
- Strong autocomplete rate: 37%.

Supported concept split evidence:

- Normalization: search 99, autocomplete 75.
- Tokenization: search 100, autocomplete 45.
- Synonyms: search 99, autocomplete 66.
- Ranking And Field Weighting: search 98, autocomplete 52.
- Query Expansion: search 99, autocomplete 9.
- Document Enrichment: search 99, autocomplete 19.
- Spanish/Bilingual Discovery: search 98, autocomplete 0.

Useful but limited suggest evidence:

- Some public suggest payloads contained collection labels, such as `Women's Sandals`, `L.L. Bean Trail Model Rain Jackets`, `Women's Fleece`, `Men's Shorts`, `Best Men's Hybrid Shorts of 2022`, `Kids' Hats & Neckwear`, and `Lunch Boxes & Cooler Bags`.
- These labels prove that the public suggest payload can return collection/category-like suggestions for some terms.
- They do not prove the navigational architecture, category depth, product counts, filters, mobile browse friction, or browse-to-product efficiency.

Not present in saved evidence:

- No Half-Moon category tree crawl.
- No Half-Moon comparable browse handle list.
- No rendered category page sample set.
- No category product counts or sampled product-link counts outside search/suggest context.
- No filter/facet group capture for browse pages.
- No mobile category navigation capture.
- No path from homepage or menu navigation into comparable categories.

Confidence on Half-Moon:

- Search comparison: medium-high for public rendered search proxy.
- Public suggest/autocomplete comparison: medium.
- Browse/category comparison: low/unsupported.

### Mast General Store

Supported evidence:

- Classified as a regional outdoor/lifestyle retailer benchmark.
- Overlap: outdoor apparel, footwear, camping goods, travel, and lifestyle products in the Southeast.
- GEN-011 same-query benchmark has 175 protected query rows.
- Usable rendered-search rows: 175/175.
- Public suggest rows: 175/175.
- Search average: 84.
- Autocomplete average: 37.
- Strong search rate: 100%.
- Strong autocomplete rate: 38%.

Supported concept split evidence:

- Normalization: search 84, autocomplete 71.
- Tokenization: search 83, autocomplete 42.
- Synonyms: search 82, autocomplete 68.
- Ranking And Field Weighting: search 86, autocomplete 48.
- Query Expansion: search 86, autocomplete 4.
- Document Enrichment: search 83, autocomplete 25.
- Spanish/Bilingual Discovery: search 85, autocomplete 0.

Useful but limited suggest evidence:

- Some public suggest payloads contained collection labels, such as `Women's - Sandals`, `Women's - Fleece`, `Men's - Shorts`, `Backpacks - Day Packs`, `Men's - Sandals`, `Women's - Sandals`, and `Kids' - Jackets & Fleece`.
- These are autocomplete/suggest outputs, not verified browse/category navigation flows.

Not present in saved evidence:

- No Mast category tree crawl.
- No Mast comparable browse handle list.
- No rendered category page sample set.
- No category product counts or sampled product-link counts outside search/suggest context.
- No filter/facet group capture for browse pages.
- No mobile category navigation capture.
- No path from homepage or menu navigation into comparable categories.

Confidence on Mast:

- Search comparison: medium-high for public rendered search proxy.
- Public suggest/autocomplete comparison: medium.
- Browse/category comparison: low/unsupported.

### Public Lands

Supported evidence:

- GEN-011 competitor evidence includes Public Lands as a national outdoor specialty retail benchmark from Dick's Sporting Goods.
- Overlap: outdoor apparel, footwear, camping, paddling, fishing, and gear.
- The saved 8-query competitor lane found 0 usable runs and 8 blocked or low-signal runs.
- Public Lands was excluded from the same-query 175-query benchmark because prior rendered runs were blocked or unusable.
- GEN-010 benchmark attempted `https://www.publiclands.com/search/SearchDisplay?searchTerm=patagonia`; it returned status 403 with title `Site Maintenance`.

Not supported:

- No usable search comparison from the saved run.
- No usable suggest/autocomplete comparison.
- No usable browse/category comparison.
- No paid-placement conclusion.

Confidence on Public Lands:

- Low for all competitor win/loss dimensions in this package.
- It is only valid to say Public Lands was attempted and excluded because the public capture was blocked or unusable.

### REI

Supported evidence:

- GEN-010 benchmark attempted `https://www.rei.com/search?q=patagonia`.
- Result: status 403, title `Access Denied`.
- Signal checks such as `Camp & Hike`, `Expert Advice`, `Classes & Events`, and review text were false in the saved public fetch.

Not supported:

- No usable search comparison.
- No usable suggest/autocomplete comparison.
- No usable browse/category comparison.

Confidence on REI:

- Low for all competitor win/loss dimensions in this package.
- It is only valid to say the direct public fetch was blocked.

### Backcountry

Supported evidence:

- GEN-010 benchmark attempted `https://www.backcountry.com/search?q=patagonia`.
- Result: raw fetch returned status 202, but extracted text did not contain expected product-discovery benchmark signals.
- Signal checks for `Patagonia`, `Filter`, and `Sort` were false.

Not supported:

- No usable search comparison.
- No usable suggest/autocomplete comparison.
- No usable browse/category comparison.

Confidence on Backcountry:

- Low for all competitor win/loss dimensions in this package.
- It is only valid to say the public fetch was low-signal.

## Which Dimensions Are Supported With Confidence

### Search

Supported comparison:

- High Country: 175 examples, rendered search average 94.
- Half-Moon: 175 examples, rendered search average 99.
- Mast: 175 examples, rendered search average 84.

Supported first-page conclusion:

- High Country is competitive but not top of the tested set on rendered search.
- It trails Half-Moon overall in the saved protected query set.
- It leads Mast overall in the saved protected query set.

Confidence level:

- Medium-high for this bounded public-evidence comparison.

Why not high:

- Scores are public-evidence proxies, not calibrated product-level relevance judgments.
- No search analytics, query volume, conversion, add-to-cart, revenue, or click behavior was available.
- The protected query set is good for diagnostic outreach, but not a production relevance benchmark with expected top products and pass/fail thresholds.

### Autocomplete / Public Suggest

Supported comparison:

- High Country: autocomplete average 45, strong autocomplete rate 43%.
- Half-Moon: autocomplete average 38, strong autocomplete rate 37%.
- Mast: autocomplete average 37, strong autocomplete rate 38%.

Supported first-page conclusion:

- High Country leads the two usable regional benchmarks in public suggest/autocomplete averages.
- The advantage is not large enough to claim category leadership; it is better framed as a relative win in a weak competitor set.
- All three sites are weak on query expansion, document enrichment, and Spanish/bilingual autocomplete.

Confidence level:

- Medium.

Why not high:

- Competitor autocomplete was measured through public suggest endpoints.
- Public suggest endpoint availability is not always identical to the visible dropdown UI.
- Full visual autocomplete dropdown screenshots across desktop and mobile were not captured for the protected query set.
- Suggest payloads can expose product/query/collection hints, but that does not prove visual ranking, interaction quality, mobile usability, or customer click-through.

## Which Dimensions Are Not Supported

### Browse / Category Competitor Win/Loss

Unsupported comparison:

- High Country versus Half-Moon browse/category navigation.
- High Country versus Mast browse/category navigation.
- High Country versus Public Lands, REI, or Backcountry browse/category navigation.

Why unsupported:

- High Country has public collection and rendered category-page evidence.
- Half-Moon and Mast do not have comparable saved browse/category evidence.
- Public Lands, REI, and Backcountry were blocked or low-signal in the saved competitor attempts.
- The competitor benchmark object contains search and autocomplete fields, not browse/category fields.
- The saved competitor run keys are `search`, `autocomplete`, `search_score`, `autocomplete_score`, `search_note`, and `autocomplete_note`. There is no comparable `browse`, `category`, `navigation`, `facet`, or `filter_groups` lane for competitors.

Confidence level:

- Low/unsupported.

This does not mean competitors are weak. It means the evidence package cannot compare them on this dimension.

## What Would Be Unsupported Inference

The following statements would not be evidence-backed from the current saved package:

- "High Country beats Half-Moon and Mast on browse/category navigation."
- "Half-Moon beats High Country on browse/category navigation because its search score is higher."
- "Mast has weaker browse/category navigation because its rendered search average is lower."
- "High Country's 569 public collections prove it has better category architecture than competitors."
- "Competitor autocomplete collection suggestions prove competitor browse paths are stronger."
- "Autocomplete collection labels such as `Women's Sandals` or `Men's Shorts` are equivalent to tested category navigation."
- "Public Lands, REI, or Backcountry lose the browse comparison because the public fetch was blocked or low-signal."
- "No visible paid-placement labels means competitor search results are organic-only."
- "Search performance implies browse performance."
- "A static public fetch failure implies a shopper cannot browse the competitor site."

These would be problematic because they convert absence of evidence into negative evidence, or they treat one discovery surface as proof of another.

## Why Browse/Category Needs Separate Evidence

Browse/category navigation is not the same behavior as search or autocomplete.

The mission defines Browse Navigation as category hierarchy, naming clarity, navigation depth, organizational consistency, product findability, product grouping, category completeness, discovery efficiency, mobile navigation, friction, and discoverability.

The saved competitor evidence does not measure those browse-specific properties. It measures:

- Whether a rendered search page was usable for a query.
- Whether a public suggest endpoint returned product, query, or collection suggestions.
- Whether visible paid-placement labels appeared in sampled rendered text.

Those are useful discovery signals, but they do not answer:

- Can a shopper who does not search navigate from the menu to the right outdoor category?
- Are category labels clear and comparable across sites?
- Are relevant categories present for apparel, footwear, camping, paddlesports, accessories, brands, and sale?
- Do browse pages expose useful products without a search query?
- Are product counts, product grouping, sorting, filtering, and local inventory controls comparable?
- Do competitor category pages show stronger or weaker facets than High Country?
- Does browse work similarly on mobile?

Because those questions are unanswered for competitors, confidence must remain low for browse/category win/loss.

## Evidence Needed To Raise Confidence Enough To Update Pages 1-2

The missing evidence is not a broad new market study. It is a comparable browse/category lane for the existing competitor set.

Minimum required competitor browse/category evidence:

1. Sites:
   - High Country Outfitters.
   - Half-Moon Outfitters.
   - Mast General Store.
   - Public Lands only if usable public rendered browse/category evidence can be captured.
   - REI and Backcountry only if the operator wants a national benchmark and usable rendered evidence can be captured.

2. Shared intent/category matrix:
   - Apparel.
   - Footwear.
   - Camping/gear.
   - Paddlesports/water where relevant.
   - Accessories.
   - Brand pages, especially brands already in the report such as Patagonia, HOKA, YETI, Vuori, and related outdoor/apparel vendors.
   - Sale.
   - Local/store-inventory or pickup-relevant browse paths where visible.

3. Per-site, per-intent fields:
   - Whether a public browse/category path exists.
   - URL and visible category label.
   - Discovery path from homepage/menu or documented direct collection/category URL.
   - Visible product count or sampled product-link count.
   - Product sample titles.
   - Filter/facet groups and sample values.
   - Sort controls.
   - Local inventory, store pickup, or location filters if visible.
   - Mobile navigation evidence for priority categories, if pages 1-2 will speak to shopper friction.
   - Screenshot or rendered text evidence.
   - Capture status: usable, blocked, low-signal, or not comparable.

4. Classification:
   - `target_wins`.
   - `competitor_wins`.
   - `parity`.
   - `not_comparable`.
   - `blocked`.

5. Summary suitable for pages 1-2:
   - Where High Country clearly wins.
   - Where Half-Moon clearly wins.
   - Where Mast clearly wins.
   - Where evidence shows parity.
   - Where evidence is unavailable.
   - Where a claim must remain scoped to HCO-only strengths.

Confidence would be high enough to update pages 1-2 when at least two usable competitor sites have comparable rendered browse/category evidence across the shared intent matrix, and every executive win/loss statement can point to a specific row, URL, screenshot/rendered text, and classification.

## Report-Scope Alternative

If the operator does not want to run `ecommerce-target-intelligence` browse/category benchmarking, the customer-facing report can still be adjusted, but the scope must change.

Supported report-scope adjustment:

- First 1-2 pages can show a three-surface matrix with confidence labels:
  - Search: competitor comparison supported.
  - Autocomplete/suggest: competitor comparison supported with public-suggest caveat.
  - Browse/category: HCO-only strength validated; competitor win/loss not yet benchmarked.

Unsupported report-scope adjustment:

- First 1-2 pages cannot show a browse/category competitor winner or loser without new evidence.

## Recommended Next Decision

Remaining blocker depends on desired report scope:

- If the operator still wants pages 1-2 to compare HCO with competitors across search, browse/category, and autocomplete, the blocker remains `ecommerce-target-intelligence` browse/category benchmarking.
- If the operator accepts a narrower executive readout that compares competitors only on search and public suggest/autocomplete, while labeling browse/category as an HCO-only validated strength, then the blocker becomes a report-scope adjustment rather than an evidence-collection blocker.

## Validation / Check Commands Run

Mission and MDE context:

- `cat MISSION.md`
- `cat MISSION_UPDATES.md`
- `cat .mde/project.json`
- `cat .mde/state.json`
- `cat .mde/validation-strategy.json`
- `cat .mde/failing-bdds.json`
- `cat .mde/generation-summary.md`
- `cat .mde/findings.json`
- `cat .mde/validator-effectiveness.json`
- `cat .mde/generations/GEN-011.json`
- `cat .mde/validation-runs/VAL-042.json`
- `cat deploy/release-checks.json`

Existing blocker handoff:

- `cat .mde/handoffs/control-center-stream_mr6tdlc3_6413285c-highcountryoutfitters-competitor-browse-blocker-2026-07-04.md`

Evidence extraction:

- `jq '{target, summary, methodology, prior_ecommerce_evidence_used}' assessments/high-country-outfitters/expanded-ir-evidence/GEN-011/highcountryoutfitters-expanded-ir-evidence.json`
- `jq '.competitor_query_benchmark | {purpose, methodology, excluded_competitors, sites: [.sites[] | {name, classification, overlap, query_count, usable_search_count, autocomplete_available_count, search_average, autocomplete_average, strong_search_rate, strong_autocomplete_rate}]}' assessments/high-country-outfitters/expanded-ir-evidence/GEN-011/highcountryoutfitters-expanded-ir-evidence.json`
- `jq '.competitor_query_benchmark.sites[] | .name as $site | .concept_summaries[] | {site:$site, concept, query_count, usable_search_count, search_average, autocomplete_available_count, autocomplete_average, sample_autocomplete_gaps}' assessments/high-country-outfitters/expanded-ir-evidence/GEN-011/highcountryoutfitters-expanded-ir-evidence.json`
- `jq '{catalog: .catalog, browse: {selected_handles: .browse.selected_handles, samples: [.browse.collection_samples[] | {handle, ok, status, product_sample_count, catalog_title, catalog_products_count}]}, rendered_collections: [.rendered.collection_pages[] | {title, url, text_sample, screenshot, filter_group_count: (.filter_groups|length), filter_groups: (.filter_groups|keys)}], autocomplete_followups}' assessments/high-country-outfitters/ecommerce-evidence/GEN-010/highcountryoutfitters-ecommerce-evidence.json`
- `jq '.benchmark' assessments/high-country-outfitters/ecommerce-evidence/GEN-010/highcountryoutfitters-ecommerce-evidence.json`
- `jq '.competitor_evidence | {purpose, summary, queries, competitors: [.competitors[] | {name, classification, overlap, query_count, usable_run_count, blocked_or_low_signal_count, sponsored_label_run_count, sponsored_interpretation}]}' assessments/high-country-outfitters/expanded-ir-evidence/GEN-011/highcountryoutfitters-expanded-ir-evidence.json`
- `jq '.competitor_query_benchmark.sites[] | {name, top_level_keys: (keys), first_run_keys: (.runs[0] | keys)}' assessments/high-country-outfitters/expanded-ir-evidence/GEN-011/highcountryoutfitters-expanded-ir-evidence.json`
- `jq '.competitor_evidence.competitors[] | {name, top_level_keys: (keys), first_run_keys: (.runs[0] | keys)}' assessments/high-country-outfitters/expanded-ir-evidence/GEN-011/highcountryoutfitters-expanded-ir-evidence.json`

Command result summary:

- Saved HCO evidence contains target search, suggest, collection, rendered category, filter, and location-inventory evidence.
- Saved competitor same-query evidence contains rendered search and public suggest fields for Half-Moon and Mast.
- Saved competitor same-query evidence does not contain competitor browse/category-navigation fields.
- Public Lands, REI, and Backcountry evidence is blocked or low-signal and cannot support win/loss claims.

## Final Status

No customer-facing report artifact was changed.

The detailed rationale is now recorded in this handoff. The remaining blocker is still `ecommerce-target-intelligence` browse/category benchmarking if the operator wants a true cross-surface competitor comparison in pages 1-2. If the operator accepts a narrower report scope, the next step is a report-scope adjustment that clearly labels browse/category as HCO-only validated evidence rather than a competitor win/loss.
