const test = require('node:test');
const assert = require('node:assert/strict');

const { inferPatternModel, detectPatternDriftViolations, aggregatePatternDriftViolations } = require('../src/patterns');

function makeRegistry() {
  return {
    patterns: [
      {
        key: 'controller.data_access',
        name: 'Controller Data Access',
        enabled: true,
        weight: 1,
        detector: {
          type: 'split_ratio',
          totalMetric: 'controllers',
          positiveMetric: 'controllersUsingService',
          negativeMetric: 'controllersWithDirectModel',
          positiveLabel: 'service-layer',
          negativeLabel: 'direct-model',
          mixedLabel: 'mixed',
          strongThreshold: 0.62,
          dominanceThreshold: 0.15,
        },
        drift: {
          enabled: true,
          scopeKind: 'controller',
          positiveWhen: [
            { signal: 'signals.usesService', op: 'eq', value: true },
            { signal: 'signals.directModelCalls.length', op: 'eq', value: 0 },
          ],
          negativeWhen: [{ signal: 'signals.directModelCalls.length', op: 'gt', value: 0 }],
          message: 'drift message',
          suggestion: 'drift suggestion',
        },
      },
      {
        key: 'controller.validation',
        name: 'Controller Validation',
        enabled: true,
        detector: {
          type: 'single_ratio',
          totalMetric: 'controllers',
          targetMetric: 'controllersUsingFormRequest',
          orientation: 'high_is_good',
          highLabel: 'form-request',
          lowLabel: 'inline-validation',
          mixedLabel: 'mixed',
          upperStrong: 0.65,
          lowerStrong: 0.3,
        },
      },
    ],
  };
}

test('inferPatternModel infers expected patterns from metrics', () => {
  const model = inferPatternModel({
    metrics: {
      controllers: 10,
      controllersUsingService: 8,
      controllersWithDirectModel: 1,
      controllersUsingFormRequest: 7,
    },
    decisions: [],
    registry: makeRegistry(),
  });

  assert.equal(model.dominantPattern, 'service-layer');
  assert.equal(model.patterns['controller.data_access'].inferred, 'service-layer');
  assert.equal(model.patterns['controller.data_access'].expected, 'service-layer');
  assert.equal(model.patterns['controller.validation'].inferred, 'form-request');
  assert.equal(model.decisionCount, 0);
});

test('inferPatternModel applies active architectural decision override', () => {
  const model = inferPatternModel({
    metrics: {
      controllers: 10,
      controllersUsingService: 8,
      controllersWithDirectModel: 1,
    },
    decisions: [
      {
        id: 'decision-1',
        key: 'controller.data_access',
        preferred: 'direct-model',
        status: 'approved',
        rationale: 'legacy reason',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'decision-2',
        key: 'controller.data_access',
        preferred: 'service-layer',
        status: 'inactive',
        createdAt: '2026-01-02T00:00:00.000Z',
      },
    ],
    registry: makeRegistry(),
  });

  assert.equal(model.dominantPattern, 'direct-model');
  assert.equal(model.patterns['controller.data_access'].expected, 'direct-model');
  assert.equal(model.patterns['controller.data_access'].source, 'decision');
  assert.equal(model.decisionCount, 1);
});

test('detectPatternDriftViolations flags conflicting files for expected pattern', () => {
  const registry = makeRegistry();
  const model = inferPatternModel({
    metrics: {
      controllers: 10,
      controllersUsingService: 9,
      controllersWithDirectModel: 1,
      controllersUsingFormRequest: 8,
    },
    decisions: [],
    registry,
  });

  const fileIndex = {
    'app/Http/Controllers/GoodController.php': {
      file: 'app/Http/Controllers/GoodController.php',
      kind: 'controller',
      signals: {
        usesService: true,
        directModelCalls: [],
      },
      metrics: {},
    },
    'app/Http/Controllers/BadController.php': {
      file: 'app/Http/Controllers/BadController.php',
      kind: 'controller',
      signals: {
        usesService: false,
        directModelCalls: [{ line: 12 }],
      },
      metrics: {},
    },
    'app/Services/UserService.php': {
      file: 'app/Services/UserService.php',
      kind: 'service',
      signals: {
        usesService: true,
        directModelCalls: [],
      },
      metrics: {},
    },
  };

  const violations = detectPatternDriftViolations({
    fileIndex,
    model,
    registry,
  });

  assert.equal(violations.length, 1);
  assert.equal(violations[0].type, 'pattern-drift:controller.data_access');
  assert.equal(violations[0].file, 'app/Http/Controllers/BadController.php');
  assert.equal(violations[0].severity, 'medium');
});

test('aggregatePatternDriftViolations groups repeated drift into a single wave alert', () => {
  const violations = [
    {
      id: 'v1',
      type: 'pattern-drift:controller.data_access',
      severity: 'medium',
      file: 'app/Http/Controllers/AController.php',
      line: 1,
      message: 'drift',
      suggestion: 'fix',
      evidence: { patternKey: 'controller.data_access', expected: 'service-layer', actual: 'direct-model', confidence: 88 },
    },
    {
      id: 'v2',
      type: 'pattern-drift:controller.data_access',
      severity: 'low',
      file: 'app/Http/Controllers/BController.php',
      line: 1,
      message: 'drift',
      suggestion: 'fix',
      evidence: { patternKey: 'controller.data_access', expected: 'service-layer', actual: 'direct-model', confidence: 88 },
    },
    {
      id: 'v3',
      type: 'pattern-drift:controller.data_access',
      severity: 'low',
      file: 'app/Http/Controllers/CController.php',
      line: 1,
      message: 'drift',
      suggestion: 'fix',
      evidence: { patternKey: 'controller.data_access', expected: 'service-layer', actual: 'direct-model', confidence: 88 },
    },
  ];

  const aggregated = aggregatePatternDriftViolations(violations, { threshold: 3, maxFiles: 10 });
  assert.equal(aggregated.waves.length, 1);
  assert.equal(aggregated.waves[0].count, 3);
  assert.equal(aggregated.waves[0].key, 'controller.data_access');
  assert.equal(aggregated.violations.length, 1);
  assert.equal(aggregated.violations[0].type, 'pattern-drift-wave:controller.data_access');
  assert.equal(aggregated.violations[0].evidence.count, 3);
});
