const test = require('node:test');
const assert = require('node:assert/strict');

const { scoreViolationsActionability, scoreToPriority } = require('../src/actionability');

test('scoreToPriority maps score ranges to P1..P5', () => {
  assert.equal(scoreToPriority(92), 'P1');
  assert.equal(scoreToPriority(78), 'P2');
  assert.equal(scoreToPriority(60), 'P3');
  assert.equal(scoreToPriority(42), 'P4');
  assert.equal(scoreToPriority(18), 'P5');
});

test('actionability scoring annotates violations with score, priority, index and rank', () => {
  const payload = scoreViolationsActionability({
    violations: [
      {
        id: 'v-1',
        severity: 'high',
        type: 'dynamic-raw-sql',
        file: 'app/Http/Controllers/PaymentController.php',
      },
      {
        id: 'v-2',
        severity: 'medium',
        type: 'fat-controller',
        file: 'app/Http/Controllers/PaymentController.php',
      },
      {
        id: 'v-3',
        severity: 'low',
        type: 'pattern-drift:controller.validation',
        file: 'app/Services/BillingService.php',
      },
    ],
    fileIndex: {
      'app/Http/Controllers/PaymentController.php': {
        kind: 'controller',
        signals: { hasTest: false },
      },
      'app/Services/BillingService.php': {
        kind: 'service',
        signals: { hasTest: true },
      },
    },
  });

  assert.equal(payload.violations.length, 3);
  const first = payload.ranking[0];
  assert.equal(first.id, 'v-1');
  assert.equal(typeof first.actionabilityScore, 'number');
  assert.equal(typeof first.actionabilityRank, 'number');
  assert.equal(typeof first.actionabilityIndex, 'number');
  assert.match(first.actionabilityPriority, /^P[1-5]$/);
  assert.ok(first.actionabilityScore >= payload.ranking[1].actionabilityScore);
  assert.equal(
    payload.summary.total,
    Number(payload.summary.distribution.P1 || 0) +
      Number(payload.summary.distribution.P2 || 0) +
      Number(payload.summary.distribution.P3 || 0) +
      Number(payload.summary.distribution.P4 || 0) +
      Number(payload.summary.distribution.P5 || 0),
  );
});

test('missing test signal increases actionability compared to same issue with tests', () => {
  const baseViolation = {
    id: 'vx',
    severity: 'medium',
    type: 'mass-assignment-risk',
    file: 'app/Http/Controllers/UserController.php',
  };

  const withoutTest = scoreViolationsActionability({
    violations: [{ ...baseViolation, id: 'vx-1' }],
    fileIndex: {
      'app/Http/Controllers/UserController.php': {
        kind: 'controller',
        signals: { hasTest: false },
      },
    },
  });

  const withTest = scoreViolationsActionability({
    violations: [{ ...baseViolation, id: 'vx-2' }],
    fileIndex: {
      'app/Http/Controllers/UserController.php': {
        kind: 'controller',
        signals: { hasTest: true },
      },
    },
  });

  assert.ok(withoutTest.violations[0].actionabilityScore > withTest.violations[0].actionabilityScore);
});
