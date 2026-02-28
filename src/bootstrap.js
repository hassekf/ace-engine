const { runScan } = require('./engine');
const { loadState } = require('./state');
const { upsertPattern, listPatterns } = require('./pattern-registry');
const { recordArchitecturalDecision } = require('./decisions');

function laravelBootstrapPatterns() {
  return [
    {
      key: 'controller.query_strategy',
      name: 'Controller Query Strategy',
      enabled: true,
      weight: 1,
      detector: {
        type: 'single_ratio',
        totalMetric: 'controllers',
        targetMetric: 'modelAllCallsInController',
        orientation: 'low_is_good',
        highLabel: 'scoped-query',
        lowLabel: 'bulk-all',
        mixedLabel: 'mixed',
        upperStrong: 0.1,
        lowerStrong: 0.35,
      },
      drift: {
        enabled: true,
        scopeKind: 'controller',
        positiveWhen: [{ signal: 'signals.modelAllCalls.length', op: 'eq', value: 0 }],
        negativeWhen: [{ signal: 'signals.modelAllCalls.length', op: 'gt', value: 0 }],
        message: 'Controller com consulta bulk (`Model::all`) fora do padrão esperado.',
        suggestion: 'Preferir paginação/filtros e delegar consultas ao Service/UseCase.',
      },
    },
    {
      key: 'controller.payload_safety',
      name: 'Controller Payload Safety',
      enabled: true,
      weight: 1,
      detector: {
        type: 'single_ratio',
        totalMetric: 'controllers',
        targetMetric: 'requestAllCalls',
        orientation: 'low_is_good',
        highLabel: 'validated-payload',
        lowLabel: 'raw-payload',
        mixedLabel: 'mixed',
        upperStrong: 0.15,
        lowerStrong: 0.45,
      },
      drift: {
        enabled: true,
        scopeKind: 'controller',
        positiveWhen: [{ signal: 'signals.requestAllCalls.length', op: 'eq', value: 0 }],
        negativeWhen: [{ signal: 'signals.requestAllCalls.length', op: 'gt', value: 0 }],
        message: 'Uso de payload cru (`$request->all()`) detectado em controller.',
        suggestion: 'Usar `$request->validated()` ou DTO para entrada validada.',
      },
    },
    {
      key: 'command.query_strategy',
      name: 'Command Query Strategy',
      enabled: true,
      weight: 0.9,
      detector: {
        type: 'single_ratio',
        totalMetric: 'commands',
        targetMetric: 'modelAllCallsInCommand',
        orientation: 'low_is_good',
        highLabel: 'chunked-query',
        lowLabel: 'bulk-all',
        mixedLabel: 'mixed',
        upperStrong: 0.12,
        lowerStrong: 0.35,
      },
      drift: {
        enabled: true,
        scopeKind: 'command',
        positiveWhen: [{ signal: 'signals.modelAllCalls.length', op: 'eq', value: 0 }],
        negativeWhen: [{ signal: 'signals.modelAllCalls.length', op: 'gt', value: 0 }],
        message: 'Command usando consulta bulk sem controle de lote.',
        suggestion: 'Use chunkById/lazy/paginação para processamentos batch.',
      },
    },
    {
      key: 'command.structure',
      name: 'Command Structure',
      enabled: true,
      weight: 0.8,
      detector: {
        type: 'single_ratio',
        totalMetric: 'commands',
        targetMetric: 'fatCommands',
        orientation: 'low_is_good',
        highLabel: 'thin-command',
        lowLabel: 'fat-command',
        mixedLabel: 'mixed',
        upperStrong: 0.2,
        lowerStrong: 0.45,
      },
      drift: {
        enabled: true,
        scopeKind: 'command',
        positiveWhen: [{ signal: 'signals.fileLineCount', op: 'lte', value: 260 }],
        negativeWhen: [{ signal: 'signals.fileLineCount', op: 'gt', value: 260 }],
        message: 'Command extenso fora do padrão operacional esperado.',
        suggestion: 'Extrair fluxo em etapas/services com responsabilidade única.',
      },
    },
    {
      key: 'security.raw_sql',
      name: 'Raw SQL Safety',
      enabled: true,
      weight: 1,
      detector: {
        type: 'single_ratio',
        totalMetric: 'scannedPhpFiles',
        targetMetric: 'dynamicRawSql',
        orientation: 'low_is_good',
        highLabel: 'safe-sql',
        lowLabel: 'dynamic-raw-sql',
        mixedLabel: 'mixed',
        upperStrong: 0.02,
        lowerStrong: 0.06,
      },
      drift: {
        enabled: true,
        positiveWhen: [{ signal: 'signals.dynamicRawSqlLines.length', op: 'eq', value: 0 }],
        negativeWhen: [{ signal: 'signals.dynamicRawSqlLines.length', op: 'gt', value: 0 }],
        message: 'Uso de raw SQL com variável dinâmica detectado.',
        suggestion: 'Aplicar bindings e reduzir interpolação dinâmica.',
      },
    },
  ];
}

function buildDecisionRationale(pattern) {
  const confidence = Number(pattern.confidence || 0);
  const adoption = Number(pattern.adoption || 0);
  return `Bootstrap Laravel: padrão inferido com confiança ${confidence}% e adoção ${adoption}%.`;
}

function buildDecisionProposals({ state, minConfidence, minAdoption, maxDecisions }) {
  const activeDecisionKeys = new Set(
    (state.decisions || []).filter((item) => item.status !== 'inactive').map((item) => item.key),
  );

  const candidates = Object.values(state.model?.patterns || {})
    .filter((pattern) => pattern && !activeDecisionKeys.has(pattern.key))
    .filter((pattern) => !['unknown', 'mixed'].includes(String(pattern.inferred || '').toLowerCase()))
    .filter((pattern) => Number(pattern.confidence || 0) >= minConfidence)
    .filter((pattern) => Number(pattern.adoption || 0) >= minAdoption)
    .sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))
    .slice(0, maxDecisions)
    .map((pattern) => ({
      key: pattern.key,
      preferred: pattern.inferred,
      rationale: buildDecisionRationale(pattern),
      source: 'bootstrap-laravel',
    }));

  return candidates;
}

function ensureBootstrapPatterns(root, { dryRun = false } = {}) {
  const existing = listPatterns(root);
  const existingKeys = new Set(existing.items.map((item) => item.key));
  const added = [];

  laravelBootstrapPatterns().forEach((pattern) => {
    if (existingKeys.has(pattern.key)) {
      return;
    }
    added.push(pattern.key);
    if (!dryRun) {
      upsertPattern(root, pattern);
    }
  });

  const current = dryRun
    ? { total: existing.total + added.length }
    : listPatterns(root);
  return {
    added,
    totalPatterns: current.total,
  };
}

function bootstrapLaravel({
  root,
  scope = 'all',
  ensurePatterns = true,
  apply = true,
  minConfidence = 55,
  minAdoption = 55,
  maxDecisions = 4,
}) {
  const dryRun = !apply;

  const result = {
    ensurePatterns: {
      added: [],
      totalPatterns: 0,
    },
    proposals: [],
    appliedDecisions: [],
    scan: null,
    finalStatus: null,
  };

  const firstScan = runScan({
    root,
    scope,
    explicitFiles: [],
    writeHtml: true,
  });
  result.scan = firstScan;

  if (ensurePatterns) {
    result.ensurePatterns = ensureBootstrapPatterns(root, { dryRun });
    if (!dryRun && result.ensurePatterns.added.length > 0) {
      runScan({
        root,
        scope: 'all',
        explicitFiles: [],
        writeHtml: true,
      });
    }
  }

  let state = loadState(root);
  result.proposals = buildDecisionProposals({
    state,
    minConfidence: Number(minConfidence),
    minAdoption: Number(minAdoption),
    maxDecisions: Number(maxDecisions),
  });

  if (apply) {
    result.proposals.forEach((proposal) => {
      const created = recordArchitecturalDecision({
        root,
        key: proposal.key,
        preferred: proposal.preferred,
        rationale: proposal.rationale,
        source: proposal.source,
        scope: 'project',
      });
      result.appliedDecisions.push(created.decision);
    });

    runScan({
      root,
      scope: 'all',
      explicitFiles: [],
      writeHtml: true,
    });
  }

  state = loadState(root);
  result.finalStatus = {
    achCoverage: state.coverage.overall,
    confidence: state.coverage.confidence,
    dominantPattern: state.model.dominantPattern,
    decisions: (state.decisions || []).length,
    patterns: Object.keys(state.model?.patterns || {}).length,
    violations: (state.violations || []).length,
    suggestions: (state.suggestions || []).length,
    reportPath: `${root}/.ace/report.html`,
  };

  return result;
}

module.exports = {
  bootstrapLaravel,
};
