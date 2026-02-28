const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { resolveScanScope, listTestBasenames } = require('./discovery');
const { analyzeFiles, ANALYZER_VERSION } = require('./analyzer');
const { aggregateFromFileIndex, computeCoverage } = require('./coverage');
const { buildSuggestions } = require('./suggestions');
const { inferPatternModel, detectPatternDriftViolations } = require('./patterns');
const { loadPatternRegistry } = require('./pattern-registry');
const { evaluateSecurityBaseline } = require('./security-baseline');
const { loadAceConfig, isIgnoredPath, applyWaivers, updateWaiver } = require('./config');
const { loadState, saveState, appendHistorySnapshot } = require('./state');
const { writeReport } = require('./report');
const { nowIso, toRelative } = require('./helpers');
const { OUTPUT_SCHEMA_VERSION } = require('./constants');

function dedupeViolations(violations) {
  const map = new Map();
  for (const item of violations) {
    map.set(item.id, item);
  }
  return Array.from(map.values());
}

function updateFileIndex({ state, scannedFiles, analyzedEntries, root }) {
  const nextIndex = { ...(state.fileIndex || {}) };

  for (const file of scannedFiles) {
    const relativePath = toRelative(root, file);

    if (!fs.existsSync(file)) {
      delete nextIndex[relativePath];
      continue;
    }

    if (analyzedEntries[relativePath]) {
      nextIndex[relativePath] = analyzedEntries[relativePath];
    }
  }

  // Clean stale entries removed from project.
  for (const relativePath of Object.keys(nextIndex)) {
    const absolutePath = path.resolve(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      delete nextIndex[relativePath];
    }
  }

  return nextIndex;
}

function createSummary({ state, newViolations, resolvedViolations, reportPath }) {
  const securityFails = Number(state.security?.totals?.fail || 0);
  return {
    schemaVersion: OUTPUT_SCHEMA_VERSION,
    achCoverage: state.coverage.overall,
    delta: state.coverage.delta,
    confidence: state.coverage.confidence,
    dominantPattern: state.model.dominantPattern,
    securityScore: Number(state.security?.score || 0),
    securityFailures: securityFails,
    securityWarnings: Number(state.security?.totals?.warning || 0),
    totalViolations: state.violations.length,
    waivedViolations: (state.waivedViolations || []).length,
    cacheHits: Number(state.lastScan?.cacheHits || 0),
    analyzedFiles: Number(state.lastScan?.analyzedFiles || 0),
    ignoredFiles: Number(state.lastScan?.ignoredFiles || 0),
    newViolations,
    resolvedViolations,
    suggestions: state.suggestions.length,
    decisions: (state.decisions || []).length,
    patterns: Object.keys(state.model?.patterns || {}).length,
    reportPath,
    updatedAt: state.updatedAt,
    lastScan: state.lastScan,
  };
}

function hashFile(absolutePath) {
  const buffer = fs.readFileSync(absolutePath);
  return crypto.createHash('sha1').update(buffer).digest('hex');
}

function splitFilesByCache({ files, root, previousIndex }) {
  const cachedEntries = {};
  const toAnalyze = [];
  let cacheHits = 0;

  files.forEach((file) => {
    const relativePath = toRelative(root, file);
    if (!fs.existsSync(file)) {
      return;
    }

    const fileHash = hashFile(file);
    const previousEntry = previousIndex?.[relativePath];

    if (
      previousEntry &&
      previousEntry.fileHash === fileHash &&
      Number(previousEntry.analyzerVersion || 0) === Number(ANALYZER_VERSION)
    ) {
      cachedEntries[relativePath] = previousEntry;
      cacheHits += 1;
      return;
    }

    toAnalyze.push({
      absolutePath: file,
      relativePath,
      fileHash,
    });
  });

  return {
    cachedEntries,
    filesToAnalyze: toAnalyze,
    cacheHits,
  };
}

function annotateAnalyzedEntries({ analyzedEntries, hashMap }) {
  const next = {};
  Object.entries(analyzedEntries).forEach(([relativePath, entry]) => {
    const hash = hashMap[relativePath];
    next[relativePath] = {
      ...entry,
      analyzerVersion: ANALYZER_VERSION,
      fileHash: hash || null,
      analyzedAt: nowIso(),
    };
  });
  return next;
}

function runScan({ root, scope = 'changed', explicitFiles = [], writeHtml = true, reportLanguage = null }) {
  const startedAtMs = Date.now();
  const previousState = loadState(root);
  const config = loadAceConfig(root);
  const registry = loadPatternRegistry(root);

  const { files, totalPhpFiles, mode } = resolveScanScope({
    root,
    scope,
    explicitFiles,
  });

  const scopedFiles = files.filter((absolutePath) => {
    const relative = toRelative(root, absolutePath);
    return !isIgnoredPath(relative, config.analysis?.ignorePaths || []);
  });

  const { cachedEntries, filesToAnalyze, cacheHits } = splitFilesByCache({
    files: scopedFiles,
    root,
    previousIndex: previousState.fileIndex || {},
  });

  const testBasenames = listTestBasenames(root);
  const hashMap = Object.fromEntries(filesToAnalyze.map((item) => [item.relativePath, item.fileHash]));
  const rawAnalyzedEntries = analyzeFiles({
    root,
    files: filesToAnalyze.map((item) => item.absolutePath),
    testBasenames,
    thresholds: config.analysis?.thresholds || {},
  });
  const analyzedEntries = {
    ...cachedEntries,
    ...annotateAnalyzedEntries({
      analyzedEntries: rawAnalyzedEntries,
      hashMap,
    }),
  };

  const nextFileIndex = updateFileIndex({
    state: previousState,
    scannedFiles: scopedFiles,
    analyzedEntries,
    root,
  });

  const aggregate = aggregateFromFileIndex(nextFileIndex);
  const patternModel = inferPatternModel({
    metrics: aggregate.metrics,
    decisions: previousState.decisions || [],
    registry,
  });
  const patternViolations = detectPatternDriftViolations({
    fileIndex: nextFileIndex,
    model: patternModel,
    registry,
  });
  const uniqueViolations = dedupeViolations([...aggregate.violations, ...patternViolations]);
  const waiverApplied = applyWaivers({
    violations: uniqueViolations,
    waivers: config.waivers || [],
    referenceDate: new Date(),
  });
  waiverApplied.expiredWaivers.forEach((waiver) => {
    try {
      updateWaiver(root, waiver.id, { status: 'expired' });
    } catch (error) {
      // Ignore if waiver was removed concurrently.
    }
  });

  const coveragePayload = computeCoverage({
    metrics: aggregate.metrics,
    violations: waiverApplied.violations,
    scannedFiles: Object.keys(nextFileIndex).length,
    totalPhpFiles: totalPhpFiles.length,
    model: patternModel,
    weights: config.coverage?.weights || {},
  });
  const securityPayload = evaluateSecurityBaseline({
    root,
    metrics: aggregate.metrics,
    violations: waiverApplied.violations,
    fileIndex: nextFileIndex,
  });

  const suggestions = buildSuggestions({
    metrics: aggregate.metrics,
    coverage: coveragePayload.coverage,
    model: coveragePayload.model,
    violations: waiverApplied.violations,
    security: securityPayload,
  });

  const previousViolationIds = new Set((previousState.violations || []).map((item) => item.id));
  const currentViolationIds = new Set(waiverApplied.violations.map((item) => item.id));

  const newViolations = waiverApplied.violations.filter((item) => !previousViolationIds.has(item.id));
  const resolvedViolations = (previousState.violations || []).filter(
    (item) => !currentViolationIds.has(item.id),
  );

  const now = nowIso();
  const nextState = {
    ...previousState,
    updatedAt: now,
    coverage: {
      ...coveragePayload.coverage,
      delta: coveragePayload.coverage.overall - (previousState.coverage?.overall || 0),
    },
    model: coveragePayload.model,
    security: securityPayload,
    violations: waiverApplied.violations,
    waivedViolations: waiverApplied.waivedViolations,
    suggestions,
    fileIndex: nextFileIndex,
    lastScan: {
      scope: mode,
      files: scopedFiles.map((file) => toRelative(root, file)).slice(0, 500),
      durationMs: Date.now() - startedAtMs,
      cacheHits,
      analyzedFiles: filesToAnalyze.length,
      ignoredFiles: files.length - scopedFiles.length,
      newViolations: newViolations.length,
      resolvedViolations: resolvedViolations.length,
      analyzedAt: now,
    },
    history: [
      ...(previousState.history || []),
      {
        timestamp: now,
        overall: coveragePayload.coverage.overall,
        delta: coveragePayload.coverage.overall - (previousState.coverage?.overall || 0),
        confidence: coveragePayload.coverage.confidence,
        securityScore: securityPayload.score,
        scope: mode,
        files: scopedFiles.length,
        cacheHits,
        analyzedFiles: filesToAnalyze.length,
        newViolations: newViolations.length,
        resolvedViolations: resolvedViolations.length,
      },
    ].slice(-160),
  };

  saveState(root, nextState);

  const snapshot = {
    timestamp: now,
    coverage: nextState.coverage,
    model: nextState.model,
    security: {
      score: nextState.security?.score || 0,
      totals: nextState.security?.totals || {},
    },
    violationCount: nextState.violations.length,
    waivedViolationCount: (nextState.waivedViolations || []).length,
    suggestionCount: nextState.suggestions.length,
    lastScan: nextState.lastScan,
  };
  appendHistorySnapshot(root, snapshot);

  const reportPath = writeHtml
    ? writeReport(root, nextState, { locale: reportLanguage })
    : path.join(root, '.ace', 'report.html');

  return createSummary({
    state: nextState,
    newViolations: newViolations.length,
    resolvedViolations: resolvedViolations.length,
    reportPath,
  });
}

module.exports = {
  runScan,
};
