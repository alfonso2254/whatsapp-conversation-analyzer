import 'dotenv/config';
import { initDatabase } from './database/db.js';
import { connectWhatsApp } from './whatsapp/client.js';
import { createBot } from './telegram/bot.js';
import { registerHandlers } from './telegram/handlers.js';
import { startScheduler } from './scheduler/analyzer.js';

console.log('🚀 Iniciando WhatsApp Conversation Analyzer...\n');

// Validar variables de entorno obligatorias
const REQUIRED_VARS = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'KIMI_API_KEY'];
const missing = REQUIRED_VARS.filter(k => !process.env[k]);

if (missing.length > 0) {
  console.error(`❌ Variables de entorno faltantes: ${missing.join(', ')}`);
  console.error('   Crea un archivo .env basado en .env.example\n');
  process.exit(1);
}

async function main() {
  // 1. Base de datos (JSON local)
  await initDatabase();

  // 2. Telegram bot
  createBot();
  registerHandlers();

  // 3. Scheduler de análisis automático
  startScheduler();

  // 4. Conexión a WhatsApp (muestra QR si es primera vez)
  await connectWhatsApp();
}

main().catch(err => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});

// Cierre limpio con Ctrl+C
process.on('SIGINT', () => {
  console.log('\n👋 Apagando... Hasta luego.');
  process.exit(0);
});
