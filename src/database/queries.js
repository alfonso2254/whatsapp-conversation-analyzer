import db from './db.js';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function nextId(table) {
  db.data._idCounters[table] = (db.data._idCounters[table] || 0) + 1;
  return db.data._idCounters[table];
}

/** Extrae el número de teléfono limpio de un JID o sender_name */
function jidToKey(jid) {
  return (jid || '').split('@')[0];
}

/** Retorna true si el string parece un número de teléfono (solo dígitos) */
function looksLikeNumber(str) {
  return /^\d+$/.test(str || '');
}

// ──────────────────────────────────────────────
// CONTACTS
// ──────────────────────────────────────────────

/**
 * Guarda o actualiza el nombre de un contacto.
 * Solo persiste si el nombre no es un número de teléfono.
 */
export async function upsertContact(jid, name) {
  if (!jid || !name || looksLikeNumber(name)) return;
  db.data.contacts = db.data.contacts || {};
  db.data.contacts[jidToKey(jid)] = name;
  await db.write();
}

/** Retorna el nombre conocido para un JID, o el número si no se conoce. */
export function resolveContactName(jid) {
  const key = jidToKey(jid);
  return (db.data.contacts || {})[key] || key;
}

/** Lista todos los contactos guardados: [{ jid, name }] */
export function getAllContacts() {
  return Object.entries(db.data.contacts || {}).map(([jid, name]) => ({ jid, name }));
}

/**
 * Enriquece un array de mensajes resolviendo sender_name:
 * si el nombre guardado parece un número, intenta resolverlo desde contacts.
 */
export function enrichWithNames(messages) {
  const contacts = db.data.contacts || {};
  return messages.map(m => {
    const key = jidToKey(m.sender || m.sender_name);
    const resolved = contacts[key];
    return {
      ...m,
      sender_name: resolved || (looksLikeNumber(m.sender_name) ? key : m.sender_name),
    };
  });
}

// ──────────────────────────────────────────────
// MESSAGES
// ──────────────────────────────────────────────

export async function saveMessage({ group_id, message_id, sender, sender_name, content, timestamp }) {
  // Evitar duplicados por message_id
  const exists = db.data.messages.some(m => m.message_id === message_id);
  if (exists) return;

  // Si tenemos un nombre real, guardarlo en el mapa de contactos
  if (sender && sender_name && !looksLikeNumber(sender_name)) {
    db.data.contacts = db.data.contacts || {};
    db.data.contacts[jidToKey(sender)] = sender_name;
  }

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
