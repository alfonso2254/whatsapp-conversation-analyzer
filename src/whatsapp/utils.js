/** Extrae el texto/descripción de un mensaje de WhatsApp */
export function extractContent(msg) {
  const m = msg.message;
  if (!m) return null;

  if (m.conversation)                  return m.conversation;
  if (m.extendedTextMessage?.text)     return m.extendedTextMessage.text;
  if (m.imageMessage)                  return `[Imagen] ${m.imageMessage.caption || ''}`.trim();
  if (m.videoMessage)                  return `[Video] ${m.videoMessage.caption || ''}`.trim();
  if (m.documentMessage)               return `[Documento: ${m.documentMessage.fileName || m.documentMessage.title || 'sin nombre'}]`;
  if (m.audioMessage)                  return '[Audio]';
  if (m.stickerMessage)                return '[Sticker]';
  if (m.locationMessage)               return '[Ubicación compartida]';
  if (m.contactMessage)                return `[Contacto: ${m.contactMessage.displayName}]`;

  return null;
}
