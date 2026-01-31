/**
 * utils/timezoneHelper.js
 * Mapeo de países a zonas horarias para programación correcta de demos
 */

const COUNTRY_TIMEZONE_MAP = {
    // América del Sur
    'Chile': 'America/Santiago',              // GMT-3
    'Argentina': 'America/Argentina/Buenos_Aires', // GMT-3
    'Uruguay': 'America/Montevideo',          // GMT-3
    'Brasil': 'America/Sao_Paulo',            // GMT-3
    'Peru': 'America/Lima',                   // GMT-5
    'Colombia': 'America/Bogota',             // GMT-5
    'Ecuador': 'America/Guayaquil',           // GMT-5
    'Venezuela': 'America/Caracas',           // GMT-4
    'Bolivia': 'America/La_Paz',              // GMT-4
    'Paraguay': 'America/Asuncion',           // GMT-4
    
    // América Central y Caribe
    'Mexico': 'America/Mexico_City',          // GMT-6
    'Costa Rica': 'America/Costa_Rica',       // GMT-6
    'Panama': 'America/Panama',               // GMT-5
    'Guatemala': 'America/Guatemala',         // GMT-6
    'Honduras': 'America/Tegucigalpa',        // GMT-6
    'El Salvador': 'America/El_Salvador',     // GMT-6
    'Nicaragua': 'America/Managua',           // GMT-6
    'Cuba': 'America/Havana',                 // GMT-5
    'República Dominicana': 'America/Santo_Domingo', // GMT-4
    'Puerto Rico': 'America/Puerto_Rico',     // GMT-4
    
    // América del Norte
    'Estados Unidos': 'America/New_York',     // GMT-5 (Este)
    'USA': 'America/New_York',
    'EEUU': 'America/New_York',
    'Canadá': 'America/Toronto',              // GMT-5 (Este)
    'Canada': 'America/Toronto',
    
    // Europa (países hispanohablantes)
    'España': 'Europe/Madrid',                // GMT+1
    'Spain': 'Europe/Madrid',
    
    // Default
    'Default': 'America/Santiago'             // GMT-3 (Chile)
};

/**
 * Obtiene la zona horaria IANA basada en el país
 * @param {string} country - Nombre del país
 * @returns {string} Zona horaria IANA (ej: America/Mexico_City)
 */
function getTimezoneByCountry(country) {
    if (!country) {
        return COUNTRY_TIMEZONE_MAP['Default'];
    }
    
    // Buscar coincidencia exacta (case-insensitive)
    const normalizedCountry = country.trim();
    const timezone = COUNTRY_TIMEZONE_MAP[normalizedCountry] || 
                     COUNTRY_TIMEZONE_MAP[normalizedCountry.toLowerCase()] ||
                     COUNTRY_TIMEZONE_MAP[normalizedCountry.charAt(0).toUpperCase() + normalizedCountry.slice(1).toLowerCase()];
    
    return timezone || COUNTRY_TIMEZONE_MAP['Default'];
}

/**
 * Detecta país desde código de teléfono WhatsApp
 * @param {string} whatsapp - Número de WhatsApp con código de país
 * @returns {object} { country, timezone }
 */
function detectCountryFromPhone(whatsapp) {
    if (!whatsapp) {
        return { country: '', timezone: COUNTRY_TIMEZONE_MAP['Default'] };
    }
    
    // Limpiar número
    const cleanPhone = whatsapp.replace(/[\s\-\(\)]/g, '');
    
    // Mapeo de códigos de país
    const phoneCountryMap = {
        '+56': { country: 'Chile', timezone: 'America/Santiago' },
        '+54': { country: 'Argentina', timezone: 'America/Argentina/Buenos_Aires' },
        '+598': { country: 'Uruguay', timezone: 'America/Montevideo' },
        '+55': { country: 'Brasil', timezone: 'America/Sao_Paulo' },
        '+51': { country: 'Peru', timezone: 'America/Lima' },
        '+57': { country: 'Colombia', timezone: 'America/Bogota' },
        '+593': { country: 'Ecuador', timezone: 'America/Guayaquil' },
        '+58': { country: 'Venezuela', timezone: 'America/Caracas' },
        '+591': { country: 'Bolivia', timezone: 'America/La_Paz' },
        '+595': { country: 'Paraguay', timezone: 'America/Asuncion' },
        '+52': { country: 'Mexico', timezone: 'America/Mexico_City' },
        '+506': { country: 'Costa Rica', timezone: 'America/Costa_Rica' },
        '+507': { country: 'Panama', timezone: 'America/Panama' },
        '+502': { country: 'Guatemala', timezone: 'America/Guatemala' },
        '+504': { country: 'Honduras', timezone: 'America/Tegucigalpa' },
        '+503': { country: 'El Salvador', timezone: 'America/El_Salvador' },
        '+505': { country: 'Nicaragua', timezone: 'America/Managua' },
        '+53': { country: 'Cuba', timezone: 'America/Havana' },
        '+1': { country: 'Estados Unidos', timezone: 'America/New_York' },
        '+34': { country: 'España', timezone: 'Europe/Madrid' },
    };
    
    // Buscar coincidencia de código (más largo primero)
    const sortedCodes = Object.keys(phoneCountryMap).sort((a, b) => b.length - a.length);
    
    for (const code of sortedCodes) {
        if (cleanPhone.startsWith(code)) {
            return phoneCountryMap[code];
        }
    }
    
    return { country: '', timezone: COUNTRY_TIMEZONE_MAP['Default'] };
}

/**
 * Lista de todas las zonas horarias disponibles para Latinoamérica
 * @returns {Array<{value: string, label: string, offset: string}>}
 */
function getAvailableTimezones() {
    return [
        { value: 'America/Santiago', label: 'Chile (Santiago)', offset: 'GMT-3' },
        { value: 'America/Argentina/Buenos_Aires', label: 'Argentina (Buenos Aires)', offset: 'GMT-3' },
        { value: 'America/Montevideo', label: 'Uruguay (Montevideo)', offset: 'GMT-3' },
        { value: 'America/Sao_Paulo', label: 'Brasil (São Paulo)', offset: 'GMT-3' },
        { value: 'America/Lima', label: 'Perú (Lima)', offset: 'GMT-5' },
        { value: 'America/Bogota', label: 'Colombia (Bogotá)', offset: 'GMT-5' },
        { value: 'America/Guayaquil', label: 'Ecuador (Guayaquil)', offset: 'GMT-5' },
        { value: 'America/Caracas', label: 'Venezuela (Caracas)', offset: 'GMT-4' },
        { value: 'America/La_Paz', label: 'Bolivia (La Paz)', offset: 'GMT-4' },
        { value: 'America/Asuncion', label: 'Paraguay (Asunción)', offset: 'GMT-4' },
        { value: 'America/Mexico_City', label: 'México (Ciudad de México)', offset: 'GMT-6' },
        { value: 'America/Cancun', label: 'México (Cancún)', offset: 'GMT-5' },
        { value: 'America/Costa_Rica', label: 'Costa Rica', offset: 'GMT-6' },
        { value: 'America/Panama', label: 'Panamá', offset: 'GMT-5' },
        { value: 'America/Guatemala', label: 'Guatemala', offset: 'GMT-6' },
        { value: 'America/Havana', label: 'Cuba (La Habana)', offset: 'GMT-5' },
        { value: 'America/Santo_Domingo', label: 'República Dominicana', offset: 'GMT-4' },
        { value: 'America/New_York', label: 'Estados Unidos (Este)', offset: 'GMT-5' },
        { value: 'America/Chicago', label: 'Estados Unidos (Centro)', offset: 'GMT-6' },
        { value: 'America/Denver', label: 'Estados Unidos (Montaña)', offset: 'GMT-7' },
        { value: 'America/Los_Angeles', label: 'Estados Unidos (Pacífico)', offset: 'GMT-8' },
        { value: 'Europe/Madrid', label: 'España (Madrid)', offset: 'GMT+1' },
    ];
}

module.exports = {
    getTimezoneByCountry,
    detectCountryFromPhone,
    getAvailableTimezones,
    COUNTRY_TIMEZONE_MAP
};
