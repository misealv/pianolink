const mongoose = require('mongoose');
require('dotenv').config();

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Conectado a MongoDB\n');
    
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    const WelcomeKit = mongoose.model('WelcomeKit', new mongoose.Schema({}, { strict: false }));
    
    // Buscar usuarios con kitPurchased = true
    const usersWithKit = await User.find({ kitPurchased: true });
    
    console.log('=== USUARIOS CON KIT COMPRADO ===');
    console.log('Total:', usersWithKit.length);
    for (const u of usersWithKit) {
        console.log('\n---');
        console.log('ID:', u._id);
        console.log('Nombre:', u.name);
        console.log('Email:', u.email);
        console.log('Role actual:', u.role);
        console.log('Kit comprado:', u.kitPurchased);
        console.log('Fecha compra:', u.kitPurchaseDate);
        console.log('Clases disponibles:', u.classesRemaining);
        console.log('ClientData:', JSON.stringify(u.clientData, null, 2));
        console.log('StudentData:', JSON.stringify(u.studentData, null, 2));
    }
    
    // También revisar WelcomeKit orders
    const kits = await WelcomeKit.find({}).sort({ createdAt: -1 }).limit(10);
    
    console.log('\n\n=== ÚLTIMAS ÓRDENES DE WELCOME KIT ===');
    console.log('Total órdenes:', kits.length);
    for (const k of kits) {
        const user = await User.findById(k.user);
        console.log('\n---');
        console.log('Order ID:', k._id);
        console.log('Usuario:', user?.name, '-', user?.email);
        console.log('Role del usuario:', user?.role);
        console.log('Estado orden:', k.status);
        console.log('Pago:', k.paymentStatus);
        console.log('Incluye Setup:', k.includesSetupSession);
        console.log('Fecha:', k.createdAt);
    }
    
    // Buscar todos los usuarios con role student o client
    console.log('\n\n=== TODOS LOS ESTUDIANTES Y CLIENTES ===');
    const students = await User.find({ role: { $in: ['student', 'client'] } });
    console.log('Total:', students.length);
    for (const s of students) {
        console.log('\n---');
        console.log('ID:', s._id);
        console.log('Nombre:', s.name);
        console.log('Email:', s.email);
        console.log('Role:', s.role);
        console.log('Clases:', s.classesRemaining);
        console.log('Kit comprado:', s.kitPurchased);
    }
    
    await mongoose.disconnect();
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
