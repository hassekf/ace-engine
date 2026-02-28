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
const { scaffoldIntegration } = require('../init');
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
      name: 'ace.init_project',
      description: 'Scaffold de integração MCP/skills do ACE no projeto.',
      inputSchema: {
        type: 'object',
        properties: {
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
    // Legacy tools (mantidas para compatibilidade em profile=full)
    {
      name: 'ace.formalize_rule',
      description: 'Formaliza decisão arquitetural em regra versionada persistente.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          applies_to: {
            anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'string' }],
          },
          constraints: {
            anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'string' }],
          },
          source: { type: 'string' },
        },
        required: ['title'],
      },
    },
    {
      name: 'ace.update_rule',
      description: 'Atualiza status de regra formalizada.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          status: { type: 'string' },
          note: { type: 'string' },
          source: { type: 'string' },
        },
        required: ['id', 'status'],
      },
    },
    {
      name: 'ace.record_arch_decision',
      description: 'Registra decisão arquitetural versionada usada pelo modelo de coverage.',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          preferred: { type: 'string' },
          rationale: { type: 'string' },
          source: { type: 'string' },
          scope: { type: 'string' },
        },
        required: ['key', 'preferred'],
      },
    },
    {
      name: 'ace.list_arch_decisions',
      description: 'Lista decisões arquiteturais registradas.',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          status: { type: 'string' },
        },
      },
    },
    {
      name: 'ace.update_arch_decision',
      description: 'Atualiza status de decisão arquitetural.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          status: { type: 'string' },
          note: { type: 'string' },
          source: { type: 'string' },
        },
        required: ['id', 'status'],
      },
    },
    {
      name: 'ace.get_config',
      description: 'Retorna configuração do ACE no projeto.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: 'ace.init_config',
      description: 'Cria config base do ACE (.ace/config.json).',
      inputSchema: {
        type: 'object',
        properties: {
          force: { type: 'boolean' },
        },
      },
    },
    {
      name: 'ace.add_waiver',
      description: 'Adiciona waiver para suprimir violações temporárias.',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          file: { type: 'string' },
          severity: { type: 'string' },
          contains: { type: 'string' },
          reason: { type: 'string' },
          until: { type: 'string' },
          status: { type: 'string' },
        },
        required: ['reason'],
      },
    },
    {
      name: 'ace.update_waiver',
      description: 'Atualiza waiver por id.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          status: { type: 'string' },
          reason: { type: 'string' },
          until: { type: 'string' },
        },
        required: ['id'],
      },
    },
    {
      name: 'ace.list_waivers',
      description: 'Lista waivers ativos/inativos/expirados.',
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string' },
        },
      },
    },
    {
      name: 'ace.get_pattern_registry',
      description: 'Lista patterns ativos/inativos do registry dinâmico.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'ace.upsert_pattern',
      description: 'Cria ou atualiza um pattern no registry dinâmico.',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { type: 'object' },
        },
        required: ['pattern'],
      },
    },
    {
      name: 'ace.set_pattern_enabled',
      description: 'Ativa/desativa pattern por key.',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          enabled: { type: 'boolean' },
        },
        required: ['key', 'enabled'],
      },
    },
    {
      name: 'ace.remove_pattern',
      description: 'Remove pattern do registry por key.',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string' },
        },
        required: ['key'],
      },
    },
  ];

  if (profile === 'full') {
    return fullTools;
  }

  const compactSet = new Set([
    'ace.get_status',
    'ace.get_coverage',
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
    'ace.init_project',
    'ace.bootstrap_laravel',
  ]);

  return fullTools.filter((tool) => compactSet.has(tool.name));
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
        modules: state.security?.metadata?.modules || [],
      };
    }

    if (name === 'ace.get_coverage') {
      const state = loadState(root);
      return state.coverage;
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
      return {
        total: state.violations.length,
        items: state.violations.slice(0, limit),
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

    if (name === 'ace.formalize_rule') {
      const result = formalizeRule({
        root,
        title: args.title,
        description: args.description || '',
        appliesTo: args.applies_to || [],
        constraints: args.constraints || [],
        source: args.source || 'mcp-consensus',
      });

      return result;
    }

    if (name === 'ace.update_rule') {
      return updateRuleStatus({
        root,
        id: args.id,
        status: args.status,
        note: args.note || '',
        source: args.source || 'mcp',
      });
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

    if (name === 'ace.record_arch_decision') {
      return recordArchitecturalDecision({
        root,
        key: args.key,
        preferred: args.preferred,
        rationale: args.rationale || '',
        source: args.source || 'mcp-consensus',
        scope: args.scope || 'project',
      });
    }

    if (name === 'ace.list_arch_decisions') {
      return listArchitecturalDecisions({
        root,
        key: args.key || null,
        status: args.status || null,
      });
    }

    if (name === 'ace.update_arch_decision') {
      return updateArchitecturalDecision({
        root,
        id: args.id,
        status: args.status,
        note: args.note || '',
        source: args.source || 'mcp',
      });
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

    if (name === 'ace.get_config') {
      return loadAceConfig(root);
    }

    if (name === 'ace.init_config') {
      return initAceConfig(root, {
        force: Boolean(args.force),
      });
    }

    if (name === 'ace.init_project') {
      return scaffoldIntegration(root, {
        force: Boolean(args.force),
      });
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

    if (name === 'ace.add_waiver') {
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

    if (name === 'ace.update_waiver') {
      const patch = {};
      if (args.status) patch.status = args.status;
      if (args.reason) patch.reason = args.reason;
      if (args.until) patch.until = args.until;
      return updateWaiver(root, args.id, patch);
    }

    if (name === 'ace.list_waivers') {
      return listWaivers(root, {
        status: args.status || null,
      });
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

    if (name === 'ace.get_pattern_registry') {
      return listPatterns(root);
    }

    if (name === 'ace.upsert_pattern') {
      return upsertPattern(root, args.pattern);
    }

    if (name === 'ace.set_pattern_enabled') {
      return setPatternEnabled(root, args.key, Boolean(args.enabled));
    }

    if (name === 'ace.remove_pattern') {
      return removePattern(root, args.key);
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
