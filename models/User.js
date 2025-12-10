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

  // ---> AQUÍ AÑADES EL NUEVO CAMPO <---
  isFoundingMember: { 
    type: Boolean, 
    default: false 
  },
  // ------------------------------------

  
  // Slug para la url personalizada (ej: pianolink.com/c/miguel)
  slug: { type: String, unique: true, sparse: true },
  // Marca personal
  branding: {
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

// Encriptar password antes de guardar
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Comparar password para login
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);