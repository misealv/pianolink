// Script para verificar estado de membresía de profesores
require('dotenv').config();
const mongoose = require('mongoose');

async function check() {
    await mongoose.connect(process.env.MONGO_URI);
    const User = require('./models/User');
    
    const teachers = await User.find({ role: 'teacher' }).select('email name teacherData.subscriptionStatus teacherData.subscriptionExpiresAt isFoundingMember');
    
    console.log('\n📋 ESTADO DE MEMBRESÍA DE PROFESORES:\n');
    
    teachers.forEach(t => {
        const status = t.teacherData?.subscriptionStatus || 'NO STATUS';
        const expires = t.teacherData?.subscriptionExpiresAt;
        const icon = status === 'active' ? '✅' : '❌';
        
        console.log(`${icon} ${t.email}`);
        console.log(`   Status: ${status}`);
        console.log(`   Expira: ${expires ? expires.toISOString() : 'N/A'}`);
        console.log('');
    });
    
    process.exit(0);
}

check().catch(e => { console.error(e); process.exit(1); });
