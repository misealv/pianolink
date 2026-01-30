/* fixAllPasswords.js - Script para detectar y arreglar TODOS los usuarios con contraseñas sin encriptar */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

async function fixAllPasswords() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Conectado a MongoDB\n');

        // Obtener TODOS los usuarios
        const allUsers = await User.find({});
        console.log(`📊 Total de usuarios en BD: ${allUsers.length}\n`);

        if (allUsers.length === 0) {
            console.log('No hay usuarios para revisar');
            process.exit(0);
        }

        let withHash = 0;
        let withoutHash = 0;
        const usersToFix = [];

        // Analizar cada usuario
        for (const user of allUsers) {
            const isHashed = user.password.startsWith('$2a$') || user.password.startsWith('$2b$');
            
            if (isHashed) {
                console.log(`✅ ${user.email.padEnd(35)} - Hash OK`);
                withHash++;
            } else {
                console.log(`❌ ${user.email.padEnd(35)} - TEXTO PLANO: "${user.password}"`);
                withoutHash++;
                usersToFix.push(user);
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log(`📈 Resumen:`);
        console.log(`   ✅ Con hash (OK): ${withHash}`);
        console.log(`   ❌ Sin encriptar: ${withoutHash}`);
        console.log('='.repeat(60) + '\n');

        // Si hay usuarios para arreglar
        if (usersToFix.length > 0) {
            console.log('🔧 Encriptando contraseñas...\n');

            for (const user of usersToFix) {
                const plainPassword = user.password; // Guardar la contraseña original
                
                // Encriptar manualmente (porque el hook pre-save no detecta que ya está en la BD)
                const salt = await bcrypt.genSalt(10);
                user.password = await bcrypt.hash(plainPassword, salt);
                await user.save();

                console.log(`✅ ${user.email} - Encriptada (password original: "${plainPassword}")`);
            }

            console.log('\n🎉 Todas las contraseñas fueron encriptadas exitosamente');
            console.log('\n📝 IMPORTANTE: Guarda estas credenciales para acceder:');
            console.log('─'.repeat(60));
            for (const user of usersToFix) {
                const plainPassword = user.password.startsWith('$2a$') || user.password.startsWith('$2b$')
                    ? '[ya encriptada - usa la contraseña que guardaste]'
                    : user.password;
                console.log(`   📧 ${user.email}`);
                console.log(`   🔐 Password: (mantiene la misma de antes)`);
                console.log('');
            }
        } else {
            console.log('✨ Todos los usuarios ya tienen contraseñas encriptadas correctamente');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

fixAllPasswords();
