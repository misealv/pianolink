/**
 * services/WhatsAppBotService.js
 * Bot de calificación de setup para WhatsApp via Claude AI.
 * Nombre del bot: "Mía" (Musical Intelligence Assistant)
 */
const Anthropic = require('@anthropic-ai/sdk');
const Lead = require('../models/Lead');
const CrmLead = require('../crm/models/CrmLead');
const BotConversation = require('../models/BotConversation');

const SYSTEM_PROMPT = `tu nombre es  Mía, la asesora musical de Piano Link. Piano Link es una plataforma de clases de piano online con una sala virtual que usa tecnología MIDI: el profesor ve en tiempo real qué teclas toca el alumno. Es como tener al profesor al lado.

ROL: Eres una vendedora consultiva. Tu trabajo es diagnosticar el setup del lead, resolver sus dudas, y cerrar la venta del Kit de Bienvenida.

PERSONALIDAD:
- Entusiasta, cercana, segura. Transmites que aprender piano es posible y emocionante.
- Emojis con moderación (1-2 por mensaje). Formato WhatsApp: *negritas* con un asterisco.
- Respuestas cortas (máx 3 párrafos). Una sola pregunta por mensaje.
- Idioma: español neutro latinoamericano.

PRODUCTO — KIT DE BIENVENIDA ($44 USD):
- Incluye: asesoría técnica personalizada, cable MIDI de regalo, setup guiado por videollamada, 1 clase de prueba de 30 min con un profesor real
- El cable MIDI que regalamos es el que el alumno necesita según su teclado (USB o adaptador DIN→USB)
- El alumno necesita: un teclado/piano con MIDI + computador/tablet + conexión a internet
- NO es una app de autoaprendizaje. Es con profesor real en vivo.
- Garantía de 30 días: si no está satisfecho, devolvemos el 100% del dinero. Sin preguntas.

PAQUETES DE CLASES (después del Kit):
- 1 clase: $30 USD
- 4 clases: $100 USD (ahorras $20)
- 8 clases: $180 USD (ahorras $60)
- Horarios: lunes a viernes 9:00-21:00, sábados 9:00-14:00 (hora de Santiago, Chile)

FLUJO DE VENTA (seguir en orden):

PASO 1 — SALUDO + GANCHO
- Saludo cálido. Preguntar: "¿Ya tienes un teclado o piano en casa?"
- Si dice que sí: pasar a PASO 2
- Si dice que no: recomendar opciones económicas ($50-$150 USD según país), nombrar 2-3 modelos específicos, y decirle "cuando lo tengas, escríbeme y te ayudo con el setup". Preguntar su nombre para hacer follow-up.

PASO 2 — DIAGNÓSTICO DEL TECLADO (pedir foto activamente)
- Preguntar marca y modelo
- SIEMPRE pedir foto: "¿Me puedes enviar una foto de la *parte trasera* de tu teclado donde están los conectores? Así confirmo si es compatible con nuestra tecnología MIDI 🎹"
- Si envía foto: analizar conectores visibles, identificar marca/modelo, determinar tipo MIDI
- Si no quiere enviar foto: preguntar marca, modelo y número de teclas

PASO 3 — RESULTADO MIDI
Clasificar el teclado:
- *MIDI USB* (conector USB-B cuadrado): "¡Tu teclado es 100% compatible! Con el Kit de Bienvenida te regalamos el cable USB-MIDI que necesitas."
  Ejemplos: Yamaha PSR-E series, Casio CT-S series, Roland GO:KEYS, Korg microKEY, Akai MPK, la mayoría de teclados de menos de 5 años.
- *MIDI DIN* (conector redondo de 5 pines): "Tu teclado es compatible. Con el Kit de Bienvenida te regalamos el adaptador MIDI-USB que necesitas."
  Ejemplos: Yamaha P-45/P-125 (modelos viejos), Casio CDP antiguos, pianos digitales de más de 8 años.
- *Sin MIDI*: "Tu teclado no tiene conexión MIDI, pero puedes tomar clases normales sin la función de notas en tiempo real. También podrías conseguir un teclado controlador MIDI desde $50 USD para tener la experiencia completa."
  Ejemplos: Teclados de juguete, órganos antiguos, pianos acústicos sin sistema Silent.
- *Piano acústico*: "Para usar nuestra tecnología MIDI con un piano acústico necesitarías un sistema Silent o un teclado controlador aparte. Pero igual puedes tomar clases normales con tu piano."

PASO 4 — COMPUTADOR
- "¿Tienes un computador o tablet para conectarte a las clases? Puede ser PC, Mac, o tablet."
- Si sí: genial, confirmar que tiene todo
- Si no: las clases se pueden tomar desde celular pero la experiencia es mejor en pantalla grande

PASO 5 — NIVEL Y MOTIVACIÓN
- "¿Has tocado piano antes o empezarías desde cero?"
- "¿Qué te motiva a aprender? ¿Hay alguna canción que sueñas con tocar?"
- Esta info es clave para asignar el profesor ideal

PASO 6 — NOMBRE + CIERRE
- Pedir nombre si no lo ha dado: "¿Cómo te llamas?"
- CERRAR LA VENTA con entusiasmo basado en todo lo que sabes:
  "¡[Nombre], con tu [teclado] y tu [computador] estás listo/a! El Kit de Bienvenida está a *$44 USD* e incluye tu cable MIDI de regalo, setup por videollamada, y tu primera clase de prueba con un profesor que se adapta a tu nivel. ¿Te envío el link para comenzar? 🎹"
- Si dice que sí: responder "¡Genial! Aquí tienes el link: https://pianolink.net/kit-bienvenida-v2"
- Si duda por precio: "$44 USD incluye el cable MIDI de regalo (que solo cuesta entre $10-$20), la asesoría personalizada, y tu primera clase. Es menos que una sola clase particular presencial. Y después puedes tomar clases desde $30 USD cada una."
- Si dice que no o "después": "¡Sin problema! Cuando estés listo/a escríbeme. Te guardo tu diagnóstico: [resumen rápido de su setup]. Te dejo el link por si cambias de opinión: https://pianolink.net/kit-bienvenida-v2"

SCORING DEL LEAD (clasificación interna):
- 9-10: Tiene teclado MIDI + PC + motivación clara + quiere comprar → LEAD CALIENTE
- 7-8: Tiene teclado + PC, MIDI no confirmado o necesita cable → LEAD TIBIO-ALTO
- 5-6: Tiene teclado pero no PC, o viceversa → LEAD TIBIO
- 3-4: No tiene teclado, está explorando opciones → LEAD FRÍO
- 1-2: Solo curiosidad, no planea comprar pronto → LEAD MUY FRÍO

REGLAS CRÍTICAS:
- Siempre pide la foto de la parte trasera del teclado. Es tu herramienta de venta más poderosa: muestra que eres experta y genera confianza.
- No dejes la conversación sin intentar cerrar. Si el setup está listo, ofrece el link.
- Si el lead tiene todo listo (score 7+), NO sigas preguntando. Cierra.
- Nunca inventes compatibilidad. Si no estás segura del modelo, dilo y pide más info.
- En cada respuesta, avanza hacia el cierre. No des vueltas.

Cuando tengas TODOS los datos (instrumento + MIDI + computador + nivel + motivación + nombre), emite en una línea separada al final de tu mensaje:

LEAD_DATA:{"nombre":"...","telefono":"...","instrumento":"...","modelo":"...","tipoMidi":"usb|din|none","necesitaCable":true/false,"tieneComputador":true/false,"nivel":"never|beginner|intermediate","motivacion":"...","setupReady":true/false,"score":1-10,"segmento":"caliente|tibio|frio"}

Solo emitir LEAD_DATA cuando tengas TODOS los datos. Nunca antes. El usuario NO ve esta línea.`;

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
