# Reusable Ecommerce Evaluator Design Handoff

Date: 2026-07-08
Project: Ecommerce Evaluation Reports (`ecommmerce-eval`)
Repository: `/Users/feroshjacob/code/ecommmerce-eval`
Stream: `stream_mra8o4fq_47ae08ab`
Plan: `plan_mrbjpvzg_9b041524`

## Changelog

Every future edit to this design doc must add a dated entry here so the change is a reviewable diff against the frozen baseline.

- **2026-07-13 — Frozen baseline.** Operator approved the evaluator design (core architecture freeze, platform capability self-check layer, resumable checkpointed runs). This revision is committed to git as the frozen GEN-013 design baseline together with the review packet `stream_mra8o4fq_47ae08ab_design_review_packet_latest_changes.md`. No design content was changed in this commit beyond adding this changelog section.
- **2026-07-12 — Review packet extracted.** Latest-changes review packet created covering the Inspection Platform theme: architecture freeze, checkpoint architecture, capability registry/report/dependency graph, incremental platform validation, validation suite, maturity model, timeline, metrics, and the Generation 14 planning rule.
- **2026-07-08 — Initial design handoff.** Design-only handoff written from GEN-010–GEN-012 evidence: target manifest, adapter layer, query-pack schema, evidence layout, migration path, and the Recommended First Implementation Task.

## Status

This is a design-only handoff. No evaluator implementation was added in this step.

The current project mission is Generation 13: make the evidence-first Inspection Report the canonical artifact for ecommerce evaluation. The next implementation should therefore build reusable inspection inputs and evidence contracts first, then generate executive or competitor reports from the Inspection Report rather than inspecting the website again.

No cross-project artifact is required to complete this design. The repo contains enough local evidence to design the target manifest, adapter layer, query-pack schema, evidence layout, and migration path. `local-website-growth-assessment` is locally evidenced as an optional High Country input. `ecommerce-target-intelligence` is mentioned only as a future/desired source for stronger competitor evidence; no completed local artifact is present.

## Files Inspected

- `MISSION.md`
- `.mde/state.json`
- `.mde/validation-strategy.json`
- `.mde/handoffs/stream_mra8o4fq_47ae08ab_ecommerce_evaluation_experiments.md`
- `package.json`
- `scripts/evaluate-highcountryoutfitters-expanded-ir.mjs`
- `scripts/evaluate-dressup-expanded-ir.mjs`
- `scripts/evaluate-boxercraft-browse-node-parity.mjs`
- `scripts/evaluate-highcountryoutfitters-ecommerce.mjs`
- `scripts/evaluate-competitor-pricing-discovery.mjs`
- `scripts/validate-framework.mjs`
- Existing assessment outputs referenced by the experiment-inventory handoff for High Country, Dress Up, and Boxercraft.

## Commands Run

- `sed -n '1,240p' /Users/feroshjacob/code/codex-skills/skills/mission-driven-engineering/SKILL.md`
- `sed -n '1,260p' MISSION.md`
- `sed -n '1,260p' .mde/state.json`
- `sed -n '1,320p' .mde/handoffs/stream_mra8o4fq_47ae08ab_ecommerce_evaluation_experiments.md`
- `sed -n '321,760p' .mde/handoffs/stream_mra8o4fq_47ae08ab_ecommerce_evaluation_experiments.md`
- `sed -n '760,1540p' .mde/handoffs/stream_mra8o4fq_47ae08ab_ecommerce_evaluation_experiments.md`
- `sed -n '1,260p' package.json`
- `sed -n '1,260p' .mde/validation-strategy.json`
- `sed -n '1,220p' scripts/evaluate-highcountryoutfitters-expanded-ir.mjs`
- `sed -n '1,220p' scripts/evaluate-dressup-expanded-ir.mjs`
- `sed -n '1,260p' scripts/evaluate-boxercraft-browse-node-parity.mjs`
- `rg -n "const GEN|const TARGET|const TEST_GROUPS|const COMPETITORS|function scoreSearch|function scoreAutocomplete|function scoreFromEvidence|function summarizeDiscovery|function buildFindings|const matrix|const sites|const categories|const discoveryQueries|const requiredFiles|search/suggest|products.json|collections.json|screenshots" scripts .mde/handoffs assessments -g '*.mjs' -g '*.json' -g '*.md'`

Validation command after writing:

- `git diff --check`

Skipped:

- No live ecommerce recrawl.
- No Playwright run.
- No `npm run validate`.
- No PDF generation.
- No Control Center update.

## Source Evidence Summary

The current reusable pattern is proven but hardcoded:

- High Country and Dress Up scripts embed target identity, output paths, query packs, peer lists, search URL builders, scoring, evidence generation, report generation, and PDF source creation in one file per target.
- Boxercraft browse-node parity proves a stronger catalog/browse/search/autocomplete consistency experiment, but it is specific to Shopify collections plus Boost Commerce APIs.
- High Country GEN-010 proves rendered page capture, Shopify catalog feeds, browse category sampling, filters, cart, policy, support, mobile homepage, and report validation.
- High Country GEN-011 and Dress Up GEN-012 prove protected concept matrices, submitted search evaluation, autocomplete/suggest evaluation, and same-query peer benchmarks.
- Existing reports mix inspection, scoring, interpretation, and executive language. GEN-013 mission requires separating inspection from downstream interpretation.

## Design Goal

Create a reusable ecommerce evaluator that accepts:

1. An evaluation manifest as the runnable entry point.
2. A target manifest that describes the retailer/site.
3. A reusable site profile produced by discovery.
4. One or more query packs.
5. Platform/surface plugins.

It should produce:

1. Raw evidence artifacts and screenshots.
2. An Inspection Model that aggregates statistics, confidence, limitations, timelines, and coverage.
3. A canonical Inspection Report JSON.
4. A human-readable Inspection Report Markdown.
5. Optional downstream report inputs.

The evaluator should not produce recommendations, business impact, or consulting narrative inside the Inspection Report. Those belong to downstream executive-report, competitor-report, proposal, and presentation generators.

## Platform Philosophy

The Ecommerce Evaluator should be viewed as an Inspection Platform, not simply a report generator.

The platform has three major responsibilities:

1. Execute trustworthy ecommerce inspections.
2. Produce reusable evidence.
3. Generate business-facing reports from that evidence.

The architecture must preserve this separation:

```text
Inspection Platform
  +-- Inspection Dashboard
  +-- Inspection Report
  +-- Executive Report
  +-- Competitor Report
  +-- Proposal
  +-- Presentation
```

The Inspection Report remains the canonical evidence artifact.

The Dashboard remains the evaluator's operational workspace.

Downstream reports remain interpretation/export layers generated from the Inspection Model and Inspection Report evidence, not from new site inspection.

Guiding principle:

Every platform improvement should improve at least one of these areas:

- Platform capability.
- Inspection reliability.
- Evidence quality.
- Evaluator productivity.

The goal is not only to generate better Inspection Reports. The goal is to make the platform itself progressively more capable while reducing the cost of discovering and fixing new platform limitations.

Every new retailer inspected should strengthen the platform for all future retailers rather than creating one-off fixes.

## Core Architecture Freeze

The GEN-013 core architecture should now be treated as stable.

Core concepts:

- Workspace.
- Evaluation Manifest.
- Target Manifest.
- Site Profile.
- Platform Validation.
- Platform Capability Registry.
- Platform Capability Report.
- Platform Capability Maturity.
- Plugin Architecture.
- Plugin Dependency Graph.
- Inspection History.
- Checkpoints.
- Artifact Explorer.
- Inspection Model.
- Inspection Report.
- Dashboard.

Future work should focus primarily on implementation and learning from real ecommerce inspections instead of introducing additional architectural concepts.

Design implication:

- New implementation work should fit inside the current architecture.
- New platform capabilities should be added to the Platform Capability Registry.
- New inspection behavior should be added through plugins, adapters, query packs, or platform validation lanes.
- New reports should consume the Inspection Model and Inspection Report evidence.
- Any future architecture change should be justified by observed inspection failures across real ecommerce sites, not anticipated requirements.

## Platform Evolution Strategy

The platform should improve through reusable capabilities rather than retailer-specific fixes.

Every inspection should contribute to platform maturity.

Desired platform evolution loop:

```text
Run Inspection
        |
        v
Platform Gap?
        |
       Yes
        |
        v
Create Platform Capability
        |
        v
Implement Capability
        |
        v
Run Platform Validation
        |
        v
Resume Inspection
        |
        v
Update Capability Registry
```

Preferred workflow when inspecting a new retailer:

```text
Retailer Inspection
        |
        v
Platform Limitation
        |
        v
Reusable Capability
        |
        v
Platform Validation
        |
        v
Resume Inspection
        |
        v
All Future Retailers Benefit
```

When an inspection fails, the first question should be:

```text
What reusable platform capability is missing?
```

Only after platform capability is ruled out should the evaluator treat the issue as observed ecommerce behavior.

## Architecture Improvements Incorporated

The design should incorporate the architecture improvements supplied after the first handoff:

- Add an Evaluation Manifest so one target can support many run types, such as baseline inspection, regression inspection, executive assessment, peer benchmark, autocomplete-only validation, and search-only validation.
- Separate Discovery from Inspection. Discovery produces a reusable `site-profile.json`; inspection consumes that profile instead of rediscovering every endpoint on every run.
- Add an Inspection Model layer between raw evidence and reports.
- Convert experiments into surface-oriented plugins.
- Add an inspection execution timeline.
- Separate infrastructure limitations from commerce observations.
- Record confidence per observation, not only per section.
- Version every major input and runtime component.
- Track dataset provenance row by row.
- Expand the Inspection Dashboard into an operational dashboard.
- Add a stable Inspection ID referenced by every evidence file.
- Generalize plugins around commerce surfaces, including future AI search, chat assistant, visual search, voice search, recommendation, personalization, MCP catalog discovery, and UCP discovery surfaces.
- Add Inspection History as the primary navigation model for completed and in-progress runs.
- Add plugin dependency metadata so the evaluator builds an execution graph instead of using hardcoded order.
- Add an Artifact Explorer for evidence, reports, datasets, screenshots, raw HTTP, raw HTML, timeline, and Inspection Model outputs.
- Support resumable inspections and selected-plugin reruns.
- Add plugin-level caching for expensive catalog, rendered-crawl, and peer benchmark work.
- Treat the dashboard as the primary operational product; reports are exports generated from dashboard/Inspection Model state.
- Add dashboard actions that invoke reusable workflows instead of individual scripts.
- Introduce Inspection Workspaces above evaluations so related targets, evaluations, query packs, peer sets, evidence, and reports share a logical boundary.
- Reserve an optional future `agents/` namespace for autonomous or semi-autonomous inspection agents.
- Add an Evidence Quality model separate from confidence.
- Treat the evaluator as an Inspection Platform, with platform capability validation before retailer inspection.
- Separate Platform Capability gaps from ecommerce findings.
- Add a Platform Capability Report describing what the evaluator can reliably inspect.
- Add a Platform Validation Suite that runs before real ecommerce inspections.
- Track platform capability maturity by level.
- Add checkpoint architecture so inspection runs can resume without repeating completed work.
- Freeze the GEN-013 core architecture and move future improvements into implementation and observed inspection learning.
- Separate the long-lived Platform Capability Registry from generated Platform Capability Reports.
- Add a Platform Capability Dependency Graph for impact analysis and incremental validation.
- Add Platform Capability Timeline and platform metrics so platform progress is measured separately from retailer evaluations.

## Proposed Directory Layout

```text
workspaces/
  retail-search-research.json

evaluations/
  ridge-shopify-baseline.json
  shopdressup-boutique-benchmark.json
  highcountry-baseline.json
  highcountry-regression.json

targets/
  ridge.json
  shopdressup.json
  highcountryoutfitters.json
  boxercraft.json

query-packs/
  boutique-apparel.json
  outdoor-retail.json
  licensed-apparel.json
  everyday-carry.json
  grill-outdoor-cooking.json

peer-sets/
  outdoor-retail.json
  boutique-apparel.json
  everyday-carry.json

platform/
  capability-registry.json
  capability-dependency-graph.json
  capability-report.json
  capability-timeline.jsonl
  metrics.json
  validation-suite.json
  maturity-model.json

src/
  evaluator/
    run-inspection.mjs
    evaluation-manifest.mjs
    target-manifest.mjs
    site-profile.mjs
    query-pack.mjs
    evidence-writer.mjs
    inspection-model-builder.mjs
    inspection-report-builder.mjs
    plugin-loader.mjs
    validation.mjs
  dashboard/
    dashboard-model.mjs
    run-actions.mjs
    compare-runs.mjs
    evidence-links.mjs
    history-model.mjs
    artifact-explorer.mjs
    downstream-readiness.mjs
    platform-capability-status.mjs
  adapters/
    shopify.mjs
    boost-commerce.mjs
    rendered-generic.mjs
    ucp-shopify.mjs
  discovery/
    run-discovery.mjs
    platform-detection.mjs
    endpoint-detection.mjs
    block-classification.mjs
  platform-validation/
    run-platform-validation.mjs
    url-parsing.mjs
    https.mjs
    redirects.mjs
    robots.mjs
    shopify-discovery.mjs
    search-endpoint.mjs
    suggest-endpoint.mjs
    rendered-capture.mjs
  plugins/
    submitted-search/
    autocomplete/
    browse/
    facets/
    peer-benchmark/
    recommendation/
    spell-correction/
    semantic-search/
    ucp-discovery/
    mcp-catalog/
  agents/
    search-investigator/
    catalog-investigator/
    facet-investigator/
    peer-investigator/
    report-generator/

site-profiles/
  ridge.com.json
  shopdressup.com.json

inspection-history/
  GEN-013.jsonl

assessments/{target_slug}/inspection-report/{generation}/
  run-manifest.json
  site-profile.json
  inspection-report.json
  inspection-report.md
  evidence/
    checkpoint.json
    crawl-log.jsonl
    timeline.jsonl
    plugin-state.json
    artifact-index.json
    endpoints.json
    catalog-summary.json
    browse-graph.json
    inspection-model.json
    datasets/
      ds1-canonical-search.json
      ds2-normalization.json
      ds3-search-facet.json
      ds4-advanced-retrieval.json
    experiments/
      submitted-search.jsonl
      autocomplete.jsonl
      browse-sampling.jsonl
      browse-parity.jsonl
      facets.jsonl
      rendered-pages.jsonl
      peer-benchmark.jsonl
    raw/
      http/
      api/
      html/
    screenshots/
```

## Evaluation Manifest Design

Purpose: represent a specific run plan. The same target can have multiple evaluations without duplicating target identity or platform configuration.

Examples:

- Baseline inspection.
- Regression inspection.
- Executive assessment input.
- Same-query peer benchmark.
- Autocomplete-only validation.
- Search-only validation.
- Browse/facet inspection.

Suggested fields:

```json
{
  "schema_version": "evaluation-manifest-v0.1",
  "evaluation_id": "ridge-shopify-baseline",
  "evaluation_type": "baseline_inspection",
  "inspection_id_strategy": "timestamp",
  "generation": "GEN-013",
  "target": "targets/ridge.json",
  "site_profile": {
    "mode": "reuse_if_fresh",
    "path": "site-profiles/ridge.com.json",
    "max_age_hours": 168
  },
  "query_packs": [
    "query-packs/everyday-carry.json",
    "query-packs/general-shopping.json"
  ],
  "surfaces": [
    "submitted_search",
    "autocomplete",
    "browse",
    "facets",
    "product_pages",
    "recommendations",
    "mobile",
    "peer_benchmark"
  ],
  "plugins": [
    "submitted-search",
    "autocomplete",
    "browse",
    "facets",
    "peer-benchmark"
  ],
  "peer_set": "everyday-carry",
  "rendering": {
    "desktop": true,
    "mobile": true,
    "screenshots": true
  },
  "output": {
    "base_dir": "assessments/ridge/inspection-report/GEN-013"
  }
}
```

Required validation rules:

- `evaluation_id`, `evaluation_type`, `generation`, `target`, `query_packs`, `plugins`, and `output.base_dir` are required.
- Every plugin must exist and expose the required plugin contract.
- Every query pack path must exist.
- The target manifest path must exist.
- Peer benchmark requires either `peer_set` or inline peer configuration.
- The evaluation manifest must declare whether to reuse, refresh, or require a discovery profile.

Entry-point decision:

The evaluator should run from an evaluation manifest, not a target manifest:

```text
npm run inspect:evaluation -- evaluations/ridge-shopify-baseline.json
```

## Discovery Profile Design

Discovery and inspection should be separate phases:

```text
Discovery
        |
        v
site-profile.json
        |
        v
Inspection
        |
        v
Inspection Model
        |
        v
Inspection Report
```

`site-profile.json` should capture reusable site metadata:

- Discovery timestamp.
- Target URL and final resolved URL.
- Platform detection and confidence.
- Robots.txt status and parsed allow/disallow notes.
- `agents.md` status when advertised.
- UCP discovery status and advertised capabilities.
- Cloudflare or traffic-regulation classification.
- Authentication requirements.
- Search endpoints.
- Autocomplete endpoints.
- Catalog endpoints.
- Browse/collection endpoints.
- Product endpoints.
- Facet/inventory/store lookup endpoints when observed.
- Known crawl limitations.
- Adapter candidates and confidence.
- Canonical platform host, such as Ridge's `ridge-wallet.myshopify.com`.

Benefits:

- Repeat inspections are faster.
- Endpoint behavior is easier to debug.
- Regression runs can reuse known endpoints while still recording profile age.
- Blocked discovery is preserved as evidence rather than hidden in failed experiment rows.

Important rule:

Inspection may refresh discovery when the profile is missing, stale, or inconsistent, but the report must record whether it used a reused profile or fresh discovery.

## Inspection Workspace Design

Add a Workspace layer above Evaluation:

```text
Workspace
        |
        v
Evaluation
        |
        v
Inspection
```

Purpose:

- Group related ecommerce inspection programs.
- Keep unrelated targets, query packs, peer sets, evidence, reports, and history separate.
- Prepare the evaluator to support multiple unrelated ecommerce programs without path or state collisions.

Example workspace:

```json
{
  "schema_version": "inspection-workspace-v0.1",
  "workspace_id": "retail-search-research",
  "name": "Retail Search Research",
  "description": "Reusable ecommerce product discovery inspections for regional and specialty retailers.",
  "targets": [
    "targets/highcountryoutfitters.json",
    "targets/shopdressup.json",
    "targets/ridge.json"
  ],
  "evaluations": [
    "evaluations/highcountry-baseline.json",
    "evaluations/shopdressup-boutique-benchmark.json",
    "evaluations/ridge-shopify-baseline.json"
  ],
  "query_packs": [
    "query-packs/outdoor-retail.json",
    "query-packs/boutique-apparel.json",
    "query-packs/everyday-carry.json"
  ],
  "peer_sets": [
    "peer-sets/outdoor-retail.json",
    "peer-sets/boutique-apparel.json"
  ],
  "history_ref": "inspection-history/GEN-013.jsonl"
}
```

Workspace validation should confirm:

- Referenced targets exist.
- Referenced evaluations exist.
- Referenced query packs exist.
- Referenced peer sets exist when listed.
- History file can be created or read.

## Inspection History Design

The dashboard should expose an Inspection History, not only a single current inspection.

Example:

```text
Inspection History

PASS  Dress Up       GEN-013-001  2026-07-08
PASS  High Country   GEN-013-002  2026-07-08
WARN  Ridge          GEN-013-003  2026-07-08
FAIL  Boxercraft     GEN-013-004  2026-07-08
```

Each history row should include:

- `inspection_id`
- `evaluation_id`
- `workspace_id`
- `target`
- `target_slug`
- `timestamp`
- `generation`
- `duration_ms`
- `status`
- `overall_confidence`
- `evidence_quality`
- `evidence_coverage`
- `inspection_model_ref`
- `inspection_report_ref`
- `artifact_index_ref`
- `can_resume`
- `can_compare`
- `can_export`

Supported actions:

- Open.
- Compare.
- Resume.
- Rerun.
- Export.

History should become the primary navigation mechanism for completed and in-progress inspections.

## Target Manifest Design

Purpose: describe the retailer/site once and avoid duplicating target identity across baseline, regression, benchmark, and surface-specific evaluations. Evaluation-level choices belong in the Evaluation Manifest.

Suggested fields:

```json
{
  "schema_version": "target-manifest-v0.1",
  "target_manifest_version": "1.0.0",
  "target": {
    "name": "Dress Up",
    "slug": "dress-up",
    "canonical_url": "https://shopdressup.com/",
    "domain": "shopdressup.com",
    "vertical": "boutique-apparel",
    "locale": "en-US",
    "currency": "USD"
  },
  "platform": {
    "adapter": "shopify",
    "adapter_version_constraint": "^0.1.0",
    "confidence": "known",
    "canonical_platform_host": null,
    "search_url_template": "/search?options%5Bprefix%5D=last&q={query}",
    "suggest_endpoint": "/search/suggest.json",
    "products_endpoint": "/products.json",
    "collections_endpoint": "/collections.json"
  },
  "rate_limits": {
    "request_delay_ms": 250,
    "retry_backoff_ms": 1000,
    "max_attempts": 2
  },
  "upstream_artifacts": {
    "local_website_growth_assessment": [],
    "ecommerce_target_intelligence": []
  }
}
```

Required validation rules:

- `target.name`, `target.slug`, `target.canonical_url`, `target.domain`, `target.vertical`, `schema_version`, `target_manifest_version`, and `platform.adapter` are required.
- URL fields must be parseable.
- Platform defaults are hints, not proof. Discovery must still record observed endpoint status and confidence.
- `upstream_artifacts` must be optional and must record missing files as limitations, not silently ignore them.
- Manifest must support `canonical_platform_host` because Ridge showed that the branded domain can be blocked while the canonical Shopify host is inspectable.

## Platform Adapter Responsibilities

Adapters should own mechanics, not interpretation.

Common adapter interface:

```text
detectPlatform(target)
discoverEndpoints(target)
fetchRobots(target)
fetchUcpDiscovery(target)
fetchProducts(target, pagination)
fetchCollections(target, pagination)
fetchCollectionProducts(collection)
buildSearchUrl(query)
fetchSubmittedSearch(query)
fetchAutocomplete(prefixOrQuery)
extractRenderedSearch(page)
extractRenderedAutocomplete(page)
extractRenderedBrowse(page)
extractFacets(page)
classifyBlock(responseOrPage)
normalizeProduct(rawProduct)
normalizeCollection(rawCollection)
normalizeSuggestion(rawSuggestion)
```

Adapter output should always include:

- `status`: `pass`, `warn`, `fail`, `not_run`, or `blocked`.
- `http_status` when available.
- `source_url`.
- `duration_ms`.
- `evidence_ref`.
- `confidence`.
- `limitations`.
- Raw payload reference when stored.

Adapter-specific notes:

- `shopify`: products, collections, collection products, submitted search URLs, `search/suggest.json`, product/collection normalization.
- `boost-commerce`: Boxercraft-style Boost search/suggest API, product handle normalization, total product counts.
- `rendered-generic`: Playwright search/browse/autocomplete extraction when no public JSON endpoint is known.
- `ucp-shopify`: future adapter for Shopify UCP/MCP discovery and catalog capability. Ridge exposed UCP discovery; this should be designed before relying on it for broad catalog evidence.

## Surface Plugin Architecture

Adapters should know how to talk to platforms. Plugins should know how to inspect commerce surfaces.

The evaluator should not hardcode experiment execution. It should:

1. Load the Evaluation Manifest.
2. Load the target manifest and site profile.
3. Load configured plugins.
4. Ask each plugin to validate prerequisites.
5. Run plugins in dependency order.
6. Merge raw evidence into the Inspection Model.
7. Build the dashboard and reports from the Inspection Model.

Plugin directory shape:

```text
src/plugins/submitted-search/
  plugin.json
  index.mjs
  schema.json

src/plugins/autocomplete/
  plugin.json
  index.mjs
  schema.json
```

Plugin metadata should include:

```json
{
  "plugin_id": "submitted-search",
  "plugin_version": "0.1.0",
  "surface": "submitted_search",
  "depends_on": [],
  "consumes": ["query_pack", "site_profile", "search_adapter"],
  "requires": ["query_pack", "search_adapter"],
  "produces": ["submitted_search_evidence"],
  "cache": {
    "enabled": true,
    "duration_hours": 24
  },
  "optional": false
}
```

Plugin contract:

```text
discover(context)
validate(context)
run(context)
writeEvidence(context, result)
summarizeForModel(context, evidenceRefs)
```

Surface-oriented plugin categories:

- `submitted_search`
- `autocomplete`
- `browse`
- `facets`
- `product_pages`
- `recommendations`
- `peer_benchmark`
- `spell_correction`
- `semantic_search`
- `ai_search`
- `chat_assistant`
- `visual_search`
- `voice_search`
- `personalization`
- `shopping_assistant`
- `mcp_catalog`
- `ucp_discovery`

Design decision:

Plugins should be general around commerce surfaces, not only today's search/autocomplete/browse terminology. This keeps the evaluator extensible as ecommerce platforms add AI search, chat assistants, visual search, MCP catalog discovery, and UCP discovery.

## Plugin Dependency Graph

Plugin metadata should include execution dependencies:

```json
{
  "plugin_id": "facets",
  "plugin_version": "0.1.0",
  "surface": "facets",
  "depends_on": ["browse"],
  "consumes": ["browse_graph", "rendered_pages"],
  "produces": ["facet_evidence"]
}
```

Examples:

- Browse plugin produces `browse_graph`.
- Facet plugin depends on `browse_graph`.
- Submitted-search plugin produces `submitted_search`.
- Autocomplete plugin produces `autocomplete`.
- Browse/search/autocomplete parity depends on `browse_graph`, `submitted_search`, and `autocomplete`.
- Inspection Model depends on configured plugin outputs.

The evaluator should construct a dependency graph automatically:

1. Load configured plugins from the Evaluation Manifest.
2. Read each plugin's `depends_on`, `consumes`, and `produces` metadata.
3. Topologically sort executable plugins.
4. Mark missing dependencies before execution.
5. Run independent plugins in parallel only when safe.
6. Record dependency skips in `plugin-state.json` and `timeline.jsonl`.

Benefits:

- Plugin authors do not need to modify the evaluator for every new experiment.
- Incremental execution can identify the first incomplete dependency.
- The dashboard can explain why a plugin was skipped or blocked.
- Future surfaces can be added without hardcoded execution order.

## Resumable Inspections And Plugin State

Long inspections should not restart from scratch. Each run should maintain `plugin-state.json`:

```json
{
  "inspection_id": "GEN-013-003",
  "plugins": {
    "catalog-discovery": {
      "status": "completed",
      "started_at": "2026-07-08T09:10:00Z",
      "ended_at": "2026-07-08T09:12:00Z",
      "evidence_refs": ["evidence/catalog-summary.json"]
    },
    "autocomplete": {
      "status": "failed",
      "error": "HTTP 403 Cloudflare challenge",
      "can_resume": true
    },
    "peer-benchmark": {
      "status": "pending",
      "blocked_by": ["autocomplete"]
    }
  }
}
```

Plugin states:

- `pending`
- `running`
- `completed`
- `failed`
- `blocked`
- `skipped`
- `cached`

Resume behavior:

1. Load the prior Evaluation Manifest and `plugin-state.json`.
2. Rebuild the plugin dependency graph.
3. Reuse completed plugins unless the user requests a forced rerun or cache is stale.
4. Continue from the first incomplete executable plugin.
5. Preserve old raw evidence as immutable; write new evidence under the resumed inspection ID or a child run ID.

Dashboard action:

```text
Resume Inspection
```

## Checkpoint Architecture

Every major inspection phase should write a checkpoint so the evaluator can resume without repeating completed work.

Suggested artifact:

```text
evidence/checkpoint.json
```

Checkpoint milestones:

- Evaluation loaded.
- Site profile loaded.
- Discovery completed.
- Plugin dependency graph built.
- Plugin completed.
- Evidence written.
- Inspection Model built.
- Dashboard built.
- Inspection Report generated.

Checkpoint fields:

```text
inspection_id
workspace_id
evaluation_manifest_ref
target_manifest_ref
site_profile_ref
platform_capability_report_ref
plugin_graph
plugin_state_ref
completed_phases
failed_phases
pending_phases
evidence_refs
cache_refs
timeline_ref
artifact_index_ref
inspection_model_ref
dashboard_model_ref
inspection_report_ref
compatibility_fingerprint
```

Resume from checkpoint:

1. Load checkpoint.
2. Validate compatibility with the current evaluator version, manifests, site profile, plugin graph, and platform capability report.
3. Rebuild dependency graph.
4. Reuse completed evidence.
5. Reuse cache where valid.
6. Resume from the first incomplete executable phase.
7. Preserve existing evidence as immutable.

Development feedback loop:

```text
Platform Validation
        |
        v
Fix Platform Capability
        |
        v
Checkpoint
        |
        v
Resume Inspection
        |
        v
Continue
        |
        v
Inspection Report
```

This loop should replace the costly pattern of rerunning a full evaluation after each platform fix and discovering the next failure only after repeating already validated phases.

## Plugin-Level Caching

Expensive plugins should optionally expose:

```text
cache_key(context)
cache_duration
is_stale(context, cacheEntry)
```

Useful cached lanes:

- Catalog discovery.
- Rendered crawling.
- Browse graph generation.
- Peer benchmark.
- Raw endpoint discovery.
- Product/feed pagination.

Cache entries should include:

- Plugin ID and version.
- Adapter ID and version.
- Target manifest version.
- Evaluation manifest version.
- Site profile version.
- Query pack version when relevant.
- Cache key.
- Created timestamp.
- Expiration timestamp.
- Evidence refs.
- Source URL fingerprints where practical.

The dashboard should show whether evidence was fresh, reused from cache, stale, or force-refreshed.

Important constraint:

Caching must never mutate raw evidence. Cached evidence is reused by reference or copied into the new run with provenance that states it came from cache.

## Reserved Agent Layer

Keep the plugin architecture as the core execution model, but reserve an optional `agents/` namespace for future autonomous or semi-autonomous workflows:

```text
agents/
  search-investigator/
  catalog-investigator/
  facet-investigator/
  peer-investigator/
  report-generator/
```

Initial agents may simply wrap plugins. Future agents may coordinate multiple plugins, inspect failures, propose additional query rows, or perform deeper investigations.

Design rule:

Agents are optional orchestration layers. They should consume Evaluation Manifests, Site Profiles, raw evidence, and Inspection Models. They should not bypass plugins or mutate raw evidence.

## Query-Pack Schema

Purpose: move hand-authored `TEST_GROUPS` out of scripts and make DS1-DS4 traceable.

Suggested query-pack fields:

```json
{
  "schema_version": "query-pack-v0.1",
  "pack_id": "boutique-apparel-v1",
  "vertical": "boutique-apparel",
  "language": "en-US",
  "description": "Boutique apparel product-finding concepts.",
  "concepts": [
    {
      "id": "normalization",
      "label": "Normalization",
      "inspection_purpose": "Observe whether normal typing variations return useful product-finding evidence.",
      "dataset_type": "DS2",
      "queries": [
        {
          "id": "normalization-womens-dresses",
          "query": "womens dresses",
          "intent": "women dresses",
          "relationship": "plural_punctuation_variant",
          "expected_terms": ["women", "dress"],
          "expected_browse_nodes": [],
          "attributes": {
            "product_type": "dress",
            "audience": "women"
          },
          "surfaces": ["submitted_search", "autocomplete"],
          "priority": "high"
        }
      ]
    }
  ]
}
```

Required concepts supported by current evidence:

- Normalization.
- Tokenization.
- Customer language or synonyms.
- Ranking and field weighting.
- Query expansion.
- Product/document attribute coverage.
- Spanish/bilingual discovery.
- Vertical-specific journey queries.

Relationship values should support mission DS1-DS4:

- `exact`
- `parent`
- `child`
- `ancestor`
- `descendant`
- `synonym`
- `attribute`
- `modifier`
- `collection`
- `department`
- `plural_variant`
- `spelling_variant`
- `delimiter_variant`
- `occasion`
- `functional_intent`
- `lifestyle_intent`
- `bilingual_variant`

Important design decision:

The query pack should contain expected terms and expected browse relationships, but the Inspection Report should not turn those into recommendations. It should only record what each surface returned, how overlap was calculated, and which expected relationships were observed or unobserved.

## Experiment Flow Design

### 1. Site Discovery

Inputs:

- Target manifest.
- Adapter detection probes.

Steps:

1. Fetch homepage HEAD/GET where allowed.
2. Fetch `robots.txt`.
3. Fetch `agents.md` if advertised.
4. Fetch `.well-known/ucp` where available.
5. Detect platform, language, currency, store selector, personalization, and authentication/blocking.

Outputs:

- `evidence/endpoints.json`
- Dashboard platform detection.
- Crawl limitation rows for Cloudflare, rate limiting, authentication, HTTP failures, JavaScript errors, browser timeout, and endpoint unavailable.

### 2. Endpoint Discovery

Inputs:

- Target manifest.
- Platform adapter.

Steps:

1. Probe search URL.
2. Probe autocomplete endpoint.
3. Probe catalog endpoints.
4. Probe collection/browse endpoints.
5. Probe product endpoint.
6. Probe facet/inventory/store-lookup endpoints only when public evidence exposes them.
7. Record whether endpoint responses match rendered UI when rendering is available.

Outputs:

- Endpoint table with URL, method, parameters, authentication requirements, response status, confidence, and evidence reference.

### 3. Catalog Discovery

Inputs:

- Catalog endpoint, collection endpoint, rendered category pages, or sitemap.

Steps:

1. Enumerate products.
2. Enumerate collections.
3. Normalize product fields.
4. Normalize collection fields.
5. Build initial browse graph.
6. Record product counts, collection counts, brands/vendors, product types, tags, attributes, variants, and availability where exposed.

Outputs:

- `evidence/catalog-summary.json`
- `evidence/browse-graph.json`
- Inspection Report catalog summary.

Caveat:

Rendered UI and API feed may differ. The report must identify whether catalog evidence is API-only, rendered-only, or both.

### 4. Dataset Generation

Inputs:

- Browse graph.
- Product attributes.
- Query packs.

Outputs:

- DS1 canonical search dataset.
- DS2 normalization dataset.
- DS3 search + facet dataset.
- DS4 advanced retrieval dataset.

Design rule:

Every dataset row must trace to either a browse node, product attribute, query-pack seed, observed customer-facing label, or explicit generated-variation rule.

### 5. Submitted Search

Inputs:

- Query pack.
- Search adapter.

Steps:

1. Build submitted search URL.
2. Fetch/render result page.
3. Extract result count and product titles/handles.
4. Record first result and top-k products.
5. Classify blocked/unavailable/unverified rows.
6. Compute observational metrics.

Metrics:

- `result_count`.
- `top_k_product_count`.
- `expected_term_hits`.
- `first_result_expected_term_hit`.
- `product_overlap_with_expected_browse_node` when DS1 exists.
- Optional future: precision@k, MRR, NDCG, recall proxy.

Outputs:

- `evidence/experiments/submitted-search.jsonl`
- Inspection Report submitted-search table.

### 6. Autocomplete/Suggest

Inputs:

- Query pack.
- Suggest adapter.
- Optional visible UI capture.

Steps:

1. Request API suggestions for prefix/query where available.
2. Capture visible dropdown for representative rows or configured rows.
3. Normalize suggested products, collections, queries, and pages.
4. Compare API output to visible UI when both exist.
5. Record latency and empty/no-assistance state.

Metrics:

- Suggested product count.
- Suggested collection count.
- Suggested query count.
- Expected term hits.
- First suggested product expected-term hit.
- API/UI match status where visible UI was captured.

Outputs:

- `evidence/experiments/autocomplete.jsonl`
- Screenshots for visible dropdown checks.

### 7. Protected Concept Matrix

Inputs:

- Query pack concepts.
- Submitted search rows.
- Autocomplete rows.

Steps:

1. Run every concept query across configured surfaces.
2. Aggregate by concept and surface.
3. Preserve row-level evidence.
4. Record partial/blocked row counts separately from observed weak rows.

Outputs:

- Concept summaries inside Inspection Report.
- Row-level search/autocomplete JSONL.

Design change from current scripts:

Concept matrix should not be hardcoded in evaluator scripts. It should be loaded from query packs and produce observational summaries. Downstream reports can later turn concept gaps into executive narrative.

### 8. Same-Query Peer Benchmark

Inputs:

- Target query pack.
- Peer entries from manifest.
- Peer adapters.

Steps:

1. Run the same query rows against each peer.
2. Capture search and autocomplete outputs where available.
3. Record blocked/unusable peer rows explicitly.
4. Store peer evidence in a separate observational lane.

Outputs:

- `evidence/experiments/peer-benchmark.jsonl`
- Inspection Report peer inspection section.

Design rule:

The Inspection Report remains observational. It can say "same-query peer inspection was run" and record returned products, collections, status, and confidence. It should not say competitors are better or worse. Ranking language belongs downstream.

### 9. Browse/Category Sampling

Inputs:

- Collections/browse graph.
- Optional configured category samples.
- Rendered browser adapter.

Steps:

1. Sample core categories from browse graph or manifest.
2. Fetch collection products where endpoint exists.
3. Render category pages.
4. Extract visible category label, product count/product links, filters, sort controls, breadcrumbs, and screenshots.
5. Record hidden/empty/blocked rows.

Outputs:

- `evidence/experiments/browse-sampling.jsonl`
- Category screenshots.
- Browse graph updates.

### 10. Browse/Search/Autocomplete Parity

Inputs:

- Browse graph nodes.
- Browse product sets.
- Search result product sets.
- Autocomplete product sets.

Steps:

1. Derive query from collection title/handle or DS1 row.
2. Fetch browse products.
3. Fetch search products.
4. Fetch autocomplete products.
5. Compare product handles across surfaces.

Metrics:

- Browse product count.
- Search product count.
- Autocomplete product count.
- Exact search/browse parity.
- Browse-only products.
- Search-only products.
- Autocomplete browse-hit count.

Source evidence:

- Boxercraft GEN-007 already proves this experiment shape for Shopify collections plus Boost Commerce.

### 11. Facet Inspection

Inputs:

- Rendered search/category pages.
- Product attribute data.

Steps:

1. Extract visible facet groups and values.
2. Compare visible facets to product attributes where possible.
3. Run DS3 search + facet rows.
4. Record dead ends, unavailable facets, and reset/persistence if interaction is enabled.

Outputs:

- `evidence/experiments/facets.jsonl`
- Facet availability/correctness section.

### 12. Rendered Page Capture

Inputs:

- Manifest rendering config.
- URL list from site discovery, query pack, browse graph, and experiments.

Steps:

1. Capture desktop and mobile screenshots where enabled.
2. Extract title, URL, visible text excerpt, product links, controls, JavaScript errors, and blocked/challenge classification.
3. Save screenshot references.

Outputs:

- `evidence/experiments/rendered-pages.jsonl`
- `evidence/screenshots/`

### 13. Evidence And Report Generation

Inputs:

- All evidence lanes.

Steps:

1. Build Inspection Dashboard.
2. Build crawl health table.
3. Build phase-by-phase observational sections.
4. Attach confidence and limitations.
5. Store references to raw evidence and screenshots.

Outputs:

- `inspection-report.json`
- `inspection-report.md`

Design rule:

No executive summary, recommendations, priorities, revenue language, business impact, quick wins, or consulting language should appear in `inspection-report.json` or `inspection-report.md`.

## Inspection Report JSON Shape

Top-level fields:

```text
schema_version
generation
target
manifest_ref
inspection_window
dashboard
crawl_health
site_discovery
endpoint_discovery
catalog_discovery
browse_graph
datasets
experiments
limitations
confidence
evidence_index
validation
```

Dashboard fields:

- Inspection timestamp.
- Target URL.
- Platform detection.
- Overall inspection status.
- Inspection duration.
- Evidence quality.
- Overall confidence.
- Crawl health by Homepage, Search, Browse, Autocomplete, Product Pages, Facets, Recommendations, Mobile, and Competitor Inspection.

Component status values:

- `pass`
- `warn`
- `fail`
- `blocked`
- `not_run`
- `unknown`

Failure reasons:

- `cloudflare_challenge`
- `authentication_required`
- `rate_limiting`
- `traffic_regulation`
- `http_error`
- `rendering_failure`
- `javascript_error`
- `browser_timeout`
- `endpoint_unavailable`
- `robots_disallow`
- `adapter_not_available`
- `manifest_missing_input`

Confidence values:

- `high`
- `medium`
- `low`
- `unknown`

Confidence should reflect completeness and reliability of evidence, not whether the result is good or bad.

## Inspection Model Layer

Raw evidence should not directly become reports. The evaluator should build an Inspection Model first:

```text
Plugins
      |
      v
Raw Evidence
      |
      v
Inspection Model
      |
      +-- Inspection Dashboard
      +-- Inspection Report
      +-- Executive Report input
      +-- Competitor Report input
      +-- Regression Test input
      +-- Presentation/Proposal input
```

Raw evidence responsibilities:

- Preserve source responses, normalized rows, screenshots, timings, status codes, and errors.
- Stay close to what the adapter/plugin observed.
- Avoid aggregation except for local row normalization.
- Avoid recommendations, priorities, and business interpretation.

Inspection Model responsibilities:

- Aggregate counts and coverage.
- Derive phase status.
- Derive overall confidence from observation-level confidence.
- Split infrastructure limitations from commerce observations.
- Build run timeline summaries.
- Track evidence completeness for downstream readiness.
- Preserve links back to every raw evidence file.

Reports should be formatting layers. They should read the Inspection Model and evidence index instead of recomputing experiment results.

## Inspection Timeline

Every run should write a chronological timeline:

```json
{
  "inspection_id": "2026-07-08T09-43-22Z",
  "timestamp": "2026-07-08T09:43:22Z",
  "event_type": "plugin_completed",
  "phase": "autocomplete",
  "surface": "autocomplete",
  "status": "blocked",
  "duration_ms": 1120,
  "message": "Autocomplete endpoint returned HTTP 403 Cloudflare challenge.",
  "evidence_ref": "evidence/experiments/autocomplete.jsonl"
}
```

Timeline event types:

- `inspection_started`
- `site_profile_loaded`
- `discovery_started`
- `discovery_completed`
- `plugin_started`
- `plugin_completed`
- `plugin_failed`
- `evidence_written`
- `screenshot_captured`
- `inspection_model_built`
- `inspection_report_written`
- `validation_completed`
- `inspection_completed`

The dashboard should use the timeline for debugging, phase duration analysis, and run comparison.

## Observation-Level Confidence

Confidence should be recorded per observation. Section-level and overall confidence should be derived.

Example:

| Observation | Confidence |
|-------------|------------|
| Search endpoint discovered | High |
| Rendered search page extracted | Medium |
| Autocomplete endpoint discovered | High |
| Rendered autocomplete dropdown captured | Low |
| Browse graph reconstructed | Medium |

Observation fields:

```text
observation_id
surface
phase
status
confidence
confidence_reason
evidence_ref
source_url
adapter_id
plugin_id
limitations
```

Derived confidence rules should consider:

- Whether evidence came from rendered UI, public API, sitemap, robots, UCP, or inferred/generated data.
- Whether API evidence was verified against visible UI.
- Whether rows were blocked, partial, stale, or sampled.
- Whether multiple evidence sources agree.
- Whether the site profile was fresh or reused.

## Infrastructure Vs Commerce Records

Limitations and findings should not be lumped together.

Infrastructure records describe inspection constraints:

- Cloudflare challenge.
- Authentication required.
- Robots restrictions.
- Browser timeout.
- JavaScript failure.
- Rate limiting.
- Endpoint unavailable.
- Traffic regulation.
- Adapter unavailable.
- Network failure.

Commerce observations describe inspected ecommerce behavior:

- Autocomplete returned no suggestions.
- Visible filters were missing.
- Browse graph could not map product membership.
- Search and browse returned inconsistent product sets.
- Recommendations were absent from inspected pages.
- Mobile controls were not visible.

The Inspection Report should separate these categories so readers do not confuse crawl failures with ecommerce product-discovery behavior.

## Platform Capability Vs Ecommerce Findings

Not every inspection failure is an ecommerce finding.

The platform must distinguish two categories:

1. Platform Capability gaps.
2. Observed ecommerce behavior.

Platform Capability gaps are limitations in what the evaluator can currently inspect reliably.

Examples:

- URL normalization.
- HTTPS handling.
- Redirect handling.
- Cloudflare challenge handling.
- Robots parsing.
- Shopify discovery.
- Rendered page extraction.
- Rendered search extraction.
- Suggest endpoint discovery.
- Screenshot capture.

These should never appear as ecommerce findings about the retailer. They should become platform work items.

Example platform capability IDs:

```text
P001 URL Normalization
P002 Redirect Handling
P003 Cloudflare Challenge
P004 Shopify Discovery
P005 Rendered Search
P006 Robots Parsing
P007 HTTPS Handling
P008 Suggest Endpoint Discovery
```

Dashboard examples:

```text
Inspection blocked
Reason: Platform Capability Missing
Capability: P003 Cloudflare Challenge
```

```text
Autocomplete unavailable
Reason: Observed ecommerce behavior
Evidence: Search/suggest endpoint returned no suggestions and rendered dropdown showed no assistance.
```

Inspection Model rule:

- Platform capability records belong in `platform_capability_gaps`.
- Retailer behavior observations belong in `commerce_observations`.
- Inspection Reports may list platform limitations as evidence limits, but downstream executive reports should not convert platform limitations into retailer recommendations.

## Platform Capability Registry

The Platform Capability Registry is a long-lived catalog describing every platform capability the evaluator knows about.

It changes only when the platform evolves.

Suggested artifact:

```text
platform/capability-registry.json
```

Example registry row:

```text
Capability ID: P003
Name: Cloudflare Challenge Handling
Status: Implemented
Dependencies: HTTPS, Redirects
Validator: Cloudflare Validation
Maturity Level: 1
```

Suggested fields:

```text
capability_id
capability_name
description
maturity_level
status
dependencies
validators
supported_platforms
introduced_in_generation
last_updated_generation
known_limits
implementation_refs
```

Registry status values:

- `planned`
- `implemented`
- `validated`
- `deprecated`
- `blocked`

Registry rule:

The registry defines known capabilities and their dependencies. It does not answer whether a specific platform version currently passes validation. That is the job of the generated Platform Capability Report.

## Platform Capability Report

Add a platform artifact:

```text
platform/capability-report.json
```

Purpose:

Describe what the evaluator itself can reliably inspect.

Example:

```text
Capabilities

PASS  HTTPS
PASS  Redirects
PASS  Robots
PASS  Shopify
PASS  Search
PASS  Autocomplete
WARN  Rendered Search
FAIL  Magento
FAIL  AI Search
```

Suggested fields:

```text
capability_id
capability_name
surface
maturity_level
status
confidence
last_validated_at
validator_ref
supported_platforms
known_limits
next_platform_work_item
```

The dashboard should use the Platform Capability Report when classifying failed inspection phases:

- Platform maturity issue.
- Ecommerce observation.
- Unknown classification.

Registry vs report:

- Platform Capability Registry is permanent and changes only when capabilities are added, updated, deprecated, or reclassified.
- Platform Capability Report is generated for a specific platform version and answers: "What can this evaluator version reliably inspect?"

## Platform Capability Dependency Graph

The platform should track capability dependencies separately from plugin dependencies.

Example:

```text
HTTPS
    |
Redirects
    |
Shopify Discovery
    |
Search Endpoint
    |
Autocomplete
```

Purpose:

Answer:

```text
If capability X changes, which capabilities require revalidation?
```

Graph fields:

```text
capability_id
depends_on
affected_capabilities
validators
last_validated_at
```

This graph should drive platform validation impact analysis so platform changes do not require rerunning every validator.

## Incremental Platform Validation

Platform Validation should not rerun everything after every platform change.

Desired flow:

```text
Capability Changed
        |
        v
Impact Analysis
        |
        v
Affected Validators
        |
        v
Run Validation
        |
        v
Resume Inspection
```

Rules:

- If a capability changes, run validators for that capability and downstream dependent capabilities.
- If a validator changes, run the validator and dependent validation groups.
- If a capability dependency changes, rerun affected validators before resuming real inspections.
- If no dependency is affected, record the skip reason rather than rerunning all platform validation.

## Platform Validation Suite

Do not wait for live retailer inspections to discover missing platform capabilities.

Add a platform validation suite that runs before inspecting real ecommerce sites:

```text
Platform Validation

PASS  URL Parsing
PASS  HTTPS
PASS  Redirects
PASS  Robots
PASS  Shopify Discovery
PASS  Search Endpoint
PASS  Suggest Endpoint
WARN  Rendered Capture
```

Initial validation lanes:

- URL parsing and normalization.
- HTTPS and redirect handling.
- Robots fetch and parse.
- Shopify discovery.
- Search endpoint behavior.
- Suggest/autocomplete endpoint behavior.
- Rendered capture.
- Block/challenge classification.

Goal:

Build platform capability first. Then evaluate retailers.

Validation rule:

Retailer inspection should record the current Platform Capability Report version and should warn when an enabled inspection surface depends on a capability that is not mature enough.

## Capability Maturity Model

The platform should mature in levels instead of attempting every inspection surface simultaneously.

Suggested maturity levels:

Level 1:

- URL handling.
- HTTPS.
- Redirects.
- Robots.
- Basic HTTP status classification.

Level 2:

- Search.
- Autocomplete.
- Browse/catalog discovery.
- Shopify public feeds.

Level 3:

- Rendered UI.
- Screenshots.
- Filters.
- Recommendations.
- Mobile rendered capture.

Level 4:

- AI Search.
- MCP.
- UCP.
- Chat assistants.
- Visual search.
- Personalization.

Maturity should guide implementation priorities:

- Stabilize Level 1 before expanding Level 2.
- Stabilize Level 2 before broad Level 3 claims.
- Treat Level 4 as reserved/future unless a target explicitly exposes those surfaces.

## Platform Capability Timeline

The platform should maintain a historical timeline describing platform evolution.

Example:

```text
GEN-013  Added URL handling and initial Platform Validation Suite
GEN-014  Added redirect handling
GEN-015  Added Shopify discovery
GEN-016  Added search endpoint discovery
GEN-017  Added rendered capture
```

Purpose:

- Document how the evaluator matures over time.
- Explain why older inspections may have lower capability coverage.
- Support reproducibility by linking inspection output to platform capability state at the time of inspection.

Suggested artifact:

```text
platform/capability-timeline.jsonl
```

Suggested fields:

```text
generation
date
capability_id
change_type
summary
validation_refs
affected_capabilities
inspection_failures_that_motivated_change
```

## Platform Metrics

Track platform maturity separately from retailer evaluation outcomes.

Suggested metrics:

- Capabilities implemented.
- Capabilities validated.
- Capability coverage.
- Supported platforms.
- Average inspection duration.
- Resume savings.
- Average platform validation time.
- Inspection success rate.
- Average evidence coverage.
- Average evidence quality.
- Platform gaps discovered per inspection.
- Reusable capabilities created from retailer inspections.

These metrics answer whether the evaluator itself is becoming more capable and cheaper to operate over time.

They should not be confused with a retailer's ecommerce product-discovery quality.

## Generation 14 Planning Rule

Do not continue expanding the architecture before implementation.

GEN-014 design should be driven by observed inspection failures, not anticipated requirements.

Recommended path:

1. Implement the current GEN-013 design.
2. Run inspections against approximately 10-20 real ecommerce sites.
3. Collect Platform Capability gaps.
4. Expand the Platform Capability Registry.
5. Improve Platform Validation.
6. Improve checkpoints and resume.
7. Use those discoveries to design GEN-014.

Future architecture changes should cite observed inspection failures and explain why the current stable architecture cannot handle them through capabilities, plugins, adapters, query packs, or dashboard/report exports.

## Versioning And Inspection ID

Every inspection should have a stable `inspection_id`.

Accepted formats:

- Sequential: `INS-000341`.
- Timestamp-based: `2026-07-08T09-43-22Z`.

Every evidence file and report artifact should reference:

- `inspection_id`.
- Evaluation Manifest version.
- Target Manifest version.
- Query Pack version.
- Adapter versions.
- Plugin versions.
- Inspection schema version.
- Site profile version.
- Node/npm/runtime version where relevant.

Versioning makes historical reports reproducible and lets future validators explain when results changed because the framework changed rather than because the target site changed.

## Dataset Provenance

Every generated dataset row should record where it came from and how it was transformed.

Example provenance chain:

```text
collection: Camping
  -> observed_product: Sleeping Bag
  -> product_attribute: product_type=sleeping bag
  -> variation_rule: plural_form
  -> generated_query: sleeping bags
```

Dataset row fields:

```text
dataset_id
row_id
query
dataset_type
relationship
source_type
source_ref
source_label
generation_rule
parent_row_id
provenance_chain
confidence
```

Provenance enables:

- Reproducing generated DS1-DS4 rows.
- Debugging low-quality generated queries.
- Improving variation rules without losing traceability.
- Explaining whether a query came from observed site structure, observed product data, a reusable query pack, or synthetic variation.

## Evidence Quality Model

Confidence and Evidence Quality are separate concepts.

Confidence reflects trust in a specific observation.

Evidence Quality reflects completeness and operational usefulness of the collected evidence.

Evidence Quality fields:

```text
completeness
freshness
verification
coverage
sampling
source_diversity
raw_evidence_availability
screenshot_availability
downstream_readiness
```

Example:

```text
Confidence: High
Evidence Quality: Partial
Coverage: 78%
Verification: API + Rendered
Freshness: 2 hours
Sampling: bounded 5-query run
Source diversity: public API, rendered UI, screenshots
```

Suggested values:

- `complete`
- `strong`
- `partial`
- `thin`
- `blocked`
- `unknown`

Evidence Quality should be computed at multiple levels:

- Overall inspection.
- Commerce surface.
- Plugin output.
- Dataset.
- Dashboard readiness.
- Downstream report readiness.

The dashboard should display both confidence and evidence quality because a highly trusted observation can still be too narrow for downstream executive reporting.

## Dashboard Purpose

The Inspection Dashboard is the operational workspace for the evaluator.

Its purpose is to help the evaluator execute, review, validate, debug, and compare ecommerce inspections before generating downstream reports.

Unlike the Inspection Report, which is the canonical evidence artifact, the dashboard is a working environment used during the inspection lifecycle.

The dashboard exists to answer one question:

```text
Can I trust this inspection enough to generate business-facing reports?
```

It should also answer four operational questions:

1. What happened?
2. Why did it happen?
3. Can I trust the evidence?
4. What should I do next?

Primary responsibilities:

1. Run inspections.
2. Validate evidence.
3. Debug inspections.
4. Produce reports.

Run inspections:

- Start a new inspection.
- Resume interrupted inspections.
- Re-run previous inspections.
- Run selected commerce surfaces.
- Compare inspection runs.

Validate evidence:

- Review evidence coverage.
- Review evidence quality.
- Verify screenshots.
- Verify rendered pages.
- Verify API evidence.
- Verify datasets.
- Identify missing evidence.
- Identify blocked inspection phases.
- Indicate whether the Inspection Report is complete enough for downstream reporting.

Debug inspections:

- Show the inspection timeline.
- Show failed, blocked, skipped, or incomplete phases.
- Surface infrastructure limitations such as Cloudflare challenges, authentication failures, rendering failures, HTTP failures, plugin failures, and adapter issues.
- Provide access to raw evidence, adapter output, and screenshots through drill-down views.

Produce reports:

- Indicate whether downstream reports can safely be generated from the Inspection Model.
- Support Inspection Report, Executive Report, Competitor Report, Proposal, and Presentation exports.
- Explain which evidence is missing or why confidence/evidence quality is insufficient when report generation is not recommended.

Design principles:

- The dashboard should remain an operational tool rather than a developer console.
- The default experience should focus on inspection status, commerce surfaces, evidence, quality, confidence, and report readiness.
- Implementation concepts such as Evaluation Manifest, Target Manifest, Plugin, Adapter, dependency graph, cache metadata, and Inspection Model should generally remain implementation details.
- Technical details should be accessible through advanced drill-down views for debugging, but they should not dominate the primary dashboard experience.

Dashboard success criteria:

Within a few seconds, the evaluator should be able to answer:

1. Did the inspection complete successfully?
2. Which commerce surfaces were inspected?
3. What evidence was collected?
4. What evidence is missing?
5. Which phases failed, were blocked, or were skipped?
6. How reliable is the collected evidence?
7. What needs to be rerun or investigated?
8. Is the Inspection Report ready for downstream report generation?

Future design guidance:

When adding dashboard functionality, evaluate every feature against these questions:

- Does it help execute inspections?
- Does it help validate evidence?
- Does it help debug inspections?
- Does it help determine report readiness?

If the answer is no, reconsider whether the feature belongs in the dashboard or whether it should remain an internal implementation detail.

The long-term goal is a dashboard that feels like an inspection control room: focused, trustworthy, and easy to navigate, rather than a collection of engineering utilities.

## Operational Dashboard Design

The dashboard is not only a report viewer. It should be the operational control surface for running, reviewing, comparing, and debugging ecommerce inspections.

Primary questions:

1. Did the inspection run successfully?
2. What evidence was collected or missed?
3. What should be fixed before generating a downstream executive report?

Dashboard capabilities:

- Start an inspection.
- Run a new inspection from an Evaluation Manifest.
- Run platform validation before retailer inspection.
- Re-run a previous inspection by `inspection_id`.
- Resume a failed or incomplete inspection.
- Run only selected plugins/surfaces, such as submitted search, autocomplete, browse, facets, or peer benchmark.
- Compare two inspection runs.
- View the chronological inspection timeline.
- See which phases passed, failed, were blocked, skipped, or were not run.
- Open raw evidence files for each phase.
- View screenshots captured during the run.
- Debug failed phases with error messages, HTTP status, adapter output, plugin output, and limitation records.
- Distinguish platform capability gaps from observed ecommerce behavior.
- Validate whether the Inspection Report is complete enough to generate downstream reports.
- Export reports from the Inspection Model.

Dashboard model fields:

```text
inspection_id
evaluation_id
target_slug
target_url
generation
started_at
ended_at
duration_ms
overall_status
overall_confidence
evidence_coverage
experiments_completed
experiments_blocked
experiments_failed
experiments_skipped
warnings
phase_health
timeline_ref
inspection_model_ref
inspection_report_ref
site_profile_ref
platform_capability_report_ref
evidence_files
screenshot_count
raw_artifact_count
downstream_readiness
comparison
artifact_explorer
actions
history_ref
```

Phase health should include:

- Phase/plugin name.
- Commerce surface.
- Status.
- Duration.
- Evidence files written.
- Screenshot files written.
- Observation count.
- Infrastructure limitation count.
- Commerce observation count.
- Error message, if any.
- HTTP status, if relevant.
- Adapter/plugin output summary.
- Platform capability gap ID when a phase is blocked by evaluator maturity rather than observed ecommerce behavior.
- Confidence summary derived from observation-level confidence.

Downstream readiness should be explicit and non-interpretive:

```text
executive_report_ready: true | false | unknown
competitor_report_ready: true | false | unknown
regression_ready: true | false | unknown
blocking_reasons: []
missing_required_evidence: []
warnings: []
```

Examples of blocking reasons:

- `homepage_blocked`
- `submitted_search_not_run`
- `autocomplete_not_run`
- `browse_graph_missing`
- `query_pack_missing`
- `peer_benchmark_missing`
- `no_screenshots`
- `low_confidence_catalog`
- `rendered_ui_not_verified`

The dashboard may initially be generated as structured JSON plus Markdown sections inside the Inspection Report. A later implementation can expose it as a local web UI, but the data contract should be established first so CLI, Markdown, and web dashboard views read the same model.

## Artifact Explorer

The evaluator will generate many artifacts. The dashboard should include an Artifact Explorer so every artifact is directly accessible.

Artifact groups:

- Evidence.
- Reports.
- Datasets.
- Screenshots.
- Raw HTTP.
- Raw HTML.
- Timeline.
- Inspection Model.
- Site Profile.
- Plugin State.
- Dashboard Model.

Each artifact entry should include:

```text
artifact_id
inspection_id
group
label
path
mime_type
size_bytes
created_at
producer_plugin
producer_adapter
schema_version
is_raw
is_cached
source_url
```

The artifact explorer should support:

- Open artifact.
- Filter by plugin/surface.
- Filter by raw/normalized/model/report.
- Show missing expected artifacts.
- Show stale or cached evidence.
- Link artifacts back to timeline events and phase health rows.

## Dashboard Actions

Dashboard actions should invoke reusable workflows rather than individual scripts.

Suggested actions:

```text
Run Discovery
Run Inspection
Resume Inspection
Rerun Inspection
Run Selected Plugins
Compare Runs
Validate Inspection
Rebuild Inspection Model
Generate Executive Report
Generate Competitor Report
Generate Proposal
Open Evidence
Open Timeline
Open Artifact Explorer
Export Inspection Report
```

Action contract:

```text
action_id
label
requires_inspection_id
requires_evaluation_manifest
requires_plugin_selection
allowed_states
workflow
expected_outputs
validation_checks
```

Examples:

- `Resume Inspection` is available when at least one plugin is failed, blocked, pending, or skipped and dependency requirements can be satisfied.
- `Generate Executive Report` is available only when downstream readiness says executive report generation is safe or explicitly warns why it is not.
- `Rebuild Inspection Model` should recompute model/dashboard summaries from immutable raw evidence without rerunning plugins.

Design decision:

The dashboard is the primary operational product. Inspection Reports, Executive Reports, Competitor Reports, Proposals, and Presentations are exports generated from dashboard/Inspection Model state.

## Validation Strategy

The next implementation should update `.mde/validation-strategy.json` for GEN-013 before coding the reusable runner.

Required validations:

1. Evaluation manifest schema validation:
   - Required fields present.
   - Target manifest path exists.
   - Query pack paths exist.
   - Plugin IDs exist.
   - Surface list and plugin list are compatible.
   - Peer benchmark has `peer_set` or inline peer configuration when enabled.
   - Discovery profile mode is valid: reuse, refresh, reuse-if-fresh, or require-existing.

2. Target manifest schema validation:
   - Required fields present.
   - URL fields are parseable.
   - Platform defaults are structurally valid.
   - Optional upstream artifact paths are recorded as present or missing.

3. Site profile validation:
   - Discovery timestamp exists.
   - Platform detection exists.
   - Endpoint records include status, confidence, and evidence reference.
   - Infrastructure limitations are explicit.
   - Reused profile age is recorded.

4. Query-pack schema validation:
   - Concept IDs unique.
   - Query IDs unique.
   - Every query has intent, relationship, expected terms or expected browse node, and surface list.
   - DS1-DS4 row traceability exists.

5. Plugin contract validation:
   - Every plugin exposes `discover`, `validate`, `run`, `writeEvidence`, and `summarizeForModel`.
   - Plugin metadata includes plugin ID, version, surface, required inputs, `depends_on`, `consumes`, and `produces`.
   - Plugin dependency graph can be built without cycles for the selected Evaluation Manifest.
   - Plugin failures write timeline entries and limitation records.
   - Plugin state records completed, failed, blocked, skipped, pending, cached, and running states.
   - Cache metadata is valid when a plugin declares caching.

6. Adapter contract validation:
   - Shopify adapter can probe products, collections, collection products, search URL, and suggest endpoint against a known public Shopify target.
   - Boost adapter can reproduce Boxercraft search/suggest extraction.
   - Rendered-generic adapter records blocked states instead of throwing away rows.

7. Inspection Model validation:
   - Raw evidence refs are preserved.
   - Observation-level confidence exists.
   - Evidence Quality exists and is separate from confidence.
   - Section confidence is derived.
   - Infrastructure records and commerce observations are separated.
   - Timeline exists and is chronological.
   - Inspection ID appears in every evidence artifact.
   - Dataset rows include provenance.
   - Artifact index exists and groups evidence, reports, datasets, screenshots, raw HTTP, raw HTML, timeline, and model artifacts.

8. Operational dashboard validation:
   - Dashboard answers whether the inspection ran successfully.
   - Dashboard identifies collected and missed evidence.
   - Dashboard reports downstream readiness and blocking reasons.
   - Dashboard links to raw evidence and screenshots.
   - Dashboard can represent selected-plugin reruns and run comparisons.
   - Dashboard exposes Inspection History rows with open, compare, resume, rerun, and export actions.
   - Dashboard exposes Artifact Explorer groups and direct artifact links.
   - Dashboard exposes action availability based on inspection state and downstream readiness.

9. Resumable inspection validation:
   - Incomplete plugin state can be loaded.
   - Completed plugins are not rerun unless forced or stale.
   - First incomplete executable plugin is selected from the dependency graph.
   - Resume writes timeline entries and preserves prior raw evidence immutability.

10. Workspace validation:
   - Workspace manifests reference existing targets, evaluations, query packs, peer sets, and history file.
   - Inspection History is scoped to the workspace.
   - Run comparison only compares compatible inspections or records incompatibility.

11. Inspection Report validation:
   - Dashboard exists.
   - Crawl health covers all required components.
   - Every major section has derived confidence.
   - Every failed/incomplete phase has limitation text.
   - No recommendations/business-impact/executive-summary terms appear in the Inspection Report.
   - Evidence references point to existing files.

12. Regression validation against existing targets:
   - High Country target manifest can reproduce the core GEN-011 search/autocomplete row count or a bounded sample.
   - Dress Up target manifest can reproduce the GEN-012 concept/query structure.
   - Boxercraft target manifest can reproduce a bounded browse parity sample using the Boost adapter.

13. External/browser validation:
   - Desktop rendered page capture stores non-empty screenshot files.
   - Mobile rendered page capture stores non-empty screenshot files where enabled.
   - Blocked pages are classified explicitly.

Suggested first Validation Gate for implementation:

- Run evaluation-manifest, target-manifest, site-profile, plugin, and query-pack schema tests.
- Run workspace and inspection-history schema tests.
- Run plugin dependency graph and cache metadata tests.
- Run a bounded Shopify inspection against one known target with 5 queries.
- Run a bounded Boost browse parity sample against Boxercraft with 3 collections.
- Validate generated timeline, plugin state, artifact index, raw evidence refs, Inspection Model, dashboard model, Inspection Report JSON, and Markdown.
- Run `git diff --check`.

Second independent pass:

- Rerun the same bounded inspection without implementation changes.
- Confirm deterministic schema, required sections, evidence refs, timeline ordering, dashboard readiness, artifact explorer, resume state, and limitation records.

## Migration Path From Current Scripts

Phase 1: Extract data definitions.

- Add Workspace manifests for related evaluation programs.
- Add Evaluation Manifests as run entry points.
- Add Platform Capability registry and maturity model.
- Add Platform Capability Dependency Graph.
- Add Platform Capability Timeline and metrics artifacts.
- Move High Country and Dress Up `TEST_GROUPS` into query packs.
- Move Dress Up and High Country peer lists into evaluation manifests or reusable peer-set files.
- Move target identity constants into target manifests.
- Move run configuration, selected experiments, rendering settings, and output paths into evaluation manifests.
- Keep old scripts runnable during migration.

Phase 2: Add discovery profile generation.

- Create a discovery runner that produces `site-profile.json`.
- Record platform detection, robots, UCP, canonical platform host, endpoint probes, and infrastructure limitations.
- Support reuse-if-fresh behavior from the Evaluation Manifest.
- Classify blocked discovery rows as platform capability gaps, ecommerce observations, or unknown.

Phase 2A: Add platform validation.

- Create Platform Validation Suite for URL parsing, HTTPS, redirects, robots, Shopify discovery, search endpoint, suggest endpoint, rendered capture, and block classification.
- Generate Platform Capability Report before retailer inspection.
- Record capability maturity level and known limits.
- Use Capability Dependency Graph to identify affected validators after a platform capability changes.
- Record validation skips with impact-analysis reasons.

Phase 3: Extract adapters.

- Create Shopify adapter from repeated products/collections/suggest/search URL logic.
- Create Boost Commerce adapter from Boxercraft browse-node parity script.
- Create rendered-generic adapter from current Playwright extraction patterns.

Phase 4: Extract surface plugins.

- Create submitted-search plugin.
- Create autocomplete plugin.
- Create browse plugin.
- Create facets plugin.
- Create peer-benchmark plugin.
- Add plugin metadata with `depends_on`, `consumes`, `produces`, and cache settings.
- Build dependency-graph scheduling before full plugin behavior is migrated.
- Preserve old script behavior through bounded regression samples.

Phase 5: Build shared evidence writer.

- Standardize status, confidence, limitation, evidence reference, screenshot reference, and raw payload references.
- Write JSONL per experiment plus one report JSON.
- Write `timeline.jsonl`.
- Write `plugin-state.json`.
- Write `checkpoint.json`.
- Write `artifact-index.json`.
- Ensure every artifact includes `inspection_id`.

Phase 6: Build Inspection Model and dashboard model.

- Aggregate raw evidence into `inspection-model.json`.
- Derive phase status, coverage, confidence, infrastructure limitations, commerce observations, and downstream readiness.
- Derive Evidence Quality separately from confidence.
- Generate dashboard JSON/Markdown from the model.
- Generate Inspection History rows.
- Generate Artifact Explorer groups.
- Expose dashboard action availability.
- Show platform capability gaps separately from ecommerce behavior.

Phase 7: Port bounded experiments.

- Start with submitted search and autocomplete for one Shopify target.
- Add protected concept aggregation.
- Add browse/category sampling.
- Add Boxercraft parity as an adapter-backed experiment.
- Add same-query peer benchmark after target-only flow is stable.

Phase 8: Generate canonical Inspection Report.

- Generate `inspection-report.json` and `inspection-report.md`.
- Keep executive report generators downstream and source them from Inspection Report data.

Phase 9: Deprecate target-specific scripts.

- Preserve old scripts as historical generators until reusable output is validated against High Country, Dress Up, and Boxercraft.
- After parity validation, replace target scripts with manifest-based npm commands.

## Proposed NPM Commands

Future commands after implementation:

```json
{
  "inspect": "node src/evaluator/run-inspection.mjs",
  "inspect:evaluation": "node src/evaluator/run-inspection.mjs --evaluation",
  "discover:site": "node src/discovery/run-discovery.mjs",
  "validate:evaluation-manifest": "node src/evaluator/validation.mjs evaluation-manifest",
  "validate:target-manifest": "node src/evaluator/validation.mjs target-manifest",
  "validate:query-packs": "node src/evaluator/validation.mjs query-packs",
  "validate:plugins": "node src/evaluator/validation.mjs plugins",
  "validate:inspection-model": "node src/evaluator/validation.mjs inspection-model",
  "validate:inspection-report": "node src/evaluator/validation.mjs inspection-report"
}
```

Example usage:

```text
npm run inspect:evaluation -- evaluations/ridge-shopify-baseline.json
npm run inspect:evaluation -- evaluations/shopdressup-boutique-benchmark.json
```

## Dependency Handling

### local-website-growth-assessment

Repo evidence supports this only for High Country. The manifest should allow optional upstream local assessment references:

- handoff Markdown path.
- summary JSON path.
- full assessment JSON path.
- allowed sections.
- excluded sections with reasons.

If missing, the Inspection Report should record the missing optional input as `not_provided`; it should not fail the ecommerce inspection.

### ecommerce-target-intelligence

Repo evidence does not contain a completed local output. The design should not require this dependency.

The manifest can reserve an optional `competitor_source_artifact` field for future use. If absent, peer lists must be manually supplied in the target manifest and the report must record peer selection as manifest-supplied.

## Design Decisions

1. GEN-013 core architecture is frozen for implementation.
2. The Ecommerce Evaluator is an Inspection Platform, not simply a report generator.
3. The Inspection Report is the canonical artifact. Executive, competitor, benchmark, proposal, and presentation outputs must consume it.
4. Evaluation Manifest is the runnable entry point.
5. Workspaces group related targets, evaluations, query packs, peer sets, history, reports, and evidence.
6. Target Manifest describes the site; it does not define each run.
7. Discovery produces reusable `site-profile.json`; inspection consumes it.
8. Query packs replace hardcoded `TEST_GROUPS`.
9. Platform adapters replace endpoint assumptions scattered through evaluator scripts.
10. Surface plugins replace hardcoded experiment sequencing.
11. Plugin dependency metadata drives scheduling, skip reasons, resume behavior, and caching.
12. Raw evidence remains immutable and separate from the Inspection Model.
13. Dashboard, Inspection Report, and downstream artifacts read from the Inspection Model.
14. The dashboard is the primary operational product; reports are exports.
15. Inspection History is the primary navigation mechanism for completed and in-progress runs.
16. Artifact Explorer is required for operational debugging.
17. Platform Capability gaps are not ecommerce findings.
18. Platform Capability Registry is long-lived; Platform Capability Report is generated for a specific platform version.
19. Platform Capability Dependency Graph drives impact analysis and incremental validation.
20. Platform Capability Report and Platform Validation Suite are required before broad retailer inspection claims.
21. Capability maturity levels guide implementation priorities.
22. Platform Capability Timeline and metrics track evaluator progress separately from retailer quality.
23. Checkpoints are required to support fast resume and platform development feedback loops.
24. JSONL evidence lanes preserve row-level reproducibility.
25. Every run has an `inspection_id`.
26. Every major component is versioned.
27. Dataset rows include provenance.
28. Observation-level confidence is required; overall confidence is derived.
29. Evidence Quality is separate from confidence.
30. Infrastructure limitations are separated from commerce observations.
31. Resumable inspections and plugin-level caching are part of the platform contract.
32. Inspection remains observational. Interpretation is downstream.
33. Blocked/incomplete inspection is valid output if limitations are explicit.
34. API evidence and rendered UI evidence must be separated. They can support each other but should not be treated as identical.
35. Same-query peer benchmark is observational in the Inspection Report; comparative framing is downstream.
36. The first implementation should be bounded and regression-friendly, not a full rewrite.
37. GEN-014 architecture should be driven by observed inspection failures from real ecommerce sites.

## Open Questions And Blockers

No blocker prevents the design.

Open questions before implementation:

1. Should Evaluation Manifests live in `evaluations/` only, or should completed runs copy the manifest into each assessment folder?
2. Should target manifests live under `targets/` or under `assessments/{target}/manifest.json`?
3. Should query packs be global reusable files, target-specific overlays, or both?
4. How much raw HTTP/HTML should be stored by default to balance reproducibility and repo size?
5. Should screenshots be required for all rendered rows or only sampled rows?
6. Should same-query peer benchmark be enabled by default or explicitly opt-in?
7. What is the minimum accepted first-run query count for a credible Inspection Dashboard?
8. Should UCP/MCP support be part of the first Shopify adapter or deferred behind `ucp-shopify`?
9. Which existing report generators should be migrated first: Dress Up, High Country, or Boxercraft?
10. Should the operational dashboard first ship as Markdown/JSON only, or should a local web UI be part of GEN-013?
11. What minimum Platform Capability maturity level is required before running broad retailer inspections?

## Recommended First Implementation Task

Implement the smallest reusable slice:

1. Add Workspace, Evaluation Manifest, Target Manifest, Query Pack, Site Profile, Platform Capability Registry, Platform Capability Dependency Graph, Platform Capability Report, Platform Capability Timeline, Platform Metrics, Platform Validation Suite, Inspection History, Checkpoint, and Artifact Index schemas.
2. Add platform validation stubs for URL parsing, HTTPS, redirects, robots, Shopify discovery, search endpoint, suggest endpoint, rendered capture, and block classification.
3. Add incremental platform validation impact analysis for changed capability IDs.
4. Add plugin contract, plugin metadata schema, plugin loader, and dependency graph builder.
5. Add plugin-state, checkpoint, and cache metadata contracts.
6. Add a discovery runner stub that can produce or reuse `site-profile.json`.
7. Add a Shopify adapter with:
   - endpoint discovery,
   - products/collections fetch,
   - submitted search URL construction,
   - `search/suggest.json` fetch,
   - block classification.
8. Add submitted-search and autocomplete plugins with dependency metadata.
9. Add a bounded `run-inspection.mjs` that accepts one Evaluation Manifest and validates platform capability first.
10. Generate raw evidence, `timeline.jsonl`, `plugin-state.json`, `checkpoint.json`, `artifact-index.json`, `inspection-model.json`, dashboard model, Inspection History row, `inspection-report.json`, and `inspection-report.md` for a 5-query Shopify target.
11. Add validation that the output has inspection ID, dashboard, platform capability classification, history, artifact explorer, crawl health, observation-level confidence, Evidence Quality, infrastructure/platform/commerce separation, limitations, DS1-DS4 stubs with provenance, and no recommendation/business-impact language.
12. Add resume validation for a deliberately interrupted bounded run and explain why any repeated work was rerun.

After this first implementation slice, stop architecture expansion and run real inspections. Collect platform capability gaps from approximately 10-20 ecommerce sites before designing GEN-014.

Recommended pilot:

- Use Ridge or Dress Up as the first Evaluation Manifest-based Shopify target.
- Ridge is useful for testing blocked branded-domain handling and canonical Shopify host fallback.
- Dress Up is useful for regression against existing GEN-012 query-pack evidence.

Best first pilot sequence:

1. Dress Up bounded 5-query run for functional parity with existing evidence.
2. Ridge bounded run for blocked-domain/canonical-host behavior.
3. Boxercraft 3-node browse parity run after Boost adapter extraction.
