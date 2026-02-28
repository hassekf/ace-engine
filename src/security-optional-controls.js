function controlById(controlCatalog, id) {
  return controlCatalog.find((item) => item.id === id);
}

function appendOptionalStackControls({
  controls,
  controlCatalog,
  createControl,
  metrics,
  violations,
  hasFilamentSurface,
  hasLivewireSurface,
  hasSpatiePermission,
  hasSanctum,
  hasHorizon,
  stackSignals,
  composerVersions,
  statusFromRatio,
  findViolationFiles,
  evaluateVersionFloor,
}) {
  const filamentPageCount = Number(metrics.filamentPages || 0);
  const filamentWidgetCount = Number(metrics.filamentWidgets || 0);
  const filamentPagesWithAuth = Number(metrics.filamentPagesWithAuth || 0);
  const filamentWidgetsWithAuth = Number(metrics.filamentWidgetsWithAuth || 0);
  const filamentPageAuthRatio = filamentPageCount > 0 ? filamentPagesWithAuth / filamentPageCount : null;
  const filamentWidgetAuthRatio = filamentWidgetCount > 0 ? filamentWidgetsWithAuth / filamentWidgetCount : null;

  const livewireComponents = Number(metrics.livewireComponents || 0);
  const livewirePublicProperties = Number(metrics.livewirePublicProperties || 0);
  const livewireLockedProperties = Number(metrics.livewireLockedProperties || 0);
  const livewireLockRatio =
    livewirePublicProperties > 0 ? livewireLockedProperties / livewirePublicProperties : null;

  if (hasSpatiePermission) {
    const spatieSignals = stackSignals.spatiePermission;
    const hasRoleBinding = spatieSignals.modelsWithHasRoles > 0;
    const hasEnforcementSignal =
      spatieSignals.routeFilesWithPermissionMiddleware > 0 || spatieSignals.permissionCheckCalls > 0;
    controls.push(
      createControl(controlById(controlCatalog, 'spatie.permission_enforcement'), {
        status:
          hasRoleBinding && hasEnforcementSignal ? 'pass' : hasRoleBinding || hasEnforcementSignal ? 'warning' : 'fail',
        message: `Spatie signals — models com HasRoles: ${spatieSignals.modelsWithHasRoles}, rotas com middleware role/permission: ${spatieSignals.routeFilesWithPermissionMiddleware}, checks: ${spatieSignals.permissionCheckCalls}.`,
        recommendation: 'Garanta `HasRoles` nos modelos alvo e enforce via middleware/policies/checks no ponto de acesso.',
        evidence: {
          modelsWithHasRoles: spatieSignals.modelsWithHasRoles,
          routeFilesWithPermissionMiddleware: spatieSignals.routeFilesWithPermissionMiddleware,
          permissionCheckCalls: spatieSignals.permissionCheckCalls,
        },
      }),
    );
  }

  if (hasSanctum) {
    const sanctumSignals = stackSignals.sanctum;
    const hasGuardSignal = sanctumSignals.routeFilesWithSanctumGuard > 0;
    const hasTokenModelSignal = sanctumSignals.modelsWithApiTokens > 0;
    controls.push(
      createControl(controlById(controlCatalog, 'sanctum.api_guard_usage'), {
        status: hasGuardSignal && hasTokenModelSignal ? 'pass' : hasGuardSignal || hasTokenModelSignal ? 'warning' : 'fail',
        message: `Sanctum signals — rotas com auth:sanctum: ${sanctumSignals.routeFilesWithSanctumGuard}, models com HasApiTokens: ${sanctumSignals.modelsWithApiTokens}, uso de abilities: ${sanctumSignals.routeFilesWithSanctumAbilities}.`,
        recommendation: 'Proteja APIs sensíveis com `auth:sanctum` e confirme `HasApiTokens` nos modelos emissores de token.',
        evidence: {
          routeFilesWithSanctumGuard: sanctumSignals.routeFilesWithSanctumGuard,
          modelsWithApiTokens: sanctumSignals.modelsWithApiTokens,
          routeFilesWithSanctumAbilities: sanctumSignals.routeFilesWithSanctumAbilities,
        },
      }),
    );
  }

  if (hasHorizon) {
    const horizonSignals = stackSignals.horizon;
    controls.push(
      createControl(controlById(controlCatalog, 'horizon.dashboard_protection'), {
        status: horizonSignals.hasDashboardAuthSignal ? 'pass' : horizonSignals.hasProvider || horizonSignals.hasConfig ? 'warning' : 'fail',
        message: `Horizon signals — provider: ${horizonSignals.hasProvider ? 'sim' : 'não'}, config: ${horizonSignals.hasConfig ? 'sim' : 'não'}, auth signals: ${horizonSignals.authSignalCount}.`,
        recommendation: 'Defina proteção explícita do dashboard (Gate viewHorizon/Horizon::auth e middleware forte).',
        evidence: {
          hasProvider: horizonSignals.hasProvider,
          hasConfig: horizonSignals.hasConfig,
          authSignalCount: horizonSignals.authSignalCount,
        },
      }),
    );
  }

  if (hasLivewireSurface) {
    controls.push(
      createControl(controlById(controlCatalog, 'livewire.locked_properties'), {
        status:
          livewirePublicProperties === 0
            ? 'pass'
            : livewireLockRatio >= 0.35
              ? 'pass'
              : livewireLockRatio >= 0.15
                ? 'warning'
                : 'fail',
        message: `Livewire public props: ${livewirePublicProperties}, locked: ${livewireLockedProperties}.`,
        recommendation: 'Use #[Locked] para campos imutáveis e valide/autorize todas mutações.',
        evidence: {
          livewireComponents,
          livewirePublicProperties,
          livewireLockedProperties,
        },
      }),
    );
  }

  const canAccessPanelCalls = Number(metrics.canAccessPanelCalls || 0);
  if (hasFilamentSurface) {
    controls.push(
      createControl(controlById(controlCatalog, 'filament.panel_access'), {
        status: canAccessPanelCalls > 0 ? 'pass' : 'warning',
        message: canAccessPanelCalls > 0
          ? 'Sinal de canAccessPanel() detectado.'
          : 'Não houve sinal de canAccessPanel() no escopo analisado.',
        recommendation: 'Assegure canAccessPanel + policies em Resources/Pages/Actions.',
        evidence: {
          filamentResources: Number(metrics.filamentResources || 0),
          filamentPages: Number(metrics.filamentPages || 0),
          filamentWidgets: Number(metrics.filamentWidgets || 0),
          canAccessPanelCalls,
        },
      }),
    );

    controls.push(
      createControl(controlById(controlCatalog, 'filament.pages_authorization'), {
        status: filamentPageCount === 0 ? 'unknown' : statusFromRatio({
          ratio: filamentPageAuthRatio,
          pass: 0.78,
          warning: 0.45,
        }),
        message:
          filamentPageCount === 0
            ? 'Sem Filament Pages detectadas no escopo.'
            : `Filament Pages com sinal de autorização: ${filamentPagesWithAuth}/${filamentPageCount}.`,
        recommendation:
          'Padronize `canAccess()`/authorize/policy para cada Page sensível exposta no painel.',
        evidence: {
          filamentPages: filamentPageCount,
          filamentPagesWithAuth,
          ratio: filamentPageAuthRatio,
          files: findViolationFiles(violations, 'filament-page-missing-authz'),
        },
      }),
    );

    controls.push(
      createControl(controlById(controlCatalog, 'filament.widgets_authorization'), {
        status: filamentWidgetCount === 0 ? 'unknown' : statusFromRatio({
          ratio: filamentWidgetAuthRatio,
          pass: 0.7,
          warning: 0.35,
        }),
        message:
          filamentWidgetCount === 0
            ? 'Sem Filament Widgets detectados no escopo.'
            : `Filament Widgets com sinal de autorização/visibilidade: ${filamentWidgetsWithAuth}/${filamentWidgetCount}.`,
        recommendation:
          'Implemente `canView()` e/ou guardas server-side em widgets que exibem dados sensíveis.',
        evidence: {
          filamentWidgets: filamentWidgetCount,
          filamentWidgetsWithAuth,
          ratio: filamentWidgetAuthRatio,
          files: findViolationFiles(violations, 'filament-widget-missing-authz'),
        },
      }),
    );
  }

  const livewireVersion = composerVersions.get('livewire/livewire');
  const livewireFloor = evaluateVersionFloor({
    currentVersion: livewireVersion,
    floors: {
      3: '3.6.4',
    },
  });
  if (livewireVersion || hasLivewireSurface) {
    controls.push(
      createControl(controlById(controlCatalog, 'dependencies.livewire_security_floor'), {
        status: livewireVersion ? livewireFloor.status : 'unknown',
        message: livewireVersion
          ? `livewire/livewire=${livewireVersion}. ${livewireFloor.message}`
          : 'livewire/livewire não encontrado no lock/composer.',
        recommendation: 'Atualize Livewire para faixa sem bypass de auth/upload conhecidos.',
        evidence: {
          package: 'livewire/livewire',
          version: livewireVersion || null,
        },
      }),
    );
  }

  const filamentVersion = composerVersions.get('filament/filament');
  const filamentFloor = evaluateVersionFloor({
    currentVersion: filamentVersion,
    floors: {
      3: '3.3.12',
      4: '4.0.0',
    },
  });
  if (filamentVersion || hasFilamentSurface) {
    controls.push(
      createControl(controlById(controlCatalog, 'dependencies.filament_security_floor'), {
        status: filamentVersion ? filamentFloor.status : 'unknown',
        message: filamentVersion
          ? `filament/filament=${filamentVersion}. ${filamentFloor.message}`
          : 'filament/filament não encontrado no lock/composer.',
        recommendation: 'Mantenha Filament atualizado para corrigir bypasses/exports inseguros.',
        evidence: {
          package: 'filament/filament',
          version: filamentVersion || null,
        },
      }),
    );
  }

  return {
    filamentPageCount,
    filamentWidgetCount,
    filamentPagesWithAuth,
    filamentWidgetsWithAuth,
  };
}

module.exports = {
  appendOptionalStackControls,
};
