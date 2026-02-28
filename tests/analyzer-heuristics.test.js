const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { analyzeFiles } = require('../src/analyzer');

function makeTmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ace-analyzer-test-'));
}

function writePhp(filePath, body) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, body, 'utf8');
}

test('analyzer detects unbounded get, possible n+1 and critical writes without transaction', () => {
  const root = makeTmpRoot();
  const file = path.join(root, 'app', 'Services', 'WalletPayoutService.php');

  writePhp(
    file,
    `<?php
namespace App\\Services;

use App\\Models\\User;
use App\\Models\\Wallet;

class WalletPayoutService
{
    public function run(): void
    {
        $users = User::query()->get();
        foreach ($users as $user) {
            $balance = $user->wallet->balance;
        }

        Wallet::query()->where('id', 1)->decrement('balance', 100);
    }
}
`,
  );

  const payload = analyzeFiles({
    root,
    files: [file],
    testBasenames: new Set(),
    thresholds: {},
  });

  const entry = payload['app/Services/WalletPayoutService.php'];
  assert.ok(entry, 'entry should exist');

  const types = new Set((entry.violations || []).map((item) => item.type));
  assert.ok(types.has('unbounded-get-query'));
  assert.ok(types.has('possible-n-plus-one'));
  assert.ok(types.has('critical-write-without-transaction'));

  assert.equal(entry.metrics.unboundedGetCalls, 1);
  assert.equal(entry.metrics.possibleNPlusOneRisks, 1);
  assert.equal(entry.metrics.criticalWritesWithoutTransaction, 1);
});

test('analyzer counts constructor-injected Action/UseCase as service usage in controller and classifies app/Actions as service kind', () => {
  const root = makeTmpRoot();
  const controllerFile = path.join(root, 'app', 'Http', 'Controllers', 'AccountController.php');
  const actionFile = path.join(root, 'app', 'Actions', 'CreateAccountAction.php');

  writePhp(
    controllerFile,
    `<?php
namespace App\\Http\\Controllers;

use App\\Actions\\CreateAccountAction;

class AccountController extends Controller
{
    public function __construct(
        private readonly CreateAccountAction $createAccountAction
    ) {}

    public function store()
    {
        return response()->json(['ok' => true]);
    }
}
`,
  );

  writePhp(
    actionFile,
    `<?php
namespace App\\Actions;

class CreateAccountAction
{
    public function handle(): void {}
}
`,
  );

  const payload = analyzeFiles({
    root,
    files: [controllerFile, actionFile],
    testBasenames: new Set(),
    thresholds: {},
  });

  const controllerEntry = payload['app/Http/Controllers/AccountController.php'];
  const actionEntry = payload['app/Actions/CreateAccountAction.php'];

  assert.ok(controllerEntry, 'controller entry should exist');
  assert.ok(actionEntry, 'action entry should exist');
  assert.equal(controllerEntry.kind, 'controller');
  assert.equal(actionEntry.kind, 'service');
  assert.equal(controllerEntry.metrics.controllersUsingService, 1);
});

test('analyzer classifies Filament Pages and Widgets with dedicated kinds', () => {
  const root = makeTmpRoot();
  const pageFile = path.join(root, 'app', 'Filament', 'Admin', 'Pages', 'RevenueDashboard.php');
  const widgetFile = path.join(root, 'app', 'Filament', 'Admin', 'Widgets', 'RevenueChart.php');

  writePhp(
    pageFile,
    `<?php
namespace App\\Filament\\Admin\\Pages;

class RevenueDashboard extends \\\\Filament\\\\Pages\\\\Page {}
`,
  );

  writePhp(
    widgetFile,
    `<?php
namespace App\\Filament\\Admin\\Widgets;

class RevenueChart extends \\\\Filament\\\\Widgets\\\\Widget {}
`,
  );

  const payload = analyzeFiles({
    root,
    files: [pageFile, widgetFile],
    testBasenames: new Set(),
    thresholds: {},
  });

  const pageEntry = payload['app/Filament/Admin/Pages/RevenueDashboard.php'];
  const widgetEntry = payload['app/Filament/Admin/Widgets/RevenueChart.php'];

  assert.ok(pageEntry, 'page entry should exist');
  assert.ok(widgetEntry, 'widget entry should exist');
  assert.equal(pageEntry.kind, 'filament-page');
  assert.equal(widgetEntry.kind, 'filament-widget');
  assert.equal(pageEntry.metrics.filamentPages, 1);
  assert.equal(widgetEntry.metrics.filamentWidgets, 1);
  assert.equal(pageEntry.metrics.filamentPagesWithAuth, 0);
  assert.equal(widgetEntry.metrics.filamentWidgetsWithAuth, 0);
});

test('analyzer detects authorization signals for Filament Pages and Widgets', () => {
  const root = makeTmpRoot();
  const pageFile = path.join(root, 'app', 'Filament', 'Admin', 'Pages', 'SecurePage.php');
  const widgetFile = path.join(root, 'app', 'Filament', 'Admin', 'Widgets', 'SecureWidget.php');

  writePhp(
    pageFile,
    `<?php
namespace App\\Filament\\Admin\\Pages;

class SecurePage extends \\\\Filament\\\\Pages\\\\Page {
    public static function canAccess(): bool { return true; }
}
`,
  );

  writePhp(
    widgetFile,
    `<?php
namespace App\\Filament\\Admin\\Widgets;

class SecureWidget extends \\\\Filament\\\\Widgets\\\\Widget {
    public static function canView(): bool { return true; }
}
`,
  );

  const payload = analyzeFiles({
    root,
    files: [pageFile, widgetFile],
    testBasenames: new Set(),
    thresholds: {},
  });

  const pageEntry = payload['app/Filament/Admin/Pages/SecurePage.php'];
  const widgetEntry = payload['app/Filament/Admin/Widgets/SecureWidget.php'];
  assert.ok(pageEntry, 'page entry should exist');
  assert.ok(widgetEntry, 'widget entry should exist');
  assert.equal(pageEntry.metrics.filamentPagesWithAuth, 1);
  assert.equal(widgetEntry.metrics.filamentWidgetsWithAuth, 1);
});

test('analyzer distinguishes safe raw SQL from unsafe raw SQL', () => {
  const root = makeTmpRoot();
  const file = path.join(root, 'app', 'Services', 'BillingQueryService.php');

  writePhp(
    file,
    `<?php
namespace App\\Services;

use Illuminate\\Support\\Facades\\DB;

class BillingQueryService
{
    public function run(string $status): array
    {
        $safe = DB::selectRaw('SUM(amount) as total');
        $stillSafe = DB::selectRaw('SUM(amount) as total WHERE status = ?', [$status]);
        $unsafe = DB::selectRaw("SUM(amount) as total WHERE status = '{$status}'");
        return [$safe, $stillSafe, $unsafe];
    }
}
`,
  );

  const payload = analyzeFiles({
    root,
    files: [file],
    testBasenames: new Set(),
    thresholds: {},
  });

  const entry = payload['app/Services/BillingQueryService.php'];
  assert.ok(entry, 'entry should exist');

  assert.equal(entry.metrics.rawSqlCalls, 3);
  assert.equal(entry.metrics.safeRawSqlCalls, 2);
  assert.equal(entry.metrics.unsafeRawSqlCalls, 1);
  assert.equal(entry.metrics.dynamicRawSql, 1);

  const types = new Set((entry.violations || []).map((item) => item.type));
  assert.ok(types.has('dynamic-raw-sql'));
  assert.ok(types.has('raw-sql-review'));
});

test('analyzer classifies policies as dedicated kind', () => {
  const root = makeTmpRoot();
  const file = path.join(root, 'app', 'Policies', 'WalletPolicy.php');

  writePhp(
    file,
    `<?php
namespace App\\Policies;

class WalletPolicy
{
    public function viewAny($user): bool
    {
        return true;
    }
}
`,
  );

  const payload = analyzeFiles({
    root,
    files: [file],
    testBasenames: new Set(),
    thresholds: {},
  });

  const entry = payload['app/Policies/WalletPolicy.php'];
  assert.ok(entry, 'policy entry should exist');
  assert.equal(entry.kind, 'policy');
  assert.equal(entry.metrics.policies, 1);
});
