/* createAdmin.js */
require('dotenv').config();
const connectDB = require('./config/db');
const User = require('./models/User');

const adminData = {
    name: "Super Admin",        // Puedes poner tu nombre
    email: "admin@pianolink.com", // Tu correo real
    password: "adminpassword123", // ¡CAMBIA ESTO por tu contraseña deseada!
    role: "admin",
    slug: "admin-master",
    branding: {
        bio: "Cuenta Maestra",
        logoUrl: "https://pianolink.com/assets/logo-pianolink.jpg"
    }
};

const importData = async () => {
    try {
        await connectDB();
        
        // Verificamos si ya existe para no duplicarlo
        const exists = await User.findOne({ email: adminData.email });
        if (exists) {
            console.log('⚠️ El usuario ya existe.');
            process.exit();
        }

        await User.create(adminData);
        console.log('✅ ¡Usuario Admin creado exitosamente en MongoDB Atlas!');
        process.exit();
    } catch (error) {
        console.error(`❌ Error: ${error}`);
        process.exit(1);
    }
};

importData();
