/**
 * Script para buscar productos en CJDropshipping y agregarlos a la base de datos
 */

const fs = require('fs');
const mongoose = require('mongoose');

// Cargar variables de entorno
const envContent = fs.readFileSync('/home/miseal/pianolink/.env', 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        envVars[match[1].trim()] = match[2].trim();
    }
});
Object.assign(process.env, envVars);

const CJDropshipping = require('/home/miseal/pianolink/services/CJDropshippingService');
const KitProduct = require('/home/miseal/pianolink/models/KitProduct');

// Conectar a MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Conectado a MongoDB'))
    .catch(err => {
        console.error('❌ Error conectando a MongoDB:', err.message);
        process.exit(1);
    });

// Búsquedas a realizar
const searches = [
    { keyword: 'USB MIDI cable', category: 'cable', subcategory: null },
    { keyword: 'MIDI 5 pin cable', category: 'cable', subcategory: null },
    { keyword: 'keyboard stand', category: 'stand', subcategory: null },
    { keyword: 'sustain pedal piano', category: 'pedal', subcategory: null },
    { keyword: 'piano bench', category: 'accessory', subcategory: null }
];

async function searchAndAddProducts() {
    console.log('\n🔍 Buscando productos en CJDropshipping...\n');

    let totalAdded = 0;
    let totalFound = 0;

    for (const search of searches) {
        try {
            console.log(`\n📦 Buscando: "${search.keyword}" (categoría: ${search.category})`);
            
            // Esperar un poco entre búsquedas para evitar rate limit
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const results = await CJDropshipping.searchProducts({
                keyword: search.keyword,
                pageSize: 10
            });

            console.log(`   Encontrados: ${results.total} productos`);
            totalFound += results.products.length;

            // Tomar los 3 primeros productos de cada búsqueda
            const productsToAdd = results.products.slice(0, 3);

            for (const product of productsToAdd) {
                try {
                    // Verificar si el producto ya existe
                    const existing = await KitProduct.findOne({ 
                        'fulfillment.cjSku': product.productSku 
                    });

                    if (existing) {
                        console.log(`   ⏭️  Ya existe: ${product.productNameEn}`);
                        continue;
                    }

                    // Generar slug único
                    let slug = product.productNameEn
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, '-')
                        .replace(/^-|-$/g, '')
                        .substring(0, 50);

                    // Asegurar que el slug sea único
                    let slugExists = await KitProduct.findOne({ slug });
                    let counter = 1;
                    while (slugExists) {
                        slug = `${slug}-${counter}`;
                        slugExists = await KitProduct.findOne({ slug });
                        counter++;
                    }

                    // Crear el producto
                    const newProduct = new KitProduct({
                        name: product.productNameEn,
                        slug,
                        shortDescription: `${product.categoryName || search.category} - Imported from CJDropshipping`,
                        description: `<p>${product.productNameEn}</p><p>High-quality ${search.category} for your music setup.</p>`,
                        category: search.category,
                        subcategory: search.subcategory,
                        basePrice: parseFloat(product.sellPrice) || 0,
                        pricing: [
                            {
                                region: 'default',
                                price: Math.round(parseFloat(product.sellPrice) * 1.5) || 10,
                                currency: 'USD'
                            },
                            {
                                region: 'CL',
                                price: Math.round(parseFloat(product.sellPrice) * 1.5) || 10,
                                currency: 'USD'
                            }
                        ],
                        images: product.productImage ? [product.productImage] : [],
                        stock: {
                            available: true,
                            quantity: 999,
                            trackInventory: false
                        },
                        fulfillment: {
                            provider: 'cjdropshipping',
                            cjSku: product.productSku,
                            cjPid: product.pid
                        },
                        featured: false,
                        active: true
                    });

                    await newProduct.save();
                    totalAdded++;

                    console.log(`   ✅ Agregado: ${product.productNameEn}`);
                    console.log(`      - SKU: ${product.productSku}`);
                    console.log(`      - Precio base: $${product.sellPrice}`);
                    console.log(`      - Precio venta: $${newProduct.pricing[0].price}`);

                } catch (err) {
                    console.error(`   ❌ Error agregando producto: ${err.message}`);
                }
            }

        } catch (err) {
            console.error(`❌ Error en búsqueda "${search.keyword}":`, err.message);
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`\n📊 RESUMEN:`);
    console.log(`   Total productos encontrados: ${totalFound}`);
    console.log(`   Total productos agregados: ${totalAdded}`);
    console.log('\n✅ Proceso completado!');
    console.log('\n💡 Próximo paso: Ve al Admin Panel para activar los productos destacados');
    console.log('   http://localhost:3000/admin → Welcome Kits → Productos\n');

    mongoose.connection.close();
    process.exit(0);
}

// Ejecutar
searchAndAddProducts().catch(err => {
    console.error('\n❌ Error fatal:', err);
    mongoose.connection.close();
    process.exit(1);
});
