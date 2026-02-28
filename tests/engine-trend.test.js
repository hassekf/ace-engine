const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runScan } = require('../src/engine');
const { createInitialState, saveState, loadState } = require('../src/state');

function makeTmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ace-engine-trend-test-'));
}

function writePhp(filePath, body) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, body, 'utf8');
}

function writeConfig(root, config) {
  const aceDir = path.join(root, '.ace');
  fs.mkdirSync(aceDir, { recursive: true });
  fs.writeFileSync(path.join(aceDir, 'config.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

test('runScan computes degrading trend and regression alert from history', () => {
  const root = makeTmpRoot();

  writeConfig(root, {
    analysis: {
      regressionThreshold: 5,
      trendWindow: 6,
      trendStableBand: 1,
    },
  });

  writePhp(
    path.join(root, 'app', 'Http', 'Controllers', 'LegacyController.php'),
    `<?php
namespace App\\Http\\Controllers;

use App\\Models\\User;

class LegacyController extends Controller
{
    public function index()
    {
        return User::query()->get();
    }
}
`,
  );

  const seed = createInitialState(root);
  seed.coverage.overall = 99;
  seed.history = [
    { timestamp: '2026-01-01T00:00:00.000Z', overall: 95, securityScore: 70 },
    { timestamp: '2026-01-02T00:00:00.000Z', overall: 99, securityScore: 71 },
  ];
  saveState(root, seed);

  const summary = runScan({
    root,
    scope: 'all',
    writeHtml: false,
  });

  assert.equal(summary.trendStatus, 'degrading');
  assert.equal(summary.regressionAlert.triggered, true);
  assert.ok(summary.regressionAlert.drop >= 5);

  const state = loadState(root);
  assert.equal(state.trend.coverage.status, 'degrading');
  assert.equal(state.trend.coverage.regression.triggered, true);
  assert.ok(Number(state.trend.coverage.deltaWindow) < 0);
  assert.equal(state.lastScan.regressionAlert, true);
  assert.equal(typeof state.lastScan.testQualityScore, 'number');
  const latestHistory = state.history[state.history.length - 1];
  assert.equal(typeof latestHistory.violationCount, 'number');
  assert.equal(typeof latestHistory.securityFailures, 'number');
  assert.equal(typeof latestHistory.testability, 'number');
  assert.equal(typeof latestHistory.testQuality, 'number');
});
