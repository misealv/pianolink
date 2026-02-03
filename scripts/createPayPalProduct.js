// Script para crear un producto en PayPal
// Ejecutar solo una vez: node scripts/createPayPalProduct.js

require('dotenv').config();
const fetch = require('node-fetch');

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

async function createProduct() {
  console.log('🔑 Obteniendo token de acceso...');
  const accessToken = await getAccessToken();
  console.log('✅ Token obtenido');

  const productData = {
    name: 'Clases de Piano Online - PianoLink',
    description: 'Acceso a sala virtual con MIDI sincronizado, video en vivo y partituras compartidas',
    type: 'SERVICE',
    category: 'EDUCATIONAL_AND_TEXTBOOKS',
    image_url: 'https://pianolink.onrender.com/images/logo.png',
    home_url: 'https://pianolink.onrender.com'
  };

  console.log('📦 Creando producto en PayPal...');
  const response = await fetch('https://api-m.paypal.com/v1/catalogs/products', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(productData)
  });

  const product = await response.json();
  
  if (product.id) {
    console.log('\n✅ ¡Producto creado exitosamente!\n');
    console.log('📍 Product ID:', product.id);
    console.log('📝 Nombre:', product.name);
    console.log('\n⚠️  IMPORTANTE: Copia este Product ID, lo necesitas para crear el plan:\n');
    console.log(`   ${product.id}\n`);
    return product;
  } else {
    console.error('❌ Error creando producto:', product);
    process.exit(1);
  }
}

createProduct().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
