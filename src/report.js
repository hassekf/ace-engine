const fs = require('node:fs');
const path = require('node:path');
const { ACE_DIR, REPORT_FILE } = require('./constants');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0))}%`;
}

function formatPercentOrFallback(value, fallback = 'N/A') {
  if (value == null || Number.isNaN(Number(value))) {
    return fallback;
  }
  return `${Math.round(Number(value))}%`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildTrendChartSvg(history) {
  if (!history || history.length === 0) {
    return '<p class="empty">Sem histórico suficiente ainda.</p>';
  }

  const points = history.slice(-36);
  const width = 760;
  const height = 220;
  const padding = { top: 18, right: 26, bottom: 34, left: 32 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(
    100,
    ...points.map((item) => Math.max(Number(item.overall || 0), Number(item.securityScore || 0), 0)),
  );

  const toPoint = (value, index) => {
    const x =
      padding.left +
      (points.length <= 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
    const y = padding.top + (1 - Number(value || 0) / maxValue) * innerHeight;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  };

  const overallPoints = points.map((item, index) => toPoint(item.overall || 0, index)).join(' ');
  const securityPoints = points.map((item, index) => toPoint(item.securityScore || 0, index)).join(' ');
  const areaPoints = `${padding.left},${height - padding.bottom} ${overallPoints} ${padding.left + innerWidth},${height - padding.bottom}`;

  const yAxisMarks = [0, 25, 50, 75, 100]
    .map((tick) => {
      const y = padding.top + (1 - tick / maxValue) * innerHeight;
      return `
        <line x1="${padding.left}" y1="${y.toFixed(2)}" x2="${(padding.left + innerWidth).toFixed(2)}" y2="${y.toFixed(2)}" class="trend-grid-line" />
        <text x="${(padding.left - 8).toFixed(2)}" y="${(y + 4).toFixed(2)}" class="trend-axis-label">${tick}</text>`;
    })
    .join('');

  const latest = points[points.length - 1] || {};
  const latestOverall = Math.round(Number(latest.overall || 0));
  const latestSecurity = Math.round(Number(latest.securityScore || 0));

  return `
    <div class="trend-svg-wrap">
      <svg class="trend-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Trend de AchCoverage e Security Score">
        <defs>
          <linearGradient id="aceTrendArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#60a5fa" stop-opacity="0.4"></stop>
            <stop offset="100%" stop-color="#60a5fa" stop-opacity="0.03"></stop>
          </linearGradient>
        </defs>
        <rect x="${padding.left}" y="${padding.top}" width="${innerWidth}" height="${innerHeight}" class="trend-chart-bg"></rect>
        ${yAxisMarks}
        <polygon points="${areaPoints}" fill="url(#aceTrendArea)"></polygon>
        <polyline points="${overallPoints}" class="trend-line trend-line-overall"></polyline>
        <polyline points="${securityPoints}" class="trend-line trend-line-security"></polyline>
      </svg>
      <div class="trend-legend">
        <span><i class="trend-dot trend-dot-overall"></i> AchCoverage (${latestOverall}%)</span>
        <span><i class="trend-dot trend-dot-security"></i> Security (${latestSecurity}%)</span>
      </div>
    </div>`;
}

function buildHealthDomains(state) {
  const coverage = state.coverage || {};
  const dimensions = coverage.dimensions || {};
  const security = state.security || {};
  const stats = state.model?.stats || {};
  const rules = state.rules || [];
  const decisions = state.decisions || [];
  const violations = state.violations || [];

  const highSeverity = violations.filter((item) => ['high', 'critical'].includes(String(item.severity || '').toLowerCase())).length;
  const totalViolations = Math.max(1, violations.length);
  const highSeverityRatio = highSeverity / totalViolations;

  const architectureScore = clamp(
    Math.round(
      Number(dimensions.layering || 0) * 0.5 +
        Number(dimensions.consistency || 0) * 0.3 +
        Number(dimensions.validation || 0) * 0.2 -
        highSeverityRatio * 16,
    ),
    0,
    100,
  );

  const performancePenalty =
    Number(stats.unboundedGetCalls || 0) * 1.2 +
    Number(stats.possibleNPlusOneRisks || 0) * 4 +
    Number(stats.unsafeRawSqlCalls || 0) * 2.5 +
    Number(stats.criticalWritesWithoutTransaction || 0) * 3;
  const performanceScore = clamp(Math.round(100 - performancePenalty), 0, 100);

  const testingScore = clamp(Math.round(Number(dimensions.testability || 0)), 0, 100);
  const securityScore = clamp(Math.round(Number(security.score || 0)), 0, 100);

  const governanceBase = Number(coverage.confidence || 0) * 0.45 + Math.min(40, rules.length * 4 + decisions.length * 3);
  const governancePenalty = highSeverityRatio * 24;
  const governanceScore = clamp(Math.round(governanceBase - governancePenalty), 0, 100);

  return [
    {
      key: 'architecture',
      label: 'Architecture Health',
      score: architectureScore,
      note: `${Math.round(Number(dimensions.layering || 0))}% layering · ${Math.round(Number(dimensions.consistency || 0))}% consistency`,
    },
    {
      key: 'performance',
      label: 'Performance Health',
      score: performanceScore,
      note: `${Number(stats.unboundedGetCalls || 0)} unbounded · ${Number(stats.possibleNPlusOneRisks || 0)} N+1`,
    },
    {
      key: 'security',
      label: 'Security Health',
      score: securityScore,
      note: `${Number(security.totals?.fail || 0)} fail(s) · ${Number(security.totals?.warning || 0)} warning(s)`,
    },
    {
      key: 'testing',
      label: 'Testing Health',
      score: testingScore,
      note: `${Number(stats.missingTests || 0)} arquivo(s) sem testes`,
    },
    {
      key: 'governance',
      label: 'Governance Health',
      score: governanceScore,
      note: `${rules.length} regra(s) · ${decisions.length} decisão(ões)`,
    },
  ];
}

function buildQuickWins(suggestions = []) {
  const impactWeight = { high: 3, medium: 2, low: 1 };
  const effortWeight = { low: 3, medium: 2, high: 1 };

  return [...(suggestions || [])]
    .map((item) => {
      const impact = String(item.impact || 'low').toLowerCase();
      const effort = String(item.effort || 'medium').toLowerCase();
      const score = (impactWeight[impact] || 1) * 8 + (effortWeight[effort] || 1) * 5;
      return {
        ...item,
        quickWinScore: score,
      };
    })
    .sort((a, b) => b.quickWinScore - a.quickWinScore)
    .slice(0, 8);
}

function severityBadge(severity) {
  if (severity === 'high') {
    return 'badge badge-high';
  }

  if (severity === 'medium') {
    return 'badge badge-medium';
  }

  return 'badge badge-low';
}

function controlStatusClass(status) {
  if (status === 'fail') {
    return 'badge badge-high';
  }
  if (status === 'warning') {
    return 'badge badge-medium';
  }
  if (status === 'pass') {
    return 'badge badge-ok';
  }
  return 'badge badge-low';
}

function generateHtmlReport(state) {
  const coverage = state.coverage || {};
  const dimensions = coverage.dimensions || {};
  const trend = coverage.delta || 0;
  const trendText = trend > 0 ? `+${trend}` : `${trend}`;
  const history = state.history || [];
  const recentHistory = history.slice(-24);

  const violations = state.violations || [];
  const waivedViolations = state.waivedViolations || [];
  const suggestions = state.suggestions || [];
  const rules = state.rules || [];
  const decisions = state.decisions || [];
  const patterns = state.model?.patterns || {};
  const security = state.security || {};
  const securityTotals = security.totals || {};
  const securityModeSummary = security.modeSummary || {};
  const securityControls = security.controls || [];
  const filamentScores = security.filamentScores || security.metadata?.filamentScores || {};
  const hasFilamentPageScore = Boolean(filamentScores.pages);
  const hasFilamentWidgetScore = Boolean(filamentScores.widgets);
  const filamentPageScore = hasFilamentPageScore ? Number(filamentScores.pages?.score || 0) : null;
  const filamentWidgetScore = hasFilamentWidgetScore ? Number(filamentScores.widgets?.score || 0) : null;
  const filamentSecurityCards = `
        ${hasFilamentPageScore
          ? `<article class="kpi-card">
          <h3>Filament Pages Sec</h3>
          <p class="metric">${formatPercentOrFallback(filamentPageScore)}</p>
        </article>`
          : ''}
        ${hasFilamentWidgetScore
          ? `<article class="kpi-card">
          <h3>Filament Widgets Sec</h3>
          <p class="metric">${formatPercentOrFallback(filamentWidgetScore)}</p>
        </article>`
          : ''}`;
  const trendSvg = buildTrendChartSvg(recentHistory);
  const healthDomainCards = buildHealthDomains(state)
    .map(
      (item) => `
      <article class="health-card health-${escapeHtml(item.key)}">
        <h3>${escapeHtml(item.label)}</h3>
        <p class="metric">${formatPercent(item.score)}</p>
        <div class="health-meter"><span style="width:${clamp(Number(item.score || 0), 0, 100)}%"></span></div>
        <p class="health-note">${escapeHtml(item.note)}</p>
      </article>`,
    )
    .join('');
  const quickWins = buildQuickWins(suggestions);
  const quickWinRows = quickWins
    .map(
      (item, index) => `
      <tr>
        <td>#${index + 1}</td>
        <td>${escapeHtml(item.title || '-')}</td>
        <td>${escapeHtml(item.category || '-')}</td>
        <td><span class="badge ${item.impact === 'high' ? 'badge-high' : item.impact === 'medium' ? 'badge-medium' : 'badge-low'}">${escapeHtml(item.impact || '-')}</span></td>
        <td><span class="badge ${item.effort === 'low' ? 'badge-ok' : item.effort === 'medium' ? 'badge-medium' : 'badge-high'}">${escapeHtml(item.effort || '-')}</span></td>
        <td>${escapeHtml(item.details || '-')}</td>
      </tr>`,
    )
    .join('');

  const hotspotMap = new Map();
  violations.forEach((violation) => {
    const file = violation.file || 'unknown';
    const current = hotspotMap.get(file) || { file, total: 0, high: 0, medium: 0, low: 0 };
    current.total += 1;
    if (violation.severity === 'high' || violation.severity === 'critical') current.high += 1;
    else if (violation.severity === 'medium') current.medium += 1;
    else current.low += 1;
    hotspotMap.set(file, current);
  });

  const hotspots = Array.from(hotspotMap.values())
    .sort((a, b) => b.high - a.high || b.medium - a.medium || b.total - a.total)
    .slice(0, 12);

  const hotspotRows = hotspots
    .map(
      (item) => `
      <tr>
        <td><code>${escapeHtml(item.file)}</code></td>
        <td>${item.total}</td>
        <td>${item.high}</td>
        <td>${item.medium}</td>
        <td>${item.low}</td>
      </tr>`,
    )
    .join('');

  const suggestionCards = suggestions
    .slice(0, 40)
    .map(
      (item) => `
      <article class="suggestion-card">
        <header>
          <span class="pill">${escapeHtml(item.category)}</span>
          <h4>${escapeHtml(item.title)}</h4>
        </header>
        <p>${escapeHtml(item.details)}</p>
        <footer>
          <span>Impacto: <strong>${escapeHtml(item.impact)}</strong></span>
          <span>Esforço: <strong>${escapeHtml(item.effort)}</strong></span>
        </footer>
      </article>`,
    )
    .join('');

  const ruleRows = rules
    .slice(0, 40)
    .map(
      (rule) => `
      <tr>
        <td><code>${escapeHtml(rule.id)}</code></td>
        <td>${escapeHtml(rule.title)}</td>
        <td>${escapeHtml(rule.source || 'manual')}</td>
        <td>${escapeHtml(rule.createdAt)}</td>
      </tr>`,
    )
    .join('');

  const decisionRows = decisions
    .slice(0, 60)
    .map(
      (decision) => `
      <tr>
        <td><code>${escapeHtml(decision.id)}</code></td>
        <td>${escapeHtml(decision.key)}</td>
        <td>${escapeHtml(decision.preferred)}</td>
        <td>${escapeHtml(decision.source || 'manual')}</td>
        <td>${escapeHtml(decision.createdAt || '-')}</td>
      </tr>`,
    )
    .join('');

  const patternRows = Object.values(patterns)
    .map(
      (pattern) => `
      <tr>
        <td><code>${escapeHtml(pattern.key)}</code></td>
        <td>${escapeHtml(pattern.inferred || 'unknown')}</td>
        <td>${escapeHtml(pattern.expected || pattern.inferred || 'unknown')}</td>
        <td>${escapeHtml(pattern.source || 'inference')}</td>
        <td>${formatPercent(pattern.confidence || 0)}</td>
        <td>${formatPercent(pattern.adoption || 0)}</td>
      </tr>`,
    )
    .join('');

  const securityCategoryOptions = Array.from(
    new Set(securityControls.map((item) => item.category).filter(Boolean)),
  )
    .sort((a, b) => String(a).localeCompare(String(b)))
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
    .join('');

  const filteredSecurityRows = securityControls
    .slice(0, 200)
    .map((control) => {
      const status = String(control.status || 'unknown').toLowerCase();
      const mode = String(control.mode || 'unknown').toLowerCase();
      const severity = String(control.severity || 'low').toLowerCase();
      const category = String(control.category || 'general').toLowerCase();
      const search = `${control.title || ''} ${control.message || ''} ${control.recommendation || ''} ${control.id || ''}`.toLowerCase();
      return `
      <tr data-status="${escapeHtml(status)}" data-mode="${escapeHtml(mode)}" data-severity="${escapeHtml(severity)}" data-category="${escapeHtml(category)}" data-search="${escapeHtml(search)}">
        <td><span class="${controlStatusClass(control.status)}">${escapeHtml(control.status)}</span></td>
        <td>${escapeHtml(control.mode)}</td>
        <td>${escapeHtml(control.severity)}</td>
        <td>${escapeHtml(control.category)}</td>
        <td>${escapeHtml(control.title)}</td>
        <td>${escapeHtml(control.message || '-')}</td>
        <td>${escapeHtml(control.recommendation || '-')}</td>
      </tr>`;
    })
    .join('');

  const filteredViolationRows = violations
    .slice(0, 200)
    .map((item) => {
      const severity = String(item.severity || 'low').toLowerCase();
      const search = `${item.type || ''} ${item.file || ''} ${item.message || ''} ${item.suggestion || ''}`.toLowerCase();
      return `
      <tr data-severity="${escapeHtml(severity)}" data-search="${escapeHtml(search)}">
        <td><span class="${severityBadge(item.severity)}">${escapeHtml(item.severity)}</span></td>
        <td>${escapeHtml(item.type)}</td>
        <td><code>${escapeHtml(item.file)}:${Number(item.line || 1)}</code></td>
        <td>${escapeHtml(item.message)}</td>
        <td>${escapeHtml(item.suggestion || '-')}</td>
      </tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ACE Report</title>
  <style>
    :root {
      --bg: #080d1b;
      --surface: #0f162a;
      --surface-soft: #121d34;
      --surface-lift: #162341;
      --text: #e8efff;
      --muted: #9aa8ca;
      --brand: #3b82f6;
      --brand-2: #06b6d4;
      --brand-3: #1d2f8f;
      --ok: #10b981;
      --warn: #f59e0b;
      --danger: #ef4444;
      --border: #27365f;
      --shadow-soft: 0 18px 42px rgba(5, 10, 28, 0.42);
      --shadow-strong: 0 30px 68px rgba(2, 7, 24, 0.7);
      --radius: 16px;
    }

    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      color: var(--text);
      font-family: "Sora", "Manrope", "IBM Plex Sans", "Avenir Next", "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at 9% 11%, rgba(59, 130, 246, 0.22), transparent 34%),
        radial-gradient(circle at 88% 3%, rgba(6, 182, 212, 0.2), transparent 32%),
        linear-gradient(rgba(140, 162, 230, 0.12) 1px, transparent 1px),
        linear-gradient(90deg, rgba(140, 162, 230, 0.12) 1px, transparent 1px),
        linear-gradient(180deg, #050913 0%, #080f1f 52%, #091224 100%);
      background-size: auto, auto, 34px 34px, 34px 34px, auto;
      background-position: center center, center center, -1px -1px, -1px -1px, center center;
      min-height: 100vh;
      line-height: 1.45;
    }

    .wrapper {
      width: min(1380px, 95vw);
      margin: 26px auto 68px;
      display: grid;
      gap: 20px;
    }

    .hero {
      position: relative;
      overflow: hidden;
      background:
        linear-gradient(127deg, #152a92 2%, #2456ff 48%, #0f8de0 96%);
      color: #fff;
      border-radius: calc(var(--radius) + 10px);
      box-shadow: var(--shadow-strong);
      padding: 28px;
      display: grid;
      gap: 14px;
      isolation: isolate;
    }

    .hero::before {
      content: "";
      position: absolute;
      inset: -80px auto auto -80px;
      width: 320px;
      height: 320px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(255,255,255,.22), transparent 72%);
      pointer-events: none;
      z-index: -1;
    }

    .hero h1 {
      margin: 0;
      font-size: clamp(1.8rem, 1.44rem + 1.35vw, 2.62rem);
      letter-spacing: 0.01em;
      font-weight: 800;
    }

    .hero .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 9px;
    }

    .tag {
      border: 1px solid rgba(255,255,255,.24);
      border-radius: 999px;
      padding: 7px 13px;
      font-size: .86rem;
      font-weight: 600;
      background: rgba(255,255,255,.12);
      backdrop-filter: blur(8px);
      letter-spacing: .01em;
    }

    .panel {
      background: linear-gradient(180deg, rgba(15, 24, 45, .92), rgba(12, 20, 38, .88));
      border: 1px solid rgba(39, 56, 94, .95);
      border-radius: calc(var(--radius) + 2px);
      box-shadow: var(--shadow-soft);
      padding: 19px;
      display: grid;
      gap: 15px;
      backdrop-filter: blur(8px);
    }

    .panel-title {
      margin: 0;
      font-size: .98rem;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: #b8c6ea;
      font-weight: 800;
    }

    .score-grid {
      display: grid;
      gap: 12px;
    }

    .score-grid-primary {
      grid-template-columns: repeat(12, minmax(0, 1fr));
    }

    .score-grid-secondary {
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }

    .score-grid-primary .kpi-card {
      grid-column: span 2;
      min-width: 0;
    }

    .score-grid-primary .kpi-card.scope-card {
      grid-column: span 4;
    }

    .kpi-card {
      background: linear-gradient(145deg, #162441, #111b32);
      border: 1px solid #2b3f6e;
      border-radius: 14px;
      box-shadow: 0 14px 30px rgba(5, 10, 24, .38);
      padding: 15px 16px;
      display: grid;
      gap: 6px;
      min-height: 108px;
      transition: transform .24s ease, box-shadow .24s ease;
    }

    .kpi-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 20px 38px rgba(5, 10, 24, .56);
    }

    .kpi-card h3 {
      margin: 0;
      font-size: .78rem;
      color: #93a5d2;
      text-transform: uppercase;
      letter-spacing: .09em;
      font-weight: 800;
    }

    .metric {
      font-size: 2.05rem;
      margin: 0;
      font-weight: 800;
      letter-spacing: -.02em;
      line-height: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .scope-card .metric {
      font-size: clamp(1.6rem, 1.2rem + 1vw, 2.05rem);
      letter-spacing: -.015em;
    }

    .delta-positive { color: var(--ok); }
    .delta-negative { color: var(--danger); }
    .delta-neutral { color: #9cadcf; }

    .overview-gap {
      margin-top: 2px;
    }

    .filters {
      display: grid;
      grid-template-columns: repeat(5, minmax(140px, 1fr));
      gap: 10px;
      align-items: end;
      margin-top: 6px;
      margin-bottom: 10px;
    }

    .filters.filters-compact {
      grid-template-columns: minmax(140px, 200px) minmax(220px, 1fr) auto auto;
    }

    .filter-field {
      display: grid;
      gap: 5px;
    }

    .filter-field span {
      font-size: .72rem;
      text-transform: uppercase;
      letter-spacing: .08em;
      font-weight: 800;
      color: #8ea1cd;
    }

    .filter-field select,
    .filter-field input {
      width: 100%;
      border: 1px solid #2f4472;
      border-radius: 11px;
      background: #121d34;
      color: #d9e5ff;
      padding: 10px 11px;
      font: inherit;
      font-size: .9rem;
      outline: none;
      transition: border-color .2s ease, box-shadow .2s ease;
    }

    .filter-field select:focus,
    .filter-field input:focus {
      border-color: #5ea6ff;
      box-shadow: 0 0 0 4px rgba(76, 132, 255, .22);
    }

    .filter-field input::placeholder {
      color: #7f90bb;
    }

    .btn-clear {
      border: 1px solid #345089;
      border-radius: 11px;
      background: linear-gradient(180deg, #1d2d54, #162341);
      color: #cddcff;
      font-weight: 700;
      font-size: .9rem;
      padding: 10px 12px;
      cursor: pointer;
      transition: transform .2s ease, box-shadow .2s ease;
    }

    .btn-clear:hover {
      transform: translateY(-1px);
      box-shadow: 0 10px 24px rgba(13, 25, 61, .46);
    }

    .filter-counter {
      justify-self: end;
      align-self: center;
      padding: 8px 12px;
      border-radius: 999px;
      background: #18325f;
      color: #b9d7ff;
      font-size: .84rem;
      font-weight: 700;
      letter-spacing: .02em;
    }

    .table-wrap {
      border: 1px solid #2a3f6c;
      border-radius: 14px;
      overflow: auto;
      box-shadow: inset 0 0 0 1px rgba(56, 76, 123, .25), 0 12px 24px rgba(5, 10, 25, .45);
      background: #111c34;
      max-height: 520px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--surface);
    }

    th, td {
      border-bottom: 1px solid #263a63;
      text-align: left;
      padding: 10px 12px;
      font-size: 0.9rem;
      vertical-align: top;
    }

    th {
      position: sticky;
      top: 0;
      z-index: 2;
      background: linear-gradient(180deg, #1b2b4f, #162645);
      color: #c4d5fb;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .03em;
      font-size: .76rem;
    }

    tr:hover td {
      background: #162746;
    }

    code {
      background: #15284c;
      padding: 2px 6px;
      border-radius: 7px;
      font-size: .82rem;
      border: 1px solid #29457e;
    }

    .badge {
      display: inline-block;
      text-transform: uppercase;
      font-size: .7rem;
      font-weight: 800;
      letter-spacing: .05em;
      border-radius: 999px;
      padding: 4px 9px;
      color: #fff;
      min-width: 74px;
      text-align: center;
    }

    .badge-high { background: linear-gradient(180deg, #de3c3c, #b91c1c); }
    .badge-medium { background: linear-gradient(180deg, #e69122, #c26d08); }
    .badge-ok { background: linear-gradient(180deg, #14af63, #0b8c4d); }
    .badge-low { background: linear-gradient(180deg, #2d74e2, #1f5fbf); }

    .suggestions {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    }

    .suggestion-card {
      border: 1px solid #2d4273;
      border-radius: 14px;
      padding: 15px;
      background: linear-gradient(180deg, #142241, #101a31);
      box-shadow: 0 14px 26px rgba(5, 10, 24, .36);
      display: grid;
      gap: 9px;
    }

    .suggestion-card h4 {
      margin: 0;
      font-size: 1rem;
      line-height: 1.2;
    }

    .suggestion-card p {
      margin: 0;
      color: #99a9cf;
      font-size: 0.9rem;
      line-height: 1.42;
    }

    .suggestion-card footer {
      font-size: .82rem;
      color: #8ea2cf;
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font-weight: 600;
    }

    .pill {
      display: inline-block;
      font-size: .7rem;
      background: #20396b;
      color: #b8cbff;
      border-radius: 999px;
      padding: 4px 10px;
      margin-bottom: 2px;
      text-transform: uppercase;
      letter-spacing: .05em;
      font-weight: 700;
    }

    .empty {
      color: var(--muted);
      font-size: 0.92rem;
      margin: 0;
    }

    .mini-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .mini-panel {
      border: 1px solid #2a3f6c;
      border-radius: 14px;
      padding: 12px;
      background: linear-gradient(180deg, #14213d, #101a31);
      box-shadow: 0 10px 24px rgba(4, 9, 22, .36);
    }

    .mini-title {
      margin: 0 0 8px;
      font-size: .75rem;
      text-transform: uppercase;
      letter-spacing: .09em;
      color: #9eb2df;
      font-weight: 800;
    }

    .trend-svg-wrap {
      display: grid;
      gap: 10px;
    }

    .trend-svg {
      width: 100%;
      height: auto;
      display: block;
    }

    .trend-chart-bg {
      fill: rgba(22, 36, 67, 0.36);
      stroke: rgba(79, 107, 169, 0.46);
      stroke-width: 1;
      rx: 8;
      ry: 8;
    }

    .trend-grid-line {
      stroke: rgba(128, 154, 214, 0.22);
      stroke-width: 1;
      stroke-dasharray: 4 5;
    }

    .trend-axis-label {
      fill: #87a0d4;
      font-size: 11px;
      font-weight: 600;
      text-anchor: end;
      font-family: "Sora", "Manrope", "IBM Plex Sans", "Avenir Next", "Segoe UI", sans-serif;
    }

    .trend-line {
      fill: none;
      stroke-width: 3;
      stroke-linecap: round;
      stroke-linejoin: round;
      filter: drop-shadow(0 6px 10px rgba(8, 15, 34, 0.38));
    }

    .trend-line-overall {
      stroke: #6ab4ff;
    }

    .trend-line-security {
      stroke: #32d8f0;
      stroke-dasharray: 8 6;
    }

    .trend-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      font-size: .83rem;
      color: #a9bceb;
      font-weight: 700;
    }

    .trend-dot {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 999px;
      margin-right: 7px;
      transform: translateY(1px);
    }

    .trend-dot-overall {
      background: #6ab4ff;
      box-shadow: 0 0 0 4px rgba(70, 128, 255, 0.18);
    }

    .trend-dot-security {
      background: #32d8f0;
      box-shadow: 0 0 0 4px rgba(50, 216, 240, 0.18);
    }

    .health-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
    }

    .health-card {
      border: 1px solid #2a3f6c;
      border-radius: 14px;
      padding: 14px;
      background: linear-gradient(180deg, #142241, #101b33);
      box-shadow: 0 12px 24px rgba(4, 9, 22, .34);
      display: grid;
      gap: 8px;
    }

    .health-card h3 {
      margin: 0;
      font-size: .8rem;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: #9bb0dd;
      font-weight: 800;
    }

    .health-card .metric {
      font-size: 1.78rem;
    }

    .health-meter {
      width: 100%;
      height: 8px;
      border-radius: 999px;
      background: #1a2c53;
      border: 1px solid #2c467b;
      overflow: hidden;
    }

    .health-meter span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #2f7ef9, #36d5ef);
    }

    .health-note {
      margin: 0;
      font-size: .82rem;
      color: #94a6d2;
    }

    .kpi-line {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      font-size: .86rem;
      padding: 6px 0;
      border-bottom: 1px dashed rgba(129, 150, 200, .35);
    }

    .kpi-line:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }

    .kpi-line strong {
      color: #d7e5ff;
      font-weight: 700;
    }

    @media (max-width: 1300px) {
      .score-grid-primary {
        grid-template-columns: repeat(8, minmax(0, 1fr));
      }

      .score-grid-secondary {
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      }
    }

    @media (max-width: 1080px) {
      .score-grid-primary {
        grid-template-columns: repeat(6, minmax(0, 1fr));
      }

      .score-grid-secondary {
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      }
    }

    @media (max-width: 980px) {
      .filters {
        grid-template-columns: 1fr 1fr;
      }

      .filters.filters-compact {
        grid-template-columns: 1fr;
      }

      .filter-counter {
        justify-self: start;
      }

      .metric {
        font-size: 1.84rem;
      }
    }

    @media (max-width: 760px) {
      .score-grid-primary,
      .score-grid-secondary {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .score-grid-primary .kpi-card,
      .score-grid-primary .kpi-card.scope-card {
        grid-column: span 1;
      }

      .mini-grid {
        grid-template-columns: 1fr;
      }

      .hero {
        padding: 22px;
      }
    }

    @media (max-width: 540px) {
      .score-grid-primary,
      .score-grid-secondary {
        grid-template-columns: 1fr;
      }

      .score-grid-primary .kpi-card,
      .score-grid-primary .kpi-card.scope-card {
        grid-column: span 1;
      }
    }
  </style>
</head>
<body>
  <main class="wrapper">
    <section class="hero">
      <h1>ACE · Architectural Coverage Engine</h1>
      <div class="meta">
        <span class="tag">Atualizado: ${escapeHtml(state.updatedAt || '-')}</span>
        <span class="tag">Pattern: ${escapeHtml(state.model?.dominantPattern || 'unknown')}</span>
        <span class="tag">Security: ${formatPercent(security.score || 0)}</span>
        <span class="tag">Violations: ${violations.length}</span>
        <span class="tag">Sugestões: ${suggestions.length}</span>
        <span class="tag">Decisões: ${decisions.length}</span>
      </div>
    </section>

    <section class="panel">
      <h2 class="panel-title">Core Scorecards</h2>
      <section class="score-grid score-grid-primary">
        <article class="kpi-card">
          <h3>AchCoverage</h3>
          <p class="metric">${formatPercent(coverage.overall)}</p>
        </article>
        <article class="kpi-card">
          <h3>Tendência</h3>
          <p class="metric ${trend > 0 ? 'delta-positive' : trend < 0 ? 'delta-negative' : 'delta-neutral'}">${trendText}</p>
        </article>
        <article class="kpi-card">
          <h3>Confiança</h3>
          <p class="metric">${formatPercent(coverage.confidence)}</p>
        </article>
        <article class="kpi-card">
          <h3>Security Score</h3>
          <p class="metric">${formatPercent(security.score || 0)}</p>
        </article>
        <article class="kpi-card">
          <h3>Security Fails</h3>
          <p class="metric">${Number(securityTotals.fail || 0)}</p>
        </article>
        <article class="kpi-card scope-card">
          <h3>Escopo</h3>
          <p class="metric">${Number(coverage.scannedFiles || 0)}/${Number(coverage.totalPhpFiles || 0)}</p>
        </article>
        <article class="kpi-card">
          <h3>Layering</h3>
          <p class="metric">${formatPercent(dimensions.layering)}</p>
        </article>
        <article class="kpi-card">
          <h3>Validation</h3>
          <p class="metric">${formatPercent(dimensions.validation)}</p>
        </article>
        <article class="kpi-card">
          <h3>Testability</h3>
          <p class="metric">${formatPercent(dimensions.testability)}</p>
        </article>
        <article class="kpi-card">
          <h3>Consistency</h3>
          <p class="metric">${formatPercent(dimensions.consistency)}</p>
        </article>
      </section>
      <section class="score-grid score-grid-secondary overview-gap">
        <article class="kpi-card">
          <h3>Security Automated</h3>
          <p class="metric">${formatPercent(securityModeSummary.automated?.score || 0)}</p>
        </article>
        <article class="kpi-card">
          <h3>Security Semi</h3>
          <p class="metric">${formatPercent(securityModeSummary.semi?.score || 0)}</p>
        </article>
        <article class="kpi-card">
          <h3>Security Manual</h3>
          <p class="metric">${formatPercent(securityModeSummary.manual?.score || 0)}</p>
        </article>
        <article class="kpi-card">
          <h3>Security Status</h3>
          <p class="metric">${Number(securityTotals.pass || 0)}/${Number(securityTotals.total || 0)}</p>
        </article>
        ${filamentSecurityCards}
      </section>
    </section>

    <section class="panel">
      <h2 class="panel-title">Trend & Diff</h2>
      <div class="mini-grid">
        <article class="mini-panel">
          <h3 class="mini-title">AchCoverage vs Security (histórico)</h3>
          ${trendSvg}
        </article>
        <article class="mini-panel">
          <h3 class="mini-title">Último ciclo</h3>
          <div class="kpi-line"><span>Novas inconsistências</span><strong>${Number(state.lastScan?.newViolations || 0)}</strong></div>
          <div class="kpi-line"><span>Resolvidas</span><strong>${Number(state.lastScan?.resolvedViolations || 0)}</strong></div>
          <div class="kpi-line"><span>Waived</span><strong>${waivedViolations.length}</strong></div>
          <div class="kpi-line"><span>Cache hits</span><strong>${Number(state.lastScan?.cacheHits || 0)}</strong></div>
          <div class="kpi-line"><span>Reanalisados</span><strong>${Number(state.lastScan?.analyzedFiles || 0)}</strong></div>
          <div class="kpi-line"><span>Ignorados por config</span><strong>${Number(state.lastScan?.ignoredFiles || 0)}</strong></div>
        </article>
      </div>
    </section>

    <section class="panel">
      <h2 class="panel-title">Domain Health Profile</h2>
      <section class="health-grid">
        ${healthDomainCards}
      </section>
    </section>

    <section class="panel" id="security-panel">
      <h2 class="panel-title">Security Baseline</h2>
      ${securityControls.length === 0
        ? '<p class="empty">Baseline de segurança ainda não avaliado. Execute um scan.</p>'
        : `<div class="filters" id="security-filters">
          <label class="filter-field">
            <span>Status</span>
            <select id="security-status">
              <option value="">Todos</option>
              <option value="fail">Fail</option>
              <option value="warning">Warning</option>
              <option value="unknown">Unknown</option>
              <option value="pass">Pass</option>
            </select>
          </label>
          <label class="filter-field">
            <span>Modo</span>
            <select id="security-mode">
              <option value="">Todos</option>
              <option value="automated">Automated</option>
              <option value="semi">Semi</option>
              <option value="manual">Manual</option>
            </select>
          </label>
          <label class="filter-field">
            <span>Severidade</span>
            <select id="security-severity">
              <option value="">Todas</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label class="filter-field">
            <span>Categoria</span>
            <select id="security-category">
              <option value="">Todas</option>
              ${securityCategoryOptions}
            </select>
          </label>
          <label class="filter-field">
            <span>Buscar</span>
            <input id="security-search" type="search" placeholder="controle, risco, recomendação..." />
          </label>
          <button type="button" class="btn-clear" id="security-clear">Limpar filtros</button>
          <span class="filter-counter" id="security-counter"></span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Modo</th>
                <th>Severidade</th>
                <th>Categoria</th>
                <th>Controle</th>
                <th>Diagnóstico</th>
                <th>Recomendação</th>
              </tr>
            </thead>
            <tbody id="security-table-body">${filteredSecurityRows}</tbody>
          </table>
        </div>`}
    </section>

    <section class="panel" id="violations-panel">
      <h2 class="panel-title">Inconsistências Recentes</h2>
      ${violations.length === 0
        ? '<p class="empty">Nenhuma inconsistência registrada no momento.</p>'
        : `<div class="filters filters-compact" id="violations-filters">
          <label class="filter-field">
            <span>Severidade</span>
            <select id="violation-severity">
              <option value="">Todas</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label class="filter-field">
            <span>Buscar</span>
            <input id="violation-search" type="search" placeholder="tipo, arquivo, mensagem..." />
          </label>
          <button type="button" class="btn-clear" id="violation-clear">Limpar filtros</button>
          <span class="filter-counter" id="violation-counter"></span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Severidade</th>
                <th>Tipo</th>
                <th>Arquivo</th>
                <th>Mensagem</th>
                <th>Sugestão</th>
              </tr>
            </thead>
            <tbody id="violations-table-body">${filteredViolationRows}</tbody>
          </table>
        </div>`}
    </section>

    <section class="panel">
      <h2 class="panel-title">Top Hotspots</h2>
      ${hotspots.length === 0
        ? '<p class="empty">Sem hotspots no momento.</p>'
        : `<div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Arquivo</th>
                <th>Total</th>
                <th>High</th>
                <th>Medium</th>
                <th>Low</th>
              </tr>
            </thead>
            <tbody>${hotspotRows}</tbody>
          </table>
        </div>`}
    </section>

    <section class="panel">
      <h2 class="panel-title">Waived Violations</h2>
      ${waivedViolations.length === 0
        ? '<p class="empty">Nenhuma inconsistência está em waiver ativo.</p>'
        : `<div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Arquivo</th>
                <th>Mensagem</th>
                <th>Waiver</th>
              </tr>
            </thead>
            <tbody>
              ${waivedViolations
                .slice(0, 120)
                .map(
                  (item) => `
                <tr>
                  <td>${escapeHtml(item.type)}</td>
                  <td><code>${escapeHtml(item.file)}:${Number(item.line || 1)}</code></td>
                  <td>${escapeHtml(item.message || '-')}</td>
                  <td><code>${escapeHtml(item.waivedBy?.id || '-')}</code></td>
                </tr>`,
                )
                .join('')}
            </tbody>
          </table>
        </div>`}
    </section>

    <section class="panel">
      <h2 class="panel-title">Quick Wins (Impacto Alto + Esforço Baixo)</h2>
      ${quickWins.length === 0
        ? '<p class="empty">Sem quick wins disponíveis no momento.</p>'
        : `<div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Ação</th>
                <th>Categoria</th>
                <th>Impacto</th>
                <th>Esforço</th>
                <th>Detalhe</th>
              </tr>
            </thead>
            <tbody>${quickWinRows}</tbody>
          </table>
        </div>`}
    </section>

    <section class="panel">
      <h2 class="panel-title">Sugestões Proativas</h2>
      ${suggestions.length === 0
        ? '<p class="empty">Sem sugestões proativas nesta execução.</p>'
        : `<div class="suggestions">${suggestionCards}</div>`}
    </section>

    <section class="panel">
      <h2 class="panel-title">Padrões Inferidos e Esperados</h2>
      ${Object.keys(patterns).length === 0
        ? '<p class="empty">Ainda sem padrões inferidos. Execute um scan com escopo relevante.</p>'
        : `<div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Chave</th>
                <th>Inferido</th>
                <th>Esperado</th>
                <th>Fonte</th>
                <th>Confiança</th>
                <th>Adoção</th>
              </tr>
            </thead>
            <tbody>${patternRows}</tbody>
          </table>
        </div>`}
    </section>

    <section class="panel">
      <h2 class="panel-title">Regras Ativas (Formalizadas)</h2>
      ${rules.length === 0
        ? '<p class="empty">Nenhuma regra formalizada. Use MCP `ace.formalize_rule` ou CLI `ace rule:add`.</p>'
        : `<div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Título</th>
                <th>Fonte</th>
                <th>Criada em</th>
              </tr>
            </thead>
            <tbody>${ruleRows}</tbody>
          </table>
        </div>`}
    </section>

    <section class="panel">
      <h2 class="panel-title">Decisões Arquiteturais Ativas</h2>
      ${decisions.length === 0
        ? '<p class="empty">Sem decisões ativas. Registre decisões com MCP `ace.record_arch_decision` ou CLI `ace decision:add`.</p>'
        : `<div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Chave</th>
                <th>Preferência</th>
                <th>Fonte</th>
                <th>Criada em</th>
              </tr>
            </thead>
            <tbody>${decisionRows}</tbody>
          </table>
        </div>`}
    </section>
  </main>
  <script>
    (function () {
      function asLower(value) {
        return String(value || '').toLowerCase().trim();
      }

      function setupSecurityFilters() {
        const tbody = document.getElementById('security-table-body');
        if (!tbody) return;

        const statusEl = document.getElementById('security-status');
        const modeEl = document.getElementById('security-mode');
        const severityEl = document.getElementById('security-severity');
        const categoryEl = document.getElementById('security-category');
        const searchEl = document.getElementById('security-search');
        const clearEl = document.getElementById('security-clear');
        const counterEl = document.getElementById('security-counter');
        const rows = Array.from(tbody.querySelectorAll('tr'));

        function render() {
          const status = asLower(statusEl.value);
          const mode = asLower(modeEl.value);
          const severity = asLower(severityEl.value);
          const category = asLower(categoryEl.value);
          const search = asLower(searchEl.value);
          let visible = 0;

          rows.forEach(function (row) {
            const okStatus = !status || row.dataset.status === status;
            const okMode = !mode || row.dataset.mode === mode;
            const okSeverity = !severity || row.dataset.severity === severity;
            const okCategory = !category || row.dataset.category === category;
            const okSearch = !search || (row.dataset.search || '').includes(search);
            const ok = okStatus && okMode && okSeverity && okCategory && okSearch;
            row.style.display = ok ? '' : 'none';
            if (ok) visible += 1;
          });

          counterEl.textContent = visible + ' / ' + rows.length + ' visíveis';
        }

        [statusEl, modeEl, severityEl, categoryEl].forEach(function (el) {
          el.addEventListener('change', render);
        });
        searchEl.addEventListener('input', render);
        clearEl.addEventListener('click', function () {
          statusEl.value = '';
          modeEl.value = '';
          severityEl.value = '';
          categoryEl.value = '';
          searchEl.value = '';
          render();
        });

        render();
      }

      function setupViolationFilters() {
        const tbody = document.getElementById('violations-table-body');
        if (!tbody) return;

        const severityEl = document.getElementById('violation-severity');
        const searchEl = document.getElementById('violation-search');
        const clearEl = document.getElementById('violation-clear');
        const counterEl = document.getElementById('violation-counter');
        const rows = Array.from(tbody.querySelectorAll('tr'));

        function render() {
          const severity = asLower(severityEl.value);
          const search = asLower(searchEl.value);
          let visible = 0;

          rows.forEach(function (row) {
            const okSeverity = !severity || row.dataset.severity === severity;
            const okSearch = !search || (row.dataset.search || '').includes(search);
            const ok = okSeverity && okSearch;
            row.style.display = ok ? '' : 'none';
            if (ok) visible += 1;
          });

          counterEl.textContent = visible + ' / ' + rows.length + ' visíveis';
        }

        severityEl.addEventListener('change', render);
        searchEl.addEventListener('input', render);
        clearEl.addEventListener('click', function () {
          severityEl.value = '';
          searchEl.value = '';
          render();
        });

        render();
      }

      setupSecurityFilters();
      setupViolationFilters();
    }());
  </script>
</body>
</html>`;
}

function writeReport(root, state) {
  const outputPath = path.join(root, ACE_DIR, REPORT_FILE);
  fs.writeFileSync(outputPath, `${generateHtmlReport(state)}\n`, 'utf8');
  return outputPath;
}

module.exports = {
  writeReport,
};
