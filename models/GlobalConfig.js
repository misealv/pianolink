/* models/GlobalConfig.js */
const mongoose = require('mongoose');

const globalConfigSchema = new mongoose.Schema({
    // Usamos un ID fijo o un campo 'active' para asegurar que solo haya una configuración
    isDefault: { type: Boolean, default: true, unique: true },
    
    platformName: { type: String, default: "Piano Link" },
    
    // Identidad Visual
    logoUrl: { type: String, default: "" }, // Logo Principal (Header)
    faviconUrl: { type: String, default: "" }, // Icono de pestaña
    
    // Tracking Pixels (Facebook Pixel & Google Analytics)
    trackingScripts: {
        facebookPixel: { type: String, default: "" }, // Script completo de Facebook Pixel
        googleAnalytics: { type: String, default: "" } // Script completo de Google Analytics
    },
    
    // Google Calendar API (Para programar demos automáticamente)
    googleCalendar: {
        clientId: { type: String, default: "" },
        clientSecret: { type: String, default: "" },
        redirectUri: { type: String, default: "https://pianolink.onrender.com/api/calendar/oauth2callback" },
        refreshToken: { type: String, default: "" }
    },
    
    // Configuración extra (por si quieres agregar más cosas luego)
    maintenanceMode: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('GlobalConfig', globalConfigSchema);