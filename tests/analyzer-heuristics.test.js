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

test('analyzer detects queue hygiene issues in critical jobs', () => {
  const root = makeTmpRoot();
  const file = path.join(root, 'app', 'Jobs', 'ProcessWalletWithdrawalJob.php');

  writePhp(
    file,
    `<?php
namespace App\\Jobs;

use Illuminate\\Contracts\\Queue\\ShouldQueue;
use Illuminate\\Foundation\\Queue\\Queueable;

class ProcessWalletWithdrawalJob implements ShouldQueue
{
    use Queueable;

    public function handle(): void
    {
        // ...
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

  const entry = payload['app/Jobs/ProcessWalletWithdrawalJob.php'];
  assert.ok(entry, 'job entry should exist');
  assert.equal(entry.kind, 'job');
  assert.equal(entry.metrics.jobs, 1);
  assert.equal(entry.metrics.queueJobsMissingTries, 1);
  assert.equal(entry.metrics.queueJobsMissingTimeout, 1);
  assert.equal(entry.metrics.criticalQueueJobsWithoutUnique, 1);
  const types = new Set((entry.violations || []).map((item) => item.type));
  assert.ok(types.has('job-missing-tries'));
  assert.ok(types.has('job-missing-timeout'));
  assert.ok(types.has('critical-job-without-unique'));
});

test('analyzer classifies listener, middleware, dto and enum kinds', () => {
  const root = makeTmpRoot();
  const listenerFile = path.join(root, 'app', 'Listeners', 'UserRegisteredListener.php');
  const middlewareFile = path.join(root, 'app', 'Http', 'Middleware', 'TenantResolver.php');
  const dtoFile = path.join(root, 'app', 'DTOs', 'CreateUserDto.php');
  const enumFile = path.join(root, 'app', 'Enums', 'UserStatus.php');

  writePhp(
    listenerFile,
    `<?php
namespace App\\Listeners;

class UserRegisteredListener
{
    public function handle(object $event): void {}
}
`,
  );

  writePhp(
    middlewareFile,
    `<?php
namespace App\\Http\\Middleware;

class TenantResolver
{
    public function handle($request, $next)
    {
        return $next($request);
    }
}
`,
  );

  writePhp(
    dtoFile,
    `<?php
namespace App\\DTOs;

class CreateUserDto
{
    public function __construct(public string $email) {}
}
`,
  );

  writePhp(
    enumFile,
    `<?php
namespace App\\Enums;

enum UserStatus: string
{
    case Active = 'active';
}
`,
  );

  const payload = analyzeFiles({
    root,
    files: [listenerFile, middlewareFile, dtoFile, enumFile],
    testBasenames: new Set(),
    thresholds: {},
  });

  assert.equal(payload['app/Listeners/UserRegisteredListener.php'].kind, 'listener');
  assert.equal(payload['app/Http/Middleware/TenantResolver.php'].kind, 'middleware');
  assert.equal(payload['app/DTOs/CreateUserDto.php'].kind, 'dto');
  assert.equal(payload['app/Enums/UserStatus.php'].kind, 'enum');
});

test('analyzer classifies http resources and flags relation access without whenLoaded guard', () => {
  const root = makeTmpRoot();
  const resourceFile = path.join(root, 'app', 'Http', 'Resources', 'UserResource.php');

  writePhp(
    resourceFile,
    `<?php
namespace App\\Http\\Resources;

use Illuminate\\Http\\Resources\\Json\\JsonResource;

class UserResource extends JsonResource
{
    public function toArray($request): array
    {
        return [
            'id' => $this->id,
            'wallet_balance' => $this->wallet->balance,
        ];
    }
}
`,
  );

  const payload = analyzeFiles({
    root,
    files: [resourceFile],
    testBasenames: new Set(),
    thresholds: {},
  });

  const entry = payload['app/Http/Resources/UserResource.php'];
  assert.ok(entry, 'resource entry should exist');
  assert.equal(entry.kind, 'http-resource');
  assert.equal(entry.metrics.httpResources, 1);
  assert.equal(entry.metrics.httpResourcesWithoutWhenLoaded, 1);
  assert.equal(entry.metrics.httpResourceRelationsWithoutWhenLoaded, 1);
  const types = new Set((entry.violations || []).map((item) => item.type));
  assert.ok(types.has('resource-relation-without-whenloaded'));
});

test('analyzer classifies traits and contracts with dedicated checks', () => {
  const root = makeTmpRoot();
  const traitFile = path.join(root, 'app', 'Traits', 'BillingTrait.php');
  const contractFile = path.join(root, 'app', 'Contracts', 'BillingGatewayInterface.php');

  writePhp(
    traitFile,
    `<?php
namespace App\\Traits;

use App\\Models\\Wallet;
use App\\Services\\BillingService;
use App\\Services\\WalletService;
use App\\Services\\LedgerService;
use App\\Services\\RiskService;
use App\\Services\\AuditService;
use App\\Services\\CouponService;
use App\\Services\\CommissionService;
use App\\Services\\NotificationService;
use App\\Services\\WithdrawalService;

trait BillingTrait
{
    public function applyCharge(int $walletId): void
    {
        Wallet::query()->where('id', $walletId)->increment('balance', 1);
    }
}
`,
  );

  writePhp(
    contractFile,
    `<?php
namespace App\\Contracts;

interface BillingGatewayInterface
{
    public function charge(int $amount): bool;
}
`,
  );

  const payload = analyzeFiles({
    root,
    files: [traitFile, contractFile],
    testBasenames: new Set(),
    thresholds: {},
  });

  const traitEntry = payload['app/Traits/BillingTrait.php'];
  const contractEntry = payload['app/Contracts/BillingGatewayInterface.php'];

  assert.ok(traitEntry, 'trait entry should exist');
  assert.ok(contractEntry, 'contract entry should exist');

  assert.equal(traitEntry.kind, 'trait');
  assert.equal(traitEntry.metrics.traits, 1);
  assert.equal(traitEntry.metrics.highCouplingTraits, 1);
  assert.equal(traitEntry.metrics.traitsWithDirectModel, 1);
  const traitTypes = new Set((traitEntry.violations || []).map((item) => item.type));
  assert.ok(traitTypes.has('trait-high-coupling'));
  assert.ok(traitTypes.has('trait-direct-model'));

  assert.equal(contractEntry.kind, 'contract');
  assert.equal(contractEntry.metrics.contracts, 1);
  assert.equal(contractEntry.metrics.contractsWithoutContainerBinding, 1);
  const contractTypes = new Set((contractEntry.violations || []).map((item) => item.type));
  assert.ok(contractTypes.has('contract-without-container-binding'));
});

test('analyzer detects contract bindings declared in providers', () => {
  const root = makeTmpRoot();
  const contractFile = path.join(root, 'app', 'Contracts', 'SmsProviderInterface.php');
  const providerFile = path.join(root, 'app', 'Providers', 'CommunicationServiceProvider.php');

  writePhp(
    contractFile,
    `<?php
namespace App\\Contracts;

interface SmsProviderInterface
{
    public function send(string $to, string $body): bool;
}
`,
  );

  writePhp(
    providerFile,
    `<?php
namespace App\\Providers;

use App\\Contracts\\SmsProviderInterface;
use App\\Services\\TwilioSmsProvider;
use Illuminate\\Support\\ServiceProvider;

class CommunicationServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(SmsProviderInterface::class, TwilioSmsProvider::class);
    }
}
`,
  );

  const payload = analyzeFiles({
    root,
    files: [contractFile, providerFile],
    testBasenames: new Set(),
    thresholds: {},
  });

  const contractEntry = payload['app/Contracts/SmsProviderInterface.php'];
  assert.ok(contractEntry, 'contract entry should exist');
  assert.equal(contractEntry.metrics.contracts, 1);
  assert.equal(contractEntry.metrics.contractsWithContainerBinding, 1);
  assert.equal(contractEntry.metrics.contractsWithoutContainerBinding, 0);
});
