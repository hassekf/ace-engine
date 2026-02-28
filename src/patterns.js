const { slugify } = require('./helpers');

function ratio(part, total) {
  if (!total) {
    return 0;
  }
  return part / total;
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getMetric(metrics, name) {
  return Number(metrics?.[name] || 0);
}

function inferSplitRatio(pattern, metrics) {
  const detector = pattern.detector || {};
  const total = getMetric(metrics, detector.totalMetric);

  if (!total) {
    return {
      inferred: 'unknown',
      confidence: 0,
      adoption: 0,
      metrics: {
        positiveRatio: 0,
        negativeRatio: 0,
      },
    };
  }

  const strongThreshold = Number(detector.strongThreshold ?? 0.62);
  const dominanceThreshold = Number(detector.dominanceThreshold ?? 0.15);
  const positiveLabel = detector.positiveLabel || 'positive';
  const negativeLabel = detector.negativeLabel || 'negative';
  const mixedLabel = detector.mixedLabel || 'mixed';

  const positiveRatio = ratio(getMetric(metrics, detector.positiveMetric), total);
  const negativeRatio = ratio(getMetric(metrics, detector.negativeMetric), total);
  const dominance = Math.abs(positiveRatio - negativeRatio);

  let inferred = mixedLabel;
  let adoption = Math.max(positiveRatio, negativeRatio);
  if (positiveRatio >= strongThreshold && positiveRatio >= negativeRatio + dominanceThreshold) {
    inferred = positiveLabel;
    adoption = positiveRatio;
  } else if (negativeRatio >= strongThreshold && negativeRatio >= positiveRatio + dominanceThreshold) {
    inferred = negativeLabel;
    adoption = negativeRatio;
  }

  const confidence = clampPercent((Math.max(positiveRatio, negativeRatio) * 0.65 + dominance * 0.35) * 100);

  return {
    inferred,
    confidence,
    adoption: clampPercent(adoption * 100),
    metrics: {
      positiveRatio: clampPercent(positiveRatio * 100),
      negativeRatio: clampPercent(negativeRatio * 100),
    },
  };
}

function inferSingleRatio(pattern, metrics) {
  const detector = pattern.detector || {};
  const total = getMetric(metrics, detector.totalMetric);

  if (!total) {
    return {
      inferred: 'unknown',
      confidence: 0,
      adoption: 0,
      metrics: {
        targetRatio: 0,
      },
    };
  }

  const targetRatio = ratio(getMetric(metrics, detector.targetMetric), total);
  const orientation = detector.orientation || 'high_is_good';

  const highLabel = detector.highLabel || 'high';
  const lowLabel = detector.lowLabel || 'low';
  const mixedLabel = detector.mixedLabel || 'mixed';

  const upperStrong = Number(detector.upperStrong ?? 0.65);
  const lowerStrong = Number(detector.lowerStrong ?? 0.3);

  let inferred = mixedLabel;
  if (orientation === 'high_is_good') {
    if (targetRatio >= upperStrong) {
      inferred = highLabel;
    } else if (targetRatio <= lowerStrong) {
      inferred = lowLabel;
    }
  } else {
    if (targetRatio <= upperStrong) {
      inferred = highLabel;
    } else if (targetRatio >= lowerStrong) {
      inferred = lowLabel;
    }
  }

  const center = 1 - Math.min(1, Math.abs(targetRatio - 0.5) * 2);
  const confidence = clampPercent(((1 - center) * 0.45 + targetRatio * 0.55) * 100);

  return {
    inferred,
    confidence,
    adoption: clampPercent(targetRatio * 100),
    metrics: {
      targetRatio: clampPercent(targetRatio * 100),
    },
  };
}

function inferFromPattern(pattern, metrics) {
  const detector = pattern.detector || {};
  if (detector.type === 'split_ratio') {
    return inferSplitRatio(pattern, metrics);
  }
  if (detector.type === 'single_ratio') {
    return inferSingleRatio(pattern, metrics);
  }
  return {
    inferred: 'unknown',
    confidence: 0,
    adoption: 0,
    metrics: {},
  };
}

function getActiveDecisionMap(decisions = []) {
  const map = new Map();

  decisions
    .filter((decision) => decision && decision.status !== 'inactive')
    .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())
    .forEach((decision) => {
      if (decision.key && decision.preferred) {
        map.set(decision.key, decision);
      }
    });

  return map;
}

function inferPatternModel({ metrics, decisions = [], registry }) {
  const patterns = {};
  const decisionMap = getActiveDecisionMap(decisions);
  const enabledPatterns = (registry?.patterns || []).filter((pattern) => pattern.enabled !== false);

  enabledPatterns.forEach((pattern) => {
    const inference = inferFromPattern(pattern, metrics);
    const explicitDecision = decisionMap.get(pattern.key);

    patterns[pattern.key] = {
      key: pattern.key,
      name: pattern.name || pattern.key,
      inferred: inference.inferred,
      confidence: inference.confidence,
      adoption: inference.adoption,
      metrics: inference.metrics,
      expected: explicitDecision ? explicitDecision.preferred : inference.inferred,
      source: explicitDecision ? 'decision' : 'inference',
      decisionId: explicitDecision ? explicitDecision.id : null,
      rationale: explicitDecision ? explicitDecision.rationale : '',
      weight: Number(pattern.weight || 1),
      detectorType: pattern.detector?.type || 'unknown',
    };
  });

  const dataAccess = patterns['controller.data_access'];
  const dominantPattern = dataAccess ? dataAccess.expected : 'unknown';

  return {
    dominantPattern,
    patterns,
    decisionCount: decisionMap.size,
  };
}

function resolveValueFromPath(source, pathExpression) {
  if (!pathExpression) {
    return undefined;
  }

  const parts = String(pathExpression).split('.');
  let current = source;
  for (const part of parts) {
    if (part === 'length') {
      if (Array.isArray(current) || typeof current === 'string') {
        current = current.length;
        continue;
      }
      return undefined;
    }

    if (current == null || typeof current !== 'object' || !(part in current)) {
      return undefined;
    }

    current = current[part];
  }
  return current;
}

function getSignalValue(entry, signalPath) {
  const path = String(signalPath || '').trim();
  if (!path) {
    return undefined;
  }

  if (path.startsWith('signals.') || path.startsWith('metrics.')) {
    return resolveValueFromPath(entry, path);
  }

  const fromSignals = resolveValueFromPath(entry, `signals.${path}`);
  if (fromSignals !== undefined) {
    return fromSignals;
  }

  return resolveValueFromPath(entry, `metrics.${path}`);
}

function compareValue(actual, op, expected) {
  if (op === 'eq') return actual === expected;
  if (op === 'neq') return actual !== expected;
  if (op === 'gt') return Number(actual) > Number(expected);
  if (op === 'gte') return Number(actual) >= Number(expected);
  if (op === 'lt') return Number(actual) < Number(expected);
  if (op === 'lte') return Number(actual) <= Number(expected);
  if (op === 'exists') return actual !== undefined && actual !== null;
  if (op === 'not_exists') return actual === undefined || actual === null;
  if (op === 'includes') {
    if (Array.isArray(actual)) return actual.includes(expected);
    if (typeof actual === 'string') return actual.includes(String(expected));
    return false;
  }
  return false;
}

function evaluateCondition(entry, condition) {
  if (!condition || typeof condition !== 'object') {
    return false;
  }

  if (Array.isArray(condition.any)) {
    return condition.any.some((nested) => evaluateCondition(entry, nested));
  }

  if (Array.isArray(condition.all)) {
    return condition.all.every((nested) => evaluateCondition(entry, nested));
  }

  const signal = getSignalValue(entry, condition.signal);
  const op = condition.op || 'eq';
  return compareValue(signal, op, condition.value);
}

function evaluateConditions(entry, conditions = []) {
  if (!Array.isArray(conditions) || conditions.length === 0) {
    return false;
  }

  return conditions.every((condition) => evaluateCondition(entry, condition));
}

function classifyEntry(pattern, entry) {
  const detector = pattern.detector || {};
  const drift = pattern.drift || {};
  const scopeKind = drift.scopeKind || pattern.scopeKind;

  if (scopeKind && entry.kind !== scopeKind) {
    return 'unknown';
  }

  const positiveWhen = drift.positiveWhen || [];
  const negativeWhen = drift.negativeWhen || [];
  const positiveLabel = detector.positiveLabel || detector.highLabel || 'positive';
  const negativeLabel = detector.negativeLabel || detector.lowLabel || 'negative';

  if (evaluateConditions(entry, positiveWhen)) {
    return positiveLabel;
  }

  if (evaluateConditions(entry, negativeWhen)) {
    return negativeLabel;
  }

  return 'unknown';
}

function createPatternViolation({
  pattern,
  expected,
  actual,
  entry,
  confidence = 0,
}) {
  const drift = pattern.drift || {};
  const id = slugify(`pattern:${pattern.key}:${entry.file}:${expected}:${actual}`);

  return {
    id,
    type: `pattern-drift:${pattern.key}`,
    severity: confidence >= 75 ? 'medium' : 'low',
    file: entry.file,
    line: 1,
    message:
      drift.message ||
      `Arquivo divergiu do padrão esperado (${pattern.key}: esperado ${expected}, atual ${actual}).`,
    suggestion:
      drift.suggestion ||
      'Considere alinhar o arquivo ao padrão esperado ou formalizar nova decisão.',
    rationale:
      'Drift detectado comparando classe de arquivo com padrão arquitetural esperado do projeto.',
    evidence: {
      patternKey: pattern.key,
      expected,
      actual,
      confidence,
    },
  };
}

function detectPatternDriftViolations({ fileIndex, model, registry }) {
  const violations = [];
  const enabledPatterns = (registry?.patterns || []).filter(
    (pattern) => pattern.enabled !== false && pattern.drift?.enabled !== false,
  );

  enabledPatterns.forEach((pattern) => {
    const modelPattern = model?.patterns?.[pattern.key];
    if (!modelPattern) {
      return;
    }

    const expected = modelPattern.expected;
    if (!expected || ['mixed', 'unknown'].includes(expected)) {
      return;
    }

    Object.values(fileIndex).forEach((entry) => {
      if (!entry || !entry.signals) {
        return;
      }

      const actual = classifyEntry(pattern, entry);
      if (actual === 'unknown') {
        return;
      }

      if (actual !== expected) {
        violations.push(
          createPatternViolation({
            pattern,
            expected,
            actual,
            entry,
            confidence: Number(modelPattern.confidence || 0),
          }),
        );
      }
    });
  });

  return violations;
}

module.exports = {
  inferPatternModel,
  detectPatternDriftViolations,
};
