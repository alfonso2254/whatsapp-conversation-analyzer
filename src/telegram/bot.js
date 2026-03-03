import TelegramBot from 'node-telegram-bot-api';

let botInstance = null;

export function createBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN no configurado en .env');

  botInstance = new TelegramBot(token, { polling: true });

  // Registrar comandos visibles en el menú "/" de Telegram
  botInstance.setMyCommands([
    { command: 'status',     description: 'Estado del proyecto (últimas 24h)' },
    { command: 'analizar',   description: 'Forzar análisis ahora' },
    { command: 'chat',       description: 'Pregúntale a la IA (ej: /chat ¿quién bloquea?)' },
    { command: 'mensajes',   description: 'Últimos mensajes del grupo (ej: /mensajes 20)' },
    { command: 'contactos',  description: 'Ver alias de contactos guardados' },
    { command: 'alias',      description: 'Asignar nombre (ej: /alias 521234 Luis)' },
    { command: 'ayuda',      description: 'Mostrar todos los comandos' },
  ]).catch(err => console.warn('No se pudieron registrar comandos en Telegram:', err.message));

  console.log('✅ Telegram bot iniciado (polling)');
  return botInstance;
}

export function getBot() {
  return botInstance;
}

/**
 * Envía un mensaje al chat del PM.
 * Usa Markdown y divide mensajes muy largos automáticamente.
 * @param {string} text
 */
export async function sendTelegramMessage(text) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId || !botInstance) {
    console.warn('⚠️  No se puede enviar mensaje: TELEGRAM_CHAT_ID o bot no disponible.');
    return;
  }

  // Telegram limita mensajes a 4096 caracteres
  const MAX = 4000;
  const chunks = [];
  for (let i = 0; i < text.length; i += MAX) {
    chunks.push(text.slice(i, i + MAX));
  }

  for (const chunk of chunks) {
    try {
      await botInstance.sendMessage(chatId, chunk, { parse_mode: 'Markdown' });
    } catch (err) {
      // Si falla por formato Markdown, reenviar como texto plano
      try {
        await botInstance.sendMessage(chatId, chunk);
      } catch (e) {
        console.error('Error enviando mensaje Telegram:', e.message);
      }
    }
  }
}
