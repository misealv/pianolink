/**
 * models/Wallet.js
 * Sistema de Billetera - PianoLink v3.0
 * 
 * Cada profesor tiene UNA billetera que acumula ganancias.
 * Diseño inmutable: nunca se edita un balance directamente,
 * siempre se calcula desde el Ledger.
 */

const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
    // Dueño de la billetera (profesor)
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
        index: true
    },

    ownerType: {
        type: String,
        enum: ['teacher', 'platform'],
        default: 'teacher'
    },

    // === BALANCES (calculados desde Ledger, cacheados aquí) ===
    balance: {
        // Disponible para retirar
        available: {
            type: Number,
            default: 0,
            min: 0
        },
        // Pendiente (clases no confirmadas o en hold)
        pending: {
            type: Number,
            default: 0,
            min: 0
        },
        // Total histórico ganado
        totalEarned: {
            type: Number,
            default: 0,
            min: 0
        },
        // Total retirado
        totalWithdrawn: {
            type: Number,
            default: 0,
            min: 0
        }
    },

    // === CONFIGURACIÓN DE PAGOS ===
    payoutConfig: {
        // Método preferido
        preferredMethod: {
            type: String,
            enum: ['paypal', 'bank_transfer', 'mercadopago'],
            default: 'paypal'
        },
        
        // PayPal
        paypalEmail: {
            type: String,
            default: ''
        },
        
        // Transferencia bancaria
        bankAccount: {
            bankName: String,
            accountNumber: String,
            accountType: { type: String, enum: ['checking', 'savings'] },
            routingNumber: String,
            swiftCode: String,
            country: String
        },
        
        // MercadoPago (LATAM)
        mercadopagoEmail: String,

        // Mínimo para retiro
        minimumPayout: {
            type: Number,
            default: 50  // USD por defecto
        },
        
        // Moneda preferida
        currency: {
            type: String,
            default: 'USD'
        }
    },

    // === ESTADÍSTICAS ===
    stats: {
        totalClasses: {
            type: Number,
            default: 0
        },
        classesWithClients: {
            type: Number,
            default: 0
        },
        classesWithGuests: {
            type: Number,
            default: 0
        },
        averageClassValue: {
            type: Number,
            default: 0
        },
        lastClassAt: Date,
        lastPayoutAt: Date
    },

    // === METADATA ===
    status: {
        type: String,
        enum: ['active', 'suspended', 'frozen'],
        default: 'active'
    },

    // Última vez que se recalculó desde Ledger
    lastReconciliation: {
        type: Date,
        default: Date.now
    },

    // Checksum del balance (para integridad)
    balanceChecksum: String,

    createdAt: {
        type: Date,
        default: Date.now
    },

    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// === ÍNDICES ===
walletSchema.index({ 'balance.available': 1 });
walletSchema.index({ status: 1 });

// === MÉTODOS DE INSTANCIA ===

/**
 * Recalcular balance desde el Ledger (fuente de verdad)
 */
walletSchema.methods.recalculateFromLedger = async function() {
    const LedgerEntry = mongoose.model('LedgerEntry');
    
    const aggregation = await LedgerEntry.aggregate([
        { $match: { walletId: this._id } },
        {
            $group: {
                _id: null,
                totalCredits: {
                    $sum: {
                        $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0]
                    }
                },
                totalDebits: {
                    $sum: {
                        $cond: [{ $eq: ['$type', 'debit'] }, '$amount', 0]
                    }
                },
                pendingCredits: {
                    $sum: {
                        $cond: [
                            { $and: [
                                { $eq: ['$type', 'credit'] },
                                { $eq: ['$status', 'pending'] }
                            ]},
                            '$amount',
                            0
                        ]
                    }
                }
            }
        }
    ]);

    const result = aggregation[0] || { totalCredits: 0, totalDebits: 0, pendingCredits: 0 };
    
    this.balance.totalEarned = result.totalCredits;
    this.balance.totalWithdrawn = result.totalDebits;
    this.balance.pending = result.pendingCredits;
    this.balance.available = result.totalCredits - result.totalDebits - result.pendingCredits;
    
    this.lastReconciliation = new Date();
    this.balanceChecksum = this.generateChecksum();
    
    await this.save();
    return this.balance;
};

/**
 * Generar checksum para validar integridad
 */
walletSchema.methods.generateChecksum = function() {
    const crypto = require('crypto');
    const data = `${this._id}:${this.balance.available}:${this.balance.pending}:${this.balance.totalEarned}`;
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
};

/**
 * Validar checksum
 */
walletSchema.methods.validateChecksum = function() {
    return this.balanceChecksum === this.generateChecksum();
};

// === MÉTODOS ESTÁTICOS ===

/**
 * Obtener o crear wallet para un usuario
 */
walletSchema.statics.getOrCreate = async function(userId) {
    let wallet = await this.findOne({ ownerId: userId });
    
    if (!wallet) {
        wallet = await this.create({
            ownerId: userId,
            ownerType: 'teacher'
        });
        console.log(`[Wallet] Nueva billetera creada para usuario ${userId}`);
    }
    
    return wallet;
};

/**
 * Obtener wallets con balance disponible para pago
 */
walletSchema.statics.getPayableWallets = async function() {
    return this.find({
        status: 'active',
        'balance.available': { $gte: 50 }  // Mínimo $50 USD
    }).populate('ownerId', 'name email');
};

module.exports = mongoose.model('Wallet', walletSchema);
