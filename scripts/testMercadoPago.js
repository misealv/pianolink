/**
 * scripts/testMercadoPago.js
 * Script para verificar configuración de MercadoPago
 * 
 * Uso: node scripts/testMercadoPago.js
 */

require('dotenv').config();

const axios = require('axios');

async function testMercadoPago() {
    console.log('='.repeat(60));
    console.log('🧪 TEST MERCADOPAGO - PianoLink');
    console.log('='.repeat(60));

    const accessToken = process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN;

    // 1. Verificar credenciales
    console.log('\n1️⃣  Verificando credenciales...');
    
    if (!accessToken) {
        console.log('❌ MP_ACCESS_TOKEN no está configurado');
        console.log('   Agrega la variable en .env o en fly secrets');
        process.exit(1);
    }
    
    const maskedToken = accessToken.substring(0, 20) + '...' + accessToken.substring(accessToken.length - 5);
    console.log(`✅ Token encontrado: ${maskedToken}`);

    // 2. Obtener info de la cuenta
    console.log('\n2️⃣  Obteniendo información de cuenta...');
    
    try {
        const userRes = await axios.get('https://api.mercadopago.com/users/me', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        const user = userRes.data;
        console.log(`✅ Cuenta: ${user.nickname || user.email}`);
        console.log(`   ID: ${user.id}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   País: ${user.site_id}`);
        console.log(`   Status: ${user.status?.site_status}`);

        // 3. Verificar tipo de cuenta
        console.log('\n3️⃣  Tipo de cuenta...');
        console.log(`   Tipo: ${user.user_type || 'normal'}`);
        console.log(`   Tags: ${JSON.stringify(user.tags || [])}`);

        // 4. Obtener balance (puede fallar si no hay permisos)
        console.log('\n4️⃣  Verificando saldo...');
        
        try {
            const balanceRes = await axios.get(
                `https://api.mercadopago.com/users/${user.id}/mercadopago_account/balance`,
                { headers: { 'Authorization': `Bearer ${accessToken}` } }
            );
            
            const balance = balanceRes.data;
            console.log(`✅ Saldo disponible: $${balance.available_balance} ${balance.currency_id}`);
        } catch (balErr) {
            console.log(`⚠️  No se pudo obtener saldo: ${balErr.response?.data?.message || balErr.message}`);
            console.log('   Esto puede ser normal dependiendo del tipo de cuenta');
        }

        // 5. Verificar permisos de transferencia
        console.log('\n5️⃣  Verificando permisos...');
        
        // Hacer una llamada de prueba al endpoint de payments (sin crear)
        try {
            // Intentar obtener métodos de pago disponibles
            const methodsRes = await axios.get(
                'https://api.mercadopago.com/v1/payment_methods',
                { headers: { 'Authorization': `Bearer ${accessToken}` } }
            );
            
            const methods = methodsRes.data;
            const hasAccountMoney = methods.some(m => m.id === 'account_money');
            
            console.log(`✅ Métodos de pago: ${methods.length} disponibles`);
            console.log(`   Transferencia account_money: ${hasAccountMoney ? '✅ Disponible' : '❌ No disponible'}`);
            
        } catch (methodsErr) {
            console.log(`⚠️  Error verificando métodos: ${methodsErr.response?.data?.message || methodsErr.message}`);
        }

        // 6. Resumen
        console.log('\n' + '='.repeat(60));
        console.log('📊 RESUMEN');
        console.log('='.repeat(60));
        console.log(`Cuenta: ${user.nickname || user.email}`);
        console.log(`País: ${user.site_id}`);
        console.log(`\n✅ MercadoPago está configurado correctamente`);
        
        // Advertencias para Chile
        if (user.site_id === 'MLC') {
            console.log('\n⚠️  NOTA IMPORTANTE PARA CHILE:');
            console.log('   MercadoPago Chile tiene restricciones para transferencias P2P.');
            console.log('   Las transferencias automáticas pueden no estar disponibles.');
            console.log('   Alternativas:');
            console.log('   - Usar retiro a cuenta bancaria desde panel MP');
            console.log('   - Transferencia manual desde banco');
        }

    } catch (error) {
        console.log(`❌ Error conectando a MercadoPago: ${error.response?.data?.message || error.message}`);
        
        if (error.response?.status === 401) {
            console.log('\n   El Access Token es inválido o expirado.');
            console.log('   Ve a: https://www.mercadopago.cl/developers/panel/credentials');
            console.log('   Y genera un nuevo Access Token de PRODUCCIÓN');
        }
        
        process.exit(1);
    }
}

testMercadoPago();
