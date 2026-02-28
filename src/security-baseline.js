const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { nowIso } = require('./helpers');
const { getComposerDependencyVersions, detectProjectModules, buildModuleScopeDraft } = require('./modules');
const { collectStackSpecificSignals } = require('./security-stack-signals');
const { appendOptionalStackControls } = require('./security-optional-controls');

const BASELINE_ID = 'ace-laravel-filament-livewire-security-v1';
const BASELINE_VERSION = 1;

const STATUS_SCORE = {
  pass: 1,
  warning: 0.62,
  fail: 0,
  unknown: 0.45,
};

const STATUS_PRIORITY = {
  fail: 3,
  warning: 2,
  unknown: 1,
  pass: 0,
};

const SEVERITY_WEIGHT = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const MODE_WEIGHT = {
  automated: 0.7,
  semi: 0.2,
  manual: 0.1,
};

const CONTROL_CATALOG = [
  {
    id: 'input.validated_payload',
    title: 'Evitar payload cru em escrita',
    category: 'input-validation',
    severity: 'high',
    mode: 'automated',
    frequency: 'PR',
  },
  {
    id: 'input.form_request_adoption',
    title: 'Adoção consistente de FormRequest/DTO',
    category: 'input-validation',
    severity: 'medium',
    mode: 'automated',
    frequency: 'PR',
  },
  {
    id: 'sql.dynamic_raw_sql',
    title: 'Bloquear raw SQL dinâmico sem binding',
    category: 'injection',
    severity: 'high',
    mode: 'automated',
    frequency: 'PR',
  },
  {
    id: 'sql.raw_sql_review',
    title: 'Revisar pontos com SQL raw',
    category: 'injection',
    severity: 'medium',
    mode: 'automated',
    frequency: 'PR',
  },
  {
    id: 'orm.unbounded_get',
    title: 'Evitar consultas `->get()` sem limite/paginação',
    category: 'performance',
    severity: 'medium',
    mode: 'automated',
    frequency: 'PR',
  },
  {
    id: 'orm.eager_loading',
    title: 'Revisar risco de N+1 em acesso a relações',
    category: 'performance',
    severity: 'medium',
    mode: 'automated',
    frequency: 'PR',
  },
  {
    id: 'db.critical_transactions',
    title: 'Operações críticas com transação explícita',
    category: 'data-integrity',
    severity: 'high',
    mode: 'automated',
    frequency: 'PR',
  },
  {
    id: 'rce.dangerous_php_sinks',
    title: 'Evitar sinks perigosos (exec/unserialize/eval)',
    category: 'rce',
    severity: 'critical',
    mode: 'automated',
    frequency: 'PR',
  },
  {
    id: 'authz.server_side_checks',
    title: 'Autorização server-side em superfícies críticas',
    category: 'authorization',
    severity: 'high',
    mode: 'automated',
    frequency: 'PR',
  },
  {
    id: 'authz.policy_model_coverage',
    title: 'Cobertura Model ↔ Policy consistente',
    category: 'authorization',
    severity: 'high',
    mode: 'automated',
    frequency: 'PR',
  },
  {
    id: 'authz.gate_definition_coverage',
    title: 'Cobertura de Gates para ações não-model',
    category: 'authorization',
    severity: 'medium',
    mode: 'automated',
    frequency: 'PR',
  },
  {
    id: 'spatie.permission_enforcement',
    title: 'Spatie Permission com enforcement consistente',
    category: 'authorization',
    severity: 'high',
    mode: 'automated',
    frequency: 'PR',
  },
  {
    id: 'sanctum.api_guard_usage',
    title: 'Sanctum com guard/token usage consistente',
    category: 'api-security',
    severity: 'high',
    mode: 'automated',
    frequency: 'PR',
  },
  {
    id: 'horizon.dashboard_protection',
    title: 'Horizon com dashboard protegido',
    category: 'operations',
    severity: 'high',
    mode: 'automated',
    frequency: 'PR',
  },
  {
    id: 'routes.state_changing_auth',
    title: 'Rotas de escrita com autenticação',
    category: 'api-security',
    severity: 'high',
    mode: 'automated',
    frequency: 'PR',
  },
  {
    id: 'routes.state_changing_throttle',
    title: 'Rotas de escrita com throttle/rate limit',
    category: 'api-security',
    severity: 'medium',
    mode: 'automated',
    frequency: 'PR',
  },
  {
    id: 'routes.csrf_bypass_review',
    title: 'Revisar bypass de CSRF em rotas de escrita',
    category: 'api-security',
    severity: 'medium',
    mode: 'automated',
    frequency: 'PR',
  },
  {
    id: 'laravel.cors_config',
    title: 'Configuração CORS explícita',
    category: 'laravel',
    severity: 'low',
    mode: 'automated',
    frequency: 'PR',
  },
  {
    id: 'laravel.trust_proxies',
    title: 'TrustProxies configurado',
    category: 'laravel',
    severity: 'medium',
    mode: 'automated',
    frequency: 'PR',
  },
  {
    id: 'laravel.trust_hosts',
    title: 'TrustHosts configurado',
    category: 'laravel',
    severity: 'medium',
    mode: 'automated',
    frequency: 'PR',
  },
  {
    id: 'laravel.debug_mode',
    title: 'APP_DEBUG seguro para produção',
    category: 'laravel',
    severity: 'high',
    mode: 'semi',
    frequency: 'PR',
  },
  {
    id: 'livewire.locked_properties',
    title: 'Livewire com propriedades públicas protegidas',
    category: 'livewire',
    severity: 'medium',
    mode: 'automated',
    frequency: 'PR',
  },
  {
    id: 'filament.panel_access',
    title: 'Filament com gate de acesso a painel',
    category: 'filament',
    severity: 'high',
    mode: 'semi',
    frequency: 'PR',
  },
  {
    id: 'filament.pages_authorization',
    title: 'Filament Pages com autorização/visibilidade explícita',
    category: 'filament',
    severity: 'high',
    mode: 'automated',
    frequency: 'PR',
  },
  {
    id: 'filament.widgets_authorization',
    title: 'Filament Widgets com autorização/visibilidade explícita',
    category: 'filament',
    severity: 'medium',
    mode: 'automated',
    frequency: 'PR',
  },
  {
    id: 'uploads.validation',
    title: 'Upload com validação e restrições explícitas',
    category: 'uploads',
    severity: 'medium',
    mode: 'semi',
    frequency: 'PR',
  },
  {
    id: 'webhook.signature_validation',
    title: 'Webhook com validação de assinatura',
    category: 'integrations',
    severity: 'high',
    mode: 'semi',
    frequency: 'PR',
  },
  {
    id: 'dependencies.laravel_security_floor',
    title: 'Laravel acima do floor de segurança conhecido',
    category: 'supply-chain',
    severity: 'high',
    mode: 'automated',
    frequency: 'S',
  },
  {
    id: 'dependencies.livewire_security_floor',
    title: 'Livewire acima do floor de segurança conhecido',
    category: 'supply-chain',
    severity: 'high',
    mode: 'automated',
    frequency: 'S',
  },
  {
    id: 'dependencies.filament_security_floor',
    title: 'Filament acima do floor de segurança conhecido',
    category: 'supply-chain',
    severity: 'medium',
    mode: 'automated',
    frequency: 'S',
  },
  {
    id: 'dependencies.composer_runtime_audit',
    title: 'Composer audit sem vulnerabilidades abertas',
    category: 'supply-chain',
    severity: 'high',
    mode: 'automated',
    frequency: 'PR',
  },
  {
    id: 'dependencies.npm_runtime_audit',
    title: 'NPM audit sem vulnerabilidades abertas',
    category: 'supply-chain',
    severity: 'medium',
    mode: 'automated',
    frequency: 'PR',
  },
  {
    id: 'pipeline.composer_audit_gate',
    title: 'Gate de composer audit no CI',
    category: 'pipeline',
    severity: 'high',
    mode: 'semi',
    frequency: 'PR',
  },
  {
    id: 'pipeline.npm_audit_gate',
    title: 'Gate de npm audit no CI',
    category: 'pipeline',
    severity: 'medium',
    mode: 'semi',
    frequency: 'PR',
  },
  {
    id: 'pipeline.secret_scanning',
    title: 'Secret scanning no pipeline',
    category: 'pipeline',
    severity: 'high',
    mode: 'semi',
    frequency: 'PR',
  },
  {
    id: 'pipeline.sast',
    title: 'SAST em PR/main',
    category: 'pipeline',
    severity: 'medium',
    mode: 'semi',
    frequency: 'PR',
  },
  {
    id: 'pipeline.dast',
    title: 'DAST em staging/rotas críticas',
    category: 'pipeline',
    severity: 'medium',
    mode: 'semi',
    frequency: 'D',
  },
  {
    id: 'governance.threat_modeling',
    title: 'Threat modeling de fluxos críticos',
    category: 'governance',
    severity: 'medium',
    mode: 'manual',
    frequency: 'R',
  },
  {
    id: 'governance.tenant_isolation_review',
    title: 'Revisão periódica de isolamento multi-tenant',
    category: 'governance',
    severity: 'high',
    mode: 'manual',
    frequency: 'S',
  },
  {
    id: 'operations.incident_runbook',
    title: 'Runbook de incidente exercitado',
    category: 'operations',
    severity: 'high',
    mode: 'manual',
    frequency: 'R',
  },
  {
    id: 'operations.backup_restore_drill',
    title: 'Teste real de restore de backup',
    category: 'operations',
    severity: 'high',
    mode: 'manual',
    frequency: 'S',
  },
  {
    id: 'operations.secret_rotation_policy',
    title: 'Política de rotação de segredos ativa',
    category: 'operations',
    severity: 'high',
    mode: 'manual',
    frequency: 'R',
  },
  {
    id: 'security.pentest_release',
    title: 'Pentest/review de segurança por release',
    category: 'security-testing',
    severity: 'medium',
    mode: 'manual',
    frequency: 'R',
  },
];

function createUnknownManualControl(control) {
  return {
    ...control,
    status: 'unknown',
    message: 'Controle manual: requer evidência fora da análise estática local.',
    recommendation: 'Registrar evidência em docs/CI e formalizar decisão no ACE para rastreabilidade.',
    evidence: {},
  };
}

function createControl(control, payload = {}) {
  return {
    ...control,
    status: payload.status || 'unknown',
    message: payload.message || '',
    recommendation: payload.recommendation || '',
    evidence: payload.evidence || {},
  };
}

function findViolationFiles(violations, type, limit = 8) {
  const files = [];
  for (const violation of violations || []) {
    if (violation.type !== type) {
      continue;
    }
    if (!files.includes(violation.file)) {
      files.push(violation.file);
    }
    if (files.length >= limit) {
      break;
    }
  }
  return files;
}

function parseVersion(version) {
  if (!version) {
    return null;
  }

  const clean = String(version).trim().replace(/^v/i, '');
  const match = clean.match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) {
    return null;
  }

  return {
    raw: String(version),
    major: Number(match[1] || 0),
    minor: Number(match[2] || 0),
    patch: Number(match[3] || 0),
  };
}

function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) {
    return null;
  }

  if (pa.major !== pb.major) {
    return pa.major > pb.major ? 1 : -1;
  }
  if (pa.minor !== pb.minor) {
    return pa.minor > pb.minor ? 1 : -1;
  }
  if (pa.patch !== pb.patch) {
    return pa.patch > pb.patch ? 1 : -1;
  }
  return 0;
}

function hashFileIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash('sha1').update(buffer).digest('hex');
  } catch (error) {
    return null;
  }
}

function buildFingerprint(root, fileCandidates = []) {
  const parts = [];
  fileCandidates.forEach((relativePath) => {
    const normalized = String(relativePath || '').replace(/\\/g, '/');
    if (!normalized) {
      return;
    }
    const absolutePath = path.join(root, normalized);
    const hash = hashFileIfExists(absolutePath);
    if (!hash) {
      return;
    }
    parts.push(`${normalized}:${hash}`);
  });
  if (parts.length === 0) {
    return null;
  }
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex');
}

function normalizeAuditSeverity(value) {
  const normalized = String(value || '').toLowerCase();
  if (!normalized) return 'unknown';
  if (normalized.includes('critical')) return 'critical';
  if (normalized.includes('high')) return 'high';
  if (normalized.includes('moderate') || normalized.includes('medium')) return 'medium';
  if (normalized.includes('low')) return 'low';
  return 'unknown';
}

function summarizeAuditVulnerabilities(vulnerabilities = []) {
  const summary = {
    total: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    unknown: 0,
  };
  vulnerabilities.forEach((item) => {
    summary.total += 1;
    const severity = normalizeAuditSeverity(item?.severity);
    summary[severity] = Number(summary[severity] || 0) + 1;
  });
  return summary;
}

function dedupeAuditVulnerabilities(vulnerabilities = []) {
  const map = new Map();
  vulnerabilities.forEach((item, index) => {
    const key = [
      item?.ecosystem || 'unknown',
      item?.package || 'unknown',
      item?.advisoryId || item?.cve || item?.title || `idx-${index}`,
      normalizeAuditSeverity(item?.severity),
    ].join('|');
    if (!map.has(key)) {
      map.set(key, item);
    }
  });
  return Array.from(map.values());
}

function parseComposerAuditPayload(payload, { maxEntries = 120 } = {}) {
  const vulnerabilities = [];
  const advisories = payload?.advisories;

  if (Array.isArray(advisories)) {
    advisories.forEach((entry) => {
      vulnerabilities.push({
        ecosystem: 'composer',
        package: entry.package || entry.packageName || entry.name || 'unknown',
        version: entry.version || null,
        severity: normalizeAuditSeverity(entry.severity),
        title: entry.title || entry.advisoryTitle || 'Composer advisory',
        cve: entry.cve || null,
        advisoryId: entry.advisoryId || entry.id || null,
        url: entry.link || entry.url || null,
        affectedVersions: entry.affectedVersions || entry.affected || null,
        fixVersion: entry.fixedVersion || entry.recommendedVersion || null,
      });
    });
  } else if (advisories && typeof advisories === 'object') {
    Object.entries(advisories).forEach(([packageName, advisoryList]) => {
      const entries = Array.isArray(advisoryList) ? advisoryList : [];
      entries.forEach((entry) => {
        vulnerabilities.push({
          ecosystem: 'composer',
          package: packageName || entry.packageName || entry.package || 'unknown',
          version: entry.version || null,
          severity: normalizeAuditSeverity(entry.severity),
          title: entry.title || entry.advisoryTitle || 'Composer advisory',
          cve: entry.cve || null,
          advisoryId: entry.advisoryId || entry.id || null,
          url: entry.link || entry.url || null,
          affectedVersions: entry.affectedVersions || entry.affected || null,
          fixVersion: entry.fixedVersion || entry.recommendedVersion || null,
        });
      });
    });
  }

  const deduped = dedupeAuditVulnerabilities(vulnerabilities).slice(0, Math.max(20, maxEntries));
  return {
    vulnerabilities: deduped,
    summary: summarizeAuditVulnerabilities(deduped),
  };
}

function parseNpmAuditPayload(payload, { maxEntries = 120 } = {}) {
  const vulnerabilities = [];
  const vulnerabilityMap = payload?.vulnerabilities || {};
  Object.entries(vulnerabilityMap).forEach(([packageName, entry]) => {
    const baseSeverity = normalizeAuditSeverity(entry?.severity);
    const viaList = Array.isArray(entry?.via) ? entry.via : [];
    const advisoryObjects = viaList.filter((via) => via && typeof via === 'object');

    if (advisoryObjects.length === 0) {
      vulnerabilities.push({
        ecosystem: 'npm',
        package: packageName,
        version: entry?.range || null,
        severity: baseSeverity,
        title: `NPM advisory: ${packageName}`,
        cve: null,
        advisoryId: null,
        url: null,
        affectedVersions: entry?.range || null,
        fixVersion:
          typeof entry?.fixAvailable === 'object'
            ? entry.fixAvailable.version || null
            : entry?.fixAvailable
              ? 'available'
              : null,
      });
      return;
    }

    advisoryObjects.forEach((advisory) => {
      const advisorySeverity = normalizeAuditSeverity(advisory.severity || entry?.severity);
      vulnerabilities.push({
        ecosystem: 'npm',
        package: advisory.name || packageName,
        version: advisory.range || entry?.range || null,
        severity: advisorySeverity,
        title: advisory.title || `NPM advisory: ${packageName}`,
        cve: advisory.cve || null,
        advisoryId: advisory.source ? String(advisory.source) : null,
        url: advisory.url || null,
        affectedVersions: advisory.range || entry?.range || null,
        fixVersion:
          typeof entry?.fixAvailable === 'object'
            ? entry.fixAvailable.version || null
            : entry?.fixAvailable
              ? 'available'
              : null,
      });
    });
  });

  const deduped = dedupeAuditVulnerabilities(vulnerabilities).slice(0, Math.max(20, maxEntries));
  return {
    vulnerabilities: deduped,
    summary: summarizeAuditVulnerabilities(deduped),
  };
}

function runAuditCommand({
  root,
  command,
  args,
  timeoutMs = 15000,
  commandRunner = null,
}) {
  const startedAt = Date.now();
  const runner =
    typeof commandRunner === 'function'
      ? commandRunner
      : (cmd, cmdArgs, options) =>
          spawnSync(cmd, cmdArgs, {
            cwd: options.cwd,
            encoding: 'utf8',
            timeout: options.timeoutMs,
            maxBuffer: 12 * 1024 * 1024,
          });

  const result = runner(command, args, {
    cwd: root,
    timeoutMs,
  });
  const durationMs = Date.now() - startedAt;

  return {
    status: Number.isInteger(result?.status) ? result.status : null,
    stdout: String(result?.stdout || ''),
    stderr: String(result?.stderr || ''),
    error: result?.error ? String(result.error.message || result.error) : null,
    timedOut: Boolean(result?.error && result.error?.code === 'ETIMEDOUT'),
    durationMs,
  };
}

function resolveAuditStatus({ hasManifest, summary, execution }) {
  if (!hasManifest) {
    return 'unknown';
  }
  if (!execution || execution.error || execution.status == null || execution.status > 1) {
    return 'warning';
  }
  if ((summary.critical || 0) > 0 || (summary.high || 0) > 0) {
    return 'fail';
  }
  if ((summary.total || 0) > 0) {
    return 'warning';
  }
  return 'pass';
}

function buildAuditMessage({ tool, hasManifest, summary, execution, cached }) {
  if (!hasManifest) {
    return tool === 'npm'
      ? 'Projeto sem package.json no root.'
      : 'Sem composer.json/composer.lock no root.';
  }

  if (!execution || execution.error || execution.status == null || execution.status > 1) {
    const reason = execution?.timedOut
      ? 'timeout ao executar audit.'
      : execution?.error
        ? `falha ao executar audit: ${execution.error}`
        : `audit retornou status ${execution?.status}.`;
    return `${tool} audit não pôde ser avaliado (${reason})`;
  }

  if ((summary.total || 0) === 0) {
    return `${tool} audit sem vulnerabilidades reportadas.${cached ? ' (cache)' : ''}`;
  }

  return `${tool} audit reportou ${summary.total} vulnerabilidade(s): critical=${summary.critical || 0}, high=${summary.high || 0}, medium=${summary.medium || 0}, low=${summary.low || 0}.${cached ? ' (cache)' : ''}`;
}

function evaluateRuntimeDependencyAudit({
  root,
  tool,
  command,
  args,
  manifestFiles = [],
  fingerprintFiles = null,
  previousAudit = null,
  enabled = true,
  timeoutMs = 15000,
  maxEntries = 120,
  parser,
  commandRunner = null,
}) {
  const hasManifest = manifestFiles.some((relativePath) => fs.existsSync(path.join(root, relativePath)));
  const fingerprint = buildFingerprint(root, fingerprintFiles || manifestFiles);
  const previous = previousAudit && typeof previousAudit === 'object' ? previousAudit : null;

  if (!enabled) {
    return {
      tool,
      hasManifest,
      enabled: false,
      usedCache: false,
      source: 'disabled',
      fingerprint,
      command: `${command} ${args.join(' ')}`.trim(),
      summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, unknown: 0 },
      vulnerabilities: [],
      status: 'unknown',
      message: `${tool} audit desativado na configuração.`,
      execution: {
        status: null,
        durationMs: 0,
        error: null,
        timedOut: false,
      },
      updatedAt: nowIso(),
    };
  }

  if (!hasManifest) {
    return {
      tool,
      hasManifest,
      enabled: true,
      usedCache: false,
      source: 'not-applicable',
      fingerprint,
      command: `${command} ${args.join(' ')}`.trim(),
      summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, unknown: 0 },
      vulnerabilities: [],
      status: 'unknown',
      message: buildAuditMessage({
        tool,
        hasManifest,
        summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, unknown: 0 },
        execution: null,
        cached: false,
      }),
      execution: {
        status: null,
        durationMs: 0,
        error: null,
        timedOut: false,
      },
      updatedAt: nowIso(),
    };
  }

  if (
    previous &&
    previous.fingerprint &&
    fingerprint &&
    previous.fingerprint === fingerprint &&
    Array.isArray(previous.vulnerabilities) &&
    previous.execution &&
    !previous.execution.error &&
    previous.execution.status != null
  ) {
    const summary = previous.summary || summarizeAuditVulnerabilities(previous.vulnerabilities);
    return {
      ...previous,
      tool,
      hasManifest,
      enabled: true,
      usedCache: true,
      source: 'cache',
      fingerprint,
      message: buildAuditMessage({
        tool,
        hasManifest,
        summary,
        execution: previous.execution || { status: 0, error: null },
        cached: true,
      }),
      updatedAt: nowIso(),
    };
  }

  const execution = runAuditCommand({
    root,
    command,
    args,
    timeoutMs,
    commandRunner,
  });

  let parsed = {
    vulnerabilities: [],
    summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, unknown: 0 },
  };

  if (!execution.error && execution.stdout) {
    try {
      const payload = JSON.parse(execution.stdout);
      parsed = parser(payload, { maxEntries });
    } catch (error) {
      execution.error = `JSON parse error: ${error.message}`;
    }
  } else if (!execution.error && execution.status === 0) {
    parsed = {
      vulnerabilities: [],
      summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, unknown: 0 },
    };
  }

  const summary = parsed.summary || summarizeAuditVulnerabilities(parsed.vulnerabilities);
  const status = resolveAuditStatus({
    hasManifest,
    summary,
    execution,
  });
  const message = buildAuditMessage({
    tool,
    hasManifest,
    summary,
    execution,
    cached: false,
  });

  return {
    tool,
    hasManifest,
    enabled: true,
    usedCache: false,
    source: 'runtime',
    fingerprint,
    command: `${command} ${args.join(' ')}`.trim(),
    summary,
    vulnerabilities: parsed.vulnerabilities || [],
    status,
    message,
    execution: {
      status: execution.status,
      durationMs: execution.durationMs,
      error: execution.error,
      timedOut: execution.timedOut,
    },
    updatedAt: nowIso(),
  };
}

function getEnvVar(content, key) {
  if (!content) {
    return null;
  }
  const regex = new RegExp(`^\\s*${key}\\s*=\\s*(.+)\\s*$`, 'mi');
  const match = content.match(regex);
  if (!match) {
    return null;
  }
  return String(match[1]).replace(/^['"]|['"]$/g, '').trim();
}

function detectPipelineSignals(root) {
  const payload = {
    hasWorkflows: false,
    composerAudit: false,
    npmAudit: false,
    secretScanning: false,
    sast: false,
    dast: false,
    workflowFiles: [],
  };

  const workflowsDir = path.join(root, '.github', 'workflows');
  if (!fs.existsSync(workflowsDir)) {
    return payload;
  }

  let files = [];
  try {
    files = fs
      .readdirSync(workflowsDir)
      .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'));
  } catch (error) {
    return payload;
  }

  payload.hasWorkflows = files.length > 0;
  payload.workflowFiles = files;

  files.forEach((filename) => {
    const fullPath = path.join(workflowsDir, filename);
    const content = fs.readFileSync(fullPath, 'utf8');
    if (/composer\s+audit/i.test(content)) {
      payload.composerAudit = true;
    }
    if (/npm\s+audit/i.test(content)) {
      payload.npmAudit = true;
    }
    if (/gitleaks|trufflehog|secret[\s_-]?scan|detect-secrets/i.test(content)) {
      payload.secretScanning = true;
    }
    if (/semgrep|codeql|sast|larastan|phpstan/i.test(content)) {
      payload.sast = true;
    }
    if (/dast|owasp[\s_-]?zap|zap-baseline/i.test(content)) {
      payload.dast = true;
    }
  });

  return payload;
}

function listPhpFilesRecursive(rootDir) {
  const files = [];
  if (!fs.existsSync(rootDir)) {
    return files;
  }

  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (error) {
      continue;
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.isFile() && full.endsWith('.php')) {
        files.push(full);
      }
    }
  }

  return files;
}

function classBasename(candidate) {
  if (!candidate) {
    return '';
  }
  const normalized = String(candidate).replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || '';
}

function collectPolicyAndGateCoverage({ root, fileIndex = {} }) {
  const indexedEntries = Object.entries(fileIndex || {});
  const indexedPaths = new Set(indexedEntries.map(([relativePath]) => String(relativePath)));

  const modelFilePaths = indexedEntries
    .filter(([, entry]) => entry?.kind === 'model')
    .map(([relativePath]) => relativePath);
  if (modelFilePaths.length === 0) {
    listPhpFilesRecursive(path.join(root, 'app', 'Models')).forEach((absolutePath) => {
      const relativePath = path.relative(root, absolutePath).replace(/\\/g, '/');
      modelFilePaths.push(relativePath);
    });
  }

  const policyFilePaths = indexedEntries
    .filter(([, entry]) => entry?.kind === 'policy')
    .map(([relativePath]) => String(relativePath));
  if (policyFilePaths.length === 0) {
    listPhpFilesRecursive(path.join(root, 'app', 'Policies')).forEach((absolutePath) => {
      const relativePath = path.relative(root, absolutePath).replace(/\\/g, '/');
      if (relativePath.endsWith('Policy.php')) {
        policyFilePaths.push(relativePath);
      }
    });
  }

  const providerFilePaths = [
    ...indexedEntries
      .map(([relativePath]) => String(relativePath))
      .filter((relativePath) => relativePath.includes('/Providers/') && relativePath.endsWith('.php')),
  ];
  if (providerFilePaths.length === 0) {
    listPhpFilesRecursive(path.join(root, 'app', 'Providers')).forEach((absolutePath) => {
      const relativePath = path.relative(root, absolutePath).replace(/\\/g, '/');
      providerFilePaths.push(relativePath);
    });
  }

  const modelNames = Array.from(
    new Set(
      modelFilePaths
        .map((relativePath) => path.basename(relativePath, '.php'))
        .filter(Boolean),
    ),
  );
  const policyModelNames = new Set(
    policyFilePaths
      .map((relativePath) => path.basename(relativePath, '.php'))
      .filter((basename) => basename.endsWith('Policy'))
      .map((basename) => basename.replace(/Policy$/, ''))
      .filter(Boolean),
  );

  const explicitlyMappedModels = new Set();
  let gateDefinitions = 0;
  let hasGuessPolicyNamesUsing = false;

  providerFilePaths.forEach((relativePath) => {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      return;
    }
    let content = '';
    try {
      content = fs.readFileSync(absolutePath, 'utf8');
    } catch (error) {
      return;
    }

    for (const match of content.matchAll(/([A-Za-z0-9_\\]+)::class\s*=>\s*([A-Za-z0-9_\\]+Policy)::class/g)) {
      explicitlyMappedModels.add(classBasename(match[1]));
    }
    for (const match of content.matchAll(/Gate::policy\s*\(\s*([A-Za-z0-9_\\]+)::class\s*,\s*([A-Za-z0-9_\\]+Policy)::class\s*\)/g)) {
      explicitlyMappedModels.add(classBasename(match[1]));
    }

    gateDefinitions += Array.from(content.matchAll(/Gate::(?:define|resource)\s*\(/g)).length;
    hasGuessPolicyNamesUsing = hasGuessPolicyNamesUsing || /Gate::guessPolicyNamesUsing\s*\(/.test(content);
  });

  const coveredModels = new Set();
  modelNames.forEach((modelName) => {
    if (policyModelNames.has(modelName) || explicitlyMappedModels.has(modelName)) {
      coveredModels.add(modelName);
    }
  });

  const missingModels = modelNames.filter((modelName) => !coveredModels.has(modelName)).slice(0, 30);
  const modelCount = modelNames.length;
  const coveredCount = coveredModels.size;
  const ratio = modelCount > 0 ? coveredCount / modelCount : null;

  return {
    modelCount,
    coveredModelCount: coveredCount,
    coverageRatio: ratio,
    policyFileCount: policyFilePaths.length,
    explicitlyMappedModelCount: explicitlyMappedModels.size,
    gateDefinitions,
    hasGuessPolicyNamesUsing,
    missingModels,
    indexedFileCount: indexedPaths.size,
  };
}

function statusFromRatio({ ratio, pass = 0.8, warning = 0.55 }) {
  if (ratio == null) {
    return 'unknown';
  }
  if (ratio >= pass) {
    return 'pass';
  }
  if (ratio >= warning) {
    return 'warning';
  }
  return 'fail';
}

function evaluateVersionFloor({ currentVersion, floors }) {
  const parsed = parseVersion(currentVersion);
  if (!parsed) {
    return {
      status: 'unknown',
      message: 'Versão não identificada no lockfile.',
    };
  }

  const floor = floors[parsed.major];
  if (!floor) {
    if (parsed.major > Math.max(...Object.keys(floors).map((value) => Number(value)))) {
      return {
        status: 'pass',
        message: `Versão ${currentVersion} acima dos majors monitorados no baseline.`,
      };
    }

    return {
      status: 'warning',
      message: `Major ${parsed.major} não mapeado no baseline de segurança atual.`,
    };
  }

  const comparison = compareVersions(currentVersion, floor);
  if (comparison == null) {
    return {
      status: 'unknown',
      message: `Não foi possível comparar ${currentVersion} com floor ${floor}.`,
    };
  }

  if (comparison >= 0) {
    return {
      status: 'pass',
      message: `Versão ${currentVersion} atende floor ${floor}.`,
    };
  }

  return {
    status: 'fail',
    message: `Versão ${currentVersion} abaixo do floor de segurança ${floor}.`,
  };
}

function computeCounts(items) {
  const payload = {
    total: items.length,
    pass: 0,
    warning: 0,
    fail: 0,
    unknown: 0,
  };

  items.forEach((item) => {
    const status = item.status || 'unknown';
    payload[status] = Number(payload[status] || 0) + 1;
  });

  return payload;
}

function computeScore(items) {
  if (!items.length) {
    return 0;
  }

  let weightedTotal = 0;
  let weightedPoints = 0;

  items.forEach((item) => {
    const severityWeight = SEVERITY_WEIGHT[item.severity] || 1;
    const statusWeight = STATUS_SCORE[item.status] ?? STATUS_SCORE.unknown;
    weightedTotal += severityWeight;
    weightedPoints += severityWeight * statusWeight;
  });

  if (!weightedTotal) {
    return 0;
  }
  return Math.round((weightedPoints / weightedTotal) * 100);
}

function computeOverallScore(byMode) {
  let totalWeight = 0;
  let aggregate = 0;

  Object.entries(byMode).forEach(([mode, payload]) => {
    if (!payload.total) {
      return;
    }
    const weight = MODE_WEIGHT[mode] || 0;
    totalWeight += weight;
    aggregate += payload.score * weight;
  });

  if (!totalWeight) {
    return 0;
  }

  return Math.round(aggregate / totalWeight);
}

function computeDomainSummary(items = []) {
  const byDomain = {
    code: [],
    pipeline: [],
  };

  items.forEach((item) => {
    const category = String(item.category || '').toLowerCase();
    if (category === 'pipeline') {
      byDomain.pipeline.push(item);
      return;
    }
    byDomain.code.push(item);
  });

  return {
    code: {
      ...computeCounts(byDomain.code),
      score: computeScore(byDomain.code),
    },
    pipeline: {
      ...computeCounts(byDomain.pipeline),
      score: computeScore(byDomain.pipeline),
    },
  };
}

function sortControls(controls) {
  const modeOrder = { automated: 0, semi: 1, manual: 2 };
  return [...controls].sort((a, b) => {
    const modeDiff = (modeOrder[a.mode] || 99) - (modeOrder[b.mode] || 99);
    if (modeDiff !== 0) {
      return modeDiff;
    }

    const statusDiff = (STATUS_PRIORITY[b.status] || 0) - (STATUS_PRIORITY[a.status] || 0);
    if (statusDiff !== 0) {
      return statusDiff;
    }

    const severityDiff = (SEVERITY_WEIGHT[b.severity] || 0) - (SEVERITY_WEIGHT[a.severity] || 0);
    if (severityDiff !== 0) {
      return severityDiff;
    }

    return String(a.id).localeCompare(String(b.id));
  });
}

function evaluateSecurityBaseline({
  root,
  metrics = {},
  violations = [],
  fileIndex = {},
  previousSecurityMetadata = {},
  auditOptions = {},
  commandRunner = null,
}) {
  const controls = [];
  const composerVersions = getComposerDependencyVersions(root);
  const detectedModules = detectProjectModules({
    root,
    metrics,
    composerVersions,
  });
  const moduleMap = new Map(detectedModules.map((item) => [item.id, item]));
  const moduleScopeDraft = buildModuleScopeDraft(detectedModules);
  const workflowSignals = detectPipelineSignals(root);
  const authCoverageSignals = collectPolicyAndGateCoverage({ root, fileIndex });
  const previousDependencyAudits = previousSecurityMetadata?.dependencyAudits || {};
  const composerAudit = evaluateRuntimeDependencyAudit({
    root,
    tool: 'composer',
    command: 'composer',
    args: ['audit', '--locked', '--format=json', '--no-ansi'],
    manifestFiles: ['composer.lock', 'composer.json'],
    fingerprintFiles: ['composer.lock', 'composer.json'],
    previousAudit: previousDependencyAudits.composer || null,
    enabled: auditOptions.composer !== false,
    timeoutMs: Number(auditOptions.timeoutMs || 15000),
    maxEntries: Number(auditOptions.maxEntries || 120),
    parser: parseComposerAuditPayload,
    commandRunner,
  });
  const npmAudit = evaluateRuntimeDependencyAudit({
    root,
    tool: 'npm',
    command: 'npm',
    args: ['audit', '--json', '--audit-level=low'],
    manifestFiles: ['package.json'],
    fingerprintFiles: ['package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock'],
    previousAudit: previousDependencyAudits.npm || null,
    enabled: auditOptions.npm !== false,
    timeoutMs: Number(auditOptions.timeoutMs || 15000),
    maxEntries: Number(auditOptions.maxEntries || 120),
    parser: parseNpmAuditPayload,
    commandRunner,
  });

  const envPath = path.join(root, '.env');
  const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const appEnv = String(getEnvVar(envContent, 'APP_ENV') || '').toLowerCase();
  const appDebug = String(getEnvVar(envContent, 'APP_DEBUG') || '').toLowerCase();

  const surfaceCount =
    Number(metrics.controllers || 0) +
    Number(metrics.filamentResources || 0) +
    Number(metrics.filamentPages || 0) +
    Number(metrics.filamentWidgets || 0) +
    Number(metrics.livewireComponents || 0);

  const hasFilamentSurface = Boolean(moduleMap.get('filament')?.enabled);
  const hasLivewireSurface = Boolean(moduleMap.get('livewire')?.enabled);
  const hasSpatiePermission = Boolean(moduleMap.get('spatie-permission')?.enabled);
  const hasSanctum = Boolean(moduleMap.get('sanctum')?.enabled);
  const hasHorizon = Boolean(moduleMap.get('horizon')?.enabled);
  const stackSignals = collectStackSpecificSignals({
    root,
    hasSpatiePermission,
    hasSanctum,
    hasHorizon,
    listPhpFilesRecursive,
  });

  const requestAllCalls = Number(metrics.requestAllCalls || 0);
  controls.push(
    createControl(CONTROL_CATALOG.find((item) => item.id === 'input.validated_payload'), {
      status: requestAllCalls > 0 ? 'fail' : 'pass',
      message:
        requestAllCalls > 0
          ? `${requestAllCalls} ocorrência(s) de $request->all() detectada(s).`
          : 'Não foram detectados usos de $request->all().',
      recommendation: 'Prefira $request->validated() (FormRequest) ou DTO com contrato explícito.',
      evidence: {
        count: requestAllCalls,
        files: findViolationFiles(violations, 'mass-assignment-risk'),
      },
    }),
  );

  const controllers = Number(metrics.controllers || 0);
  const formRequestRatio = controllers > 0 ? Number(metrics.controllersUsingFormRequest || 0) / controllers : null;
  controls.push(
    createControl(CONTROL_CATALOG.find((item) => item.id === 'input.form_request_adoption'), {
      status:
        formRequestRatio == null
          ? 'unknown'
          : formRequestRatio >= 0.7
            ? 'pass'
            : formRequestRatio >= 0.45
              ? 'warning'
              : 'fail',
      message:
        formRequestRatio == null
          ? 'Sem controllers no escopo atual para medir adoção.'
          : `Adoção atual de FormRequest/DTO: ${Math.round(formRequestRatio * 100)}%.`,
      recommendation: 'Padronize validação de entrada para reduzir payload poisoning e inconsistência.',
      evidence: {
        controllers,
        controllersUsingFormRequest: Number(metrics.controllersUsingFormRequest || 0),
      },
    }),
  );

  const dynamicRawSql = Number(metrics.dynamicRawSql || 0);
  controls.push(
    createControl(CONTROL_CATALOG.find((item) => item.id === 'sql.dynamic_raw_sql'), {
      status: dynamicRawSql > 0 ? 'fail' : 'pass',
      message:
        dynamicRawSql > 0
          ? `${dynamicRawSql} ponto(s) de SQL raw com variável dinâmica detectado(s).`
          : 'Nenhum SQL raw dinâmico detectado.',
      recommendation: 'Substitua por bindings parametrizados ou Query Builder com whitelist.',
      evidence: {
        count: dynamicRawSql,
        files: findViolationFiles(violations, 'dynamic-raw-sql'),
      },
    }),
  );

  const rawSqlCalls = Number(metrics.rawSqlCalls || 0);
  const unsafeRawSqlCalls = Number(metrics.unsafeRawSqlCalls || 0);
  const safeRawSqlCalls = Number(metrics.safeRawSqlCalls || 0);
  controls.push(
    createControl(CONTROL_CATALOG.find((item) => item.id === 'sql.raw_sql_review'), {
      status: unsafeRawSqlCalls === 0 ? 'pass' : unsafeRawSqlCalls <= 3 ? 'warning' : 'fail',
      message:
        rawSqlCalls === 0
          ? 'Nenhum SQL raw detectado.'
          : unsafeRawSqlCalls === 0
            ? `${rawSqlCalls} chamada(s) raw SQL detectada(s), sem sinais dinâmicos de risco.`
            : `${unsafeRawSqlCalls}/${rawSqlCalls} chamada(s) raw SQL com sinais dinâmicos exigindo revisão manual.`,
      recommendation: 'Para cada SQL raw, valide bind seguro, limites e explicite racional de performance.',
      evidence: {
        count: unsafeRawSqlCalls,
        totalRawSqlCalls: rawSqlCalls,
        safeRawSqlCalls,
        files: findViolationFiles(violations, 'raw-sql-review'),
      },
    }),
  );

  const unboundedGetCalls = Number(metrics.unboundedGetCalls || 0);
  controls.push(
    createControl(CONTROL_CATALOG.find((item) => item.id === 'orm.unbounded_get'), {
      status: unboundedGetCalls === 0 ? 'pass' : unboundedGetCalls <= 8 ? 'warning' : 'fail',
      message:
        unboundedGetCalls === 0
          ? 'Nenhuma consulta `->get()` sem limite explícito detectada.'
          : `${unboundedGetCalls} ocorrência(s) de consulta potencialmente não limitada detectada(s).`,
      recommendation: 'Preferir paginate/cursorPaginate/limit para reduzir risco de carga excessiva.',
      evidence: {
        count: unboundedGetCalls,
        files: findViolationFiles(violations, 'unbounded-get-query'),
      },
    }),
  );

  const possibleNPlusOneRisks = Number(metrics.possibleNPlusOneRisks || 0);
  controls.push(
    createControl(CONTROL_CATALOG.find((item) => item.id === 'orm.eager_loading'), {
      status: possibleNPlusOneRisks === 0 ? 'pass' : possibleNPlusOneRisks <= 5 ? 'warning' : 'fail',
      message:
        possibleNPlusOneRisks === 0
          ? 'Sem sinais de N+1 em loops no escopo atual.'
          : `${possibleNPlusOneRisks} arquivo(s) com sinal de acesso a relação em loop sem eager loading.`,
      recommendation: 'Aplicar with/load onde houver iteração de entidades com relações.',
      evidence: {
        count: possibleNPlusOneRisks,
        files: findViolationFiles(violations, 'possible-n-plus-one'),
      },
    }),
  );

  const criticalWritesWithoutTransaction = Number(metrics.criticalWritesWithoutTransaction || 0);
  controls.push(
    createControl(CONTROL_CATALOG.find((item) => item.id === 'db.critical_transactions'), {
      status:
        criticalWritesWithoutTransaction === 0
          ? 'pass'
          : criticalWritesWithoutTransaction <= 2
            ? 'warning'
            : 'fail',
      message:
        criticalWritesWithoutTransaction === 0
          ? 'Sem sinal de writes críticos sem transação no escopo.'
          : `${criticalWritesWithoutTransaction} arquivo(s) com escrita crítica sem ` +
            'sinal de `DB::transaction()`.',
      recommendation: 'Encapsular fluxos financeiros/criticos em transação e reforçar idempotência.',
      evidence: {
        count: criticalWritesWithoutTransaction,
        files: findViolationFiles(violations, 'critical-write-without-transaction'),
      },
    }),
  );

  const dangerousSinkCalls = Number(metrics.dangerousSinkCalls || 0);
  controls.push(
    createControl(CONTROL_CATALOG.find((item) => item.id === 'rce.dangerous_php_sinks'), {
      status: dangerousSinkCalls > 0 ? 'fail' : 'pass',
      message:
        dangerousSinkCalls > 0
          ? `${dangerousSinkCalls} sink(s) perigoso(s) detectado(s).`
          : 'Nenhum sink perigoso detectado no escopo.',
      recommendation: 'Remova sink direto ou aplique validação rígida + isolamento operacional.',
      evidence: {
        count: dangerousSinkCalls,
        files: findViolationFiles(violations, 'dangerous-php-sink'),
      },
    }),
  );

  const authorizationChecks = Number(metrics.authorizationChecks || 0);
  const authorizationRatio = surfaceCount > 0 ? authorizationChecks / surfaceCount : null;
  controls.push(
    createControl(CONTROL_CATALOG.find((item) => item.id === 'authz.server_side_checks'), {
      status:
        authorizationRatio == null
          ? 'unknown'
          : authorizationRatio >= 1
            ? 'pass'
            : authorizationRatio >= 0.35
              ? 'warning'
              : 'fail',
      message:
        authorizationRatio == null
          ? 'Sem superfície crítica identificada no escopo atual.'
          : `Sinais de autorização server-side por superfície: ${authorizationChecks}/${surfaceCount}.`,
      recommendation:
        'Garanta authorize/policies em ações críticas (read/write/export/delete/impersonate).',
      evidence: {
        authorizationChecks,
        surfaceCount,
      },
    }),
  );

  const policyCoverageStatus = statusFromRatio({
    ratio: authCoverageSignals.coverageRatio,
    pass: 0.82,
    warning: 0.58,
  });
  controls.push(
    createControl(CONTROL_CATALOG.find((item) => item.id === 'authz.policy_model_coverage'), {
      status:
        authCoverageSignals.modelCount === 0
          ? 'unknown'
          : authCoverageSignals.hasGuessPolicyNamesUsing && authCoverageSignals.coverageRatio == null
            ? 'unknown'
            : policyCoverageStatus,
      message:
        authCoverageSignals.modelCount === 0
          ? 'Sem models detectados no escopo atual.'
          : `Cobertura model↔policy: ${authCoverageSignals.coveredModelCount}/${authCoverageSignals.modelCount}.`,
      recommendation:
        'Garanta policy para models críticos e registre mapeamento explícito quando fugir de convenção.',
      evidence: {
        modelCount: authCoverageSignals.modelCount,
        coveredModelCount: authCoverageSignals.coveredModelCount,
        policyFileCount: authCoverageSignals.policyFileCount,
        explicitlyMappedModelCount: authCoverageSignals.explicitlyMappedModelCount,
        missingModels: authCoverageSignals.missingModels,
        hasGuessPolicyNamesUsing: authCoverageSignals.hasGuessPolicyNamesUsing,
      },
    }),
  );

  const hasAuthorizationScaffold =
    authCoverageSignals.coveredModelCount > 0 ||
    authCoverageSignals.gateDefinitions > 0 ||
    authorizationChecks > 0;
  controls.push(
    createControl(CONTROL_CATALOG.find((item) => item.id === 'authz.gate_definition_coverage'), {
      status:
        !hasAuthorizationScaffold
          ? 'warning'
          : authCoverageSignals.gateDefinitions > 0
            ? 'pass'
            : authCoverageSignals.coveredModelCount > 0
              ? 'warning'
              : 'warning',
      message:
        authCoverageSignals.gateDefinitions > 0
          ? `${authCoverageSignals.gateDefinitions} Gate::define/resource detectado(s).`
          : hasAuthorizationScaffold
            ? 'Sem Gate::define explícito; políticas existentes cobrem parte da autorização.'
            : 'Sem sinais suficientes de policies/gates para ações não-model.',
      recommendation:
        'Para ações fora de CRUD de model, prefira Gate::define/resource e checagem explícita no ponto de uso.',
      evidence: {
        gateDefinitions: authCoverageSignals.gateDefinitions,
        authorizationChecks,
        coveredModelCount: authCoverageSignals.coveredModelCount,
      },
    }),
  );

  const routeFiles = Number(metrics.routeFiles || 0);
  const stateWithoutAuth = Number(metrics.stateChangingRouteFilesWithoutAuth || 0);
  controls.push(
    createControl(CONTROL_CATALOG.find((item) => item.id === 'routes.state_changing_auth'), {
      status: routeFiles === 0 ? 'unknown' : stateWithoutAuth > 0 ? 'fail' : 'pass',
      message:
        routeFiles === 0
          ? 'Nenhum arquivo routes/*.php analisado neste ciclo.'
          : stateWithoutAuth > 0
            ? `${stateWithoutAuth} arquivo(s) de rota com escrita sem auth detectada.`
            : 'Nenhum arquivo de rota com escrita sem auth detectado.',
      recommendation: 'Aplique auth/policies para endpoints state-changing e valide escopo tenant.',
      evidence: {
        routeFiles,
        stateChangingRouteFilesWithoutAuth: stateWithoutAuth,
        files: findViolationFiles(violations, 'state-route-without-auth'),
      },
    }),
  );

  const stateWithoutThrottle = Number(metrics.stateChangingRouteFilesWithoutThrottle || 0);
  controls.push(
    createControl(CONTROL_CATALOG.find((item) => item.id === 'routes.state_changing_throttle'), {
      status: routeFiles === 0 ? 'unknown' : stateWithoutThrottle > 0 ? 'warning' : 'pass',
      message:
        routeFiles === 0
          ? 'Nenhum arquivo routes/*.php analisado neste ciclo.'
          : stateWithoutThrottle > 0
            ? `${stateWithoutThrottle} arquivo(s) de rota com escrita sem throttle detectado(s).`
            : 'Não foram detectadas rotas de escrita sem throttling.',
      recommendation: 'Defina rate limit por endpoint/ator (IP + conta + custo operacional).',
      evidence: {
        routeFiles,
        stateChangingRouteFilesWithoutThrottle: stateWithoutThrottle,
        files: findViolationFiles(violations, 'state-route-without-throttle'),
      },
    }),
  );

  const routeFilesWithoutCsrf = Number(metrics.routeFilesWithoutCsrf || 0);
  controls.push(
    createControl(CONTROL_CATALOG.find((item) => item.id === 'routes.csrf_bypass_review'), {
      status: routeFilesWithoutCsrf > 0 ? 'warning' : routeFiles > 0 ? 'pass' : 'unknown',
      message:
        routeFiles === 0
          ? 'Nenhum arquivo routes/*.php analisado neste ciclo.'
          : routeFilesWithoutCsrf > 0
            ? `${routeFilesWithoutCsrf} arquivo(s) de rotas com bypass explícito de CSRF.`
            : 'Sem bypass explícito de CSRF detectado em rotas state-changing.',
      recommendation: 'Confirme compensações fortes ao usar bypass de CSRF (auth robusta, assinatura, nonce).',
      evidence: {
        routeFilesWithoutCsrf,
        files: findViolationFiles(violations, 'state-route-without-csrf'),
      },
    }),
  );

  const hasCorsConfig = fs.existsSync(path.join(root, 'config', 'cors.php'));
  controls.push(
    createControl(CONTROL_CATALOG.find((item) => item.id === 'laravel.cors_config'), {
      status: hasCorsConfig ? 'pass' : 'fail',
      message: hasCorsConfig ? 'config/cors.php encontrado.' : 'config/cors.php não encontrado.',
      recommendation: 'Configure CORS por origem/método/header estritamente necessários.',
      evidence: {
        file: hasCorsConfig ? 'config/cors.php' : null,
      },
    }),
  );

  const hasTrustProxies = fs.existsSync(path.join(root, 'app', 'Http', 'Middleware', 'TrustProxies.php'));
  controls.push(
    createControl(CONTROL_CATALOG.find((item) => item.id === 'laravel.trust_proxies'), {
      status: hasTrustProxies ? 'pass' : 'warning',
      message: hasTrustProxies ? 'Middleware TrustProxies encontrado.' : 'TrustProxies não encontrado.',
      recommendation: 'Revise trusted proxies/hosts para evitar spoof de headers.',
      evidence: {
        file: hasTrustProxies ? 'app/Http/Middleware/TrustProxies.php' : null,
      },
    }),
  );

  const hasTrustHosts = fs.existsSync(path.join(root, 'app', 'Http', 'Middleware', 'TrustHosts.php'));
  controls.push(
    createControl(CONTROL_CATALOG.find((item) => item.id === 'laravel.trust_hosts'), {
      status: hasTrustHosts ? 'pass' : 'warning',
      message: hasTrustHosts ? 'Middleware TrustHosts encontrado.' : 'TrustHosts não encontrado.',
      recommendation: 'Configure trusted hosts para reduzir riscos de host header poisoning.',
      evidence: {
        file: hasTrustHosts ? 'app/Http/Middleware/TrustHosts.php' : null,
      },
    }),
  );

  controls.push(
    createControl(CONTROL_CATALOG.find((item) => item.id === 'laravel.debug_mode'), {
      status:
        appDebug === ''
          ? 'unknown'
          : appEnv === 'production' && appDebug === 'true'
            ? 'fail'
            : appDebug === 'true'
              ? 'warning'
              : 'pass',
      message:
        appDebug === ''
          ? 'APP_DEBUG não identificado em .env.'
          : `APP_ENV=${appEnv || '-'} APP_DEBUG=${appDebug}.`,
      recommendation: 'Em produção, garantir APP_DEBUG=false e tratamento seguro de exceções.',
      evidence: {
        envFilePresent: Boolean(envContent),
      },
    }),
  );

  const uploadHandlingMentions = Number(metrics.uploadHandlingMentions || 0);
  const uploadValidationMentions = Number(metrics.uploadValidationMentions || 0);
  controls.push(
    createControl(CONTROL_CATALOG.find((item) => item.id === 'uploads.validation'), {
      status:
        uploadHandlingMentions === 0
          ? 'unknown'
          : uploadValidationMentions >= Math.max(1, Math.ceil(uploadHandlingMentions * 0.5))
            ? 'pass'
            : 'warning',
      message:
        uploadHandlingMentions === 0
          ? 'Sem sinais de upload no escopo atual.'
          : `Sinais de upload: ${uploadHandlingMentions}; validações explícitas: ${uploadValidationMentions}.`,
      recommendation: 'Aplique whitelist de MIME/extensão/tamanho e validação server-side.',
      evidence: {
        uploadHandlingMentions,
        uploadValidationMentions,
      },
    }),
  );

  const webhookHandlingMentions = Number(metrics.webhookHandlingMentions || 0);
  const webhookSignatureMentions = Number(metrics.webhookSignatureMentions || 0);
  controls.push(
    createControl(CONTROL_CATALOG.find((item) => item.id === 'webhook.signature_validation'), {
      status:
        webhookHandlingMentions === 0
          ? 'unknown'
          : webhookSignatureMentions > 0
            ? 'pass'
            : 'warning',
      message:
        webhookHandlingMentions === 0
          ? 'Sem menção a webhooks no escopo atual.'
          : webhookSignatureMentions > 0
            ? 'Sinais de validação/assinatura de webhook detectados.'
            : 'Webhook detectado sem evidência de validação de assinatura no escopo.',
      recommendation: 'Implemente assinatura + janela anti-replay (timestamp/nonce).',
      evidence: {
        webhookHandlingMentions,
        webhookSignatureMentions,
      },
    }),
  );

  const laravelVersion = composerVersions.get('laravel/framework');
  const laravelFloor = evaluateVersionFloor({
    currentVersion: laravelVersion,
    floors: {
      10: '10.48.29',
      11: '11.44.1',
      12: '12.1.1',
    },
  });
  controls.push(
    createControl(CONTROL_CATALOG.find((item) => item.id === 'dependencies.laravel_security_floor'), {
      status: laravelFloor.status,
      message: laravelVersion
        ? `laravel/framework=${laravelVersion}. ${laravelFloor.message}`
        : 'laravel/framework não encontrado no lock/composer.',
      recommendation: 'Mantenha framework no floor seguro para advisories recentes.',
      evidence: {
        package: 'laravel/framework',
        version: laravelVersion || null,
      },
    }),
  );

  const {
    filamentPageCount,
    filamentWidgetCount,
    filamentPagesWithAuth,
    filamentWidgetsWithAuth,
  } = appendOptionalStackControls({
    controls,
    controlCatalog: CONTROL_CATALOG,
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
  });

  if (composerAudit.hasManifest) {
    controls.push(
      createControl(CONTROL_CATALOG.find((item) => item.id === 'dependencies.composer_runtime_audit'), {
        status: composerAudit.status,
        message: composerAudit.message,
        recommendation:
          'Execute composer audit em CI/CD e mantenha dependências no floor seguro com política de atualização contínua.',
        evidence: {
          vulnerabilities: composerAudit.summary.total || 0,
          critical: composerAudit.summary.critical || 0,
          high: composerAudit.summary.high || 0,
          medium: composerAudit.summary.medium || 0,
          low: composerAudit.summary.low || 0,
          command: composerAudit.command,
          source: composerAudit.source,
          files: ['composer.json', 'composer.lock'].filter((item) => fs.existsSync(path.join(root, item))),
        },
      }),
    );
  }

  if (npmAudit.hasManifest) {
    controls.push(
      createControl(CONTROL_CATALOG.find((item) => item.id === 'dependencies.npm_runtime_audit'), {
        status: npmAudit.status,
        message: npmAudit.message,
        recommendation:
          'Execute npm audit no pipeline e trate vulnerabilidades com fix disponível priorizando High/Critical.',
        evidence: {
          vulnerabilities: npmAudit.summary.total || 0,
          critical: npmAudit.summary.critical || 0,
          high: npmAudit.summary.high || 0,
          medium: npmAudit.summary.medium || 0,
          low: npmAudit.summary.low || 0,
          command: npmAudit.command,
          source: npmAudit.source,
          files: ['package.json', 'package-lock.json', 'npm-shrinkwrap.json'].filter((item) =>
            fs.existsSync(path.join(root, item)),
          ),
        },
      }),
    );
  }

  controls.push(
    createControl(CONTROL_CATALOG.find((item) => item.id === 'pipeline.composer_audit_gate'), {
      status: !workflowSignals.hasWorkflows ? 'unknown' : workflowSignals.composerAudit ? 'pass' : 'warning',
      message: !workflowSignals.hasWorkflows
        ? 'Sem workflows CI detectados no escopo.'
        : workflowSignals.composerAudit
          ? 'Sinal de composer audit no CI detectado.'
          : 'Sem sinal de composer audit no CI detectado.',
      recommendation: 'Adicionar gate de composer audit para bloquear advisories High/Critical.',
      evidence: {
        workflows: workflowSignals.workflowFiles,
      },
    }),
  );

  const hasPackageJson = fs.existsSync(path.join(root, 'package.json'));
  controls.push(
    createControl(CONTROL_CATALOG.find((item) => item.id === 'pipeline.npm_audit_gate'), {
      status: !hasPackageJson
        ? 'unknown'
        : !workflowSignals.hasWorkflows
          ? 'unknown'
          : workflowSignals.npmAudit
            ? 'pass'
            : 'warning',
      message: !hasPackageJson
        ? 'Projeto sem package.json no root.'
        : !workflowSignals.hasWorkflows
          ? 'Sem workflows CI detectados no escopo.'
          : workflowSignals.npmAudit
            ? 'Sinal de npm audit no CI detectado.'
            : 'Sem sinal de npm audit no CI detectado.',
      recommendation: 'Adicionar npm audit (runtime) como gate em PR/release.',
      evidence: {
        workflows: workflowSignals.workflowFiles,
      },
    }),
  );

  controls.push(
    createControl(CONTROL_CATALOG.find((item) => item.id === 'pipeline.secret_scanning'), {
      status: !workflowSignals.hasWorkflows ? 'unknown' : workflowSignals.secretScanning ? 'pass' : 'warning',
      message: !workflowSignals.hasWorkflows
        ? 'Sem workflows CI detectados no escopo.'
        : workflowSignals.secretScanning
          ? 'Sinal de secret scanning no CI detectado.'
          : 'Sem sinal de secret scanning no CI detectado.',
      recommendation: 'Incluir gitleaks/trufflehog para evitar vazamento de segredos.',
      evidence: {
        workflows: workflowSignals.workflowFiles,
      },
    }),
  );

  controls.push(
    createControl(CONTROL_CATALOG.find((item) => item.id === 'pipeline.sast'), {
      status: !workflowSignals.hasWorkflows ? 'unknown' : workflowSignals.sast ? 'pass' : 'warning',
      message: !workflowSignals.hasWorkflows
        ? 'Sem workflows CI detectados no escopo.'
        : workflowSignals.sast
          ? 'Sinal de SAST detectado no CI.'
          : 'Sem sinal de SAST detectado no CI.',
      recommendation: 'Adicionar Semgrep/CodeQL/Larastan como gate de segurança em PR.',
      evidence: {
        workflows: workflowSignals.workflowFiles,
      },
    }),
  );

  controls.push(
    createControl(CONTROL_CATALOG.find((item) => item.id === 'pipeline.dast'), {
      status: !workflowSignals.hasWorkflows ? 'unknown' : workflowSignals.dast ? 'pass' : 'warning',
      message: !workflowSignals.hasWorkflows
        ? 'Sem workflows CI detectados no escopo.'
        : workflowSignals.dast
          ? 'Sinal de DAST detectado no CI.'
          : 'Sem sinal de DAST detectado no CI.',
      recommendation: 'Adicionar DAST em staging para endpoints e painéis críticos.',
      evidence: {
        workflows: workflowSignals.workflowFiles,
      },
    }),
  );

  CONTROL_CATALOG.filter((control) => control.mode === 'manual').forEach((control) => {
    controls.push(createUnknownManualControl(control));
  });

  const sortedControls = sortControls(controls);
  const byMode = {
    automated: sortedControls.filter((item) => item.mode === 'automated'),
    semi: sortedControls.filter((item) => item.mode === 'semi'),
    manual: sortedControls.filter((item) => item.mode === 'manual'),
  };

  const modeSummary = Object.fromEntries(
    Object.entries(byMode).map(([mode, items]) => [
      mode,
      {
        ...computeCounts(items),
        score: computeScore(items),
      },
    ]),
  );

  const totalSummary = {
    ...computeCounts(sortedControls),
    score: computeOverallScore(modeSummary),
  };
  const domainSummary = computeDomainSummary(sortedControls);

  const pageAuthControl = sortedControls.find((item) => item.id === 'filament.pages_authorization');
  const widgetAuthControl = sortedControls.find((item) => item.id === 'filament.widgets_authorization');
  const policyCoverageControl = sortedControls.find((item) => item.id === 'authz.policy_model_coverage');
  const gateCoverageControl = sortedControls.find((item) => item.id === 'authz.gate_definition_coverage');

  const filamentScores = {
    pages: pageAuthControl
      ? {
          score: computeScore([pageAuthControl]),
          status: pageAuthControl.status,
          total: filamentPageCount,
          authorized: filamentPagesWithAuth,
        }
      : null,
    widgets: widgetAuthControl
      ? {
          score: computeScore([widgetAuthControl]),
          status: widgetAuthControl.status,
          total: filamentWidgetCount,
          authorized: filamentWidgetsWithAuth,
        }
      : null,
  };

  const highlights = sortedControls
    .filter((item) => item.status !== 'pass')
    .slice(0, 12)
    .map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      severity: item.severity,
      category: item.category,
      message: item.message,
      recommendation: item.recommendation,
    }));

  return {
    baseline: {
      id: BASELINE_ID,
      version: BASELINE_VERSION,
      name: 'ACE Security Baseline (Laravel + Filament + Livewire)',
    },
    score: totalSummary.score,
    filamentScores,
    domainSummary,
    modeSummary,
    totals: totalSummary,
    controls: sortedControls,
    highlights,
    updatedAt: nowIso(),
    metadata: {
      catalogSize: CONTROL_CATALOG.length,
      scannedFiles: Object.keys(fileIndex || {}).length,
      hasWorkflows: workflowSignals.hasWorkflows,
      workflowFiles: workflowSignals.workflowFiles,
      dependencyVersions: {
        laravel: composerVersions.get('laravel/framework') || null,
        livewire: composerVersions.get('livewire/livewire') || null,
        filament: composerVersions.get('filament/filament') || null,
        sanctum: composerVersions.get('laravel/sanctum') || null,
        spatiePermission: composerVersions.get('spatie/laravel-permission') || null,
        horizon: composerVersions.get('laravel/horizon') || null,
      },
      dependencyAudits: {
        composer: composerAudit,
        npm: npmAudit,
      },
      authzCoverage: {
        policyModelCoverage: policyCoverageControl
          ? {
              status: policyCoverageControl.status,
              modelCount: authCoverageSignals.modelCount,
              coveredModelCount: authCoverageSignals.coveredModelCount,
              missingModels: authCoverageSignals.missingModels,
            }
          : null,
        gateCoverage: gateCoverageControl
          ? {
              status: gateCoverageControl.status,
              gateDefinitions: authCoverageSignals.gateDefinitions,
            }
          : null,
      },
      filamentScores,
      domainSummary,
      optionalStacks: {
        spatiePermission: hasSpatiePermission,
        sanctum: hasSanctum,
        horizon: hasHorizon,
      },
      modules: detectedModules,
      moduleScopeDraft,
    },
  };
}

module.exports = {
  BASELINE_ID,
  BASELINE_VERSION,
  evaluateSecurityBaseline,
};
