/* fixUserPassword.js - Script para re-encriptar contraseña de un usuario específico */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function fixPassword() {
    try {
        // Conectar a MongoDB
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Conectado a MongoDB');

        // Buscar el usuario
        const email = 'ed.godoygonzalez@gmail.com';
        const user = await User.findOne({ email });

        if (!user) {
            console.log(`❌ Usuario ${email} no encontrado`);
            process.exit(1);
        }

        console.log(`📧 Usuario encontrado: ${user.name} (${user.email})`);
        console.log(`🔐 Contraseña actual: ${user.password.substring(0, 30)}...`);
        
        // Verificar si ya está encriptada (los hashes de bcrypt empiezan con $2a$ o $2b$)
        const isAlreadyHashed = user.password.startsWith('$2a$') || user.password.startsWith('$2b$');
        console.log(`🔍 ¿Ya está encriptada? ${isAlreadyHashed ? 'SÍ' : 'NO'}`);

        if (isAlreadyHashed) {
            console.log('✅ La contraseña ya está correctamente encriptada');
            console.log('✨ Puedes hacer login con:');
            console.log(`   Email: ${email}`);
            console.log(`   Password: cambiame`);
        } else {
            // Forzar la encriptación marcando el campo como modificado
            user.password = 'cambiame';
            user.markModified('password');
            await user.save();

            console.log('✅ Contraseña re-encriptada exitosamente');
            console.log(`🔐 Nueva contraseña (hash): ${user.password.substring(0, 30)}...`);
            console.log('\n✨ Ahora puedes hacer login con:');
            console.log(`   Email: ${email}`);
            console.log(`   Password: cambiame`);
        }
        console.log('\n✨ Ahora puedes hacer login con:');
        console.log(`   Email: ${email}`);
        console.log(`   Password: cambiame`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

fixPassword();
