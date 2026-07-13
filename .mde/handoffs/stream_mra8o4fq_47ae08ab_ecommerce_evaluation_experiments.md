# Ecommerce Evaluation Experiments Handoff

Date: 2026-07-07
Project: Ecommerce Evaluation Reports (`ecommmerce-eval`)
Repository: `/Users/feroshjacob/code/ecommmerce-eval`
Stream: `stream_mra8o4fq_47ae08ab`
Plan: `plan_mra8o4fq_134155c8`

## Executive Status

The current ecommerce report status is: Dress Up GEN-012 is validated with two clean local Validation Gate passes, and the active review artifact is `dressup-ecommerce-executive-report.pdf`.

This handoff audits the actual ecommerce evaluation workflow currently present in the repo. It describes the experiments performed or intended once a target ecommerce site is available. It does not implement code changes, does not update report outputs, and does not route work to any other project.

No other project artifact is required to answer this inventory accurately. The repo documents `local-website-growth-assessment` consumption for High Country. It does not contain a completed `ecommerce-target-intelligence` handoff; local files only mention it as a requested source for future competitor browse/category evidence. That missing browse/category competitor evidence is a blocker only for stronger cross-site browse win/loss claims, not for documenting the current project workflow.

## Files Inspected

Mission and MDE state:

- `MISSION.md`
- `MISSION_UPDATES.md`
- `.mde/project.json`
- `.mde/state.json`
- `.mde/validation-strategy.json`
- `.mde/failing-bdds.json`
- `.mde/generations/GEN-012.json`
- `.mde/validation-runs/VAL-048.json`
- `.mde/generation-summary.md`
- `.mde/findings.json`
- `.mde/validator-effectiveness.json`

Framework, docs, templates, and package scripts:

- `package.json`
- `framework/assessment-rubric.json`
- `framework/coverage-matrix.json`
- `docs/framework/rubric.md`
- `docs/templates/executive-report.md`
- `schemas/assessment.schema.json`
- `templates/assessment-template.json`

Evaluator and validation scripts:

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

Handoffs:

- `.mde/handoffs/stream_mra1ejuu_9f305c24_ecommerce_eval_experiments.md`
- `.mde/handoffs/control-center-highcountryoutfitters-combined-ecommerce-report-2026-07-02.md`
- `.mde/handoffs/control-center-highcountryoutfitters-owner-outreach-report-2026-07-03.md`
- `.mde/handoffs/control-center-highcountryoutfitters-same-query-competitor-refinement-2026-07-04.md`
- `.mde/handoffs/control-center-stream_mr6tdlc3_6413285c-highcountryoutfitters-competitor-browse-blocker-2026-07-04.md`
- `.mde/handoffs/control-center-stream_mr6tdlc3_6413285c-highcountryoutfitters-competitor-confidence-rationale-2026-07-05.md`

## Commands Run

Read/audit commands:

- `sed -n '1,260p' /Users/feroshjacob/code/codex-skills/skills/mission-driven-engineering/SKILL.md`
- `sed -n '1,260p' MISSION.md`
- `sed -n '1,260p' MISSION_UPDATES.md`
- `sed -n '1,260p' .mde/state.json`
- `sed -n '1,220p' .mde/project.json`
- `sed -n '1,260p' .mde/validation-strategy.json`
- `sed -n '1,260p' .mde/failing-bdds.json`
- `sed -n '1,260p' .mde/generations/GEN-012.json`
- `sed -n '1,220p' .mde/validation-runs/VAL-048.json`
- `sed -n '1,260p' .mde/generation-summary.md`
- `sed -n '1,260p' .mde/findings.json`
- `sed -n '1,260p' .mde/validator-effectiveness.json`
- `sed -n '1,220p' package.json`
- `sed -n '1,220p' framework/assessment-rubric.json`
- `sed -n '1,220p' docs/templates/executive-report.md`
- `sed -n '1,220p' .mde/handoffs/stream_mra1ejuu_9f305c24_ecommerce_eval_experiments.md`
- `rg -n "const GEN|const TARGET|const TEST_GROUPS|const COMPETITORS|function scoreSearch|function scoreAutocomplete|function scoreFromEvidence|function summarizeDiscovery|function buildFindings|const matrix|const sites|const categories|const discoveryQueries|const requiredFiles" scripts`
- `node --input-type=module -e "...saved evidence summary..."`

Validation commands:

- `git diff --check` after writing this handoff.

Skipped commands:

- No live ecommerce recrawl.
- No Playwright/browser run.
- No `npm run validate`, because this is a documentation-only handoff and no evaluator/report code changed.
- No PDF rebuild or `latexmk`.
- No cross-project command against `local-website-growth-assessment` or `ecommerce-target-intelligence`.
- No Control Center stream update.

## Current Workflow Summary

The project currently has a strong but not yet fully generalized ecommerce evaluation workflow. The actual experiments are spread across target-specific scripts:

- Boxercraft validates the framework with public retail/wholesale browser checks, normalization, competitor pricing/discovery, and all-node browse/search/autocomplete parity.
- High Country validates a combined local-plus-ecommerce report, then an expanded 175-example search/autocomplete and same-query peer benchmark.
- Dress Up validates a boutique-apparel executive report with 70 protected examples and same-query boutique peer references.

The current workflow is best described as a repeatable pattern with hardcoded target implementations, not yet a clean reusable skill or generic CLI.

## Dependency Inputs Once A Site Is Available

Required target inputs:

- Target company name.
- Canonical target URL and domain.
- Target slug for artifact paths.
- Ecommerce vertical and buyer context.
- Platform/search assumptions, such as Shopify search/suggest endpoints or another adapter.
- Query pack for the vertical.
- Optional peer/competitor list.
- Optional upstream local website assessment artifacts.

Optional local-website-growth-assessment dependency:

- High Country GEN-010 consumes upstream local assessment artifacts from `/Users/feroshjacob/code/local-website-growth-assessment`.
- The consumed inputs are:
  - `.mde/handoffs/highcountryoutfitters-local-website-assessment-2026-07-01.md`
  - `.mde/assessment-artifacts/highcountryoutfitters-local-website-assessment-2026-07-01-summary.json`
  - `.mde/assessment-artifacts/highcountryoutfitters-local-website-assessment-2026-07-01.json`
- The ecommerce evaluator uses these only as partial public-site context: crawlability, lead paths, trust/message/local visibility, security/reliability, and evidence limits.
- It explicitly excludes invalid upstream demand and competitor sections when they do not match ecommerce. In High Country, Pest Control demand fit and Pest Control competitor comparison were excluded.

Optional ecommerce-target-intelligence dependency:

- No completed project-local `ecommerce-target-intelligence` output is present.
- Local handoffs request future competitor browse/category evidence from that project.
- Current same-query competitor work can support search/autocomplete peer context, but not full cross-surface competitor claims across browse/category.

Runtime inputs:

- Public internet access for live evidence collection.
- Playwright/Chromium for rendered browser capture.
- Permission for browser launch when sandbox restrictions block Chromium.
- No private credentials or authenticated customer/order data unless explicitly approved.

## Experiment 1: Mission, Rubric, And Evidence Standard Check

Purpose:
Confirm that the evaluation is tied to the mission: helping ecommerce leaders understand whether customers can find and buy products with less effort.

Required inputs:

- Target site and vertical.
- Mission scope from `MISSION.md`.
- Rubric from `framework/assessment-rubric.json`.
- Report format expectations.

Setup:

- Use the project rubric as the source of truth for assessment areas and evidence standards.
- Treat scores as summaries of evidence, not the evidence itself.

Steps:

1. Confirm the target is an ecommerce product discovery assessment.
2. Map the target to assessment areas: search, autocomplete, browse, filters, recommendations, mobile, and journeys.
3. Confirm evidence types: URL, screenshot, query result set, autocomplete suggestion set, navigation path, facet state, mobile observation, access limitation, or client-supplied context.
4. Confirm every finding can carry observation, evidence, severity, customer impact, business impact, and recommendation.

Evidence collected:

- Framework coverage.
- Required report sections.
- Evidence limitations.

Metrics/scoring:

- Rubric uses 0-100 score anchors: Broken, Weak, Mixed, Strong, Excellent.
- Dimensions include precision, recall, ranking quality, diversity, query understanding, robustness, coverage, recovery, and user effort.

Expected outputs:

- Assessment/report structure.
- Guardrails for findings and scorecards.
- Validation requirements.

Where results appear in reports:

- Executive summary or executive readout.
- Scorecard/reference appendix.
- Evidence limits.
- Detailed findings.

Limitations:

- Rubric validation does not prove a live target was tested.
- Several current MDE files still reference older phases even though GEN-012 is current.

Improvement opportunities:

- Create a generic report validator that applies the same rubric and evidence constraints to any target.
- Add a target manifest that records which rubric areas were actually run.

## Experiment 2: Target Intake And Platform/Endpoint Discovery

Purpose:
Identify the target, platform behavior, search URL shape, autocomplete endpoint, catalog feeds, and artifact paths.

Required inputs:

- Target URL and domain.
- Company name and slug.
- Known ecommerce platform or exploratory probe results.
- Vertical and buyer language.

Setup:

- Current scripts hardcode these values. Examples:
  - `scripts/evaluate-highcountryoutfitters-ecommerce.mjs`: High Country, `https://highcountryoutfitters.com/`, GEN-010.
  - `scripts/evaluate-highcountryoutfitters-expanded-ir.mjs`: High Country, GEN-011.
  - `scripts/evaluate-dressup-expanded-ir.mjs`: Dress Up, `https://shopdressup.com/`, GEN-012.

Steps:

1. Define target constants.
2. Define output directories.
3. Define search URL builder.
4. Define suggest endpoint behavior.
5. Define competitor/peer search URL builders when applicable.

Evidence collected:

- Target identity.
- Platform assumptions.
- Output path map.
- Access and endpoint behavior.

Metrics/scoring:

- No direct score.
- This determines which downstream experiments can run.

Expected outputs:

- Target-specific evidence JSON path.
- Target-specific report JSON/Markdown/LaTeX/PDF paths.

Where results appear in reports:

- Input artifacts and methodology sections.
- Evidence limits.

Limitations:

- This is not generic yet. New sites currently require a new target-specific script or script modification.
- Non-Shopify sites need a different adapter.

Improvement opportunities:

- Add `target.yaml` or `target.json` with target identity, platform adapter, query pack, competitor list, output paths, and upstream artifacts.

## Experiment 3: Upstream Local Website Context Review

Purpose:
Use local website growth evidence as context without letting static local-site evidence become unsupported ecommerce market evidence.

Required inputs:

- Optional upstream handoff and assessment JSON from `local-website-growth-assessment`.
- Rules for allowed and excluded sections.

Setup:

- High Country uses hardcoded sibling-repo paths in `scripts/evaluate-highcountryoutfitters-ecommerce.mjs`.

Steps:

1. Read upstream summary and full JSON.
2. Extract allowed public-site signals.
3. Record excluded sections with reasons.
4. Preserve upstream limitations in the ecommerce report.

Evidence collected:

- Local visibility.
- Lead-path visibility.
- Trust/message signals.
- Security/reliability signals.
- Crawl limits.
- Excluded upstream sections and reasons.

Metrics/scoring:

- Upstream scores may be copied as context when relevant.
- No ecommerce score is derived directly from invalid upstream market sections.

Expected outputs:

- `upstream_local_assessment` section in evidence JSON.
- Allowed/excluded upstream sections in report JSON/Markdown/PDF.

Where results appear in reports:

- High Country combined report references and evidence limits.
- Findings around local assessment usefulness and exclusions.

Limitations:

- Upstream static crawl can miss dynamic ecommerce paths.
- Sibling-repo absolute paths are not portable.
- Only High Country currently documents this dependency end to end.

Improvement opportunities:

- Define a portable upstream handoff contract.
- Make local assessment input optional and manifest-driven.

## Experiment 4: Public Catalog And Collection Discovery

Purpose:
Estimate catalog breadth, collection architecture, product samples, vendors, product types, and product availability visible through public feeds.

Required inputs:

- Public collection/product endpoints or platform adapter.
- Target site URL.
- Known browse handles or collection enumeration endpoint.

Setup:

- High Country uses Shopify endpoints.
- Boxercraft browse parity uses Shopify collection data and Boost Commerce endpoints.

Steps:

1. Fetch public collection pages or collection JSON.
2. Fetch product feed pages where available.
3. Fetch sample products for selected collections.
4. Normalize product title, handle, vendor, type, tags, variant count, availability, and price range where exposed.

Evidence collected:

- Collection count.
- Collection handles and titles.
- Product sample counts.
- Product titles, handles, vendors, product types, tags, price min/max, and available variants.

Metrics/scoring:

- Collection count.
- Products sampled per collection.
- Empty/non-empty collection rate.
- In High Country scorecard, browse score uses sampled collections and rendered category evidence.

Expected outputs:

- Catalog section in evidence JSON.
- Browse collection samples.
- Product samples used for cart/recommendation checks.

Where results appear in reports:

- Dataset/methodology.
- Browse/category findings.
- Scorecard or appendix tables.

Observed results:

- High Country GEN-010 found 569 public collections.
- High Country sampled 14 browse handles; 12 returned product samples.
- Boxercraft GEN-007 discovered 96 collections and evaluated 93 non-empty nodes.

Limitations:

- Public feeds can be blocked, incomplete, stale, or unavailable.
- Catalog data may differ from rendered customer pages.
- Product availability and prices are point-in-time observations.

Improvement opportunities:

- Add platform adapters for BigCommerce, WooCommerce, Salesforce Commerce Cloud, Algolia, Searchspring, Klevu, and custom stores.
- Add feed/render parity checks for every target.

## Experiment 5: Rendered Browser Page Capture

Purpose:
Capture what customers actually see in a browser, not just what public JSON endpoints return.

Required inputs:

- Playwright/Chromium runtime.
- Desktop and mobile viewport settings.
- URLs for homepage, category pages, search pages, policy/support pages, product/cart paths.

Setup:

- Uses Playwright in target-specific scripts.
- Screenshots are saved under target evidence directories.

Steps:

1. Open page with Playwright.
2. Wait for DOM/page settling.
3. Capture screenshot.
4. Extract page title, visible body text, product links, filter inputs, controls, and text checks.
5. Record access/challenge status where encountered.

Evidence collected:

- Screenshots.
- Page title and URL.
- Body text excerpts.
- Product links.
- Filter inputs and groups.
- Controls and customer-facing labels.
- Policy/support text and links.

Metrics/scoring:

- Product link counts.
- Filter group counts.
- Presence of search, filter, sort, cart, checkout, pickup, shipping, return, location, staff-pick, and sale signals.
- Screenshot existence/non-empty checks in some scripts.

Expected outputs:

- Rendered page evidence JSON.
- Screenshot artifacts.

Where results appear in reports:

- Evidence references.
- Rendered search/category/policy/mobile sections.
- PDF screenshots are generally referenced indirectly rather than embedded in the current reports.

Observed results:

- High Country GEN-010 captured homepage, collections, all 12 search pages, mobile homepage, policy/support pages, and cart.
- Boxercraft GEN-003 captured rendered search, autocomplete, filters, recommendations, mobile, and public wholesale pages.

Limitations:

- Browser launch may need approval outside sandbox.
- Sites can return 403, 429, Cloudflare/access verification, or maintenance pages.
- Some evidence was preserved from prior successful captures when later recrawls hit challenge pages.

Improvement opportunities:

- Add a reusable challenge/block classification module.
- Add screenshot geometry/layout checks for evidence screenshots.

## Experiment 6: Submitted Search Results Evaluation

Purpose:
Determine whether shoppers can find relevant products after submitting a search query.

Required inputs:

- Query set with customer intent and relevance terms.
- Target search URL pattern.
- Rendered browser access.

Setup:

- High Country and Dress Up expanded IR scripts define query groups in `TEST_GROUPS`.
- Search scoring uses product title relevance, first result relevance, result count, and blocked/unverified handling.

Steps:

1. Build search URL for each query.
2. Open page in browser.
3. Extract status, title, body text, result count, and product titles.
4. Detect blocked/challenge states.
5. Compare product titles to relevance terms.
6. Assign search score and band.

Evidence collected:

- Query text.
- Intent/reason.
- Search URL.
- HTTP/status where available.
- Page title.
- Result count.
- Product title sample.
- Text excerpt.
- Blocked/unverified flag.

Metrics/scoring:

- Search score from 0-100.
- Score band: strong, usable, partial, weak, no assistance, unverified.
- Result count.
- Relevant product title count.
- First relevant result flag.
- Strong search rate.
- Concept-level search average.

Expected outputs:

- Search rows in evidence JSON.
- Search concept summaries.
- Report appendix tables.

Where results appear in reports:

- Executive summary as qualitative customer-finding strength.
- Reference appendix tables with exact measurements.
- Scorecard for earlier combined reports.

Observed results:

- High Country GEN-011: 175 examples, search average 94, strong search rate 95%.
- Dress Up GEN-012: 70 examples, search average 93, strong search rate 96%.
- High Country GEN-010 bounded scorecard: search 100.

Limitations:

- This is a public-evidence proxy, not a calibrated relevance benchmark.
- Result count parsing is site-specific.
- Product-title extraction can miss content rendered outside normal anchors.
- Search success after Enter does not prove low customer effort before Enter.

Improvement opportunities:

- Add expected top products/categories per query.
- Add precision@k, MRR, NDCG, and recall proxy metrics.
- Add query volume weighting when internal logs are available.

## Experiment 7: Autocomplete And Suggest Evaluation

Purpose:
Determine whether shoppers receive useful product-finding guidance before pressing Enter.

Required inputs:

- Same query set or typed prefixes.
- Suggest endpoint or visible autocomplete UI selector.
- Relevance terms.

Setup:

- Shopify-style targets use `/search/suggest.json?q=...&resources[type]=product,collection,query,page`.
- Boxercraft browser checks use visible autocomplete screenshots for selected queries.

Steps:

1. Request suggestions for each query or prefix.
2. Capture product, collection, query, and page suggestions.
3. Compare product suggestions to relevance terms.
4. Score autocomplete response.
5. Compare search and autocomplete strength for uniformity.

Evidence collected:

- Suggest endpoint URL.
- Products, collections, queries, pages.
- Response status.
- Relevant product count.
- First relevant product flag.
- Empty/no assistance state.

Metrics/scoring:

- Autocomplete score from 0-100.
- Autocomplete band.
- Strong autocomplete rate.
- No-autocomplete rate.
- Uniform search/autocomplete rate.
- Search-strong/autocomplete-weak count.

Expected outputs:

- Suggest rows in evidence JSON.
- Autocomplete concept summaries.
- Report appendix tables.

Where results appear in reports:

- Executive narrative as early product-finding friction.
- Reference tables with exact autocomplete values.
- Scorecard for earlier combined reports.

Observed results:

- High Country GEN-011: autocomplete average 45, no-autocomplete rate 50%, uniform rate 43%.
- Dress Up GEN-012: autocomplete average 52, no-autocomplete rate 39%, uniform rate 41%.
- High Country GEN-010 corrected `camp` autocomplete using public Shopify suggest API, matching the user-observed dropdown.

Limitations:

- API-backed suggestions may not exactly match visible dropdown behavior.
- Full visible autocomplete dropdown screenshots across all protected queries are not captured for High Country or Dress Up.
- Suggest collection labels are not proof of navigable category architecture.

Improvement opportunities:

- Add full visible desktop/mobile autocomplete capture for protected query samples.
- Compare API and UI output directly.
- Add latency and keystroke-by-keystroke checks.

## Experiment 8: Protected IR Concept Matrix

Purpose:
Evaluate common product-finding language patterns across reusable concepts instead of relying on ad hoc queries.

Required inputs:

- Vertical query pack.
- Query intent, reason, and relevance terms.
- Search and autocomplete adapter.

Setup:

- Query groups are hand-authored in target scripts.
- Concepts vary by vertical.

Steps:

1. Define concept groups and queries.
2. Run submitted search experiment.
3. Run autocomplete/suggest experiment.
4. Aggregate by concept.
5. Preserve row-level evidence.

Evidence collected:

- Per-query search and autocomplete evidence.
- Per-concept explanations.
- Per-concept reasons why it matters.

Metrics/scoring:

- Concept search average.
- Concept autocomplete average.
- Uniform rate where available.
- Strong/no-assistance counts.

Expected outputs:

- `expanded-ir-evidence` JSON.
- Concept summary sections in owner report JSON/Markdown/PDF.

Where results appear in reports:

- Executive pages summarize the business meaning.
- Full query rows appear in references/appendix.

Observed concept groups:

- High Country GEN-011: Normalization, Tokenization, Synonyms, Ranking And Field Weighting, Query Expansion, Document Enrichment, Spanish/Bilingual Discovery.
- Dress Up GEN-012: Normalization, Tokenization, Customer Language, Ranking And Field Weighting, Query Expansion, Product Attribute Coverage, Spanish/Bilingual Discovery.
- Boxercraft GEN-004: quarter-zip variants, women's fleece variants, UCLA/Bruins priority terms, team aliases, color/product terms, public wholesale SKU variants.

Observed results:

- High Country strongest search/autocomplete gaps were Query Expansion, Document Enrichment, and Spanish/Bilingual Discovery autocomplete.
- Dress Up strongest autocomplete gaps were Query Expansion and Spanish/Bilingual Discovery.

Limitations:

- Query packs are hand-authored and not log-derived.
- Scores are heuristic.
- Spanish/bilingual coverage is public-query evidence, not a full localization assessment.

Improvement opportunities:

- Build reusable vertical query packs.
- Add a query-pack review checklist with expected relevance labels.
- Add bilingual/native-speaker validation before external market-access claims.

## Experiment 9: Same-Query Peer/Competitor Benchmark

Purpose:
Use comparable retailers as reference implementations without turning the executive report into a competitor ranking.

Required inputs:

- Peer/competitor list.
- Same target query set.
- Peer search URL builders.
- Peer suggest endpoint behavior if available.

Setup:

- High Country peers: Public Lands attempted, Half-Moon Outfitters and Mast General Store usable.
- Dress Up peers: Red Dress, Pink Lily, Impressions.
- Boxercraft competitor benchmark uses a separate pricing/discovery script.

Steps:

1. Run each protected query on each peer.
2. Capture rendered search rows.
3. Capture public suggest/autocomplete rows.
4. Retry/back off for rate limits where script supports it.
5. Aggregate by site and concept.
6. Preserve full peer row tables.

Evidence collected:

- Peer search result count and product titles.
- Peer suggest products/collections/queries/pages.
- Usable/unusable row status.
- Blocked site status.
- Concept-level peer summaries.

Metrics/scoring:

- Usable search row count.
- Usable autocomplete row count.
- Search average.
- Autocomplete average.
- Strong rates.
- Concept averages.

Expected outputs:

- `competitor_query_benchmark` in evidence JSON.
- Peer reference tables in report appendix.

Where results appear in reports:

- Executive narrative mentions peer/reference analysis qualitatively.
- Appendix tables show exact values.

Observed results:

- High Country: target search 94/autocomplete 45; Half-Moon search 99/autocomplete 38; Mast search 84/autocomplete 37.
- Dress Up: target search 93/autocomplete 52, with Red Dress, Pink Lily, and Impressions as boutique peers in appendix tables.

Limitations:

- This supports public search/autocomplete comparison only.
- It does not support market share, ad spend, organic-only ranking, or broad competitor superiority.
- It does not include competitor browse/category navigation for High Country.

Improvement opportunities:

- Add same-category competitor browse benchmark.
- Formalize a competitor selection/handoff schema.
- Keep executive pages qualitative while preserving exact appendix evidence.

## Experiment 10: Browse/Category Navigation Sample

Purpose:
Determine whether shoppers can find products without using search.

Required inputs:

- Collection handles or discovered category URLs.
- Public product feed or rendered category pages.
- Browser access.

Setup:

- High Country GEN-010 samples selected public collection handles.
- Boxercraft GEN-007 generalizes deeper all-node parity for Boxercraft only.

Steps:

1. Fetch collection product samples.
2. Render selected category pages.
3. Extract product links and filter groups.
4. Record category names, product counts, and navigability.

Evidence collected:

- Collection URL/handle.
- Product sample count.
- Product title samples.
- Rendered category screenshot.
- Product link count.
- Filter groups.

Metrics/scoring:

- Browse score in High Country combined report.
- Product sample count by handle.
- Rendered collection product link count.
- Category coverage observations.

Expected outputs:

- Browse section in evidence JSON.
- Rendered category screenshots.
- Browse scorecard row or reference evidence.

Where results appear in reports:

- Browse/category findings.
- Product discovery scorecard.
- Evidence appendix.

Observed results:

- High Country GEN-010: browse score 90.
- High Country: 12/14 sampled browse collections returned products; 3/3 rendered collection pages exposed product links.
- High Country: rendered collection pages exposed 9 filter groups including location-inventory filters.

Limitations:

- Current High Country peer benchmark lacks comparable competitor category evidence.
- Current browse sampling is not all-node for High Country or Dress Up.

Improvement opportunities:

- Generalize all-node browse enumeration beyond Boxercraft.
- Add peer browse/category capture before making cross-site browse claims.

## Experiment 11: Browse/Search/Autocomplete Node Parity

Purpose:
Find mismatches where browse exposes products search misses, or search/autocomplete exposes products browse hides.

Required inputs:

- Public collection enumeration.
- Collection product feeds.
- Search endpoint returning product payloads.
- Autocomplete endpoint returning product suggestions.

Setup:

- Implemented for Boxercraft GEN-007 using Shopify collections and Boost Commerce APIs.

Steps:

1. Discover public collections.
2. Classify node type: category, fan shop, campaign/merchandising, global catalog, empty.
3. Derive query from collection title/handle.
4. Fetch browse products.
5. Fetch search products.
6. Fetch autocomplete products.
7. Compare product handles across surfaces.

Evidence collected:

- Node title, handle, type, and query.
- Browse product set.
- Search product set.
- Autocomplete product set.
- Search-only, browse-only, autocomplete-only products.

Metrics/scoring:

- Core nodes evaluated.
- Exact search/browse match count and rate.
- Search-only product count.
- Browse-only product count.
- Autocomplete browse-hit count.
- Browse products missing autocomplete.

Expected outputs:

- `assessments/boxercraft/browse-node-parity/GEN-007/browse-node-parity.json`
- `assessments/boxercraft/browse-node-parity/GEN-007/browse-node-parity.md`

Where results appear in reports:

- Boxercraft browse-node parity report section.
- Client-facing PDF page after GEN-007.

Observed results:

- 96 public collections discovered.
- 93 non-empty nodes evaluated.
- 60 core category/fan-shop nodes scored.
- 5/60 exact search/browse parity.
- 47/60 core nodes had no autocomplete browse-product hit.

Limitations:

- Current implementation is Boxercraft/Boost-specific.
- Autocomplete parity means suggestion coverage, not full search recall.

Improvement opportunities:

- Make this a platform adapter in the reusable workflow.
- Add this experiment for High Country, Dress Up, and future sites.

## Experiment 12: Filter And Faceted Navigation Check

Purpose:
Assess whether shoppers can narrow large product sets efficiently.

Required inputs:

- Rendered category/search pages with filters.
- Browser access and DOM selectors.

Setup:

- High Country extracts `input[name^="filter"]` and `select[name^="filter"]`.
- Boxercraft browser evidence includes rendered filter screenshots.

Steps:

1. Render category or search page.
2. Extract filter inputs and select controls.
3. Group filters by name.
4. Record sample values.
5. Score or describe filter coverage.

Evidence collected:

- Filter group names.
- Filter sample values.
- Screenshots.
- Sort/filter controls.

Metrics/scoring:

- Filter group count.
- Presence of location inventory filter.
- Filters score in High Country scorecard.

Expected outputs:

- Filter groups in rendered evidence JSON.
- Filter scorecard row.

Where results appear in reports:

- Filters scorecard row.
- Browse/category findings.
- Evidence appendix.

Observed results:

- High Country GEN-010 filters score 88.
- High Country rendered category pages exposed 9 filter groups.

Limitations:

- Multi-select, persistence, dead-end filters, sort interactions, and mobile filter behavior are not systematically tested.

Improvement opportunities:

- Add interactive filter scenarios.
- Add filter persistence and dead-end detection.

## Experiment 13: Recommendations And Merchandising Check

Purpose:
Assess whether the site helps shoppers discover additional products beyond direct search or category browsing.

Required inputs:

- Homepage, collection pages, and product pages.
- Browser access.

Setup:

- High Country checks visible merchandising signals.
- Boxercraft browser validator checks product recommendations.

Steps:

1. Render homepage, collection pages, and product pages where applicable.
2. Extract visible merchandising text and controls.
3. Detect sale, staff pick, new arrival, quick add, recommendation, and related-product signals.
4. Record depth and caveats.

Evidence collected:

- Merchandising text checks.
- Product links.
- Recommendation section evidence.
- Screenshots.

Metrics/scoring:

- High Country recommendations score.
- Presence/absence of merchandising and recommendation signals.

Expected outputs:

- Recommendations/merchandising score row.
- Report caveats.

Where results appear in reports:

- Scorecard or evidence references.
- Recommendations/related discovery findings.

Observed results:

- High Country GEN-010 recommendations/merchandising score 68.
- The report states recommendation depth was sampled but not exhaustively validated.

Limitations:

- This is a shallow lane today.
- No systematic relevance, diversity, cross-sell, or personalization evaluation exists.

Improvement opportunities:

- Add product-detail recommendation relevance tests.
- Add cross-sell and bundle/alternative product scenarios.

## Experiment 14: Cart, Policy, Support, And Purchase-Adjacent Flow Check

Purpose:
Verify that a shopper can move from product discovery toward trust and purchase-adjacent paths without completing a transaction.

Required inputs:

- Public product with available variant.
- Cart endpoint or add-to-cart controls.
- Support/policy URLs.

Setup:

- High Country cart and policy checks are in `scripts/evaluate-highcountryoutfitters-ecommerce.mjs`.

Steps:

1. Select a sampled product/variant.
2. Add to cart or read cart state.
3. Render cart page.
4. Render policy/support pages.
5. Extract contact, shipping, return, refund, location, and form evidence.

Evidence collected:

- Cart add/read status.
- Cart screenshot.
- Policy page screenshots.
- Contact/shipping/return/location signals.
- Relevant links and forms.

Metrics/scoring:

- Cart add/read success.
- Presence of support/trust signals.
- Mobile score includes search/cart visibility.

Expected outputs:

- Cart section in evidence JSON.
- Policy page section in evidence JSON.
- Scorecard/mobile/trust-support findings.

Where results appear in reports:

- Evidence limits.
- Support/policy/cart findings.
- Customer confidence narrative.

Observed results:

- High Country public cart add/read succeeded.
- Checkout completion was not attempted.
- Return app path returned 403 publicly, while policy page evidence was usable.

Limitations:

- Checkout, pickup selection, payment, order placement, return app flow, account login, and authenticated workflows are out of scope without authorization.

Improvement opportunities:

- Add authorized checkout/pickup/return validation when approved.
- Add non-purchase cart journey screenshots for future outreach reports.

## Experiment 15: Mobile Product-Finding Check

Purpose:
Validate that the product-finding experience is at least visible and usable on mobile.

Required inputs:

- Mobile viewport.
- Homepage/search/category/autocomplete pages.

Setup:

- High Country renders mobile homepage.
- Boxercraft rendered browser evidence includes mobile homepage, autocomplete, and filters.

Steps:

1. Launch mobile viewport.
2. Render target pages.
3. Capture screenshot.
4. Check for search/cart/product-finding controls.
5. Extract mobile text checks.

Evidence collected:

- Mobile screenshot.
- Search/cart visibility.
- Mobile filter/autocomplete evidence where tested.

Metrics/scoring:

- Mobile experience score.
- Presence/absence checks for search and cart.

Expected outputs:

- Mobile rendered evidence.
- Mobile score row.

Where results appear in reports:

- Mobile experience scorecard row.
- Evidence appendix.

Observed results:

- High Country GEN-010 mobile score 74.
- Boxercraft GEN-003 includes mobile evidence for homepage, autocomplete, and filters.

Limitations:

- High Country/Dress Up do not have full protected-query mobile journeys.
- Mobile checkout is not validated.

Improvement opportunities:

- Add mobile search/autocomplete/category journey tests to the protected query pack.

## Experiment 16: Competitor Pricing, Assortment, And Discovery Benchmark

Purpose:
Compare public assortment, pricing transparency, and discovery behavior for comparable stores.

Required inputs:

- Competitor sites.
- Shared categories.
- Discovery queries.
- Public catalog feed or rendered browser evidence.

Setup:

- Implemented for Boxercraft GEN-006.
- Sites: Boxercraft, L2 Brands, Colosseum Athletics, Concepts Sport, Fanatics.
- Categories include flannel pants, lounge pants/joggers/sweatpants, quarter zips, fleece tops, women's fleece, UCLA/Bruins.

Steps:

1. Fetch public catalog feeds where available.
2. Classify products into benchmark categories.
3. Extract public price ranges.
4. Run rendered search samples.
5. Run autocomplete samples.
6. Render browse samples.
7. Summarize discovery and pricing by site.

Evidence collected:

- Public catalog products.
- Price ranges.
- Search relevance.
- Autocomplete relevance.
- Browse validation.
- Screenshots.

Metrics/scoring:

- Product count.
- Priced product count.
- Variant price count.
- Min/max/median price.
- Search score.
- Autocomplete score.
- Browse score.
- Pricing transparency score.
- Overall discovery score.

Expected outputs:

- `assessments/boxercraft/competitor-evidence/GEN-006/competitor-pricing-discovery.json`
- `assessments/boxercraft/competitor-evidence/GEN-006/competitor-pricing-discovery.md`
- Competitor screenshots.

Where results appear in reports:

- Boxercraft competitor benchmark page.
- Report evidence references and limitations.

Observed results:

- Boxercraft overall 78, search 88, autocomplete 50, browse 85.
- Colosseum overall 55.
- L2 Brands overall 46.
- Concepts Sport and Fanatics were low-comparability automated results.

Limitations:

- Concepts Sport and Fanatics need manual or alternate-source validation before strong claims.
- Fanatics is a marketplace benchmark, not a direct brand-owned catalog.

Improvement opportunities:

- Generalize competitor selection and platform adapters.
- Separate direct-brand, marketplace, and local/regional benchmark classes.

## Experiment 17: Local Buyer / Website-Growth Fusion Brief

Purpose:
Combine ecommerce discovery evidence with local website-growth evidence for a specific buyer scenario.

Required inputs:

- Ecommerce discovery evidence.
- Local website benchmark or upstream assessment.
- Concrete buyer problem.

Setup:

- Implemented for Boxercraft local-school PTA scenario.

Steps:

1. Identify buyer problem.
2. Reuse ecommerce discovery evidence.
3. Add local visibility/trust/message/lead path context.
4. Generate a concise executive brief.
5. Validate that the visible report matches the requested framing.

Evidence collected:

- Ecommerce search/autocomplete/browse gaps.
- Local visibility and trust signals.
- Buyer-journey problem chain.

Metrics/scoring:

- Underlying structured evidence preserves scores.
- Visible GEN-009 report intentionally removed visible scores/proposal language.

Expected outputs:

- `assessments/boxercraft/local-school-opportunity/GEN-008/evidence-summary.json`
- `boxercraft-local-school-pta-opportunity-report.pdf`

Where results appear in reports:

- Local-school PTA opportunity/problem brief.

Limitations:

- Stakeholder-supplied local context needs verification before external claims.

Improvement opportunities:

- Define a reusable "buyer scenario" input contract.
- Keep score visibility configurable by report objective.

## Experiment 18: Executive Report Generation And PDF Validation

Purpose:
Convert technical evidence into an executive-ready report that starts a business conversation.

Required inputs:

- Evidence JSON.
- Report JSON/Markdown generation.
- LaTeX source.
- Target-specific executive framing.

Setup:

- High Country and Dress Up reports are generated from target scripts into JSON/Markdown/LaTeX/PDF artifacts.
- Recent report style keeps the target site as the hero, competitors as reference implementations, and exact measurements in appendices.

Steps:

1. Build report JSON from evidence.
2. Build Markdown or LaTeX.
3. Compile PDF with `latexmk`.
4. Extract text with `pdftotext`.
5. Check PDF metadata with `pdfinfo`.
6. Render selected pages with `pdftoppm`.
7. Scan for required and disallowed language.

Evidence collected:

- Report source.
- PDF artifact.
- Extracted text.
- Rendered page images.
- Validation run records.

Metrics/scoring:

- PDF page count.
- Required text presence.
- Disallowed stale framing absence.
- Layout spot-check result.
- Validation Gate pass count.

Expected outputs:

- Client-facing PDF.
- LaTeX source in `reports/`.
- Report JSON/Markdown under `assessments/`.
- Validation records.

Where results appear in reports:

- Entire client-facing report.

Observed results:

- Dress Up PDF is 20 pages and validated in `VAL-048`.
- High Country PDF reached 30 pages after same-query competitor refinement and executive narrative/design updates.

Limitations:

- PDF validation is mostly text and spot-render based, not full automated geometry validation.
- Current framework validator does not fully generalize Dress Up report validation.

Improvement opportunities:

- Add target-agnostic report validator.
- Add automated page geometry checks for whitespace, overlap, and table overflow.

## Current Evidence Snapshot

High Country GEN-010 combined ecommerce report:

- Search score: 100.
- Autocomplete score: 78.
- Browse score: 90.
- Filters score: 88.
- Recommendations score: 68.
- Mobile score: 74.
- Overall score: 83.
- Key evidence: 12 search pages, 14 browse handles, 569 public collections, rendered categories, policy/support/cart/mobile evidence.

High Country GEN-011 expanded IR:

- 175 examples.
- Search average: 94.
- Autocomplete average: 45.
- Strong search rate: 95%.
- Strong autocomplete rate: 43%.
- No-autocomplete rate: 50%.
- Uniform experience rate: 43%.
- Spanish/bilingual autocomplete average: 0.
- Same-query peers: Half-Moon Outfitters and Mast General Store.

Dress Up GEN-012:

- 70 examples.
- Search average: 93.
- Autocomplete average: 52.
- Strong search rate: 96%.
- Strong autocomplete rate: 41%.
- No-autocomplete rate: 39%.
- Uniform experience rate: 41%.
- Spanish/bilingual search average: 93.
- Spanish/bilingual autocomplete average: 0.
- Peers: Red Dress, Pink Lily, Impressions.

Boxercraft GEN-007 parity:

- 96 public collections discovered.
- 93 non-empty nodes evaluated.
- 60 core category/fan-shop nodes scored.
- 5/60 exact search/browse parity.
- 47/60 core nodes had no autocomplete browse-product hit.

## Current Gaps And Blockers

No blocker prevents this handoff from answering the question.

Gaps that matter before improving the ecommerce evaluation:

1. Target-specific scripts:
   - Evaluators are hardcoded by target instead of manifest-driven.

2. Missing reusable target manifest:
   - No canonical file defines target, platform, query pack, peer list, upstream artifacts, output paths, and report style.

3. Missing formal ecommerce-target-intelligence output:
   - No completed local handoff exists for generic competitor selection or competitor browse/category evidence.

4. Competitor browse/category gap:
   - High Country peer evidence covers search/autocomplete, not category architecture, product counts, facets, mobile browse, or store inventory paths.

5. Autocomplete UI gap:
   - High Country and Dress Up rely mostly on suggest API evidence, not full visible dropdown screenshots.

6. Scoring calibration gap:
   - Scores are bounded heuristics, not calibrated IR metrics with expected relevant products.

7. Internal analytics gap:
   - No search logs, conversion data, add-to-cart rate, AOV, revenue, inventory, or customer data is available.

8. Filter/recommendation depth gap:
   - Filter interactions and recommendation relevance are shallow compared with search/autocomplete.

9. Checkout/pickup/return gap:
   - Public cart is checked; full purchase-adjacent workflows are not completed.

10. Validation gap for Dress Up/generic reports:
   - Dress Up has validation records, but no dedicated `package.json` script or generic validator equal to High Country's validator.

11. MDE metadata drift:
   - `.mde/state.json` is current at GEN-012, but several other MDE files still mention GEN-011 or older phases.

## Recommended Next Experiments To Add

1. Reusable target manifest:
   - Define target identity, platform adapter, query pack, peer list, report outputs, upstream inputs, and evidence limits.

2. Platform adapter layer:
   - Start with Shopify, Boost Commerce, generic rendered search, and generic visible autocomplete.

3. Vertical query packs:
   - Build packs for boutique apparel, outdoor retail, grill/outdoor cooking, licensed apparel, B2B/wholesale, and home goods.

4. Calibrated relevance benchmark:
   - Add expected relevant products/categories, precision@k, MRR, NDCG, and pass/fail thresholds.

5. Same-category competitor browse benchmark:
   - Capture category URLs, labels, product counts, product samples, filters, mobile browse, and screenshots for target and peers.

6. Visible autocomplete UI benchmark:
   - Capture desktop/mobile dropdown screenshots and compare visible suggestions with API suggestions.

7. Generalized browse/search/autocomplete parity:
   - Move Boxercraft GEN-007 parity logic into the reusable evaluator.

8. Zero-result and recovery suite:
   - Test typos, alternates, no-result controls, suggested categories, query rewrites, and recovery links.

9. Interactive filter/facet suite:
   - Test multi-select, persistence, sort, dead-end filters, mobile filters, and reset behavior.

10. Recommendation relevance suite:
   - Evaluate product-detail related products, cross-sell fit, diversity, seasonal fit, and substitute products.

11. Customer journey scenarios:
   - Capture step count and friction for tasks such as "find a wedding guest dress under $100" or "find grill replacement parts."

12. Analytics-ready impact model:
   - Define optional fields for query volume, search-session share, zero-result rate, conversion, add-to-cart, AOV, and revenue.

13. Generic report validator:
   - Validate evidence shape, report shape, appendix preservation, executive tone, peer framing, exact-score placement, and stale phrase exclusions.

14. MDE metadata cleanup:
   - Bring strategy, findings, failing BDDs, validator effectiveness, and project metadata up to the current GEN-012 status before the next implementation generation.

## Recommended Operator Next Step

Start by creating a reusable `target manifest + adapter + query pack` design. The current evaluation process has enough proven experiments to become reusable, but the operational friction is that the experiments are distributed across target-specific scripts and report generators.

The next implementation should not begin by adding another site-specific script. It should first make the target inputs explicit, then port the strongest current experiments into a reusable runner:

- submitted search
- autocomplete/suggest
- protected concept matrix
- same-query peer benchmark
- browse/category sampling
- rendered page capture
- evidence/report generation
- validation
