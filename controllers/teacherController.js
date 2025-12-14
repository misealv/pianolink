/* controllers/teacherController.js */

const Feedback = require('../models/Feedback');
const Message = require('../models/Message'); // Importante: Necesario para leer las respuestas
const User = require('../models/User');       // Importante: Necesario para buscar por email si falla la sesión

// 1. Función para recibir y guardar el feedback del fundador (User -> Admin)
exports.submitFeedback = async (req, res) => {
    try {
        const { content, email } = req.body; // Aceptamos email también por si acaso
        
        // Intentamos obtener el ID del usuario de dos formas:
        // A) Por la sesión (req.user) si está autenticado
        // B) Buscando el email si viene en el cuerpo (fallback)
        let userId = req.user ? req.user._id : null;

        if (!userId && email) {
            const userFound = await User.findOne({ email: email });
            if (userFound) userId = userFound._id;
        }

        if (!userId) {
            return res.status(401).json({ message: 'No autorizado o usuario no encontrado' });
        }

        if (!content) {
            return res.status(400).json({ message: 'El contenido no puede estar vacío' });
        }

        // Guardamos en la base de datos
        await Feedback.create({
            user: userId,
            content: content
        });

        res.status(200).json({ success: true, message: 'Feedback recibido correctamente' });

    } catch (error) {
        console.error('Error en submitFeedback:', error);
        res.status(500).json({ message: 'Error del servidor al guardar feedback' });
    }
};

// 2. Función para obtener el historial completo de chat (User <-> Admin)
exports.getMyConversation = async (req, res) => {
    try {
        let userId = req.user ? req.user._id : null;
        
        // Fallback: Si no hay req.user (sesión), intentamos buscar por el email que llega en la URL (?email=...)
        if (!userId && req.query.email) {
            const u = await User.findOne({ email: req.query.email });
            if (u) userId = u._id;
        }

        if (!userId) {
            return res.status(401).json({ message: 'Usuario no identificado' });
        }

        // A) Buscar mis mensajes enviados (Feedback)
        // Usamos .lean() para obtener objetos JS puros y poder modificarlos
        const myFeedbacks = await Feedback.find({ user: userId }).lean();
        
        // B) Buscar mensajes recibidos del admin (Message)
        const adminMessages = await Message.find({ recipient: userId }).lean();

        // C) Mezclar ambos arrays y añadir etiquetas para el frontend
        const timeline = [
            ...myFeedbacks.map(f => ({ 
                _id: f._id,
                content: f.content,
                createdAt: f.createdAt,
                sender: 'me',       // Lo envié yo
                type: 'feedback'
            })),
            ...adminMessages.map(m => ({ 
                _id: m._id,
                content: m.content,
                createdAt: m.createdAt,
                sender: 'admin',    // Me lo enviaron a mí
                type: 'message'
            }))
        ];

        // D) Ordenar cronológicamente (del más viejo al más nuevo)
        timeline.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

        res.json(timeline);

    } catch (error) {
        console.error("Error en getMyConversation:", error);
        res.status(500).json({ message: 'Error del servidor al cargar chat' });
    }
};

// ... (resto del código anterior submitFeedback y getMyConversation)

// 3. NUEVO: Obtener Profesores Fundadores (Público)
exports.getFounders = async (req, res) => {
    try {
        // Busca usuarios que tengan la bandera isFoundingMember: true
        // .select() trae solo nombre, branding y la bandera para ser más eficiente
        const founders = await User.find({ isFoundingMember: true })
            .select('name branding isFoundingMember');

        res.json(founders);
    } catch (error) {
        console.error("Error obteniendo fundadores:", error);
        res.status(500).json({ message: 'Error al cargar fundadores' });
    }
};