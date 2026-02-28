# ACE — Architectural Coverage Engine

**Incremental architectural analysis for Laravel projects. Zero dependencies.**

ACE scans your Laravel codebase, measures architectural consistency across five dimensions, infers dominant patterns, evaluates a stack-aware security baseline, and exposes everything through a CLI and an MCP server for LLM integration.

```
AchCoverage: 74% (+3) | Security: 82% | Pattern: service-layer | Confidence: 100%
```

## Why ACE?

As Laravel projects grow, architectural decisions drift. Controllers that started with services start calling models directly. Validation moves from FormRequests to inline. New team members follow the most recent file they find, not the agreed pattern.

ACE makes this drift visible and measurable — without requiring any configuration, AST parsers, or external dependencies.

- **Measures what matters**: layering, validation, testability, consistency, and authorization — weighted and composable
- **Infers patterns**: detects your dominant patterns automatically instead of forcing conventions
- **Tracks decisions**: formalize architectural decisions and rules that your team agreed on
- **Stack-aware security**: evaluates Laravel, Filament, Livewire, Sanctum, Spatie Permission, and Horizon controls
- **Runtime dependency audit**: surfaces Composer/NPM vulnerabilities directly in the report (with severity and fix hints)
- **Actionability Index**: each inconsistency gets a priority score (`P1..P5`) based on severity, recurrence, hotspot concentration, and test signal
- **LLM-native**: MCP server lets Claude, Codex, Cursor, Copilot, or any MCP-compatible LLM query your architecture in real-time
- **Incremental**: SHA1 cache means re-scans only analyze changed files
- **Zero dependencies**: pure Node.js stdlib, runs everywhere Node 18+ runs

## Quick Start

```bash
# Install globally
npm install -g ace-engine

# Or run directly with npx
npx ace-engine scan --scope=all

# Initialize ACE in your Laravel project
cd /path/to/laravel-project
ace init
ace scan --scope=all
ace status
```

## Installation

### Global (recommended)

```bash
npm install -g ace-engine
```

### Per-project (devDependency)

```bash
npm install --save-dev ace-engine
```

### From source

```bash
git clone https://github.com/hassekf/ace-engine.git
cd ace
node ./bin/ace.js help
```

## AchCoverage: The Five Dimensions

ACE computes an **AchCoverage** score (0–100%) from five weighted dimensions:

| Dimension | Weight | What it measures |
|---|---|---|
| **Layering** | 30% | Are controllers delegating to services consistently? Or using direct model calls consistently? ACE adapts to _your_ chosen pattern. |
| **Validation** | 18% | FormRequest adoption vs inline validation. Penalizes `$request->all()` usage. |
| **Testability** | 18% | Test presence + quality signals (assertion density, edge-case coverage, mock pressure, test files without asserts). |
| **Consistency** | 19% | Linear severity-weighted penalty normalized by scanned files (stable in large codebases). |
| **Authorization** | 15% | Authorization signals, model↔policy presence, and auth hygiene in state-changing route surfaces. |

Weights are configurable in `.ace/config.json`:

```json
{
  "coverage": {
    "weights": {
      "layering": 0.30,
      "validation": 0.18,
      "testability": 0.18,
      "consistency": 0.19,
      "authorization": 0.15
    }
  }
}
```

`report.language` defines the default dashboard locale (`en-US` by default, optional `pt-BR`).  
`--lang` on `ace scan`/`ace report` overrides it for that execution.

## Commands

### Core

```bash
ace scan --scope=all              # Full scan
ace scan --scope=changed          # Incremental (only changed files)
ace scan --files=app/Http/Controllers/UserController.php
ace scan --scope=all --lang=en-US # Force report language for this scan
ace status                        # Current state summary
ace status --json                 # Machine-readable output
ace report                        # Generate HTML dashboard
ace report --lang=pt-BR           # Regenerate report in Portuguese (pt-BR)
ace watch --interval=2200         # Watch for changes and re-scan
```

The report includes:
- in-page language selector (`en-US` / `pt-BR`)
- trend correlations
- hotspot concentration summary (violation clustering by file)
- actionability summary for inconsistencies (`P1..P5` + average score)
- pattern drift waves (aggregated drift alerts)
- evidence accordions per security control
- clickable KPI cards (jump/filter by relevant panel)
- security split cards (`Security Code` vs `Pipeline Maturity`)
- dependency audit panel (Composer/NPM vulnerabilities)
- pre-generated localized files for both languages

### Initialization & Config

```bash
ace init                          # Scaffold .ace/ layout, gitignore, LLM onboarding (all targets)
ace init --llms=claude,codex      # Only generate artifacts for specific LLMs
ace init --select-llms            # Interactive LLM selection in terminal
ace init --force                  # Overwrite existing files
ace config:init                   # Create .ace/config.json with defaults
ace config:show                   # Print current config
```

Supported `--llms` targets: `claude`, `cursor`, `copilot`, `codex` (or `all`).

When targeting **Claude** or **Codex**, `ace init` also creates a local skill:
- `.claude/skills/ace-architectural-guardian/SKILL.md`
- `.codex/skills/ace-architectural-guardian/SKILL.md`

These skills instruct the LLM to consult ACE before and after structural changes.

### Architectural Rules

Rules are formalized team agreements about how code should be structured:

```bash
ace rule:add --title="Controller via Service" \
  --constraints="No direct model call,Use Service" \
  --applies_to="controller"

ace rule:update --id="controller-via-service-v1" --status=deprecated \
  --note="Replaced by UseCase pattern"
```

### Architectural Decisions

Decisions record what pattern is preferred for a given concern:

```bash
ace decision:add --key="controller.data_access" \
  --preferred="service-layer" \
  --rationale="Team consensus from sprint 12"

ace decision:update --id="controller-data-access-service-layer-v1" \
  --status=approved

ace decision:list --json
```

### Waivers

Suppress specific violations for legacy code or ongoing refactors:

```bash
ace waiver:add --type="pattern-drift:*" \
  --file="app/Legacy/*" \
  --reason="Refactor in progress" \
  --until=2026-12-31

ace waiver:list --json
ace waiver:update --id="waiver-id" --status=inactive
```

Waivers support wildcards for `type`, `file`, `severity`, and `contains`.

### Pattern Registry

ACE infers patterns automatically, but you can also define custom ones:

```bash
ace pattern:list --json

ace pattern:upsert --json='{
  "key": "controller.data_access",
  "detector": {
    "type": "split_ratio",
    "totalMetric": "controllers",
    "sideAMetric": "controllersUsingService",
    "sideBMetric": "controllersWithDirectModel",
    "labels": { "sideA": "service-layer", "sideB": "direct-model" },
    "orientation": "high_is_good"
  }
}'

ace pattern:disable --key="controller.validation"
ace pattern:enable --key="controller.validation"
ace pattern:remove --key="custom.pattern"
```

### Bootstrap

Accelerate setup for existing Laravel projects:

```bash
ace bootstrap:laravel --dry-run --json   # Preview proposals
ace bootstrap:laravel                     # Apply proposals
```

Bootstrap will:
1. Run an initial full scan
2. Ensure useful Laravel patterns in the registry
3. Propose architectural decisions based on inference + confidence + adoption
4. Optionally apply proposals (skip with `--dry-run`)

### Modules

Detect your Laravel stack and get scoped recommendations:

```bash
ace modules:list --json
ace modules:list --enabled-only
```

Detected modules: Laravel Core, Filament, Livewire, Sanctum, Spatie Permission, Horizon.

### Learning Bundle

Export a comprehensive context bundle for LLM consumption:

```bash
ace learning:bundle --json
ace learning:bundle --files=app/Http/Controllers/PaymentController.php --json
```

Includes: coverage, security highlights, pattern registry, decisions, rules, hotspots, representative files, and guidance prompts.
When `--files` is provided, ACE narrows the bundle to that scope plus directly related files.

## MCP Server

ACE includes a stdio-based [MCP](https://modelcontextprotocol.io/) server compatible with Claude Code, Codex, Cursor, GitHub Copilot, and any MCP-compatible client.

### Starting the server

```bash
ace mcp                         # Compact profile (15 tools)
ace mcp --profile=full          # Alias to the same consolidated 15-tool API
ace mcp --root=/path/to/project # Analyze a different project
```

### Client configuration

After running `ace init`, MCP configuration snippets are generated in `.ace/integration/`.

**Claude Code** (`.claude/settings.json` or project-level):
```json
{
  "mcpServers": {
    "ace": {
      "command": "npx",
      "args": ["ace-engine", "mcp", "--root=/path/to/project"]
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "ace": {
      "command": "npx",
      "args": ["ace-engine", "mcp", "--root=/path/to/project"]
    }
  }
}
```

### Compact profile tools (15)

| Tool | Description |
|---|---|
| `ace.get_status` | Full project status |
| `ace.get_coverage` | AchCoverage with dimensions |
| `ace.get_trend` | Temporal analysis for coverage, security, and violations |
| `ace.get_project_model` | Pattern model and metrics |
| `ace.get_security` | Security baseline evaluation |
| `ace.report_inconsistencies` | Violations with actionability ranking (`P1..P5`), optional priority filter, and actionability/severity sorting |
| `ace.scan_scope` | Trigger scan (all, changed, or specific files) |
| `ace.get_learning_bundle` | Context bundle for LLM reasoning |
| `ace.get_modules` | Detected stack modules with docs |
| `ace.manage_rules` | CRUD for architectural rules |
| `ace.manage_decisions` | CRUD for architectural decisions |
| `ace.manage_waivers` | CRUD for violation waivers |
| `ace.manage_patterns` | CRUD for pattern registry |
| `ace.manage_config` | Read/write project config |
| `ace.bootstrap_laravel` | Auto-setup for Laravel projects |

`ace init` remains available via CLI for project onboarding/scaffolding.

## LLM Integration in Practice

When ACE is connected to an LLM via MCP (or through the `ace-architectural-guardian` skill), it acts as a **live architectural advisor** during code generation and refactoring. The LLM doesn't just generate code — it checks your project's architecture before and after every structural change.

### How the skill works

The `ace-architectural-guardian` skill (auto-created by `ace init` for Claude and Codex) instructs the LLM to follow this flow:

1. **Before generating code** — consult `ace.get_status` and `ace.get_project_model` to understand the current architecture
2. **Generate or refactor** — write code aligned with the detected dominant pattern
3. **After the change** — call `ace.scan_scope` on the modified files and report the delta
4. **Surface issues** — if inconsistencies appear, present options (no refactor / simple refactor / full refactor) with effort estimates
5. **Formalize only with consent** — never auto-create rules or decisions; wait for explicit user approval

The LLM always ends with a status line:

```
AchCoverage: 74% (+2) | 2 new inconsistencies, 1 resolved
Test quality: 81%
Trend: improving | no regression alert
Security: 82% | Report: .ace/report.html
```

### Example scenario

You ask the LLM: *"Create a new OrderController with CRUD for orders"*

Here's what happens behind the scenes:

```
┌─ LLM reads ACE state ─────────────────────────────────────────────┐
│                                                                    │
│  1. ace.get_status                                                 │
│     → AchCoverage: 72%, Pattern: service-layer, Confidence: 100%   │
│                                                                    │
│  2. ace.get_project_model                                          │
│     → 14/16 controllers use Service injection                      │
│     → Dominant: service-layer (87% adoption)                       │
│     → Active decision: controller.data_access → service-layer      │
│                                                                    │
│  LLM understands: this project uses the service layer pattern.     │
│  It should NOT create a controller with direct Model calls.        │
│                                                                    │
├─ LLM generates code ──────────────────────────────────────────────┤
│                                                                    │
│  Creates:                                                          │
│  • app/Http/Controllers/OrderController.php (injects OrderService) │
│  • app/Services/OrderService.php                                   │
│  • app/Http/Requests/StoreOrderRequest.php                         │
│  • app/Http/Requests/UpdateOrderRequest.php                        │
│                                                                    │
├─ LLM re-scans ────────────────────────────────────────────────────┤
│                                                                    │
│  3. ace.scan_scope (files: OrderController.php, OrderService.php)  │
│     → AchCoverage: 74% (+2)                                       │
│     → 0 new inconsistencies                                        │
│     → Pattern adoption: 15/17 controllers (88%)                    │
│                                                                    │
│  4. ace.report_inconsistencies                                     │
│     → No new violations. Coverage improved.                        │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

The LLM responds with the generated code **plus** the ACE summary:

> Created `OrderController` with `OrderService` injection, following the project's service-layer pattern (88% adoption).
>
> `AchCoverage: 74% (+2) | 0 new inconsistencies | Security: 82%`

### When drift is detected

If the LLM had generated a controller with direct `Order::all()` calls instead, the re-scan would flag it:

```
ace.scan_scope → AchCoverage: 70% (-2)
ace.report_inconsistencies → pattern-drift:controller.data_access in OrderController.php
```

The LLM then presents options:

> **Inconsistency detected**: `OrderController` uses direct model calls, but this project follows the service-layer pattern (87% adoption).
>
> 1. **Keep as-is** — accept temporary debt, add waiver
> 2. **Simple refactor** — extract queries to `OrderService`, keep controller thin (~10 min)
> 3. **Full refactor** — add repository layer + service + FormRequests (~30 min)
>
> Which approach do you prefer?

### Formalizing decisions

When you and the LLM agree on a pattern, the LLM can formalize it:

```
You: "Let's make service-layer the official pattern"

LLM calls: ace.manage_decisions({
  action: "create",
  key: "controller.data_access",
  preferred: "service-layer",
  rationale: "Team consensus — 88% adoption, reduces controller complexity"
})

→ Decision created: controller-data-access-service-layer-v1
  Future scans will flag controllers that don't follow this pattern.
```

### Without MCP (CLI only)

Even without LLM integration, ACE works as a standalone CLI tool. Run `ace scan --scope=all` in CI or locally to get the same coverage, security, and consistency metrics.

## Optional CI Enforcement (No Default Blocking)

ACE **does not block CI by default**. Installing/running the package only analyzes and reports.

If your team wants enforcement, enable it explicitly in your pipeline using `ace scan --json`.

Recommended: keep enforcement policy versioned in `.ace/config.json` so the whole team shares the same gate.

```json
{
  "enforcement": {
    "enabled": false,
    "failOnRegression": true,
    "thresholds": {
      "minCoverage": 40,
      "maxRegressionDrop": 5,
      "maxSecurityFailures": 0
    }
  }
}
```

Example (optional gate in CI):

```bash
ace scan --scope=all --json > /tmp/ace-scan.json
node -e '
const fs = require("node:fs");
const scan = JSON.parse(fs.readFileSync("/tmp/ace-scan.json", "utf8"));
const cfg = JSON.parse(fs.readFileSync(".ace/config.json", "utf8"));
const enforcement = cfg.enforcement || {};
if (!enforcement.enabled) {
  console.log("ACE enforcement disabled by config.");
  process.exit(0);
}
const t = enforcement.thresholds || {};
const failures = [];
if ((scan.achCoverage ?? 0) < (t.minCoverage ?? 0)) failures.push(`AchCoverage below ${t.minCoverage}`);
if ((enforcement.failOnRegression ?? true) && (scan.regressionAlert?.triggered ?? false)) {
  const drop = Number(scan.regressionAlert?.drop ?? 0);
  const maxDrop = Number(t.maxRegressionDrop ?? 5);
  if (drop >= maxDrop) failures.push(`Coverage regression drop ${drop} >= ${maxDrop}`);
}
if ((scan.securityFailures ?? 0) > (t.maxSecurityFailures ?? 0)) failures.push(`Security failures > ${t.maxSecurityFailures}`);
if (failures.length) {
  console.error("ACE optional gate failed:");
  failures.forEach((f) => console.error(" - " + f));
  process.exit(1);
}
console.log("ACE optional gate passed.");
'
```

This keeps the default developer experience non-blocking while still allowing strict projects to enforce quality/security in CI.

## Security Baseline

ACE evaluates a security baseline tailored to your detected stack. Controls are only included when the relevant technology is detected.

### Always evaluated (Laravel Core)
- CSRF protection on state-changing routes
- Authentication on state-changing routes
- Rate limiting (throttle middleware)
- Upload validation
- Webhook signature verification
- Raw SQL injection risk (distinguishes safe vs unsafe usage)
- Policy/authorization coverage
- Route-level auth coverage
- Runtime Composer dependency audit (when `composer.json`/`composer.lock` exists)

### Stack-specific controls
- **Filament**: `canAccessPanel()`, page authorization, widget authorization
- **Livewire**: `#[Locked]` property usage on public properties
- **Sanctum**: API guard configuration
- **Spatie Permission**: permission/role enforcement
- **Horizon**: dashboard protection
- **NPM/Node stack**: runtime NPM audit (only when `package.json` exists)

Each control reports `pass`, `warning`, `fail`, or `unknown` with a weighted score.

## File Classification

ACE classifies PHP files into kinds for targeted analysis:

| Kind | Detection |
|---|---|
| `controller` | `app/Http/Controllers/` |
| `service` | `app/Services/`, `app/Actions/`, `app/UseCases/` |
| `job` | `app/Jobs/` |
| `listener` | `app/Listeners/` |
| `middleware` | `app/Http/Middleware/` |
| `helper` | `app/Helpers/`, `app/Utils/` |
| `validator` | `app/Validators/`, `app/Rules/`, `app/Domain/*/Validators/` |
| `value-object` | `app/ValueObjects/` |
| `channel` | `app/Channels/` |
| `mail` | `app/Mail/` or classes extending `Mailable` |
| `logging` | `app/Logging/` |
| `form-component` | `app/Forms/`, `app/Tables/` |
| `scope` | `app/Scopes/` or scope classes/interfaces |
| `kernel` | `app/Http/Kernel.php`, `app/Console/Kernel.php` |
| `websocket` | `app/Websocket/` |
| `filament-support` | `app/Filament/` files outside Resources/Pages/Widgets |
| `broadcasting` | `app/Broadcasting/` |
| `queue-support` | `app/Queue/` |
| `provider` | `app/Providers/` or classes extending `ServiceProvider` |
| `event` | `app/Events/` (and `*/Events/`) |
| `observer` | `app/Observers/` or classes ending with `Observer` |
| `notification` | `app/Notifications/` or classes extending `Notification` |
| `trait` | `app/Traits/` |
| `contract` | `app/Contracts/` or `App\\Contracts` interfaces |
| `http-resource` | `app/Http/Resources/` or classes extending `JsonResource`/`ResourceCollection` |
| `model` | `app/Models/` |
| `policy` | `app/Policies/` |
| `dto` | `app/DTOs/`, `app/Dtos/`, `app/Data/` |
| `enum` | `app/Enums/` |
| `command` | `app/Console/Commands/` |
| `request` | `app/Http/Requests/` |
| `filament-resource` | `app/Filament/*/Resources/` |
| `filament-page` | `app/Filament/*/Pages/` |
| `filament-widget` | `app/Filament/*/Widgets/` |
| `livewire-component` | `app/Livewire/` or `app/Http/Livewire/` |
| `route-file` | `routes/*.php` |

## Analysis Capabilities

ACE uses heuristic-based analysis (regex + brace/parenthesis matching) to detect:

- Service layer adoption (constructor injection of Service/Action/UseCase)
- FormRequest vs inline validation
- Direct model calls in controllers
- Fat controllers and long methods
- `$request->all()` usage
- Raw SQL with safe/unsafe distinction (bindings-aware; request input in bindings is treated as safe)
- `->get()` without constraints (chain-aware, including multiline chains and bounded query variables)
- N+1 query risks (lazy loading in loops)
- Critical financial writes without `DB::transaction()`
- Queue hygiene in jobs (`$tries`, `$timeout`, `failed()`, and uniqueness for critical jobs)
- Heavy listeners without queue hints
- Direct model access inside middleware
- Helpers with direct model access and oversized utility files
- Validators without clear entrypoint (`validate/rules/passes`)
- Mutable Value Objects (public mutable state/setters)
- Mailables without queue and sensitive payload in mail/log channels
- Scopes without `apply()` contract
- Websocket components without clear auth/authz signals
- Large providers and contract imports without container bindings
- Domain/database logic inside events and observers
- Notifications without queue and potential sensitive payloads
- API Resource relation access without `whenLoaded` / `relationLoaded` guards
- Fat/high-coupling traits and traits with direct model access
- Contracts without explicit container binding (`bind`, `singleton`, `scoped`)
- Authorization signals in Filament Pages/Widgets
- Livewire locked properties
- Test file existence per controller/service/model/job/middleware
- Test quality signals across `tests/` (assertions, mocks, edge-case coverage, data providers, files with zero asserts)

## Project Layout

ACE stores all artifacts in `.ace/`. Running `ace init` configures `.gitignore` automatically.

**Versionable** (keep in git — shared with the team):
- `.ace/config.json` — project configuration (thresholds, weights, ignore paths, waivers, enforcement policy)
- `.ace/pattern-registry.json` — dynamic pattern registry
- `.ace/rules.json` — formalized architectural rules
- `.ace/decisions.json` — versioned architectural decisions

**Local/ephemeral** (auto-gitignored):
- `.ace/ace.json` — live state (coverage, security, violations, file index)
- `.ace/report.html` — HTML dashboard
- `.ace/report.en-US.html` — English report (used by the in-report language selector)
- `.ace/report.pt-BR.html` — Portuguese report (used by the in-report language selector)
- `.ace/history/*.json` — per-scan snapshots
- `.ace/integration/*` — MCP configuration snippets

**LLM skills** (created by `ace init` outside `.ace/`):
- `.claude/skills/ace-architectural-guardian/SKILL.md` — Claude Code skill
- `.codex/skills/ace-architectural-guardian/SKILL.md` — Codex skill

## Configuration Reference

`.ace/config.json` supports:

```json
{
  "analysis": {
    "ignorePaths": ["app/Legacy", "app/Generated"],
    "regressionThreshold": 5,
    "driftWaveThreshold": 3,
    "trendWindow": 8,
    "trendStableBand": 1.5,
    "thresholds": {
      "fatControllerLines": 220,
      "largeControllerMethodLines": 80,
      "fatServiceLines": 260,
      "fatModelLines": 320,
      "fatModelMethods": 15,
      "fatCommandLines": 260,
      "fatHelperLines": 220,
      "fatValidatorLines": 220,
      "fatFormComponentLines": 260,
      "fatProviderLines": 280,
      "fatEventLines": 140,
      "fatObserverLines": 180,
      "fatNotificationLines": 180,
      "fatTraitLines": 180,
      "fatTraitMethods": 10,
      "highTraitImports": 8,
      "fatFilamentResourceLines": 320,
      "fatFilamentResourceMethods": 12
    }
  },
  "coverage": {
    "weights": {
      "layering": 0.30,
      "validation": 0.18,
      "testability": 0.18,
      "consistency": 0.19,
      "authorization": 0.15
    }
  },
  "security": {
    "audits": {
      "composer": true,
      "npm": true,
      "timeoutMs": 15000,
      "maxEntries": 120
    }
  },
  "enforcement": {
    "enabled": false,
    "failOnRegression": true,
    "thresholds": {
      "minCoverage": 0,
      "maxRegressionDrop": 5,
      "maxSecurityFailures": 0
    }
  },
  "report": {
    "language": "en-US",
    "tableRowLimit": 200,
    "suggestionLimit": 40,
    "hotspotLimit": 12,
    "historyLimit": 24
  },
  "waivers": []
}
```

## All Flags

Every command accepts `--root=/path/to/project` to operate on a different directory. Many commands accept `--json` for machine-readable output.

```
ace help
ace scan [--scope=changed|all|path1,path2] [--files=a.php,b.php] [--lang=pt-BR|en-US] [--json]
ace watch [--interval=2200]
ace status [--json]
ace report [--lang=pt-BR|en-US]
ace mcp [--profile=compact|full]
ace init [--force] [--json] [--llms=all|claude,cursor,copilot,codex] [--select-llms]
ace config:init [--force] [--json]
ace config:show [--json]
ace rule:add --title="..." [--description="..."] [--applies_to=a,b] [--constraints=x,y]
ace rule:update --id="..." --status=active|deprecated|inactive|rejected [--note="..."]
ace decision:add --key="..." --preferred="..." [--rationale="..."]
ace decision:update --id="..." --status=active|approved|superseded|deprecated|rejected|expired|inactive [--note="..."]
ace decision:list [--key=...] [--json]
ace waiver:add [--type=...] [--file=...] [--severity=...] [--contains=...] --reason="..." [--until=YYYY-MM-DD]
ace waiver:update --id="..." --status=active|inactive|expired [--reason="..."] [--until=YYYY-MM-DD]
ace waiver:list [--status=active|inactive|expired] [--json]
ace learning:bundle [--files=a.php,b.php] [--max_files=20] [--json]
ace pattern:list [--json]
ace pattern:upsert --json='...'
ace pattern:disable --key="..."
ace pattern:enable --key="..."
ace pattern:remove --key="..."
ace modules:list [--enabled-only] [--json]
ace bootstrap:laravel [--dry-run] [--scope=all|changed] [--min_confidence=55] [--min_adoption=55]
```

## JSON Contract

Machine-readable outputs include a `schemaVersion` field for forward compatibility:

- `ace scan --json`
- `ace status --json`
- `ace learning:bundle --json`
- MCP tools `ace.get_status` and `ace.get_project_model`

If you integrate ACE with scripts/CI bots, validate `schemaVersion` before parsing.

## How it Works

1. **Discovery** — finds all `.php` files, respecting ignore paths
2. **Cache check** — compares SHA1 hash + analyzer version; unchanged files skip analysis
3. **Analysis** — extracts a broad metric set per file using heuristic-based PHP analysis
4. **Pattern inference** — detects dominant patterns using configurable detectors (`split_ratio`, `single_ratio`)
5. **Waiver application** — matches and applies active waivers, auto-expires when due
6. **Coverage** — computes 5 dimensions + weighted overall score
7. **Security** — evaluates stack-aware baseline controls
8. **Suggestions** — generates actionable improvement suggestions
9. **State persistence** — saves to `.ace/` with governance files as dedicated sidecars

## Requirements

- **Node.js 18+**
- **No external dependencies** — uses only Node.js built-in modules
- Target projects should follow Laravel conventions (`app/Http/Controllers/`, `app/Models/`, etc.)

## Contributing

```bash
git clone https://github.com/hassekf/ace-engine.git
cd ace
npm test   # 52+ tests, fast feedback, no setup needed
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution workflow, MCP API policy, and release checklist.

## License

[MIT](LICENSE)
