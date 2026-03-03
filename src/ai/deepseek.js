/**
 * Integración con DeepSeek vía OpenAI SDK.
 * API keys: https://platform.deepseek.com
 * Endpoint:  https://api.deepseek.com
 */

import OpenAI from 'openai';

const client = new OpenAI({
  apiKey:  process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
});

// ── Prompts ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres el asistente de un PM. Analizas conversaciones de WhatsApp de equipos de trabajo. \
Sé directo y accionable: frases cortas, sin relleno, solo información útil para el PM. Responde siempre en español.`;

const ANALYSIS_TEMPLATE = `Analiza esta conversación de WhatsApp y responde EXACTAMENTE con este formato \
(mantén los emojis y secciones tal cual, no agregues texto extra fuera del formato):

🚨 URGENCIA: [ALTA | MEDIA | BAJA]

📊 ESTADO
[1-2 oraciones concretas sobre qué está pasando en el proyecto ahora mismo]

🔴 BLOQUEADORES
[Si hay bloqueadores, lista con bullets "•". Si no hay, escribe "• Ninguno"]

✅ ACCIONES PENDIENTES
[Lista de 2 a 4 acciones concretas con "•". Incluye quién debe ejecutarla si se sabe. Verbos en infinitivo]

👥 INVOLUCRADOS
[Nombres de personas o equipos externos relevantes mencionados, separados por coma. Si no hay, escribe "—"]

---
Criterios de urgencia:
- ALTA: hay bloqueadores activos, cliente esperando respuesta, o entregables vencidos
- MEDIA: hay tareas claras pendientes que requieren seguimiento pronto
- BAJA: conversación informativa, sin acciones urgentes

Conversación:
{messages}`;

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Analiza un arreglo de mensajes con DeepSeek.
 * @param {Array} messages - Filas de la tabla messages
 * @returns {Promise<string|null>}
 */
export async function analyzeConversation(messages) {
  if (!messages?.length) return null;

  const formattedMessages = messages
    .map(msg => {
      const date = new Date(msg.timestamp * 1000).toLocaleString('es-MX', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
      return `[${date}] ${msg.sender_name}: ${msg.content}`;
    })
    .join('\n');

  const prompt = ANALYSIS_TEMPLATE.replace('{messages}', formattedMessages);

  const completion = await client.chat.completions.create({
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: prompt },
    ],
    temperature: 0.2,
  });

  return completion.choices[0]?.message?.content?.trim() || null;
}

/**
 * Responde una pregunta libre del PM en base al contexto de la conversación.
 * @param {string} userQuestion - Pregunta del PM
 * @param {Array}  messages     - Últimos mensajes del grupo para dar contexto
 * @returns {Promise<string|null>}
 */
export async function chatWithContext(userQuestion, messages) {
  const contextBlock = messages.length
    ? messages
        .map(msg => {
          const date = new Date(msg.timestamp * 1000).toLocaleString('es-MX', {
            dateStyle: 'short',
            timeStyle: 'short',
          });
          return `[${date}] ${msg.sender_name}: ${msg.content}`;
        })
        .join('\n')
    : '(sin mensajes recientes)';

  const prompt =
    `Estos son los últimos mensajes del grupo de WhatsApp del equipo:\n\n` +
    `${contextBlock}\n\n` +
    `El PM pregunta: ${userQuestion}`;

  const completion = await client.chat.completions.create({
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: prompt },
    ],
    temperature: 0.5,
  });

  return completion.choices[0]?.message?.content?.trim() || null;
}

/**
 * Extrae el nivel de urgencia del texto de análisis.
 * @param {string} analysis
 * @returns {'ALTA'|'MEDIA'|'BAJA'}
 */
export function extractUrgency(analysis) {
  if (!analysis) return 'BAJA';
  // Soporta formato nuevo: "🚨 ALTA — ..." y formato anterior: "🚨 URGENCIA: ALTA"
  const match = analysis.match(/🚨\s*(?:URGENCIA:\s*)?(ALTA|MEDIA|BAJA)/i);
  return match ? match[1].toUpperCase() : 'BAJA';
}
