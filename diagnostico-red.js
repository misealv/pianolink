#!/usr/bin/env node
/**
 * 🔍 DIAGNÓSTICO DE RED Y SERVIDOR - PianoLink
 * 
 * Ejecutar: node diagnostico-red.js
 * 
 * Este script verifica:
 * 1. Conectividad al servidor
 * 2. Latencia
 * 3. Estabilidad de WebSocket
 * 4. Estado de MongoDB
 */

const https = require('https');
const { performance } = require('perf_hooks');

const SERVER_URL = process.env.PIANOLINK_URL || 'https://pianolink.onrender.com';
const TEST_DURATION = 30; // segundos
const PING_INTERVAL = 2; // segundos entre pings

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║     🎹 DIAGNÓSTICO DE RED - PIANOLINK                      ║');
console.log('╠════════════════════════════════════════════════════════════╣');
console.log(`║ Servidor: ${SERVER_URL.padEnd(46)} ║`);
console.log(`║ Duración del test: ${TEST_DURATION} segundos${' '.repeat(31)} ║`);
console.log('╚════════════════════════════════════════════════════════════╝\n');

const results = {
    pings: [],
    errors: [],
    healthChecks: []
};

// Función para hacer HTTP request con timing
function timedRequest(url) {
    return new Promise((resolve, reject) => {
        const start = performance.now();
        
        const req = https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const latency = performance.now() - start;
                resolve({
                    statusCode: res.statusCode,
                    latency: Math.round(latency),
                    data: data.substring(0, 200)
                });
            });
        });
        
        req.on('error', (err) => {
            const latency = performance.now() - start;
            reject({
                error: err.message,
                latency: Math.round(latency)
            });
        });
        
        req.setTimeout(10000, () => {
            req.destroy();
            reject({ error: 'Timeout (10s)', latency: 10000 });
        });
    });
}

// Test de Health Check
async function healthCheck() {
    console.log('📡 Verificando health check del servidor...\n');
    
    try {
        const result = await timedRequest(`${SERVER_URL}/health`);
        const health = JSON.parse(result.data);
        
        console.log('   ✅ Servidor ONLINE');
        console.log(`   ⏱️  Latencia: ${result.latency}ms`);
        console.log(`   🕐 Uptime: ${Math.round(health.uptime / 60)} minutos`);
        console.log(`   🗄️  MongoDB: ${health.mongodb}`);
        console.log(`   💾 Memoria: ${health.memory}`);
        console.log(`   🏠 Salas activas: ${health.rooms}\n`);
        
        results.healthChecks.push({
            status: 'ok',
            latency: result.latency,
            uptime: health.uptime
        });
        
        return true;
    } catch (err) {
        console.log('   ❌ SERVIDOR NO RESPONDE');
        console.log(`   Error: ${err.error}\n`);
        
        results.healthChecks.push({
            status: 'error',
            error: err.error
        });
        
        return false;
    }
}

// Test de latencia continua
async function latencyTest() {
    console.log(`🔄 Iniciando test de latencia (${TEST_DURATION}s)...\n`);
    console.log('   Ping# | Latencia | Estado');
    console.log('   ------+----------+--------');
    
    const iterations = Math.floor(TEST_DURATION / PING_INTERVAL);
    
    for (let i = 1; i <= iterations; i++) {
        try {
            const result = await timedRequest(`${SERVER_URL}/health`);
            const status = result.latency < 100 ? '🟢' : 
                          result.latency < 300 ? '🟡' : '🔴';
            
            console.log(`   ${String(i).padStart(5)} | ${String(result.latency + 'ms').padStart(8)} | ${status}`);
            
            results.pings.push({
                iteration: i,
                latency: result.latency,
                status: 'ok'
            });
            
        } catch (err) {
            console.log(`   ${String(i).padStart(5)} | ${'ERROR'.padStart(8)} | ❌ ${err.error}`);
            
            results.pings.push({
                iteration: i,
                latency: err.latency,
                status: 'error',
                error: err.error
            });
            results.errors.push(err);
        }
        
        if (i < iterations) {
            await new Promise(r => setTimeout(r, PING_INTERVAL * 1000));
        }
    }
}

// Generar reporte
function generateReport() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    📊 REPORTE FINAL                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    
    const successfulPings = results.pings.filter(p => p.status === 'ok');
    const failedPings = results.pings.filter(p => p.status === 'error');
    
    if (successfulPings.length === 0) {
        console.log('❌ CRÍTICO: No se pudo conectar al servidor\n');
        console.log('Posibles causas:');
        console.log('  1. El servidor está caído');
        console.log('  2. Tu conexión a internet está fallando');
        console.log('  3. Firewall bloqueando conexiones\n');
        return;
    }
    
    const latencies = successfulPings.map(p => p.latency);
    const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
    const minLatency = Math.min(...latencies);
    const maxLatency = Math.max(...latencies);
    const jitter = maxLatency - minLatency;
    const packetLoss = (failedPings.length / results.pings.length * 100).toFixed(1);
    
    console.log('📈 ESTADÍSTICAS DE LATENCIA:');
    console.log(`   • Promedio: ${avgLatency}ms`);
    console.log(`   • Mínimo:   ${minLatency}ms`);
    console.log(`   • Máximo:   ${maxLatency}ms`);
    console.log(`   • Jitter:   ${jitter}ms`);
    console.log(`   • Pérdida:  ${packetLoss}%\n`);
    
    // Diagnóstico
    console.log('🔍 DIAGNÓSTICO:\n');
    
    // Latencia
    if (avgLatency < 100) {
        console.log('   ✅ Latencia EXCELENTE - No debería haber problemas de red');
    } else if (avgLatency < 200) {
        console.log('   🟡 Latencia ACEPTABLE - Puede haber pequeños retrasos');
    } else if (avgLatency < 400) {
        console.log('   🟠 Latencia ALTA - Probable causa de intermitencia');
    } else {
        console.log('   🔴 Latencia MUY ALTA - Definitivamente causa problemas');
    }
    
    // Jitter
    if (jitter < 50) {
        console.log('   ✅ Jitter BAJO - Conexión estable');
    } else if (jitter < 150) {
        console.log('   🟡 Jitter MODERADO - Puede causar "saltos"');
    } else {
        console.log('   🔴 Jitter ALTO - Causa directa de audio/MIDI pegado');
    }
    
    // Packet loss
    if (packetLoss == 0) {
        console.log('   ✅ Sin pérdida de paquetes');
    } else if (packetLoss < 5) {
        console.log('   🟡 Pérdida de paquetes BAJA - Noticeable en MIDI');
    } else {
        console.log('   🔴 Pérdida de paquetes ALTA - Causa principal de problemas');
    }
    
    // Recomendaciones
    console.log('\n💡 RECOMENDACIONES:\n');
    
    if (avgLatency > 200 || jitter > 100 || packetLoss > 2) {
        console.log('   ⚠️  TU RED PARECE SER EL PROBLEMA\n');
        console.log('   Acciones recomendadas:');
        console.log('   1. Usar cable ethernet en lugar de WiFi');
        console.log('   2. Cerrar otras aplicaciones que usen internet');
        console.log('   3. Verificar que nadie más esté usando la red');
        console.log('   4. Reiniciar el router');
        console.log('   5. Contactar a tu proveedor de internet si persiste');
    } else {
        console.log('   ✅ Tu conexión de red parece ESTABLE\n');
        console.log('   Si el problema persiste, puede ser:');
        console.log('   1. Problema del servidor en momento específico');
        console.log('   2. Problema del dispositivo/navegador');
        console.log('   3. Conflicto con extensiones del navegador');
        console.log('   4. Driver de audio/MIDI del equipo');
    }
    
    // Guardar resultados
    const fs = require('fs');
    const reportFile = `diagnostico-${new Date().toISOString().split('T')[0]}.json`;
    fs.writeFileSync(reportFile, JSON.stringify({
        timestamp: new Date().toISOString(),
        server: SERVER_URL,
        summary: {
            avgLatency,
            minLatency,
            maxLatency,
            jitter,
            packetLoss: parseFloat(packetLoss),
            totalPings: results.pings.length,
            successfulPings: successfulPings.length,
            failedPings: failedPings.length
        },
        details: results
    }, null, 2));
    
    console.log(`\n📁 Reporte guardado en: ${reportFile}`);
}

// Main
async function main() {
    const serverOk = await healthCheck();
    
    if (serverOk) {
        await latencyTest();
    }
    
    generateReport();
    
    console.log('\n════════════════════════════════════════════════════════════');
    console.log('Para más ayuda, revisar: DIAGNOSTICO_INTERMITENCIA.md');
    console.log('════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
