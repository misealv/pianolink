/**
 * scripts/migrateMpCredentials.js
 * Migra las credenciales de MercadoPago Chile desde .env a la colección mp_credentials.
 * 
 * Uso: node scripts/migrateMpCredentials.js [--dry-run]
 * 
 * Fase 2, Tarea 2.9
 */

require('dotenv').config();
const mongoose = require('mongoose');
const MpCredentials = require('../models/MpCredentials');

const DRY_RUN = process.argv.includes('--dry-run');

async function migrateMpCredentials() {
    console.log('=== Migración de Credenciales MP Chile a DB ===');
    console.log(`Modo: ${DRY_RUN ? 'DRY RUN (sin cambios)' : 'PRODUCCIÓN'}`);
    console.log('');

    // Conectar a MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
        console.error('❌ MONGODB_URI no configurada');
        process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Conectado a MongoDB');

    // Verificar que existen las variables de entorno
    const accessToken = process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN;
    const publicKey = process.env.MP_PUBLIC_KEY || process.env.MERCADOPAGO_PUBLIC_KEY;
    const webhookSecret = process.env.MP_WEBHOOK_SECRET || '';

    if (!accessToken) {
        console.error('❌ No se encontró MP_ACCESS_TOKEN ni MERCADOPAGO_ACCESS_TOKEN en .env');
        await mongoose.disconnect();
        process.exit(1);
    }

    console.log(`🔑 Access Token encontrado: ${accessToken.substring(0, 15)}...`);
    console.log(`🔑 Public Key: ${publicKey ? publicKey.substring(0, 15) + '...' : 'NO ENCONTRADA'}`);
    console.log(`🔑 Webhook Secret: ${webhookSecret ? 'Configurado' : 'No configurado'}`);
    console.log('');

    // Verificar si ya existe
    const existing = await MpCredentials.findOne({ countryCode: 'CL' });
    if (existing) {
        console.log(`⚠️ Ya existen credenciales para Chile (ID: ${existing._id})`);
        console.log(`   Estado: ${existing.isActive ? 'Activo' : 'Inactivo'}`);
        console.log(`   Creado: ${existing.createdAt}`);
        
        if (!DRY_RUN) {
            // Actualizar token si cambió
            existing.accessToken = accessToken;
            if (publicKey) existing.publicKey = publicKey;
            if (webhookSecret) existing.webhookSecret = webhookSecret;
            existing.isActive = true;
            existing.lastTokenCheck = new Date();
            existing.tokenStatus = 'valid';
            await existing.save();
            console.log('✅ Credenciales de Chile actualizadas');
        } else {
            console.log('   [DRY RUN] Se actualizarían las credenciales');
        }
    } else {
        const credentialsData = {
            countryCode: 'CL',
            countryName: 'Chile',
            currency: 'CLP',
            accessToken: accessToken,
            publicKey: publicKey || 'PENDING_CONFIGURATION',
            collector: {
                userId: '',
                email: process.env.MP_COLLECTOR_EMAIL || ''
            },
            payout: {
                enabled: true,
                method: 'account_money',
                minPayoutAmount: 1000,        // $1.000 CLP mínimo
                maxPayoutAmount: 50000000,     // $500.000 CLP máximo
                payoutCurrency: 'CLP',
                requiresManualApproval: false
            },
            isActive: true,
            webhookSecret: webhookSecret,
            lastTokenCheck: new Date(),
            tokenStatus: 'valid'
        };

        if (!DRY_RUN) {
            const doc = await MpCredentials.create(credentialsData);
            console.log(`✅ Credenciales de Chile creadas (ID: ${doc._id})`);
        } else {
            console.log('[DRY RUN] Se crearían las siguientes credenciales:');
            console.log(JSON.stringify(credentialsData, null, 2));
        }
    }

    console.log('');
    console.log('=== Migración completada ===');
    
    // Resumen
    const total = await MpCredentials.countDocuments();
    const active = await MpCredentials.countDocuments({ isActive: true });
    console.log(`Total credenciales en DB: ${total} (${active} activas)`);

    await mongoose.disconnect();
}

migrateMpCredentials().catch(err => {
    console.error('❌ Error en migración:', err);
    mongoose.disconnect();
    process.exit(1);
});
