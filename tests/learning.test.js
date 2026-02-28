const test = require('node:test');
const assert = require('node:assert/strict');

const { buildLearningBundle } = require('../src/learning');

test('buildLearningBundle supports scoped files and related context', () => {
  const state = {
    updatedAt: '2026-02-28T00:00:00.000Z',
    coverage: { overall: 70, confidence: 80, dimensions: {} },
    security: { score: 60, totals: {}, highlights: [], metadata: {} },
    history: [],
    violated: [],
    violations: [
      { id: 'v1', file: 'app/Http/Controllers/UserController.php', severity: 'high' },
      { id: 'v2', file: 'app/Services/UserService.php', severity: 'medium' },
    ],
    waivedViolations: [],
    model: { stats: {} },
    decisions: [],
    rules: [],
    fileIndex: {
      'app/Http/Controllers/UserController.php': {
        file: 'app/Http/Controllers/UserController.php',
        kind: 'controller',
        signals: {},
        violations: [{ id: 'v1', severity: 'high' }],
      },
      'app/Services/UserService.php': {
        file: 'app/Services/UserService.php',
        kind: 'service',
        signals: {},
        violations: [{ id: 'v2', severity: 'medium' }],
      },
    },
  };

  const bundle = buildLearningBundle({
    state,
    registry: { patterns: [] },
    maxFiles: 10,
    scopeFiles: ['app/Http/Controllers/UserController.php'],
  });

  assert.equal(bundle.schemaVersion, 1);
  assert.equal(bundle.scope.scoped, true);
  assert.equal(bundle.scope.matchedFiles.length, 1);
  assert.ok(bundle.scope.relatedFiles.includes('app/Services/UserService.php'));
  assert.ok(bundle.representativeFiles.some((item) => item.file === 'app/Services/UserService.php'));
});
