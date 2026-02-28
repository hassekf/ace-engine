const fs = require('node:fs');
const path = require('node:path');
const { ACE_DIR } = require('./constants');
const { initAceConfig } = require('./config');
const { ensureGovernanceFiles } = require('./state');
const { loadPatternRegistry } = require('./pattern-registry');

const SUPPORTED_LLM_TARGETS = ['claude', 'cursor', 'copilot', 'codex'];
const LLM_ALIASES = {
  claude: 'claude',
  'claude-code': 'claude',
  cursor: 'cursor',
  copilot: 'copilot',
  'github-copilot': 'copilot',
  codex: 'codex',
};

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function writeIfNeeded(filePath, content, { force = false } = {}) {
  if (fs.existsSync(filePath) && !force) {
    return {
      path: filePath,
      created: false,
    };
  }

  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${content}\n`, 'utf8');
  return {
    path: filePath,
    created: true,
  };
}

const ACE_GITIGNORE_START = '# --- ACE managed (begin) ---';
const ACE_GITIGNORE_END = '# --- ACE managed (end) ---';

function aceGitignoreBlock() {
  return [
    ACE_GITIGNORE_START,
    '.ace/*',
    '!.ace/config.json',
    '!.ace/pattern-registry.json',
    '!.ace/rules.json',
    '!.ace/decisions.json',
    ACE_GITIGNORE_END,
  ].join('\n');
}

function normalizeGitignoreBase(content) {
  const lines = String(content || '').split('\n');
  const withoutLegacyAceRoot = lines.filter((line) => {
    const normalized = String(line || '').trim();
    return !['.ace/', '.ace', '/.ace/'].includes(normalized);
  });
  return withoutLegacyAceRoot.join('\n');
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function upsertAceGitignore(root) {
  const gitignorePath = path.join(root, '.gitignore');
  const exists = fs.existsSync(gitignorePath);
  const current = exists ? fs.readFileSync(gitignorePath, 'utf8') : '';
  const escapedStart = escapeRegex(ACE_GITIGNORE_START);
  const escapedEnd = escapeRegex(ACE_GITIGNORE_END);
  const strippedManaged = current.replace(
    new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}\\n?`, 'g'),
    '',
  );
  const normalizedBase = normalizeGitignoreBase(strippedManaged).replace(/\s+$/g, '');
  const block = aceGitignoreBlock();
  const next = normalizedBase ? `${normalizedBase}\n\n${block}\n` : `${block}\n`;

  if (next === current) {
    return {
      path: gitignorePath,
      created: false,
      updated: false,
    };
  }

  fs.writeFileSync(gitignorePath, next, 'utf8');
  return {
    path: gitignorePath,
    created: !exists,
    updated: exists,
  };
}

function mcpSnippetForProject(projectRoot) {
  const escapedRoot = projectRoot.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return JSON.stringify(
    {
      mcpServers: {
        ace: {
          command: 'node',
          args: ['/path/to/ace/bin/ace.js', 'mcp', `--root=${escapedRoot}`],
          env: {
            ACE_MCP_PROFILE: 'compact',
          },
        },
      },
    },
    null,
    2,
  );
}

function skillPromptTemplate(projectRoot) {
  return [
    '# ACE Guardian Prompt Template',
    '',
    'Use este prompt base para qualquer LLM que suporte instruções persistentes:',
    '',
    '```',
    'Sempre opere no modo ACE Architectural Guardian.',
    'Antes de propor ou gerar mudanças estruturais, consulte o MCP ACE:',
    '1) ace.get_status',
    '2) ace.get_project_model',
    '3) ace.get_security',
    '4) ace.scan_scope com os arquivos alterados',
    'Após gerar código, rode novamente ace.scan_scope e explique deltas.',
    'Não formalize regra/decisão sem consenso explícito do usuário.',
    '```',
    '',
    `Projeto alvo: ${projectRoot}`,
  ].join('\n');
}

function integrationReadme(projectRoot, llms = SUPPORTED_LLM_TARGETS) {
  const selected = new Set(normalizeLlmTargets(llms));
  const files = [];

  if (selected.has('claude')) {
    files.push('- `mcp.claude-code.example.json`');
    files.push('- `.claude/skills/ace-architectural-guardian/SKILL.md`');
  }
  if (selected.has('cursor')) {
    files.push('- `mcp.cursor.example.json`');
  }
  if (selected.has('copilot')) {
    files.push('- `mcp.copilot.example.json`');
  }
  if (selected.has('codex')) {
    files.push('- `mcp.codex.example.json`');
    files.push('- `.codex/skills/ace-architectural-guardian/SKILL.md`');
  }

  return [
    '# ACE Integration',
    '',
    'Este diretório contém artefatos de onboarding para integrar o ACE em diferentes clientes LLM.',
    '',
    'Arquivos gerados:',
    '',
    ...files,
    '- `skill-prompt.md`',
    '',
    'Passos:',
    '',
    '1. Copie o snippet do cliente desejado para a configuração de MCP do seu ambiente.',
    '2. Ajuste o caminho do binário `ace` se necessário.',
    '3. Adicione o conteúdo de `skill-prompt.md` nas instruções persistentes da LLM.',
    '',
    `Root configurado: ${projectRoot}`,
  ].join('\n');
}

function normalizeLlmTargets(input) {
  const raw = Array.isArray(input) ? input : SUPPORTED_LLM_TARGETS;
  const normalized = [];

  raw.forEach((item) => {
    const key = String(item || '').trim().toLowerCase();
    if (!key) {
      return;
    }
    if (key === 'all') {
      SUPPORTED_LLM_TARGETS.forEach((target) => {
        if (!normalized.includes(target)) {
          normalized.push(target);
        }
      });
      return;
    }

    const mapped = LLM_ALIASES[key];
    if (mapped && !normalized.includes(mapped)) {
      normalized.push(mapped);
    }
  });

  return normalized.length > 0 ? normalized : [...SUPPORTED_LLM_TARGETS];
}

function aceGuardianSkillTemplatePath() {
  return path.resolve(__dirname, '..', 'skills', 'ace-architectural-guardian', 'SKILL.md');
}

function aceGuardianSkillContent(projectRoot) {
  const templatePath = aceGuardianSkillTemplatePath();
  if (fs.existsSync(templatePath)) {
    return fs.readFileSync(templatePath, 'utf8');
  }

  return [
    '---',
    'name: ace-architectural-guardian',
    'description: Keep code aligned with ACE via MCP tools before/after structural changes.',
    '---',
    '',
    '# ACE Architectural Guardian',
    '',
    '1. Consult `ace.get_status` e `ace.get_project_model` antes de mudanças estruturais.',
    '2. Use `ace.scan_scope` no escopo alterado.',
    '3. Reavalie cobertura e inconsistências após mudanças.',
    '4. Só formalize regras/decisões com consenso explícito do usuário.',
    '',
    `Projeto alvo: ${projectRoot}`,
  ].join('\n');
}

function createLlmIntegrationArtifacts({ root, integrationDir, force, llms, mcpSnippet }) {
  const artifacts = [];
  const selected = new Set(llms);

  if (selected.has('claude')) {
    artifacts.push(
      writeIfNeeded(path.join(integrationDir, 'mcp.claude-code.example.json'), mcpSnippet, { force }),
      writeIfNeeded(
        path.join(root, '.claude', 'skills', 'ace-architectural-guardian', 'SKILL.md'),
        aceGuardianSkillContent(root),
        { force },
      ),
    );
  }

  if (selected.has('cursor')) {
    artifacts.push(writeIfNeeded(path.join(integrationDir, 'mcp.cursor.example.json'), mcpSnippet, { force }));
  }

  if (selected.has('copilot')) {
    artifacts.push(writeIfNeeded(path.join(integrationDir, 'mcp.copilot.example.json'), mcpSnippet, { force }));
  }

  if (selected.has('codex')) {
    artifacts.push(
      writeIfNeeded(path.join(integrationDir, 'mcp.codex.example.json'), mcpSnippet, { force }),
      writeIfNeeded(
        path.join(root, '.codex', 'skills', 'ace-architectural-guardian', 'SKILL.md'),
        aceGuardianSkillContent(root),
        { force },
      ),
    );
  }

  return artifacts;
}

function aceDirReadme() {
  return [
    '# ACE Storage Layout',
    '',
    'Arquivos versionáveis (recomendado manter no git):',
    '- `config.json`',
    '- `pattern-registry.json`',
    '- `rules.json`',
    '- `decisions.json`',
    '',
    'Arquivos locais/efêmeros (normalmente ignorados no git):',
    '- `ace.json`',
    '- `report.html`',
    '- `history/`',
    '- `integration/`',
  ].join('\n');
}

function scaffoldIntegration(root, { force = false, llms = SUPPORTED_LLM_TARGETS } = {}) {
  const selectedLlms = normalizeLlmTargets(llms);
  const configInit = initAceConfig(root, { force });
  const governanceInit = ensureGovernanceFiles(root, { force });
  const patternRegistryPath = path.join(root, ACE_DIR, 'pattern-registry.json');
  const hadPatternRegistry = fs.existsSync(patternRegistryPath);
  loadPatternRegistry(root);
  const gitignoreInit = upsertAceGitignore(root);

  const integrationDir = path.join(root, ACE_DIR, 'integration');
  ensureDir(integrationDir);

  const mcpSnippet = mcpSnippetForProject(root);
  const llmArtifacts = createLlmIntegrationArtifacts({
    root,
    integrationDir,
    force,
    llms: selectedLlms,
    mcpSnippet,
  });

  const artifacts = [
    {
      path: configInit.configPath,
      created: Boolean(configInit.created),
      key: 'config',
    },
    {
      path: patternRegistryPath,
      created: !hadPatternRegistry,
      key: 'pattern-registry',
    },
    ...governanceInit.artifacts,
    {
      path: gitignoreInit.path,
      created: Boolean(gitignoreInit.created),
      updated: Boolean(gitignoreInit.updated),
      key: 'gitignore',
    },
    writeIfNeeded(path.join(root, ACE_DIR, 'README.md'), aceDirReadme(), { force }),
    ...llmArtifacts,
    writeIfNeeded(path.join(integrationDir, 'skill-prompt.md'), skillPromptTemplate(root), { force }),
    writeIfNeeded(path.join(integrationDir, 'README.md'), integrationReadme(root, selectedLlms), { force }),
  ];

  return {
    config: configInit,
    governance: governanceInit,
    gitignore: gitignoreInit,
    llms: selectedLlms,
    integrationDir,
    artifacts,
  };
}

module.exports = {
  scaffoldIntegration,
  normalizeLlmTargets,
  SUPPORTED_LLM_TARGETS,
};
