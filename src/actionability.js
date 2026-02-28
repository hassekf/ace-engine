const { clamp, normalizePath } = require('./helpers');

const SEVERITY_BASE_SCORE = {
  critical: 62,
  high: 48,
  medium: 34,
  low: 20,
};

const SEVERITY_SORT_RANK = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
};

const SURFACE_BOOST_BY_KIND = {
  controller: 11,
  'route-file': 10,
  middleware: 10,
  service: 9,
  model: 8,
  job: 8,
  command: 8,
  listener: 7,
  provider: 7,
  observer: 6,
  notification: 6,
  'livewire-component': 6,
  'filament-page': 6,
  'filament-widget': 5,
  trait: 5,
  helper: 5,
};

const SECURITY_CRITICAL_TYPES = new Set([
  'dangerous-php-sink',
  'dynamic-raw-sql',
  'state-route-without-auth',
  'state-route-without-csrf',
  'state-route-without-throttle',
  'critical-write-without-transaction',
  'possible-n-plus-one',
  'mass-assignment-risk',
  'filament-page-missing-authz',
  'filament-widget-missing-authz',
  'livewire-public-property-risk',
]);

function normalizeSeverity(value) {
  const severity = String(value || 'low').toLowerCase();
  if (severity === 'critical') return 'critical';
  if (severity === 'high') return 'high';
  if (severity === 'medium') return 'medium';
  return 'low';
}

function inferKindFromPath(filePath) {
  const normalized = normalizePath(String(filePath || ''));
  if (normalized.includes('/Http/Controllers/')) return 'controller';
  if (normalized.startsWith('routes/')) return 'route-file';
  if (normalized.includes('/Services/') || normalized.includes('/Actions/') || normalized.includes('/UseCases/')) return 'service';
  if (normalized.includes('/Models/')) return 'model';
  if (normalized.includes('/Jobs/')) return 'job';
  if (normalized.includes('/Console/Commands/')) return 'command';
  if (normalized.includes('/Listeners/')) return 'listener';
  if (normalized.includes('/Http/Middleware/')) return 'middleware';
  if (normalized.includes('/Providers/')) return 'provider';
  if (normalized.includes('/Observers/')) return 'observer';
  if (normalized.includes('/Notifications/')) return 'notification';
  if (normalized.includes('/Livewire/')) return 'livewire-component';
  if (normalized.includes('/Filament/Pages/')) return 'filament-page';
  if (normalized.includes('/Filament/Widgets/')) return 'filament-widget';
  if (normalized.includes('/Traits/')) return 'trait';
  if (normalized.includes('/Helpers/') || normalized.includes('/Utils/')) return 'helper';
  return 'other';
}

function computeHotspotBoost(fileCount) {
  const count = Number(fileCount || 0);
  if (count >= 12) return 18;
  if (count >= 8) return 14;
  if (count >= 5) return 10;
  if (count >= 3) return 6;
  if (count >= 2) return 3;
  return 0;
}

function computeTypeRecurrenceBoost(typeCount) {
  const count = Number(typeCount || 0);
  if (count >= 30) return 12;
  if (count >= 20) return 9;
  if (count >= 10) return 6;
  if (count >= 5) return 3;
  return 0;
}

function computeSecurityBoost({ type, severity }) {
  const normalizedType = String(type || '').toLowerCase();
  const normalizedSeverity = normalizeSeverity(severity);
  let score = 0;

  if (SECURITY_CRITICAL_TYPES.has(normalizedType)) {
    score += 8;
  }

  if (normalizedSeverity === 'critical') {
    score += 4;
  } else if (normalizedSeverity === 'high') {
    score += 2;
  }

  return score;
}

function computeTestSignalBoost({ hasTest, severity, kind }) {
  const normalizedSeverity = normalizeSeverity(severity);
  if (hasTest) {
    return -4;
  }

  const highRiskSurface = new Set([
    'controller',
    'route-file',
    'middleware',
    'service',
    'model',
    'job',
    'listener',
    'command',
    'livewire-component',
    'filament-page',
    'filament-widget',
  ]);

  if (highRiskSurface.has(kind)) {
    if (normalizedSeverity === 'critical' || normalizedSeverity === 'high') return 9;
    if (normalizedSeverity === 'medium') return 7;
    return 5;
  }

  if (normalizedSeverity === 'critical' || normalizedSeverity === 'high') return 6;
  return 3;
}

function scoreToPriority(score) {
  const numeric = Number(score || 0);
  if (numeric >= 85) return 'P1';
  if (numeric >= 70) return 'P2';
  if (numeric >= 55) return 'P3';
  if (numeric >= 40) return 'P4';
  return 'P5';
}

function priorityToIndex(priority) {
  if (priority === 'P1') return 5;
  if (priority === 'P2') return 4;
  if (priority === 'P3') return 3;
  if (priority === 'P4') return 2;
  return 1;
}

function priorityToBand(priority) {
  if (priority === 'P1') return 'immediate';
  if (priority === 'P2') return 'high';
  if (priority === 'P3') return 'medium';
  if (priority === 'P4') return 'low';
  return 'backlog';
}

function severityRank(severity) {
  return SEVERITY_SORT_RANK[normalizeSeverity(severity)] || 0;
}

function scoreViolationsActionability({ violations = [], fileIndex = {} }) {
  const fileFrequency = new Map();
  const typeFrequency = new Map();

  (violations || []).forEach((violation) => {
    const file = String(violation.file || 'unknown');
    const type = String(violation.type || 'unknown');
    fileFrequency.set(file, Number(fileFrequency.get(file) || 0) + 1);
    typeFrequency.set(type, Number(typeFrequency.get(type) || 0) + 1);
  });

  const annotated = (violations || []).map((violation) => {
    const severity = normalizeSeverity(violation.severity);
    const file = String(violation.file || 'unknown');
    const type = String(violation.type || 'unknown');
    const fileEntry = fileIndex[file] || null;
    const kind = fileEntry?.kind || inferKindFromPath(file);
    const hasTest = Boolean(fileEntry?.signals?.hasTest);

    const severityBase = Number(SEVERITY_BASE_SCORE[severity] || SEVERITY_BASE_SCORE.low);
    const hotspotBoost = computeHotspotBoost(fileFrequency.get(file));
    const recurrenceBoost = computeTypeRecurrenceBoost(typeFrequency.get(type));
    const surfaceBoost = Number(SURFACE_BOOST_BY_KIND[kind] || 3);
    const testSignalBoost = computeTestSignalBoost({ hasTest, severity, kind });
    const securityBoost = computeSecurityBoost({ type, severity });
    const score = clamp(
      Math.round(
        severityBase + hotspotBoost + recurrenceBoost + surfaceBoost + testSignalBoost + securityBoost,
      ),
      0,
      100,
    );

    const priority = scoreToPriority(score);
    const index = priorityToIndex(priority);
    const band = priorityToBand(priority);

    return {
      ...violation,
      actionabilityScore: score,
      actionabilityPriority: priority,
      actionabilityIndex: index,
      actionabilityBand: band,
      actionabilityDrivers: {
        severityBase,
        hotspotBoost,
        recurrenceBoost,
        surfaceBoost,
        testSignalBoost,
        securityBoost,
        hasTest,
        kind,
      },
    };
  });

  const ranked = [...annotated].sort((a, b) => {
    const scoreDiff = Number(b.actionabilityScore || 0) - Number(a.actionabilityScore || 0);
    if (scoreDiff !== 0) return scoreDiff;
    const severityDiff = severityRank(b.severity) - severityRank(a.severity);
    if (severityDiff !== 0) return severityDiff;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });

  const rankMap = new Map();
  ranked.forEach((item, index) => {
    rankMap.set(String(item.id), index + 1);
  });

  const withRank = annotated.map((item) => ({
    ...item,
    actionabilityRank: Number(rankMap.get(String(item.id)) || 0),
  }));

  const distribution = { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 };
  let scoreSum = 0;
  let hasTestCount = 0;
  withRank.forEach((item) => {
    distribution[item.actionabilityPriority] = Number(distribution[item.actionabilityPriority] || 0) + 1;
    scoreSum += Number(item.actionabilityScore || 0);
    if (item.actionabilityDrivers?.hasTest) {
      hasTestCount += 1;
    }
  });

  const total = withRank.length;
  const averageScore = total > 0 ? Number((scoreSum / total).toFixed(2)) : 0;
  const highPriority = Number(distribution.P1 || 0) + Number(distribution.P2 || 0);

  return {
    violations: withRank,
    ranking: ranked.slice(0, 80).map((item) => ({
      ...item,
      actionabilityRank: Number(rankMap.get(String(item.id)) || 0),
    })),
    summary: {
      total,
      averageScore,
      highPriority,
      withTestSignal: hasTestCount,
      withoutTestSignal: Math.max(0, total - hasTestCount),
      distribution,
      topScore: total > 0 ? Number(ranked[0].actionabilityScore || 0) : 0,
    },
  };
}

module.exports = {
  scoreViolationsActionability,
  scoreToPriority,
};
