/* models/GlobalConfig.js */
const mongoose = require('mongoose');

const globalConfigSchema = new mongoose.Schema({
    // Usamos un ID fijo o un campo 'active' para asegurar que solo haya una configuración
    isDefault: { type: Boolean, default: true, unique: true },
    
    platformName: { type: String, default: "Piano Link" },
    
    // Identidad Visual
    logoUrl: { type: String, default: "" }, // Logo Principal (Header)
    faviconUrl: { type: String, default: "" }, // Icono de pestaña
    
    // Configuración extra (por si quieres agregar más cosas luego)
    maintenanceMode: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('GlobalConfig', globalConfigSchema);