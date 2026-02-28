const path = require('node:path');

function toRelative(root, absolutePath) {
  return normalizePath(path.relative(root, absolutePath));
}

function toAbsolute(root, maybeRelative) {
  return path.isAbsolute(maybeRelative) ? maybeRelative : path.resolve(root, maybeRelative);
}

function normalizePath(value) {
  return value.split(path.sep).join('/');
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function nowIso() {
  return new Date().toISOString();
}

function lineFromIndex(text, index) {
  if (index <= 0) {
    return 1;
  }

  let line = 1;
  for (let cursor = 0; cursor < index && cursor < text.length; cursor += 1) {
    if (text[cursor] === '\n') {
      line += 1;
    }
  }

  return line;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

function parseList(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => parseList(entry));
  }

  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

module.exports = {
  toRelative,
  toAbsolute,
  normalizePath,
  clamp,
  nowIso,
  lineFromIndex,
  slugify,
  parseList,
};
