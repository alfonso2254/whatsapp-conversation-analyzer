import db from './db.js';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function nextId(table) {
  db.data._idCounters[table] = (db.data._idCounters[table] || 0) + 1;
  return db.data._idCounters[table];
}

// ──────────────────────────────────────────────
// MESSAGES
// ──────────────────────────────────────────────

export async function saveMessage({ group_id, message_id, sender, sender_name, content, timestamp }) {
  // Evitar duplicados por message_id
  const exists = db.data.messages.some(m => m.message_id === message_id);
  if (exists) return;

  db.data.messages.push({
    id:          nextId('messages'),
    group_id,
    message_id,
    sender,
    sender_name,
    content,
    timestamp:   Number(timestamp),
  });
  await db.write();
}

/** Mensajes desde un timestamp Unix (segundos), opcionalmente filtrado por grupo */
export function getMessagesSince(sinceTimestamp, group_id = null) {
  return db.data.messages.filter(m =>
    m.timestamp >= sinceTimestamp &&
    (group_id === null || m.group_id === group_id)
  ).sort((a, b) => a.timestamp - b.timestamp);
}

/** Últimos n mensajes ordenados cronológicamente */
export function getLastNMessages(n = 20, group_id = null) {
  const filtered = group_id
    ? db.data.messages.filter(m => m.group_id === group_id)
    : db.data.messages;

  return filtered
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, n)
    .reverse();
}

// ──────────────────────────────────────────────
// ANALYSES
// ──────────────────────────────────────────────

export async function saveAnalysis({ group_id = null, analysis, notified = 0 }) {
  db.data.analyses.push({
    id:         nextId('analyses'),
    group_id,
    analysis,
    notified,
    created_at: Math.floor(Date.now() / 1000),
  });
  await db.write();
}

export function getLastAnalysis(group_id = null) {
  const filtered = group_id
    ? db.data.analyses.filter(a => a.group_id === group_id)
    : db.data.analyses;

  if (filtered.length === 0) return null;
  return filtered.reduce((prev, curr) => curr.created_at > prev.created_at ? curr : prev);
}
