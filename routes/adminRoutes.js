const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const Feedback = require('../models/Feedback'); // Importante para leer mensajes
const Message = require('../models/Message');
const GlobalConfig = require('../models/GlobalConfig');
/* -------------------------------------------------------------------------- */
/* RUTAS DE USUARIOS                            */
/* -------------------------------------------------------------------------- */

// Cambiar estado de "Profesor Fundador" (Toggle)
// Ruta: POST /admin/users/:id/toggle-founder
router.post('/users/:id/toggle-founder', adminController.toggleFounderStatus);


/* -------------------------------------------------------------------------- */
/* RUTAS DE FEEDBACK                            */
/* -------------------------------------------------------------------------- */

// 1. OBTENER TODOS LOS MENSAJES
// Ruta: GET /admin/feedbacks
router.get('/feedbacks', async (req, res) => {
    try {
        // Buscamos todos, ordenados del más reciente al más antiguo
        const list = await Feedback.find()
            .populate('user', 'name email') // Traemos nombre y email del autor
            .sort({ createdAt: -1 });
            
        res.json(list);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al obtener feedback' });
    }
});

// 2. MARCAR COMO LEÍDOS (¡Esta es la que te faltaba o fallaba!)
// Ruta: POST /admin/feedbacks/mark-read
router.post('/feedbacks/mark-read', async (req, res) => {
    console.log("👀 Marcando mensajes como leídos...");
    try {
        const { id } = req.body;
        
        if (id) {
            // Marcar un mensaje específico
            await Feedback.findByIdAndUpdate(id, { status: 'read' });
        } else {
            // Marcar todos los que estén 'unread'
            await Feedback.updateMany(
                { status: 'unread' }, 
                { $set: { status: 'read' } }
            );
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error("Error marcando leídos:", error);
        res.status(500).json({ message: 'Error al actualizar estado' });
    }
});

/* -------------------------------------------------------------------------- */
/* RUTAS DE TRACKING PIXELS                     */
/* -------------------------------------------------------------------------- */

// Obtener scripts de tracking actuales
router.get('/tracking-scripts', async (req, res) => {
    try {
        let config = await GlobalConfig.findOne({ isDefault: true });
        if (!config) {
            config = await GlobalConfig.create({ isDefault: true });
        }
        res.json({
            facebookPixel: config.trackingScripts?.facebookPixel || '',
            googleAnalytics: config.trackingScripts?.googleAnalytics || ''
        });
    } catch (error) {
        console.error('Error obteniendo tracking scripts:', error);
        res.status(500).json({ message: 'Error al obtener scripts' });
    }
});

// Guardar scripts de tracking
router.post('/tracking-scripts', async (req, res) => {
    try {
        const { facebookPixel, googleAnalytics } = req.body;
        
        let config = await GlobalConfig.findOne({ isDefault: true });
        if (!config) {
            config = await GlobalConfig.create({ isDefault: true });
        }
        
        config.trackingScripts = {
            facebookPixel: facebookPixel || '',
            googleAnalytics: googleAnalytics || ''
        };
        
        await config.save();
        
        console.log('✅ Scripts de tracking actualizados');
        res.json({ success: true, message: 'Scripts guardados correctamente' });
    } catch (error) {
        console.error('Error guardando tracking scripts:', error);
        res.status(500).json({ message: 'Error al guardar scripts' });
    }
});

/* -------------------------------------------------------------------------- */
/* RUTAS DE GOOGLE CALENDAR                     */
/* -------------------------------------------------------------------------- */

// Obtener credenciales de Google Calendar
router.get('/google-calendar', async (req, res) => {
    try {
        let config = await GlobalConfig.findOne({ isDefault: true });
        if (!config) {
            config = await GlobalConfig.create({ isDefault: true });
        }
        res.json({
            clientId: config.googleCalendar?.clientId || '',
            clientSecret: config.googleCalendar?.clientSecret || '',
            redirectUri: config.googleCalendar?.redirectUri || 'https://pianolink.onrender.com/api/calendar/oauth2callback',
            refreshToken: config.googleCalendar?.refreshToken || ''
        });
    } catch (error) {
        console.error('Error obteniendo credenciales de Google Calendar:', error);
        res.status(500).json({ message: 'Error al obtener credenciales' });
    }
});

// Guardar credenciales de Google Calendar
router.post('/google-calendar', async (req, res) => {
    try {
        const { clientId, clientSecret, redirectUri, refreshToken } = req.body;
        
        let config = await GlobalConfig.findOne({ isDefault: true });
        if (!config) {
            config = await GlobalConfig.create({ isDefault: true });
        }
        
        config.googleCalendar = {
            clientId: clientId || '',
            clientSecret: clientSecret || '',
            redirectUri: redirectUri || 'https://pianolink.onrender.com/api/calendar/oauth2callback',
            refreshToken: refreshToken || ''
        };
        
        await config.save();
        
        // Reinicializar CalendarService con nuevas credenciales
        const CalendarService = require('../services/CalendarService');
        await CalendarService.reinitialize();
        
        console.log('✅ Credenciales de Google Calendar actualizadas');
        res.json({ success: true, message: 'Credenciales guardadas correctamente' });
    } catch (error) {
        console.error('Error guardando credenciales de Google Calendar:', error);
        res.status(500).json({ message: 'Error al guardar credenciales' });
    }
});

router.delete('/feedbacks/:id', async (req, res) => {
    try {
        await Feedback.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Mensaje eliminado' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al eliminar mensaje' });
    }
});

/* routes/adminRoutes.js - AÑADIR AL FINAL */

// Enviar mensaje a un profesor específico
router.post('/message/send', async (req, res) => {
    try {
        const { recipientId, content } = req.body;

        if (!recipientId || !content) {
            return res.status(400).json({ message: 'Faltan datos' });
        }

        await Message.create({
            recipient: recipientId,
            content: content
        });

        res.json({ success: true, message: 'Mensaje enviado' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al enviar mensaje' });
    }
});
// RUTA: Enviar mensaje a TODOS los profesores (Broadcast)
router.post('/message/send-all', async (req, res) => {
    try {
        const { content } = req.body;
        if (!content) return res.status(400).json({ message: 'Faltan datos' });

        // 1. Necesitamos el modelo User, asegúrate de importarlo arriba si no está
        const User = require('../models/User'); 
        const teachers = await User.find({ role: 'teacher' });

        const messagesToCreate = teachers.map(t => ({
            recipient: t._id,
            content: content,
            isRead: false
        }));

        if (messagesToCreate.length > 0) {
            await Message.insertMany(messagesToCreate);
        }

        res.json({ success: true, message: `Enviado a ${teachers.length} profesores.` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al enviar a todos' });
    }
});


router.get('/conversation/:userId', adminController.getConversationWithUser);

router.put('/users/:id', adminController.updateTeacherByAdmin);

/* -------------------------------------------------------------------------- */
/* RUTAS DE CLIENTES / APODERADOS                                             */
/* -------------------------------------------------------------------------- */

// Obtener todos los clientes
router.get('/clients', adminController.getClients);

// Crear nuevo cliente (individual o apoderado con hijos)
router.post('/clients', adminController.createClient);

// Actualizar cliente
router.put('/clients/:id', adminController.updateClient);

// Eliminar cliente
router.delete('/clients/:id', adminController.deleteClient);

// Agregar clases a un cliente (pago manual)
router.post('/clients/:id/add-classes', adminController.addClassesToClient);

// Obtener historial de pagos de un cliente
router.get('/clients/:id/payments', adminController.getClientPayments);

/* -------------------------------------------------------------------------- */
/* RUTAS DE CONFIGURACIÓN DE PRECIOS                                          */
/* -------------------------------------------------------------------------- */

// Obtener configuración de precios
router.get('/config/pricing', adminController.getPricingConfig);

// Actualizar configuración de precios
router.put('/config/pricing', adminController.updatePricingConfig);

// Actualizar precio del Kit de Bienvenida V2
router.put('/config/kit-v2-price', adminController.updateKitV2Price);

// Comisiones por plan y tarifa mínima
router.get('/config/commissions', adminController.getCommissionConfig);
router.put('/config/commissions', adminController.updateCommissionConfig);

// CRUD MercadoPago Credentials por país
router.get('/mp-credentials', adminController.getMpCredentials);
router.post('/mp-credentials', adminController.upsertMpCredentials);
router.put('/mp-credentials/:countryCode/toggle', adminController.toggleMpCredentials);
router.delete('/mp-credentials/:countryCode', adminController.deleteMpCredentials);
router.post('/mp-credentials/:countryCode/test', adminController.testMpCredentials);

// Actualizar configuración de Early Bird (Fase 5 v5.0)
router.put('/config/early-bird', adminController.updateEarlyBirdConfig);

// Enviar recordatorio de membresía a profesor específico
router.post('/teachers/:teacherId/send-membership-reminder', adminController.sendMembershipReminder);

// Ejecutar verificación de membresías manualmente
router.post('/membership-reminders/run', adminController.runMembershipReminders);

/* -------------------------------------------------------------------------- */
/* RUTAS FASE 4 v5.0: PLANES DE PROFESORES Y COMISIONES                     */
/* -------------------------------------------------------------------------- */
const User = require('../models/User');
const StudentEnrollment = require('../models/StudentEnrollment');
const LedgerEntry = require('../models/LedgerEntry');

/**
 * GET /admin/teacher-plans
 * Lista todos los profesores con su plan, comisiones y estado de membresía.
 * Query: ?plan=free|premium|founder  &status=active|expired  &page=1  &limit=50
 */
router.get('/teacher-plans', async (req, res) => {
    try {
        const { plan, status, page = 1, limit = 50 } = req.query;
        const query = { role: 'teacher' };

        if (plan) {
            query['teacherData.plan'] = plan;
        }
        if (status) {
            query['teacherData.subscriptionStatus'] = status;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await User.countDocuments(query);

        const teachers = await User.find(query)
            .select('name email country isFounder isFoundingMember teacherData.plan teacherData.subscriptionStatus teacherData.subscriptionExpiresAt teacherData.planActivatedAt teacherData.permissions teacherData.membershipPaymentProvider teacherData.earnings createdAt')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        // Resumen de planes
        const planSummary = await User.aggregate([
            { $match: { role: 'teacher' } },
            { $group: { _id: '$teacherData.plan', count: { $sum: 1 } } }
        ]);

        const summary = {
            free: 0, premium: 0, founder: 0, total: 0
        };
        planSummary.forEach(p => {
            const key = p._id || 'free';
            summary[key] = p.count;
            summary.total += p.count;
        });

        res.json({
            success: true,
            teachers: teachers.map(t => ({
                _id: t._id,
                name: t.name,
                email: t.email,
                country: t.country,
                isFounder: t.isFounder || t.isFoundingMember,
                plan: t.teacherData?.plan || 'free',
                subscriptionStatus: t.teacherData?.subscriptionStatus || 'trial',
                expiresAt: t.teacherData?.subscriptionExpiresAt,
                activatedAt: t.teacherData?.planActivatedAt,
                permissions: t.teacherData?.permissions,
                paymentProvider: t.teacherData?.membershipPaymentProvider,
                earnings: t.teacherData?.earnings,
                createdAt: t.createdAt
            })),
            summary,
            pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
        });
    } catch (error) {
        console.error('[Admin] Error teacher-plans:', error);
        res.status(500).json({ error: 'Error al obtener planes de profesores' });
    }
});

/**
 * GET /admin/commission-report
 * Reporte de comisiones por transacción (últimos 30 días por defecto).
 * Query: ?days=30  &teacherId=xxx
 */
router.get('/commission-report', async (req, res) => {
    try {
        const { days = 30, teacherId } = req.query;
        const since = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

        const matchQuery = {
            createdAt: { $gte: since },
            type: { $in: ['commission', 'class_payment', 'teacher_earning'] }
        };
        if (teacherId) {
            matchQuery.$or = [
                { 'metadata.teacherId': teacherId },
                { userId: teacherId }
            ];
        }

        // Buscar transacciones con comisión en LedgerEntry
        const entries = await LedgerEntry.find(matchQuery)
            .sort({ createdAt: -1 })
            .limit(200)
            .lean();

        // Resumen agregado
        const summary = await LedgerEntry.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: null,
                    totalPlatformCommission: { $sum: '$platformAmount' },
                    totalTeacherEarnings: { $sum: '$teacherAmount' },
                    totalTransactions: { $sum: 1 },
                    totalGrossRevenue: { $sum: '$amount' }
                }
            }
        ]);

        // Desglose por plan
        const byPlan = await LedgerEntry.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: '$metadata.teacherPlan',
                    totalCommission: { $sum: '$platformAmount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        res.json({
            success: true,
            period: { days: parseInt(days), since },
            summary: summary[0] || { totalPlatformCommission: 0, totalTeacherEarnings: 0, totalTransactions: 0, totalGrossRevenue: 0 },
            byPlan,
            entries: entries.slice(0, 50) // Limitar respuesta
        });
    } catch (error) {
        console.error('[Admin] Error commission-report:', error);
        res.status(500).json({ error: 'Error al generar reporte de comisiones' });
    }
});


module.exports = router;