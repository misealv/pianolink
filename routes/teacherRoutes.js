/* routes/teacherRoutes.js */
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const Feedback = require('../models/Feedback');
// ---> LA IMPORTACIÓN QUE FALTABA:
const Message = require('../models/Message'); 
// ------------------------------------

console.log("\n⚡ CARGANDO RUTAS DE PROFESOR...");

// (Configuración de Cloudinary - IGUAL QUE ANTES)
const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
const storage = new CloudinaryStorage({ cloudinary: cloudinary, params: { folder: 'pianolink_profiles', allowed_formats: ['jpg', 'png', 'jpeg'] } });
const upload = multer({ storage: storage });

// RUTA ME: Obtener datos
router.get('/me', async (req, res) => {
    try {
        const { email } = req.query; 
        const teacher = await User.findOne({ email }).select('-password');
        res.json(teacher);
    } catch (error) { res.status(500).json({ message: 'Error server' }); }
});

// RUTA UPDATE (Sin cambios)
router.post('/update', upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'photo', maxCount: 1 }]), async (req, res) => {
    try {
        const { email, bio, colorBase, colorBg, colorPanel } = req.body;
        let teacher = await User.findOne({ email });
        if (!teacher) return res.status(404).json({ message: 'Profesor no encontrado' });

        if (bio) teacher.branding.bio = bio;
        if (colorBase) teacher.branding.colors.base = colorBase;
        if (colorBg) teacher.branding.colors.bg = colorBg;
        if (colorPanel) teacher.branding.colors.panel = colorPanel;

        if (req.files && req.files['logo']) teacher.branding.logoUrl = req.files['logo'][0].path;
        if (req.files && req.files['photo']) teacher.branding.profilePhotoUrl = req.files['photo'][0].path;

        await teacher.save();
        res.json({ message: 'Perfil actualizado', branding: teacher.branding });
    } catch (error) { res.status(500).json({ message: error.message }); }
});

// RUTA FEEDBACK (Sin cambios)
router.post('/feedback', async (req, res) => {
    try {
        const { email, content } = req.body;
        if (!content) return res.status(400).json({ message: 'Contenido obligatorio' });
        const user = await User.findOne({ email });
        if (!user || !user.isFoundingMember) return res.status(403).json({ message: 'No autorizado' });

        await Feedback.create({ user: user._id, content: content, status: 'unread' });
        res.json({ success: true, message: 'Feedback guardado' });
    } catch (error) { res.status(500).json({ message: 'Error server' }); }
});

// RUTA MENSAJES (Ahora funcionará porque importamos Message arriba)
router.get('/my-messages', async (req, res) => {
    try {
        const { email } = req.query;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

        // Ahora Message está definido y funcionará
        const messages = await Message.find({ recipient: user._id }).sort({ createdAt: -1 });
        res.json(messages);
    } catch (error) {
        console.error("Error obteniendo mensajes:", error);
        res.status(500).json({ message: 'Error al obtener mensajes' });
    }
});

router.post('/my-messages/read/:id', async (req, res) => {
    try {
        await Message.findByIdAndUpdate(req.params.id, { isRead: true });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ message: 'Error' }); }
});

module.exports = router;