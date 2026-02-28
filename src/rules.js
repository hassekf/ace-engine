const { loadState, saveState } = require('./state');
const { writeReport } = require('./report');
const { nowIso, slugify, parseList } = require('./helpers');

const RULE_STATUSES = new Set([
  'active',
  'deprecated',
  'inactive',
  'rejected',
]);

function formalizeRule({ root, title, description = '', appliesTo = [], constraints = [], source = 'user-consensus' }) {
  if (!title || !String(title).trim()) {
    throw new Error('`title` é obrigatório para formalizar uma regra.');
  }

  const state = loadState(root);

  const normalizedAppliesTo = parseList(appliesTo);
  const normalizedConstraints = parseList(constraints);
  const idBase = slugify(title);
  let id = `${idBase}-v1`;

  const sameTitleRules = state.rules.filter((rule) => rule.title.toLowerCase() === String(title).toLowerCase());
  if (sameTitleRules.length > 0) {
    id = `${idBase}-v${sameTitleRules.length + 1}`;
  }

  const rule = {
    id,
    title,
    description,
    appliesTo: normalizedAppliesTo,
    constraints: normalizedConstraints,
    source,
    createdAt: nowIso(),
    status: 'active',
  };

  state.rules = [...state.rules, rule];
  state.updatedAt = nowIso();

  saveState(root, state);
  writeReport(root, state);

  return {
    rule,
    totalRules: state.rules.length,
  };
}

function updateRuleStatus({ root, id, status, note = '', source = 'cli' }) {
  if (!id) {
    throw new Error('`id` é obrigatório para atualizar regra.');
  }

  const normalizedStatus = String(status || '').trim();
  if (!RULE_STATUSES.has(normalizedStatus)) {
    throw new Error(`Status inválido para regra: ${normalizedStatus}`);
  }

  const state = loadState(root);
  const index = (state.rules || []).findIndex((rule) => rule.id === id);
  if (index < 0) {
    throw new Error(`Regra não encontrada: ${id}`);
  }

  const current = state.rules[index];
  const updated = {
    ...current,
    status: normalizedStatus,
    updatedAt: nowIso(),
    updatedBy: source,
    note: note || current.note || '',
  };

  state.rules[index] = updated;
  state.updatedAt = nowIso();

  saveState(root, state);
  writeReport(root, state);

  return {
    rule: updated,
  };
}

module.exports = {
  formalizeRule,
  updateRuleStatus,
  RULE_STATUSES,
};
