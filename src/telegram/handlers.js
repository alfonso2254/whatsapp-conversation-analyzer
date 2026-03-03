import { getBot } from './bot.js';
import { getMessagesSince, getLastNMessages, getLastAnalysis, saveAnalysis, upsertContact, getAllContacts, enrichWithNames } from '../database/queries.js';
import { analyzeConversation, chatWithContext } from '../ai/deepseek.js';
import { getTargetGroupJid } from '../whatsapp/client.js';

const ALLOWED_CHAT_ID = () => process.env.TELEGRAM_CHAT_ID;

function isAuthorized(chatId) {
  return String(chatId) === String(ALLOWED_CHAT_ID());
}

function unauthorized(bot, chatId) {
  bot.sendMessage(chatId, '⛔ No tienes permiso para usar este bot.');
}

export function registerHandlers() {
  const bot = getBot();

  // ──────────────────────────────────────────────
  // /ayuda  /start  /help
  // ──────────────────────────────────────────────
  bot.onText(/\/(ayuda|start|help)/, (msg) => {
    if (!isAuthorized(msg.chat.id)) return unauthorized(bot, msg.chat.id);

    bot.sendMessage(msg.chat.id,
      `*🤖 WhatsApp Analyzer Bot*\n\n` +
      `*📊 Análisis*\n` +
      `• /status — Estado del proyecto (últimas 24h)\n` +
      `• /analizar — Forzar análisis ahora\n` +
      `• /chat [pregunta] — Pregúntale a la IA\n\n` +
      `*💬 Mensajes*\n` +
      `• /mensajes [n] — Últimos n mensajes (default 20)\n\n` +
      `*👥 Contactos*\n` +
      `• /contactos — Ver nombres guardados\n` +
      `• /alias [numero] [nombre] — Asignar nombre a un número\n\n` +
      `• /ayuda — Mostrar esta ayuda`,
      { parse_mode: 'Markdown' }
    );
  });

  // ──────────────────────────────────────────────
  // /status — análisis IA de las últimas 24 horas
  // ──────────────────────────────────────────────
  bot.onText(/\/status/, async (msg) => {
    if (!isAuthorized(msg.chat.id)) return unauthorized(bot, msg.chat.id);

    await bot.sendMessage(msg.chat.id, '🔄 Consultando estado con DeepSeek...');

    try {
      const since    = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
      const groupJid = getTargetGroupJid();
      const messages = getMessagesSince(since, groupJid);

      if (messages.length === 0) {
        await bot.sendMessage(msg.chat.id, '📭 No hay mensajes en las últimas 24 horas en el grupo.');
        return;
      }

      const analysis = await analyzeConversation(enrichWithNames(messages));

      if (analysis) {
        await bot.sendMessage(
          msg.chat.id,
          `*📊 Estado del proyecto — últimas 24h* _(${messages.length} mensajes)_\n\n${analysis}`,
          { parse_mode: 'Markdown' }
        );
      } else {
        await bot.sendMessage(msg.chat.id, '⚠️ No se pudo generar el análisis. Intenta de nuevo.');
      }
    } catch (err) {
      console.error('Error en /status:', err);
      await bot.sendMessage(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ──────────────────────────────────────────────
  // /mensajes [n] — últimos n mensajes
  // ──────────────────────────────────────────────
  bot.onText(/\/mensajes(?:\s+(\d+))?/, async (msg, match) => {
    if (!isAuthorized(msg.chat.id)) return unauthorized(bot, msg.chat.id);

    const n        = Math.min(parseInt(match?.[1]) || 20, 100);
    const groupJid = getTargetGroupJid();

    try {
      const messages = getLastNMessages(n, groupJid);

      if (messages.length === 0) {
        await bot.sendMessage(msg.chat.id, '📭 No hay mensajes guardados aún.');
        return;
      }

      const resolved = enrichWithNames(messages);
      const lines = resolved.map(m => {
        const date = new Date(m.timestamp * 1000).toLocaleString('es-MX', {
          dateStyle: 'short',
          timeStyle: 'short',
        });
        return `[${date}] *${m.sender_name}*: ${m.content}`;
      });

      const text = `*Últimos ${messages.length} mensajes del grupo:*\n\n${lines.join('\n')}`;
      await bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('Error en /mensajes:', err);
      await bot.sendMessage(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ──────────────────────────────────────────────
  // /analizar — forzar análisis inmediato
  // ──────────────────────────────────────────────
  bot.onText(/\/analizar/, async (msg) => {
    if (!isAuthorized(msg.chat.id)) return unauthorized(bot, msg.chat.id);

    await bot.sendMessage(msg.chat.id, '🔄 Ejecutando análisis ahora...');

    try {
      const lastAnalysis = getLastAnalysis();
      const since = lastAnalysis
        ? lastAnalysis.created_at
        : Math.floor(Date.now() / 1000) - 60 * 60; // última hora si no hay análisis previo

      const groupJid = getTargetGroupJid();
      const messages = getMessagesSince(since, groupJid);

      if (messages.length === 0) {
        await bot.sendMessage(msg.chat.id, '📭 No hay mensajes nuevos desde el último análisis.');
        return;
      }

      const analysis = await analyzeConversation(enrichWithNames(messages));

      if (analysis) {
        saveAnalysis({ group_id: groupJid, analysis, notified: 1 });
        await bot.sendMessage(
          msg.chat.id,
          `*🔍 Análisis forzado* _(${messages.length} mensajes nuevos)_\n\n${analysis}`,
          { parse_mode: 'Markdown' }
        );
      } else {
        await bot.sendMessage(msg.chat.id, '⚠️ No se pudo generar el análisis. Intenta de nuevo.');
      }
    } catch (err) {
      console.error('Error en /analizar:', err);
      await bot.sendMessage(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ──────────────────────────────────────────────
  // /chat [pregunta] — conversar con la IA en base al contexto del grupo
  // ──────────────────────────────────────────────
  bot.onText(/\/chat(?:\s+(.+))?/s, async (msg, match) => {
    if (!isAuthorized(msg.chat.id)) return unauthorized(bot, msg.chat.id);

    const question = match?.[1]?.trim();
    if (!question) {
      await bot.sendMessage(msg.chat.id, '💬 Uso: /chat [tu pregunta]\nEjemplo: /chat ¿quién está bloqueando el deploy?');
      return;
    }

    await bot.sendMessage(msg.chat.id, '🤔 Consultando a DeepSeek...');

    try {
      const groupJid = getTargetGroupJid();
      // Últimas 6 horas de contexto por defecto
      const since    = Math.floor(Date.now() / 1000) - 6 * 60 * 60;
      const messages = getMessagesSince(since, groupJid);

      const reply = await chatWithContext(question, enrichWithNames(messages));

      if (reply) {
        await bot.sendMessage(msg.chat.id, reply);
      } else {
        await bot.sendMessage(msg.chat.id, '⚠️ No se pudo obtener respuesta. Intenta de nuevo.');
      }
    } catch (err) {
      console.error('Error en /chat:', err);
      await bot.sendMessage(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ──────────────────────────────────────────────
  // /alias [numero] [nombre] — asignar nombre a un número
  // ──────────────────────────────────────────────
  bot.onText(/\/alias(?:\s+(\S+)\s+(.+))?/, async (msg, match) => {
    if (!isAuthorized(msg.chat.id)) return unauthorized(bot, msg.chat.id);

    const jid  = match?.[1]?.trim();
    const name = match?.[2]?.trim();

    if (!jid || !name) {
      await bot.sendMessage(msg.chat.id,
        '💡 Uso: `/alias [numero] [nombre]`\n' +
        'Ejemplo: `/alias 186350259200083 Luis`\n\n' +
        'El número lo ves en /mensajes cuando aparece sin nombre.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    await upsertContact(jid, name);
    await bot.sendMessage(msg.chat.id, `✅ Guardado: *${jid}* → *${name}*`, { parse_mode: 'Markdown' });
  });

  // ──────────────────────────────────────────────
  // /contactos — ver todos los alias guardados
  // ──────────────────────────────────────────────
  bot.onText(/\/contactos/, async (msg) => {
    if (!isAuthorized(msg.chat.id)) return unauthorized(bot, msg.chat.id);

    const contacts = getAllContacts();
    if (contacts.length === 0) {
      await bot.sendMessage(msg.chat.id, '📋 No hay contactos guardados aún.\nUsa `/alias [numero] [nombre]` para agregar uno.', { parse_mode: 'Markdown' });
      return;
    }

    const lines = contacts.map(c => `• \`${c.jid}\` → *${c.name}*`).join('\n');
    await bot.sendMessage(msg.chat.id, `*📋 Contactos guardados:*\n\n${lines}`, { parse_mode: 'Markdown' });
  });

  // Manejo de errores de polling
  bot.on('polling_error', (err) => {
    console.error('Telegram polling error:', err.message);
  });

  console.log('✅ Handlers de Telegram registrados');
}
