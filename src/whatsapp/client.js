import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { saveMessage } from '../database/queries.js';
import { extractContent } from './utils.js';

// JID del grupo objetivo (se resuelve una vez conectado)
let targetGroupJid = null;

export function getTargetGroupJid() {
  return targetGroupJid;
}

export async function connectWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['WhatsApp Analyzer', 'Chrome', '1.0.0'],
    // El bot NUNCA enviará mensajes — solo lee
    generateHighQualityLinkPreview: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📱 Escanea este QR con WhatsApp del número secundario:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        console.log('🔄 Reconectando WhatsApp...');
        connectWhatsApp();
      } else {
        console.log('❌ Sesión cerrada. Elimina ./auth_info_baileys/ y reinicia para vincular de nuevo.');
      }
    }

    if (connection === 'open') {
      console.log('✅ WhatsApp conectado!');
      await findTargetGroup(sock);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      const jid = msg.key.remoteJid;

      // Solo mensajes de grupos
      if (!jid || !jid.endsWith('@g.us')) continue;

      // Filtrar por grupo objetivo si está configurado
      if (targetGroupJid && jid !== targetGroupJid) continue;

      // Ignorar mensajes propios
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
        console.log(`💬 [${senderName}]: ${content.substring(0, 70)}`);
      } catch {
        // Duplicados ignorados
      }
    }
  });

  return sock;
}

export async function findTargetGroup(sock) {
  const groupName = process.env.WHATSAPP_GROUP_NAME;

  if (!groupName) {
    console.warn('⚠️  WHATSAPP_GROUP_NAME no configurado — escuchando todos los grupos.');
    return null;
  }

  try {
    const groups  = await sock.groupFetchAllParticipating();
    const entries = Object.entries(groups);

    for (const [jid, meta] of entries) {
      if (meta.subject.trim() === groupName.trim()) {
        targetGroupJid = jid;
        console.log(`✅ Grupo objetivo: "${meta.subject}" (${jid})`);
        return jid;
      }
    }

    console.warn(`\n⚠️  Grupo "${groupName}" no encontrado. Grupos disponibles:`);
    entries.forEach(([, meta]) => console.log(`   • ${meta.subject}`));
    console.warn('Actualiza WHATSAPP_GROUP_NAME en .env y reinicia.\n');
    return null;
  } catch (err) {
    console.error('Error al buscar grupos:', err.message);
    return null;
  }
}
