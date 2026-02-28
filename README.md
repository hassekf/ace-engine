# ACE · Architectural Coverage Engine

ACE é um engine incremental para **coverage arquitetural** que roda localmente e em paralelo ao seu fluxo com LLM.

## Objetivo do MVP

- Escanear projeto Laravel incrementalmente.
- Medir consistência arquitetural (AchCoverage).
- Inferir padrões arquiteturais dominantes por contexto e por registry dinâmico.
- Detectar inconsistências e hotspots.
- Avaliar baseline de segurança Laravel/Livewire/Filament por padrão (sem configuração manual).
- Detectar riscos de performance/integridade (N+1, `->get()` sem limite e writes críticos sem transação).
- Suportar configuração por projeto (`.ace/config.json`) com waivers e thresholds.
- Manter cache incremental por hash para reduzir reanálise.
- Gerar painel HTML local.
- Expor MCP local para LLM consultar estado/coverage, sugerir decisões, formalizar regras e evoluir patterns.
- Detectar módulos por stack com docs oficiais e escopos sugeridos para LLM (Filament/Livewire/Sanctum/Spatie/Horizon).

## Instalação local (dev)

```bash
cd /Users/hassekf/www/ace
node ./bin/ace.js help
npm test
```

## Comandos

```bash
ace scan --scope=all
ace scan --scope=changed
ace watch --interval=2200
ace status
ace report
ace mcp
ace mcp --profile=full
ace init
ace init --llms=codex,claude
ace init --select-llms
ace config:init --force
ace config:show
ace rule:add --title="Controller via Service" --constraints="No direct model call,Use Service"
ace rule:update --id="controller-via-service-v1" --status=deprecated --note="Substituído por UseCase"
ace decision:add --key="controller.data_access" --preferred="service-layer" --rationale="Padrao do projeto"
ace decision:update --id="controller-data-access-service-layer-v1" --status=approved
ace decision:list --json
ace waiver:add --type="pattern-drift:*" --file="app/Legacy/*" --reason="Refactor em andamento" --until=2026-12-31
ace waiver:list --json
ace learning:bundle --json
ace modules:list --json
ace pattern:list --json
ace pattern:upsert --json='{"key":"custom.pattern","detector":{"type":"single_ratio","totalMetric":"controllers","targetMetric":"controllersUsingService","orientation":"high_is_good"}}'
ace pattern:remove --key="custom.pattern"
ace bootstrap:laravel --dry-run --json
ace status --root=/Users/voce/www/projeto-laravel
```

Todos os comandos aceitam `--root=/caminho/do/projeto` para operar fora da pasta atual.

## Testes

```bash
npm test
```

Também há workflow de CI em `.github/workflows/ci.yml`.

## Estado e relatório

O ACE grava artefatos em `.ace/`:

Arquivos versionáveis (recomendado em git):

- `.ace/config.json`: config do projeto (thresholds, pesos, ignore paths, waivers).
- `.ace/pattern-registry.json`: registry dinâmico de patterns avaliados pelo engine.
- `.ace/rules.json`: regras arquiteturais formalizadas.
- `.ace/decisions.json`: decisões arquiteturais versionadas.

Arquivos locais/efêmeros (normalmente ignorados):

- `.ace/ace.json`: estado vivo (coverage, segurança, violações, índice de arquivos, histórico recente).
- `.ace/report.html`: painel HTML.
- `.ace/history/*.json`: snapshots por execução.
- `.ace/integration/*`: snippets de integração MCP/skill gerados por `ace init`.

Onboarding por LLM via `ace init`:

- `--llms=all|codex,claude,cursor,copilot` para escolher alvos explicitamente.
- `--select-llms` para seleção interativa no terminal.
- Para Codex e Claude, o init cria skill local:
  - `.codex/skills/ace-architectural-guardian/SKILL.md`
  - `.claude/skills/ace-architectural-guardian/SKILL.md`

O comando `ace init` agora cria/atualiza um bloco gerenciado no `.gitignore` do projeto para manter essa separação automaticamente.

## MCP (stdio)

Por padrão o ACE sobe o MCP em perfil `compact` (15 tools), para evitar hard-cap de tools em clientes MCP.
Para expor todas as tools legadas, use `ace mcp --profile=full` (ou `ACE_MCP_PROFILE=full`).

Tools do perfil `compact`:

- `ace.get_status`
- `ace.get_coverage`
- `ace.get_project_model`
- `ace.get_security`
- `ace.report_inconsistencies`
- `ace.scan_scope`
- `ace.get_learning_bundle`
- `ace.get_modules`
- `ace.manage_rules`
- `ace.manage_decisions`
- `ace.manage_waivers`
- `ace.manage_patterns`
- `ace.manage_config`
- `ace.init_project`
- `ace.bootstrap_laravel`

Use `ace mcp` para subir o servidor e conectar no cliente LLM que suporte MCP.
Para expor outro projeto via MCP, use `ace mcp --root=/caminho/do/projeto`.

## Bootstrap Laravel

Use o bootstrap para acelerar setup em projetos Laravel já existentes:

```bash
ace bootstrap:laravel --dry-run --json
ace bootstrap:laravel
```

Comportamento:

1. Executa scan inicial.
2. Garante patterns Laravel úteis no registry (quando ausentes).
3. Propõe decisões arquiteturais com base em inferência + confiança + adoção.
4. Opcionalmente aplica decisões propostas (padrão: aplica; use `--dry-run` para prévia).

## Skill pronta

A skill `ace-architectural-guardian` foi criada em:

- `/Users/hassekf/www/ace/skills/ace-architectural-guardian/SKILL.md`
- `/Users/hassekf/www/ace/skills/ace-architectural-guardian/agents/openai.yaml`

Ela descreve o fluxo reativo + proativo:

1. Consultar ACE antes da geração.
2. Revalidar coverage após a mudança.
3. Sugerir opções de melhoria sem bloquear entrega.
4. Formalizar regra apenas com consenso explícito do usuário.

## Observações

- Este MVP é heurístico e orientado a Laravel (regex + estrutura de pastas + inferência incremental).
- O analyzer agora usa parsing de blocos de função com matching de chaves para reduzir erro de contagem por regex simples.
- O analyzer inclui checks de performance e integridade transacional para projetos Laravel grandes.
- O baseline de segurança é stack-aware e modular: checks opcionais só entram quando a stack é detectada.
- Os defaults iniciais existem, mas vivem no `pattern-registry.json` e podem ser alterados sem patch no core.
- O analyzer evita “opinião fixa” quando não há confiança suficiente e mantém padrões como `unknown` até ter evidência.
- Próxima etapa natural: AST parser robusto dedicado (`nikic/php-parser` ou parser equivalente em Node) e score por domínio/regra.
