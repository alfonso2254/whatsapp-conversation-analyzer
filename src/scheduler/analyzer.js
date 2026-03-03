import cron from 'node-cron';
import { getMessagesSince, getLastAnalysis, saveAnalysis, enrichWithNames } from '../database/queries.js';
import { analyzeConversation, extractUrgency } from '../ai/deepseek.js';
import { sendTelegramMessage } from '../telegram/bot.js';
import { getTargetGroupJid } from '../whatsapp/client.js';

export function startScheduler() {
  const intervalMinutes = parseInt(process.env.ANALYSIS_INTERVAL_MINUTES) || 30;

  // node-cron: */30 * * * *  → cada 30 minutos
  const cronExpression = `*/${intervalMinutes} * * * *`;

  console.log(`⏰ Scheduler iniciado: análisis automático cada ${intervalMinutes} minutos`);

  cron.schedule(cronExpression, () => {
    const ts = new Date().toLocaleString('es-MX');
    console.log(`\n⏰ [${ts}] Ejecutando análisis programado...`);
    runScheduledAnalysis().catch(err =>
      console.error('Error en análisis programado:', err.message)
    );
  });
}

async function runScheduledAnalysis() {
  // Obtener mensajes desde el último análisis
  const lastAnalysis = getLastAnalysis();
  const since = lastAnalysis
    ? lastAnalysis.created_at
    : Math.floor(Date.now() / 1000) - 30 * 60; // última media hora si no hay análisis previo

  const groupJid = getTargetGroupJid();
  const messages = getMessagesSince(since, groupJid);

  if (messages.length === 0) {
    console.log('📭 Sin mensajes nuevos para analizar.');
    return;
  }

  console.log(`📊 Analizando ${messages.length} mensaje(s) con DeepSeek...`);

  const analysis = await analyzeConversation(enrichWithNames(messages));

  if (!analysis) {
    console.warn('⚠️  DeepSeek no devolvió análisis.');
    return;
  }

  const urgency      = extractUrgency(analysis);
  const shouldNotify = urgency === 'ALTA' || urgency === 'MEDIA';

  saveAnalysis({
    group_id: groupJid,
    analysis,
    notified: shouldNotify ? 1 : 0,
  });

  if (shouldNotify) {
    const notifText =
      `🔔 *Alerta automática* — Urgencia: *${urgency}*\n` +
      `_(${messages.length} msgs nuevos)_\n\n` +
      analysis;

    await sendTelegramMessage(notifText);
    console.log(`📤 Notificación enviada al PM (urgencia: ${urgency})`);
  } else {
    console.log(`✅ Análisis guardado. Urgencia: ${urgency} — sin notificación.`);
  }
}
