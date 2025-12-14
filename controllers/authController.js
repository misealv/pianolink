/* controllers/authController.js (SOLUCIÓN DEFINITIVA) */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs'); // <--- IMPORTANTE: Importamos la librería aquí
const User = require('../models/User');

// --- GENERADOR DE TOKENS ---
const generateToken = (id) => {
    let secret = process.env.JWT_SECRET;
    if (!secret) {
        // Clave de respaldo silenciosa para desarrollo
        secret = "clave_secreta_de_respaldo_pianolink_123456"; 
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

// 5. DELETE
exports.deleteUser = async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: 'Eliminado' });
    } catch (e) { res.status(500).json({ message: 'Error' }); }
};