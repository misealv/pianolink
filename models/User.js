/* models/User.js */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  whatsapp: { type: String, default: '' },
  country: { type: String, default: '' },
  timezone: { type: String, default: 'America/Santiago' },
  
  role: { 
    type: String, 
    enum: ['admin', 'teacher', 'student', 'client'], 
    default: 'teacher' 
  },
  
  // ==================== CLASES (para estudiantes) ====================
  classesRemaining: { type: Number, default: 0 },  // Clases disponibles
  classesCompleted: { type: Number, default: 0 },  // Clases realizadas
  
  // ==================== DATOS DE PROFESOR ====================
  teacherData: {
    // Estado de suscripción
    subscriptionStatus: {
      type: String,
      enum: ['trial', 'active', 'expired', 'cancelled', 'past_due'],
      default: 'trial'
    },
    subscriptionExpiresAt: { type: Date },
    
    // Stripe Subscription IDs
    stripeCustomerId: { type: String, default: '' },
    stripeSubscriptionId: { type: String, default: '' },
    stripePriceId: { type: String, default: '' },
    
    // ==================== TARIFA Y PAQUETES ====================
    // Tarifa por clase en USD (mínimo $15)
    hourlyRate: { type: Number, default: 25, min: 15 },
    
    // Paquetes de clases con descuento
    packages: [{
      classes: { type: Number, required: true },      // Número de clases
      discountPercent: { type: Number, default: 0 },  // % descuento (ej: 10 = 10%)
      isActive: { type: Boolean, default: true }
    }],
    
    // Perfil público
    profile: {
      isPublic: { type: Boolean, default: true },     // Visible en catálogo
      specialties: [{ type: String }],                 // Ej: ['clásico', 'jazz', 'niños']
      experience: { type: String, default: '' },       // Descripción de experiencia
      education: { type: String, default: '' },        // Formación
      languages: [{ type: String, default: 'español' }], // Idiomas
      videoUrl: { type: String, default: '' },         // Video de presentación
      acceptsTrialClass: { type: Boolean, default: true } // Acepta clase de prueba
    },
    
    // Ganancias (por clases a alumnos de plataforma)
    earnings: {
      pending: { type: Number, default: 0 },    // Por cobrar
      paid: { type: Number, default: 0 },        // Ya pagado
      totalClasses: { type: Number, default: 0 } // Clases completadas
    },
    
    // Comisión que gana (default 80%)
    commissionPercent: { type: Number, default: 80 },
    
    // PayPal para recibir pagos (legacy)
    paypalEmail: { type: String, default: '' },
    
    // ==================== DATOS DE PAGO ====================
    paymentInfo: {
      // País del profesor (determina opciones de pago)
      country: { type: String, default: 'CL' },
      
      // Método preferido de pago
      method: {
        type: String,
        enum: ['mercadopago', 'bank_transfer', 'paypal', 'wise'],
        default: 'mercadopago'
      },
      
      // MercadoPago (Chile, Argentina, México, etc.)
      mercadopago: {
        email: { type: String, default: '' },
        userId: { type: String, default: '' }  // ID de cuenta MP
      },
      
      // Transferencia bancaria (Chile)
      bankTransfer: {
        bankName: { type: String, default: '' },
        accountType: { type: String, enum: ['corriente', 'vista', 'ahorro', ''], default: '' },
        accountNumber: { type: String, default: '' },
        rut: { type: String, default: '' },
        holderName: { type: String, default: '' }
      },
      
      // PayPal (internacional)
      paypal: {
        email: { type: String, default: '' }
      },
      
      // Wise (internacional)
      wise: {
        email: { type: String, default: '' },
        accountId: { type: String, default: '' }
      },
      
      // Estado de verificación
      isVerified: { type: Boolean, default: false },
      verifiedAt: { type: Date },
      
      // Documento tributario (RUT, RFC, DNI, etc.)
      taxId: { type: String, default: '' },
      taxIdType: { type: String, default: '' }  // RUT, RFC, CUIT, NIF, etc.
    }
  },
  
  // ==================== DATOS DE CLIENTE ====================
  clientData: {
    // Tipo de cliente
    accountType: {
      type: String,
      enum: ['individual', 'guardian', 'organization'],
      default: 'individual'
    },
    
    // Estudiantes que gestiona (hijos/dependientes) - embebidos, no cuentas separadas
    managedStudents: [{
      name: { type: String, required: true },
      age: { type: Number },
      classesRemaining: { type: Number, default: 1 },  // Clases disponibles
      classesUsed: { type: Number, default: 0 }        // Clases tomadas
    }],
    
    // Info de facturación
    billingEmail: { type: String, default: '' }
  },
  
  // ==================== DATOS DE ALUMNO ====================
  studentData: {
    // De dónde viene el alumno
    source: {
      type: String,
      enum: ['platform', 'invited'],  // plataforma o invitado por profesor
      default: 'platform'
    },
    
    // Quien paga por este alumno (puede ser él mismo o un apoderado)
    accountHolder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    
    // Profesor asignado
    assignedTeacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    
    // Nivel e instrumento
    level: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'beginner'
    },
    instrument: { type: String, default: 'piano' },
    age: { type: Number }
  },
  
  // ==================== LEAD DE ORIGEN ====================
  convertedFromLead: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lead',
    default: null
  },

  isFoundingMember: { 
    type: Boolean, 
    default: false 
  },

  // Profesor fundador
  isFounder: {
    type: Boolean,
    default: false
  },

  // Kit de bienvenida
  kitPurchased: {
    type: Boolean,
    default: false
  },
  kitPurchaseDate: {
    type: Date
  },
  paypalOrderId: {
    type: String
  },
  
  // ==================== HISTORIAL DE PAGOS MANUALES ====================
  paymentHistory: [{
    amount: { type: Number, required: true },
    currency: { type: String, default: 'CLP' },
    method: { type: String, default: 'manual' }, // transfer, cash, other, manual
    notes: { type: String, default: '' },
    classes: { type: Number, default: 0 },
    studentName: { type: String, default: '' },
    date: { type: Date, default: Date.now }
  }],

  slug: { type: String, unique: true, sparse: true },

  // === AUTENTICACIÓN Y SEGURIDAD ===
  // Magic Link / Reset Password
  magicLinkToken: { type: String },
  magicLinkExpires: { type: Date },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
  mustChangePassword: { type: Boolean, default: false },
  lastPasswordChange: { type: Date },

  // Marca personal
  branding: {
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
  lastName: { type: String },
  createdAt: { type: Date, default: Date.now }
});

// ✅ ENCRIPTACIÓN AUTOMÁTICA DE CONTRASEÑAS
// Este hook se ejecuta antes de guardar un usuario
userSchema.pre('save', async function(next) {
  // Solo encriptar si la contraseña fue modificada (o es nueva)
  if (!this.isModified('password')) {
    return next();
  }

  try {
    // Generar salt y hashear la contraseña
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// ✅ MÉTODO PARA COMPARAR CONTRASEÑAS EN LOGIN
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);