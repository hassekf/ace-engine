const fs = require('node:fs');
const path = require('node:path');

function readTextIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return '';
  }
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return '';
  }
}

function countMatches(content, regex) {
  if (!content) {
    return 0;
  }
  return Array.from(content.matchAll(regex)).length;
}

function collectStackSpecificSignals({
  root,
  hasSpatiePermission,
  hasSanctum,
  hasHorizon,
  listPhpFilesRecursive,
}) {
  const routeFiles = listPhpFilesRecursive(path.join(root, 'routes'));
  const modelFiles = listPhpFilesRecursive(path.join(root, 'app', 'Models'));

  const routeContents = routeFiles.map((filePath) => readTextIfExists(filePath));
  const modelContents = modelFiles.map((filePath) => readTextIfExists(filePath));

  const hasPermissionMiddlewarePattern = /(?:middleware\s*\(\s*[^)]*['"][^'"]*(?:role|permission):|->middleware\s*\(\s*['"][^'"]*(?:role|permission):)/i;
  const hasSanctumGuardPattern = /\bauth:sanctum\b/i;
  const hasSanctumAbilityPattern = /\b(?:ability|abilities):/i;

  const signals = {
    spatiePermission: {
      enabled: hasSpatiePermission,
      modelsWithHasRoles: 0,
      routeFilesWithPermissionMiddleware: 0,
      permissionCheckCalls: 0,
    },
    sanctum: {
      enabled: hasSanctum,
      modelsWithApiTokens: 0,
      routeFilesWithSanctumGuard: 0,
      routeFilesWithSanctumAbilities: 0,
    },
    horizon: {
      enabled: hasHorizon,
      hasConfig: false,
      hasProvider: false,
      hasDashboardAuthSignal: false,
      authSignalCount: 0,
    },
  };

  if (hasSpatiePermission || hasSanctum) {
    routeContents.forEach((content) => {
      if (hasSpatiePermission && hasPermissionMiddlewarePattern.test(content)) {
        signals.spatiePermission.routeFilesWithPermissionMiddleware += 1;
      }
      if (hasSanctum && hasSanctumGuardPattern.test(content)) {
        signals.sanctum.routeFilesWithSanctumGuard += 1;
      }
      if (hasSanctum && hasSanctumAbilityPattern.test(content)) {
        signals.sanctum.routeFilesWithSanctumAbilities += 1;
      }
    });

    modelContents.forEach((content) => {
      if (hasSpatiePermission && /\bHasRoles\b/.test(content)) {
        signals.spatiePermission.modelsWithHasRoles += 1;
      }
      if (hasSanctum && /\bHasApiTokens\b/.test(content)) {
        signals.sanctum.modelsWithApiTokens += 1;
      }
    });
  }

  if (hasSpatiePermission) {
    const appFiles = listPhpFilesRecursive(path.join(root, 'app'));
    const permissionCheckPattern = /->(?:hasRole|hasAnyRole|hasAllRoles|hasPermissionTo|hasAnyPermission|hasAllPermissions|can)\s*\(/g;
    appFiles.forEach((filePath) => {
      const content = readTextIfExists(filePath);
      signals.spatiePermission.permissionCheckCalls += countMatches(content, permissionCheckPattern);
    });
  }

  if (hasHorizon) {
    const horizonConfigPath = path.join(root, 'config', 'horizon.php');
    const horizonProviderPath = path.join(root, 'app', 'Providers', 'HorizonServiceProvider.php');
    const providerContent = readTextIfExists(horizonProviderPath);
    const configContent = readTextIfExists(horizonConfigPath);

    signals.horizon.hasConfig = Boolean(configContent);
    signals.horizon.hasProvider = Boolean(providerContent);
    signals.horizon.authSignalCount =
      countMatches(providerContent, /Gate::define\s*\(\s*['"]viewHorizon['"]/g) +
      countMatches(providerContent, /Horizon::auth\s*\(/g) +
      countMatches(configContent, /['"]middleware['"]\s*=>\s*\[[^\]]*['"]auth/g);
    signals.horizon.hasDashboardAuthSignal = signals.horizon.authSignalCount > 0;
  }

  return signals;
}

module.exports = {
  collectStackSpecificSignals,
};
