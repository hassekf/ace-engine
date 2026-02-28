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
  });
  assert.equal(result.coverage.overall, 58);
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
