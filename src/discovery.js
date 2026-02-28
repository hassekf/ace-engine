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
  resolveScanScope,
};
