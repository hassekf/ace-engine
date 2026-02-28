const path = require('node:path');

function normalizeInputFiles(files = []) {
  return (files || [])
    .map((item) => String(item || '').replace(/\\/g, '/').trim())
    .filter(Boolean);
}

function basenameStem(filePath) {
  const base = path.basename(String(filePath || ''), path.extname(String(filePath || '')));
  return base.replace(
    /(Controller|Service|Action|UseCase|Job|Listener|Middleware|Policy|Dto|DTO|Data|Request|Resource|Page|Widget|Model|Test)$/i,
    '',
  );
}

function resolveScope(entries, inputFiles = []) {
  const requested = normalizeInputFiles(inputFiles);
  if (requested.length === 0) {
    return {
      requestedFiles: [],
      matchedFiles: [],
      relatedFiles: [],
      scopedEntries: entries,
      scopedViolations: [],
    };
  }

  const requestedSet = new Set(requested);
  const matchedEntries = entries.filter((entry) => {
    const file = String(entry.file || '').replace(/\\/g, '/');
    return requestedSet.has(file) || requested.some((candidate) => file.endsWith(candidate));
  });

  const matchedFiles = matchedEntries.map((entry) => entry.file);
  const stemSet = new Set(
    matchedFiles
      .map((file) => basenameStem(file))
      .filter((stem) => stem && stem.length >= 3),
  );

  const relatedEntries = entries.filter((entry) => {
    if (matchedFiles.includes(entry.file)) {
      return false;
    }
    const stem = basenameStem(entry.file);
    return stem && stemSet.has(stem);
  });

  const scopedEntries = matchedEntries.length > 0 ? [...matchedEntries, ...relatedEntries] : relatedEntries;
  const scopedViolations = scopedEntries.flatMap((entry) => entry.violations || []);

  return {
    requestedFiles: requested,
    matchedFiles,
    relatedFiles: relatedEntries.map((entry) => entry.file),
    scopedEntries,
    scopedViolations,
  };
}

function buildLearningBundle({ state, registry, maxFiles = 20, scopeFiles = [] }) {
  const entries = Object.values(state.fileIndex || {});
  const scope = resolveScope(entries, scopeFiles);
  const sourceEntries = scope.requestedFiles.length > 0 && scope.scopedEntries.length > 0 ? scope.scopedEntries : entries;

  const files = sourceEntries
    .map((entry) => ({
      file: entry.file,
      kind: entry.kind,
      signal: {
        usesService: Boolean(entry.signals?.usesService),
        usesFormRequest: Boolean(entry.signals?.usesFormRequest),
        directModelCalls: (entry.signals?.directModelCalls || []).length,
        requestAllCalls: (entry.signals?.requestAllCalls || []).length,
        fileLineCount: Number(entry.signals?.fileLineCount || 0),
        largeMethodCount: Number(entry.signals?.largeMethodCount || 0),
      },
      violationCount: (entry.violations || []).length,
    }))
    .sort((a, b) => b.violationCount - a.violationCount || b.signal.fileLineCount - a.signal.fileLineCount)
    .slice(0, maxFiles);

  const violationSource =
    scope.requestedFiles.length > 0 && scope.scopedViolations.length > 0 ? scope.scopedViolations : state.violations || [];
  const highSeverity = violationSource
    .filter((item) => item.severity === 'high')
    .slice(0, 40);

  const hotspotMap = new Map();
  violationSource.forEach((item) => {
    const file = item.file || 'unknown';
    const current = hotspotMap.get(file) || { file, total: 0, high: 0, medium: 0, low: 0 };
    current.total += 1;
    if (item.severity === 'high' || item.severity === 'critical') current.high += 1;
    else if (item.severity === 'medium') current.medium += 1;
    else current.low += 1;
    hotspotMap.set(file, current);
  });
  const hotspots = Array.from(hotspotMap.values())
    .sort((a, b) => b.high - a.high || b.medium - a.medium || b.total - a.total)
    .slice(0, 15);

  const metricCatalog = Object.keys(state.model?.stats || {}).map((metric) => ({
    key: metric,
    value: Number(state.model?.stats?.[metric] || 0),
  }));

  return {
    schemaVersion: 1,
    generatedAt: state.updatedAt,
    scope: {
      requestedFiles: scope.requestedFiles,
      matchedFiles: scope.matchedFiles,
      relatedFiles: scope.relatedFiles,
      scoped: scope.requestedFiles.length > 0,
    },
    coverage: state.coverage,
    security: {
      score: Number(state.security?.score || 0),
      totals: state.security?.totals || {},
      highlights: (state.security?.highlights || []).slice(0, 20),
      modules: state.security?.metadata?.modules || [],
      moduleScopeDraft: state.security?.metadata?.moduleScopeDraft || [],
    },
    trend: (state.history || []).slice(-24),
    waivers: {
      total: Number((state.waivedViolations || []).length),
      recent: (state.waivedViolations || []).slice(0, 25),
    },
    model: state.model,
    patternRegistry: registry || { patterns: [] },
    metricCatalog,
    decisions: state.decisions || [],
    rules: state.rules || [],
    hotspots: highSeverity,
    fileHotspots: hotspots,
    representativeFiles: files,
    guidance: [
      'Inferir padrões arquiteturais dominantes no escopo Laravel atual.',
      'Sugerir no máximo 3 decisões arquiteturais com melhor impacto/esforço.',
      'Quando sugerir decisão, informar key + preferred + rationale curto.',
      'Quando propor novo padrão, retornar detector + drift em formato ace.upsert_pattern.',
      'Priorizar correções para controles de segurança em status fail/warning antes de recomendações estéticas.',
      scope.requestedFiles.length > 0
        ? 'Priorizar recomendações para os arquivos do escopo solicitado e seus relacionados diretos.'
        : 'Quando não houver escopo explícito, priorizar hotspots com maior severidade e recorrência.',
    ],
  };
}

module.exports = {
  buildLearningBundle,
};
