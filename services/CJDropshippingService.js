/**
 * services/CJDropshippingService.js
 * Integración con CJDropshipping para fulfillment de cables MIDI
 * 
 * Documentación API: https://developers.cjdropshipping.com/en/api/api2/api/shopping.html
 * 
 * Configuración:
 * - API Key: Variable de entorno CJ_API_KEY (seguro)
 * - SKUs y preferencias: MongoDB CJConfig (editable desde admin)
 * 
 * Flujo:
 * 1. getAccessToken() - Autenticación con API Key
 * 2. createOrder() - Crear orden de envío
 * 3. confirmOrder() - Confirmar y pagar con balance
 * 4. getOrderStatus() - Consultar estado y tracking
 */

const fetch = require('node-fetch');
const CJConfig = require('../models/CJConfig');

class CJDropshippingService {
    constructor() {
        this.baseUrl = 'https://developers.cjdropshipping.com/api2.0/v1';
        this.accessToken = null;
        this.tokenExpiry = null;
        this.refreshToken = null;
        this._config = null;
        this._configExpiry = null;
    }

    // ==================== CONFIGURACIÓN ====================

    /**
     * Obtener configuración de CJ desde DB (cache de 5 minutos)
     */
    async getConfig() {
        // Cache por 5 minutos
        if (this._config && this._configExpiry && new Date() < this._configExpiry) {
            return this._config;
        }

        this._config = await CJConfig.getConfig();
        this._configExpiry = new Date(Date.now() + 5 * 60 * 1000);
        return this._config;
    }

    /**
     * Verificar si el servicio está habilitado y configurado
     */
    async isEnabled() {
        const config = await this.getConfig();
        const hasApiKey = !!process.env.CJ_API_KEY;
        return config.enabled && hasApiKey;
    }

    /**
     * Invalidar cache de configuración
     */
    invalidateConfigCache() {
        this._config = null;
        this._configExpiry = null;
    }

    // ==================== AUTENTICACIÓN ====================
    
    /**
     * Obtener API Key desde variable de entorno (más seguro)
     */
    getApiKey() {
        return process.env.CJ_API_KEY;
    }

    /**
     * Obtener Access Token (válido 15 días)
     * Solo se puede llamar cada 5 minutos
     */
    async getAccessToken() {
        // Si tenemos token válido, usarlo
        if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
            return this.accessToken;
        }

        // Intentar refresh token primero
        if (this.refreshToken) {
            const refreshed = await this.refreshAccessToken();
            if (refreshed) return this.accessToken;
        }

        // Obtener nuevo token
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error('CJ_API_KEY no configurada en variables de entorno.');
        }

        const response = await fetch(`${this.baseUrl}/authentication/getAccessToken`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey })
        });

        const data = await response.json();

        if (!data.result || data.code !== 200) {
            console.error('[CJDropshipping] Error obteniendo token:', data);
            throw new Error(data.message || 'Error de autenticación con CJ');
        }

        this.accessToken = data.data.accessToken;
        this.refreshToken = data.data.refreshToken;
        this.tokenExpiry = new Date(data.data.accessTokenExpiryDate);

        console.log('[CJDropshipping] ✅ Token obtenido, expira:', this.tokenExpiry);
        return this.accessToken;
    }

    /**
     * Refrescar Access Token usando Refresh Token
     */
    async refreshAccessToken() {
        if (!this.refreshToken) return false;

        try {
            const response = await fetch(`${this.baseUrl}/authentication/refreshAccessToken`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: this.refreshToken })
            });

            const data = await response.json();

            if (data.result && data.code === 200) {
                this.accessToken = data.data.accessToken;
                this.refreshToken = data.data.refreshToken;
                this.tokenExpiry = new Date(data.data.accessTokenExpiryDate);
                console.log('[CJDropshipping] ✅ Token refrescado');
                return true;
            }
        } catch (error) {
            console.error('[CJDropshipping] Error refrescando token:', error.message);
        }
        
        return false;
    }

    // ==================== PRODUCTOS ====================

    /**
     * Obtener SKU de cable desde configuración en DB
     */
    async getCableSku(cableType) {
        const config = await this.getConfig();
        const sku = config.getSku(cableType);
        
        if (!sku) {
            throw new Error(`SKU no configurado para tipo de cable: ${cableType}. Configure en Admin > Welcome Kits > CJDropshipping.`);
        }
        
        return sku;
    }

    /**
     * Buscar producto por SKU en CJ
     */
    async searchProduct(sku) {
        const token = await this.getAccessToken();

        const response = await fetch(`${this.baseUrl}/product/list?pageNum=1&pageSize=10&productSku=${encodeURIComponent(sku)}`, {
            headers: { 'CJ-Access-Token': token }
        });

        const data = await response.json();
        
        if (data.result && data.data?.list?.length > 0) {
            return data.data.list[0];
        }
        
        return null;
    }

    /**
     * Obtener detalle de producto por PID o SKU
     * Incluye variantes y precios
     */
    async getProductDetail(pid) {
        const token = await this.getAccessToken();

        const response = await fetch(`${this.baseUrl}/product/query?pid=${encodeURIComponent(pid)}`, {
            headers: { 'CJ-Access-Token': token }
        });

        const data = await response.json();
        
        if (data.result && data.data) {
            return data.data;
        }
        
        return null;
    }

    /**
     * Calcular costo de envío para un producto a un destino
     * 
     * @param {string} sku - SKU del producto
     * @param {number} quantity - Cantidad
     * @param {string} countryCode - Código de país destino (2 letras)
     * @returns {Object} - { shippingCost, productCost, totalCost, estimatedDays, logisticName }
     */
    async calculateShipping(sku, quantity = 1, countryCode) {
        const token = await this.getAccessToken();
        const config = await this.getConfig();
        
        // Normalizar país
        const normalizedCountry = this.normalizeCountryCode(countryCode);
        
        // Obtener warehouse preferido
        const warehouseCountry = config.getWarehouseForCountry(normalizedCountry);
        
        const requestBody = {
            startCountryCode: warehouseCountry,
            endCountryCode: normalizedCountry,
            products: [{
                quantity: quantity,
                sku: sku
            }]
        };

        const response = await fetch(`${this.baseUrl}/logistic/freightCalculate`, {
            method: 'POST',
            headers: {
                'CJ-Access-Token': token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        
        if (!data.result || !data.data) {
            console.error('[CJDropshipping] Error calculando envío:', data);
            return null;
        }

        // Buscar la opción de envío preferida
        const preferredLogistic = config.getLogisticsForCountry(normalizedCountry);
        const options = data.data || [];
        
        // Buscar la opción preferida o la más barata
        let selectedOption = options.find(opt => 
            opt.logisticName?.toLowerCase().includes(preferredLogistic.toLowerCase())
        );
        
        if (!selectedOption && options.length > 0) {
            // Si no encuentra la preferida, usar la más barata
            selectedOption = options.reduce((min, opt) => 
                (opt.logisticPrice < min.logisticPrice) ? opt : min
            , options[0]);
        }

        if (!selectedOption) {
            return null;
        }

        return {
            shippingCost: parseFloat(selectedOption.logisticPrice) || 0,
            logisticName: selectedOption.logisticName,
            estimatedDays: selectedOption.logisticAging || '15-30 días',
            warehouseCountry: warehouseCountry
        };
    }

    /**
     * Obtener precio completo de un producto (costo + envío + margen)
     * 
     * @param {string} sku - SKU del producto en CJ
     * @param {string} countryCode - País destino
     * @param {number} marginPercent - Margen de ganancia (default 30%)
     * @returns {Object} - Desglose completo de precios
     */
    async getProductPricing(sku, countryCode, marginPercent = 30) {
        try {
            // Buscar producto
            const product = await this.searchProduct(sku);
            if (!product) {
                throw new Error(`Producto no encontrado con SKU: ${sku}`);
            }

            // Obtener costo del producto
            const productCost = parseFloat(product.sellPrice) || 0;

            // Calcular envío
            const shippingInfo = await this.calculateShipping(sku, 1, countryCode);
            const shippingCost = shippingInfo?.shippingCost || 0;

            // Costo total (producto + envío)
            const totalCost = productCost + shippingCost;

            // Calcular precio de venta con margen
            const margin = totalCost * (marginPercent / 100);
            const salePrice = Math.ceil(totalCost + margin); // Redondear hacia arriba

            return {
                sku: sku,
                productName: product.productNameEn || product.productName,
                productImage: product.productImage,
                countryCode: countryCode,
                
                // Costos
                productCost: productCost,
                shippingCost: shippingCost,
                totalCost: totalCost,
                
                // Margen
                marginPercent: marginPercent,
                marginAmount: margin,
                
                // Precio de venta sugerido
                salePrice: salePrice,
                
                // Info de envío
                estimatedDays: shippingInfo?.estimatedDays || '15-30 días',
                logisticName: shippingInfo?.logisticName || 'Standard',
                warehouseCountry: shippingInfo?.warehouseCountry || 'CN',
                
                // Timestamp para cache
                calculatedAt: new Date().toISOString()
            };
        } catch (error) {
            console.error('[CJDropshipping] Error obteniendo pricing:', error);
            throw error;
        }
    }

    /**
     * Obtener precios de múltiples productos
     */
    async getBulkPricing(products, countryCode, marginPercent = 30) {
        const results = [];
        
        for (const item of products) {
            try {
                const pricing = await this.getProductPricing(item.sku, countryCode, marginPercent);
                results.push({
                    ...pricing,
                    quantity: item.quantity || 1,
                    lineTotal: pricing.salePrice * (item.quantity || 1)
                });
            } catch (error) {
                results.push({
                    sku: item.sku,
                    error: error.message,
                    quantity: item.quantity || 1
                });
            }
        }
        
        return {
            items: results,
            subtotal: results.reduce((sum, item) => sum + (item.lineTotal || 0), 0),
            hasErrors: results.some(r => r.error)
        };
    }

    // ==================== ÓRDENES ====================

    /**
     * Crear orden de envío en CJDropshipping
     * 
     * @param {Object} welcomeKit - Documento WelcomeKit de MongoDB
     * @returns {Object} - Datos de la orden creada
     */
    async createOrder(welcomeKit) {
        // Verificar que el servicio esté habilitado
        if (!await this.isEnabled()) {
            throw new Error('CJDropshipping no está habilitado. Actívelo en Admin > Welcome Kits > CJDropshipping.');
        }

        const token = await this.getAccessToken();
        const config = await this.getConfig();

        // Obtener SKU del cable desde config
        const cableSku = await this.getCableSku(welcomeKit.cable?.type);

        // Preparar dirección
        const address = welcomeKit.shipping?.address || {};
        
        // Mapear código de país de 2 letras
        const countryCode = this.normalizeCountryCode(address.country);

        // Determinar logística y warehouse desde config
        const logisticName = config.getLogisticsForCountry(countryCode);
        const fromCountryCode = config.getWarehouseForCountry(countryCode);

        const orderData = {
            orderNumber: `PL-WK-${welcomeKit._id}`,
            shippingZip: address.postalCode || '',
            shippingCountryCode: countryCode,
            shippingCountry: this.getCountryName(countryCode),
            shippingProvince: address.state || address.city || '',
            shippingCity: address.city || '',
            shippingPhone: welcomeKit._checkoutData?.whatsapp || '',
            shippingCustomerName: welcomeKit._checkoutData?.name || 'Cliente PianoLink',
            shippingAddress: address.street || '',
            email: welcomeKit._checkoutData?.email || '',
            remark: `Welcome Kit PianoLink - Cable ${welcomeKit.cable?.type} - Teclado: ${welcomeKit.cable?.keyboardModel || 'N/A'}`,
            logisticName: logisticName,
            fromCountryCode: fromCountryCode,
            platform: 'Api',
            payType: 2, // Balance payment (auto-pay)
            products: [{
                sku: cableSku,
                quantity: 1
            }]
        };

        console.log('[CJDropshipping] 📦 Creando orden:', orderData.orderNumber);

        const response = await fetch(`${this.baseUrl}/shopping/order/createOrderV2`, {
            method: 'POST',
            headers: {
                'CJ-Access-Token': token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(orderData)
        });

        const data = await response.json();

        if (!data.result || data.code !== 200) {
            console.error('[CJDropshipping] Error creando orden:', data);
            throw new Error(data.message || 'Error creando orden en CJ');
        }

        console.log('[CJDropshipping] ✅ Orden creada:', data.data.orderId);

        return {
            cjOrderId: data.data.orderId,
            orderNumber: data.data.orderNumber,
            shipmentOrderId: data.data.shipmentOrderId,
            productAmount: data.data.productAmount,
            postageAmount: data.data.postageAmount,
            orderAmount: data.data.orderAmount,
            orderStatus: data.data.orderStatus,
            cjPayUrl: data.data.cjPayUrl
        };
    }

    /**
     * Confirmar orden (solo si payType != 2)
     */
    async confirmOrder(cjOrderId) {
        const token = await this.getAccessToken();

        const response = await fetch(`${this.baseUrl}/shopping/order/confirmOrder`, {
            method: 'PATCH',
            headers: {
                'CJ-Access-Token': token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ orderId: cjOrderId })
        });

        const data = await response.json();

        if (!data.result) {
            console.error('[CJDropshipping] Error confirmando orden:', data);
            throw new Error(data.message || 'Error confirmando orden');
        }

        return data;
    }

    /**
     * Consultar estado de una orden
     */
    async getOrderStatus(cjOrderId) {
        const token = await this.getAccessToken();

        const response = await fetch(`${this.baseUrl}/shopping/order/getOrderDetail?orderId=${cjOrderId}`, {
            headers: { 'CJ-Access-Token': token }
        });

        const data = await response.json();

        if (!data.result) {
            throw new Error(data.message || 'Error consultando orden');
        }

        return {
            orderId: data.data.orderId,
            orderStatus: data.data.orderStatus, // CREATED, IN_CART, UNPAID, UNSHIPPED, SHIPPED, DELIVERED, CANCELLED
            trackNumber: data.data.trackNumber,
            trackingUrl: data.data.trackingUrl,
            logisticName: data.data.logisticName,
            createDate: data.data.createDate,
            paymentDate: data.data.paymentDate
        };
    }

    /**
     * Listar órdenes con filtros
     */
    async listOrders(options = {}) {
        const token = await this.getAccessToken();

        const params = new URLSearchParams({
            pageNum: options.pageNum || 1,
            pageSize: options.pageSize || 20,
            ...(options.status && { status: options.status })
        });

        const response = await fetch(`${this.baseUrl}/shopping/order/list?${params}`, {
            headers: { 'CJ-Access-Token': token }
        });

        const data = await response.json();

        if (!data.result) {
            throw new Error(data.message || 'Error listando órdenes');
        }

        return {
            total: data.data.total,
            orders: data.data.list
        };
    }

    /**
     * Consultar balance de cuenta CJ
     */
    async getBalance() {
        const token = await this.getAccessToken();

        const response = await fetch(`${this.baseUrl}/shopping/pay/getBalance`, {
            headers: { 'CJ-Access-Token': token }
        });

        const data = await response.json();

        if (!data.result) {
            throw new Error(data.message || 'Error consultando balance');
        }

        return {
            amount: data.data.amount,
            freezeAmount: data.data.freezeAmount,
            currency: 'USD'
        };
    }

    /**
     * Buscar productos en el catálogo de CJDropshipping
     * @param {Object} options - Opciones de búsqueda
     * @param {string} options.keyword - Palabra clave de búsqueda
     * @param {number} options.pageNum - Número de página (default: 1)
     * @param {number} options.pageSize - Tamaño de página (default: 20)
     * @param {string} options.categoryId - ID de categoría (opcional)
     * @returns {Promise<Object>} Lista de productos
     */
    async searchProducts(options = {}) {
        const token = await this.getAccessToken();

        // CJ requiere el formato exacto de parámetros
        const requestBody = {
            pageNum: options.pageNum || 1,
            pageSize: options.pageSize || 20
        };

        if (options.keyword) {
            requestBody.productNameEn = options.keyword;
        }
        if (options.categoryId) {
            requestBody.categoryId = options.categoryId;
        }

        console.log('[CJDropshipping] Buscando productos:', requestBody);

        const response = await fetch(`${this.baseUrl}/product/list`, {
            method: 'POST',
            headers: {
                'CJ-Access-Token': token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (!data.result || data.code !== 200) {
            console.error('[CJDropshipping] Error buscando productos:', data);
            throw new Error(data.message || 'Error buscando productos');
        }

        return {
            total: data.data?.total || 0,
            products: (data.data?.list || []).map(p => ({
                pid: p.pid,
                productNameEn: p.productNameEn,
                productNameZh: p.productNameZh,
                productSku: p.productSku,
                productImage: p.productImage,
                sellPrice: p.sellPrice,
                categoryId: p.categoryId,
                categoryName: p.categoryName,
                variants: p.variants || []
            }))
        };
    }

    /**
     * Obtener detalles completos de un producto
     * @param {string} pid - Product ID de CJDropshipping
     * @returns {Promise<Object>} Detalles del producto
     */
    async getProductDetails(pid) {
        const token = await this.getAccessToken();

        const response = await fetch(`${this.baseUrl}/product/query`, {
            method: 'POST',
            headers: {
                'CJ-Access-Token': token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ pid })
        });

        const data = await response.json();

        if (!data.result) {
            throw new Error(data.message || 'Error obteniendo detalles del producto');
        }

        return data.data;
    }

    // ==================== HELPERS ====================

    /**
     * Normalizar código de país a 2 letras
     */
    normalizeCountryCode(code) {
        if (!code) return 'US';
        
        const codeMap = {
            'CL': 'CL', 'CHILE': 'CL',
            'AR': 'AR', 'ARGENTINA': 'AR',
            'ES': 'ES', 'ESPAÑA': 'ES', 'SPAIN': 'ES',
            'MX': 'MX', 'MEXICO': 'MX', 'MÉXICO': 'MX',
            'US': 'US', 'USA': 'US', 'UNITED STATES': 'US',
            'PE': 'PE', 'PERU': 'PE', 'PERÚ': 'PE',
            'CO': 'CO', 'COLOMBIA': 'CO',
            'BR': 'BR', 'BRAZIL': 'BR', 'BRASIL': 'BR',
            'DEFAULT': 'US'
        };

        return codeMap[code.toUpperCase()] || code.substring(0, 2).toUpperCase();
    }

    /**
     * Obtener nombre de país
     */
    getCountryName(code) {
        const names = {
            'CL': 'Chile',
            'AR': 'Argentina',
            'ES': 'Spain',
            'MX': 'Mexico',
            'US': 'United States',
            'PE': 'Peru',
            'CO': 'Colombia',
            'BR': 'Brazil'
        };
        return names[code] || 'United States';
    }

    /**
     * Seleccionar logística según destino (fallback si no hay config)
     */
    selectLogistics(countryCode) {
        // Este método se usa como fallback
        // La configuración principal viene de CJConfig
        const logisticsMap = {
            'CL': 'CJPacket Ordinary',
            'AR': 'CJPacket Ordinary',
            'MX': 'CJPacket Ordinary',
            'US': 'USPS',
            'ES': 'PostNL',
            'PE': 'CJPacket Ordinary',
            'CO': 'CJPacket Ordinary',
            'BR': 'CJPacket Ordinary'
        };
        
        return logisticsMap[countryCode] || 'CJPacket Ordinary';
    }

    /**
     * Seleccionar almacén de origen según destino (fallback si no hay config)
     */
    selectWarehouseCountry(countryCode) {
        // Este método se usa como fallback
        // La configuración principal viene de CJConfig
        const warehouseMap = {
            'US': 'US',  // USA desde almacén USA
            'MX': 'US',  // México desde USA (más rápido)
            'CL': 'CN',  // Chile desde China
            'AR': 'CN',  // Argentina desde China
            'ES': 'CN',  // España desde China (o DE si hay stock)
            'PE': 'CN',
            'CO': 'CN',
            'BR': 'CN'
        };
        
        return warehouseMap[countryCode] || 'CN';
    }

    /**
     * Mapear estado de CJ a estado interno
     */
    mapOrderStatus(cjStatus) {
        const statusMap = {
            'CREATED': 'processing',
            'IN_CART': 'processing',
            'UNPAID': 'processing',
            'UNSHIPPED': 'processing',
            'SHIPPED': 'shipped',
            'DELIVERED': 'delivered',
            'CANCELLED': 'returned'
        };
        return statusMap[cjStatus] || 'processing';
    }
}

// Singleton
const cjDropshipping = new CJDropshippingService();

module.exports = cjDropshipping;
