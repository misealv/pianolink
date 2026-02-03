// Script para crear todos los productos y planes de PayPal
// node scripts/createAllPayPalProducts.js

require('dotenv').config();
const fetch = require('node-fetch');

async function getAccessToken() {
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');

  const baseUrl = process.env.PAYPAL_MODE === 'live' 
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  const data = await response.json();
  
  if (data.error) {
    console.error('❌ Error obteniendo token:', data);
    process.exit(1);
  }
  
  return data.access_token;
}

async function createProduct(accessToken, productData) {
  const baseUrl = process.env.PAYPAL_MODE === 'live' 
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

  const response = await fetch(`${baseUrl}/v1/catalogs/products`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(productData)
  });

  const product = await response.json();
  
  if (product.id) {
    return product;
  } else {
    console.error('❌ Error creando producto:', product);
    throw new Error('Failed to create product');
  }
}

async function createPlan(accessToken, planData) {
  const baseUrl = process.env.PAYPAL_MODE === 'live' 
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

  const response = await fetch(`${baseUrl}/v1/billing/plans`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(planData)
  });

  const plan = await response.json();
  
  if (plan.id) {
    return plan;
  } else {
    console.error('❌ Error creando plan:', plan);
    throw new Error('Failed to create plan');
  }
}

async function main() {
  console.log('\n🚀 Creando productos y planes de PianoLink en PayPal...\n');
  console.log(`📍 Modo: ${process.env.PAYPAL_MODE || 'sandbox'}\n`);

  const accessToken = await getAccessToken();
  console.log('✅ Token de acceso obtenido\n');

  const results = {
    products: [],
    plans: []
  };

  // ============================================
  // 1. KIT DE BIENVENIDA (Pago único)
  // ============================================
  console.log('📦 [1/3] Creando producto: Kit de Bienvenida...');
  const kitProduct = await createProduct(accessToken, {
    name: 'Kit de Bienvenida PianoLink',
    description: 'Cable MIDI + Sesión de setup personalizada + Clase de prueba 30 minutos',
    type: 'SERVICE',
    category: 'EDUCATIONAL_AND_TEXTBOOKS',
    image_url: 'https://pianolink.onrender.com/images/logo.png',
    home_url: 'https://pianolink.onrender.com'
  });
  
  console.log(`   ✅ Producto creado: ${kitProduct.id}`);
  console.log(`   📝 "${kitProduct.name}"`);
  results.products.push({
    name: 'Kit de Bienvenida',
    productId: kitProduct.id,
    type: 'one-time',
    price: 15
  });

  // Para pagos únicos, NO creamos plan (se usa Orders API)
  console.log(`   💰 Precio: $15 USD (pago único)\n`);

  // ============================================
  // 2. MEMBRESÍA PROFESOR FUNDADOR
  // ============================================
  console.log('📦 [2/3] Creando producto: Membresía Profesor Fundador...');
  const teacherProduct = await createProduct(accessToken, {
    name: 'Membresía Profesor Fundador - PianoLink',
    description: 'Acceso a la plataforma PianoLink con salas ilimitadas y todas las funcionalidades',
    type: 'SERVICE',
    category: 'EDUCATIONAL_AND_TEXTBOOKS',
    image_url: 'https://pianolink.onrender.com/images/logo.png',
    home_url: 'https://pianolink.onrender.com'
  });
  
  console.log(`   ✅ Producto creado: ${teacherProduct.id}`);
  console.log(`   📝 "${teacherProduct.name}"`);
  results.products.push({
    name: 'Membresía Profesor Fundador',
    productId: teacherProduct.id,
    type: 'subscription',
    price: 10
  });

  // Crear plan de suscripción mensual
  console.log('   📋 Creando plan de suscripción...');
  const teacherPlan = await createPlan(accessToken, {
    product_id: teacherProduct.id,
    name: 'Plan Mensual - Profesor Fundador',
    description: 'Suscripción mensual para profesores de piano - Acceso completo a PianoLink',
    status: 'ACTIVE',
    billing_cycles: [
      {
        frequency: {
          interval_unit: 'MONTH',
          interval_count: 1
        },
        tenure_type: 'REGULAR',
        sequence: 1,
        total_cycles: 0,  // Infinito
        pricing_scheme: {
          fixed_price: {
            value: '10.00',
            currency_code: 'USD'
          }
        }
      }
    ],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee: {
        value: '0',
        currency_code: 'USD'
      },
      setup_fee_failure_action: 'CONTINUE',
      payment_failure_threshold: 3
    }
  });

  console.log(`   ✅ Plan creado: ${teacherPlan.id}`);
  console.log(`   💰 Precio: $10 USD/mes\n`);
  results.plans.push({
    name: 'Plan Profesor Fundador',
    planId: teacherPlan.id,
    productId: teacherProduct.id,
    price: 10,
    frequency: 'monthly'
  });

  // ============================================
  // 3. MEMBRESÍA CLASES DE PIANO (Alumno)
  // ============================================
  console.log('📦 [3/3] Creando producto: Membresía Clases de Piano...');
  const studentProduct = await createProduct(accessToken, {
    name: 'Membresía Clases de Piano - PianoLink',
    description: '4 sesiones de 45 minutos por mes - Clases de piano online con MIDI sincronizado',
    type: 'SERVICE',
    category: 'EDUCATIONAL_AND_TEXTBOOKS',
    image_url: 'https://pianolink.onrender.com/images/logo.png',
    home_url: 'https://pianolink.onrender.com'
  });
  
  console.log(`   ✅ Producto creado: ${studentProduct.id}`);
  console.log(`   📝 "${studentProduct.name}"`);
  results.products.push({
    name: 'Membresía Clases de Piano',
    productId: studentProduct.id,
    type: 'subscription',
    price: 100
  });

  // Crear plan de suscripción mensual
  console.log('   📋 Creando plan de suscripción...');
  const studentPlan = await createPlan(accessToken, {
    product_id: studentProduct.id,
    name: 'Plan Mensual - Clases de Piano',
    description: 'Suscripción mensual - 4 sesiones de 45 minutos con tu profesor',
    status: 'ACTIVE',
    billing_cycles: [
      {
        frequency: {
          interval_unit: 'MONTH',
          interval_count: 1
        },
        tenure_type: 'REGULAR',
        sequence: 1,
        total_cycles: 0,  // Infinito
        pricing_scheme: {
          fixed_price: {
            value: '100.00',
            currency_code: 'USD'
          }
        }
      }
    ],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee: {
        value: '0',
        currency_code: 'USD'
      },
      setup_fee_failure_action: 'CONTINUE',
      payment_failure_threshold: 3
    }
  });

  console.log(`   ✅ Plan creado: ${studentPlan.id}`);
  console.log(`   💰 Precio: $100 USD/mes (4 sesiones de 45min)\n`);
  results.plans.push({
    name: 'Plan Clases de Piano',
    planId: studentPlan.id,
    productId: studentProduct.id,
    price: 100,
    frequency: 'monthly'
  });

  // ============================================
  // RESUMEN
  // ============================================
  console.log('\n' + '='.repeat(70));
  console.log('✅ TODOS LOS PRODUCTOS Y PLANES CREADOS EXITOSAMENTE');
  console.log('='.repeat(70) + '\n');

  console.log('📦 PRODUCTOS:\n');
  results.products.forEach((p, i) => {
    console.log(`${i + 1}. ${p.name}`);
    console.log(`   Product ID: ${p.productId}`);
    console.log(`   Tipo: ${p.type === 'one-time' ? 'Pago único' : 'Suscripción'}`);
    console.log(`   Precio: $${p.price} USD${p.type === 'subscription' ? '/mes' : ''}\n`);
  });

  console.log('📋 PLANES DE SUSCRIPCIÓN:\n');
  results.plans.forEach((p, i) => {
    console.log(`${i + 1}. ${p.name}`);
    console.log(`   Plan ID: ${p.planId}`);
    console.log(`   Product ID: ${p.productId}`);
    console.log(`   Precio: $${p.price} USD/mes\n`);
  });

  console.log('⚠️  IMPORTANTE: Guarda estos IDs en tu archivo .env:\n');
  console.log('# Kit de Bienvenida (pago único - usar Orders API)');
  console.log(`PAYPAL_PRODUCT_KIT_BIENVENIDA=${results.products[0].productId}\n`);
  
  console.log('# Membresía Profesor Fundador');
  console.log(`PAYPAL_PRODUCT_TEACHER=${results.products[1].productId}`);
  console.log(`PAYPAL_PLAN_TEACHER=${results.plans[0].planId}\n`);
  
  console.log('# Membresía Clases de Piano (Alumno)');
  console.log(`PAYPAL_PRODUCT_STUDENT=${results.products[2].productId}`);
  console.log(`PAYPAL_PLAN_STUDENT=${results.plans[1].planId}\n`);

  console.log('📝 También actualiza el plan original si ya no lo usas:');
  console.log(`PAYPAL_PLAN_ID=${results.plans[1].planId}  # (reemplazar con el plan del alumno)\n`);
}

main().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
