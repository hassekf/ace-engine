const fs = require('node:fs');
const path = require('node:path');
const { runScan } = require('./engine');

function shouldTrack(relativePath) {
  if (!relativePath) {
    return false;
  }

  const normalized = relativePath.split(path.sep).join('/');

  if (!normalized.endsWith('.php')) {
    return false;
  }

  if (
    normalized.startsWith('.ace/') ||
    normalized.startsWith('vendor/') ||
    normalized.startsWith('node_modules/') ||
    normalized.startsWith('.git/')
  ) {
    return false;
  }

  return true;
}

function printSummary(summary) {
  const delta = summary.delta > 0 ? `+${summary.delta}` : `${summary.delta}`;
  console.log(
    `[ACE] AchCoverage atualizado: ${summary.achCoverage}% (${delta}) | novas: ${summary.newViolations} | resolvidas: ${summary.resolvedViolations} | ${summary.reportPath}`,
  );
}

function startWatch({ root, intervalMs = 2200 }) {
  console.log('[ACE] Watch mode iniciado. Construindo baseline...');
  const baseline = runScan({ root, scope: 'all', writeHtml: true });
  printSummary(baseline);

  const changed = new Set();
  let scanning = false;

  const watcher = fs.watch(root, { recursive: true }, (eventType, filename) => {
    if (!filename) {
      return;
    }

    if (!shouldTrack(filename)) {
      return;
    }

    changed.add(path.resolve(root, filename));
  });

  const timer = setInterval(() => {
    if (scanning || changed.size === 0) {
      return;
    }

    scanning = true;
    const files = Array.from(changed);
    changed.clear();

    try {
      const summary = runScan({
        root,
        explicitFiles: files,
        writeHtml: true,
      });

      printSummary(summary);
    } catch (error) {
      console.error('[ACE] Falha no scan incremental:', error.message);
    } finally {
      scanning = false;
    }
  }, intervalMs);

  const shutdown = () => {
    clearInterval(timer);
    watcher.close();
    console.log('\n[ACE] Watch mode finalizado.');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = {
  startWatch,
};
