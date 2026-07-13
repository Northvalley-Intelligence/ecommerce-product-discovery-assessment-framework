# Ecommerce Evaluation Experiment Inventory Handoff

Date: 2026-07-07
Project: Ecommerce Evaluation Reports (`ecommmerce-eval`)
Repository: `/Users/feroshjacob/code/ecommmerce-eval`
Stream: `stream_mra1ejuu_9f305c24`
Plan: `plan_mra3pat3_84a0e672`
Scope: Project-local documentation only. No code/report implementation changes.

## Status

This handoff describes the ecommerce evaluation experiments currently present in the repo once a target ecommerce site is available. It is evidence-backed from local mission/MDE files, framework files, scripts, validators, generated evidence, report outputs, and existing handoffs.

No required external handoff is blocking this description. The repo contains direct `local-website-growth-assessment` dependency references for High Country Outfitters. A standalone `ecommerce-target-intelligence` handoff artifact is not present locally; the only local references are blocker/request handoffs asking that project to provide competitor browse/category evidence. That absence is a gap for future automation, not a blocker for documenting the current workflow.

## Files Inspected

Mission and MDE context:

- `MISSION.md`
- `MISSION_UPDATES.md`
- `.mde/project.json`
- `.mde/state.json`
- `.mde/validation-strategy.json`
- `.mde/failing-bdds.json`
- `.mde/generation-summary.md`
- `.mde/findings.json`
- `.mde/validator-effectiveness.json`
- `.mde/generations/GEN-012.json`
- `.mde/validation-runs/VAL-048.json`

Framework and report structure:

- `package.json`
- `framework/assessment-rubric.json`
- `framework/coverage-matrix.json`
- `docs/framework/rubric.md`
- `docs/templates/executive-report.md`
- `schemas/assessment.schema.json`
- `templates/assessment-template.json`

Evaluator and validator scripts:

- `scripts/evaluate-highcountryoutfitters-ecommerce.mjs`
- `scripts/evaluate-highcountryoutfitters-ir-concepts.mjs`
- `scripts/evaluate-highcountryoutfitters-expanded-ir.mjs`
- `scripts/evaluate-dressup-expanded-ir.mjs`
- `scripts/evaluate-boxercraft-normalization.mjs`
- `scripts/evaluate-boxercraft-browse-node-parity.mjs`
- `scripts/evaluate-competitor-pricing-discovery.mjs`
- `scripts/validate-boxercraft-browser.mjs`
- `scripts/validate-framework.mjs`
- `scripts/validate-highcountryoutfitters-report.mjs`

Evidence and report outputs:

- `assessments/high-country-outfitters/ecommerce-evidence/GEN-010/highcountryoutfitters-ecommerce-evidence.json`
- `assessments/high-country-outfitters/combined-report/GEN-010/highcountryoutfitters-combined-ecommerce-report.json`
- `assessments/high-country-outfitters/combined-report/GEN-010/highcountryoutfitters-combined-ecommerce-report.md`
- `assessments/high-country-outfitters/ir-concept-evidence/GEN-010/highcountryoutfitters-ir-concept-evidence.json`
- `assessments/high-country-outfitters/expanded-ir-evidence/GEN-011/highcountryoutfitters-expanded-ir-evidence.json`
- `assessments/high-country-outfitters/owner-outreach-report/GEN-011/highcountryoutfitters-owner-outreach-report.json`
- `assessments/high-country-outfitters/owner-outreach-report/GEN-011/highcountryoutfitters-owner-outreach-report.md`
- `assessments/dress-up/expanded-ir-evidence/GEN-012/dressup-expanded-ir-evidence.json`
- `assessments/dress-up/owner-outreach-report/GEN-012/dressup-owner-outreach-report.json`
- `assessments/dress-up/owner-outreach-report/GEN-012/dressup-owner-outreach-report.md`
- `assessments/boxercraft/browser-evidence/GEN-003/browser-validation.json`
- `assessments/boxercraft/normalization-evidence/GEN-004/normalization-evaluation.json`
- `assessments/boxercraft/competitor-evidence/GEN-006/competitor-pricing-discovery.json`
- `assessments/boxercraft/competitor-evidence/GEN-006/competitor-pricing-discovery.md`
- `assessments/boxercraft/browse-node-parity/GEN-007/browse-node-parity.json`
- `assessments/boxercraft/browse-node-parity/GEN-007/browse-node-parity.md`
- `assessments/boxercraft/local-school-opportunity/GEN-008/evidence-summary.json`
- `reports/highcountryoutfitters-combined-ecommerce-report.tex`
- `reports/dressup-ecommerce-executive-report.tex`
- `reports/boxercraft-product-discovery-assessment.tex`
- `reports/boxercraft-local-school-pta-opportunity-report.tex`
- `highcountryoutfitters-combined-ecommerce-report.pdf`
- `dressup-ecommerce-executive-report.pdf`
- `boxercraft-product-discovery-assessment.pdf`
- `boxercraft-local-school-pta-opportunity-report.pdf`

Existing handoffs:

- `.mde/handoffs/control-center-highcountryoutfitters-combined-ecommerce-report-2026-07-02.md`
- `.mde/handoffs/control-center-highcountryoutfitters-owner-outreach-report-2026-07-03.md`
- `.mde/handoffs/control-center-highcountryoutfitters-same-query-competitor-refinement-2026-07-04.md`
- `.mde/handoffs/control-center-stream_mr6tdlc3_6413285c-highcountryoutfitters-competitor-browse-blocker-2026-07-04.md`
- `.mde/handoffs/control-center-stream_mr6tdlc3_6413285c-highcountryoutfitters-competitor-confidence-rationale-2026-07-05.md`

## Current MDE Context

- Current state: `.mde/state.json` says the project is in `GEN-012`, "Generation 12 - Dress Up Ecommerce Executive Report."
- Current phase goal: produce a Dress Up customer-experience opportunity report that helps shoppers find and buy boutique apparel, preserves evidence in references, includes same-query peer reference analysis, and avoids competitor-superiority framing.
- Latest validation gate: `VAL-048`, pass, 2/2 clean passes for the Dress Up report refinement.
- Latest report status: `dressup-ecommerce-executive-report.pdf` is the active review artifact.
- Metadata drift: `MISSION.md`, `.mde/project.json`, `.mde/validation-strategy.json`, `.mde/failing-bdds.json`, `.mde/findings.json`, and `.mde/validator-effectiveness.json` still contain some GEN-009 or GEN-011 labels even though `.mde/state.json` and `.mde/generations/GEN-012.json` are current. This does not block this handoff, but it is a governance cleanup gap.

## Dependency Inputs Once A Target Site Exists

The current evaluators assume these inputs before a full ecommerce evaluation can run:

1. Target identity:
   - Target company name, canonical URL, domain, vertical, and target slug for output paths.
   - Current scripts hardcode this per target. Examples: High Country Outfitters (`highcountryoutfitters.com`) and Dress Up (`shopdressup.com`).

2. Ecommerce platform and endpoint assumptions:
   - High Country and Dress Up runs use Shopify-style search URLs and `/search/suggest.json`.
   - Boxercraft parity uses Shopify collection feeds plus Boost Commerce search/suggest endpoints.
   - Non-Shopify sites need an adapter before these experiments can be reused safely.

3. Query and intent set:
   - Current protected-query suites are hand-authored by vertical.
   - High Country GEN-011 uses 175 examples: 25 examples across each of seven concepts.
   - Dress Up GEN-012 uses 70 examples: 10 examples across each of seven concepts.
   - Boxercraft GEN-004 uses 36 normalization and routing queries.

4. Peer or competitor list:
   - High Country GEN-011 hardcodes Public Lands, Half-Moon Outfitters, and Mast General Store, then uses Half-Moon and Mast as usable same-query peers.
   - Dress Up GEN-012 hardcodes Red Dress, Pink Lily, and Impressions.
   - Boxercraft GEN-006 hardcodes L2 Brands, Colosseum Athletics, Concepts Sport, and Fanatics.
   - No generic competitor-discovery-to-evaluator handoff schema exists in this repo yet.

5. Optional local website assessment input:
   - High Country GEN-010 consumes `local-website-growth-assessment` artifacts:
     - `/Users/feroshjacob/code/local-website-growth-assessment/.mde/handoffs/highcountryoutfitters-local-website-assessment-2026-07-01.md`
     - `/Users/feroshjacob/code/local-website-growth-assessment/.mde/assessment-artifacts/highcountryoutfitters-local-website-assessment-2026-07-01-summary.json`
     - `/Users/feroshjacob/code/local-website-growth-assessment/.mde/assessment-artifacts/highcountryoutfitters-local-website-assessment-2026-07-01.json`
   - The upstream input is used only as partial public-site context, not as ecommerce market proof. In High Country, the Pest Control demand fit and Pest Control competitor comparison were explicitly excluded.

6. Optional ecommerce-target-intelligence input:
   - No completed project-local `ecommerce-target-intelligence` evidence handoff is present.
   - Existing local handoffs request a future competitor browse/category-navigation benchmark from that project for High Country.
   - That missing artifact blocks strong cross-site browse/category win/loss claims, but does not block current search/autocomplete/peer-reference reporting.

7. Access and runtime requirements:
   - Playwright/Chromium for rendered browser checks.
   - Public internet access for live recrawls.
   - Some validators note that Playwright required unsandboxed browser launch in this environment.
   - No authenticated storefront, wholesale, analytics, revenue, conversion, ad-platform, or customer data is assumed.

## Current Experiment Inventory

### 1. Mission/Rubric Alignment Check

Goal:
Confirm that the target evaluation fits the reusable ecommerce product discovery mission before running site-specific experiments.

Inputs required:

- Target site and vertical.
- Mission areas from `MISSION.md`.
- Rubric and score dimensions from `framework/assessment-rubric.json`.

How it runs:

- The evaluator uses the rubric dimensions: precision, recall, ranking quality, diversity, query understanding, robustness, coverage, recovery, and user effort.
- Report findings must include observation, evidence, severity, customer impact, business impact, and recommendation.
- Scores use a 0-100 scale, but recent executive reports move exact values into references and keep the executive pages qualitative.

Tools/scripts involved:

- `framework/assessment-rubric.json`
- `docs/framework/rubric.md`
- `docs/templates/executive-report.md`
- `scripts/validate-framework.mjs`
- `scripts/validate-highcountryoutfitters-report.mjs` for High Country-specific report integrity.

Outputs/artifacts:

- Framework validation results.
- Report structure and evidence standards.
- Client-facing scorecard or executive narrative, depending on generation.

Metrics captured:

- Required assessment-area coverage.
- Scorecard categories when used: search, autocomplete, browse, filters, recommendations, mobile experience, product discovery overall.
- Finding completeness and evidence traceability.

Failure modes/caveats:

- Some current metadata still points to earlier generations.
- Rubric-level validation is generic; it does not prove a live site was tested.

Report impact:

- Keeps the final report focused on customer effort, product finding, and business impact rather than technology proof.

### 2. Upstream Local-Site Context Review

Goal:
Use local website assessment evidence as context for the ecommerce report without mixing static site/local SEO observations into ecommerce product-discovery claims.

Inputs required:

- Optional upstream local assessment handoff and JSON artifacts.
- For High Country, the upstream artifacts are hardcoded in `scripts/evaluate-highcountryoutfitters-ecommerce.mjs`.

How it runs:

- Reads the upstream summary/full JSON.
- Allows only relevant public-site signals such as crawlability, lead paths, trust/message/local visibility, security/reliability, and evidence limits.
- Excludes irrelevant sector/demand/competitor layers when the upstream assessment misclassifies the ecommerce target.

Tools/scripts involved:

- `scripts/evaluate-highcountryoutfitters-ecommerce.mjs`
- `scripts/validate-framework.mjs`
- `scripts/validate-highcountryoutfitters-report.mjs`

Outputs/artifacts:

- `upstream_local_assessment` section in `assessments/high-country-outfitters/ecommerce-evidence/GEN-010/highcountryoutfitters-ecommerce-evidence.json`.
- Allowed/excluded upstream sections in High Country combined report JSON/Markdown/PDF.

Metrics captured:

- Upstream score labels where allowed.
- Explicit excluded sections and reasons.

Failure modes/caveats:

- Static crawls can miss dynamic ecommerce paths.
- Upstream sector selection can be wrong; High Country excluded Pest Control demand and competitor sections.
- Current scripts use absolute paths to a sibling repo, so this is not yet portable.

Report impact:

- Adds context about public website trust, lead-path, and crawl limits while preserving ecommerce evidence boundaries.

### 3. Public Catalog And Collection Discovery

Goal:
Discover public catalog breadth, collection architecture, product samples, vendors, product types, and browse handles.

Inputs required:

- Target ecommerce base URL.
- Public product and collection endpoints or equivalent platform adapter.
- Target browse handles where known.

How it runs:

- High Country uses Shopify public endpoints:
  - `/collections.json?limit=250&page=N`
  - `/products.json?limit=250&page=N`
  - `/collections/{handle}/products.json?limit=24`
- Boxercraft parity uses Shopify collection metadata plus Boost Commerce endpoints.

Tools/scripts involved:

- `scripts/evaluate-highcountryoutfitters-ecommerce.mjs`
- `scripts/evaluate-boxercraft-browse-node-parity.mjs`

Outputs/artifacts:

- High Country GEN-010 public catalog section.
- Collection samples for handles such as `gear`, `camping`, `paddlesports`, `footwear`, `mens-clothing`, `womens-clothing`, `accessories`, `patagonia`, and `sale`.
- Boxercraft GEN-007 all-node collection parity evidence.

Metrics captured:

- Public collection count.
- Product sample count per selected collection.
- Product titles, handles, vendors, product types, tags, variant counts, price min/max when exposed.
- Empty, global catalog, category, fan-shop, and merchandising-node classification for Boxercraft.

Observed examples:

- High Country GEN-010 found 569 public collections.
- Boxercraft GEN-007 discovered 96 public collections, evaluated 93 non-empty nodes, and scored 60 core category/fan-shop nodes.

Failure modes/caveats:

- Public feeds may be blocked, incomplete, stale, paginated differently, or unavailable on non-Shopify platforms.
- Product counts and prices are point-in-time public observations.
- Catalog APIs can disagree with rendered pages.

Report impact:

- Supports claims about browse depth, category coverage, product-finding breadth, and evidence limits.

### 4. Rendered Public Page Capture

Goal:
Capture what a customer can actually see in the browser, including homepage, collections, search pages, mobile homepage, support/policy pages, and cart entry.

Inputs required:

- Target URLs for homepage, categories, search pages, policy/support pages, and mobile viewport.
- Playwright/Chromium access.

How it runs:

- Opens target pages with Playwright.
- Waits for DOM/page settling.
- Extracts body text, title, product links, filter inputs, controls, and selected text checks.
- Saves screenshots.

Tools/scripts involved:

- `scripts/evaluate-highcountryoutfitters-ecommerce.mjs`
- `scripts/validate-boxercraft-browser.mjs`
- `scripts/evaluate-boxercraft-normalization.mjs`
- `scripts/evaluate-competitor-pricing-discovery.mjs`

Outputs/artifacts:

- High Country screenshots under `assessments/high-country-outfitters/ecommerce-evidence/GEN-010/screenshots/`.
- Boxercraft browser screenshots under `assessments/boxercraft/browser-evidence/GEN-003/screenshots/`.
- Normalization and competitor benchmark screenshots in their generation folders.

Metrics captured:

- Page title and URL.
- Visible product links.
- Filter group names and counts.
- Presence of search, cart, pickup, shipping, returns, filters, sort, staff-pick, sale, and location text.
- Screenshot file presence and non-empty file checks in some scripts.

Failure modes/caveats:

- Sites can return Cloudflare/access verification, maintenance, 403, 429, or bot-challenge pages.
- Some scripts preserve prior successful evidence when later captures are challenged.
- Browser launch may require approval outside the managed sandbox.

Report impact:

- Provides customer-visible proof for executive claims and references.

### 5. Search Results Experiment

Goal:
Measure whether customers can reach relevant products after submitting a query.

Inputs required:

- Protected query set with intent, reason, and relevance terms.
- Search URL pattern for the target or peer site.
- Browser access for rendered result pages.

How it runs:

- Opens a search URL for each query.
- Extracts title, result count, body text, and product-title links.
- Detects blocked/challenge states.
- Scores each row using a bounded public-evidence proxy.

Tools/scripts involved:

- `scripts/evaluate-highcountryoutfitters-ecommerce.mjs`
- `scripts/evaluate-highcountryoutfitters-ir-concepts.mjs`
- `scripts/evaluate-highcountryoutfitters-expanded-ir.mjs`
- `scripts/evaluate-dressup-expanded-ir.mjs`
- `scripts/evaluate-boxercraft-normalization.mjs`
- `scripts/evaluate-competitor-pricing-discovery.mjs`

Outputs/artifacts:

- Target search rows in `expanded-ir-evidence` JSON files.
- Rendered search screenshots for High Country and Boxercraft lanes.
- Report appendix tables and concept summaries.

Metrics captured:

- Status code where available.
- Blocked/unverified status.
- Result count.
- Product titles.
- First relevant result flag.
- Relevant title count.
- Search score.
- Search band: strong, usable, partial, weak, no assistance, or unverified.

Scoring details currently used:

- High Country expanded IR starts around 68 points when results are usable, adds points for product titles, first relevant product, multiple relevant products, reasonable result count, and subtracts for very broad result counts.
- Dress Up expanded IR starts around 62 points when usable, adds similar relevance and count bonuses, and can still score from product titles if result count parsing is unavailable.
- These are diagnostic public-evidence proxies, not calibrated IR metrics.

Observed examples:

- High Country GEN-011: 175 examples, search average 94, strong search rate 95%.
- Dress Up GEN-012: 70 examples, search average 93, strong search rate 96%.
- High Country GEN-010 scorecard: search 100/100 across the bounded product/category query set after corrected rendered capture.

Failure modes/caveats:

- Result count parsing differs by site.
- Product-title extraction can miss titles on JavaScript-heavy or unusual DOMs.
- Search result count does not equal relevance or conversion.
- No expected top-K relevance labels exist yet.

Report impact:

- Shows whether customers can find products after pressing Enter.
- Provides evidence for strengths and for cases where earlier shopping guidance could reduce customer effort.

### 6. Autocomplete And Suggest Experiment

Goal:
Measure whether shoppers receive useful guidance before submitting a search.

Inputs required:

- Same protected query set or prefixes.
- Autocomplete API endpoint or rendered UI selector.
- For Shopify sites, `/search/suggest.json?q=...&resources[type]=product,collection,query,page`.

How it runs:

- Calls the public suggest endpoint from browser context or fetch.
- Captures product, collection, query, and page suggestions.
- Scores suggestions against relevance terms.
- Boxercraft browser runs also capture visible autocomplete screenshots.

Tools/scripts involved:

- `scripts/evaluate-highcountryoutfitters-ecommerce.mjs`
- `scripts/evaluate-highcountryoutfitters-ir-concepts.mjs`
- `scripts/evaluate-highcountryoutfitters-expanded-ir.mjs`
- `scripts/evaluate-dressup-expanded-ir.mjs`
- `scripts/evaluate-boxercraft-normalization.mjs`
- `scripts/validate-boxercraft-browser.mjs`
- `scripts/evaluate-competitor-pricing-discovery.mjs`

Outputs/artifacts:

- Suggest rows in expanded evidence JSON.
- High Country `camp` follow-up matching the user-observed visible dropdown.
- Boxercraft visible autocomplete screenshots for selected queries.
- Appendix evidence tables.

Metrics captured:

- Products, collections, queries, pages returned.
- Suggest endpoint status.
- Relevant product count.
- First relevant product flag.
- Autocomplete score.
- Autocomplete band.
- Uniform search/autocomplete rate, meaning search and autocomplete both provide useful assistance.
- No-autocomplete rate.
- Search-strong/autocomplete-weak count.

Observed examples:

- High Country GEN-011: autocomplete average 45, strong autocomplete rate 43%, no-autocomplete rate 50%, uniform rate 43%.
- Dress Up GEN-012: autocomplete average 52, strong autocomplete rate 41%, no-autocomplete rate 39%, uniform rate 41%.
- High Country GEN-010: `camp` suggest returned query, collection, and product suggestions matching the user-observed dropdown.

Failure modes/caveats:

- API-backed suggest is not always the same as visible dropdown behavior.
- Full visible dropdown QA across every protected query has not been run for High Country or Dress Up.
- Some sites do not expose public suggest endpoints.
- Suggestion payloads can include collection labels, but that is not proof of browse architecture.

Report impact:

- Supports the central executive message: customers often reach products after submitting, but may receive limited help in the first moments of product finding.

### 7. Protected IR Concept Matrix

Goal:
Test common product-finding language across reusable discovery concepts rather than ad hoc queries.

Inputs required:

- Vertical-specific query groups.
- Query intent, reason, and relevance terms for each example.
- Target site and optional peer sites.

How it runs:

- Runs the same search and autocomplete scoring for each concept.
- Aggregates by concept and overall.
- Preserves row-level evidence in JSON and report appendices.

Tools/scripts involved:

- `scripts/evaluate-highcountryoutfitters-ir-concepts.mjs`
- `scripts/evaluate-highcountryoutfitters-expanded-ir.mjs`
- `scripts/evaluate-dressup-expanded-ir.mjs`

Outputs/artifacts:

- High Country GEN-010 12-example IR concept evidence.
- High Country GEN-011 175-example expanded evidence.
- Dress Up GEN-012 70-example expanded evidence.

Metrics captured:

- Concept search average.
- Concept autocomplete average.
- Uniform experience rate.
- Strong search/autocomplete rates.
- Spanish/bilingual search/autocomplete averages where present.

Current concept groups:

- High Country GEN-011: Normalization, Tokenization, Synonyms, Ranking And Field Weighting, Query Expansion, Document Enrichment, Spanish/Bilingual Discovery.
- Dress Up GEN-012: Normalization, Tokenization, Customer Language, Ranking And Field Weighting, Query Expansion, Product Attribute Coverage, Spanish/Bilingual Discovery.
- Boxercraft GEN-004: quarter-zip spacing/abbreviation, women's fleece terms, UCLA/Bruins priority terms, team/fan-shop aliases, color/product terms, public wholesale SKU variants.

Observed examples:

- High Country GEN-011 concept averages: Normalization 99/82, Tokenization 97/48, Synonyms 96/74, Ranking And Field Weighting 99/72, Query Expansion 83/17, Document Enrichment 97/19, Spanish/Bilingual Discovery 86/0.
- Dress Up GEN-012 concept averages: Normalization 93/89, Tokenization 93/83, Customer Language 93/48, Ranking And Field Weighting 98/72, Query Expansion 83/25, Product Attribute Coverage 95/45, Spanish/Bilingual Discovery 93/0.

Failure modes/caveats:

- Query examples are hand-authored and not yet derived from search logs or calibrated relevance judgments.
- Scores are diagnostic, not production relevance benchmarks.
- Spanish/bilingual scoring uses English relevance terms and public evidence; it does not prove translation quality.

Report impact:

- Provides the evidence backbone for executive opportunities without making the executive pages read like a technical benchmark.

### 8. Same-Query Peer/Competitor Benchmark

Goal:
Compare target and reference sites on the same protected query set so peer examples support recommendations without becoming unsupported ranking claims.

Inputs required:

- Peer/competitor list.
- Search URL pattern and suggest endpoint behavior for each peer.
- Same protected query set used on the target.

How it runs:

- Runs rendered search and public suggest for every protected query against each usable peer.
- Applies retry/backoff where configured.
- Records unavailable/blocked peers separately.
- Aggregates by concept and site.

Tools/scripts involved:

- `scripts/evaluate-highcountryoutfitters-expanded-ir.mjs`
- `scripts/evaluate-dressup-expanded-ir.mjs`
- `scripts/validate-highcountryoutfitters-report.mjs`

Outputs/artifacts:

- `competitor_query_benchmark` in expanded evidence JSON.
- Peer tables in owner report JSON/Markdown and PDF references.
- High Country Reference E/F/G.
- Dress Up appendix benchmark tables.

Metrics captured:

- Usable search row count.
- Usable autocomplete row count.
- Search average.
- Autocomplete average.
- Strong search/autocomplete rates.
- Concept split averages.
- Blocked/unverified rows.
- Visible paid-placement label caveats where checked.

Observed examples:

- High Country same-query benchmark: High Country search 94/autocomplete 45; Half-Moon search 99/autocomplete 38; Mast search 84/autocomplete 37.
- Dress Up same-query benchmark includes Dress Up as current-site baseline beside Red Dress, Pink Lily, and Impressions. Dress Up summary is search 93/autocomplete 52 across 70 examples.

Failure modes/caveats:

- Competitor scores are public-evidence proxies, not market share or proof that a competitor is "better."
- Absence of visible paid labels is not proof of organic-only ranking.
- Competitor browse/category navigation is not covered by the High Country same-query benchmark.
- National benchmark sites can be blocked or low-signal.

Report impact:

- Supports wording such as "comparable retailers demonstrate alternative approaches" and helps avoid overclaiming competitor superiority.

### 9. Browse/Category Navigation Sample

Goal:
Evaluate whether shoppers can navigate without search through categories, collections, filters, and product grids.

Inputs required:

- Known or discovered collection handles.
- Renderable category URLs.
- Platform feed for product samples if available.

How it runs:

- Fetches collection product samples.
- Renders selected collection pages.
- Extracts visible product links, filter groups, and controls.
- High Country GEN-010 samples selected handles; Boxercraft GEN-007 runs all-node parity.

Tools/scripts involved:

- `scripts/evaluate-highcountryoutfitters-ecommerce.mjs`
- `scripts/evaluate-boxercraft-browse-node-parity.mjs`
- `scripts/evaluate-boxercraft-normalization.mjs`
- `scripts/evaluate-competitor-pricing-discovery.mjs`

Outputs/artifacts:

- High Country browse samples and rendered collection pages.
- Boxercraft all-node parity JSON/Markdown.
- Category screenshots.

Metrics captured:

- Collection product sample count.
- Rendered product link count.
- Filter group count.
- Category/fan-shop/campaign classification.
- Search-only and browse-only product counts in parity runs.

Observed examples:

- High Country GEN-010: 12 of 14 API-sampled browse collections returned product samples; 3 of 3 rendered collection pages exposed product links; browse score 90.
- High Country rendered collection pages exposed 9 filter groups including location-inventory filters.
- Boxercraft GEN-007: only 5 of 60 core category/fan-shop nodes had exact search/browse product-set parity.

Failure modes/caveats:

- High Country peer benchmark does not include competitor browse/category evidence.
- Suggest collection labels are not equivalent to navigable category architecture.
- Category handles can exist but have zero sampled products.

Report impact:

- Supports target-specific browse strengths and identifies where stronger competitor browse claims would require new evidence.

### 10. Browse/Search/Autocomplete Node Parity

Goal:
Test whether products exposed through browse nodes are also recoverable through corresponding search and autocomplete paths.

Inputs required:

- Public collection list.
- Product feed for each collection.
- Search endpoint that returns product payloads.
- Autocomplete/suggest endpoint with product suggestions.

How it runs:

- Enumerates public collections.
- Classifies nodes as category, fan shop, campaign/merchandising, global catalog, or empty.
- Derives a query from collection title/handle.
- Fetches browse products, search products, and autocomplete products.
- Compares product handles across surfaces.

Tools/scripts involved:

- `scripts/evaluate-boxercraft-browse-node-parity.mjs`

Outputs/artifacts:

- `assessments/boxercraft/browse-node-parity/GEN-007/browse-node-parity.json`
- `assessments/boxercraft/browse-node-parity/GEN-007/browse-node-parity.md`

Metrics captured:

- Public collections discovered.
- Evaluated nodes and skipped nodes.
- Core nodes evaluated.
- Exact search/browse product match rate.
- Search-only product count.
- Browse-only product count.
- Autocomplete browse-hit count.
- Browse products missing from autocomplete.

Observed examples:

- Boxercraft GEN-007 discovered 96 collections and evaluated 93 non-empty nodes.
- 60 core category/fan-shop nodes were scored.
- Exact search/browse parity was 5/60.
- 13/60 core nodes had search-only products.
- 51/60 core nodes had browse-only products.
- 47/60 core nodes had no autocomplete browse-product hit.
- Blankets mismatch: browse exposed fewer products than search/autocomplete.

Failure modes/caveats:

- Current implementation is Boxercraft/Boost-specific.
- Autocomplete parity is suggestion coverage, not full recall.
- Merchandising/campaign nodes are recorded but excluded from the core denominator.

Report impact:

- Supports concrete findings about inconsistent product availability across browse, search, and autocomplete.

### 11. Filters And Faceted Navigation Check

Goal:
Assess whether shoppers can narrow large product sets efficiently.

Inputs required:

- Rendered collection/search pages with filters.
- DOM access to filter inputs/selects.

How it runs:

- Extracts inputs named like filters and select controls.
- Groups filters by name and samples values.
- Browser validators capture specific filter screenshots for Boxercraft and collection pages for High Country.

Tools/scripts involved:

- `scripts/evaluate-highcountryoutfitters-ecommerce.mjs`
- `scripts/validate-boxercraft-browser.mjs`
- `scripts/evaluate-boxercraft-normalization.mjs`

Outputs/artifacts:

- Filter groups in rendered page evidence JSON.
- Screenshots such as Boxercraft fleece filters and High Country collection pages.

Metrics captured:

- Filter group count.
- Sample values per group.
- Presence of location-inventory filters, size, color/pattern, price, product type, vendor, availability, gender, and sort controls.
- High Country scorecard filters score.

Observed examples:

- High Country GEN-010 filters score 88.
- High Country Camping/Paddlesports/Patagonia pages each exposed 9 filter groups.

Failure modes/caveats:

- Multi-select behavior, filter persistence, sorting behavior, and dead-end filter states are not systematically validated across all targets.
- Some filters require client-side interaction beyond static extraction.

Report impact:

- Supports opportunities around reducing effort after customers reach a category or result set.

### 12. Recommendations And Merchandising Check

Goal:
Identify whether the site exposes helpful product discovery beyond direct search or browse.

Inputs required:

- Homepage, collection pages, and product detail pages.
- Rendered browser access.

How it runs:

- Looks for merchandising cues such as sale, staff picks, new arrivals, quick add, recommendation sections, and related product links.
- Boxercraft browser validator includes product recommendations.
- High Country scorecard uses homepage and collection merchandising signals.

Tools/scripts involved:

- `scripts/evaluate-highcountryoutfitters-ecommerce.mjs`
- `scripts/validate-boxercraft-browser.mjs`

Outputs/artifacts:

- Rendered page evidence and screenshots.
- Recommendations/merchandising scorecard rows.

Metrics captured:

- Presence of staff-pick, sale, new-arrival, quick-add, related products, and recommendation text/links.
- High Country recommendations score.

Observed examples:

- High Country GEN-010 recommendations/merchandising score 68.
- The High Country report caveat says product recommendation depth was sampled but not exhaustively validated.

Failure modes/caveats:

- This lane is shallow compared with search/autocomplete.
- Recommendation relevance, diversity, personalization, and cross-sell quality are not yet measured systematically.

Report impact:

- Provides light evidence for broader product discovery, but should not carry heavy recommendation-quality claims.

### 13. Cart, Checkout Entry, Policy, Support, And Return Path Check

Goal:
Verify whether shoppers can proceed from discovery into trust and purchase-adjacent paths without making unapproved purchases.

Inputs required:

- Product with public available variant.
- Cart endpoint or rendered add-to-cart controls.
- Public policy/support URLs.

How it runs:

- Adds a sampled variant to cart where possible.
- Reads cart JSON or rendered cart page.
- Renders Contact, Shipping/Return Policy, Locations, Start A Return/Exchange, and related support pages.
- Does not complete checkout, payment, or order placement.

Tools/scripts involved:

- `scripts/evaluate-highcountryoutfitters-ecommerce.mjs`
- `scripts/validate-boxercraft-browser.mjs`

Outputs/artifacts:

- Cart evidence in JSON.
- Policy/support rendered evidence.
- Screenshots such as `desktop-cart-after-add.png` and policy pages.

Metrics captured:

- Cart add/read success.
- Presence of phone, email, shipping, returns, store locations, contact form, relevant links.
- Text checks for pickup/free shipping/cart.

Observed examples:

- High Country GEN-010 public cart add/read succeeded.
- Checkout was not completed.
- Return app path returned 403 in public browser, while refund/help policy page was usable.

Failure modes/caveats:

- Checkout, pickup selection, payment, order placement, and return app workflows remain out of scope without explicit authorization.
- No conversion claims should be made from cart entry alone.

Report impact:

- Lets the report connect discovery to customer confidence and next-step friction while avoiding unsupported checkout readiness claims.

### 14. Mobile Experience Check

Goal:
Confirm that the product-finding experience has basic mobile visibility and does not rely only on desktop behavior.

Inputs required:

- Mobile viewport.
- Homepage, search, autocomplete, category, and filter pages where available.

How it runs:

- Renders mobile homepage or selected mobile scenarios.
- Captures screenshots and text checks.
- Boxercraft browser validation includes mobile autocomplete and filters for selected queries.

Tools/scripts involved:

- `scripts/evaluate-highcountryoutfitters-ecommerce.mjs`
- `scripts/validate-boxercraft-browser.mjs`

Outputs/artifacts:

- Mobile screenshots.
- Mobile text checks.
- Mobile scorecard rows.

Metrics captured:

- Presence of search and cart.
- Visibility of pickup/free-shipping messaging.
- Mobile autocomplete and filter evidence in Boxercraft runs.
- Mobile experience score.

Observed examples:

- High Country GEN-010 mobile experience score 74.
- Boxercraft GEN-003 includes mobile homepage, mobile autocomplete, and mobile filter screenshots.

Failure modes/caveats:

- High Country mobile validation is currently lighter than desktop validation.
- Full mobile journey completion is not systematic across the protected query set.

Report impact:

- Supports cautious mobile-readiness language and identifies where deeper mobile customer journey QA is needed.

### 15. Competitor Pricing, Assortment, And Discovery Benchmark

Goal:
Compare public assortment, price transparency, and product-finding behavior for comparable ecommerce sites.

Inputs required:

- Peer/competitor list.
- Public catalog feeds where available.
- Shared product categories and discovery queries.
- Rendered browser access.

How it runs:

- Pulls public catalog feeds for Shopify-like competitors.
- Applies category predicates such as flannel pants, lounge pants/joggers/sweatpants, quarter zips, fleece tops, women's fleece, UCLA/Bruins.
- Runs search, autocomplete, and browse samples for shared queries.
- Captures screenshots.

Tools/scripts involved:

- `scripts/evaluate-competitor-pricing-discovery.mjs`

Outputs/artifacts:

- `assessments/boxercraft/competitor-evidence/GEN-006/competitor-pricing-discovery.json`
- `assessments/boxercraft/competitor-evidence/GEN-006/competitor-pricing-discovery.md`
- GEN-006 competitor screenshots.

Metrics captured:

- Product count by category.
- Priced product count.
- Variant price count.
- Min/max/median product prices.
- Search relevant rate and score.
- Autocomplete relevant rate and score.
- Browse score.
- Pricing transparency score.
- Overall discovery score.

Observed examples:

- Boxercraft GEN-006 overall discovery scores: Boxercraft 78, Colosseum Athletics 55, L2 Brands 46, Concepts Sport 3, Fanatics 3.
- Boxercraft was the only tested direct-brand site with public flannel-pant catalog matches in that run.
- Colosseum exposed more UCLA/Bruins public catalog matches than Boxercraft in tested direct-site feeds.

Failure modes/caveats:

- Concepts Sport public Wix catalog did not expose comparable automated price/product-grid data.
- Fanatics is a marketplace benchmark, not a comparable direct brand-owned catalog.
- Pricing and availability are point-in-time public observations.

Report impact:

- Supports competitor context for assortment and product-finding opportunity, with explicit comparability limits.

### 16. Local Buyer / Website-Growth Fusion Report

Goal:
Combine ecommerce product discovery evidence with local website-growth signals for a specific buyer problem.

Inputs required:

- Ecommerce evidence from prior experiments.
- Local website benchmark or upstream local assessment.
- A concrete buyer scenario, such as nearby school PTA buyers.

How it runs:

- Reuses ecommerce search/autocomplete/browse evidence.
- Adds local visibility, trust, lead conversion, message clarity, and AI discoverability context where available.
- The GEN-009 revision intentionally removed visible scores and proposal language, keeping the report problem-only.

Tools/scripts involved:

- `reports/boxercraft-local-school-pta-opportunity-report.tex`
- `scripts/validate-framework.mjs`

Outputs/artifacts:

- `assessments/boxercraft/local-school-opportunity/GEN-008/evidence-summary.json`
- `boxercraft-local-school-pta-opportunity-report.pdf`

Metrics captured:

- Underlying structured evidence preserves scores.
- Visible report may omit scores depending on user-facing objective.

Failure modes/caveats:

- Stakeholder-supplied local context must be verified before external claims.
- Local website benchmark can be partial or medium confidence.

Report impact:

- Shows the framework can answer a business/customer question rather than only summarize search technology.

### 17. Report Generation

Goal:
Turn evidence into executive-ready artifacts that can earn a meeting, not just prove a benchmark.

Inputs required:

- Evidence JSON.
- Report JSON/Markdown source.
- Northvalley LaTeX report source.
- Desired executive framing.

How it runs:

- Scripts build structured report JSON, Markdown, LaTeX, and PDFs.
- Recent High Country and Dress Up reports put technical evidence in references and use executive pages for business/customer-experience narrative.
- Report language now avoids competitor-superiority framing and makes the target site the hero.

Tools/scripts involved:

- `scripts/evaluate-highcountryoutfitters-ecommerce.mjs`
- `scripts/evaluate-highcountryoutfitters-expanded-ir.mjs`
- `scripts/evaluate-dressup-expanded-ir.mjs`
- `latexmk`
- `pdftotext`
- `pdftoppm`
- `pdfinfo`

Outputs/artifacts:

- High Country PDF: `highcountryoutfitters-combined-ecommerce-report.pdf`
- Dress Up PDF: `dressup-ecommerce-executive-report.pdf`
- Boxercraft PDF: `boxercraft-product-discovery-assessment.pdf`
- LaTeX sources in `reports/`
- Report JSON/Markdown under `assessments/*/owner-outreach-report` or `combined-report`.

Metrics captured:

- Page count and PDF metadata.
- Required headings/text presence.
- Disallowed stale framing absence.
- Nonblank rendered page checks by spot review.

Failure modes/caveats:

- PDF layout can regress after narrative changes.
- Exact scoring can feel falsely precise on executive pages; current best pattern is qualitative executive narrative plus exact appendix tables.

Report impact:

- Produces the client-facing conversation starter and preserves credibility through appendix evidence.

### 18. Validation Gate And Artifact Integrity

Goal:
Ensure evidence/report artifacts exist, parse, compile, and preserve required mission claims and limitations.

Inputs required:

- Generated evidence/report files.
- Scripts and validators.
- MDE state records.

How it runs:

- Runs syntax checks for changed scripts.
- Runs target-specific validators where available.
- Runs framework validator.
- Compiles PDFs with LaTeX.
- Extracts text and spot-renders pages.
- Runs `git diff --check`.
- Records two clean Validation Gate passes for phase exit.

Tools/scripts involved:

- `npm run validate`
- `npm run validate:highcountryoutfitters`
- `node --check ...`
- `latexmk`
- `pdfinfo`
- `pdftotext`
- `pdftoppm`
- `git diff --check`

Outputs/artifacts:

- `.mde/validation-runs/*.json`
- `.mde/generations/*.json`
- Updated validation summaries.

Metrics captured:

- Pass/fail result by category.
- Blocking findings by severity.
- Evidence quality notes.
- Validation skips and reasons.
- Pass count, including 2/2 phase gate where achieved.

Observed examples:

- GEN-012 Dress Up passed `VAL-047` and `VAL-048`.
- GEN-011 High Country validator checks 175 target examples, seven concepts, Spanish/bilingual discovery, two usable competitor benchmarks, 175 same-query competitor rows per usable competitor, customer-experience language, final executive visual labels, and stale framing exclusions.

Failure modes/caveats:

- `scripts/validate-framework.mjs` does not yet fully validate Dress Up GEN-012 artifacts.
- `scripts/evaluate-dressup-expanded-ir.mjs` exists but has no `package.json` script.
- Some validators are target-specific rather than reusable.

Report impact:

- Makes generated reports auditable and guards against stale or unsupported client-facing claims.

## Current Evidence Snapshots

High Country GEN-010 combined ecommerce pass:

- Search queries: 12.
- Browse handles sampled: 14.
- Rendered search pages: 12.
- Rendered collection pages: 3.
- Public collections discovered: 569.
- Scorecard: search 100, autocomplete 78, browse 90, filters 88, recommendations 68, mobile 74, overall 83.
- Key caveat: public cart add/read was verified, but checkout, pickup selection, payment, and return completion were not attempted.

High Country GEN-011 expanded IR and same-query peer pass:

- Target examples: 175.
- Search average: 94.
- Autocomplete average: 45.
- Strong search rate: 95%.
- Strong autocomplete rate: 43%.
- No-autocomplete rate: 50%.
- Uniform experience rate: 43%.
- Spanish/bilingual autocomplete average: 0.
- Usable peers: Half-Moon Outfitters and Mast General Store.
- Caveat: competitor browse/category navigation was not captured.

Dress Up GEN-012 expanded IR and peer pass:

- Target examples: 70.
- Search average: 93.
- Autocomplete average: 52.
- Strong search rate: 96%.
- Strong autocomplete rate: 41%.
- No-autocomplete rate: 39%.
- Uniform experience rate: 41%.
- Spanish/bilingual search average: 93.
- Spanish/bilingual autocomplete average: 0.
- Peers: Red Dress, Pink Lily, Impressions.

Boxercraft GEN-004/GEN-006/GEN-007 framework validation lanes:

- GEN-004 normalization matrix: 36 queries across search, autocomplete, browse routing, and public wholesale SKU variants.
- GEN-006 competitor pricing/discovery: Boxercraft, L2 Brands, Colosseum Athletics, Concepts Sport, Fanatics.
- GEN-007 all-node parity: 96 collections discovered, 93 non-empty nodes evaluated, 60 core nodes scored, 5/60 exact search/browse parity.

## Known Gaps

1. Hardcoded target scripts:
   - Current target evaluations are separate scripts with hardcoded domains, query sets, competitors, output paths, and endpoint assumptions.
   - A reusable evaluation skill or CLI needs a target manifest and adapter system.

2. Missing generic target manifest:
   - No canonical `target.yaml` or JSON contract exists for target URL, vertical, platform, query pack, competitor list, upstream local-site artifacts, and report style.

3. ecommerce-target-intelligence handoff not formalized:
   - Local repo references `ecommerce-target-intelligence` only as a requested blocker for competitor browse/category benchmarking.
   - No completed competitor-discovery or browse/category evidence handoff is present locally.

4. Competitor browse/category benchmark gap:
   - Same-query peer evidence covers rendered search and public suggest/autocomplete.
   - It does not cover comparable category tree, category labels, product counts, filters, mobile browse, or local inventory paths for peers.

5. Visible autocomplete UI gap:
   - High Country and Dress Up rely heavily on public suggest API evidence.
   - Full visible dropdown screenshots across the protected query set are not captured.

6. Relevance calibration gap:
   - Current search/autocomplete scores are heuristic public-evidence proxies.
   - There is no expected top product set, graded relevance labels, precision@k, recall@k, MRR, or NDCG benchmark.

7. Search log and analytics gap:
   - No internal search logs, query volume, conversion rate, add-to-cart rate, revenue, AOV, customer-segment, or abandonment data are available.
   - Business impact remains mechanism-based, not measured.

8. Zero-result and recovery gap:
   - Some zero-result controls exist, but there is no systematic zero-result recovery experiment across spelling variants, synonyms, and long-tail queries.

9. Filter interaction depth gap:
   - Current filters are mostly extracted as visible groups.
   - Multi-select behavior, filter persistence, sorting, dead-end filters, and mobile filters are not generalized.

10. Recommendation quality gap:
   - Current recommendation/merchandising checks are light.
   - Relevance, diversity, cross-sell fit, seasonal fit, and product-page recommendation depth are not scored systematically.

11. Checkout/pickup/return workflow gap:
   - Public cart add/read is checked.
   - Checkout completion, pickup selection, payment, return app flow, order placement, and authenticated account workflows are out of scope.

12. Non-Shopify adapter gap:
   - The strongest reusable paths assume Shopify suggest/collection/product feeds or Boxercraft Boost endpoints.
   - Sites using Algolia, Searchspring, Klevu, Salesforce Commerce Cloud, BigCommerce, WooCommerce, custom search, or headless APIs need adapters.

13. Dress Up validation gap:
   - Dress Up GEN-012 has clean validation records, but there is no dedicated package script or generic validator equivalent to `validate:highcountryoutfitters`.

14. MDE metadata drift:
   - Several framework/MDE files still name older generations even though `.mde/state.json` is current at GEN-012.

## Proposed Next Experiments And Improvements

1. Create a reusable target manifest:
   - Fields: target name, domain, vertical, platform, search URL pattern, suggest endpoint, browse endpoints, known categories, competitor list, local assessment input path, report output path, and evidence limits.
   - Benefit: makes Atlanta Grill Company, Dress Up, or another ecommerce site repeatable without copy/pasting a new script.

2. Build platform adapters:
   - Start with Shopify, Boost Commerce, generic rendered search, and generic visible autocomplete.
   - Add adapters for common ecommerce search providers when encountered.
   - Benefit: separates experiment logic from site plumbing.

3. Define query-pack templates by vertical:
   - Outdoor retail, boutique apparel, licensed apparel, grill/outdoor cooking, home goods, B2B/wholesale.
   - Include intent, relevance terms, customer-language rationale, and optional expected product/category types.

4. Add calibrated relevance judgments:
   - For each protected query, define expected product/category matches and graded relevance.
   - Capture precision@k, top result relevance, recall proxy, MRR, NDCG, and zero-result recovery.
   - Benefit: reduces false precision from heuristic scores.

5. Add same-category competitor browse benchmark:
   - For target and peers, capture category existence, URL, visible label, product count, sampled products, filters, mobile path, and screenshots for shared intents.
   - This directly addresses the High Country competitor browse blocker.

6. Formalize ecommerce-target-intelligence handoff schema:
   - Required fields: selected peers, selection rationale, overlap category, target/peer URLs, category paths, screenshots, blocked rows, confidence, and usable/not-usable status.
   - Benefit: avoids ad hoc competitor selection and missing browse evidence.

7. Add full visible autocomplete UI capture:
   - Capture desktop and mobile dropdown screenshots for every protected query or a statistically meaningful sample.
   - Compare visible dropdown to API payload.
   - Benefit: validates what customers actually see before pressing Enter.

8. Generalize all-node browse/search/autocomplete parity:
   - Move Boxercraft GEN-007 logic into a reusable experiment with adapters.
   - Benefit: detects products that search finds but browse hides, and products browse exposes but search misses.

9. Add systematic filter/facet interaction tests:
   - Validate multi-select, persistence after navigation, sort interaction, dead-end filters, size/color/vendor behavior, and mobile filters.
   - Benefit: makes filter scores less surface-level.

10. Add zero-result and recovery suite:
   - Test typos, partials, no-result controls, alternative suggestions, category suggestions, query rewrites, and recovery links.
   - Benefit: evaluates abandonment prevention.

11. Add customer-journey scenarios:
   - Example: "Find a wedding guest dress under $100," "Find a grill replacement part," "Find waterproof hiking boots available near me."
   - Capture steps, clicks, refinements, dead ends, time/effort proxy, and final product confidence.

12. Add internal analytics-ready impact model:
   - Define optional fields for search-session share, query volume, zero-result rate, add-to-cart rate, conversion rate, AOV, revenue, and gross margin.
   - Keep public reports mechanism-based until those inputs are supplied.

13. Add report narrative validator for executive tone:
   - Check that executive pages lead with the target's strengths, use customer language, keep competitors as reference implementations, and move exact scores to appendix.
   - Benefit: preserves the High Country/Dress Up consulting tone.

14. Add a generic report validator:
   - Validate evidence file shape, report file shape, PDF presence, appendix tables, evidence limits, peer framing, and stale phrase exclusions across any target.

15. Clean up MDE state drift:
   - Update strategy/status files to acknowledge GEN-012 and the emerging reusable-skill objective before the next implementation generation.

## Validation Performed For This Handoff

Performed:

- Read required mission and current MDE state files.
- Inspected framework, script, validator, evidence, report, and handoff artifacts listed above.
- Parsed saved evidence JSON summaries for High Country GEN-010/GEN-011, Dress Up GEN-012, Boxercraft GEN-006, and Boxercraft GEN-007.
- Searched the repo for `local-website-growth-assessment`, `ecommerce-target-intelligence`, upstream artifact paths, report outputs, and handoff references.
- Created this project-local handoff artifact only.
- Ran `git diff --check`; no whitespace errors were reported.

Skipped:

- No live ecommerce recrawl.
- No Playwright/browser run.
- No PDF rebuild.
- No evaluator or validator implementation.
- No cross-project coordination.
- No Control Center stream update.
- No code change or report narrative change.

Reason skipped:

- The delegated task asks for an evidence-backed description of current experiments/workflow and explicitly says not to implement changes yet.

## Blockers And Open Questions

No blocker prevents this handoff from answering the requested question.

Open questions before implementing the next generation:

1. Should the next step be a reusable evaluation skill/CLI, or a project-local generic evaluator first?
2. What is the minimum target manifest Ferosh wants for reuse across sites such as `https://atlantagrillcompany.com/` and `https://shopdressup.com/`?
3. Should competitor discovery be owned by this repo or consumed as a formal `ecommerce-target-intelligence` handoff?
4. Should the next report require same-category competitor browse evidence before any executive competitor context is shown?
5. Should the scoring model remain heuristic for outreach reports, or should the project add calibrated relevance labels and IR metrics before more sites are evaluated?
6. Should Dress Up get a dedicated validator/package script before the framework is generalized?

## Recommended Immediate Next Action

Use this inventory to design a reusable ecommerce evaluation manifest and experiment runner. The current workflow is valuable and report-proven, but it is not yet a clean skill: the strongest experiments are distributed across target-specific scripts, with hardcoded domains, query packs, competitor lists, endpoint assumptions, and report paths.
