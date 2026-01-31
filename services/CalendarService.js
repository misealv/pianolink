/**
 * services/CalendarService.js
 * Integración con Google Calendar para programar demos
 * 
 * CONFIGURACIÓN REQUERIDA:
 * 1. Crear proyecto en Google Cloud Console
 * 2. Habilitar Google Calendar API
 * 3. Crear credenciales OAuth 2.0
 * 4. Agregar variables de entorno en .env:
 *    - GOOGLE_CALENDAR_CLIENT_ID
 *    - GOOGLE_CALENDAR_CLIENT_SECRET
 *    - GOOGLE_CALENDAR_REDIRECT_URI
 *    - GOOGLE_CALENDAR_REFRESH_TOKEN
 */

const { google } = require('googleapis');

class CalendarService {
    constructor() {
        this.oauth2Client = null;
        this.calendar = null;
        this.isConfigured = false;
        
        // Intentar inicializar si hay credenciales
        this.initialize();
    }
    
    /**
     * Inicializa el cliente de Google Calendar
     */
    initialize() {
        try {
            const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
            const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
            const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;
            const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
            
            if (!clientId || !clientSecret || !redirectUri || !refreshToken) {
                console.warn('[Calendar] ⚠️ Credenciales de Google Calendar no configuradas');
                console.warn('[Calendar] ℹ️ Las demos se crearán sin integración con Calendar');
                return;
            }
            
            // Crear cliente OAuth2
            this.oauth2Client = new google.auth.OAuth2(
                clientId,
                clientSecret,
                redirectUri
            );
            
            // Establecer refresh token
            this.oauth2Client.setCredentials({
                refresh_token: refreshToken
            });
            
            // Crear cliente de Calendar
            this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
            
            this.isConfigured = true;
            console.log('[Calendar] ✅ Google Calendar configurado correctamente');
            
        } catch (error) {
            console.error('[Calendar] ❌ Error inicializando Google Calendar:', error.message);
            this.isConfigured = false;
        }
    }
    
    /**
     * Crea un evento en Google Calendar
     * @param {Object} eventData - Datos del evento
     * @returns {Promise<Object>} Evento creado
     */
    async createEvent(eventData) {
        if (!this.isConfigured) {
            console.warn('[Calendar] ⚠️ Google Calendar no configurado - evento no creado');
            return { id: null, link: null };
        }
        
        try {
            const {
                summary,
                description,
                startDateTime,
                endDateTime,
                attendeeEmail,
                attendeeName
            } = eventData;
            
            // Crear evento
            const event = {
                summary: summary || 'Demo Piano Link',
                description: description || 'Demostración de Piano Link para profesor interesado',
                start: {
                    dateTime: startDateTime,
                    timeZone: 'America/Santiago' // Ajustar según tu zona horaria
                },
                end: {
                    dateTime: endDateTime,
                    timeZone: 'America/Santiago'
                },
                attendees: [
                    { 
                        email: attendeeEmail,
                        displayName: attendeeName
                    }
                ],
                conferenceData: {
                    createRequest: {
                        requestId: `demo-${Date.now()}`,
                        conferenceSolutionKey: {
                            type: 'hangoutsMeet' // Genera link de Google Meet automáticamente
                        }
                    }
                },
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'email', minutes: 24 * 60 }, // 1 día antes
                        { method: 'popup', minutes: 30 }
                    ]
                }
            };
            
            const response = await this.calendar.events.insert({
                calendarId: 'primary',
                resource: event,
                conferenceDataVersion: 1,
                sendUpdates: 'all' // Enviar invitación por email
            });
            
            console.log(`[Calendar] ✅ Evento creado: ${response.data.id}`);
            
            return {
                id: response.data.id,
                link: response.data.hangoutLink || response.data.htmlLink,
                meetingLink: response.data.hangoutLink
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
     * @returns {string} URL de autorización
     */
    getAuthUrl() {
        if (!this.oauth2Client) {
            const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
            const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
            const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;
            
            this.oauth2Client = new google.auth.OAuth2(
                clientId,
                clientSecret,
                redirectUri
            );
        }
        
        const scopes = [
            'https://www.googleapis.com/auth/calendar.events'
        ];
        
        const url = this.oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            prompt: 'consent'
        });
        
        return url;
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
            console.log('[Calendar] ℹ️ Agrega esto a tu .env como GOOGLE_CALENDAR_REFRESH_TOKEN');
            
            return tokens;
        } catch (error) {
            console.error('[Calendar] ❌ Error obteniendo tokens:', error.message);
            throw error;
        }
    }
}

// Exportar instancia única (singleton)
module.exports = new CalendarService();
