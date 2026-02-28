const test = require('node:test');
const assert = require('node:assert/strict');

const { aggregateFromFileIndex, computeCoverage } = require('../src/coverage');

test('aggregateFromFileIndex sums metrics including new performance/integrity counters', () => {
  const payload = aggregateFromFileIndex({
    'app/Http/Controllers/A.php': {
      metrics: {
        scannedPhpFiles: 1,
        controllers: 1,
        controllersUsingService: 1,
        unboundedGetCalls: 2,
        possibleNPlusOneRisks: 1,
        criticalWritesWithoutTransaction: 0,
        helpers: 1,
        helpersWithDirectModel: 1,
        validators: 1,
        validatorsWithoutEntrypoint: 1,
        valueObjects: 1,
        mutableValueObjects: 1,
        mails: 1,
        mailsWithoutQueue: 1,
        loggingClasses: 1,
        loggingWithSensitiveData: 1,
        scopes: 1,
        scopesWithoutApply: 1,
        websocketClasses: 1,
        websocketWithoutAuthSignals: 1,
        filamentSupportFiles: 1,
        broadcastingClasses: 1,
        queueSupportClasses: 1,
        providers: 1,
        fatProviders: 1,
        providersWithContractImportsWithoutBindings: 1,
        events: 1,
        eventsWithDirectModel: 1,
        observers: 1,
        observersWithDirectModel: 1,
        notifications: 1,
        notificationsWithoutQueue: 1,
        traits: 1,
        contracts: 1,
        contractsWithoutContainerBinding: 1,
        httpResources: 1,
        httpResourcesWithoutWhenLoaded: 1,
        httpResourceRelationsWithoutWhenLoaded: 2,
        rawSqlCalls: 1,
        unsafeRawSqlCalls: 0,
        safeRawSqlCalls: 1,
      },
      violations: [{ id: 'v1', severity: 'low' }],
    },
    'app/Services/B.php': {
      metrics: {
        scannedPhpFiles: 1,
        services: 1,
        unboundedGetCalls: 1,
        possibleNPlusOneRisks: 0,
        criticalWritesWithoutTransaction: 1,
        helpers: 0,
        validators: 1,
        fatValidators: 1,
        valueObjects: 1,
        mutableValueObjects: 0,
        mails: 1,
        mailsWithSensitiveData: 1,
        loggingClasses: 1,
        formComponents: 1,
        fatFormComponents: 1,
        scopes: 1,
        kernels: 2,
        websocketClasses: 0,
        filamentSupportFiles: 1,
        providers: 1,
        providersWithContainerBindings: 1,
        events: 1,
        eventsWithDatabaseAccess: 1,
        observers: 1,
        fatObservers: 1,
        notifications: 1,
        notificationsWithSensitiveData: 1,
        traits: 0,
        contracts: 1,
        contractsWithContainerBinding: 1,
        httpResources: 1,
        httpResourcesUsingWhenLoaded: 1,
        httpResourceRelationsWithoutWhenLoaded: 0,
        rawSqlCalls: 2,
        unsafeRawSqlCalls: 1,
        safeRawSqlCalls: 1,
      },
      violations: [{ id: 'v2', severity: 'high' }],
    },
  });

  assert.equal(payload.metrics.scannedPhpFiles, 2);
  assert.equal(payload.metrics.controllers, 1);
  assert.equal(payload.metrics.services, 1);
  assert.equal(payload.metrics.unboundedGetCalls, 3);
  assert.equal(payload.metrics.possibleNPlusOneRisks, 1);
  assert.equal(payload.metrics.criticalWritesWithoutTransaction, 1);
  assert.equal(payload.metrics.helpers, 1);
  assert.equal(payload.metrics.helpersWithDirectModel, 1);
  assert.equal(payload.metrics.validators, 2);
  assert.equal(payload.metrics.validatorsWithoutEntrypoint, 1);
  assert.equal(payload.metrics.fatValidators, 1);
  assert.equal(payload.metrics.valueObjects, 2);
  assert.equal(payload.metrics.mutableValueObjects, 1);
  assert.equal(payload.metrics.mails, 2);
  assert.equal(payload.metrics.mailsWithoutQueue, 1);
  assert.equal(payload.metrics.mailsWithSensitiveData, 1);
  assert.equal(payload.metrics.loggingClasses, 2);
  assert.equal(payload.metrics.loggingWithSensitiveData, 1);
  assert.equal(payload.metrics.formComponents, 1);
  assert.equal(payload.metrics.fatFormComponents, 1);
  assert.equal(payload.metrics.scopes, 2);
  assert.equal(payload.metrics.scopesWithoutApply, 1);
  assert.equal(payload.metrics.kernels, 2);
  assert.equal(payload.metrics.websocketClasses, 1);
  assert.equal(payload.metrics.websocketWithoutAuthSignals, 1);
  assert.equal(payload.metrics.filamentSupportFiles, 2);
  assert.equal(payload.metrics.broadcastingClasses, 1);
  assert.equal(payload.metrics.queueSupportClasses, 1);
  assert.equal(payload.metrics.providers, 2);
  assert.equal(payload.metrics.fatProviders, 1);
  assert.equal(payload.metrics.providersWithContainerBindings, 1);
  assert.equal(payload.metrics.providersWithContractImportsWithoutBindings, 1);
  assert.equal(payload.metrics.events, 2);
  assert.equal(payload.metrics.eventsWithDirectModel, 1);
  assert.equal(payload.metrics.eventsWithDatabaseAccess, 1);
  assert.equal(payload.metrics.observers, 2);
  assert.equal(payload.metrics.fatObservers, 1);
  assert.equal(payload.metrics.observersWithDirectModel, 1);
  assert.equal(payload.metrics.notifications, 2);
  assert.equal(payload.metrics.notificationsWithoutQueue, 1);
  assert.equal(payload.metrics.notificationsWithSensitiveData, 1);
  assert.equal(payload.metrics.traits, 1);
  assert.equal(payload.metrics.contracts, 2);
  assert.equal(payload.metrics.contractsWithContainerBinding, 1);
  assert.equal(payload.metrics.contractsWithoutContainerBinding, 1);
  assert.equal(payload.metrics.httpResources, 2);
  assert.equal(payload.metrics.httpResourcesUsingWhenLoaded, 1);
  assert.equal(payload.metrics.httpResourcesWithoutWhenLoaded, 1);
  assert.equal(payload.metrics.httpResourceRelationsWithoutWhenLoaded, 2);
  assert.equal(payload.metrics.rawSqlCalls, 3);
  assert.equal(payload.metrics.unsafeRawSqlCalls, 1);
  assert.equal(payload.metrics.safeRawSqlCalls, 2);
  assert.equal(payload.violations.length, 2);
});

test('computeCoverage returns deterministic dimensions and overall score', () => {
  const metrics = {
    controllers: 10,
    controllersUsingService: 8,
    controllersWithDirectModel: 1,
    directModelCalls: 2,
    fatControllers: 1,
    largeControllerMethods: 1,
    controllersUsingFormRequest: 7,
    requestAllCalls: 1,
    services: 5,
    models: 3,
    missingTests: 2,
  };

  const violations = [
    { severity: 'high' },
    { severity: 'medium' },
  ];

  const result = computeCoverage({
    metrics,
    violations,
    scannedFiles: 20,
    totalPhpFiles: 40,
    model: {
      dominantPattern: 'service-layer',
      patterns: {
        'controller.data_access': { expected: 'service-layer' },
        'controller.validation': { expected: 'form-request' },
      },
      decisionCount: 0,
    },
  });

  assert.deepEqual(result.coverage.dimensions, {
    layering: 69,
    validation: 67,
    testability: 89,
    consistency: 9,
    authorization: 15,
  });
  assert.equal(result.coverage.overall, 53);
  assert.equal(result.coverage.confidence, 50);
  assert.equal(result.model.stats.violationCount, 2);
  assert.equal(result.model.dominantPattern, 'service-layer');
});

test('computeCoverage normalizes custom weights', () => {
  const metrics = {
    controllers: 10,
    controllersUsingService: 8,
    controllersWithDirectModel: 1,
    directModelCalls: 2,
    fatControllers: 1,
    largeControllerMethods: 1,
    controllersUsingFormRequest: 7,
    requestAllCalls: 1,
    services: 5,
    models: 3,
    missingTests: 2,
  };

  const result = computeCoverage({
    metrics,
    violations: [],
    scannedFiles: 20,
    totalPhpFiles: 40,
    model: {
      dominantPattern: 'service-layer',
      patterns: {
        'controller.data_access': { expected: 'service-layer' },
        'controller.validation': { expected: 'form-request' },
      },
      decisionCount: 0,
    },
    weights: {
      layering: 1,
      validation: 1,
      testability: 0,
      consistency: 0,
    },
  });

  assert.equal(result.coverage.overall, 68);
});
