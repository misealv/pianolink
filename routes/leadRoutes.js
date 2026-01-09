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
        const { name, email, whatsapp, background, utmSource, utmMedium, utmCampaign } = req.body;
        
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
            background: background ? background.trim() : '',
            source: 'landing',
            utmSource: utmSource || '',
            utmMedium: utmMedium || '',
            utmCampaign: utmCampaign || ''
        });
        
        console.log(`[Lead] ✅ Nuevo lead registrado: ${name} (${email})`);
        
        res.status(201).json({
            success: true,
            message: 'Postulación recibida. Revisaremos tu perfil y te contactaremos en 48 horas.',
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

/**
 * GET /api/leads/export
 * Exporta todos los leads con stats para Excel/CSV
 */
router.get('/export', async (req, res) => {
    try {
        // Obtener estadísticas
        const statsData = await Lead.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        const stats = {
            new: 0,
            contacted: 0,
            qualified: 0,
            converted: 0,
            rejected: 0
        };

        statsData.forEach(stat => {
            stats[stat._id] = stat.count;
        });

        // Obtener todos los leads
        const leads = await Lead.find()
            .select('name email whatsapp background status source utmSource utmMedium utmCampaign notes createdAt contactedAt convertedAt')
            .sort({ createdAt: -1 })
            .lean();

        console.log(`[Lead] 📊 Exportando ${leads.length} leads`);

        res.json({
            success: true,
            stats,
            leads,
            total: leads.length
        });

    } catch (error) {
        console.error('[Lead] Error exportando leads:', error);
        res.status(500).json({ success: false, message: 'Error al exportar' });
    }
});

/**
 * PATCH /api/leads/:id/notes
 * Actualiza las notas de un lead
 */
router.patch('/:id/notes', async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;

        const lead = await Lead.findById(id);
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Lead no encontrado'
            });
        }

        lead.notes = notes;
        await lead.save();

        console.log(`[Lead] 📝 Notas actualizadas: ${lead.email}`);

        res.json({
            success: true,
            message: 'Notas actualizadas',
            lead
        });

    } catch (error) {
        console.error('[Lead] Error actualizando notas:', error);
        res.status(500).json({ success: false, message: 'Error al actualizar' });
    }
});

/**
 * PATCH /api/leads/:id/status
 * Actualiza el estado de un lead
 */
router.patch('/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = ['new', 'contacted', 'qualified', 'converted', 'rejected'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Estado inválido'
            });
        }

        const lead = await Lead.findById(id);
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Lead no encontrado'
            });
        }

        // Actualizar timestamps según estado
        if (status === 'contacted' && !lead.contactedAt) {
            lead.contactedAt = new Date();
        }
        if (status === 'converted' && !lead.convertedAt) {
            lead.convertedAt = new Date();
        }

        lead.status = status;
        await lead.save();

        console.log(`[Lead] ✅ ${lead.email} → ${status}`);

        res.json({
            success: true,
            message: 'Estado actualizado',
            lead
        });

    } catch (error) {
        console.error('[Lead] Error actualizando estado:', error);
        res.status(500).json({ success: false, message: 'Error al actualizar' });
    }
});

module.exports = router;
