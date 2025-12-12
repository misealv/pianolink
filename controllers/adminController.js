/* controllers/adminController.js */

// Importamos el modelo User para poder buscar en la base de datos
const User = require('../models/User');

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