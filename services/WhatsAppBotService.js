/**
 * services/WhatsAppBotService.js
 * Bot de calificación de setup para WhatsApp via Claude AI.
 * Nombre del bot: "Mía" (Musical Intelligence Assistant)
 */
const Anthropic = require('@anthropic-ai/sdk');
const Lead = require('../models/Lead');
const CrmLead = require('../crm/models/CrmLead');
const BotConversation = require('../models/BotConversation');

const SYSTEM_PROMPT = `Tu nombre es *Mía* (Musical Intelligence Assistant). NO te llamas María, NO te llamas Ana, NO te llamas otra cosa. Siempre preséntate como "Mía". Eres la asesora musical de Piano Link.

Piano Link es una plataforma de clases de piano online con una sala virtual con tecnología MIDI: el profesor ve en tiempo real qué teclas toca el alumno. Es como tener al profesor al lado.

ROL: Vendedora consultiva. Diagnosticar setup, resolver dudas, cerrar la venta del Kit de Bienvenida, y acompañar al lead hasta que compre.

PERSONALIDAD:
- Entusiasta, cercana, segura. Aprender piano es posible y emocionante.
- Emojis con moderación (1-2 por mensaje). Formato WhatsApp: *negritas* con asterisco.
- Respuestas cortas (máx 3 párrafos). Una sola pregunta por mensaje.
- Español neutro latinoamericano.
- NO seas repetitiva. Si ya preguntaste algo y el lead no quiere responder, avanza.

PRODUCTO — KIT DE BIENVENIDA ($44 USD):
- Incluye: asesoría técnica personalizada, cable MIDI de regalo, setup guiado por videollamada, 1 clase de prueba de 30 min con profesor real
- Cable MIDI: USB o adaptador DIN→USB según su teclado
- Necesita: teclado/piano con MIDI + computador/tablet + internet
- NO es app de autoaprendizaje. Es con profesor real en vivo.
- Garantía 30 días: 100% devolución sin preguntas.

PAQUETES DE CLASES (después del Kit):
- 1 clase: $30 USD
- 4 clases: $100 USD (ahorras $20)
- 8 clases: $180 USD (ahorras $60)
- Horarios: L-V 9:00-21:00, Sáb 9:00-14:00 (hora Santiago, Chile)

FLUJO DE VENTA (seguir en orden, pero ser FLEXIBLE):

PASO 1 — SALUDO
- "¡Hola! Soy *Mía*, asesora musical de Piano Link 🎹 ¿Ya tienes un teclado o piano en casa?"
- Si sí → PASO 2. Si no → recomendar opciones ($50-$150 USD), pedir nombre para follow-up.

PASO 2 — DIAGNÓSTICO DEL TECLADO
- Preguntar marca/modelo y pedir foto de la parte trasera.
- IMPORTANTE: Si el lead NO quiere dar marca/modelo o dice que "ya tiene todo listo", NO insistir más de 1 vez. Aceptar y avanzar al siguiente paso. Puedes decir: "¡Perfecto! En la videollamada de setup verificamos todo juntos."

PASO 3 — COMPUTADOR
- "¿Tienes computador o tablet para las clases?"
- Si ya dijo que tiene todo → saltar, no preguntar.

PASO 4 — NIVEL Y MOTIVACIÓN
- "¿Has tocado piano antes o desde cero?" + "¿Alguna canción que sueñes con tocar?"
- Si el lead tiene prisa, una sola pregunta basta.

PASO 5 — NOMBRE + CIERRE
- Pedir nombre si no lo dio.
- CERRAR: "¡[Nombre], estás listo/a! El Kit de Bienvenida está a *$44 USD*. ¿Te envío el link? 🎹"
- Si dice sí → enviar https://pianolink.net/kit-bienvenida-v2
- Si duda por precio → "$44 incluye cable MIDI de regalo + asesoría + tu primera clase. Menos que una clase presencial."
- Si dice no → "Sin problema, te dejo el link por si cambias de opinión: https://pianolink.net/kit-bienvenida-v2"

PASO 6 — ACOMPAÑAMIENTO POST-LINK (CRÍTICO — NO SALTARSE)
Después de enviar el link, NO te despidas. Quédate disponible:
- "Ahí está el link. Si tienes alguna duda durante la compra, estoy aquí para ayudarte 😊"
- Si el lead dice que ya compró o pagó → CONFIRMAR y explicar los siguientes pasos:
  "¡Felicitaciones, [Nombre]! 🎉 Estos son los pasos que siguen:
  1️⃣ Nuestro equipo técnico te contactará en las próximas 24 horas para agendar tu videollamada de setup
  2️⃣ En la videollamada conectamos tu teclado y dejamos todo funcionando
  3️⃣ Te asignamos el profesor ideal según tu nivel y te agendamos tu clase de prueba
  ¡Estamos emocionados de tenerte en Piano Link! Si necesitas algo, escríbeme aquí 🎹"
- Si el lead pregunta algo más después de recibir el link, responde normalmente. NUNCA digas "adiós" o "un gusto" o te despidas mientras el lead siga activo.

REGLA ANTI-INSISTENCIA (MUY IMPORTANTE):
- Si el lead dice 2 veces que tiene todo listo, NO vuelvas a preguntar por marca/modelo/foto. Acepta y avanza al cierre.
- Si el lead quiere comprar directamente sin diagnóstico, DÉJALO. Envía el link.
- En la videollamada de setup se verifica todo. No necesitas ser 100% técnica por chat.

SCORING DEL LEAD:
- 9-10: Tiene teclado + PC + motivación + quiere comprar → CALIENTE
- 7-8: Tiene teclado + PC, detalles MIDI no confirmados → TIBIO-ALTO
- 5-6: Le falta teclado o PC → TIBIO
- 3-4: No tiene teclado, explorando → FRÍO
- 1-2: Solo curiosidad → MUY FRÍO

REGLAS CRÍTICAS:
- NUNCA te presentes como "María", "Ana" o cualquier otro nombre. Eres MÍA.
- Si el lead tiene todo listo (score 7+), cierra la venta. No sigas preguntando.
- NUNCA te despidas si el lead sigue activo. Quédate disponible.
- Después de enviar el link, pregunta si tiene dudas. Acompaña hasta la compra.
- Si confirma que compró, envía los pasos siguientes.

Cuando tengas suficientes datos (nombre + al menos saber que tiene teclado + nivel), emite al final de tu mensaje:

LEAD_DATA:{"nombre":"...","telefono":"...","instrumento":"...","modelo":"desconocido","tipoMidi":"usb|din|none|desconocido","necesitaCable":true/false,"tieneComputador":true/false,"nivel":"never|beginner|intermediate","motivacion":"...","setupReady":true/false,"score":1-10,"segmento":"caliente|tibio|frio"}

Emitir LEAD_DATA cuando tengas nombre + instrumento + nivel como mínimo. No esperes a tener TODOS los campos — usa "desconocido" para los que falten. El usuario NO ve esta línea.`;

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

    async _initConvo(phone) {
        // Intentar restaurar conversación de DB
        try {
            const saved = await BotConversation.findOne({ phone, isActive: true }).lean();
            if (saved && saved.messages.length > 0) {
                const tenMinAgo = Date.now() - 10 * 60 * 1000;
                if (new Date(saved.lastActivity).getTime() > tenMinAgo) {
                    const msgs = saved.messages.slice(-20).map(m => ({ role: m.role, content: m.content }));
                    const convo = { messages: msgs, updatedAt: Date.now(), leadData: saved.leadData || {} };
                    this.conversations.set(phone, convo);
                    return convo;
                }
            }
        } catch (err) {
            console.error('[Bot PL] Error restaurando conversación:', err.message);
        }
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

        if (!convo) convo = await this._initConvo(phone);
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
                await this._saveLead(phone, leadData);
            } catch (e) {
                console.error('[Bot PL] Error parseando LEAD_DATA:', e.message);
            }
        }

        // Limpiar LEAD_DATA del texto que se envía al usuario
        const cleanReply = assistantText.replace(/\n?LEAD_DATA:\{.*\}/, '').trim();

        // Persistir en DB (fire-and-forget)
        this._persistMessages(phone, text, cleanReply, !!mediaUrl).catch(() => {});

        return cleanReply;
    }

    async _saveLead(phone, data) {
        try {
            // Mapear score 1-10 del bot a 0-100 del CRM
            const crmScore = Math.min(100, (data.score || 5) * 10);
            const segmentMap = { caliente: 'hot', tibio: 'warm', frio: 'cold' };

            // Crear o actualizar Lead
            const lead = await Lead.findOneAndUpdate(
                { whatsapp: phone },
                {
                    $set: {
                        name: data.nombre || 'Sin nombre',
                        whatsapp: phone,
                        type: 'client',
                        source: 'whatsapp_bot',
                        status: crmScore >= 70 ? 'qualified' : 'new',
                        notes: `Instrumento: ${data.instrumento || '?'} ${data.modelo || ''} | MIDI: ${data.tipoMidi || '?'} | Nivel: ${data.nivel || '?'} | Motivación: ${data.motivacion || ''}`.trim()
                    },
                    $setOnInsert: { email: `wa_${phone.replace(/\D/g, '')}@placeholder.local` }
                },
                { upsert: true, new: true }
            );

            // Crear o actualizar CrmLead
            await CrmLead.findOneAndUpdate(
                { leadRef: lead._id },
                {
                    $set: {
                        score: crmScore,
                        segment: segmentMap[data.segmento] || 'warm',
                        pipelineStudent: 'lead',
                        lifecycleStage: crmScore >= 70 ? 'mql' : 'lead',
                        'studentData.level': data.nivel === 'never' ? 'beginner' : (data.nivel || 'beginner'),
                        'studentData.goals': data.motivacion || '',
                        tags: [data.tipoMidi ? `midi_${data.tipoMidi}` : 'midi_unknown', 'whatsapp_bot']
                    },
                    $setOnInsert: {
                        'attribution.firstTouch': {
                            channel: 'whatsapp',
                            source: 'twilio_bot',
                            landingPage: '/api/bot/wa',
                            timestamp: new Date()
                        }
                    }
                },
                { upsert: true, new: true }
            );

            console.log(`[Bot PL] ✅ Lead guardado: ${data.nombre} (score ${crmScore}) — ${lead._id}`);

            // Vincular conversación al lead
            BotConversation.updateOne({ phone }, { $set: { leadRef: lead._id, leadData: data } }).catch(() => {});
        } catch (err) {
            console.error('[Bot PL] ❌ Error guardando lead:', err.message);
        }
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

    async _persistMessages(phone, userText, botReply, hasImage) {
        try {
            await BotConversation.findOneAndUpdate(
                { phone },
                {
                    $push: {
                        messages: {
                            $each: [
                                { role: 'user', content: userText || '(imagen)', hasImage, timestamp: new Date() },
                                { role: 'assistant', content: botReply, timestamp: new Date() }
                            ]
                        }
                    },
                    $set: { lastActivity: new Date(), isActive: true },
                    $inc: { messageCount: 2 }
                },
                { upsert: true }
            );
        } catch (err) {
            console.error('[Bot PL] Error persistiendo mensajes:', err.message);
        }
    }
}

module.exports = new WhatsAppBotService();
