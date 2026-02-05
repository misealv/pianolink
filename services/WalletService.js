/**
 * services/WalletService.js
 * Servicio de Billetera y Libro Contable - PianoLink v4.3
 * 
 * PRINCIPIOS:
 * 1. Inmutabilidad: El balance NUNCA se edita directamente
 * 2. Append-Only Ledger: Solo se agregan entradas, nunca se eliminan
 * 3. Atomicidad: Todas las operaciones usan transacciones MongoDB
 * 4. Trazabilidad: Cada movimiento tiene referencia a su origen
 */

const mongoose = require('mongoose');
const Wallet = require('../models/Wallet');
const LedgerEntry = require('../models/LedgerEntry');
const User = require('../models/User');

class WalletService {

    // ============================================
    // GESTIÓN DE WALLETS
    // ============================================

    /**
     * Obtener o crear wallet para un profesor
     */
    static async getOrCreateWallet(teacherId) {
        let wallet = await Wallet.findOne({ ownerId: teacherId });

        if (!wallet) {
            wallet = await Wallet.create({
                ownerId: teacherId,
                ownerType: 'teacher',
                balance: {
                    available: 0,
                    pending: 0,
                    totalEarned: 0,
                    totalWithdrawn: 0
                }
            });
            console.log(`[WalletService] 💳 Nueva wallet creada para teacher: ${teacherId}`);
        }

        return wallet;
    }

    /**
     * Obtener wallet con estadísticas calculadas
     */
    static async getWalletWithStats(teacherId) {
        const wallet = await this.getOrCreateWallet(teacherId);

        // Recalcular balance desde el ledger (fuente de verdad)
        const calculatedBalance = await this.calculateBalanceFromLedger(wallet._id);

        return {
            wallet,
            calculatedBalance,
            isConsistent: this.checkBalanceConsistency(wallet.balance, calculatedBalance)
        };
    }

    /**
     * Calcular balance directamente desde el Ledger (fuente de verdad)
     */
    static async calculateBalanceFromLedger(walletId) {
        const result = await LedgerEntry.aggregate([
            { $match: { walletId: new mongoose.Types.ObjectId(walletId), status: 'confirmed' } },
            {
                $group: {
                    _id: '$type',
                    total: { $sum: '$amount' }
                }
            }
        ]);

        const credits = result.find(r => r._id === 'credit')?.total || 0;
        const debits = result.find(r => r._id === 'debit')?.total || 0;

        // Obtener pendientes
        const pendingResult = await LedgerEntry.aggregate([
            { 
                $match: { 
                    walletId: new mongoose.Types.ObjectId(walletId), 
                    status: 'pending',
                    type: 'credit'
                } 
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        const pending = pendingResult[0]?.total || 0;

        return {
            available: credits - debits,
            pending: pending,
            totalEarned: credits,
            totalWithdrawn: debits
        };
    }

    /**
     * Verificar consistencia entre balance cacheado y calculado
     */
    static checkBalanceConsistency(cached, calculated) {
        const tolerance = 0.01; // Tolerancia de 1 centavo
        return Math.abs(cached.available - calculated.available) < tolerance &&
               Math.abs(cached.pending - calculated.pending) < tolerance;
    }

    // ============================================
    // OPERACIONES DE LEDGER (INMUTABLES)
    // ============================================

    /**
     * Registrar ganancia por clase completada
     * @returns {Object} - Entrada del ledger creada
     */
    static async recordClassEarning({
        teacherId,
        classRecordId,
        grossAmount,
        platformFee,
        netAmount,
        currency = 'USD',
        description = '',
        isPending = false
    }) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const wallet = await this.getOrCreateWallet(teacherId);

            // Obtener siguiente número de secuencia
            const sequenceNumber = await this.getNextSequenceNumber();

            // Crear entrada en el ledger
            const ledgerEntry = await LedgerEntry.create([{
                sequenceNumber,
                walletId: wallet._id,
                type: 'credit',
                category: 'class_earning',
                amount: netAmount,
                currency,
                status: isPending ? 'pending' : 'confirmed',
                reference: {
                    type: 'class_record',
                    documentId: classRecordId
                },
                description: description || `Ganancia por clase (bruto: $${grossAmount/100}, comisión: $${platformFee/100})`,
                metadata: {
                    grossAmount,
                    platformFee,
                    netAmount,
                    teacherPercent: Math.round((netAmount / grossAmount) * 100)
                }
            }], { session });

            // Actualizar balance cacheado en wallet
            const updateField = isPending ? 'balance.pending' : 'balance.available';
            await Wallet.findByIdAndUpdate(wallet._id, {
                $inc: {
                    [updateField]: netAmount,
                    'balance.totalEarned': isPending ? 0 : netAmount
                },
                lastTransactionAt: new Date()
            }, { session });

            await session.commitTransaction();

            console.log(`[WalletService] 💰 Ganancia registrada: $${netAmount/100} ${currency} para wallet ${wallet._id}`);

            return {
                success: true,
                ledgerEntry: ledgerEntry[0],
                walletId: wallet._id
            };

        } catch (error) {
            await session.abortTransaction();
            console.error('[WalletService] Error registrando ganancia:', error.message);
            return { success: false, error: error.message };
        } finally {
            session.endSession();
        }
    }

    /**
     * Registrar pago externo (alumno invitado con membresía del profesor)
     * No genera transacción financiera, solo tracking
     */
    static async recordExternalClass({
        teacherId,
        classRecordId,
        duration,
        studentName,
        description = ''
    }) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const wallet = await this.getOrCreateWallet(teacherId);
            const sequenceNumber = await this.getNextSequenceNumber();

            // Crear entrada de tracking (monto 0, solo para estadísticas)
            const ledgerEntry = await LedgerEntry.create([{
                sequenceNumber,
                walletId: wallet._id,
                type: 'credit',
                category: 'class_earning',
                amount: 0,  // Sin impacto financiero
                currency: 'USD',
                status: 'confirmed',
                reference: {
                    type: 'class_record',
                    documentId: classRecordId
                },
                description: description || `Clase con alumno invitado: ${studentName} (pago externo/membresía)`,
                metadata: {
                    isExternalPayment: true,
                    studentName,
                    duration,
                    billingType: 'external'
                }
            }], { session });

            // Solo actualizar estadísticas, no balance
            await Wallet.findByIdAndUpdate(wallet._id, {
                $inc: { 'stats.totalClasses': 1 },
                lastTransactionAt: new Date()
            }, { session });

            await session.commitTransaction();

            console.log(`[WalletService] 📝 Clase externa registrada para wallet ${wallet._id}`);

            return {
                success: true,
                ledgerEntry: ledgerEntry[0],
                walletId: wallet._id
            };

        } catch (error) {
            await session.abortTransaction();
            console.error('[WalletService] Error registrando clase externa:', error.message);
            return { success: false, error: error.message };
        } finally {
            session.endSession();
        }
    }

    /**
     * Confirmar fondos pendientes (mover de pending a available)
     */
    static async confirmPendingFunds(ledgerEntryId) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const entry = await LedgerEntry.findById(ledgerEntryId);
            if (!entry) throw new Error('Entrada no encontrada');
            if (entry.status !== 'pending') throw new Error('Entrada no está pendiente');

            // Actualizar estado de la entrada
            entry.status = 'confirmed';
            entry.confirmedAt = new Date();
            await entry.save({ session });

            // Mover de pending a available en wallet
            await Wallet.findByIdAndUpdate(entry.walletId, {
                $inc: {
                    'balance.pending': -entry.amount,
                    'balance.available': entry.amount,
                    'balance.totalEarned': entry.amount
                }
            }, { session });

            await session.commitTransaction();

            console.log(`[WalletService] ✅ Fondos confirmados: $${entry.amount/100}`);

            return { success: true, entry };

        } catch (error) {
            await session.abortTransaction();
            console.error('[WalletService] Error confirmando fondos:', error.message);
            return { success: false, error: error.message };
        } finally {
            session.endSession();
        }
    }

    /**
     * Registrar retiro (débito)
     */
    static async recordWithdrawal({
        teacherId,
        withdrawalId,
        amount,
        currency = 'USD',
        method,  // 'stripe', 'paypal', 'bank_transfer'
        externalReference = null,
        description = ''
    }) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const wallet = await this.getOrCreateWallet(teacherId);

            // Verificar fondos suficientes
            if (wallet.balance.available < amount) {
                throw new Error(`Fondos insuficientes. Disponible: $${wallet.balance.available/100}, Solicitado: $${amount/100}`);
            }

            const sequenceNumber = await this.getNextSequenceNumber();

            // Crear débito en ledger
            const ledgerEntry = await LedgerEntry.create([{
                sequenceNumber,
                walletId: wallet._id,
                type: 'debit',
                category: 'withdrawal',
                amount,
                currency,
                status: 'confirmed',
                reference: {
                    type: 'withdrawal',
                    documentId: withdrawalId
                },
                description: description || `Retiro vía ${method}`,
                metadata: {
                    method,
                    externalReference
                }
            }], { session });

            // Actualizar balance
            await Wallet.findByIdAndUpdate(wallet._id, {
                $inc: {
                    'balance.available': -amount,
                    'balance.totalWithdrawn': amount
                },
                lastTransactionAt: new Date()
            }, { session });

            await session.commitTransaction();

            console.log(`[WalletService] 💸 Retiro registrado: $${amount/100} ${currency}`);

            return {
                success: true,
                ledgerEntry: ledgerEntry[0],
                newBalance: wallet.balance.available - amount
            };

        } catch (error) {
            await session.abortTransaction();
            console.error('[WalletService] Error registrando retiro:', error.message);
            return { success: false, error: error.message };
        } finally {
            session.endSession();
        }
    }

    /**
     * Reversar una entrada (para correcciones)
     */
    static async reverseEntry(originalEntryId, reason) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const originalEntry = await LedgerEntry.findById(originalEntryId);
            if (!originalEntry) throw new Error('Entrada original no encontrada');
            if (originalEntry.status === 'reversed') throw new Error('Entrada ya fue reversada');

            const sequenceNumber = await this.getNextSequenceNumber();

            // Crear entrada inversa
            const reversalEntry = await LedgerEntry.create([{
                sequenceNumber,
                walletId: originalEntry.walletId,
                type: originalEntry.type === 'credit' ? 'debit' : 'credit',
                category: originalEntry.category.includes('reversal') 
                    ? originalEntry.category 
                    : `${originalEntry.category}_reversal`,
                amount: originalEntry.amount,
                currency: originalEntry.currency,
                status: 'confirmed',
                reference: {
                    type: 'manual',
                    documentId: originalEntryId
                },
                description: `REVERSO: ${reason}`,
                metadata: {
                    reversedEntryId: originalEntryId,
                    originalCategory: originalEntry.category,
                    reversalReason: reason
                }
            }], { session });

            // Marcar original como reversada
            originalEntry.status = 'reversed';
            originalEntry.reversedBy = reversalEntry[0]._id;
            originalEntry.reversedAt = new Date();
            await originalEntry.save({ session });

            // Actualizar balance
            const balanceChange = originalEntry.type === 'credit' ? -originalEntry.amount : originalEntry.amount;
            await Wallet.findByIdAndUpdate(originalEntry.walletId, {
                $inc: { 'balance.available': balanceChange }
            }, { session });

            await session.commitTransaction();

            console.log(`[WalletService] 🔄 Entrada ${originalEntryId} reversada`);

            return {
                success: true,
                reversalEntry: reversalEntry[0],
                originalEntry
            };

        } catch (error) {
            await session.abortTransaction();
            console.error('[WalletService] Error reversando entrada:', error.message);
            return { success: false, error: error.message };
        } finally {
            session.endSession();
        }
    }

    // ============================================
    // CONSULTAS Y REPORTES
    // ============================================

    /**
     * Obtener historial del ledger
     */
    static async getLedgerHistory(walletId, options = {}) {
        const {
            limit = 50,
            skip = 0,
            category = null,
            startDate = null,
            endDate = null
        } = options;

        const query = { walletId: new mongoose.Types.ObjectId(walletId) };

        if (category) query.category = category;
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        const [entries, total] = await Promise.all([
            LedgerEntry.find(query)
                .sort({ sequenceNumber: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            LedgerEntry.countDocuments(query)
        ]);

        return {
            entries,
            pagination: {
                total,
                limit,
                skip,
                hasMore: skip + entries.length < total
            }
        };
    }

    /**
     * Obtener resumen mensual
     */
    static async getMonthlySummary(walletId, year, month) {
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);

        const result = await LedgerEntry.aggregate([
            {
                $match: {
                    walletId: new mongoose.Types.ObjectId(walletId),
                    createdAt: { $gte: startDate, $lte: endDate },
                    status: { $in: ['confirmed', 'pending'] }
                }
            },
            {
                $group: {
                    _id: { type: '$type', category: '$category' },
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        // Procesar resultados
        const summary = {
            period: { year, month },
            earnings: { total: 0, classes: 0 },
            withdrawals: { total: 0, count: 0 },
            fees: { total: 0 },
            externalClasses: 0
        };

        for (const item of result) {
            if (item._id.category === 'class_earning') {
                summary.earnings.total += item.total;
                summary.earnings.classes += item.count;
            } else if (item._id.category === 'withdrawal') {
                summary.withdrawals.total += item.total;
                summary.withdrawals.count += item.count;
            } else if (item._id.category === 'platform_fee') {
                summary.fees.total += item.total;
            }
        }

        // Contar clases externas
        const externalCount = await LedgerEntry.countDocuments({
            walletId: new mongoose.Types.ObjectId(walletId),
            createdAt: { $gte: startDate, $lte: endDate },
            'metadata.isExternalPayment': true
        });
        summary.externalClasses = externalCount;

        return summary;
    }

    // ============================================
    // UTILIDADES
    // ============================================

    /**
     * Obtener siguiente número de secuencia (atómico)
     */
    static async getNextSequenceNumber() {
        const lastEntry = await LedgerEntry.findOne()
            .sort({ sequenceNumber: -1 })
            .select('sequenceNumber')
            .lean();

        return (lastEntry?.sequenceNumber || 0) + 1;
    }

    /**
     * Auditoría: Verificar integridad de todas las wallets
     */
    static async auditAllWallets() {
        const wallets = await Wallet.find({ ownerType: 'teacher' });
        const results = [];

        for (const wallet of wallets) {
            const calculated = await this.calculateBalanceFromLedger(wallet._id);
            const isConsistent = this.checkBalanceConsistency(wallet.balance, calculated);

            if (!isConsistent) {
                results.push({
                    walletId: wallet._id,
                    ownerId: wallet.ownerId,
                    cached: wallet.balance,
                    calculated,
                    diff: {
                        available: wallet.balance.available - calculated.available,
                        pending: wallet.balance.pending - calculated.pending
                    }
                });
            }
        }

        console.log(`[WalletService] 🔍 Auditoría completada: ${results.length} inconsistencias de ${wallets.length} wallets`);

        return {
            totalWallets: wallets.length,
            inconsistencies: results.length,
            details: results
        };
    }

    /**
     * Reparar wallet inconsistente
     */
    static async repairWallet(walletId) {
        const calculated = await this.calculateBalanceFromLedger(walletId);

        await Wallet.findByIdAndUpdate(walletId, {
            balance: calculated,
            lastAuditAt: new Date()
        });

        console.log(`[WalletService] 🔧 Wallet ${walletId} reparada`);

        return { success: true, newBalance: calculated };
    }
}

module.exports = WalletService;
