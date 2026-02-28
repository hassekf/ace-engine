const test = require('node:test');
const assert = require('node:assert/strict');

const { buildToolsManifest } = require('../src/mcp/server');

test('MCP compact profile keeps tool count within common hard-cap', () => {
  const compact = buildToolsManifest('compact');
  assert.ok(compact.length <= 15);

  const names = new Set(compact.map((tool) => tool.name));
  assert.ok(names.has('ace.manage_rules'));
  assert.ok(names.has('ace.manage_decisions'));
  assert.ok(names.has('ace.manage_waivers'));
  assert.ok(names.has('ace.manage_patterns'));
  assert.ok(names.has('ace.manage_config'));
  assert.ok(names.has('ace.get_modules'));
});

test('MCP full profile exposes legacy granular tools', () => {
  const full = buildToolsManifest('full');
  const names = new Set(full.map((tool) => tool.name));

  assert.ok(names.has('ace.formalize_rule'));
  assert.ok(names.has('ace.update_rule'));
  assert.ok(names.has('ace.record_arch_decision'));
  assert.ok(names.has('ace.list_arch_decisions'));
});
