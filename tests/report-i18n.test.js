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
  assert.match(html, /Actionability/);
  assert.match(html, /id="ace-lang-select"/);
  assert.match(html, /Trend Correlations/);
  assert.doesNotMatch(html, /criticallll/i);
  assert.doesNotMatch(html, /gate of composer audit in the ci/i);

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
  assert.match(html, /Actionability/);
  assert.match(html, /Trend Correlations/);
  assert.doesNotMatch(html, /criticallll/i);
});

test('writeReport renders actionability controls when violations exist', () => {
  const root = makeTmpRoot();
  const state = loadState(root);
  state.violations = [
    {
      id: 'v1',
      severity: 'high',
      type: 'mass-assignment-risk',
      file: 'app/Http/Controllers/UserController.php',
      line: 42,
      message: 'Unsafe mass assignment detected',
      suggestion: 'Use validated payload',
      actionabilityScore: 88,
      actionabilityPriority: 'P1',
      actionabilityIndex: 5,
      actionabilityRank: 1,
    },
  ];
  state.actionability = {
    summary: {
      total: 1,
      averageScore: 88,
      highPriority: 1,
      withTestSignal: 0,
      withoutTestSignal: 1,
      distribution: { P1: 1, P2: 0, P3: 0, P4: 0, P5: 0 },
      topScore: 88,
    },
    top: state.violations,
  };

  const reportPath = writeReport(root, state, { locale: 'en-US' });
  const html = fs.readFileSync(reportPath, 'utf8');

  assert.match(html, /id="violation-priority"/);
  assert.match(html, /Actionability/);
  assert.match(html, /P1 · 88/);
});

test('writeReport translates dynamic Portuguese suggestion/control text in en-US report', () => {
  const root = makeTmpRoot();
  const state = loadState(root);
  state.security = {
    score: 45,
    totals: { total: 1, pass: 0, warning: 1, fail: 0, unknown: 0 },
    modeSummary: {},
    controls: [
      {
        id: 'laravel.debug_mode',
        status: 'warning',
        mode: 'semi',
        severity: 'high',
        category: 'laravel',
        title: 'APP_DEBUG seguro para produção',
        message: 'APP_ENV=local APP_DEBUG=true.',
        recommendation: 'Em produção, garantir APP_DEBUG=false e tratamento seguro de exceções.',
      },
    ],
    metadata: {},
  };
  state.suggestions = [
    {
      category: 'performance',
      title: 'Revisar raw SQL com variáveis dinâmicas',
      details:
        'Foram detectadas leituras totais fora de controllers. Em jobs/commands/services isso costuma escalar mal em memória e tempo.',
      impact: 'high',
      effort: 'medium',
    },
  ];

  const reportPath = writeReport(root, state, { locale: 'en-US' });
  const html = fs.readFileSync(reportPath, 'utf8');

  assert.match(html, /APP_DEBUG safe for production/);
  assert.match(html, /In production, ensure APP_DEBUG=false and safe exception handling\./);
  assert.match(html, /Review raw SQL with dynamic variables/);
  assert.match(html, /Total reads outside controllers were detected\./);
  assert.doesNotMatch(html, /APP_DEBUG seguro para produção/);
  assert.doesNotMatch(html, /Revisar raw SQL com variáveis dinâmicas/);
});
