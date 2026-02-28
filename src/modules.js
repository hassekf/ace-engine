const fs = require('node:fs');
const path = require('node:path');

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return null;
  }
}

function getComposerDependencyVersions(root) {
  const map = new Map();
  const lockPath = path.join(root, 'composer.lock');
  const lock = readJsonIfExists(lockPath);
  if (lock && Array.isArray(lock.packages)) {
    [...(lock.packages || []), ...(lock['packages-dev'] || [])].forEach((pkg) => {
      if (pkg?.name && pkg?.version) {
        map.set(pkg.name, pkg.version);
      }
    });
  }

  if (map.size > 0) {
    return map;
  }

  const composerPath = path.join(root, 'composer.json');
  const composer = readJsonIfExists(composerPath);
  if (!composer) {
    return map;
  }

  Object.entries(composer.require || {}).forEach(([name, version]) => {
    map.set(name, String(version));
  });
  return map;
}

const MODULE_REGISTRY = [
  {
    id: 'laravel-core',
    title: 'Laravel Core',
    description: 'Base framework checks and security posture for Laravel projects.',
    docs: [
      { title: 'Laravel Security', url: 'https://laravel.com/docs/11.x/security' },
      { title: 'Laravel Authorization', url: 'https://laravel.com/docs/11.x/authorization' },
      { title: 'Laravel Validation', url: 'https://laravel.com/docs/11.x/validation' },
    ],
    scopeHints: [
      'app/Http/Controllers',
      'app/Http/Middleware',
      'app/Policies',
      'routes',
      'config',
    ],
    llmPrompt:
      'Revisar docs oficiais de Laravel para autorização, validação e hardening, propondo checks objetivos para escopo atual.',
    detect({ composerVersions }) {
      const hasLaravel = composerVersions.has('laravel/framework');
      const hasIlluminate =
        composerVersions.has('illuminate/support') || composerVersions.has('illuminate/routing');
      return {
        enabled: hasLaravel || hasIlluminate,
        reason: hasLaravel
          ? 'laravel/framework detectado'
          : hasIlluminate
            ? 'pacotes illuminate detectados'
            : 'sem sinais de Laravel',
      };
    },
  },
  {
    id: 'filament',
    title: 'Filament',
    description: 'Panel, resources, pages and widgets authorization/security checks.',
    docs: [
      { title: 'Filament Docs', url: 'https://filamentphp.com/docs' },
      { title: 'Filament API Page', url: 'https://filamentphp.com/api/3.x/Filament/Pages/Page.html' },
      { title: 'Filament API Widget', url: 'https://filamentphp.com/api/2.x/Filament/Widgets/Widget.html' },
    ],
    scopeHints: ['app/Filament', 'routes', 'config/filament.php', 'app/Providers'],
    llmPrompt:
      'Extrair padrões de autorização para Filament Pages/Widgets/Resources e sugerir cobertura mínima de acesso/visibilidade.',
    detect({ composerVersions, metrics, root }) {
      const enabled =
        composerVersions.has('filament/filament') ||
        Number(metrics.filamentResources || 0) > 0 ||
        Number(metrics.filamentPages || 0) > 0 ||
        Number(metrics.filamentWidgets || 0) > 0 ||
        fs.existsSync(path.join(root, 'app', 'Filament'));

      return {
        enabled,
        reason: enabled ? 'superfície Filament detectada' : 'sem sinais de Filament',
      };
    },
  },
  {
    id: 'livewire',
    title: 'Livewire',
    description: 'Component input tampering and locked properties checks.',
    docs: [
      { title: 'Livewire Security', url: 'https://livewire.laravel.com/docs/security' },
      { title: 'Livewire Locked Properties', url: 'https://livewire.laravel.com/docs/3.x/locked' },
    ],
    scopeHints: ['app/Livewire', 'resources/views/livewire', 'routes', 'app/Http/Controllers'],
    llmPrompt:
      'Revisar superfície Livewire para propriedades públicas, mutações e controles de autorização, propondo checks automáticos.',
    detect({ composerVersions, metrics, root }) {
      const enabled =
        composerVersions.has('livewire/livewire') ||
        Number(metrics.livewireComponents || 0) > 0 ||
        fs.existsSync(path.join(root, 'app', 'Livewire'));

      return {
        enabled,
        reason: enabled ? 'superfície Livewire detectada' : 'sem sinais de Livewire',
      };
    },
  },
  {
    id: 'sanctum',
    title: 'Laravel Sanctum',
    description: 'API token and guard usage checks for Sanctum-based APIs.',
    docs: [
      { title: 'Sanctum', url: 'https://laravel.com/docs/11.x/sanctum' },
      { title: 'Authentication', url: 'https://laravel.com/docs/11.x/authentication' },
    ],
    scopeHints: ['routes/api.php', 'app/Models', 'config/sanctum.php', 'app/Http/Middleware'],
    llmPrompt:
      'Avaliar cobertura de auth:sanctum, abilities e uso de HasApiTokens com foco em endpoints sensíveis.',
    detect({ composerVersions, root }) {
      const enabled =
        composerVersions.has('laravel/sanctum') || fs.existsSync(path.join(root, 'config', 'sanctum.php'));
      return {
        enabled,
        reason: enabled ? 'Sanctum detectado em dependência/config' : 'sem sinais de Sanctum',
      };
    },
  },
  {
    id: 'spatie-permission',
    title: 'Spatie Laravel Permission',
    description: 'Role/permission enforcement checks for authorization model.',
    docs: [
      { title: 'Spatie Permission Docs', url: 'https://spatie.be/docs/laravel-permission/v6/introduction' },
      { title: 'Spatie Basic Usage', url: 'https://spatie.be/docs/laravel-permission/v6/basic-usage/basic-usage' },
    ],
    scopeHints: ['app/Models', 'routes', 'app/Policies', 'config/permission.php'],
    llmPrompt:
      'Verificar enforcement de roles/permissões (middleware + checks + policies) com cobertura mínima por superfície crítica.',
    detect({ composerVersions, root }) {
      const enabled =
        composerVersions.has('spatie/laravel-permission') || fs.existsSync(path.join(root, 'config', 'permission.php'));
      return {
        enabled,
        reason: enabled ? 'Spatie Permission detectado em dependência/config' : 'sem sinais de Spatie Permission',
      };
    },
  },
  {
    id: 'horizon',
    title: 'Laravel Horizon',
    description: 'Queue dashboard and operational protection checks for Horizon.',
    docs: [
      { title: 'Laravel Horizon', url: 'https://laravel.com/docs/11.x/horizon' },
    ],
    scopeHints: ['app/Providers/HorizonServiceProvider.php', 'config/horizon.php', 'routes'],
    llmPrompt:
      'Validar proteção do dashboard Horizon (gate/middleware) e práticas operacionais de fila.',
    detect({ composerVersions, root }) {
      const enabled =
        composerVersions.has('laravel/horizon') || fs.existsSync(path.join(root, 'config', 'horizon.php'));
      return {
        enabled,
        reason: enabled ? 'Horizon detectado em dependência/config' : 'sem sinais de Horizon',
      };
    },
  },
];

function detectProjectModules({ root, metrics = {}, composerVersions = null }) {
  const versions = composerVersions || getComposerDependencyVersions(root);
  return MODULE_REGISTRY.map((module) => {
    const result = module.detect({
      root,
      metrics,
      composerVersions: versions,
    });
    return {
      id: module.id,
      title: module.title,
      description: module.description,
      enabled: Boolean(result?.enabled),
      reason: result?.reason || '',
      docs: module.docs || [],
      scopeHints: module.scopeHints || [],
      llmPrompt: module.llmPrompt || '',
    };
  });
}

function buildModuleScopeDraft(modules) {
  return (modules || [])
    .filter((module) => module.enabled)
    .map((module) => ({
      moduleId: module.id,
      moduleTitle: module.title,
      scopeHints: module.scopeHints || [],
      docs: module.docs || [],
      llmPrompt: module.llmPrompt || '',
    }));
}

module.exports = {
  MODULE_REGISTRY,
  getComposerDependencyVersions,
  detectProjectModules,
  buildModuleScopeDraft,
};
