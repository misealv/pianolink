/**
 * routes/welcomeKitRoutes.js
 * API completa para el checkout del Welcome Kit
 * 
 * Flujo:
 * 1. GET /api/welcome-kit/pricing/:country → Obtener precio regional
 * 2. POST /api/welcome-kit/checkout → Crear orden + guardar dirección
 * 3. POST /api/welcome-kit/verify → Verificar pago y crear WelcomeKit
 * 4. GET /api/welcome-kit/status/:id → Estado del kit (para el cliente)
 * 5. PUT /api/welcome-kit/:id/shipping → Admin actualiza tracking
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fetch = require('node-fetch');
const WelcomeKit = require('../models/WelcomeKit');
const KitProduct = require('../models/KitProduct');
const User = require('../models/User');
const Lead = require('../models/Lead');
const GlobalConfig = require('../models/GlobalConfig');
const CJConfig = require('../models/CJConfig');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const EmailService = require('../services/EmailService');
const CJDropshipping = require('../services/CJDropshippingService');
const OnboardingSlot = require('../models/OnboardingSlot');
const { generateInterviewConfirmationEmail } = require('../templates/interviewConfirmationEmail');
const { generateWelcomeKitEmail } = require('../templates/welcomeKitEmail');
const moment = require('moment-timezone');
require('moment/locale/es'); // Cargar locale español para moment
moment.locale('es');

// Helper: Obtener datos del admin para inyectar en emails
async function _getAdminEmailData() {
    try {
        const profile = await GlobalConfig.getAdminProfile();
        return {
            adminName: profile.name || 'Equipo PianoLink',
            adminEmail: profile.email || 'hola@pianolink.net',
            whatsappNumber: profile.whatsapp || '+56959089770',
            adminWhatsapp: profile.whatsapp || '+56959089770'
        };
    } catch (err) {
        console.error('[AdminProfile] Error cargando perfil, usando defaults:', err.message);
        return {
            adminName: 'Equipo PianoLink',
            adminEmail: 'hola@pianolink.net',
            whatsappNumber: '+56959089770',
            adminWhatsapp: '+56959089770'
        };
    }
}

// ==================== PRECIO KIT V2 (PÚBLICO) ====================

/**
 * GET /api/welcome-kit/v2/price
 * Obtiene el precio actual del Kit de Bienvenida V2
 */
router.get('/v2/price', async (req, res) => {
    try {
        const config = await GlobalConfig.findOne({ isDefault: true });
        const priceUSD = config?.welcomeKitV2?.priceUSD || 44;
        const extraChildPriceUSD = config?.welcomeKitV2?.extraChildPriceUSD || 15;
        
        res.json({
            success: true,
            priceUSD,
            extraChildPriceUSD,
            currency: 'USD',
            description: 'Asesoría técnica + Setup técnico + Clase de prueba 30 min'
        });
    } catch (error) {
        console.error('Error obteniendo precio Kit V2:', error);
        res.json({ success: true, priceUSD: 44, extraChildPriceUSD: 15, currency: 'USD' });
    }
});

// ==================== HELPERS ====================

// Obtener access token de PayPal
async function getPayPalAccessToken() {
    const auth = Buffer.from(
        `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
    ).toString('base64');

    const baseUrl = process.env.PAYPAL_MODE === 'live'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';

    const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    });

    const data = await response.json();
    return data.access_token;
}

// Detectar país por IP (usando servicio gratuito)
async function detectCountryByIP(ip) {
    try {
        // Ignorar IPs locales
        if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168')) {
            return 'CL'; // Default para desarrollo
        }
        
        const response = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`);
        const data = await response.json();
        return data.countryCode || 'DEFAULT';
    } catch (error) {
        console.error('[WelcomeKit] Error detectando país:', error.message);
        return 'DEFAULT';
    }
}

// ==================== RUTAS PÚBLICAS ====================

/**
 * GET /api/welcome-kit/pricing
 * Obtiene el precio del kit para un país específico
 * Query: ?country=CL o auto-detecta por IP
 */
router.get('/pricing', async (req, res) => {
    try {
        let country = req.query.country;
        
        // Auto-detectar si no se especifica
        if (!country) {
            const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
            country = await detectCountryByIP(ip);
        }
        
        const config = await GlobalConfig.findOne({ isDefault: true });
        
        if (!config || !config.regionalPricing?.welcomeKit) {
            // Precio por defecto si no hay configuración
            return res.json({
                success: true,
                country: country,
                price: 55,
                currency: 'USD',
                includesShipping: false,
                shippingDays: '7-15 días',
                kitContents: [
                    'Cable MIDI USB de alta calidad',
                    'Sesión de Setup técnico personalizada',
                    'Clase de prueba de 30 minutos'
                ]
            });
        }
        
        // Buscar precio específico del país
        let pricing = config.regionalPricing.welcomeKit.find(p => p.regionCode === country);
        
        // Si no existe, usar DEFAULT
        if (!pricing) {
            pricing = config.regionalPricing.welcomeKit.find(p => p.regionCode === 'DEFAULT');
        }
        
        res.json({
            success: true,
            country: country,
            price: pricing?.price || 55,
            currency: pricing?.currency || 'USD',
            includesShipping: pricing?.includesShipping || false,
            shippingDays: pricing?.shippingDays || '7-15 días',
            kitContents: [
                'Cable MIDI USB de alta calidad',
                'Sesión de Setup técnico personalizada',
                'Clase de prueba de 30 minutos'
            ]
        });
        
    } catch (error) {
        console.error('[WelcomeKit] Error obteniendo pricing:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/welcome-kit/products
 * Lista productos activos disponibles para el kit (PÚBLICO - sin autenticación)
 */
router.get('/products', async (req, res) => {
    try {
        const KitProduct = require('../models/KitProduct');
        const country = req.query.country || 'DEFAULT';
        
        const products = await KitProduct.find({ isActive: true })
            .sort({ category: 1, name: 1 });
        
        // Agregar precio por país
        const productsWithPricing = products.map(product => {
            const regionPrice = product.pricing?.find(p => p.regionCode === country);
            const defaultPrice = product.pricing?.find(p => p.regionCode === 'DEFAULT');
            
            return {
                _id: product._id,
                name: product.name,
                shortDescription: product.shortDescription,
                category: product.category,
                imageUrl: product.imageUrl,
                defaultPrice: regionPrice?.price || defaultPrice?.price || product.defaultPrice || 0,
                currency: regionPrice?.currency || defaultPrice?.currency || 'USD'
            };
        });
        
        res.json({
            success: true,
            products: productsWithPricing,
            count: productsWithPricing.length
        });
        
    } catch (error) {
        console.error('[WelcomeKit] Error listando productos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/welcome-kit/service-pricing
 * Obtiene precio del servicio (Setup + Clase) por país (PÚBLICO)
 */
router.get('/service-pricing', async (req, res) => {
    try {
        const country = req.query.country || 'DEFAULT';
        const config = await GlobalConfig.findOne({ isDefault: true });
        
        const setupPricing = config?.regionalPricing?.setupOnly?.find(p => p.regionCode === country) ||
                            config?.regionalPricing?.setupOnly?.find(p => p.regionCode === 'DEFAULT');
        
        res.json({
            success: true,
            country,
            price: setupPricing?.price || 10,
            currency: setupPricing?.currency || 'USD',
            description: 'Sesión de Setup técnico + Clase de prueba 30min'
        });
        
    } catch (error) {
        console.error('[WelcomeKit] Error obteniendo precio servicio:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/welcome-kit/pricing/dynamic
 * Calcula precio dinámico del kit basado en CJDropshipping + servicios fijos por país
 * Query: ?country=CL&cableType=USB_B&products[]=sku1,sku2
 * 
 * Lógica de precios:
 * - Servicios (setup + clase): Precio fijo configurado por país
 * - Productos físicos (cable, teclados, etc.): Precio dinámico desde CJ con margen
 * Total = Servicios fijos + Productos dinámicos
 */
router.get('/pricing/dynamic', async (req, res) => {
    try {
        const { country, cableType, products } = req.query;
        
        if (!country) {
            return res.status(400).json({ success: false, error: 'País requerido' });
        }
        
        // Obtener configuración de CJ
        const cjConfig = await CJConfig.getConfig();
        
        // Obtener precios de servicios para el país (o default)
        const servicePrices = cjConfig.pricing?.servicePricesByCountry?.get(country) || 
                             cjConfig.pricing?.servicePricesByCountry?.get('default') ||
                             { setupSession: 15, trialClass: 10 };
        
        // Si no está habilitado o no usa precios dinámicos, usar precios estáticos
        if (!cjConfig.enabled || !cjConfig.pricing.useDynamicPricing) {
            // Fallback a pricing estático
            const config = await GlobalConfig.findOne({ isDefault: true });
            const staticPricing = config?.regionalPricing?.welcomeKit?.find(p => p.regionCode === country) ||
                                  config?.regionalPricing?.welcomeKit?.find(p => p.regionCode === 'DEFAULT');
            
            return res.json({
                success: true,
                mode: 'static',
                country,
                pricing: {
                    services: {
                        setupSession: servicePrices.setupSession,
                        trialClass: servicePrices.trialClass,
                        subtotal: servicePrices.setupSession + servicePrices.trialClass
                    },
                    cable: {
                        price: staticPricing?.price ? staticPricing.price - servicePrices.setupSession - servicePrices.trialClass : 20,
                        estimatedDays: staticPricing?.shippingDays || '15-25 días'
                    },
                    total: staticPricing?.price || (servicePrices.setupSession + servicePrices.trialClass + 20),
                    currency: staticPricing?.currency || 'USD'
                }
            });
        }
        
        // Calcular precios dinámicos desde CJ
        const result = {
            mode: 'dynamic',
            country,
            pricing: {
                services: {
                    setupSession: servicePrices.setupSession,
                    trialClass: servicePrices.trialClass,
                    subtotal: servicePrices.setupSession + servicePrices.trialClass,
                    note: 'Precios fijos configurados por país'
                },
                cable: null,
                optionalProducts: [],
                total: 0,
                currency: 'USD'
            },
            calculatedAt: new Date().toISOString()
        };
        
        // Calcular precio del cable si se especifica tipo (DINÁMICO desde CJ)
        if (cableType) {
            const cableSku = cjConfig.skus[cableType];
            if (cableSku) {
                try {
                    const cableMargin = cjConfig.pricing.marginByCategory.cable;
                    const cablePricing = await CJDropshipping.getProductPricing(cableSku, country, cableMargin);
                    result.pricing.cable = {
                        type: cableType,
                        sku: cableSku,
                        cost: cablePricing.totalCost,
                        price: cablePricing.salePrice,
                        margin: cableMargin,
                        estimatedDays: cablePricing.estimatedDays,
                        logistic: cablePricing.logisticName,
                        note: 'Precio dinámico calculado desde CJDropshipping'
                    };
                } catch (err) {
                    console.error(`[WelcomeKit] Error obteniendo precio de cable ${cableType}:`, err.message);
                    // Usar precio estático como fallback
                    result.pricing.cable = {
                        type: cableType,
                        price: 20,
                        estimatedDays: '15-25 días',
                        fallback: true,
                        error: err.message
                    };
                }
            }
        }
        
        // Calcular precios de productos opcionales (DINÁMICOS desde CJ)
        if (products) {
            const productSkus = Array.isArray(products) ? products : [products];
            const KitProduct = require('../models/KitProduct');
            
            for (const sku of productSkus) {
                // Buscar el producto en nuestra DB para obtener categoría
                const localProduct = await KitProduct.findOne({ 'fulfillment.cjSku': sku });
                const category = localProduct?.category || 'accessory';
                const margin = cjConfig.pricing.marginByCategory[category] || cjConfig.pricing.defaultMarginPercent;
                
                try {
                    const productPricing = await CJDropshipping.getProductPricing(sku, country, margin);
                    result.pricing.optionalProducts.push({
                        sku,
                        name: localProduct?.name || productPricing.productName,
                        category,
                        cost: productPricing.totalCost,
                        price: productPricing.salePrice,
                        margin,
                        estimatedDays: productPricing.estimatedDays,
                        note: 'Precio dinámico calculado desde CJDropshipping'
                    });
                } catch (err) {
                    console.error(`[WelcomeKit] Error obteniendo precio de producto ${sku}:`, err.message);
                    // Usar precio de nuestra DB como fallback
                    if (localProduct) {
                        const regionalPrice = localProduct.getPriceForRegion(country);
                        result.pricing.optionalProducts.push({
                            sku,
                            name: localProduct.name,
                            category,
                            price: regionalPrice.price,
                            estimatedDays: regionalPrice.estimatedDays,
                            fallback: true
                        });
                    }
                }
            }
        }
        
        // Calcular total: Servicios fijos + Productos dinámicos
        result.pricing.total = result.pricing.services.subtotal +
                              (result.pricing.cable?.price || 0) +
                              result.pricing.optionalProducts.reduce((sum, p) => sum + p.price, 0);
        
        res.json({
            success: true,
            ...result
        });
        
    } catch (error) {
        console.error('[WelcomeKit] Error calculando pricing dinámico:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/welcome-kit/pricing/product/:sku
 * Obtiene precio dinámico de un producto específico
 */
router.get('/pricing/product/:sku', async (req, res) => {
    try {
        const { sku } = req.params;
        const { country } = req.query;
        
        if (!country) {
            return res.status(400).json({ success: false, error: 'País requerido' });
        }
        
        const cjConfig = await CJConfig.getConfig();
        
        if (!cjConfig.enabled) {
            return res.status(400).json({ 
                success: false, 
                error: 'CJDropshipping no está habilitado' 
            });
        }
        
        // Buscar categoría del producto
        const KitProduct = require('../models/KitProduct');
        const localProduct = await KitProduct.findOne({ 'fulfillment.cjSku': sku });
        const category = localProduct?.category || 'accessory';
        const margin = cjConfig.pricing.marginByCategory[category] || cjConfig.pricing.defaultMarginPercent;
        
        const pricing = await CJDropshipping.getProductPricing(sku, country, margin);
        
        res.json({
            success: true,
            product: {
                ...pricing,
                localName: localProduct?.name,
                category
            }
        });
        
    } catch (error) {
        console.error('[WelcomeKit] Error obteniendo precio de producto:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/welcome-kit/countries
 * Lista todos los países con precios configurados
 */
router.get('/countries', async (req, res) => {
    try {
        const config = await GlobalConfig.findOne({ isDefault: true });
        
        const countries = [
            { code: 'CL', name: 'Chile', flag: '🇨🇱' },
            { code: 'AR', name: 'Argentina', flag: '🇦🇷' },
            { code: 'ES', name: 'España', flag: '🇪🇸' },
            { code: 'MX', name: 'México', flag: '🇲🇽' },
            { code: 'US', name: 'Estados Unidos', flag: '🇺🇸' },
            { code: 'DEFAULT', name: 'Otro país', flag: '🌎' }
        ];
        
        // Agregar precios a cada país (welcome kit completo y solo setup)
        const countriesWithPricing = countries.map(c => {
            const fullPricing = config?.regionalPricing?.welcomeKit?.find(p => p.regionCode === c.code);
            const setupPricing = config?.regionalPricing?.setupOnly?.find(p => p.regionCode === c.code);
            
            return {
                ...c,
                price: fullPricing?.price || 55,
                setupOnlyPrice: setupPricing?.price || 25,
                currency: fullPricing?.currency || 'USD',
                includesShipping: fullPricing?.includesShipping || false,
                shippingDays: fullPricing?.shippingDays || '7-15 días'
            };
        });
        
        res.json({ success: true, countries: countriesWithPricing });
        
    } catch (error) {
        console.error('[WelcomeKit] Error listando países:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/welcome-kit/checkout
 * Crea la orden de pago en PayPal y guarda los datos del cliente
 * Acepta kitType: 'full' (con productos), 'setup_only' (solo servicio), o 'welcome_kit_v2' (nuevo kit)
 */
router.post('/checkout', async (req, res) => {
    try {
        const { 
            // Datos personales
            name, 
            email, 
            whatsapp,
            // Dirección de envío (solo si hay productos físicos)
            street,
            city,
            state,
            postalCode,
            country,
            // Tipo de kit
            kitType = 'setup_only',  // 'full' (con productos), 'setup_only' (solo servicio), o 'welcome_kit_v2'
            // Tipo de estudiante
            studentType = 'self', // 'self' o 'child'
            // Productos opcionales
            productIds = [], // Array de IDs de productos
            // Beneficiarios (puede ser múltiple si es apoderado)
            beneficiaries = [], // Array de {name, age}
            // Backward compatibility
            beneficiaryName,
            beneficiaryAge,
            // Kit V2: datos de hijos y precio total
            children = [], // Array de {name, age} (nuevo formato)
            childrenCount = 1,
            totalUSD = null
        } = req.body;
        
        // ============= KIT V2: Solo guardar datos, sin crear orden PayPal =============
        if (kitType === 'welcome_kit_v2') {
            // Validaciones básicas
            if (!name || !email || !whatsapp) {
                return res.status(400).json({
                    success: false,
                    error: 'Nombre, email y WhatsApp son requeridos'
                });
            }
            
            // Normalizar beneficiarios desde children (nuevo formato V2)
            const normalizedBeneficiaries = (children || []).map(c => ({
                name: c.name,
                age: c.age || null,
                relationship: 'child'
            }));
            
            // Si studentType es 'self', el estudiante es el mismo que compra
            if (studentType === 'self') {
                normalizedBeneficiaries.push({
                    name: name,
                    age: null,
                    relationship: 'self'
                });
            }
            
            // Buscar o crear lead
            let lead = await Lead.findOne({ email: email.toLowerCase() });
            if (!lead) {
                lead = await Lead.create({
                    name,
                    email: email.toLowerCase(),
                    whatsapp,
                    country: country || 'CL',
                    source: 'kit_v2_checkout',
                    stage: 'interesado',
                    type: 'client',
                    clientType: studentType === 'self' ? 'adult_learner' : 'guardian',
                    beneficiaries: normalizedBeneficiaries
                });
            } else {
                // Actualizar datos existentes
                lead.name = name;
                lead.whatsapp = whatsapp;
                lead.clientType = studentType === 'self' ? 'adult_learner' : 'guardian';
                lead.beneficiaries = normalizedBeneficiaries;
                await lead.save();
            }
            
            console.log('[WelcomeKit V2] 📝 Datos guardados:', email, '- Estudiantes:', normalizedBeneficiaries.map(b => b.name).join(', '), '- Total USD:', totalUSD);
            
            return res.json({
                success: true,
                leadId: lead._id,
                message: 'Datos guardados correctamente',
                childrenCount,
                totalUSD
            });
        }
        // ============= FIN KIT V2 =============
        
        // Validaciones básicas
        if (!name || !email || !whatsapp) {
            return res.status(400).json({
                success: false,
                error: 'Nombre, email y WhatsApp son requeridos'
            });
        }
        
        // Validar beneficiario si es hijo
        const hasBeneficiaries = (beneficiaries && beneficiaries.length > 0) || beneficiaryName;
        if (studentType === 'child' && !hasBeneficiaries) {
            return res.status(400).json({
                success: false,
                error: 'Datos de al menos un estudiante requeridos'
            });
        }
        
        const hasPhysicalProducts = productIds && productIds.length > 0;
        
        // Si hay productos físicos, necesita dirección
        if (hasPhysicalProducts && (!street || !city || !country)) {
            return res.status(400).json({
                success: false,
                error: 'Dirección de envío requerida para productos físicos'
            });
        }
        
        // Obtener configuración de precios
        const config = await GlobalConfig.findOne({ isDefault: true });
        
        // Contar cuántos beneficiarios (estudiantes) hay
        // Si es 'self' cuenta como 1, si es 'child' cuenta los beneficiarios
        let studentCount = 1;
        if (studentType === 'child') {
            if (beneficiaries && beneficiaries.length > 0) {
                studentCount = beneficiaries.length;
            } else if (beneficiaryName) {
                studentCount = 1;
            }
        }
        
        console.log(`[WelcomeKit] 👨‍👧‍👦 Estudiantes: ${studentCount}`);
        
        // 1. Calcular precio del servicio (Setup + Clase) x cantidad de estudiantes
        let servicePriceUnit = 10; // Default por estudiante
        let currency = 'USD';
        
        const setupPricing = config?.regionalPricing?.setupOnly?.find(p => p.regionCode === country) ||
                            config?.regionalPricing?.setupOnly?.find(p => p.regionCode === 'DEFAULT');
        if (setupPricing) {
            servicePriceUnit = setupPricing.price;
            currency = setupPricing.currency || 'USD';
        }
        
        // Multiplicar por cantidad de estudiantes
        const servicePrice = servicePriceUnit * studentCount;
        
        // 2. Calcular precio de productos adicionales
        let productsTotal = 0;
        let selectedProducts = [];
        
        if (hasPhysicalProducts) {
            selectedProducts = await KitProduct.find({ 
                _id: { $in: productIds },
                isActive: true 
            });
            
            for (const product of selectedProducts) {
                // Buscar precio por región o usar default
                const regionPrice = product.pricing?.find(p => p.regionCode === country);
                const productPrice = regionPrice?.price || product.defaultPrice || 0;
                productsTotal += productPrice;
            }
        }
        
        // 3. Total
        const totalPrice = servicePrice + productsTotal;
        
        console.log(`[WelcomeKit] 💰 Precio: Servicio $${servicePriceUnit} x ${studentCount} = $${servicePrice} + Productos $${productsTotal} = Total $${totalPrice}`);
        
        // Crear orden en PayPal
        const accessToken = await getPayPalAccessToken();
        const baseUrl = process.env.PAYPAL_MODE === 'live'
            ? 'https://api-m.paypal.com'
            : 'https://api-m.sandbox.paypal.com';
        
        const referenceId = `wk_${Date.now()}_${country}_${hasPhysicalProducts ? 'full' : 'service'}`;
        
        // Construir items para PayPal
        const paypalItems = [{
            name: studentCount > 1 
                ? `PianoLink Setup + Clase (${studentCount} estudiantes)`
                : 'PianoLink Setup + Clase',
            description: studentCount > 1
                ? `Sesión de configuración técnica + Clase de prueba 30min x${studentCount} estudiantes`
                : 'Sesión de configuración técnica + Clase de prueba 30min',
            unit_amount: {
                currency_code: currency,
                value: servicePriceUnit.toFixed(2)
            },
            quantity: studentCount.toString(),
            category: 'DIGITAL_GOODS'
        }];
        
        // Agregar productos físicos
        for (const product of selectedProducts) {
            const regionPrice = product.pricing?.find(p => p.regionCode === country);
            const productPrice = regionPrice?.price || product.defaultPrice || 0;
            
            paypalItems.push({
                name: product.name,
                description: product.shortDescription || product.category,
                unit_amount: {
                    currency_code: currency,
                    value: productPrice.toFixed(2)
                },
                quantity: '1',
                category: 'PHYSICAL_GOODS'
            });
        }
        
        // Construir purchase unit base
        const purchaseUnit = {
            reference_id: referenceId,
            description: hasPhysicalProducts 
                ? `Kit PianoLink + ${selectedProducts.length} producto(s) - Envío a ${country}`
                : 'PianoLink - Setup técnico + Clase de prueba',
            custom_id: email,
            amount: {
                currency_code: currency,
                value: totalPrice.toFixed(2),
                breakdown: {
                    item_total: {
                        currency_code: currency,
                        value: totalPrice.toFixed(2)
                    }
                }
            },
            items: paypalItems
        };
        
        // Solo agregar shipping si hay productos físicos
        if (hasPhysicalProducts && street && city) {
            purchaseUnit.shipping = {
                name: { full_name: name },
                address: {
                    address_line_1: street,
                    admin_area_2: city,
                    admin_area_1: state || city,
                    postal_code: postalCode || '00000',
                    country_code: country
                }
            };
        }
        
        const orderData = {
            intent: 'CAPTURE',
            purchase_units: [purchaseUnit],
            application_context: {
                brand_name: 'PianoLink',
                locale: 'es-ES',
                // NO_SHIPPING si no hay productos físicos, GET_FROM_FILE si hay (permite que el usuario edite)
                shipping_preference: hasPhysicalProducts ? 'GET_FROM_FILE' : 'NO_SHIPPING',
                user_action: 'PAY_NOW',
                return_url: `${process.env.FRONTEND_URL}/welcome-kit/success?ref=${referenceId}`,
                cancel_url: `${process.env.FRONTEND_URL}/kit-bienvenida-v2.html`
            }
        };
        
        const response = await fetch(`${baseUrl}/v2/checkout/orders`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(orderData)
        });
        
        const order = await response.json();
        
        if (!order.id) {
            console.error('[WelcomeKit] Error PayPal:', order);
            return res.status(500).json({ success: false, error: 'Error creando orden de pago' });
        }
        
        // Buscar o crear usuario/lead
        let user = await User.findOne({ email: email.toLowerCase() });
        let lead = await Lead.findOne({ email: email.toLowerCase() });
        
        // Determinar el tipo de kit
        const kitTypeValue = hasPhysicalProducts ? 'full' : 'setup_only';
        
        // Crear WelcomeKit en estado paid (será verificado después)
        const welcomeKitData = {
            clientId: user?._id || null,
            // Datos del cliente (backup independiente del usuario)
            clientName: name,
            clientEmail: email,
            clientWhatsapp: whatsapp || null,
            kitType: kitTypeValue,
            // Productos seleccionados
            products: selectedProducts.map(p => ({
                productId: p._id,
                name: p.name,
                image: p.imageUrl || p.images?.[0] || null,
                priceAtPurchase: p.pricing?.find(pr => pr.regionCode === country)?.price || p.defaultPrice || 0
            })),
            payment: {
                provider: 'paypal',
                externalOrderId: order.id,
                amount: totalPrice,
                currency: currency,
                status: 'completed'
            },
            overallStatus: 'paid'  // Cambiará cuando se verifique el pago
        };
        
        // Solo agregar shipping si hay productos físicos
        if (hasPhysicalProducts) {
            welcomeKitData.shipping = {
                status: 'pending_payment',
                address: {
                    street,
                    city,
                    state: state || '',
                    postalCode: postalCode || '',
                    country
                }
            };
        } else {
            welcomeKitData.shipping = {
                status: 'not_required',
                address: { country: country || 'N/A' }
            };
        }
        
        const welcomeKit = await WelcomeKit.create(welcomeKitData);
        
        // Normalizar beneficiarios
        let allBeneficiaries = beneficiaries && beneficiaries.length > 0 
            ? beneficiaries 
            : (beneficiaryName ? [{ name: beneficiaryName, age: beneficiaryAge }] : []);
        
        // Guardar datos adicionales en el WelcomeKit para después
        welcomeKit.set('_checkoutData', {
            name,
            email,
            whatsapp,
            studentType,
            beneficiaries: allBeneficiaries,
            // Backward compatibility
            beneficiaryName: allBeneficiaries[0]?.name || null,
            beneficiaryAge: allBeneficiaries[0]?.age || null,
            servicePrice,
            productsTotal
        }, { strict: false });
        
        await welcomeKit.save();
        
        const approveLink = order.links?.find(link => link.rel === 'approve')?.href;
        
        const kitTypeLabel = hasPhysicalProducts ? 'Kit+Productos' : 'Solo Servicio';
        console.log(`[WelcomeKit] 🛒 Checkout iniciado: ${email} → ${country} (${kitTypeLabel}: ${currency} ${totalPrice})`);
        
        res.json({
            success: true,
            orderId: order.id,
            welcomeKitId: welcomeKit._id,
            approveLink,
            price: totalPrice,
            currency,
            kitType: kitTypeValue,
            servicePrice,
            productsTotal,
            productCount: selectedProducts.length
        });
        
    } catch (error) {
        console.error('[WelcomeKit] Error en checkout:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/welcome-kit/verify
 * Verifica el pago y completa el proceso
 */
router.post('/verify', async (req, res) => {
    try {
        const { orderId, welcomeKitId } = req.body;
        
        if (!orderId) {
            return res.status(400).json({ success: false, error: 'orderId requerido' });
        }
        
        // Buscar el WelcomeKit
        let welcomeKit = await WelcomeKit.findOne({ 'payment.externalOrderId': orderId });
        
        if (!welcomeKit && welcomeKitId) {
            welcomeKit = await WelcomeKit.findById(welcomeKitId);
        }
        
        if (!welcomeKit) {
            return res.status(404).json({ success: false, error: 'Orden no encontrada' });
        }
        
        // Verificar en PayPal
        const accessToken = await getPayPalAccessToken();
        const baseUrl = process.env.PAYPAL_MODE === 'live'
            ? 'https://api-m.paypal.com'
            : 'https://api-m.sandbox.paypal.com';
        
        // Primero capturar el pago si está aprobado
        const captureResponse = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        const captureData = await captureResponse.json();
        
        if (captureData.status !== 'COMPLETED') {
            // Verificar estado actual
            const checkResponse = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const orderData = await checkResponse.json();
            
            if (orderData.status !== 'COMPLETED') {
                return res.status(400).json({
                    success: false,
                    error: 'Pago no completado',
                    status: orderData.status
                });
            }
        }
        
        // Pago completado - actualizar WelcomeKit
        welcomeKit.payment.paidAt = new Date();
        if (welcomeKit.shipping.status === 'pending_payment') {
            welcomeKit.shipping.status = 'processing';
        }
        welcomeKit.overallStatus = 'paid';
        
        // Obtener datos del checkout
        const checkoutData = welcomeKit.get('_checkoutData') || {};
        // IMPORTANTE: Priorizar email del formulario sobre el de PayPal
        // En sandbox, PayPal devuelve siempre el email del buyer sandbox, no el real
        const payerEmail = checkoutData.email || captureData.payer?.email_address;
        // Priorizar nombre del formulario sobre el de PayPal (sandbox siempre devuelve "John Doe")
        const payerName = checkoutData.name || captureData.payer?.name?.given_name;
        const studentType = checkoutData.studentType || 'self'; // 'self' o 'child'
        
        // Crear o actualizar usuario
        let user = await User.findOne({ email: payerEmail?.toLowerCase() });
        let student = null;
        let generatedMagicLinkToken = null; // Para guardar el token y usarlo en la respuesta
        
        // Generar magic link token
        const crypto = require('crypto');
        const magicLinkToken = crypto.randomBytes(32).toString('hex');
        const magicLinkExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 días
        generatedMagicLinkToken = magicLinkToken; // Guardar para la respuesta
        
        if (!user && payerEmail) {
            // Password temporal aleatorio (no se usa, solo para cumplir schema)
            const tempPassword = crypto.randomBytes(16).toString('hex');
            
            if (studentType === 'self') {
                // El comprador es el estudiante
                user = await User.create({
                    name: payerName || 'Estudiante',
                    email: payerEmail.toLowerCase(),
                    password: tempPassword,
                    whatsapp: checkoutData.whatsapp || '',
                    country: welcomeKit.shipping?.address?.country || 'N/A',
                    role: 'student',
                    classesRemaining: 1,  // 1 clase incluida en el kit
                    classesCompleted: 0,
                    studentData: {
                        source: 'platform',
                        level: 'beginner',
                        age: checkoutData.beneficiaryAge || null
                    },
                    kitPurchased: true,
                    kitPurchaseDate: new Date(),
                    paypalOrderId: orderId,
                    // Magic Link
                    magicLinkToken: magicLinkToken,
                    magicLinkExpires: magicLinkExpires,
                    mustChangePassword: true
                });
                
                student = user; // El usuario es el estudiante
                console.log(`[WelcomeKit] 🎹 Estudiante creado: ${user.email}`);
                
            } else {
                // El comprador es un apoderado (guardian)
                // Obtener beneficiarios
                const allBeneficiaries = checkoutData.beneficiaries || 
                    (checkoutData.beneficiaryName ? [{ name: checkoutData.beneficiaryName, age: checkoutData.beneficiaryAge }] : []);
                
                // Crear array de estudiantes embebidos (SIMPLE - sin cuentas separadas)
                const managedStudents = allBeneficiaries
                    .filter(b => b.name)
                    .map(b => ({
                        name: b.name,
                        age: b.age || null,
                        classesRemaining: 1,  // 1 clase incluida en el kit
                        classesUsed: 0
                    }));
                
                user = await User.create({
                    name: payerName || 'Apoderado',
                    email: payerEmail.toLowerCase(),
                    password: tempPassword,
                    whatsapp: checkoutData.whatsapp || '',
                    country: welcomeKit.shipping?.address?.country || 'N/A',
                    role: 'client',
                    clientData: {
                        accountType: 'guardian',
                        managedStudents: managedStudents
                    },
                    kitPurchased: true,
                    kitPurchaseDate: new Date(),
                    paypalOrderId: orderId,
                    // Magic Link
                    magicLinkToken: magicLinkToken,
                    magicLinkExpires: magicLinkExpires,
                    mustChangePassword: true
                });
                
                console.log(`[WelcomeKit] 👤 Apoderado creado: ${user.email} con ${managedStudents.length} estudiante(s)`);
                managedStudents.forEach(s => console.log(`[WelcomeKit] 👶 Estudiante: ${s.name}`));
            }
            
            // Generar URL del magic link
            const baseUrl = process.env.FRONTEND_URL || 'https://pianolink.onrender.com';
            const magicLinkUrl = `${baseUrl}/acceso/${magicLinkToken}`;
            
            // Enviar email de bienvenida CON MAGIC LINK
            try {
                const adminData = await _getAdminEmailData();
                const emailHtml = generateWelcomeKitEmail({
                    clientName: user.name,
                    clientEmail: user.email,
                    magicLinkUrl: magicLinkUrl, // ← Magic Link en vez de password
                    students: user.clientData?.managedStudents || [],
                    kitType: welcomeKit.kitType,
                    totalPaid: welcomeKit.payment?.amount,
                    currency: welcomeKit.payment?.currency || 'USD',
                    orderId: orderId,
                    ...adminData
                });
                
                await EmailService.sendSafe({
                    to: user.email,
                    subject: '🎹 ¡Bienvenido a PianoLink! Tu kit está listo',
                    html: emailHtml
                });
                console.log(`[WelcomeKit] 📧 Email de bienvenida con magic link enviado a: ${user.email}`);
            } catch (emailError) {
                console.error('[WelcomeKit] ⚠️ Error enviando email:', emailError.message);
            }
            
        } else if (user) {
            // Usuario existente - actualizar
            user.kitPurchased = true;
            user.kitPurchaseDate = new Date();
            
            // Si es guardian y hay beneficiarios nuevos
            const allBeneficiaries = checkoutData.beneficiaries || 
                (checkoutData.beneficiaryName ? [{ name: checkoutData.beneficiaryName, age: checkoutData.beneficiaryAge }] : []);
            
            if (studentType === 'child' && allBeneficiaries.length > 0) {
                user.clientData = user.clientData || { accountType: 'guardian', managedStudents: [] };
                user.clientData.accountType = 'guardian';
                user.clientData.managedStudents = user.clientData.managedStudents || [];
                
                // Agregar nuevos estudiantes como subdocumentos (SIMPLE)
                allBeneficiaries.forEach(b => {
                    if (b.name) {
                        user.clientData.managedStudents.push({
                            name: b.name,
                            age: b.age || null,
                            classesRemaining: 1,
                            classesUsed: 0
                        });
                        console.log(`[WelcomeKit] 👶 Estudiante agregado: ${b.name}`);
                    }
                });
            }
            
            await user.save();
            
            // Enviar email de bienvenida (usuario existente)
            try {
                const adminData = await _getAdminEmailData();
                const emailHtml = generateWelcomeKitEmail({
                    clientName: user.name,
                    clientEmail: user.email,
                    students: user.clientData?.managedStudents || [],
                    kitType: welcomeKit.kitType,
                    totalPaid: welcomeKit.payment?.amount,
                    currency: welcomeKit.payment?.currency || 'USD',
                    orderId: orderId,
                    ...adminData
                });
                
                await EmailService.sendSafe({
                    to: user.email,
                    subject: '🎹 ¡Bienvenido a PianoLink! Tu kit está listo',
                    html: emailHtml
                });
                console.log(`[WelcomeKit] 📧 Email de bienvenida enviado a: ${user.email}`);
            } catch (emailError) {
                console.error('[WelcomeKit] ⚠️ Error enviando email:', emailError.message);
            }
        }
        
        // Vincular usuario al WelcomeKit
        if (user) {
            welcomeKit.clientId = user._id;
        }
        
        await welcomeKit.save();
        
        // ==================== CREAR ORDEN EN CJDROPSHIPPING ====================
        // Solo si hay productos físicos que requieren envío
        const hasPhysicalProducts = welcomeKit.products && welcomeKit.products.length > 0;
        
        if (hasPhysicalProducts) {
            try {
                console.log(`[WelcomeKit] 📦 Creando orden en CJDropshipping para ${welcomeKit.products.length} producto(s)...`);
                
                // Agregar datos de checkout al welcomeKit para CJ
                welcomeKit._checkoutData = checkoutData;
                
                const cjOrder = await CJDropshipping.createOrder(welcomeKit);
                
                // Guardar datos de CJ en el welcomeKit
                welcomeKit.shipping.fulfillment = {
                    provider: 'cjdropshipping',
                    externalOrderId: cjOrder.cjOrderId,
                    orderNumber: cjOrder.orderNumber,
                    shipmentOrderId: cjOrder.shipmentOrderId,
                    status: cjOrder.orderStatus,
                    costPrice: cjOrder.orderAmount,
                    createdAt: new Date()
                };
                
                await welcomeKit.save();
                
                console.log(`[WelcomeKit] ✅ Orden CJ creada: ${cjOrder.cjOrderId}`);
                
            } catch (cjError) {
                // No fallar el pago si CJ falla, pero registrar para revisión manual
                console.error(`[WelcomeKit] ⚠️ Error creando orden CJ (requiere revisión manual):`, cjError.message);
                
                welcomeKit.shipping.fulfillment = {
                    provider: 'cjdropshipping',
                    status: 'error',
                    errorMessage: cjError.message,
                    requiresManualReview: true,
                    createdAt: new Date()
                };
                
                await welcomeKit.save();
            }
        }
        
        // Notificar al admin
        await notifyAdminNewKit(welcomeKit, user);
        
        console.log(`[WelcomeKit] ✅ Pago verificado: ${orderId} → ${welcomeKit.shipping?.address?.country || 'N/A'}`);
        
        // Determinar los próximos pasos según el tipo de kit
        const nextSteps = hasPhysicalProducts
            ? [
                'Recibirás un email con los detalles del envío',
                'Te contactaremos por WhatsApp cuando despachemos tu pedido',
                'Podrás agendar tu sesión de Setup + Clase de prueba'
            ]
            : [
                'Recibirás un email de confirmación',
                'Podrás agendar tu sesión de Setup + Clase de prueba de 30 minutos',
                'Te contactaremos por WhatsApp para coordinar'
            ];
        
        // Obtener todos los estudiantes (ahora son subdocumentos embebidos)
        let allStudents = [];
        if (user && user.clientData?.managedStudents?.length > 0) {
            allStudents = user.clientData.managedStudents.map(s => ({
                name: s.name,
                age: s.age,
                classesRemaining: s.classesRemaining || 1
            }));
        } else if (student) {
            allStudents = [{
                id: student._id,
                name: student.name,
                email: student.email,
                classesRemaining: student.classesRemaining || 1,
                classesCompleted: student.classesCompleted || 0
            }];
        }
        
        // Obtener tiempo de envío según país
        let shippingDays = '5-10 días hábiles'; // Default
        if (hasPhysicalProducts && welcomeKit.shipping?.address?.country) {
            const country = welcomeKit.shipping.address.country;
            const config = await GlobalConfig.findOne({ isDefault: true });
            const regionConfig = config?.regionalPricing?.welcomeKit?.find(r => r.regionCode === country);
            if (regionConfig?.shippingDays) {
                shippingDays = regionConfig.shippingDays;
                // Agregar "días hábiles" si no lo tiene
                if (!shippingDays.includes('día')) {
                    shippingDays = `${shippingDays} días hábiles`;
                }
            }
        }
        
        res.json({
            success: true,
            welcomeKit: {
                id: welcomeKit._id,
                status: welcomeKit.overallStatus,
                kitType: welcomeKit.kitType,
                products: welcomeKit.products || [],
                shipping: hasPhysicalProducts ? welcomeKit.shipping?.address : null,
                shippingDays: hasPhysicalProducts ? shippingDays : null,
                payment: welcomeKit.payment || null
            },
            user: user ? {
                id: user._id,
                email: user.email,
                name: user.name,
                role: user.role
            } : null,
            student: student ? {
                id: student._id,
                name: student.name,
                email: student.email
            } : null,
            students: allStudents, // Todos los estudiantes
            studentType: studentType,
            nextSteps,
            // Magic Link para activar cuenta (si es usuario nuevo)
            magicLinkUrl: generatedMagicLinkToken 
                ? `${process.env.FRONTEND_URL || 'https://pianolink.onrender.com'}/acceso/${generatedMagicLinkToken}`
                : null
        });
        
    } catch (error) {
        console.error('[WelcomeKit] Error verificando pago:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/welcome-kit/verify-mercadopago
 * Verifica el pago de MercadoPago y completa el proceso (mismo flujo que PayPal)
 */
router.post('/verify-mercadopago', async (req, res) => {
    try {
        const { paymentId, externalReference, email, name: payerNameParam } = req.body;
        
        console.log('[WelcomeKit-MP] Verificando pago:', { paymentId, externalReference, email });
        
        if (!paymentId && !externalReference) {
            return res.status(400).json({ success: false, error: 'paymentId o externalReference requerido' });
        }
        
        // 1. Verificar pago con API de MercadoPago
        const accessToken = process.env.MP_ACCESS_TOKEN;
        if (!accessToken) {
            return res.status(500).json({ success: false, error: 'MercadoPago no configurado' });
        }
        
        let mpPayment = null;
        if (paymentId) {
            const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (mpRes.ok) {
                mpPayment = await mpRes.json();
            }
        }
        
        // Si no tenemos payment, buscar por external_reference
        if (!mpPayment && externalReference) {
            const searchRes = await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${externalReference}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (searchRes.ok) {
                const searchData = await searchRes.json();
                if (searchData.results && searchData.results.length > 0) {
                    mpPayment = searchData.results[0];
                }
            }
        }
        
        if (!mpPayment) {
            // Aún sin pago verificado - mostrar éxito genérico (el webhook lo procesará)
            console.log('[WelcomeKit-MP] No se encontró pago aún, buscando WelcomeKit por email...');
        }
        
        const isApproved = mpPayment && mpPayment.status === 'approved';
        const mpExternalRef = mpPayment?.external_reference || externalReference;
        const mpEmail = mpPayment?.payer?.email || email;
        
        // 2. Buscar WelcomeKit por external_reference o email
        // NOTA: El modelo usa 'clientEmail', no 'customer.email'
        let welcomeKit = null;
        if (mpExternalRef) {
            // external_reference format: kit_TIMESTAMP_EMAIL
            const refEmail = mpExternalRef.split('_').slice(2).join('_');
            welcomeKit = await WelcomeKit.findOne({ 
                clientEmail: refEmail 
            }).sort({ createdAt: -1 });
        }
        if (!welcomeKit && mpEmail) {
            welcomeKit = await WelcomeKit.findOne({ 
                clientEmail: mpEmail.toLowerCase() 
            }).sort({ createdAt: -1 });
        }
        if (!welcomeKit && email) {
            welcomeKit = await WelcomeKit.findOne({ 
                clientEmail: email.toLowerCase() 
            }).sort({ createdAt: -1 });
        }
        
        // Si no existe WelcomeKit, crearlo ahora con los datos disponibles
        if (!welcomeKit) {
            console.log('[WelcomeKit-MP] WelcomeKit no encontrado, creando uno nuevo...');
            
            const finalEmail = mpEmail || email;
            const finalName = payerNameParam || 'Estudiante';
            
            // Crear WelcomeKit básico
            const welcomeKitData = {
                clientName: finalName,
                clientEmail: finalEmail,
                kitType: 'setup_only',
                products: [],
                payment: {
                    provider: 'mercadopago',
                    externalOrderId: mpPayment?.id ? String(mpPayment.id) : null,
                    amount: mpPayment?.transaction_amount || 0,
                    currency: mpPayment?.currency_id || 'CLP',
                    status: isApproved ? 'completed' : 'pending',
                    paidAt: isApproved ? new Date() : null
                },
                shipping: {
                    status: 'not_required',
                    address: { country: 'CL' }
                },
                overallStatus: isApproved ? 'paid' : 'pending_payment'
            };
            
            welcomeKit = await WelcomeKit.create(welcomeKitData);
            console.log(`[WelcomeKit-MP] ✅ WelcomeKit creado: ${welcomeKit._id}`);
        }
        
        // 3. Actualizar WelcomeKit con datos del pago
        if (isApproved) {
            welcomeKit.payment = welcomeKit.payment || {};
            welcomeKit.payment.paidAt = new Date();
            welcomeKit.payment.provider = 'mercadopago';
            welcomeKit.payment.externalOrderId = String(mpPayment.id);
            welcomeKit.payment.amount = mpPayment.transaction_amount;
            welcomeKit.payment.currency = mpPayment.currency_id;
            if (welcomeKit.shipping && welcomeKit.shipping.status === 'pending_payment') {
                welcomeKit.shipping.status = 'processing';
            }
            welcomeKit.overallStatus = 'paid';
        }
        
        // 4. Obtener datos del checkout guardados
        let checkoutData = welcomeKit.get('_checkoutData') || {};
        const payerEmail = checkoutData.email || mpEmail || email;
        const payerName = checkoutData.name || payerNameParam || 'Estudiante';
        
        // Si no hay checkoutData, buscar en Lead (kit V2 guarda datos ahí)
        let leadData = null;
        if (!checkoutData.beneficiaries || checkoutData.beneficiaries.length === 0) {
            const Lead = require('../models/Lead');
            leadData = await Lead.findOne({ email: payerEmail?.toLowerCase() }).lean();
            if (leadData && leadData.beneficiaries && leadData.beneficiaries.length > 0) {
                console.log('[WelcomeKit-MP] 📋 Datos encontrados en Lead:', leadData.beneficiaries.map(b => b.name).join(', '));
                // Enriquecer checkoutData con datos del Lead
                checkoutData = {
                    ...checkoutData,
                    name: leadData.name || payerName,
                    email: leadData.email || payerEmail,
                    whatsapp: leadData.whatsapp || checkoutData.whatsapp,
                    studentType: leadData.clientType === 'guardian' ? 'child' : 'self',
                    beneficiaries: leadData.beneficiaries
                        .filter(b => b.relationship !== 'self')
                        .map(b => ({ name: b.name, age: b.age }))
                };
            }
        }
        
        const studentType = checkoutData.studentType || (leadData?.clientType === 'guardian' ? 'child' : 'self');
        
        // 5. Crear o actualizar usuario (mismo flujo que PayPal)
        let user = await User.findOne({ email: payerEmail?.toLowerCase() });
        let student = null;
        let generatedMagicLinkToken = null;
        
        const crypto = require('crypto');
        const magicLinkToken = crypto.randomBytes(32).toString('hex');
        const magicLinkExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        generatedMagicLinkToken = magicLinkToken;
        
        if (!user && payerEmail) {
            const tempPassword = crypto.randomBytes(16).toString('hex');
            
            if (studentType === 'self') {
                user = await User.create({
                    name: payerName,
                    email: payerEmail.toLowerCase(),
                    password: tempPassword,
                    whatsapp: checkoutData.whatsapp || '',
                    country: welcomeKit.shipping?.address?.country || 'CL',
                    role: 'student',
                    classesRemaining: 1,
                    classesCompleted: 0,
                    studentData: {
                        source: 'platform',
                        level: 'beginner',
                        age: checkoutData.beneficiaryAge || null
                    },
                    kitPurchased: true,
                    kitPurchaseDate: new Date(),
                    magicLinkToken: magicLinkToken,
                    magicLinkExpires: magicLinkExpires,
                    mustChangePassword: true
                });
                student = user;
                console.log(`[WelcomeKit-MP] 🎹 Estudiante creado: ${user.email}`);
                
            } else {
                const allBeneficiaries = checkoutData.beneficiaries || 
                    (checkoutData.beneficiaryName ? [{ name: checkoutData.beneficiaryName, age: checkoutData.beneficiaryAge }] : []);
                
                const managedStudents = allBeneficiaries
                    .filter(b => b.name)
                    .map(b => ({
                        name: b.name,
                        age: b.age || null,
                        classesRemaining: 1,
                        classesUsed: 0
                    }));
                
                user = await User.create({
                    name: payerName,
                    email: payerEmail.toLowerCase(),
                    password: tempPassword,
                    whatsapp: checkoutData.whatsapp || '',
                    country: welcomeKit.shipping?.address?.country || 'CL',
                    role: 'client',
                    clientData: {
                        accountType: 'guardian',
                        managedStudents: managedStudents
                    },
                    kitPurchased: true,
                    kitPurchaseDate: new Date(),
                    magicLinkToken: magicLinkToken,
                    magicLinkExpires: magicLinkExpires,
                    mustChangePassword: true
                });
                console.log(`[WelcomeKit-MP] 👤 Apoderado creado: ${user.email} con ${managedStudents.length} estudiante(s)`);
            }
            
            // Enviar email de bienvenida con Magic Link
            try {
                const frontendUrl = process.env.FRONTEND_URL || 'https://pianolink-v4.fly.dev';
                const magicLinkUrl = `${frontendUrl}/acceso/${magicLinkToken}`;
                const adminData = await _getAdminEmailData();
                
                const emailHtml = generateWelcomeKitEmail({
                    clientName: user.name,
                    clientEmail: user.email,
                    magicLinkUrl: magicLinkUrl,
                    students: user.clientData?.managedStudents || [],
                    kitType: welcomeKit.kitType,
                    totalPaid: welcomeKit.payment?.amount,
                    currency: welcomeKit.payment?.currency || 'CLP',
                    orderId: mpPayment?.id || 'MP-' + Date.now(),
                    ...adminData
                });
                
                await EmailService.sendSafe({
                    to: user.email,
                    subject: '🎹 ¡Bienvenido a PianoLink! Tu kit está listo',
                    html: emailHtml
                });
                console.log(`[WelcomeKit-MP] 📧 Email con magic link enviado a: ${user.email}`);
            } catch (emailError) {
                console.error('[WelcomeKit-MP] ⚠️ Error enviando email:', emailError.message);
            }
            
        } else if (user) {
            generatedMagicLinkToken = null; // Usuario ya existe, no necesita magic link nuevo
            user.kitPurchased = true;
            user.kitPurchaseDate = new Date();
            
            const allBeneficiaries = checkoutData.beneficiaries || 
                (checkoutData.beneficiaryName ? [{ name: checkoutData.beneficiaryName, age: checkoutData.beneficiaryAge }] : []);
            
            if (studentType === 'child' && allBeneficiaries.length > 0) {
                user.clientData = user.clientData || { accountType: 'guardian', managedStudents: [] };
                user.clientData.accountType = 'guardian';
                user.clientData.managedStudents = user.clientData.managedStudents || [];
                
                allBeneficiaries.forEach(b => {
                    if (b.name) {
                        user.clientData.managedStudents.push({
                            name: b.name,
                            age: b.age || null,
                            classesRemaining: 1,
                            classesUsed: 0
                        });
                    }
                });
            }
            
            await user.save();
            console.log(`[WelcomeKit-MP] 👤 Usuario existente actualizado: ${user.email}`);
            
            // Enviar email de confirmación de compra (usuario existente)
            try {
                const adminData = await _getAdminEmailData();
                const emailHtml = generateWelcomeKitEmail({
                    clientName: user.name,
                    clientEmail: user.email,
                    magicLinkUrl: null, // Ya tiene cuenta
                    students: user.clientData?.managedStudents || [],
                    kitType: welcomeKit.kitType,
                    totalPaid: welcomeKit.payment?.amount,
                    currency: welcomeKit.payment?.currency || 'CLP',
                    orderId: mpPayment?.id || 'MP-' + Date.now(),
                    ...adminData
                });
                
                await EmailService.sendSafe({
                    to: user.email,
                    subject: '🎹 ¡Compra confirmada! Tu kit de PianoLink está listo',
                    html: emailHtml
                });
                console.log(`[WelcomeKit-MP] 📧 Email de confirmación enviado a: ${user.email}`);
            } catch (emailError) {
                console.error('[WelcomeKit-MP] ⚠️ Error enviando email:', emailError.message);
            }
        }
        
        // 6. Vincular usuario al WelcomeKit
        if (user) {
            welcomeKit.clientId = user._id;
        }
        await welcomeKit.save();
        
        // 7. CJDropshipping para productos físicos
        const hasPhysicalProducts = welcomeKit.products && welcomeKit.products.length > 0;
        if (hasPhysicalProducts) {
            try {
                console.log(`[WelcomeKit-MP] 📦 Creando orden en CJDropshipping...`);
                welcomeKit._checkoutData = checkoutData;
                const cjOrder = await CJDropshipping.createOrder(welcomeKit);
                welcomeKit.shipping.fulfillment = {
                    provider: 'cjdropshipping',
                    externalOrderId: cjOrder.cjOrderId,
                    orderNumber: cjOrder.orderNumber,
                    shipmentOrderId: cjOrder.shipmentOrderId,
                    status: cjOrder.orderStatus,
                    costPrice: cjOrder.orderAmount,
                    createdAt: new Date()
                };
                await welcomeKit.save();
                console.log(`[WelcomeKit-MP] ✅ Orden CJ creada: ${cjOrder.cjOrderId}`);
            } catch (cjError) {
                console.error(`[WelcomeKit-MP] ⚠️ Error CJ:`, cjError.message);
                welcomeKit.shipping.fulfillment = {
                    provider: 'cjdropshipping',
                    status: 'error',
                    errorMessage: cjError.message,
                    requiresManualReview: true,
                    createdAt: new Date()
                };
                await welcomeKit.save();
            }
        }
        
        // 8. Notificar admin
        await notifyAdminNewKit(welcomeKit, user);
        
        console.log(`[WelcomeKit-MP] ✅ Pago verificado: ${mpPayment?.id || externalReference}`);
        
        // 9. Respuesta
        const nextSteps = hasPhysicalProducts
            ? ['Recibirás un email con los detalles del envío', 'Te contactaremos por WhatsApp cuando despachemos', 'Podrás agendar tu sesión de Setup + Clase de prueba']
            : ['Recibirás un email de confirmación', 'Te contactaremos por WhatsApp para coordinar', 'Podrás agendar tu sesión de Setup + Clase de prueba'];
        
        let allStudents = [];
        if (user && user.clientData?.managedStudents?.length > 0) {
            allStudents = user.clientData.managedStudents.map(s => ({
                name: s.name, age: s.age, classesRemaining: s.classesRemaining || 1
            }));
        } else if (student) {
            allStudents = [{ name: student.name, email: student.email, classesRemaining: student.classesRemaining || 1 }];
        }
        
        let shippingDays = '5-10 días hábiles';
        if (hasPhysicalProducts && welcomeKit.shipping?.address?.country) {
            const config = await GlobalConfig.findOne({ isDefault: true });
            const regionConfig = config?.regionalPricing?.welcomeKit?.find(r => r.regionCode === welcomeKit.shipping.address.country);
            if (regionConfig?.shippingDays) {
                shippingDays = regionConfig.shippingDays;
                if (!shippingDays.includes('día')) shippingDays = `${shippingDays} días hábiles`;
            }
        }
        
        res.json({
            success: true,
            welcomeKit: {
                id: welcomeKit._id,
                status: welcomeKit.overallStatus,
                kitType: welcomeKit.kitType,
                products: welcomeKit.products || [],
                shipping: hasPhysicalProducts ? welcomeKit.shipping?.address : null,
                shippingDays: hasPhysicalProducts ? shippingDays : null,
                payment: welcomeKit.payment || null
            },
            user: user ? { id: user._id, email: user.email, name: user.name, role: user.role } : null,
            student: student ? { id: student._id, name: student.name, email: student.email } : null,
            students: allStudents,
            studentType: studentType,
            nextSteps,
            magicLinkUrl: generatedMagicLinkToken 
                ? `${process.env.FRONTEND_URL || 'https://pianolink-v4.fly.dev'}/acceso/${generatedMagicLinkToken}`
                : null
        });
        
    } catch (error) {
        console.error('[WelcomeKit-MP] Error verificando pago:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/welcome-kit/status/:id
 * Obtiene el estado del kit (para el cliente)
 */
router.get('/status/:id', async (req, res) => {
    try {
        const welcomeKit = await WelcomeKit.findById(req.params.id)
            .populate('clientId', 'name email')
            .populate('beneficiaryId', 'name');
        
        if (!welcomeKit) {
            return res.status(404).json({ success: false, error: 'Kit no encontrado' });
        }
        
        const statusLabels = {
            'paid': '💳 Pago recibido',
            'shipping': '📦 En camino',
            'delivered': '✅ Entregado',
            'setup_pending': '🔧 Listo para Setup',
            'setup_scheduled': '📅 Setup agendado',
            'trial_available': '🎹 Clase de prueba disponible',
            'trial_scheduled': '📅 Prueba agendada',
            'completed': '🎉 Completado'
        };
        
        res.json({
            success: true,
            kit: {
                id: welcomeKit._id,
                status: welcomeKit.overallStatus,
                statusLabel: statusLabels[welcomeKit.overallStatus] || welcomeKit.overallStatus,
                shipping: {
                    status: welcomeKit.shipping.status,
                    trackingNumber: welcomeKit.shipping.trackingNumber,
                    trackingUrl: welcomeKit.shipping.trackingUrl,
                    carrier: welcomeKit.shipping.carrier,
                    estimatedDelivery: welcomeKit.shipping.estimatedDelivery
                },
                setupSession: welcomeKit.setupSession,
                trialClass: welcomeKit.trialClass,
                client: welcomeKit.clientId,
                beneficiary: welcomeKit.beneficiaryId
            }
        });
        
    } catch (error) {
        console.error('[WelcomeKit] Error obteniendo status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== RUTAS ADMIN ====================

/**
 * GET /api/welcome-kit/admin/list
 * Lista todos los kits (para admin)
 */
router.get('/admin/list', protect, adminOnly, async (req, res) => {
    try {
        const { status, country } = req.query;
        
        const query = {};
        if (status) query.overallStatus = status;
        if (country) query['shipping.address.country'] = country;
        
        const kits = await WelcomeKit.find(query)
            .populate('clientId', 'name email whatsapp')
            .sort({ createdAt: -1 })
            .limit(100);
        
        // Estadísticas
        const stats = await WelcomeKit.aggregate([
            {
                $group: {
                    _id: '$overallStatus',
                    count: { $sum: 1 }
                }
            }
        ]);
        
        res.json({
            success: true,
            kits,
            stats: stats.reduce((acc, s) => {
                acc[s._id] = s.count;
                return acc;
            }, {})
        });
        
    } catch (error) {
        console.error('[WelcomeKit] Error listando kits:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/welcome-kit/admin/orders
 * Lista todas las órdenes con datos simplificados para el nuevo panel
 */
router.get('/admin/orders', protect, adminOnly, async (req, res) => {
    try {
        const { status } = req.query;
        
        const query = {};
        if (status && status !== 'all') {
            query.$or = [
                { 'shipping.status': status },
                { overallStatus: status }
            ];
        }
        
        const orders = await WelcomeKit.find(query)
            .populate('clientId', 'name email whatsapp')
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();
        
        // Mapear a formato simplificado
        const mappedOrders = orders.map(order => ({
            _id: order._id,
            customerName: order.clientId?.name || order.clientName || order._checkoutData?.name || 'Cliente',
            email: order.clientId?.email || order.clientEmail || order._checkoutData?.email || '',
            phone: order.clientId?.whatsapp || order.clientWhatsapp || order._checkoutData?.whatsapp || null,
            country: order.shipping?.address?.country || order.country || '',
            city: order.shipping?.address?.city || '',
            state: order.shipping?.address?.state || '',
            postalCode: order.shipping?.address?.postalCode || '',
            address: order.shipping?.address?.street || '',
            total: order.payment?.amount || order.payment?.total || order.total || 0,
            kitType: order.kitType || 'standard',
            products: order.products || [],
            shippingStatus: order.shipping?.status || order.overallStatus || 'pending',
            paymentStatus: order.payment?.status || 'pending',
            trackingNumber: order.shipping?.trackingNumber || null,
            trackingUrl: order.shipping?.trackingUrl || null,
            carrier: order.shipping?.carrier || null,
            estimatedDelivery: order.shipping?.estimatedDelivery || null,
            shippedAt: order.shipping?.shippedAt || null,
            deliveredAt: order.shipping?.deliveredAt || null,
            // Confirmación del cliente
            clientConfirmedReceipt: order.shipping?.clientConfirmedReceipt || false,
            clientConfirmedAt: order.shipping?.clientConfirmedAt || null,
            createdAt: order.createdAt
        }));
        
        res.json({ success: true, orders: mappedOrders });
        
    } catch (error) {
        console.error('[WelcomeKit] Error listando órdenes:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/welcome-kit/admin/:id/shipping
 * Actualiza información de envío (admin)
 */
router.put('/admin/:id/shipping', protect, adminOnly, async (req, res) => {
    try {
        const { carrier, trackingNumber, trackingUrl, estimatedDelivery, status } = req.body;
        
        const welcomeKit = await WelcomeKit.findById(req.params.id)
            .populate('clientId', 'name email whatsapp');
        
        if (!welcomeKit) {
            return res.status(404).json({ success: false, error: 'Kit no encontrado' });
        }
        
        // Actualizar datos de envío
        if (carrier) welcomeKit.shipping.carrier = carrier;
        if (trackingNumber) welcomeKit.shipping.trackingNumber = trackingNumber;
        if (trackingUrl) welcomeKit.shipping.trackingUrl = trackingUrl;
        if (estimatedDelivery) welcomeKit.shipping.estimatedDelivery = new Date(estimatedDelivery);
        
        if (status) {
            welcomeKit.shipping.status = status;
            
            // Actualizar overallStatus según shipping status
            if (status === 'shipped') {
                welcomeKit.shipping.shippedAt = new Date();
                welcomeKit.overallStatus = 'shipping';
            } else if (status === 'delivered') {
                welcomeKit.shipping.deliveredAt = new Date();
                welcomeKit.overallStatus = 'delivered';
            }
        }
        
        await welcomeKit.save();
        
        // Notificar al cliente si se despachó
        if (status === 'shipped' && welcomeKit.clientId?.email) {
            await notifyClientShipment(welcomeKit);
        }
        
        console.log(`[WelcomeKit] 📦 Envío actualizado: ${welcomeKit._id} → ${status}`);
        
        res.json({ success: true, welcomeKit });
        
    } catch (error) {
        console.error('[WelcomeKit] Error actualizando envío:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/welcome-kit/admin/:id/confirm-receipt
 * Cliente confirma recepción del cable
 */
router.put('/:id/confirm-receipt', async (req, res) => {
    try {
        const welcomeKit = await WelcomeKit.findById(req.params.id);
        
        if (!welcomeKit) {
            return res.status(404).json({ success: false, error: 'Kit no encontrado' });
        }
        
        welcomeKit.shipping.clientConfirmedReceipt = true;
        welcomeKit.shipping.clientConfirmedAt = new Date();
        welcomeKit.overallStatus = 'setup_pending';
        welcomeKit.setupSession.status = 'not_scheduled';
        
        await welcomeKit.save();
        
        console.log(`[WelcomeKit] ✅ Cliente confirmó recepción: ${welcomeKit._id}`);
        
        res.json({
            success: true,
            message: '¡Excelente! Ahora puedes agendar tu sesión de Setup.',
            nextStep: 'schedule_setup'
        });
        
    } catch (error) {
        console.error('[WelcomeKit] Error confirmando recepción:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== NOTIFICACIONES ====================

async function notifyAdminNewKit(welcomeKit, user) {
    try {
        // Email al admin
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@pianolink.com';
        
        await EmailService.sendSafe({
            to: adminEmail,
            subject: `🎁 Nuevo Welcome Kit vendido - ${welcomeKit.shipping.address.country}`,
            html: `
                <h2>¡Nuevo Welcome Kit!</h2>
                <p><strong>Cliente:</strong> ${user?.name || 'N/A'} (${user?.email || 'N/A'})</p>
                <p><strong>WhatsApp:</strong> ${user?.whatsapp || 'N/A'}</p>
                <p><strong>País:</strong> ${welcomeKit.shipping.address.country}</p>
                <p><strong>Dirección:</strong></p>
                <ul>
                    <li>${welcomeKit.shipping.address.street}</li>
                    <li>${welcomeKit.shipping.address.city}, ${welcomeKit.shipping.address.state}</li>
                    <li>CP: ${welcomeKit.shipping.address.postalCode}</li>
                </ul>
                <p><strong>Monto:</strong> ${welcomeKit.payment.currency} ${welcomeKit.payment.amount}</p>
                <p><strong>Order ID:</strong> ${welcomeKit.payment.externalOrderId}</p>
                <hr>
                <p><a href="${process.env.FRONTEND_URL}/admin">Ir al Panel Admin</a></p>
            `
        });
        
        console.log(`[WelcomeKit] 📧 Admin notificado: ${adminEmail}`);
    } catch (error) {
        console.error('[WelcomeKit] Error notificando admin:', error.message);
    }
}

async function notifyClientShipment(welcomeKit) {
    try {
        const client = welcomeKit.clientId;
        const adminData = await _getAdminEmailData();
        
        await EmailService.sendSafe({
            to: client.email,
            subject: '📦 ¡Tu Welcome Kit está en camino! - PianoLink',
            html: `
                <h2>¡Hola ${client.name}!</h2>
                <p>Tu Welcome Kit de PianoLink ya fue despachado.</p>
                
                <h3>Detalles del envío:</h3>
                <ul>
                    <li><strong>Courier:</strong> ${welcomeKit.shipping.carrier || 'Por confirmar'}</li>
                    <li><strong>Número de seguimiento:</strong> ${welcomeKit.shipping.trackingNumber || 'Por confirmar'}</li>
                    ${welcomeKit.shipping.trackingUrl ? `<li><a href="${welcomeKit.shipping.trackingUrl}">Rastrear envío</a></li>` : ''}
                    ${welcomeKit.shipping.estimatedDelivery ? `<li><strong>Entrega estimada:</strong> ${new Date(welcomeKit.shipping.estimatedDelivery).toLocaleDateString('es-ES')}</li>` : ''}
                </ul>
                
                <h3>¿Qué sigue?</h3>
                <ol>
                    <li>Recibe tu cable MIDI</li>
                    <li>Confirma la recepción en tu panel</li>
                    <li>Agenda tu sesión de Setup técnico</li>
                    <li>¡Disfruta tu clase de prueba!</li>
                </ol>
                
                <p>¿Preguntas? Escríbenos por <a href="https://wa.me/${adminData.adminWhatsapp.replace(/[^0-9]/g, '')}">WhatsApp</a>.</p>
                
                <p>🎹 ${adminData.adminName} — PianoLink</p>
            `
        });
        
        console.log(`[WelcomeKit] 📧 Cliente notificado: ${client.email}`);
    } catch (error) {
        console.error('[WelcomeKit] Error notificando cliente:', error.message);
    }
}

// ==================== PRECIOS REGIONALES ====================

/**
 * GET /api/welcome-kit/admin/pricing
 * Obtiene la configuración de precios regionales (kit completo + setup only)
 */
router.get('/admin/pricing', protect, adminOnly, async (req, res) => {
    try {
        const config = await GlobalConfig.findOne({ isDefault: true });
        
        if (!config || !config.regionalPricing?.welcomeKit) {
            return res.json({ 
                success: true, 
                pricing: [],
                setupOnlyPricing: [],
                message: 'No hay configuración de precios'
            });
        }
        
        res.json({
            success: true,
            pricing: config.regionalPricing.welcomeKit || [],
            setupOnlyPricing: config.regionalPricing.setupOnly || []
        });
        
    } catch (error) {
        console.error('[WelcomeKit] Error obteniendo pricing:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/welcome-kit/admin/pricing
 * Actualiza la configuración de precios regionales (kit completo + setup only)
 * Puede actualizar uno o ambos
 */
router.put('/admin/pricing', protect, adminOnly, async (req, res) => {
    try {
        const { pricing, setupOnlyPricing } = req.body;
        
        // Al menos uno debe estar presente
        if (!pricing && !setupOnlyPricing) {
            return res.status(400).json({ 
                success: false, 
                error: 'Se requiere pricing o setupOnlyPricing' 
            });
        }
        
        // Preparar actualización
        const updateData = { isDefault: true };
        
        // Validar y agregar precios de kit completo si se envían
        if (pricing && Array.isArray(pricing)) {
            for (const p of pricing) {
                if (!p.regionCode || !p.price || !p.currency) {
                    return res.status(400).json({
                        success: false,
                        error: `Precio de kit inválido: ${JSON.stringify(p)}`
                    });
                }
            }
            updateData['regionalPricing.welcomeKit'] = pricing;
        }
        
        // Validar y agregar precios de setup only si se envían
        if (setupOnlyPricing && Array.isArray(setupOnlyPricing)) {
            for (const p of setupOnlyPricing) {
                if (!p.regionCode || p.price === undefined || !p.currency) {
                    return res.status(400).json({
                        success: false,
                        error: `Precio de setup inválido: ${JSON.stringify(p)}`
                    });
                }
            }
            updateData['regionalPricing.setupOnly'] = setupOnlyPricing;
        }
        
        // Actualizar o crear config
        const config = await GlobalConfig.findOneAndUpdate(
            { isDefault: true },
            updateData,
            { upsert: true, new: true }
        );
        
        console.log(`[WelcomeKit] 💰 Precios actualizados: ${pricing?.length || 0} regiones (kit) + ${setupOnlyPricing?.length || 0} regiones (setup)`);
        
        res.json({
            success: true,
            pricing: config.regionalPricing?.welcomeKit || [],
            setupOnlyPricing: config.regionalPricing?.setupOnly || [],
            message: `${pricing?.length || 0} precios de kit + ${setupOnlyPricing?.length || 0} precios de setup guardados`
        });
        
    } catch (error) {
        console.error('[WelcomeKit] Error guardando pricing:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== CJDROPSHIPPING ADMIN ====================

/**
 * GET /api/welcome-kit/admin/cj/balance
 * Obtiene el balance de la cuenta CJDropshipping
 */
router.get('/admin/cj/balance', protect, adminOnly, async (req, res) => {
    try {
        const balance = await CJDropshipping.getBalance();
        
        res.json({
            success: true,
            balance
        });
        
    } catch (error) {
        console.error('[WelcomeKit] Error obteniendo balance CJ:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            hint: 'Verifica que CJ_API_KEY esté configurado correctamente'
        });
    }
});

/**
 * POST /api/welcome-kit/admin/cj/sync/:id
 * Sincroniza el estado de una orden con CJDropshipping
 */
router.post('/admin/cj/sync/:id', protect, adminOnly, async (req, res) => {
    try {
        const welcomeKit = await WelcomeKit.findById(req.params.id);
        
        if (!welcomeKit) {
            return res.status(404).json({ success: false, error: 'WelcomeKit no encontrado' });
        }
        
        const cjOrderId = welcomeKit.shipping?.fulfillment?.externalOrderId;
        
        if (!cjOrderId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Este kit no tiene orden en CJDropshipping' 
            });
        }
        
        const cjStatus = await CJDropshipping.getOrderStatus(cjOrderId);
        
        // Actualizar datos
        welcomeKit.shipping.fulfillment.status = cjStatus.orderStatus;
        welcomeKit.shipping.fulfillment.lastSync = new Date();
        
        // Actualizar tracking si existe
        if (cjStatus.trackNumber) {
            welcomeKit.shipping.trackingNumber = cjStatus.trackNumber;
            welcomeKit.shipping.trackingUrl = cjStatus.trackingUrl;
            welcomeKit.shipping.carrier = cjStatus.logisticName;
            
            // Si tiene tracking, marcar como enviado
            if (welcomeKit.shipping.status === 'processing') {
                welcomeKit.shipping.status = 'shipped';
                welcomeKit.shipping.shippedAt = new Date();
            }
        }
        
        // Si está entregado, actualizar
        if (cjStatus.orderStatus === 'DELIVERED') {
            welcomeKit.shipping.status = 'delivered';
            welcomeKit.shipping.deliveredAt = new Date();
        }
        
        await welcomeKit.save();
        
        res.json({
            success: true,
            cjStatus,
            welcomeKit: {
                id: welcomeKit._id,
                shippingStatus: welcomeKit.shipping.status,
                trackingNumber: welcomeKit.shipping.trackingNumber,
                trackingUrl: welcomeKit.shipping.trackingUrl
            }
        });
        
    } catch (error) {
        console.error('[WelcomeKit] Error sincronizando con CJ:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/welcome-kit/admin/cj/retry/:id
 * Reintenta crear orden en CJ para un kit que falló
 */
router.post('/admin/cj/retry/:id', protect, adminOnly, async (req, res) => {
    try {
        const welcomeKit = await WelcomeKit.findById(req.params.id);
        
        if (!welcomeKit) {
            return res.status(404).json({ success: false, error: 'WelcomeKit no encontrado' });
        }
        
        // Solo si requiere revisión manual o tiene error
        if (!welcomeKit.shipping?.fulfillment?.requiresManualReview && 
            welcomeKit.shipping?.fulfillment?.status !== 'error') {
            return res.status(400).json({ 
                success: false, 
                error: 'Este kit ya tiene una orden creada o no requiere reintento' 
            });
        }
        
        // Obtener datos del checkout guardados
        const checkoutData = welcomeKit.get('_checkoutData') || {};
        welcomeKit._checkoutData = checkoutData;
        
        const cjOrder = await CJDropshipping.createOrder(welcomeKit);
        
        welcomeKit.shipping.fulfillment = {
            provider: 'cjdropshipping',
            externalOrderId: cjOrder.cjOrderId,
            orderNumber: cjOrder.orderNumber,
            shipmentOrderId: cjOrder.shipmentOrderId,
            status: cjOrder.orderStatus,
            costPrice: cjOrder.orderAmount,
            requiresManualReview: false,
            createdAt: new Date()
        };
        
        await welcomeKit.save();
        
        console.log(`[WelcomeKit] ✅ Orden CJ reintentada: ${cjOrder.cjOrderId}`);
        
        res.json({
            success: true,
            cjOrder,
            message: 'Orden creada exitosamente en CJDropshipping'
        });
        
    } catch (error) {
        console.error('[WelcomeKit] Error reintentando orden CJ:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/welcome-kit/admin/cj/orders
 * Lista órdenes de CJDropshipping (locales o desde API)
 */
router.get('/admin/cj/orders', protect, adminOnly, async (req, res) => {
    try {
        const { status, pageNum, pageSize, pendingReview, source } = req.query;
        
        // Si piden órdenes pendientes de revisión, buscar localmente
        if (pendingReview === 'true') {
            const orders = await WelcomeKit.find({
                'shipping.fulfillment.requiresManualReview': true,
                status: 'paid'
            }).sort({ createdAt: -1 }).limit(50);
            
            return res.json({
                success: true,
                orders
            });
        }
        
        // Si piden órdenes locales con fulfillment
        if (source === 'local') {
            const query = {
                'shipping.fulfillment.provider': 'cjdropshipping'
            };
            
            if (status) {
                query['shipping.fulfillment.status'] = status;
            }
            
            const orders = await WelcomeKit.find(query)
                .sort({ createdAt: -1 })
                .limit(parseInt(pageSize) || 50);
            
            return res.json({
                success: true,
                orders
            });
        }
        
        // Por defecto, llamar a la API de CJ
        const orders = await CJDropshipping.listOrders({
            status,
            pageNum: parseInt(pageNum) || 1,
            pageSize: parseInt(pageSize) || 20
        });
        
        res.json({
            success: true,
            ...orders
        });
        
    } catch (error) {
        console.error('[WelcomeKit] Error listando órdenes CJ:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/welcome-kit/admin/cj/sync-all
 * Sincroniza todas las órdenes pendientes con CJ
 */
router.post('/admin/cj/sync-all', protect, adminOnly, async (req, res) => {
    try {
        // Buscar todos los kits con órdenes en CJ que no estén entregados
        const pendingKits = await WelcomeKit.find({
            'shipping.fulfillment.provider': 'cjdropshipping',
            'shipping.fulfillment.externalOrderId': { $exists: true },
            'shipping.status': { $nin: ['delivered', 'returned', 'lost'] }
        });
        
        const results = {
            total: pendingKits.length,
            synced: 0,
            errors: []
        };
        
        for (const kit of pendingKits) {
            try {
                const cjStatus = await CJDropshipping.getOrderStatus(kit.shipping.fulfillment.externalOrderId);
                
                kit.shipping.fulfillment.status = cjStatus.orderStatus;
                kit.shipping.fulfillment.lastSync = new Date();
                
                if (cjStatus.trackNumber && !kit.shipping.trackingNumber) {
                    kit.shipping.trackingNumber = cjStatus.trackNumber;
                    kit.shipping.trackingUrl = cjStatus.trackingUrl;
                    kit.shipping.carrier = cjStatus.logisticName;
                    
                    if (kit.shipping.status === 'processing') {
                        kit.shipping.status = 'shipped';
                        kit.shipping.shippedAt = new Date();
                    }
                }
                
                if (cjStatus.orderStatus === 'DELIVERED') {
                    kit.shipping.status = 'delivered';
                    kit.shipping.deliveredAt = kit.shipping.deliveredAt || new Date();
                }
                
                await kit.save();
                results.synced++;
                
            } catch (error) {
                results.errors.push({
                    kitId: kit._id,
                    error: error.message
                });
            }
        }
        
        console.log(`[WelcomeKit] 🔄 Sync CJ completado: ${results.synced}/${results.total}`);
        
        res.json({
            success: true,
            results
        });
        
    } catch (error) {
        console.error('[WelcomeKit] Error en sync-all CJ:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== CJ CONFIGURACIÓN ====================

/**
 * GET /api/welcome-kit/admin/cj/config
 * Obtener configuración de CJDropshipping
 */
router.get('/admin/cj/config', protect, adminOnly, async (req, res) => {
    try {
        const config = await CJConfig.getConfig();
        
        // Verificar si API Key está configurada (sin revelarla)
        const hasApiKey = !!process.env.CJ_API_KEY;
        const apiKeyPreview = hasApiKey 
            ? `${process.env.CJ_API_KEY.substring(0, 8)}...${process.env.CJ_API_KEY.slice(-4)}`
            : null;
        
        res.json({
            success: true,
            config: {
                enabled: config.enabled,
                skus: config.skus,
                pricing: {
                    useDynamicPricing: config.pricing?.useDynamicPricing ?? true,
                    servicePricesByCountry: config.pricing?.servicePricesByCountry 
                        ? Object.fromEntries(config.pricing.servicePricesByCountry)
                        : {
                            'default': { setupSession: 15, trialClass: 10 },
                            'CL': { setupSession: 10, trialClass: 8 },
                            'US': { setupSession: 20, trialClass: 15 },
                            'MX': { setupSession: 12, trialClass: 10 },
                            'AR': { setupSession: 8, trialClass: 6 },
                            'CO': { setupSession: 10, trialClass: 8 },
                            'ES': { setupSession: 18, trialClass: 12 }
                        },
                    marginByCategory: config.pricing?.marginByCategory || {
                        cable: 40,
                        keyboard: 25,
                        stand: 35,
                        pedal: 40,
                        accessory: 35,
                        bundle: 20
                    },
                    defaultMarginPercent: config.pricing?.defaultMarginPercent || 30,
                    priceCacheMinutes: config.pricing?.priceCacheMinutes || 60
                },
                warehousePreferences: config.warehousePreferences,
                logisticsPreferences: config.logisticsPreferences,
                logisticsMethods: config.logisticsMethods,
                notes: config.notes,
                updatedAt: config.updatedAt
            },
            apiKeyConfigured: hasApiKey,
            apiKeyPreview
        });
        
    } catch (error) {
        console.error('[WelcomeKit] Error obteniendo config CJ:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/welcome-kit/admin/cj/config
 * Actualizar configuración de CJDropshipping
 */
router.put('/admin/cj/config', protect, adminOnly, async (req, res) => {
    try {
        const { enabled, skus, warehousePreferences, logisticsPreferences, logisticsMethods, notes, pricing } = req.body;
        
        let config = await CJConfig.getConfig();
        
        // Actualizar campos
        if (typeof enabled === 'boolean') {
            config.enabled = enabled;
        }
        
        if (skus) {
            if (skus.USB_B !== undefined) config.skus.USB_B = skus.USB_B;
            if (skus.MIDI_5PIN !== undefined) config.skus.MIDI_5PIN = skus.MIDI_5PIN;
            if (skus.MICRO_USB !== undefined) config.skus.MICRO_USB = skus.MICRO_USB;
            if (skus.USB_C !== undefined) config.skus.USB_C = skus.USB_C;
        }
        
        // Actualizar configuración de pricing
        if (pricing) {
            if (!config.pricing) {
                config.pricing = {};
            }
            
            if (typeof pricing.useDynamicPricing === 'boolean') {
                config.pricing.useDynamicPricing = pricing.useDynamicPricing;
            }
            
            // Manejar servicePricesByCountry (nueva estructura)
            if (pricing.servicePricesByCountry) {
                if (!config.pricing.servicePricesByCountry) {
                    config.pricing.servicePricesByCountry = new Map();
                }
                
                // El objeto viene como objeto plano desde el frontend
                Object.keys(pricing.servicePricesByCountry).forEach(country => {
                    const prices = pricing.servicePricesByCountry[country];
                    config.pricing.servicePricesByCountry.set(country, {
                        setupSession: parseFloat(prices.setupSession) || 15,
                        trialClass: parseFloat(prices.trialClass) || 10
                    });
                });
            }
            
            // Mantener compatibilidad con fixedPrices (deprecated)
            if (pricing.fixedPrices) {
                if (!config.pricing.fixedPrices) {
                    config.pricing.fixedPrices = {};
                }
                if (pricing.fixedPrices.setupSession !== undefined) {
                    config.pricing.setupSession = parseFloat(pricing.fixedPrices.setupSession) || 15;
                    config.pricing.fixedPrices.setupSession = parseFloat(pricing.fixedPrices.setupSession) || 15;
                }
                if (pricing.fixedPrices.trialClass !== undefined) {
                    config.pricing.trialClass = parseFloat(pricing.fixedPrices.trialClass) || 10;
                    config.pricing.fixedPrices.trialClass = parseFloat(pricing.fixedPrices.trialClass) || 10;
                }
            }
            
            if (pricing.marginByCategory) {
                if (!config.pricing.marginByCategory) {
                    config.pricing.marginByCategory = {};
                }
                const categories = ['cable', 'keyboard', 'stand', 'pedal', 'accessory', 'bundle'];
                categories.forEach(cat => {
                    if (pricing.marginByCategory[cat] !== undefined) {
                        config.pricing.marginByCategory[cat] = Math.max(0, Math.min(100, parseFloat(pricing.marginByCategory[cat]) || 0));
                    }
                });
            }
            
            if (pricing.defaultMarginPercent !== undefined) {
                config.pricing.defaultMarginPercent = Math.max(0, Math.min(100, parseFloat(pricing.defaultMarginPercent) || 30));
            }
            
            if (pricing.priceCacheMinutes !== undefined) {
                config.pricing.priceCacheMinutes = parseInt(pricing.priceCacheMinutes) || 60;
            }
        }
        
        if (warehousePreferences) {
            if (warehousePreferences.useUSWarehouse) {
                config.warehousePreferences.useUSWarehouse = warehousePreferences.useUSWarehouse;
            }
            if (warehousePreferences.defaultWarehouse) {
                config.warehousePreferences.defaultWarehouse = warehousePreferences.defaultWarehouse;
            }
        }
        
        if (logisticsPreferences) {
            if (logisticsPreferences.latam) config.logisticsPreferences.latam = logisticsPreferences.latam;
            if (logisticsPreferences.europe) config.logisticsPreferences.europe = logisticsPreferences.europe;
            if (logisticsPreferences.usa) config.logisticsPreferences.usa = logisticsPreferences.usa;
        }
        
        if (logisticsMethods) {
            if (logisticsMethods.latam) config.logisticsMethods.latam = logisticsMethods.latam;
            if (logisticsMethods.europe) config.logisticsMethods.europe = logisticsMethods.europe;
            if (logisticsMethods.usa) config.logisticsMethods.usa = logisticsMethods.usa;
            if (logisticsMethods.default) config.logisticsMethods.default = logisticsMethods.default;
        }
        
        if (notes !== undefined) {
            config.notes = notes;
        }
        
        config.lastUpdatedBy = req.user._id;
        config.updatedAt = new Date();
        
        // Marcar pricing como modificado para que Mongoose lo guarde
        config.markModified('pricing');
        
        await config.save();
        
        // Invalidar cache del servicio
        CJDropshipping.invalidateConfigCache();
        
        console.log(`[WelcomeKit] ⚙️ Config CJ actualizada por ${req.user.name}`);
        
        res.json({
            success: true,
            message: 'Configuración actualizada',
            config: {
                enabled: config.enabled,
                skus: config.skus,
                pricing: config.pricing,
                warehousePreferences: config.warehousePreferences,
                logisticsPreferences: config.logisticsPreferences,
                logisticsMethods: config.logisticsMethods
            }
        });
        
    } catch (error) {
        console.error('[WelcomeKit] Error actualizando config CJ:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/welcome-kit/admin/cj/test-connection
 * Probar conexión con CJDropshipping
 */
router.post('/admin/cj/test-connection', protect, adminOnly, async (req, res) => {
    try {
        if (!process.env.CJ_API_KEY) {
            return res.json({
                success: false,
                error: 'CJ_API_KEY no configurada en variables de entorno'
            });
        }
        
        // Intentar obtener balance como prueba de conexión
        const balance = await CJDropshipping.getBalance();
        
        res.json({
            success: true,
            message: 'Conexión exitosa con CJDropshipping',
            balance: balance.amount,
            currency: balance.currency
        });
        
    } catch (error) {
        console.error('[WelcomeKit] Error probando conexión CJ:', error);
        res.json({
            success: false,
            error: error.message
        });
    }
});

// ==================== DSers / AliExpress ====================

/**
 * GET /api/welcome-kit/admin/dsers/config
 * Obtener configuración de DSers
 */
router.get('/admin/dsers/config', protect, adminOnly, async (req, res) => {
    try {
        const config = await CJConfig.findOne() || await CJConfig.create({
            dsersConfig: {
                enabled: false,
                affiliateTrackingId: '',
                defaultMargin: 40
            }
        });
        
        res.json({
            success: true,
            config: {
                enabled: config.dsersConfig?.enabled || false,
                affiliateTrackingId: config.dsersConfig?.affiliateTrackingId || '',
                defaultMargin: config.dsersConfig?.defaultMargin || 40
            }
        });
    } catch (error) {
        console.error('[DSers] Error obteniendo config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/welcome-kit/admin/dsers/config
 * Actualizar configuración de DSers
 */
router.put('/admin/dsers/config', protect, adminOnly, async (req, res) => {
    try {
        const { enabled, affiliateTrackingId, defaultMargin } = req.body;
        
        const config = await CJConfig.findOne() || await CJConfig.create({});
        
        if (!config.dsersConfig) {
            config.dsersConfig = {};
        }
        
        if (enabled !== undefined) config.dsersConfig.enabled = enabled;
        if (affiliateTrackingId !== undefined) config.dsersConfig.affiliateTrackingId = affiliateTrackingId;
        if (defaultMargin !== undefined) config.dsersConfig.defaultMargin = defaultMargin;
        
        await config.save();
        
        res.json({ 
            success: true, 
            message: 'Configuración DSers actualizada',
            config: config.dsersConfig
        });
    } catch (error) {
        console.error('[DSers] Error guardando config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/welcome-kit/admin/dsers/export-csv
 * Exportar pedidos pendientes a CSV para DSers
 */
router.post('/admin/dsers/export-csv', protect, adminOnly, async (req, res) => {
    try {
        const AliExpressService = require('../services/AliExpressService');
        
        // Buscar órdenes pagadas pero no enviadas
        const orders = await WelcomeKit.find({
            paymentStatus: 'completed',
            shippingStatus: { $in: ['pending', 'paid'] }
        }).select('_id customerName email phone country shippingAddress selectedCable total createdAt');
        
        if (orders.length === 0) {
            return res.json({
                success: false,
                message: 'No hay pedidos pendientes para exportar'
            });
        }
        
        // Generar CSV
        const csv = AliExpressService.generateDSersCSV(orders);
        
        // Enviar como descarga
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="dsers-orders-${Date.now()}.csv"`);
        res.send(csv);
        
    } catch (error) {
        console.error('[DSers] Error exportando CSV:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/welcome-kit/admin/dsers/import-tracking
 * Importar trackings desde CSV de DSers o texto pegado
 */
router.post('/admin/dsers/import-tracking', protect, adminOnly, async (req, res) => {
    try {
        const AliExpressService = require('../services/AliExpressService');
        const { csvContent, trackings } = req.body;
        
        let trackingData = [];
        
        // Si viene CSV, parsearlo
        if (csvContent) {
            trackingData = AliExpressService.parseTrackingCSV(csvContent);
        }
        // Si viene array de trackings directamente
        else if (trackings && Array.isArray(trackings)) {
            trackingData = trackings.map(t => ({
                orderId: t.orderId,
                trackingNumber: t.trackingNumber,
                carrier: AliExpressService.detectCarrier(t.trackingNumber),
                trackingUrl: AliExpressService.generateTrackingUrl(t.trackingNumber)
            }));
        }
        
        if (trackingData.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'No se encontraron trackings válidos' 
            });
        }
        
        const results = {
            updated: 0,
            notFound: 0,
            errors: []
        };
        
        // Actualizar cada orden
        for (const track of trackingData) {
            try {
                const kit = await WelcomeKit.findById(track.orderId);
                
                if (!kit) {
                    results.notFound++;
                    results.errors.push(`Orden ${track.orderId} no encontrada`);
                    continue;
                }
                
                // Calcular fecha estimada
                const country = kit.shipping?.address?.country || kit.country || 'DEFAULT';
                const delivery = AliExpressService.calculateEstimatedDelivery(country, track.trackingNumber);
                
                // Actualizar shipping
                kit.shipping = kit.shipping || {};
                kit.shipping.trackingNumber = track.trackingNumber;
                kit.shipping.trackingUrl = track.trackingUrl;
                kit.shipping.carrier = track.carrier;
                kit.shipping.status = 'shipped';
                kit.shipping.shippedAt = new Date();
                kit.shipping.estimatedDelivery = delivery.date;
                kit.overallStatus = 'shipping';
                
                await kit.save();
                results.updated++;
                
            } catch (err) {
                results.errors.push(`Error en orden ${track.orderId}: ${err.message}`);
            }
        }
        
        res.json({
            success: true,
            message: `${results.updated} órdenes actualizadas`,
            results
        });
        
    } catch (error) {
        console.error('[DSers] Error importando trackings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/welcome-kit/admin/shipping/auto-complete
 * Auto-completar URL de tracking y fecha estimada
 */
router.post('/admin/shipping/auto-complete', protect, adminOnly, async (req, res) => {
    try {
        const AliExpressService = require('../services/AliExpressService');
        const { trackingNumber, countryCode } = req.body;
        
        if (!trackingNumber) {
            return res.status(400).json({ success: false, error: 'Tracking number requerido' });
        }
        
        const carrier = AliExpressService.detectCarrier(trackingNumber);
        const trackingUrl = AliExpressService.generateTrackingUrl(trackingNumber);
        const delivery = AliExpressService.calculateEstimatedDelivery(countryCode, trackingNumber);
        
        res.json({
            success: true,
            data: {
                trackingNumber,
                carrier,
                carrierLabel: {
                    'cainiao': 'Cainiao (AliExpress Premium)',
                    'china_post': 'China Post',
                    'yanwen': 'Yanwen Logistics',
                    'sunyou': 'SunYou Logistics',
                    'epacket': 'ePacket',
                    'aliexpress_standard': 'AliExpress Standard'
                }[carrier] || 'AliExpress Shipping',
                trackingUrl,
                estimatedDelivery: delivery.date,
                estimatedDays: delivery.days,
                deliveryRange: delivery.range
            }
        });
        
    } catch (error) {
        console.error('[Shipping] Error auto-complete:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/welcome-kit/admin/products/fetch-info
 * Extraer información de producto desde URL de AliExpress
 */
router.post('/admin/products/fetch-info', protect, adminOnly, async (req, res) => {
    try {
        const AliExpressService = require('../services/AliExpressService');
        const { url } = req.body;

        if (!url || !AliExpressService.isAliExpressUrl(url)) {
            return res.status(400).json({
                success: false,
                error: 'URL inválida. Debe ser de aliexpress.com'
            });
        }

        console.log('[AliExpress] 🔍 Extrayendo info de:', url);
        const productInfo = await AliExpressService.fetchProductInfo(url);

        res.json({
            success: true,
            product: {
                productId: productInfo.productId,
                name: productInfo.name,
                priceCLP: Math.round(productInfo.priceCLP),
                priceUSD: Math.round(productInfo.priceUSD * 100) / 100,
                image: productInfo.image,
                url: productInfo.url,
                currency: productInfo.currency
            }
        });

    } catch (error) {
        console.error('[AliExpress] Error extrayendo info:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/welcome-kit/admin/products
 * Listar TODOS los productos del Welcome Kit Store
 */
router.get('/admin/products', protect, adminOnly, async (req, res) => {
    try {
        const products = await KitProduct.find({
            isActive: true
        }).select('name slug category fulfillment defaultPrice imageUrl').sort({ createdAt: -1 });
        
        res.json({ success: true, products });
    } catch (error) {
        console.error('[WelcomeKit] Error listando productos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/welcome-kit/admin/products/aliexpress
 * Listar productos de AliExpress configurados
 */
router.get('/admin/products/aliexpress', protect, adminOnly, async (req, res) => {
    try {
        const products = await KitProduct.find({
            'fulfillment.provider': 'aliexpress',
            isActive: true
        }).select('name slug category fulfillment defaultPrice');
        
        res.json({ success: true, products });
    } catch (error) {
        console.error('[DSers] Error listando productos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/welcome-kit/admin/products/aliexpress
 * Agregar producto de AliExpress
 */
router.post('/admin/products/aliexpress', protect, adminOnly, async (req, res) => {
    try {
        const AliExpressService = require('../services/AliExpressService');
        const { name, aliexpressUrl, imageUrl, price, margin, category } = req.body;
        
        // Validar URL de AliExpress
        if (!AliExpressService.isAliExpressUrl(aliexpressUrl)) {
            return res.status(400).json({
                success: false,
                error: 'URL inválida. Debe ser de aliexpress.com'
            });
        }
        
        // Extraer ID del producto
        const productId = AliExpressService.extractProductId(aliexpressUrl);
        
        // Generar slug
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        
        // Calcular precio final con margen
        const finalPrice = AliExpressService.calculatePrice(price, margin);
        
        // Crear producto
        const product = await KitProduct.create({
            name,
            slug,
            category: category || 'cable',
            description: `Producto de AliExpress`,
            shortDescription: name,
            fulfillment: {
                provider: 'aliexpress',
                aliexpressUrl: AliExpressService.addAffiliateTracking(aliexpressUrl),
                dsersProductId: productId,
                costPrice: price
            },
            defaultPrice: finalPrice,
            isActive: true,
            imageUrl: imageUrl || 'https://via.placeholder.com/400x300?text=📦+Producto'
        });
        
        res.json({ 
            success: true, 
            message: 'Producto agregado exitosamente',
            product 
        });
        
    } catch (error) {
        console.error('[DSers] Error agregando producto:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/welcome-kit/admin/products/:id
 * Obtener un producto por ID
 */
router.get('/admin/products/:id', protect, adminOnly, async (req, res) => {
    try {
        const product = await KitProduct.findById(req.params.id);
        
        if (!product) {
            return res.status(404).json({ success: false, error: 'Producto no encontrado' });
        }
        
        res.json({ success: true, product });
    } catch (error) {
        console.error('[WelcomeKit] Error obteniendo producto:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/welcome-kit/admin/products/:id
 * Actualizar un producto
 */
router.put('/admin/products/:id', protect, adminOnly, async (req, res) => {
    try {
        const { name, imageUrl, cost, margin, category } = req.body;
        
        const product = await KitProduct.findById(req.params.id);
        
        if (!product) {
            return res.status(404).json({ success: false, error: 'Producto no encontrado' });
        }
        
        // Actualizar campos
        if (name) product.name = name;
        if (category) product.category = category;
        
        // Limpiar y guardar URL de imagen
        if (imageUrl !== undefined) {
            // Limpiar URL de AliExpress (remover parámetros de query que causan problemas)
            let cleanImageUrl = imageUrl;
            if (imageUrl && imageUrl.includes('aliexpress-media.com')) {
                // Mantener solo hasta .jpg o .png
                const baseMatch = imageUrl.match(/(https?:\/\/[^?]+\.(jpg|jpeg|png|webp|gif))/i);
                if (baseMatch) {
                    cleanImageUrl = baseMatch[1];
                }
            }
            product.imageUrl = cleanImageUrl;
            console.log('[WelcomeKit] Imagen guardada:', cleanImageUrl);
        }
        
        // Actualizar precios
        if (cost !== undefined) {
            product.fulfillment.costPrice = cost;
        }
        
        // Calcular nuevo precio de venta
        const costPrice = cost !== undefined ? cost : (product.fulfillment?.costPrice || 0);
        const marginPercent = margin !== undefined ? margin : 40;
        product.defaultPrice = Math.round(costPrice * (1 + marginPercent / 100) * 100) / 100;
        
        await product.save();
        
        console.log(`[WelcomeKit] ✏️ Producto actualizado: ${product.name}`);
        
        res.json({ success: true, product });
    } catch (error) {
        console.error('[WelcomeKit] Error actualizando producto:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/welcome-kit/admin/products/:id
 * Eliminar un producto
 */
router.delete('/admin/products/:id', protect, adminOnly, async (req, res) => {
    try {
        const product = await KitProduct.findByIdAndDelete(req.params.id);
        
        if (!product) {
            return res.status(404).json({ 
                success: false, 
                error: 'Producto no encontrado' 
            });
        }
        
        res.json({ 
            success: true, 
            message: 'Producto eliminado exitosamente' 
        });
        
    } catch (error) {
        console.error('[Products] Error eliminando producto:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== FLUJO SIMPLIFICADO V2 ($44 USD servicio) ====================
// Estados: entrevista_pendiente → esperando_equipo → setup_pendiente → clase_pendiente → completado

const WelcomeKitEmailService = require('../services/WelcomeKitEmailService');

/**
 * GET /api/welcome-kit/v2/orders
 * Lista todas las órdenes del flujo simplificado (para admin)
 */
router.get('/v2/orders', protect, adminOnly, async (req, res) => {
    try {
        const orders = await WelcomeKit.find({ kitType: 'setup_only' })
            .populate('clientId', 'name email whatsapp')
            .sort({ createdAt: -1 })
            .limit(100);

        res.json({ success: true, orders });
    } catch (error) {
        console.error('[WelcomeKit V2] Error listando órdenes:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/welcome-kit/v2/:id/send-recommendations
 * Admin envía email con recomendaciones de equipo post-entrevista
 */
router.post('/v2/:id/send-recommendations', protect, adminOnly, async (req, res) => {
    try {
        const { keyboardBrand, connectionType, recommendations, notes, calendarLink } = req.body;
        
        const kit = await WelcomeKit.findById(req.params.id);
        if (!kit) {
            return res.status(404).json({ success: false, error: 'Orden no encontrada' });
        }

        // Enviar email con recomendaciones
        const adminData = await _getAdminEmailData();
        const emailResult = await WelcomeKitEmailService.sendEquipmentRecommendations({
            to: kit.clientEmail,
            clientName: kit.clientName,
            keyboardBrand: keyboardBrand || 'Tu teclado',
            connectionType: connectionType || 'USB-B',
            recommendations,
            notes,
            calendarLink,
            adminName: adminData.adminName,
            adminWhatsapp: adminData.adminWhatsapp
        });

        if (!emailResult.success) {
            return res.status(500).json({ success: false, error: 'Error enviando email: ' + emailResult.error });
        }

        // Actualizar estado y guardar datos de la entrevista
        kit.overallStatus = 'esperando_equipo';
        kit.cable = kit.cable || {};
        kit.cable.keyboardModel = keyboardBrand;
        kit.cable.type = connectionType === 'USB-B' ? 'USB_B' : 
                        connectionType === 'USB-C' ? 'USB_C' :
                        connectionType === 'MIDI 5-pin' ? 'MIDI_5PIN' : 'USB_B';
        
        // Guardar notas de la entrevista en el campo de setup
        kit.setupSession = kit.setupSession || {};
        kit.setupSession.technicianNotes = notes;
        
        await kit.save();

        console.log(`[WelcomeKit V2] ✉️ Recomendaciones enviadas a ${kit.clientEmail}`);

        res.json({ 
            success: true, 
            message: 'Email de recomendaciones enviado',
            emailId: emailResult.messageId,
            newStatus: 'esperando_equipo'
        });
    } catch (error) {
        console.error('[WelcomeKit V2] Error enviando recomendaciones:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/welcome-kit/v2/:id/client-ready
 * Cliente indica que ya tiene el equipo listo
 */
router.post('/v2/:id/client-ready', protect, async (req, res) => {
    try {
        const kit = await WelcomeKit.findById(req.params.id);
        if (!kit) {
            return res.status(404).json({ success: false, error: 'Orden no encontrada' });
        }

        // Verificar que el cliente es el dueño (o es admin)
        if (kit.clientId && kit.clientId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'No autorizado' });
        }

        // Actualizar estado
        kit.overallStatus = 'setup_pending';
        kit.shipping = kit.shipping || {};
        kit.shipping.clientConfirmedReceipt = true;
        kit.shipping.clientConfirmedAt = new Date();
        
        await kit.save();

        // Enviar confirmación al cliente
        const adminData = await _getAdminEmailData();
        await WelcomeKitEmailService.sendEquipmentReadyConfirmation({
            to: kit.clientEmail,
            clientName: kit.clientName,
            calendarLink: req.body.calendarLink || '',
            adminName: adminData.adminName,
            adminWhatsapp: adminData.adminWhatsapp
        });

        console.log(`[WelcomeKit V2] ✅ Cliente ${kit.clientEmail} confirmó equipo listo`);

        res.json({ 
            success: true, 
            message: 'Confirmación recibida, te contactaremos para agendar el setup',
            newStatus: 'setup_pending'
        });
    } catch (error) {
        console.error('[WelcomeKit V2] Error confirmando equipo:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/welcome-kit/v2/:id/status
 * Admin actualiza el estado manualmente
 */
router.put('/v2/:id/status', protect, adminOnly, async (req, res) => {
    try {
        const { status, notes } = req.body;
        
        const validStatuses = [
            'paid',
            'entrevista_pendiente',
            'entrevista_agendada',
            'esperando_equipo', 
            'setup_pending',
            'setup_scheduled',
            'trial_available',
            'trial_scheduled',
            'completed'
        ];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({ 
                success: false, 
                error: `Estado inválido. Válidos: ${validStatuses.join(', ')}` 
            });
        }

        const kit = await WelcomeKit.findById(req.params.id);
        if (!kit) {
            return res.status(404).json({ success: false, error: 'Orden no encontrada' });
        }

        kit.overallStatus = status;
        
        // Guardar notas si se proporcionan
        if (notes) {
            kit.setupSession = kit.setupSession || {};
            kit.setupSession.technicianNotes = 
                (kit.setupSession.technicianNotes || '') + '\n\n---\n' + new Date().toLocaleDateString() + ': ' + notes;
        }

        // Si se marca setup como completado, desbloquear clase de prueba
        if (status === 'trial_available') {
            kit.setupSession.status = 'completed';
            kit.setupSession.completedAt = new Date();
            kit.trialClass = kit.trialClass || {};
            kit.trialClass.status = 'available';
            kit.trialClass.unlockedAt = new Date();
        }

        // Si se marca como completado
        if (status === 'completed') {
            kit.trialClass = kit.trialClass || {};
            kit.trialClass.status = 'completed';
            kit.trialClass.completedAt = new Date();
        }

        await kit.save();

        console.log(`[WelcomeKit V2] 📝 Estado actualizado a: ${status} para ${kit.clientEmail}`);

        res.json({ 
            success: true, 
            message: `Estado actualizado a: ${status}`,
            kit
        });
    } catch (error) {
        console.error('[WelcomeKit V2] Error actualizando estado:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/welcome-kit/v2/my-kit
 * Cliente obtiene el estado de su kit
 */
router.get('/v2/my-kit', protect, async (req, res) => {
    try {
        // Buscar por clientId o por email
        const kit = await WelcomeKit.findOne({
            $or: [
                { clientId: req.user._id },
                { clientEmail: req.user.email }
            ],
            kitType: 'setup_only'
        }).sort({ createdAt: -1 });

        if (!kit) {
            return res.json({ success: true, kit: null });
        }

        // Traducir estados a mensajes amigables
        const statusMessages = {
            'paid': { step: 1, message: 'Esperando agendar tu entrevista técnica', action: null },
            'entrevista_pendiente': { step: 1, message: 'Esperando tu entrevista técnica', action: null },
            'esperando_equipo': { step: 2, message: 'Revisa tu email para ver las recomendaciones de equipo', action: 'confirm_equipment' },
            'setup_pending': { step: 3, message: 'Equipo confirmado. Pronto agendaremos tu setup técnico', action: null },
            'setup_scheduled': { step: 3, message: 'Setup técnico agendado', action: null },
            'trial_available': { step: 4, message: '¡Listo para tu clase de prueba!', action: 'schedule_trial' },
            'trial_scheduled': { step: 4, message: 'Clase de prueba agendada', action: null },
            'completed': { step: 5, message: '¡Onboarding completado!', action: 'view_teachers' }
        };

        const statusInfo = statusMessages[kit.overallStatus] || { step: 1, message: kit.overallStatus, action: null };

        res.json({ 
            success: true, 
            kit: {
                _id: kit._id,
                id: kit._id,
                overallStatus: kit.overallStatus,
                status: kit.overallStatus,
                ...statusInfo,
                createdAt: kit.createdAt,
                setupSession: kit.setupSession,
                trialClass: kit.trialClass,
                interview: kit.interview
            }
        });
    } catch (error) {
        console.error('[WelcomeKit V2] Error obteniendo kit:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/welcome-kit/v2/recommendation-templates
 * Obtiene templates de recomendaciones por tipo de conexión
 */
router.get('/v2/recommendation-templates', protect, adminOnly, async (req, res) => {
    try {
        // Templates predefinidos para cada tipo de conexión
        const templates = {
            'USB-B': {
                label: 'USB Tipo B (Yamaha, Roland, Casio)',
                recommendations: [
                    {
                        name: 'Cable USB-B a USB-A (2 metros)',
                        description: 'Cable estándar para teclados Yamaha, Roland, Casio, Korg',
                        price: '$5-8 USD',
                        links: [
                            { store: 'Amazon', url: 'https://www.amazon.com/s?k=usb+b+cable+printer+2m' },
                            { store: 'AliExpress', url: 'https://www.aliexpress.com/w/wholesale-usb-b-cable-2m.html' },
                            { store: 'MercadoLibre CL', url: 'https://listado.mercadolibre.cl/cable-usb-tipo-b-impresora' }
                        ],
                        priority: 'required'
                    }
                ]
            },
            'USB-C': {
                label: 'USB Tipo C (Teclados modernos)',
                recommendations: [
                    {
                        name: 'Cable USB-C a USB-A (2 metros)',
                        description: 'Para teclados nuevos con puerto USB-C',
                        price: '$6-10 USD',
                        links: [
                            { store: 'Amazon', url: 'https://www.amazon.com/s?k=usb+c+cable+2m' },
                            { store: 'AliExpress', url: 'https://www.aliexpress.com/w/wholesale-usb-c-cable-2m.html' },
                            { store: 'MercadoLibre CL', url: 'https://listado.mercadolibre.cl/cable-usb-c-2-metros' }
                        ],
                        priority: 'required'
                    }
                ]
            },
            'MIDI 5-pin': {
                label: 'MIDI clásico (5 pines)',
                recommendations: [
                    {
                        name: 'Interfaz MIDI USB',
                        description: 'Convierte conexión MIDI de 5 pines a USB',
                        price: '$10-20 USD',
                        links: [
                            { store: 'Amazon', url: 'https://www.amazon.com/s?k=midi+to+usb+interface' },
                            { store: 'AliExpress', url: 'https://www.aliexpress.com/w/wholesale-midi-usb-interface.html' },
                            { store: 'MercadoLibre CL', url: 'https://listado.mercadolibre.cl/interfaz-midi-usb' }
                        ],
                        priority: 'required'
                    }
                ]
            },
            'Bluetooth': {
                label: 'Bluetooth MIDI',
                recommendations: [
                    {
                        name: 'No requiere cable',
                        description: 'Tu teclado se conecta por Bluetooth. Verificaremos la compatibilidad en el setup.',
                        price: 'Incluido',
                        links: [],
                        priority: 'info'
                    }
                ]
            }
        };

        // Accesorios comunes para agregar
        const commonAccessories = [
            {
                name: 'Pedal de Sustain',
                description: 'Esencial para tocar piano. Cualquier pedal genérico funciona.',
                price: '$10-20 USD',
                links: [
                    { store: 'Amazon', url: 'https://www.amazon.com/s?k=sustain+pedal+keyboard' },
                    { store: 'AliExpress', url: 'https://www.aliexpress.com/w/wholesale-sustain-pedal.html' },
                    { store: 'MercadoLibre CL', url: 'https://listado.mercadolibre.cl/pedal-sustain' }
                ],
                priority: 'recommended'
            },
            {
                name: 'Audífonos con cable',
                description: 'Para escuchar al profesor sin eco. Cualquier audífono sirve.',
                price: 'Ya tienes probablemente',
                links: [],
                priority: 'recommended'
            }
        ];

        res.json({ 
            success: true, 
            templates,
            commonAccessories
        });
    } catch (error) {
        console.error('[WelcomeKit V2] Error obteniendo templates:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// ==================================================================================
// SISTEMA DE ENTREVISTAS DE BIENVENIDA — Agendamiento autoservicio
// ==================================================================================

/**
 * POST /api/welcome-kit/v2/interview-availability
 * Admin configura su disponibilidad semanal y genera slots.
 * Los mismos slots sirven para entrevistas y sesiones de setup.
 * Body: { weeklySlots: [{ dayOfWeek: 0-6, startTime: "HH:mm", endTime: "HH:mm" }],
 *         weeksAhead: 4, duration: 15, meetingLink: "https://...", timezone: "America/Santiago" }
 */
router.post('/v2/interview-availability', protect, adminOnly, async (req, res) => {
    try {
        const { weeklySlots, weeksAhead = 4, duration = 15, meetingLink = '', timezone = 'America/Santiago' } = req.body;
        const purpose = 'interview'; // Slots compartidos para entrevistas y setup

        if (!weeklySlots || !Array.isArray(weeklySlots) || weeklySlots.length === 0) {
            return res.status(400).json({ success: false, error: 'Debes definir al menos un bloque horario' });
        }

        const staffId = req.user._id;
        const staffName = req.user.name || 'Admin';
        const nowLocal = moment.tz(timezone);
        let created = 0;
        let skipped = 0;

        // Generar slots para las próximas N semanas
        for (let week = 0; week < weeksAhead; week++) {
            for (const block of weeklySlots) {
                const { dayOfWeek, startTime, endTime } = block;
                if (dayOfWeek === undefined || !startTime || !endTime) continue;

                // Calcular la fecha en el timezone del admin
                const baseDay = moment.tz(timezone).add(week, 'weeks');
                
                // Mover al día de la semana correcto
                const currentDay = baseDay.day();
                let daysUntil = dayOfWeek - currentDay;
                if (week === 0 && daysUntil < 0) continue;
                if (week === 0 && daysUntil === 0) {
                    const [startH] = startTime.split(':').map(Number);
                    if (nowLocal.hours() >= startH) continue;
                }
                
                const slotDay = baseDay.clone().add(daysUntil, 'days');
                const dateStr = slotDay.format('YYYY-MM-DD');

                // Generar sub-slots dentro del bloque
                const [startH, startM] = startTime.split(':').map(Number);
                const [endH, endM] = endTime.split(':').map(Number);
                const blockStartMin = startH * 60 + startM;
                const blockEndMin = endH * 60 + endM;

                for (let min = blockStartMin; min + duration <= blockEndMin; min += duration) {
                    const h = Math.floor(min / 60);
                    const m = min % 60;
                    // Crear la hora en el timezone del admin → se convierte a UTC automáticamente
                    const slotStart = moment.tz(`${dateStr} ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`, 'YYYY-MM-DD HH:mm', timezone).toDate();
                    const slotEnd = new Date(slotStart.getTime() + duration * 60000);

                    // Solo crear si es futuro
                    if (slotStart <= new Date()) continue;

                    try {
                        await OnboardingSlot.create({
                            staffId,
                            staffName,
                            purpose,
                            startTime: slotStart,
                            endTime: slotEnd,
                            duration,
                            status: 'available',
                            meetingLink,
                            timezone
                        });
                        created++;
                    } catch (err) {
                        // Duplicado (índice único) → skip silencioso
                        if (err.code === 11000) {
                            skipped++;
                        } else {
                            console.error(`[${purpose}] Error creando slot:`, err.message);
                        }
                    }
                }
            }
        }

        const purposeLabel = purpose === 'setup' ? 'setup' : 'entrevista';
        console.log(`[${purposeLabel}] ✅ Generados ${created} slots, ${skipped} duplicados omitidos`);

        res.json({
            success: true,
            created,
            skipped,
            purpose,
            message: `Se crearon ${created} slots de ${purposeLabel} para las próximas ${weeksAhead} semanas`
        });
    } catch (error) {
        console.error('[Interview] Error generando disponibilidad:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


/**
 * GET /api/welcome-kit/v2/interview-slots
 * Slots de entrevista disponibles (para el cliente).
 * Query: ?purpose=interview (default)
 */
router.get('/v2/interview-slots', protect, async (req, res) => {
    try {
        const purpose = req.query.purpose || 'interview';
        const now = new Date();

        const slots = await OnboardingSlot.find({
            purpose,
            status: 'available',
            startTime: { $gt: now }
        })
        .sort({ startTime: 1 })
        .limit(100)
        .select('startTime endTime duration staffName meetingLink timezone');

        res.json({ success: true, slots });
    } catch (error) {
        console.error('[Interview] Error obteniendo slots:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


/**
 * GET /api/welcome-kit/v2/interview-calendar
 * Calendario completo para el admin (entrevistas + setups, disponibles + agendados).
 * Query: ?from=ISO&to=ISO
 */
router.get('/v2/interview-calendar', protect, adminOnly, async (req, res) => {
    try {
        const now = new Date();
        const from = req.query.from ? new Date(req.query.from) : new Date(now.setDate(now.getDate() - 7));
        const to = req.query.to ? new Date(req.query.to) : new Date(new Date().setDate(new Date().getDate() + 30));

        // Buscar slots de ambos propósitos (interview + setup)
        const slots = await OnboardingSlot.find({
            purpose: { $in: ['interview', 'setup'] },
            startTime: { $gte: from, $lte: to }
        })
        .sort({ startTime: 1 })
        .populate('booking.clientId', 'name email')
        .populate('booking.kitId', 'overallStatus clientName');

        // Stats
        const available = slots.filter(s => s.status === 'available').length;
        const booked = slots.filter(s => s.status === 'booked').length;
        const completed = slots.filter(s => s.status === 'completed').length;
        const upcoming = slots.filter(s => s.status === 'booked' && s.startTime > new Date()).length;

        res.json({
            success: true,
            slots,
            stats: { available, booked, completed, upcoming }
        });
    } catch (error) {
        console.error('[Interview] Error obteniendo calendario:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


/**
 * POST /api/welcome-kit/v2/:id/schedule-interview
 * Cliente agenda su entrevista de bienvenida seleccionando un slot.
 * Body: { slotId: "...", timezone: "America/Santiago" }
 */
router.post('/v2/:id/schedule-interview', protect, async (req, res) => {
    try {
        const kitId = req.params.id;
        const { slotId, timezone = 'America/Santiago' } = req.body;

        if (!slotId) {
            return res.status(400).json({ success: false, error: 'Debes seleccionar un horario' });
        }

        // Verificar que el kit existe y pertenece al usuario
        const kit = await WelcomeKit.findById(kitId);
        if (!kit) {
            return res.status(404).json({ success: false, error: 'Kit no encontrado' });
        }

        // Verificar que el kit es del usuario logueado
        const isOwner = kit.clientId && kit.clientId.toString() === req.user._id.toString();
        const isEmailMatch = kit.clientEmail === req.user.email;
        if (!isOwner && !isEmailMatch) {
            return res.status(403).json({ success: false, error: 'No tienes permiso para este kit' });
        }

        // Verificar que el estado permite agendar entrevista
        if (!['entrevista_pendiente', 'paid'].includes(kit.overallStatus)) {
            return res.status(400).json({
                success: false,
                error: `No se puede agendar entrevista en estado: ${kit.overallStatus}`
            });
        }

        // Reservar el slot atómicamente (anti-double-booking)
        const slot = await OnboardingSlot.findOneAndUpdate(
            {
                _id: slotId,
                purpose: 'interview',
                status: 'available'
            },
            {
                $set: {
                    status: 'booked',
                    booking: {
                        kitId: kit._id,
                        clientId: req.user._id,
                        clientName: kit.clientName || req.user.name,
                        clientEmail: kit.clientEmail || req.user.email,
                        bookedAt: new Date()
                    }
                },
                $inc: { version: 1 }
            },
            { new: true }
        );

        if (!slot) {
            return res.status(409).json({
                success: false,
                error: 'Este horario ya no está disponible. Por favor elige otro.'
            });
        }

        // Actualizar el WelcomeKit
        kit.interview = {
            slotId: slot._id,
            scheduledAt: slot.startTime
        };
        kit.overallStatus = 'entrevista_agendada';
        await kit.save();

        // Formatear fecha para el email
        const interviewDate = _formatDate(slot.startTime, timezone);
        const interviewTime = _formatTime(slot.startTime, timezone);
        const timezoneLabel = _getTimezoneLabel(timezone);

        // Enviar email de confirmación
        const adminData = await _getAdminEmailData();
        const emailHtml = generateInterviewConfirmationEmail({
            clientName: kit.clientName || req.user.name,
            clientEmail: kit.clientEmail || req.user.email,
            interviewDate,
            interviewTime,
            interviewTimezone: timezoneLabel,
            meetingLink: slot.meetingLink,
            staffName: adminData.adminName || slot.staffName,
            ...adminData
        });

        await EmailService.sendSafe({
            to: kit.clientEmail || req.user.email,
            subject: '📅 Entrevista de Bienvenida Confirmada — PianoLink',
            html: emailHtml
        });

        console.log(`[Interview] ✅ Entrevista agendada: Kit ${kitId} → Slot ${slotId} → ${interviewDate} ${interviewTime}`);

        res.json({
            success: true,
            message: 'Entrevista agendada exitosamente',
            interview: {
                date: interviewDate,
                time: interviewTime,
                timezone,
                meetingLink: slot.meetingLink,
                staffName: slot.staffName
            }
        });
    } catch (error) {
        console.error('[Interview] Error agendando entrevista:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


/**
 * DELETE /api/welcome-kit/v2/interview-slots/:slotId
 * Admin elimina un slot disponible.
 */
router.delete('/v2/interview-slots/:slotId', protect, adminOnly, async (req, res) => {
    try {
        const slot = await OnboardingSlot.findById(req.params.slotId);
        if (!slot) {
            return res.status(404).json({ success: false, error: 'Slot no encontrado' });
        }
        if (slot.status === 'booked') {
            return res.status(400).json({ success: false, error: 'No se puede eliminar un slot ya reservado' });
        }

        await OnboardingSlot.deleteOne({ _id: slot._id });
        res.json({ success: true, message: 'Slot eliminado' });
    } catch (error) {
        console.error('[Interview] Error eliminando slot:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


/**
 * POST /api/welcome-kit/v2/interview-slots/:slotId/complete
 * Admin marca una entrevista o setup como completada.
 */
router.post('/v2/interview-slots/:slotId/complete', protect, adminOnly, async (req, res) => {
    try {
        const { notes } = req.body;
        const slot = await OnboardingSlot.findById(req.params.slotId);
        if (!slot) {
            return res.status(404).json({ success: false, error: 'Slot no encontrado' });
        }
        if (slot.status !== 'booked') {
            return res.status(400).json({ success: false, error: 'Solo se pueden completar slots reservados' });
        }

        // Marcar slot como completado
        slot.status = 'completed';
        await slot.save();

        // Actualizar kit si existe
        if (slot.booking?.kitId) {
            const kit = await WelcomeKit.findById(slot.booking.kitId);
            if (kit) {
                if (slot.purpose === 'setup') {
                    // Completar setup → avanzar a trial_available
                    kit.setupSession.status = 'completed';
                    kit.setupSession.completedAt = new Date();
                    if (notes) kit.setupSession.technicianNotes = notes;
                    kit.overallStatus = 'trial_available';
                    await kit.save();

                    // Enviar email invitando a elegir profesor para clase de prueba
                    const adminData = await _getAdminEmailData();
                    try {
                        await WelcomeKitEmailService.sendTrialClassInvitation({
                            to: kit.clientEmail || slot.booking.clientEmail,
                            clientName: kit.clientName || slot.booking.clientName,
                            adminName: adminData.adminName
                        });
                        console.log(`[Setup] ✅ Email de clase de prueba enviado a ${kit.clientEmail}`);
                    } catch (emailErr) {
                        console.error('[Setup] Error enviando email trial:', emailErr.message);
                    }

                    console.log(`[Setup] ✅ Setup completado para kit ${kit._id}, avanzando a trial_available`);
                } else {
                    // Completar entrevista
                    kit.interview.completedAt = new Date();
                    if (notes) kit.interview.notes = notes;
                }
                await kit.save();
            }
        }

        const label = slot.purpose === 'setup' ? 'Setup' : 'Entrevista';
        res.json({ success: true, message: `${label} marcada como completada` });
    } catch (error) {
        console.error('[Onboarding] Error completando slot:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


/**
 * POST /api/welcome-kit/v2/:id/schedule-setup
 * Cliente agenda su sesión de setup seleccionando un slot del calendario compartido.
 * Reutiliza los mismos slots de entrevista (misma persona hace el onboarding completo).
 * Body: { slotId: "...", timezone: "America/Santiago" }
 */
router.post('/v2/:id/schedule-setup', protect, async (req, res) => {
    try {
        const kitId = req.params.id;
        const { slotId, timezone = 'America/Santiago' } = req.body;

        if (!slotId) {
            return res.status(400).json({ success: false, error: 'Debes seleccionar un horario' });
        }

        const kit = await WelcomeKit.findById(kitId);
        if (!kit) {
            return res.status(404).json({ success: false, error: 'Kit no encontrado' });
        }

        // Verificar propiedad
        const isOwner = kit.clientId && kit.clientId.toString() === req.user._id.toString();
        const isEmailMatch = kit.clientEmail === req.user.email;
        if (!isOwner && !isEmailMatch) {
            return res.status(403).json({ success: false, error: 'No tienes permiso para este kit' });
        }

        // Solo se puede agendar setup desde setup_pending
        if (kit.overallStatus !== 'setup_pending') {
            return res.status(400).json({
                success: false,
                error: `No se puede agendar setup en estado: ${kit.overallStatus}`
            });
        }

        // Reservar el slot atómicamente — toma un slot de interview available
        // y lo convierte en un slot de setup booked
        const slot = await OnboardingSlot.findOneAndUpdate(
            {
                _id: slotId,
                purpose: 'interview',
                status: 'available'
            },
            {
                $set: {
                    status: 'booked',
                    purpose: 'setup', // Reclasificar como setup al reservar
                    booking: {
                        kitId: kit._id,
                        clientId: req.user._id,
                        clientName: kit.clientName || req.user.name,
                        clientEmail: kit.clientEmail || req.user.email,
                        bookedAt: new Date()
                    }
                },
                $inc: { version: 1 }
            },
            { new: true }
        );

        if (!slot) {
            return res.status(409).json({
                success: false,
                error: 'Este horario ya no está disponible. Por favor elige otro.'
            });
        }

        // Actualizar el WelcomeKit
        kit.setupSession.status = 'scheduled';
        kit.setupSession.scheduledAt = slot.startTime;
        kit.overallStatus = 'setup_scheduled';
        await kit.save();

        // Formatear fecha para el email
        const setupDate = _formatDate(slot.startTime, timezone);
        const setupTime = _formatTime(slot.startTime, timezone);
        const timezoneLabel = _getTimezoneLabel(timezone);

        // Enviar email de confirmación
        const adminData = await _getAdminEmailData();
        const emailHtml = generateInterviewConfirmationEmail({
            clientName: kit.clientName || req.user.name,
            clientEmail: kit.clientEmail || req.user.email,
            interviewDate: setupDate,
            interviewTime: setupTime,
            interviewTimezone: timezoneLabel,
            meetingLink: slot.meetingLink,
            staffName: adminData.adminName || slot.staffName,
            isSetup: true,
            ...adminData
        });

        await EmailService.sendSafe({
            to: kit.clientEmail || req.user.email,
            subject: '⚙️ Sesión de Setup Confirmada — PianoLink',
            html: emailHtml
        });

        console.log(`[Setup] ✅ Setup agendado: Kit ${kitId} → Slot ${slotId} → ${setupDate} ${setupTime}`);

        res.json({
            success: true,
            message: 'Setup agendado exitosamente',
            setup: {
                date: setupDate,
                time: setupTime,
                timezone,
                meetingLink: slot.meetingLink,
                staffName: slot.staffName
            }
        });
    } catch (error) {
        console.error('[Setup] Error agendando setup:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// ==================== HELPERS PARA FORMATO DE FECHAS ====================

/**
 * Formatea fecha en español usando moment-timezone. Ej: "Lunes 10 de Febrero, 2026"
 */
function _formatDate(date, timezone) {
    try {
        // Usar moment-timezone para conversión confiable
        const m = moment(date).tz(timezone || 'America/Santiago');
        m.locale('es');
        // Capitalizar primera letra del día
        let formatted = m.format('dddd D [de] MMMM, YYYY');
        return formatted.charAt(0).toUpperCase() + formatted.slice(1);
    } catch (err) {
        console.error('[_formatDate] Error:', err.message);
        return new Date(date).toISOString().split('T')[0];
    }
}

/**
 * Formatea hora usando moment-timezone. Ej: "10:00 AM"
 */
function _formatTime(date, timezone) {
    try {
        // Usar moment-timezone para conversión confiable
        const m = moment(date).tz(timezone || 'America/Santiago');
        return m.format('h:mm A');
    } catch (err) {
        console.error('[_formatTime] Error:', err.message);
        return new Date(date).toISOString().split('T')[1].substring(0, 5);
    }
}

/**
 * Convierte timezone IANA a label legible. Ej: "America/Santiago" → "Chile (GMT-3)"
 */
function _getTimezoneLabel(timezone) {
    const labels = {
        'America/Santiago': 'Chile',
        'America/Lima': 'Perú',
        'America/Bogota': 'Colombia',
        'America/Mexico_City': 'México',
        'America/Buenos_Aires': 'Argentina',
        'America/New_York': 'Nueva York',
        'America/Los_Angeles': 'Los Ángeles',
        'Europe/Madrid': 'España',
        'UTC': 'UTC'
    };
    
    try {
        const m = moment().tz(timezone || 'America/Santiago');
        const offset = m.format('Z'); // Ej: "-03:00"
        const offsetShort = offset.replace(':00', '').replace('+0', '+').replace('-0', '-'); // "-3"
        const label = labels[timezone] || timezone.split('/').pop().replace('_', ' ');
        return `${label} (GMT${offsetShort})`;
    } catch {
        return timezone || 'Hora local';
    }
}

// ==================== PERFIL ADMINISTRADOR ====================

/**
 * GET /api/welcome-kit/v2/admin-profile
 * Obtener perfil del administrador
 */
router.get('/v2/admin-profile', protect, adminOnly, async (req, res) => {
    try {
        const profile = await GlobalConfig.getAdminProfile();
        res.json({ success: true, profile });
    } catch (error) {
        console.error('[AdminProfile] Error obteniendo perfil:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/welcome-kit/v2/admin-profile
 * Actualizar perfil del administrador
 */
router.put('/v2/admin-profile', protect, adminOnly, async (req, res) => {
    try {
        const { name, whatsapp, email, role, timezone, meetingLink, socialMedia, businessHours, signature } = req.body;

        let config = await GlobalConfig.findOne({ isDefault: true });
        if (!config) {
            config = new GlobalConfig({ isDefault: true });
        }

        // Actualizar solo los campos proporcionados
        if (!config.adminProfile) config.adminProfile = {};
        if (name !== undefined) config.adminProfile.name = name;
        if (whatsapp !== undefined) config.adminProfile.whatsapp = whatsapp;
        if (email !== undefined) config.adminProfile.email = email;
        if (role !== undefined) config.adminProfile.role = role;
        if (timezone !== undefined) config.adminProfile.timezone = timezone;
        if (meetingLink !== undefined) config.adminProfile.meetingLink = meetingLink;
        if (businessHours !== undefined) config.adminProfile.businessHours = businessHours;
        if (signature !== undefined) config.adminProfile.signature = signature;
        if (socialMedia) {
            config.adminProfile.socialMedia = config.adminProfile.socialMedia || {};
            if (socialMedia.instagram !== undefined) config.adminProfile.socialMedia.instagram = socialMedia.instagram;
            if (socialMedia.youtube !== undefined) config.adminProfile.socialMedia.youtube = socialMedia.youtube;
            if (socialMedia.tiktok !== undefined) config.adminProfile.socialMedia.tiktok = socialMedia.tiktok;
        }

        config.markModified('adminProfile');
        await config.save();

        console.log(`[AdminProfile] ✅ Perfil actualizado por ${req.user.name}`);
        res.json({ success: true, profile: config.adminProfile });
    } catch (error) {
        console.error('[AdminProfile] Error actualizando perfil:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


module.exports = router;

