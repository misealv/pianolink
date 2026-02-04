/**
 * DiagnosticAuditService.js - Servicio de Auditoría de Diagnóstico
 * 
 * Maneja la captura de eventos cuando el modo de auditoría está activo.
 * Singleton que se inicializa al arrancar el servidor.
 */

const DiagnosticAudit = require('../models/DiagnosticAudit');
const DiagnosticEvent = require('../models/DiagnosticEvent');
const { v4: uuidv4 } = require('uuid');

class DiagnosticAuditService {
    constructor() {
        // Estado actual
        this._isActive = false;
        this._currentAudit = null;
        this._eventBuffer = [];
        this._bufferFlushInterval = null;
        
        // Métricas en tiempo real
        this._metrics = {
            eventCount: 0,
            uniqueUsers: new Set(),
            uniqueRooms: new Set(),
            latencies: [],
            midiCount: 0,
            errorCount: 0,
            reconnections: 0,
            peakConnections: 0,
            currentConnections: 0
        };
        
        // Configuración
        this._config = {
            bufferSize: 100,           // Flush cada 100 eventos
            bufferFlushMs: 5000,       // O cada 5 segundos
            maxEmbeddedEvents: 10000   // Antes de usar overflow collection
        };
        
        console.log('[DiagnosticAudit] 📊 Servicio inicializado');
        
        // Intentar recuperar auditoría activa al iniciar
        this._recoverActiveAudit();
    }
    
    /**
     * Recupera una auditoría activa si el servidor reinició
     */
    async _recoverActiveAudit() {
        try {
            const activeAudit = await DiagnosticAudit.findOne({ status: 'active' }).sort({ startedAt: -1 });
            
            if (activeAudit) {
                this._currentAudit = activeAudit;
                this._isActive = true;
                this._eventBuffer = [];
                this._resetMetrics();
                
                // Recalcular métricas desde eventos existentes
                if (activeAudit.events && activeAudit.events.length > 0) {
                    this._metrics.eventCount = activeAudit.events.length;
                    activeAudit.events.forEach(e => {
                        if (e.userId) this._metrics.uniqueUsers.add(e.userId);
                        if (e.roomCode) this._metrics.uniqueRooms.add(e.roomCode);
                        if (e.category === 'midi') this._metrics.midiCount++;
                        if (e.category === 'error') this._metrics.errorCount++;
                    });
                }
                
                // Reiniciar flush periódico
                this._bufferFlushInterval = setInterval(() => {
                    this._flushBuffer();
                }, this._config.bufferFlushMs);
                
                // Registrar evento de recuperación
                this.logEvent('system', 'audit_recovered', {
                    auditId: activeAudit.auditId,
                    previousEvents: activeAudit.events?.length || 0,
                    serverRestarted: true
                }, 'warning');
                
                console.log(`[DiagnosticAudit] 🔄 Auditoría recuperada: ${activeAudit.auditId} (${activeAudit.events?.length || 0} eventos previos)`);
            }
        } catch (err) {
            console.error('[DiagnosticAudit] Error recuperando auditoría:', err.message);
        }
    }
    
    /**
     * Verifica si la auditoría está activa
     */
    isActive() {
        return this._isActive;
    }
    
    /**
     * Obtiene la auditoría actual
     */
    getCurrentAudit() {
        return this._currentAudit;
    }
    
    /**
     * Activa el modo de auditoría
     */
    async startAudit(activatedBy, config = {}) {
        if (this._isActive) {
            throw new Error('Ya hay una auditoría activa');
        }
        
        const auditId = `audit_${Date.now()}_${uuidv4().substring(0, 8)}`;
        
        // Crear documento de auditoría
        const audit = new DiagnosticAudit({
            auditId,
            status: 'active',
            activatedBy,
            captureConfig: {
                midi: config.midi !== false,
                connections: config.connections !== false,
                rooms: config.rooms !== false,
                errors: config.errors !== false,
                performance: config.performance !== false,
                network: config.network !== false,
                userActions: config.userActions !== false,
                audio: config.audio !== false
            },
            filters: {
                roomCodes: config.roomCodes || [],
                userIds: config.userIds || [],
                minSeverity: config.minSeverity || 'debug'
            },
            serverSnapshot: {
                nodeVersion: process.version,
                platform: process.platform,
                memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                uptime: Math.round(process.uptime()),
                activeConnections: this._metrics.currentConnections,
                activeRooms: this._metrics.uniqueRooms.size
            }
        });
        
        await audit.save();
        
        this._currentAudit = audit;
        this._isActive = true;
        this._eventBuffer = [];
        this._resetMetrics();
        
        // Iniciar flush periódico
        this._bufferFlushInterval = setInterval(() => {
            this._flushBuffer();
        }, this._config.bufferFlushMs);
        
        console.log(`[DiagnosticAudit] ✅ Auditoría iniciada: ${auditId}`);
        
        // Registrar evento de inicio
        this.logEvent('system', 'audit_started', {
            auditId,
            config: audit.captureConfig
        }, 'info');
        
        return audit;
    }
    
    /**
     * Detiene la auditoría actual
     */
    async stopAudit(notes = '') {
        if (!this._isActive || !this._currentAudit) {
            throw new Error('No hay auditoría activa');
        }
        
        // Registrar evento de fin
        this.logEvent('system', 'audit_stopped', {
            totalEvents: this._metrics.eventCount,
            duration: Math.round((Date.now() - this._currentAudit.startedAt) / 1000)
        }, 'info');
        
        // Flush final del buffer
        await this._flushBuffer();
        
        // Detener flush periódico
        if (this._bufferFlushInterval) {
            clearInterval(this._bufferFlushInterval);
            this._bufferFlushInterval = null;
        }
        
        // Calcular resumen
        const summary = {
            totalEvents: this._metrics.eventCount,
            eventsByCategory: Object.fromEntries(this._countByCategory()),
            eventsBySeverity: Object.fromEntries(this._countBySeverity()),
            uniqueUsers: this._metrics.uniqueUsers.size,
            uniqueRooms: this._metrics.uniqueRooms.size,
            errorCount: this._metrics.errorCount,
            avgLatencyMs: this._calculateAvgLatency(),
            maxLatencyMs: Math.max(...this._metrics.latencies, 0),
            midiMessagesTotal: this._metrics.midiCount,
            midiBytesTotal: this._metrics.midiBytes || 0,
            reconnections: this._metrics.reconnections,
            peakConnections: this._metrics.peakConnections
        };
        
        // Actualizar documento
        const endedAt = new Date();
        await DiagnosticAudit.findOneAndUpdate(
            { auditId: this._currentAudit.auditId },
            {
                status: 'completed',
                endedAt,
                durationSeconds: Math.round((endedAt - this._currentAudit.startedAt) / 1000),
                summary,
                notes
            }
        );
        
        const auditId = this._currentAudit.auditId;
        
        this._isActive = false;
        this._currentAudit = null;
        this._resetMetrics();
        
        console.log(`[DiagnosticAudit] 🛑 Auditoría completada: ${auditId}`);
        
        return { auditId, summary };
    }
    
    /**
     * Registra un evento (método principal)
     */
    logEvent(category, type, data = {}, severity = 'info', meta = {}) {
        if (!this._isActive) return;
        
        const audit = this._currentAudit;
        if (!audit) return;
        
        // Verificar si la categoría está habilitada
        if (!this._shouldCapture(category, severity)) return;
        
        // Verificar filtros
        if (!this._passesFilters(meta.roomCode, meta.userId)) return;
        
        const event = {
            timestamp: new Date(),
            category,
            type,
            data,
            severity,
            userId: meta.userId,
            socketId: meta.socketId,
            roomCode: meta.roomCode,
            latencyMs: meta.latencyMs,
            sizeBytes: meta.sizeBytes
        };
        
        // Agregar al buffer
        this._eventBuffer.push(event);
        
        // Actualizar métricas
        this._updateMetrics(event);
        
        // Flush si el buffer está lleno
        if (this._eventBuffer.length >= this._config.bufferSize) {
            this._flushBuffer();
        }
    }
    
    // =============================================
    // MÉTODOS DE LOGGING ESPECÍFICOS
    // =============================================
    
    /**
     * Log de conexión de socket
     */
    logConnection(type, socketId, data = {}) {
        this.logEvent('connection', type, data, 'info', { socketId });
        
        if (type === 'socket_connect') {
            this._metrics.currentConnections++;
            if (this._metrics.currentConnections > this._metrics.peakConnections) {
                this._metrics.peakConnections = this._metrics.currentConnections;
            }
        } else if (type === 'socket_disconnect') {
            this._metrics.currentConnections = Math.max(0, this._metrics.currentConnections - 1);
        } else if (type === 'socket_reconnect') {
            this._metrics.reconnections++;
        }
    }
    
    /**
     * Log de mensaje MIDI
     */
    logMidi(type, data, meta = {}) {
        this.logEvent('midi', type, data, 'debug', meta);
        this._metrics.midiCount++;
    }
    
    /**
     * Incrementar contador MIDI (ultra-optimizado, solo estadísticas)
     * Usado en el hot path de MIDI para no afectar latencia
     */
    incrementMidiCount(sizeBytes = 0) {
        if (!this._isActive) return;
        this._metrics.midiCount++;
        this._metrics.midiBytes = (this._metrics.midiBytes || 0) + sizeBytes;
    }
    
    /**
     * Log de evento de sala
     */
    logRoom(type, roomCode, data = {}, meta = {}) {
        this.logEvent('room', type, data, 'info', { ...meta, roomCode });
        if (roomCode) this._metrics.uniqueRooms.add(roomCode);
    }
    
    /**
     * Log de error
     */
    logError(type, error, meta = {}) {
        const data = {
            message: error.message || String(error),
            stack: error.stack?.substring(0, 500),
            code: error.code
        };
        this.logEvent('error', type, data, 'error', meta);
        this._metrics.errorCount++;
    }
    
    /**
     * Log de performance/latencia
     */
    logPerformance(type, data = {}, meta = {}) {
        this.logEvent('performance', type, data, 'info', meta);
        if (meta.latencyMs) {
            this._metrics.latencies.push(meta.latencyMs);
        }
    }
    
    /**
     * Log de acción de usuario
     */
    logUserAction(type, userId, data = {}, meta = {}) {
        this.logEvent('user', type, data, 'info', { ...meta, userId });
        if (userId) this._metrics.uniqueUsers.add(userId);
    }
    
    /**
     * Log de red/network
     */
    logNetwork(type, data = {}, meta = {}) {
        this.logEvent('network', type, data, 
            data.packetLoss > 5 ? 'warning' : 'info', 
            meta
        );
    }
    
    /**
     * Log de audio/video
     */
    logAudio(type, data = {}, meta = {}) {
        this.logEvent('audio', type, data, 'info', meta);
    }
    
    // =============================================
    // MÉTODOS PRIVADOS
    // =============================================
    
    _shouldCapture(category, severity) {
        const config = this._currentAudit?.captureConfig;
        if (!config) return false;
        
        // Mapear categoría a config
        const categoryMap = {
            'connection': 'connections',
            'midi': 'midi',
            'room': 'rooms',
            'error': 'errors',
            'performance': 'performance',
            'network': 'network',
            'user': 'userActions',
            'audio': 'audio',
            'system': 'performance' // System events siempre si performance está activo
        };
        
        const configKey = categoryMap[category];
        if (configKey && config[configKey] === false) return false;
        
        // Verificar severidad mínima
        const severityLevels = ['debug', 'info', 'warning', 'error', 'critical'];
        const minLevel = severityLevels.indexOf(this._currentAudit.filters?.minSeverity || 'debug');
        const eventLevel = severityLevels.indexOf(severity);
        
        return eventLevel >= minLevel;
    }
    
    _passesFilters(roomCode, userId) {
        const filters = this._currentAudit?.filters;
        if (!filters) return true;
        
        // Filtro de salas
        if (filters.roomCodes?.length > 0 && roomCode) {
            if (!filters.roomCodes.includes(roomCode)) return false;
        }
        
        // Filtro de usuarios
        if (filters.userIds?.length > 0 && userId) {
            if (!filters.userIds.includes(userId)) return false;
        }
        
        return true;
    }
    
    async _flushBuffer() {
        if (this._eventBuffer.length === 0 || !this._currentAudit) return;
        
        const events = [...this._eventBuffer];
        this._eventBuffer = [];
        
        try {
            const audit = this._currentAudit;
            const currentEventCount = audit.events?.length || 0;
            
            // Decidir si usar embedded o overflow
            if (currentEventCount + events.length > this._config.maxEmbeddedEvents) {
                // Usar colección de overflow
                await DiagnosticEvent.insertMany(
                    events.map(e => ({ ...e, auditId: audit.auditId }))
                );
                
                // Marcar overflow si no estaba marcado
                if (!audit.eventsOverflow) {
                    await DiagnosticAudit.updateOne(
                        { auditId: audit.auditId },
                        { eventsOverflow: true }
                    );
                    audit.eventsOverflow = true;
                }
            } else {
                // Usar array embebido
                await DiagnosticAudit.updateOne(
                    { auditId: audit.auditId },
                    { $push: { events: { $each: events } } }
                );
            }
        } catch (error) {
            console.error('[DiagnosticAudit] Error flushing buffer:', error);
        }
    }
    
    _updateMetrics(event) {
        this._metrics.eventCount++;
        if (event.userId) this._metrics.uniqueUsers.add(event.userId);
        if (event.roomCode) this._metrics.uniqueRooms.add(event.roomCode);
    }
    
    _resetMetrics() {
        this._metrics = {
            eventCount: 0,
            uniqueUsers: new Set(),
            uniqueRooms: new Set(),
            latencies: [],
            midiCount: 0,
            errorCount: 0,
            reconnections: 0,
            peakConnections: this._metrics.peakConnections || 0,
            currentConnections: this._metrics.currentConnections || 0
        };
    }
    
    _countByCategory() {
        const counts = new Map();
        // Se calculará del buffer y eventos guardados
        return counts;
    }
    
    _countBySeverity() {
        const counts = new Map();
        return counts;
    }
    
    _calculateAvgLatency() {
        if (this._metrics.latencies.length === 0) return 0;
        const sum = this._metrics.latencies.reduce((a, b) => a + b, 0);
        return Math.round(sum / this._metrics.latencies.length);
    }
    
    // =============================================
    // MÉTODOS DE CONSULTA
    // =============================================
    
    /**
     * Obtiene historial de auditorías
     */
    async getAuditHistory(limit = 20, skip = 0) {
        return DiagnosticAudit.find()
            .select('-events') // No traer eventos para la lista
            .sort({ startedAt: -1 })
            .limit(limit)
            .skip(skip)
            .lean();
    }
    
    /**
     * Obtiene una auditoría específica con sus eventos
     */
    async getAudit(auditId, includeEvents = true) {
        const audit = await DiagnosticAudit.findOne({ auditId }).lean();
        
        if (!audit) return null;
        
        // Si hay overflow, traer eventos de la colección separada
        if (includeEvents && audit.eventsOverflow) {
            const overflowEvents = await DiagnosticEvent.find({ auditId })
                .sort({ timestamp: 1 })
                .lean();
            audit.events = [...(audit.events || []), ...overflowEvents];
        }
        
        return audit;
    }
    
    /**
     * Obtiene eventos filtrados de una auditoría
     */
    async getAuditEvents(auditId, filters = {}) {
        const { category, severity, roomCode, limit = 1000, skip = 0 } = filters;
        
        const query = { auditId };
        if (category) query.category = category;
        if (severity) query.severity = severity;
        if (roomCode) query.roomCode = roomCode;
        
        // Buscar en ambas colecciones
        const [embedded, overflow] = await Promise.all([
            DiagnosticAudit.findOne({ auditId }).select('events').lean(),
            DiagnosticEvent.find(query).sort({ timestamp: 1 }).limit(limit).skip(skip).lean()
        ]);
        
        let events = [...(overflow || [])];
        
        // Filtrar eventos embebidos si aplica
        if (embedded?.events) {
            const filtered = embedded.events.filter(e => {
                if (category && e.category !== category) return false;
                if (severity && e.severity !== severity) return false;
                if (roomCode && e.roomCode !== roomCode) return false;
                return true;
            });
            events = [...filtered, ...events];
        }
        
        // Ordenar por timestamp
        events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        return events.slice(skip, skip + limit);
    }
    
    /**
     * Archiva una auditoría
     */
    async archiveAudit(auditId) {
        return DiagnosticAudit.findOneAndUpdate(
            { auditId },
            { status: 'archived' },
            { new: true }
        );
    }
    
    /**
     * Elimina una auditoría y sus eventos
     */
    async deleteAudit(auditId) {
        await Promise.all([
            DiagnosticAudit.deleteOne({ auditId }),
            DiagnosticEvent.deleteMany({ auditId })
        ]);
        return { deleted: true, auditId };
    }
    
    /**
     * Obtiene estadísticas de la auditoría actual
     */
    getCurrentStats() {
        if (!this._isActive) return null;
        
        return {
            auditId: this._currentAudit?.auditId,
            isActive: true,
            startedAt: this._currentAudit?.startedAt,
            durationSeconds: Math.round((Date.now() - this._currentAudit?.startedAt) / 1000),
            eventCount: this._metrics.eventCount,
            uniqueUsers: this._metrics.uniqueUsers.size,
            uniqueRooms: this._metrics.uniqueRooms.size,
            midiCount: this._metrics.midiCount,
            errorCount: this._metrics.errorCount,
            reconnections: this._metrics.reconnections,
            peakConnections: this._metrics.peakConnections,
            avgLatency: this._calculateAvgLatency(),
            bufferSize: this._eventBuffer.length
        };
    }
}

// Singleton
const instance = new DiagnosticAuditService();

module.exports = instance;
