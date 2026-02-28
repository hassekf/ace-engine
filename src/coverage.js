const { clamp } = require('./helpers');
const { SEVERITY_WEIGHTS } = require('./constants');

function aggregateFromFileIndex(fileIndex) {
  const totals = {
    scannedPhpFiles: 0,
    controllers: 0,
    controllersUsingService: 0,
    controllersWithDirectModel: 0,
    controllersUsingFormRequest: 0,
    directModelCalls: 0,
    modelAllCallsInController: 0,
    requestAllCalls: 0,
    fatControllers: 0,
    largeControllerMethods: 0,
    services: 0,
    modelAllCallsInService: 0,
    jobs: 0,
    queueJobsMissingTries: 0,
    queueJobsMissingTimeout: 0,
    queueJobsWithoutFailedHandler: 0,
    criticalQueueJobsWithoutUnique: 0,
    listeners: 0,
    listenerWithoutQueue: 0,
    middlewares: 0,
    fatMiddlewares: 0,
    middlewaresWithDirectModel: 0,
    helpers: 0,
    fatHelpers: 0,
    helpersWithDirectModel: 0,
    validators: 0,
    fatValidators: 0,
    validatorsWithoutEntrypoint: 0,
    exceptions: 0,
    valueObjects: 0,
    mutableValueObjects: 0,
    channels: 0,
    mails: 0,
    mailsWithoutQueue: 0,
    mailsWithSensitiveData: 0,
    loggingClasses: 0,
    loggingWithSensitiveData: 0,
    formComponents: 0,
    fatFormComponents: 0,
    scopes: 0,
    scopesWithoutApply: 0,
    kernels: 0,
    websocketClasses: 0,
    websocketWithoutAuthSignals: 0,
    filamentSupportFiles: 0,
    broadcastingClasses: 0,
    queueSupportClasses: 0,
    providers: 0,
    fatProviders: 0,
    providersWithContainerBindings: 0,
    providersWithContractImportsWithoutBindings: 0,
    events: 0,
    fatEvents: 0,
    eventsWithDirectModel: 0,
    eventsWithDatabaseAccess: 0,
    observers: 0,
    fatObservers: 0,
    observersWithDirectModel: 0,
    notifications: 0,
    fatNotifications: 0,
    notificationsWithoutQueue: 0,
    notificationsWithSensitiveData: 0,
    traits: 0,
    fatTraits: 0,
    highCouplingTraits: 0,
    traitsWithDirectModel: 0,
    contracts: 0,
    contractsWithContainerBinding: 0,
    contractsWithoutContainerBinding: 0,
    httpResources: 0,
    httpResourcesUsingWhenLoaded: 0,
    httpResourcesWithoutWhenLoaded: 0,
    httpResourceRelationsWithoutWhenLoaded: 0,
    enums: 0,
    dtos: 0,
    commands: 0,
    modelAllCallsInCommand: 0,
    fatCommands: 0,
    models: 0,
    policies: 0,
    fatModels: 0,
    filamentResources: 0,
    fatFilamentResources: 0,
    filamentPages: 0,
    fatFilamentPages: 0,
    filamentPagesWithAuth: 0,
    filamentWidgets: 0,
    fatFilamentWidgets: 0,
    filamentWidgetsWithAuth: 0,
    routeFiles: 0,
    routeFilesWithAuth: 0,
    routeFilesWithThrottle: 0,
    routeFilesWithoutCsrf: 0,
    stateChangingRouteFilesWithoutAuth: 0,
    stateChangingRouteFilesWithoutThrottle: 0,
    livewireComponents: 0,
    livewirePublicProperties: 0,
    livewireLockedProperties: 0,
    authorizationChecks: 0,
    canAccessPanelCalls: 0,
    rawSqlCalls: 0,
    unsafeRawSqlCalls: 0,
    safeRawSqlCalls: 0,
    dynamicRawSql: 0,
    dangerousSinkCalls: 0,
    uploadHandlingMentions: 0,
    uploadValidationMentions: 0,
    webhookHandlingMentions: 0,
    webhookSignatureMentions: 0,
    unboundedGetCalls: 0,
    possibleNPlusOneRisks: 0,
    criticalWritesWithoutTransaction: 0,
    missingTests: 0,
  };

  const violations = [];

  for (const entry of Object.values(fileIndex)) {
    if (!entry || !entry.metrics) {
      continue;
    }

    Object.keys(totals).forEach((key) => {
      totals[key] += Number(entry.metrics[key] || 0);
    });

    (entry.violations || []).forEach((violation) => violations.push(violation));
  }

  return {
    metrics: totals,
    violations,
  };
}

function inferDominantPattern(metrics) {
  if (!metrics.controllers) {
    return 'unknown';
  }

  const ratio = metrics.controllersUsingService / metrics.controllers;
  const directRatio = metrics.controllersWithDirectModel / metrics.controllers;

  if (ratio >= 0.62 && ratio >= directRatio + 0.15) {
    return 'service-layer';
  }

  if (directRatio >= 0.62 && directRatio >= ratio + 0.15) {
    return 'model-centric';
  }

  return 'mixed';
}

function computeLayeringScore({ metrics, model }) {
  if (!metrics.controllers) {
    return 100;
  }

  const serviceRatio = metrics.controllersUsingService / metrics.controllers;
  const directRatio = metrics.controllersWithDirectModel / metrics.controllers;
  const expected = model?.patterns?.['controller.data_access']?.expected || model?.dominantPattern || 'mixed';

  if (expected === 'service-layer') {
    const controllers = Math.max(1, metrics.controllers);
    const directDensity = metrics.directModelCalls / controllers;
    const fatDensity = metrics.fatControllers / controllers;
    const longMethodDensity = metrics.largeControllerMethods / controllers;
    return clamp(
      Math.round(serviceRatio * 100 - directDensity * 35 - fatDensity * 20 - longMethodDensity * 25),
      0,
      100,
    );
  }

  if (expected === 'direct-model') {
    const controllers = Math.max(1, metrics.controllers);
    const serviceDensity = metrics.controllersUsingService / controllers;
    const fatDensity = metrics.fatControllers / controllers;
    return clamp(Math.round(directRatio * 100 - serviceDensity * 15 - fatDensity * 20), 0, 100);
  }

  const mixedCenter = 1 - Math.abs(serviceRatio - directRatio);
  const controllers = Math.max(1, metrics.controllers);
  const longMethodDensity = metrics.largeControllerMethods / controllers;
  const fatDensity = metrics.fatControllers / controllers;
  return clamp(Math.round(mixedCenter * 100 - longMethodDensity * 20 - fatDensity * 20), 0, 100);
}

function computeValidationScore({ metrics, model }) {
  if (!metrics.controllers) {
    return 100;
  }

  const formRequestRatio = metrics.controllersUsingFormRequest / metrics.controllers;
  const expected = model?.patterns?.['controller.validation']?.expected || 'mixed';

  if (expected === 'form-request') {
    const requestAllDensity = metrics.requestAllCalls / Math.max(1, metrics.controllers);
    return clamp(Math.round(formRequestRatio * 100 - requestAllDensity * 35), 0, 100);
  }

  if (expected === 'inline-validation') {
    const requestAllDensity = metrics.requestAllCalls / Math.max(1, metrics.controllers);
    return clamp(Math.round((1 - formRequestRatio) * 100 - requestAllDensity * 15), 0, 100);
  }

  const validationBalance = 1 - Math.abs(formRequestRatio - 0.5);
  const requestAllDensity = metrics.requestAllCalls / Math.max(1, metrics.controllers);
  return clamp(Math.round(validationBalance * 100 - requestAllDensity * 25), 0, 100);
}

function computeAuthorizationScore({ metrics }) {
  const authSurface =
    Number(metrics.controllers || 0) +
    Number(metrics.filamentPages || 0) +
    Number(metrics.filamentWidgets || 0) +
    Number(metrics.livewireComponents || 0) +
    Number(metrics.routeFiles || 0);

  if (!authSurface) {
    return 100;
  }

  const authSignalRatio = Math.min(1, Number(metrics.authorizationChecks || 0) / Math.max(1, authSurface));
  const policySupport =
    Number(metrics.models || 0) > 0 ? Math.min(1, Number(metrics.policies || 0) / Math.max(1, Number(metrics.models || 0))) : 1;
  const routeAuthScore =
    Number(metrics.routeFiles || 0) > 0
      ? 1 -
        Math.min(
          1,
          Number(metrics.stateChangingRouteFilesWithoutAuth || 0) / Math.max(1, Number(metrics.routeFiles || 0)),
        )
      : 1;

  return clamp(
    Math.round(authSignalRatio * 55 + policySupport * 30 + routeAuthScore * 15),
    0,
    100,
  );
}

function normalizeWeights(incoming = {}) {
  const defaults = {
    layering: 0.3,
    validation: 0.18,
    testability: 0.18,
    consistency: 0.19,
    authorization: 0.15,
  };

  const incomingKeys = Object.keys(incoming || {});
  const hasCustomWeights = incomingKeys.length > 0;
  const base = hasCustomWeights
    ? {
        layering: 0,
        validation: 0,
        testability: 0,
        consistency: 0,
        authorization: 0,
      }
    : defaults;

  const merged = {
    ...base,
    ...incoming,
  };

  const total =
    Number(merged.layering || 0) +
    Number(merged.validation || 0) +
    Number(merged.testability || 0) +
    Number(merged.consistency || 0) +
    Number(merged.authorization || 0);

  if (!total || Number.isNaN(total)) {
    return defaults;
  }

  return {
    layering: Number(merged.layering || 0) / total,
    validation: Number(merged.validation || 0) / total,
    testability: Number(merged.testability || 0) / total,
    consistency: Number(merged.consistency || 0) / total,
    authorization: Number(merged.authorization || 0) / total,
  };
}

function computeCoverage({ metrics, violations, scannedFiles, totalPhpFiles, model = null, weights = null }) {
  const layering = computeLayeringScore({ metrics, model });
  const validation = computeValidationScore({ metrics, model });
  const authorization = computeAuthorizationScore({ metrics });

  const testRelevantFiles = metrics.controllers + metrics.services + metrics.models;
  const testabilityBase =
    testRelevantFiles > 0 ? Math.round(((testRelevantFiles - metrics.missingTests) / testRelevantFiles) * 100) : 100;
  const testability = clamp(testabilityBase, 0, 100);

  const severityPenalty = violations.reduce((sum, item) => {
    const weight = SEVERITY_WEIGHTS[item.severity] || SEVERITY_WEIGHTS.low;
    return sum + weight;
  }, 0);
  const density = severityPenalty / Math.max(1, scannedFiles || 1);
  const consistency = clamp(Math.round(100 * Math.exp(-density * 2.5)), 0, 100);

  const normalizedWeights = normalizeWeights(weights || {});
  const overall = Math.round(
    layering * normalizedWeights.layering +
      validation * normalizedWeights.validation +
      testability * normalizedWeights.testability +
      consistency * normalizedWeights.consistency +
      authorization * normalizedWeights.authorization,
  );
  const confidence = totalPhpFiles > 0 ? clamp(Math.round((scannedFiles / totalPhpFiles) * 100), 0, 100) : 0;

  return {
    coverage: {
      overall,
      confidence,
      dimensions: {
        layering,
        validation,
        testability,
        consistency,
        authorization,
      },
      scannedFiles,
      totalPhpFiles,
    },
    model: {
      dominantPattern: model?.dominantPattern || inferDominantPattern(metrics),
      patterns: model?.patterns || {},
      decisionCount: model?.decisionCount || 0,
      stats: {
        ...metrics,
        violationCount: violations.length,
      },
    },
  };
}

module.exports = {
  aggregateFromFileIndex,
  computeCoverage,
};
