// Script para probar la conexión con PayPal
// node scripts/testPayPalConnection.js

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
  return data;
}

async function verifyPlan() {
  console.log('\n🔍 Verificando configuración de PayPal...\n');

  // 1. Verificar variables de entorno
  console.log('📋 Variables de entorno:');
  console.log(`   Client ID: ${process.env.PAYPAL_CLIENT_ID ? '✓ Configurado' : '✗ Faltante'}`);
  console.log(`   Client Secret: ${process.env.PAYPAL_CLIENT_SECRET ? '✓ Configurado' : '✗ Faltante'}`);
  console.log(`   Webhook ID: ${process.env.PAYPAL_WEBHOOK_ID ? '✓ Configurado' : '✗ Faltante'}`);
  console.log(`   Plan ID: ${process.env.PAYPAL_PLAN_ID ? '✓ Configurado' : '✗ Faltante'}`);
  console.log(`   Modo: ${process.env.PAYPAL_MODE || 'sandbox'}\n`);

  // 2. Probar autenticación
  console.log('🔑 Probando autenticación...');
  const authData = await getAccessToken();
  
  if (authData.access_token) {
    console.log('✅ Autenticación exitosa');
    console.log(`   Token obtenido (válido por ${authData.expires_in / 3600} horas)\n`);
  } else {
    console.error('❌ Error de autenticación:', authData);
    process.exit(1);
  }

  // 3. Verificar plan
  console.log('📋 Verificando plan de suscripción...');
  const baseUrl = process.env.PAYPAL_MODE === 'live' 
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

  const planResponse = await fetch(
    `${baseUrl}/v1/billing/plans/${process.env.PAYPAL_PLAN_ID}`,
    {
      headers: {
        'Authorization': `Bearer ${authData.access_token}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const plan = await planResponse.json();
  
  if (plan.id) {
    console.log('✅ Plan encontrado:');
    console.log(`   ID: ${plan.id}`);
    console.log(`   Nombre: ${plan.name}`);
    console.log(`   Estado: ${plan.status}`);
    console.log(`   Precio: ${plan.billing_cycles[0]?.pricing_scheme?.fixed_price?.value} ${plan.billing_cycles[0]?.pricing_scheme?.fixed_price?.currency_code}`);
    console.log(`   Frecuencia: ${plan.billing_cycles[0]?.frequency?.interval_count} ${plan.billing_cycles[0]?.frequency?.interval_unit}`);
  } else {
    console.error('❌ Plan no encontrado:', plan);
    process.exit(1);
  }

  // 4. Crear link de prueba
  console.log('\n🔗 Generando link de suscripción de prueba...');
  
  const subscriptionData = {
    plan_id: process.env.PAYPAL_PLAN_ID,
    subscriber: {
      email_address: 'test@ejemplo.com',
      name: {
        given_name: 'Usuario',
        surname: 'Prueba'
      }
    },
    application_context: {
      brand_name: 'PianoLink',
      locale: 'es-AR',
      shipping_preference: 'NO_SHIPPING',
      user_action: 'SUBSCRIBE_NOW',
      return_url: 'https://pianolink.onrender.com/subscription/success',
      cancel_url: 'https://pianolink.onrender.com/subscription/cancelled'
    },
    custom_id: 'test_subscription_' + Date.now()
  };

  const subResponse = await fetch(`${baseUrl}/v1/billing/subscriptions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authData.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(subscriptionData)
  });

  const subscription = await subResponse.json();
  
  if (subscription.id) {
    const approveLink = subscription.links?.find(link => link.rel === 'approve')?.href;
    console.log('✅ Link de suscripción creado:');
    console.log(`   Subscription ID: ${subscription.id}`);
    console.log(`   Status: ${subscription.status}`);
    console.log(`\n   🔗 Link de pago:\n   ${approveLink}\n`);
    console.log('💡 Puedes abrir este link en un navegador para probar el flujo completo.');
  } else {
    console.error('❌ Error creando suscripción:', subscription);
    process.exit(1);
  }

  console.log('\n✅ ¡Todas las verificaciones pasaron exitosamente!');
  console.log('\n📝 Próximos pasos:');
  console.log('   1. Abrir el link de pago en un navegador');
  console.log('   2. Completar la suscripción con tu cuenta PayPal');
  console.log('   3. Verificar que el webhook llegue al servidor');
  console.log('   4. Confirmar que la suscripción se guarde en MongoDB\n');
}

verifyPlan().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
