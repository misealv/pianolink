/**
 * services/WhatsAppBotService.js
 * Bot de calificación de setup para WhatsApp via Claude AI.
 * Nombre del bot: "Mía" (Musical Intelligence Assistant)
 */
const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT = `Eres Mía (Musical Intelligence Assistant), la asistente de Piano Link, una plataforma de clases de piano online con sala virtual y tecnología MIDI que muestra las notas en tiempo real.

PERSONALIDAD:
- Cercana, cálida, entusiasta pero profesional
- Emojis con moderación (1-2 por mensaje)
- Respuestas cortas (máx 3 párrafos por mensaje en WhatsApp)
- Idioma: español neutro latinoamericano

TU OBJETIVO:
Ayudar al lead a preparar su setup antes de comprar el Kit de Bienvenida ($29 USD madrugador).
Necesitas averiguar:
1. ¿Tiene un teclado/piano? ¿Cuál? ¿Tiene salida MIDI USB o MIDI DIN?
2. ¿Tiene computador/tablet para conectarse a las clases?
3. ¿Qué nivel tiene? (nunca tocó / algo sabe / intermedio)
4. ¿Qué lo motiva a aprender piano?

BASE DE CONOCIMIENTO — CABLES MIDI:
- Teclados con MIDI USB (conector USB-B cuadrado atrás): NO necesitan cable extra, solo un cable USB A-B normal.
  Ejemplos: Yamaha PSR-E series, Casio CT-S series, Roland GO:KEYS, Korg microKEY, Akai MPK.
- Teclados con MIDI DIN (conector redondo de 5 pines): Necesitan un adaptador MIDI-USB.
  Ejemplos: Yamaha P-45/P-125 (modelos viejos), Casio CDP series viejos, pianos digitales antiguos.
- Teclados SIN MIDI: No pueden usar la función MIDI de Piano Link, pero igual pueden tomar clases normales.
  Ejemplos: Teclados de juguete, órganos Hammond antiguos, pianos acústicos sin sistema silent.
- Si el lead tiene un piano acústico: explicar que para usar la función MIDI necesitaría un sistema Silent/Hybrid o un teclado controlador aparte.

FLUJO DE CONVERSACIÓN:
1. Saludo → preguntar si ya tiene un teclado/piano
2. Si tiene → preguntar marca y modelo (o pedir foto)
3. Evaluar compatibilidad MIDI → recomendar cable si necesita
4. Preguntar si tiene computador/tablet
5. Preguntar nivel y motivación
6. Dar recomendación: "Estás listo para el Kit" o "Antes necesitas X"

REGLAS:
- Si el lead envía una foto de su teclado, descríbelo y busca el conector MIDI.
- Si no sabes el modelo exacto, pide la marca y el número de teclas.
- Nunca presiones para comprar. Sé honesta si el setup no es compatible.
- Si el lead no tiene teclado, recomienda opciones económicas ($50-$150 USD) y dile que puede comprar en su país.
- Si preguntan por precio del Kit: "$29 USD precio de lanzamiento, incluye acceso a la sala virtual MIDI, clase de prueba con un profesor, y setup guiado".
- Cuando tengas toda la info (instrumento + MIDI + computador + nivel + motivación), genera un resumen con formato:

LEAD_DATA:{"nombre":"...","instrumento":"...","modelo":"...","tipoMidi":"usb|din|none","necesitaCable":true/false,"tieneComputador":true/false,"nivel":"never|beginner|intermediate","motivacion":"...","setupReady":true/false,"score":1-10}

Solo emitir LEAD_DATA cuando tengas TODOS los datos. Nunca antes.`;

class WhatsAppBotService {
    constructor() {
        this.claude = null; // Inicialización lazy
        // Historial por número de teléfono
        this.conversations = new Map();
        this.TTL = 24 * 60 * 60 * 1000; // 24 horas

        // Limpiar conversaciones expiradas cada hora
        setInterval(() => {
            const now = Date.now();
            for (const [phone, convo] of this.conversations) {
                if (now - convo.updatedAt > this.TTL) {
                    this.conversations.delete(phone);
                }
            }
        }, 60 * 60 * 1000);
    }

    _getClient() {
        if (!this.claude) {
            this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        }
        return this.claude;
    }

    _initConvo(phone) {
        const convo = { messages: [], updatedAt: Date.now(), leadData: {} };
        this.conversations.set(phone, convo);
        return convo;
    }

    async processMessage(phone, text, mediaUrl = null) {
        let convo = this.conversations.get(phone);

        // Resetear si es saludo y conversación vieja (> 10 min)
        if (convo && /^(hola|buenas|hi|hey|inicio)\b/i.test(text)) {
            if (Date.now() - convo.updatedAt > 10 * 60 * 1000) {
                convo = null;
                this.conversations.delete(phone);
            }
        }

        if (!convo) convo = this._initConvo(phone);
        convo.updatedAt = Date.now();

        // Construir mensaje del usuario
        if (mediaUrl) {
            try {
                const imageBuffer = await this._downloadMedia(mediaUrl);
                convo.messages.push({
                    role: 'user',
                    content: [
                        { type: 'image', source: {
                            type: 'base64',
                            media_type: 'image/jpeg',
                            data: imageBuffer.toString('base64')
                        }},
                        { type: 'text', text: text || 'Aquí está la foto de mi teclado' }
                    ]
                });
            } catch (err) {
                console.error('[Bot PL] Error descargando imagen:', err.message);
                convo.messages.push({ role: 'user', content: text || '(envió una imagen que no pude procesar)' });
            }
        } else {
            convo.messages.push({ role: 'user', content: text });
        }

        // Llamar a Claude
        const client = this._getClient();
        const response = await client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 500,
            system: SYSTEM_PROMPT,
            messages: convo.messages
        });

        const assistantText = response.content[0]?.text || 'Disculpa, no pude procesar tu mensaje.';

        // Guardar respuesta en historial
        convo.messages.push({ role: 'assistant', content: assistantText });

        // Limitar historial a 30 mensajes para no explotar tokens
        if (convo.messages.length > 30) {
            convo.messages = convo.messages.slice(-20);
        }

        // Detectar LEAD_DATA y procesarlo
        const leadMatch = assistantText.match(/LEAD_DATA:(\{.*\})/);
        if (leadMatch) {
            try {
                const leadData = JSON.parse(leadMatch[1]);
                convo.leadData = leadData;
                console.log(`[Bot PL] Lead calificado de ${phone}:`, JSON.stringify(leadData));
                // TODO: Guardar en Lead + CrmLead
            } catch (e) {
                console.error('[Bot PL] Error parseando LEAD_DATA:', e.message);
            }
        }

        // Limpiar LEAD_DATA del texto que se envía al usuario
        const cleanReply = assistantText.replace(/\n?LEAD_DATA:\{.*\}/, '').trim();
        return cleanReply;
    }

    async _downloadMedia(mediaUrl) {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

        const res = await fetch(mediaUrl, {
            headers: { 'Authorization': `Basic ${credentials}` }
        });

        if (!res.ok) throw new Error(`Twilio media download failed: ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }
}

module.exports = new WhatsAppBotService();
