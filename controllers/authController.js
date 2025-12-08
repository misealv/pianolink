/* controllers/authController.js */
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Generar Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// 1. LOGIN
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        slug: user.slug,
        branding: user.branding,
        token: generateToken(user._id),
      });
    } else {
      res.status(401).json({ message: 'Credenciales inválidas' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 2. REGISTRAR PROFESOR
const registerUser = async (req, res) => {
  try {
    const { name, email, password, slug } = req.body;
    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ message: 'El correo ya está registrado' });

    if (slug) {
        const slugExists = await User.findOne({ slug });
        if (slugExists) return res.status(400).json({ message: 'Esa URL personalizada ya está ocupada' });
    }

    const user = await User.create({
      name, email, password, slug,
      role: 'teacher',
      branding: {
          logoUrl: 'https://pianolink.com/assets/logo-pianolink.jpg',
          profilePhotoUrl: '',
          bio: 'Profesor de Piano Link',
          colors: { base: '#ff764d', bg: '#1a1a1a', panel: '#262626' }
      }
    });

    if (user) {
      res.status(201).json({
        _id: user.id, name: user.name, email: user.email, role: user.role,
        message: "¡Profesor creado exitosamente!"
      });
    } else {
      res.status(400).json({ message: 'Datos inválidos' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 3. OBTENER LISTA DE PROFESORES 
const getTeachers = async (req, res) => {
    try {
        const teachers = await User.find({ role: 'teacher' }).select('-password');
        res.json(teachers);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener profesores' });
    }
};

// 4. OBTENER DATOS PÚBLICOS (Por Slug)
const getTeacherBySlug = async (req, res) => {
    try {
        const slugInput = req.params.slug;
        const teacher = await User.findOne({ 
            slug: { $regex: new RegExp(`^${slugInput}$`, 'i') } 
        }).select('name branding role slug');
        
        if (teacher) {
            res.json(teacher);
        } else {
            res.status(404).json({ message: 'Profesor no encontrado' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error del servidor' });
    }
};

// 5. ELIMINAR PROFESOR (¡NUEVO!)
const deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        // Seguridad: Evitar borrar al Admin
        if (user.email === 'admin@pianolink.com') {
             return res.status(400).json({ message: 'No puedes eliminar al Super Admin.' });
        }

        await user.deleteOne();
        res.json({ message: 'Profesor eliminado correctamente' });

    } catch (error) {
        res.status(500).json({ message: 'Error al eliminar usuario' });
    }
};

module.exports = { loginUser, registerUser, getTeachers, getTeacherBySlug, deleteUser };