const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scaffoldIntegration } = require('../src/init');

function makeTmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ace-init-test-'));
}

test('scaffoldIntegration initializes team-friendly ACE layout and managed gitignore block', () => {
  const root = makeTmpRoot();
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n.ace/\n', 'utf8');

  scaffoldIntegration(root);

  const aceDir = path.join(root, '.ace');
  const gitignorePath = path.join(root, '.gitignore');
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');

  assert.ok(fs.existsSync(path.join(aceDir, 'config.json')));
  assert.ok(fs.existsSync(path.join(aceDir, 'pattern-registry.json')));
  assert.ok(fs.existsSync(path.join(aceDir, 'rules.json')));
  assert.ok(fs.existsSync(path.join(aceDir, 'decisions.json')));
  assert.ok(fs.existsSync(path.join(aceDir, 'README.md')));

  assert.equal(gitignoreContent.includes('\n.ace/\n'), false);
  assert.ok(gitignoreContent.includes('# --- ACE managed (begin) ---'));
  assert.ok(gitignoreContent.includes('!.ace/config.json'));
  assert.ok(gitignoreContent.includes('!.ace/rules.json'));
  assert.ok(gitignoreContent.includes('!.ace/decisions.json'));
});

test('scaffoldIntegration is idempotent for managed gitignore block', () => {
  const root = makeTmpRoot();

  scaffoldIntegration(root);
  const first = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');

  scaffoldIntegration(root);
  const second = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');

  assert.equal(first, second);
  assert.equal((second.match(/# --- ACE managed \(begin\) ---/g) || []).length, 1);
});

test('scaffoldIntegration creates Codex and Claude skills by default', () => {
  const root = makeTmpRoot();
  const payload = scaffoldIntegration(root);

  assert.ok(payload.llms.includes('codex'));
  assert.ok(payload.llms.includes('claude'));
  assert.ok(fs.existsSync(path.join(root, '.codex', 'skills', 'ace-architectural-guardian', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(root, '.claude', 'skills', 'ace-architectural-guardian', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(root, '.ace', 'integration', 'mcp.codex.example.json')));
});

test('scaffoldIntegration can target a subset of llms', () => {
  const root = makeTmpRoot();
  const payload = scaffoldIntegration(root, { llms: ['codex'] });

  assert.deepEqual(payload.llms, ['codex']);
  assert.ok(fs.existsSync(path.join(root, '.codex', 'skills', 'ace-architectural-guardian', 'SKILL.md')));
  assert.equal(fs.existsSync(path.join(root, '.claude', 'skills', 'ace-architectural-guardian', 'SKILL.md')), false);
  assert.ok(fs.existsSync(path.join(root, '.ace', 'integration', 'mcp.codex.example.json')));
  assert.equal(fs.existsSync(path.join(root, '.ace', 'integration', 'mcp.cursor.example.json')), false);
});
