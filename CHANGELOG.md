# Changelog

All notable changes to ACE are documented in this file.

## [Unreleased]

## [0.3.0] - 2026-02-28

### Changed
- Report dynamic i18n (`en-US`) refactored to deterministic phrase-level translation rules (removed broad token-level replacements that could corrupt words/phrases).
- Documentation now includes an explicit **optional CI enforcement** section (no blocking by default; teams can opt-in with `ace scan --json` thresholds).
- Added versionable `enforcement` policy in `.ace/config.json` (disabled by default), so teams can turn on CI gating in a shared and auditable way.
- CLI now surfaces enforcement policy visibility:
  - `ace init` reminds that enforcement is versioned in `.ace/config.json` and disabled by default.
  - `ace status` displays enforcement state and active threshold values.
- Analyzer reduces false positives in `unbounded-get-query` by requiring likely query context before flagging `->get()`.
- Testability now uses explicit `testTargets` to avoid denominator distortion, with smarter model/listener test expectations.
- Model analysis no longer runs `unbounded-get` discipline by default (focus on execution surfaces).
- MCP API is now consolidated for both `compact` and `full` profiles (legacy granular tools removed from manifest surface).
- Added MCP tool `ace.get_trend` for temporal data (coverage/security/violations series and window summary).
- Consistency score now uses linear severity-weighted penalty normalized by scanned files (no exponential collapse to `0%` in large projects).
- Security baseline now exposes domain split (`code` vs `pipeline`) for clearer reading of product risk vs CI maturity.
- Report scorecards now surface `Security Code` and `Pipeline Maturity` as separate KPIs.
- Pattern drift now supports wave aggregation (`pattern-drift-wave:*`) to reduce repeated per-file noise.
- Report hotspot panel now shows violation clustering concentration across hotspot files.

### Added
- `CONTRIBUTING.md` with development, MCP API, testing, and release guidelines.

## [0.2.0] - 2026-02-28

### Added
- Team-friendly ACE storage split:
  - Versionable governance files: `.ace/rules.json`, `.ace/decisions.json`
  - Ephemeral runtime state remains in `.ace/ace.json`
- `ace init` onboarding by LLM target:
  - `--llms=all|codex,claude,cursor,copilot`
  - `--select-llms` interactive mode
  - Local skill bootstrap for Codex (`.codex/skills/...`) and Claude (`.claude/skills/...`)
- Analyzer coverage for new Laravel kinds:
  - `job`, `listener`, `middleware`, `dto`, `enum`
- Queue hygiene checks for jobs:
  - missing `$tries`
  - missing `$timeout`
  - missing `failed()` handler
  - critical jobs without uniqueness signal
- Coverage dimension `authorization` with dedicated scoring.
- Contextual learning bundle scope support:
  - `ace learning:bundle --files=...`
  - `ace.get_learning_bundle` now accepts `files`
- Output schema marker (`schemaVersion`) added to key JSON payloads.
- CI hardening:
  - Node matrix (`18`, `20`, `22`)
  - CLI smoke tests (`init`, `scan`, `status`, `learning:bundle`)
- Runtime dependency audits in security baseline:
  - `composer audit` ingestion (vulnerability details by package/CVE/severity/fix)
  - `npm audit` ingestion when Node manifests exist
  - cached audit reuse by dependency fingerprint
- Security controls for runtime audits:
  - `dependencies.composer_runtime_audit`
  - `dependencies.npm_runtime_audit`
- Report UX upgrades:
  - dependency audits panel with filters/search
  - evidence rendering per control
  - clickable KPI cards with contextual navigation/filter
- Configurable audit behavior in `.ace/config.json`:
  - `security.audits.composer`
  - `security.audits.npm`
  - `security.audits.timeoutMs`
  - `security.audits.maxEntries`

### Changed
- Report now displays `Authorization` scorecard in core dimensions.
- Default coverage weights were rebalanced to include `authorization`.
- Security evidence now expands in full-width rows below each control entry for better readability of file lists.

### Notes
- Plugin system intentionally deferred to v2 after release stabilization.
