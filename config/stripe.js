/**
 * config/stripe.js
 * Configuración de Stripe - PianoLink v4.3
 * 
 * Variables de entorno requeridas:
 * - STRIPE_SECRET_KEY: Clave secreta (sk_test_... o sk_live_...)
 * - STRIPE_WEBHOOK_SECRET: Secreto del webhook (whsec_...)
 * - STRIPE_PUBLISHABLE_KEY: Clave pública para frontend
 */

const Stripe = require('stripe');

// Validar que existan las credenciales
if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('[Stripe] ⚠️ STRIPE_SECRET_KEY no configurada. Los pagos con Stripe no funcionarán.');
}

// Inicializar cliente de Stripe
const stripe = process.env.STRIPE_SECRET_KEY 
    ? new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: '2024-12-18.acacia',
        appInfo: {
            name: 'PianoLink',
            version: '4.3.0',
            url: 'https://pianolink.app'
        }
    })
    : null;

// Configuración de precios y comisiones
const stripeConfig = {
    // Comisiones de la plataforma
    platformFee: {
        percent: 20,            // PianoLink cobra 20%
        teacherPercent: 80      // Profesor recibe 80%
    },

    // Precios por defecto (en centavos USD)
    defaultPrices: {
        singleClass: 2500,      // $25 USD
        package5: 11250,        // $112.50 USD (10% descuento)
        package10: 20000,       // $200 USD (20% descuento)
        monthlySubscription: 9900  // $99 USD/mes profesor
    },

    // Monedas soportadas
    supportedCurrencies: ['usd', 'clp', 'mxn', 'ars', 'eur'],
    defaultCurrency: 'usd',

    // Webhook endpoints
    webhookEndpoint: '/api/webhooks/stripe',
    
    // Metadata keys para tracking
    metadataKeys: {
        classRecordId: 'pianolink_class_record_id',
        teacherId: 'pianolink_teacher_id',
        studentId: 'pianolink_student_id',
        roomCode: 'pianolink_room_code',
        bookingId: 'pianolink_booking_id',
        walletId: 'pianolink_wallet_id'
    },

    // Modos de pago
    paymentModes: {
        class: 'class_payment',         // Pago por clase individual
        package: 'class_package',       // Paquete de clases
        subscription: 'subscription',   // Suscripción mensual
        withdrawal: 'payout'            // Retiro de ganancias
    },

    // Configuración de Connect (para payouts a profesores)
    connect: {
        enabled: true,
        accountType: 'express',
        
        // Países donde opera (para onboarding)
        supportedCountries: [
            'US', 'CL', 'MX', 'AR', 'CO', 'PE', 'ES', 'GB', 'DE', 'FR'
        ],
        
        // Capacidades requeridas para cuentas conectadas
        capabilities: {
            transfers: { requested: true },
            card_payments: { requested: true }
        }
    },

    // Tiempos
    timing: {
        // Días para liberar fondos pendientes
        holdPeriodDays: 2,
        
        // Timeout para intents (minutos)
        paymentIntentTimeout: 30,
        
        // Retraso mínimo para payouts (días)
        payoutDelay: 2
    }
};

// Helper para verificar si Stripe está configurado
const isStripeConfigured = () => {
    return !!stripe;
};

// Helper para obtener el cliente de Stripe
const getStripeClient = () => {
    if (!stripe) {
        throw new Error('Stripe no está configurado. Verifica STRIPE_SECRET_KEY.');
    }
    return stripe;
};

module.exports = {
    stripe,
    stripeConfig,
    isStripeConfigured,
    getStripeClient
};
