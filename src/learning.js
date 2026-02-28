function buildLearningBundle({ state, registry, maxFiles = 20 }) {
  const entries = Object.values(state.fileIndex || {});
  const files = entries
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

  const highSeverity = (state.violations || [])
    .filter((item) => item.severity === 'high')
    .slice(0, 40);

  const hotspotMap = new Map();
  (state.violations || []).forEach((item) => {
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
    generatedAt: state.updatedAt,
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
    ],
  };
}

module.exports = {
  buildLearningBundle,
};
