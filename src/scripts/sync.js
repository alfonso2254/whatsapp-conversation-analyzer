/**
 * npm run sync [límite]         — intenta sincronizar con sesión actual
 * npm run sync [límite] --reset — borra sesión, pide QR y descarga historial
 *
 * Después del --reset, `npm start` reutiliza la sesión sin pedir QR de nuevo.
 */

import 'dotenv/config';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { rmSync, existsSync } from 'fs';
import { initDatabase } from '../database/db.js';
import { saveMessage } from '../database/queries.js';
import { extractContent } from '../whatsapp/utils.js';

// ── Args ──────────────────────────────────────────────────────────────────────
const args       = process.argv.slice(2);
const SYNC_LIMIT = parseInt(args.find(a => /^\d+$/.test(a))) || 200;
const RESET      = args.includes('--reset');
const TIMEOUT_MS = 120_000; // 2 minutos

// ── Estado ────────────────────────────────────────────────────────────────────
let savedCount = 0;
let targetJid  = null;
let finished   = false;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function processMessages(messages) {
  for (const msg of messages) {
    if (finished) break;

    const jid = msg.key?.remoteJid;
    if (!jid?.endsWith('@g.us')) continue;
    if (targetJid && jid !== targetJid) continue;
    if (msg.key.fromMe) continue;

    const content = extractContent(msg);
    if (!content) continue;

    const sender     = msg.key.participant || jid;
    const senderName = msg.pushName || sender.split('@')[0];

    try {
      await saveMessage({
        group_id:    jid,
        message_id:  msg.key.id,
        sender,
        sender_name: senderName,
        content,
        timestamp:   Number(msg.messageTimestamp),
      });
      savedCount++;
      process.stdout.write(`\r📥 Mensajes guardados: ${savedCount}   `);
    } catch {
      // Duplicado — ignorado
    }
  }
}

function finish(reason) {
  if (finished) return;
  finished = true;
  console.log(`\n\n✅ Listo (${reason})`);
  console.log(`   Mensajes nuevos guardados: ${savedCount}`);
  if (RESET) {
    console.log('\n   Ahora ejecuta:  npm start');
    console.log('   (no pedirá QR, reutiliza la sesión recién creada)\n');
  }
  process.exit(0);
}

// ── Conexión (se puede llamar múltiples veces al reconectar) ──────────────────
// El reset de auth_info solo ocurre UNA vez al inicio en sync()

async function connect() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
  const { version }          = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth:  state,
    logger: pino({ level: 'silent' }),
    browser: ['WhatsApp Analyzer', 'Chrome', '1.0.0'],
    syncFullHistory: true,
    generateHighQualityLinkPreview: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\n📱 Escanea este QR con WhatsApp del número secundario:\n');
      qrcode.generate(qr, { small: true });
      console.log('\n   Abre WhatsApp → ⋮ → Dispositivos vinculados → Vincular\n');
    }

    if (connection === 'close') {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.log('\n❌ Sesión cerrada manualmente. Usa --reset para vincular de nuevo.');
        process.exit(1);
      }
      if (!finished) {
        // Reconectar SIN borrar auth — solo llama a connect()
        setTimeout(() => connect(), 2000);
      }
      return;
    }

    if (connection === 'open') {
      console.log('✅ Conectado. Descargando historial...\n');

      const groupName = process.env.WHATSAPP_GROUP_NAME;
      if (groupName) {
        try {
          const groups = await sock.groupFetchAllParticipating();
          for (const [jid, meta] of Object.entries(groups)) {
            if (meta.subject.trim() === groupName.trim()) {
              targetJid = jid;
              console.log(`✅ Grupo: "${meta.subject}"\n`);
              break;
            }
          }
          if (!targetJid) {
            console.warn(`⚠️  Grupo "${groupName}" no encontrado. Grupos disponibles:`);
            Object.values(groups).forEach(g => console.log(`   • ${g.subject}`));
          }
        } catch (e) {
          console.error('Error buscando grupos:', e.message);
        }
      }
    }
  });

  sock.ev.on('messaging-history.set', async ({ messages, isLatest }) => {
    if (!messages?.length) return;

    const groupMsgs = messages.filter(m => m.key?.remoteJid?.endsWith('@g.us'));
    console.log(`📦 Lote: ${messages.length} msgs (${groupMsgs.length} de grupos, isLatest: ${isLatest})`);

    await processMessages(messages);

    if (savedCount >= SYNC_LIMIT) {
      finish(`límite de ${SYNC_LIMIT} alcanzado`);
      return;
    }

    if (isLatest) {
      setTimeout(() => finish('historial procesado'), 2000);
    }
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function sync() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  WhatsApp Conversation Sync');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (!RESET && existsSync('./auth_info_baileys')) {
    console.log('⚠️  Ya tienes una sesión activa.');
    console.log('   WhatsApp solo envía historial al VINCULAR un dispositivo nuevo.\n');
    console.log('   Para sincronizar mensajes pasados usa:\n');
    console.log('     npm run sync:reset\n');
    console.log('   Esto borra la sesión, muestra QR y al vincularlo WhatsApp');
    console.log('   envía el historial. Luego `npm start` funciona sin QR.\n');
    process.exit(0);
  }

  // Reset: borrar auth UNA SOLA VEZ antes de conectar
  if (RESET && existsSync('./auth_info_baileys')) {
    console.log('🗑️  Borrando sesión anterior...');
    rmSync('./auth_info_baileys', { recursive: true, force: true });
    console.log('   Sesión borrada.\n');
  }

  console.log(`📋 Límite: ${SYNC_LIMIT} mensajes | ⏱️  Timeout: ${TIMEOUT_MS / 1000}s\n`);

  await initDatabase();
  await connect(); // Conecta sin lógica de reset

  // Timeout global
  setTimeout(() => {
    if (!finished) finish(`tiempo máximo de ${TIMEOUT_MS / 1000}s agotado`);
  }, TIMEOUT_MS);
}

sync().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
