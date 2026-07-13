# Dress Up Online Customer Experience Opportunity Report

Dress Up already gives shoppers a broad boutique shopping foundation across dresses, tops, denim, accessories, seasonal collections, game day, bridal, sale, and city custom paths. The opportunity is reducing effort earlier in product finding so more shoppers reach relevant products quickly and confidently.

## Executive Readout

- Dress Up was selected because it already has a mature ecommerce foundation and enough category depth for targeted improvements to matter.
- Public experiments suggest shoppers can generally find products after submitting searches, while some early product-finding guidance can be made more consistent.
- The review included same-query peer analysis against comparable boutique retailers, using those results as reference examples rather than a competitor ranking.
- Business value should be measured with internal search behavior, product-page reach, add-to-cart rate, conversion, average order value, and margin data.

## Concept Results Summary
| Concept | Search avg | Autocomplete avg | Uniform | Representative gaps |
| --- | ---: | ---: | ---: | --- |
| Normalization | 93% | 89% | 80% | rompers jumpsuits; game day outfits |
| Tokenization | 93% | 83% | 70% | off shoulder dress; game day dress |
| Customer Language | 93% | 48% | 30% | going out top; date night dress; brunch outfit |
| Ranking And Field Weighting | 98% | 72% | 70% | denim jacket women; georgia game day; tennessee game day |
| Query Expansion | 83% | 25% | 0% | wedding guest outfit; beach vacation outfit; graduation dress |
| Product Attribute Coverage | 95% | 45% | 40% | smocked bodice dress; satin midi skirt; vegan leather shorts |
| Spanish/Bilingual Discovery | 93% | 0% | 0% | vestido blanco; vestido fiesta; vestido boda invitada |

## Highest-Priority Early Guidance Gaps
| Concept | Query | Intent | Search | Autocomplete | Evidence note |
| --- | --- | --- | ---: | ---: | --- |
| Customer Language | brunch outfit | brunch outfit | 94 | 0 | 215 rendered results; sample: Brunch Poplin Everyday Top; Black / no product, collection, query, or page suggestions |
| Customer Language | bridal shower dress | bridal shower dress | 94 | 0 | 262 rendered results; sample: Summer Memories Ivory Floral Maxi Dress; Ivory / no product, collection, query, or page suggestions |
| Customer Language | mom and me dress | mom and me matching | 100 | 0 | 43 rendered results; sample: Rio Muse Magenta Floral Mini Dress; Magenta / no product, collection, query, or page suggestions |
| Customer Language | faux leather leggings | faux leather leggings | 94 | 0 | 54 rendered results; sample: FINAL  - Midnight Sleigh Faux Black Leather Jacket; Black / no product, collection, query, or page suggestions |
| Ranking And Field Weighting | denim jacket women | women denim jacket | 100 | 0 | 142 rendered results; sample: FINAL  - Easygoing Classic Denim Jacket; Denim / no product, collection, query, or page suggestions |
| Ranking And Field Weighting | georgia game day | Georgia game day apparel | 100 | 0 | 137 rendered results; sample: Black Georgia Tailgating Club Cropped Tee; Black / no product, collection, query, or page suggestions |
| Query Expansion | wedding guest outfit | wedding guest outfit | 100 | 0 | 89 rendered results; sample: Gracefully Yours Cream Floral Maxi Dress; Cream / no product, collection, query, or page suggestions |
| Query Expansion | teacher outfit | teacher outfit | 76 | 0 | 9 rendered results; sample: Blissfully Perfect Light Blue Striped Romper; Light Blue / no product, collection, query, or page suggestions |
| Query Expansion | summer outfit | summer outfit | 76 | 0 | 354 rendered results; sample: Orchid Breeze Ruffle Shorts; Orchid / no product, collection, query, or page suggestions |
| Query Expansion | fall transition outfit | fall transition outfit | 76 | 0 | 5 rendered results; sample: FINAL  - Blushing Layers Quilted Puffer Vest; Blush / no product, collection, query, or page suggestions |
| Product Attribute Coverage | smocked bodice dress | smocked bodice dress | 100 | 0 | 58 rendered results; sample: Hold This Moment Mocha Smocked Maxi Dress; Mocha / no product, collection, query, or page suggestions |
| Product Attribute Coverage | satin midi skirt | satin midi skirt | 100 | 0 | 116 rendered results; sample: FINAL  - Look Around You Leather Midi Skirt; Wine / no product, collection, query, or page suggestions |
| Product Attribute Coverage | vegan leather shorts | vegan leather shorts | 100 | 0 | 21 rendered results; sample: Easy Motion Washed Lounge Drawstring Shorts; Denim / no product, collection, query, or page suggestions |
| Product Attribute Coverage | adjustable strap cami | adjustable strap cami | 100 | 0 | 64 rendered results; sample: Seamless Ribbed Padded Cami Tank; Black / no product, collection, query, or page suggestions |

## Same-Query Competitor Benchmark
Comparable boutique retailers were checked with the same public query set where rendered access and public suggest endpoints were available. These are reference examples, not proof of market position.
| Site | Queries | Search usable | Search avg | Autocomplete usable | Autocomplete avg | Paid labels visible |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Dress Up | 70 | 69 | 93% | 70 | 52% | N/A |
| Red Dress | 70 | 20 | 93% | 65 | 46% | 20 |
| Pink Lily | 70 | 63 | 80% | 70 | 34% | 61 |
| Impressions | 70 | 67 | 83% | 70 | 41% | 67 |

## Full Query Dataset
| Concept | Query | Intent | Search | Autocomplete | Evidence note |
| --- | --- | --- | ---: | ---: | --- |
| Normalization | womens dresses | women dresses | 88 | 95 | 1002 rendered results; sample: The Main Attraction Red Mini Dress; Red / products: Sweetest Thing Stripe Midi Dress; Passport Ready Cream Print Midi Dress / collections: Knit Dresses For Women - Sweater Dresses; Cute Black Dresses / Boutique Dresses / Online Women's Dresses |
| Normalization | wedding guest dresses | wedding guest dresses | 100 | 95 | 213 rendered results; sample: Garden Affair Black Floral Midi Dress; Black / products: Remarkably Her Blue Midi Dress; Sweet Joyride Ruffle Tiered Mini Dress / collections: Wedding Guest Styles / Maxi Dresses / Cocktail Dresses |
| Normalization | mini dress | mini dresses | 94 | 95 | 360 rendered results; sample: Sweet Joyride Ruffle Tiered Mini Dress; Black / products: Seashell Escape Brown Printed Mini Dress; FINAL SALE - Sweet Moments Flowy Mini Dress / collections: Mini Dresses for Women / Trendy Short Dresses for Every Occasion – Shop Dress Up; White Dresses For Women - White Mini Dresses, White Cocktail Dresses, & Bridal Party Dresses / queries: mini dress; navy mini dress |
| Normalization | maxi dresses | maxi dresses | 94 | 95 | 303 rendered results; sample: FINAL  - Seabreeze Smocked Maxi Dress; Taupe / products: Best Dressed Blue Floral Pleated Maxi Dress; Oceanfront Blue Stripe Maxi Dress / collections: Women’s Maxi Dresses / Trendy Long Dresses for Every Occasion /Floral Maxi Dress / Women's Maxi Dress; Wedding Guest Styles / Maxi Dresses / Cocktail Dresses / queries: maxi dresses; blue maxi dresses |
| Normalization | rompers jumpsuits | rompers and jumpsuits | 94 | 62 | 145 rendered results; sample: Watch The Sunset Ivory Printed Romper; Ivory / collections: New Rompers, Romper Dresses, & Jumpsuits.; Warehouse Sale Rompers & Jumpsuits |
| Normalization | graphic tees | graphic t-shirts | 88 | 95 | 683 rendered results; sample: Burgundy Carolina Graphic Tee; Burgundy / products: Burgundy Carolina Graphic Tee; À La Mer Yellow Graphic Tee / collections: Tees - Graphic Tees, Basic Tees, & Crop Tees; Savannah - Sweatshirts & Graphic Tees |
| Normalization | game day outfits | game day outfits | 76 | 71 | 384 rendered results; sample: Hunter Green Go Team Color Block Embroidered Hat; Hunter Green / products: Hunter Green Go Team Color Block Embroidered Hat; Navy + Red Go Team Color Block Embroidered Hat |
| Normalization | white dress | white dresses | 94 | 95 | 437 rendered results; sample: Love Story Floral Eyelet White Mini Dress; White / products: French Florals White Printed Midi Dress; Until We Meet Again White Mini Dress / collections: White Dresses For Women - White Mini Dresses, White Cocktail Dresses, & Bridal Party Dresses / queries: white dress; white dresses |
| Normalization | denim shorts | denim shorts | 100 | 95 | 211 rendered results; sample: Rebecca Medium Wash Denim Shorts; Medium Wash / products: Slate Season Relaxed Denim Shorts; Rebecca Medium Wash Denim Shorts / collections: Denim Shorts For Women - High-Waisted Denim Shorts; Women’s Athletic Shorts, Denim Shorts & Dress Shorts / queries: denim shorts; white denim shorts |
| Normalization | wide leg jeans | wide-leg jeans | 100 | 95 | 219 rendered results; sample: Jesse High Rise Light Wash Tie Waist Palazzo Jeans; Light Wash / products: Olivia Light Wash Wide Leg Jeans; Olivia Light Wash Pinstripe Wide Leg Jeans / collections: Vervet Jeans - Wide Leg Jeans; Boutique Women’s Jeans — Distressed, Flare, Dad, Wide-Leg & More / queries: wide leg jeans |
| Tokenization | little black dress | little black dress | 94 | 95 | 333 rendered results; sample: FINAL  - On Repeat Black Ribbed Knit Mini Dress; Black / products: FINAL SALE - On Repeat Black Ribbed Knit Mini Dress; Coastal Style Black Contrast Mini Dress / collections: Little Black Dresses - Short Black Dress, Cocktail Dresses, Formal Dress |
| Tokenization | puff sleeve dress | puff-sleeve dress | 100 | 95 | 61 rendered results; sample: Watercolor Petals Blue Floral Puff Sleeve Maxi Dress; Blue / products: Watercolor Petals Blue Floral Puff Sleeve Maxi Dress; FINAL SALE - Courtyard Brunch Puff Sleeve Off White Mini Dress / collections: Puff Sleeve Dresses |
| Tokenization | two piece set | matching set | 70 | 62 | 422 rendered results; sample: Away We Go Printed Wide Leg Pants; Taupe / collections: Women’s Matching Sets / Trendy Lounge & Two-Piece Outfits – Shop Dress Up |
| Tokenization | high rise jeans | high-rise jeans | 100 | 90 | 189 rendered results; sample: Jesse High Rise Light Wash Tie Waist Palazzo Jeans; Light Wash / products: Ethereal Medium Wash High-Rise Wide Leg Jeans; Ginny High-Rise Dark Wash Wide Leg Jeans |
| Tokenization | square neck top | square-neck top | 82 | 90 | 590 rendered results; sample: Taylor Square Neck Long Sleeve Top; Ivory / products: Sophie Everyday White/Black Striped Square Neck Tank; Laura Everyday Square Neck Top |
| Tokenization | wide leg pants | wide-leg pants | 100 | 95 | 79 rendered results; sample: Palm Paradise Navy Tropical Print Wide Leg Pants; Navy / products: Palm Paradise Navy Tropical Print Wide Leg Pants; Away We Go Printed Wide Leg Pants / collections: Vervet Jeans - Wide Leg Jeans; Cargos Pants For Women - Cargo Joggers, Cargo Wide-Leg Pants & More. / queries: printed wide leg pants; life leopard wide leg pants |
| Tokenization | off shoulder dress | off-shoulder dress | 100 | 62 | 225 rendered results; sample: Sweet Staple Off White Mini Dress; Off White / queries: off the shoulder dress |
| Tokenization | long sleeve mini dress | long-sleeve mini dress | 100 | 85 | 190 rendered results; sample: FINAL  - Simply Ready Purple Mini Dress - DU Deal; Purple / products: FINAL SALE - Simply Ready Purple Mini Dress - DU Deal |
| Tokenization | button down blouse | button-down blouse | 100 | 90 | 190 rendered results; sample: FINAL  - Classic Ease Button Up Blouse; Lavender / products: FINAL SALE - Classic Ease Button Up Blouse; Made To Wear Natural Blouse |
| Tokenization | game day dress | game day dress | 88 | 62 | 424 rendered results; sample: FINAL  - Dreaming Heart Lace Detail White Maxi Dress; White / collections: Bandanas / Trendy Women's Game day, Everyday Bandanas & More! / Dress Up; UGA, Tennessee, Alabama & Atlanta Game Day Clothing / Dress Up Exclusives |
| Customer Language | going out top | going-out top | 76 | 71 | 342 rendered results; sample: Looking Up Denim One-Shoulder Tank - DU DEAL; Denim / products: Looking Up Denim One-Shoulder Tank - DU DEAL; Delicate Days Tan Floral Tank |
| Customer Language | date night dress | date night dress | 100 | 62 | 95 rendered results; sample: Garden Affair Black Floral Midi Dress; Black / collections: Party Dresses - Cocktail Dress - Sparkle Dresses -Date Night Dress |
| Customer Language | brunch outfit | brunch outfit | 94 | 0 | 215 rendered results; sample: Brunch Poplin Everyday Top; Black / no product, collection, query, or page suggestions |
| Customer Language | vacation dress | vacation dress | 88 | 95 | 685 rendered results; sample: FINAL  - Tropical Vacation Off White Maxi Dress; Off White / products: FINAL SALE - Tropical Vacation Off White Maxi Dress; Summer Agenda Leaf Print Ivory Maxi Dress / collections: Resort Dress Collection / Trendy Women's Vacation Dresses / Shop Dress Up; Somewhere Sunny Collection / Women’s Dresses, Tops & Vacation Styles – Shop Dress Up |
| Customer Language | workwear dress | work dress | 94 | 62 | 327 rendered results; sample: Always Works Navy Button Front Mini Dress; Navy / collections: Workwear Dresses |
| Customer Language | bridal shower dress | bridal shower dress | 94 | 0 | 262 rendered results; sample: Summer Memories Ivory Floral Maxi Dress; Ivory / no product, collection, query, or page suggestions |
| Customer Language | mom and me dress | mom and me matching | 100 | 0 | 43 rendered results; sample: Rio Muse Magenta Floral Mini Dress; Magenta / no product, collection, query, or page suggestions |
| Customer Language | oversized sweater | oversized sweater | 88 | 95 | 546 rendered results; sample: FINAL  - Hold Me Close Collared Knit Sweater; Blue / products: FINAL SALE - Frostline Cream Stripe Sweater; FINAL SALE - Hold Me Close Collared Knit Sweater / collections: Oversized Sweaters; Fall Outfits For Women - Sweater Dress, Cozy Sweaters, Oversized Sweaters / queries: deck the halls oversized sweater; oversized grey sweater |
| Customer Language | skort | skort | 100 | 95 | 74 rendered results; sample: Lacy Medium Wash Denim Mini Wrap Skort; Medium Wash / products: Ultra Air Soft Mini Skort; Simply You Wrap Linen Skort / queries: skort; white denim skort |
| Customer Language | faux leather leggings | faux leather leggings | 94 | 0 | 54 rendered results; sample: FINAL  - Midnight Sleigh Faux Black Leather Jacket; Black / no product, collection, query, or page suggestions |
| Ranking And Field Weighting | pink midi dress | pink midi dress | 100 | 90 | 104 rendered results; sample: Catch My Eye Blush Eyelet Midi Dress; Blush / products: Catch My Eye Blush Eyelet Midi Dress; All The Charm Pink Stripe Puff Sleeve Mini Dress |
| Ranking And Field Weighting | white mini dress | white mini dress | 94 | 95 | 353 rendered results; sample: Love Story Floral Eyelet White Mini Dress; White / products: Garden Grace White Floral Mini Dress; European Market White Fruit Print Mini Dress / collections: White Dresses For Women - White Mini Dresses, White Cocktail Dresses, & Bridal Party Dresses / queries: white mini dress; white ruffle mini dress |
| Ranking And Field Weighting | black romper | black romper | 100 | 90 | 45 rendered results; sample: On The Go Stripe Drawstring Romper; Black / products: On The Go Stripe Drawstring Romper; FINAL SALE - Delicate Charm Eyelet Romper |
| Ranking And Field Weighting | denim jacket women | women denim jacket | 100 | 0 | 142 rendered results; sample: FINAL  - Easygoing Classic Denim Jacket; Denim / no product, collection, query, or page suggestions |
| Ranking And Field Weighting | gold hoop earrings | gold hoop earrings | 94 | 95 | 282 rendered results; sample: Seraphina Gold Hoop Earrings; Gold / products: Waverly Gold Butterfly Hoop Earrings; Seraphina Gold Hoop Earrings / queries: lindsay gold hoop earrings; eden gold hoop earrings |
| Ranking And Field Weighting | western boots | western boots | 100 | 95 | 14 rendered results; sample: Always A Step Ahead Red Western Boots; Red / products: From Here On Out White Western Boots; Always A Step Ahead Red Western Boots / collections: Western Shoes, Boots & Booties For Women / Trendy Shoes / Shop Dress Up / queries: white western boots; known white western boots |
| Ranking And Field Weighting | georgia game day | Georgia game day apparel | 100 | 0 | 137 rendered results; sample: Black Georgia Tailgating Club Cropped Tee; Black / no product, collection, query, or page suggestions |
| Ranking And Field Weighting | tennessee game day | Tennessee game day apparel | 94 | 62 | 98 rendered results; sample: Heather Grey Tennessee Cropped Tee; Heather Grey / collections: UGA, Tennessee, Alabama & Atlanta Game Day Clothing / Dress Up Exclusives |
| Ranking And Field Weighting | floral maxi dress | floral maxi dress | 100 | 95 | 195 rendered results; sample: Coastal Heirloom Blue Floral Maxi Dress; Blue / products: Coastal Romance Floral Maxi Dress; FINAL SALE - Wildflower Fields Yellow Floral Maxi Dress / collections: Floral Dress - Floral Maxi Dress - Floral Dresses For Women; Women’s Maxi Dresses / Trendy Long Dresses for Every Occasion /Floral Maxi Dress / Women's Maxi Dress / queries: floral maxi dress; blue floral maxi dress |
| Ranking And Field Weighting | blue midi dress | blue midi dress | 94 | 95 | 298 rendered results; sample: Remarkably Her Blue Midi Dress; Blue / products: Remarkably Her Blue Midi Dress; Seabrook Blue Stripe Tiered Midi Dress / queries: coast blue striped midi dress; periwinkle poise blue midi dress |
| Query Expansion | wedding guest outfit | wedding guest outfit | 100 | 0 | 89 rendered results; sample: Gracefully Yours Cream Floral Maxi Dress; Cream / no product, collection, query, or page suggestions |
| Query Expansion | beach vacation outfit | beach vacation outfit | 88 | 62 | 348 rendered results; sample: Palm Beach Pink Straw Fedora Wide Brim Hat; Pink / collections: Resort Ready Collection / Resort Wear for Women / Vacation Outfits & Beach Looks |
| Query Expansion | graduation dress | graduation dress | 94 | 62 | 251 rendered results; sample: Bluebird Kisses Light Blue Mini Dress; Light Blue / collections: Graduation Dresses for Women / Elegant & Stylish Gowns & Dresses – Shop Dress Up / queries: white graduation dress |
| Query Expansion | teacher outfit | teacher outfit | 76 | 0 | 9 rendered results; sample: Blissfully Perfect Light Blue Striped Romper; Light Blue / no product, collection, query, or page suggestions |
| Query Expansion | sorority recruitment dress | sorority recruitment dress | unverified | 0 | Rendered search was blocked or unverified; do not treat as zero results. / no product, collection, query, or page suggestions |
| Query Expansion | concert outfit | concert outfit | 76 | 62 | 106 rendered results; sample: FINAL  - Denim Debut Dark Wash Romper; Dark Wash / collections: Country Concert Outfits - Denim Shorts, Crochet, Graphic Tees |
| Query Expansion | game day accessories | game day accessories | 64 | 0 | 705 rendered results; sample: ATL Star Beaded Purse Strap; White / no product, collection, query, or page suggestions |
| Query Expansion | summer outfit | summer outfit | 76 | 0 | 354 rendered results; sample: Orchid Breeze Ruffle Shorts; Orchid / no product, collection, query, or page suggestions |
| Query Expansion | fall transition outfit | fall transition outfit | 76 | 0 | 5 rendered results; sample: FINAL  - Blushing Layers Quilted Puffer Vest; Blush / no product, collection, query, or page suggestions |
| Query Expansion | gift for her | gift for her | 94 | 62 | 13 rendered results; sample: Dress Up E-Gift Card; Dress Up Gift Card / collections: Gift Ideas For Her; Holiday Shop - Christmas Gifts For Her |
| Product Attribute Coverage | linen dress | linen dress | 94 | 95 | 275 rendered results; sample: A Little Bit Of Love Linen Maxi Dress; Oatmeal / products: Timeless Touch Oatmeal Linen Midi Dress; A Little Bit Of Love Linen Maxi Dress / collections: Summer Linens - Linen Tops, Dresses, Pants & Shorts / queries: linen dress; love linen maxi dress |
| Product Attribute Coverage | smocked bodice dress | smocked bodice dress | 100 | 0 | 58 rendered results; sample: Hold This Moment Mocha Smocked Maxi Dress; Mocha / no product, collection, query, or page suggestions |
| Product Attribute Coverage | ribbed tank | ribbed tank | 94 | 95 | 174 rendered results; sample: FINAL  - Paradise Plans Ribbed Tank; Yellow / products: FINAL SALE - Paradise Plans Ribbed Tank; Atlanta Script Ribbed Tank / queries: ribbed tank; ribbed tank and sjirt set |
| Product Attribute Coverage | satin midi skirt | satin midi skirt | 100 | 0 | 116 rendered results; sample: FINAL  - Look Around You Leather Midi Skirt; Wine / no product, collection, query, or page suggestions |
| Product Attribute Coverage | crochet top | crochet top | 94 | 95 | 496 rendered results; sample: FINAL  - True Self Crochet Knit Tank - DU Deal; Black / products: Coastal Keepsake Natural Crochet Knit Top; Seeking The Sun Natural Crochet Top / collections: Crochet Tops & Knitwear for Women / Boho Styles & Layered Looks / queries: crochet top |
| Product Attribute Coverage | vegan leather shorts | vegan leather shorts | 100 | 0 | 21 rendered results; sample: Easy Motion Washed Lounge Drawstring Shorts; Denim / no product, collection, query, or page suggestions |
| Product Attribute Coverage | adjustable strap cami | adjustable strap cami | 100 | 0 | 64 rendered results; sample: Seamless Ribbed Padded Cami Tank; Black / no product, collection, query, or page suggestions |
| Product Attribute Coverage | lightweight cardigan | lightweight cardigan | 82 | 71 | 169 rendered results; sample: Coastal Escape Blue Floral Kimono; Blue / products: Coastal Escape Blue Floral Kimono / collections: Women’s Cardigans & Kimonos / Lightweight Layers for Every Season / queries: good days lightweight knit cardigan |
| Product Attribute Coverage | stretchy denim | stretch denim | 94 | 90 | 468 rendered results; sample: Stacey Light Wash Straight Leg Denim Jeans; Light Wash / products: Cortney Light Wash High-Rise Stretch Mom Denim Shorts; Harper Light Wash High-Rise Frayed Stretch Mom Denim Shorts |
| Product Attribute Coverage | non slip sandals | non-slip sandals | 88 | 0 | 17 rendered results; sample: Coral Coast Starfish Flip Flop; Ivory / no product, collection, query, or page suggestions |
| Spanish/Bilingual Discovery | vestido blanco | white dress in Spanish | 94 | 0 | 259 rendered results; sample: FINAL  - Dreaming Heart Lace Detail White Maxi Dress; White / no product, collection, query, or page suggestions |
| Spanish/Bilingual Discovery | vestido fiesta | party dress in Spanish | 94 | 0 | 251 rendered results; sample: FINAL  - Wildflower Fields Yellow Floral Maxi Dress; Yellow / no product, collection, query, or page suggestions |
| Spanish/Bilingual Discovery | vestido boda invitada | wedding guest dress in Spanish | 100 | 0 | 75 rendered results; sample: Elegant Charm Pleated Brown Maxi Dress; Brown / no product, collection, query, or page suggestions |
| Spanish/Bilingual Discovery | blusa mujer | women blouse in Spanish | 82 | 0 | 222 rendered results; sample: FINAL  - True Self Crochet Knit Tank - DU Deal; Black / no product, collection, query, or page suggestions |
| Spanish/Bilingual Discovery | jeans mujer | women jeans in Spanish | 100 | 0 | 109 rendered results; sample: Bella Mid-Rise Medium Wash Easy Flare Jeans; Medium Wash / no product, collection, query, or page suggestions |
| Spanish/Bilingual Discovery | sandalias mujer | women sandals in Spanish | 100 | 0 | 3 rendered results; sample: Isla Embellished Strap Sandal; Nude / no product, collection, query, or page suggestions |
| Spanish/Bilingual Discovery | botas vaqueras | western boots in Spanish | 100 | 0 | 12 rendered results; sample: Always A Step Ahead Red Western Boots; Red / no product, collection, query, or page suggestions |
| Spanish/Bilingual Discovery | falda negra | black skirt in Spanish | 94 | 0 | 2 rendered results; sample: FINAL  - On Repeat Black Ribbed Knit Mini Dress; Black / no product, collection, query, or page suggestions |
| Spanish/Bilingual Discovery | conjunto dos piezas | two-piece set in Spanish | 76 | 0 | 55 rendered results; sample: Pretty In Gingham Collared Zip Tank; Yellow / no product, collection, query, or page suggestions |
| Spanish/Bilingual Discovery | regalo mujer | gift for her in Spanish | 94 | 0 | 5 rendered results; sample: Dress Up E-Gift Card; Dress Up Gift Card / no product, collection, query, or page suggestions |

## Evidence Limits
- Public evidence only: no analytics, revenue, customer records, admin data, search logs, checkout completion, or paid-media data.
- Autocomplete is measured through public suggest responses, not full visual dropdown QA across every desktop and mobile state.
- Competitor checks record visible paid-placement labels only; absence of a label is not proof that results are organic-only.
- The query set is a diagnostic boutique-apparel sample, not a calibrated relevance benchmark with expected product-level judgments.
- Dollar impact should be estimated using Dress Up search logs, product-page reach, add-to-cart rate, conversion, average order value, and margin data.

