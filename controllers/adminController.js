/* controllers/adminController.js */

// Importamos el modelo User para poder buscar en la base de datos
const User = require('../models/User');
const Feedback = require('../models/Feedback'); 
const Message = require('../models/Message');   
// Función para cambiar el estado de "Profesor Fundador"
exports.toggleFounderStatus = async (req, res) => {
    try {
        const { id } = req.params; // Obtenemos el ID desde la URL
        
        // 1. Buscamos el usuario
        const user = await User.findById(id);
        
        if (!user) {
            // Si no existe, redirigimos (puedes ajustar esta ruta a tu panel real)
            return res.redirect('/admin/users'); 
        }

        // 2. Interruptor: Si es true lo vuelve false, y viceversa
        user.isFoundingMember = !user.isFoundingMember;
        
        // 3. Guardamos el cambio en MongoDB
        await user.save();

        console.log(`Estatus de fundador actualizado para ${user.email}: ${user.isFoundingMember}`);
        
        // 4. Redirigimos de vuelta a la lista de usuarios
       // res.redirect('/admin/users'); 

       res.json({ success: true, isFounder: user.isFoundingMember });

    } catch (error) {
        console.error('Error en toggleFounderStatus:', error);
        res.status(500).send('Error del servidor');
    }
};

/* controllers/adminController.js (AÑADIR ESTO) */

// Obtener historial completo de conversación con un usuario específico
exports.getConversationWithUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const User = require('../models/User');
        const Feedback = require('../models/Feedback');
        const Message = require('../models/Message');

        // 1. Verificar usuario
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

        // 2. Buscar mensajes en ambas direcciones
        // A) Lo que el Profe escribió (Feedback)
        const feedbacks = await Feedback.find({ user: userId }).lean();
        
        // B) Lo que el Admin respondió (Message)
        const messages = await Message.find({ recipient: userId }).lean();

        // 3. Unificar y formatear
        const timeline = [
            ...feedbacks.map(f => ({ 
                _id: f._id,
                content: f.content,
                createdAt: f.createdAt,
                sender: 'teacher', // Viene del profe
                status: f.status
            })),
            ...messages.map(m => ({ 
                _id: m._id,
                content: m.content,
                createdAt: m.createdAt,
                sender: 'admin',   // Viene del admin
                isRead: m.isRead
            }))
        ];

        // 4. Ordenar por fecha (Más antiguo al principio -> Chat cronológico)
        timeline.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

        res.json({
            user: { name: user.name, email: user.email, id: user._id },
            conversation: timeline
        });

    } catch (error) {
        console.error('Error en getConversationWithUser:', error);
        res.status(500).json({ message: 'Error obteniendo conversación' });
    }
};

// NUEVA FUNCIÓN: Editar usuario desde el Admin
exports.updateTeacherByAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, slug, country } = req.body;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        // Actualizamos campos básicos
        user.name = name || user.name;
        user.email = email || user.email;
        
        // El slug es opcional, si viene vacío lo dejamos undefined o mantenemos el anterior
        if (slug !== undefined) user.slug = slug; 

        // Actualizamos el objeto branding (asegurando que exista)
        if (!user.branding) user.branding = {};
        
        // Aquí guardamos el PAÍS
        user.branding.country = country || '🏳️ Internacional';

        await user.save();
        res.json({ success: true, message: 'Profesor actualizado correctamente' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al actualizar usuario' });
    }
};


/* --- AGREGAR AL FINAL DE adminController.js --- */

// Importar el nuevo modelo
const GlobalConfig = require('../models/GlobalConfig');

// 1. Obtener Configuración Actual
exports.getPlatformConfig = async (req, res) => {
    try {
        // Buscar la config, si no existe, crearla por defecto
        let config = await GlobalConfig.findOne({ isDefault: true });
        if (!config) {
            config = await GlobalConfig.create({ isDefault: true });
        }
        res.json(config);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al obtener config" });
    }
};

// 2. Actualizar Configuración (Logo/Favicon)
exports.updatePlatformConfig = async (req, res) => {
    try {
        const { platformName, logoUrl, faviconUrl } = req.body;
        
        let config = await GlobalConfig.findOne({ isDefault: true });
        if (!config) config = new GlobalConfig({ isDefault: true });

        // Solo actualizamos si envían datos nuevos
        if (platformName) config.platformName = platformName;
        if (logoUrl) config.logoUrl = logoUrl;       // Esperamos Base64 o URL
        if (faviconUrl) config.faviconUrl = faviconUrl; // Esperamos Base64 o URL

        await config.save();
        res.json({ success: true, message: "¡Identidad de plataforma actualizada!" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al guardar configuración" });
    }
};

// 3. Endpoint Público para que el index.html lea el logo (Sin Login)
exports.getPublicPlatformConfig = async (req, res) => {
    try {
        const config = await GlobalConfig.findOne({ isDefault: true });
        // Solo devolvemos lo visual, por seguridad
        res.json({
            logoUrl: config ? config.logoUrl : "",
            faviconUrl: config ? config.faviconUrl : "",
            name: config ? config.platformName : "Piano Link"
        });
    } catch (error) {
        res.status(500).json({});
    }
};
