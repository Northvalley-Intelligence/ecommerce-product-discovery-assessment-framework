import { readFileSync, writeFileSync } from 'node:fs';
// Generate a ~250-term Cat Footwear query pack across 5 datasets. Literals are derived from REAL
// product names captured earlier (guarantees they are real Cat models, not guesses).

const synonym = [
  'work boots', 'safety boots', 'work shoes', 'safety shoes', 'safety footwear', 'safety toe boots',
  'sneakers', 'trainers', 'athletic shoes', 'tennis shoes', 'running shoes',
  'boots', 'booties', 'ankle boots',
  'moccasins', 'slip ons', 'loafers', 'slides', 'mules', 'clogs',
  'shoes', 'footwear', 'sandals', 'flip flops', 'oxfords', 'dress shoes',
  'hiking boots', 'hikers', 'trail shoes', 'chelsea boots', 'pull on boots', 'lace up boots',
  'slip on shoes', 'casual shoes', 'casual sneakers', 'wellington boots', 'rubber boots',
  'rain boots', 'winter boots', 'snow boots', 'boat shoes', 'deck shoes', 'high tops', 'low tops', 'kids shoes',
];
const attribute = [
  'steel toe boots', 'composite toe boots', 'soft toe boots', 'alloy toe boots', 'safety toe boots',
  'waterproof boots', 'waterproof work boots', 'waterproof hiking boots', 'waterproof leather boots',
  'insulated boots', 'insulated work boots', 'thinsulate boots',
  'slip resistant shoes', 'slip resistant boots', 'non slip work shoes', 'non slip shoes',
  'oil resistant boots', 'electrical hazard boots', 'met guard boots', 'metatarsal boots', 'puncture resistant boots',
  'leather boots', 'leather work boots', 'full grain leather boots', 'suede boots', 'suede shoes', 'nubuck boots',
  'canvas shoes', 'mesh work shoes',
  'brown work boots', 'black work boots', 'tan work boots', 'brown boots', 'black boots', 'tan boots', 'gray shoes',
  '6 inch work boots', '8 inch work boots', '6 inch boots', 'high top boots', 'low top shoes', 'mid boots',
  'lightweight work boots', 'comfortable work boots', 'wide work boots', 'wide width boots', 'extra wide boots',
  'memory foam work boots', 'cushioned work boots',
  'pull on work boots', 'lace up work boots', 'side zip boots', 'wedge sole boots', 'moc toe boots',
  'waterproof slip on shoes', 'insulated waterproof boots', 'steel toe waterproof boots', 'composite toe waterproof boots',
  'breathable work shoes', 'vented work boots', 'slip resistant work shoes', 'waterproof composite toe boots',
  'steel toe sneakers', 'steel toe work shoes', 'lightweight steel toe boots', 'comfortable steel toe boots',
  'waterproof steel toe boots', 'insulated hunting boots', 'rubber work boots', 'chelsea work boots',
];
const job_function = [
  'boots for standing all day', 'work boots for concrete', 'shoes for warehouse work', 'boots for construction',
  'boots for cold weather', 'shoes for being on your feet all day', 'boots for roofing', 'boots for welding',
  'boots for electricians', 'boots for landscaping', 'boots for farm work', 'boots for logging', 'boots for oil field work',
  'shoes for restaurant work', 'shoes for nurses', 'boots for hunting', 'boots for snow', 'boots for rain',
  'work boots for men', 'work boots for women', 'boots for wide feet', 'boots for flat feet', 'boots for plantar fasciitis',
  'comfortable boots for walking', 'boots for factory work', 'boots for mechanics', 'shoes for kitchen work',
  'slip resistant shoes for servers', 'boots for concrete floors', 'boots for backpacking', 'work shoes for warehouse',
  'boots for masonry', 'boots for framing', 'boots for utility work', 'boots for railroad work',
  'shoes for standing on concrete', 'boots for cold storage', 'boots for wet conditions', 'boots for outdoor work',
  'boots for heavy duty work', 'work shoes for long shifts', 'boots for delivery drivers', 'shoes for retail work',
  'boots for ranch work', 'boots for construction workers', 'boots for cold wet weather', 'work boots for flat feet', 'shoes for standing all day at work', 'boots for hunting in cold', 'boots for wet job sites',
];
const intent = [
  'something waterproof for winter', 'casual shoes for everyday', 'gift for a construction worker', 'most comfortable work boots',
  'shoes to wear with jeans', 'boots that keep your feet dry', 'work boots that dont hurt', 'something for muddy conditions',
  'everyday work shoes', 'comfortable shoes for long shifts', 'warm boots for winter', 'durable work boots', 'affordable work boots',
  'best work boots', 'lightweight boots for summer', 'boots for a new construction job', 'shoes that look good and are comfortable',
  'waterproof boots that are comfortable', 'work boots that last', 'boots for someone on their feet all day',
  'what to wear on a construction site', 'boots for a warehouse job', 'shoes for walking all day at work',
  'something rugged for outdoor work', 'boots for standing on hard floors', 'most durable work boots',
  'comfortable steel toe boots for work', 'waterproof boots for hiking in the rain', 'warm waterproof winter boots',
  'work boots that are easy to slip on', 'boots that are good for your feet', 'breathable boots for hot weather',
  'stylish work boots', 'gift for someone who works construction', 'comfortable boots for concrete floors',
  'work shoes that dont slip', 'boots for cold weather work', 'something for wet job sites', 'shoes for a warehouse worker',
  'good boots for the money', 'comfortable waterproof work boots', 'boots that wont give me blisters', 'good work boots for standing', 'durable waterproof boots', 'warm boots for outdoor work', 'work boots for a warehouse job',
];

// Derive literal/model queries from captured product names.
let literal = ['caterpillar', 'cat boots', 'cat work boots', 'cat footwear', 'cat shoes'];
try {
  const caps = JSON.parse(readFileSync('catfootwear-captures.json', 'utf8'));
  const generic = new Set(['mens', 'womens', 'men', 'women', 'steel', 'waterproof', 'composite', 'insulated', 'leather', 'suede', 'work', 'the', 'kids', 'boys', 'girls']);
  const models = new Set();
  for (const c of caps) for (const it of (c.items || [])) {
    const m = String(it).replace(/^(Men's|Women's|Kids'|Unisex)\s+/i, '').trim();
    const first = (m.split(/\s+/)[0] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (first.length > 3 && !generic.has(first)) models.add(first);
  }
  literal = literal.concat([...models]);
} catch { /* fall back to brand terms only */ }

const dedupe = (arr) => [...new Set(arr.map((s) => s.toLowerCase().trim()))];
const pack = [];
for (const [q] of []) pack.push(q);
const add = (list, ds) => dedupe(list).forEach((q) => pack.push([q, ds]));
add(synonym, 'synonym'); add(attribute, 'attribute'); add(job_function, 'job_function'); add(intent, 'intent'); add(literal, 'literal');
// dedupe across datasets (keep first)
const seen = new Set(); const final = [];
for (const [q, ds] of pack) { if (seen.has(q)) continue; seen.add(q); final.push([q, ds]); }
writeFileSync('catfootwear-terms-250.json', JSON.stringify(final));
const by = {}; final.forEach(([, d]) => by[d] = (by[d] || 0) + 1);
console.log('total:', final.length, '| by dataset:', JSON.stringify(by));
console.log('literals (' + final.filter((t) => t[1] === 'literal').length + '):', final.filter((t) => t[1] === 'literal').map((t) => t[0]).join(', '));
