const { slugify } = require('./helpers');

function createSuggestion({ category, title, details, impact, effort }) {
  return {
    id: slugify(`${category}:${title}`),
    category,
    title,
    details,
    impact,
    effort,
    status: 'open',
  };
}

function dedupeSuggestions(items) {
  const map = new Map();
  items.forEach((item) => {
    map.set(item.id, item);
  });
  return Array.from(map.values());
}

function impactFromSeverity(severity) {
  if (severity === 'critical' || severity === 'high') {
    return 'high';
  }
  if (severity === 'medium') {
    return 'medium';
  }
  return 'low';
}

function effortFromMode(mode) {
  if (mode === 'manual') {
    return 'medium';
  }
  if (mode === 'semi') {
    return 'medium';
  }
  return 'low';
}

function buildSuggestions({ metrics, coverage, model, violations, security = null }) {
  const suggestions = [];
  const dataAccess = model.patterns?.['controller.data_access'];
  const validationPattern = model.patterns?.['controller.validation'];
  const structurePattern = model.patterns?.['controller.structure'];
  const decisions = Number(model.decisionCount || 0);

  if (metrics.directModelCalls > 0 && dataAccess?.expected === 'service-layer') {
    suggestions.push(
      createSuggestion({
        category: 'architecture',
        title: 'Padronizar Controller -> Service',
        details:
          'O modelo atual indica Service Layer, mas ainda existem controllers acessando Model diretamente. Se esse padrão for definitivo, registre uma decisão arquitetural para reduzir drift.',
        impact: 'high',
        effort: 'medium',
      }),
    );
  }

  if (metrics.controllers > 0 && validationPattern?.expected === 'form-request' && metrics.controllersUsingFormRequest < metrics.controllers) {
    suggestions.push(
      createSuggestion({
        category: 'clean-code',
        title: 'Aumentar uso de FormRequest/DTO em escrita',
        details:
          'Há fluxos sem validação explícita por FormRequest. Isso tende a criar contratos instáveis e payloads pouco previsíveis.',
        impact: 'medium',
        effort: 'low',
      }),
    );
  }

  if (decisions === 0 && coverage.confidence >= 40) {
    suggestions.push(
      createSuggestion({
        category: 'governance',
        title: 'Formalizar 1-2 decisões arquiteturais do padrão dominante',
        details:
          'O ACE já consegue inferir padrões. Converter decisões recorrentes em decisões persistentes reduz oscilações da LLM entre features.',
        impact: 'high',
        effort: 'low',
      }),
    );
  }

  if (metrics.modelAllCallsInController > 0) {
    suggestions.push(
      createSuggestion({
        category: 'performance',
        title: 'Evitar consultas `Model::all()` em controllers',
        details:
          'Paginação e filtros no Service/UseCase reduzem carga e risco de gargalos em listas crescentes.',
        impact: 'high',
        effort: 'low',
      }),
    );
  }

  if ((metrics.modelAllCallsInService || 0) + (metrics.modelAllCallsInCommand || 0) > 0) {
    suggestions.push(
      createSuggestion({
        category: 'performance',
        title: 'Evitar `Model::all()` em serviços e comandos',
        details:
          'Foram detectadas leituras totais fora de controllers. Em jobs/commands/services isso costuma escalar mal em memória e tempo.',
        impact: 'high',
        effort: 'medium',
      }),
    );
  }

  if ((metrics.dynamicRawSql || 0) > 0) {
    suggestions.push(
      createSuggestion({
        category: 'security',
        title: 'Revisar raw SQL com variáveis dinâmicas',
        details:
          'Há uso de DB::raw/selectRaw/whereRaw com interpolação dinâmica. Priorize bindings e Query Builder para reduzir risco.',
        impact: 'high',
        effort: 'medium',
      }),
    );
  }

  if ((metrics.unboundedGetCalls || 0) > 0) {
    suggestions.push(
      createSuggestion({
        category: 'performance',
        title: 'Reduzir consultas `->get()` sem paginação/limite',
        details:
          'Foram detectadas consultas com `->get()` sem limite explícito. Em listas grandes isso costuma degradar memória e tempo de resposta.',
        impact: 'high',
        effort: 'low',
      }),
    );
  }

  if ((metrics.possibleNPlusOneRisks || 0) > 0) {
    suggestions.push(
      createSuggestion({
        category: 'performance',
        title: 'Revisar potenciais N+1 em loops com relações',
        details:
          'Há sinais de acesso a relações dentro de loop sem eager loading claro. Isso pode multiplicar queries em produção.',
        impact: 'medium',
        effort: 'medium',
      }),
    );
  }

  if ((metrics.criticalWritesWithoutTransaction || 0) > 0) {
    suggestions.push(
      createSuggestion({
        category: 'architecture',
        title: 'Envolver writes críticos em transação + idempotência',
        details:
          'Fluxos com palavras-chave financeiras e escrita sem transação foram detectados. Isso aumenta risco de inconsistência em concorrência/falhas parciais.',
        impact: 'high',
        effort: 'medium',
      }),
    );
  }

  if ((metrics.queueJobsMissingTries || 0) > 0 || (metrics.queueJobsMissingTimeout || 0) > 0) {
    suggestions.push(
      createSuggestion({
        category: 'reliability',
        title: 'Padronizar hygiene de fila em Jobs',
        details:
          `Jobs com lacunas de resiliência detectados (tries ausente: ${Number(metrics.queueJobsMissingTries || 0)}, timeout ausente: ${Number(metrics.queueJobsMissingTimeout || 0)}).`,
        impact: 'high',
        effort: 'low',
      }),
    );
  }

  if ((metrics.criticalQueueJobsWithoutUnique || 0) > 0) {
    suggestions.push(
      createSuggestion({
        category: 'reliability',
        title: 'Aplicar unicidade/idempotência em jobs críticos',
        details:
          'Foram detectados jobs com contexto financeiro/estado crítico sem sinal de unicidade. Isso eleva risco de execução duplicada.',
        impact: 'high',
        effort: 'medium',
      }),
    );
  }

  if ((metrics.middlewaresWithDirectModel || 0) > 0) {
    suggestions.push(
      createSuggestion({
        category: 'architecture',
        title: 'Remover acesso direto a Model em middleware',
        details:
          'Há middleware com consulta direta a Model, o que aumenta acoplamento e dificulta evolução do pipeline HTTP.',
        impact: 'medium',
        effort: 'medium',
      }),
    );
  }

  if ((metrics.helpersWithDirectModel || 0) > 0) {
    suggestions.push(
      createSuggestion({
        category: 'architecture',
        title: 'Evitar acesso direto a Model em Helpers',
        details:
          'Há helpers com acesso direto a Model. Isso aumenta acoplamento global e dificulta teste/manutenção de fluxo de negócio.',
        impact: 'medium',
        effort: 'medium',
      }),
    );
  }

  if ((metrics.mutableValueObjects || 0) > 0) {
    suggestions.push(
      createSuggestion({
        category: 'clean-code',
        title: 'Tornar Value Objects imutáveis',
        details:
          'Foram detectados Value Objects com sinais de mutabilidade. Padronize `readonly`/construtor/factory para previsibilidade e segurança de estado.',
        impact: 'medium',
        effort: 'low',
      }),
    );
  }

  if ((metrics.mailsWithoutQueue || 0) > 0) {
    suggestions.push(
      createSuggestion({
        category: 'reliability',
        title: 'Avaliar queue para Mailables de maior custo',
        details:
          'Mailables sem ShouldQueue foram detectados. Em cenários de volume, envio síncrono aumenta latência e risco de timeout.',
        impact: 'medium',
        effort: 'low',
      }),
    );
  }

  if ((metrics.mailsWithSensitiveData || 0) > 0 || (metrics.loggingWithSensitiveData || 0) > 0) {
    suggestions.push(
      createSuggestion({
        category: 'security',
        title: 'Reduzir exposição de dados sensíveis em Mail/Logs',
        details:
          'Há sinais de dados sensíveis em mailables/logging. Minimize payload, aplique masking e evite persistir secrets/tokens em canais observáveis.',
        impact: 'high',
        effort: 'low',
      }),
    );
  }

  if ((metrics.scopesWithoutApply || 0) > 0) {
    suggestions.push(
      createSuggestion({
        category: 'architecture',
        title: 'Padronizar contrato de Scopes com apply()',
        details:
          'Foram detectados arquivos de scope sem método apply() explícito. Padronizar o contrato melhora previsibilidade de filtros globais/locais.',
        impact: 'low',
        effort: 'low',
      }),
    );
  }

  if ((metrics.websocketWithoutAuthSignals || 0) > 0) {
    suggestions.push(
      createSuggestion({
        category: 'security',
        title: 'Reforçar autenticação/autorização em Websocket',
        details:
          'Há componentes websocket sem sinais claros de authz/authn. Valide handshake, escopo de canal e autorização server-side.',
        impact: 'high',
        effort: 'medium',
      }),
    );
  }

  if ((metrics.fatProviders || 0) > 0 || (metrics.providersWithContractImportsWithoutBindings || 0) > 0) {
    suggestions.push(
      createSuggestion({
        category: 'architecture',
        title: 'Enxugar Providers e reforçar bindings explícitos',
        details:
          'Há sinais de providers extensos e/ou imports de contracts sem binding explícito. Consolidar DI e reduzir responsabilidade dos providers melhora previsibilidade do container.',
        impact: 'medium',
        effort: 'medium',
      }),
    );
  }

  if (
    (metrics.fatEvents || 0) > 0 ||
    (metrics.eventsWithDirectModel || 0) > 0 ||
    (metrics.eventsWithDatabaseAccess || 0) > 0 ||
    (metrics.fatObservers || 0) > 0 ||
    (metrics.observersWithDirectModel || 0) > 0
  ) {
    suggestions.push(
      createSuggestion({
        category: 'architecture',
        title: 'Reduzir lógica de domínio dentro de Events/Observers',
        details:
          'Foram detectados eventos/observers com sinais de acesso a Model/DB ou excesso de lógica. Mantenha events como contrato de dados e observers com orquestração mínima.',
        impact: 'high',
        effort: 'medium',
      }),
    );
  }

  if ((metrics.notificationsWithoutQueue || 0) > 0) {
    suggestions.push(
      createSuggestion({
        category: 'reliability',
        title: 'Avaliar queue para Notifications de maior impacto',
        details:
          'Notifications sem ShouldQueue foram detectadas. Em fluxos de alto volume/custo, o envio síncrono aumenta latência e risco de timeout.',
        impact: 'medium',
        effort: 'low',
      }),
    );
  }

  if ((metrics.notificationsWithSensitiveData || 0) > 0) {
    suggestions.push(
      createSuggestion({
        category: 'security',
        title: 'Revisar payload sensível em Notifications',
        details:
          'Há sinais de payload sensível (token/secret/password/code) em notifications. Reduza exposição e use tokens curtos, expiração e masking.',
        impact: 'high',
        effort: 'low',
      }),
    );
  }

  if ((metrics.httpResourcesWithoutWhenLoaded || 0) > 0) {
    suggestions.push(
      createSuggestion({
        category: 'performance',
        title: 'Aplicar guardas de relação em API Resources',
        details:
          `Foram detectados ${Number(metrics.httpResourceRelationsWithoutWhenLoaded || 0)} acesso(s) de relação sem \`whenLoaded/relationLoaded\` em Resources. Isso pode induzir lazy loading e N+1.`,
        impact: 'high',
        effort: 'low',
      }),
    );
  }

  if ((metrics.fatTraits || 0) > 0 || (metrics.highCouplingTraits || 0) > 0 || (metrics.traitsWithDirectModel || 0) > 0) {
    suggestions.push(
      createSuggestion({
        category: 'architecture',
        title: 'Reduzir acoplamento e escopo de Traits',
        details:
          'Há sinais de traits grandes/acoplados e/ou com acesso direto a Model. Centralize regra de negócio em Services/UseCases e mantenha traits focados em composição leve.',
        impact: 'medium',
        effort: 'medium',
      }),
    );
  }

  if ((metrics.contractsWithoutContainerBinding || 0) > 0) {
    suggestions.push(
      createSuggestion({
        category: 'architecture',
        title: 'Completar bindings de Contracts no container',
        details:
          `Foram detectados ${Number(metrics.contractsWithoutContainerBinding || 0)} contratos sem bind/singleton/scoped explícito em providers.`,
        impact: 'high',
        effort: 'low',
      }),
    );
  }

  if (metrics.requestAllCalls > 0) {
    suggestions.push(
      createSuggestion({
        category: 'security',
        title: 'Remover `$request->all()` em pontos críticos',
        details:
          'Prefira `$request->validated()` ou DTO para evitar mass assignment e entradas inesperadas.',
        impact: 'high',
        effort: 'low',
      }),
    );
  }

  if (metrics.missingTests > 0) {
    suggestions.push(
      createSuggestion({
        category: 'testing',
        title: 'Fechar lacunas de testes em camadas de negócio',
        details:
          'Há serviços/controllers sem testes detectados. Priorize hotspots com mais alterações e maior impacto.',
        impact: 'medium',
        effort: 'medium',
      }),
    );
  }

  if (metrics.fatModels > 0 || metrics.fatControllers > 0) {
    suggestions.push(
      createSuggestion({
        category: 'architecture',
        title: 'Quebrar classes grandes por responsabilidade',
        details:
          'Classes extensas aumentam acoplamento e reduzem testabilidade. Considere Actions/UseCases menores.',
        impact: 'medium',
        effort: 'medium',
      }),
    );
  }

  if ((metrics.fatCommands || 0) > 0) {
    suggestions.push(
      createSuggestion({
        category: 'architecture',
        title: 'Quebrar comandos extensos em steps reutilizáveis',
        details:
          'Commands longos dificultam manutenção operacional. Extrair passos para services/actions melhora testabilidade e reuso.',
        impact: 'medium',
        effort: 'medium',
      }),
    );
  }

  if ((metrics.fatFilamentResources || 0) > 0) {
    suggestions.push(
      createSuggestion({
        category: 'architecture',
        title: 'Enxugar Filament Resources muito extensas',
        details:
          'Resources grandes tendem a misturar regra de negócio com configuração de UI. Mover regra para Services/Policies melhora evolução.',
        impact: 'medium',
        effort: 'medium',
      }),
    );
  }

  if (structurePattern?.expected === 'thin-controller' && metrics.largeControllerMethods > 0) {
    suggestions.push(
      createSuggestion({
        category: 'clean-code',
        title: 'Reduzir métodos longos em controllers',
        details:
          'Métodos extensos estão em conflito com o padrão de controller fino detectado/definido. Pequenas extrações geralmente já melhoram manutenção.',
        impact: 'medium',
        effort: 'low',
      }),
    );
  }

  if (coverage.confidence < 60) {
    suggestions.push(
      createSuggestion({
        category: 'coverage',
        title: 'Expandir varredura para elevar confiança do modelo',
        details:
          'O scan atual cobre parte limitada do código. Execute um scan completo para reduzir decisões com baixa confiança.',
        impact: 'medium',
        effort: 'low',
      }),
    );
  }

  if (violations.filter((item) => item.severity === 'high').length >= 3) {
    suggestions.push(
      createSuggestion({
        category: 'architecture',
        title: 'Priorizar resolução de violações de alto impacto',
        details:
          'Existem múltiplas violações de severidade alta. Considere uma sprint curta de estabilização arquitetural.',
        impact: 'high',
        effort: 'medium',
      }),
    );
  }

  const actionableSecurityControls = (security?.controls || [])
    .filter((control) => control.status === 'fail' || control.status === 'warning')
    .filter((control) => control.mode !== 'manual')
    .slice(0, 6);

  actionableSecurityControls.forEach((control) => {
    suggestions.push(
      createSuggestion({
        category: 'security',
        title: `[${control.status.toUpperCase()}] ${control.title}`,
        details: `${control.message} ${control.recommendation}`.trim(),
        impact: impactFromSeverity(control.severity),
        effort: effortFromMode(control.mode),
      }),
    );
  });

  return dedupeSuggestions(suggestions);
}

module.exports = {
  buildSuggestions,
};
