/**
 * Script para verificar un pago de PayPal manualmente
 * Uso: node test-verify-payment.js <orderId>
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';

async function verifyPayment(orderId) {
    console.log(`\n🔍 Verificando pago: ${orderId}...`);
    
    try {
        const res = await fetch(`${BASE_URL}/api/welcome-kit/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId })
        });
        
        const data = await res.json();
        
        if (data.success) {
            console.log('\n✅ ¡PAGO VERIFICADO EXITOSAMENTE!');
            console.log('\n📦 Welcome Kit:');
            console.log(`   ID: ${data.welcomeKit.id}`);
            console.log(`   Estado: ${data.welcomeKit.status}`);
            console.log(`   Tipo: ${data.welcomeKit.kitType}`);
            
            if (data.welcomeKit.products && data.welcomeKit.products.length > 0) {
                console.log(`   Productos: ${data.welcomeKit.products.length}`);
                data.welcomeKit.products.forEach(p => {
                    console.log(`      - ${p.name}: $${p.priceAtPurchase}`);
                });
            }
            
            if (data.welcomeKit.shipping) {
                console.log(`   Envío: ${data.welcomeKit.shipping.city}, ${data.welcomeKit.shipping.country}`);
            }
            
            console.log('\n👤 Usuario creado:');
            console.log(`   ID: ${data.user.id}`);
            console.log(`   Nombre: ${data.user.name}`);
            console.log(`   Email: ${data.user.email}`);
            console.log(`   Rol: ${data.user.role}`);
            
            if (data.student) {
                console.log('\n🎓 Estudiante (beneficiario):');
                console.log(`   ID: ${data.student.id}`);
                console.log(`   Nombre: ${data.student.name}`);
                console.log(`   Email: ${data.student.email}`);
            }
            
            console.log('\n📋 Próximos pasos:');
            data.nextSteps.forEach((step, i) => {
                console.log(`   ${i + 1}. ${step}`);
            });
            
            console.log('\n✨ El flujo se completó exitosamente');
            
        } else {
            console.error('\n❌ Error verificando pago:', data.error);
            if (data.status) {
                console.log(`   Estado actual: ${data.status}`);
            }
        }
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
    }
}

// Obtener orderId de argumentos
const orderId = process.argv[2];

if (!orderId) {
    console.error('❌ Uso: node test-verify-payment.js <orderId>');
    console.log('   Ejemplo: node test-verify-payment.js 8XV12345ABC123XY');
    process.exit(1);
}

verifyPayment(orderId);
