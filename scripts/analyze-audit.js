#!/usr/bin/env node
/**
 * Script para analizar auditorías de PianoLink
 * 
 * Uso:
 *   node scripts/analyze-audit.js                    # Lista últimas auditorías
 *   node scripts/analyze-audit.js --date 2026-02-04  # Auditorías del día
 *   node scripts/analyze-audit.js --id audit_xxx     # Analizar auditoría específica
 *   node scripts/analyze-audit.js --room ABCD1234    # Buscar por sala
 *   node scripts/analyze-audit.js --problems         # Solo mostrar problemas
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Cargar .env
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length) {
        process.env[key.trim()] = valueParts.join('=').trim();
    }
});

const DiagnosticAudit = require('../models/DiagnosticAudit');
const DiagnosticEvent = require('../models/DiagnosticEvent');

// Parse arguments
const args = process.argv.slice(2);
const getArg = (name) => {
    const idx = args.indexOf('--' + name);
    return idx !== -1 ? args[idx + 1] : null;
};
const hasFlag = (name) => args.includes('--' + name);

async function main() {
    console.log('🔍 PianoLink Audit Analyzer\n');
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Conectado a MongoDB\n');
    
    const date = getArg('date');
    const auditId = getArg('id');
    const roomCode = getArg('room');
    const showProblemsOnly = hasFlag('problems');
    
    if (auditId) {
        await analyzeAudit(auditId, showProblemsOnly);
    } else if (date) {
        await listAuditsByDate(date);
    } else if (roomCode) {
        await findByRoom(roomCode);
    } else {
        await listRecentAudits();
    }
    
    await mongoose.disconnect();
}

async function listRecentAudits() {
    console.log('📋 Últimas 10 auditorías:\n');
    
    const audits = await DiagnosticAudit.find()
        .sort({ startedAt: -1 })
        .limit(10)
        .select('auditId status startedAt endedAt summary');
    
    if (audits.length === 0) {
        console.log('  ⚠️ No hay auditorías registradas');
        console.log('  💡 Activa una auditoría desde /diagnostics.html');
        return;
    }
    
    audits.forEach((a, i) => {
        const start = new Date(a.startedAt);
        const duration = a.endedAt 
            ? Math.round((new Date(a.endedAt) - start) / 1000 / 60) + ' min'
            : 'en curso';
        const errors = a.summary?.errorCount || 0;
        const events = a.summary?.totalEvents || a.events?.length || 0;
        
        console.log(`  ${i + 1}. ${a.auditId}`);
        console.log(`     📅 ${start.toLocaleDateString()} ${start.toLocaleTimeString()}`);
        console.log(`     ⏱️ Duración: ${duration}`);
        console.log(`     📊 Eventos: ${events} | ⚠️ Errores: ${errors}`);
        console.log(`     Estado: ${a.status}`);
        console.log('');
    });
    
    console.log('💡 Para analizar una auditoría específica:');
    console.log('   node scripts/analyze-audit.js --id <auditId>\n');
}

async function listAuditsByDate(dateStr) {
    const startOfDay = new Date(dateStr);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(dateStr);
    endOfDay.setHours(23, 59, 59, 999);
    
    console.log(`📅 Auditorías del ${dateStr}:\n`);
    
    const audits = await DiagnosticAudit.find({
        startedAt: { $gte: startOfDay, $lte: endOfDay }
    }).sort({ startedAt: 1 });
    
    if (audits.length === 0) {
        console.log('  ⚠️ No hay auditorías para esta fecha');
        return;
    }
    
    audits.forEach((a, i) => {
        const start = new Date(a.startedAt);
        const errors = a.summary?.errorCount || 0;
        const rooms = a.summary?.uniqueRooms || 0;
        
        console.log(`  ${i + 1}. [${start.toLocaleTimeString()}] ${a.auditId}`);
        console.log(`     Salas: ${rooms} | Errores: ${errors} | Estado: ${a.status}`);
        console.log('');
    });
}

async function findByRoom(roomCode) {
    console.log(`🏠 Buscando auditorías con sala: ${roomCode}\n`);
    
    // Buscar en eventos embebidos
    const audits = await DiagnosticAudit.find({
        'events.roomCode': roomCode
    }).sort({ startedAt: -1 }).limit(5);
    
    if (audits.length === 0) {
        console.log('  ⚠️ No se encontraron auditorías con esa sala');
        return;
    }
    
    for (const audit of audits) {
        console.log(`📊 ${audit.auditId}`);
        console.log(`   Fecha: ${new Date(audit.startedAt).toLocaleString()}`);
        
        // Filtrar eventos de esa sala
        const roomEvents = audit.events.filter(e => e.roomCode === roomCode);
        console.log(`   Eventos en sala ${roomCode}: ${roomEvents.length}`);
        
        // Buscar problemas
        const problems = roomEvents.filter(e => 
            e.severity === 'error' || 
            e.severity === 'warning' ||
            e.type.includes('error') ||
            e.type.includes('warning') ||
            e.type.includes('disconnect')
        );
        
        if (problems.length > 0) {
            console.log(`   ⚠️ Problemas detectados: ${problems.length}`);
            problems.slice(0, 5).forEach(p => {
                console.log(`      - [${new Date(p.timestamp).toLocaleTimeString()}] ${p.type}`);
            });
        }
        console.log('');
    }
}

async function analyzeAudit(auditId, showProblemsOnly) {
    console.log(`🔬 Analizando auditoría: ${auditId}\n`);
    
    const audit = await DiagnosticAudit.findOne({ auditId });
    
    if (!audit) {
        console.log('❌ Auditoría no encontrada');
        return;
    }
    
    // Info general
    console.log('📋 INFORMACIÓN GENERAL');
    console.log('═══════════════════════════════════════');
    console.log(`Estado: ${audit.status}`);
    console.log(`Inicio: ${new Date(audit.startedAt).toLocaleString()}`);
    if (audit.endedAt) {
        console.log(`Fin: ${new Date(audit.endedAt).toLocaleString()}`);
        const duration = Math.round((new Date(audit.endedAt) - new Date(audit.startedAt)) / 1000);
        console.log(`Duración: ${Math.floor(duration / 60)}m ${duration % 60}s`);
    }
    console.log('');
    
    // Resumen
    if (audit.summary) {
        console.log('📊 RESUMEN');
        console.log('═══════════════════════════════════════');
        console.log(`Total eventos: ${audit.summary.totalEvents || 0}`);
        console.log(`Usuarios únicos: ${audit.summary.uniqueUsers || 0}`);
        console.log(`Salas únicas: ${audit.summary.uniqueRooms || 0}`);
        console.log(`Errores: ${audit.summary.errorCount || 0}`);
        console.log(`Mensajes MIDI: ${audit.summary.midiMessagesTotal || 0}`);
        console.log(`Reconexiones: ${audit.summary.reconnections || 0}`);
        console.log(`Pico conexiones: ${audit.summary.peakConnections || 0}`);
        console.log('');
    }
    
    // Eventos
    const events = audit.events || [];
    console.log(`📝 EVENTOS (${events.length} total)`);
    console.log('═══════════════════════════════════════');
    
    // Agrupar por categoría
    const byCategory = {};
    events.forEach(e => {
        byCategory[e.category] = (byCategory[e.category] || 0) + 1;
    });
    console.log('Por categoría:');
    Object.entries(byCategory).forEach(([cat, count]) => {
        console.log(`  ${cat}: ${count}`);
    });
    console.log('');
    
    // Problemas detectados
    const problems = events.filter(e => 
        e.severity === 'error' || 
        e.severity === 'warning' ||
        e.type.includes('error') ||
        e.type.includes('fail') ||
        e.type.includes('disconnect') ||
        e.type.includes('warning') ||
        e.type.includes('exception') ||
        e.type.includes('reconnect')
    );
    
    if (problems.length > 0) {
        console.log('⚠️ PROBLEMAS DETECTADOS');
        console.log('═══════════════════════════════════════');
        
        problems.forEach(p => {
            const time = new Date(p.timestamp).toLocaleTimeString();
            const icon = p.severity === 'error' ? '❌' : '⚠️';
            console.log(`${icon} [${time}] ${p.category}/${p.type}`);
            if (p.roomCode) console.log(`   Sala: ${p.roomCode}`);
            if (p.data && Object.keys(p.data).length > 0) {
                console.log(`   Data: ${JSON.stringify(p.data).substring(0, 100)}`);
            }
            console.log('');
        });
        
        // Análisis de patrones
        console.log('🔍 ANÁLISIS DE PATRONES');
        console.log('═══════════════════════════════════════');
        
        // Desconexiones
        const disconnects = problems.filter(p => p.type.includes('disconnect'));
        if (disconnects.length > 0) {
            console.log(`🔌 Desconexiones: ${disconnects.length}`);
            console.log('   → Posible problema de red o inestabilidad de conexión');
        }
        
        // Reconexiones
        const reconnects = problems.filter(p => p.type.includes('reconnect'));
        if (reconnects.length > 0) {
            console.log(`🔄 Reconexiones: ${reconnects.length}`);
            console.log('   → La conexión se está recuperando pero hay interrupciones');
        }
        
        // Errores de Agora
        const agoraErrors = problems.filter(p => p.category === 'audio' || p.type.includes('agora'));
        if (agoraErrors.length > 0) {
            console.log(`🎥 Problemas de Agora (audio/video): ${agoraErrors.length}`);
            const networkIssues = agoraErrors.filter(p => p.type.includes('network'));
            if (networkIssues.length > 0) {
                console.log('   → Problemas de calidad de red en video/audio');
            }
        }
        
        // Timeline de problemas
        console.log('');
        console.log('📈 TIMELINE DE PROBLEMAS');
        console.log('═══════════════════════════════════════');
        
        // Agrupar por ventanas de 5 minutos
        const windows = {};
        problems.forEach(p => {
            const time = new Date(p.timestamp);
            const windowKey = `${time.getHours()}:${Math.floor(time.getMinutes() / 5) * 5}`;
            windows[windowKey] = (windows[windowKey] || 0) + 1;
        });
        
        Object.entries(windows).sort().forEach(([window, count]) => {
            const bar = '█'.repeat(Math.min(count, 20));
            console.log(`  ${window.padStart(5)} | ${bar} (${count})`);
        });
        
    } else {
        console.log('✅ No se detectaron problemas en esta auditoría');
    }
    
    if (!showProblemsOnly && events.length > 0) {
        console.log('');
        console.log('💡 Para ver solo problemas: --problems');
        console.log('💡 Para exportar: node scripts/analyze-audit.js --id ' + auditId + ' > reporte.txt');
    }
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
