const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runScan } = require('../src/engine');

function makeTmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ace-engine-test-'));
}

function writePhp(filePath, body) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, body, 'utf8');
}

test('runScan uses hash cache on subsequent scans', () => {
  const root = makeTmpRoot();
  writePhp(
    path.join(root, 'app', 'Http', 'Controllers', 'UserController.php'),
    `<?php
namespace App\\Http\\Controllers;
use Illuminate\\Http\\Request;
class UserController extends Controller {
  public function index(Request $request) {
    return response()->json([]);
  }
}
`,
  );

  const first = runScan({
    root,
    scope: 'all',
    writeHtml: false,
  });
  assert.equal(typeof first.cacheHits, 'number');

  const second = runScan({
    root,
    scope: 'all',
    writeHtml: false,
  });

  assert.ok(second.cacheHits >= 1);
  assert.ok(second.analyzedFiles <= 1);
});
