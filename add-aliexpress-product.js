const mongoose = require('mongoose');
require('dotenv').config();
const KitProduct = require('./models/KitProduct');

// Producto que el usuario quiere agregar
// URL: https://www.aliexpress.com/item/1005003373147519.html

mongoose.connect(process.env.MONGO_URI).then(async () => {
    console.log('✅ Conectado a MongoDB');
    
    // Extraer info del producto (ajusta según lo que encuentres en AliExpress)
    const product = {
        name: 'Cable MIDI USB para Teclado',
        slug: 'cable-midi-usb-teclado',
        category: 'cable',
        shortDescription: 'Cable MIDI USB estándar para conectar teclado a PC',
        description: 'Cable MIDI USB de alta calidad para conectar tu teclado MIDI a computadora. Compatible con la mayoría de teclados y software de producción musical. Longitud: 1.5m',
        fulfillment: {
            provider: 'aliexpress',
            aliexpressUrl: 'https://www.aliexpress.com/item/1005003373147519.html',
            dsersProductId: '1005003373147519',
            costPrice: 2.50 // Ajusta según el precio real que veas
        },
        defaultPrice: 15, // Precio de venta (ya con margen)
        isActive: true,
        isFeatured: true,
        imageUrl: 'https://via.placeholder.com/400x300?text=Cable+MIDI+USB',
        specs: {
            brand: 'Generic',
            other: {
                length: '1.5m',
                connectors: 'USB to MIDI 5-pin DIN',
                compatibility: 'Universal MIDI keyboards'
            }
        }
    };
    
    const created = await KitProduct.findOneAndUpdate(
        { slug: product.slug },
        product,
        { upsert: true, new: true }
    );
    
    console.log('✅ Producto agregado:', created.name);
    console.log('   Slug:', created.slug);
    console.log('   Precio:', '$' + created.defaultPrice);
    console.log('   Costo:', '$' + created.fulfillment.costPrice);
    console.log('   Margen:', '$' + (created.defaultPrice - created.fulfillment.costPrice));
    console.log('\n📍 Ahora puedes verlo en: Admin Panel → Welcome Kits → Productos');
    console.log('🛒 O en la pestaña: DSers + AliExpress');
    
    process.exit(0);
    
}).catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
