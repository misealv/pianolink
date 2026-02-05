/**
 * models/LedgerEntry.js
 * Libro Contable Inmutable - PianoLink v3.0
 * 
 * PRINCIPIOS DE DISEÑO:
 * 1. INMUTABLE: Una vez creado, NUNCA se edita ni elimina
 * 2. APPEND-ONLY: Solo se agregan nuevas entradas
 * 3. TRAZABLE: Cada entrada tiene referencia a su origen
 * 4. AUDITABLE: Timestamps y metadata completos
 * 
 * Para "corregir" un error, se crea una entrada de reverso.
 */

const mongoose = require('mongoose');

const ledgerEntrySchema = new mongoose.Schema({
    // === IDENTIFICACIÓN ===
    
    // ID único secuencial para auditoría
    sequenceNumber: {
        type: Number,
        unique: true,
        required: true
    },

    // Wallet afectada
    walletId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Wallet',
        required: true,
        index: true
    },

    // === TIPO DE MOVIMIENTO ===
    type: {
        type: String,
        enum: ['credit', 'debit'],
        required: true
    },

    // Categoría del movimiento
    category: {
        type: String,
        enum: [
            // Créditos (dinero entra)
            'class_earning',           // Ganancia por clase con cliente
            'bonus',                   // Bono/promoción
            'refund_reversal',         // Reverso de reembolso
            'adjustment_credit',       // Ajuste manual a favor
            
            // Débitos (dinero sale)
            'withdrawal',              // Retiro a cuenta bancaria/PayPal
            'platform_fee',            // Comisión de la plataforma
            'refund',                  // Reembolso a cliente
            'adjustment_debit',        // Ajuste manual en contra
            'chargeback'               // Contracargo
        ],
        required: true
    },

    // === MONTO ===
    amount: {
        type: Number,
        required: true,
        min: 0
    },

    currency: {
        type: String,
        default: 'USD'
    },

    // Tasa de cambio usada (si aplica)
    exchangeRate: {
        type: Number,
        default: 1
    },

    // Monto en moneda original
    originalAmount: Number,
    originalCurrency: String,

    // === ESTADO ===
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'reversed', 'failed'],
        default: 'confirmed'
    },

    // === REFERENCIA AL ORIGEN ===
    reference: {
        // Tipo de documento origen
        type: {
            type: String,
            enum: ['class_record', 'withdrawal', 'payment', 'manual', 'system'],
            required: true
        },
        
        // ID del documento origen
        documentId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true
        },
        
        // Modelo del documento (para populate dinámico)
        documentModel: {
            type: String,
            required: true
        }
    },

    // === SI ES CLASE ===
    classDetails: {
        classRecordId: mongoose.Schema.Types.ObjectId,
        studentId: mongoose.Schema.Types.ObjectId,
        studentName: String,
        studentType: {
            type: String,
            enum: ['client', 'guest']
        },
        duration: Number,  // minutos
        grossAmount: Number,
        platformFee: Number,
        netAmount: Number
    },

    // === SI ES RETIRO ===
    withdrawalDetails: {
        withdrawalId: mongoose.Schema.Types.ObjectId,
        method: String,
        destination: String,  // email o cuenta ofuscada
        transactionId: String  // ID del proveedor de pago
    },

    // === METADATA DE AUDITORÍA ===
    audit: {
        // Quién creó esta entrada
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        
        // Tipo de creador
        createdByType: {
            type: String,
            enum: ['system', 'admin', 'automatic'],
            default: 'system'
        },
        
        // IP desde donde se creó (si es manual)
        ipAddress: String,
        
        // User agent
        userAgent: String,
        
        // Notas del admin (si es manual)
        notes: String,
        
        // Si es reverso, referencia a la entrada original
        reversesEntry: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'LedgerEntry'
        },
        
        // Si fue reversada, referencia a la entrada de reverso
        reversedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'LedgerEntry'
        }
    },

    // Hash de la entrada anterior (blockchain-like para integridad)
    previousHash: String,
    
    // Hash de esta entrada
    entryHash: {
        type: String,
        required: true
    },

    createdAt: {
        type: Date,
        default: Date.now,
        immutable: true  // No se puede modificar
    }
}, {
    timestamps: false  // Solo usamos createdAt, immutable
});

// === ÍNDICES ===
ledgerEntrySchema.index({ walletId: 1, createdAt: -1 });
ledgerEntrySchema.index({ 'reference.documentId': 1 });
ledgerEntrySchema.index({ category: 1, createdAt: -1 });
ledgerEntrySchema.index({ sequenceNumber: 1 }, { unique: true });
ledgerEntrySchema.index({ entryHash: 1 }, { unique: true });

// === PRE-SAVE: Generar hash y número de secuencia ===
ledgerEntrySchema.pre('save', async function(next) {
    if (this.isNew) {
        // Generar número de secuencia
        const lastEntry = await this.constructor.findOne().sort({ sequenceNumber: -1 });
        this.sequenceNumber = lastEntry ? lastEntry.sequenceNumber + 1 : 1;
        
        // Obtener hash anterior
        if (lastEntry) {
            this.previousHash = lastEntry.entryHash;
        } else {
            this.previousHash = 'GENESIS';
        }
        
        // Generar hash de esta entrada
        this.entryHash = this.generateHash();
    }
    next();
});

// === MÉTODOS DE INSTANCIA ===

/**
 * Generar hash de la entrada (blockchain-like)
 */
ledgerEntrySchema.methods.generateHash = function() {
    const crypto = require('crypto');
    const data = JSON.stringify({
        seq: this.sequenceNumber,
        wallet: this.walletId.toString(),
        type: this.type,
        category: this.category,
        amount: this.amount,
        ref: this.reference.documentId.toString(),
        prev: this.previousHash,
        ts: this.createdAt?.toISOString() || new Date().toISOString()
    });
    return crypto.createHash('sha256').update(data).digest('hex');
};

/**
 * Verificar integridad del hash
 */
ledgerEntrySchema.methods.verifyHash = function() {
    return this.entryHash === this.generateHash();
};

// === MÉTODOS ESTÁTICOS ===

/**
 * Crear entrada de crédito por clase
 */
ledgerEntrySchema.statics.createClassEarning = async function(walletId, classRecord, netAmount, platformFee) {
    return this.create({
        walletId,
        type: 'credit',
        category: 'class_earning',
        amount: netAmount,
        status: 'confirmed',
        reference: {
            type: 'class_record',
            documentId: classRecord._id,
            documentModel: 'ClassRecord'
        },
        classDetails: {
            classRecordId: classRecord._id,
            studentId: classRecord.studentId,
            studentName: classRecord.studentName,
            studentType: classRecord.studentType,
            duration: classRecord.duration,
            grossAmount: classRecord.price.grossAmount,
            platformFee: platformFee,
            netAmount: netAmount
        },
        audit: {
            createdByType: 'system'
        }
    });
};

/**
 * Crear entrada de débito por retiro
 */
ledgerEntrySchema.statics.createWithdrawal = async function(walletId, withdrawal) {
    return this.create({
        walletId,
        type: 'debit',
        category: 'withdrawal',
        amount: withdrawal.amount,
        status: 'pending',
        reference: {
            type: 'withdrawal',
            documentId: withdrawal._id,
            documentModel: 'Withdrawal'
        },
        withdrawalDetails: {
            withdrawalId: withdrawal._id,
            method: withdrawal.method,
            destination: withdrawal.destination
        },
        audit: {
            createdByType: 'system'
        }
    });
};

/**
 * Crear entrada de comisión de plataforma
 */
ledgerEntrySchema.statics.createPlatformFee = async function(platformWalletId, classRecord, feeAmount) {
    return this.create({
        walletId: platformWalletId,
        type: 'credit',
        category: 'platform_fee',
        amount: feeAmount,
        status: 'confirmed',
        reference: {
            type: 'class_record',
            documentId: classRecord._id,
            documentModel: 'ClassRecord'
        },
        classDetails: {
            classRecordId: classRecord._id,
            studentName: classRecord.studentName,
            studentType: classRecord.studentType
        },
        audit: {
            createdByType: 'system'
        }
    });
};

/**
 * Reversar una entrada (crear entrada opuesta)
 */
ledgerEntrySchema.statics.reverseEntry = async function(entryId, reason, adminId) {
    const original = await this.findById(entryId);
    if (!original) throw new Error('Entrada no encontrada');
    if (original.status === 'reversed') throw new Error('Entrada ya reversada');
    
    // Crear entrada de reverso
    const reverseType = original.type === 'credit' ? 'debit' : 'credit';
    const reverseCategory = original.category.includes('adjustment') 
        ? `adjustment_${reverseType}` 
        : original.category;
    
    const reversal = await this.create({
        walletId: original.walletId,
        type: reverseType,
        category: reverseCategory,
        amount: original.amount,
        status: 'confirmed',
        reference: {
            type: 'manual',
            documentId: original._id,
            documentModel: 'LedgerEntry'
        },
        audit: {
            createdBy: adminId,
            createdByType: 'admin',
            notes: `Reverso: ${reason}`,
            reversesEntry: original._id
        }
    });
    
    // Marcar original como reversada
    original.status = 'reversed';
    original.audit.reversedBy = reversal._id;
    await original.save();
    
    return reversal;
};

/**
 * Verificar integridad de toda la cadena
 */
ledgerEntrySchema.statics.verifyChainIntegrity = async function() {
    const entries = await this.find().sort({ sequenceNumber: 1 });
    const errors = [];
    
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        
        // Verificar hash propio
        if (!entry.verifyHash()) {
            errors.push({
                sequenceNumber: entry.sequenceNumber,
                error: 'Hash inválido'
            });
        }
        
        // Verificar enlace con anterior
        if (i > 0 && entry.previousHash !== entries[i-1].entryHash) {
            errors.push({
                sequenceNumber: entry.sequenceNumber,
                error: 'Cadena rota - previousHash no coincide'
            });
        }
    }
    
    return {
        valid: errors.length === 0,
        totalEntries: entries.length,
        errors
    };
};

/**
 * Obtener historial de una wallet
 */
ledgerEntrySchema.statics.getWalletHistory = async function(walletId, options = {}) {
    const { limit = 50, offset = 0, category, startDate, endDate } = options;
    
    const query = { walletId };
    
    if (category) query.category = category;
    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = startDate;
        if (endDate) query.createdAt.$lte = endDate;
    }
    
    return this.find(query)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit);
};

module.exports = mongoose.model('LedgerEntry', ledgerEntrySchema);
