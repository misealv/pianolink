/* routes/teacherRoutes.js - VERSIÓN SUPER DEBUG */
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

console.log("\n⚡ CARGANDO RUTAS DE PROFESOR...");

// 1. Verificación de Claves (Diagnóstico)
const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (!cloudName || !apiKey || !apiSecret) {
    console.error("❌ ERROR CRÍTICO: Faltan las variables de entorno de Cloudinary en .env");
    console.error("   Cloud Name:", cloudName ? "OK" : "FALTA");
    console.error("   API Key:", apiKey ? "OK" : "FALTA");
    console.error("   API Secret:", apiSecret ? "OK" : "FALTA");
} else {
    console.log("✅ Credenciales de Cloudinary detectadas correctamente.");
}

// 2. Configurar Cloudinary
cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret
});

// 3. Configurar Almacenamiento
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'pianolink_profiles',
    allowed_formats: ['jpg', 'png', 'jpeg'],
  },
});
const upload = multer({ storage: storage });

// 4. RUTA: Obtener datos
router.get('/me', async (req, res) => {
    try {
        const { email } = req.query; 
        const teacher = await User.findOne({ email }).select('-password');
        res.json(teacher);
    } catch (error) {
        res.status(500).json({ message: 'Error server' });
    }
});

// 5. RUTA: Actualizar (CON CAPTURA DE ERROR EN SUBIDA)
router.post('/update', (req, res, next) => {
    console.log("📸 Intentando subir archivos a Cloudinary...");
    
    // Envolvemos la subida para cazar el error [object Object]
    const uploadMiddleware = upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'photo', maxCount: 1 }]);
    
    uploadMiddleware(req, res, (err) => {
        if (err) {
            console.error("❌ ERROR EN LA SUBIDA (MULTER/CLOUDINARY):");
            console.error("   ", err); // Esto nos dirá qué es el [object Object]
            return res.status(500).json({ message: 'Error subiendo imagen: ' + err.message });
        }
        // Si no hay error, pasamos a la siguiente función (guardar en BD)
        console.log("✅ Archivos subidos a la nube. Procesando datos...");
        next();
    });

}, async (req, res) => {
    try {
        const { email, bio, colorBase, colorBg, colorPanel } = req.body;
        let teacher = await User.findOne({ email });

        if (!teacher) return res.status(404).json({ message: 'Profesor no encontrado' });

        // Actualizar datos visuales
        if (bio) teacher.branding.bio = bio;
        if (colorBase) teacher.branding.colors.base = colorBase;
        if (colorBg) teacher.branding.colors.bg = colorBg;
        if (colorPanel) teacher.branding.colors.panel = colorPanel;

        // Guardar URLs de Cloudinary
        if (req.files['logo']) {
            const url = req.files['logo'][0].path || req.files['logo'][0].secure_url;
            console.log("   Logo URL:", url);
            teacher.branding.logoUrl = url;
        }
        if (req.files['photo']) {
            const url = req.files['photo'][0].path || req.files['photo'][0].secure_url;
            console.log("   Foto URL:", url);
            teacher.branding.profilePhotoUrl = url;
        }

        await teacher.save();
        console.log("💾 Perfil guardado en MongoDB.");
        res.json({ message: 'Perfil actualizado', branding: teacher.branding });

    } catch (error) {
        console.error("❌ Error guardando en BD:", error);
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;