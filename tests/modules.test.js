const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { detectProjectModules, buildModuleScopeDraft, getComposerDependencyVersions } = require('../src/modules');

function makeTmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ace-modules-test-'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

test('detectProjectModules enables optional modules based on dependencies/config', () => {
  const root = makeTmpRoot();
  writeJson(path.join(root, 'composer.json'), {
    require: {
      'laravel/framework': '^11.0',
      'filament/filament': '^3.0',
      'livewire/livewire': '^3.0',
      'laravel/sanctum': '^4.0',
    },
  });
  fs.mkdirSync(path.join(root, 'config'), { recursive: true });
  fs.writeFileSync(path.join(root, 'config', 'permission.php'), "<?php return [];\n", 'utf8');

  const modules = detectProjectModules({
    root,
    metrics: {},
    composerVersions: getComposerDependencyVersions(root),
  });
  const byId = new Map(modules.map((item) => [item.id, item]));

  assert.equal(byId.get('laravel-core')?.enabled, true);
  assert.equal(byId.get('filament')?.enabled, true);
  assert.equal(byId.get('livewire')?.enabled, true);
  assert.equal(byId.get('sanctum')?.enabled, true);
  assert.equal(byId.get('spatie-permission')?.enabled, true);
  assert.equal(byId.get('horizon')?.enabled, false);
});

test('buildModuleScopeDraft only includes enabled modules with docs and scope hints', () => {
  const modules = [
    {
      id: 'a',
      title: 'A',
      enabled: true,
      docs: [{ title: 'Doc A', url: 'https://example.com/a' }],
      scopeHints: ['app/A'],
      llmPrompt: 'Analyze A',
    },
    {
      id: 'b',
      title: 'B',
      enabled: false,
      docs: [{ title: 'Doc B', url: 'https://example.com/b' }],
      scopeHints: ['app/B'],
      llmPrompt: 'Analyze B',
    },
  ];

  const draft = buildModuleScopeDraft(modules);
  assert.equal(draft.length, 1);
  assert.equal(draft[0].moduleId, 'a');
  assert.equal(draft[0].docs.length, 1);
  assert.equal(draft[0].scopeHints[0], 'app/A');
});
