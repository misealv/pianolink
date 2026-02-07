require('dotenv').config();
const mongoose = require('mongoose');

async function check() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const User = require('./models/User');
    const WelcomeKit = require('./models/WelcomeKit');
    
    const email = 'miguel.antonio.sepulveda.alvarez@gmail.com';
    
    // Buscar usuario
    const user = await User.findOne({ email: email.toLowerCase() });
    console.log('\n=== USUARIO ===');
    if (user) {
        console.log('ID:', user._id);
        console.log('Email:', user.email);
        console.log('Nombre:', user.name, user.lastName);
        console.log('Rol:', user.role);
        console.log('Kit Purchased:', user.kitPurchased);
        console.log('Magic Link Token:', user.magicLinkToken ? 'SÍ (existe)' : 'NO');
        console.log('Classes Remaining:', user.classesRemaining);
    } else {
        console.log('Usuario NO encontrado');
    }
    
    // Buscar WelcomeKits
    const kits = await WelcomeKit.find({ 
        $or: [
            { clientEmail: email.toLowerCase() },
            { clientId: user?._id }
        ]
    }).sort({ createdAt: -1 });
    
    console.log('\n=== WELCOME KITS ===');
    console.log('Total encontrados:', kits.length);
    
    kits.forEach((kit, i) => {
        console.log(`\n--- Kit ${i+1} ---`);
        console.log('ID:', kit._id);
        console.log('Email:', kit.clientEmail);
        console.log('Nombre:', kit.clientName);
        console.log('Tipo:', kit.kitType);
        console.log('Status:', kit.overallStatus);
        console.log('Productos:', kit.products?.length || 0);
        if (kit.products?.length > 0) {
            kit.products.forEach(p => console.log('  -', p.name, '$' + p.priceAtPurchase));
        }
        console.log('Payment:', kit.payment?.provider, kit.payment?.amount, kit.payment?.currency);
        console.log('Creado:', kit.createdAt);
    });
    
    // Ver TODOS los WelcomeKits recientes
    console.log('\n=== ÚLTIMOS 5 WELCOME KITS (CUALQUIER EMAIL) ===');
    const allKits = await WelcomeKit.find().sort({ createdAt: -1 }).limit(5);
    allKits.forEach((kit, i) => {
        console.log(`${i+1}. ${kit.clientEmail} - ${kit.kitType} - ${kit.overallStatus} - Productos: ${kit.products?.length || 0}`);
    });
    
    await mongoose.disconnect();
}

check().catch(e => { console.error(e); process.exit(1); });
