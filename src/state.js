const fs = require('node:fs');
const path = require('node:path');
const { ACE_DIR, STATE_FILE, HISTORY_DIR, RULES_FILE, DECISIONS_FILE } = require('./constants');
const { nowIso } = require('./helpers');

function getAceDir(root) {
  return path.join(root, ACE_DIR);
}

function getStatePath(root) {
  return path.join(getAceDir(root), STATE_FILE);
}

function getHistoryDir(root) {
  return path.join(getAceDir(root), HISTORY_DIR);
}

function getRulesPath(root) {
  return path.join(getAceDir(root), RULES_FILE);
}

function getDecisionsPath(root) {
  return path.join(getAceDir(root), DECISIONS_FILE);
}

function ensureAceLayout(root) {
  fs.mkdirSync(getAceDir(root), { recursive: true });
  fs.mkdirSync(getHistoryDir(root), { recursive: true });
}

function createInitialState(root) {
  const now = nowIso();

  return {
    schemaVersion: 4,
    projectRoot: root,
    createdAt: now,
    updatedAt: now,
    coverage: {
      overall: 0,
      delta: 0,
      confidence: 0,
      dimensions: {
        layering: 0,
        validation: 0,
        testability: 0,
        consistency: 0,
        authorization: 0,
      },
      testQuality: {
        score: 0,
        testFiles: 0,
        testCases: 0,
        assertionsPerCase: 0,
        edgeSignalsPerCase: 0,
        mocksPerCase: 0,
        dataProvidersPerCase: 0,
        noAssertionFilesRatio: 0,
        confidence: 'low',
      },
      scannedFiles: 0,
      totalPhpFiles: 0,
    },
    model: {
      dominantPattern: 'unknown',
      patterns: {},
      decisionCount: 0,
      stats: {},
    },
    security: {
      baseline: {
        id: 'ace-laravel-filament-livewire-security-v1',
        version: 1,
        name: 'ACE Security Baseline (Laravel + Filament + Livewire)',
      },
      score: 0,
      totals: {
        total: 0,
        pass: 0,
        warning: 0,
        fail: 0,
        unknown: 0,
        score: 0,
      },
      modeSummary: {
        automated: {
          total: 0,
          pass: 0,
          warning: 0,
          fail: 0,
          unknown: 0,
          score: 0,
        },
        semi: {
          total: 0,
          pass: 0,
          warning: 0,
          fail: 0,
          unknown: 0,
          score: 0,
        },
        manual: {
          total: 0,
          pass: 0,
          warning: 0,
          fail: 0,
          unknown: 0,
          score: 0,
        },
      },
      domainSummary: {
        code: {
          total: 0,
          pass: 0,
          warning: 0,
          fail: 0,
          unknown: 0,
          score: 0,
        },
        pipeline: {
          total: 0,
          pass: 0,
          warning: 0,
          fail: 0,
          unknown: 0,
          score: 0,
        },
      },
      controls: [],
      highlights: [],
      metadata: {},
      updatedAt: now,
    },
    trend: {
      window: 0,
      stableBand: 0,
      regressionThreshold: 0,
      coverage: {
        status: 'stable',
        sampleSize: 0,
        deltaWindow: 0,
        averageStep: 0,
        lastStep: 0,
        regression: {
          triggered: false,
          drop: 0,
          threshold: 0,
        },
      },
      security: {
        status: 'stable',
        sampleSize: 0,
        deltaWindow: 0,
        averageStep: 0,
        lastStep: 0,
        regression: {
          triggered: false,
          drop: 0,
          threshold: 0,
        },
      },
    },
    violations: [],
    waivedViolations: [],
    actionability: {
      summary: {
        total: 0,
        averageScore: 0,
        highPriority: 0,
        withTestSignal: 0,
        withoutTestSignal: 0,
        distribution: {
          P1: 0,
          P2: 0,
          P3: 0,
          P4: 0,
          P5: 0,
        },
        topScore: 0,
      },
      top: [],
    },
    suggestions: [],
    rules: [],
    decisions: [],
    fileIndex: {},
    lastScan: {
      scope: 'none',
      files: [],
      durationMs: 0,
      newViolations: 0,
      resolvedViolations: 0,
      analyzedAt: now,
    },
    history: [],
  };
}

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      valid: false,
      value: fallback,
    };
  }

  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      exists: true,
      valid: true,
      value,
    };
  } catch (error) {
    return {
      exists: true,
      valid: false,
      value: fallback,
    };
  }
}

function ensureGovernanceFiles(root, { force = false } = {}) {
  ensureAceLayout(root);
  const artifacts = [];

  const targets = [
    { path: getRulesPath(root), key: 'rules' },
    { path: getDecisionsPath(root), key: 'decisions' },
  ];

  targets.forEach((target) => {
    if (fs.existsSync(target.path) && !force) {
      artifacts.push({
        key: target.key,
        path: target.path,
        created: false,
      });
      return;
    }

    fs.writeFileSync(target.path, '[]\n', 'utf8');
    artifacts.push({
      key: target.key,
      path: target.path,
      created: true,
    });
  });

  return {
    artifacts,
  };
}

function loadState(root) {
  ensureAceLayout(root);
  const initial = createInitialState(root);

  const statePath = getStatePath(root);
  if (!fs.existsSync(statePath)) {
    const rulesStore = readJsonIfExists(getRulesPath(root), []);
    const decisionsStore = readJsonIfExists(getDecisionsPath(root), []);
    return {
      ...initial,
      rules: Array.isArray(rulesStore.value) ? rulesStore.value : [],
      decisions: Array.isArray(decisionsStore.value) ? decisionsStore.value : [],
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const stateRules = Array.isArray(parsed.rules) ? parsed.rules : [];
    const stateDecisions = Array.isArray(parsed.decisions) ? parsed.decisions : [];
    const rulesStore = readJsonIfExists(getRulesPath(root), stateRules);
    const decisionsStore = readJsonIfExists(getDecisionsPath(root), stateDecisions);
    const resolvedRules =
      rulesStore.exists && rulesStore.valid && Array.isArray(rulesStore.value) ? rulesStore.value : stateRules;
    const resolvedDecisions =
      decisionsStore.exists && decisionsStore.valid && Array.isArray(decisionsStore.value)
        ? decisionsStore.value
        : stateDecisions;

    return {
      ...initial,
      ...parsed,
      coverage: {
        ...initial.coverage,
        ...(parsed.coverage || {}),
        dimensions: {
          ...initial.coverage.dimensions,
          ...((parsed.coverage && parsed.coverage.dimensions) || {}),
        },
      },
      model: {
        ...initial.model,
        ...(parsed.model || {}),
      },
      security: {
        ...initial.security,
        ...(parsed.security || {}),
        totals: {
          ...initial.security.totals,
          ...((parsed.security && parsed.security.totals) || {}),
        },
        modeSummary: {
          ...initial.security.modeSummary,
          ...((parsed.security && parsed.security.modeSummary) || {}),
          automated: {
            ...initial.security.modeSummary.automated,
            ...((parsed.security && parsed.security.modeSummary && parsed.security.modeSummary.automated) || {}),
          },
          semi: {
            ...initial.security.modeSummary.semi,
            ...((parsed.security && parsed.security.modeSummary && parsed.security.modeSummary.semi) || {}),
          },
          manual: {
            ...initial.security.modeSummary.manual,
            ...((parsed.security && parsed.security.modeSummary && parsed.security.modeSummary.manual) || {}),
          },
        },
        domainSummary: {
          ...initial.security.domainSummary,
          ...((parsed.security && parsed.security.domainSummary) || {}),
          code: {
            ...initial.security.domainSummary.code,
            ...((parsed.security && parsed.security.domainSummary && parsed.security.domainSummary.code) || {}),
          },
          pipeline: {
            ...initial.security.domainSummary.pipeline,
            ...((parsed.security && parsed.security.domainSummary && parsed.security.domainSummary.pipeline) || {}),
          },
        },
      },
      lastScan: {
        ...initial.lastScan,
        ...(parsed.lastScan || {}),
      },
      fileIndex: parsed.fileIndex || {},
      violations: parsed.violations || [],
      waivedViolations: parsed.waivedViolations || [],
      actionability: {
        ...initial.actionability,
        ...(parsed.actionability || {}),
        summary: {
          ...initial.actionability.summary,
          ...((parsed.actionability && parsed.actionability.summary) || {}),
          distribution: {
            ...initial.actionability.summary.distribution,
            ...((parsed.actionability &&
              parsed.actionability.summary &&
              parsed.actionability.summary.distribution) || {}),
          },
        },
        top: Array.isArray(parsed.actionability?.top) ? parsed.actionability.top : [],
      },
      suggestions: parsed.suggestions || [],
      rules: resolvedRules,
      decisions: resolvedDecisions,
      history: parsed.history || [],
    };
  } catch (error) {
    return initial;
  }
}

function saveState(root, state) {
  ensureAceLayout(root);
  const rules = Array.isArray(state.rules) ? state.rules : [];
  const decisions = Array.isArray(state.decisions) ? state.decisions : [];
  fs.writeFileSync(getRulesPath(root), `${JSON.stringify(rules, null, 2)}\n`, 'utf8');
  fs.writeFileSync(getDecisionsPath(root), `${JSON.stringify(decisions, null, 2)}\n`, 'utf8');

  const nextState = {
    ...state,
    schemaVersion: Math.max(4, Number(state.schemaVersion || 0)),
    governance: {
      files: {
        rules: RULES_FILE,
        decisions: DECISIONS_FILE,
      },
      counts: {
        rules: rules.length,
        decisions: decisions.length,
      },
      updatedAt: nowIso(),
    },
  };

  delete nextState.rules;
  delete nextState.decisions;

  const statePath = getStatePath(root);
  fs.writeFileSync(statePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
}

function appendHistorySnapshot(root, snapshot) {
  ensureAceLayout(root);

  const timestamp = snapshot.timestamp.replace(/[.:]/g, '-');
  const filename = `${timestamp}.json`;
  fs.writeFileSync(
    path.join(getHistoryDir(root), filename),
    `${JSON.stringify(snapshot, null, 2)}\n`,
    'utf8',
  );
}

module.exports = {
  getAceDir,
  getStatePath,
  getHistoryDir,
  getRulesPath,
  getDecisionsPath,
  ensureAceLayout,
  ensureGovernanceFiles,
  createInitialState,
  loadState,
  saveState,
  appendHistorySnapshot,
};
