/**
 * cleanDuplicateFounderExamples.js - Limpia ejemplos duplicados sobre el fundador
 * 
 * Deja solo el ejemplo más reciente y con mejor formato
 * 
 * USO: node cleanDuplicateFounderExamples.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const PLBExample = require('./models/PLBExample');

console.log('🧹 Limpiando ejemplos duplicados sobre el fundador...\n');

async function cleanDuplicates() {
    try {
        // Conectar a MongoDB
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✅ Conectado a MongoDB\n');
        
        // Buscar todos los ejemplos que mencionan al fundador
        const allExamples = await PLBExample.find({ isActive: true });
        
        const founderRelated = allExamples.filter(ex => {
            const text = (ex.context + ' ' + ex.improvedResponse).toLowerCase();
            return text.includes('fundador') || 
                   text.includes('creador') || 
                   text.includes('miseal') ||
                   text.includes('miguel');
        });
        
        console.log(`📊 Encontrados ${founderRelated.length} ejemplos relacionados con el fundador\n`);
        
        if (founderRelated.length === 0) {
            console.log('✅ No hay ejemplos para limpiar');
            return;
        }
        
        // Mostrar todos
        founderRelated.forEach((ex, i) => {
            console.log(`${i + 1}. [${ex.category}] "${ex.context.substring(0, 50)}..."`);
            console.log(`   Respuesta: "${ex.improvedResponse.substring(0, 80)}..."`);
            console.log(`   Creado: ${new Date(ex.createdAt).toLocaleString()}\n`);
        });
        
        // Encontrar el mejor (categoría 'fundador' y más reciente)
        const bestExample = founderRelated
            .filter(ex => ex.category === 'fundador')
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
        
        if (!bestExample) {
            console.log('⚠️  No se encontró un ejemplo con categoría "fundador"');
            return;
        }
        
        console.log('✨ Ejemplo seleccionado como MEJOR:');
        console.log(`   ID: ${bestExample._id}`);
        console.log(`   Contexto: "${bestExample.context}"`);
        console.log(`   Respuesta: "${bestExample.improvedResponse}"\n`);
        
        // Desactivar los demás
        const toDeactivate = founderRelated.filter(ex => 
            ex._id.toString() !== bestExample._id.toString()
        );
        
        if (toDeactivate.length === 0) {
            console.log('✅ No hay ejemplos duplicados para desactivar');
            return;
        }
        
        console.log(`🗑️  Desactivando ${toDeactivate.length} ejemplos duplicados...\n`);
        
        for (const ex of toDeactivate) {
            ex.isActive = false;
            await ex.save();
            console.log(`   ✅ Desactivado: "${ex.context.substring(0, 50)}..."`);
        }
        
        console.log('\n✅ ¡Limpieza completada!');
        console.log(`   Ejemplos activos: 1 (el mejor)`);
        console.log(`   Ejemplos desactivados: ${toDeactivate.length}\n`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 Conexión cerrada');
        process.exit(0);
    }
}

cleanDuplicates();
