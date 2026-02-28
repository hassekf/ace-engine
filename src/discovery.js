const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DEFAULT_IGNORED_DIRS } = require('./constants');
const { normalizePath, toAbsolute } = require('./helpers');

function isIgnoredDir(dirname) {
  const normalized = normalizePath(dirname).toLowerCase();

  if (DEFAULT_IGNORED_DIRS.has(normalized)) {
    return true;
  }

  return Array.from(DEFAULT_IGNORED_DIRS).some((ignored) => normalized.endsWith(`/${ignored}`));
}

function walkFiles(root, parent = root, out = []) {
  if (!fs.existsSync(parent)) {
    return out;
  }

  const entries = fs.readdirSync(parent, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(parent, entry.name);
    const relativePath = normalizePath(path.relative(root, absolutePath));

    if (entry.isDirectory()) {
      if (isIgnoredDir(entry.name) || isIgnoredDir(relativePath)) {
        continue;
      }

      walkFiles(root, absolutePath, out);
      continue;
    }

    out.push(absolutePath);
  }

  return out;
}

function listPhpFiles(root) {
  return walkFiles(root).filter((file) => file.endsWith('.php'));
}

function listTestBasenames(root) {
  const testsDir = path.join(root, 'tests');
  const set = new Set();

  if (!fs.existsSync(testsDir)) {
    return set;
  }

  walkFiles(root, testsDir)
    .filter((file) => file.endsWith('.php'))
    .forEach((file) => {
      const basename = path.basename(file, '.php');
      set.add(basename);
    });

  return set;
}

function countMatches(content, regex) {
  return Array.from(content.matchAll(regex)).length;
}

function countTestCases(content) {
  const phpUnitPrefixed = countMatches(content, /\bfunction\s+test[A-Za-z0-9_]*\s*\(/g);
  const pestItStyle = countMatches(content, /\bit\s*\(\s*['"`]/g);
  const pestTestStyle = countMatches(content, /\btest\s*\(\s*['"`]/g);

  let attributeBased = 0;
  for (const match of content.matchAll(
    /#\[\s*Test(?:\([^\)]*\))?\s*\][\s\r\n]*(?:public|protected|private)?\s*function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
  )) {
    const methodName = String(match[1] || '');
    if (!/^test/i.test(methodName)) {
      attributeBased += 1;
    }
  }

  return phpUnitPrefixed + attributeBased + pestItStyle + pestTestStyle;
}

function countAssertions(content) {
  return countMatches(
    content,
    /(?:->assert[A-Z][A-Za-z0-9_]*\s*\(|\bassert[A-Z][A-Za-z0-9_]*\s*\(|\bexpectException(?:Message|Code)?\s*\(|\bexpect\s*\()/g,
  );
}

function countMockSignals(content) {
  return countMatches(
    content,
    /(?:Mockery::mock\s*\(|\$this->mock\s*\(|\$this->partialMock\s*\(|\bcreateMock\s*\(|->shouldReceive\s*\()/g,
  );
}

function countDataProviderSignals(content) {
  return (
    countMatches(content, /@dataProvider\s+[A-Za-z_][A-Za-z0-9_]*/g) +
    countMatches(content, /->with\s*\(/g)
  );
}

function countEdgeCaseSignals(content) {
  return countMatches(
    content,
    /\b(null|empty|invalid|exception|unauthorized|forbidden|expired|boundary|overflow|underflow|timeout|race|conflict|422|401|403|429)\b/gi,
  );
}

function collectTestInsights(root) {
  const testsDir = path.join(root, 'tests');
  const insights = {
    testFiles: 0,
    testCases: 0,
    testAssertions: 0,
    testMocks: 0,
    testDataProviders: 0,
    testEdgeCaseSignals: 0,
    testFilesWithoutAssertions: 0,
  };

  if (!fs.existsSync(testsDir)) {
    return insights;
  }

  walkFiles(root, testsDir)
    .filter((file) => file.endsWith('.php'))
    .forEach((file) => {
      const content = fs.readFileSync(file, 'utf8');
      const fileCases = countTestCases(content);
      const fileAssertions = countAssertions(content);

      insights.testFiles += 1;
      insights.testCases += fileCases;
      insights.testAssertions += fileAssertions;
      insights.testMocks += countMockSignals(content);
      insights.testDataProviders += countDataProviderSignals(content);
      insights.testEdgeCaseSignals += countEdgeCaseSignals(content);

      if (fileCases > 0 && fileAssertions === 0) {
        insights.testFilesWithoutAssertions += 1;
      }
    });

  return insights;
}

function listChangedPhpFilesFromGit(root) {
  const gitProbe = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd: root,
    encoding: 'utf8',
  });

  if (gitProbe.status !== 0) {
    return [];
  }

  const status = spawnSync('git', ['status', '--porcelain'], {
    cwd: root,
    encoding: 'utf8',
  });

  if (status.status !== 0) {
    return [];
  }

  const files = [];

  status.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      let target = line.slice(3).trim();
      if (target.includes('->')) {
        target = target.split('->').pop().trim();
      }

      if (!target.endsWith('.php')) {
        return;
      }

      const absolutePath = toAbsolute(root, target);
      if (fs.existsSync(absolutePath)) {
        files.push(absolutePath);
      }
    });

  return files;
}

function resolveScanScope({ root, scope = 'changed', explicitFiles = [] }) {
  const totalPhpFiles = listPhpFiles(root);

  let files = [];
  let mode = scope;

  if (explicitFiles.length > 0) {
    files = explicitFiles
      .map((candidate) => toAbsolute(root, candidate))
      .filter((absolutePath) => absolutePath.endsWith('.php') && fs.existsSync(absolutePath));
    mode = 'files';
  } else if (scope === 'all') {
    files = totalPhpFiles;
    mode = 'all';
  } else if (scope === 'changed') {
    files = listChangedPhpFilesFromGit(root);

    // First run fallback: create baseline if no state-driven file index exists yet.
    if (files.length === 0) {
      files = totalPhpFiles;
      mode = 'all-fallback';
    }
  } else {
    const parsed = String(scope)
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => toAbsolute(root, entry))
      .filter((absolutePath) => absolutePath.endsWith('.php') && fs.existsSync(absolutePath));

    files = parsed;
    mode = 'files';
  }

  const deduped = Array.from(new Set(files));

  return {
    files: deduped,
    totalPhpFiles,
    mode,
  };
}

module.exports = {
  listPhpFiles,
  listTestBasenames,
  collectTestInsights,
  resolveScanScope,
};
