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
 * Acepta kitType: 'full' (con productos) o 'setup_only' (solo servicio)
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
            kitType = 'setup_only',  // 'full' (con productos) o 'setup_only' (solo servicio)
            // Tipo de estudiante
            studentType = 'self', // 'self' o 'child'
            // Productos opcionales
            productIds = [], // Array de IDs de productos
            // Beneficiarios (puede ser múltiple si es apoderado)
            beneficiaries = [], // Array de {name, age}
            // Backward compatibility
            beneficiaryName,
            beneficiaryAge
        } = req.body;
        
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
            kitType: kitTypeValue,
            // Productos seleccionados
            products: selectedProducts.map(p => ({
                productId: p._id,
                name: p.name,
                priceAtPurchase: p.pricing?.find(pr => pr.regionCode === country)?.price || p.defaultPrice || 0
            })),
            payment: {
                provider: 'paypal',
                externalOrderId: order.id,
                amount: totalPrice,
                currency: currency
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
        const payerEmail = captureData.payer?.email_address || checkoutData.email;
        const payerName = captureData.payer?.name?.given_name || checkoutData.name;
        const studentType = checkoutData.studentType || 'self'; // 'self' o 'child'
        
        // Crear o actualizar usuario
        let user = await User.findOne({ email: payerEmail?.toLowerCase() });
        let student = null;
        
        if (!user && payerEmail) {
            // Generar contraseña temporal
            const tempPassword = Math.random().toString(36).slice(-8);
            
            if (studentType === 'self') {
                // El comprador es el estudiante
                user = await User.create({
                    name: payerName || 'Estudiante',
                    email: payerEmail.toLowerCase(),
                    password: tempPassword,
                    whatsapp: checkoutData.whatsapp || '',
                    country: welcomeKit.shipping?.address?.country || 'N/A',
                    role: 'student',
                    studentData: {
                        source: 'platform',
                        level: 'beginner',
                        age: checkoutData.beneficiaryAge || null
                    },
                    kitPurchased: true,
                    kitPurchaseDate: new Date(),
                    paypalOrderId: orderId
                });
                
                student = user; // El usuario es el estudiante
                console.log(`[WelcomeKit] 🎹 Estudiante creado: ${user.email}`);
                
            } else {
                // El comprador es un apoderado (guardian)
                user = await User.create({
                    name: payerName || 'Apoderado',
                    email: payerEmail.toLowerCase(),
                    password: tempPassword,
                    whatsapp: checkoutData.whatsapp || '',
                    country: welcomeKit.shipping?.address?.country || 'N/A',
                    role: 'client',
                    clientData: {
                        accountType: 'guardian',
                        managedStudents: []
                    },
                    kitPurchased: true,
                    kitPurchaseDate: new Date(),
                    paypalOrderId: orderId
                });
                
                console.log(`[WelcomeKit] 👤 Apoderado creado: ${user.email}`);
                
                // Crear cuentas para todos los beneficiarios (hijos)
                const allBeneficiaries = checkoutData.beneficiaries || 
                    (checkoutData.beneficiaryName ? [{ name: checkoutData.beneficiaryName, age: checkoutData.beneficiaryAge }] : []);
                
                const createdStudents = [];
                for (let i = 0; i < allBeneficiaries.length; i++) {
                    const beneficiary = allBeneficiaries[i];
                    if (!beneficiary.name) continue;
                    
                    const studentPassword = Math.random().toString(36).slice(-8);
                    const studentEmail = `student_${user._id.toString().slice(-6)}_${Date.now()}_${i}@pianolink.student`;
                    
                    const newStudent = await User.create({
                        name: beneficiary.name,
                        email: studentEmail,
                        password: studentPassword,
                        role: 'student',
                        country: user.country,
                        studentData: {
                            source: 'platform',
                            accountHolder: user._id,
                            age: beneficiary.age || null,
                            level: 'beginner'
                        }
                    });
                    
                    createdStudents.push(newStudent);
                    user.clientData.managedStudents.push(newStudent._id);
                    console.log(`[WelcomeKit] 👶 Estudiante creado: ${beneficiary.name}`);
                }
                
                await user.save();
                
                // Guardar el primer estudiante como beneficiario principal
                if (createdStudents.length > 0) {
                    student = createdStudents[0];
                    welcomeKit.beneficiaryId = student._id;
                    // Guardar todos los IDs de estudiantes
                    welcomeKit.set('_allBeneficiaryIds', createdStudents.map(s => s._id), { strict: false });
                }
            }
            
            // TODO: Enviar email con credenciales al usuario
            
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
                
                const createdStudents = [];
                for (let i = 0; i < allBeneficiaries.length; i++) {
                    const beneficiary = allBeneficiaries[i];
                    if (!beneficiary.name) continue;
                    
                    const studentPassword = Math.random().toString(36).slice(-8);
                    const studentEmail = `student_${user._id.toString().slice(-6)}_${Date.now()}_${i}@pianolink.student`;
                    
                    const newStudent = await User.create({
                        name: beneficiary.name,
                        email: studentEmail,
                        password: studentPassword,
                        role: 'student',
                        country: user.country,
                        studentData: {
                            source: 'platform',
                            accountHolder: user._id,
                            age: beneficiary.age || null,
                            level: 'beginner'
                        }
                    });
                    
                    createdStudents.push(newStudent);
                    user.clientData.managedStudents.push(newStudent._id);
                    console.log(`[WelcomeKit] 👶 Estudiante creado para usuario existente: ${beneficiary.name}`);
                }
                
                if (createdStudents.length > 0) {
                    student = createdStudents[0];
                    welcomeKit.beneficiaryId = student._id;
                    welcomeKit.set('_allBeneficiaryIds', createdStudents.map(s => s._id), { strict: false });
                }
            }
            
            await user.save();
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
        
        res.json({
            success: true,
            welcomeKit: {
                id: welcomeKit._id,
                status: welcomeKit.overallStatus,
                kitType: welcomeKit.kitType,
                products: welcomeKit.products || [],
                shipping: hasPhysicalProducts ? welcomeKit.shipping?.address : null
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
            studentType: studentType,
            nextSteps
        });
        
    } catch (error) {
        console.error('[WelcomeKit] Error verificando pago:', error);
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
            .populate('clientId', 'name email')
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();
        
        // Mapear a formato simplificado
        const mappedOrders = orders.map(order => ({
            _id: order._id,
            customerName: order.clientId?.name || order.clientName || 'Cliente',
            email: order.clientId?.email || order.clientEmail || '',
            country: order.shipping?.address?.country || order.country || '',
            total: order.payment?.total || order.total || 0,
            shippingStatus: order.shipping?.status || order.overallStatus || 'pending',
            paymentStatus: order.payment?.status || 'pending',
            trackingNumber: order.shipping?.trackingNumber || null,
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
        
        await EmailService.sendEmail({
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
        
        await EmailService.sendEmail({
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
                
                <p>¿Preguntas? Responde este email o escríbenos por WhatsApp.</p>
                
                <p>🎹 El equipo de PianoLink</p>
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

module.exports = router;

