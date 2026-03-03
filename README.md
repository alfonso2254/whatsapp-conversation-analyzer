# WhatsApp Conversation Analyzer

Bot que escucha pasivamente un grupo de WhatsApp, almacena las conversaciones y las analiza con Kimi AI, notificando el estado del proyecto al PM vía Telegram.

## Características

- **Solo escucha** — nunca envía mensajes al grupo de WhatsApp
- Almacena todos los mensajes en SQLite local
- Análisis automático cada 30 minutos con Kimi AI
- Alerta por Telegram si la urgencia es ALTA o MEDIA
- Consulta manual vía comandos de Telegram en cualquier momento

## Requisitos

- Node.js 18+
- API Key de [Kimi (MoonShot AI)](https://platform.moonshot.cn)
- Un bot de Telegram (creado con [@BotFather](https://t.me/BotFather))
- Número secundario de WhatsApp para parear

## Instalación

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# Edita .env con tus tokens y nombre del grupo
```

## Configuración (.env)

| Variable | Descripción |
|---|---|
| `WHATSAPP_GROUP_NAME` | Nombre exacto del grupo de WhatsApp |
| `TELEGRAM_BOT_TOKEN` | Token del bot (de @BotFather) |
| `TELEGRAM_CHAT_ID` | Tu chat ID personal (de @userinfobot) |
| `KIMI_API_KEY` | API Key de platform.moonshot.cn |
| `KIMI_MODEL` | Modelo Kimi (default: `moonshot-v1-32k`) |
| `ANALYSIS_INTERVAL_MINUTES` | Intervalo de análisis en minutos (default: `30`) |

## Uso

```bash
npm start
```

La primera vez mostrará un QR en la terminal. Escanéalo con WhatsApp del número secundario. A partir de ahí la sesión queda guardada en `./auth_info_baileys/` y reconecta automáticamente.

## Comandos de Telegram

| Comando | Descripción |
|---|---|
| `/status` | Estado actual del proyecto (análisis IA últimas 24h) |
| `/mensajes [n]` | Últimos n mensajes del grupo (default 20) |
| `/analizar` | Forzar análisis de mensajes nuevos ahora |
| `/ayuda` | Mostrar ayuda |

## Estructura del proyecto

```
src/
├── index.js              # Punto de entrada
├── whatsapp/
│   └── client.js         # Conexión Baileys (solo escucha)
├── telegram/
│   ├── bot.js            # Setup del bot de Telegram
│   └── handlers.js       # Manejadores de comandos
├── ai/
│   └── kimi.js           # Integración con Kimi API
├── database/
│   ├── db.js             # SQLite (mensajes + análisis)
│   └── queries.js        # Consultas a la BD
└── scheduler/
    └── analyzer.js       # Cron job de análisis automático
```

## Mantener corriendo en Mac (opcional)

Para que el bot no se detenga al cerrar la terminal, puedes usar `pm2`:

```bash
npm install -g pm2
pm2 start npm --name "wa-analyzer" -- start
pm2 save
pm2 startup   # para que inicie con el sistema
```
