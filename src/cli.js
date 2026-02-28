const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const { runScan } = require('./engine');
const { loadState } = require('./state');
const { writeReport } = require('./report');
const { startWatch } = require('./watch');
const { startMcpServer } = require('./mcp/server');
const { formalizeRule, updateRuleStatus } = require('./rules');
const {
  recordArchitecturalDecision,
  updateArchitecturalDecision,
  listArchitecturalDecisions,
} = require('./decisions');
const { buildLearningBundle } = require('./learning');
const { bootstrapLaravel } = require('./bootstrap');
const {
  loadAceConfig,
  initAceConfig,
  addWaiver,
  updateWaiver,
  listWaivers,
} = require('./config');
const { scaffoldIntegration } = require('./init');
const {
  listPatterns,
  upsertPattern,
  setPatternEnabled,
  removePattern,
  loadPatternRegistry,
} = require('./pattern-registry');
const { parseList } = require('./helpers');
const { getComposerDependencyVersions, detectProjectModules, buildModuleScopeDraft } = require('./modules');
const { OUTPUT_SCHEMA_VERSION } = require('./constants');

const SUPPORTED_INIT_LLMS = ['claude', 'cursor', 'copilot', 'codex'];

function parseArgs(argv) {
  const parsed = { _: [] };

  argv.forEach((arg) => {
    if (!arg.startsWith('--')) {
      parsed._.push(arg);
      return;
    }

    const payload = arg.slice(2);
    if (!payload.includes('=')) {
      parsed[payload] = true;
      return;
    }

    const [key, ...rest] = payload.split('=');
    parsed[key] = rest.join('=');
  });

  return parsed;
}

function printHelp() {
  const body = `
ACE · Architectural Coverage Engine

Uso:
  ace <comando> [--root=/abs/ou/rel/path]
  ace scan [--scope=changed|all|path1,path2] [--files=a.php,b.php] [--lang=pt-BR|en-US] [--json] [--root=...]
  ace watch [--interval=2200] [--root=...]
  ace status [--json] [--root=...]
  ace report [--lang=pt-BR|en-US] [--root=...]
  ace mcp [--profile=compact|full] [--root=...]
  ace init [--force] [--json] [--llms=all|codex,claude,cursor,copilot] [--select-llms] [--root=...]
  ace config:init [--force] [--json] [--root=...]
  ace config:show [--json] [--root=...]
  ace rule:add --title="..." [--description="..."] [--applies_to=a,b] [--constraints=x,y]
  ace rule:update --id="rule_id" --status=active|deprecated|inactive|rejected [--note="..."]
  ace decision:add --key="controller.data_access" --preferred="service-layer" [--rationale="..."]
  ace decision:update --id="decision_id" --status=active|approved|superseded|deprecated|rejected|expired|inactive [--note="..."]
  ace decision:list [--key=controller.data_access] [--json]
  ace waiver:add [--type=pattern-drift:*] [--file=app/Http/Controllers/*] [--severity=low] [--contains="texto"] --reason="..." [--until=2026-12-31]
  ace waiver:update --id="waiver_id" --status=active|inactive|expired [--reason="..."] [--until=2026-12-31]
  ace waiver:list [--status=active|inactive|expired] [--json]
  ace learning:bundle [--files=a.php,b.php] [--max_files=20] [--json]
  ace pattern:list [--json]
  ace pattern:upsert --json='{"key":"...","detector":{...}}'
  ace pattern:disable --key="controller.validation"
  ace pattern:enable --key="controller.validation"
  ace pattern:remove --key="controller.validation"
  ace modules:list [--enabled-only] [--json]
  ace bootstrap:laravel [--dry-run] [--scope=all|changed] [--min_confidence=55] [--min_adoption=55]

Exemplos:
  ace scan --scope=all
  ace scan --scope=all --lang=en-US
  ace watch --interval=3000
  ace rule:add --title="Controller via Service" --constraints="No direct model call,Use Service"
  ace decision:add --key="controller.validation" --preferred="form-request" --rationale="Padronizar entrada"
  ace decision:update --id="controller-validation-form-request-v1" --status=approved
  ace waiver:add --type="pattern-drift:*" --file="app/Legacy/*" --reason="Refactor planejado"
  ace pattern:list --json
  ace modules:list --json
  ace bootstrap:laravel --dry-run --json
  ace init --llms=codex,claude
  ace init --select-llms
  ace init --root=/Users/voce/www/meu-projeto
  ace report --lang=en-US
  ace status --root=/Users/voce/www/meu-projeto
`.trim();

  console.log(body);
}

function resolveRoot(args) {
  const rawRoot = args.root || process.env.ACE_ROOT || process.cwd();
  const absoluteRoot = path.isAbsolute(rawRoot)
    ? rawRoot
    : path.resolve(process.cwd(), rawRoot);

  if (!fs.existsSync(absoluteRoot)) {
    throw new Error(`Diretório não encontrado para --root: ${absoluteRoot}`);
  }

  if (!fs.statSync(absoluteRoot).isDirectory()) {
    throw new Error(`--root precisa apontar para um diretório: ${absoluteRoot}`);
  }

  return absoluteRoot;
}

function normalizeInitLlms(rawValue) {
  const aliasMap = {
    claude: 'claude',
    'claude-code': 'claude',
    cursor: 'cursor',
    copilot: 'copilot',
    'github-copilot': 'copilot',
    codex: 'codex',
  };

  const raw = String(rawValue || 'all').trim().toLowerCase();
  if (!raw || raw === 'all') {
    return [...SUPPORTED_INIT_LLMS];
  }

  const items = raw.split(',').map((item) => item.trim()).filter(Boolean);
  const normalized = [];
  const invalid = [];

  items.forEach((item) => {
    if (item === 'all') {
      SUPPORTED_INIT_LLMS.forEach((value) => {
        if (!normalized.includes(value)) {
          normalized.push(value);
        }
      });
      return;
    }

    const mapped = aliasMap[item];
    if (!mapped) {
      invalid.push(item);
      return;
    }

    if (!normalized.includes(mapped)) {
      normalized.push(mapped);
    }
  });

  if (invalid.length > 0) {
    throw new Error(`LLMs inválidas em --llms: ${invalid.join(', ')}. Válidas: ${SUPPORTED_INIT_LLMS.join(', ')}`);
  }

  return normalized.length > 0 ? normalized : [...SUPPORTED_INIT_LLMS];
}

async function resolveInitLlms(args) {
  if (args.llms) {
    return normalizeInitLlms(args.llms);
  }

  if (!args['select-llms']) {
    return [...SUPPORTED_INIT_LLMS];
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('`--select-llms` requer terminal interativo. Use `--llms=` em ambientes não interativos.');
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question(
      `Selecione LLMs para onboarding [all | ${SUPPORTED_INIT_LLMS.join(',')}] (default: all): `,
    );
    return normalizeInitLlms(answer || 'all');
  } finally {
    rl.close();
  }
}

function printSummary(summary) {
  const delta = summary.delta > 0 ? `+${summary.delta}` : `${summary.delta}`;
  const trendStatus = summary.trendStatus || 'stable';
  const regressionTag = summary.regressionAlert?.triggered
    ? ` | regressão: -${summary.regressionAlert.drop} (threshold ${summary.regressionAlert.threshold})`
    : '';
  console.log(
    `AchCoverage atualizado: ${summary.achCoverage}% (${delta}) | novas inconsistências: ${summary.newViolations} | resolvidas: ${summary.resolvedViolations}`,
  );
  console.log(`Test quality: ${Number(summary.testQualityScore || 0)}%`);
  console.log(`Trend: ${trendStatus}${regressionTag}`);
  console.log(
    `Security baseline: ${summary.securityScore}% | falhas: ${summary.securityFailures} | alertas: ${summary.securityWarnings}`,
  );
  console.log(
    `Scan: cache hits ${summary.cacheHits} | analisados ${summary.analyzedFiles} | ignorados ${summary.ignoredFiles} | waived ${summary.waivedViolations}`,
  );
  console.log(`Pattern dominante: ${summary.dominantPattern}`);
  console.log(`Confiança: ${summary.confidence}%`);
  console.log(`Relatório: ${summary.reportPath}`);
}

function statusPayload(root) {
  const state = loadState(root);
  const config = loadAceConfig(root);
  const modules = state.security?.metadata?.modules || [];
  const enabledModules = modules.filter((item) => item.enabled);
  const trend = state.trend?.coverage || {
    status: 'stable',
    regression: { triggered: false, drop: 0, threshold: 0 },
  };
  return {
    schemaVersion: OUTPUT_SCHEMA_VERSION,
    achCoverage: state.coverage.overall,
    delta: state.coverage.delta,
    confidence: state.coverage.confidence,
    testQuality: state.coverage.testQuality || {
      score: 0,
      confidence: 'low',
    },
    trend,
    dominantPattern: state.model.dominantPattern,
    security: {
      score: Number(state.security?.score || 0),
      totals: state.security?.totals || {},
      modeSummary: state.security?.modeSummary || {},
      domainSummary: state.security?.domainSummary || {},
    },
    violations: state.violations.length,
    waivedViolations: (state.waivedViolations || []).length,
    suggestions: state.suggestions.length,
    rules: state.rules.length,
    decisions: (state.decisions || []).length,
    patterns: Object.keys(state.model.patterns || {}).length,
    modules: {
      total: modules.length,
      enabled: enabledModules.length,
      items: modules,
      scopeDraft: state.security?.metadata?.moduleScopeDraft || [],
    },
    reportPath: path.join(root, '.ace', 'report.html'),
    waivers: {
      total: Number(config.waivers?.length || 0),
      active: Number((config.waivers || []).filter((item) => item.status === 'active').length),
    },
    enforcement: {
      enabled: Boolean(config.enforcement?.enabled),
      failOnRegression: config.enforcement?.failOnRegression ?? true,
      thresholds: {
        minCoverage: Number(config.enforcement?.thresholds?.minCoverage ?? 0),
        maxRegressionDrop: Number(config.enforcement?.thresholds?.maxRegressionDrop ?? 5),
        maxSecurityFailures: Number(config.enforcement?.thresholds?.maxSecurityFailures ?? 0),
      },
    },
    updatedAt: state.updatedAt,
    lastScan: state.lastScan,
  };
}

async function runCli(argv) {
  const [command = 'help', ...rest] = argv;
  const args = parseArgs(rest);

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  const root = resolveRoot(args);

  if (command === 'scan') {
    const summary = runScan({
      root,
      scope: args.scope || 'changed',
      explicitFiles: parseList(args.files),
      writeHtml: !args['no-report'],
      reportLanguage: args.lang || null,
    });

    if (args.json) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    printSummary(summary);
    return;
  }

  if (command === 'watch') {
    const interval = Number(args.interval || 2200);
    startWatch({ root, intervalMs: Number.isNaN(interval) ? 2200 : interval });
    return;
  }

  if (command === 'status') {
    const payload = statusPayload(root);

    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    console.log(`AchCoverage: ${payload.achCoverage}% (${payload.delta >= 0 ? '+' : ''}${payload.delta})`);
    console.log(`Confiança: ${payload.confidence}%`);
    console.log(`Test quality: ${Number(payload.testQuality?.score || 0)}% (${payload.testQuality?.confidence || 'low'})`);
    console.log(
      `Trend: ${payload.trend.status || 'stable'}${payload.trend?.regression?.triggered ? ` | regressão: -${payload.trend.regression.drop} (threshold ${payload.trend.regression.threshold})` : ''}`,
    );
    console.log(`Pattern dominante: ${payload.dominantPattern}`);
    console.log(
      `Security baseline: ${payload.security.score}% | falhas: ${Number(payload.security.totals.fail || 0)} | alertas: ${Number(payload.security.totals.warning || 0)}`,
    );
    console.log(
      `Security split: code ${Number(payload.security.domainSummary?.code?.score || 0)}% | pipeline ${Number(payload.security.domainSummary?.pipeline?.score || 0)}%`,
    );
    console.log(`Inconsistências: ${payload.violations}`);
    console.log(`Waived: ${payload.waivedViolations}`);
    console.log(`Sugestões: ${payload.suggestions}`);
    console.log(`Regras: ${payload.rules}`);
    console.log(`Decisões: ${payload.decisions}`);
    console.log(`Waivers ativos: ${payload.waivers.active}/${payload.waivers.total}`);
    console.log(
      `Enforcement (config): ${payload.enforcement.enabled ? 'on' : 'off'} | minCoverage=${payload.enforcement.thresholds.minCoverage}% | maxRegressionDrop=${payload.enforcement.thresholds.maxRegressionDrop}`,
    );
    console.log(`Padrões ativos: ${payload.patterns}`);
    console.log(`Módulos ativos: ${payload.modules.enabled}/${payload.modules.total}`);
    console.log(`Atualizado em: ${payload.updatedAt}`);
    console.log(`Relatório: ${payload.reportPath}`);
    return;
  }

  if (command === 'report') {
    const state = loadState(root);
    const reportPath = writeReport(root, state, {
      locale: args.lang || null,
    });
    console.log(`Relatório gerado em: ${reportPath}`);
    return;
  }

  if (command === 'mcp') {
    startMcpServer({
      root,
      profile: args.profile || null,
    });
    return;
  }

  if (command === 'init') {
    const llms = await resolveInitLlms(args);
    const payload = scaffoldIntegration(root, { force: Boolean(args.force), llms });
    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    const created = payload.artifacts.filter((item) => item.created).length;
    console.log(
      `ACE init concluído | artefatos criados: ${created} | LLMs: ${payload.llms.join(', ')} | integração: ${payload.integrationDir}`,
    );
    console.log('Enforcement policy versionável em .ace/config.json (default: disabled).');
    return;
  }

  if (command === 'config:init') {
    const payload = initAceConfig(root, { force: Boolean(args.force) });
    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    console.log(`${payload.created ? 'Config criada' : 'Config já existia'}: ${payload.configPath}`);
    return;
  }

  if (command === 'config:show') {
    const payload = loadAceConfig(root);
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (command === 'rule:add') {
    const title = args.title;
    if (!title) {
      throw new Error('`--title` é obrigatório em `ace rule:add`.');
    }

    const result = formalizeRule({
      root,
      title,
      description: args.description || '',
      appliesTo: parseList(args.applies_to),
      constraints: parseList(args.constraints),
      source: args.source || 'cli-consensus',
    });

    console.log(`Regra criada: ${result.rule.id}`);
    return;
  }

  if (command === 'rule:update') {
    if (!args.id || !args.status) {
      throw new Error('`--id` e `--status` são obrigatórios em `ace rule:update`.');
    }

    const result = updateRuleStatus({
      root,
      id: args.id,
      status: args.status,
      note: args.note || '',
      source: args.source || 'cli',
    });

    console.log(`Regra atualizada: ${result.rule.id} -> ${result.rule.status}`);
    return;
  }

  if (command === 'decision:add') {
    if (!args.key || !args.preferred) {
      throw new Error('`--key` e `--preferred` são obrigatórios em `ace decision:add`.');
    }

    const result = recordArchitecturalDecision({
      root,
      key: args.key,
      preferred: args.preferred,
      rationale: args.rationale || '',
      source: args.source || 'cli-consensus',
    });

    console.log(`Decisão registrada: ${result.decision.id}`);
    return;
  }

  if (command === 'decision:update') {
    if (!args.id || !args.status) {
      throw new Error('`--id` e `--status` são obrigatórios em `ace decision:update`.');
    }

    const result = updateArchitecturalDecision({
      root,
      id: args.id,
      status: args.status,
      note: args.note || '',
      source: args.source || 'cli',
    });

    console.log(`Decisão atualizada: ${result.decision.id} -> ${result.decision.status}`);
    return;
  }

  if (command === 'decision:list') {
    const payload = listArchitecturalDecisions({
      root,
      key: args.key || null,
      status: args.status || 'active',
    });

    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    if (payload.total === 0) {
      console.log('Nenhuma decisão encontrada.');
      return;
    }

    payload.items.forEach((item) => {
      console.log(`${item.id} | ${item.key} => ${item.preferred} | ${item.source}`);
    });
    return;
  }

  if (command === 'learning:bundle') {
    const state = loadState(root);
    const payload = buildLearningBundle({
      state,
      registry: loadPatternRegistry(root),
      maxFiles: Number(args.max_files || 20),
      scopeFiles: parseList(args.files),
    });
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (command === 'modules:list') {
    const state = loadState(root);
    const metrics = state.model?.stats || {};
    const composerVersions = getComposerDependencyVersions(root);
    const modules = detectProjectModules({
      root,
      metrics,
      composerVersions,
    });
    const draft = buildModuleScopeDraft(modules);
    const payload = {
      total: modules.length,
      enabled: modules.filter((item) => item.enabled).length,
      items: args['enabled-only'] ? modules.filter((item) => item.enabled) : modules,
      scopeDraft: draft,
    };

    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    payload.items.forEach((item) => {
      console.log(`[${item.enabled ? 'on' : 'off'}] ${item.id} | ${item.reason}`);
    });
    console.log(`Módulos ativos: ${payload.enabled}/${payload.total}`);
    return;
  }

  if (command === 'waiver:add') {
    if (!args.reason) {
      throw new Error('`--reason` é obrigatório em `ace waiver:add`.');
    }

    const result = addWaiver(root, {
      type: args.type || null,
      file: args.file || null,
      severity: args.severity || null,
      contains: args.contains || null,
      reason: args.reason,
      until: args.until || null,
      status: 'active',
    });

    console.log(`Waiver criado: ${result.waiver.id}`);
    return;
  }

  if (command === 'waiver:update') {
    if (!args.id) {
      throw new Error('`--id` é obrigatório em `ace waiver:update`.');
    }

    const patch = {};
    if (args.status) patch.status = args.status;
    if (args.reason) patch.reason = args.reason;
    if (args.until) patch.until = args.until;

    const result = updateWaiver(root, args.id, patch);
    console.log(`Waiver atualizado: ${result.waiver.id} -> ${result.waiver.status}`);
    return;
  }

  if (command === 'waiver:list') {
    const payload = listWaivers(root, {
      status: args.status || null,
    });

    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    if (payload.total === 0) {
      console.log('Nenhum waiver encontrado.');
      return;
    }

    payload.items.forEach((item) => {
      console.log(`${item.id} | ${item.status} | ${item.type || '*'} | ${item.file || '*'} | ${item.reason}`);
    });
    return;
  }

  if (command === 'pattern:list') {
    const payload = listPatterns(root);
    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    if (payload.total === 0) {
      console.log('Nenhum pattern registrado.');
      return;
    }

    payload.items.forEach((item) => {
      console.log(`${item.key} | enabled=${item.enabled ? 'yes' : 'no'} | detector=${item.detector?.type || '-'}`);
    });
    return;
  }

  if (command === 'pattern:upsert') {
    if (!args.json) {
      throw new Error('`--json` é obrigatório em `ace pattern:upsert`.');
    }

    let pattern;
    try {
      pattern = JSON.parse(args.json);
    } catch (error) {
      throw new Error('JSON inválido em `--json`.');
    }

    const result = upsertPattern(root, pattern);
    console.log(`Pattern salvo: ${result.pattern.key}`);
    return;
  }

  if (command === 'pattern:disable') {
    if (!args.key) {
      throw new Error('`--key` é obrigatório em `ace pattern:disable`.');
    }
    const result = setPatternEnabled(root, args.key, false);
    console.log(`Pattern desativado: ${result.pattern.key}`);
    return;
  }

  if (command === 'pattern:enable') {
    if (!args.key) {
      throw new Error('`--key` é obrigatório em `ace pattern:enable`.');
    }
    const result = setPatternEnabled(root, args.key, true);
    console.log(`Pattern ativado: ${result.pattern.key}`);
    return;
  }

  if (command === 'pattern:remove') {
    if (!args.key) {
      throw new Error('`--key` é obrigatório em `ace pattern:remove`.');
    }
    const result = removePattern(root, args.key);
    console.log(`Pattern removido: ${result.removedKey}`);
    return;
  }

  if (command === 'bootstrap:laravel') {
    const payload = bootstrapLaravel({
      root,
      scope: args.scope || 'all',
      ensurePatterns: !args['no-patterns'],
      apply: !args['dry-run'],
      minConfidence: Number(args.min_confidence || 55),
      minAdoption: Number(args.min_adoption || 55),
      maxDecisions: Number(args.max_decisions || 4),
    });

    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    console.log(
      `Bootstrap Laravel concluído | patterns adicionados: ${payload.ensurePatterns.added.length} | decisões propostas: ${payload.proposals.length} | decisões aplicadas: ${payload.appliedDecisions.length}`,
    );
    console.log(
      `AchCoverage: ${payload.finalStatus.achCoverage}% | Pattern dominante: ${payload.finalStatus.dominantPattern} | Relatório: ${payload.finalStatus.reportPath}`,
    );
    return;
  }

  printHelp();
}

module.exports = {
  runCli,
};
