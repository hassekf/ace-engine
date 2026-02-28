const fs = require('node:fs');
const path = require('node:path');
const { ACE_DIR, REPORT_FILE } = require('./constants');
const { loadAceConfig } = require('./config');

const REPORT_LANGUAGE_FILES = {
  'en-US': 'report.en-US.html',
  'pt-BR': 'report.pt-BR.html',
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0))}%`;
}

function formatPercentOrFallback(value, fallback = 'N/A') {
  if (value == null || Number.isNaN(Number(value))) {
    return fallback;
  }
  return `${Math.round(Number(value))}%`;
}

function formatSigned(value) {
  const numeric = Number(value || 0);
  if (Number.isNaN(numeric)) {
    return '0';
  }
  return `${numeric > 0 ? '+' : ''}${numeric}`;
}

function normalizeTrendCoverage(trendCoverage, fallbackDelta = 0) {
  const fallbackStatus = fallbackDelta > 1.5 ? 'improving' : fallbackDelta < -1.5 ? 'degrading' : 'stable';
  const safeTrend = trendCoverage || {};
  const regression = safeTrend.regression || {};

  return {
    status: safeTrend.status || fallbackStatus,
    deltaWindow: Number(safeTrend.deltaWindow || fallbackDelta || 0),
    averageStep: Number(safeTrend.averageStep || 0),
    sampleSize: Number(safeTrend.sampleSize || 0),
    regression: {
      triggered: Boolean(regression.triggered),
      drop: Number(regression.drop || 0),
      threshold: Number(regression.threshold || 0),
    },
  };
}

function trendStatusLabel(status, copy) {
  if (status === 'improving') return copy.trendStateImproving;
  if (status === 'degrading') return copy.trendStateDegrading;
  return copy.trendStateStable;
}

const REPORT_LOCALES = {
  'pt-BR': {
    code: 'pt-BR',
    reportTitle: 'ACE Report',
    heroTitle: 'ACE · Architectural Coverage Engine',
    na: 'N/A',
    updatedLabel: 'Atualizado',
    patternLabel: 'Pattern',
    securityLabel: 'Security',
    violationsLabel: 'Violations',
    suggestionsLabel: 'Sugestões',
    decisionsLabel: 'Decisões',
    coreScorecards: 'Core Scorecards',
    achCoverage: 'AchCoverage',
    trend: 'Tendência',
    confidence: 'Confiança',
    securityScore: 'Security Score',
    securityFails: 'Security Fails',
    scope: 'Escopo',
    layering: 'Layering',
    validation: 'Validation',
    testability: 'Testability',
    testQuality: 'Qualidade dos Testes',
    consistency: 'Consistency',
    authorization: 'Authorization',
    securityAutomated: 'Security Automated',
    securitySemi: 'Security Semi',
    securityManual: 'Security Manual',
    securityStatus: 'Security Status',
    securityCode: 'Security Code',
    pipelineMaturity: 'Pipeline Maturity',
    filamentPagesSec: 'Filament Pages Sec',
    filamentWidgetsSec: 'Filament Widgets Sec',
    trendDiff: 'Trend & Diff',
    trendHistoryTitle: 'AchCoverage vs Security (histórico)',
    trendStatus: 'Status do Trend',
    trendWindowDelta: 'Delta da janela',
    trendAverageStep: 'Passo médio',
    trendWindowSamples: 'Amostras',
    trendCorrelationsTitle: 'Correlações de Tendência',
    trendCorrelationsEmpty: 'Dados insuficientes para correlação (mínimo 4 amostras com ambos os sinais).',
    corrCoverageVsViolations: 'AchCoverage ↔ Total de inconsistências',
    corrTestQualityVsNewViolations: 'Qualidade de Testes ↔ Novas inconsistências',
    corrSecurityVsFails: 'Security Score ↔ Security fails',
    corrStrengthStrong: 'forte',
    corrStrengthModerate: 'moderada',
    corrStrengthWeak: 'fraca',
    corrDirectionInverse: 'inversa',
    corrDirectionDirect: 'direta',
    corrSamplePrefix: 'n',
    trendStateImproving: 'Melhorando',
    trendStateStable: 'Estável',
    trendStateDegrading: 'Degradando',
    regressionAlert: 'Alerta de regressão',
    regressionNone: 'Sem regressão relevante',
    points: 'pontos',
    threshold: 'limite',
    lastCycle: 'Último ciclo',
    newInconsistencies: 'Novas inconsistências',
    resolvedItems: 'Resolvidas',
    waivedItems: 'Waived',
    cacheHits: 'Cache hits',
    reanalyzedFiles: 'Reanalisados',
    ignoredByConfig: 'Ignorados por config',
    domainHealthProfile: 'Domain Health Profile',
    securityBaseline: 'Security Baseline',
    securityBaselineEmpty: 'Baseline de segurança ainda não avaliado. Execute um scan.',
    dependencyAuditsTitle: 'Dependency Audits',
    dependencyAuditsEmpty: 'Sem dados de audit de dependências neste escopo.',
    dependencyVulnerabilities: 'Dependency Vulnerabilities',
    dependencyVulnerabilitiesEmpty: 'Nenhuma vulnerabilidade aberta detectada nos audits disponíveis.',
    recentViolations: 'Inconsistências Recentes',
    recentViolationsEmpty: 'Nenhuma inconsistência registrada no momento.',
    actionabilitySummary: 'Actionability',
    actionabilityHighPriority: 'High priority',
    actionabilityAverage: 'Média',
    actionabilityTop: 'Topo',
    topHotspots: 'Top Hotspots',
    topHotspotsEmpty: 'Sem hotspots no momento.',
    hotspotConcentration: 'Concentração de Hotspots',
    filesWithViolations: 'Arquivos com inconsistências',
    hotspotFiles: 'Arquivos hotspot',
    waivedViolationsTitle: 'Waived Violations',
    waivedViolationsEmpty: 'Nenhuma inconsistência está em waiver ativo.',
    quickWinsTitle: 'Quick Wins (Impacto Alto + Esforço Baixo)',
    quickWinsEmpty: 'Sem quick wins disponíveis no momento.',
    proactiveSuggestions: 'Sugestões Proativas',
    proactiveSuggestionsEmpty: 'Sem sugestões proativas nesta execução.',
    inferredPatterns: 'Padrões Inferidos e Esperados',
    inferredPatternsEmpty: 'Ainda sem padrões inferidos. Execute um scan com escopo relevante.',
    driftWavesTitle: 'Pattern Drift Waves',
    driftWavesEmpty: 'Sem ondas de drift relevantes no momento.',
    activeRules: 'Regras Ativas (Formalizadas)',
    activeRulesEmpty:
      'Nenhuma regra formalizada. Use MCP `ace.manage_rules` (action=create) ou CLI `ace rule:add`.',
    activeDecisions: 'Decisões Arquiteturais Ativas',
    activeDecisionsEmpty:
      'Sem decisões ativas. Registre decisões com MCP `ace.manage_decisions` (action=create) ou CLI `ace decision:add`.',
    status: 'Status',
    mode: 'Modo',
    severity: 'Severidade',
    category: 'Categoria',
    search: 'Buscar',
    clearFilters: 'Limpar filtros',
    allMasc: 'Todos',
    allFem: 'Todas',
    fail: 'Fail',
    warning: 'Warning',
    unknown: 'Unknown',
    pass: 'Pass',
    automated: 'Automated',
    semi: 'Semi',
    manual: 'Manual',
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
    control: 'Controle',
    diagnosis: 'Diagnóstico',
    recommendation: 'Recomendação',
    dependencyEngine: 'Engine',
    packageName: 'Pacote',
    advisory: 'Advisory/CVE',
    affectedVersions: 'Versões afetadas',
    fixVersion: 'Versão fixa',
    evidence: 'Evidências',
    evidenceCount: 'Contagem',
    evidenceTotal: 'Total',
    evidenceFiles: 'Arquivos',
    evidenceWorkflows: 'Workflows',
    evidenceCommand: 'Comando',
    evidenceSource: 'Origem',
    evidenceModelCount: 'Models',
    evidenceCoveredModels: 'Models cobertos',
    evidenceMissingModels: 'Models faltantes',
    evidenceVulnerabilities: 'Vulnerabilidades',
    searchSecurityPlaceholder: 'controle, risco, recomendação...',
    searchDependencyPlaceholder: 'package, CVE, advisory, fix...',
    searchViolationsPlaceholder: 'tipo, arquivo, mensagem...',
    visibleSuffix: 'visíveis',
    allPriorities: 'Todas',
    type: 'Tipo',
    actionability: 'Actionability',
    priority: 'Prioridade',
    file: 'Arquivo',
    message: 'Mensagem',
    suggestion: 'Sugestão',
    total: 'Total',
    waiver: 'Waiver',
    rank: 'Rank',
    action: 'Ação',
    detail: 'Detalhe',
    key: 'Chave',
    inferred: 'Inferido',
    expected: 'Esperado',
    source: 'Fonte',
    adoption: 'Adoção',
    id: 'ID',
    title: 'Título',
    createdAt: 'Criada em',
    preference: 'Preferência',
    impact: 'Impacto',
    effort: 'Esforço',
    historyEmpty: 'Sem histórico suficiente ainda.',
    trendAriaLabel: 'Trend de AchCoverage e Security Score',
    architectureHealth: 'Architecture Health',
    performanceHealth: 'Performance Health',
    securityHealth: 'Security Health',
    testingHealth: 'Testing Health',
    governanceHealth: 'Governance Health',
    filesMissingTests: 'arquivo(s) sem testes',
    filesWithoutAsserts: 'arquivo(s) de teste sem asserts',
    noteTestQuality: 'qualidade de testes',
    ruleCount: 'regra(s)',
    decisionCount: 'decisão(ões)',
    languageLabel: 'Idioma',
    languageEn: 'English (US)',
    languagePt: 'Portuguese (BR)',
    noteLayering: 'camadas',
    noteConsistency: 'consistência',
    noteAuthorization: 'autorização',
    noteUnbounded: 'sem limite',
    noteFails: 'falha(s)',
    noteWarnings: 'alerta(s)',
  },
  'en-US': {
    code: 'en-US',
    reportTitle: 'ACE Report',
    heroTitle: 'ACE · Architectural Coverage Engine',
    na: 'N/A',
    updatedLabel: 'Updated',
    patternLabel: 'Pattern',
    securityLabel: 'Security',
    violationsLabel: 'Violations',
    suggestionsLabel: 'Suggestions',
    decisionsLabel: 'Decisions',
    coreScorecards: 'Core Scorecards',
    achCoverage: 'AchCoverage',
    trend: 'Trend',
    confidence: 'Confidence',
    securityScore: 'Security Score',
    securityFails: 'Security Fails',
    scope: 'Scope',
    layering: 'Layering',
    validation: 'Validation',
    testability: 'Testability',
    testQuality: 'Test Quality',
    consistency: 'Consistency',
    authorization: 'Authorization',
    securityAutomated: 'Security Automated',
    securitySemi: 'Security Semi',
    securityManual: 'Security Manual',
    securityStatus: 'Security Status',
    securityCode: 'Security Code',
    pipelineMaturity: 'Pipeline Maturity',
    filamentPagesSec: 'Filament Pages Sec',
    filamentWidgetsSec: 'Filament Widgets Sec',
    trendDiff: 'Trend & Diff',
    trendHistoryTitle: 'AchCoverage vs Security (history)',
    trendStatus: 'Trend Status',
    trendWindowDelta: 'Window delta',
    trendAverageStep: 'Average step',
    trendWindowSamples: 'Samples',
    trendCorrelationsTitle: 'Trend Correlations',
    trendCorrelationsEmpty: 'Insufficient data for correlation (minimum 4 samples with both signals).',
    corrCoverageVsViolations: 'AchCoverage ↔ Total inconsistencies',
    corrTestQualityVsNewViolations: 'Test Quality ↔ New inconsistencies',
    corrSecurityVsFails: 'Security Score ↔ Security fails',
    corrStrengthStrong: 'strong',
    corrStrengthModerate: 'moderate',
    corrStrengthWeak: 'weak',
    corrDirectionInverse: 'inverse',
    corrDirectionDirect: 'direct',
    corrSamplePrefix: 'n',
    trendStateImproving: 'Improving',
    trendStateStable: 'Stable',
    trendStateDegrading: 'Degrading',
    regressionAlert: 'Regression alert',
    regressionNone: 'No relevant regression',
    points: 'points',
    threshold: 'threshold',
    lastCycle: 'Last cycle',
    newInconsistencies: 'New inconsistencies',
    resolvedItems: 'Resolved',
    waivedItems: 'Waived',
    cacheHits: 'Cache hits',
    reanalyzedFiles: 'Reanalyzed',
    ignoredByConfig: 'Ignored by config',
    domainHealthProfile: 'Domain Health Profile',
    securityBaseline: 'Security Baseline',
    securityBaselineEmpty: 'Security baseline not evaluated yet. Run a scan.',
    dependencyAuditsTitle: 'Dependency Audits',
    dependencyAuditsEmpty: 'No dependency audit data available in this scope.',
    dependencyVulnerabilities: 'Dependency Vulnerabilities',
    dependencyVulnerabilitiesEmpty: 'No open vulnerabilities detected in available audits.',
    recentViolations: 'Recent Inconsistencies',
    recentViolationsEmpty: 'No inconsistencies recorded right now.',
    actionabilitySummary: 'Actionability',
    actionabilityHighPriority: 'High priority',
    actionabilityAverage: 'Average',
    actionabilityTop: 'Top',
    topHotspots: 'Top Hotspots',
    topHotspotsEmpty: 'No hotspots at the moment.',
    hotspotConcentration: 'Hotspot Concentration',
    filesWithViolations: 'Files with inconsistencies',
    hotspotFiles: 'Hotspot files',
    waivedViolationsTitle: 'Waived Violations',
    waivedViolationsEmpty: 'No inconsistencies are currently waived.',
    quickWinsTitle: 'Quick Wins (High Impact + Low Effort)',
    quickWinsEmpty: 'No quick wins available right now.',
    proactiveSuggestions: 'Proactive Suggestions',
    proactiveSuggestionsEmpty: 'No proactive suggestions in this run.',
    inferredPatterns: 'Inferred and Expected Patterns',
    inferredPatternsEmpty: 'No patterns inferred yet. Run a scan with a relevant scope.',
    driftWavesTitle: 'Pattern Drift Waves',
    driftWavesEmpty: 'No relevant drift waves right now.',
    activeRules: 'Active Rules (Formalized)',
    activeRulesEmpty:
      'No formalized rules yet. Use MCP `ace.manage_rules` (action=create) or CLI `ace rule:add`.',
    activeDecisions: 'Active Architectural Decisions',
    activeDecisionsEmpty:
      'No active decisions yet. Record decisions with MCP `ace.manage_decisions` (action=create) or CLI `ace decision:add`.',
    status: 'Status',
    mode: 'Mode',
    severity: 'Severity',
    category: 'Category',
    search: 'Search',
    clearFilters: 'Clear filters',
    allMasc: 'All',
    allFem: 'All',
    fail: 'Fail',
    warning: 'Warning',
    unknown: 'Unknown',
    pass: 'Pass',
    automated: 'Automated',
    semi: 'Semi',
    manual: 'Manual',
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
    control: 'Control',
    diagnosis: 'Diagnosis',
    recommendation: 'Recommendation',
    dependencyEngine: 'Engine',
    packageName: 'Package',
    advisory: 'Advisory/CVE',
    affectedVersions: 'Affected versions',
    fixVersion: 'Fix version',
    evidence: 'Evidence',
    evidenceCount: 'Count',
    evidenceTotal: 'Total',
    evidenceFiles: 'Files',
    evidenceWorkflows: 'Workflows',
    evidenceCommand: 'Command',
    evidenceSource: 'Source',
    evidenceModelCount: 'Models',
    evidenceCoveredModels: 'Covered models',
    evidenceMissingModels: 'Missing models',
    evidenceVulnerabilities: 'Vulnerabilities',
    searchSecurityPlaceholder: 'control, risk, recommendation...',
    searchDependencyPlaceholder: 'package, CVE, advisory, fix...',
    searchViolationsPlaceholder: 'type, file, message...',
    visibleSuffix: 'visible',
    allPriorities: 'All',
    type: 'Type',
    actionability: 'Actionability',
    priority: 'Priority',
    file: 'File',
    message: 'Message',
    suggestion: 'Suggestion',
    total: 'Total',
    waiver: 'Waiver',
    rank: 'Rank',
    action: 'Action',
    detail: 'Detail',
    key: 'Key',
    inferred: 'Inferred',
    expected: 'Expected',
    source: 'Source',
    adoption: 'Adoption',
    id: 'ID',
    title: 'Title',
    createdAt: 'Created at',
    preference: 'Preference',
    impact: 'Impact',
    effort: 'Effort',
    historyEmpty: 'Not enough history yet.',
    trendAriaLabel: 'AchCoverage and Security Score trend',
    architectureHealth: 'Architecture Health',
    performanceHealth: 'Performance Health',
    securityHealth: 'Security Health',
    testingHealth: 'Testing Health',
    governanceHealth: 'Governance Health',
    filesMissingTests: 'file(s) missing tests',
    filesWithoutAsserts: 'test file(s) without asserts',
    noteTestQuality: 'test quality',
    ruleCount: 'rule(s)',
    decisionCount: 'decision(s)',
    languageLabel: 'Language',
    languageEn: 'English (US)',
    languagePt: 'Portuguese (BR)',
    noteLayering: 'layering',
    noteConsistency: 'consistency',
    noteAuthorization: 'authorization',
    noteUnbounded: 'unbounded',
    noteFails: 'fail(s)',
    noteWarnings: 'warning(s)',
  },
};

function normalizeReportLocale(rawLocale) {
  const value = String(rawLocale || '').trim().toLowerCase();

  if (!value) {
    return 'en-US';
  }

  if (['pt', 'pt-br', 'pt_br', 'ptbr'].includes(value)) {
    return 'pt-BR';
  }

  if (['en', 'en-us', 'en_us', 'enus'].includes(value)) {
    return 'en-US';
  }

  return 'en-US';
}

function getReportCopy(rawLocale) {
  const locale = normalizeReportLocale(rawLocale);
  return REPORT_LOCALES[locale] || REPORT_LOCALES['en-US'];
}

const DYNAMIC_TEXT_EXACT_EN = new Map([
  ['Sem workflows CI detectados no escopo.', 'No CI workflows detected in scope.'],
  ['Projeto sem package.json no root.', 'Project has no package.json at root.'],
  ['Sem composer.json/composer.lock no root.', 'No composer.json/composer.lock at root.'],
  ['composer audit sem vulnerabilidades reportadas.', 'composer audit reported no vulnerabilities.'],
  ['npm audit sem vulnerabilidades reportadas.', 'npm audit reported no vulnerabilities.'],
  ['Controle manual: requer evidência fora da análise estática local.', 'Manual control: requires evidence outside local static analysis.'],
  ['Registrar evidência em docs/CI e formalizar decisão no ACE para rastreabilidade.', 'Record evidence in docs/CI and formalize the decision in ACE for traceability.'],
  ['Sem menção a webhooks no escopo atual.', 'No webhook mentions in the current scope.'],
  ['Sem sinais de N+1 em loops no escopo atual.', 'No N+1 signals in loops within the current scope.'],
  ['Sem sinais suficientes de policies/gates para ações não-model.', 'Insufficient policy/gate signals for non-model actions.'],
  ['Nenhum SQL raw detectado.', 'No raw SQL detected.'],
  ['Nenhum SQL raw dinâmico detectado.', 'No dynamic raw SQL detected.'],
  ['Não foram detectados usos de $request->all().', 'No `$request->all()` usage detected.'],
  ['Sem controllers no escopo atual para medir adoção.', 'No controllers in the current scope to measure adoption.'],
  ['Sem superfície crítica identificada no escopo atual.', 'No critical surface identified in the current scope.'],
  ['Sem models detectados no escopo atual.', 'No models detected in the current scope.'],
  ['Nenhum sink perigoso detectado no escopo.', 'No dangerous sink detected in scope.'],
  ['Sem bypass explícito de CSRF detectado em rotas state-changing.', 'No explicit CSRF bypass detected in state-changing routes.'],
  ['Versão não identificada no lockfile.', 'Version not identified in lockfile.'],
  ['Configuração CORS explícita', 'Explicit CORS configuration'],
  ['APP_DEBUG seguro para produção', 'APP_DEBUG safe for production'],
  ['Webhook com validação de assinatura', 'Webhook with signature validation'],
  ['Sinais de validação/assinatura de webhook detectados.', 'Webhook validation/signature signals detected.'],
  ['Upload com validação e restrições explícitas', 'Upload with explicit validation and restrictions'],
  ['Revisão periódica de isolamento multi-tenant', 'Periodic multi-tenant isolation review'],
  ['Política de rotação de segredos ativa', 'Active secret rotation policy'],
  ['Threat modeling de fluxos críticos', 'Threat modeling for critical flows'],
  ['Pentest/review de segurança por release', 'Security pentest/review per release'],
  ['Autorização server-side em superfícies críticas', 'Server-side authorization on critical surfaces'],
  ['Operações críticas com transação explícita', 'Critical operations with explicit transactions'],
  ['Rotas de escrita com autenticação', 'Write routes with authentication'],
  ['Rotas de escrita com throttle/rate limit', 'Write routes with throttle/rate limiting'],
  ['Bloquear raw SQL dinâmico sem binding', 'Block dynamic raw SQL without bindings'],
  ['Filament Widgets com autorização/visibilidade explícita', 'Filament Widgets with explicit authorization/visibility'],
  ['Filament Pages com autorização/visibilidade explícita', 'Filament Pages with explicit authorization/visibility'],
  ['Livewire com propriedades públicas protegidas', 'Livewire with protected public properties'],
  ['Revisar risco de N+1 em acesso a relações', 'Review N+1 risk in relation access'],
  ['Evitar consultas `->get()` sem limite/paginação', 'Avoid `->get()` queries without limit/pagination'],
  ['Cobertura de Gates para ações não-model', 'Gate coverage for non-model actions'],
  ['Adoção consistente de FormRequest/DTO', 'Consistent FormRequest/DTO adoption'],
  ['Laravel acima do floor de segurança conhecido', 'Laravel above known security floor'],
  ['Livewire acima do floor de segurança conhecido', 'Livewire above known security floor'],
  ['Sanctum com guard/token usage consistente', 'Sanctum with consistent guard/token usage'],
  ['Spatie Permission com enforcement consistente', 'Spatie Permission with consistent enforcement'],
  ['Filament com gate de acesso a painel', 'Filament with panel access gate'],
  ['Composer audit sem vulnerabilidades abertas', 'Composer audit with no open vulnerabilities'],
  ['NPM audit sem vulnerabilidades abertas', 'NPM audit with no open vulnerabilities'],
  ['Arquivo de rotas state-changing sem evidência de middleware auth', 'State-changing route file without auth middleware evidence'],
  ['Raw SQL potencialmente dinâmico/inseguro detectado', 'Potentially dynamic/unsafe raw SQL detected'],
  ['Uso de $request->all() detectado', '`$request->all()` usage detected'],
  ['Evitar payload cru em escrita', 'Avoid raw payload on write operations'],
  ['Reduzir consultas `->get()` sem paginação/limite', 'Reduce `->get()` queries without pagination/limit'],
  ['Revisar bypass de CSRF em rotas de escrita', 'Review CSRF bypass on write routes'],
  ['Remover `$request->all()` em pontos críticos', 'Remove `$request->all()` in critical paths'],
  ['Revisar payload sensível em Notifications', 'Review sensitive payload in Notifications'],
  ['Revisar pontos com SQL raw', 'Review raw SQL points'],
  ['Aplicar guardas de relação em API Resources', 'Apply relation guards in API Resources'],
  ['Formalizar 1-2 decisões arquiteturais do padrão dominante', 'Formalize 1-2 architectural decisions from the dominant pattern'],
  ['Job crítico sem `ShouldBeUnique` detectado', 'Critical job without `ShouldBeUnique` detected'],
  ['Job enfileirado sem `$timeout` explícito', 'Queued job without explicit `$timeout`'],
  ['Job enfileirado sem `$tries` explícito', 'Queued job without explicit `$tries`'],
  ['model.structure', 'model.structure'],
  ['model-all-in-controller', 'model-all-in-controller'],
  ['slim-model', 'slim-model'],
]);

const DYNAMIC_TEXT_PATTERNS_EN = [
  [/composer audit reportou (\d+) vulnerabilidade\(s\):/gi, 'composer audit reported $1 vulnerability(ies):'],
  [/npm audit reportou (\d+) vulnerabilidade\(s\):/gi, 'npm audit reported $1 vulnerability(ies):'],
  [/audit não pôde ser avaliado/gi, 'audit could not be evaluated'],
  [/falha ao executar audit:/gi, 'failed to execute audit:'],
  [/timeout ao executar audit\./gi, 'timeout while running audit.'],
  [/audit retornou status (\d+)\./gi, 'audit returned status $1.'],
  [/\(cache\)/gi, '(cache)'],
  [/Adoção atual de FormRequest\/DTO:\s*(\d+)%\./gi, 'Current FormRequest/DTO adoption: $1%.'],
  [/Cobertura model↔policy:\s*(\d+)\/(\d+)\./gi, 'Model↔policy coverage: $1/$2.'],
  [/Sinais de upload:\s*(\d+);\s*validações explícitas:\s*(\d+)\./gi, 'Upload signals: $1; explicit validations: $2.'],
  [/Sinais de autorização server-side por superfície:\s*(\d+)\/(\d+)\./gi, 'Server-side authorization signals per surface: $1/$2.'],
  [/(\d+)\s+ocorrência\(s\)\s+de\s+\$request->all\(\)\s+detectada\(s\)\./gi, '$1 occurrence(s) of `$request->all()` detected.'],
  [/(\d+)\s+ocorrência\(s\)\s+de\s+consulta potencialmente não limitada detectada\(s\)\./gi, '$1 potentially unbounded query occurrence(s) detected.'],
  [/(\d+)\s+arquivo\(s\)\s+com sinal de acesso a relação em loop sem eager loading\./gi, '$1 file(s) with relation-in-loop access without eager loading.'],
  [/(\d+)\s+arquivo\(s\)\s+com escrita crítica sem sinal de `DB::transaction\(\)`\./gi, '$1 file(s) with critical writes without `DB::transaction()` signal.'],
  [/(\d+)\s+sink\(s\)\s+perigoso\(s\)\s+detectado\(s\)\./gi, '$1 dangerous sink(s) detected.'],
  [/(\d+)\s+arquivo\(s\)\s+de rota com escrita sem auth detectada\./gi, '$1 route file(s) with state-changing writes without auth detected.'],
  [/(\d+)\s+arquivo\(s\)\s+de rota com escrita sem throttle detectado\(s\)\./gi, '$1 route file(s) with state-changing writes without throttle detected.'],
  [/(\d+)\s+arquivo\(s\)\s+de rotas com bypass explícito de CSRF\./gi, '$1 route file(s) with explicit CSRF bypass.'],
  [/Sem Gate::define explícito; políticas existentes cobrem parte da autorização\./gi, 'No explicit Gate::define; existing policies cover part of authorization.'],
  [/(\d+)\s+Gate::define\/resource detectado\(s\)\./gi, '$1 Gate::define/resource detected.'],
  [/(\d+)\/(\d+)\s+chamada\(s\)\s+raw SQL com sinais dinâmicos exigindo revisão manual\./gi, '$1/$2 raw SQL call(s) with dynamic signals requiring manual review.'],
  [/(\d+)\s+ponto\(s\)\s+de SQL raw com variável dinâmica detectado\(s\)\./gi, '$1 raw SQL point(s) with dynamic variables detected.'],
  [/Sem sinal de writes críticos sem transação no escopo\./gi, 'No signal of critical writes without transactions in scope.'],
  [/Nenhuma consulta `->get\(\)` sem limite explícito detectada\./gi, 'No `->get()` queries without explicit limits detected.'],
  [/Não foram detectadas rotas de escrita sem throttling\./gi, 'No state-changing routes without throttling were detected.'],
  [/Nenhum arquivo routes\/\*\.php analisado neste ciclo\./gi, 'No routes/*.php files analyzed in this cycle.'],
  [/Em produção, garantir APP_DEBUG=false e tratamento seguro de exceções\./gi, 'In production, ensure APP_DEBUG=false and safe exception handling.'],
  [/Prefira \$request->validated\(\) \(FormRequest\) ou DTO com contrato explícito\./gi, 'Prefer `$request->validated()` (FormRequest) or DTO with explicit contract.'],
  [/Padronize validação de entrada para reduzir payload poisoning e inconsistência\./gi, 'Standardize input validation to reduce payload poisoning and inconsistency.'],
  [/Padronize validação de entrada para reduzir payload poisoning e inconsistência\./gi, 'Standardize input validation to reduce payload poisoning and inconsistency.'],
  [/Configure CORS por origem\/método\/header estritamente necessários\./gi, 'Configure CORS with strictly required origin/method/header.'],
  [/Aplique whitelist de MIME\/extensão\/tamanho e validação server-side\./gi, 'Apply MIME/extension/size whitelisting and server-side validation.'],
  [/Implemente assinatura \+ janela anti-replay \(timestamp\/nonce\)\./gi, 'Implement signature + anti-replay window (timestamp/nonce).'],
  [/Adicionar gate de composer audit para bloquear advisories High\/Critical\./gi, 'Add composer audit gate to block High/Critical advisories.'],
  [/Adicionar npm audit \(runtime\) como gate em PR\/release\./gi, 'Add npm audit (runtime) as a PR/release gate.'],
  [/Adicionar Semgrep\/CodeQL\/Larastan como gate de segurança em PR\./gi, 'Add Semgrep/CodeQL/Larastan as a PR security gate.'],
  [/Adicionar DAST em staging para endpoints e painéis críticos\./gi, 'Add DAST in staging for critical endpoints and panels.'],
  [/Sem sinal de secret scanning no CI detectado\./gi, 'No secret scanning signal detected in CI.'],
  [/Sem sinal de SAST detectado no CI\./gi, 'No SAST signal detected in CI.'],
  [/Sem sinal de DAST detectado no CI\./gi, 'No DAST signal detected in CI.'],
  [/Sinal de composer audit no CI detectado\./gi, 'Composer audit signal detected in CI.'],
  [/Sinal de npm audit no CI detectado\./gi, 'NPM audit signal detected in CI.'],
  [/Sinal de secret scanning no CI detectado\./gi, 'Secret scanning signal detected in CI.'],
  [/Sinal de SAST detectado no CI\./gi, 'SAST signal detected in CI.'],
  [/Sinal de DAST detectado no CI\./gi, 'DAST signal detected in CI.'],
  [/(\d+)\s+consulta\(s\)\s+com\s+`->get\(\)`\s+sem\s+limite\/paginação\s+detectada\(s\)/gi, '$1 `->get()` query(ies) without limit/pagination detected'],
  [/(\d+)\/(\d+)\.\s*Versão\s+([^\s]+)\s+atende floor\s+([^\s]+)\./gi, '$1/$2. Version $3 meets floor $4.'],
  [/Versão\s+([^\s]+)\s+atende floor\s+([^\s]+)\./gi, 'Version $1 meets floor $2.'],
  [/Mantenha framework no floor seguro para advisories recentes\./gi, 'Keep framework at a safe floor for recent advisories.'],
  [/Mantenha Filament atualizado para corrigir bypasses\/exports inseguros\./gi, 'Keep Filament updated to address unsafe bypass/export issues.'],
  [/Atualize Livewire para faixa sem bypass de auth\/upload conhecidos\./gi, 'Update Livewire to a range without known auth/upload bypasses.'],
  [/Use #\[Locked\] para campos imutáveis e valide\/autorize todas mutações\./gi, 'Use #[Locked] for immutable fields and validate/authorize all mutations.'],
  [/Implemente `canView\(\)` e\/ou guardas server-side em widgets que exibem dados sensíveis\./gi, 'Implement `canView()` and/or server-side guards on widgets exposing sensitive data.'],
  [/Padronize `canAccess\(\)`\/authorize\/policy para cada Page sensível exposta no painel\./gi, 'Standardize `canAccess()`/authorize/policy for each sensitive Page exposed in the panel.'],
  [/Garanta authorize\/policies em ações críticas \(read\/write\/export\/delete\/impersonate\)\./gi, 'Ensure authorize/policies for critical actions (read/write/export/delete/impersonate).'],
  [/Garanta policy para models críticos e registre mapeamento explícito quando fugir de convenção\./gi, 'Ensure policies for critical models and register explicit mapping when not following convention.'],
  [/Aplique auth\/policies para endpoints state-changing e valide escopo tenant\./gi, 'Apply auth/policies to state-changing endpoints and validate tenant scope.'],
  [/Aplique middleware auth\/policy em rotas de escrita e confirme escopo tenant\./gi, 'Apply auth/policy middleware on write routes and confirm tenant scope.'],
  [/Encapsular fluxos financeiros\/criticos em transação e reforçar idempotência\./gi, 'Wrap financial/critical flows in transactions and reinforce idempotency.'],
  [/Substitua por bindings parametrizados ou Query Builder com whitelist\./gi, 'Replace with parameterized bindings or Query Builder with a whitelist.'],
  [/Prefira bindings \(`\\\?` \+ array\) ou Query Builder sem concatenação dinâmica\./gi, 'Prefer bindings (`?` + array) or Query Builder without dynamic concatenation.'],
  [/Evite sink direto; aplique allowlist\/validação estrita e isolamento operacional\./gi, 'Avoid direct sinks; apply strict allowlists/validation and operational isolation.'],
  [/Remova sink direto ou aplique validação rígida \+ isolamento operacional\./gi, 'Remove direct sink usage or apply strict validation + operational isolation.'],
  [/Proteja APIs sensíveis com `auth:sanctum` e confirme `HasApiTokens` nos modelos emissores de token\./gi, 'Protect sensitive APIs with `auth:sanctum` and confirm `HasApiTokens` in token-issuing models.'],
  [/Spatie signals — models com HasRoles: (\d+), rotas com middleware role\/permission: (\d+), checks: (\d+)\./gi, 'Spatie signals — models with HasRoles: $1, routes with role/permission middleware: $2, checks: $3.'],
  [/Sanctum signals — rotas com auth:sanctum: (\d+), models com HasApiTokens: (\d+), uso de abilities: (\d+)\./gi, 'Sanctum signals — routes with auth:sanctum: $1, models with HasApiTokens: $2, abilities usage: $3.'],
  [/Filament Pages com sinal de autorização:\s*(\d+)\/(\d+)\./gi, 'Filament Pages with authorization signal: $1/$2.'],
  [/Filament Widgets com sinal de autorização\/visibilidade:\s*(\d+)\/(\d+)\./gi, 'Filament Widgets with authorization/visibility signal: $1/$2.'],
  [/Foram detectados\s+(\d+)\s+acesso\(s\)\s+de relação sem `whenLoaded\/relationLoaded` em Resources\. Isso pode induzir lazy loading e N\+1\./gi, '$1 relation access(es) without `whenLoaded/relationLoaded` were detected in Resources. This may induce lazy loading and N+1.'],
  [/Foram detectados\s+(\d+)\s+contratos sem bind\/singleton\/scoped explícito em providers\./gi, '$1 contracts without explicit bind/singleton/scoped in providers were detected.'],
  [/Foram detectadas consultas com `->get\(\)` sem limite explícito\. Em listas grandes isso costuma degradar memória e tempo de resposta\./gi, '`->get()` queries without explicit limits were detected. In large lists this often degrades memory and response time.'],
  [/Para cada SQL raw, valide bind seguro, limites e explicite racional de performance\./gi, 'For each raw SQL usage, validate safe bindings, limits, and document performance rationale.'],
  [/Paginação e filtros no Service\/UseCase reduzem carga e risco de gargalos em listas crescentes\./gi, 'Pagination and filters in Service/UseCase reduce load and bottleneck risk on growing lists.'],
  [/O ACE já consegue inferir padrões\. Converter decisões recorrentes em decisões persistentes reduz oscilações da LLM entre features\./gi, 'ACE can already infer patterns. Converting recurring choices into persistent decisions reduces LLM oscillation across features.'],
  [/Há sinais de payload sensível \(token\/secret\/password\/code\) em notifications\. Reduza exposição e use tokens curtos, expiração e masking\./gi, 'Sensitive payload signals (token/secret/password/code) were found in notifications. Reduce exposure and use short-lived tokens, expiration, and masking.'],
  [/Considere encapsular o fluxo em `DB::transaction\(\.\.\.\)` e reforçar idempotência\./gi, 'Consider wrapping the flow with `DB::transaction(...)` and reinforce idempotency.'],
  [/Defina `\\\$tries` de forma explícita no Job\./gi, 'Set `$tries` explicitly in the Job.'],
  [/Defina `\\\$timeout` coerente com o SLA da operação\./gi, 'Set `$timeout` consistent with the operation SLA.'],
  [/Avalie `ShouldBeUnique`\/idempotência para evitar processamento duplicado\./gi, 'Evaluate `ShouldBeUnique`/idempotency to avoid duplicated processing.'],
  [/Jobs com lacunas de resiliência detectados \(tries ausente:\s*(\d+), timeout ausente:\s*(\d+)\)\./gi, 'Jobs with resilience gaps detected (missing tries: $1, missing timeout: $2).'],
  [/Use paginação\/filtros e delegue consulta para Service\/UseCase\./gi, 'Use pagination/filters and delegate queries to Service/UseCase.'],
  [/Prefira paginação \(`paginate\/cursorPaginate`\) ou limite explícito para consultas potencialmente grandes\./gi, 'Prefer pagination (`paginate/cursorPaginate`) or explicit limits for potentially large queries.'],
  [/Prefira `\\\$request->validated\(\)` com FormRequest ou DTO\./gi, 'Prefer `$request->validated()` with FormRequest or DTO.'],
  [/Prefira `\\\$request->validated\(\)` ou DTO para evitar mass assignment e entradas inesperadas\./gi, 'Prefer `$request->validated()` or DTO to avoid mass assignment and unexpected inputs.'],
  [/Configure trusted hosts para reduzir riscos de host header poisoning\./gi, 'Configure trusted hosts to reduce host header poisoning risks.'],
  [/Revise trusted proxies\/hosts para evitar spoof de headers\./gi, 'Review trusted proxies/hosts to avoid header spoofing.'],
  [/Incluir gitleaks\/trufflehog para evitar vazamento de segredos\./gi, 'Include gitleaks/trufflehog to avoid secret leakage.'],
  [/Adicionar DAST em staging para endpoints e painéis críticos\./gi, 'Add DAST in staging for critical endpoints and panels.'],
  [/DAST em staging\/rotas críticas/gi, 'DAST in staging/critical routes'],
  [/Cobertura Model ↔ Policy consistente/gi, 'Consistent Model ↔ Policy coverage'],
  [/Uso de sink perigoso detectado:\s*([a-zA-Z_]+)\(\)/gi, 'Dangerous sink usage detected: $1()'],
  [/Operação crítica de escrita sem sinal de transação detectada/gi, 'Critical write operation without transaction signal detected'],
];

const DYNAMIC_TEXT_FRAGMENTS_EN = [
  ['APP_DEBUG seguro para produção', 'APP_DEBUG safe for production'],
  ['Adoção consistente de FormRequest/DTO', 'Consistent FormRequest/DTO adoption'],
  ['Aplicar guardas de relação em API Resources', 'Apply relation guards in API Resources'],
  ['Aplicar with/load onde houver iteração de entidades com relações.', 'Apply with/load where entity relations are iterated.'],
  ['Aplique auth/policies para endpoints state-changing e valide escopo tenant.', 'Apply auth/policies to state-changing endpoints and validate tenant scope.'],
  ['Aplique middleware auth/policy em rotas de escrita e confirme escopo tenant.', 'Apply auth/policy middleware on write routes and confirm tenant scope.'],
  ['Autorização server-side em superfícies críticas', 'Server-side authorization on critical surfaces'],
  ['Avalie `ShouldBeUnique`/idempotência para evitar processamento duplicado.', 'Evaluate `ShouldBeUnique`/idempotency to avoid duplicate processing.'],
  ['Bloquear raw SQL dinâmico sem binding', 'Block dynamic raw SQL without bindings'],
  ['Cobertura de Gates para ações não-model', 'Gate coverage for non-model actions'],
  ['Cobertura Model ↔ Policy consistente', 'Consistent Model ↔ Policy coverage'],
  ['Composer audit sem vulnerabilidades abertas', 'Composer audit with no open vulnerabilities'],
  ['Configure trusted hosts para reduzir riscos de host header poisoning.', 'Configure trusted hosts to reduce host header poisoning risks.'],
  ['Confirme compensações fortes ao usar bypass de CSRF (auth robusta, assinatura, nonce).', 'Confirm strong compensating controls when using CSRF bypass (robust auth, signature, nonce).'],
  ['Considere encapsular o fluxo em `DB::transaction(...)` e reforçar idempotência.', 'Consider wrapping the flow with `DB::transaction(...)` and reinforce idempotency.'],
  ['DAST em staging/rotas críticas', 'DAST in staging/critical routes'],
  ['Defina `$timeout` coerente com o SLA da operação.', 'Set `$timeout` consistent with operation SLA.'],
  ['Defina `$tries` de forma explícita no Job.', 'Set `$tries` explicitly in the Job.'],
  ['Encapsular fluxos financeiros/criticos em transação e reforçar idempotência.', 'Wrap financial/critical flows in transactions and reinforce idempotency.'],
  ['Evitar consultas `->get()` sem limite/paginação', 'Avoid `->get()` queries without limit/pagination'],
  ['Evitar payload cru em escrita', 'Avoid raw payload on write operations'],
  ['Evite sink direto; aplique allowlist/validação estrita e isolamento operacional.', 'Avoid direct sinks; apply strict allowlists/validation and operational isolation.'],
  ['Execute composer audit em CI/CD e mantenha dependências no floor seguro com política de atualização contínua.', 'Run composer audit in CI/CD and keep dependencies on a safe floor with continuous update policy.'],
  ['Execute npm audit no pipeline e trate vulnerabilidades com fix disponível priorizando High/Critical.', 'Run npm audit in the pipeline and address vulnerabilities with available fixes prioritizing High/Critical.'],
  ['Filament acima do floor de segurança conhecido', 'Filament above known security floor'],
  ['Filament com gate de acesso a painel', 'Filament with panel access gate'],
  ['Filament Pages com autorização/visibilidade explícita', 'Filament Pages with explicit authorization/visibility'],
  ['Filament Widgets com autorização/visibilidade explícita', 'Filament Widgets with explicit authorization/visibility'],
  ['Foram detectadas consultas com `->get()` sem limite explícito.', '`->get()` queries without explicit limits were detected.'],
  ['Em listas grandes isso costuma degradar memória e tempo de resposta.', 'In large lists this often degrades memory and response time.'],
  ['Foram detectados 2 contratos sem bind/singleton/scoped explícito em providers.', '2 contracts without explicit bind/singleton/scoped in providers were detected.'],
  ['Foram detectados ', 'Detected '],
  [' acesso(s) de relação sem `whenLoaded/relationLoaded` em Resources.', ' relation access(es) without `whenLoaded/relationLoaded` in Resources.'],
  ['Isso pode induzir lazy loading e N+1.', 'This may induce lazy loading and N+1.'],
  ['Formalizar 1-2 decisões arquiteturais do padrão dominante', 'Formalize 1-2 architectural decisions from the dominant pattern'],
  ['Garanta `HasRoles` nos modelos alvo e enforce via middleware/policies/checks no ponto de acesso.', 'Ensure `HasRoles` on target models and enforce via middleware/policies/checks at access points.'],
  ['Garanta authorize/policies em ações críticas (read/write/export/delete/impersonate).', 'Ensure authorize/policies for critical actions (read/write/export/delete/impersonate).'],
  ['Garanta policy para models críticos e registre mapeamento explícito quando fugir de convenção.', 'Ensure policies for critical models and register explicit mapping when not following conventions.'],
  ['Há sinais de payload sensível (token/secret/password/code) em notifications.', 'Sensitive payload signals (token/secret/password/code) were found in notifications.'],
  ['Reduza exposição e use tokens curtos, expiração e masking.', 'Reduce exposure and use short-lived tokens, expiration, and masking.'],
  ['Implemente `canView()` e/ou guardas server-side em widgets que exibem dados sensíveis.', 'Implement `canView()` and/or server-side guards on widgets showing sensitive data.'],
  ['Incluir gitleaks/trufflehog para evitar vazamento de segredos.', 'Include gitleaks/trufflehog to avoid secret leakage.'],
  ['Job crítico sem `ShouldBeUnique` detectado', 'Critical job without `ShouldBeUnique` detected'],
  ['Job enfileirado sem `$timeout` explícito', 'Queued job without explicit `$timeout`'],
  ['Job enfileirado sem `$tries` explícito', 'Queued job without explicit `$tries`'],
  ['Jobs com lacunas de resiliência detectados', 'Jobs with resilience gaps detected'],
  ['tries ausente', 'missing tries'],
  ['timeout ausente', 'missing timeout'],
  ['Laravel acima do floor de segurança conhecido', 'Laravel above known security floor'],
  ['Livewire acima do floor de segurança conhecido', 'Livewire above known security floor'],
  ['Livewire com propriedades públicas protegidas', 'Livewire with protected public properties'],
  ['Mantenha Filament atualizado para corrigir bypasses/exports inseguros.', 'Keep Filament updated to fix unsafe bypass/export issues.'],
  ['Mantenha framework no floor seguro para advisories recentes.', 'Keep framework at a safe floor for recent advisories.'],
  ['NPM audit sem vulnerabilidades abertas', 'NPM audit with no open vulnerabilities'],
  ['O ACE já consegue inferir padrões.', 'ACE can already infer patterns.'],
  ['Converter decisões recorrentes em decisões persistentes reduz oscilações da LLM entre features.', 'Converting recurring decisions into persistent ones reduces LLM oscillations across features.'],
  ['Operação crítica de escrita sem sinal de transação detectada', 'Critical write operation without transaction signal detected'],
  ['Operações críticas com transação explícita', 'Critical operations with explicit transactions'],
  ['Padronize `canAccess()`/authorize/policy para cada Page sensível exposta no painel.', 'Standardize `canAccess()`/authorize/policy for each sensitive Page exposed in the panel.'],
  ['Paginação e filtros no Service/UseCase reduzem carga e risco de gargalos em listas crescentes.', 'Pagination and filters in Service/UseCase reduce load and bottleneck risk in growing lists.'],
  ['Para ações fora de CRUD de model, prefira Gate::define/resource e checagem explícita no ponto de uso.', 'For non-model CRUD actions, prefer Gate::define/resource and explicit checks at the usage point.'],
  ['Para cada SQL raw, valide bind seguro, limites e explicite racional de performance.', 'For each raw SQL usage, validate safe bindings, limits, and state the performance rationale.'],
  ['Pentest/review de segurança por release', 'Security pentest/review per release'],
  ['Política de rotação de segredos ativa', 'Active secret rotation policy'],
  ['Preferir paginate/cursorPaginate/limit para reduzir risco de carga excessiva.', 'Prefer paginate/cursorPaginate/limit to reduce excessive load risk.'],
  ['Prefira `$request->validated()` com FormRequest ou DTO.', 'Prefer `$request->validated()` with FormRequest or DTO.'],
  ['Prefira `$request->validated()` ou DTO para evitar mass assignment e entradas inesperadas.', 'Prefer `$request->validated()` or DTO to avoid mass assignment and unexpected input.'],
  ['Prefira bindings (`?` + array) ou Query Builder sem concatenação dinâmica.', 'Prefer bindings (`?` + array) or Query Builder without dynamic concatenation.'],
  ['Prefira paginação (`paginate/cursorPaginate`) ou limite explícito para consultas potencialmente grandes.', 'Prefer pagination (`paginate/cursorPaginate`) or explicit limits for potentially large queries.'],
  ['Proteja APIs sensíveis com `auth:sanctum` e confirme `HasApiTokens` nos modelos emissores de token.', 'Protect sensitive APIs with `auth:sanctum` and confirm `HasApiTokens` in token-issuing models.'],
  ['Raw SQL potencialmente dinâmico/inseguro detectado', 'Potentially dynamic/unsafe raw SQL detected'],
  ['Reduzir consultas `->get()` sem paginação/limite', 'Reduce `->get()` queries without pagination/limit'],
  ['Remova sink direto ou aplique validação rígida + isolamento operacional.', 'Remove direct sink usage or apply strict validation + operational isolation.'],
  ['Remover `$request->all()` em pontos críticos', 'Remove `$request->all()` in critical points'],
  ['Revisão periódica de isolamento multi-tenant', 'Periodic multi-tenant isolation review'],
  ['Revisar bypass de CSRF em rotas de escrita', 'Review CSRF bypass on write routes'],
  ['Revisar payload sensível em Notifications', 'Review sensitive payload in Notifications'],
  ['Revisar pontos com SQL raw', 'Review raw SQL points'],
  ['Revisar risco de N+1 em acesso a relações', 'Review N+1 risk in relation access'],
  ['Revise trusted proxies/hosts para evitar spoof de headers.', 'Review trusted proxies/hosts to avoid header spoofing.'],
  ['Rotas de escrita com autenticação', 'Write routes with authentication'],
  ['Rotas de escrita com throttle/rate limit', 'Write routes with throttle/rate limiting'],
  ['Sanctum com guard/token usage consistente', 'Sanctum with consistent guard/token usage'],
  ['Sanctum signals — rotas com auth:sanctum:', 'Sanctum signals — routes with auth:sanctum:'],
  ['models com HasApiTokens', 'models with HasApiTokens'],
  ['uso de abilities', 'abilities usage'],
  ['Service com ', 'Service with '],
  [' linhas', ' lines'],
  ['Sinais de validação/assinatura de webhook detectados.', 'Webhook validation/signature signals detected.'],
  ['Sinal de canAccessPanel() detectado.', 'canAccessPanel() signal detected.'],
  ['Spatie Permission com enforcement consistente', 'Spatie Permission with consistent enforcement'],
  ['Spatie signals — models com HasRoles:', 'Spatie signals — models with HasRoles:'],
  ['rotas com middleware role/permission', 'routes with role/permission middleware'],
  ['Substitua por bindings parametrizados ou Query Builder com whitelist.', 'Replace with parameterized bindings or Query Builder with whitelist.'],
  ['Threat modeling de fluxos críticos', 'Threat modeling for critical flows'],
  ['Upload com validação e restrições explícitas', 'Upload with explicit validation and restrictions'],
  ['Use #[Locked] para campos imutáveis e valide/autorize todas mutações.', 'Use #[Locked] for immutable fields and validate/authorize all mutations.'],
  ['Use paginação/filtros e delegue consulta para Service/UseCase.', 'Use pagination/filters and delegate queries to Service/UseCase.'],
  ['Uso de $request->all() detectado', '`$request->all()` usage detected'],
  ['Uso de sink perigoso detectado: exec()', 'Dangerous sink usage detected: exec()'],
  ['Webhook com validação de assinatura', 'Webhook with signature validation'],
  ['Aplicar unicidade/idempotência em jobs críticos', 'Apply uniqueness/idempotency in critical jobs'],
  ['Avaliar queue para Mailables de maior custo', 'Evaluate queue usage for higher-cost Mailables'],
  ['Avaliar queue para Notifications de higher impacto', 'Evaluate queue usage for higher-impact Notifications'],
  ['Avaliar queue para Notifications de maior impacto', 'Evaluate queue usage for higher-impact Notifications'],
  ['Commands longos dificultam manutenção operacional. Extrair passos para services/actions melhora testabilidade e reuso.', 'Long commands hinder operational maintenance. Extracting steps to services/actions improves testability and reuse.'],
  ['Detected eventos/observers com sinais de acesso a Model/DB ou excesso de lógica. Mantenha events como contrato de dados e observers com orquestração mínima.', 'Events/observers with Model/DB access signals or excessive logic were detected. Keep events as data contracts and observers with minimal orchestration.'],
  ['Detected jobs com contexto financeiro/estado crítico sem sinal de unicidade. Isso eleva risco de execução duplicada.', 'Jobs with financial/critical-state context without uniqueness signal were detected. This increases duplicate execution risk.'],
  ['Envolver writes críticos em transação + idempotência', 'Wrap critical writes in transactions + idempotency'],
  ['Enxugar Providers e reforçar bindings explícitos', 'Slim down Providers and reinforce explicit bindings'],
  ['Evitar `Model::all()` em serviços e comandos', 'Avoid `Model::all()` in services and commands'],
  ['Existem múltiplas violações de severidade alta. Considere uma sprint curta de estabilização arquitetural.', 'There are multiple high-severity violations. Consider a short architectural stabilization sprint.'],
  ['Fechar lacunas de testes em camadas de negócio', 'Close test gaps in business layers'],
  ['Fluxos com palavras-chave financeiras e escrita sem transação foram detectados. Isso aumenta risco de inconsistência em concorrência/falhas parciais.', 'Flows with financial keywords and writes without transactions were detected. This increases inconsistency risk under concurrency/partial failures.'],
  ['Foram detectadas leituras totais fora de controllers. Em jobs/commands/services isso costuma escalar mal em memória e tempo.', 'Total reads outside controllers were detected. In jobs/commands/services this often scales poorly in memory and time.'],
  ['Há helpers com acesso direto a Model. Isso aumenta acoplamento global e dificulta teste/manutenção de fluxo de negócio.', 'Helpers with direct Model access were detected. This increases global coupling and hurts testing/maintenance of business flows.'],
  ['Há middleware com consulta direta a Model, o que aumenta acoplamento e dificulta evolução do pipeline HTTP.', 'Middleware with direct Model queries was detected, increasing coupling and making HTTP pipeline evolution harder.'],
  ['Há serviços/controllers sem testes detectados. Priorize hotspots com mais alterações e maior impacto.', 'Services/controllers without tests were detected. Prioritize hotspots with more changes and higher impact.'],
  ['Há sinais de acesso a relações dentro de loop sem eager loading claro. Isso pode multiplicar queries em produção.', 'There are signals of relation access inside loops without clear eager loading. This can multiply queries in production.'],
  ['Há sinais de providers extensos e/ou imports de contracts sem binding explícito. Consolidar DI e reduzir responsabilidade dos providers melhora previsibilidade do container.', 'There are signals of large providers and/or contract imports without explicit bindings. Consolidating DI and reducing provider responsibilities improves container predictability.'],
  ['Há sinais de traits grandes/acoplados e/ou com acesso direto a Model. Centralize regra de negócio em Services/UseCases e mantenha traits focados em composição leve.', 'There are signals of large/coupled traits and/or direct Model access. Centralize business rules in Services/UseCases and keep traits focused on light composition.'],
  ['Há uso de DB::raw/selectRaw/whereRaw com interpolação dinâmica. Priorize bindings e Query Builder para reduzir risco.', 'DB::raw/selectRaw/whereRaw with dynamic interpolation was detected. Prioritize bindings and Query Builder to reduce risk.'],
  ['Mailables sem ShouldQueue foram detectados. Em cenários de volume, envio síncrono aumenta latência e risco de timeout.', 'Mailables without ShouldQueue were detected. In high-volume scenarios, synchronous sending increases latency and timeout risk.'],
  ['Notifications sem ShouldQueue foram detectadas. Em fluxos de alto volume/custo, o envio síncrono aumenta latência e risco de timeout.', 'Notifications without ShouldQueue were detected. In high-volume/high-cost flows, synchronous sending increases latency and timeout risk.'],
  ['Priorizar resolução de violações de alto impacto', 'Prioritize resolving high-impact violations'],
  ['Quebrar comandos extensos em steps reutilizáveis', 'Break large commands into reusable steps'],
  ['Reduzir lógica de domínio dentro de Events/Observers', 'Reduce domain logic inside Events/Observers'],
  ['Resources grandes tendem a misturar regra de negócio com configuração de UI. Mover regra para Services/Policies melhora evolução.', 'Large Resources tend to mix business rules with UI configuration. Moving rules to Services/Policies improves evolution.'],
  ['Revisar potenciais N+1 em loops com relações', 'Review potential N+1 issues in relation loops'],
  ['Revisar raw SQL com variáveis dinâmicas', 'Review raw SQL with dynamic variables'],
];

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function translateDynamicText(value, localeCode) {
  const input = String(value || '');
  if (localeCode !== 'en-US' || !input) {
    return input;
  }

  const exact = DYNAMIC_TEXT_EXACT_EN.get(input.trim());
  if (exact) {
    return exact;
  }

  let output = input;
  DYNAMIC_TEXT_PATTERNS_EN.forEach(([pattern, replacement]) => {
    output = output.replace(pattern, replacement);
  });
  DYNAMIC_TEXT_FRAGMENTS_EN.forEach(([from, to]) => {
    output = output.replace(new RegExp(escapeRegex(from), 'gi'), to);
  });
  return output;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function roundCorrelation(value) {
  return Number(Number(value || 0).toFixed(3));
}

function pearsonCorrelation(samples) {
  if (!Array.isArray(samples) || samples.length < 4) {
    return null;
  }

  const count = samples.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  samples.forEach((item) => {
    sumX += item.x;
    sumY += item.y;
    sumXY += item.x * item.y;
    sumX2 += item.x * item.x;
    sumY2 += item.y * item.y;
  });

  const numerator = count * sumXY - sumX * sumY;
  const denominatorPartX = count * sumX2 - sumX * sumX;
  const denominatorPartY = count * sumY2 - sumY * sumY;
  const denominator = Math.sqrt(Math.max(0, denominatorPartX * denominatorPartY));

  if (denominator <= 0) {
    return null;
  }

  return roundCorrelation(numerator / denominator);
}

function buildCorrelationEntry({ history, label, xSelector, ySelector, copy }) {
  const samples = (history || [])
    .map((item) => ({
      x: toFiniteNumber(xSelector(item)),
      y: toFiniteNumber(ySelector(item)),
    }))
    .filter((item) => item.x != null && item.y != null);

  const value = pearsonCorrelation(samples);
  if (value == null) {
    return {
      label,
      value: null,
      strength: null,
      direction: null,
      sampleSize: samples.length,
    };
  }

  const abs = Math.abs(value);
  const strength =
    abs >= 0.65
      ? copy.corrStrengthStrong
      : abs >= 0.4
        ? copy.corrStrengthModerate
        : copy.corrStrengthWeak;
  const direction = value < 0 ? copy.corrDirectionInverse : copy.corrDirectionDirect;

  return {
    label,
    value,
    strength,
    direction,
    sampleSize: samples.length,
  };
}

function buildTrendCorrelations(history, copy) {
  return [
    buildCorrelationEntry({
      history,
      label: copy.corrCoverageVsViolations,
      xSelector: (item) => item.overall,
      ySelector: (item) => item.violationCount,
      copy,
    }),
    buildCorrelationEntry({
      history,
      label: copy.corrTestQualityVsNewViolations,
      xSelector: (item) => (item.testQuality != null ? item.testQuality : item.testability),
      ySelector: (item) => item.newViolations,
      copy,
    }),
    buildCorrelationEntry({
      history,
      label: copy.corrSecurityVsFails,
      xSelector: (item) => item.securityScore,
      ySelector: (item) => item.securityFailures,
      copy,
    }),
  ];
}

function buildTrendChartSvg(history, copy) {
  if (!history || history.length === 0) {
    return `<p class="empty">${escapeHtml(copy.historyEmpty)}</p>`;
  }

  const points = history.slice(-36);
  const width = 760;
  const height = 220;
  const padding = { top: 18, right: 26, bottom: 34, left: 32 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(
    100,
    ...points.map((item) => Math.max(Number(item.overall || 0), Number(item.securityScore || 0), 0)),
  );

  const toPoint = (value, index) => {
    const x =
      padding.left +
      (points.length <= 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
    const y = padding.top + (1 - Number(value || 0) / maxValue) * innerHeight;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  };

  const overallPoints = points.map((item, index) => toPoint(item.overall || 0, index)).join(' ');
  const securityPoints = points.map((item, index) => toPoint(item.securityScore || 0, index)).join(' ');
  const areaPoints = `${padding.left},${height - padding.bottom} ${overallPoints} ${padding.left + innerWidth},${height - padding.bottom}`;

  const yAxisMarks = [0, 25, 50, 75, 100]
    .map((tick) => {
      const y = padding.top + (1 - tick / maxValue) * innerHeight;
      return `
        <line x1="${padding.left}" y1="${y.toFixed(2)}" x2="${(padding.left + innerWidth).toFixed(2)}" y2="${y.toFixed(2)}" class="trend-grid-line" />
        <text x="${(padding.left - 8).toFixed(2)}" y="${(y + 4).toFixed(2)}" class="trend-axis-label">${tick}</text>`;
    })
    .join('');

  const latest = points[points.length - 1] || {};
  const latestOverall = Math.round(Number(latest.overall || 0));
  const latestSecurity = Math.round(Number(latest.securityScore || 0));

  return `
    <div class="trend-svg-wrap">
      <svg class="trend-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(copy.trendAriaLabel)}">
        <defs>
          <linearGradient id="aceTrendArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#60a5fa" stop-opacity="0.4"></stop>
            <stop offset="100%" stop-color="#60a5fa" stop-opacity="0.03"></stop>
          </linearGradient>
        </defs>
        <rect x="${padding.left}" y="${padding.top}" width="${innerWidth}" height="${innerHeight}" class="trend-chart-bg"></rect>
        ${yAxisMarks}
        <polygon points="${areaPoints}" fill="url(#aceTrendArea)"></polygon>
        <polyline points="${overallPoints}" class="trend-line trend-line-overall"></polyline>
        <polyline points="${securityPoints}" class="trend-line trend-line-security"></polyline>
      </svg>
      <div class="trend-legend">
        <span><i class="trend-dot trend-dot-overall"></i> ${escapeHtml(copy.achCoverage)} (${latestOverall}%)</span>
        <span><i class="trend-dot trend-dot-security"></i> ${escapeHtml(copy.securityLabel)} (${latestSecurity}%)</span>
      </div>
    </div>`;
}

function buildHealthDomains(state, copy) {
  const coverage = state.coverage || {};
  const dimensions = coverage.dimensions || {};
  const security = state.security || {};
  const stats = state.model?.stats || {};
  const testQualityScore = Number(coverage.testQuality?.score || dimensions.testability || 0);
  const rules = state.rules || [];
  const decisions = state.decisions || [];
  const violations = state.violations || [];

  const highSeverity = violations.filter((item) => ['high', 'critical'].includes(String(item.severity || '').toLowerCase())).length;
  const totalViolations = Math.max(1, violations.length);
  const highSeverityRatio = highSeverity / totalViolations;

  const architectureScore = clamp(
    Math.round(
      Number(dimensions.layering || 0) * 0.5 +
        Number(dimensions.consistency || 0) * 0.3 +
        Number(dimensions.validation || 0) * 0.2 -
        highSeverityRatio * 16,
    ),
    0,
    100,
  );

  const performancePenalty =
    Number(stats.unboundedGetCalls || 0) * 1.2 +
    Number(stats.possibleNPlusOneRisks || 0) * 4 +
    Number(stats.unsafeRawSqlCalls || 0) * 2.5 +
    Number(stats.criticalWritesWithoutTransaction || 0) * 3;
  const performanceScore = clamp(Math.round(100 - performancePenalty), 0, 100);

  const testingScore = clamp(Math.round(Number(dimensions.testability || 0)), 0, 100);
  const securityScore = clamp(Math.round(Number(security.score || 0)), 0, 100);

  const governanceBase = Number(coverage.confidence || 0) * 0.45 + Math.min(40, rules.length * 4 + decisions.length * 3);
  const governancePenalty = highSeverityRatio * 24;
  const governanceScore = clamp(Math.round(governanceBase - governancePenalty), 0, 100);

  return [
    {
      key: 'architecture',
      label: copy.architectureHealth,
      score: architectureScore,
      note: `${Math.round(Number(dimensions.layering || 0))}% ${copy.noteLayering} · ${Math.round(Number(dimensions.consistency || 0))}% ${copy.noteConsistency} · ${Math.round(Number(dimensions.authorization || 0))}% ${copy.noteAuthorization}`,
    },
    {
      key: 'performance',
      label: copy.performanceHealth,
      score: performanceScore,
      note: `${Number(stats.unboundedGetCalls || 0)} ${copy.noteUnbounded} · ${Number(stats.possibleNPlusOneRisks || 0)} N+1`,
    },
    {
      key: 'security',
      label: copy.securityHealth,
      score: securityScore,
      note: `${Number(security.totals?.fail || 0)} ${copy.noteFails} · ${Number(security.totals?.warning || 0)} ${copy.noteWarnings}`,
    },
    {
      key: 'testing',
      label: copy.testingHealth,
      score: testingScore,
      note: `${Math.round(testQualityScore)}% ${copy.noteTestQuality} · ${Number(stats.missingTests || 0)} ${copy.filesMissingTests} · ${Number(stats.testFilesWithoutAssertions || 0)} ${copy.filesWithoutAsserts}`,
    },
    {
      key: 'governance',
      label: copy.governanceHealth,
      score: governanceScore,
      note: `${rules.length} ${copy.ruleCount} · ${decisions.length} ${copy.decisionCount}`,
    },
  ];
}

function buildQuickWins(suggestions = []) {
  const impactWeight = { high: 3, medium: 2, low: 1 };
  const effortWeight = { low: 3, medium: 2, high: 1 };

  return [...(suggestions || [])]
    .map((item) => {
      const impact = String(item.impact || 'low').toLowerCase();
      const effort = String(item.effort || 'medium').toLowerCase();
      const score = (impactWeight[impact] || 1) * 8 + (effortWeight[effort] || 1) * 5;
      return {
        ...item,
        quickWinScore: score,
      };
    })
    .sort((a, b) => b.quickWinScore - a.quickWinScore)
    .slice(0, 8);
}

function resolveSecondaryCardColumnSpans(cardCount) {
  if (cardCount <= 0) return [];
  if (cardCount === 1) return [12];
  if (cardCount === 2) return [6, 6];
  if (cardCount === 3) return [4, 4, 4];
  if (cardCount === 4) return [3, 3, 3, 3];
  if (cardCount === 5) return [4, 2, 2, 2, 2];
  return Array.from({ length: cardCount }, () => 2);
}

function severityBadge(severity) {
  if (severity === 'critical' || severity === 'high') {
    return 'badge badge-high';
  }

  if (severity === 'medium') {
    return 'badge badge-medium';
  }

  return 'badge badge-low';
}

function actionabilityBadge(priority) {
  const normalized = String(priority || '').toUpperCase();
  if (normalized === 'P1') return 'badge badge-high';
  if (normalized === 'P2') return 'badge badge-high';
  if (normalized === 'P3') return 'badge badge-medium';
  if (normalized === 'P4') return 'badge badge-low';
  return 'badge badge-low';
}

function actionabilityFallback(item) {
  const severity = String(item?.severity || 'low').toLowerCase();
  if (severity === 'critical') {
    return { priority: 'P1', score: 90, index: 5 };
  }
  if (severity === 'high') {
    return { priority: 'P2', score: 76, index: 4 };
  }
  if (severity === 'medium') {
    return { priority: 'P3', score: 60, index: 3 };
  }
  return { priority: 'P4', score: 45, index: 2 };
}

function controlStatusClass(status) {
  if (status === 'fail') {
    return 'badge badge-high';
  }
  if (status === 'warning') {
    return 'badge badge-medium';
  }
  if (status === 'pass') {
    return 'badge badge-ok';
  }
  return 'badge badge-low';
}

function normalizeVulnerabilitySeverity(severity) {
  const value = String(severity || '').toLowerCase();
  if (!value) return 'unknown';
  if (value.includes('critical')) return 'critical';
  if (value.includes('high')) return 'high';
  if (value.includes('moderate') || value.includes('medium')) return 'medium';
  if (value.includes('low')) return 'low';
  return 'unknown';
}

function vulnerabilitySeverityRank(severity) {
  const map = {
    critical: 5,
    high: 4,
    medium: 3,
    low: 2,
    unknown: 1,
  };
  return map[normalizeVulnerabilitySeverity(severity)] || 0;
}

function getDependencyAuditEngines(dependencyAudits = {}) {
  const entries = [];
  ['composer', 'npm'].forEach((key) => {
    const item = dependencyAudits[key];
    if (!item || typeof item !== 'object') {
      return;
    }
    const hasSignals =
      item.hasManifest ||
      item.source === 'runtime' ||
      item.source === 'cache' ||
      (Array.isArray(item.vulnerabilities) && item.vulnerabilities.length > 0);
    if (!hasSignals) {
      return;
    }
    entries.push({
      key,
      ...item,
      summary: {
        total: Number(item.summary?.total || 0),
        critical: Number(item.summary?.critical || 0),
        high: Number(item.summary?.high || 0),
        medium: Number(item.summary?.medium || 0),
        low: Number(item.summary?.low || 0),
        unknown: Number(item.summary?.unknown || 0),
      },
    });
  });
  return entries;
}

function flattenDependencyVulnerabilities(dependencyAuditEngines = []) {
  return dependencyAuditEngines
    .flatMap((engine) =>
      (engine.vulnerabilities || []).map((vulnerability) => ({
        ecosystem: vulnerability.ecosystem || engine.key,
        package: vulnerability.package || 'unknown',
        version: vulnerability.version || null,
        severity: normalizeVulnerabilitySeverity(vulnerability.severity),
        title: vulnerability.title || 'Dependency advisory',
        cve: vulnerability.cve || null,
        advisoryId: vulnerability.advisoryId || null,
        url: vulnerability.url || null,
        affectedVersions: vulnerability.affectedVersions || null,
        fixVersion: vulnerability.fixVersion || null,
      })),
    )
    .sort((a, b) => {
      const severityDiff = vulnerabilitySeverityRank(b.severity) - vulnerabilitySeverityRank(a.severity);
      if (severityDiff !== 0) {
        return severityDiff;
      }
      return String(a.package).localeCompare(String(b.package));
    });
}

function summarizeDependencyVulnerabilities(vulnerabilities = []) {
  const summary = {
    total: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    unknown: 0,
  };
  vulnerabilities.forEach((item) => {
    summary.total += 1;
    const severity = normalizeVulnerabilitySeverity(item?.severity);
    summary[severity] = Number(summary[severity] || 0) + 1;
  });
  return summary;
}

function prettyEvidenceKey(key, copy) {
  const dictionary = {
    count: copy.evidenceCount,
    total: copy.evidenceTotal,
    files: copy.evidenceFiles,
    workflows: copy.evidenceWorkflows,
    command: copy.evidenceCommand,
    source: copy.evidenceSource,
    modelCount: copy.evidenceModelCount,
    coveredModelCount: copy.evidenceCoveredModels,
    missingModels: copy.evidenceMissingModels,
    vulnerabilities: copy.evidenceVulnerabilities,
    critical: copy.critical,
    high: copy.high,
    medium: copy.medium,
    low: copy.low,
  };
  if (dictionary[key]) {
    return dictionary[key];
  }
  return key.replace(/_/g, ' ');
}

function renderEvidenceValue(key, value, copy) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `<span class="evidence-empty">${escapeHtml(copy.na)}</span>`;
    }
    const list = value
      .slice(0, 8)
      .map((item) => `<li><code>${escapeHtml(String(item))}</code></li>`)
      .join('');
    const more = value.length > 8 ? `<li>+${value.length - 8}</li>` : '';
    return `<ul class="evidence-list">${list}${more}</ul>`;
  }
  if (value && typeof value === 'object') {
    return `<code>${escapeHtml(JSON.stringify(value))}</code>`;
  }
  if (typeof value === 'boolean') {
    return escapeHtml(value ? copy.pass : copy.fail);
  }
  if (value == null || value === '') {
    return `<span class="evidence-empty">${escapeHtml(copy.na)}</span>`;
  }
  return escapeHtml(String(value));
}

function renderEvidenceDetails(evidence, copy) {
  if (!evidence || typeof evidence !== 'object') {
    return '';
  }
  const entries = Object.entries(evidence).filter(([, value]) => {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === 'object') return Object.keys(value).length > 0;
    return value !== null && value !== undefined && value !== '';
  });
  if (entries.length === 0) {
    return '';
  }
  const rows = entries
    .slice(0, 10)
    .map(
      ([key, value]) => `
        <div class="evidence-row">
          <span>${escapeHtml(prettyEvidenceKey(key, copy))}</span>
          <strong>${renderEvidenceValue(key, value, copy)}</strong>
        </div>`,
    )
    .join('');

  return `
    <details class="evidence-details">
      <summary>${escapeHtml(copy.evidence)}</summary>
      <div class="evidence-grid">${rows}</div>
    </details>`;
}

function generateHtmlReport(state, options = {}) {
  const copy = getReportCopy(options.locale);
  const languageFiles = options.languageFiles || REPORT_LANGUAGE_FILES;
  const historyLimit = Math.max(6, Number(options.historyLimit || 24));
  const coverage = state.coverage || {};
  const dimensions = coverage.dimensions || {};
  const trend = Number(coverage.delta || 0);
  const trendText = formatSigned(trend);
  const history = state.history || [];
  const recentHistory = history.slice(-historyLimit);
  const trendCoverage = normalizeTrendCoverage(state.trend?.coverage, trend);
  const trendStatus = String(trendCoverage.status || 'stable');
  const trendStatusText = trendStatusLabel(trendStatus, copy);
  const trendWindowDeltaText = formatSigned(trendCoverage.deltaWindow);
  const trendAverageStepText = formatSigned(trendCoverage.averageStep);
  const trendSamples = Number(trendCoverage.sampleSize || recentHistory.length || 0);
  const trendRegression = trendCoverage.regression || { triggered: false, drop: 0, threshold: 0 };
  const trendRegressionText = trendRegression.triggered
    ? `-${trendRegression.drop} ${copy.points} / ${copy.threshold} ${trendRegression.threshold}`
    : copy.regressionNone;

  const violations = state.violations || [];
  const actionability = state.actionability || {};
  const actionabilitySummary = actionability.summary || {};
  const actionabilityDistribution = actionabilitySummary.distribution || {};
  const waivedViolations = state.waivedViolations || [];
  const suggestions = state.suggestions || [];
  const rules = state.rules || [];
  const decisions = state.decisions || [];
  const patterns = state.model?.patterns || {};
  const patternDriftWaves = state.model?.patternDriftWaves || [];
  const security = state.security || {};
  const securityTotals = security.totals || {};
  const securityModeSummary = security.modeSummary || {};
  const securityDomainSummary = security.domainSummary || security.metadata?.domainSummary || {};
  const securityCodeSummary = securityDomainSummary.code || {};
  const securityPipelineSummary = securityDomainSummary.pipeline || {};
  const securityControls = security.controls || [];
  const dependencyAuditEngines = getDependencyAuditEngines(security.metadata?.dependencyAudits || {});
  const dependencyVulnerabilities = flattenDependencyVulnerabilities(dependencyAuditEngines).slice(0, 240);
  const dependencyVulnerabilitySummary = summarizeDependencyVulnerabilities(dependencyVulnerabilities);
  const filamentScores = security.filamentScores || security.metadata?.filamentScores || {};
  const hasFilamentPageScore = Boolean(filamentScores.pages);
  const hasFilamentWidgetScore = Boolean(filamentScores.widgets);
  const filamentPageScore = hasFilamentPageScore ? Number(filamentScores.pages?.score || 0) : null;
  const filamentWidgetScore = hasFilamentWidgetScore ? Number(filamentScores.widgets?.score || 0) : null;
  const scopeValue = `${Number(coverage.scannedFiles || 0)}/${Number(coverage.totalPhpFiles || 0)}`;
  const scorecardHints = {
    achCoverage: `${copy.layering}: ${formatPercent(dimensions.layering)} · ${copy.validation}: ${formatPercent(dimensions.validation)} · ${copy.testability}: ${formatPercent(dimensions.testability)} · ${copy.consistency}: ${formatPercent(dimensions.consistency)} · ${copy.authorization}: ${formatPercent(dimensions.authorization)}`,
    trend: `${copy.trendWindowDelta}: ${trendWindowDeltaText} · ${copy.trendAverageStep}: ${trendAverageStepText} · ${copy.trendWindowSamples}: ${trendSamples}`,
    confidence: `${copy.scope}: ${scopeValue} · ${copy.trendStatus}: ${trendStatusText}`,
    securityScore: `${copy.securityFails}: ${Number(securityTotals.fail || 0)} · ${copy.warning}: ${Number(securityTotals.warning || 0)} · ${copy.pass}: ${Number(securityTotals.pass || 0)} · ${copy.securityCode}: ${formatPercent(securityCodeSummary.score || 0)} · ${copy.pipelineMaturity}: ${formatPercent(securityPipelineSummary.score || 0)}`,
    securityFails: `${copy.securityLabel}: ${formatPercent(security.score || 0)} · ${copy.dependencyVulnerabilities}: ${dependencyVulnerabilitySummary.total}`,
    scope: `${copy.scope}: ${scopeValue}`,
    layering: `${Number(state.model?.stats?.controllersUsingService || 0)} service-layer / ${Number(state.model?.stats?.controllersWithDirectModel || 0)} direct model`,
    validation: `${Number(state.model?.stats?.controllersUsingFormRequest || 0)} FormRequest/DTO · $request->all(): ${Number(state.model?.stats?.requestAllCalls || 0)}`,
    testability: `${Math.round(Number(coverage.testQuality?.score || 0))}% ${copy.noteTestQuality} · ${Number(state.model?.stats?.missingTests || 0)} ${copy.filesMissingTests}`,
    consistency: `${violations.length} ${copy.violationsLabel.toLowerCase()} · ${waivedViolations.length} ${copy.waiver.toLowerCase()}`,
    authorization: `${Number(state.model?.stats?.authorizationChecks || 0)} checks · policy coverage ${Math.round(Number(security.metadata?.authzCoverage?.policyModelCoverage?.coveredModelCount || 0))}/${Math.round(Number(security.metadata?.authzCoverage?.policyModelCoverage?.modelCount || 0)) || 0}`,
  };
  const secondaryCards = [
    {
      title: copy.securityAutomated,
      value: formatPercent(securityModeSummary.automated?.score || 0),
      hint: `${copy.securityAutomated}: ${formatPercent(securityModeSummary.automated?.score || 0)} · ${Number(securityModeSummary.automated?.fail || 0)} ${copy.noteFails}`,
      targetPanel: 'security-panel',
    },
    {
      title: copy.securitySemi,
      value: formatPercent(securityModeSummary.semi?.score || 0),
      hint: `${copy.securitySemi}: ${formatPercent(securityModeSummary.semi?.score || 0)} · ${Number(securityModeSummary.semi?.warning || 0)} ${copy.noteWarnings}`,
      targetPanel: 'security-panel',
    },
    {
      title: copy.securityManual,
      value: formatPercent(securityModeSummary.manual?.score || 0),
      hint: `${copy.securityManual}: ${formatPercent(securityModeSummary.manual?.score || 0)} · ${Number(securityModeSummary.manual?.unknown || 0)} ${copy.unknown.toLowerCase()}`,
      targetPanel: 'security-panel',
    },
    {
      title: copy.securityStatus,
      value: `${Number(securityTotals.pass || 0)}/${Number(securityTotals.total || 0)}`,
      hint: `${copy.pass}: ${Number(securityTotals.pass || 0)} · ${copy.warning}: ${Number(securityTotals.warning || 0)} · ${copy.fail}: ${Number(securityTotals.fail || 0)}`,
      targetPanel: 'security-panel',
    },
    {
      title: copy.securityCode,
      value: formatPercent(securityCodeSummary.score || 0),
      hint: `${copy.securityCode}: ${formatPercent(securityCodeSummary.score || 0)} · ${copy.fail}: ${Number(securityCodeSummary.fail || 0)} · ${copy.warning}: ${Number(securityCodeSummary.warning || 0)}`,
      targetPanel: 'security-panel',
    },
    {
      title: copy.pipelineMaturity,
      value: formatPercent(securityPipelineSummary.score || 0),
      hint: `${copy.pipelineMaturity}: ${formatPercent(securityPipelineSummary.score || 0)} · ${copy.fail}: ${Number(securityPipelineSummary.fail || 0)} · ${copy.warning}: ${Number(securityPipelineSummary.warning || 0)} · ${copy.unknown}: ${Number(securityPipelineSummary.unknown || 0)}`,
      targetPanel: 'security-panel',
      securityCategory: 'pipeline',
    },
    ...(hasFilamentPageScore
      ? [
          {
            title: copy.filamentPagesSec,
            value: formatPercentOrFallback(filamentPageScore, copy.na),
            hint: `${copy.filamentPagesSec}: ${formatPercentOrFallback(filamentPageScore, copy.na)} (${Number(filamentScores.pages?.authorized || 0)}/${Number(filamentScores.pages?.total || 0)})`,
            targetPanel: 'security-panel',
            securityCategory: 'filament',
          },
        ]
      : []),
    ...(hasFilamentWidgetScore
      ? [
          {
            title: copy.filamentWidgetsSec,
            value: formatPercentOrFallback(filamentWidgetScore, copy.na),
            hint: `${copy.filamentWidgetsSec}: ${formatPercentOrFallback(filamentWidgetScore, copy.na)} (${Number(filamentScores.widgets?.authorized || 0)}/${Number(filamentScores.widgets?.total || 0)})`,
            targetPanel: 'security-panel',
            securityCategory: 'filament',
          },
        ]
      : []),
  ];
  const secondaryCardSpans = resolveSecondaryCardColumnSpans(secondaryCards.length);
  const secondaryCardMarkup = secondaryCards
    .map(
      (item, index) => `
        <article class="kpi-card kpi-col-${Number(secondaryCardSpans[index] || 2)} is-clickable" title="${escapeHtml(item.hint || '')}" data-target-panel="${escapeHtml(item.targetPanel || '')}" data-security-category="${escapeHtml(item.securityCategory || '')}">
          <h3>${escapeHtml(item.title)}</h3>
          <p class="metric">${escapeHtml(item.value)}</p>
        </article>`,
    )
    .join('');
  const trendSvg = buildTrendChartSvg(recentHistory, copy);
  const trendCorrelations = buildTrendCorrelations(recentHistory, copy);
  const trendCorrelationRows = trendCorrelations
    .map((item) => {
      if (item.value == null) {
        return `
        <div class="corr-item">
          <h4>${escapeHtml(item.label)}</h4>
          <p class="corr-empty">${escapeHtml(copy.trendCorrelationsEmpty)}</p>
        </div>`;
      }

      const badgeClass = item.value < 0 ? 'corr-badge corr-inverse' : 'corr-badge corr-direct';
      const valueText = `${item.value > 0 ? '+' : ''}${item.value}`;
      const sampleText = `${copy.corrSamplePrefix}=${Number(item.sampleSize || 0)}`;
      return `
      <div class="corr-item">
        <h4>${escapeHtml(item.label)}</h4>
        <div class="corr-row">
          <span class="corr-value">${escapeHtml(valueText)}</span>
          <span class="${badgeClass}">${escapeHtml(item.strength)} · ${escapeHtml(item.direction)}</span>
        </div>
        <p class="corr-sample">${escapeHtml(sampleText)}</p>
      </div>`;
    })
    .join('');
  const sortedViolations = [...violations].sort((a, b) => {
    const scoreDiff = Number(b.actionabilityScore || 0) - Number(a.actionabilityScore || 0);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    const rank = { critical: 5, high: 4, medium: 3, low: 2 };
    const severityDiff =
      (rank[String(b.severity || 'low').toLowerCase()] || 0) -
      (rank[String(a.severity || 'low').toLowerCase()] || 0);
    if (severityDiff !== 0) {
      return severityDiff;
    }
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
  const healthDomainCards = buildHealthDomains(state, copy)
    .map(
      (item) => `
      <article class="health-card health-${escapeHtml(item.key)}">
        <h3>${escapeHtml(item.label)}</h3>
        <p class="metric">${formatPercent(item.score)}</p>
        <div class="health-meter"><span style="width:${clamp(Number(item.score || 0), 0, 100)}%"></span></div>
        <p class="health-note">${escapeHtml(item.note)}</p>
      </article>`,
    )
    .join('');
  const quickWins = buildQuickWins(suggestions);
  const quickWinRows = quickWins
    .map((item, index) => {
      const translatedTitle = translateDynamicText(item.title || '-', copy.code);
      const translatedCategory = translateDynamicText(item.category || '-', copy.code);
      const translatedDetails = translateDynamicText(item.details || '-', copy.code);
      return `
      <tr>
        <td>#${index + 1}</td>
        <td>${escapeHtml(translatedTitle)}</td>
        <td>${escapeHtml(translatedCategory)}</td>
        <td><span class="badge ${item.impact === 'high' ? 'badge-high' : item.impact === 'medium' ? 'badge-medium' : 'badge-low'}">${escapeHtml(item.impact || '-')}</span></td>
        <td><span class="badge ${item.effort === 'low' ? 'badge-ok' : item.effort === 'medium' ? 'badge-medium' : 'badge-high'}">${escapeHtml(item.effort || '-')}</span></td>
        <td>${escapeHtml(translatedDetails)}</td>
      </tr>`;
    })
    .join('');

  const hotspotMap = new Map();
  violations.forEach((violation) => {
    const file = violation.file || 'unknown';
    const current = hotspotMap.get(file) || { file, total: 0, high: 0, medium: 0, low: 0 };
    current.total += 1;
    if (violation.severity === 'high' || violation.severity === 'critical') current.high += 1;
    else if (violation.severity === 'medium') current.medium += 1;
    else current.low += 1;
    hotspotMap.set(file, current);
  });

  const hotspots = Array.from(hotspotMap.values())
    .sort((a, b) => b.high - a.high || b.medium - a.medium || b.total - a.total)
    .slice(0, 12);

  const hotspotGroups = Array.from(hotspotMap.values())
    .sort((a, b) => b.total - a.total);
  const hotspotFilesCount = hotspotGroups.length;
  const hotspotWindow = hotspotFilesCount > 0 ? Math.max(1, Math.ceil(hotspotFilesCount * 0.2)) : 0;
  const hotspotViolations = hotspotGroups
    .slice(0, hotspotWindow)
    .reduce((sum, item) => sum + Number(item.total || 0), 0);
  const hotspotConcentration = violations.length > 0
    ? clamp(Math.round((hotspotViolations / Math.max(1, violations.length)) * 100), 0, 100)
    : 0;

  const hotspotRows = hotspots
    .map(
      (item) => `
      <tr>
        <td><code>${escapeHtml(item.file)}</code></td>
        <td>${item.total}</td>
        <td>${item.high}</td>
        <td>${item.medium}</td>
        <td>${item.low}</td>
      </tr>`,
    )
    .join('');
  const driftWaveRows = patternDriftWaves
    .slice(0, 16)
    .map((wave) => {
      const files = Array.isArray(wave.files) ? wave.files : [];
      const fileTags = files
        .slice(0, 8)
        .map((file) => `<code>${escapeHtml(file)}</code>`)
        .join(' ');
      const hiddenFiles = Number(wave.hiddenFiles || 0);
      const expected = wave.expected ? String(wave.expected) : '-';
      return `
      <tr>
        <td><code>${escapeHtml(wave.key || '-')}</code></td>
        <td>${Number(wave.count || 0)}</td>
        <td>${escapeHtml(expected)}</td>
        <td><span class="badge ${String(wave.severity || '').toLowerCase() === 'high' || String(wave.severity || '').toLowerCase() === 'critical' ? 'badge-high' : String(wave.severity || '').toLowerCase() === 'medium' ? 'badge-medium' : 'badge-low'}">${escapeHtml(String(wave.severity || 'low'))}</span></td>
        <td>${fileTags || '-' }${hiddenFiles > 0 ? ` <span class="muted">+${hiddenFiles}</span>` : ''}</td>
      </tr>`;
    })
    .join('');

  const suggestionCards = suggestions
    .slice(0, 40)
    .map((item) => {
      const translatedCategory = translateDynamicText(item.category, copy.code);
      const translatedTitle = translateDynamicText(item.title, copy.code);
      const translatedDetails = translateDynamicText(item.details, copy.code);
      return `
      <article class="suggestion-card">
        <header>
          <span class="pill">${escapeHtml(translatedCategory)}</span>
          <h4>${escapeHtml(translatedTitle)}</h4>
        </header>
        <p>${escapeHtml(translatedDetails)}</p>
        <footer>
          <span>${escapeHtml(copy.impact)}: <strong>${escapeHtml(item.impact)}</strong></span>
          <span>${escapeHtml(copy.effort)}: <strong>${escapeHtml(item.effort)}</strong></span>
        </footer>
      </article>`;
    })
    .join('');

  const ruleRows = rules
    .slice(0, 40)
    .map(
      (rule) => `
      <tr>
        <td><code>${escapeHtml(rule.id)}</code></td>
        <td>${escapeHtml(rule.title)}</td>
        <td>${escapeHtml(rule.source || 'manual')}</td>
        <td>${escapeHtml(rule.createdAt)}</td>
      </tr>`,
    )
    .join('');

  const decisionRows = decisions
    .slice(0, 60)
    .map(
      (decision) => `
      <tr>
        <td><code>${escapeHtml(decision.id)}</code></td>
        <td>${escapeHtml(decision.key)}</td>
        <td>${escapeHtml(decision.preferred)}</td>
        <td>${escapeHtml(decision.source || 'manual')}</td>
        <td>${escapeHtml(decision.createdAt || '-')}</td>
      </tr>`,
    )
    .join('');

  const patternRows = Object.values(patterns)
    .map(
      (pattern) => `
      <tr>
        <td><code>${escapeHtml(pattern.key)}</code></td>
        <td>${escapeHtml(pattern.inferred || 'unknown')}</td>
        <td>${escapeHtml(pattern.expected || pattern.inferred || 'unknown')}</td>
        <td>${escapeHtml(pattern.source || 'inference')}</td>
        <td>${formatPercent(pattern.confidence || 0)}</td>
        <td>${formatPercent(pattern.adoption || 0)}</td>
      </tr>`,
    )
    .join('');

  const securityCategoryOptions = Array.from(
    new Set(securityControls.map((item) => item.category).filter(Boolean)),
  )
    .sort((a, b) => String(a).localeCompare(String(b)))
    .map((category) => {
      const translatedCategory = translateDynamicText(category, copy.code);
      return `<option value="${escapeHtml(category)}">${escapeHtml(translatedCategory)}</option>`;
    })
    .join('');

  const dependencyEngineCards = dependencyAuditEngines
    .map((engine) => {
      const statusClass = controlStatusClass(engine.status || 'unknown');
      const title = engine.key === 'composer' ? 'Composer Audit' : 'NPM Audit';
      const engineHint = [
        `${copy.status}: ${engine.status || 'unknown'}`,
        `${copy.source}: ${engine.source || '-'}`,
        `${copy.total}: ${Number(engine.summary?.total || 0)}`,
      ].join(' · ');
      return `
        <article class="kpi-card is-clickable" title="${escapeHtml(engineHint)}" data-target-panel="dependency-audits-panel" data-audit-engine="${escapeHtml(engine.key)}">
          <h3>${escapeHtml(title)}</h3>
          <p class="metric">${Number(engine.summary?.total || 0)}</p>
          <p class="audit-note"><span class="${statusClass}">${escapeHtml(engine.status || 'unknown')}</span></p>
        </article>`;
    })
    .join('');

  const dependencyEcosystemOptions = Array.from(
    new Set(dependencyVulnerabilities.map((item) => item.ecosystem).filter(Boolean)),
  )
    .sort((a, b) => String(a).localeCompare(String(b)))
    .map((ecosystem) => `<option value="${escapeHtml(ecosystem)}">${escapeHtml(String(ecosystem).toUpperCase())}</option>`)
    .join('');

  const dependencyRows = dependencyVulnerabilities
    .map((item) => {
      const severity = normalizeVulnerabilitySeverity(item.severity);
      const search = `${item.ecosystem} ${item.package} ${item.title} ${item.cve || ''} ${item.advisoryId || ''} ${item.affectedVersions || ''} ${item.fixVersion || ''}`.toLowerCase();
      const advisoryLabel = item.cve || item.advisoryId || '-';
      const title = translateDynamicText(item.title || '-', copy.code);
      const fixLabel = item.fixVersion || '-';
      const reference = item.url
        ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(advisoryLabel)}</a>`
        : escapeHtml(advisoryLabel);
      return `
      <tr data-severity="${escapeHtml(severity)}" data-ecosystem="${escapeHtml(item.ecosystem)}" data-search="${escapeHtml(search)}">
        <td><span class="${severityBadge(severity)}">${escapeHtml(severity)}</span></td>
        <td>${escapeHtml(String(item.ecosystem || '').toUpperCase())}</td>
        <td><code>${escapeHtml(item.package || 'unknown')}</code></td>
        <td>${reference}</td>
        <td>${escapeHtml(title)}</td>
        <td>${escapeHtml(item.affectedVersions || '-')}</td>
        <td>${escapeHtml(fixLabel)}</td>
      </tr>`;
    })
    .join('');

  const filteredSecurityRows = securityControls
    .slice(0, 200)
    .map((control, index) => {
      const translatedTitle = translateDynamicText(control.title || '-', copy.code);
      const translatedMessage = translateDynamicText(control.message || '-', copy.code);
      const translatedRecommendation = translateDynamicText(control.recommendation || '-', copy.code);
      const status = String(control.status || 'unknown').toLowerCase();
      const mode = String(control.mode || 'unknown').toLowerCase();
      const severity = String(control.severity || 'low').toLowerCase();
      const category = String(control.category || 'general').toLowerCase();
      const evidenceText = JSON.stringify(control.evidence || {}).toLowerCase();
      const search = `${translatedTitle} ${translatedMessage} ${translatedRecommendation} ${control.id || ''} ${evidenceText}`.toLowerCase();
      const evidenceDetails = renderEvidenceDetails(control.evidence, copy);
      const rowKey = `${String(control.id || 'control').replace(/[^a-zA-Z0-9_-]/g, '-')}-${index}`;
      const evidenceRow = evidenceDetails
        ? `
      <tr class="security-evidence-row" data-parent-row="${escapeHtml(rowKey)}">
        <td colspan="7">
          <div class="security-evidence-cell">${evidenceDetails}</div>
        </td>
      </tr>`
        : '';
      return `
      <tr class="security-main-row" data-row-key="${escapeHtml(rowKey)}" data-status="${escapeHtml(status)}" data-mode="${escapeHtml(mode)}" data-severity="${escapeHtml(severity)}" data-category="${escapeHtml(category)}" data-search="${escapeHtml(search)}">
        <td><span class="${controlStatusClass(control.status)}">${escapeHtml(control.status)}</span></td>
        <td>${escapeHtml(control.mode)}</td>
        <td>${escapeHtml(control.severity)}</td>
        <td>${escapeHtml(translateDynamicText(control.category, copy.code))}</td>
        <td>${escapeHtml(translatedTitle)}</td>
        <td>${escapeHtml(translatedMessage)}</td>
        <td>${escapeHtml(translatedRecommendation)}</td>
      </tr>${evidenceRow}`;
    })
    .join('');

  const filteredViolationRows = sortedViolations
    .slice(0, 200)
    .map((item) => {
      const translatedType = translateDynamicText(item.type, copy.code);
      const translatedMessage = translateDynamicText(item.message, copy.code);
      const translatedSuggestion = translateDynamicText(item.suggestion || '-', copy.code);
      const severity = String(item.severity || 'low').toLowerCase();
      const fallback = actionabilityFallback(item);
      const actionabilityPriority = String(item.actionabilityPriority || fallback.priority).toUpperCase();
      const actionabilityScore = Number(item.actionabilityScore || fallback.score);
      const search = `${translatedType || ''} ${item.file || ''} ${translatedMessage || ''} ${translatedSuggestion || ''}`.toLowerCase();
      return `
      <tr data-severity="${escapeHtml(severity)}" data-priority="${escapeHtml(actionabilityPriority.toLowerCase())}" data-search="${escapeHtml(search)}">
        <td><span class="${severityBadge(item.severity)}">${escapeHtml(item.severity)}</span></td>
        <td><span class="${actionabilityBadge(actionabilityPriority)}">${escapeHtml(actionabilityPriority)} · ${actionabilityScore}</span></td>
        <td>${escapeHtml(translatedType)}</td>
        <td><code>${escapeHtml(item.file)}:${Number(item.line || 1)}</code></td>
        <td>${escapeHtml(translatedMessage)}</td>
        <td>${escapeHtml(translatedSuggestion)}</td>
      </tr>`;
    })
    .join('');

  const languageSelectOptions = [
    { code: 'en-US', label: copy.languageEn },
    { code: 'pt-BR', label: copy.languagePt },
  ]
    .map((item) => {
      const selected = item.code === copy.code ? ' selected' : '';
      return `<option value="${escapeHtml(item.code)}"${selected}>${escapeHtml(item.label)}</option>`;
    })
    .join('');

  return `<!doctype html>
<html lang="${escapeHtml(copy.code)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(copy.reportTitle)}</title>
  <style>
    :root {
      --bg: #080d1b;
      --surface: #0f162a;
      --surface-soft: #121d34;
      --surface-lift: #162341;
      --text: #e8efff;
      --muted: #9aa8ca;
      --brand: #3b82f6;
      --brand-2: #06b6d4;
      --brand-3: #1d2f8f;
      --ok: #10b981;
      --warn: #f59e0b;
      --danger: #ef4444;
      --border: #27365f;
      --shadow-soft: 0 18px 42px rgba(5, 10, 28, 0.42);
      --shadow-strong: 0 30px 68px rgba(2, 7, 24, 0.7);
      --radius: 16px;
    }

    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      color: var(--text);
      font-family: "Sora", "Manrope", "IBM Plex Sans", "Avenir Next", "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at 9% 11%, rgba(59, 130, 246, 0.22), transparent 34%),
        radial-gradient(circle at 88% 3%, rgba(6, 182, 212, 0.2), transparent 32%),
        linear-gradient(rgba(140, 162, 230, 0.12) 1px, transparent 1px),
        linear-gradient(90deg, rgba(140, 162, 230, 0.12) 1px, transparent 1px),
        linear-gradient(180deg, #050913 0%, #080f1f 52%, #091224 100%);
      background-size: auto, auto, 34px 34px, 34px 34px, auto;
      background-position: center center, center center, -1px -1px, -1px -1px, center center;
      min-height: 100vh;
      line-height: 1.45;
    }

    .wrapper {
      width: min(1380px, 95vw);
      margin: 26px auto 68px;
      display: grid;
      gap: 20px;
    }

    .hero {
      position: relative;
      overflow: hidden;
      background:
        linear-gradient(127deg, #152a92 2%, #2456ff 48%, #0f8de0 96%);
      color: #fff;
      border-radius: calc(var(--radius) + 10px);
      box-shadow: var(--shadow-strong);
      padding: 28px;
      display: grid;
      gap: 14px;
      isolation: isolate;
    }

    .hero::before {
      content: "";
      position: absolute;
      inset: -80px auto auto -80px;
      width: 320px;
      height: 320px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(255,255,255,.22), transparent 72%);
      pointer-events: none;
      z-index: -1;
    }

    .hero h1 {
      margin: 0;
      font-size: clamp(1.8rem, 1.44rem + 1.35vw, 2.62rem);
      letter-spacing: 0.01em;
      font-weight: 800;
    }

    .hero .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 9px;
    }

    .tag {
      border: 1px solid rgba(255,255,255,.24);
      border-radius: 999px;
      padding: 7px 13px;
      font-size: .86rem;
      font-weight: 600;
      background: rgba(255,255,255,.12);
      backdrop-filter: blur(8px);
      letter-spacing: .01em;
    }

    .lang-switch {
      margin-left: auto;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 1px solid rgba(255,255,255,.24);
      border-radius: 999px;
      padding: 6px 10px;
      background: rgba(255,255,255,.12);
      backdrop-filter: blur(8px);
      font-size: .82rem;
      font-weight: 700;
      letter-spacing: .01em;
    }

    .lang-switch span {
      color: rgba(255,255,255,.92);
      white-space: nowrap;
    }

    .lang-switch select {
      appearance: none;
      border: 1px solid rgba(255,255,255,.32);
      background: rgba(12, 22, 49, .65);
      color: #fff;
      border-radius: 999px;
      padding: 5px 28px 5px 10px;
      font: inherit;
      cursor: pointer;
      background-image:
        linear-gradient(45deg, transparent 50%, rgba(255,255,255,.9) 50%),
        linear-gradient(135deg, rgba(255,255,255,.9) 50%, transparent 50%);
      background-position:
        calc(100% - 16px) calc(50% - 2px),
        calc(100% - 11px) calc(50% - 2px);
      background-size: 5px 5px, 5px 5px;
      background-repeat: no-repeat;
      min-width: 152px;
    }

    .lang-switch select:focus {
      outline: none;
      box-shadow: 0 0 0 3px rgba(255,255,255,.22);
      border-color: rgba(255,255,255,.5);
    }

    .panel {
      background: linear-gradient(180deg, rgba(15, 24, 45, .92), rgba(12, 20, 38, .88));
      border: 1px solid rgba(39, 56, 94, .95);
      border-radius: calc(var(--radius) + 2px);
      box-shadow: var(--shadow-soft);
      padding: 19px;
      display: grid;
      gap: 15px;
      backdrop-filter: blur(8px);
    }

    .panel-title {
      margin: 0;
      font-size: .98rem;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: #b8c6ea;
      font-weight: 800;
    }

    .panel-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      margin-top: -4px;
      color: #8fa4d6;
      font-size: .86rem;
      letter-spacing: .01em;
    }

    .panel-meta strong {
      color: #e5ecff;
      font-weight: 800;
    }

    .muted {
      color: #8fa4d6;
      font-size: .82rem;
      margin-left: 6px;
    }

    .score-grid {
      display: grid;
      gap: 12px;
    }

    .score-grid-primary {
      grid-template-columns: repeat(12, minmax(0, 1fr));
      grid-auto-flow: row dense;
    }

    .score-grid-secondary {
      grid-template-columns: repeat(12, minmax(0, 1fr));
      grid-auto-flow: row dense;
    }

    .score-grid-primary .kpi-card {
      grid-column: span 2;
      min-width: 0;
    }

    .score-grid-primary .kpi-card.scope-card {
      grid-column: span 4;
    }

    .score-grid-secondary .kpi-card {
      grid-column: span 2;
      min-width: 0;
    }

    .score-grid-secondary .kpi-card.kpi-col-12 { grid-column: span 12; }
    .score-grid-secondary .kpi-card.kpi-col-6 { grid-column: span 6; }
    .score-grid-secondary .kpi-card.kpi-col-4 { grid-column: span 4; }
    .score-grid-secondary .kpi-card.kpi-col-3 { grid-column: span 3; }
    .score-grid-secondary .kpi-card.kpi-col-2 { grid-column: span 2; }

    .kpi-card {
      background: linear-gradient(145deg, #162441, #111b32);
      border: 1px solid #2b3f6e;
      border-radius: 14px;
      box-shadow: 0 14px 30px rgba(5, 10, 24, .38);
      padding: 15px 16px;
      display: grid;
      gap: 6px;
      min-height: 108px;
      transition: transform .24s ease, box-shadow .24s ease;
    }

    .kpi-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 20px 38px rgba(5, 10, 24, .56);
    }

    .kpi-card.is-clickable {
      cursor: pointer;
    }

    .kpi-card.is-clickable:focus-visible {
      outline: 2px solid #6ab4ff;
      outline-offset: 2px;
    }

    .kpi-card h3 {
      margin: 0;
      font-size: .78rem;
      color: #93a5d2;
      text-transform: uppercase;
      letter-spacing: .09em;
      font-weight: 800;
    }

    .metric {
      font-size: 2.05rem;
      margin: 0;
      font-weight: 800;
      letter-spacing: -.02em;
      line-height: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .scope-card .metric {
      font-size: clamp(1.6rem, 1.2rem + 1vw, 2.05rem);
      letter-spacing: -.015em;
    }

    .audit-note {
      margin: 0;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .delta-positive { color: var(--ok); }
    .delta-negative { color: var(--danger); }
    .delta-neutral { color: #9cadcf; }

    .overview-gap {
      margin-top: 2px;
    }

    .filters {
      display: grid;
      grid-template-columns: repeat(5, minmax(140px, 1fr));
      gap: 10px;
      align-items: end;
      margin-top: 6px;
      margin-bottom: 10px;
    }

    .filters.filters-compact {
      grid-template-columns: minmax(120px, 170px) minmax(120px, 170px) minmax(220px, 1fr) auto auto;
    }

    .filter-field {
      display: grid;
      gap: 5px;
    }

    .filter-field span {
      font-size: .72rem;
      text-transform: uppercase;
      letter-spacing: .08em;
      font-weight: 800;
      color: #8ea1cd;
    }

    .filter-field select,
    .filter-field input {
      width: 100%;
      border: 1px solid #2f4472;
      border-radius: 11px;
      background: #121d34;
      color: #d9e5ff;
      padding: 10px 11px;
      font: inherit;
      font-size: .9rem;
      outline: none;
      transition: border-color .2s ease, box-shadow .2s ease;
    }

    .filter-field select:focus,
    .filter-field input:focus {
      border-color: #5ea6ff;
      box-shadow: 0 0 0 4px rgba(76, 132, 255, .22);
    }

    .filter-field input::placeholder {
      color: #7f90bb;
    }

    .btn-clear {
      border: 1px solid #345089;
      border-radius: 11px;
      background: linear-gradient(180deg, #1d2d54, #162341);
      color: #cddcff;
      font-weight: 700;
      font-size: .9rem;
      padding: 10px 12px;
      cursor: pointer;
      transition: transform .2s ease, box-shadow .2s ease;
    }

    .btn-clear:hover {
      transform: translateY(-1px);
      box-shadow: 0 10px 24px rgba(13, 25, 61, .46);
    }

    .filter-counter {
      justify-self: end;
      align-self: center;
      padding: 8px 12px;
      border-radius: 999px;
      background: #18325f;
      color: #b9d7ff;
      font-size: .84rem;
      font-weight: 700;
      letter-spacing: .02em;
    }

    .table-wrap {
      border: 1px solid #2a3f6c;
      border-radius: 14px;
      overflow: auto;
      box-shadow: inset 0 0 0 1px rgba(56, 76, 123, .25), 0 12px 24px rgba(5, 10, 25, .45);
      background: #111c34;
      max-height: 520px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--surface);
    }

    th, td {
      border-bottom: 1px solid #263a63;
      text-align: left;
      padding: 10px 12px;
      font-size: 0.9rem;
      vertical-align: top;
    }

    th {
      position: sticky;
      top: 0;
      z-index: 2;
      background: linear-gradient(180deg, #1b2b4f, #162645);
      color: #c4d5fb;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .03em;
      font-size: .76rem;
    }

    tr:hover td {
      background: #162746;
    }

    .security-evidence-row td {
      background: #0f1a31;
      padding: 0 12px 12px;
      border-bottom: 1px solid #263a63;
    }

    .security-evidence-row:hover td {
      background: #0f1a31;
    }

    .security-evidence-cell {
      width: 100%;
      padding-top: 8px;
    }

    a {
      color: #93d5ff;
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    code {
      background: #15284c;
      padding: 2px 6px;
      border-radius: 7px;
      font-size: .82rem;
      border: 1px solid #29457e;
    }

    .badge {
      display: inline-block;
      text-transform: uppercase;
      font-size: .7rem;
      font-weight: 800;
      letter-spacing: .05em;
      border-radius: 999px;
      padding: 4px 9px;
      color: #fff;
      min-width: 74px;
      text-align: center;
    }

    .badge-high { background: linear-gradient(180deg, #de3c3c, #b91c1c); }
    .badge-medium { background: linear-gradient(180deg, #e69122, #c26d08); }
    .badge-ok { background: linear-gradient(180deg, #14af63, #0b8c4d); }
    .badge-low { background: linear-gradient(180deg, #2d74e2, #1f5fbf); }

    .suggestions {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    }

    .suggestion-card {
      border: 1px solid #2d4273;
      border-radius: 14px;
      padding: 15px;
      background: linear-gradient(180deg, #142241, #101a31);
      box-shadow: 0 14px 26px rgba(5, 10, 24, .36);
      display: grid;
      gap: 9px;
    }

    .suggestion-card h4 {
      margin: 0;
      font-size: 1rem;
      line-height: 1.2;
    }

    .suggestion-card p {
      margin: 0;
      color: #99a9cf;
      font-size: 0.9rem;
      line-height: 1.42;
    }

    .suggestion-card footer {
      font-size: .82rem;
      color: #8ea2cf;
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font-weight: 600;
    }

    .pill {
      display: inline-block;
      font-size: .7rem;
      background: #20396b;
      color: #b8cbff;
      border-radius: 999px;
      padding: 4px 10px;
      margin-bottom: 2px;
      text-transform: uppercase;
      letter-spacing: .05em;
      font-weight: 700;
    }

    .empty {
      color: var(--muted);
      font-size: 0.92rem;
      margin: 0;
    }

    .evidence-details {
      margin-top: 4px;
      width: 100%;
      border: 1px dashed #2f497e;
      border-radius: 10px;
      padding: 7px 9px;
      background: rgba(17, 30, 54, 0.62);
    }

    .evidence-details summary {
      cursor: pointer;
      color: #9eb6e6;
      font-size: .78rem;
      font-weight: 700;
      letter-spacing: .03em;
      text-transform: uppercase;
      list-style: none;
    }

    .evidence-details summary::-webkit-details-marker {
      display: none;
    }

    .evidence-details[open] summary {
      margin-bottom: 8px;
    }

    .evidence-grid {
      display: grid;
      gap: 8px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .evidence-row {
      display: grid;
      grid-template-columns: minmax(96px, 160px) 1fr;
      gap: 8px;
      align-items: start;
      font-size: .8rem;
    }

    .evidence-row span {
      color: #96abda;
      text-transform: uppercase;
      letter-spacing: .05em;
      font-weight: 700;
      font-size: .66rem;
      padding-top: 3px;
    }

    .evidence-row strong {
      color: #d9e6ff;
      font-weight: 600;
      overflow-wrap: anywhere;
      display: block;
      min-width: 0;
    }

    .evidence-list {
      margin: 0;
      padding-left: 18px;
      display: grid;
      gap: 4px;
    }

    .evidence-empty {
      color: #89a0d3;
      font-style: italic;
      font-weight: 500;
    }

    .mini-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .mini-panel {
      border: 1px solid #2a3f6c;
      border-radius: 14px;
      padding: 12px;
      background: linear-gradient(180deg, #14213d, #101a31);
      box-shadow: 0 10px 24px rgba(4, 9, 22, .36);
    }

    .mini-title {
      margin: 0 0 8px;
      font-size: .75rem;
      text-transform: uppercase;
      letter-spacing: .09em;
      color: #9eb2df;
      font-weight: 800;
    }

    .trend-svg-wrap {
      display: grid;
      gap: 10px;
    }

    .trend-svg {
      width: 100%;
      height: auto;
      display: block;
    }

    .trend-chart-bg {
      fill: rgba(22, 36, 67, 0.36);
      stroke: rgba(79, 107, 169, 0.46);
      stroke-width: 1;
      rx: 8;
      ry: 8;
    }

    .trend-grid-line {
      stroke: rgba(128, 154, 214, 0.22);
      stroke-width: 1;
      stroke-dasharray: 4 5;
    }

    .trend-axis-label {
      fill: #87a0d4;
      font-size: 11px;
      font-weight: 600;
      text-anchor: end;
      font-family: "Sora", "Manrope", "IBM Plex Sans", "Avenir Next", "Segoe UI", sans-serif;
    }

    .trend-line {
      fill: none;
      stroke-width: 3;
      stroke-linecap: round;
      stroke-linejoin: round;
      filter: drop-shadow(0 6px 10px rgba(8, 15, 34, 0.38));
    }

    .trend-line-overall {
      stroke: #6ab4ff;
    }

    .trend-line-security {
      stroke: #32d8f0;
      stroke-dasharray: 8 6;
    }

    .trend-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      font-size: .83rem;
      color: #a9bceb;
      font-weight: 700;
    }

    .trend-dot {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 999px;
      margin-right: 7px;
      transform: translateY(1px);
    }

    .trend-dot-overall {
      background: #6ab4ff;
      box-shadow: 0 0 0 4px rgba(70, 128, 255, 0.18);
    }

    .trend-dot-security {
      background: #32d8f0;
      box-shadow: 0 0 0 4px rgba(50, 216, 240, 0.18);
    }

    .health-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
    }

    .health-card {
      border: 1px solid #2a3f6c;
      border-radius: 14px;
      padding: 14px;
      background: linear-gradient(180deg, #142241, #101b33);
      box-shadow: 0 12px 24px rgba(4, 9, 22, .34);
      display: grid;
      gap: 8px;
    }

    .health-card h3 {
      margin: 0;
      font-size: .8rem;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: #9bb0dd;
      font-weight: 800;
    }

    .health-card .metric {
      font-size: 1.78rem;
    }

    .health-meter {
      width: 100%;
      height: 8px;
      border-radius: 999px;
      background: #1a2c53;
      border: 1px solid #2c467b;
      overflow: hidden;
    }

    .health-meter span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #2f7ef9, #36d5ef);
    }

    .health-note {
      margin: 0;
      font-size: .82rem;
      color: #94a6d2;
    }

    .kpi-line {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      font-size: .86rem;
      padding: 6px 0;
      border-bottom: 1px dashed rgba(129, 150, 200, .35);
    }

    .kpi-line:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }

    .kpi-line strong {
      color: #d7e5ff;
      font-weight: 700;
    }

    .corr-grid {
      display: grid;
      gap: 10px;
    }

    .corr-item {
      border: 1px solid #2c426f;
      border-radius: 12px;
      padding: 10px 11px;
      background: #121f3b;
      display: grid;
      gap: 7px;
    }

    .corr-item h4 {
      margin: 0;
      font-size: .78rem;
      line-height: 1.35;
      color: #c3d5ff;
      font-weight: 700;
      letter-spacing: .02em;
    }

    .corr-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .corr-value {
      font-size: 1.1rem;
      font-weight: 800;
      color: #e6efff;
      letter-spacing: -.01em;
    }

    .corr-badge {
      border-radius: 999px;
      border: 1px solid #355696;
      background: #1a315d;
      color: #bfd5ff;
      font-size: .68rem;
      text-transform: uppercase;
      letter-spacing: .05em;
      font-weight: 800;
      padding: 4px 9px;
      white-space: nowrap;
    }

    .corr-badge.corr-inverse {
      border-color: rgba(50, 203, 142, .75);
      background: rgba(20, 93, 65, .72);
      color: #a3ffd6;
    }

    .corr-badge.corr-direct {
      border-color: rgba(232, 94, 94, .75);
      background: rgba(106, 34, 45, .72);
      color: #ffc0c0;
    }

    .corr-empty,
    .corr-sample {
      margin: 0;
      font-size: .76rem;
      color: #8ea3d1;
    }

    .kpi-line-danger strong {
      color: #ff9e9e;
    }

    .trend-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      border: 1px solid #314a7e;
      padding: 3px 9px;
      font-size: .72rem;
      text-transform: uppercase;
      letter-spacing: .06em;
      font-weight: 800;
      background: #162745;
      color: #c8d8ff;
      min-width: 96px;
    }

    .trend-pill.trend-improving {
      border-color: rgba(42, 188, 127, .7);
      background: rgba(24, 87, 62, .68);
      color: #9ef6cb;
    }

    .trend-pill.trend-stable {
      border-color: rgba(85, 132, 219, .72);
      background: rgba(24, 54, 104, .7);
      color: #b9d7ff;
    }

    .trend-pill.trend-degrading {
      border-color: rgba(226, 84, 84, .7);
      background: rgba(104, 31, 43, .68);
      color: #ffb3b3;
    }

    .panel-focus {
      border-color: #5f8ff1;
      box-shadow: 0 0 0 2px rgba(95, 143, 241, 0.34), var(--shadow-soft);
      transition: box-shadow .28s ease, border-color .28s ease;
    }

    @media (max-width: 1300px) {
      .score-grid-primary {
        grid-template-columns: repeat(8, minmax(0, 1fr));
      }

      .score-grid-secondary {
        grid-template-columns: repeat(8, minmax(0, 1fr));
      }

      .score-grid-secondary .kpi-card {
        grid-column: span 2;
      }
    }

    @media (max-width: 1080px) {
      .score-grid-primary {
        grid-template-columns: repeat(6, minmax(0, 1fr));
      }

      .score-grid-secondary {
        grid-template-columns: repeat(6, minmax(0, 1fr));
      }

      .score-grid-secondary .kpi-card {
        grid-column: span 2;
      }
    }

    @media (max-width: 980px) {
      .filters {
        grid-template-columns: 1fr 1fr;
      }

      .filters.filters-compact {
        grid-template-columns: 1fr;
      }

      .filter-counter {
        justify-self: start;
      }

      .metric {
        font-size: 1.84rem;
      }
    }

    @media (max-width: 760px) {
      .score-grid-primary,
      .score-grid-secondary {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .score-grid-primary .kpi-card,
      .score-grid-primary .kpi-card.scope-card,
      .score-grid-secondary .kpi-card {
        grid-column: span 1;
      }

      .mini-grid {
        grid-template-columns: 1fr;
      }

      .hero {
        padding: 22px;
      }
    }

    @media (max-width: 540px) {
      .score-grid-primary,
      .score-grid-secondary {
        grid-template-columns: 1fr;
      }

      .score-grid-primary .kpi-card,
      .score-grid-primary .kpi-card.scope-card,
      .score-grid-secondary .kpi-card {
        grid-column: span 1;
      }

      .evidence-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main class="wrapper">
    <section class="hero">
      <h1>${escapeHtml(copy.heroTitle)}</h1>
      <div class="meta">
        <span class="tag">${escapeHtml(copy.updatedLabel)}: ${escapeHtml(state.updatedAt || '-')}</span>
        <span class="tag">${escapeHtml(copy.patternLabel)}: ${escapeHtml(state.model?.dominantPattern || 'unknown')}</span>
        <span class="tag">${escapeHtml(copy.securityLabel)}: ${formatPercent(security.score || 0)}</span>
        <span class="tag">${escapeHtml(copy.violationsLabel)}: ${violations.length}</span>
        <span class="tag">${escapeHtml(copy.suggestionsLabel)}: ${suggestions.length}</span>
        <span class="tag">${escapeHtml(copy.decisionsLabel)}: ${decisions.length}</span>
        <label class="lang-switch">
          <span>${escapeHtml(copy.languageLabel)}</span>
          <select id="ace-lang-select" aria-label="${escapeHtml(copy.languageLabel)}">
            ${languageSelectOptions}
          </select>
        </label>
      </div>
    </section>

    <section class="panel">
      <h2 class="panel-title">${escapeHtml(copy.coreScorecards)}</h2>
      <section class="score-grid score-grid-primary">
        <article class="kpi-card is-clickable" title="${escapeHtml(scorecardHints.achCoverage)}" data-target-panel="trend-panel">
          <h3>${escapeHtml(copy.achCoverage)}</h3>
          <p class="metric">${formatPercent(coverage.overall)}</p>
        </article>
        <article class="kpi-card is-clickable" title="${escapeHtml(scorecardHints.trend)}" data-target-panel="trend-panel">
          <h3>${escapeHtml(copy.trend)}</h3>
          <p class="metric ${trend > 0 ? 'delta-positive' : trend < 0 ? 'delta-negative' : 'delta-neutral'}">${trendText}</p>
        </article>
        <article class="kpi-card is-clickable" title="${escapeHtml(scorecardHints.confidence)}" data-target-panel="trend-panel">
          <h3>${escapeHtml(copy.confidence)}</h3>
          <p class="metric">${formatPercent(coverage.confidence)}</p>
        </article>
        <article class="kpi-card is-clickable" title="${escapeHtml(scorecardHints.securityScore)}" data-target-panel="security-panel">
          <h3>${escapeHtml(copy.securityScore)}</h3>
          <p class="metric">${formatPercent(security.score || 0)}</p>
        </article>
        <article class="kpi-card is-clickable" title="${escapeHtml(scorecardHints.securityFails)}" data-target-panel="security-panel" data-security-status="fail">
          <h3>${escapeHtml(copy.securityFails)}</h3>
          <p class="metric">${Number(securityTotals.fail || 0)}</p>
        </article>
        <article class="kpi-card scope-card is-clickable" title="${escapeHtml(scorecardHints.scope)}" data-target-panel="violations-panel">
          <h3>${escapeHtml(copy.scope)}</h3>
          <p class="metric">${scopeValue}</p>
        </article>
        <article class="kpi-card is-clickable" title="${escapeHtml(scorecardHints.layering)}" data-target-panel="violations-panel" data-violations-query="direct model service layer fat-controller fat-service">
          <h3>${escapeHtml(copy.layering)}</h3>
          <p class="metric">${formatPercent(dimensions.layering)}</p>
        </article>
        <article class="kpi-card is-clickable" title="${escapeHtml(scorecardHints.validation)}" data-target-panel="violations-panel" data-violations-query="validation formrequest mass-assignment request->all">
          <h3>${escapeHtml(copy.validation)}</h3>
          <p class="metric">${formatPercent(dimensions.validation)}</p>
        </article>
        <article class="kpi-card is-clickable" title="${escapeHtml(scorecardHints.testability)}" data-target-panel="violations-panel" data-violations-query="test missing">
          <h3>${escapeHtml(copy.testability)}</h3>
          <p class="metric">${formatPercent(dimensions.testability)}</p>
        </article>
        <article class="kpi-card is-clickable" title="${escapeHtml(scorecardHints.consistency)}" data-target-panel="violations-panel" data-violations-query="pattern-drift inconsistency">
          <h3>${escapeHtml(copy.consistency)}</h3>
          <p class="metric">${formatPercent(dimensions.consistency)}</p>
        </article>
        <article class="kpi-card is-clickable" title="${escapeHtml(scorecardHints.authorization)}" data-target-panel="security-panel" data-security-category="authorization">
          <h3>${escapeHtml(copy.authorization)}</h3>
          <p class="metric">${formatPercent(dimensions.authorization)}</p>
        </article>
      </section>
      <section class="score-grid score-grid-secondary overview-gap">
        ${secondaryCardMarkup}
      </section>
    </section>

    <section class="panel" id="trend-panel">
      <h2 class="panel-title">${escapeHtml(copy.trendDiff)}</h2>
      <div class="mini-grid">
        <article class="mini-panel">
          <h3 class="mini-title">${escapeHtml(copy.trendHistoryTitle)}</h3>
          ${trendSvg}
        </article>
        <article class="mini-panel">
          <h3 class="mini-title">${escapeHtml(copy.lastCycle)}</h3>
          <div class="kpi-line"><span>${escapeHtml(copy.newInconsistencies)}</span><strong>${Number(state.lastScan?.newViolations || 0)}</strong></div>
          <div class="kpi-line"><span>${escapeHtml(copy.resolvedItems)}</span><strong>${Number(state.lastScan?.resolvedViolations || 0)}</strong></div>
          <div class="kpi-line"><span>${escapeHtml(copy.waivedItems)}</span><strong>${waivedViolations.length}</strong></div>
          <div class="kpi-line"><span>${escapeHtml(copy.cacheHits)}</span><strong>${Number(state.lastScan?.cacheHits || 0)}</strong></div>
          <div class="kpi-line"><span>${escapeHtml(copy.reanalyzedFiles)}</span><strong>${Number(state.lastScan?.analyzedFiles || 0)}</strong></div>
          <div class="kpi-line"><span>${escapeHtml(copy.ignoredByConfig)}</span><strong>${Number(state.lastScan?.ignoredFiles || 0)}</strong></div>
          <div class="kpi-line"><span>${escapeHtml(copy.testQuality)}</span><strong>${Math.round(Number(coverage.testQuality?.score || 0))}%</strong></div>
          <div class="kpi-line"><span>${escapeHtml(copy.trendStatus)}</span><strong><span class="trend-pill trend-${escapeHtml(trendStatus)}">${escapeHtml(trendStatusText)}</span></strong></div>
          <div class="kpi-line"><span>${escapeHtml(copy.trendWindowDelta)}</span><strong>${escapeHtml(trendWindowDeltaText)}</strong></div>
          <div class="kpi-line"><span>${escapeHtml(copy.trendAverageStep)}</span><strong>${escapeHtml(trendAverageStepText)}</strong></div>
          <div class="kpi-line"><span>${escapeHtml(copy.trendWindowSamples)}</span><strong>${trendSamples}</strong></div>
          <div class="kpi-line ${trendRegression.triggered ? 'kpi-line-danger' : ''}">
            <span>${escapeHtml(copy.regressionAlert)}</span>
            <strong>${escapeHtml(trendRegressionText)}</strong>
          </div>
        </article>
        <article class="mini-panel">
          <h3 class="mini-title">${escapeHtml(copy.trendCorrelationsTitle)}</h3>
          <div class="corr-grid">
            ${trendCorrelationRows}
          </div>
        </article>
      </div>
    </section>

    <section class="panel">
      <h2 class="panel-title">${escapeHtml(copy.domainHealthProfile)}</h2>
      <section class="health-grid">
        ${healthDomainCards}
      </section>
    </section>

    <section class="panel" id="security-panel">
      <h2 class="panel-title">${escapeHtml(copy.securityBaseline)}</h2>
      ${securityControls.length === 0
        ? `<p class="empty">${escapeHtml(copy.securityBaselineEmpty)}</p>`
        : `<div class="filters" id="security-filters">
          <label class="filter-field">
            <span>${escapeHtml(copy.status)}</span>
            <select id="security-status">
              <option value="">${escapeHtml(copy.allMasc)}</option>
              <option value="fail">${escapeHtml(copy.fail)}</option>
              <option value="warning">${escapeHtml(copy.warning)}</option>
              <option value="unknown">${escapeHtml(copy.unknown)}</option>
              <option value="pass">${escapeHtml(copy.pass)}</option>
            </select>
          </label>
          <label class="filter-field">
            <span>${escapeHtml(copy.mode)}</span>
            <select id="security-mode">
              <option value="">${escapeHtml(copy.allMasc)}</option>
              <option value="automated">${escapeHtml(copy.automated)}</option>
              <option value="semi">${escapeHtml(copy.semi)}</option>
              <option value="manual">${escapeHtml(copy.manual)}</option>
            </select>
          </label>
          <label class="filter-field">
            <span>${escapeHtml(copy.severity)}</span>
            <select id="security-severity">
              <option value="">${escapeHtml(copy.allFem)}</option>
              <option value="critical">${escapeHtml(copy.critical)}</option>
              <option value="high">${escapeHtml(copy.high)}</option>
              <option value="medium">${escapeHtml(copy.medium)}</option>
              <option value="low">${escapeHtml(copy.low)}</option>
            </select>
          </label>
          <label class="filter-field">
            <span>${escapeHtml(copy.category)}</span>
            <select id="security-category">
              <option value="">${escapeHtml(copy.allFem)}</option>
              ${securityCategoryOptions}
            </select>
          </label>
          <label class="filter-field">
            <span>${escapeHtml(copy.search)}</span>
            <input id="security-search" type="search" placeholder="${escapeHtml(copy.searchSecurityPlaceholder)}" />
          </label>
          <button type="button" class="btn-clear" id="security-clear">${escapeHtml(copy.clearFilters)}</button>
          <span class="filter-counter" id="security-counter"></span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>${escapeHtml(copy.status)}</th>
                <th>${escapeHtml(copy.mode)}</th>
                <th>${escapeHtml(copy.severity)}</th>
                <th>${escapeHtml(copy.category)}</th>
                <th>${escapeHtml(copy.control)}</th>
                <th>${escapeHtml(copy.diagnosis)}</th>
                <th>${escapeHtml(copy.recommendation)}</th>
              </tr>
            </thead>
            <tbody id="security-table-body">${filteredSecurityRows}</tbody>
          </table>
        </div>`}
    </section>

    <section class="panel" id="dependency-audits-panel">
      <h2 class="panel-title">${escapeHtml(copy.dependencyAuditsTitle)}</h2>
      ${dependencyAuditEngines.length === 0
        ? `<p class="empty">${escapeHtml(copy.dependencyAuditsEmpty)}</p>`
        : `<section class="score-grid score-grid-secondary">
          ${dependencyEngineCards}
          <article class="kpi-card">
            <h3>${escapeHtml(copy.dependencyVulnerabilities)}</h3>
            <p class="metric">${dependencyVulnerabilitySummary.total}</p>
          </article>
          <article class="kpi-card">
            <h3>${escapeHtml(copy.critical)}</h3>
            <p class="metric">${dependencyVulnerabilitySummary.critical}</p>
          </article>
          <article class="kpi-card">
            <h3>${escapeHtml(copy.high)}</h3>
            <p class="metric">${dependencyVulnerabilitySummary.high}</p>
          </article>
          <article class="kpi-card">
            <h3>${escapeHtml(copy.medium)}</h3>
            <p class="metric">${dependencyVulnerabilitySummary.medium}</p>
          </article>
        </section>`}
      ${dependencyVulnerabilities.length === 0
        ? `<p class="empty">${escapeHtml(copy.dependencyVulnerabilitiesEmpty)}</p>`
        : `<div class="filters filters-compact" id="dependency-filters">
          <label class="filter-field">
            <span>${escapeHtml(copy.severity)}</span>
            <select id="dependency-severity">
              <option value="">${escapeHtml(copy.allFem)}</option>
              <option value="critical">${escapeHtml(copy.critical)}</option>
              <option value="high">${escapeHtml(copy.high)}</option>
              <option value="medium">${escapeHtml(copy.medium)}</option>
              <option value="low">${escapeHtml(copy.low)}</option>
              <option value="unknown">${escapeHtml(copy.unknown)}</option>
            </select>
          </label>
          <label class="filter-field">
            <span>${escapeHtml(copy.dependencyEngine)}</span>
            <select id="dependency-ecosystem">
              <option value="">${escapeHtml(copy.allMasc)}</option>
              ${dependencyEcosystemOptions}
            </select>
          </label>
          <label class="filter-field">
            <span>${escapeHtml(copy.search)}</span>
            <input id="dependency-search" type="search" placeholder="${escapeHtml(copy.searchDependencyPlaceholder)}" />
          </label>
          <button type="button" class="btn-clear" id="dependency-clear">${escapeHtml(copy.clearFilters)}</button>
          <span class="filter-counter" id="dependency-counter"></span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>${escapeHtml(copy.severity)}</th>
                <th>${escapeHtml(copy.dependencyEngine)}</th>
                <th>${escapeHtml(copy.packageName)}</th>
                <th>${escapeHtml(copy.advisory)}</th>
                <th>${escapeHtml(copy.message)}</th>
                <th>${escapeHtml(copy.affectedVersions)}</th>
                <th>${escapeHtml(copy.fixVersion)}</th>
              </tr>
            </thead>
            <tbody id="dependency-table-body">${dependencyRows}</tbody>
          </table>
        </div>`}
    </section>

    <section class="panel" id="violations-panel">
      <h2 class="panel-title">${escapeHtml(copy.recentViolations)}</h2>
      <div class="panel-meta">
        <span>${escapeHtml(copy.actionabilitySummary)}: <strong>${Number(actionabilitySummary.total || violations.length)}</strong></span>
        <span>${escapeHtml(copy.actionabilityHighPriority)} (P1+P2): <strong>${Number(actionabilitySummary.highPriority || 0)}</strong></span>
        <span>${escapeHtml(copy.actionabilityAverage)}: <strong>${Number(actionabilitySummary.averageScore || 0)}</strong></span>
        <span>${escapeHtml(copy.actionabilityTop)}: <strong>${Number(actionabilitySummary.topScore || 0)}</strong></span>
        <span>P1: <strong>${Number(actionabilityDistribution.P1 || 0)}</strong></span>
        <span>P2: <strong>${Number(actionabilityDistribution.P2 || 0)}</strong></span>
        <span>P3: <strong>${Number(actionabilityDistribution.P3 || 0)}</strong></span>
      </div>
      ${violations.length === 0
        ? `<p class="empty">${escapeHtml(copy.recentViolationsEmpty)}</p>`
        : `<div class="filters filters-compact" id="violations-filters">
          <label class="filter-field">
            <span>${escapeHtml(copy.severity)}</span>
            <select id="violation-severity">
              <option value="">${escapeHtml(copy.allFem)}</option>
              <option value="high">${escapeHtml(copy.high)}</option>
              <option value="medium">${escapeHtml(copy.medium)}</option>
              <option value="low">${escapeHtml(copy.low)}</option>
            </select>
          </label>
          <label class="filter-field">
            <span>${escapeHtml(copy.priority)}</span>
            <select id="violation-priority">
              <option value="">${escapeHtml(copy.allPriorities || copy.allFem)}</option>
              <option value="p1">P1</option>
              <option value="p2">P2</option>
              <option value="p3">P3</option>
              <option value="p4">P4</option>
              <option value="p5">P5</option>
            </select>
          </label>
          <label class="filter-field">
            <span>${escapeHtml(copy.search)}</span>
            <input id="violation-search" type="search" placeholder="${escapeHtml(copy.searchViolationsPlaceholder)}" />
          </label>
          <button type="button" class="btn-clear" id="violation-clear">${escapeHtml(copy.clearFilters)}</button>
          <span class="filter-counter" id="violation-counter"></span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>${escapeHtml(copy.severity)}</th>
                <th>${escapeHtml(copy.actionability)}</th>
                <th>${escapeHtml(copy.type)}</th>
                <th>${escapeHtml(copy.file)}</th>
                <th>${escapeHtml(copy.message)}</th>
                <th>${escapeHtml(copy.suggestion)}</th>
              </tr>
            </thead>
            <tbody id="violations-table-body">${filteredViolationRows}</tbody>
          </table>
        </div>`}
    </section>

    <section class="panel">
      <h2 class="panel-title">${escapeHtml(copy.topHotspots)}</h2>
      <div class="panel-meta">
        <span>${escapeHtml(copy.filesWithViolations)}: <strong>${hotspotFilesCount}</strong></span>
        <span>${escapeHtml(copy.hotspotFiles)}: <strong>${hotspotWindow}</strong></span>
        <span>${escapeHtml(copy.hotspotConcentration)}: <strong>${hotspotConcentration}%</strong></span>
      </div>
      ${hotspots.length === 0
        ? `<p class="empty">${escapeHtml(copy.topHotspotsEmpty)}</p>`
        : `<div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>${escapeHtml(copy.file)}</th>
                <th>${escapeHtml(copy.total)}</th>
                <th>${escapeHtml(copy.high)}</th>
                <th>${escapeHtml(copy.medium)}</th>
                <th>${escapeHtml(copy.low)}</th>
              </tr>
            </thead>
            <tbody>${hotspotRows}</tbody>
          </table>
        </div>`}
    </section>

    <section class="panel">
      <h2 class="panel-title">${escapeHtml(copy.waivedViolationsTitle)}</h2>
      ${waivedViolations.length === 0
        ? `<p class="empty">${escapeHtml(copy.waivedViolationsEmpty)}</p>`
        : `<div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>${escapeHtml(copy.type)}</th>
                <th>${escapeHtml(copy.file)}</th>
                <th>${escapeHtml(copy.message)}</th>
                <th>${escapeHtml(copy.waiver)}</th>
              </tr>
            </thead>
            <tbody>
              ${waivedViolations
                .slice(0, 120)
                .map((item) => {
                  const translatedType = translateDynamicText(item.type, copy.code);
                  const translatedMessage = translateDynamicText(item.message || '-', copy.code);
                  return `
                <tr>
                  <td>${escapeHtml(translatedType)}</td>
                  <td><code>${escapeHtml(item.file)}:${Number(item.line || 1)}</code></td>
                  <td>${escapeHtml(translatedMessage)}</td>
                  <td><code>${escapeHtml(item.waivedBy?.id || '-')}</code></td>
                </tr>`;
                })
                .join('')}
            </tbody>
          </table>
        </div>`}
    </section>

    <section class="panel">
      <h2 class="panel-title">${escapeHtml(copy.quickWinsTitle)}</h2>
      ${quickWins.length === 0
        ? `<p class="empty">${escapeHtml(copy.quickWinsEmpty)}</p>`
        : `<div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>${escapeHtml(copy.rank)}</th>
                <th>${escapeHtml(copy.action)}</th>
                <th>${escapeHtml(copy.category)}</th>
                <th>${escapeHtml(copy.impact)}</th>
                <th>${escapeHtml(copy.effort)}</th>
                <th>${escapeHtml(copy.detail)}</th>
              </tr>
            </thead>
            <tbody>${quickWinRows}</tbody>
          </table>
        </div>`}
    </section>

    <section class="panel">
      <h2 class="panel-title">${escapeHtml(copy.proactiveSuggestions)}</h2>
      ${suggestions.length === 0
        ? `<p class="empty">${escapeHtml(copy.proactiveSuggestionsEmpty)}</p>`
        : `<div class="suggestions">${suggestionCards}</div>`}
    </section>

    <section class="panel">
      <h2 class="panel-title">${escapeHtml(copy.inferredPatterns)}</h2>
      ${Object.keys(patterns).length === 0
        ? `<p class="empty">${escapeHtml(copy.inferredPatternsEmpty)}</p>`
        : `<div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>${escapeHtml(copy.key)}</th>
                <th>${escapeHtml(copy.inferred)}</th>
                <th>${escapeHtml(copy.expected)}</th>
                <th>${escapeHtml(copy.source)}</th>
                <th>${escapeHtml(copy.confidence)}</th>
                <th>${escapeHtml(copy.adoption)}</th>
              </tr>
            </thead>
            <tbody>${patternRows}</tbody>
          </table>
        </div>`}
    </section>

    <section class="panel">
      <h2 class="panel-title">${escapeHtml(copy.driftWavesTitle)}</h2>
      ${patternDriftWaves.length === 0
        ? `<p class="empty">${escapeHtml(copy.driftWavesEmpty)}</p>`
        : `<div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>${escapeHtml(copy.key)}</th>
                <th>${escapeHtml(copy.total)}</th>
                <th>${escapeHtml(copy.expected)}</th>
                <th>${escapeHtml(copy.severity)}</th>
                <th>${escapeHtml(copy.evidenceFiles)}</th>
              </tr>
            </thead>
            <tbody>${driftWaveRows}</tbody>
          </table>
        </div>`}
    </section>

    <section class="panel">
      <h2 class="panel-title">${escapeHtml(copy.activeRules)}</h2>
      ${rules.length === 0
        ? `<p class="empty">${escapeHtml(copy.activeRulesEmpty)}</p>`
        : `<div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>${escapeHtml(copy.id)}</th>
                <th>${escapeHtml(copy.title)}</th>
                <th>${escapeHtml(copy.source)}</th>
                <th>${escapeHtml(copy.createdAt)}</th>
              </tr>
            </thead>
            <tbody>${ruleRows}</tbody>
          </table>
        </div>`}
    </section>

    <section class="panel">
      <h2 class="panel-title">${escapeHtml(copy.activeDecisions)}</h2>
      ${decisions.length === 0
        ? `<p class="empty">${escapeHtml(copy.activeDecisionsEmpty)}</p>`
        : `<div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>${escapeHtml(copy.id)}</th>
                <th>${escapeHtml(copy.key)}</th>
                <th>${escapeHtml(copy.preference)}</th>
                <th>${escapeHtml(copy.source)}</th>
                <th>${escapeHtml(copy.createdAt)}</th>
              </tr>
            </thead>
            <tbody>${decisionRows}</tbody>
          </table>
        </div>`}
    </section>
  </main>
  <script>
    (function () {
      const langFiles = ${JSON.stringify(languageFiles)};
      const currentLang = ${JSON.stringify(copy.code)};
      const visibleLabel = ${JSON.stringify(copy.visibleSuffix)};

      function asLower(value) {
        return String(value || '').toLowerCase().trim();
      }

      function setupSecurityFilters() {
        const tbody = document.getElementById('security-table-body');
        if (!tbody) return;

        const statusEl = document.getElementById('security-status');
        const modeEl = document.getElementById('security-mode');
        const severityEl = document.getElementById('security-severity');
        const categoryEl = document.getElementById('security-category');
        const searchEl = document.getElementById('security-search');
        const clearEl = document.getElementById('security-clear');
        const counterEl = document.getElementById('security-counter');
        const rows = Array.from(tbody.querySelectorAll('tr.security-main-row'));

        function render() {
          const status = asLower(statusEl.value);
          const mode = asLower(modeEl.value);
          const severity = asLower(severityEl.value);
          const category = asLower(categoryEl.value);
          const search = asLower(searchEl.value);
          let visible = 0;

          rows.forEach(function (row) {
            const okStatus = !status || row.dataset.status === status;
            const okMode = !mode || row.dataset.mode === mode;
            const okSeverity = !severity || row.dataset.severity === severity;
            const okCategory = !category || row.dataset.category === category;
            const okSearch = !search || (row.dataset.search || '').includes(search);
            const ok = okStatus && okMode && okSeverity && okCategory && okSearch;
            row.style.display = ok ? '' : 'none';
            const evidenceRow =
              row.nextElementSibling && row.nextElementSibling.classList.contains('security-evidence-row')
                ? row.nextElementSibling
                : null;
            if (evidenceRow) {
              evidenceRow.style.display = ok ? '' : 'none';
            }
            if (ok) visible += 1;
          });

          counterEl.textContent = visible + ' / ' + rows.length + ' ' + visibleLabel;
        }

        [statusEl, modeEl, severityEl, categoryEl].forEach(function (el) {
          el.addEventListener('change', render);
        });
        searchEl.addEventListener('input', render);
        clearEl.addEventListener('click', function () {
          statusEl.value = '';
          modeEl.value = '';
          severityEl.value = '';
          categoryEl.value = '';
          searchEl.value = '';
          render();
        });

        render();
      }

      function setupViolationFilters() {
        const tbody = document.getElementById('violations-table-body');
        if (!tbody) return;

        const severityEl = document.getElementById('violation-severity');
        const priorityEl = document.getElementById('violation-priority');
        const searchEl = document.getElementById('violation-search');
        const clearEl = document.getElementById('violation-clear');
        const counterEl = document.getElementById('violation-counter');
        const rows = Array.from(tbody.querySelectorAll('tr'));

        function render() {
          const severity = asLower(severityEl.value);
          const priority = asLower(priorityEl.value);
          const search = asLower(searchEl.value);
          let visible = 0;

          rows.forEach(function (row) {
            const okSeverity = !severity || row.dataset.severity === severity;
            const okPriority = !priority || row.dataset.priority === priority;
            const okSearch = !search || (row.dataset.search || '').includes(search);
            const ok = okSeverity && okPriority && okSearch;
            row.style.display = ok ? '' : 'none';
            if (ok) visible += 1;
          });

          counterEl.textContent = visible + ' / ' + rows.length + ' ' + visibleLabel;
        }

        severityEl.addEventListener('change', render);
        priorityEl.addEventListener('change', render);
        searchEl.addEventListener('input', render);
        clearEl.addEventListener('click', function () {
          severityEl.value = '';
          priorityEl.value = '';
          searchEl.value = '';
          render();
        });

        render();
      }

      function setupDependencyFilters() {
        const tbody = document.getElementById('dependency-table-body');
        if (!tbody) return;

        const severityEl = document.getElementById('dependency-severity');
        const ecosystemEl = document.getElementById('dependency-ecosystem');
        const searchEl = document.getElementById('dependency-search');
        const clearEl = document.getElementById('dependency-clear');
        const counterEl = document.getElementById('dependency-counter');
        const rows = Array.from(tbody.querySelectorAll('tr'));

        function render() {
          const severity = asLower(severityEl.value);
          const ecosystem = asLower(ecosystemEl.value);
          const search = asLower(searchEl.value);
          let visible = 0;

          rows.forEach(function (row) {
            const okSeverity = !severity || row.dataset.severity === severity;
            const okEcosystem = !ecosystem || row.dataset.ecosystem === ecosystem;
            const okSearch = !search || (row.dataset.search || '').includes(search);
            const ok = okSeverity && okEcosystem && okSearch;
            row.style.display = ok ? '' : 'none';
            if (ok) visible += 1;
          });

          counterEl.textContent = visible + ' / ' + rows.length + ' ' + visibleLabel;
        }

        severityEl.addEventListener('change', render);
        ecosystemEl.addEventListener('change', render);
        searchEl.addEventListener('input', render);
        clearEl.addEventListener('click', function () {
          severityEl.value = '';
          ecosystemEl.value = '';
          searchEl.value = '';
          render();
        });

        render();
      }

      function setupKpiInteractions() {
        const cards = Array.from(document.querySelectorAll('.kpi-card.is-clickable'));
        if (cards.length === 0) return;

        cards.forEach(function (card) {
          card.addEventListener('click', function () {
            const targetPanelId = card.dataset.targetPanel || '';
            const securityCategory = card.dataset.securityCategory || '';
            const securityStatus = card.dataset.securityStatus || '';
            const violationsQuery = card.dataset.violationsQuery || '';
            const auditEngine = card.dataset.auditEngine || '';

            if (securityCategory) {
              const el = document.getElementById('security-category');
              if (el) {
                el.value = securityCategory;
                el.dispatchEvent(new Event('change'));
              }
            }

            if (securityStatus) {
              const el = document.getElementById('security-status');
              if (el) {
                el.value = securityStatus;
                el.dispatchEvent(new Event('change'));
              }
            }

            if (violationsQuery) {
              const el = document.getElementById('violation-search');
              if (el) {
                el.value = violationsQuery;
                el.dispatchEvent(new Event('input'));
              }
            }

            if (auditEngine) {
              const el = document.getElementById('dependency-ecosystem');
              if (el) {
                el.value = auditEngine;
                el.dispatchEvent(new Event('change'));
              }
            }

            if (!targetPanelId) return;
            const panel = document.getElementById(targetPanelId);
            if (!panel) return;
            panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
            panel.classList.add('panel-focus');
            window.setTimeout(function () {
              panel.classList.remove('panel-focus');
            }, 1300);
          });
        });
      }

      function setupLanguageSelector() {
        const selector = document.getElementById('ace-lang-select');
        if (!selector) return;

        selector.value = currentLang;
        selector.addEventListener('change', function () {
          const nextLang = this.value;
          const nextFile = langFiles[nextLang];
          if (!nextFile) return;

          const target = new URL(nextFile, window.location.href);
          window.location.href = target.toString();
        });
      }

      setupSecurityFilters();
      setupViolationFilters();
      setupDependencyFilters();
      setupKpiInteractions();
      setupLanguageSelector();
    }());
  </script>
</body>
</html>`;
}

function resolveReportLocale(root, options = {}) {
  if (options.locale) {
    return normalizeReportLocale(options.locale);
  }

  const config = loadAceConfig(root);
  return normalizeReportLocale(config?.report?.language);
}

function resolveReportHistoryLimit(root) {
  const config = loadAceConfig(root);
  const candidate = Number(config?.report?.historyLimit || 24);
  if (Number.isNaN(candidate) || candidate <= 0) {
    return 24;
  }
  return candidate;
}

function writeReport(root, state, options = {}) {
  const outputPath = path.join(root, ACE_DIR, REPORT_FILE);
  const locale = resolveReportLocale(root, options);
  const languageFiles = REPORT_LANGUAGE_FILES;
  const historyLimit = resolveReportHistoryLimit(root);

  Object.entries(languageFiles).forEach(([lang, filename]) => {
    const localizedPath = path.join(root, ACE_DIR, filename);
    fs.writeFileSync(
      localizedPath,
      `${generateHtmlReport(state, {
        locale: lang,
        languageFiles,
        historyLimit,
      })}\n`,
      'utf8',
    );
  });

  fs.writeFileSync(
    outputPath,
    `${generateHtmlReport(state, {
      locale,
      languageFiles,
      historyLimit,
    })}\n`,
    'utf8',
  );
  return outputPath;
}

module.exports = {
  writeReport,
  generateHtmlReport,
  normalizeReportLocale,
};
