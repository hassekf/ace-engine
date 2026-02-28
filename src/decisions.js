const { loadState, saveState } = require('./state');
const { writeReport } = require('./report');
const { nowIso, slugify } = require('./helpers');

const DECISION_STATUSES = new Set([
  'active',
  'approved',
  'superseded',
  'deprecated',
  'rejected',
  'expired',
  'inactive',
]);

function normalizeDecisionKey(value) {
  return String(value || '').trim();
}

function recordArchitecturalDecision({
  root,
  key,
  preferred,
  rationale = '',
  source = 'user-consensus',
  scope = 'project',
}) {
  const normalizedKey = normalizeDecisionKey(key);
  const normalizedPreferred = String(preferred || '').trim();

  if (!normalizedKey) {
    throw new Error('`key` é obrigatório.');
  }
  if (!normalizedPreferred) {
    throw new Error('`preferred` é obrigatório.');
  }

  const state = loadState(root);
  const timestamp = nowIso();
  const existingVersions = (state.decisions || []).filter((item) => item.key === normalizedKey).length;

  state.decisions = (state.decisions || []).map((item) => {
    if (item.key !== normalizedKey || item.status !== 'active') {
      return item;
    }

    return {
      ...item,
      status: 'superseded',
      supersededAt: timestamp,
      updatedAt: timestamp,
    };
  });

  const decision = {
    id: `${slugify(`${normalizedKey}-${normalizedPreferred}`)}-v${existingVersions + 1}`,
    key: normalizedKey,
    preferred: normalizedPreferred,
    rationale,
    scope,
    source,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  state.decisions = [...(state.decisions || []), decision];
  state.updatedAt = timestamp;

  saveState(root, state);
  writeReport(root, state);

  return {
    decision,
    totalDecisions: state.decisions.length,
  };
}

function updateArchitecturalDecision({
  root,
  id,
  status,
  note = '',
  source = 'cli',
}) {
  const normalizedStatus = String(status || '').trim();
  if (!id) {
    throw new Error('`id` é obrigatório.');
  }
  if (!DECISION_STATUSES.has(normalizedStatus)) {
    throw new Error(`Status inválido para decisão: ${normalizedStatus}`);
  }

  const state = loadState(root);
  const index = (state.decisions || []).findIndex((item) => item.id === id);
  if (index < 0) {
    throw new Error(`Decisão não encontrada: ${id}`);
  }

  const current = state.decisions[index];
  const updated = {
    ...current,
    status: normalizedStatus,
    updatedAt: nowIso(),
    updatedBy: source,
    note: note || current.note || '',
  };

  state.decisions[index] = updated;
  state.updatedAt = nowIso();
  saveState(root, state);
  writeReport(root, state);

  return {
    decision: updated,
  };
}

function listArchitecturalDecisions({ root, key = null, status = null }) {
  const state = loadState(root);
  let decisions = [...(state.decisions || [])];

  if (key) {
    decisions = decisions.filter((item) => item.key === key);
  }

  if (status) {
    decisions = decisions.filter((item) => item.status === status);
  }

  decisions.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  return {
    total: decisions.length,
    items: decisions,
  };
}

module.exports = {
  recordArchitecturalDecision,
  updateArchitecturalDecision,
  listArchitecturalDecisions,
  DECISION_STATUSES,
};
