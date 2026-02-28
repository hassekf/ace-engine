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

test('analyzer ignores bounded get chains split across multiple lines', () => {
  const root = makeTmpRoot();
  const file = path.join(root, 'app', 'Services', 'PaginatedUsersService.php');

  writePhp(
    file,
    `<?php
namespace App\\Services;

use App\\Models\\User;

class PaginatedUsersService
{
    public function run()
    {
        $users = User::query()
            ->where('active', true)
            ->limit(100)
            ->get();

        $query = User::query()->where('active', true);
        $query->take(25);
        $alsoBounded = $query->get();

        return [$users, $alsoBounded];
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

  const entry = payload['app/Services/PaginatedUsersService.php'];
  assert.ok(entry, 'entry should exist');
  assert.equal(entry.metrics.unboundedGetCalls, 0);
  const types = new Set((entry.violations || []).map((item) => item.type));
  assert.ok(!types.has('unbounded-get-query'));
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

test('analyzer treats request input in bindings as safe raw SQL', () => {
  const root = makeTmpRoot();
  const file = path.join(root, 'app', 'Services', 'SafeRawBindingsService.php');

  writePhp(
    file,
    `<?php
namespace App\\Services;

use Illuminate\\Http\\Request;
use Illuminate\\Support\\Facades\\DB;

class SafeRawBindingsService
{
    public function run(Request $request, string $status)
    {
        $safeWithRequest = DB::selectRaw('SUM(amount) as total WHERE status = ?', [$request->input('status')]);
        $safeWithVariable = DB::selectRaw('SUM(amount) as total WHERE status = ?', [$status]);
        $unsafeDynamic = DB::raw($request->input('sql_fragment'));

        return [$safeWithRequest, $safeWithVariable, $unsafeDynamic];
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

  const entry = payload['app/Services/SafeRawBindingsService.php'];
  assert.ok(entry, 'entry should exist');
  assert.equal(entry.metrics.rawSqlCalls, 3);
  assert.equal(entry.metrics.safeRawSqlCalls, 2);
  assert.equal(entry.metrics.unsafeRawSqlCalls, 1);
  assert.equal(entry.metrics.dynamicRawSql, 1);
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

test('analyzer classifies provider, event, observer and notification kinds with dedicated checks', () => {
  const root = makeTmpRoot();
  const providerFile = path.join(root, 'app', 'Providers', 'CommunicationServiceProvider.php');
  const eventFile = path.join(root, 'app', 'Events', 'BalanceRecomputed.php');
  const observerFile = path.join(root, 'app', 'Observers', 'WalletObserver.php');
  const notificationFile = path.join(root, 'app', 'Notifications', 'PasswordCodeNotification.php');

  writePhp(
    providerFile,
    `<?php
namespace App\\Providers;

use App\\Contracts\\Communication\\SmsProviderInterface;
use Illuminate\\Support\\ServiceProvider;

class CommunicationServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // intentionally empty
    }
}
`,
  );

  writePhp(
    eventFile,
    `<?php
namespace App\\Events;

use App\\Models\\User;
use Illuminate\\Support\\Facades\\DB;

class BalanceRecomputed
{
    public function recalculate(): void
    {
        User::query()->count();
        DB::table('users')->update(['updated_at' => now()]);
    }
}
`,
  );

  writePhp(
    observerFile,
    `<?php
namespace App\\Observers;

use App\\Models\\Wallet;

class WalletObserver
{
    public function saved(Wallet $wallet): void
    {
        Wallet::query()->where('id', $wallet->id)->update(['updated_at' => now()]);
    }
}
`,
  );

  writePhp(
    notificationFile,
    `<?php
namespace App\\Notifications;

use Illuminate\\Notifications\\Notification;
use Illuminate\\Notifications\\Messages\\MailMessage;

class PasswordCodeNotification extends Notification
{
    public function __construct(private string $code) {}

    public function via($notifiable): array
    {
        return ['mail'];
    }

    public function toMail($notifiable): MailMessage
    {
        return (new MailMessage())->line('Code: '.$this->code);
    }
}
`,
  );

  const payload = analyzeFiles({
    root,
    files: [providerFile, eventFile, observerFile, notificationFile],
    testBasenames: new Set(),
    thresholds: {
      fatProviderLines: 8,
      fatEventLines: 8,
      fatObserverLines: 8,
      fatNotificationLines: 8,
    },
  });

  const providerEntry = payload['app/Providers/CommunicationServiceProvider.php'];
  const eventEntry = payload['app/Events/BalanceRecomputed.php'];
  const observerEntry = payload['app/Observers/WalletObserver.php'];
  const notificationEntry = payload['app/Notifications/PasswordCodeNotification.php'];

  assert.equal(providerEntry.kind, 'provider');
  assert.equal(eventEntry.kind, 'event');
  assert.equal(observerEntry.kind, 'observer');
  assert.equal(notificationEntry.kind, 'notification');

  assert.equal(providerEntry.metrics.providers, 1);
  assert.equal(providerEntry.metrics.fatProviders, 1);
  assert.equal(providerEntry.metrics.providersWithContractImportsWithoutBindings, 1);
  const providerTypes = new Set((providerEntry.violations || []).map((item) => item.type));
  assert.ok(providerTypes.has('fat-provider'));
  assert.ok(providerTypes.has('provider-contract-import-without-binding'));

  assert.equal(eventEntry.metrics.events, 1);
  assert.equal(eventEntry.metrics.eventsWithDirectModel, 1);
  assert.equal(eventEntry.metrics.eventsWithDatabaseAccess, 1);
  const eventTypes = new Set((eventEntry.violations || []).map((item) => item.type));
  assert.ok(eventTypes.has('event-direct-model'));
  assert.ok(eventTypes.has('event-db-access'));

  assert.equal(observerEntry.metrics.observers, 1);
  assert.equal(observerEntry.metrics.observersWithDirectModel, 1);
  const observerTypes = new Set((observerEntry.violations || []).map((item) => item.type));
  assert.ok(observerTypes.has('observer-direct-model'));

  assert.equal(notificationEntry.metrics.notifications, 1);
  assert.equal(notificationEntry.metrics.notificationsWithoutQueue, 1);
  assert.equal(notificationEntry.metrics.notificationsWithSensitiveData, 1);
  const notificationTypes = new Set((notificationEntry.violations || []).map((item) => item.type));
  assert.ok(notificationTypes.has('notification-without-queue'));
  assert.ok(notificationTypes.has('notification-sensitive-payload'));
});

test('analyzer classifies remaining support kinds and detects key risks', () => {
  const root = makeTmpRoot();
  const helperFile = path.join(root, 'app', 'Helpers', 'WalletHelper.php');
  const validatorFile = path.join(root, 'app', 'Validators', 'WalletValidator.php');
  const valueObjectFile = path.join(root, 'app', 'ValueObjects', 'Money.php');
  const channelFile = path.join(root, 'app', 'Channels', 'SmsChannel.php');
  const mailFile = path.join(root, 'app', 'Mail', 'PasswordResetMail.php');
  const loggingFile = path.join(root, 'app', 'Logging', 'AuditLogger.php');
  const formFile = path.join(root, 'app', 'Forms', 'Components', 'BigForm.php');
  const scopeFile = path.join(root, 'app', 'Scopes', 'CasinoScope.php');
  const httpKernelFile = path.join(root, 'app', 'Http', 'Kernel.php');
  const consoleKernelFile = path.join(root, 'app', 'Console', 'Kernel.php');
  const websocketFile = path.join(root, 'app', 'Websocket', 'BetsSocket.php');
  const filamentSupportFile = path.join(root, 'app', 'Filament', 'Admin', 'Themes', 'Lumos.php');
  const broadcastingFile = path.join(root, 'app', 'Broadcasting', 'SecureBroadcastMiddleware.php');
  const queueSupportFile = path.join(root, 'app', 'Queue', 'JobPayloadValidator.php');

  writePhp(
    helperFile,
    `<?php
namespace App\\Helpers;

use App\\Models\\Wallet;

class WalletHelper
{
    public static function touch(int $id): void
    {
        Wallet::query()->where('id', $id)->update(['updated_at' => now()]);
    }
}
`,
  );

  writePhp(
    validatorFile,
    `<?php
namespace App\\Validators;

class WalletValidator
{
    public function message(): string
    {
        return 'invalid';
    }
}
`,
  );

  writePhp(
    valueObjectFile,
    `<?php
namespace App\\ValueObjects;

class Money
{
    public int $amount;

    public function setAmount(int $amount): void
    {
        $this->amount = $amount;
    }
}
`,
  );

  writePhp(
    channelFile,
    `<?php
namespace App\\Channels;

class SmsChannel
{
    public function send($notifiable, $notification): void {}
}
`,
  );

  writePhp(
    mailFile,
    `<?php
namespace App\\Mail;

use Illuminate\\Mail\\Mailable;

class PasswordResetMail extends Mailable
{
    public function __construct(private string $token) {}

    public function build(): self
    {
        return $this->subject('Token: '.$this->token);
    }
}
`,
  );

  writePhp(
    loggingFile,
    `<?php
namespace App\\Logging;

use Illuminate\\Support\\Facades\\Log;

class AuditLogger
{
    public function write(string $token): void
    {
        Log::info('token='.$token);
    }
}
`,
  );

  writePhp(
    formFile,
    `<?php
namespace App\\Forms\\Components;

class BigForm
{
    public function render(): array
    {
        return [
            'a' => 1,
            'b' => 2,
            'c' => 3,
            'd' => 4,
            'e' => 5,
            'f' => 6,
            'g' => 7,
            'h' => 8,
            'i' => 9,
            'j' => 10,
        ];
    }
}
`,
  );

  writePhp(
    scopeFile,
    `<?php
namespace App\\Scopes;

class CasinoScope
{
    public function handle(): void {}
}
`,
  );

  writePhp(
    httpKernelFile,
    `<?php
namespace App\\Http;

class Kernel {}
`,
  );

  writePhp(
    consoleKernelFile,
    `<?php
namespace App\\Console;

class Kernel {}
`,
  );

  writePhp(
    websocketFile,
    `<?php
namespace App\\Websocket;

class BetsSocket
{
    public function connect(): void {}
}
`,
  );

  writePhp(
    filamentSupportFile,
    `<?php
namespace App\\Filament\\Admin\\Themes;

class Lumos {}
`,
  );

  writePhp(
    broadcastingFile,
    `<?php
namespace App\\Broadcasting;

class SecureBroadcastMiddleware
{
    public function handle($request, $next)
    {
        return $next($request);
    }
}
`,
  );

  writePhp(
    queueSupportFile,
    `<?php
namespace App\\Queue;

class JobPayloadValidator
{
    public function validate(array $payload): bool
    {
        return true;
    }
}
`,
  );

  const payload = analyzeFiles({
    root,
    files: [
      helperFile,
      validatorFile,
      valueObjectFile,
      channelFile,
      mailFile,
      loggingFile,
      formFile,
      scopeFile,
      httpKernelFile,
      consoleKernelFile,
      websocketFile,
      filamentSupportFile,
      broadcastingFile,
      queueSupportFile,
    ],
    testBasenames: new Set(),
    thresholds: {
      fatFormComponentLines: 10,
    },
  });

  assert.equal(payload['app/Helpers/WalletHelper.php'].kind, 'helper');
  assert.equal(payload['app/Validators/WalletValidator.php'].kind, 'validator');
  assert.equal(payload['app/ValueObjects/Money.php'].kind, 'value-object');
  assert.equal(payload['app/Channels/SmsChannel.php'].kind, 'channel');
  assert.equal(payload['app/Mail/PasswordResetMail.php'].kind, 'mail');
  assert.equal(payload['app/Logging/AuditLogger.php'].kind, 'logging');
  assert.equal(payload['app/Forms/Components/BigForm.php'].kind, 'form-component');
  assert.equal(payload['app/Scopes/CasinoScope.php'].kind, 'scope');
  assert.equal(payload['app/Http/Kernel.php'].kind, 'kernel');
  assert.equal(payload['app/Console/Kernel.php'].kind, 'kernel');
  assert.equal(payload['app/Websocket/BetsSocket.php'].kind, 'websocket');
  assert.equal(payload['app/Filament/Admin/Themes/Lumos.php'].kind, 'filament-support');
  assert.equal(payload['app/Broadcasting/SecureBroadcastMiddleware.php'].kind, 'broadcasting');
  assert.equal(payload['app/Queue/JobPayloadValidator.php'].kind, 'queue-support');

  const helperTypes = new Set((payload['app/Helpers/WalletHelper.php'].violations || []).map((item) => item.type));
  assert.ok(helperTypes.has('helper-direct-model'));

  const validatorTypes = new Set((payload['app/Validators/WalletValidator.php'].violations || []).map((item) => item.type));
  assert.ok(validatorTypes.has('validator-without-entrypoint'));

  const valueObjectTypes = new Set((payload['app/ValueObjects/Money.php'].violations || []).map((item) => item.type));
  assert.ok(valueObjectTypes.has('mutable-value-object'));

  const mailTypes = new Set((payload['app/Mail/PasswordResetMail.php'].violations || []).map((item) => item.type));
  assert.ok(mailTypes.has('mail-without-queue'));
  assert.ok(mailTypes.has('mail-sensitive-payload'));

  const loggingTypes = new Set((payload['app/Logging/AuditLogger.php'].violations || []).map((item) => item.type));
  assert.ok(loggingTypes.has('logging-sensitive-data'));

  const formTypes = new Set((payload['app/Forms/Components/BigForm.php'].violations || []).map((item) => item.type));
  assert.ok(formTypes.has('fat-form-component'));

  const scopeTypes = new Set((payload['app/Scopes/CasinoScope.php'].violations || []).map((item) => item.type));
  assert.ok(scopeTypes.has('scope-without-apply'));

  const websocketTypes = new Set((payload['app/Websocket/BetsSocket.php'].violations || []).map((item) => item.type));
  assert.ok(websocketTypes.has('websocket-without-auth-signal'));
});
