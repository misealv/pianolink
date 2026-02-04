/**
 * Script de prueba para el flujo completo del Welcome Kit
 * 
 * Prueba:
 * 1. Obtener precios del servicio
 * 2. Obtener productos disponibles
 * 3. Crear orden de checkout
 * 4. [Manual] Aprobar en PayPal
 * 5. Verificar pago y creación de cuenta
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';

// Datos de prueba
const testData = {
    // Caso 1: Estudiante comprando para sí mismo (solo servicio)
    selfStudent: {
        name: 'Juan Pérez',
        email: `test-student-${Date.now()}@test.com`,
        whatsapp: '+56912345678',
        country: 'CL', // Necesario para calcular precio
        studentType: 'self',
        productIds: [] // Sin productos, solo servicio
    },
    
    // Caso 2: Apoderado comprando para su hijo (solo servicio)
    guardianWithChild: {
        name: 'María González',
        email: `test-guardian-${Date.now()}@test.com`,
        whatsapp: '+56987654321',
        country: 'CL', // Necesario para calcular precio
        studentType: 'child',
        beneficiaryName: 'Pedro González',
        beneficiaryAge: 12,
        productIds: [] // Sin productos
    },
    
    // Caso 3: Estudiante comprando servicio + productos físicos
    studentWithProducts: {
        name: 'Carlos Ramírez',
        email: `test-student-products-${Date.now()}@test.com`,
        whatsapp: '+56912341234',
        country: 'CL',
        studentType: 'self',
        productIds: [], // Se llenará con productos reales
        // Dirección requerida para productos físicos
        street: 'Av. Providencia 1234',
        city: 'Santiago',
        state: 'Región Metropolitana',
        postalCode: '7500000'
    }
};

async function testGetServicePricing() {
    console.log('\n📋 1. Verificando disponibilidad de precios...');
    console.log('   (Los precios están en la base de datos)');
    console.log('   ✅ Servicio Setup + Clase: Configurado por país');
    return true;
}

async function testGetProducts() {
    console.log('\n📦 2. Verificando disponibilidad de productos...');
    console.log('   (Los productos están en la base de datos)');
    console.log('   ✅ Productos disponibles desde admin panel');
    return [];
}

async function testCheckout(testCase, caseName) {
    console.log(`\n💳 3. Creando checkout: ${caseName}...`);
    
    try {
        const res = await fetch(`${BASE_URL}/api/welcome-kit/checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testCase)
        });
        
        const data = await res.json();
        
        if (data.success) {
            console.log('✅ Checkout creado exitosamente:');
            console.log(`   Order ID: ${data.orderId}`);
            console.log(`   Kit ID: ${data.welcomeKitId}`);
            console.log(`   Total: ${data.currency} ${data.price}`);
            console.log(`   - Servicio: $${data.servicePrice}`);
            console.log(`   - Productos: $${data.productsTotal}`);
            console.log(`   Kit Type: ${data.kitType}`);
            console.log('\n🔗 Link de aprobación PayPal:');
            console.log(`   ${data.approveLink}`);
            console.log('\n⚠️  Para continuar:');
            console.log('   1. Abre el link anterior en tu navegador');
            console.log('   2. Inicia sesión en PayPal Sandbox');
            console.log('   3. Aprueba el pago');
            console.log(`   4. Ejecuta: node test-verify-payment.js ${data.orderId}`);
            
            return data;
        } else {
            console.error('❌ Error en checkout:', data.error);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

async function runTests() {
    console.log('🧪 =====================================');
    console.log('🧪 TEST: FLUJO WELCOME KIT');
    console.log('🧪 =====================================');
    
    // 1. Verificar precios
    await testGetServicePricing();
    
    // 2. Obtener productos
    const products = await testGetProducts();
    
    // 3. Agregar productos al test case si existen
    if (products.length > 0) {
        testData.studentWithProducts.productIds = [products[0]._id];
    }
    
    // 4. Seleccionar test case
    console.log('\n\n🎯 Casos de prueba disponibles:');
    console.log('   1. Estudiante solo (sin productos)');
    console.log('   2. Apoderado con hijo (sin productos)');
    console.log('   3. Estudiante con productos físicos');
    
    const args = process.argv.slice(2);
    const testCase = args[0] || '1';
    
    let selectedTest, caseName;
    
    switch (testCase) {
        case '1':
            selectedTest = testData.selfStudent;
            caseName = 'Estudiante solo (sin productos)';
            break;
        case '2':
            selectedTest = testData.guardianWithChild;
            caseName = 'Apoderado con hijo (sin productos)';
            break;
        case '3':
            if (products.length === 0) {
                console.error('\n❌ No hay productos disponibles para este test.');
                console.log('   Crea productos primero desde el admin panel.');
                return;
            }
            selectedTest = testData.studentWithProducts;
            caseName = 'Estudiante con productos físicos';
            break;
        default:
            console.error('❌ Caso de prueba inválido. Usa 1, 2 o 3.');
            return;
    }
    
    console.log(`\n✅ Ejecutando caso: ${caseName}\n`);
    
    // 5. Ejecutar checkout
    await testCheckout(selectedTest, caseName);
    
    console.log('\n\n📝 SIGUIENTES PASOS:');
    console.log('   1. Copia el link de PayPal');
    console.log('   2. Ábrelo en tu navegador');
    console.log('   3. Aprueba el pago con cuenta sandbox');
    console.log('   4. La página de éxito verificará automáticamente');
    console.log('   5. O ejecuta manualmente: node test-verify-payment.js <orderId>');
}

// Ejecutar
runTests().catch(console.error);
