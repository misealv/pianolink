/**
 * routes/leadRoutes.js
 * API para gestión de leads (profesores interesados)
 */
const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');

/**
 * POST /api/leads
 * Registra un nuevo lead desde la landing page
 */
router.post('/', async (req, res) => {
    try {
        const { name, email, whatsapp, utmSource, utmMedium, utmCampaign } = req.body;
        
        // Validación básica
        if (!name || !email || !whatsapp) {
            return res.status(400).json({
                success: false,
                message: 'Todos los campos son requeridos'
            });
        }
        
        // Verificar si ya existe
        const existingLead = await Lead.findOne({ email: email.toLowerCase() });
        if (existingLead) {
            // Si ya existe, actualizar datos pero no crear duplicado
            existingLead.name = name;
            existingLead.whatsapp = whatsapp;
            await existingLead.save();
            
            console.log(`[Lead] 📧 Lead existente actualizado: ${email}`);
            
            return res.status(200).json({
                success: true,
                message: 'Gracias, Maestro. Ya tenemos tu información registrada.',
                isExisting: true
            });
        }
        
        // Crear nuevo lead
        const lead = await Lead.create({
            name: name.trim(),
            email: email.toLowerCase().trim(),
            whatsapp: whatsapp.trim(),
            source: 'landing',
            utmSource: utmSource || '',
            utmMedium: utmMedium || '',
            utmCampaign: utmCampaign || ''
        });
        
        console.log(`[Lead] ✅ Nuevo lead registrado: ${name} (${email})`);
        
        res.status(201).json({
            success: true,
            message: 'Gracias, Maestro. Te contactaremos pronto para abrir tus puertas en Piano Link.',
            leadId: lead._id
        });
        
    } catch (error) {
        console.error('[Lead] ❌ Error al registrar lead:', error.message);
        
        // Error de validación de Mongoose
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(e => e.message);
            return res.status(400).json({
                success: false,
                message: messages.join('. ')
            });
        }
        
        // Error de duplicado (email único)
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Este email ya está registrado.'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Error interno. Por favor intenta de nuevo.'
        });
    }
});

/**
 * GET /api/leads/stats
 * Obtiene estadísticas de leads (solo admin)
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = await Lead.getStats();
        const total = await Lead.countDocuments();
        const recent = await Lead.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .select('name email status createdAt');
        
        res.json({
            success: true,
            total,
            byStatus: stats,
            recent
        });
    } catch (error) {
        console.error('[Lead] Error obteniendo stats:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

module.exports = router;
