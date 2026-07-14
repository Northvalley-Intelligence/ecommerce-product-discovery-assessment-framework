import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const GEN = 'GEN-011';
const TARGET = 'https://highcountryoutfitters.com/';
const ROOT = process.cwd();
const REQUEST_DELAY_MS = Number(process.env.HCO_REQUEST_DELAY_MS || 2200);
const COMPETITOR_QUERY_DELAY_MS = Number(process.env.HCO_COMPETITOR_QUERY_DELAY_MS || 900);
const COMPETITOR_RETRY_BACKOFF_MS = Number(process.env.HCO_COMPETITOR_RETRY_BACKOFF_MS || 20000);
const COMPETITOR_MAX_ATTEMPTS = Number(process.env.HCO_COMPETITOR_MAX_ATTEMPTS || 3);
const priorEvidencePath = path.join(ROOT, 'assessments/high-country-outfitters/ecommerce-evidence/GEN-010/highcountryoutfitters-ecommerce-evidence.json');
const evidenceDir = path.join(ROOT, 'assessments/high-country-outfitters/expanded-ir-evidence', GEN);
const evidencePath = path.join(evidenceDir, 'highcountryoutfitters-expanded-ir-evidence.json');
const reportDir = path.join(ROOT, 'assessments/high-country-outfitters/owner-outreach-report', GEN);
const reportJsonPath = path.join(reportDir, 'highcountryoutfitters-owner-outreach-report.json');
const reportMdPath = path.join(reportDir, 'highcountryoutfitters-owner-outreach-report.md');
const reportTexPath = path.join(ROOT, 'reports/highcountryoutfitters-combined-ecommerce-report.tex');

function q(query, intent, reason, terms = []) {
  return { query, intent, reason, relevance_terms: [...new Set([...keywordTerms(query), ...terms].map(normalize).filter(Boolean))] };
}

function group(concept, executive_explanation, why_it_matters, tests) {
  return { concept, executive_explanation, why_it_matters, tests };
}

const TEST_GROUPS = [
  group(
    'Normalization',
    'Whether the site understands common typing variations such as missing apostrophes, plurals, shorthand, and gender wording.',
    'Good normalization keeps high-intent shoppers from being punished for normal typing habits.',
    [
      q('womens rain jacket', 'women rainwear', "Shoppers often omit the apostrophe in women's.", ['women', 'rain', 'jacket', 'shell']),
      q('mens patagonia fleece', 'men Patagonia fleece', "Shoppers often omit the apostrophe in men's.", ['men', 'patagonia', 'fleece']),
      q('womens hoka shoes', 'women HOKA footwear', 'Brand and gender are commonly typed without punctuation.', ['women', 'hoka', 'shoe']),
      q('mens hiking boots', 'men hiking boots', 'Gendered category searches are common apparel/footwear behavior.', ['men', 'hiking', 'boot']),
      q('womens sandals', 'women sandals', 'Customers often start with gender plus product type.', ['women', 'sandal']),
      q('kids rain jacket', 'kids rainwear', 'Parents search by kid category and use singular product wording.', ['kid', 'rain', 'jacket']),
      q('patagonia womens jacket', 'Patagonia women jacket', 'Brand-aware shoppers combine brand, gender, and category.', ['patagonia', 'women', 'jacket']),
      q('vuori womens joggers', 'Vuori women joggers', 'Brand-plus-product searches often use shorthand gender wording.', ['vuori', 'women', 'jogger']),
      q('yeti coolers', 'YETI coolers', 'Plural category searches should recover product families.', ['yeti', 'cooler']),
      q('braves hats', 'Atlanta Braves hats', 'Local sports shoppers use short team names and plurals.', ['braves', 'hat', 'cap']),
      q('camp chairs', 'camping chairs', 'The user-observed plural query is a normal real-world shopping phrase.', ['camp', 'chair']),
      q('rain jackets', 'rain jackets', 'Plural product-type searches should recover the category.', ['rain', 'jacket', 'shell']),
      q('sun hoodies', 'sun hoodies', 'Outdoor shoppers use plural seasonal product terms.', ['sun', 'hoodie', 'hoody', 'upf']),
      q('long sleeve shirts', 'long-sleeve shirts', 'Plural multi-word apparel searches should still work.', ['long sleeve', 'shirt']),
      q('quarter zip pullover', 'quarter-zip pullover', 'Customers spell out the quarter-zip concept in different forms.', ['quarter zip', '1/4 zip', 'pullover']),
      q('womens upf shirt', 'women UPF shirt', 'Feature-led terms are often combined with gender shorthand.', ['women', 'upf', 'shirt', 'sun']),
      q('mens swim trunks', 'men swim trunks', 'Seasonal apparel searches often use plural product language.', ['men', 'swim', 'trunk']),
      q('girls sandals', 'girls sandals', 'Family shoppers search by child gender and product.', ['girl', 'sandal', 'kid']),
      q('boys fishing shirt', 'boys fishing shirt', 'Youth outdoor apparel can be searched with gender plus activity.', ['boy', 'fishing', 'shirt', 'kid']),
      q('fleece pullovers', 'fleece pullovers', 'Plural style/material searches should recover fleece product families.', ['fleece', 'pullover']),
      q('womens fleece', 'women fleece', 'Material plus gender is a common cold-weather apparel query.', ['women', 'fleece']),
      q('mens shorts', 'men shorts', 'Simple gender/category queries should be consistently supported.', ['men', 'short']),
      q('kids hats', 'kids hats', 'Family shopping often starts with child category plus product type.', ['kid', 'hat', 'cap']),
      q('travel packs', 'travel packs', 'Plural pack wording should recover bags and backpacks.', ['travel', 'pack', 'backpack', 'bag']),
      q('hoka shoe', 'HOKA footwear singular', 'Singular product wording should still recover brand footwear.', ['hoka', 'shoe'])
    ]
  ),
  group(
    'Tokenization',
    'Whether the site handles multi-word phrases, slash notation, brand numerals, and product phrases as shopper intent rather than isolated words.',
    'Token handling affects whether customers can search naturally instead of memorizing exact product names.',
    [
      q('long sleeve shirt', 'long-sleeve shirt', 'Customers describe apparel by phrase, not SKU.', ['long sleeve', 'shirt']),
      q('1/4 zip pullover', 'quarter-zip pullover', 'Quarter zips are often typed with slash notation.', ['1/4 zip', 'quarter zip', 'pullover']),
      q('quarter zip pullover', 'quarter-zip pullover', 'Same intent without slash should work consistently.', ['quarter zip', '1/4 zip', 'pullover']),
      q('button down shirt', 'button-down shirt', 'Product phrases often contain separate style tokens.', ['button', 'shirt']),
      q('short sleeve tee', 'short-sleeve tee', 'Casual phrase wording should recover tees and shirts.', ['short sleeve', 'tee', 'shirt']),
      q('sun protection shirt', 'sun protective shirt', 'Feature phrase searches should recover UPF/sun shirts.', ['sun', 'protection', 'shirt', 'upf']),
      q('rain shell jacket', 'rain shell jacket', 'Over-specified product phrases should still recover shells and jackets.', ['rain', 'shell', 'jacket']),
      q('waterproof hiking boot', 'waterproof hiking boot', 'Attribute plus activity plus product phrases are common in footwear.', ['waterproof', 'hiking', 'boot']),
      q('trail running shoe', 'trail running footwear', 'Activity phrases should map to footwear.', ['trail', 'running', 'shoe']),
      q('packable rain jacket', 'packable rainwear', 'Attribute plus product phrase should recover lightweight rainwear.', ['packable', 'rain', 'jacket']),
      q('wide brim hat', 'wide-brim sun hat', 'Hat shoppers search by construction attribute.', ['wide brim', 'hat', 'sun']),
      q('camp kitchen set', 'camp kitchen products', 'Camping shoppers search by use-case phrase.', ['camp', 'kitchen', 'set']),
      q('fly fishing shirt', 'fly-fishing shirt', 'Activity phrases should connect to apparel.', ['fly', 'fishing', 'shirt']),
      q('stand up paddle board', 'stand-up paddleboard', 'Paddleboard shoppers often spell the phrase as separate tokens.', ['stand up', 'paddle', 'board']),
      q('water bottle holder', 'water bottle holder', 'Accessory phrase searches should retrieve related gear.', ['water', 'bottle', 'holder']),
      q('fleece snap pullover', 'fleece snap pullover', 'Material, closure, and style tokens should combine.', ['fleece', 'snap', 'pullover']),
      q('insulated water bottle', 'insulated bottle', 'Insulation attribute should combine with product type.', ['insulated', 'bottle', 'tumbler']),
      q('ski bib pants', 'ski bib pants', 'Ski shoppers use product phrases rather than collection names.', ['ski', 'bib', 'pant']),
      q('leather flip flop', 'leather flip-flop', 'Footwear phrases may split compound words.', ['leather', 'flip', 'flop', 'sandal']),
      q('cotton pocket tee', 'cotton pocket tee', 'Material plus detail plus product should retrieve shirts.', ['cotton', 'pocket', 'tee', 'shirt']),
      q('performance jogger women', 'women performance jogger', 'Word order should not break brand/category intent.', ['performance', 'jogger', 'women']),
      q('cloud 6 waterproof', 'On Cloud 6 Waterproof', 'Brand model numbers should remain searchable.', ['cloud', 'waterproof', 'shoe']),
      q('better sweater vest', 'Patagonia Better Sweater vest', 'Product line phrase should retrieve exact or close matches.', ['better sweater', 'vest', 'patagonia']),
      q('atlanta braves hat', 'Atlanta Braves hat', 'Local-team product phrases should stay intact.', ['atlanta', 'braves', 'hat']),
      q('kayak rental', 'kayak rental/service intent', 'Service-like intent should still surface relevant pages or products.', ['kayak', 'rental'])
    ]
  ),
  group(
    'Synonyms',
    'Whether the site connects customer language to retailer language: shell versus jacket, puffer versus insulated, pack versus backpack, and similar wording.',
    'Synonym coverage is often where good search looks expert, because customers rarely use catalog-perfect terminology.',
    [
      q('rain shell', 'rain jacket/shell', 'Outdoor shoppers say shell when they mean rainwear.', ['rain', 'shell', 'jacket']),
      q('puffer jacket', 'insulated/down jacket', 'Puffer is common consumer language for insulated jackets.', ['puffer', 'puff', 'down', 'insulated', 'jacket']),
      q('waterproof coat', 'waterproof jacket', 'Coat and jacket language should connect.', ['waterproof', 'coat', 'jacket', 'shell']),
      q('insulated jacket', 'warm jacket', 'Insulated is a feature synonym for warm outerwear.', ['insulated', 'jacket', 'down', 'puff']),
      q('down sweater', 'down jacket/sweater', 'Outdoor brands often use sweater for technical down jackets.', ['down', 'sweater', 'jacket']),
      q('hiking shoes', 'trail/hiking footwear', 'Customers use shoe instead of boot or trail runner.', ['hiking', 'shoe', 'boot', 'trail']),
      q('trail shoes', 'trail running shoes', 'Trail shoes can mean hiking or trail running footwear.', ['trail', 'shoe', 'hoka']),
      q('sun shirt', 'UPF/sun protection shirt', 'Sun shirt should connect to UPF apparel.', ['sun', 'shirt', 'upf']),
      q('fishing shirt', 'performance fishing shirt', 'Activity apparel should not require exact category wording.', ['fishing', 'shirt', 'performance']),
      q('camp chair', 'camping chair', 'Camp and camping should connect.', ['camp', 'chair']),
      q('camp stool', 'camp seat/chair', 'Stool is an alternate seating term.', ['camp', 'stool', 'chair', 'seat']),
      q('cooler bag', 'soft cooler', 'Bag and soft cooler language should connect.', ['cooler', 'bag', 'hopper']),
      q('drink tumbler', 'tumbler/drinkware', 'Drinkware queries should connect to bottles and tumblers.', ['drink', 'tumbler', 'rambler', 'bottle']),
      q('travel backpack', 'travel pack', 'Backpack and pack are common variants.', ['travel', 'backpack', 'pack', 'bag']),
      q('day pack', 'daypack/backpack', 'Spacing variation should connect to packs.', ['day', 'pack', 'backpack']),
      q('flip flops', 'sandals', 'Customers may use flip flops instead of sandal brand terminology.', ['flip', 'flop', 'sandal']),
      q('sandals', 'sandals', 'Generic footwear language should retrieve the category.', ['sandal']),
      q('fleece jacket', 'fleece outerwear', 'Fleece can be a jacket, pullover, or sweater.', ['fleece', 'jacket', 'sweater', 'pullover']),
      q('pullover sweater', 'pullover/fleece', 'Sweater and pullover often overlap in customer language.', ['pullover', 'sweater', 'fleece']),
      q('windbreaker', 'wind/rain shell', 'Windbreaker is consumer language for lightweight shells.', ['windbreaker', 'wind', 'shell', 'jacket']),
      q('raincoat', 'rain jacket', 'Raincoat should connect to rain jacket inventory.', ['raincoat', 'rain', 'jacket']),
      q('water shoes', 'water footwear', 'Water shoe language should map to sandals or paddling footwear.', ['water', 'shoe', 'sandal']),
      q('swimsuit', 'swimwear', 'Swimsuit should connect to swim apparel.', ['swim', 'suit', 'trunk']),
      q('bathing suit', 'swimwear', 'Bathing suit is common consumer wording.', ['bathing', 'swim', 'suit', 'trunk']),
      q('hat', 'headwear', 'Generic hat should surface caps and sun hats.', ['hat', 'cap'])
    ]
  ),
  group(
    'Ranking And Field Weighting',
    'Whether important fields such as brand, product type, gender, activity, and model name appear to influence what rises first.',
    'Strong ranking makes the first few results feel obvious, which is what owners notice when they test their own site.',
    [
      q('patagonia womens jacket', 'Patagonia women jackets', 'Brand, gender, and product type should all matter.', ['patagonia', 'women', 'jacket']),
      q('vuori joggers women', 'Vuori women joggers', 'Brand plus product type should rank the obvious product first.', ['vuori', 'women', 'jogger']),
      q('hoka shoes women', 'HOKA women shoes', 'Brand and gender should beat generic shoes.', ['hoka', 'women', 'shoe']),
      q('yeti rambler tumbler', 'YETI Rambler tumbler', 'Brand line and product should rank exact matches.', ['yeti', 'rambler', 'tumbler']),
      q('patagonia mens shorts', 'Patagonia men shorts', 'Brand, gender, and category should combine.', ['patagonia', 'men', 'short']),
      q('on cloud waterproof women', 'On Cloud waterproof women', 'Brand/model/attribute/gender should be weighted.', ['cloud', 'waterproof', 'women', 'shoe']),
      q('free people dress', 'Free People dress', 'Vendor plus category should retrieve relevant apparel.', ['free people', 'dress']),
      q('faherty mens shirt', 'Faherty men shirt', 'Vendor plus gender plus product should rank relevant shirts.', ['faherty', 'men', 'shirt']),
      q('z supply sweater women', 'Z Supply women sweater', 'Brand and product type should not be diluted.', ['z supply', 'women', 'sweater']),
      q('maui jim sunglasses', 'Maui Jim sunglasses', 'Brand plus product type should rank eyewear.', ['maui jim', 'sunglasses']),
      q('costa sunglasses men', 'Costa men sunglasses', 'Brand, product, and gender should combine.', ['costa', 'sunglasses', 'men']),
      q('johnnie-o polo mens', 'johnnie-O men polo', 'Vendor plus category should rank polos.', ['johnnie', 'polo', 'men']),
      q('spanx pants women', 'SPANX women pants', 'Vendor plus gender/category should rank bottoms.', ['spanx', 'women', 'pant']),
      q('arcteryx mens shirt', "Arc'teryx men shirt", 'Brand spelling normalization plus gender/category should work.', ['arc', 'arcteryx', 'men', 'shirt']),
      q('black diamond shell women', 'Black Diamond women shell', 'Brand plus technical category should rank relevant shells.', ['black diamond', 'women', 'shell']),
      q('birkenstock sandals women', 'Birkenstock women sandals', 'Brand plus footwear category should rank sandals.', ['birkenstock', 'women', 'sandal']),
      q('teva sandals men', 'Teva men sandals', 'Brand plus gender/category should rank sandals.', ['teva', 'men', 'sandal']),
      q('chaco sandals women', 'Chaco women sandals', 'Brand plus gender/category should rank sandals.', ['chaco', 'women', 'sandal']),
      q('southern tide polo', 'Southern Tide polo', 'Vendor plus style should rank polos.', ['southern tide', 'polo']),
      q('atlanta braves womens hat', 'Atlanta Braves women hat', 'Team, gender, and product type should combine.', ['atlanta', 'braves', 'women', 'hat']),
      q('yeti roadie cooler', 'YETI Roadie cooler', 'Brand, product line, and category should rank exact inventory.', ['yeti', 'roadie', 'cooler']),
      q('patagonia capilene shirt', 'Patagonia Capilene shirt', 'Brand line and product should rank exact apparel.', ['patagonia', 'capilene', 'shirt']),
      q('vuori kore shorts', 'Vuori Kore shorts', 'Brand product line should retrieve the exact product family.', ['vuori', 'kore', 'short']),
      q('hoka bondi men', 'HOKA Bondi men', 'Brand model and gender should rank the exact footwear line.', ['hoka', 'bondi', 'men']),
      q('on cloudmonster women', 'On Cloudmonster women', 'Brand model and gender should rank relevant footwear.', ['cloudmonster', 'women', 'shoe'])
    ]
  ),
  group(
    'Query Expansion',
    'Whether broader needs such as trail running, hot-weather hiking, lake day, or gifts expand into useful products.',
    'Expansion is where search moves from order-taking to selling: it helps a shopper who knows the use case but not the product name.',
    [
      q('sun hoodie', 'sun protective hoodie', 'Outdoor shoppers use common use-case wording.', ['sun', 'hoodie', 'hoody', 'upf']),
      q('trail running shirt', 'technical trail shirt', 'Trail runners search by activity, not catalog category.', ['trail', 'running', 'shirt', 'technical']),
      q('hiking outfit women', 'women hiking apparel', 'Some shoppers search for a complete use case.', ['hiking', 'women', 'shirt', 'pant', 'short']),
      q('camping gifts', 'camping gift items', 'Gift searches should reveal useful products, not just exact words.', ['camping', 'gift', 'camp', 'yeti']),
      q('beach cover up', 'women beach cover-up', 'Lifestyle phrase should connect to apparel.', ['beach', 'cover', 'dress']),
      q('hot weather hiking shirt', 'warm-weather hiking shirt', 'Weather and activity intent should expand to technical apparel.', ['hot', 'weather', 'hiking', 'shirt', 'sun']),
      q('rain gear women', 'women rain gear', 'Gear wording should map to jackets and shells.', ['rain', 'gear', 'women', 'jacket']),
      q('cold weather jacket', 'warm jacket', 'Temperature intent should map to insulated outerwear.', ['cold', 'weather', 'jacket', 'insulated']),
      q('travel pants women', 'women travel pants', 'Travel use case should connect to pants.', ['travel', 'women', 'pant']),
      q('lightweight backpack', 'lightweight pack', 'Attribute plus broad product should retrieve packs.', ['lightweight', 'backpack', 'pack']),
      q('summer camp clothes', 'summer camp apparel', 'Parent use-case searches should retrieve kids/apparel/camp items.', ['summer', 'camp', 'clothes', 'kid']),
      q('lake day outfit', 'lake apparel/accessories', 'Lifestyle occasion searches should be supported.', ['lake', 'day', 'outfit', 'shirt', 'short', 'sandal']),
      q('paddle board gear', 'paddleboard gear', 'Activity gear searches should connect to paddlesports.', ['paddle', 'board', 'gear']),
      q('ski trip jacket', 'ski jacket', 'Trip intent should map to ski outerwear.', ['ski', 'trip', 'jacket']),
      q('dog walk jacket', 'casual walking jacket', 'Everyday use case can point to lightweight outerwear.', ['walk', 'jacket', 'rain']),
      q('pickleball dress', 'active dress', 'Activity-led apparel searches can reveal recreational products.', ['pickleball', 'dress', 'active']),
      q('running hat women', 'women running hat', 'Activity plus product plus gender should work.', ['running', 'hat', 'women']),
      q('fly fishing gear', 'fly fishing gear', 'Activity gear searches should connect to apparel and equipment.', ['fly', 'fishing', 'gear']),
      q('weekend travel bag', 'travel duffel/bag', 'Trip duration intent should map to travel bags.', ['weekend', 'travel', 'bag', 'duffel']),
      q('work from home joggers', 'comfortable joggers', 'Comfort occasion searches should find loungewear.', ['work', 'home', 'jogger', 'vuori']),
      q('game day hat', 'team hat', 'Occasion phrasing should connect to team caps.', ['game', 'day', 'hat', 'braves', 'georgia']),
      q('fathers day gift', 'gift products', 'Gift occasion searches are common ecommerce behavior.', ['father', 'gift']),
      q('mothers day gift', 'gift products', 'Gift occasion searches should lead to apparel/accessories.', ['mother', 'gift']),
      q('gift under 50', 'budget gift', 'Budget-led gift searches should expose lower-price products.', ['gift', 'under', '50']),
      q('airport travel outfit', 'travel apparel', 'Occasion searches should connect to comfortable travel apparel.', ['airport', 'travel', 'outfit', 'pant', 'jogger'])
    ]
  ),
  group(
    'Document Enrichment',
    'Whether searchable fields include useful product attributes such as UPF, waterproof, quick-dry, merino, polarized, packable, and breathable.',
    'Enriched product data lets shoppers search by benefits, materials, and features instead of exact titles.',
    [
      q('UPF shirt women', 'women UPF shirt', 'UPF may live in tags/specs rather than only titles.', ['upf', 'women', 'shirt', 'sun']),
      q('fleece pullover women', 'women fleece pullover', 'Material and style may be split across fields.', ['fleece', 'pullover', 'women']),
      q('waterproof breathable jacket', 'waterproof breathable jacket', 'Technical features should be searchable.', ['waterproof', 'breathable', 'jacket', 'shell']),
      q('quick dry shorts', 'quick-dry shorts', 'Fabric benefit should map to active shorts.', ['quick dry', 'short']),
      q('moisture wicking shirt', 'moisture-wicking shirt', 'Performance benefit should map to technical tops.', ['moisture', 'wicking', 'shirt']),
      q('polarized sunglasses', 'polarized sunglasses', 'Lens feature should surface eyewear.', ['polarized', 'sunglasses']),
      q('insulated tumbler', 'insulated tumbler', 'Drinkware feature should surface YETI/Rambler products.', ['insulated', 'tumbler', 'rambler']),
      q('gore tex jacket', 'GORE-TEX jacket', 'Technical material should connect to waterproof shells.', ['gore', 'tex', 'jacket', 'shell']),
      q('recycled polyester fleece', 'recycled fleece', 'Sustainability/material fields should be discoverable.', ['recycled', 'polyester', 'fleece']),
      q('merino wool socks', 'merino socks', 'Material attribute should retrieve socks.', ['merino', 'wool', 'sock']),
      q('vegan leather sandals', 'vegan leather sandals', 'Material attribute should not be ignored.', ['vegan', 'leather', 'sandal']),
      q('adjustable strap hat', 'adjustable hat', 'Construction detail should be searchable.', ['adjustable', 'strap', 'hat']),
      q('zippered pocket shorts', 'zip pocket shorts', 'Feature detail can drive apparel choice.', ['zippered', 'pocket', 'short']),
      q('packable jacket', 'packable jacket', 'Packability is a travel/outdoor benefit.', ['packable', 'jacket']),
      q('lightweight rain jacket', 'lightweight rain jacket', 'Weight plus product type should work.', ['lightweight', 'rain', 'jacket']),
      q('water resistant backpack', 'water-resistant backpack', 'Protection attribute should connect to bags.', ['water', 'resistant', 'backpack', 'pack']),
      q('odor resistant shirt', 'odor-resistant shirt', 'Performance attribute can live in descriptions.', ['odor', 'resistant', 'shirt']),
      q('wide brim sun hat', 'wide-brim sun hat', 'Shape and use-case attributes should map to hats.', ['wide brim', 'sun', 'hat']),
      q('high rise leggings', 'high-rise leggings', 'Fit attribute should retrieve apparel.', ['high rise', 'legging']),
      q('compression shorts women', 'women compression shorts', 'Fit/performance attribute plus gender should work.', ['compression', 'short', 'women']),
      q('non slip sandals', 'non-slip sandals', 'Sole/grip benefit should be searchable.', ['non slip', 'sandal', 'grip']),
      q('machine washable dress', 'washable dress', 'Care attribute may matter to apparel shoppers.', ['machine', 'washable', 'dress']),
      q('ripstop pants', 'ripstop pants', 'Fabric construction should map to technical pants.', ['ripstop', 'pant']),
      q('stretchy hiking pants', 'stretch hiking pants', 'Fit/benefit plus activity should work.', ['stretch', 'hiking', 'pant']),
      q('breathable trail shirt', 'breathable trail shirt', 'Performance benefit plus activity should retrieve technical tops.', ['breathable', 'trail', 'shirt'])
    ]
  ),
  group(
    'Spanish/Bilingual Discovery',
    'Whether Spanish or mixed Spanish-English searches can still guide local and visiting shoppers to the right English-language products.',
    'This is a market-access question, not a demographic assumption: bilingual discovery reduces friction when customers search in Spanish, English, or both.',
    [
      q('chaqueta lluvia mujer', 'women rain jacket in Spanish', 'Spanish-speaking shoppers may search for rain jackets using Spanish nouns.', ['women', 'rain', 'jacket', 'shell']),
      q('botas senderismo', 'hiking boots in Spanish', 'Senderismo is common Spanish wording for hiking.', ['hiking', 'boot', 'shoe']),
      q('camisa manga larga', 'long-sleeve shirt in Spanish', 'Manga larga is a natural Spanish apparel phrase.', ['long sleeve', 'shirt']),
      q('sombrero sol', 'sun hat in Spanish', 'Sun protection shoppers may search in Spanish.', ['sun', 'hat', 'wide brim']),
      q('zapatos trail mujer', 'women trail shoes mixed Spanish/English', 'Bilingual shoppers often mix English activity terms with Spanish product words.', ['women', 'trail', 'shoe']),
      q('mochila viaje', 'travel backpack in Spanish', 'Travel pack searches may use Spanish terms.', ['travel', 'backpack', 'pack', 'bag']),
      q('sandalias mujer', 'women sandals in Spanish', 'Footwear shoppers may use Spanish gender/category terms.', ['women', 'sandal']),
      q('ropa mujer', 'women clothing in Spanish', 'Broad apparel discovery can start in Spanish.', ['women', 'clothing', 'apparel']),
      q('impermeable mujer', 'women rainwear in Spanish', 'Impermeable is common rainwear terminology.', ['women', 'rain', 'jacket', 'waterproof']),
      q('gorra braves', 'Braves cap in Spanish', 'Local-team shoppers may mix Spanish product words with English team names.', ['braves', 'hat', 'cap']),
      q('silla camping', 'camp chair in Spanish/English mix', 'Camping product searches are often bilingual.', ['camp', 'chair']),
      q('kayak renta', 'kayak rental in Spanish/English mix', 'Service intent may be typed in bilingual form.', ['kayak', 'rental']),
      q('camiseta patagonia hombre', 'men Patagonia shirt in Spanish', 'Brand searches can mix Spanish apparel and gender terms.', ['patagonia', 'men', 'shirt']),
      q('tenis hoka mujer', 'women HOKA shoes in Spanish', 'Tenis is common Spanish wording for sneakers/shoes.', ['hoka', 'women', 'shoe']),
      q('bolsa viaje', 'travel bag in Spanish', 'Travel shoppers may use bag wording in Spanish.', ['travel', 'bag', 'duffel']),
      q('pantalon senderismo mujer', 'women hiking pants in Spanish', 'Spanish category/product terms should map to English products.', ['women', 'hiking', 'pant']),
      q('chamarra lluvia hombre', 'men rain jacket in Spanish', 'Chamarra is common jacket language for many Spanish-speaking and bilingual shoppers.', ['men', 'rain', 'jacket']),
      q('playera manga larga', 'long-sleeve tee in Spanish', 'Playera and manga larga are common apparel terms.', ['long sleeve', 'tee', 'shirt']),
      q('short pesca', 'fishing shorts bilingual', 'Short is commonly used in Spanish-English retail searches.', ['fishing', 'short']),
      q('traje de bano mujer', 'women swimwear in Spanish', 'Swimwear search can use Spanish product words.', ['women', 'swim', 'suit', 'trunk']),
      q('lentes de sol', 'sunglasses in Spanish', 'Sunglasses are often searched as lentes de sol.', ['sunglasses', 'maui jim', 'costa']),
      q('chaqueta fleece mujer', 'women fleece jacket bilingual', 'Technical fabric words often remain English inside Spanish phrases.', ['women', 'fleece', 'jacket']),
      q('camisa upf mujer', 'women UPF shirt bilingual', 'Feature acronyms such as UPF are likely to remain English.', ['women', 'upf', 'shirt', 'sun']),
      q('zapatos caminar hombre', 'men walking shoes in Spanish', 'Walking-shoe searches may use Spanish activity language.', ['men', 'walking', 'shoe']),
      q('regalo camping', 'camping gift in Spanish/English mix', 'Gift discovery can start with bilingual phrases.', ['gift', 'camping', 'camp'])
    ]
  )
];

const COMPETITOR_QUERIES = [
  'rain jacket',
  'camp chair',
  'hoka shoes',
  'yeti cooler',
  'trail running shirt',
  'patagonia fleece',
  'womens sandals',
  'sun hoodie'
];

const COMPETITORS = [
  {
    name: 'Public Lands',
    classification: "National outdoor specialty retail benchmark from Dick's Sporting Goods",
    source_url: 'https://www.publiclands.com/',
    overlap: 'Outdoor apparel, footwear, camping, paddling, fishing, and gear.',
    same_query_benchmark: false,
    searchUrl: (query) => `https://www.publiclands.com/search/SearchDisplay?searchTerm=${encodeURIComponent(query)}`
  },
  {
    name: 'Half-Moon Outfitters',
    classification: 'Regional outdoor specialty retailer benchmark',
    source_url: 'https://www.halfmoonoutfitters.com/',
    overlap: 'Outdoor apparel, footwear, accessories, and lifestyle/outdoor gear in the Southeast.',
    searchUrl: (query) => `https://www.halfmoonoutfitters.com/search?q=${encodeURIComponent(query)}`
  },
  {
    name: 'Mast General Store',
    classification: 'Regional outdoor/lifestyle retailer benchmark',
    source_url: 'https://www.mastgeneralstore.com/',
    overlap: 'Outdoor apparel, footwear, camping goods, travel, and lifestyle products in the Southeast.',
    searchUrl: (query) => `https://www.mastgeneralstore.com/search?query=${encodeURIComponent(query)}`
  }
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function writeText(file, text) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, text);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(text = '') {
  return String(text).toLowerCase().replace(/[^a-z0-9/+\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function keywordTerms(query = '') {
  const stop = new Set(['de', 'para', 'the', 'and', 'for', 'with', 'under', 'from', 'day']);
  return normalize(query).split(/\s+/).filter((term) => term.length > 2 && !stop.has(term));
}

function searchUrl(query) {
  return `${TARGET}search?options%5Bprefix%5D=last&q=${encodeURIComponent(query)}`;
}

function searchResultCount(title = '') {
  const match = title.match(/Search:\s*([\d,]+)\s+results found/i);
  if (match) return Number(match[1].replace(/,/g, ''));
  if (/no results|0 results/i.test(title)) return 0;
  return null;
}

function isBlocked(title = '', text = '') {
  return /verifying your connection|access denied|site maintenance|403 forbidden/i.test(`${title} ${text}`);
}

function compactTitle(text = '') {
  return String(text)
    .replace(/\s+/g, ' ')
    .replace(/\$[\d,.]+/g, '')
    .replace(/Sold Out/gi, '')
    .replace(/Color -/gi, '')
    .trim()
    .slice(0, 150);
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function compactExcerpt(text = '', max = 1500) {
  return String(text).replace(/\s+/g, ' ').trim().slice(0, max);
}

function containsTerm(haystack, term) {
  const h = normalize(haystack);
  const t = normalize(term);
  if (!t) return false;
  if (h.includes(t)) return true;
  if (t.endsWith('s') && h.includes(t.slice(0, -1))) return true;
  if (t.endsWith('ing') && h.includes(t.slice(0, -3))) return true;
  return false;
}

function relevantCount(test, titles = []) {
  return titles.filter((title) => test.relevance_terms.some((term) => containsTerm(title, term))).length;
}

function firstRelevant(test, titles = []) {
  return Boolean(titles[0] && test.relevance_terms.some((term) => containsTerm(titles[0], term)));
}

function scoreSearch(test, result) {
  if (result.blocked || result.result_count === null || result.result_count === undefined) return null;
  if (result.result_count === 0) return 0;
  const relevant = relevantCount(test, result.product_titles);
  let score = 68;
  if (result.product_titles.length > 0) score += 7;
  if (firstRelevant(test, result.product_titles)) score += 10;
  if (relevant >= 3) score += 10;
  else if (relevant > 0) score += 5;
  if (result.result_count > 0 && result.result_count <= 250) score += 5;
  if (result.result_count > 450) score -= 8;
  return Math.max(0, Math.min(100, score));
}

function scoreAutocomplete(test, result) {
  if (!result.ok || result.status !== 200) return null;
  const products = result.products || [];
  const collections = result.collections || [];
  const queries = result.queries || [];
  const pages = result.pages || [];
  if (!products.length && !collections.length && !queries.length && !pages.length) return 0;
  if (!products.length) return collections.length || queries.length ? 62 : 55;
  const relevant = relevantCount(test, products);
  let score = 68;
  if (firstRelevant(test, products)) score += 14;
  if (relevant >= 2) score += 10;
  else if (relevant > 0) score += 5;
  if (collections.length || queries.length || pages.length) score += 5;
  return Math.max(0, Math.min(100, score));
}

function band(score) {
  if (score === null || score === undefined) return 'unverified';
  if (score >= 90) return 'strong';
  if (score >= 75) return 'usable';
  if (score >= 50) return 'partial';
  if (score > 0) return 'weak';
  return 'no assistance';
}

function average(values) {
  const usable = values.filter((value) => Number.isFinite(value));
  if (!usable.length) return null;
  return Math.round(usable.reduce((sum, value) => sum + value, 0) / usable.length);
}

function percent(part, whole) {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

async function collectSearch(page, test) {
  const url = searchUrl(test.query);
  let lastResult = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(900);
    const title = await page.title();
    const text = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
    const productTitles = await page
      .locator('a[href*="/products/"]')
      .evaluateAll((anchors) => anchors
        .map((anchor) => anchor.textContent || '')
        .map((text) => text.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 8))
      .catch(() => []);
    const resultCount = searchResultCount(title);
    const blocked = isBlocked(title, text) || [401, 403, 429, 503].includes(response?.status() || 0) || (resultCount === null && productTitles.length === 0);
    lastResult = {
      url,
      status: response?.status() || null,
      title,
      result_count: resultCount,
      blocked,
      product_titles: productTitles.map(compactTitle).filter(Boolean)
    };
    if (!lastResult.blocked || attempt === 3) return lastResult;
    await sleep(6000 * attempt);
  } catch (error) {
    lastResult = {
      url,
      status: null,
      title: '',
      result_count: null,
      blocked: true,
      error: error.message,
      product_titles: []
    };
    await sleep(6000 * attempt);
  }
  }
  return lastResult;
}

async function collectSuggestOnce(page, test) {
  return page.evaluate(async (query) => {
    const url = `/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product,collection,query,page&resources[limit]=8`;
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (error) {
      return {
        status: response.status,
        ok: response.ok,
        error: `non_json_suggest_response: ${error.message}`,
        products: [],
        collections: [],
        queries: [],
        pages: []
      };
    }
    const resources = json?.resources?.results || {};
    return {
      status: response.status,
      ok: response.ok,
      products: (resources.products || []).map((item) => item.title).filter(Boolean).slice(0, 8),
      collections: (resources.collections || []).map((item) => item.title).filter(Boolean).slice(0, 8),
      queries: (resources.queries || []).map((item) => item.text).filter(Boolean).slice(0, 8),
      pages: (resources.pages || []).map((item) => item.title).filter(Boolean).slice(0, 8)
    };
  }, test.query);
}

async function collectSuggest(page, test) {
  let lastResult = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    lastResult = await collectSuggestOnce(page, test);
    if (lastResult.status !== 429 || attempt === 3) return lastResult;
    await sleep(7000 * attempt);
  }
  return lastResult;
}

function searchNote(result) {
  if (result.blocked) return 'Rendered search was blocked or unverified; do not treat as zero results.';
  if (result.result_count === 0) return 'Rendered search produced zero results.';
  const products = result.product_titles.slice(0, 2).join('; ') || 'no product titles captured';
  return `${result.result_count} rendered results; sample: ${products}`;
}

function autocompleteNote(result) {
  if (!result.ok) return `Suggest API status ${result.status}; not verified.`;
  const parts = [];
  if (result.products.length) parts.push(`products: ${result.products.slice(0, 2).join('; ')}`);
  if (result.collections.length) parts.push(`collections: ${result.collections.slice(0, 2).join('; ')}`);
  if (result.queries.length) parts.push(`queries: ${result.queries.slice(0, 2).join('; ')}`);
  if (result.pages.length) parts.push(`pages: ${result.pages.slice(0, 2).join('; ')}`);
  return parts.length ? parts.join(' | ') : 'no product, collection, query, or page suggestions';
}

function flattenTests() {
  return TEST_GROUPS.flatMap((item) => item.tests.map((test, index) => ({
    concept: item.concept,
    executive_explanation: item.executive_explanation,
    why_it_matters: item.why_it_matters,
    sequence: index + 1,
    ...test
  })));
}

function sponsoredTerms(text = '') {
  const matches = String(text).match(/\b(sponsored|promoted|advertisement|advertising|ad choices)\b/gi) || [];
  return [...new Set(matches.map((match) => match.toLowerCase()))];
}

async function collectCompetitorEvidence(browser) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  await page.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (['image', 'font', 'media'].includes(type)) route.abort();
    else route.continue();
  });

  const competitors = [];
  for (const competitor of COMPETITORS) {
    const runs = [];
    for (const query of COMPETITOR_QUERIES) {
      const url = competitor.searchUrl(query);
      let status = null;
      let title = '';
      let text = '';
      let blocked = false;
      let product_link_count = 0;
      let error = null;
      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        status = response?.status() || null;
        await page.waitForTimeout(1100);
        title = await page.title();
        text = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
        blocked = isBlocked(title, text) || [401, 403, 429, 503].includes(status);
        product_link_count = await page
          .locator('a[href]')
          .evaluateAll((anchors) => anchors
            .map((anchor) => anchor.getAttribute('href') || '')
            .filter((href) => /\/product|\/products|\/p\//i.test(href)).length)
          .catch(() => 0);
      } catch (captureError) {
        blocked = true;
        error = captureError.message;
      }
      const terms = sponsoredTerms(text);
      runs.push({
        query,
        url,
        status,
        title,
        blocked,
        product_link_count,
        sponsored_terms_found: terms,
        sponsored_label_visible: terms.length > 0,
        organic_sponsored_interpretation: terms.length > 0
          ? 'Rendered page text exposed paid-placement language; separate organic and paid placement review is needed.'
          : 'No visible paid-placement label was found in rendered text. Treat result ordering as organic/merchandising evidence only, not proof that paid placements do not exist.',
        error
      });
      process.stdout.write('c');
    }
    const usableRuns = runs.filter((run) => !run.blocked && (run.product_link_count > 0 || /search|results/i.test(`${run.title}`)));
    const sponsoredRuns = runs.filter((run) => run.sponsored_label_visible);
    competitors.push({
      name: competitor.name,
      classification: competitor.classification,
      source_url: competitor.source_url,
      overlap: competitor.overlap,
      query_count: runs.length,
      usable_run_count: usableRuns.length,
      blocked_or_low_signal_count: runs.length - usableRuns.length,
      sponsored_label_run_count: sponsoredRuns.length,
      sponsored_interpretation: sponsoredRuns.length
        ? 'Visible paid-placement language appeared in at least one sampled rendered result page.'
        : 'No visible paid-placement labels were found in the sampled rendered text; this does not prove the retailer has no retail media placements.',
      runs
    });
  }
  await page.close();
  process.stdout.write('\n');
  return competitors;
}

function competitorNoResults(title = '', text = '') {
  return /\b(no results|0 results|did not match|nothing found|no products found|try another search)\b/i.test(`${title} ${text}`);
}

function scoreCompetitorSearch(test, run) {
  if (run.blocked || !run.status || run.status >= 400) return null;
  if (run.no_results_visible) return 0;
  const haystack = `${run.title} ${run.page_excerpt || ''} ${(run.product_titles || []).join(' ')}`;
  const matchedTerms = (test.relevance_terms || []).filter((term) => containsTerm(haystack, term));
  let score = 30;
  if (run.product_link_count > 0) score += 34;
  if ((run.product_titles || []).length > 0) score += 8;
  if (matchedTerms.length >= 3) score += 18;
  else if (matchedTerms.length > 0) score += 10;
  if (run.product_link_count >= 8) score += 5;
  if (/search|results/i.test(`${run.title} ${run.page_excerpt || ''}`)) score += 5;
  return Math.max(0, Math.min(100, score));
}

function competitorSearchNote(run) {
  if (run.blocked) return 'rendered page blocked or unverified';
  if (run.no_results_visible) return 'rendered search exposed a no-result message';
  const sample = (run.product_titles || []).slice(0, 2).join('; ');
  if (sample) return `${run.product_link_count} product-like links; sample: ${sample}`;
  return `${run.product_link_count} product-like links; page loaded without clean product-title capture`;
}

async function collectCompetitorSearchRun(page, competitor, test) {
  const url = competitor.searchUrl(test.query);
  let run = null;
  for (let attempt = 1; attempt <= COMPETITOR_MAX_ATTEMPTS; attempt += 1) {
    let status = null;
    let title = '';
    let text = '';
    let blocked = false;
    let product_link_count = 0;
    let product_titles = [];
    let error = null;
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      status = response?.status() || null;
      await page.waitForTimeout(850);
      title = await page.title();
      text = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
      blocked = isBlocked(title, text) || [401, 403, 429, 503].includes(status);
      const anchors = await page
        .locator('a[href]')
        .evaluateAll((items) => items.map((anchor) => ({
          href: anchor.getAttribute('href') || '',
          text: (anchor.textContent || '').replace(/\s+/g, ' ').trim()
        })))
        .catch(() => []);
      const productAnchors = anchors.filter((anchor) => /\/product|\/products|\/p\/|\/shop\//i.test(anchor.href));
      product_link_count = productAnchors.length;
      product_titles = unique(productAnchors
        .map((anchor) => compactTitle(anchor.text))
        .filter((item) => item.length >= 3 && item.length <= 150)
        .slice(0, 8));
    } catch (captureError) {
      blocked = true;
      error = captureError.message;
    }
    run = {
      concept: test.concept,
      sequence: test.sequence,
      query: test.query,
      intent: test.intent,
      url,
      status,
      title,
      blocked,
      no_results_visible: competitorNoResults(title, text),
      product_link_count,
      product_titles,
      page_excerpt: compactExcerpt(text),
      error,
      attempts: attempt
    };
    if (!run.blocked || attempt === COMPETITOR_MAX_ATTEMPTS) break;
    await sleep(COMPETITOR_RETRY_BACKOFF_MS * attempt);
  }
  const search_score = scoreCompetitorSearch(test, run);
  return {
    ...run,
    search_score,
    search_band: band(search_score),
    search_note: competitorSearchNote({ ...run, search_score })
  };
}

async function collectCompetitorSuggestRun(page, test) {
  let lastResult = null;
  for (let attempt = 1; attempt <= COMPETITOR_MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await page.evaluate(async (query) => {
        const url = `/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product,collection,query,page&resources[limit]=8`;
        const response = await fetch(url, { headers: { accept: 'application/json' } });
        const text = await response.text();
        let json = null;
        try {
          json = JSON.parse(text);
        } catch (error) {
          return {
            status: response.status,
            ok: false,
            accessible: false,
            error: `non_json_or_unavailable_suggest_response: ${error.message}`,
            products: [],
            collections: [],
            queries: [],
            pages: []
          };
        }
        const resources = json?.resources?.results || {};
        return {
          status: response.status,
          ok: response.ok,
          accessible: response.ok,
          products: (resources.products || []).map((item) => item.title).filter(Boolean).slice(0, 8),
          collections: (resources.collections || []).map((item) => item.title).filter(Boolean).slice(0, 8),
          queries: (resources.queries || []).map((item) => item.text).filter(Boolean).slice(0, 8),
          pages: (resources.pages || []).map((item) => item.title).filter(Boolean).slice(0, 8)
        };
      }, test.query);
      const autocomplete_score = scoreAutocomplete(test, result);
      lastResult = {
        ...result,
        attempts: attempt,
        autocomplete_score,
        autocomplete_band: band(autocomplete_score),
        autocomplete_note: autocomplete_score === null ? `public suggest endpoint unavailable or status ${result.status}` : autocompleteNote(result)
      };
      if (result.status !== 429 || attempt === COMPETITOR_MAX_ATTEMPTS) return lastResult;
      await sleep(COMPETITOR_RETRY_BACKOFF_MS * attempt);
    } catch (error) {
      lastResult = {
        status: null,
        ok: false,
        accessible: false,
        error: error.message,
        products: [],
        collections: [],
        queries: [],
        pages: [],
        attempts: attempt,
        autocomplete_score: null,
        autocomplete_band: 'unverified',
        autocomplete_note: 'public suggest endpoint unavailable or blocked'
      };
      if (attempt === COMPETITOR_MAX_ATTEMPTS) return lastResult;
      await sleep(COMPETITOR_RETRY_BACKOFF_MS * attempt);
    }
  }
  return lastResult || {
    status: null,
    ok: false,
    accessible: false,
    error: 'suggest_not_attempted',
    products: [],
    collections: [],
    queries: [],
    pages: [],
    autocomplete_score: null,
    autocomplete_band: 'unverified',
    autocomplete_note: 'public suggest endpoint unavailable or blocked'
  };
}

function summarizeCompetitorConceptRuns(runs) {
  return TEST_GROUPS.map((item) => {
    const groupRuns = runs.filter((run) => run.concept === item.concept);
    const searchScores = groupRuns.map((run) => run.search_score);
    const autocompleteScores = groupRuns.map((run) => run.autocomplete_score);
    const strongSearch = groupRuns.filter((run) => (run.search_score ?? -1) >= 75).length;
    const strongAutocomplete = groupRuns.filter((run) => (run.autocomplete_score ?? -1) >= 75).length;
    return {
      concept: item.concept,
      query_count: groupRuns.length,
      usable_search_count: groupRuns.filter((run) => Number.isFinite(run.search_score)).length,
      search_average: average(searchScores),
      strong_search_rate: percent(strongSearch, groupRuns.length),
      weak_or_no_search_count: groupRuns.filter((run) => !Number.isFinite(run.search_score) || run.search_score < 50).length,
      autocomplete_available_count: groupRuns.filter((run) => Number.isFinite(run.autocomplete_score)).length,
      autocomplete_average: average(autocompleteScores),
      strong_autocomplete_rate: percent(strongAutocomplete, groupRuns.length),
      sample_search_gaps: groupRuns
        .filter((run) => !Number.isFinite(run.search_score) || run.search_score < 75)
        .slice(0, 4)
        .map((run) => run.query),
      sample_autocomplete_gaps: groupRuns
        .filter((run) => Number.isFinite(run.autocomplete_score) && run.autocomplete_score < 75)
        .slice(0, 4)
        .map((run) => run.query)
    };
  });
}

function requestedCompetitorNames() {
  return (process.env.HCO_COMPETITOR_SITE_FILTER || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function mergeCompetitorQueryBenchmark(existingBenchmark = {}, partialBenchmark = {}) {
  if (!existingBenchmark.sites?.length) return partialBenchmark;
  const replacementNames = new Set((partialBenchmark.sites || []).map((site) => site.name));
  return {
    ...existingBenchmark,
    ...partialBenchmark,
    excluded_competitors: existingBenchmark.excluded_competitors || partialBenchmark.excluded_competitors || [],
    sites: [
      ...(existingBenchmark.sites || []).filter((site) => !replacementNames.has(site.name)),
      ...(partialBenchmark.sites || [])
    ]
  };
}

async function collectCompetitorQueryBenchmark(browser, tests = flattenTests()) {
  const requestedNames = requestedCompetitorNames();
  const requestedSet = new Set(requestedNames);
  const benchmarkCompetitors = COMPETITORS
    .filter((competitor) => competitor.same_query_benchmark !== false)
    .filter((competitor) => requestedSet.size === 0 || requestedSet.has(competitor.name));
  const excludedCompetitors = COMPETITORS
    .filter((competitor) => competitor.same_query_benchmark === false)
    .map((competitor) => ({
      name: competitor.name,
      reason: 'Excluded from the same-query benchmark because prior rendered runs were blocked or unusable.'
    }));
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  await page.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (['image', 'font', 'media'].includes(type)) route.abort();
    else route.continue();
  });

  const sites = [];
  for (const competitor of benchmarkCompetitors) {
    const runs = [];
    for (const test of tests) {
      const searchRun = await collectCompetitorSearchRun(page, competitor, test);
      const autocompleteRun = await collectCompetitorSuggestRun(page, test);
      runs.push({
        competitor: competitor.name,
        classification: competitor.classification,
        concept: test.concept,
        sequence: test.sequence,
        query: test.query,
        intent: test.intent,
        search: {
          url: searchRun.url,
          status: searchRun.status,
          title: searchRun.title,
          blocked: searchRun.blocked,
          no_results_visible: searchRun.no_results_visible,
          product_link_count: searchRun.product_link_count,
          product_titles: searchRun.product_titles,
          page_excerpt: searchRun.page_excerpt,
          error: searchRun.error
        },
        search_score: searchRun.search_score,
        search_band: searchRun.search_band,
        search_note: searchRun.search_note,
        autocomplete: {
          status: autocompleteRun.status,
          ok: autocompleteRun.ok,
          accessible: autocompleteRun.accessible,
          products: autocompleteRun.products,
          collections: autocompleteRun.collections,
          queries: autocompleteRun.queries,
          pages: autocompleteRun.pages,
          error: autocompleteRun.error
        },
        autocomplete_score: autocompleteRun.autocomplete_score,
        autocomplete_band: autocompleteRun.autocomplete_band,
        autocomplete_note: autocompleteRun.autocomplete_note
      });
      process.stdout.write('q');
      await sleep(COMPETITOR_QUERY_DELAY_MS);
    }
    const concept_summaries = summarizeCompetitorConceptRuns(runs);
    sites.push({
      name: competitor.name,
      classification: competitor.classification,
      source_url: competitor.source_url,
      overlap: competitor.overlap,
      query_count: runs.length,
      usable_search_count: runs.filter((run) => Number.isFinite(run.search_score)).length,
      search_average: average(runs.map((run) => run.search_score)),
      strong_search_rate: percent(runs.filter((run) => (run.search_score ?? -1) >= 75).length, runs.length),
      autocomplete_available_count: runs.filter((run) => Number.isFinite(run.autocomplete_score)).length,
      autocomplete_average: average(runs.map((run) => run.autocomplete_score)),
      strong_autocomplete_rate: percent(runs.filter((run) => (run.autocomplete_score ?? -1) >= 75).length, runs.length),
      concept_summaries,
      runs
    });
  }
  await page.close();
  process.stdout.write('\n');
  return {
    purpose: 'Run the same protected High Country query set against usable competitor sites so each query type can be compared by site.',
    methodology: {
      query_source: 'Same 175 High Country protected examples used for the target search/autocomplete evaluation.',
      target_metrics: 'High Country includes rendered search and Shopify suggest autocomplete. Competitors are evaluated with public rendered search and public suggest endpoints only where those endpoints return usable JSON.',
      scoring_note: 'Competitor scores are public-evidence relevance proxies from page access, product-like links, query-term matches, and suggestion payloads. They are not calibrated product-level judgments, market-share claims, or proof of paid versus organic ranking.'
    },
    excluded_competitors: excludedCompetitors,
    sites
  };
}

async function collectEvidence() {
  const tests = flattenTests();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  await page.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (['image', 'font', 'media'].includes(type)) route.abort();
    else route.continue();
  });
  await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(900);

  const examples = [];
  for (const test of tests) {
    const search = await collectSearch(page, test);
    const autocomplete = await collectSuggest(page, test);
    const search_score = scoreSearch(test, search);
    const autocomplete_score = scoreAutocomplete(test, autocomplete);
    examples.push({
      ...test,
      search,
      autocomplete,
      search_score,
      autocomplete_score,
      search_band: band(search_score),
      autocomplete_band: band(autocomplete_score),
      uniform_experience: Number.isFinite(search_score) && Number.isFinite(autocomplete_score) && search_score >= 75 && autocomplete_score >= 75,
      search_note: searchNote(search),
      autocomplete_note: autocompleteNote(autocomplete)
    });
    process.stdout.write('.');
    await sleep(REQUEST_DELAY_MS);
  }
  process.stdout.write('\n');
  const competitor_evidence = await collectCompetitorEvidence(browser);
  const competitor_query_benchmark = await collectCompetitorQueryBenchmark(browser, tests);
  await browser.close();
  return { examples, competitor_evidence, competitor_query_benchmark };
}

function summarizeConcepts(examples) {
  return TEST_GROUPS.map((item) => {
    const groupExamples = examples.filter((example) => example.concept === item.concept);
    const strongSearch = groupExamples.filter((example) => (example.search_score ?? -1) >= 75).length;
    const strongAuto = groupExamples.filter((example) => (example.autocomplete_score ?? -1) >= 75).length;
    const noAuto = groupExamples.filter((example) => example.autocomplete_score === 0).length;
    const uniform = groupExamples.filter((example) => example.uniform_experience).length;
    const gaps = groupExamples
      .filter((example) => (example.search_score ?? -1) >= 75 && (example.autocomplete_score ?? 0) < 75)
      .slice(0, 5)
      .map((example) => example.query);
    return {
      concept: item.concept,
      executive_explanation: item.executive_explanation,
      why_it_matters: item.why_it_matters,
      example_count: groupExamples.length,
      search_average: average(groupExamples.map((example) => example.search_score)),
      autocomplete_average: average(groupExamples.map((example) => example.autocomplete_score)),
      strong_search_rate: percent(strongSearch, groupExamples.length),
      strong_autocomplete_rate: percent(strongAuto, groupExamples.length),
      uniform_experience_rate: percent(uniform, groupExamples.length),
      no_autocomplete_count: noAuto,
      sample_gaps: gaps
    };
  });
}

function buildEvidence(examples, competitor_evidence = [], competitor_query_benchmark = null) {
  const priorEvidence = fs.existsSync(priorEvidencePath) ? readJson(priorEvidencePath) : {};
  const concepts = summarizeConcepts(examples);
  const total = examples.length;
  const strongSearch = examples.filter((example) => (example.search_score ?? -1) >= 75).length;
  const strongAuto = examples.filter((example) => (example.autocomplete_score ?? -1) >= 75).length;
  const noAuto = examples.filter((example) => example.autocomplete_score === 0).length;
  const uniform = examples.filter((example) => example.uniform_experience).length;
  const searchWorksAutoWeak = examples
    .filter((example) => (example.search_score ?? -1) >= 75 && (example.autocomplete_score ?? 0) < 75)
    .sort((a, b) => (a.autocomplete_score ?? -1) - (b.autocomplete_score ?? -1));
  const spanish = concepts.find((concept) => concept.concept === 'Spanish/Bilingual Discovery');
  const autocompleteAvg = average(examples.map((example) => example.autocomplete_score));
  const uniformRate = percent(uniform, total);
  return {
    evidence_id: 'highcountryoutfitters-expanded-ir-owner-outreach-2026-07-03',
    generated_at: new Date().toISOString(),
    generation: GEN,
    target: priorEvidence.target || {
      company_name: 'High Country Outfitters',
      domain: 'highcountryoutfitters.com',
      url: TARGET
    },
    scope: 'Leadership product-discovery report with expanded search/autocomplete experiments.',
    methodology: {
      examples_per_concept: 25,
      concept_count: TEST_GROUPS.length,
      total_examples: total,
      concepts: TEST_GROUPS.map((item) => item.concept),
      collection_method: 'Rendered search pages plus browser-context Shopify suggest API responses.',
      scoring_note: 'Scores are bounded public-evidence relevance judgments from result counts, sampled product titles, and suggestion payloads. They are not analytics, conversion, or revenue measurements.'
    },
    prior_ecommerce_evidence_used: {
      path: path.relative(ROOT, priorEvidencePath),
      used_for: 'Existing browse, cart, mobile, policy, camp autocomplete, and local-assessment reference context.'
    },
    summary: {
      total_examples: total,
      search_average: average(examples.map((example) => example.search_score)),
      autocomplete_average: autocompleteAvg,
      strong_search_rate: percent(strongSearch, total),
      strong_autocomplete_rate: percent(strongAuto, total),
      no_autocomplete_rate: percent(noAuto, total),
      uniform_experience_rate: uniformRate,
      search_strong_autocomplete_weak_count: searchWorksAutoWeak.length,
      spanish_bilingual_autocomplete_average: spanish?.autocomplete_average,
      spanish_bilingual_uniform_rate: spanish?.uniform_experience_rate
    },
    opportunity_model: {
      basis: 'Directional model from public experiments only. Dollar impact requires site-search usage, conversion rate, AOV, revenue, and analytics segmentation.',
      tested_autocomplete_coverage_gain_if_fixed_to_90: Math.max(0, 90 - (autocompleteAvg || 0)),
      tested_uniformity_gain_if_fixed_to_90: Math.max(0, 90 - uniformRate),
      conservative_sitewide_sales_upside_range: '1% to 4%',
      stretch_sitewide_sales_upside_range: '3% to 7%',
      rationale: 'Search and browse already recover many intents. The main upside is earlier assistance and consistency: fewer shoppers should have to press enter, reformulate, or know exact English catalog language.'
    },
    competitor_evidence: {
      purpose: 'Clarify the earlier competitor limitation and add a bounded opportunity story around national outdoor retailers and organic versus sponsored/retail-media visibility.',
      queries: COMPETITOR_QUERIES,
      competitors: competitor_evidence,
      interpretation: 'Competitor pages are useful for opportunity framing, but only visible, rendered evidence is used. Sponsored labels are recorded when visible; absence of visible sponsored labels is not proof that a competitor has no paid placements or retail media.'
    },
    competitor_query_benchmark,
    concepts,
    top_autocomplete_gaps: searchWorksAutoWeak.slice(0, 25).map((example) => ({
      concept: example.concept,
      query: example.query,
      intent: example.intent,
      search_score: example.search_score,
      autocomplete_score: example.autocomplete_score,
      search_note: example.search_note,
      autocomplete_note: example.autocomplete_note
    })),
    examples
  };
}

function escapeLatex(value = '') {
  return String(value)
    .replace(/[’‘′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/®/g, '(R)')
    .replace(/™/g, '(TM)')
    .replace(/°/g, ' degrees')
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/~/g, '\\textasciitilde{}');
}

function pctText(value) {
  return `${value ?? 0}\\%`;
}

function scoreText(value) {
  return Number.isFinite(value) ? `${value}\\%` : 'unverified';
}

function shortNote(text = '', max = 185) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 3)}...` : clean;
}

function competitorSummaryText(competitor) {
  return competitor.sponsored_label_run_count > 0
    ? 'Visible paid-placement wording appeared in sampled rendered text; separate organic and paid review is needed.'
    : 'No visible paid-placement labels in sampled rendered text; not proof none exist.';
}

function competitorRunText(run) {
  return run.sponsored_label_visible
    ? 'Visible paid-placement wording appeared; separate organic and paid review is needed.'
    : 'No visible paid-placement label in rendered text; not proof none exists.';
}

function competitorAccessText(run) {
  if (run.status === 403) return 'Blocked';
  if (run.status >= 400) return `HTTP ${run.status}`;
  if (run.status === 200 && run.product_link_count > 0) return 'Usable';
  if (run.status === 200) return 'Loaded';
  return 'Unverified';
}

function normalizeCompetitorEvidence(competitorEvidence = {}) {
  return {
    ...competitorEvidence,
    summary: {
      ...competitorEvidence.summary,
      interpretation: 'Competitor pages are useful for opportunity framing, but only visible rendered evidence is used. Paid-placement labels are recorded when visible; absence of visible paid-placement labels is not proof that a competitor has no paid placements or retail media.'
    },
    competitors: (competitorEvidence.competitors || []).map((competitor) => ({
      ...competitor,
      sponsored_interpretation: competitorSummaryText(competitor),
      runs: (competitor.runs || []).map((run) => ({
        ...run,
        organic_sponsored_interpretation: competitorRunText(run)
      }))
    }))
  };
}

function normalizeEvidenceForReports(evidence) {
  return {
    ...evidence,
    scope: 'Leadership product-discovery report with expanded search/autocomplete experiments.',
    competitor_evidence: normalizeCompetitorEvidence(evidence.competitor_evidence)
  };
}

function reportableCompetitors(evidence) {
  return (evidence.competitor_evidence?.competitors || []).filter((competitor) => competitor.usable_run_count > 0);
}

function blockedCompetitorCount(evidence) {
  return (evidence.competitor_evidence?.competitors || []).filter((competitor) => competitor.usable_run_count === 0).length;
}

function competitorBenchmarkSites(evidence) {
  return evidence.competitor_query_benchmark?.sites || [];
}

function plainScore(value) {
  return Number.isFinite(value) ? `${value}%` : 'not comparable';
}

function conceptSummaryFor(site, conceptName) {
  return (site.concept_summaries || []).find((item) => item.concept === conceptName) || {};
}

function competitorWinLossSummary(evidence) {
  const halfMoon = competitorBenchmarkSites(evidence).find((site) => site.name === 'Half-Moon Outfitters') || {};
  const mast = competitorBenchmarkSites(evidence).find((site) => site.name === 'Mast General Store') || {};
  const hcoSearch = evidence.summary.search_average;
  const hcoAuto = evidence.summary.autocomplete_average;
  const halfSearch = halfMoon.search_average;
  const halfAuto = halfMoon.autocomplete_average;
  const mastSearch = mast.search_average;
  const mastAuto = mast.autocomplete_average;
  const hasBenchmark = [hcoSearch, hcoAuto, halfSearch, halfAuto, mastSearch, mastAuto].every(Number.isFinite);

  if (!hasBenchmark) {
    return {
      markdown: 'Comparable retailer context: same-query competitor evidence is retained in the reference appendix, but not enough comparable public evidence is available to summarize peer patterns in the executive readout.',
      latex: 'Same-query competitor evidence is retained in the reference appendix, but not enough comparable public evidence is available to summarize peer patterns in the executive readout.',
      json: {
        status: 'insufficient_comparable_public_evidence'
      }
    };
  }

  const text = 'Comparable regional outdoor retailers provide useful reference examples for how customers can be guided during the earliest moments of shopping. The executive takeaway is favorable for High Country: customers already encounter a strong online shopping foundation. The remaining opportunity is not a competitor race. It is helping more customers reach the right products faster, with less effort, and with greater confidence to continue toward purchase.';

  return {
    markdown: text,
    latex: text,
    json: {
      status: 'comparable_public_evidence_available',
      search: {
        high_country: hcoSearch,
        half_moon: halfSearch,
        mast: mastSearch,
        readout: 'High Country shows a strong online product-finding foundation among comparable regional outdoor retailers.'
      },
      autocomplete: {
        high_country: hcoAuto,
        half_moon: halfAuto,
        mast: mastAuto,
        readout: 'Comparable regional retailers show different early-journey guidance patterns, and the useful opportunity is improving consistency across the customer shopping journey.'
      }
    }
  };
}

function buildMarkdown(evidence) {
  const lines = [];
  const competitorWinLoss = competitorWinLossSummary(evidence);
  lines.push('# High Country Outfitters Online Customer Experience Opportunity Report');
  lines.push('');
  lines.push('## Executive Readout');
  lines.push('');
  lines.push('High Country Outfitters already provides a strong online shopping experience. Customers can generally find products, see useful store and inventory cues, enter the cart flow, and reach support information. The opportunity is to reduce customer effort in the first moments of product finding so more shoppers reach the products they intend to buy with confidence.');
  lines.push('');
  lines.push('We periodically review regional retailers to identify practical opportunities for improving the online customer experience. High Country was selected because mature retailers with strong ecommerce foundations often benefit most from targeted, incremental improvements rather than complete redesigns. The executive pages use qualitative findings; exact measurements remain in the reference tables.');
  lines.push('');
  lines.push('## Why This Matters');
  lines.push('');
  lines.push(competitorWinLoss.markdown);
  lines.push('');
  lines.push('| Executive question | Customer-experience answer |');
  lines.push('| --- | --- |');
  lines.push('| Why High Country? | Customers already encounter a mature shopping experience, which makes targeted improvements more valuable than a broad redesign. |');
  lines.push('| What can improve? | Customers can receive clearer early guidance when they begin with a need, activity, brand, gift idea, or mixed-language wording. |');
  lines.push('| How should value be measured? | Internal shopping behavior, product-page reach, add-to-cart rate, conversion rate, and average order value can quantify the opportunity. |');
  lines.push('');
  lines.push('## Concepts');
  lines.push('');
  lines.push('| Concept | Search avg | Autocomplete avg | Uniform rate | Main gap |');
  lines.push('| --- | ---: | ---: | ---: | --- |');
  for (const concept of evidence.concepts) {
    lines.push(`| ${concept.concept} | ${concept.search_average}% | ${concept.autocomplete_average}% | ${concept.uniform_experience_rate}% | ${concept.sample_gaps.slice(0, 3).join('; ') || 'none in top sample'} |`);
  }
  lines.push('');
  lines.push('## Estimated Upside');
  lines.push('');
  lines.push('No confidential analytics or sales data were available for this public review, so the report should not imply a dollar claim. Reducing customer effort early in product finding can help shoppers reach relevant products faster, reduce abandonment, and increase purchasing confidence. The exact value should be estimated with internal shopping behavior, product-page reach, add-to-cart rate, conversion rate, and average order value.');
  lines.push('');
  lines.push('## Same-Query Competitor Benchmark');
  lines.push('');
  lines.push('The same 175 protected shopper-language examples were run against the usable competitor sites. High Country includes search and autocomplete; competitors include rendered search and public suggest autocomplete only when the competitor endpoint returned usable public JSON.');
  lines.push('');
  lines.push('| Query type | High Country search | High Country autocomplete | High Country uniform | Half-Moon search | Half-Moon autocomplete | Mast search | Mast autocomplete |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  const halfMoon = competitorBenchmarkSites(evidence).find((site) => site.name === 'Half-Moon Outfitters') || {};
  const mast = competitorBenchmarkSites(evidence).find((site) => site.name === 'Mast General Store') || {};
  for (const concept of evidence.concepts) {
    const half = conceptSummaryFor(halfMoon, concept.concept);
    const mastSummary = conceptSummaryFor(mast, concept.concept);
    lines.push(`| ${concept.concept} | ${plainScore(concept.search_average)} | ${plainScore(concept.autocomplete_average)} | ${plainScore(concept.uniform_experience_rate)} | ${plainScore(half.search_average)} | ${plainScore(half.autocomplete_average)} | ${plainScore(mastSummary.search_average)} | ${plainScore(mastSummary.autocomplete_average)} |`);
  }
  lines.push('');
  lines.push('## Competitor Paid-Placement Reference');
  lines.push('');
  lines.push('| Competitor | Classification | Queries | Usable runs | Paid-placement labels visible | Interpretation |');
  lines.push('| --- | --- | ---: | ---: | ---: | --- |');
  for (const competitor of reportableCompetitors(evidence)) {
    lines.push(`| ${competitor.name} | ${competitor.classification} | ${competitor.query_count} | ${competitor.usable_run_count} | ${competitor.sponsored_label_run_count} | ${competitorSummaryText(competitor)} |`);
  }
  if (blockedCompetitorCount(evidence) > 0) {
    lines.push('');
    lines.push('Unusable competitor capture attempts are retained in the structured evidence artifact but excluded from the comparison table because they did not produce usable public search evidence.');
  }
  lines.push('');
  lines.push('## Full Experiment Dataset');
  lines.push('');
  lines.push('| Concept | Query | Intent | Search | Autocomplete | Notes |');
  lines.push('| --- | --- | --- | ---: | ---: | --- |');
  for (const example of evidence.examples) {
    lines.push(`| ${example.concept} | ${example.query} | ${example.intent} | ${example.search_score ?? 'unverified'} | ${example.autocomplete_score ?? 'unverified'} | ${shortNote(example.search_note, 100)} / ${shortNote(example.autocomplete_note, 100)} |`);
  }
  lines.push('');
  lines.push('## Full Competitor Same-Query Dataset');
  lines.push('');
  lines.push('| Site | Concept | Query | Search | Autocomplete | Evidence note |');
  lines.push('| --- | --- | --- | ---: | ---: | --- |');
  for (const site of competitorBenchmarkSites(evidence)) {
    for (const run of site.runs || []) {
      lines.push(`| ${site.name} | ${run.concept} | ${run.query} | ${run.search_score ?? 'unverified'} | ${run.autocomplete_score ?? 'not comparable'} | ${shortNote(run.search_note, 100)} / ${shortNote(run.autocomplete_note, 100)} |`);
    }
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function buildReportJson(evidence) {
  const competitorWinLoss = competitorWinLossSummary(evidence);
  return {
    report_id: 'highcountryoutfitters-owner-outreach-product-discovery-report',
    generation: GEN,
    target: evidence.target,
    generated_at: evidence.generated_at,
    executive_positioning: {
      goal: 'Help the owner see that High Country has a strong regional outdoor retail ecommerce foundation and a focused opportunity to make it easier for customers to find and buy products.',
      outreach_readiness: 'Stronger than a raw grade sheet, because it leads with business relevance, respects what already works, and moves experiment detail to references.',
      reply_likelihood: 'Higher if sent as a concise executive readout with a specific offer to validate customer effort and buying friction using High Country internal ecommerce metrics, not as a long technical audit.',
      competitor_win_loss_summary: competitorWinLoss.json
    },
    summary: evidence.summary,
    opportunity_model: evidence.opportunity_model,
    competitor_evidence: evidence.competitor_evidence,
    competitor_query_benchmark: evidence.competitor_query_benchmark,
    concepts: evidence.concepts,
    top_autocomplete_gaps: evidence.top_autocomplete_gaps,
    evidence_artifact: path.relative(ROOT, evidencePath),
    pdf_source: path.relative(ROOT, reportTexPath),
    markdown_report: path.relative(ROOT, reportMdPath)
  };
}

function buildLatex(evidence) {
  const competitorWinLoss = competitorWinLossSummary(evidence);
  const conceptRows = evidence.concepts.map((concept) => {
    const gap = concept.sample_gaps.slice(0, 3).join('; ') || 'No major gap in top sample';
    return `${escapeLatex(concept.concept)} & ${scoreText(concept.search_average)} & ${scoreText(concept.autocomplete_average)} & ${pctText(concept.uniform_experience_rate)} & ${escapeLatex(gap)}\\\\`;
  }).join('\n');

  const referenceRows = evidence.examples.map((example) => {
    const notes = `${shortNote(example.search_note, 105)} / ${shortNote(example.autocomplete_note, 105)}`;
    return `${escapeLatex(example.concept)} & ${escapeLatex(example.query)} & ${escapeLatex(example.intent)} & ${scoreText(example.search_score)} & ${scoreText(example.autocomplete_score)} & ${escapeLatex(notes)}\\\\`;
  }).join('\n');

  const topGapRows = evidence.top_autocomplete_gaps.slice(0, 18).map((gap) => (
    `${escapeLatex(gap.concept)} & ${escapeLatex(gap.query)} & ${scoreText(gap.search_score)} & ${scoreText(gap.autocomplete_score)} & ${escapeLatex(shortNote(gap.autocomplete_note, 150))}\\\\`
  )).join('\n');

  const conceptExplanationRows = evidence.concepts.map((concept) => (
    `${escapeLatex(concept.concept)} & ${escapeLatex(concept.executive_explanation)} & ${escapeLatex(concept.why_it_matters)}\\\\`
  )).join('\n');

  const competitorRows = reportableCompetitors(evidence).map((competitor) => (
    `${escapeLatex(competitor.name)} & ${escapeLatex(competitor.classification)} & ${competitor.query_count} & ${competitor.usable_run_count} & ${competitor.sponsored_label_run_count} & ${escapeLatex(competitorSummaryText(competitor))}\\\\`
  )).join('\n');

  const competitorDetailRows = reportableCompetitors(evidence).flatMap((competitor) => (
    competitor.runs.map((run) => (
      `${escapeLatex(competitor.name)} & ${escapeLatex(run.query)} & ${escapeLatex(competitorAccessText(run))} & ${run.product_link_count} & ${run.sponsored_label_visible ? 'yes' : 'no'} & ${escapeLatex(competitorRunText(run))}\\\\`
    ))
  )).join('\n');

  const halfMoon = competitorBenchmarkSites(evidence).find((site) => site.name === 'Half-Moon Outfitters') || {};
  const mast = competitorBenchmarkSites(evidence).find((site) => site.name === 'Mast General Store') || {};
  const siteConceptRows = evidence.concepts.map((concept) => {
    const half = conceptSummaryFor(halfMoon, concept.concept);
    const mastSummary = conceptSummaryFor(mast, concept.concept);
    return `${escapeLatex(concept.concept)} & ${scoreText(concept.search_average)} & ${scoreText(concept.autocomplete_average)} & ${pctText(concept.uniform_experience_rate)} & ${scoreText(half.search_average)} & ${scoreText(half.autocomplete_average)} & ${scoreText(mastSummary.search_average)} & ${scoreText(mastSummary.autocomplete_average)}\\\\`;
  }).join('\n');

  const competitorSiteRows = competitorBenchmarkSites(evidence).map((site) => (
    `${escapeLatex(site.name)} & ${site.query_count} & ${site.usable_search_count} & ${scoreText(site.search_average)} & ${site.autocomplete_available_count} & ${scoreText(site.autocomplete_average)}\\\\`
  )).join('\n');

  const competitorFullRows = competitorBenchmarkSites(evidence).flatMap((site) => (
    (site.runs || []).map((run) => {
      const note = `${shortNote(run.search_note, 95)} / ${shortNote(run.autocomplete_note, 85)}`;
      return `${escapeLatex(site.name)} & ${escapeLatex(run.concept)} & ${escapeLatex(run.query)} & ${scoreText(run.search_score)} & ${scoreText(run.autocomplete_score)} & ${run.search?.product_link_count ?? 0} & ${escapeLatex(note)}\\\\`;
    })
  )).join('\n');

  const blockedCompetitorNote = blockedCompetitorCount(evidence) > 0
    ? '\\ReportFine{A national benchmark capture attempt is retained in the structured evidence artifact but excluded from this comparison because it did not produce usable public search evidence.}\\par'
    : '';

  return String.raw`\documentclass[10pt]{article}

\newcommand{\NorthvalleyAssetPath}{northvalley-template-assets}
\input{northvalley-template-assets/northvalley-brand.sty}
\usepackage[letterpaper,margin=0.62in,top=0.62in,bottom=0.72in]{geometry}
\usepackage{booktabs}
\usepackage{longtable}
\usepackage[hidelinks]{hyperref}

\renewcommand{\familydefault}{\sfdefault}
\pagestyle{empty}
\setlength{\parindent}{0pt}
\setlength{\parskip}{4pt}
\hyphenpenalty=10000
\exhyphenpenalty=10000
\emergencystretch=0.14in

\newcommand{\ReportTitle}{High Country Outfitters Online Customer Experience Opportunity}
\newcommand{\ReportClient}{High Country Outfitters Leadership Team}
\newcommand{\ReportDate}{July 5, 2026}
\newcommand{\ReportSummary}{Executive conversation starter on making it easier for customers to find and buy products online, supported by public observations and reference evidence.}
\newcommand{\ReportPreparedBy}{Northvalley Intelligence LLC}

\definecolor{NVIRed}{HTML}{B42318}
\definecolor{NVIRedSoft}{HTML}{FDE7E7}
\definecolor{NVIGreenSoft}{HTML}{E2F1ED}
\definecolor{NVIAmberSoft}{HTML}{FFF4D8}

\newcommand{\Good}[1]{\textcolor{NVIAccentDark}{\textbf{#1}}}
\newcommand{\Warn}[1]{\textcolor{NVIWarning}{\textbf{#1}}}
\newcommand{\Code}[1]{\texttt{\fontsize{8.0}{9.0}\selectfont #1}}
\newcommand{\ReportKicker}[1]{{\fontsize{7.7}{9}\selectfont\bfseries\color{NVIAccent}\MakeUppercase{#1}}}
\newcommand{\ReportBody}[1]{{\fontsize{9.35}{11.45}\selectfont\color{NVIInk}#1}}
\newcommand{\ReportFine}[1]{{\fontsize{7.45}{8.9}\selectfont\color{NVIMuted}#1}}
\newcommand{\CustomerEffortVisual}{%
  \resizebox{\linewidth}{!}{%
  \begin{tikzpicture}[x=1in,y=1in]
    \path[use as bounding box] (0,0) rectangle (8.55,3.45);
    \draw[draw=NVIRule,fill=NVIPanel,rounded corners=2pt] (0,0) rectangle (8.55,3.45);
    \node[anchor=west,font=\fontsize{7.9}{9.4}\selectfont\bfseries,text=NVIAccent] at (0.22,3.20) {CUSTOMER EFFORT REDUCTION MODEL};
    \node[anchor=east,font=\fontsize{7.1}{8.4}\selectfont,text=NVIMuted] at (8.31,3.20) {Where the first 90 days should focus};

    \node[anchor=west,font=\fontsize{7.1}{8.4}\selectfont\bfseries,text=NVIMuted] at (0.30,2.68) {Customer works harder};
    \node[draw=NVIRule,fill=white,rounded corners=2pt,text width=1.28in,minimum height=0.52in,align=center,font=\fontsize{7.0}{8.2}\selectfont\bfseries,text=NVIInk] (needA) at (1.35,2.22) {Need or wording};
    \node[draw=NVIRule,fill=white,rounded corners=2pt,text width=1.28in,minimum height=0.52in,align=center,font=\fontsize{7.0}{8.2}\selectfont\bfseries,text=NVIInk] (guideA) at (3.15,2.22) {Limited early guidance};
    \node[draw=NVIWarning,fill=NVIAmberSoft,rounded corners=2pt,text width=1.28in,minimum height=0.52in,align=center,font=\fontsize{7.0}{8.2}\selectfont\bfseries,text=NVIInk] (refineA) at (4.95,2.22) {Extra refinements};
    \node[draw=NVIRule,fill=white,rounded corners=2pt,text width=1.28in,minimum height=0.52in,align=center,font=\fontsize{7.0}{8.2}\selectfont\bfseries,text=NVIInk] (pathA) at (6.75,2.22) {Product path};
    \draw[->,line width=0.8pt,color=NVIMuted] (needA.east) -- (guideA.west);
    \draw[->,line width=0.8pt,color=NVIMuted] (guideA.east) -- (refineA.west);
    \draw[->,line width=0.8pt,color=NVIMuted] (refineA.east) -- (pathA.west);

    \node[anchor=west,font=\fontsize{7.1}{8.4}\selectfont\bfseries,text=NVIAccent] at (0.30,1.50) {First 90 days: reduce early effort};
    \node[draw=NVIRule,fill=white,rounded corners=2pt,text width=1.28in,minimum height=0.54in,align=center,font=\fontsize{7.0}{8.2}\selectfont\bfseries,text=NVIInk] (needB) at (1.35,1.02) {Need or wording};
    \node[draw=NVIAccent,fill=NVIGreenSoft,rounded corners=2pt,text width=1.44in,minimum height=0.54in,align=center,font=\fontsize{7.0}{8.2}\selectfont\bfseries,text=NVIAccentDark] (guideB) at (3.25,1.02) {Earlier guidance};
    \node[draw=NVIRule,fill=white,rounded corners=2pt,text width=1.28in,minimum height=0.54in,align=center,font=\fontsize{7.0}{8.2}\selectfont\bfseries,text=NVIInk] (pathB) at (5.25,1.02) {Relevant path};
    \node[draw=NVIRule,fill=white,rounded corners=2pt,text width=1.28in,minimum height=0.54in,align=center,font=\fontsize{7.0}{8.2}\selectfont\bfseries,text=NVIInk] (buyB) at (7.15,1.02) {Confidence to buy};
    \draw[->,line width=0.9pt,color=NVIAccentDark] (needB.east) -- (guideB.west);
    \draw[->,line width=0.9pt,color=NVIAccentDark] (guideB.east) -- (pathB.west);
    \draw[->,line width=0.9pt,color=NVIAccentDark] (pathB.east) -- (buyB.west);

    \draw[->,line width=0.95pt,color=NVIAccent] (guideA.south) -- (guideB.north);
    \node[draw=NVIAccent,fill=white,rounded corners=2pt,text width=2.42in,align=center,font=\fontsize{7.0}{8.4}\selectfont\bfseries,text=NVIAccentDark] at (3.25,0.32) {Suggestions, category paths, customer wording, and bilingual needs};
    \node[anchor=west,font=\fontsize{7.0}{8.4}\selectfont,text=NVIMuted] at (5.00,0.32) {Measure: product-page reach, add-to-cart, conversion, and order value.};
  \end{tikzpicture}%
  }%
}
\newcommand{\ExecutiveDecisionStrip}{%
  \resizebox{\linewidth}{!}{%
  \begin{tikzpicture}[x=1in,y=1in]
    \path[use as bounding box] (0,0) rectangle (8.55,0.95);
    \draw[draw=NVIAccentDark,fill=NVIAccentDark,rounded corners=2pt] (0,0) rectangle (8.55,0.95);
    \node[anchor=west,font=\fontsize{7.6}{9.0}\selectfont\bfseries,text=NVIAccentSoft] at (0.25,0.72) {EXECUTIVE DECISION FOCUS};
    \node[draw=NVIAccent,fill=white,rounded corners=2pt,text width=1.55in,minimum height=0.36in,align=center,font=\fontsize{7.0}{8.2}\selectfont\bfseries,text=NVIAccentDark] at (2.05,0.33) {Priority journeys};
    \node[draw=NVIAccent,fill=white,rounded corners=2pt,text width=1.55in,minimum height=0.36in,align=center,font=\fontsize{7.0}{8.2}\selectfont\bfseries,text=NVIAccentDark] at (4.30,0.33) {Early guidance pilots};
    \node[draw=NVIAccent,fill=white,rounded corners=2pt,text width=1.55in,minimum height=0.36in,align=center,font=\fontsize{7.0}{8.2}\selectfont\bfseries,text=NVIAccentDark] at (6.55,0.33) {Impact measurement};
  \end{tikzpicture}%
  }%
}

\newcommand{\ReportPageHeader}[1]{%
  \begin{tikzpicture}[remember picture,overlay]
    \fill[NVIAccentDark] (current page.north west) rectangle ([yshift=-0.46in]current page.north east);
    \fill[NVIAccent] ([yshift=-0.46in]current page.north west) rectangle ([yshift=-0.49in]current page.north east);
    \node[anchor=west,text=white,font=\fontsize{8.4}{9.8}\selectfont\bfseries]
      at ([xshift=0.62in,yshift=-0.23in]current page.north west) {#1};
    \node[anchor=east,text=white,font=\fontsize{7.4}{8.6}\selectfont]
      at ([xshift=-0.62in,yshift=-0.23in]current page.north east) {\ReportClient};
  \end{tikzpicture}
  \vspace*{0.22in}
}
\newcommand{\ReportFooter}{%
  \begin{tikzpicture}[remember picture,overlay]
    \fill[NVIAccentDark] (current page.south west) rectangle ([yshift=0.34in]current page.south east);
    \node[anchor=west,text=white,font=\fontsize{7.2}{8.4}\selectfont]
      at ([xshift=0.62in,yshift=0.17in]current page.south west) {\NorthvalleyContactLine};
    \node[anchor=east,text=white,font=\fontsize{7.2}{8.4}\selectfont]
      at ([xshift=-0.62in,yshift=0.17in]current page.south east) {\thepage};
  \end{tikzpicture}
}
\newcommand{\ReportSection}[1]{%
  \vspace{0.10in}
  {\fontsize{15}{18}\selectfont\bfseries\color{NVIInk}#1}\\[-0.02in]
  {\color{NVIAccent}\rule{\linewidth}{0.8pt}}
  \vspace{0.07in}
}
\newcommand{\ReportCard}[2]{%
  \begin{tikzpicture}
    \node[draw=NVIRule,fill=white,rounded corners=2pt,inner xsep=11pt,inner ysep=9pt,text width=\dimexpr\linewidth-24pt\relax,align=left]
      {\ReportKicker{#1}\\[0.05in]\ReportBody{#2}};
  \end{tikzpicture}
}
\newcommand{\ReportDarkCard}[2]{%
  \begin{tikzpicture}
    \node[draw=NVIAccentDark,fill=NVIAccentDark,rounded corners=2pt,inner xsep=12pt,inner ysep=10pt,text width=\dimexpr\linewidth-26pt\relax,align=left]
      {{\fontsize{7.7}{9}\selectfont\bfseries\color{NVIAccentSoft}\MakeUppercase{#1}}\\[0.06in]{\fontsize{10.2}{12.4}\selectfont\color{white}#2}};
  \end{tikzpicture}
}
\newcommand{\MetricCard}[3]{%
  \begin{tikzpicture}
    \node[draw=NVIRule,fill=NVIPanel,rounded corners=2pt,inner xsep=9pt,inner ysep=8pt,text width=\dimexpr\linewidth-20pt\relax,minimum height=0.88in,align=left]
      {\ReportKicker{#1}\\[0.04in]{\fontsize{18}{21}\selectfont\bfseries\color{NVIAccentDark}#2}\\[0.02in]\ReportFine{#3}};
  \end{tikzpicture}
}

\begin{document}
\color{NVIInk}
\hypersetup{pageanchor=false}

\begin{titlepage}
\thispagestyle{empty}
\begin{tikzpicture}[remember picture,overlay]
  \fill[NVIPanel] (current page.north west) rectangle (current page.south east);
  \fill[NVIAccentDark] (current page.north west) rectangle ([yshift=-1.05in]current page.north east);
  \fill[NVIAccent] ([yshift=-1.05in]current page.north west) rectangle ([yshift=-1.10in]current page.north east);
  \fill[NVIAccentDark] (current page.south west) rectangle ([yshift=0.45in]current page.south east);
  \node[anchor=west,text=white,font=\fontsize{9.3}{11}\selectfont\bfseries]
    at ([xshift=0.62in,yshift=-0.52in]current page.north west) {\NorthvalleyBusinessName};
  \node[anchor=east,text=white,font=\fontsize{7.6}{9}\selectfont]
    at ([xshift=-0.62in,yshift=-0.52in]current page.north east) {\ReportDate};
  \node[anchor=west,text=white,font=\fontsize{7.2}{8.4}\selectfont]
    at ([xshift=0.62in,yshift=0.22in]current page.south west) {\NorthvalleyContactLine};
\end{tikzpicture}

\vspace*{1.08in}
\begin{minipage}[t]{0.60\linewidth}
\raggedright
\ReportKicker{Customer Experience Review}\\[0.12in]
{\fontsize{31}{36}\selectfont\bfseries\color{NVIInk}\ReportTitle}\par
\vspace{0.20in}
{\fontsize{12.1}{14.6}\selectfont\color{NVIInk}\ReportSummary}\par
\vspace{0.30in}
{\color{NVIAccent}\rule{2.6in}{0.9pt}}\par
\vspace{0.18in}
{\fontsize{9.2}{11}\selectfont\color{NVIMuted}Prepared for}\\[-0.01in]
{\fontsize{15}{18}\selectfont\bfseries\color{NVIAccentDark}\ReportClient}\par
\vspace{0.08in}
{\fontsize{9}{10.8}\selectfont\color{NVIMuted}Prepared by \ReportPreparedBy}
\end{minipage}
\hfill
\begin{minipage}[t]{0.31\linewidth}
\centering
\vspace{0.10in}
\NorthvalleyLogo[0.88in]\par
\vspace{0.22in}
\ReportDarkCard{Primary Readout}{High Country already has a strong online shopping foundation. The opportunity is helping customers reach the right products faster and with less effort.}
\vspace{0.11in}
\MetricCard{Evidence Base}{Public}{Detailed experiments, methodology, and peer references remain in the appendix.}
\end{minipage}
\end{titlepage}
\hypersetup{pageanchor=true}
\setcounter{page}{1}

\ReportPageHeader{Executive Readout}
\ReportFooter
\ReportSection{Executive Readout}
\begin{minipage}[t]{0.62\linewidth}
\ReportDarkCard{Customer Buying Experience Opportunity}{High Country Outfitters already provides a strong regional outdoor retail ecommerce experience. Customers can generally find products, see useful store and inventory cues, enter the cart flow, and reach support information. The opportunity is to reduce customer effort before shoppers reach the products they intend to buy.}
\vspace{0.12in}
\ReportBody{We periodically review regional retailers to identify practical opportunities for improving the online customer experience. \textbf{High Country was selected because it already has a strong ecommerce foundation}. Mature retailers often benefit most from targeted improvements that make shopping faster, easier, and more confidence-building for customers.}\par
\vspace{0.08in}
\ReportKicker{Why This Matters}\\[0.03in]
\ReportBody{${escapeLatex(competitorWinLoss.latex)}}\par
\vspace{0.05in}
{\fontsize{7.0}{8.3}\selectfont
\setlength{\tabcolsep}{2.2pt}
\begin{tabularx}{\linewidth}{@{}L{0.26\linewidth}N@{}}
\toprule
\textbf{Executive question} & \textbf{Customer-experience answer}\\
\midrule
Why High Country? & Customers already encounter a mature online shopping experience, which makes targeted improvements more valuable than a broad redesign.\\
What can improve? & Customers can receive clearer early guidance when they begin with a need, activity, brand, gift idea, or mixed-language wording.\\
How should value be measured? & Internal shopping behavior, product-page reach, add-to-cart rate, conversion rate, and average order value can quantify the opportunity.\\
\bottomrule
\end{tabularx}
}
\vspace{0.07in}
\begin{itemize}
\item \Good{Customers already have a strong shopping foundation.} We observed broad catalog paths, product-recovery paths, location-inventory signals, and support cues.
\item \Warn{Customers can receive clearer guidance earlier.} Some shoppers may need to work harder than necessary before reaching the product they intend to buy.
\item \Warn{Customers using different wording or language should still feel confident.} The buying journey should support activity, need, brand, gift, and mixed-language phrasing.
\item \Good{Peer examples should guide the work, not become the headline.} Comparable regional retailers help identify options, while the recommendation remains centered on High Country's customers.
\end{itemize}
\end{minipage}
\hfill
\begin{minipage}[t]{0.31\linewidth}
\MetricCard{Shopping Foundation}{Strong}{Customers already have useful product-finding paths to build on.}
\vspace{0.09in}
\MetricCard{Customer Effort}{Reduce}{The clearest opportunity is making early product finding easier.}
\vspace{0.09in}
\MetricCard{Business Value}{Measure}{Use customer journey data, add-to-cart rate, conversion, and order value to estimate impact.}
\end{minipage}

\newpage
\ReportPageHeader{Executive Opportunity}
\ReportFooter
\ReportSection{Recommended Growth Path}
\ReportCard{Short Version}{High Country already gives customers a solid online shopping experience. The next growth opportunity is reducing effort early in product finding: a customer looking for a rain shell, sun hoodie, trail running shirt, camp chair, HOKA shoe, or Spanish-language equivalent should reach relevant products quickly, confidently, and with as few extra steps as possible.}
\vspace{0.10in}
\CustomerEffortVisual
\vspace{0.08in}
\begin{minipage}[t]{0.43\linewidth}
\ReportSection{Business Value Lens}
{\fontsize{7.85}{9.35}\selectfont
\setlength{\tabcolsep}{3.4pt}
\begin{tabularx}{\linewidth}{@{}L{0.36\linewidth}N@{}}
\toprule
\textbf{Customer outcome} & Less effort reaching relevant products.\\
\textbf{Business signal} & Product-page reach, add-to-cart, conversion, and order value.\\
\textbf{Decision use} & Prioritize fixes with High Country analytics; no public dollar claim.\\
\bottomrule
\end{tabularx}
}
\end{minipage}
\hfill
\begin{minipage}[t]{0.51\linewidth}
\ReportSection{90-Day Opportunity Roadmap}
{\fontsize{7.65}{9.15}\selectfont
\setlength{\tabcolsep}{3.3pt}
\begin{tabularx}{\linewidth}{@{}L{0.31\linewidth}L{0.31\linewidth}L{0.31\linewidth}@{}}
\toprule
\textbf{0-30 days} & \textbf{31-60 days} & \textbf{61-90 days}\\
\midrule
Map customer language across brand, activity, feature, typo, gift, and bilingual needs. &
Pilot earlier guidance for priority journeys: rain gear, sun protection, trail running, camp, and gifts. &
Connect journey analytics to product-page reach, add-to-cart, conversion, and order value.\\
\bottomrule
\end{tabularx}
}
\end{minipage}
\vspace{0.14in}
\ExecutiveDecisionStrip

\newpage
\ReportPageHeader{Reference: Concepts}
\ReportFooter
\ReportSection{Reference A: Executive-Level IR Concepts}
\ReportBody{This section intentionally avoids academic labels in the main narrative. These are seven discovery concepts a leadership team can understand and act on.}\par
\vspace{0.08in}
{\fontsize{7.65}{9.0}\selectfont
\begin{longtable}{@{}L{0.20\linewidth}L{0.37\linewidth}L{0.34\linewidth}@{}}
\toprule
\textbf{Concept} & \textbf{Executive explanation} & \textbf{Why it matters}\\
\midrule
\endhead
${conceptExplanationRows}
\bottomrule
\end{longtable}
}

\newpage
\ReportPageHeader{Reference: Results}
\ReportFooter
\ReportSection{Reference B: Concept Results Summary}
{\fontsize{7.7}{9.0}\selectfont
\begin{tabularx}{\linewidth}{@{}L{0.24\linewidth}R{0.13\linewidth}R{0.16\linewidth}R{0.15\linewidth}N@{}}
\toprule
\textbf{Concept} & \textbf{Search avg} & \textbf{Auto avg} & \textbf{Uniform} & \textbf{Representative gaps}\\
\midrule
${conceptRows}
\bottomrule
\end{tabularx}
}
\vspace{0.14in}
\ReportSection{Reference C: Highest-Priority Autocomplete Gaps}
{\fontsize{7.6}{8.9}\selectfont
\begin{longtable}{@{}L{0.21\linewidth}L{0.20\linewidth}R{0.11\linewidth}R{0.11\linewidth}L{0.29\linewidth}@{}}
\toprule
\textbf{Concept} & \textbf{Query} & \textbf{Search} & \textbf{Auto} & \textbf{Autocomplete evidence}\\
\midrule
\endhead
${topGapRows}
\bottomrule
\end{longtable}
}

\newpage
\ReportPageHeader{Reference: Experiment Data}
\ReportFooter
\ReportSection{Reference D: Full Query Dataset}
\ReportBody{The following table contains all 175 public search/autocomplete experiments. Percentages are experiment readouts, not an overall public-facing grade. They are included here so the recommendations can be traced back to concrete shopper-language tests.}\par
\vspace{0.06in}
{\fontsize{6.45}{7.55}\selectfont
\setlength{\tabcolsep}{1.7pt}
\begin{longtable}{@{}L{0.16\linewidth}L{0.16\linewidth}L{0.17\linewidth}R{0.08\linewidth}R{0.08\linewidth}L{0.27\linewidth}@{}}
\toprule
\textbf{Concept} & \textbf{Query} & \textbf{Intent} & \textbf{Search} & \textbf{Auto} & \textbf{Evidence note}\\
\midrule
\endhead
${referenceRows}
\bottomrule
\end{longtable}
}

\newpage
\ReportPageHeader{Reference: Competitors}
\ReportFooter
\ReportSection{Reference E: Same-Query Competitor Benchmark}
\ReportBody{The same 175 protected shopper-language examples were run against the usable competitor sites. This lets the framework compare performance by query type instead of relying on a small competitor sample. High Country includes rendered search and autocomplete. Competitors include rendered search and public suggest autocomplete only where a public endpoint returned usable JSON.}\par
\vspace{0.06in}
{\fontsize{6.5}{7.7}\selectfont
\setlength{\tabcolsep}{1.55pt}
\begin{longtable}{@{}L{0.17\linewidth}R{0.09\linewidth}R{0.09\linewidth}R{0.09\linewidth}R{0.10\linewidth}R{0.10\linewidth}R{0.10\linewidth}R{0.10\linewidth}@{}}
\toprule
\textbf{Query type} & \textbf{HCO search} & \textbf{HCO auto} & \textbf{HCO uniform} & \textbf{Half-Moon search} & \textbf{Half-Moon auto} & \textbf{Mast search} & \textbf{Mast auto}\\
\midrule
\endhead
${siteConceptRows}
\bottomrule
\end{longtable}
}
\vspace{0.08in}
{\fontsize{7.1}{8.4}\selectfont
\begin{tabularx}{\linewidth}{@{}L{0.25\linewidth}R{0.10\linewidth}R{0.12\linewidth}R{0.12\linewidth}R{0.14\linewidth}N@{}}
\toprule
\textbf{Site} & \textbf{Queries} & \textbf{Search usable} & \textbf{Search avg} & \textbf{Auto comparable} & \textbf{Auto avg}\\
\midrule
${competitorSiteRows}
\bottomrule
\end{tabularx}
}
\vspace{0.08in}
\ReportFine{Competitor autocomplete is marked unverified when the public suggest endpoint is unavailable, blocked, or not JSON. That is a data-capture and public-access limit, not a conclusion that the competitor has no autocomplete UI.}

\newpage
\ReportPageHeader{Reference: Competitor Dataset}
\ReportFooter
\ReportSection{Reference F: Full Competitor Same-Query Dataset}
\ReportBody{These rows preserve the same-query competitor rerun. The search score is a bounded public-evidence proxy from rendered access, product-like links, query-term matches, and page text. It is not a calibrated relevance judgment or a paid/organic ranking claim.}\par
\vspace{0.06in}
{\fontsize{5.9}{7.0}\selectfont
\setlength{\tabcolsep}{1.35pt}
\begin{longtable}{@{}L{0.13\linewidth}L{0.15\linewidth}L{0.15\linewidth}R{0.08\linewidth}R{0.08\linewidth}R{0.07\linewidth}L{0.26\linewidth}@{}}
\toprule
\textbf{Site} & \textbf{Query type} & \textbf{Query} & \textbf{Search} & \textbf{Auto} & \textbf{Links} & \textbf{Evidence note}\\
\midrule
\endhead
${competitorFullRows}
\bottomrule
\end{longtable}
}

\newpage
\ReportPageHeader{Reference: Organic/Paid Checks}
\ReportFooter
\ReportSection{Reference G: Competitor Organic And Paid-Placement Checks}
\ReportBody{These checks are bounded public browser observations across shared outdoor-retail queries. They are included to support the opportunity story, not to claim market share or ad spend. Unusable public captures are retained in the structured evidence artifact and excluded from this table.}\par
\vspace{0.06in}
${blockedCompetitorNote}
\vspace{0.06in}
{\fontsize{7.65}{9.0}\selectfont
\begin{tabularx}{\linewidth}{@{}L{0.17\linewidth}L{0.25\linewidth}R{0.09\linewidth}R{0.10\linewidth}R{0.11\linewidth}N@{}}
\toprule
\textbf{Competitor} & \textbf{Benchmark role} & \textbf{Queries} & \textbf{Usable} & \textbf{Paid-placement labels} & \textbf{Interpretation}\\
\midrule
${competitorRows}
\bottomrule
\end{tabularx}
}
\vspace{0.12in}
\ReportCard{Organic And Paid-Placement Readout}{The experiment records visible paid-placement labels when rendered page text exposes them. If no label is visible, that is not proof of no retail media; it only means this public sample did not expose a paid-placement label. The business point remains useful: owned search, browse, and autocomplete improvements reduce dependency on expensive paid recovery.}
\vspace{0.10in}
{\fontsize{6.55}{7.7}\selectfont
\setlength{\tabcolsep}{1.7pt}
\begin{longtable}{@{}L{0.15\linewidth}L{0.15\linewidth}R{0.08\linewidth}R{0.10\linewidth}R{0.10\linewidth}L{0.34\linewidth}@{}}
\toprule
\textbf{Competitor} & \textbf{Query} & \textbf{Access} & \textbf{Links} & \textbf{Paid label} & \textbf{Interpretation}\\
\midrule
\endhead
${competitorDetailRows}
\bottomrule
\end{longtable}
}

\newpage
\ReportPageHeader{Reference: Prior Evidence}
\ReportFooter
\ReportSection{Reference H: Prior Ecommerce And Local-Site Evidence}
\ReportBody{The earlier ecommerce evidence still matters, but it belongs in reference, not in the opening pitch. Prior public evidence found broad browse coverage, location-inventory filters, useful rendered search results for the original protected query set, a public cart add/read path, mobile homepage cues, policy/support pages, and a camp autocomplete API response matching the visible dropdown observed by the user.}\par
\vspace{0.12in}
\begin{tabularx}{\linewidth}{@{}L{0.26\linewidth}N@{}}
\toprule
\textbf{Evidence area} & \textbf{How it should be used}\\
\midrule
Browse and filters & Use as a strength. High Country has meaningful category depth and useful location-inventory filtering.\\
Original search rerun & Use as proof that earlier empty-result claims were capture problems, not site failures. Camp chair and camp chairs returned rendered results.\\
Camp autocomplete & Use as proof that the underlying suggest API is accessible and can match the visible dropdown.\\
Local website assessment & Use only as supporting context for crawlability, local visibility, lead-path visibility, trust/message signals, and evidence limits.\\
Excluded local-assessment content & Do not use Pest Control demand fit or Pest Control competitor comparison as outdoor retail evidence.\\
Competitor benchmark attempts & Prior automated fetch attempts were blocked or low-signal; this revision adds a separate rendered competitor lane and keeps all competitor claims bounded to visible evidence.\\
\bottomrule
\end{tabularx}
\vspace{0.14in}
\ReportSection{Evidence Limits}
\begin{itemize}
\item This is public evidence only: no analytics, revenue data, customer records, admin data, search logs, or checkout completion.
\item The sales upside range is directional. It should be replaced with a dollar estimate after connecting site-search usage, conversion rate, add-to-cart rate, average order value, and revenue.
\item Spanish/bilingual discovery is evaluated as a search-access issue, not as a demographic claim about current customers.
\item Autocomplete was measured through the public Shopify suggest API and browser-context checks. Full visual dropdown QA across desktop/mobile should be run before final external claims.
\item Competitor paid-placement checks record visible labels only. Absence of a visible label in this sample does not prove a competitor has no paid placement, retail media, or advertising program.
\item Product counts, result counts, inventory, and promotions are point-in-time public observations from July 2026.
\end{itemize}
\vspace{0.10in}
\ReportCard{Recommended Follow-Up}{The next conversation should connect these public findings to actual search usage, conversion rate, add-to-cart rate, average order value, and inventory priorities. That would turn the directional opportunity into a measurable discovery roadmap.}

\end{document}
`;
}

function writeReports(evidence) {
  const reportEvidence = normalizeEvidenceForReports(evidence);
  writeJson(evidencePath, reportEvidence);
  writeJson(reportJsonPath, buildReportJson(reportEvidence));
  writeText(reportMdPath, buildMarkdown(reportEvidence));
  writeText(reportTexPath, buildLatex(reportEvidence));
}

async function main() {
  let evidence;
  if (process.env.HCO_REFRESH_COMPETITOR_QUERY_BENCHMARK === '1') {
    evidence = readJson(evidencePath);
    const browser = await chromium.launch({ headless: true });
    const refreshedBenchmark = await collectCompetitorQueryBenchmark(browser, evidence.examples || flattenTests());
    evidence.competitor_query_benchmark = requestedCompetitorNames().length
      ? mergeCompetitorQueryBenchmark(evidence.competitor_query_benchmark, refreshedBenchmark)
      : refreshedBenchmark;
    evidence.generated_at = new Date().toISOString();
    await browser.close();
  } else if (process.env.HCO_OWNER_REBUILD_FROM_EVIDENCE === '1') {
    evidence = readJson(evidencePath);
  } else {
    const collected = await collectEvidence();
    evidence = buildEvidence(collected.examples, collected.competitor_evidence, collected.competitor_query_benchmark);
  }
  writeReports(evidence);
  console.log(JSON.stringify({
    evidencePath: path.relative(ROOT, evidencePath),
    reportJsonPath: path.relative(ROOT, reportJsonPath),
    reportMdPath: path.relative(ROOT, reportMdPath),
    reportTexPath: path.relative(ROOT, reportTexPath),
    examples: evidence.summary.total_examples,
    searchAverage: evidence.summary.search_average,
    autocompleteAverage: evidence.summary.autocomplete_average,
    uniformRate: evidence.summary.uniform_experience_rate
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
