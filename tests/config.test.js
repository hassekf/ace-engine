const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  initAceConfig,
  loadAceConfig,
  addWaiver,
  applyWaivers,
} = require('../src/config');

function makeTmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ace-config-test-'));
}

test('initAceConfig creates default config', () => {
  const root = makeTmpRoot();
  const result = initAceConfig(root);
  assert.equal(result.created, true);
  assert.ok(fs.existsSync(result.configPath));

  const config = loadAceConfig(root);
  assert.ok(config.analysis.thresholds.fatControllerLines > 0);
  assert.ok(Array.isArray(config.waivers));
});

test('waiver suppresses matching violation', () => {
  const root = makeTmpRoot();
  initAceConfig(root);

  const waiver = addWaiver(root, {
    type: 'pattern-drift:*',
    file: 'app/Legacy/*',
    reason: 'Legacy em migração',
    status: 'active',
  }).waiver;

  const payload = applyWaivers({
    violations: [
      { id: 'v1', type: 'pattern-drift:controller.validation', file: 'app/Legacy/FooController.php', severity: 'low' },
      { id: 'v2', type: 'fat-controller', file: 'app/Http/Controllers/BarController.php', severity: 'low' },
    ],
    waivers: [waiver],
  });

  assert.equal(payload.violations.length, 1);
  assert.equal(payload.waivedViolations.length, 1);
  assert.equal(payload.waivedViolations[0].id, 'v1');
});
