/* middleware/authMiddleware.js - Middleware de Autenticación */

const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Middleware para proteger rutas que requieren autenticación
 * Verifica el token JWT en el header Authorization
 */
const protect = async (req, res, next) => {
    let token;
    
    // Verificar si el header Authorization existe y comienza con "Bearer"
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Extraer el token (formato: "Bearer TOKEN_AQUI")
            token = req.headers.authorization.split(' ')[1];
            
            // Verificar y decodificar el token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            // Agregar el usuario al request (sin la contraseña)
            req.user = await User.findById(decoded.id).select('-password');
            
            if (!req.user) {
                return res.status(401).json({ message: 'Usuario no encontrado' });
            }
            
            next(); // Continuar al siguiente middleware/controlador
            
        } catch (error) {
            console.error('[AUTH MIDDLEWARE] Error verificando token:', error.message);
            return res.status(401).json({ message: 'Token inválido o expirado' });
        }
    }
    
    if (!token) {
        return res.status(401).json({ message: 'No autorizado, token no proporcionado' });
    }
};

/**
 * Middleware para verificar que el usuario sea admin
 */
const adminOnly = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        return res.status(403).json({ message: 'Acceso denegado. Solo administradores.' });
    }
};

/**
 * Middleware para verificar que el usuario sea teacher o admin
 */
const teacherOrAdmin = (req, res, next) => {
    if (req.user && (req.user.role === 'teacher' || req.user.role === 'admin')) {
        next();
    } else {
        return res.status(403).json({ message: 'Acceso denegado. Solo profesores y administradores.' });
    }
};

module.exports = { protect, adminOnly, teacherOrAdmin };
