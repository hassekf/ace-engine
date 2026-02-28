---
name: ace-architectural-guardian
description: Enforce architectural consistency and guided improvement through ACE MCP tools during code generation and refactoring. Use when implementing features or refactors in projects running ACE, especially to check AchCoverage before/after changes, inspect inconsistencies, evaluate refactor options by complexity, and formalize user-approved architecture rules.
---

# ACE Architectural Guardian

Use this skill to keep code aligned with ACE while preserving delivery speed.

## Execution Mode

1. Treat ACE as the architectural source of truth.
2. Keep generation non-blocking: never stop feature delivery only because a violation exists.
3. Run reactive checks after changes and proactive checks when trends degrade.
4. Formalize rules only after explicit user agreement.

## Required Tool Flow

Run this sequence for structural changes (controllers, models, services, DTOs, repositories, routes, views with architecture impact):

1. Call `ace.get_status`.
2. Call `ace.get_project_model`.
3. Call `ace.get_pattern_registry`.
4. Call `ace.get_learning_bundle` when confidence is low or pattern is ambiguous.
5. If scope is unclear, call `ace.scan_scope` with impacted files.
6. Generate or refactor code.
7. Call `ace.scan_scope` again for changed files.
8. Call `ace.report_inconsistencies` and summarize deltas.

If change is tiny and non-structural, skip directly to step 5.

## Response Contract

At the end of implementation, always return:

1. `AchCoverage` delta and confidence.
2. New inconsistencies and resolved inconsistencies.
3. Top proactive suggestions (architecture, clean code, performance, security, testing).
4. Link to the local report path when available.

Use short language in this format:

- `AchCoverage atualizado: 74% (+2)`
- `2 inconsistências novas, 1 resolvida`
- `Relatório: /abs/path/.ace/report.html`

## Inconsistency Handling

When ACE detects meaningful divergence, present three options:

1. No refactor now (accept temporary debt).
2. Simple refactor (low-risk alignment).
3. Full refactor (high alignment, higher effort).

Estimate impact and effort briefly for each option.

## Rule Formalization Protocol

Only formalize when user explicitly approves a direction.

1. Convert decision into a pattern preference when possible.
2. Call `ace.record_arch_decision` with:
   - `key`
   - `preferred`
   - `rationale`
   - `source`
3. If needed, convert the same decision into stricter enforcement and call `ace.formalize_rule` with:
   - `title`
   - `description`
   - `applies_to`
   - `constraints`
   - `source`
4. Confirm created decision/rule id.
5. Explain that future generations should follow this direction.

If a repeated drift does not fit existing patterns:

1. Propose a new pattern schema.
2. Call `ace.upsert_pattern`.
3. Re-run `ace.scan_scope` to observe the effect on coverage and inconsistencies.

For first-time adoption in a large Laravel project:

1. Call `ace.bootstrap_laravel` with `apply=false` to preview.
2. Review proposed decisions.
3. Call `ace.bootstrap_laravel` with `apply=true` to persist baseline decisions/patterns.

Do not auto-create rules without user consent.

## Proactive Mentoring

When trend degrades or high severity violations repeat:

1. Propose one focused architectural action.
2. Explain why now (risk + expected gain).
3. Keep suggestion pragmatic to current project complexity.

Prefer internal consistency first, then external best practices.
