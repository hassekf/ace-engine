const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadState } = require('../src/state');
const {
  recordArchitecturalDecision,
  updateArchitecturalDecision,
} = require('../src/decisions');

function makeTmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ace-decisions-test-'));
}

test('recordArchitecturalDecision supersedes previous active decision on same key', () => {
  const root = makeTmpRoot();

  const first = recordArchitecturalDecision({
    root,
    key: 'controller.data_access',
    preferred: 'service-layer',
    rationale: 'Padrão inicial',
  }).decision;

  const second = recordArchitecturalDecision({
    root,
    key: 'controller.data_access',
    preferred: 'direct-model',
    rationale: 'Mudança temporária',
  }).decision;

  const state = loadState(root);
  const firstStored = state.decisions.find((item) => item.id === first.id);
  const secondStored = state.decisions.find((item) => item.id === second.id);

  assert.equal(firstStored.status, 'superseded');
  assert.equal(secondStored.status, 'active');
});

test('updateArchitecturalDecision changes status', () => {
  const root = makeTmpRoot();
  const decision = recordArchitecturalDecision({
    root,
    key: 'controller.validation',
    preferred: 'form-request',
    rationale: 'Padronizar',
  }).decision;

  const updated = updateArchitecturalDecision({
    root,
    id: decision.id,
    status: 'approved',
    note: 'Aprovado em review',
  }).decision;

  assert.equal(updated.status, 'approved');
  assert.equal(updated.note, 'Aprovado em review');
});
