/**
 * Script para simular verificación exitosa de pago
 * Esto bypasses PayPal y simula lo que pasaría después de un pago real
 * 
 * Uso: node test-simulate-payment.js <welcomeKitId>
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const WelcomeKit = require('./models/WelcomeKit');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/pianolink';

async function simulatePaymentVerification(welcomeKitId) {
    console.log('\n🧪 SIMULACIÓN: Verificación de pago exitoso');
    console.log('============================================\n');
    
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Conectado a MongoDB\n');
        
        // Buscar el WelcomeKit
        const welcomeKit = await WelcomeKit.findById(welcomeKitId);
        
        if (!welcomeKit) {
            console.error('❌ WelcomeKit no encontrado:', welcomeKitId);
            return;
        }
        
        console.log('📦 WelcomeKit encontrado:');
        console.log(`   ID: ${welcomeKit._id}`);
        console.log(`   Tipo: ${welcomeKit.kitType}`);
        console.log(`   Estado actual: ${welcomeKit.overallStatus}`);
        console.log(`   Monto: ${welcomeKit.payment.currency} ${welcomeKit.payment.amount}`);
        
        // Obtener datos del checkout
        const checkoutData = welcomeKit.get('_checkoutData') || {};
        console.log('\n👤 Datos del checkout:');
        console.log(`   Nombre: ${checkoutData.name || 'N/A'}`);
        console.log(`   Email: ${checkoutData.email || 'N/A'}`);
        console.log(`   WhatsApp: ${checkoutData.whatsapp || 'N/A'}`);
        console.log(`   Tipo estudiante: ${checkoutData.studentType || 'self'}`);
        
        if (checkoutData.beneficiaryName) {
            console.log(`   Beneficiario: ${checkoutData.beneficiaryName} (${checkoutData.beneficiaryAge} años)`);
        }
        
        // Simular verificación de pago completada
        console.log('\n💳 Simulando pago completado...');
        
        welcomeKit.payment.paidAt = new Date();
        if (welcomeKit.shipping?.status === 'pending_payment') {
            welcomeKit.shipping.status = 'processing';
        }
        welcomeKit.overallStatus = 'paid';
        
        const payerEmail = checkoutData.email;
        const payerName = checkoutData.name;
        const studentType = checkoutData.studentType || 'self';
        
        // Crear usuario
        let user = await User.findOne({ email: payerEmail?.toLowerCase() });
        let student = null;
        
        if (!user && payerEmail) {
            const tempPassword = Math.random().toString(36).slice(-8);
            
            if (studentType === 'self') {
                // El comprador es el estudiante
                user = await User.create({
                    name: payerName || 'Estudiante',
                    email: payerEmail.toLowerCase(),
                    password: tempPassword,
                    whatsapp: checkoutData.whatsapp || '',
                    country: welcomeKit.shipping?.address?.country || 'N/A',
                    role: 'student',
                    studentData: {
                        source: 'platform',
                        level: 'beginner',
                        age: checkoutData.beneficiaryAge || null
                    },
                    kitPurchased: true,
                    kitPurchaseDate: new Date()
                });
                
                student = user;
                console.log(`\n🎹 ✅ ESTUDIANTE CREADO:`);
                console.log(`   ID: ${user._id}`);
                console.log(`   Nombre: ${user.name}`);
                console.log(`   Email: ${user.email}`);
                console.log(`   Rol: ${user.role}`);
                console.log(`   Contraseña temporal: ${tempPassword}`);
                
            } else {
                // El comprador es un apoderado (guardian)
                user = await User.create({
                    name: payerName || 'Apoderado',
                    email: payerEmail.toLowerCase(),
                    password: tempPassword,
                    whatsapp: checkoutData.whatsapp || '',
                    country: welcomeKit.shipping?.address?.country || 'N/A',
                    role: 'client',
                    clientData: {
                        accountType: 'guardian',
                        managedStudents: []
                    },
                    kitPurchased: true,
                    kitPurchaseDate: new Date()
                });
                
                console.log(`\n👤 ✅ APODERADO CREADO:`);
                console.log(`   ID: ${user._id}`);
                console.log(`   Nombre: ${user.name}`);
                console.log(`   Email: ${user.email}`);
                console.log(`   Rol: ${user.role}`);
                console.log(`   Contraseña temporal: ${tempPassword}`);
                
                // Crear cuenta de estudiante (beneficiario/hijo)
                if (checkoutData.beneficiaryName) {
                    const studentPassword = Math.random().toString(36).slice(-8);
                    const studentEmail = `student_${user._id.toString().slice(-6)}_${Date.now()}@pianolink.student`;
                    
                    student = await User.create({
                        name: checkoutData.beneficiaryName,
                        email: studentEmail,
                        password: studentPassword,
                        role: 'student',
                        country: user.country,
                        studentData: {
                            source: 'platform',
                            accountHolder: user._id,
                            age: checkoutData.beneficiaryAge || null,
                            level: 'beginner'
                        }
                    });
                    
                    // Agregar estudiante a la lista del apoderado
                    user.clientData.managedStudents.push(student._id);
                    await user.save();
                    
                    welcomeKit.beneficiaryId = student._id;
                    
                    console.log(`\n🎓 ✅ ESTUDIANTE (HIJO) CREADO:`);
                    console.log(`   ID: ${student._id}`);
                    console.log(`   Nombre: ${student.name}`);
                    console.log(`   Email: ${student.email}`);
                    console.log(`   Edad: ${checkoutData.beneficiaryAge || 'N/A'}`);
                    console.log(`   Apoderado: ${user.name} (${user._id})`);
                    console.log(`   Contraseña temporal: ${studentPassword}`);
                }
            }
        } else if (user) {
            console.log(`\n👤 Usuario ya existía: ${user.email}`);
            user.kitPurchased = true;
            user.kitPurchaseDate = new Date();
            await user.save();
        }
        
        // Vincular usuario al WelcomeKit
        if (user) {
            welcomeKit.clientId = user._id;
        }
        
        await welcomeKit.save();
        
        console.log('\n✅ ========================================');
        console.log('✅ SIMULACIÓN COMPLETADA EXITOSAMENTE');
        console.log('✅ ========================================');
        
        console.log('\n📋 Resumen:');
        console.log(`   WelcomeKit: ${welcomeKit._id}`);
        console.log(`   Estado: ${welcomeKit.overallStatus}`);
        console.log(`   Usuario principal: ${user?.email || 'N/A'} (${user?.role || 'N/A'})`);
        if (student && student._id.toString() !== user?._id.toString()) {
            console.log(`   Estudiante beneficiario: ${student.name} (${student.email})`);
        }
        
        console.log('\n🎉 El flujo completo funcionó correctamente!');
        console.log('   El usuario puede ahora iniciar sesión con su email y contraseña temporal.');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Desconectado de MongoDB');
    }
}

// Obtener welcomeKitId de argumentos
const welcomeKitId = process.argv[2];

if (!welcomeKitId) {
    console.error('❌ Uso: node test-simulate-payment.js <welcomeKitId>');
    console.log('   Ejemplo: node test-simulate-payment.js 6982958036f1cfd0be6862d2');
    process.exit(1);
}

simulatePaymentVerification(welcomeKitId);
