const ACE_DIR = '.ace';
const STATE_FILE = 'ace.json';
const RULES_FILE = 'rules.json';
const DECISIONS_FILE = 'decisions.json';
const REPORT_FILE = 'report.html';
const HISTORY_DIR = 'history';

const DEFAULT_IGNORED_DIRS = new Set([
  '.git',
  '.ace',
  'node_modules',
  'vendor',
  'storage',
  'bootstrap/cache',
]);

const SEVERITY_WEIGHTS = {
  critical: 16,
  high: 12,
  medium: 7,
  low: 3,
};

module.exports = {
  ACE_DIR,
  STATE_FILE,
  RULES_FILE,
  DECISIONS_FILE,
  REPORT_FILE,
  HISTORY_DIR,
  DEFAULT_IGNORED_DIRS,
  SEVERITY_WEIGHTS,
};
