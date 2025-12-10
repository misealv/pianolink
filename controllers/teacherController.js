/* controllers/teacherController.js */
const Feedback = require('../models/Feedback');

// Función para recibir y guardar el feedback del fundador
exports.submitFeedback = async (req, res) => {
    try {
        const { content } = req.body;
        
        // Verificamos que el usuario esté logueado (req.user viene del middleware)
        if (!req.user) {
            return res.status(401).json({ message: 'No autorizado' });
        }

        if (!content) {
            return res.status(400).json({ message: 'El contenido no puede estar vacío' });
        }

        // Guardamos en la base de datos
        await Feedback.create({
            user: req.user._id, // El ID del profesor que envía el mensaje
            content: content
        });

        res.status(200).json({ success: true, message: 'Feedback recibido correctamente' });

    } catch (error) {
        console.error('Error en submitFeedback:', error);
        res.status(500).json({ message: 'Error del servidor al guardar feedback' });
    }
};