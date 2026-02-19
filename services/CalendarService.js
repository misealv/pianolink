/**
 * services/CalendarService.js
 * Integración con Google Calendar para programar demos
 * 
 * CONFIGURACIÓN REQUERIDA:
 * 1. Crear proyecto en Google Cloud Console
 * 2. Habilitar Google Calendar API
 * 3. Crear credenciales OAuth 2.0
 * 4. Configurar desde Admin Panel → Integración Calendar
 */

// 🔒 LAZY LOADING: googleapis consume ~60MB, solo cargar cuando se necesite
let google = null;
function getGoogleApis() {
    if (!google) {
        console.log('[CalendarService] 📦 Cargando googleapis bajo demanda...');
        google = require('googleapis').google;
    }
    return google;
}

class CalendarService {
    constructor() {
        this.oauth2Client = null;
        this.calendar = null;
        this.isConfigured = false;
        
        // Almacenar promesa para await en createEvent
        this._initPromise = this.initialize();
    }
    
    /**
     * Inicializa el cliente de Google Calendar
     * Primero intenta cargar desde BD, luego desde .env (fallback)
     */
    async initialize() {
        try {
            // Intentar cargar desde base de datos
            const GlobalConfig = require('../models/GlobalConfig');
            const config = await GlobalConfig.findOne({ isDefault: true });
            
            let clientId, clientSecret, redirectUri, refreshToken;
            
            if (config && config.googleCalendar) {
                clientId = config.googleCalendar.clientId;
                clientSecret = config.googleCalendar.clientSecret;
                redirectUri = config.googleCalendar.redirectUri;
                refreshToken = config.googleCalendar.refreshToken;
            }
            
            // Fallback a variables de entorno si no hay en BD
            if (!clientId || !clientSecret || !refreshToken) {
                clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
                clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
                redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;
                refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
            }
            
            if (!clientId || !clientSecret || !redirectUri || !refreshToken) {
                console.warn('[Calendar] ⚠️ Credenciales de Google Calendar no configuradas');
                console.warn('[Calendar] ℹ️ Las demos se crearán sin integración con Calendar');
                return;
            }
            
            // Crear cliente OAuth2 (lazy load googleapis)
            const googleApi = getGoogleApis();
            this.oauth2Client = new googleApi.auth.OAuth2(
                clientId,
                clientSecret,
                redirectUri
            );
            
            // Establecer refresh token
            this.oauth2Client.setCredentials({
                refresh_token: refreshToken
            });
            
            // Crear cliente de Calendar
            this.calendar = googleApi.calendar({ version: 'v3', auth: this.oauth2Client });
            
            this.isConfigured = true;
            console.log('[Calendar] ✅ Google Calendar configurado correctamente');
            
        } catch (error) {
            console.error('[Calendar] ❌ Error inicializando Google Calendar:', error.message);
            this.isConfigured = false;
        }
    }
    
    /**
     * Formatea fecha en español para mensaje de bienvenida
     */
    formatSpanishDate(date) {
        const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
        const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        
        const d = new Date(date);
        const dayName = days[d.getDay()];
        const day = d.getDate();
        const month = months[d.getMonth()];
        const hours = d.getHours().toString().padStart(2, '0');
        const minutes = d.getMinutes().toString().padStart(2, '0');
        
        return `${dayName} ${day} de ${month} a las ${hours}:${minutes}`;
    }
    
    /**
     * Genera mensaje personalizado para la invitación del demo
     */
    generateDemoMessage(leadName, demoDate, duration) {
        const fecha = this.formatSpanishDate(demoDate);
        const whatsapp = '+56959089770';
        
        return `🎹 Entrevista PianoLink

Hola ${leadName},

Gracias por tu interés en ser profesor en PianoLink. Te invito a una breve entrevista para conocernos, resolver tus dudas y mostrarte cómo funciona la plataforma.

📅 Fecha: ${fecha}
⏱️ Duración: ${duration} minutos
📍 Lugar: Google Meet (el link está en esta invitación de Calendar)

📋 ¿Qué veremos en la entrevista?

1. Conversaremos sobre tu experiencia como profesor de piano
2. Te mostraré cómo funciona PianoLink (tecnología MIDI, agenda, pagos)
3. Resolveremos todas tus dudas
4. Si te interesa, activamos tu cuenta en el momento

💡 Tips para la reunión:

• Conéctate desde un lugar tranquilo con buena conexión
• Usa Chrome o Edge para mejor experiencia
• Si tienes un piano con MIDI, tenlo cerca (opcional para el demo)

📱 Si necesitas reagendar, escríbeme al WhatsApp: ${whatsapp}

¡Nos vemos pronto!

Miguel Antonio
Fundador, PianoLink
`;
    }
    
    /**
     * Retorna URL de la sala de demos de PianoLink
     */
    getPianoLinkRoomUrl() {
        return 'https://pianolink.onrender.com/?role=student&sala=profesor-demo';
    }
    
    /**
     * Crea un evento en Google Calendar
     * @param {Object} eventData - Datos del evento
     * @returns {Promise<Object>} Evento creado
     */
    async createEvent(eventData) {
        // Esperar a que la inicialización termine antes de verificar isConfigured
        if (this._initPromise) {
            await this._initPromise;
        }
        
        if (!this.isConfigured) {
            console.warn('[Calendar] ⚠️ Google Calendar no configurado - evento no creado');
            return { id: null, link: null };
        }
        
        try {
            const {
                summary,
                startDateTime,
                endDateTime,
                attendeeEmail,
                attendeeName,
                teacherEmail,
                duration = 60,
                timezone = 'America/Santiago' // Zona horaria del invitado principal
            } = eventData;
            
            // Generar mensaje personalizado
            const customDescription = this.generateDemoMessage(
                attendeeName,
                startDateTime,
                duration
            );
            
            // Preparar lista de asistentes (lead + profesor)
            const attendees = [
                { 
                    email: attendeeEmail,
                    displayName: attendeeName
                }
            ];
            
            // Agregar profesor si hay email configurado
            if (teacherEmail) {
                attendees.push({
                    email: teacherEmail,
                    displayName: 'Profesor PianoLink'
                });
            }
            
            // Crear evento CON Google Meet automático
            const event = {
                summary: summary || `Demo PianoLink - ${attendeeName}`,
                description: customDescription,
                start: {
                    dateTime: startDateTime,
                    timeZone: timezone
                },
                end: {
                    dateTime: endDateTime,
                    timeZone: timezone
                },
                attendees: attendees,
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'email', minutes: 24 * 60 },  // 1 día antes
                        { method: 'popup', minutes: 60 },       // 1 hora antes
                        { method: 'popup', minutes: 10 }        // 10 minutos antes
                    ]
                },
                // Crear Google Meet automáticamente
                conferenceData: {
                    createRequest: {
                        requestId: `pianolink-${Date.now()}`,
                        conferenceSolutionKey: { type: 'hangoutsMeet' }
                    }
                }
            };
            
            const response = await this.calendar.events.insert({
                calendarId: 'primary',
                resource: event,
                sendUpdates: 'all',
                conferenceDataVersion: 1 // Requerido para crear Meet
            });
            
            // Extraer link de Meet del evento creado
            const meetLink = response.data.conferenceData?.entryPoints?.find(
                ep => ep.entryPointType === 'video'
            )?.uri || response.data.hangoutLink || '';
            
            console.log(`[Calendar] ✅ Evento creado: ${response.data.id}`);
            console.log(`[Calendar] 📧 Invitaciones enviadas a: ${attendees.map(a => a.email).join(', ')}`);
            if (meetLink) console.log(`[Calendar] 🎥 Meet: ${meetLink}`);
            
            return {
                id: response.data.id,
                link: response.data.htmlLink,
                meetingLink: meetLink || this.getPianoLinkRoomUrl()
            };
            
        } catch (error) {
            console.error('[Calendar] ❌ Error creando evento:', error.message);
            throw error;
        }
    }
    
    /**
     * Actualiza un evento existente
     * @param {string} eventId - ID del evento
     * @param {Object} updates - Datos a actualizar
     * @returns {Promise<Object>} Evento actualizado
     */
    async updateEvent(eventId, updates) {
        if (this._initPromise) await this._initPromise;
        if (!this.isConfigured) {
            console.warn('[Calendar] ⚠️ Google Calendar no configurado');
            return null;
        }
        
        try {
            // Obtener evento actual
            const event = await this.calendar.events.get({
                calendarId: 'primary',
                eventId: eventId
            });
            
            // Actualizar campos
            const updatedEvent = {
                ...event.data,
                ...updates
            };
            
            const response = await this.calendar.events.update({
                calendarId: 'primary',
                eventId: eventId,
                resource: updatedEvent,
                sendUpdates: 'all'
            });
            
            console.log(`[Calendar] ✅ Evento actualizado: ${eventId}`);
            
            return response.data;
            
        } catch (error) {
            console.error('[Calendar] ❌ Error actualizando evento:', error.message);
            throw error;
        }
    }
    
    /**
     * Cancela (elimina) un evento
     * @param {string} eventId - ID del evento
     * @returns {Promise<boolean>} Éxito
     */
    async cancelEvent(eventId) {
        if (this._initPromise) await this._initPromise;
        if (!this.isConfigured) {
            console.warn('[Calendar] ⚠️ Google Calendar no configurado');
            return false;
        }
        
        try {
            await this.calendar.events.delete({
                calendarId: 'primary',
                eventId: eventId,
                sendUpdates: 'all' // Notificar a asistentes
            });
            
            console.log(`[Calendar] ✅ Evento cancelado: ${eventId}`);
            
            return true;
            
        } catch (error) {
            console.error('[Calendar] ❌ Error cancelando evento:', error.message);
            throw error;
        }
    }
    
    /**
     * Obtiene la URL de autorización (para setup inicial)
     * @returns {Promise<string>} URL de autorización
     */
    async getAuthUrl() {
        try {
            let clientId, clientSecret, redirectUri;
            
            // Intentar cargar desde base de datos primero
            const GlobalConfig = require('../models/GlobalConfig');
            const config = await GlobalConfig.findOne({ isDefault: true });
            
            if (config && config.googleCalendar) {
                clientId = config.googleCalendar.clientId;
                clientSecret = config.googleCalendar.clientSecret;
                redirectUri = config.googleCalendar.redirectUri;
            }
            
            // Fallback a variables de entorno
            if (!clientId) clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
            if (!clientSecret) clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
            if (!redirectUri) redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;
            
            if (!clientId || !clientSecret || !redirectUri) {
                throw new Error('Credenciales de Google Calendar no configuradas. Por favor configúralas en el Admin Panel → Integración Calendar antes de autorizar.');
            }
            
            // Crear o actualizar cliente OAuth2 (lazy load googleapis)
            const googleApi = getGoogleApis();
            this.oauth2Client = new googleApi.auth.OAuth2(
                clientId,
                clientSecret,
                redirectUri
            );
            
            const scopes = [
                'https://www.googleapis.com/auth/calendar.events'
            ];
            
            const url = this.oauth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: scopes,
                prompt: 'consent'
            });
            
            return url;
        } catch (error) {
            console.error('[Calendar] ❌ Error generando URL de autorización:', error.message);
            throw error;
        }
    }
    
    /**
     * Obtiene tokens desde el código de autorización
     * @param {string} code - Código de autorización
     * @returns {Promise<Object>} Tokens
     */
    async getTokensFromCode(code) {
        try {
            const { tokens } = await this.oauth2Client.getToken(code);
            console.log('[Calendar] 🔑 Refresh Token:', tokens.refresh_token);
            console.log('[Calendar] ℹ️ Guarda esto en Admin Panel → Integración Calendar');
            
            return tokens;
        } catch (error) {
            console.error('[Calendar] ❌ Error obteniendo tokens:', error.message);
            throw error;
        }
    }
    
    /**
     * Prueba la conexión con Google Calendar
     * @returns {Promise<Object>} Resultado del test
     */
    async testConnection() {
        if (this._initPromise) await this._initPromise;
        if (!this.isConfigured) {
            throw new Error('Calendar no está configurado');
        }
        
        try {
            // Intentar listar calendarios como test
            const response = await this.calendar.calendarList.list({
                maxResults: 1
            });
            
            return {
                calendarsFound: response.data.items?.length || 0,
                primaryCalendar: response.data.items?.[0]?.summary || 'Calendar principal'
            };
        } catch (error) {
            throw new Error(`Error de conexión: ${error.message}`);
        }
    }
    
    /**
     * Reinicializa el servicio con nuevas credenciales
     * Usado cuando se actualizan las credenciales desde el admin panel
     */
    async reinitialize() {
        console.log('[Calendar] 🔄 Reinicializando con nuevas credenciales...');
        await this.initialize();
        return this.isConfigured;
    }
}

// Exportar la clase (no instancia) para poder reinicializar
const instance = new CalendarService();
module.exports = instance;
module.exports.CalendarService = CalendarService;
