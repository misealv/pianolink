class AliExpressService {
    constructor() {
        this.affiliateTrackingId = process.env.ALIEXPRESS_AFFILIATE_ID || '';
        
        // Tiempos de envío estimados por país (días)
        this.deliveryTimes = {
            // Latinoamérica
            'CL': { standard: 25, aliexpress_standard: 20, cainiao: 15 },
            'AR': { standard: 35, aliexpress_standard: 25, cainiao: 20 },
            'MX': { standard: 30, aliexpress_standard: 20, cainiao: 15 },
            'CO': { standard: 30, aliexpress_standard: 22, cainiao: 18 },
            'PE': { standard: 30, aliexpress_standard: 22, cainiao: 18 },
            'BR': { standard: 40, aliexpress_standard: 30, cainiao: 25 },
            'UY': { standard: 30, aliexpress_standard: 22, cainiao: 18 },
            'EC': { standard: 30, aliexpress_standard: 22, cainiao: 18 },
            // Europa
            'ES': { standard: 20, aliexpress_standard: 12, cainiao: 10 },
            'PT': { standard: 20, aliexpress_standard: 12, cainiao: 10 },
            'FR': { standard: 20, aliexpress_standard: 12, cainiao: 10 },
            'DE': { standard: 20, aliexpress_standard: 12, cainiao: 10 },
            'IT': { standard: 20, aliexpress_standard: 12, cainiao: 10 },
            // Norteamérica
            'US': { standard: 20, aliexpress_standard: 12, cainiao: 10 },
            'CA': { standard: 25, aliexpress_standard: 15, cainiao: 12 },
            // Default
            'DEFAULT': { standard: 35, aliexpress_standard: 25, cainiao: 20 }
        };
    }

    addAffiliateTracking(productUrl) {
        if (!this.affiliateTrackingId) return productUrl;
        try {
            const url = new URL(productUrl);
            url.searchParams.set('aff_trace_key', this.affiliateTrackingId);
            return url.toString();
        } catch (e) { return productUrl; }
    }

    extractProductId(url) {
        try {
            const match = url.match(/item\/(\d+)/);
            return match ? match[1] : null;
        } catch (e) { return null; }
    }

    calculatePrice(price, margin = 40) {
        return Math.round(price * (1 + margin / 100) * 100) / 100;
    }

    isAliExpressUrl(url) {
        return url && url.includes('aliexpress');
    }

    /**
     * Genera URL de tracking universal usando 17Track
     * Funciona con todos los carriers de AliExpress: China Post, Cainiao, Yanwen, etc.
     */
    generateTrackingUrl(trackingNumber, carrier = null) {
        if (!trackingNumber) return null;
        
        // 17Track es universal y gratuito, funciona con todos los carriers chinos
        return `https://t.17track.net/en#nums=${trackingNumber}`;
    }

    /**
     * Detecta el tipo de carrier por el formato del tracking number
     */
    detectCarrier(trackingNumber) {
        if (!trackingNumber) return 'aliexpress';
        
        const tn = trackingNumber.toUpperCase();
        
        // Cainiao (empieza con LP, LX, o tiene formato específico)
        if (tn.startsWith('LP') || tn.startsWith('LX') || tn.startsWith('CAINIAO')) {
            return 'cainiao';
        }
        // China Post (empieza con R, L, C seguido de letras y números)
        if (/^[RLC][A-Z]\d{9}[A-Z]{2}$/.test(tn)) {
            return 'china_post';
        }
        // Yanwen
        if (tn.startsWith('YT') || tn.startsWith('YW')) {
            return 'yanwen';
        }
        // SunYou (SYUS, SYB)
        if (tn.startsWith('SY')) {
            return 'sunyou';
        }
        // ePacket (empieza con L o U)
        if (/^[LU][A-Z]\d{9}CN$/.test(tn)) {
            return 'epacket';
        }
        
        return 'aliexpress_standard';
    }

    /**
     * Calcula fecha estimada de entrega
     * @param {string} countryCode - Código ISO del país (CL, AR, ES, etc.)
     * @param {string} trackingNumber - Número de tracking para detectar carrier
     * @param {Date} shippedDate - Fecha de envío (default: hoy)
     */
    calculateEstimatedDelivery(countryCode, trackingNumber = null, shippedDate = new Date()) {
        const country = countryCode?.toUpperCase() || 'DEFAULT';
        const times = this.deliveryTimes[country] || this.deliveryTimes['DEFAULT'];
        
        // Detectar tipo de envío por tracking number
        const carrier = this.detectCarrier(trackingNumber);
        
        let days;
        if (carrier === 'cainiao') {
            days = times.cainiao;
        } else if (carrier === 'epacket' || carrier === 'aliexpress_standard') {
            days = times.aliexpress_standard;
        } else {
            days = times.standard;
        }
        
        // Calcular fecha
        const estimated = new Date(shippedDate);
        estimated.setDate(estimated.getDate() + days);
        
        return {
            date: estimated,
            days: days,
            carrier: carrier,
            range: `${days - 5} - ${days + 5} días`
        };
    }

    generateDSersCSV(orders) {
        let csv = 'Order,Name,Email,Phone,Address,City,State,Zip,Country,ProductURL,Qty\n';
        orders.forEach(o => {
            csv += [o._id,o.customerName||'',o.email||'',o.phone||'',o.address||'',o.city||'',o.state||'',o.zip||'',o.country||'',o.productUrl||'',o.qty||1].join(',') + '\n';
        });
        return csv;
    }

    /**
     * Parsea CSV de DSers con trackings para importar
     * Formato esperado: OrderID,TrackingNumber
     */
    parseTrackingCSV(csvContent) {
        const lines = csvContent.trim().split('\n');
        const results = [];
        
        // Saltar header si existe
        const startIndex = lines[0].toLowerCase().includes('order') ? 1 : 0;
        
        for (let i = startIndex; i < lines.length; i++) {
            const parts = lines[i].split(',').map(p => p.trim().replace(/"/g, ''));
            if (parts.length >= 2 && parts[0] && parts[1]) {
                results.push({
                    orderId: parts[0],
                    trackingNumber: parts[1],
                    carrier: this.detectCarrier(parts[1]),
                    trackingUrl: this.generateTrackingUrl(parts[1])
                });
            }
        }
        
        return results;
    }
}

module.exports = new AliExpressService();
