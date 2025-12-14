const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const Feedback = require('../models/Feedback'); // Importante para leer mensajes
const Message = require('../models/Message');
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
        // Busca todos los que estén 'unread' y ponlos en 'read'
        await Feedback.updateMany(
            { status: 'unread' }, 
            { $set: { status: 'read' } }
        );
        res.json({ success: true });
    } catch (error) {
        console.error("Error marcando leídos:", error);
        res.status(500).json({ message: 'Error al actualizar estado' });
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


/* routes/adminRoutes.js - AÑADIR ANTES DEL EXPORT */

// Rutas de Configuración de Plataforma
router.get('/platform/config', adminController.getPlatformConfig);
router.post('/platform/config', adminController.updatePlatformConfig);

// Ruta Pública (IMPORTANTE: Esto debería ir idealmente en authRoutes o publicRoutes, 
// pero podemos dejarlo aquí si permitimos acceso sin auth, O MEJOR AÚN:
// Añade esta línea específica en tu server.js o authRoutes para que sea pública real.
// Por ahora, la dejamos protegida para lectura del admin y creamos una pública abajo)



module.exports = router;