# High Country Outfitters Combined Ecommerce Report

Generated: 2026-07-02T06:53:24.862Z
Target: https://highcountryoutfitters.com/
Generation: GEN-010
Primary PDF: highcountryoutfitters-combined-ecommerce-report.pdf

## Executive Summary

High Country Outfitters has a functioning outdoor retail ecommerce discovery foundation with rendered search result pages, broad browse navigation, robust filters, store-location inventory filters, active merchandising, cart functionality, and public policy/support paths. The corrected rendered-search capture recovered all tested commercial product/category, rental, local-team, and typo terms, and the public autocomplete API returned camp suggestions matching the user-observed visible dropdown. The added apparel-domain IR concept set scored 99/100 for rendered search and 85/100 for autocomplete across normalization, tokenization, synonyms, field weighting, query expansion, and document enrichment examples. The largest remaining risks are full visible autocomplete QA across the protected set, filter complexity, incomplete local/trust evidence from static crawl limits, and unavailable automated competitor benchmark evidence.

## Scorecard

| Area | Score | Rationale |
| --- | ---: | --- |
| search | 100 | 9/9 product or collection queries returned fetch, rendered-search, or suggest evidence; typo recovery for patgonia was present; kayak-rental recovery was present. |
| autocomplete | 78 | 10/13 autocomplete/suggest probes returned product, collection, query, or page suggestions through the Shopify suggest endpoint; the camp follow-up API matched the user-observed visible dropdown. Rendered search input was available for 2/2 earlier probes. |
| browse | 90 | 12/14 API-sampled browse collections returned product samples, and 3/3 rendered collection pages exposed product links; navigation exposes gear, apparel, footwear, locations, rentals, brands, and sale paths. |
| filters | 88 | Rendered camping collection exposed 9 filter groups, including store-location inventory filters. |
| recommendations | 68 | Homepage and collection pages expose sale, staff-pick, new-arrival, and quick-add merchandising. Product recommendation depth was sampled but not exhaustively validated. |
| mobile_experience | 74 | Mobile rendered homepage exposed search=true and cart=true with store-pickup/free-shipping messaging, but checkout completion was not attempted. |
| product_discovery_overall | 83 | Average of search, autocomplete, browse, filters, recommendations/merchandising, and mobile evidence scores for this bounded public assessment. |

## Top Findings

### HCO-FND-001: Search And Autocomplete (High)

High Country Outfitters search recovered all tested commercial product/category, rental, local-team, and typo terms through either plain fetch or rendered browser evidence. The public autocomplete API also returned camp suggestions that matched the user-observed visible dropdown.

Evidence:
- Search evidence: patagonia: 151 results; hoka: 26 results; yeti cooler: 58 results; hiking boots: 77 results; rain jacket: 93 results; camp chair: 183 results; camp chairs: 184 results; women's sandals: 96 results; atlanta braves hat: 39 results; kayak rental: 5 results; patgonia: 146 results.
- Verified search gaps: none in usable product-query set.
- Unverified due to access verification in this run: none.
- Camp autocomplete follow-up: query suggestions camp snap, camp chairs, campeones, camping; collection suggestions Camp Snap, Summer Camp, Camp Kitchen; product suggestions Camp Cutlery Set, CSPRO Series 200 Camera, Rambler 20 oz Tumbler with Magslider Lid.

Customer impact: Brand-aware, category, local-team, rental-intent, and misspelled-query shoppers all had a usable rendered search-results path in the corrected run.

Business impact: Search-result recovery is stronger than the plain-fetch dataset originally showed, and autocomplete exposes useful camping-related discovery paths. Full visible-dropdown QA is still needed before scoring every protected term visually.

Recommendation: Keep rendered search capture in the recurring test harness, preserve camp chair/chairs, local-team, rental, and misspelling queries as protected test cases, and add repeatable visible autocomplete capture across the protected query set.

### HCO-FND-002: Browse And Navigation (High)

Browse navigation is broad and commercially useful, covering apparel, footwear, gear, locations, rentals, brands, sale, and detailed outdoor subcategories.

Evidence:
- Collection API returned 569 public collections.
- Rendered collection pages with products: Camping (16 visible product links); Paddlesports (6 visible product links); Patagonia (16 visible product links).
- API-sampled browse collections with products: gear (24 sampled); camping (24 sampled); paddlesports (6 sampled); ski-gear (24 sampled); yeti-coolers (8 sampled); footwear (24 sampled); mens-clothing (24 sampled); womens-clothing (24 sampled); kids-apparel (22 sampled); accessories (24 sampled); patagonia (24 sampled); sale (24 sampled).

Customer impact: Customers who browse by activity or department can find meaningful paths without starting from search.

Business impact: The category architecture supports discovery and can absorb paid, email, and local-store traffic better than a search-only catalog.

Recommendation: Preserve browse/category depth, then test priority shopping journeys such as rain jacket, HOKA shoe, YETI cooler, kayak rental, and Atlanta Braves gift across desktop and mobile.

### HCO-FND-003: Filters And Local Inventory (High)

Rendered collection pages expose robust filters, including product type, vendor, size, price, availability, color, and store-location inventory.

Evidence:
- Observed filter groups on camping collection: filter.v.t.shopify.target-gender, filter.p.product_type, filter.v.m.locationInventory.locations, filter.p.vendor, filter.v.option.size, filter.v.price.gte, filter.v.price.lte, filter.v.availability, filter.v.t.shopify.color-pattern.
- Location inventory filters include Alpharetta - The Avalon, Athens - Downtown, Buckhead - Flagship Store, East Cobb - The Avenue.

Customer impact: Customers can narrow by brand, size, price, availability, and pickup location, which is especially valuable for a regional retailer with multiple stores.

Business impact: Store-level inventory filtering is a differentiator versus generic ecommerce pages, but long filter panels can become hard to scan without curation.

Recommendation: Keep location inventory prominent and consider prioritizing the highest-use filters above long vendor or size lists on mobile.

### HCO-FND-004: Merchandising And Conversion (Medium)

Homepage and collection evidence show active merchandising, sale framing, staff picks, quick-add controls, free-shipping threshold messaging, pickup messaging, and cart functionality.

Evidence:
- Cart check added Camino 35 Carryall 2.0 Tote Bag and cart.js reported 1 item(s).
- Homepage checks: sale=true, staff_pick=true, pickup=true, shipping=true.
- Rendered support checks: Contact Us (phone, shipping, returns, store_locations, contact_form); Shipping And Return Policy (email, shipping, returns, contact_form); Locations (phone, shipping, returns, store_locations, contact_form).

Customer impact: Shoppers can move from discovery to cart and see shipping or pickup cues before checkout.

Business impact: The site has operational ecommerce foundations, so product-discovery improvements can plausibly connect to conversion rather than only awareness.

Recommendation: Validate quick-add and variant selection paths for top products, then test checkout entry, pickup selection, shipping thresholds, and return messaging before client-ready conclusions.

### HCO-FND-005: Local Trust And Public Site Signals (Medium)

The upstream local-site assessment is useful only as partial public-site evidence; its static crawl missed dynamic ecommerce paths and selected an invalid Pest Control demand/competitor layer.

Evidence:
- Allowed upstream evidence: Local Visibility scored 20/100; Lead Conversion scored 0/100; Trust Signals scored 14/100; Message Clarity scored 25/100; Mobile Experience scored 33/100; AI Discoverability scored 0/100; Performance unavailable; Security & Reliability scored 83/100.
- Excluded upstream sections: Generated sector was Pest Control and is invalid for outdoor retail ecommerce market evidence.; Generated competitor comparison used Pest Control queries and Pest Control competitors, so it is excluded from ecommerce market evidence..

Customer impact: Static crawl limitations could understate live ecommerce features, while still flagging crawlability, local visibility, trust, and public-site evidence limits.

Business impact: Combined reporting must separate what the ecommerce workflow directly observed from what the local website crawler inferred from one truncated page.

Recommendation: Use the local assessment as context, not market evidence, and rerun public-site/local evidence with a JavaScript-aware crawl if local SEO or store-lead conclusions become client-facing.

### HCO-FND-006: Outdoor Retail Benchmark (Medium)

Outdoor-retail benchmark pages were attempted, but bounded public fetches were blocked or too low-signal for comparative market claims.

Evidence:
- Usable benchmark pages: none.
- Unavailable or low-signal benchmark pages: REI (Public search page was not usable in this run: 403.); Backcountry (Public fetch returned status 202, but extracted text did not contain expected product-discovery benchmark signals.); Public Lands (Public search page was not usable in this run: 403.).

Customer impact: Benchmark expectations for advice, reviews, events, and deep category education should be validated manually before being presented as competitor proof.

Business impact: High Country can still lean into local inventory and store pickup, but this automated benchmark run should be treated as an evidence limit.

Recommendation: Run a browser-based/manual benchmark pass against REI, Backcountry, and Public Lands before making comparative claims; keep this automated result as a blocker note.

## Upstream Local Assessment Use

Used only as partial public-site evidence for crawlability, lead-path visibility, trust/message signals, security/reliability, and evidence limits.

| Category | Score Status | Score | Found | Missing |
| --- | --- | ---: | --- | --- |
| Local Visibility | scored | 20 | Service area language is visible. Examples found: locally owned, local. | Business phone number is hard to find.; Structured business information was not found.; Location or service-area pages were not found.; Google Business Profile connection was not found. |
| Lead Conversion | scored | 0 |  | Phone number is not visible on crawled pages.; Click-to-call link was not found.; Contact form was not found.; Estimate, booking, or appointment calls to action are weak or missing.; Contact page or booking path is hard to find. |
| Trust Signals | scored | 14 | Reviews or ratings are mentioned. | Testimonials were not found.; Real team, owner, project, or gallery photos were not clear.; About, team, or owner page was not found.; Licenses, certifications, insurance, or awards were not found.; Years in business was not found.; Case studies or before/after examples were not found. |
| Message Clarity | scored | 25 | The service area is described. | The service description is not clear enough.; The ideal customer type is unclear.; The site does not clearly say why to choose this business. |
| Mobile Experience | scored | 33 | Mobile viewport tag was found. | Mobile visitors may struggle to contact the business quickly.; No form was found to review for mobile usability. |
| AI Discoverability | scored | 0 |  | FAQ content was not found.; Specific service descriptions are missing.; Structured service or location content is thin.; Crawlable service-area or location pages were not found. |
| Performance | unavailable |  |  | PageSpeed could not be reached, so the report does not make a performance claim from that API. |
| Security & Reliability | scored | 83 | The submitted website uses HTTPS.; No broken internal links were found in passive checks.; No broken internal images were found in passive checks.; sitemap.xml was found.; Open Graph image was found. | Favicon was not found. |

Excluded upstream sections:
- demandSatisfaction: Generated sector was Pest Control and is invalid for outdoor retail ecommerce market evidence.
- competitorComparison: Generated competitor comparison used Pest Control queries and Pest Control competitors, so it is excluded from ecommerce market evidence.

## Search Query Evidence

| Query | Type | Search Results | Suggest Products | Suggest Collections |
| --- | --- | ---: | ---: | ---: |
| patagonia | brand | 151 | 2 | 2 |
| hoka | brand | 26 | 2 | 1 |
| yeti cooler | brand_category | 58 | 2 | 1 |
| hiking boots | category | 77 | 5 | 0 |
| rain jacket | category | 93 | 3 | 0 |
| camp chair | category | 183 rendered | 5 | 0 |
| camp chairs | category_followup | 184 rendered | 5 | 0 |
| women's sandals | attribute_gender_category | 96 rendered | 4 | 1 |
| atlanta braves hat | local_team_product | 39 rendered | 2 | 0 |
| kayak rental | service_rental_intent | 5 rendered | 0 | 0 |
| patgonia | typo | 146 rendered | 0 | 0 |
| zzzznotaproduct | zero_result | 0 rendered | 0 | 0 |

## Autocomplete Follow-Up Evidence

| Query | Source | Query Suggestions | Collection Suggestions | Product Suggestions |
| --- | --- | --- | --- | --- |
| camp | public_shopify_suggest_api_followup | camp snap; camp chairs; campeones; camping | Camp Snap; Summer Camp; Camp Kitchen | Camp Cutlery Set; CSPRO Series 200 Camera; Rambler 20 oz Tumbler with Magslider Lid |


## Apparel IR Concept Evidence

Search average: 99/100. Autocomplete average: 85/100.

| Article | Concept | Query | Why Real World | Search Score | Autocomplete Score | What Was Noticed |
| --- | --- | --- | --- | ---: | ---: | --- |
| Article 5 | Normalization | womens rain jacket | Outdoor apparel shoppers often omit apostrophes while searching for women rainwear. | 100 | 100 | Rendered search showed 92 results; sampled products: Women's Torrentshell 3L Jacket Patagonia $189.00 $189.00Sold Out Color - THI THIN ICE Color THI THIN ICE WOOL WHITE BLK BLACK; Women's Kisa III Jacket Indyeva $278.00 $278.00Sold Out Color - WHEAT Color WHEAT HEMATITE; Women's Fineline Stretch Shell Black Diamond $189.00 $189.00Sold Out Color - 0002 BLACK Color 0002 BLACK 3061 AGAVE. Suggest API returned products: Women's Torrentshell 3L Jacket; Women's Beta Jacket; Women's Kisa III Jacket \| queries: womens rain jacket. |
| Article 5 | Normalization | mens patagonia fleece | Shoppers commonly omit the apostrophe in men's and combine gender, brand, and material. | 100 | 95 | Rendered search showed 57 results; sampled products: Men's Better Sweater 1/4 Zip Fleece Patagonia $139.00 $139.00Sold Out Color - OLGG OLD GROWTH GREEN Color OLGG OLD GROWTH GREEN; Men's R1® Air Zip Neck Patagonia $145.00 $145.00Sold Out Color - BLK BLACK Color BLK BLACK; Men's Synchilla Pant Patagonia $129.00 $129.00Sold Out Color - NKL NICKEL Color NKL NICKEL. Suggest API returned products: Men's Better Sweater 1/4 Zip Fleece; Men's Retro Pile Vest. |
| Article 6 | Tokenization | long sleeve shirt | Long-sleeve tops are a common apparel need and customers type the phrase as separate tokens. | 100 | 100 | Rendered search showed 235 results; sampled products: Men's Long Sleeve Ace Button Down Vuori $78.00 $98.00Sold Out Color - INK INK Color INK INK; Men's Long Sleeve Strato Tech Tee Vuori $47.00 $68.00Sold Out Color - HPB POOL BLUE HEATHER Color HPB POOL BLUE HEATHER NAVY HEATHER CHARCOAL HEATHER; Men's Long Sleeve Lightweight Fjord Flannel Shirt Patagonia $44.95 $89.00Sold Out Color - FOVB FOGGY\| VIRTUALLY BLUE Color FOVB FOGGY\| VIRTUALLY BLUE PWSM PAW\| SMOLDER BLUE. Suggest API returned products: Men's Original Shirt Long Sleeve; Men's Original Long Sleeve Shirt; Men's Bamboo Lightweight Long Sleeve \| collections: Long Sleeve Shirts \| queries: tamiami ii long sleeve shirt. |
| Article 6 | Tokenization | 1/4 zip pullover | Customers use slash notation for quarter-zip pullovers instead of spelling out quarter zip. | 100 | 95 | Rendered search showed 19 results; sampled products: Men's Sully 1/4 Zip Pullover johnnie-O $89.95 $138.00Sold Out Color - HELIOS BLUE Color HELIOS BLUE LAGUNA BLUE SEQUOIA PORT; Men's UGA Sully Quarter Zip Pullover johnnie-O $158.00 $158.00Sold Out Color - HEATHER BLACK Color HEATHER BLACK 4GA-STANDING DAWG\|RED1 10GA-GDAWG\|LIGHT GRAY; Men's Georgia Hoppin Ribbed Knit Performance 1/4 Zip Pullover johnnie-O $168.00 $168.00Sold Out Color - 10GA-GDAWG\|BLACK Color 10GA-GDAWG\|BLACK. Suggest API returned products: Men's Sully 1/4 Zip Pullover; Men's Georgia Hoppin Ribbed Knit Performance 1/4 Zip Pullover. |
| Article 7 | Synonyms | rain shell | Outdoor customers often say shell when they mean a rain jacket or waterproof layer. | 100 | 95 | Rendered search showed 70 results; sampled products: Women's Torrentshell 3L Jacket Patagonia $189.00 $189.00Sold Out Color - THI THIN ICE Color THI THIN ICE WOOL WHITE BLK BLACK; Men's Torrentshell 3L Jacket Patagonia $189.00 $189.00Sold Out Color - SMDB SMOLDER BLUE Color SMDB SMOLDER BLUE BLK BLACK NGRY NOBLE GREY; Men's Fineline Stretch Shell Black Diamond $134.95 $189.00Sold Out Color - 4013 INDIGO Color 4013 INDIGO 0002 BLACK 3010 TUNDRA. Suggest API returned products: Women's Fineline Stretch Shell; Men's Fineline Stretch Shell. |
| Article 7 | Synonyms | puffer jacket | Puffer is a common consumer synonym for insulated or down jackets. | 100 | 60 | Rendered search showed 72 results; sampled products: Women's Nano Puff® Jacket Patagonia $229.00 $229.00Sold Out Color - BLK BLACK Color BLK BLACK ELGR ELLWOOD GREEN; Men's Nano Puff® Jacket Patagonia $229.00 $229.00Sold Out Color - BLK BLACK Color BLK BLACK; Women's Down With It Jacket Patagonia $229.00 $229.00Sold Out color - BLK BLACK color BLK BLACK NAT NATURAL. Suggest API returned queries: patagonia nano puffer jacket. |
| Article 8 | Field Weighting | patagonia womens jacket | A brand-aware shopper may combine vendor, gender, and category in one query. | 100 | 100 | Rendered search showed 109 results; sampled products: Women's Torrentshell 3L Jacket Patagonia $189.00 $189.00Sold Out Color - THI THIN ICE Color THI THIN ICE WOOL WHITE BLK BLACK; Women's Down With It Jacket Patagonia $229.00 $229.00Sold Out color - BLK BLACK color BLK BLACK NAT NATURAL; Women's Down Sweater™ Jacket Patagonia $289.00 $289.00Sold Out Color - BNLB BARNACLE BLUE Color BNLB BARNACLE BLUE BLK BLACK. Suggest API returned products: Women's Nano Puff® Jacket; Women's Silent Down Jacket; Women's Down Sweater™ Jacket \| queries: womens patagonia jacket. |
| Article 8 | Field Weighting | vuori joggers women | A customer may know the brand and product type but use an informal gender order. | 100 | 90 | Rendered search showed 84 results; sampled products: Women's Performance Jogger Vuori $87.97 $110.00Sold Out Color - HMD MIDNIGHT HEATHER Color HMD MIDNIGHT HEATHER LZH LILAC BREEZE HEATHER HHB HUCKLEBERRY HEATHER HBK BLACK HEATHER; Women's Halo Modern Sweatpant Vuori $78.00 $98.00Sold Out Color - FYH SOFT SKY HEATHER Color FYH SOFT SKY HEATHER AGG AGATE GREEN; Women's Clementine 2.0 Short 2.5" Vuori $54.00 $68.00Sold Out Color - REB REGATTA BLUE Color REB REGATTA BLUE CER CERISE BLK BLACK. Suggest API returned products: Women's Performance Jogger. |
| Article 9 | Query Expansion | sun hoodie | Sun hoodie is a common outdoor phrase for UPF hoodies and sun-protection tops. | 100 | 100 | Rendered search showed 194 results; sampled products: Men's Cormac Hoody Arc'teryx $90.00 $90.00Sold Out Color - 019001 HABITAT Color 019001 HABITAT 020142 ARCTIC SILK 018561 FLUIDITY 002291 BLACK; Men's Capilene® Cool Sun Hoody Patagonia $89.00 $89.00Sold Out Color - TBIX THERMAL BLUE - THIN ICE X-DYE Color TBIX THERMAL BLUE - THIN ICE X-DYE FGNX FORGE GREY - NOBLE GREY X-DYE; Men's Capilene® Cool Sun Hoody \| Fitz Roy Trout Patagonia $99.00 $99.00Sold Out Color - CGSX CRISP GREY - SALT GREY X-DYE Color CGSX CRISP GREY - SALT GREY X-DYE. Suggest API returned products: Men's Capilene® Cool Sun Hoody; Men's Capilene® Cool Sun Hoody \| Fitz Roy Trout \| queries: mens sunday hoodie; sunwashed slub hoodie. |
| Article 9 | Query Expansion | trail running shirt | Trail runners often search for lightweight technical shirts by activity rather than product title. | 100 | 0 | Rendered search showed 83 results; sampled products: Men's Cormac Crew Short Sleeve Arc'teryx $70.00 $70.00Sold Out Color - 019001 HABITAT Color 019001 HABITAT 022616 ALPINE BLUE 021549 DK STRATUS 002291 BLACK; Men's Ionia Merino Wool Shirt Arc'teryx $72.00 $90.00Sold Out Color - 018159 SOLITUDE HEATHER Color 018159 SOLITUDE HEATHER 002291 BLACK; Men's Capilene® Cool Daily Shirt Patagonia $49.00 $49.00Sold Out Color - SHRX SHORE BLUE - LIGHT SHORE BLUE X-DYE Color SHRX SHORE BLUE - LIGHT SHORE BLUE X-DYE AQSX AQUA STONE - LIGHT AQUA STONE X-DYE FEA FEATHER GREY SBLX SMOLDER BLUE - LIGHT SMOLDER BLUE X-DYE. Suggest API returned no product, collection, query, or page suggestions. |
| Article 10 | Document Enrichment | UPF shirt women | UPF is a feature-level apparel attribute that may live in tags, descriptions, or product specs. | 88 | 90 | Rendered search showed 421 results; sampled products: Women's Energy Top Vuori $43.00 $54.00Sold Out Color - FYH SOFT SKY HEATHER Color FYH SOFT SKY HEATHER BCO BLUE COAST WHITE BLACK; Women's Tempo Tank FP Movement $30.00 $30.00Sold Out Color - 4410 BRIGHT BLUE Color 4410 BRIGHT BLUE 3337 WHIPPED LIME 4057 ELECTRIC SHOCK 1100 WHITE 7804 SUNLIT YELLOW 5669 GEM 0010 BLACK 4600 GLOW WAVE 6164 ELECTRIC SUNSET; Women's Bamboo Lightweight Long Sleeve II Free Fly Apparel $34.95 $58.00Sold Out Color - SLATE Color SLATE. Suggest API returned products: Everyday Performance Sun Shirt UPF 50+ Dry Lite. |
| Article 10 | Document Enrichment | fleece pullover women | Fleece and pullover are material/style attributes that can be split across title, tags, and variants. | 100 | 90 | Rendered search showed 163 results; sampled products: Women's Turpin Fleece Snap Pullover Stio $71.20 $89.00Sold Out Color - VINTAGE INDIGO HEATHER Color VINTAGE INDIGO HEATHER; Women's High Standard Fleece Hoodie Faherty $79.95 $158.00Sold Out Color - LGH LIGHT GREY HEATHER Color LGH LIGHT GREY HEATHER; Women's Sienna Patriot Sweater Z Supply $54.95 $78.00Sold Out Color - NHE NATURAL HEATHER Color NHE NATURAL HEATHER. Suggest API returned products: Women's Turpin Fleece Snap Pullover. |

| Article | Concept | Queries | Search Avg | Autocomplete Avg |
| --- | --- | --- | ---: | ---: |
| Article 5 | Normalization | womens rain jacket; mens patagonia fleece | 100 | 98 |
| Article 6 | Tokenization | long sleeve shirt; 1/4 zip pullover | 100 | 98 |
| Article 7 | Synonyms | rain shell; puffer jacket | 100 | 78 |
| Article 8 | Field Weighting | patagonia womens jacket; vuori joggers women | 100 | 95 |
| Article 9 | Query Expansion | sun hoodie; trail running shirt | 100 | 50 |
| Article 10 | Document Enrichment | UPF shirt women; fleece pullover women | 94 | 90 |

## Browse And Filter Evidence

Public collections discovered through Shopify collections API: 569.

| Collection | Products Count | Sample Products |
| --- | ---: | --- |
| gear | 1250 | Ranger Speaker; Turtlebox Original; TurtleBox Grande; Fanzy 4-in-1 Turbo Handheld Fan |
| camping | 541 | Camino 35 Carryall 2.0 Tote Bag; Cabana Fringe Premium Woven Towel; Frankee Driftweave Turkish Towel; Roadie 15 |
| paddlesports | 52 | HD Aero 11′6″ Full Trax Lime Inflatable Paddle Board; 5 Piece Adjustable Paddle; Magic Mystic Paddle; Original Glass Adjustable Kayak Paddle \| 220-240 cm |
| packs-travel |  |  |
| ski-gear | 225 | Men’s Chakal Jacket; Men’s Chakal Pant; Men’s Sabre Pant; Men’s Atom SL Hoody |
| yeti-coolers | 17 | YETI Hopper M20 Backpack Soft Cooler; Hopper Flip 8; YETI Hopper Flip 18; YETI Hopper Flip 12 |
| footwear | 534 | Men’s Cloud 6 Waterproof; Men’s Cloud 6 Coast; Women’s Cloudmonster 3; Men’s 302 Leather Flip |
| mens-clothing | 1173 | Men’s The Classic Trunk - 5.5 in; Men’s Reverb Short; Men’s Kore Short - 7 in.; Men’s Target Species Pocket Tee |
| womens-clothing | 1459 | Women’s Sienna Patriot Sweater; Women’s The Perfect Airy Top; Women’s Daylight Airy Shorts; Women’s Gail Jersey Denim Mini Skirt |
| kids-apparel | 49 | Kids Western Shirt Short Sleeve; Kids Original Shirt Long Sleeve; Youth Reverb Short; Toddler Bamboo Shade Hoody |
| accessories | 1313 | Women’s Palm Hat; Men’s Hydrolite Odyssey; Mid Pouch; UPF 50+ Lifeguard Straw Hat |
| patagonia | 396 | Women’s Capilene Cool Daily Shirt; Women’s Capilene Cool Daily Tank; Women’s Barely Baggies Shorts - 2 1/2 in; Men’s Boardshort Logo Pocket Responsibili-Tee |
| hoka |  |  |
| sale | 1832 | Men’s Breck Hangin’ Out Knit Short Sleeve Button-Up Shirt; Men’s Ennis Jersey Polo; Men’s Thatcher Performance Polo; Men’s Half Elastic 7" Swim Trunks - Freesia |

Rendered camping filter groups: filter.v.t.shopify.target-gender, filter.p.product_type, filter.v.m.locationInventory.locations, filter.p.vendor, filter.v.option.size, filter.v.price.gte, filter.v.price.lte, filter.v.availability, filter.v.t.shopify.color-pattern.

Rendered collection pages:
- Shop Camping at High Country Outfitters: 16 visible product links; 9 filter groups; screenshot assessments/high-country-outfitters/ecommerce-evidence/GEN-010/screenshots/desktop-collection-camping.png.
- Shop Paddlesports at High Country Outfitters: 6 visible product links; 9 filter groups; screenshot assessments/high-country-outfitters/ecommerce-evidence/GEN-010/screenshots/desktop-collection-paddlesports.png.
- Shop Patagonia at High Country Outfitters: 16 visible product links; 9 filter groups; screenshot assessments/high-country-outfitters/ecommerce-evidence/GEN-010/screenshots/desktop-collection-patagonia.png.

## Cart And Policy Evidence

Cart add/read attempted: true; cart.js ok: true; checkout visible on cart page: true.

| Page | Status | Shipping/Pickup | Returns | Store Locations | Contact | Screenshot |
| --- | --- | --- | --- | --- | --- | --- |
| Contact Us | usable | true | true | true | true | assessments/high-country-outfitters/ecommerce-evidence/GEN-010/screenshots/desktop-policy-contact-us.png |
| Shipping And Return Policy | usable | true | true | false | true | assessments/high-country-outfitters/ecommerce-evidence/GEN-010/screenshots/desktop-policy-shipping-and-return-policy.png |
| Locations | usable | true | true | true | true | assessments/high-country-outfitters/ecommerce-evidence/GEN-010/screenshots/desktop-policy-locations.png |
| Start A Return Or Exchange | not usable | false | false | false | false | assessments/high-country-outfitters/ecommerce-evidence/GEN-010/screenshots/desktop-policy-start-a-return-or-exchange.png |

## Benchmark Evidence

- REI: not usable (https://www.rei.com/search?q=patagonia). Public search page was not usable in this run: 403.
- Backcountry: not usable (https://www.backcountry.com/search?q=patagonia). Public fetch returned status 202, but extracted text did not contain expected product-discovery benchmark signals.
- Public Lands: not usable (https://www.publiclands.com/search/SearchDisplay?searchTerm=patagonia). Public search page was not usable in this run: 403.

## Evidence Limits

- This is a bounded public-site assessment run from 2026-07-02, not a full analytics, revenue, customer, or platform-admin audit.
- Checkout was not completed; cart entry was tested only through a public Shopify cart session.
- Search and autocomplete evidence uses sampled queries, not every query or every public collection node. Camp autocomplete suggestions are public-API backed and user-observed in the UI, but full visible dropdown QA across every protected term was not run.
- The apparel-domain IR concept scores are diagnostic examples, not a complete apparel relevance benchmark or a replacement for analytics, conversion, or full catalog parity testing.
- Product inventory, prices, promotions, and availability can change after capture.
- Several plain fetch endpoints returned access-verification pages in the final run; rendered browser evidence is used where available, and unrendered blocked queries are treated as unverified, not definitive zero-result evidence.
- The upstream local website assessment crawled one meaningful page and truncated the homepage response at its configured size limit.
- The upstream Pest Control demand fit and Pest Control competitor comparison were excluded from ecommerce market evidence.
- Outdoor-retail competitor/benchmark pages were attempted, but automated public fetches were blocked or low-signal, so this report does not make competitor market claims.

## Exact Next Action

Review the complete Northvalley PDF report and decide whether to use it as the review draft or first broaden ecommerce validation with all-node browse/search parity, full protected-set autocomplete/mobile journey QA, browser/manual competitor benchmark, checkout/pickup policy review, and a larger apparel IR relevance set.
