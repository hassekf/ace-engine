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
    topHotspots: 'Top Hotspots',
    topHotspotsEmpty: 'Sem hotspots no momento.',
    waivedViolationsTitle: 'Waived Violations',
    waivedViolationsEmpty: 'Nenhuma inconsistência está em waiver ativo.',
    quickWinsTitle: 'Quick Wins (Impacto Alto + Esforço Baixo)',
    quickWinsEmpty: 'Sem quick wins disponíveis no momento.',
    proactiveSuggestions: 'Sugestões Proativas',
    proactiveSuggestionsEmpty: 'Sem sugestões proativas nesta execução.',
    inferredPatterns: 'Padrões Inferidos e Esperados',
    inferredPatternsEmpty: 'Ainda sem padrões inferidos. Execute um scan com escopo relevante.',
    activeRules: 'Regras Ativas (Formalizadas)',
    activeRulesEmpty:
      'Nenhuma regra formalizada. Use MCP `ace.formalize_rule` ou CLI `ace rule:add`.',
    activeDecisions: 'Decisões Arquiteturais Ativas',
    activeDecisionsEmpty:
      'Sem decisões ativas. Registre decisões com MCP `ace.record_arch_decision` ou CLI `ace decision:add`.',
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
    type: 'Tipo',
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
    topHotspots: 'Top Hotspots',
    topHotspotsEmpty: 'No hotspots at the moment.',
    waivedViolationsTitle: 'Waived Violations',
    waivedViolationsEmpty: 'No inconsistencies are currently waived.',
    quickWinsTitle: 'Quick Wins (High Impact + Low Effort)',
    quickWinsEmpty: 'No quick wins available right now.',
    proactiveSuggestions: 'Proactive Suggestions',
    proactiveSuggestionsEmpty: 'No proactive suggestions in this run.',
    inferredPatterns: 'Inferred and Expected Patterns',
    inferredPatternsEmpty: 'No patterns inferred yet. Run a scan with a relevant scope.',
    activeRules: 'Active Rules (Formalized)',
    activeRulesEmpty:
      'No formalized rules yet. Use MCP `ace.formalize_rule` or CLI `ace rule:add`.',
    activeDecisions: 'Active Architectural Decisions',
    activeDecisionsEmpty:
      'No active decisions yet. Record decisions with MCP `ace.record_arch_decision` or CLI `ace decision:add`.',
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
    type: 'Type',
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

function translateDynamicText(value, localeCode) {
  const input = String(value || '');
  if (localeCode !== 'en-US' || !input) {
    return input;
  }

  const replacements = [
    [/Sem workflows CI detectados no escopo\./gi, 'No CI workflows detected in scope.'],
    [/Projeto sem package\.json no root\./gi, 'Project has no package.json at root.'],
    [/Sem composer\.json\/composer\.lock no root\./gi, 'No composer.json/composer.lock at root.'],
    [/composer audit sem vulnerabilidades reportadas\./gi, 'composer audit reported no vulnerabilities.'],
    [/npm audit sem vulnerabilidades reportadas\./gi, 'npm audit reported no vulnerabilities.'],
    [/composer audit reportou ([0-9]+) vulnerabilidade\(s\):/gi, 'composer audit reported $1 vulnerabilit(ies):'],
    [/npm audit reportou ([0-9]+) vulnerabilidade\(s\):/gi, 'npm audit reported $1 vulnerabilit(ies):'],
    [/audit não pôde ser avaliado/gi, 'audit could not be evaluated'],
    [/falha ao executar audit:/gi, 'failed to execute audit:'],
    [/timeout ao executar audit\./gi, 'timeout while running audit.'],
    [/audit retornou status ([0-9]+)\./gi, 'audit returned status $1.'],
    [/\(cache\)/gi, '(cache)'],
    [/Controle manual: requer evidência fora da análise estática local\./gi, 'Manual control: requires evidence outside local static analysis.'],
    [/Registrar evidência em docs\/CI e formalizar decisão no ACE para rastreabilidade\./gi, 'Record evidence in docs/CI and formalize the decision in ACE for traceability.'],
    [/Em produção, garantir APP_DEBUG=false e tratamento seguro de exceções\./gi, 'In production, ensure APP_DEBUG=false and safe exception handling.'],
    [/Sem menção a webhooks no escopo atual\./gi, 'No webhook mentions in the current scope.'],
    [/Sem sinais de N\+1 em loops no escopo atual\./gi, 'No N+1 signals in loops within the current scope.'],
    [/Sem sinal de writes críticos sem transação no escopo\./gi, 'No signal of critical writes without transactions in scope.'],
    [/Sem bypass explícito de CSRF detectado em rotas state-changing\./gi, 'No explicit CSRF bypass detected in state-changing routes.'],
    [/Sem sinais suficientes de policies\/gates para ações não-model\./gi, 'Insufficient policy/gate signals for non-model actions.'],
    [/Nenhum SQL raw dinâmico detectado\./gi, 'No dynamic raw SQL detected.'],
    [/Nenhum SQL raw detectado\./gi, 'No raw SQL detected.'],
    [/Nenhuma consulta `->get\(\)` sem limite explícito detectada\./gi, 'No `->get()` queries without explicit limit detected.'],
    [/Não foram detectados usos de \$request->all\(\)\./gi, 'No `$request->all()` usage detected.'],
    [/Não foram detectadas rotas de escrita sem throttling\./gi, 'No state-changing routes without throttling were detected.'],
    [/Nenhum arquivo routes\/\*\.php analisado neste ciclo\./gi, 'No routes/*.php files analyzed in this cycle.'],
    [/Sem controllers no escopo atual para medir adoção\./gi, 'No controllers in the current scope to measure adoption.'],
    [/Sem superfície crítica identificada no escopo atual\./gi, 'No critical surface identified in the current scope.'],
    [/Sem models detectados no escopo atual\./gi, 'No models detected in the current scope.'],
    [/Nenhum sink perigoso detectado no escopo\./gi, 'No dangerous sink detected in scope.'],
    [/Versão não identificada no lockfile\./gi, 'Version not identified in lockfile.'],
    [/não encontrado no lock\/composer\./gi, 'not found in lock/composer.'],
    [/Adoção consistente de FormRequest\/DTO/gi, 'Consistent FormRequest/DTO adoption'],
    [/Bloquear raw SQL dinâmico sem binding/gi, 'Block dynamic raw SQL without bindings'],
    [/Revisar pontos com SQL raw/gi, 'Review raw SQL points'],
    [/Evitar consultas `->get\(\)` sem limite\/paginação/gi, 'Avoid `->get()` queries without limit/pagination'],
    [/Revisar risco de N\+1 em acesso a relações/gi, 'Review N+1 risk in relation access'],
    [/Operações críticas com transação explícita/gi, 'Critical operations with explicit transactions'],
    [/Autorização server-side em superfícies críticas/gi, 'Server-side authorization on critical surfaces'],
    [/Cobertura Model ↔ Policy consistente/gi, 'Consistent Model ↔ Policy coverage'],
    [/Cobertura model↔policy:/gi, 'Model↔policy coverage:'],
    [/Cobertura de Gates para ações não-model/gi, 'Gate coverage for non-model actions'],
    [/Rotas de escrita com autenticação/gi, 'State-changing routes with authentication'],
    [/Revisar bypass de CSRF em rotas de escrita/gi, 'Review CSRF bypass in state-changing routes'],
    [/APP_DEBUG seguro para produção/gi, 'APP_DEBUG safe for production'],
    [/Livewire com propriedades públicas protegidas/gi, 'Livewire with protected public properties'],
    [/Filament Pages com autorização\/visibilidade explícita/gi, 'Filament Pages with explicit authorization/visibility'],
    [/Filament Widgets com autorização\/visibilidade explícita/gi, 'Filament Widgets with explicit authorization/visibility'],
    [/Upload com validação e restrições explícitas/gi, 'Upload with explicit validation and constraints'],
    [/Webhook com validação de assinatura/gi, 'Webhook with signature validation'],
    [/DAST em staging\/rotas críticas/gi, 'DAST in staging/critical routes'],
    [/Threat modeling de fluxos críticos/gi, 'Threat modeling for critical flows'],
    [/Revisão periódica de isolamento multi-tenant/gi, 'Periodic review of multi-tenant isolation'],
    [/Política de rotação de segredos ativa/gi, 'Active secret rotation policy'],
    [/Pentest\/review de segurança por release/gi, 'Security pentest/review per release'],
    [/Padronizar Controller -> Service/gi, 'Standardize Controller -> Service'],
    [/Aumentar uso de FormRequest\/DTO em escrita/gi, 'Increase FormRequest/DTO usage in writes'],
    [/Formalizar 1-2 decisões arquiteturais do padrão dominante/gi, 'Formalize 1-2 architectural decisions from the dominant pattern'],
    [/Evitar `Model::all\(\)` em serviços e comandos/gi, 'Avoid `Model::all()` in services and commands'],
    [/Revisar raw SQL com variáveis dinâmicas/gi, 'Review raw SQL with dynamic variables'],
    [/Reduzir consultas `->get\(\)` sem paginação\/limite/gi, 'Reduce `->get()` queries without pagination/limit'],
    [/Revisar potenciais N\+1 em loops com relações/gi, 'Review potential N+1 in loops with relations'],
    [/Aplicar unicidade\/idempotência em jobs críticos/gi, 'Apply uniqueness/idempotency in critical jobs'],
    [/Remover acesso direto a Model em middleware/gi, 'Remove direct Model access from middleware'],
    [/Evitar acesso direto a Model em Helpers/gi, 'Avoid direct Model access in Helpers'],
    [/Tornar Value Objects imutáveis/gi, 'Make Value Objects immutable'],
    [/Avaliar queue para Mailables de maior custo/gi, 'Evaluate queue usage for higher-cost Mailables'],
    [/Reduzir exposição de dados sensíveis em Mail\/Logs/gi, 'Reduce sensitive data exposure in Mail/Logs'],
    [/Padronizar contrato de Scopes com apply\(\)/gi, 'Standardize Scope contract with apply()'],
    [/Reforçar autenticação\/autorização em Websocket/gi, 'Strengthen authentication/authorization in Websocket'],
    [/Aplicar guardas de relação em API Resources/gi, 'Apply relation guards in API Resources'],
    [/Reduzir acoplamento e escopo de Traits/gi, 'Reduce coupling and scope of Traits'],
    [/Completar bindings de Contracts no container/gi, 'Complete Contract bindings in the container'],
    [/Enxugar Providers e reforçar bindings explícitos/gi, 'Slim down Providers and reinforce explicit bindings'],
    [/Reduzir lógica de domínio dentro de Events\/Observers/gi, 'Reduce domain logic inside Events/Observers'],
    [/Avaliar queue para Notifications de maior impacto/gi, 'Evaluate queue usage for higher-impact Notifications'],
    [/Revisar payload sensível em Notifications/gi, 'Review sensitive payload in Notifications'],
    [/Remover `\$request->all\(\)` em pontos críticos/gi, 'Remove `$request->all()` in critical points'],
    [/Fechar lacunas de testes em camadas de negócio/gi, 'Close test gaps in business layers'],
    [/Reduzir métodos longos em controllers/gi, 'Reduce long methods in controllers'],
    [/Job enfileirado sem `\$tries` explícito/gi, 'Queued job without explicit `$tries`'],
    [/Job enfileirado sem `\$timeout` explícito/gi, 'Queued job without explicit `$timeout`'],
    [/Job sem handler `failed\(\)` explícito/gi, 'Job without explicit `failed()` handler'],
    [/Defina `\$tries` de forma explícita no Job\./gi, 'Define `$tries` explicitly in the Job.'],
    [/Defina `\$timeout` coerente com o SLA da operação\./gi, 'Define `$timeout` aligned with the operation SLA.'],
    [/Considere implementar `failed\(Throwable \$e\)` para fallback\/alerta\./gi, 'Consider implementing `failed(Throwable $e)` for fallback/alerting.'],
    [/sem teste dedicado/gi, 'without dedicated test'],
    [/Adicionar teste unitário para/gi, 'Add unit test for'],
    [/Filament Page sem sinal explícito de controle de acesso/gi, 'Filament Page without explicit access control signal'],
    [/Trait extenso \(([0-9]+) linhas \/ ([0-9]+) métodos\)/gi, 'Large trait ($1 lines / $2 methods)'],
    [/Trait com acoplamento alto detectado \(([0-9]+) imports de App\\\\\*\)/gi, 'High-coupling trait detected ($1 App\\\\* imports)'],
    [/Trait com acesso direto a Model detectado/gi, 'Trait with direct Model access detected'],
    [/Contrato ([A-Za-z0-9_]+) sem bind\/singleton\/scoped detectado/gi, 'Contract $1 without bind/singleton/scoped detected'],
    [/Provider com ([0-9]+) linhas/gi, 'Provider with $1 lines'],
    [/Provider importa Contracts sem sinal de binding no container/gi, 'Provider imports Contracts without container binding signal'],
    [/Event com ([0-9]+) linhas/gi, 'Event with $1 lines'],
    [/Event com acesso direto a Model detectado/gi, 'Event with direct Model access detected'],
    [/Event com acesso direto a DB detectado/gi, 'Event with direct DB access detected'],
    [/Observer com ([0-9]+) linhas/gi, 'Observer with $1 lines'],
    [/Observer com acesso direto a Model detectado/gi, 'Observer with direct Model access detected'],
    [/Helper com ([0-9]+) linhas/gi, 'Helper with $1 lines'],
    [/Helper com acesso direto a Model detectado/gi, 'Helper with direct Model access detected'],
    [/Validator com ([0-9]+) linhas/gi, 'Validator with $1 lines'],
    [/Validator sem método de entrada esperado detectado/gi, 'Validator without expected entrypoint method detected'],
    [/Value Object com sinais de mutabilidade detectado/gi, 'Value Object with mutability signals detected'],
    [/Mailable sem `ShouldQueue` detectado/gi, 'Mailable without `ShouldQueue` detected'],
    [/Mailable com possível payload sensível detectado/gi, 'Mailable with possible sensitive payload detected'],
    [/Possível log de dado sensível detectado/gi, 'Potential sensitive data log detected'],
    [/Form component com ([0-9]+) linhas/gi, 'Form component with $1 lines'],
    [/Scope sem método `apply\(\)` detectado/gi, 'Scope without `apply()` method detected'],
    [/Componente websocket sem sinal claro de autenticação\/autorização/gi, 'Websocket component without clear authentication/authorization signal'],
    [/Notification sem `ShouldQueue` detectada/gi, 'Notification without `ShouldQueue` detected'],
    [/Notification com possível payload sensível detectado/gi, 'Notification with possible sensitive payload detected'],
    [/([0-9]+) acesso\(s\) de relação em Resource sem guardas explícitas/gi, '$1 relation access(es) in Resource without explicit guards'],
    [/Use `whenLoaded\(\)`\/`whenCounted\(\)` \(ou `relationLoaded`\) para relações opcionais em Resources\./gi, 'Use `whenLoaded()`/`whenCounted()` (or `relationLoaded`) for optional relations in Resources.'],
    [/Filament page extensa/gi, 'Large Filament page'],
    [/Extrair lógica para Services\/Actions e reduzir responsabilidade da Page\./gi, 'Extract logic to Services/Actions and reduce Page responsibility.'],
    [/Extrair passos para Services\/Actions reutilizáveis\./gi, 'Extract steps into reusable Services/Actions.'],
    [/consulta\(s\) com `->get\(\)` sem limite\/paginação detectada\(s\)/gi, 'query(ies) with `->get()` without limit/pagination detected'],
    [/Prefira paginação \(`paginate\/cursorPaginate`\) ou limite explícito para consultas potencialmente grandes\./gi, 'Prefer pagination (`paginate/cursorPaginate`) or explicit limits for potentially large queries.'],
    [/ponto\(s\) de SQL raw com variável dinâmica detectado\(s\)/gi, 'raw SQL point(s) with dynamic variables detected'],
    [/Substitua por bindings parametrizados ou Query Builder com whitelist\./gi, 'Replace with parameterized bindings or Query Builder with whitelist.'],
    [/Sinais de upload:/gi, 'Upload signals:'],
    [/validações explícitas/gi, 'explicit validations'],
    [/Aplique whitelist de MIME\/extensão\/tamanho e validation server-side\./gi, 'Apply MIME/extension/size whitelisting and server-side validation.'],
    [/Garanta policy para models críticos e registre mapeamento explícito quando fugir de convenção\./gi, 'Ensure policies for critical models and register explicit mapping when deviating from convention.'],
    [/Garanta authorize\/policies em ações críticas/gi, 'Ensure authorize/policies on critical actions'],
    [/arquivo\(s\) com escrita crítica sem sinal de `DB::transaction\(\)`\./gi, 'file(s) with critical writes without `DB::transaction()` signal.'],
    [/Encapsular fluxos financeiros\/criticos em transação e reforçar idempotência\./gi, 'Wrap financial/critical flows in transactions and reinforce idempotency.'],
    [/ocorrência\(s\) de \$request->all\(\) detectada\(s\)\./gi, 'occurrence(s) of `$request->all()` detected.'],
    [/Prefira \$request->validated\(\) \(FormRequest\) ou DTO com contrato explícito\./gi, 'Prefer `$request->validated()` (FormRequest) or DTO with explicit contract.'],
    [/Implemente `canView\(\)` e\/ou guardas server-side em widgets que exibem dados sensíveis\./gi, 'Implement `canView()` and/or server-side guards in widgets that expose sensitive data.'],
    [/Use #\[Locked\] para campos imutáveis e valide\/autorize todas mutações\./gi, 'Use #[Locked] for immutable fields and validate/authorize all mutations.'],
    [/Aplicar with\/load onde houver iteração de entidades com relações\./gi, 'Apply with/load where iterating entities with relations.'],
    [/ocorrência\(s\) de consulta potencialmente não limitada detectada\(s\)\./gi, 'occurrence(s) of potentially unbounded queries detected.'],
    [/Sem Gate::define explícito; políticas existentes cobrem parte da authorization\./gi, 'No explicit Gate::define; existing policies cover part of authorization.'],
    [/Para ações fora de CRUD de model, prefira Gate::define\/resource e checagem explícita no ponto de uso\./gi, 'For actions outside model CRUD, prefer Gate::define/resource and explicit checks at use sites.'],
    [/Adoção atual de FormRequest\/DTO:/gi, 'Current FormRequest/DTO adoption:'],
    [/Padronize validation de entrada para reduzir payload poisoning e inconsistência\./gi, 'Standardize input validation to reduce payload poisoning and inconsistency.'],
    [/Padronize `canAccess\(\)`\/authorize\/policy para cada Page sensível exposta no painel\./gi, 'Standardize `canAccess()`/authorize/policy for each sensitive Page exposed in the panel.'],
    [/Proteja APIs sensíveis com `auth:sanctum` e confirme `HasApiTokens` nos modelos emissores de token\./gi, 'Protect sensitive APIs with `auth:sanctum` and confirm `HasApiTokens` in token-issuing models.'],
    [/Confirme compensações fortes ao usar bypass de CSRF \(auth robusta, assinatura, nonce\)\./gi, 'Confirm strong compensating controls when using CSRF bypass (robust auth, signature, nonce).'],
    [/Configuração CORS explícita/gi, 'Explicit CORS configuration'],
    [/Configure CORS por origem\/método\/header estritamente necessários\./gi, 'Configure CORS with strictly required origin/method/header.'],
    [/Mover preparação of dados for camada of serviço e simplificar o Widget\./gi, 'Move data preparation to the service layer and simplify the Widget.'],
    [/Use paginação\/filtros e delegue consulta for Service\/UseCase\./gi, 'Use pagination/filters and delegate query logic to Service/UseCase.'],
    [/O ACE já consegue inferir padrões\. Converter decisões recorrentes in decisões persistentes reduz oscilactions da LLM entre features\./gi, 'ACE already infers patterns. Converting recurring decisions into persistent decisions reduces LLM oscillation between features.'],
    [/Paginação e filtros in the Service\/UseCase reduzem carga e risco of gargalos in listas crescentes\./gi, 'Pagination and filters in Service/UseCase reduce load and bottleneck risk in growing lists.'],
    [/Foram detectadas consultas with `->get\(\)` without limite explicit\. in listas grandes isso costuma degradar memória e tempo of resposta\./gi, 'Queries with `->get()` without explicit limits were detected. In large lists, this usually degrades memory and response time.'],
    [/Jobs with lacunas of resiliência detectados \(tries ausente: ([0-9]+), timeout ausente: ([0-9]+)\)\./gi, 'Jobs with resilience gaps detected (missing tries: $1, missing timeout: $2).'],
    [/Foram detectadas leituras totais outside of controllers\. in jobs\/commands\/services isso costuma escalar mal in memória e tempo\./gi, 'Total reads outside controllers were detected. In jobs/commands/services this usually scales poorly in memory and time.'],
    [/Há uso of DB::raw\/selectRaw\/whereRaw with interpolação dynamic\. Priorize bindings e Query Builder for reduzir risco\./gi, 'DB::raw/selectRaw/whereRaw usage with dynamic interpolation was detected. Prioritize bindings and Query Builder to reduce risk.'],
    [/Há signals of acesso a relactions dentro of loop without eager loading claro\. Isso pode multiplicar queries in production\./gi, 'There are signals of relation access inside loops without clear eager loading. This can multiply queries in production.'],
    [/flows with palavras-chave financeiras e escrita without transaction foram detectados\. Isso aumenta risco of inconsistency in concorrência\/falhas parciais\./gi, 'Flows with financial keywords and writes without transactions were detected. This increases inconsistency risk under concurrency/partial failures.'],
    [/Foram detectados jobs with contexto financial\/estado critical without sinal of unicidade\. Isso eleva risco of execução duplicada\./gi, 'Jobs with financial/critical context without uniqueness signals were detected. This increases duplicated execution risk.'],
    [/Há middleware with consulta direta a Model, o que aumenta acoplamento e dificulta evolução do pipeline HTTP\./gi, 'There is middleware with direct Model access, which increases coupling and hinders HTTP pipeline evolution.'],
    [/Foram detectados ([0-9]+) acesso\(s\) de relação sem `whenLoaded\/relationLoaded` em Resources\. Isso pode induzir lazy loading e N\+1\./gi, '$1 relation access(es) without `whenLoaded/relationLoaded` were detected in Resources. This can induce lazy loading and N+1.'],
    [/Há sinais de traits grandes\/acoplados e\/ou com acesso direto a Model\. Centralize regra de negócio em Services\/UseCases e mantenha traits focados em composição leve\./gi, 'There are signals of large/coupled traits and/or direct Model access. Centralize business logic in Services/UseCases and keep traits focused on lightweight composition.'],
    [/Foram detectados ([0-9]+) contratos sem bind\/singleton\/scoped explícito em providers\./gi, '$1 contracts without explicit bind/singleton/scoped were detected in providers.'],
    [/Há helpers com acesso direto a Model\. Isso aumenta acoplamento global e dificulta teste\/manutenção de fluxo de negócio\./gi, 'There are helpers with direct Model access. This increases global coupling and makes business-flow testing/maintenance harder.'],
    [/Foram detectados Value Objects com sinais de mutabilidade\. Padronize `readonly`\/construtor\/factory para previsibilidade e segurança de estado\./gi, 'Value Objects with mutability signals were detected. Standardize `readonly`/constructor/factory for state predictability and safety.'],
    [/Mailables sem ShouldQueue foram detectados\. Em cenários de volume, envio síncrono aumenta latência e risco de timeout\./gi, 'Mailables without ShouldQueue were detected. In high-volume scenarios, synchronous delivery increases latency and timeout risk.'],
    [/Há sinais de dados sensíveis em mailables\/logging\. Minimize payload, aplique masking e evite persistir secrets\/tokens em canais observáveis\./gi, 'There are signs of sensitive data in mailables/logging. Minimize payload, apply masking, and avoid persisting secrets/tokens in observable channels.'],
    [/Foram detectados arquivos de scope sem método apply\(\) explícito\. Padronizar o contrato melhora previsibilidade de filtros globais\/locais\./gi, 'Scope files without explicit apply() were detected. Standardizing the contract improves predictability of global/local filters.'],
    [/Há componentes websocket sem sinais claros de authz\/authn\. Valide handshake, escopo de canal e autorização server-side\./gi, 'Websocket components without clear authz/authn signals were detected. Validate handshake, channel scope, and server-side authorization.'],
    [/Há sinais de providers extensos e\/ou imports de contracts sem binding explícito\. Consolidar DI e reduzir responsabilidade dos providers melhora previsibilidade do container\./gi, 'There are signals of large providers and/or contract imports without explicit binding. Consolidating DI and reducing provider responsibility improves container predictability.'],
    [/Foram detectados eventos\/observers com sinais de acesso a Model\/DB ou excesso de lógica\. Mantenha events como contrato de dados e observers com orquestração mínima\./gi, 'Events/observers were detected with Model/DB access signals or excessive logic. Keep events as data contracts and observers with minimal orchestration.'],
    [/Notifications sem ShouldQueue foram detectadas\. Em fluxos de alto volume\/custo, o envio síncrono aumenta latência e risco de timeout\./gi, 'Notifications without ShouldQueue were detected. In high-volume/cost flows, synchronous delivery increases latency and timeout risk.'],
    [/Há sinais de payload sensível \(token\/secret\/password\/code\) em notifications\. Reduza exposição e use tokens curtos, expiração e masking\./gi, 'There are signals of sensitive payload (token/secret/password/code) in notifications. Reduce exposure and use short-lived tokens, expiration, and masking.'],
    [/Há serviços\/controllers without testes detectados\. Priorize hotspots with mais alteractions e maior impacto\./gi, 'Services/controllers without tests were detected. Prioritize hotspots with more changes and higher impact.'],
    [/Quebrar comandos larges in steps reutilizáveis/gi, 'Break large commands into reusable steps'],
    [/Commands longos dificultam manutenção operationale\. Extrair passos for services\/actions melhora testabilidade e reuso\./gi, 'Long commands hurt operational maintainability. Extracting steps to services/actions improves testability and reuse.'],
    [/Resources grandes tendem a misturar regra of negócio with configuration of UI\. Mover regra for Services\/Policies melhora evolução\./gi, 'Large resources tend to mix business rules with UI configuration. Moving rules to Services/Policies improves evolution.'],
    [/Priorizar resolução of violactions of alto impacto/gi, 'Prioritize resolving high-impact violations'],
    [/Existem múltiplas violactions of severidade alta\. consider uma sprint curta of estabilização arquitetural\./gi, 'There are multiple high-severity violations. Consider a short architectural stabilization sprint.'],
    [/Mover preparação of dados for camada of serviço e simplificar o Widget\./gi, 'Move data preparation to the service layer and simplify the Widget.'],
    [/Use paginação\/filtros e delegue consulta for Service\/UseCase\./gi, 'Use pagination/filters and delegate query logic to Service/UseCase.'],
    [/O ACE já consegue inferir padrões\. Converter decisões recorrentes in decisões persistentes reduz oscilactions da LLM entre features\./gi, 'ACE already infers patterns. Converting recurring decisions into persistent decisions reduces LLM oscillation between features.'],
    [/Paginação e filtros in the Service\/UseCase reduzem carga e risco of gargalos in listas crescentes\./gi, 'Pagination and filters in Service/UseCase reduce load and bottleneck risk in growing lists.'],
    [/Foram detectadas consultas with `-&gt;get\(\)` without limite explicit\. in listas grandes isso costuma degradar memória e tempo of resposta\./gi, 'Queries with `->get()` without explicit limits were detected. In large lists, this usually degrades memory and response time.'],
    [/Jobs with lacunas of resiliência detectados \(tries ausente: ([0-9]+), timeout ausente: ([0-9]+)\)\./gi, 'Jobs with resilience gaps detected (missing tries: $1, missing timeout: $2).'],
    [/Foram detectadas leituras totais outside of controllers\. in jobs\/commands\/services isso costuma escalar mal in memória e tempo\./gi, 'Total reads outside controllers were detected. In jobs/commands/services this usually scales poorly in memory and time.'],
    [/Há uso of DB::raw\/selectRaw\/whereRaw with interpolação dynamic\. Priorize bindings e Query Builder for reduzir risco\./gi, 'DB::raw/selectRaw/whereRaw usage with dynamic interpolation was detected. Prioritize bindings and Query Builder to reduce risk.'],
    [/Há signals of acesso a relactions dentro of loop without eager loading claro\. Isso pode multiplicar queries in production\./gi, 'There are signals of relation access inside loops without clear eager loading. This can multiply queries in production.'],
    [/flows with palavras-chave financeiras e escrita without transaction foram detectados\. Isso aumenta risco of inconsistency in concorrência\/falhas parciais\./gi, 'Flows with financial keywords and writes without transactions were detected. This increases inconsistency risk under concurrency/partial failures.'],
    [/Foram detectados jobs with contexto financial\/estado critical without sinal of unicidade\. Isso eleva risco of execução duplicada\./gi, 'Jobs with financial/critical context without uniqueness signals were detected. This increases duplicated execution risk.'],
    [/Há middleware with consulta direta a Model, o que aumenta acoplamento e dificulta evolução do pipeline HTTP\./gi, 'There is middleware with direct Model access, which increases coupling and hinders HTTP pipeline evolution.'],
    [/Há serviços\/controllers without testes detectados\. Priorize hotspots with mais alteractions e maior impacto\./gi, 'Services/controllers without tests were detected. Prioritize hotspots with more changes and higher impact.'],
    [/Quebrar comandos larges in steps reutilizáveis/gi, 'Break large commands into reusable steps'],
    [/Commands longos dificultam manutenção operationale\. Extrair passos for services\/actions melhora testabilidade e reuso\./gi, 'Long commands hurt operational maintainability. Extracting steps to services/actions improves testability and reuse.'],
    [/Resources grandes tendem a misturar regra of negócio with configuration of UI\. Mover regra for Services\/Policies melhora evolução\./gi, 'Large resources tend to mix business rules with UI configuration. Moving rules to Services/Policies improves evolution.'],
    [/Priorizar resolução of violactions of alto impacto/gi, 'Prioritize resolving high-impact violations'],
    [/Existem múltiplas violactions of severidade alta\. consider uma sprint curta of estabilização arquitetural\./gi, 'There are multiple high-severity violations. Consider a short architectural stabilization sprint.'],
    [/O ACE já consegue inferir padrões\. Converter decisões recorrentes in decisões persistentes reduz oscilactions da LLM entre features\./gi, 'ACE already infers patterns. Converting recurring decisions into persistent decisions reduces LLM oscillation between features.'],
    [/Paginação e filtros in the Service\/UseCase reduzem carga e risco of gargalos in listas crescentes\./gi, 'Pagination and filters in Service/UseCase reduce load and bottleneck risk in growing lists.'],
    [/Foram detectadas consultas with `->get\(\)` without limite explicit\. in listas grandes isso costuma degradar memória e tempo of resposta\./gi, 'Queries with `->get()` without explicit limits were detected. In large lists, this usually degrades memory and response time.'],
    [/Foram detectadas leituras totais outside of controllers\. in jobs\/commands\/services isso costuma escalar mal in memória e tempo\./gi, 'Total reads outside controllers were detected. In jobs/commands/services this usually scales poorly in memory and time.'],
    [/Há uso of DB::raw\/selectRaw\/whereRaw with interpolação dynamic\. Priorize bindings e Query Builder for reduzir risco\./gi, 'DB::raw/selectRaw/whereRaw usage with dynamic interpolation was detected. Prioritize bindings and Query Builder to reduce risk.'],
    [/Há signals of acesso a relactions dentro of loop without eager loading claro\. Isso pode multiplicar queries in production\./gi, 'There are signals of relation access inside loops without clear eager loading. This can multiply queries in production.'],
    [/flows with palavras-chave financeiras e escrita without transaction foram detectados\. Isso aumenta risco of inconsistency in concorrência\/falhas parciais\./gi, 'Flows with financial keywords and writes without transactions were detected. This increases inconsistency risk under concurrency/partial failures.'],
    [/Jobs with lacunas of resiliência detectados \(tries ausente: ([0-9]+), timeout ausente: ([0-9]+)\)\./gi, 'Jobs with resilience gaps detected (missing tries: $1, missing timeout: $2).'],
    [/Foram detectados jobs with contexto financial\/estado critical without sinal of unicidade\. Isso eleva risco of execução duplicada\./gi, 'Jobs with financial/critical context without uniqueness signals were detected. This increases duplicated execution risk.'],
    [/Há middleware with consulta direta a Model, o que aumenta acoplamento e dificulta evolução do pipeline HTTP\./gi, 'There is middleware with direct Model access, which increases coupling and hinders HTTP pipeline evolution.'],
    [/Há serviços\/controllers without testes detectados\. Priorize hotspots with mais alteractions e maior impacto\./gi, 'Services/controllers without tests were detected. Prioritize hotspots with more changes and higher impact.'],
    [/Quebrar comandos larges in steps reutilizáveis/gi, 'Break large commands into reusable steps'],
    [/Commands longos dificultam manutenção operationale\. Extrair passos for services\/actions melhora testabilidade e reuso\./gi, 'Long commands hurt operational maintainability. Extracting steps to services/actions improves testability and reuse.'],
    [/Resources grandes tendem a misturar regra of negócio with configuration of UI\. Mover regra for Services\/Policies melhora evolução\./gi, 'Large resources tend to mix business rules with UI configuration. Moving rules to Services/Policies improves evolution.'],
    [/Priorizar resolução of violactions of alto impacto/gi, 'Prioritize resolving high-impact violations'],
    [/Existem múltiplas violactions of severidade alta\. consider uma sprint curta of estabilização arquitetural\./gi, 'There are multiple high-severity violations. Consider a short architectural stabilization sprint.'],
    [/Extrair regras for Services\/Policies e simplificar configuração da Resource\./gi, 'Extract rules to Services/Policies and simplify Resource configuration.'],
    [/Extrair regras para Services\/Policies e simplificar configuração da Resource\./gi, 'Extract rules to Services/Policies and simplify Resource configuration.'],
    [/signals of authorization server-side por superfície:/gi, 'server-side authorization signals per surface:'],
    [/com signals dynamic exigindo revisão manual\./gi, 'with dynamic signals requiring manual review.'],
    [/uso\(s\) of SQL raw exigem revisão contextual/gi, 'raw SQL usage(s) require contextual review'],
    [/ou Query Builder without concatenação dynamic\./gi, 'or Query Builder without dynamic concatenation.'],
    [/prefer bindings \(`\\?` \+ array\) ou Query Builder without concatenação dynamic\./gi, 'Prefer bindings (`?` + array) or Query Builder without dynamic concatenation.'],
    [/without Gate::define explicit; políticas existentes cover parte da authorization\./gi, 'Without explicit Gate::define; existing policies cover part of authorization.'],
    [/for cada sql raw, valide bind seguro, limites e make explicit rationale of performance\./gi, 'For each raw SQL usage, validate safe binding, limits, and make performance rationale explicit.'],
    [/potencialmente/gi, 'potentially'],
    [/inseguro/gi, 'unsafe'],
    [/concatena[cç][aã]o/gi, 'concatenation'],
    [/configura[cç][aã]o/gi, 'configuration'],
    [/regras/gi, 'rules'],
    [/exigem/gi, 'require'],
    [/revis[aã]o/gi, 'review'],
    [/contextual/gi, 'contextual'],
    [/pol[íi]ticas/gi, 'policies'],
    [/parte da/gi, 'part of the'],
    [/por superf[íi]cie/gi, 'per surface'],
    [/\bou\b/gi, 'or'],
    [/\bcada\b/gi, 'each'],
    [/valide/gi, 'validate'],
    [/versão/gi, 'version'],
    [/acima do floor de security conhecido/gi, 'above the known security floor'],
    [/atende floor/gi, 'meets floor'],
    [/evitar/gi, 'avoid'],
    [/revisar/gi, 'review'],
    [/adicionar/gi, 'add'],
    [/aplicar/gi, 'apply'],
    [/prefira/gi, 'prefer'],
    [/garanta/gi, 'ensure'],
    [/considere/gi, 'consider'],
    [/defina/gi, 'define'],
    [/padronize/gi, 'standardize'],
    [/produ[cç][aã]o/gi, 'production'],
    [/seguran[cç]a/gi, 'security'],
    [/autoriza[cç][aã]o/gi, 'authorization'],
    [/valida[cç][aã]o/gi, 'validation'],
    [/recomend[aã][cç][aã]o/gi, 'recommendation'],
    [/detectado\(s\)/gi, 'detected'],
    [/detectada\(s\)/gi, 'detected'],
    [/arquivo\(s\)/gi, 'file(s)'],
    [/ocorr[êe]ncia\(s\)/gi, 'occurrence(s)'],
    [/chamada\(s\)/gi, 'call(s)'],
    [/consulta\(s\)/gi, 'query(ies)'],
    [/expl[íi]cito/gi, 'explicit'],
    [/a[çc][õo]es/gi, 'actions'],
    [/pain[ée]is/gi, 'panels'],
    [/cr[íi]tic[oa]s?/gi, 'critical'],
    [/sinais?/gi, 'signals'],
    [/rela[cç][aã]o/gi, 'relation'],
    [/rela[cç][õo]es/gi, 'relations'],
    [/itera[cç][aã]o/gi, 'iteration'],
    [/itera[cç][õo]es/gi, 'iterations'],
    [/entrada/gi, 'input'],
    [/inconsist[êe]ncia/gi, 'inconsistency'],
    [/inconsist[êe]ncias/gi, 'inconsistencies'],
    [/r[íi]gida/gi, 'strict'],
    [/isolamento/gi, 'isolation'],
    [/direto/gi, 'direct'],
    [/fluxos/gi, 'flows'],
    [/financeiros?/gi, 'financial'],
    [/transa[cç][aã]o/gi, 'transaction'],
    [/idempot[êe]ncia/gi, 'idempotency'],
    [/din[âa]mic[oa]s?/gi, 'dynamic'],
    [/explicite/gi, 'make explicit'],
    [/racional/gi, 'rationale'],
    [/cobrem/gi, 'cover'],
    [/fora de/gi, 'outside of'],
    [/ponto de uso/gi, 'point of use'],
    [/mantenha/gi, 'keep'],
    [/atualizado/gi, 'updated'],
    [/corrigir/gi, 'fix'],
    [/inseguros/gi, 'unsafe'],
    [/compensa[cç][õo]es?/gi, 'compensating controls'],
    [/robusta/gi, 'robust'],
    [/assinatura/gi, 'signature'],
    [/origem/gi, 'origin'],
    [/m[eé]todo/gi, 'method'],
    [/estritamente/gi, 'strictly'],
    [/necess[áa]rios/gi, 'required'],
    [/extens[ãa]o/gi, 'extension'],
    [/tamanho/gi, 'size'],
    [/campos/gi, 'fields'],
    [/imut[áa]veis/gi, 'immutable'],
    [/muta[cç][õo]es?/gi, 'mutations'],
    [/responsabilidade/gi, 'responsibility'],
    [/extenso/gi, 'large'],
    [/linhas/gi, 'lines'],
    [/m[eé]todos/gi, 'methods'],
    [/\bem\b/gi, 'in'],
    [/\bpara\b/gi, 'for'],
    [/\bcom\b/gi, 'with'],
    [/\bsem\b/gi, 'without'],
    [/\bde\b/gi, 'of'],
    [/\bno\b/gi, 'in the'],
    [/\bna\b/gi, 'in the'],
    [/\bprodução\b/gi, 'production'],
    [/\bsegurança\b/gi, 'security'],
    [/\bautorização\b/gi, 'authorization'],
    [/\bvalidação\b/gi, 'validation'],
    [/\brecomendação\b/gi, 'recommendation'],
    [/\bdetectado\(s\)\b/gi, 'detected'],
    [/\bdetectada\(s\)\b/gi, 'detected'],
  ];

  let output = input;
  for (let i = 0; i < 3; i += 1) {
    const next = replacements.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), output);
    if (next === output) {
      break;
    }
    output = next;
  }
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
  const waivedViolations = state.waivedViolations || [];
  const suggestions = state.suggestions || [];
  const rules = state.rules || [];
  const decisions = state.decisions || [];
  const patterns = state.model?.patterns || {};
  const security = state.security || {};
  const securityTotals = security.totals || {};
  const securityModeSummary = security.modeSummary || {};
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
    securityScore: `${copy.securityFails}: ${Number(securityTotals.fail || 0)} · ${copy.warning}: ${Number(securityTotals.warning || 0)} · ${copy.pass}: ${Number(securityTotals.pass || 0)}`,
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

  const filteredViolationRows = violations
    .slice(0, 200)
    .map((item) => {
      const translatedType = translateDynamicText(item.type, copy.code);
      const translatedMessage = translateDynamicText(item.message, copy.code);
      const translatedSuggestion = translateDynamicText(item.suggestion || '-', copy.code);
      const severity = String(item.severity || 'low').toLowerCase();
      const search = `${translatedType || ''} ${item.file || ''} ${translatedMessage || ''} ${translatedSuggestion || ''}`.toLowerCase();
      return `
      <tr data-severity="${escapeHtml(severity)}" data-search="${escapeHtml(search)}">
        <td><span class="${severityBadge(item.severity)}">${escapeHtml(item.severity)}</span></td>
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
      grid-template-columns: minmax(140px, 200px) minmax(220px, 1fr) auto auto;
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
        const searchEl = document.getElementById('violation-search');
        const clearEl = document.getElementById('violation-clear');
        const counterEl = document.getElementById('violation-counter');
        const rows = Array.from(tbody.querySelectorAll('tr'));

        function render() {
          const severity = asLower(severityEl.value);
          const search = asLower(searchEl.value);
          let visible = 0;

          rows.forEach(function (row) {
            const okSeverity = !severity || row.dataset.severity === severity;
            const okSearch = !search || (row.dataset.search || '').includes(search);
            const ok = okSeverity && okSearch;
            row.style.display = ok ? '' : 'none';
            if (ok) visible += 1;
          });

          counterEl.textContent = visible + ' / ' + rows.length + ' ' + visibleLabel;
        }

        severityEl.addEventListener('change', render);
        searchEl.addEventListener('input', render);
        clearEl.addEventListener('click', function () {
          severityEl.value = '';
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
