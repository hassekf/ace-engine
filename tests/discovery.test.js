const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { collectTestInsights } = require('../src/discovery');

function makeTmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ace-discovery-test-'));
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

test('collectTestInsights extracts quality signals from phpunit and pest tests', () => {
  const root = makeTmpRoot();

  writeFile(
    path.join(root, 'tests', 'Feature', 'UserServiceTest.php'),
    `<?php
use Tests\\TestCase;

class UserServiceTest extends TestCase
{
    public function test_it_handles_invalid_payload(): void
    {
        $this->assertTrue(true);
        $this->assertEquals(422, 422);
    }

    #[Test]
    public function rejects_empty_input(): void
    {
        $this->assertFalse(false);
        $mock = $this->mock(App\\Services\\UserService::class);
        $mock->shouldReceive('run');
    }
}
`,
  );

  writeFile(
    path.join(root, 'tests', 'Feature', 'WalletFlowTest.php'),
    `<?php
it('handles race condition and timeout', function () {
    expect(true)->toBeTrue();
})->with([
  'slow path',
]);
`,
  );

  writeFile(
    path.join(root, 'tests', 'Feature', 'NoAssertFlowTest.php'),
    `<?php
class NoAssertFlowTest {
    public function test_without_assertions(): void
    {
        $value = 'invalid';
    }
}
`,
  );

  const insights = collectTestInsights(root);
  assert.equal(insights.testFiles, 3);
  assert.equal(insights.testCases, 4);
  assert.ok(insights.testAssertions >= 4);
  assert.ok(insights.testMocks >= 2);
  assert.ok(insights.testDataProviders >= 1);
  assert.ok(insights.testEdgeCaseSignals >= 3);
  assert.equal(insights.testFilesWithoutAssertions, 1);
});
