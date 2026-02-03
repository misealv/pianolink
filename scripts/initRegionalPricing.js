/**
 * scripts/initRegionalPricing.js
 * Inicializa los precios regionales en GlobalConfig
 * 
 * Ejecutar: node scripts/initRegionalPricing.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const GlobalConfig = require('../models/GlobalConfig');

const REGIONAL_PRICING = {
    welcomeKit: [
        { regionCode: 'CL', price: 45, currency: 'USD', includesShipping: true, shippingDays: '3-5 días hábiles' },
        { regionCode: 'AR', price: 35, currency: 'USD', includesShipping: true, shippingDays: '5-10 días hábiles' },
        { regionCode: 'ES', price: 55, currency: 'EUR', includesShipping: true, shippingDays: '2-4 días hábiles' },
        { regionCode: 'MX', price: 40, currency: 'USD', includesShipping: true, shippingDays: '5-7 días hábiles' },
        { regionCode: 'US', price: 50, currency: 'USD', includesShipping: true, shippingDays: '3-5 business days' },
        { regionCode: 'DEFAULT', price: 55, currency: 'USD', includesShipping: false, shippingDays: '7-15 días' }
    ],
    
    studentMembership: [
        { regionCode: 'CL', price: 100, currency: 'USD', classesIncluded: 4 },
        { regionCode: 'AR', price: 60, currency: 'USD', classesIncluded: 4 },
        { regionCode: 'ES', price: 120, currency: 'EUR', classesIncluded: 4 },
        { regionCode: 'MX', price: 80, currency: 'USD', classesIncluded: 4 },
        { regionCode: 'US', price: 150, currency: 'USD', classesIncluded: 4 },
        { regionCode: 'DEFAULT', price: 100, currency: 'USD', classesIncluded: 4 }
    ],
    
    teacherSubscription: {
        regular: 20,
        founder: 10,
        currency: 'USD'
    },
    
    platformCommission: 20,
    teacherCommission: 80
};

async function initPricing() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Conectado a MongoDB');
        
        let config = await GlobalConfig.findOne({ isDefault: true });
        
        if (!config) {
            config = new GlobalConfig({ isDefault: true });
            console.log('📝 Creando nueva configuración global...');
        } else {
            console.log('📝 Actualizando configuración existente...');
        }
        
        config.regionalPricing = REGIONAL_PRICING;
        
        await config.save();
        
        console.log('\n✅ Precios regionales configurados:');
        console.log('\n🎁 Welcome Kit:');
        REGIONAL_PRICING.welcomeKit.forEach(p => {
            console.log(`   ${p.regionCode}: ${p.currency} ${p.price} (${p.shippingDays})`);
        });
        
        console.log('\n📚 Membresía Alumno (4 clases/mes):');
        REGIONAL_PRICING.studentMembership.forEach(p => {
            console.log(`   ${p.regionCode}: ${p.currency} ${p.price}`);
        });
        
        console.log('\n👨‍🏫 Suscripción Profesor:');
        console.log(`   Regular: USD ${REGIONAL_PRICING.teacherSubscription.regular}`);
        console.log(`   Fundador: USD ${REGIONAL_PRICING.teacherSubscription.founder}`);
        
        console.log('\n💰 Comisiones:');
        console.log(`   Plataforma: ${REGIONAL_PRICING.platformCommission}%`);
        console.log(`   Profesor: ${REGIONAL_PRICING.teacherCommission}%`);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

initPricing();
