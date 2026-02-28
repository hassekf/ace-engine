const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { writeReport, normalizeReportLocale } = require('../src/report');
const { loadState } = require('../src/state');
const { saveAceConfig } = require('../src/config');

function makeTmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ace-report-i18n-test-'));
}

test('normalizeReportLocale handles aliases and falls back to en-US', () => {
  assert.equal(normalizeReportLocale('ptbr'), 'pt-BR');
  assert.equal(normalizeReportLocale('en'), 'en-US');
  assert.equal(normalizeReportLocale('EN_us'), 'en-US');
  assert.equal(normalizeReportLocale('fr-FR'), 'en-US');
  assert.equal(normalizeReportLocale(''), 'en-US');
});

test('writeReport supports en-US override', () => {
  const root = makeTmpRoot();
  const state = loadState(root);

  const reportPath = writeReport(root, state, { locale: 'en-US' });
  const html = fs.readFileSync(reportPath, 'utf8');

  assert.match(html, /<html lang="en-US">/);
  assert.match(html, /Updated:/);
  assert.match(html, /Core Scorecards/);
  assert.match(html, /Recent Inconsistencies/);
  assert.match(html, /id="ace-lang-select"/);
  assert.match(html, /Trend Correlations/);

  const reportEn = path.join(root, '.ace', 'report.en-US.html');
  const reportPt = path.join(root, '.ace', 'report.pt-BR.html');
  assert.equal(fs.existsSync(reportEn), true);
  assert.equal(fs.existsSync(reportPt), true);
});

test('writeReport uses configured report language when locale is omitted', () => {
  const root = makeTmpRoot();
  saveAceConfig(root, {
    report: {
      language: 'en-US',
    },
  });

  const state = loadState(root);
  const reportPath = writeReport(root, state);
  const html = fs.readFileSync(reportPath, 'utf8');

  assert.match(html, /<html lang="en-US">/);
  assert.match(html, /Suggestions:/);
  assert.match(html, /Recent Inconsistencies/);
  assert.match(html, /Trend Correlations/);
});
