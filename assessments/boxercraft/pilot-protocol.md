# Boxercraft Product Discovery Pilot Protocol

This protocol validates the reusable Ecommerce Product Discovery Assessment Framework. It does not claim current Boxercraft behavior. Verify current public and wholesale URLs at evidence collection time.

## Objective

Use Boxercraft as the first ecommerce validation target while keeping the framework reusable across apparel, wholesale, distributors, industrial suppliers, auto parts, and specialty retail.

## Scope

Assess:

- Public consumer product discovery.
- Authenticated wholesale product discovery only if explicit authorization is available.
- Search effectiveness.
- Autocomplete effectiveness.
- Browse navigation.
- Filters and faceted navigation.
- Recommendations and related discovery.
- Mobile experience.
- Realistic product discovery journeys.

## Access And Evidence Rules

- Separate public consumer evidence from authenticated wholesale evidence.
- Do not use or store private credentials in project files.
- Record inaccessible wholesale workflows as access limitations, not defects.
- Record capture date, URL or locator, access context, viewport where relevant, and freshness status for every evidence item.
- Mark evidence as verify-before-delivery when behavior may have changed or was captured under uncertain conditions.
- Do not overfit the reusable framework to Boxercraft; every proposed rubric change must explain whether it is reusable across verticals, apparel-specific, wholesale-specific, or only Boxercraft-specific.

## Search Evaluation

Run search scenarios that cover:

- Exact matches.
- Partial matches.
- Multi-word queries.
- Attribute queries.
- Category queries.
- Brand or affiliation queries.
- Product identifier or SKU queries when public or authorized.
- Long-tail queries.
- Typo, synonym, abbreviation, and alternate terminology checks.
- Zero-result recovery and alternative suggestions.

Seed queries:

- maroon quarter zip
- women's fleece
- Georgia Bulldogs apparel
- gift under budget
- quarterzip typo variation
- SKU lookup if public or authorized

Capture query text, result count, top results, ranking quality, missing relevant results, duplicate/repetitive results, recovery paths, and mobile friction.

## Autocomplete Evaluation

For representative prefixes, capture:

- Query suggestions.
- Product suggestions.
- Category suggestions.
- Brand or affiliation suggestions.
- Suggestion ranking.
- Suggestion diversity.
- Responsiveness while typing.
- Mobile usability and clarity.
- Whether suggestions expose products or categories the customer may not initially know.

## Browse Navigation Evaluation

Evaluate non-search journeys:

- Find women's fleece through navigation.
- Find a quarter zip through category navigation.
- Find team, affiliation, collection, or licensed apparel paths if present.
- Locate wholesale catalog structure if public or authorized.
- Navigate from homepage or primary menu on mobile.

Capture hierarchy, naming clarity, navigation depth, grouping, completeness, dead ends, destination reached, and steps required.

## Filters And Facets Evaluation

Evaluate result narrowing:

- Size.
- Color.
- Gender, fit, or audience.
- Category.
- Price or budget if available.
- Availability if visible.
- Multi-select support.
- Filter persistence after navigating away, using back, changing sort, or switching pages.

Capture result set before filters, available facets, selected filters, result set after filtering, dead ends, reset behavior, and mobile usability.

## Recommendations And Related Discovery

Evaluate discovery modules on product, category, collection, and cart-adjacent paths where available:

- Related products.
- Similar products.
- Complementary products.
- Seasonal or featured products.
- Alternatives for unavailable items.
- Cross-sell opportunities.

Separate true recommendations from static merchandising when possible.

## Mobile Experience

Use a mobile viewport or physical mobile device. Capture:

- First useful viewport.
- Search input visibility.
- Autocomplete usability.
- Category menu friction.
- Filter usability.
- Tap target clarity.
- Ability to recover from weak or zero results.
- Whether product discovery can be completed without excessive scrolling, repeated work, or hidden controls.

## Journey Analysis

Run realistic customer journeys:

- Find a maroon quarter zip.
- Find women's fleece.
- Find Georgia Bulldogs apparel.
- Find a gift item under a budget.
- Locate a product by SKU if public or authorized.
- Find alternatives to an unavailable item.
- Compare multiple apparel alternatives.
- Navigate a large catalog efficiently.

For each journey, record customer intent, starting point, steps attempted, destination reached, decision quality, recovery path, and effort.

## Finding Workflow

For every finding, record:

- Observation.
- Evidence.
- Severity.
- Customer impact.
- Business impact.
- Recommendation.
- Opportunity class.
- Confidence.
- Access or freshness limitations.

Severity must distinguish mission-critical dead ends from lower-risk refinements. Business impact must be phrased as a plausible mechanism unless measured revenue data exists.

## Calibration Workflow

After the first pilot pass, a second evaluator should apply the rubric to a subset of journeys before the framework is treated as reusable. Compare major findings, severity levels, score rationale, and evidence quality. Record any calibration gap as a rubric improvement task.

## Acceptance Criteria

- All seven assessment areas have evidence or explicit access limitations.
- Search includes query understanding, relevance, robustness, recovery, and effort checks.
- Autocomplete includes suggestion quality, ranking, interaction quality, and discovery support.
- Browse and filters include non-search findability and narrowing efficiency.
- Recommendations capture relevance, diversity, and cross-sell or alternative discovery.
- Mobile evidence includes first useful viewport and task completion friction.
- Findings are evidence-backed and business-readable.
- Boxercraft-specific observations are separated from reusable framework changes.
