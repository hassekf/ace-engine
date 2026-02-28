const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { getStatePath, getRulesPath, getDecisionsPath, loadState, saveState } = require('../src/state');

function makeTmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ace-state-governance-test-'));
}

test('loadState reads legacy rules/decisions from ace.json when sidecar files are absent', () => {
  const root = makeTmpRoot();
  const aceDir = path.join(root, '.ace');
  fs.mkdirSync(aceDir, { recursive: true });

  const legacyState = {
    schemaVersion: 3,
    rules: [{ id: 'r1', title: 'Legacy Rule' }],
    decisions: [{ id: 'd1', key: 'controller.data_access', preferred: 'service-layer' }],
  };
  fs.writeFileSync(getStatePath(root), `${JSON.stringify(legacyState, null, 2)}\n`, 'utf8');

  const loaded = loadState(root);
  assert.equal(loaded.rules.length, 1);
  assert.equal(loaded.decisions.length, 1);
  assert.equal(loaded.rules[0].id, 'r1');
  assert.equal(loaded.decisions[0].id, 'd1');
});

test('saveState persists rules/decisions to dedicated sidecar files', () => {
  const root = makeTmpRoot();
  const state = loadState(root);

  state.rules = [{ id: 'rule-v1', title: 'Rule V1' }];
  state.decisions = [{ id: 'decision-v1', key: 'controller.validation', preferred: 'form-request' }];
  saveState(root, state);

  const rules = JSON.parse(fs.readFileSync(getRulesPath(root), 'utf8'));
  const decisions = JSON.parse(fs.readFileSync(getDecisionsPath(root), 'utf8'));
  const persistedState = JSON.parse(fs.readFileSync(getStatePath(root), 'utf8'));

  assert.equal(rules.length, 1);
  assert.equal(decisions.length, 1);
  assert.equal(persistedState.rules, undefined);
  assert.equal(persistedState.decisions, undefined);
  assert.equal(persistedState.governance.files.rules, 'rules.json');
  assert.equal(persistedState.governance.files.decisions, 'decisions.json');
});
