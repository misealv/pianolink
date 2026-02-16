/**
 * scripts/seedMpCountries.js
 * Crea documentos mp_credentials para los 7 países de MercadoPago con isActive: false
 * (listos para activar cuando se creen las cuentas MP en cada país).
 * 
 * Uso: node scripts/seedMpCountries.js [--dry-run]
 * 
 * Fase 2, Tarea 2.10
 */

require('dotenv').config();
const mongoose = require('mongoose');
const MpCredentials = require('../models/MpCredentials');

const DRY_RUN = process.argv.includes('--dry-run');

// Configuración de los 7 países soportados por MercadoPago
const MP_COUNTRIES = [
    {
        countryCode: 'CL',
        countryName: 'Chile',
        currency: 'CLP',
        payout: {
            enabled: false, // Se activa con migrateMpCredentials.js
            method: 'account_money',
            minPayoutAmount: 1000,
            maxPayoutAmount: 50000000,
            payoutCurrency: 'CLP',
            requiresManualApproval: false
        }
    },
    {
        countryCode: 'MX',
        countryName: 'México',
        currency: 'MXN',
        payout: {
            enabled: false,
            method: 'account_money',
            minPayoutAmount: 50,          // $50 MXN
            maxPayoutAmount: 5000000,     // $50,000 MXN
            payoutCurrency: 'MXN',
            requiresManualApproval: false
        }
    },
    {
        countryCode: 'AR',
        countryName: 'Argentina',
        currency: 'ARS',
        payout: {
            enabled: false,
            method: 'account_money',
            minPayoutAmount: 500,         // $500 ARS
            maxPayoutAmount: 50000000,    // $500,000 ARS
            payoutCurrency: 'ARS',
            requiresManualApproval: false
        }
    },
    {
        countryCode: 'CO',
        countryName: 'Colombia',
        currency: 'COP',
        payout: {
            enabled: false,
            method: 'account_money',
            minPayoutAmount: 5000,        // $5,000 COP
            maxPayoutAmount: 500000000,   // $500,000,000 COP
            payoutCurrency: 'COP',
            requiresManualApproval: false
        }
    },
    {
        countryCode: 'BR',
        countryName: 'Brasil',
        currency: 'BRL',
        payout: {
            enabled: false,
            method: 'account_money',
            minPayoutAmount: 5,           // R$5
            maxPayoutAmount: 5000000,     // R$50,000
            payoutCurrency: 'BRL',
            requiresManualApproval: false
        }
    },
    {
        countryCode: 'PE',
        countryName: 'Perú',
        currency: 'PEN',
        payout: {
            enabled: false,
            method: 'account_money',
            minPayoutAmount: 5,           // S/5
            maxPayoutAmount: 5000000,     // S/50,000
            payoutCurrency: 'PEN',
            requiresManualApproval: false
        }
    },
    {
        countryCode: 'UY',
        countryName: 'Uruguay',
        currency: 'UYU',
        payout: {
            enabled: false,
            method: 'account_money',
            minPayoutAmount: 50,          // $50 UYU
            maxPayoutAmount: 5000000,     // $50,000 UYU
            payoutCurrency: 'UYU',
            requiresManualApproval: false
        }
    }
];

async function seedMpCountries() {
    console.log('=== Seed de Países MercadoPago ===');
    console.log(`Modo: ${DRY_RUN ? 'DRY RUN (sin cambios)' : 'PRODUCCIÓN'}`);
    console.log('');

    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
        console.error('❌ MONGODB_URI no configurada');
        process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Conectado a MongoDB');
    console.log('');

    let created = 0;
    let skipped = 0;

    for (const country of MP_COUNTRIES) {
        const existing = await MpCredentials.findOne({ countryCode: country.countryCode });
        
        if (existing) {
            console.log(`⏭️  ${country.countryCode} (${country.countryName}): Ya existe — ${existing.isActive ? '✅ Activo' : '⬜ Inactivo'}`);
            skipped++;
            continue;
        }

        const seedData = {
            countryCode: country.countryCode,
            countryName: country.countryName,
            currency: country.currency,
            accessToken: 'PENDING_CONFIGURATION',
            publicKey: 'PENDING_CONFIGURATION',
            collector: {
                userId: '',
                email: ''
            },
            payout: country.payout,
            isActive: false,
            webhookSecret: '',
            tokenStatus: 'unknown'
        };

        if (!DRY_RUN) {
            const doc = await MpCredentials.create(seedData);
            console.log(`✅ ${country.countryCode} (${country.countryName}): Creado (inactivo) — ID: ${doc._id}`);
        } else {
            console.log(`   [DRY RUN] ${country.countryCode} (${country.countryName}): Se crearía como inactivo`);
        }
        created++;
    }

    console.log('');
    console.log('=== Resumen ===');
    console.log(`Creados: ${created}`);
    console.log(`Omitidos (ya existían): ${skipped}`);
    
    const total = await MpCredentials.countDocuments();
    const active = await MpCredentials.countDocuments({ isActive: true });
    console.log(`Total en DB: ${total} (${active} activos)`);
    console.log('');
    console.log('📋 Próximos pasos:');
    console.log('   1. Crear cuentas de MercadoPago en cada país');
    console.log('   2. Obtener access_token y public_key de cada cuenta');
    console.log('   3. Actualizar los documentos con las credenciales reales');
    console.log('   4. Cambiar isActive a true para activar el país');
    console.log('   5. Activar payout.enabled cuando se verifique que funciona');

    await mongoose.disconnect();
}

seedMpCountries().catch(err => {
    console.error('❌ Error en seed:', err);
    mongoose.disconnect();
    process.exit(1);
});
