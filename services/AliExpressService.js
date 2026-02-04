class AliExpressService {
    constructor() {
        this.affiliateTrackingId = process.env.ALIEXPRESS_AFFILIATE_ID || '';
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

    generateDSersCSV(orders) {
        let csv = 'Order,Name,Email,Phone,Address,City,State,Zip,Country,ProductURL,Qty\n';
        orders.forEach(o => {
            csv += [o._id,o.customerName||'',o.email||'',o.phone||'',o.address||'',o.city||'',o.state||'',o.zip||'',o.country||'',o.productUrl||'',o.qty||1].join(',') + '\n';
        });
        return csv;
    }
}

module.exports = new AliExpressService();
