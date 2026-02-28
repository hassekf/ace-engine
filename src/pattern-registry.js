const fs = require('node:fs');
const path = require('node:path');
const { ACE_DIR } = require('./constants');
const { nowIso, slugify } = require('./helpers');

const REGISTRY_FILE = 'pattern-registry.json';

function getRegistryPath(root) {
  return path.join(root, ACE_DIR, REGISTRY_FILE);
}

function defaultRegistry() {
  const now = nowIso();
  return {
    version: 1,
    updatedAt: now,
    patterns: [
      {
        key: 'controller.data_access',
        name: 'Controller Data Access',
        enabled: true,
        weight: 1,
        detector: {
          type: 'split_ratio',
          totalMetric: 'controllers',
          positiveMetric: 'controllersUsingService',
          negativeMetric: 'controllersWithDirectModel',
          positiveLabel: 'service-layer',
          negativeLabel: 'direct-model',
          mixedLabel: 'mixed',
          strongThreshold: 0.62,
          dominanceThreshold: 0.15,
        },
        drift: {
          enabled: true,
          scopeKind: 'controller',
          positiveWhen: [
            { signal: 'signals.usesService', op: 'eq', value: true },
            { signal: 'signals.directModelCalls.length', op: 'eq', value: 0 },
          ],
          negativeWhen: [{ signal: 'signals.directModelCalls.length', op: 'gt', value: 0 }],
          message:
            'Projeto tende a Service Layer, mas o controller executa acesso direto ao Model.',
          suggestion: 'Mover operação para Service/UseCase e reduzir regra no controller.',
        },
      },
      {
        key: 'controller.validation',
        name: 'Controller Validation Style',
        enabled: true,
        weight: 1,
        detector: {
          type: 'single_ratio',
          totalMetric: 'controllers',
          targetMetric: 'controllersUsingFormRequest',
          orientation: 'high_is_good',
          highLabel: 'form-request',
          lowLabel: 'inline-validation',
          mixedLabel: 'mixed',
          upperStrong: 0.65,
          lowerStrong: 0.3,
        },
        drift: {
          enabled: true,
          scopeKind: 'controller',
          positiveWhen: [{ signal: 'signals.usesFormRequest', op: 'eq', value: true }],
          negativeWhen: [{ signal: 'signals.usesFormRequest', op: 'eq', value: false }],
          message:
            'Controller fora do padrão esperado de validação por FormRequest/DTO.',
          suggestion: 'Introduzir FormRequest ou DTO validado no fluxo de entrada.',
        },
      },
      {
        key: 'controller.structure',
        name: 'Controller Structure',
        enabled: true,
        weight: 0.8,
        detector: {
          type: 'single_ratio',
          totalMetric: 'controllers',
          targetMetric: 'fatControllers',
          orientation: 'low_is_good',
          highLabel: 'thin-controller',
          lowLabel: 'fat-controller',
          mixedLabel: 'mixed',
          upperStrong: 0.22,
          lowerStrong: 0.65,
        },
        drift: {
          enabled: true,
          scopeKind: 'controller',
          positiveWhen: [
            { signal: 'signals.fileLineCount', op: 'lte', value: 220 },
            { signal: 'signals.largeMethodCount', op: 'eq', value: 0 },
          ],
          negativeWhen: [
            {
              any: [
                { signal: 'signals.fileLineCount', op: 'gt', value: 220 },
                { signal: 'signals.largeMethodCount', op: 'gt', value: 0 },
              ],
            },
          ],
          message: 'Controller acumulando responsabilidades além do padrão esperado.',
          suggestion: 'Extrair responsabilidades para Actions/Services menores.',
        },
      },
      {
        key: 'model.structure',
        name: 'Model Structure',
        enabled: true,
        weight: 0.8,
        detector: {
          type: 'single_ratio',
          totalMetric: 'models',
          targetMetric: 'fatModels',
          orientation: 'low_is_good',
          highLabel: 'slim-model',
          lowLabel: 'fat-model',
          mixedLabel: 'mixed',
          upperStrong: 0.25,
          lowerStrong: 0.6,
        },
        drift: {
          enabled: true,
          scopeKind: 'model',
          positiveWhen: [{ signal: 'metrics.fatModels', op: 'eq', value: 0 }],
          negativeWhen: [{ signal: 'metrics.fatModels', op: 'gt', value: 0 }],
          message: 'Model divergindo do padrão esperado de modelo enxuto.',
          suggestion: 'Mover regras pesadas para Services/UseCases.',
        },
      },
      {
        key: 'command.query_strategy',
        name: 'Command Query Strategy',
        enabled: true,
        weight: 0.9,
        detector: {
          type: 'single_ratio',
          totalMetric: 'commands',
          targetMetric: 'modelAllCallsInCommand',
          orientation: 'low_is_good',
          highLabel: 'chunked-query',
          lowLabel: 'bulk-all',
          mixedLabel: 'mixed',
          upperStrong: 0.12,
          lowerStrong: 0.35,
        },
        drift: {
          enabled: true,
          scopeKind: 'command',
          positiveWhen: [{ signal: 'signals.modelAllCalls.length', op: 'eq', value: 0 }],
          negativeWhen: [{ signal: 'signals.modelAllCalls.length', op: 'gt', value: 0 }],
          message: 'Command usando consulta bulk sem controle de lote.',
          suggestion: 'Use chunkById/lazy/paginação para processamentos batch.',
        },
      },
      {
        key: 'command.structure',
        name: 'Command Structure',
        enabled: true,
        weight: 0.8,
        detector: {
          type: 'single_ratio',
          totalMetric: 'commands',
          targetMetric: 'fatCommands',
          orientation: 'low_is_good',
          highLabel: 'thin-command',
          lowLabel: 'fat-command',
          mixedLabel: 'mixed',
          upperStrong: 0.2,
          lowerStrong: 0.45,
        },
        drift: {
          enabled: true,
          scopeKind: 'command',
          positiveWhen: [{ signal: 'signals.fileLineCount', op: 'lte', value: 260 }],
          negativeWhen: [{ signal: 'signals.fileLineCount', op: 'gt', value: 260 }],
          message: 'Command extenso fora do padrão operacional esperado.',
          suggestion: 'Extrair fluxo em etapas/services com responsabilidade única.',
        },
      },
      {
        key: 'security.raw_sql',
        name: 'Raw SQL Safety',
        enabled: true,
        weight: 1,
        detector: {
          type: 'single_ratio',
          totalMetric: 'scannedPhpFiles',
          targetMetric: 'dynamicRawSql',
          orientation: 'low_is_good',
          highLabel: 'safe-sql',
          lowLabel: 'dynamic-raw-sql',
          mixedLabel: 'mixed',
          upperStrong: 0.02,
          lowerStrong: 0.06,
        },
        drift: {
          enabled: true,
          positiveWhen: [{ signal: 'signals.dynamicRawSqlLines.length', op: 'eq', value: 0 }],
          negativeWhen: [{ signal: 'signals.dynamicRawSqlLines.length', op: 'gt', value: 0 }],
          message: 'Uso de raw SQL com variável dinâmica detectado.',
          suggestion: 'Aplicar bindings e reduzir interpolação dinâmica.',
        },
      },
    ],
  };
}

function ensureRegistryDir(root) {
  fs.mkdirSync(path.join(root, ACE_DIR), { recursive: true });
}

function sanitizeRegistry(registry) {
  const fallback = defaultRegistry();
  return {
    version: Number(registry.version || fallback.version),
    updatedAt: registry.updatedAt || nowIso(),
    patterns: Array.isArray(registry.patterns) ? registry.patterns : fallback.patterns,
  };
}

function loadPatternRegistry(root) {
  ensureRegistryDir(root);
  const registryPath = getRegistryPath(root);
  if (!fs.existsSync(registryPath)) {
    const seed = defaultRegistry();
    fs.writeFileSync(registryPath, `${JSON.stringify(seed, null, 2)}\n`, 'utf8');
    return seed;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    return sanitizeRegistry(parsed);
  } catch (error) {
    const seed = defaultRegistry();
    fs.writeFileSync(registryPath, `${JSON.stringify(seed, null, 2)}\n`, 'utf8');
    return seed;
  }
}

function savePatternRegistry(root, registry) {
  ensureRegistryDir(root);
  const payload = {
    ...sanitizeRegistry(registry),
    updatedAt: nowIso(),
  };
  fs.writeFileSync(getRegistryPath(root), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

function validatePattern(pattern) {
  if (!pattern || typeof pattern !== 'object') {
    throw new Error('Pattern inválido.');
  }

  if (!pattern.key || !String(pattern.key).trim()) {
    throw new Error('Pattern `key` é obrigatório.');
  }

  const detector = pattern.detector || {};
  if (!detector.type || !['split_ratio', 'single_ratio'].includes(detector.type)) {
    throw new Error('Pattern `detector.type` deve ser `split_ratio` ou `single_ratio`.');
  }

  if (!detector.totalMetric) {
    throw new Error('Pattern `detector.totalMetric` é obrigatório.');
  }

  if (detector.type === 'split_ratio') {
    if (!detector.positiveMetric || !detector.negativeMetric) {
      throw new Error('Pattern split_ratio requer `positiveMetric` e `negativeMetric`.');
    }
  }

  if (detector.type === 'single_ratio') {
    if (!detector.targetMetric) {
      throw new Error('Pattern single_ratio requer `targetMetric`.');
    }
    if (!['high_is_good', 'low_is_good'].includes(detector.orientation)) {
      throw new Error('Pattern single_ratio requer `orientation` em {high_is_good, low_is_good}.');
    }
  }
}

function upsertPattern(root, incomingPattern) {
  validatePattern(incomingPattern);
  const registry = loadPatternRegistry(root);
  const key = String(incomingPattern.key).trim();

  const normalized = {
    key,
    name: incomingPattern.name || key,
    enabled: incomingPattern.enabled !== false,
    weight: Number(incomingPattern.weight || 1),
    detector: incomingPattern.detector,
    drift: incomingPattern.drift || { enabled: false },
    updatedAt: nowIso(),
  };

  const index = registry.patterns.findIndex((item) => item.key === key);
  if (index >= 0) {
    registry.patterns[index] = {
      ...registry.patterns[index],
      ...normalized,
      id: registry.patterns[index].id || slugify(key),
    };
  } else {
    registry.patterns.push({
      id: slugify(key),
      createdAt: nowIso(),
      ...normalized,
    });
  }

  const saved = savePatternRegistry(root, registry);
  return {
    pattern: saved.patterns.find((item) => item.key === key),
    totalPatterns: saved.patterns.length,
  };
}

function setPatternEnabled(root, key, enabled) {
  const registry = loadPatternRegistry(root);
  const index = registry.patterns.findIndex((item) => item.key === key);
  if (index < 0) {
    throw new Error(`Pattern não encontrado: ${key}`);
  }

  registry.patterns[index] = {
    ...registry.patterns[index],
    enabled: Boolean(enabled),
    updatedAt: nowIso(),
  };

  const saved = savePatternRegistry(root, registry);
  return {
    pattern: saved.patterns[index],
  };
}

function removePattern(root, key) {
  const registry = loadPatternRegistry(root);
  const next = registry.patterns.filter((item) => item.key !== key);

  if (next.length === registry.patterns.length) {
    throw new Error(`Pattern não encontrado: ${key}`);
  }

  const saved = savePatternRegistry(root, {
    ...registry,
    patterns: next,
  });

  return {
    removedKey: key,
    totalPatterns: saved.patterns.length,
  };
}

function listPatterns(root) {
  const registry = loadPatternRegistry(root);
  return {
    updatedAt: registry.updatedAt,
    total: registry.patterns.length,
    items: registry.patterns,
  };
}

module.exports = {
  REGISTRY_FILE,
  getRegistryPath,
  loadPatternRegistry,
  savePatternRegistry,
  upsertPattern,
  setPatternEnabled,
  removePattern,
  listPatterns,
};
