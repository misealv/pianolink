/* controllers/authController.js (SOLUCIÓN DEFINITIVA) */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs'); // <--- IMPORTANTE: Importamos la librería aquí
const User = require('../models/User');
const eventService = require('../services/EventService'); // Sistema de eventos

// --- GENERADOR DE TOKENS ---
const generateToken = (id) => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        console.error('[AUTH] ❌ FATAL: JWT_SECRET no configurado en variables de entorno');
        throw new Error('JWT_SECRET is required');
    }
    return jwt.sign({ id }, secret, { expiresIn: '30d' });
};

// 1. LOGIN
exports.loginUser = async (req, res) => {
  console.log(`\n🔑 Intento de Login: ${req.body.email}`);

  try {
    const { email, password } = req.body;
    
    // Paso A: Buscar usuario (Incluyendo el password hash explícitamente por seguridad)
    const user = await User.findOne({ email });

    if (!user) {
        console.log("❌ Usuario no encontrado en BD");
        return res.status(401).json({ message: 'El correo no está registrado' });
    }

    // Paso B: Verificar contraseña DIRECTAMENTE (Evita el error "not a function")
    console.log("🔍 Verificando contraseña...");
    
    // Usamos bcrypt.compare directamente en vez de user.matchPassword
    const isMatch = await bcrypt.compare(password, user.password);

    if (isMatch) {
      console.log("✅ Contraseña correcta. Generando token...");
      
      const token = generateToken(user._id);
      
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        slug: user.slug,
        isFoundingMember: user.isFoundingMember, 
        branding: user.branding,
        token: token,
      });

    } else {
      console.log("⛔ Contraseña incorrecta");
      res.status(401).json({ message: 'Contraseña incorrecta' });
    }

  } catch (error) {
    console.error("❌ ERROR CRÍTICO EN LOGIN:", error); 
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
};

// 2. REGISTRO
exports.registerUser = async (req, res) => {
  try {
    const { name, email, password, slug, isFoundingMember } = req.body;
    
    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ message: 'El correo ya está registrado' });

    if (slug) {
        const slugExists = await User.findOne({ slug });
        if (slugExists) return res.status(400).json({ message: 'URL ocupada' });
    }

    // Nota: La encriptación del password se hace automáticamente en el modelo (User.js)
    // gracias al hook .pre('save'). Asegúrate de que tu modelo tenga eso.
    const user = await User.create({
      name, email, password, slug,
      isFoundingMember: isFoundingMember || false, 
      role: 'teacher',
      branding: {
          country: '🏳️ Internacional', 
          colors: { base: '#ff764d', bg: '#1a1a1a', panel: '#262626' }
      }
    });

    if (user) {
      // ✨ NUEVO: Emitir evento de creación de profesor
      console.log(`[REGISTER] 🎯 Emitiendo evento 'teacher.created' para: ${user.email}`);
      
      const eventData = {
        teacher: {
          _id: user._id,
          name: user.name,
          email: user.email,
          slug: user.slug,
          isFoundingMember: user.isFoundingMember
        }
      };
      
      console.log('[REGISTER] 📦 Datos del evento:', JSON.stringify(eventData, null, 2));
      
      eventService.emitSafe('teacher.created', eventData);
      
      console.log('[REGISTER] ✅ Evento emitido correctamente');
      
      res.status(201).json({
        _id: user._id, 
        name: user.name, 
        email: user.email, 
        role: user.role, 
        isFoundingMember: user.isFoundingMember,
        message: "Usuario creado correctamente"
      });
    } else {
      res.status(400).json({ message: 'Datos inválidos' });
    }
  } catch (error) {
    console.error("Error en registro:", error);
    res.status(500).json({ message: error.message });
  }
};

// 3. GET TEACHERS
exports.getTeachers = async (req, res) => {
    try {
        const teachers = await User.find({ role: 'teacher' }).select('-password');
        res.json(teachers);
    } catch (e) { res.status(500).json({ message: 'Error obteniendo profesores' }); }
};

// 4. GET PUBLIC PROFILE
exports.getTeacherBySlug = async (req, res) => {
    try {
        const teacher = await User.findOne({ slug: { $regex: new RegExp(`^${req.params.slug}$`, 'i') } }).select('-password');
        if (teacher) res.json(teacher);
        else res.status(404).json({ message: 'Profesor no encontrado' });
    } catch (e) { res.status(500).json({ message: 'Error server' }); }
};

// 5. UPDATE PROFILE
exports.updateProfile = async (req, res) => {
    console.log('[UPDATE PROFILE] 📝 Solicitud de actualización de perfil');
    
    try {
        const userId = req.user._id; // Viene del middleware de autenticación
        const { name, email, currentPassword, newPassword, confirmPassword } = req.body;
        
        // Buscar usuario
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }
        
        console.log(`[UPDATE PROFILE] 👤 Usuario: ${user.email}`);
        
        // Actualizar campos básicos
        if (name && name !== user.name) {
            console.log(`[UPDATE PROFILE] Cambiando nombre: ${user.name} → ${name}`);
            user.name = name;
        }
        
        // Actualizar email (verificar que no esté en uso)
        if (email && email !== user.email) {
            const emailExists = await User.findOne({ email, _id: { $ne: userId } });
            if (emailExists) {
                return res.status(400).json({ message: 'Ese email ya está registrado' });
            }
            console.log(`[UPDATE PROFILE] Cambiando email: ${user.email} → ${email}`);
            user.email = email;
        }
        
        // Cambiar contraseña (requiere validación de contraseña actual)
        if (newPassword) {
            console.log('[UPDATE PROFILE] 🔐 Intentando cambiar contraseña...');
            
            // Validar que se proporcionó la contraseña actual
            if (!currentPassword) {
                return res.status(400).json({ 
                    message: 'Debes proporcionar tu contraseña actual para cambiarla' 
                });
            }
            
            // Verificar contraseña actual
            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) {
                console.log('[UPDATE PROFILE] ❌ Contraseña actual incorrecta');
                return res.status(401).json({ message: 'Contraseña actual incorrecta' });
            }
            
            // Validar que la nueva contraseña y confirmación coincidan
            if (newPassword !== confirmPassword) {
                return res.status(400).json({ 
                    message: 'La nueva contraseña y su confirmación no coinciden' 
                });
            }
            
            // Validar fortaleza de la contraseña
            if (newPassword.length < 6) {
                return res.status(400).json({ 
                    message: 'La contraseña debe tener al menos 6 caracteres' 
                });
            }
            
            console.log('[UPDATE PROFILE] ✅ Contraseña validada, actualizando...');
            
            // Encriptar nueva contraseña
            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(newPassword, salt);
            
            console.log('[UPDATE PROFILE] 🔒 Contraseña actualizada');
        }
        
        // Guardar cambios
        await user.save();
        
        console.log('[UPDATE PROFILE] ✅ Perfil actualizado exitosamente');
        
        // Emitir evento de actualización (para futuras notificaciones)
        const eventService = require('../services/EventService');
        eventService.emitSafe('teacher.updated', {
            teacher: {
                _id: user._id,
                name: user.name,
                email: user.email,
                passwordChanged: !!newPassword
            }
        });
        
        // Responder con datos actualizados (sin contraseña)
        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            slug: user.slug,
            isFoundingMember: user.isFoundingMember,
            branding: user.branding,
            message: 'Perfil actualizado correctamente'
        });
        
    } catch (error) {
        console.error('[UPDATE PROFILE] ❌ Error:', error);
        res.status(500).json({ message: 'Error al actualizar perfil' });
    }
};

// 5. GET STUDENTS (for admin)
exports.getStudents = async (req, res) => {
    try {
        const Enrollment = require('../models/Enrollment');
        const Subscription = require('../models/Subscription');
        
        // Get all students
        const students = await User.find({ role: 'student' }).select('-password');
        
        // Enrich with enrollment and subscription data
        const enrichedStudents = await Promise.all(students.map(async (student) => {
            const enrollment = await Enrollment.findOne({ studentId: student._id, status: 'active' })
                .populate('teacherId', 'name email')
                .populate('roomId', 'code name');
            
            const subscription = await Subscription.findOne({ studentId: student._id })
                .sort({ createdAt: -1 });
            
            return {
                _id: student._id,
                name: student.name,
                email: student.email,
                createdAt: student.createdAt,
                teacher: enrollment?.teacherId || null,
                room: enrollment?.roomId || null,
                enrollmentStatus: enrollment?.status || null,
                subscription: subscription ? {
                    status: subscription.status,
                    expiresAt: subscription.expiresAt,
                    amount: subscription.amount,
                    currency: subscription.currency,
                    paymentProvider: subscription.paymentProvider
                } : null
            };
        }));
        
        res.json(enrichedStudents);
    } catch (e) {
        console.error('Error obteniendo estudiantes:', e);
        res.status(500).json({ message: 'Error obteniendo estudiantes' });
    }
};

// 6. DELETE
exports.deleteUser = async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: 'Eliminado' });
    } catch (e) { res.status(500).json({ message: 'Error' }); }
};