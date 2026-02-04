/**
 * routes/kitProductRoutes.js
 * API para gestión de productos opcionales del Welcome Kit
 */

const express = require('express');
const router = express.Router();
const KitProduct = require('../models/KitProduct');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// ==================== RUTAS PÚBLICAS ====================

/**
 * GET /api/kit-products
 * Lista productos activos (para el checkout)
 */
router.get('/', async (req, res) => {
    try {
        const { category, region, featured } = req.query;
        
        let query = { isActive: true };
        
        if (category) {
            query.category = category;
        }
        
        if (featured === 'true') {
            query.isFeatured = true;
        }
        
        const products = await KitProduct.find(query)
            .sort({ displayOrder: 1, createdAt: -1 })
            .select('-adminNotes -fulfillment.costPrice');
        
        // Si se especifica región, incluir precios específicos
        const productsWithPricing = products.map(product => {
            const p = product.toObject();
            if (region) {
                p.regionalPrice = product.getPriceForRegion(region);
            }
            return p;
        });
        
        res.json({
            success: true,
            products: productsWithPricing,
            count: products.length
        });
        
    } catch (error) {
        console.error('[KitProducts] Error listando productos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/kit-products/categories
 * Lista categorías disponibles con conteo
 */
router.get('/categories', async (req, res) => {
    try {
        const categories = await KitProduct.aggregate([
            { $match: { isActive: true } },
            { $group: { 
                _id: '$category', 
                count: { $sum: 1 },
                featured: { $sum: { $cond: ['$isFeatured', 1, 0] } }
            }},
            { $sort: { count: -1 } }
        ]);
        
        const categoryInfo = {
            keyboard: { icon: '🎹', name: 'Teclados', description: 'Teclados y pianos digitales' },
            stand: { icon: '🪜', name: 'Soportes', description: 'Soportes y bases' },
            pedal: { icon: '🦶', name: 'Pedales', description: 'Pedales sustain y expresión' },
            cable: { icon: '🔌', name: 'Cables', description: 'Cables MIDI y audio' },
            accessory: { icon: '🎧', name: 'Accesorios', description: 'Otros accesorios' },
            bundle: { icon: '📦', name: 'Bundles', description: 'Paquetes completos' }
        };
        
        res.json({
            success: true,
            categories: categories.map(c => ({
                code: c._id,
                ...categoryInfo[c._id],
                count: c.count,
                featuredCount: c.featured
            }))
        });
        
    } catch (error) {
        console.error('[KitProducts] Error obteniendo categorías:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/kit-products/:slug
 * Detalle de un producto por slug
 */
router.get('/:slug', async (req, res) => {
    try {
        const { region } = req.query;
        
        const product = await KitProduct.findOne({ 
            slug: req.params.slug,
            isActive: true 
        }).populate('relatedProducts', 'name slug primaryImage defaultPrice category');
        
        if (!product) {
            return res.status(404).json({ success: false, error: 'Producto no encontrado' });
        }
        
        const p = product.toObject();
        if (region) {
            p.regionalPrice = product.getPriceForRegion(region);
        }
        
        res.json({
            success: true,
            product: p
        });
        
    } catch (error) {
        console.error('[KitProducts] Error obteniendo producto:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== RUTAS ADMIN ====================

/**
 * GET /api/kit-products/admin/all
 * Lista todos los productos (incluyendo inactivos)
 */
router.get('/admin/all', protect, adminOnly, async (req, res) => {
    try {
        const { category, search } = req.query;
        
        let query = {};
        
        if (category) {
            query.category = category;
        }
        
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { 'specs.brand': { $regex: search, $options: 'i' } },
                { 'specs.model': { $regex: search, $options: 'i' } },
                { tags: { $regex: search, $options: 'i' } }
            ];
        }
        
        const products = await KitProduct.find(query)
            .sort({ category: 1, displayOrder: 1 });
        
        // Estadísticas
        const stats = await KitProduct.aggregate([
            { $group: {
                _id: null,
                total: { $sum: 1 },
                active: { $sum: { $cond: ['$isActive', 1, 0] } },
                featured: { $sum: { $cond: ['$isFeatured', 1, 0] } }
            }}
        ]);
        
        res.json({
            success: true,
            products,
            stats: stats[0] || { total: 0, active: 0, featured: 0 }
        });
        
    } catch (error) {
        console.error('[KitProducts] Error listando productos (admin):', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/kit-products/admin
 * Crear nuevo producto
 */
router.post('/admin', protect, adminOnly, async (req, res) => {
    try {
        const productData = req.body;
        
        // Validaciones básicas
        if (!productData.name || !productData.category) {
            return res.status(400).json({ 
                success: false, 
                error: 'Nombre y categoría son requeridos' 
            });
        }
        
        // Verificar slug único
        if (productData.slug) {
            const existing = await KitProduct.findOne({ slug: productData.slug });
            if (existing) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Ya existe un producto con ese slug' 
                });
            }
        }
        
        const product = new KitProduct(productData);
        await product.save();
        
        console.log(`[KitProducts] ✅ Producto creado: ${product.name} por ${req.user.name}`);
        
        res.status(201).json({
            success: true,
            message: 'Producto creado',
            product
        });
        
    } catch (error) {
        console.error('[KitProducts] Error creando producto:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/kit-products/admin/:id
 * Actualizar producto
 */
router.put('/admin/:id', protect, adminOnly, async (req, res) => {
    try {
        const updates = req.body;
        
        // No permitir cambiar _id
        delete updates._id;
        
        const product = await KitProduct.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            { new: true, runValidators: true }
        );
        
        if (!product) {
            return res.status(404).json({ success: false, error: 'Producto no encontrado' });
        }
        
        console.log(`[KitProducts] ✏️ Producto actualizado: ${product.name} por ${req.user.name}`);
        
        res.json({
            success: true,
            message: 'Producto actualizado',
            product
        });
        
    } catch (error) {
        console.error('[KitProducts] Error actualizando producto:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PATCH /api/kit-products/admin/:id/toggle
 * Activar/desactivar producto
 */
router.patch('/admin/:id/toggle', protect, adminOnly, async (req, res) => {
    try {
        const product = await KitProduct.findById(req.params.id);
        
        if (!product) {
            return res.status(404).json({ success: false, error: 'Producto no encontrado' });
        }
        
        product.isActive = !product.isActive;
        await product.save();
        
        console.log(`[KitProducts] ${product.isActive ? '✅' : '⏸️'} Producto ${product.name} ${product.isActive ? 'activado' : 'desactivado'}`);
        
        res.json({
            success: true,
            message: product.isActive ? 'Producto activado' : 'Producto desactivado',
            isActive: product.isActive
        });
        
    } catch (error) {
        console.error('[KitProducts] Error toggling producto:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PATCH /api/kit-products/admin/:id/feature
 * Marcar/desmarcar como destacado
 */
router.patch('/admin/:id/feature', protect, adminOnly, async (req, res) => {
    try {
        const product = await KitProduct.findById(req.params.id);
        
        if (!product) {
            return res.status(404).json({ success: false, error: 'Producto no encontrado' });
        }
        
        product.isFeatured = !product.isFeatured;
        await product.save();
        
        res.json({
            success: true,
            message: product.isFeatured ? 'Marcado como destacado' : 'Quitado de destacados',
            isFeatured: product.isFeatured
        });
        
    } catch (error) {
        console.error('[KitProducts] Error featuring producto:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/kit-products/admin/:id
 * Eliminar producto
 */
router.delete('/admin/:id', protect, adminOnly, async (req, res) => {
    try {
        const product = await KitProduct.findByIdAndDelete(req.params.id);
        
        if (!product) {
            return res.status(404).json({ success: false, error: 'Producto no encontrado' });
        }
        
        console.log(`[KitProducts] 🗑️ Producto eliminado: ${product.name} por ${req.user.name}`);
        
        res.json({
            success: true,
            message: 'Producto eliminado'
        });
        
    } catch (error) {
        console.error('[KitProducts] Error eliminando producto:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/kit-products/admin/reorder
 * Reordenar productos
 */
router.post('/admin/reorder', protect, adminOnly, async (req, res) => {
    try {
        const { products } = req.body; // Array de { id, displayOrder }
        
        if (!Array.isArray(products)) {
            return res.status(400).json({ success: false, error: 'Se requiere array de productos' });
        }
        
        const bulkOps = products.map(p => ({
            updateOne: {
                filter: { _id: p.id },
                update: { $set: { displayOrder: p.displayOrder } }
            }
        }));
        
        await KitProduct.bulkWrite(bulkOps);
        
        res.json({
            success: true,
            message: 'Orden actualizado'
        });
        
    } catch (error) {
        console.error('[KitProducts] Error reordenando:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/kit-products/admin/seed
 * Crear productos de ejemplo (útil para empezar)
 */
router.post('/admin/seed', protect, adminOnly, async (req, res) => {
    try {
        // Verificar si ya hay productos
        const existingCount = await KitProduct.countDocuments();
        if (existingCount > 0 && !req.body.force) {
            return res.json({
                success: false,
                error: 'Ya existen productos. Usa force:true para agregar de todos modos.',
                existingCount
            });
        }
        
        const sampleProducts = [
            // Teclados
            {
                name: 'Yamaha PSR-E373',
                slug: 'yamaha-psr-e373',
                description: 'Teclado portátil de 61 teclas con sensibilidad al tacto. Ideal para principiantes.',
                shortDescription: 'Teclado 61 teclas para principiantes',
                category: 'keyboard',
                subcategory: 'beginner',
                defaultPrice: 199,
                pricing: [
                    { regionCode: 'CL', regionName: 'Chile', price: 189, currency: 'USD', shippingIncluded: true, estimatedDays: '20-30 días' },
                    { regionCode: 'MX', regionName: 'México', price: 185, currency: 'USD', shippingIncluded: true, estimatedDays: '15-25 días' },
                    { regionCode: 'ES', regionName: 'España', price: 210, currency: 'EUR', shippingIncluded: true, estimatedDays: '10-15 días' },
                    { regionCode: 'DEFAULT', regionName: 'Otros', price: 220, currency: 'USD', shippingIncluded: false, shippingCost: 30, estimatedDays: '25-40 días' }
                ],
                specs: {
                    brand: 'Yamaha',
                    model: 'PSR-E373',
                    keys: 61,
                    weighted: false,
                    touchSensitive: true,
                    sounds: 622
                },
                fulfillment: {
                    provider: 'cjdropshipping',
                    cjSku: '',
                    costPrice: 120,
                    weight: 4.5
                },
                tags: ['yamaha', 'principiante', '61 teclas', 'portátil'],
                isActive: true,
                isFeatured: true,
                displayOrder: 1
            },
            {
                name: 'Yamaha P-45',
                slug: 'yamaha-p45',
                description: 'Piano digital de 88 teclas con acción de martillo graduada (GHS). Sonido de piano de cola Yamaha.',
                shortDescription: 'Piano digital 88 teclas contrapesadas',
                category: 'keyboard',
                subcategory: 'digital-piano',
                defaultPrice: 449,
                pricing: [
                    { regionCode: 'CL', regionName: 'Chile', price: 429, currency: 'USD', shippingIncluded: true, estimatedDays: '25-35 días' },
                    { regionCode: 'MX', regionName: 'México', price: 420, currency: 'USD', shippingIncluded: true, estimatedDays: '20-30 días' },
                    { regionCode: 'ES', regionName: 'España', price: 450, currency: 'EUR', shippingIncluded: true, estimatedDays: '12-18 días' },
                    { regionCode: 'DEFAULT', regionName: 'Otros', price: 480, currency: 'USD', shippingIncluded: false, shippingCost: 50, estimatedDays: '30-45 días' }
                ],
                specs: {
                    brand: 'Yamaha',
                    model: 'P-45',
                    keys: 88,
                    weighted: true,
                    touchSensitive: true,
                    sounds: 10
                },
                fulfillment: {
                    provider: 'cjdropshipping',
                    cjSku: '',
                    costPrice: 280,
                    weight: 11.5
                },
                tags: ['yamaha', 'piano digital', '88 teclas', 'contrapesado', 'GHS'],
                isActive: true,
                isFeatured: true,
                displayOrder: 2
            },
            // Soportes
            {
                name: 'Soporte en X Ajustable',
                slug: 'soporte-x-ajustable',
                description: 'Soporte tipo X con altura ajustable. Compatible con la mayoría de teclados de 61 a 88 teclas.',
                shortDescription: 'Soporte tipo X universal',
                category: 'stand',
                defaultPrice: 35,
                pricing: [
                    { regionCode: 'CL', regionName: 'Chile', price: 32, currency: 'USD', shippingIncluded: true, estimatedDays: '15-25 días' },
                    { regionCode: 'MX', regionName: 'México', price: 30, currency: 'USD', shippingIncluded: true, estimatedDays: '12-20 días' },
                    { regionCode: 'DEFAULT', regionName: 'Otros', price: 38, currency: 'USD', shippingIncluded: true, estimatedDays: '20-30 días' }
                ],
                specs: {
                    adjustable: true,
                    maxWeight: 50,
                    other: { material: 'Acero', foldable: true }
                },
                fulfillment: {
                    provider: 'cjdropshipping',
                    cjSku: '',
                    costPrice: 15,
                    weight: 3.2
                },
                tags: ['soporte', 'stand', 'ajustable', 'universal'],
                isActive: true,
                isFeatured: false,
                displayOrder: 10
            },
            {
                name: 'Soporte Piano Digital tipo Mueble',
                slug: 'soporte-piano-mueble',
                description: 'Soporte estilo mueble para pianos digitales de 88 teclas. Diseño elegante en madera.',
                shortDescription: 'Soporte tipo mueble para piano digital',
                category: 'stand',
                defaultPrice: 89,
                pricing: [
                    { regionCode: 'CL', regionName: 'Chile', price: 85, currency: 'USD', shippingIncluded: true, estimatedDays: '25-35 días' },
                    { regionCode: 'MX', regionName: 'México', price: 82, currency: 'USD', shippingIncluded: true, estimatedDays: '20-30 días' },
                    { regionCode: 'DEFAULT', regionName: 'Otros', price: 95, currency: 'USD', shippingIncluded: false, shippingCost: 20, estimatedDays: '30-40 días' }
                ],
                specs: {
                    adjustable: false,
                    maxWeight: 80,
                    other: { material: 'Madera MDF', style: 'mueble' }
                },
                fulfillment: {
                    provider: 'cjdropshipping',
                    cjSku: '',
                    costPrice: 45,
                    weight: 8
                },
                tags: ['soporte', 'piano', 'mueble', 'elegante'],
                isActive: true,
                isFeatured: false,
                displayOrder: 11
            },
            // Pedales
            {
                name: 'Pedal Sustain Universal',
                slug: 'pedal-sustain-universal',
                description: 'Pedal sustain compatible con todos los teclados y pianos digitales. Conector estándar 1/4".',
                shortDescription: 'Pedal sustain universal',
                category: 'pedal',
                defaultPrice: 18,
                pricing: [
                    { regionCode: 'CL', regionName: 'Chile', price: 16, currency: 'USD', shippingIncluded: true, estimatedDays: '15-25 días' },
                    { regionCode: 'MX', regionName: 'México', price: 15, currency: 'USD', shippingIncluded: true, estimatedDays: '12-20 días' },
                    { regionCode: 'DEFAULT', regionName: 'Otros', price: 20, currency: 'USD', shippingIncluded: true, estimatedDays: '20-30 días' }
                ],
                specs: {
                    other: { connector: '1/4" (6.35mm)', polarity: 'Switchable' }
                },
                fulfillment: {
                    provider: 'cjdropshipping',
                    cjSku: '',
                    costPrice: 5,
                    weight: 0.3
                },
                tags: ['pedal', 'sustain', 'universal'],
                isActive: true,
                isFeatured: false,
                displayOrder: 20
            },
            {
                name: 'Pedal Sustain Estilo Piano',
                slug: 'pedal-sustain-piano-style',
                description: 'Pedal sustain con diseño tipo piano real. Base metálica antideslizante. Sensación profesional.',
                shortDescription: 'Pedal sustain estilo piano real',
                category: 'pedal',
                defaultPrice: 35,
                pricing: [
                    { regionCode: 'CL', regionName: 'Chile', price: 32, currency: 'USD', shippingIncluded: true, estimatedDays: '15-25 días' },
                    { regionCode: 'MX', regionName: 'México', price: 30, currency: 'USD', shippingIncluded: true, estimatedDays: '12-20 días' },
                    { regionCode: 'DEFAULT', regionName: 'Otros', price: 38, currency: 'USD', shippingIncluded: true, estimatedDays: '20-30 días' }
                ],
                specs: {
                    other: { connector: '1/4" (6.35mm)', style: 'Piano', material: 'Metal' }
                },
                fulfillment: {
                    provider: 'cjdropshipping',
                    cjSku: '',
                    costPrice: 12,
                    weight: 0.8
                },
                tags: ['pedal', 'sustain', 'piano', 'profesional'],
                isActive: true,
                isFeatured: true,
                displayOrder: 21
            },
            // Bundle
            {
                name: 'Bundle Principiante Completo',
                slug: 'bundle-principiante-completo',
                description: 'Todo lo que necesitas para empezar: Teclado Yamaha PSR-E373 + Soporte X + Pedal Sustain + Cable MIDI. ¡Ahorra $30!',
                shortDescription: 'Teclado + Soporte + Pedal + Cable',
                category: 'bundle',
                defaultPrice: 259,
                pricing: [
                    { regionCode: 'CL', regionName: 'Chile', price: 249, currency: 'USD', shippingIncluded: true, estimatedDays: '25-35 días' },
                    { regionCode: 'MX', regionName: 'México', price: 245, currency: 'USD', shippingIncluded: true, estimatedDays: '20-30 días' },
                    { regionCode: 'DEFAULT', regionName: 'Otros', price: 280, currency: 'USD', shippingIncluded: false, shippingCost: 40, estimatedDays: '30-45 días' }
                ],
                specs: {
                    other: { includesSetup: true, includesTrialClass: true }
                },
                fulfillment: {
                    provider: 'cjdropshipping',
                    costPrice: 145,
                    weight: 8
                },
                tags: ['bundle', 'principiante', 'completo', 'ahorro'],
                isActive: true,
                isFeatured: true,
                displayOrder: 0
            }
        ];
        
        const created = await KitProduct.insertMany(sampleProducts);
        
        console.log(`[KitProducts] 🌱 ${created.length} productos de ejemplo creados`);
        
        res.json({
            success: true,
            message: `${created.length} productos creados`,
            products: created
        });
        
    } catch (error) {
        console.error('[KitProducts] Error en seed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
