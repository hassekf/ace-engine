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
  assert.ok(names.has('ace.get_trend'));
  assert.ok(!names.has('ace.init_project'));
});

test('MCP full profile keeps the same consolidated public API surface', () => {
  const compact = buildToolsManifest('compact');
  const full = buildToolsManifest('full');
  assert.equal(full.length, compact.length);

  const names = new Set(full.map((tool) => tool.name));

  assert.ok(!names.has('ace.formalize_rule'));
  assert.ok(!names.has('ace.update_rule'));
  assert.ok(!names.has('ace.record_arch_decision'));
  assert.ok(!names.has('ace.list_arch_decisions'));
  assert.ok(!names.has('ace.init_project'));
  assert.ok(names.has('ace.get_trend'));
});
