import OpenAI from 'openai';

const kimi = new OpenAI({
  apiKey:  process.env.KIMI_API_KEY,
  baseURL: 'https://api.moonshot.ai/v1',
});

// DEBUG: Verificar que la key existe (enmascarada)
console.log('🔑 API Key cargada:', process.env.KIMI_API_KEY ? 
  `${process.env.KIMI_API_KEY.substring(0, 10)}...${process.env.KIMI_API_KEY.substring(process.env.KIMI_API_KEY.length - 4)}` : 
  'NO ENCONTRADA');
console.log('🔑 Longitud:', process.env.KIMI_API_KEY?.length);
console.log('🔑 Modelo:', process.env.KIMI_MODEL);

const SYSTEM_PROMPT = `Eres un asistente experto en gestión de proyectos. \
Analizas conversaciones de WhatsApp de equipos de trabajo y extraes información clave \
para el PM (Project Manager). Sé conciso, claro y accionable. Responde siempre en español.`;

const ANALYSIS_TEMPLATE = `Analiza la siguiente conversación de WhatsApp y responde \
EXACTAMENTE con este formato (mantén los emojis y etiquetas tal cual):

📊 ESTADO: [descripción breve del estado actual del proyecto o tarea]
⏳ EN ESPERA DE: [quién o qué bloquea el avance; si no hay bloqueos escribe "Nada"]
👥 DEPENDENCIAS: [personas, equipos o sistemas externos de los que dependemos; si no hay escribe "Ninguna"]
✅ ACCIONES PENDIENTES:
• [acción 1]
• [acción 2]
🚨 URGENCIA: [escribe exactamente ALTA, MEDIA o BAJA]
💬 RESUMEN: [2-3 oraciones del contexto general de esta conversación]

Criterios de urgencia:
- ALTA: hay bloqueadores críticos, clientes esperando respuesta, o tareas vencidas
- MEDIA: hay acciones pendientes claras que requieren seguimiento próximo
- BAJA: conversación informativa o sin acciones urgentes

Conversación:
{messages}`;

/**
 * Analiza un arreglo de mensajes y devuelve el texto del análisis.
 * @param {Array} messages - Filas de la tabla messages
 * @returns {Promise<string|null>}
 */
export async function analyzeConversation(messages) {
  if (!messages || messages.length === 0) return null;

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

  const response = await kimi.chat.completions.create({
    model:       process.env.KIMI_MODEL || 'kimi-k2-turbo-preview',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: prompt },
    ],
    temperature: 0.3,
    max_tokens:  1000,
  });

  return response.choices[0]?.message?.content?.trim() || null;
}

/**
 * Extrae el nivel de urgencia del texto de análisis.
 * @param {string} analysis
 * @returns {'ALTA'|'MEDIA'|'BAJA'}
 */
export function extractUrgency(analysis) {
  if (!analysis) return 'BAJA';
  const match = analysis.match(/🚨\s*URGENCIA:\s*(ALTA|MEDIA|BAJA)/i);
  return match ? match[1].toUpperCase() : 'BAJA';
}
