# Contributing

Thanks for contributing to ACE.

## Development Setup

1. Clone repository.
2. Use Node 20+.
3. Install dependencies:

```bash
npm install
```

## Run Locally

```bash
npm run scan
npm run report
npm run status
npm run mcp
```

For another project root:

```bash
node ./bin/ace.js scan --scope=all --root=/path/to/project
```

## Tests

Run full suite before opening a PR:

```bash
npm test
```

## Coding Guidelines

- Keep ACE zero-runtime-dependencies.
- Prefer deterministic heuristics over opaque logic.
- Add/adjust tests for every behavior change.
- Keep MCP compact profile within common hard-cap (15 tools).
- Avoid breaking JSON output contracts; when needed, version fields explicitly.

## MCP API Policy

- Public MCP API is the consolidated tool set exposed by `buildToolsManifest`.
- Do not add new tools to compact profile without checking 15-tool limit.
- Prefer extending existing `ace.manage_*` tools over creating granular commands.

## Reporting and i18n

- Keep `en-US` and `pt-BR` report output aligned.
- Avoid broad token-level string replacements; prefer deterministic phrase mappings.

## Release Checklist

1. Update tests and docs.
2. Update `CHANGELOG.md` (`[Unreleased]`).
3. Bump version in `package.json`.
4. Run `npm test`.
5. Create tag/release.

## Security Notes

- ACE reports security signals but does not replace manual review.
- Never remove high-severity checks silently; document rationale in changelog.
