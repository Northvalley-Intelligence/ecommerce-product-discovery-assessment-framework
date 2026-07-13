# Design Review Packet — Latest Changes Only

Date: 2026-07-12
Stream: stream_mra8o4fq_47ae08ab
Source: stream_mra8o4fq_47ae08ab_reusable_ecommerce_evaluator_design.md (2,771 lines)

This packet contains ONLY the sections added in the most recent revision wave
(the Inspection Platform theme + architecture freeze). Everything else in the
full design doc predates this wave and was covered by earlier reviews.

Sections included: Core Architecture Freeze, Platform Evolution Strategy,
Checkpoint Architecture, Platform Capability vs Ecommerce Findings, Capability
Registry, Capability Report, Capability Dependency Graph, Incremental Platform
Validation, Platform Validation Suite, Capability Maturity Model, Capability
Timeline, Platform Metrics, Generation 14 Planning Rule.

---

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

