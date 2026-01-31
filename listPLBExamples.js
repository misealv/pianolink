/**
 * listPLBExamples.js - Lista todos los ejemplos de aprendizaje de PLB
 * 
 * USO: node listPLBExamples.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const PLBExample = require('./models/PLBExample');

console.log('📚 Listando ejemplos de aprendizaje de PLB...\n');

async function listExamples() {
    try {
        // Conectar a MongoDB
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✅ Conectado a MongoDB\n');
        
        // Obtener todos los ejemplos
        const examples = await PLBExample.find({})
            .sort({ createdAt: -1 })
            .lean();
        
        if (examples.length === 0) {
            console.log('⚠️  No hay ejemplos guardados todavía\n');
            return;
        }
        
        console.log(`📊 Total de ejemplos: ${examples.length}\n`);
        
        // Agrupar por categoría
        const byCategory = {};
        examples.forEach(ex => {
            if (!byCategory[ex.category]) {
                byCategory[ex.category] = [];
            }
            byCategory[ex.category].push(ex);
        });
        
        // Mostrar por categoría
        Object.keys(byCategory).sort().forEach(category => {
            const categoryExamples = byCategory[category];
            const activeCount = categoryExamples.filter(ex => ex.isActive).length;
            
            console.log(`\n${'═'.repeat(60)}`);
            console.log(`📁 CATEGORÍA: ${category.toUpperCase()}`);
            console.log(`   Total: ${categoryExamples.length} | Activos: ${activeCount}`);
            console.log('═'.repeat(60));
            
            categoryExamples.forEach((ex, i) => {
                const status = ex.isActive ? '✅' : '❌';
                console.log(`\n${status} Ejemplo ${i + 1}:`);
                console.log(`   ID: ${ex._id}`);
                console.log(`   Rating: ${'⭐'.repeat(ex.rating)}`);
                console.log(`   Usado: ${ex.usageCount} veces`);
                console.log(`   Profesor: ${ex.teacherEmail}`);
                console.log(`   Creado: ${new Date(ex.createdAt).toLocaleString()}`);
                console.log(`\n   📝 Contexto:\n   "${ex.context}"`);
                console.log(`\n   ✨ Respuesta Correcta:\n   "${ex.improvedResponse}"`);
                
                if (ex.originalResponse) {
                    console.log(`\n   ⚠️  Respuesta Original (incorrecta):\n   "${ex.originalResponse}"`);
                }
            });
        });
        
        console.log('\n' + '═'.repeat(60));
        console.log('🎯 RESUMEN');
        console.log('═'.repeat(60));
        
        const totalActive = examples.filter(ex => ex.isActive).length;
        const totalInactive = examples.length - totalActive;
        const avgRating = (examples.reduce((sum, ex) => sum + ex.rating, 0) / examples.length).toFixed(2);
        const totalUsage = examples.reduce((sum, ex) => sum + ex.usageCount, 0);
        
        console.log(`Total ejemplos: ${examples.length}`);
        console.log(`Activos: ${totalActive} | Inactivos: ${totalInactive}`);
        console.log(`Rating promedio: ${avgRating}/5`);
        console.log(`Uso total: ${totalUsage} veces`);
        console.log(`Categorías: ${Object.keys(byCategory).join(', ')}`);
        console.log('═'.repeat(60) + '\n');
        
        // Destacar el ejemplo del fundador si existe
        const founderExample = examples.find(ex => ex.category === 'fundador' && ex.isActive);
        if (founderExample) {
            console.log('🎉 Ejemplo del fundador encontrado y activo:');
            console.log(`   "${founderExample.improvedResponse}"\n`);
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 Conexión cerrada');
        process.exit(0);
    }
}

listExamples();
