/**
 * addFounderExample.js - Script para agregar ejemplo de corrección sobre el fundador
 * 
 * Este script agrega un ejemplo de "aprendizaje" para PLB sobre la información
 * correcta del fundador de Piano Link.
 * 
 * USO: node addFounderExample.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const PLBExample = require('./models/PLBExample');

console.log('🧠 Agregando ejemplo de corrección sobre el fundador...\n');

async function addFounderExample() {
    try {
        // Conectar a MongoDB
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✅ Conectado a MongoDB\n');
        
        // Verificar si ya existe un ejemplo similar
        const existingExample = await PLBExample.findOne({
            category: 'fundador',
            isActive: true
        });
        
        if (existingExample) {
            console.log('⚠️  Ya existe un ejemplo sobre el fundador:');
            console.log(`   Contexto: "${existingExample.context}"`);
            console.log(`   Respuesta: "${existingExample.improvedResponse}"`);
            console.log('\n¿Quieres reemplazarlo? Desactivando el anterior...\n');
            
            existingExample.isActive = false;
            await existingExample.save();
            console.log('✅ Ejemplo anterior desactivado\n');
        }
        
        // Crear el nuevo ejemplo con información correcta
        const newExample = new PLBExample({
            context: "¿Quién es el creador de Piano Link?",
            originalResponse: "Miguel Ángel, un músico de Colombia.",
            improvedResponse: "El creador de Piano Link es Miguel Antonio (Miseal), compositor y desarrollador de Chile. Creó la plataforma para simplificar las clases de piano online, eliminando la complejidad de configurar OBS, interfaces MIDI y otros equipos complicados.",
            teacherEmail: 'demo@pianolink.com',
            category: 'fundador',
            rating: 5,
            isActive: true
        });
        
        await newExample.save();
        
        console.log('✅ ¡Ejemplo guardado exitosamente!\n');
        console.log('═══════════════════════════════════════════════════════');
        console.log('📚 Información del ejemplo:');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`ID: ${newExample._id}`);
        console.log(`Categoría: ${newExample.category}`);
        console.log(`Rating: ${newExample.rating}`);
        console.log(`\nContexto:\n"${newExample.context}"`);
        console.log(`\nRespuesta Correcta:\n"${newExample.improvedResponse}"`);
        console.log('═══════════════════════════════════════════════════════\n');
        
        console.log('✅ Ahora PLB aprenderá de este ejemplo y dará la respuesta correcta');
        console.log('💡 El cache de ejemplos se recargará en máximo 5 minutos\n');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 Conexión cerrada');
        process.exit(0);
    }
}

addFounderExample();
