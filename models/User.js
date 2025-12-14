/* models/User.js */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['admin', 'teacher'], 
    default: 'teacher' 
  },
  
  // ❌ BORRA ESTA LÍNEA DE AQUÍ (Línea 14):
  // country: { type: String, default: '🏳️ Internacional' },

  isFoundingMember: { 
    type: Boolean, 
    default: false 
  },

  slug: { type: String, unique: true, sparse: true },

  // Marca personal
  branding: {
    // ✅ PÉGALA AQUÍ ADENTRO:
    country: { type: String, default: '🏳️ Internacional' },
    
    logoUrl: { type: String, default: '' },
    profilePhotoUrl: { type: String, default: '' },
    bio: { type: String, default: '' },
    colors: {
      base: { type: String, default: '#ff764d' },
      bg: { type: String, default: '#1a1a1a' },
      panel: { type: String, default: '#262626' }
    }
  },
  createdAt: { type: Date, default: Date.now }
});

// ... (resto del código de encriptación igual)

module.exports = mongoose.model('User', userSchema);