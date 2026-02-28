# Changelog

All notable changes to ACE are documented in this file.

## [Unreleased]

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

### Changed
- Report now displays `Authorization` scorecard in core dimensions.
- Default coverage weights were rebalanced to include `authorization`.

### Notes
- Plugin system intentionally deferred to v2 after release stabilization.
