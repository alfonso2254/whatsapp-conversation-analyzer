import { getBot } from './bot.js';
import { getMessagesSince, getLastNMessages, getLastAnalysis, saveAnalysis } from '../database/queries.js';
import { analyzeConversation } from '../ai/kimi.js';
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
      `Comandos disponibles:\n\n` +
      `• /status — Estado actual del proyecto (análisis IA últimas 24h)\n` +
      `• /mensajes \\[n\\] — Últimos n mensajes del grupo (default 20)\n` +
      `• /analizar — Forzar análisis de mensajes nuevos ahora\n` +
      `• /ayuda — Mostrar esta ayuda`,
      { parse_mode: 'MarkdownV2' }
    );
  });

  // ──────────────────────────────────────────────
  // /status — análisis IA de las últimas 24 horas
  // ──────────────────────────────────────────────
  bot.onText(/\/status/, async (msg) => {
    if (!isAuthorized(msg.chat.id)) return unauthorized(bot, msg.chat.id);

    await bot.sendMessage(msg.chat.id, '🔄 Consultando estado con Kimi AI...');

    try {
      const since    = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
      const groupJid = getTargetGroupJid();
      const messages = getMessagesSince(since, groupJid);

      if (messages.length === 0) {
        await bot.sendMessage(msg.chat.id, '📭 No hay mensajes en las últimas 24 horas en el grupo.');
        return;
      }

      const analysis = await analyzeConversation(messages);

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

      const lines = messages.map(m => {
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

      const analysis = await analyzeConversation(messages);

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

  // Manejo de errores de polling
  bot.on('polling_error', (err) => {
    console.error('Telegram polling error:', err.message);
  });

  console.log('✅ Handlers de Telegram registrados');
}
