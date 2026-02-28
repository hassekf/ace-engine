const fs = require('node:fs');
const path = require('node:path');
const { ACE_DIR } = require('./constants');
const { nowIso, slugify } = require('./helpers');

const CONFIG_FILE = 'config.json';

function getConfigPath(root) {
  return path.join(root, ACE_DIR, CONFIG_FILE);
}

function defaultConfig() {
  return {
    version: 1,
    analysis: {
      ignorePaths: [],
      thresholds: {
        fatControllerLines: 220,
        largeControllerMethodLines: 80,
        fatServiceLines: 260,
        fatModelLines: 320,
        fatModelMethods: 15,
        fatCommandLines: 260,
        fatHelperLines: 220,
        fatValidatorLines: 220,
        fatFormComponentLines: 260,
        fatProviderLines: 280,
        fatEventLines: 140,
        fatObserverLines: 180,
        fatNotificationLines: 180,
        fatTraitLines: 180,
        fatTraitMethods: 10,
        highTraitImports: 8,
        fatFilamentResourceLines: 320,
        fatFilamentResourceMethods: 12,
      },
    },
    coverage: {
      weights: {
        layering: 0.3,
        validation: 0.18,
        testability: 0.18,
        consistency: 0.19,
        authorization: 0.15,
      },
    },
    report: {
      language: 'en-US',
      tableRowLimit: 200,
      suggestionLimit: 40,
      hotspotLimit: 12,
      historyLimit: 24,
    },
    waivers: [],
  };
}

function ensureConfigDir(root) {
  fs.mkdirSync(path.join(root, ACE_DIR), { recursive: true });
}

function mergeConfig(parsed = {}) {
  const base = defaultConfig();
  return {
    ...base,
    ...parsed,
    analysis: {
      ...base.analysis,
      ...(parsed.analysis || {}),
      thresholds: {
        ...base.analysis.thresholds,
        ...((parsed.analysis && parsed.analysis.thresholds) || {}),
      },
    },
    coverage: {
      ...base.coverage,
      ...(parsed.coverage || {}),
      weights: {
        ...base.coverage.weights,
        ...((parsed.coverage && parsed.coverage.weights) || {}),
      },
    },
    report: {
      ...base.report,
      ...(parsed.report || {}),
    },
    waivers: Array.isArray(parsed.waivers) ? parsed.waivers : base.waivers,
  };
}

function loadAceConfig(root) {
  ensureConfigDir(root);
  const configPath = getConfigPath(root);
  if (!fs.existsSync(configPath)) {
    return defaultConfig();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return mergeConfig(parsed);
  } catch (error) {
    return defaultConfig();
  }
}

function saveAceConfig(root, incomingConfig) {
  ensureConfigDir(root);
  const next = mergeConfig(incomingConfig);
  fs.writeFileSync(getConfigPath(root), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

function initAceConfig(root, { force = false } = {}) {
  ensureConfigDir(root);
  const configPath = getConfigPath(root);
  if (fs.existsSync(configPath) && !force) {
    return {
      created: false,
      configPath,
      config: loadAceConfig(root),
    };
  }

  const config = defaultConfig();
  saveAceConfig(root, config);
  return {
    created: true,
    configPath,
    config,
  };
}

function toRegexFromWildcard(pattern) {
  const escaped = String(pattern)
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

function matchesWildcard(value, pattern) {
  return toRegexFromWildcard(pattern).test(String(value || ''));
}

function isIgnoredPath(relativePath, ignorePaths = []) {
  if (!relativePath) {
    return false;
  }

  return ignorePaths.some((entry) => {
    const pattern = String(entry || '').trim();
    if (!pattern) {
      return false;
    }

    if (!pattern.includes('*')) {
      return String(relativePath).includes(pattern);
    }

    return matchesWildcard(relativePath, pattern);
  });
}

function normalizeWaiver(waiver) {
  const now = nowIso();
  return {
    id: waiver.id || slugify(`${waiver.type || 'waiver'}:${waiver.file || '*'}:${now}`),
    type: waiver.type || null,
    file: waiver.file || null,
    severity: waiver.severity || null,
    contains: waiver.contains || null,
    until: waiver.until || null,
    reason: waiver.reason || '',
    status: waiver.status || 'active',
    createdAt: waiver.createdAt || now,
    updatedAt: waiver.updatedAt || now,
  };
}

function addWaiver(root, waiverPayload) {
  const config = loadAceConfig(root);
  const waiver = normalizeWaiver(waiverPayload);
  const waivers = [...(config.waivers || []), waiver];
  const next = saveAceConfig(root, {
    ...config,
    waivers,
  });
  return {
    waiver,
    totalWaivers: next.waivers.length,
    configPath: getConfigPath(root),
  };
}

function updateWaiver(root, waiverId, patch = {}) {
  const config = loadAceConfig(root);
  const index = (config.waivers || []).findIndex((item) => item.id === waiverId);
  if (index < 0) {
    throw new Error(`Waiver não encontrado: ${waiverId}`);
  }

  const current = config.waivers[index];
  const updated = normalizeWaiver({
    ...current,
    ...patch,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: nowIso(),
  });

  const waivers = [...config.waivers];
  waivers[index] = updated;
  saveAceConfig(root, { ...config, waivers });

  return {
    waiver: updated,
  };
}

function listWaivers(root, { status = null } = {}) {
  const config = loadAceConfig(root);
  let items = [...(config.waivers || [])];
  if (status) {
    items = items.filter((item) => item.status === status);
  }
  items.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  return {
    total: items.length,
    items,
  };
}

function isWaiverExpired(waiver, referenceDate = new Date()) {
  if (!waiver.until) {
    return false;
  }
  const untilDate = new Date(waiver.until);
  if (Number.isNaN(untilDate.getTime())) {
    return false;
  }
  return referenceDate.getTime() > untilDate.getTime();
}

function doesWaiverMatch(waiver, violation) {
  if (!waiver || !violation) {
    return false;
  }

  if (waiver.type) {
    if (waiver.type.includes('*')) {
      if (!matchesWildcard(violation.type, waiver.type)) {
        return false;
      }
    } else if (String(violation.type) !== String(waiver.type)) {
      return false;
    }
  }

  if (waiver.file) {
    if (waiver.file.includes('*')) {
      if (!matchesWildcard(violation.file, waiver.file)) {
        return false;
      }
    } else if (!String(violation.file).includes(String(waiver.file))) {
      return false;
    }
  }

  if (waiver.severity && String(violation.severity) !== String(waiver.severity)) {
    return false;
  }

  if (waiver.contains) {
    const fullText = `${violation.type || ''} ${violation.message || ''} ${violation.suggestion || ''}`.toLowerCase();
    if (!fullText.includes(String(waiver.contains).toLowerCase())) {
      return false;
    }
  }

  return true;
}

function applyWaivers({ violations = [], waivers = [], referenceDate = new Date() }) {
  const activeWaivers = [];
  const expiredWaivers = [];

  waivers.forEach((waiver) => {
    if (waiver.status && waiver.status !== 'active') {
      return;
    }

    if (isWaiverExpired(waiver, referenceDate)) {
      expiredWaivers.push(waiver);
      return;
    }

    activeWaivers.push(waiver);
  });

  const waivedViolations = [];
  const effectiveViolations = [];

  violations.forEach((violation) => {
    const matchingWaiver = activeWaivers.find((waiver) => doesWaiverMatch(waiver, violation));
    if (!matchingWaiver) {
      effectiveViolations.push(violation);
      return;
    }

    waivedViolations.push({
      ...violation,
      waivedBy: {
        id: matchingWaiver.id,
        reason: matchingWaiver.reason || '',
        until: matchingWaiver.until || null,
      },
    });
  });

  return {
    violations: effectiveViolations,
    waivedViolations,
    activeWaivers,
    expiredWaivers,
  };
}

module.exports = {
  CONFIG_FILE,
  getConfigPath,
  defaultConfig,
  loadAceConfig,
  saveAceConfig,
  initAceConfig,
  isIgnoredPath,
  addWaiver,
  updateWaiver,
  listWaivers,
  applyWaivers,
};
