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
    testTargets: 0,
    missingTests: 0,
    testFiles: 0,
    testCases: 0,
    testAssertions: 0,
    testMocks: 0,
    testDataProviders: 0,
    testEdgeCaseSignals: 0,
    testFilesWithoutAssertions: 0,
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

function round2(value) {
  return Number(Number(value || 0).toFixed(2));
}

function computeTestQuality({ metrics, presenceScore }) {
  const testFiles = Number(metrics.testFiles || 0);
  const testCases = Number(metrics.testCases || 0);
  const testAssertions = Number(metrics.testAssertions || 0);
  const testMocks = Number(metrics.testMocks || 0);
  const testDataProviders = Number(metrics.testDataProviders || 0);
  const testEdgeCaseSignals = Number(metrics.testEdgeCaseSignals || 0);
  const testFilesWithoutAssertions = Number(metrics.testFilesWithoutAssertions || 0);

  if (testFiles <= 0 || testCases <= 0) {
    return {
      score: clamp(Math.round(Number(presenceScore || 0)), 0, 100),
      testFiles,
      testCases,
      assertionsPerCase: 0,
      edgeSignalsPerCase: 0,
      mocksPerCase: 0,
      dataProvidersPerCase: 0,
      noAssertionFilesRatio: 0,
      confidence: 'low',
    };
  }

  const assertionsPerCase = testAssertions / Math.max(1, testCases);
  const edgeSignalsPerCase = testEdgeCaseSignals / Math.max(1, testCases);
  const mocksPerCase = testMocks / Math.max(1, testCases);
  const dataProvidersPerCase = testDataProviders / Math.max(1, testCases);
  const noAssertionFilesRatio = testFilesWithoutAssertions / Math.max(1, testFiles);

  let score = 100;

  if (assertionsPerCase < 1) score -= 40;
  else if (assertionsPerCase < 2) score -= 25;
  else if (assertionsPerCase < 3) score -= 12;

  if (edgeSignalsPerCase < 0.15) score -= 20;
  else if (edgeSignalsPerCase < 0.35) score -= 10;

  if (mocksPerCase > 2.2) score -= 18;
  else if (mocksPerCase > 1.2) score -= 10;

  score -= Math.round(noAssertionFilesRatio * 22);
  score += Math.min(10, Math.round(dataProvidersPerCase * 20));

  let confidence = 'low';
  if (testCases >= 20) confidence = 'high';
  else if (testCases >= 8) confidence = 'medium';

  return {
    score: clamp(Math.round(score), 0, 100),
    testFiles,
    testCases,
    assertionsPerCase: round2(assertionsPerCase),
    edgeSignalsPerCase: round2(edgeSignalsPerCase),
    mocksPerCase: round2(mocksPerCase),
    dataProvidersPerCase: round2(dataProvidersPerCase),
    noAssertionFilesRatio: round2(noAssertionFilesRatio),
    confidence,
  };
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

function computeConsistencyScore({ violations = [], scannedFiles = 0 }) {
  const files = Math.max(1, Number(scannedFiles || 0));
  const severityPenalty = violations.reduce((sum, item) => {
    const weight = SEVERITY_WEIGHTS[item.severity] || SEVERITY_WEIGHTS.low;
    return sum + weight;
  }, 0);

  const weightedSeverityPerFile = severityPenalty / files;
  const violationRate = Number(violations.length || 0) / files;
  const highImpactRate =
    Number(violations.filter((item) => item.severity === 'high' || item.severity === 'critical').length) / files;

  const penalty =
    weightedSeverityPerFile * 14 +
    violationRate * 30 +
    highImpactRate * 40;

  return clamp(Math.round(100 - penalty), 0, 100);
}

function computeCoverage({ metrics, violations, scannedFiles, totalPhpFiles, model = null, weights = null }) {
  const layering = computeLayeringScore({ metrics, model });
  const validation = computeValidationScore({ metrics, model });
  const authorization = computeAuthorizationScore({ metrics });

  const testRelevantFiles = Number(metrics.testTargets || 0) > 0
    ? Number(metrics.testTargets || 0)
    : metrics.controllers + metrics.services + metrics.models;
  const testabilityPresence =
    testRelevantFiles > 0 ? Math.round(((testRelevantFiles - metrics.missingTests) / testRelevantFiles) * 100) : 100;
  const testQuality = computeTestQuality({ metrics, presenceScore: clamp(testabilityPresence, 0, 100) });
  const testability = clamp(
    Math.round(clamp(testabilityPresence, 0, 100) * 0.72 + Number(testQuality.score || 0) * 0.28),
    0,
    100,
  );

  const consistency = computeConsistencyScore({ violations, scannedFiles });

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
      testQuality,
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
