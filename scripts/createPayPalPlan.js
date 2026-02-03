// Script para crear un plan de suscripción en PayPal
// Ejecutar solo una vez: node scripts/createPayPalPlan.js

require('dotenv').config();
const fetch = require('node-fetch');

const PRODUCT_ID = 'PROD-598267766S576131C'; // ID del producto creado

async function getAccessToken() {
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');

  const response = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
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

async function createPlan() {
  console.log('🔑 Obteniendo token de acceso...');
  const accessToken = await getAccessToken();
  console.log('✅ Token obtenido');

  const planData = {
    product_id: PRODUCT_ID,
    name: 'Suscripción Mensual PianoLink',
    description: 'Acceso ilimitado 24/7 a clases de piano con tu profesor',
    status: 'ACTIVE',
    billing_cycles: [
      {
        frequency: {
          interval_unit: 'MONTH',
          interval_count: 1
        },
        tenure_type: 'REGULAR',
        sequence: 1,
        total_cycles: 0,  // 0 = infinito (hasta que se cancele)
        pricing_scheme: {
          fixed_price: {
            value: '20.00',  // USD$20/mes
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
  };

  console.log('📋 Creando plan de suscripción en PayPal...');
  console.log(`   💰 Precio: $${planData.billing_cycles[0].pricing_scheme.fixed_price.value} USD/mes`);
  
  const response = await fetch('https://api-m.paypal.com/v1/billing/plans', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(planData)
  });

  const plan = await response.json();
  
  if (plan.id) {
    console.log('\n✅ ¡Plan creado exitosamente!\n');
    console.log('📍 Plan ID:', plan.id);
    console.log('📝 Nombre:', plan.name);
    console.log('💰 Precio: $20 USD/mes');
    console.log('🔄 Renovación: Automática mensual');
    console.log('\n⚠️  IMPORTANTE: Guarda este ID en tu archivo .env:\n');
    console.log(`   PAYPAL_PLAN_ID=${plan.id}\n`);
    return plan;
  } else {
    console.error('❌ Error creando plan:', plan);
    process.exit(1);
  }
}

createPlan().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
