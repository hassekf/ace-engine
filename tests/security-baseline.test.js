const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { analyzeFiles } = require('../src/analyzer');
const { aggregateFromFileIndex } = require('../src/coverage');
const { evaluateSecurityBaseline } = require('../src/security-baseline');

function makeTmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ace-security-baseline-test-'));
}

function writePhp(filePath, body) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, body, 'utf8');
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function runBaseline(root, files) {
  const fileIndex = analyzeFiles({
    root,
    files,
    testBasenames: new Set(),
    thresholds: {},
  });
  const aggregate = aggregateFromFileIndex(fileIndex);
  return evaluateSecurityBaseline({
    root,
    metrics: aggregate.metrics,
    violations: aggregate.violations,
    fileIndex,
    auditOptions: {
      composer: false,
      npm: false,
    },
  });
}

function controlById(baseline, id) {
  return (baseline.controls || []).find((item) => item.id === id);
}

test('security baseline computes policy-model and gate coverage', () => {
  const root = makeTmpRoot();
  const modelUser = path.join(root, 'app', 'Models', 'User.php');
  const modelWallet = path.join(root, 'app', 'Models', 'Wallet.php');
  const userPolicy = path.join(root, 'app', 'Policies', 'UserPolicy.php');
  const authProvider = path.join(root, 'app', 'Providers', 'AuthServiceProvider.php');

  writePhp(
    modelUser,
    `<?php
namespace App\\Models;

class User extends \\\\Illuminate\\\\Database\\\\Eloquent\\\\Model {}
`,
  );

  writePhp(
    modelWallet,
    `<?php
namespace App\\Models;

class Wallet extends \\\\Illuminate\\\\Database\\\\Eloquent\\\\Model {}
`,
  );

  writePhp(
    userPolicy,
    `<?php
namespace App\\Policies;

class UserPolicy {}
`,
  );

  writePhp(
    authProvider,
    `<?php
namespace App\\Providers;

use App\\Models\\Wallet;
use App\\Policies\\WalletPolicy;
use Illuminate\\Support\\Facades\\Gate;

class AuthServiceProvider extends \\\\Illuminate\\\\Foundation\\\\Support\\\\Providers\\\\AuthServiceProvider
{
    protected $policies = [
        Wallet::class => WalletPolicy::class,
    ];

    public function boot(): void
    {
        Gate::define('view-admin-dashboard', fn () => true);
    }
}
`,
  );

  const baseline = runBaseline(root, [modelUser, modelWallet, userPolicy, authProvider]);
  const policyCoverage = controlById(baseline, 'authz.policy_model_coverage');
  const gateCoverage = controlById(baseline, 'authz.gate_definition_coverage');

  assert.ok(policyCoverage, 'policy coverage control should exist');
  assert.ok(gateCoverage, 'gate coverage control should exist');
  assert.equal(policyCoverage.status, 'pass');
  assert.equal(policyCoverage.evidence.modelCount, 2);
  assert.equal(policyCoverage.evidence.coveredModelCount, 2);
  assert.equal(gateCoverage.status, 'pass');
  assert.equal(gateCoverage.evidence.gateDefinitions, 1);
});

test('security baseline computes separate Filament Pages/Widgets authorization scores', () => {
  const root = makeTmpRoot();
  const page = path.join(root, 'app', 'Filament', 'Admin', 'Pages', 'OpenPage.php');
  const widget = path.join(root, 'app', 'Filament', 'Admin', 'Widgets', 'SecureWidget.php');

  writePhp(
    page,
    `<?php
namespace App\\Filament\\Admin\\Pages;

class OpenPage extends \\\\Filament\\\\Pages\\\\Page {}
`,
  );

  writePhp(
    widget,
    `<?php
namespace App\\Filament\\Admin\\Widgets;

class SecureWidget extends \\\\Filament\\\\Widgets\\\\Widget {
    public static function canView(): bool { return true; }
}
`,
  );

  const baseline = runBaseline(root, [page, widget]);
  const pagesControl = controlById(baseline, 'filament.pages_authorization');
  const widgetsControl = controlById(baseline, 'filament.widgets_authorization');

  assert.ok(pagesControl, 'pages control should exist');
  assert.ok(widgetsControl, 'widgets control should exist');
  assert.equal(pagesControl.status, 'fail');
  assert.equal(widgetsControl.status, 'pass');
  assert.equal(baseline.filamentScores.pages.status, 'fail');
  assert.equal(baseline.filamentScores.widgets.status, 'pass');
});

test('security baseline does not include Filament/Livewire controls when stack is absent', () => {
  const root = makeTmpRoot();
  const model = path.join(root, 'app', 'Models', 'PlainModel.php');

  writePhp(
    model,
    `<?php
namespace App\\Models;

class PlainModel extends \\\\Illuminate\\\\Database\\\\Eloquent\\\\Model {}
`,
  );

  const baseline = runBaseline(root, [model]);
  const controlIds = new Set((baseline.controls || []).map((item) => item.id));

  assert.equal(controlIds.has('livewire.locked_properties'), false);
  assert.equal(controlIds.has('filament.panel_access'), false);
  assert.equal(controlIds.has('filament.pages_authorization'), false);
  assert.equal(controlIds.has('filament.widgets_authorization'), false);
  assert.equal(controlIds.has('dependencies.livewire_security_floor'), false);
  assert.equal(controlIds.has('dependencies.filament_security_floor'), false);
  assert.equal(controlIds.has('spatie.permission_enforcement'), false);
  assert.equal(controlIds.has('sanctum.api_guard_usage'), false);
  assert.equal(controlIds.has('horizon.dashboard_protection'), false);

  assert.equal(baseline.filamentScores.pages, null);
  assert.equal(baseline.filamentScores.widgets, null);
  assert.equal(Array.isArray(baseline.metadata.modules), true);
  assert.equal(Array.isArray(baseline.metadata.moduleScopeDraft), true);
});

test('security baseline includes optional stack controls only when package is present', () => {
  const root = makeTmpRoot();
  const composerJson = path.join(root, 'composer.json');
  const userModel = path.join(root, 'app', 'Models', 'User.php');
  const apiRoutes = path.join(root, 'routes', 'api.php');
  const horizonProvider = path.join(root, 'app', 'Providers', 'HorizonServiceProvider.php');
  const horizonConfig = path.join(root, 'config', 'horizon.php');
  const sanctumConfig = path.join(root, 'config', 'sanctum.php');

  writeJson(composerJson, {
    require: {
      'spatie/laravel-permission': '^6.0',
      'laravel/sanctum': '^4.0',
      'laravel/horizon': '^5.0',
    },
  });

  writePhp(
    userModel,
    `<?php
namespace App\\Models;

use Laravel\\Sanctum\\HasApiTokens;
use Spatie\\Permission\\Traits\\HasRoles;

class User extends \\\\Illuminate\\\\Database\\\\Eloquent\\\\Model
{
    use HasApiTokens;
    use HasRoles;
}
`,
  );

  writePhp(
    apiRoutes,
    `<?php
use Illuminate\\Support\\Facades\\Route;

Route::middleware(['auth:sanctum', 'role:admin'])->get('/me', fn () => response()->json([]));
`,
  );

  writePhp(
    horizonProvider,
    `<?php
namespace App\\Providers;

use Illuminate\\Support\\Facades\\Gate;

class HorizonServiceProvider extends \\\\Illuminate\\\\Support\\\\ServiceProvider
{
    public function boot(): void
    {
        Gate::define('viewHorizon', fn () => true);
    }
}
`,
  );

  writePhp(horizonConfig, "<?php return ['middleware' => ['web', 'auth']];\n");
  writePhp(sanctumConfig, "<?php return ['stateful' => ['localhost']];\n");

  const baseline = runBaseline(root, [userModel, apiRoutes, horizonProvider]);
  const spatieControl = controlById(baseline, 'spatie.permission_enforcement');
  const sanctumControl = controlById(baseline, 'sanctum.api_guard_usage');
  const horizonControl = controlById(baseline, 'horizon.dashboard_protection');

  assert.ok(spatieControl, 'spatie control should exist');
  assert.ok(sanctumControl, 'sanctum control should exist');
  assert.ok(horizonControl, 'horizon control should exist');

  assert.equal(spatieControl.status, 'pass');
  assert.equal(sanctumControl.status, 'pass');
  assert.equal(horizonControl.status, 'pass');
  assert.equal(baseline.metadata.optionalStacks.spatiePermission, true);
  assert.equal(baseline.metadata.optionalStacks.sanctum, true);
  assert.equal(baseline.metadata.optionalStacks.horizon, true);
});

test('security baseline integrates composer runtime audit vulnerabilities', () => {
  const root = makeTmpRoot();
  writeJson(path.join(root, 'composer.json'), {
    require: {
      'laravel/framework': '^11.0',
    },
  });
  writeJson(path.join(root, 'composer.lock'), {
    packages: [],
    'packages-dev': [],
  });

  const baseline = evaluateSecurityBaseline({
    root,
    metrics: {},
    violations: [],
    fileIndex: {},
    auditOptions: {
      composer: true,
      npm: false,
      timeoutMs: 5000,
      maxEntries: 20,
    },
    commandRunner(command) {
      if (command !== 'composer') {
        return { status: 0, stdout: '{}', stderr: '' };
      }
      return {
        status: 1,
        stdout: JSON.stringify({
          advisories: {
            'laravel/framework': [
              {
                advisoryId: 'PKSA-123',
                title: 'Test advisory',
                cve: 'CVE-2026-0001',
                severity: 'high',
                link: 'https://example.test/advisory',
                affectedVersions: '<11.50.0',
              },
            ],
          },
        }),
        stderr: '',
      };
    },
  });

  const runtimeControl = controlById(baseline, 'dependencies.composer_runtime_audit');
  assert.ok(runtimeControl, 'runtime composer audit control should exist');
  assert.equal(runtimeControl.status, 'fail');
  assert.equal(runtimeControl.evidence.vulnerabilities, 1);
  assert.equal(runtimeControl.evidence.high, 1);
  assert.equal(baseline.metadata.dependencyAudits.composer.summary.total, 1);
  assert.equal(baseline.metadata.dependencyAudits.composer.vulnerabilities[0].cve, 'CVE-2026-0001');
});

test('security baseline only includes npm runtime audit when package manifests are present', () => {
  const rootWithoutNode = makeTmpRoot();
  writeJson(path.join(rootWithoutNode, 'composer.json'), {
    require: {
      'laravel/framework': '^11.0',
    },
  });
  writeJson(path.join(rootWithoutNode, 'composer.lock'), {
    packages: [],
    'packages-dev': [],
  });

  const withoutNodeBaseline = evaluateSecurityBaseline({
    root: rootWithoutNode,
    metrics: {},
    violations: [],
    fileIndex: {},
    auditOptions: {
      composer: false,
      npm: true,
    },
    commandRunner() {
      return { status: 0, stdout: '{}', stderr: '' };
    },
  });

  assert.equal(Boolean(controlById(withoutNodeBaseline, 'dependencies.npm_runtime_audit')), false);

  const rootWithNode = makeTmpRoot();
  writeJson(path.join(rootWithNode, 'composer.json'), {
    require: {
      'laravel/framework': '^11.0',
    },
  });
  writeJson(path.join(rootWithNode, 'composer.lock'), {
    packages: [],
    'packages-dev': [],
  });
  writeJson(path.join(rootWithNode, 'package.json'), {
    name: 'ace-runtime-test',
    private: true,
  });
  writeJson(path.join(rootWithNode, 'package-lock.json'), {
    name: 'ace-runtime-test',
    lockfileVersion: 3,
    packages: {},
  });

  const withNodeBaseline = evaluateSecurityBaseline({
    root: rootWithNode,
    metrics: {},
    violations: [],
    fileIndex: {},
    auditOptions: {
      composer: false,
      npm: true,
      timeoutMs: 5000,
    },
    commandRunner(command) {
      if (command !== 'npm') {
        return { status: 0, stdout: '{}', stderr: '' };
      }
      return {
        status: 1,
        stdout: JSON.stringify({
          vulnerabilities: {
            lodash: {
              name: 'lodash',
              severity: 'moderate',
              via: [
                {
                  source: 777001,
                  name: 'lodash',
                  title: 'Prototype pollution',
                  severity: 'moderate',
                  url: 'https://example.test/npm-advisory',
                  range: '<4.17.21',
                },
              ],
              fixAvailable: {
                name: 'lodash',
                version: '4.17.21',
                isSemVerMajor: false,
              },
            },
          },
        }),
        stderr: '',
      };
    },
  });

  const npmControl = controlById(withNodeBaseline, 'dependencies.npm_runtime_audit');
  assert.ok(npmControl, 'runtime npm audit control should exist');
  assert.equal(npmControl.status, 'warning');
  assert.equal(npmControl.evidence.vulnerabilities, 1);
  assert.equal(withNodeBaseline.metadata.dependencyAudits.npm.summary.total, 1);
});
