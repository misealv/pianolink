/**
 * services/GeoIPService.js
 * Servicio reutilizable para detección de país por IP.
 * 
 * Extraído de welcomeKitRoutes.js (línea 105).
 * Usado por: registro de teachers, checkout early bird, auto-detección de país,
 * PaymentProviderResolver.
 * 
 * Usa ip-api.com (servicio gratuito, rate-limited a 45 req/min).
 */

class GeoIPService {

    // Cache en memoria para evitar llamadas repetidas
    static _cache = new Map();
    static _cacheTTL = 10 * 60 * 1000; // 10 minutos

    // Países soportados por MercadoPago
    static MP_COUNTRIES = ['CL', 'MX', 'AR', 'CO', 'BR', 'PE', 'UY'];

    /**
     * Detectar país por IP
     * @param {string} ip - Dirección IP del cliente
     * @returns {string} Código ISO del país (ej: 'CL', 'MX') o 'DEFAULT'
     */
    static async detectCountryByIP(ip) {
        try {
            // Limpiar IP (remover prefijo IPv6-mapped IPv4)
            const cleanIP = this._cleanIP(ip);

            // IPs locales → default de desarrollo
            if (this._isLocalIP(cleanIP)) {
                return 'CL';
            }

            // Verificar cache
            const cached = this._cache.get(cleanIP);
            if (cached && cached.expiresAt > Date.now()) {
                return cached.countryCode;
            }

            // Consultar servicio externo
            const response = await fetch(`http://ip-api.com/json/${cleanIP}?fields=countryCode,status`, {
                signal: AbortSignal.timeout(3000) // Timeout de 3 segundos
            });

            if (!response.ok) {
                console.warn(`[GeoIPService] Respuesta no-OK de ip-api: ${response.status}`);
                return 'DEFAULT';
            }

            const data = await response.json();

            if (data.status === 'fail') {
                console.warn(`[GeoIPService] ip-api falló para IP ${cleanIP}`);
                return 'DEFAULT';
            }

            const countryCode = data.countryCode || 'DEFAULT';

            // Guardar en cache
            this._cache.set(cleanIP, {
                countryCode,
                expiresAt: Date.now() + this._cacheTTL
            });

            return countryCode;
        } catch (error) {
            console.error('[GeoIPService] Error detectando país:', error.message);
            return 'DEFAULT';
        }
    }

    /**
     * Detectar si un país tiene MercadoPago disponible
     * @param {string} countryCode
     * @returns {boolean}
     */
    static isMpCountry(countryCode) {
        return this.MP_COUNTRIES.includes(countryCode?.toUpperCase());
    }

    /**
     * Obtener IP real del request (behind proxies)
     * @param {Object} req - Express request
     * @returns {string}
     */
    static getClientIP(req) {
        const forwarded = req.headers['x-forwarded-for'];
        if (forwarded) {
            // Tomar la primera IP (la del cliente original)
            return forwarded.split(',')[0].trim();
        }
        return req.ip || req.connection?.remoteAddress || '127.0.0.1';
    }

    /**
     * Detectar país desde un request de Express
     * @param {Object} req - Express request
     * @returns {string} Código ISO del país
     */
    static async detectFromRequest(req) {
        const ip = this.getClientIP(req);
        return await this.detectCountryByIP(ip);
    }

    // ==================== HELPERS PRIVADOS ====================

    /**
     * Limpiar IP (remover prefijo ::ffff: de IPv6-mapped IPv4)
     */
    static _cleanIP(ip) {
        if (!ip) return '127.0.0.1';
        if (ip.startsWith('::ffff:')) {
            return ip.replace('::ffff:', '');
        }
        return ip;
    }

    /**
     * Verificar si es IP local/desarrollo
     */
    static _isLocalIP(ip) {
        return ip === '127.0.0.1' 
            || ip === '::1' 
            || ip === 'localhost'
            || ip.startsWith('192.168.')
            || ip.startsWith('10.')
            || ip.startsWith('172.16.');
    }

    /**
     * Limpiar cache de entradas expiradas
     */
    static cleanExpiredCache() {
        const now = Date.now();
        for (const [key, value] of this._cache.entries()) {
            if (value.expiresAt <= now) {
                this._cache.delete(key);
            }
        }
    }
}

module.exports = GeoIPService;
