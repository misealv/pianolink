/**
 * activate-membership.js
 * Script para activar manualmente la membresía de un profesor
 * 
 * Uso: node activate-membership.js miseal@gmail.com
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const email = process.argv[2];

if (!email) {
    console.error('❌ Debes proporcionar un email');
    console.log('Uso: node activate-membership.js email@ejemplo.com');
    process.exit(1);
}

async function activateMembership() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Conectado a MongoDB');

        const user = await User.findOne({ email: email });
        
        if (!user) {
            console.error(`❌ Usuario no encontrado: ${email}`);
            process.exit(1);
        }

        if (user.role !== 'teacher') {
            console.error(`❌ El usuario no es profesor: ${email}`);
            process.exit(1);
        }

        // Activar membresía por 1 mes
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 1);

        await User.findByIdAndUpdate(user._id, {
            'teacherData.subscriptionStatus': 'active',
            'teacherData.subscriptionExpiresAt': expiresAt
        });

        console.log('✅ Membresía activada exitosamente');
        console.log(`   Email: ${email}`);
        console.log(`   Estado: active`);
        console.log(`   Expira: ${expiresAt.toLocaleDateString()}`);
        console.log(`   Es fundador: ${user.isFoundingMember ? 'Sí' : 'No'}`);

        process.exit(0);

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

activateMembership();
