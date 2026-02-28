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

function normalizeWeights(incoming = {}) {
  const defaults = {
    layering: 0.35,
    validation: 0.2,
    testability: 0.2,
    consistency: 0.25,
  };

  const merged = {
    ...defaults,
    ...incoming,
  };

  const total =
    Number(merged.layering || 0) +
    Number(merged.validation || 0) +
    Number(merged.testability || 0) +
    Number(merged.consistency || 0);

  if (!total || Number.isNaN(total)) {
    return defaults;
  }

  return {
    layering: Number(merged.layering || 0) / total,
    validation: Number(merged.validation || 0) / total,
    testability: Number(merged.testability || 0) / total,
    consistency: Number(merged.consistency || 0) / total,
  };
}

function computeCoverage({ metrics, violations, scannedFiles, totalPhpFiles, model = null, weights = null }) {
  const layering = computeLayeringScore({ metrics, model });
  const validation = computeValidationScore({ metrics, model });

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
      consistency * normalizedWeights.consistency,
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
