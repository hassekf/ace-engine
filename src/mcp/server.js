const { runScan } = require('../engine');
const { loadState } = require('../state');
const { formalizeRule, updateRuleStatus } = require('../rules');
const {
  recordArchitecturalDecision,
  updateArchitecturalDecision,
  listArchitecturalDecisions,
} = require('../decisions');
const { buildLearningBundle } = require('../learning');
const { loadAceConfig, addWaiver, updateWaiver, listWaivers, initAceConfig } = require('../config');
const {
  listPatterns,
  upsertPattern,
  setPatternEnabled,
  removePattern,
  loadPatternRegistry,
} = require('../pattern-registry');
const { bootstrapLaravel } = require('../bootstrap');
const { getComposerDependencyVersions, detectProjectModules, buildModuleScopeDraft } = require('../modules');
const { OUTPUT_SCHEMA_VERSION } = require('../constants');

function toToolResponse(data) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
    structuredContent: data,
  };
}

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return Number(fallback || 0);
  }
  return numeric;
}

function normalizeTrendWindow(value) {
  const numeric = Math.round(Number(value));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 24;
  }
  return Math.max(6, Math.min(160, numeric));
}

function summarizeSeries(values = []) {
  if (!values.length) {
    return {
      latest: 0,
      first: 0,
      deltaWindow: 0,
      averageStep: 0,
      max: 0,
      min: 0,
    };
  }

  const first = toFiniteNumber(values[0]);
  const latest = toFiniteNumber(values[values.length - 1]);
  const deltaWindow = Number((latest - first).toFixed(2));
  const averageStep =
    values.length > 1
      ? Number((deltaWindow / (values.length - 1)).toFixed(2))
      : 0;

  return {
    latest,
    first,
    deltaWindow,
    averageStep,
    max: Math.max(...values.map((value) => toFiniteNumber(value))),
    min: Math.min(...values.map((value) => toFiniteNumber(value))),
  };
}

function buildTrendPayload(state, args = {}) {
  const window = normalizeTrendWindow(args.window);
  const history = Array.isArray(state.history) ? state.history : [];
  const recent = history.slice(-window);
  const fallbackTimestamp = state.updatedAt || new Date().toISOString();
  const seriesSource =
    recent.length > 0
      ? recent
      : [
          {
            timestamp: fallbackTimestamp,
            overall: Number(state.coverage?.overall || 0),
            securityScore: Number(state.security?.score || 0),
            violationCount: Number(state.violations?.length || 0),
            newViolations: Number(state.lastScan?.newViolations || 0),
            resolvedViolations: Number(state.lastScan?.resolvedViolations || 0),
            scope: String(state.lastScan?.scope || 'current'),
            files: Number(state.coverage?.scannedFiles || 0),
          },
        ];

  const points = seriesSource.map((item) => ({
    timestamp: item.timestamp || fallbackTimestamp,
    overall: toFiniteNumber(item.overall),
    securityScore: toFiniteNumber(item.securityScore),
    violationCount: toFiniteNumber(item.violationCount),
    newViolations: toFiniteNumber(item.newViolations),
    resolvedViolations: toFiniteNumber(item.resolvedViolations),
    files: toFiniteNumber(item.files),
    scope: String(item.scope || 'unknown'),
  }));

  const coverageValues = points.map((item) => item.overall);
  const securityValues = points.map((item) => item.securityScore);
  const violationValues = points.map((item) => item.violationCount);

  return {
    schemaVersion: OUTPUT_SCHEMA_VERSION,
    generatedAt: state.updatedAt,
    window,
    samples: points.length,
    trend: state.trend || {},
    coverage: {
      ...summarizeSeries(coverageValues),
      status: state.trend?.coverage?.status || 'stable',
      regression: state.trend?.coverage?.regression || {
        triggered: false,
        drop: 0,
        threshold: 0,
      },
      series: points.map((item) => ({
        timestamp: item.timestamp,
        value: item.overall,
      })),
    },
    security: {
      ...summarizeSeries(securityValues),
      status: state.trend?.security?.status || 'stable',
      regression: state.trend?.security?.regression || {
        triggered: false,
        drop: 0,
        threshold: 0,
      },
      series: points.map((item) => ({
        timestamp: item.timestamp,
        value: item.securityScore,
      })),
    },
    violations: {
      ...summarizeSeries(violationValues),
      current: Number(state.violations?.length || 0),
      newInWindow: points.reduce((sum, item) => sum + toFiniteNumber(item.newViolations), 0),
      resolvedInWindow: points.reduce((sum, item) => sum + toFiniteNumber(item.resolvedViolations), 0),
      series: points.map((item) => ({
        timestamp: item.timestamp,
        value: item.violationCount,
      })),
    },
    scanActivity: points.map((item) => ({
      timestamp: item.timestamp,
      scope: item.scope,
      files: item.files,
      newViolations: item.newViolations,
      resolvedViolations: item.resolvedViolations,
    })),
  };
}

function buildToolsManifest(profile = 'compact') {
  const fullTools = [
    {
      name: 'ace.get_status',
      description: 'Retorna status atual do ACE com score, tendências e alertas.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: 'ace.get_coverage',
      description: 'Retorna métricas de AchCoverage e dimensões arquiteturais.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: 'ace.get_trend',
      description: 'Retorna análise temporal de coverage, segurança e evolução de violações.',
      inputSchema: {
        type: 'object',
        properties: {
          window: { type: 'number' },
        },
      },
    },
    {
      name: 'ace.get_security',
      description: 'Retorna baseline de segurança padrão e controles avaliados.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: 'ace.get_project_model',
      description: 'Retorna o modelo arquitetural vivo do projeto.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: 'ace.report_inconsistencies',
      description: 'Retorna inconsistências e alertas detectados.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number' },
          priority: { type: 'string' },
          sort_by: { type: 'string' },
        },
      },
    },
    {
      name: 'ace.scan_scope',
      description: 'Executa scan no escopo informado e atualiza coverage/report.',
      inputSchema: {
        type: 'object',
        properties: {
          scope: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    {
      name: 'ace.get_learning_bundle',
      description: 'Retorna bundle contextual para LLM inferir padrões e priorizar decisões.',
      inputSchema: {
        type: 'object',
        properties: {
          max_files: { type: 'number' },
          files: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    {
      name: 'ace.get_modules',
      description: 'Retorna módulos detectados (stack-aware), docs oficiais e rascunho de escopo para LLM.',
      inputSchema: {
        type: 'object',
        properties: {
          enabled_only: { type: 'boolean' },
        },
      },
    },
    {
      name: 'ace.manage_rules',
      description: 'Gerencia regras arquiteturais (list/create/update) em uma única tool.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'create', 'update'] },
          id: { type: 'string' },
          status: { type: 'string' },
          note: { type: 'string' },
          source: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          applies_to: {
            anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'string' }],
          },
          constraints: {
            anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'string' }],
          },
        },
      },
    },
    {
      name: 'ace.manage_decisions',
      description: 'Gerencia decisões arquiteturais (list/create/update) em uma única tool.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'create', 'update'] },
          id: { type: 'string' },
          key: { type: 'string' },
          preferred: { type: 'string' },
          rationale: { type: 'string' },
          status: { type: 'string' },
          note: { type: 'string' },
          source: { type: 'string' },
          scope: { type: 'string' },
        },
      },
    },
    {
      name: 'ace.manage_waivers',
      description: 'Gerencia waivers (list/create/update) em uma única tool.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'create', 'update'] },
          id: { type: 'string' },
          type: { type: 'string' },
          file: { type: 'string' },
          severity: { type: 'string' },
          contains: { type: 'string' },
          reason: { type: 'string' },
          until: { type: 'string' },
          status: { type: 'string' },
        },
      },
    },
    {
      name: 'ace.manage_patterns',
      description: 'Gerencia pattern registry (list/upsert/set_enabled/remove) em uma única tool.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'upsert', 'set_enabled', 'remove'] },
          key: { type: 'string' },
          enabled: { type: 'boolean' },
          pattern: { type: 'object' },
        },
      },
    },
    {
      name: 'ace.manage_config',
      description: 'Gerencia config do ACE (get/init) em uma única tool.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['get', 'init'] },
          force: { type: 'boolean' },
        },
      },
    },
    {
      name: 'ace.bootstrap_laravel',
      description:
        'Executa bootstrap Laravel: scan inicial, inclusão de patterns úteis e formalização opcional de decisões.',
      inputSchema: {
        type: 'object',
        properties: {
          scope: { type: 'string' },
          apply: { type: 'boolean' },
          ensure_patterns: { type: 'boolean' },
          min_confidence: { type: 'number' },
          min_adoption: { type: 'number' },
          max_decisions: { type: 'number' },
        },
      },
    },
  ];

  const publicSet = new Set([
    'ace.get_status',
    'ace.get_coverage',
    'ace.get_trend',
    'ace.get_security',
    'ace.get_project_model',
    'ace.report_inconsistencies',
    'ace.scan_scope',
    'ace.get_learning_bundle',
    'ace.get_modules',
    'ace.manage_rules',
    'ace.manage_decisions',
    'ace.manage_waivers',
    'ace.manage_patterns',
    'ace.manage_config',
    'ace.bootstrap_laravel',
  ]);

  return fullTools.filter((tool) => publicSet.has(tool.name));
}

function createMessageWriter() {
  return function writeMessage(payload) {
    const body = JSON.stringify(payload);
    const contentLength = Buffer.byteLength(body, 'utf8');
    process.stdout.write(`Content-Length: ${contentLength}\r\n\r\n${body}`);
  };
}

function createMessageReader(onMessage) {
  let buffer = Buffer.alloc(0);

  process.stdin.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (true) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        break;
      }

      const header = buffer.slice(0, headerEnd).toString('utf8');
      const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
      if (!lengthMatch) {
        buffer = Buffer.alloc(0);
        return;
      }

      const contentLength = Number(lengthMatch[1]);
      const totalLength = headerEnd + 4 + contentLength;
      if (buffer.length < totalLength) {
        break;
      }

      const body = buffer.slice(headerEnd + 4, totalLength).toString('utf8');
      buffer = buffer.slice(totalLength);

      try {
        const message = JSON.parse(body);
        onMessage(message);
      } catch (error) {
        // Ignore malformed payloads.
      }
    }
  });
}

function startMcpServer({ root, profile = null }) {
  const writeMessage = createMessageWriter();
  const selectedProfile =
    profile ||
    process.env.ACE_MCP_PROFILE ||
    'compact';
  const effectiveProfile = String(selectedProfile).toLowerCase() === 'full'
    ? 'full'
    : 'compact';
  const tools = buildToolsManifest(effectiveProfile);

  function respond(id, result) {
    writeMessage({
      jsonrpc: '2.0',
      id,
      result,
    });
  }

  function respondError(id, message, code = -32000) {
    writeMessage({
      jsonrpc: '2.0',
      id,
      error: { code, message },
    });
  }

  function handleToolCall(name, args = {}) {
    if (name === 'ace.get_status') {
      const state = loadState(root);
      return {
        schemaVersion: OUTPUT_SCHEMA_VERSION,
        coverage: state.coverage,
        trend: state.trend || {},
        model: state.model,
        lastScan: state.lastScan,
        waivers: {
          total: Number(loadAceConfig(root).waivers?.length || 0),
        },
        totals: {
          violations: state.violations.length,
          waivedViolations: (state.waivedViolations || []).length,
          suggestions: state.suggestions.length,
          rules: state.rules.length,
        },
        security: state.security || {},
        actionability: state.actionability || {
          summary: {
            total: Number(state.violations?.length || 0),
            averageScore: 0,
            highPriority: 0,
            withTestSignal: 0,
            withoutTestSignal: Number(state.violations?.length || 0),
            distribution: { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 },
            topScore: 0,
          },
          top: [],
        },
        modules: state.security?.metadata?.modules || [],
      };
    }

    if (name === 'ace.get_coverage') {
      const state = loadState(root);
      return state.coverage;
    }

    if (name === 'ace.get_trend') {
      const state = loadState(root);
      return buildTrendPayload(state, args);
    }

    if (name === 'ace.get_security') {
      const state = loadState(root);
      return state.security || {};
    }

    if (name === 'ace.get_project_model') {
      const state = loadState(root);
      return {
        schemaVersion: OUTPUT_SCHEMA_VERSION,
        model: state.model,
        decisions: state.decisions || [],
        rules: state.rules,
        modules: state.security?.metadata?.modules || [],
        moduleScopeDraft: state.security?.metadata?.moduleScopeDraft || [],
      };
    }

    if (name === 'ace.report_inconsistencies') {
      const state = loadState(root);
      const limit = Number(args.limit || 50);
      const priority = String(args.priority || '').toUpperCase();
      const sortBy = String(args.sort_by || 'actionability').toLowerCase();
      const items = (state.violations || []).filter((item) => {
        if (!priority) {
          return true;
        }
        return String(item.actionabilityPriority || '').toUpperCase() === priority;
      });
      const sorted = sortBy === 'severity'
        ? [...items].sort((a, b) => {
            const rank = { critical: 5, high: 4, medium: 3, low: 2 };
            const diff = (rank[String(b.severity || 'low').toLowerCase()] || 0) - (rank[String(a.severity || 'low').toLowerCase()] || 0);
            if (diff !== 0) return diff;
            return Number(b.actionabilityScore || 0) - Number(a.actionabilityScore || 0);
          })
        : [...items].sort(
            (a, b) => Number(b.actionabilityScore || 0) - Number(a.actionabilityScore || 0),
          );
      return {
        total: state.violations.length,
        filtered: sorted.length,
        items: sorted.slice(0, limit),
      };
    }

    if (name === 'ace.scan_scope') {
      const summary = runScan({
        root,
        scope: args.scope || 'changed',
        explicitFiles: Array.isArray(args.files) ? args.files : [],
        writeHtml: true,
      });

      return summary;
    }

    if (name === 'ace.manage_rules') {
      const action = String(args.action || 'list').toLowerCase();
      if (action === 'list') {
        const state = loadState(root);
        const status = args.status ? String(args.status) : null;
        const items = (state.rules || []).filter((item) => (status ? item.status === status : true));
        return {
          total: items.length,
          items,
        };
      }
      if (action === 'create') {
        return formalizeRule({
          root,
          title: args.title,
          description: args.description || '',
          appliesTo: args.applies_to || [],
          constraints: args.constraints || [],
          source: args.source || 'mcp-consensus',
        });
      }
      if (action === 'update') {
        return updateRuleStatus({
          root,
          id: args.id,
          status: args.status,
          note: args.note || '',
          source: args.source || 'mcp',
        });
      }
      throw new Error(`Ação inválida em ace.manage_rules: ${action}`);
    }

    if (name === 'ace.get_learning_bundle') {
      const state = loadState(root);
      return buildLearningBundle({
        state,
        registry: loadPatternRegistry(root),
        maxFiles: Number(args.max_files || 20),
        scopeFiles: Array.isArray(args.files) ? args.files : [],
      });
    }

    if (name === 'ace.get_modules') {
      const state = loadState(root);
      const modules = detectProjectModules({
        root,
        metrics: state.model?.stats || {},
        composerVersions: getComposerDependencyVersions(root),
      });
      const items = args.enabled_only ? modules.filter((item) => item.enabled) : modules;
      return {
        total: modules.length,
        enabled: modules.filter((item) => item.enabled).length,
        items,
        scopeDraft: buildModuleScopeDraft(modules),
      };
    }

    if (name === 'ace.manage_decisions') {
      const action = String(args.action || 'list').toLowerCase();
      if (action === 'list') {
        return listArchitecturalDecisions({
          root,
          key: args.key || null,
          status: args.status || null,
        });
      }
      if (action === 'create') {
        return recordArchitecturalDecision({
          root,
          key: args.key,
          preferred: args.preferred,
          rationale: args.rationale || '',
          source: args.source || 'mcp-consensus',
          scope: args.scope || 'project',
        });
      }
      if (action === 'update') {
        return updateArchitecturalDecision({
          root,
          id: args.id,
          status: args.status,
          note: args.note || '',
          source: args.source || 'mcp',
        });
      }
      throw new Error(`Ação inválida em ace.manage_decisions: ${action}`);
    }

    if (name === 'ace.manage_config') {
      const action = String(args.action || 'get').toLowerCase();
      if (action === 'get') {
        return loadAceConfig(root);
      }
      if (action === 'init') {
        return initAceConfig(root, {
          force: Boolean(args.force),
        });
      }
      throw new Error(`Ação inválida em ace.manage_config: ${action}`);
    }

    if (name === 'ace.manage_waivers') {
      const action = String(args.action || 'list').toLowerCase();
      if (action === 'list') {
        return listWaivers(root, {
          status: args.status || null,
        });
      }
      if (action === 'create') {
        return addWaiver(root, {
          type: args.type || null,
          file: args.file || null,
          severity: args.severity || null,
          contains: args.contains || null,
          reason: args.reason,
          until: args.until || null,
          status: args.status || 'active',
        });
      }
      if (action === 'update') {
        const patch = {};
        if (args.status) patch.status = args.status;
        if (args.reason) patch.reason = args.reason;
        if (args.until) patch.until = args.until;
        return updateWaiver(root, args.id, patch);
      }
      throw new Error(`Ação inválida em ace.manage_waivers: ${action}`);
    }

    if (name === 'ace.manage_patterns') {
      const action = String(args.action || 'list').toLowerCase();
      if (action === 'list') {
        return listPatterns(root);
      }
      if (action === 'upsert') {
        return upsertPattern(root, args.pattern);
      }
      if (action === 'set_enabled') {
        return setPatternEnabled(root, args.key, Boolean(args.enabled));
      }
      if (action === 'remove') {
        return removePattern(root, args.key);
      }
      throw new Error(`Ação inválida em ace.manage_patterns: ${action}`);
    }

    if (name === 'ace.bootstrap_laravel') {
      return bootstrapLaravel({
        root,
        scope: args.scope || 'all',
        apply: args.apply !== false,
        ensurePatterns: args.ensure_patterns !== false,
        minConfidence: Number(args.min_confidence || 55),
        minAdoption: Number(args.min_adoption || 55),
        maxDecisions: Number(args.max_decisions || 4),
      });
    }

    throw new Error(`Tool não suportada: ${name}`);
  }

  createMessageReader((message) => {
    const { id, method, params } = message;

    if (!method) {
      return;
    }

    try {
      if (method === 'initialize') {
        respond(id, {
          protocolVersion: '2025-03-26',
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: 'ace-mcp',
            version: '0.1.0',
          },
          instructions: `ACE MCP profile=${effectiveProfile} tools=${tools.length}`,
        });
        return;
      }

      if (method === 'notifications/initialized') {
        return;
      }

      if (method === 'tools/list') {
        respond(id, { tools });
        return;
      }

      if (method === 'tools/call') {
        const name = params?.name;
        const args = params?.arguments || {};

        const output = handleToolCall(name, args);
        respond(id, toToolResponse(output));
        return;
      }

      if (method === 'ping') {
        respond(id, {});
        return;
      }

      respondError(id, `Método não suportado: ${method}`, -32601);
    } catch (error) {
      respondError(id, error.message, -32001);
    }
  });

  process.stderr.write(`[ACE MCP] Servidor iniciado via stdio (profile=${effectiveProfile}, tools=${tools.length}).\n`);
}

module.exports = {
  startMcpServer,
  buildToolsManifest,
};
