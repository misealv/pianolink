/* controllers/adminController.js */

// Importamos el modelo User para poder buscar en la base de datos
const User = require('../models/User');
const Feedback = require('../models/Feedback'); 
const Message = require('../models/Message');   
// Función para cambiar el estado de "Profesor Fundador"
exports.toggleFounderStatus = async (req, res) => {
    try {
        const { id } = req.params; // Obtenemos el ID desde la URL
        
        // 1. Buscamos el usuario
        const user = await User.findById(id);
        
        if (!user) {
            // Si no existe, redirigimos (puedes ajustar esta ruta a tu panel real)
            return res.redirect('/admin/users'); 
        }

        // 2. Interruptor: Si es true lo vuelve false, y viceversa
        user.isFoundingMember = !user.isFoundingMember;
        
        // 3. Guardamos el cambio en MongoDB
        await user.save();

        console.log(`Estatus de fundador actualizado para ${user.email}: ${user.isFoundingMember}`);
        
        // 4. Redirigimos de vuelta a la lista de usuarios
       // res.redirect('/admin/users'); 

       res.json({ success: true, isFounder: user.isFoundingMember });

    } catch (error) {
        console.error('Error en toggleFounderStatus:', error);
        res.status(500).send('Error del servidor');
    }
};

/* controllers/adminController.js (AÑADIR ESTO) */

// Obtener historial completo de conversación con un usuario específico
exports.getConversationWithUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const User = require('../models/User');
        const Feedback = require('../models/Feedback');
        const Message = require('../models/Message');

        // 1. Verificar usuario
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

        // 2. Buscar mensajes en ambas direcciones
        // A) Lo que el Profe escribió (Feedback)
        const feedbacks = await Feedback.find({ user: userId }).lean();
        
        // B) Lo que el Admin respondió (Message)
        const messages = await Message.find({ recipient: userId }).lean();

        // 3. Unificar y formatear
        const timeline = [
            ...feedbacks.map(f => ({ 
                _id: f._id,
                content: f.content,
                createdAt: f.createdAt,
                sender: 'teacher', // Viene del profe
                status: f.status
            })),
            ...messages.map(m => ({ 
                _id: m._id,
                content: m.content,
                createdAt: m.createdAt,
                sender: 'admin',   // Viene del admin
                isRead: m.isRead
            }))
        ];

        // 4. Ordenar por fecha (Más antiguo al principio -> Chat cronológico)
        timeline.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

        res.json({
            user: { name: user.name, email: user.email, id: user._id },
            conversation: timeline
        });

    } catch (error) {
        console.error('Error en getConversationWithUser:', error);
        res.status(500).json({ message: 'Error obteniendo conversación' });
    }
};

// NUEVA FUNCIÓN: Editar usuario desde el Admin
exports.updateTeacherByAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, slug, country, whatsapp, password, isFoundingMember } = req.body;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        // Actualizamos campos básicos
        user.name = name || user.name;
        user.email = email || user.email;
        
        // País y WhatsApp a nivel raíz
        if (country !== undefined) user.country = country;
        if (whatsapp !== undefined) user.whatsapp = whatsapp;
        
        // El slug es opcional, si viene vacío lo dejamos undefined o mantenemos el anterior
        if (slug !== undefined) user.slug = slug;
        
        // Status de fundador
        if (isFoundingMember !== undefined) user.isFoundingMember = isFoundingMember;
        
        // Password si se proporciona
        if (password && password.length >= 6) {
            const bcrypt = require('bcryptjs');
            user.password = await bcrypt.hash(password, 10);
        }

        // Actualizamos el objeto branding (asegurando que exista) - mantener compatibilidad
        if (!user.branding) user.branding = {};
        user.branding.country = country || user.branding.country || '🏳️ Internacional';

        await user.save();
        res.json({ success: true, message: 'Profesor actualizado correctamente' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al actualizar usuario' });
    }
};


/* --- AGREGAR AL FINAL DE adminController.js --- */

// Importar el nuevo modelo
const GlobalConfig = require('../models/GlobalConfig');

/* -------------------------------------------------------------------------- */
/* FUNCIONES DE CLIENTES / APODERADOS                                         */
/* -------------------------------------------------------------------------- */

// Obtener todos los clientes (estudiantes que pagaron: role='client' O role='student' con kitPurchased)
exports.getClients = async (req, res) => {
    try {
        // Incluir:
        // 1. role='client' (apoderados y clientes manuales)
        // 2. role='student' con kitPurchased=true (compraron kit de bienvenida)
        // 3. role='student' con clientData definido (creados manualmente como clientes)
        const clients = await User.find({
            $or: [
                { role: 'client' },
                { role: 'student', kitPurchased: true },
                { role: 'student', 'clientData.accountType': { $exists: true } }
            ]
        })
            .select('-password')
            .sort({ createdAt: -1 });
        
        res.json(clients);
    } catch (error) {
        console.error('Error obteniendo clientes:', error);
        res.status(500).json({ message: 'Error obteniendo clientes' });
    }
};

// Crear nuevo cliente (individual o apoderado)
exports.createClient = async (req, res) => {
    try {
        const { 
            name, 
            email, 
            password, 
            whatsapp, 
            country, 
            clientData,
            studentData,
            assignedTeacher,
            classesRemaining,
            paymentInfo 
        } = req.body;
        
        // Validar email único
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'El email ya está registrado' });
        }
        
        // Generar contraseña temporal si no se proporciona
        const finalPassword = password || Math.random().toString(36).slice(-8) + 'A1!';
        
        // Crear el cliente
        const newClient = new User({
            name,
            email,
            password: finalPassword,
            whatsapp: whatsapp || '',
            country: country || '',
            role: 'client',
            classesRemaining: classesRemaining || 0,
            clientData: {
                accountType: clientData?.accountType || 'individual',
                managedStudents: clientData?.managedStudents || [],
                billingEmail: email
            },
            studentData: studentData ? {
                age: studentData.age,
                level: studentData.level || 'beginner',
                source: 'platform',
                assignedTeacher: assignedTeacher || null
            } : undefined,
            // Registrar pago inicial si existe
            paymentHistory: paymentInfo && paymentInfo.amount ? [{
                amount: paymentInfo.amount,
                currency: paymentInfo.currency || 'CLP',
                method: paymentInfo.method || 'transferencia',
                notes: paymentInfo.notes || '',
                classes: classesRemaining || 0,
                date: new Date()
            }] : []
        });
        
        await newClient.save();
        
        console.log(`✅ Cliente creado: ${name} (${email}) - Tipo: ${clientData?.accountType}`);
        
        // Log del pago manual si existe
        if (paymentInfo && paymentInfo.amount) {
            console.log(`💵 Pago registrado: $${paymentInfo.amount} via ${paymentInfo.method}`);
        }
        
        res.status(201).json({ 
            success: true, 
            message: 'Cliente creado exitosamente',
            client: { _id: newClient._id, name: newClient.name, email: newClient.email }
        });
        
    } catch (error) {
        console.error('Error creando cliente:', error);
        res.status(500).json({ message: error.message || 'Error creando cliente' });
    }
};

// Actualizar cliente
exports.updateClient = async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            name, 
            email, 
            password, 
            whatsapp, 
            country, 
            clientData,
            studentData,
            assignedTeacher,
            classesRemaining 
        } = req.body;
        
        const client = await User.findById(id);
        // Aceptar role 'client' o 'student' con kit comprado
        const isClient = client && (client.role === 'client' || (client.role === 'student' && client.kitPurchased));
        if (!isClient) {
            return res.status(404).json({ message: 'Cliente no encontrado' });
        }
        
        // Verificar email único si cambió
        if (email && email !== client.email) {
            const existingUser = await User.findOne({ email, _id: { $ne: id } });
            if (existingUser) {
                return res.status(400).json({ message: 'El email ya está registrado' });
            }
        }
        
        // Actualizar campos
        if (name) client.name = name;
        if (email) client.email = email;
        if (password) client.password = password; // El hook pre-save encriptará
        if (whatsapp !== undefined) client.whatsapp = whatsapp;
        if (country !== undefined) client.country = country;
        if (classesRemaining !== undefined) client.classesRemaining = classesRemaining;
        
        // Actualizar clientData
        if (clientData) {
            client.clientData = {
                ...client.clientData,
                accountType: clientData.accountType || client.clientData?.accountType,
                managedStudents: clientData.managedStudents || client.clientData?.managedStudents || [],
                billingEmail: email || client.email
            };
        }
        
        // Actualizar studentData para clientes individuales
        if (studentData) {
            client.studentData = {
                ...client.studentData,
                age: studentData.age,
                level: studentData.level,
                assignedTeacher: assignedTeacher || client.studentData?.assignedTeacher
            };
        }
        
        await client.save();
        
        console.log(`✅ Cliente actualizado: ${client.name}`);
        res.json({ success: true, message: 'Cliente actualizado correctamente' });
        
    } catch (error) {
        console.error('Error actualizando cliente:', error);
        res.status(500).json({ message: error.message || 'Error actualizando cliente' });
    }
};

// Eliminar cliente
exports.deleteClient = async (req, res) => {
    try {
        const { id } = req.params;
        
        const client = await User.findById(id);
        // Aceptar role 'client' o 'student' con kit comprado
        const isClient = client && (client.role === 'client' || (client.role === 'student' && client.kitPurchased));
        if (!isClient) {
            return res.status(404).json({ message: 'Cliente no encontrado' });
        }
        
        await User.findByIdAndDelete(id);
        
        console.log(`🗑️ Cliente eliminado: ${client.name} (${client.email})`);
        res.json({ success: true, message: 'Cliente eliminado correctamente' });
        
    } catch (error) {
        console.error('Error eliminando cliente:', error);
        res.status(500).json({ message: 'Error eliminando cliente' });
    }
};

// Agregar clases a un cliente (pago manual)
exports.addClassesToClient = async (req, res) => {
    try {
        const { id } = req.params;
        const { studentIndex, classesToAdd, payment } = req.body;
        
        const client = await User.findById(id);
        if (!client || client.role !== 'client') {
            return res.status(404).json({ message: 'Cliente no encontrado' });
        }
        
        const isGuardian = client.clientData?.accountType === 'guardian';
        
        if (isGuardian && studentIndex !== null && studentIndex !== undefined) {
            // Agregar clases a un hijo específico
            if (!client.clientData.managedStudents || !client.clientData.managedStudents[studentIndex]) {
                return res.status(400).json({ message: 'Estudiante no encontrado' });
            }
            
            client.clientData.managedStudents[studentIndex].classesRemaining = 
                (client.clientData.managedStudents[studentIndex].classesRemaining || 0) + classesToAdd;
            
            // Marcar como modificado para que mongoose lo guarde
            client.markModified('clientData.managedStudents');
            
            console.log(`➕ ${classesToAdd} clases agregadas a ${client.clientData.managedStudents[studentIndex].name}`);
        } else {
            // Cliente individual - agregar a classesRemaining del usuario
            client.classesRemaining = (client.classesRemaining || 0) + classesToAdd;
            console.log(`➕ ${classesToAdd} clases agregadas a ${client.name}`);
        }
        
        // Registrar pago en el historial si existe
        if (payment && payment.amount) {
            client.paymentHistory = client.paymentHistory || [];
            
            const studentName = isGuardian && studentIndex !== null 
                ? client.clientData.managedStudents[studentIndex]?.name 
                : client.name;
            
            client.paymentHistory.push({
                amount: payment.amount,
                currency: payment.currency || 'CLP',
                method: payment.method || 'manual',
                notes: payment.notes || `${classesToAdd} clases para ${studentName}`,
                classes: classesToAdd,
                studentName: studentName,
                date: new Date()
            });
            
            client.markModified('paymentHistory');
            console.log(`💵 Pago registrado: $${payment.amount} via ${payment.method || 'manual'}`);
        }
        
        await client.save();
        
        res.json({ 
            success: true, 
            message: `${classesToAdd} clases agregadas correctamente`,
            newBalance: isGuardian && studentIndex !== null 
                ? client.clientData.managedStudents[studentIndex].classesRemaining
                : client.classesRemaining
        });
        
    } catch (error) {
        console.error('Error agregando clases:', error);
        res.status(500).json({ message: 'Error agregando clases' });
    }
};
// Obtener historial de pagos de un cliente
exports.getClientPayments = async (req, res) => {
    try {
        const { id } = req.params;
        const payments = [];
        
        // Primero obtener el usuario para tener el email y paymentHistory
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ message: 'Cliente no encontrado' });
        }
        
        // 1. Buscar pagos manuales registrados en el usuario (PRIORITARIO)
        if (user.paymentHistory && Array.isArray(user.paymentHistory) && user.paymentHistory.length > 0) {
            for (const p of user.paymentHistory) {
                payments.push({
                    type: 'manual',
                    date: p.date || new Date(),
                    amount: p.amount || 0,
                    currency: p.currency || 'CLP',
                    provider: p.method || 'manual',
                    status: 'approved',
                    description: p.notes || 'Pago manual',
                    externalId: null,
                    details: {
                        classes: p.classes,
                        notes: p.notes,
                        studentName: p.studentName
                    }
                });
            }
        }
        
        // 2. Buscar pagos de Welcome Kit (con try-catch para evitar errores)
        try {
            const WelcomeKit = require('../models/WelcomeKit');
            const kits = await WelcomeKit.find({ 
                $or: [
                    { clientId: id },
                    { clientEmail: user.email }
                ]
            }).sort({ createdAt: -1 });
            
            for (const kit of kits) {
                if (kit.payment?.paidAt) {
                    payments.push({
                        type: 'welcome_kit',
                        date: kit.payment.paidAt,
                        amount: kit.payment.amount || 0,
                        currency: kit.payment.currency || 'USD',
                        provider: kit.payment.provider || 'paypal',
                        status: 'approved',
                        description: `Kit de Bienvenida (${kit.kitType})`,
                        externalId: kit.payment.externalOrderId,
                        details: {
                            kitType: kit.kitType,
                            products: kit.products?.length || 0,
                            shippingStatus: kit.shipping?.status
                        }
                    });
                }
            }
        } catch (kitError) {
            console.log('No se pudieron cargar Welcome Kits:', kitError.message);
        }
        
        // 3. Buscar suscripciones del cliente (con try-catch)
        try {
            const Subscription = require('../models/Subscription');
            const Payment = require('../models/Payment');
            
            const subscriptions = await Subscription.find({ 
                $or: [
                    { studentId: id },
                    { teacherId: id }
                ]
            }).sort({ createdAt: -1 });
            
            for (const sub of subscriptions) {
                if (sub.startDate) {
                    payments.push({
                        type: 'subscription',
                        date: sub.startDate,
                        amount: sub.amount || 0,
                        currency: sub.currency || 'USD',
                        provider: sub.paymentProvider || 'paypal',
                        status: sub.status,
                        description: `Suscripción ${sub.status === 'active' ? 'activa' : sub.status}`,
                        externalId: sub.paypalSubscriptionId || sub.mpSubscriptionId,
                        details: {
                            subscriptionId: sub._id,
                            expiresAt: sub.expiresAt
                        }
                    });
                }
                
                // Buscar pagos asociados a esta suscripción
                const subPayments = await Payment.find({ subscriptionId: sub._id }).sort({ createdAt: -1 });
                for (const p of subPayments) {
                    payments.push({
                        type: 'subscription_payment',
                        date: p.createdAt,
                        amount: p.amount || 0,
                        currency: p.currency || 'USD',
                        provider: p.provider,
                        status: p.status,
                        description: 'Pago de suscripción',
                        externalId: p.externalPaymentId,
                        details: {
                            subscriptionId: sub._id
                        }
                    });
                }
            }
        } catch (subError) {
            console.log('No se pudieron cargar suscripciones:', subError.message);
        }
        
        // 4. Si compró kit, agregar el registro del pago inicial
        if (user.kitPurchased && user.kitPurchaseDate && !payments.find(p => p.type === 'welcome_kit')) {
            payments.push({
                type: 'welcome_kit',
                date: user.kitPurchaseDate,
                amount: 0,
                currency: 'USD',
                provider: 'paypal',
                status: 'approved',
                description: 'Kit de Bienvenida',
                externalId: user.paypalOrderId,
                details: {}
            });
        }
        
        // Ordenar por fecha descendente
        payments.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        res.json(payments);
        
    } catch (error) {
        console.error('Error obteniendo historial de pagos:', error);
        res.status(500).json({ message: 'Error obteniendo historial de pagos' });
    }
};

// Obtener configuración de precios
exports.getPricingConfig = async (req, res) => {
    try {
        let config = await GlobalConfig.findOne({ isDefault: true });
        
        if (!config) {
            // Crear configuración por defecto si no existe
            config = new GlobalConfig({
                isDefault: true,
                memberships: {
                    teacherSubscription: { regular: 20, founder: 10 },
                    trialClassPayment: { amountUSD: 10, currency: 'USD', enabled: true }
                }
            });
            await config.save();
        }
        
        res.json({
            teacherSubscription: config.memberships?.teacherSubscription || { regular: 20, founder: 10 },
            trialClassPayment: config.memberships?.trialClassPayment || { amountUSD: 10, currency: 'USD', enabled: true }
        });
    } catch (error) {
        console.error('Error obteniendo configuración de precios:', error);
        res.status(500).json({ message: 'Error obteniendo configuración de precios' });
    }
};

// Actualizar configuración de precios
exports.updatePricingConfig = async (req, res) => {
    try {
        const { founder, regular, trialClassPayment } = req.body;
        
        // Validación de precios de suscripción
        if (typeof founder !== 'number' || typeof regular !== 'number') {
            return res.status(400).json({ message: 'Los precios deben ser números válidos' });
        }
        
        if (founder < 0 || regular < 0) {
            return res.status(400).json({ message: 'Los precios no pueden ser negativos' });
        }
        
        if (founder > 1000 || regular > 1000) {
            return res.status(400).json({ message: 'Los precios no pueden exceder $1000 USD' });
        }
        
        // Validación de pago por clase de prueba
        if (trialClassPayment !== undefined) {
            if (typeof trialClassPayment.amountUSD !== 'number' || trialClassPayment.amountUSD < 0) {
                return res.status(400).json({ message: 'El pago por clase de prueba debe ser un número válido' });
            }
            if (trialClassPayment.amountUSD > 100) {
                return res.status(400).json({ message: 'El pago por clase de prueba no puede exceder $100 USD' });
            }
        }
        
        let config = await GlobalConfig.findOne({ isDefault: true });
        
        if (!config) {
            config = new GlobalConfig({
                isDefault: true,
                memberships: {
                    teacherSubscription: { regular, founder },
                    trialClassPayment: trialClassPayment || { amountUSD: 10, currency: 'USD', enabled: true }
                }
            });
        } else {
            // Inicializar memberships si no existe
            if (!config.memberships) {
                config.memberships = {};
            }
            config.memberships.teacherSubscription = { regular, founder };
            
            // Actualizar trial class payment si se envió
            if (trialClassPayment !== undefined) {
                config.memberships.trialClassPayment = {
                    amountUSD: trialClassPayment.amountUSD,
                    currency: 'USD',
                    enabled: trialClassPayment.enabled !== false
                };
            }
        }
        
        await config.save();
        
        console.log('[Admin] Configuración de precios actualizada:', {
            teacherSubscription: config.memberships.teacherSubscription,
            trialClassPayment: config.memberships.trialClassPayment
        });
        
        res.json({
            message: 'Configuración de precios actualizada exitosamente',
            teacherSubscription: config.memberships.teacherSubscription,
            trialClassPayment: config.memberships.trialClassPayment
        });
    } catch (error) {
        console.error('Error actualizando configuración de precios:', error);
        res.status(500).json({ message: 'Error actualizando configuración de precios' });
    }
};

// Actualizar precio del Kit de Bienvenida V2
exports.updateKitV2Price = async (req, res) => {
    try {
        const { priceUSD, extraChildPriceUSD } = req.body;
        
        // Validación precio base (mínimo $0.01 para pruebas con dinero real)
        if (typeof priceUSD !== 'number' || priceUSD < 0.01) {
            return res.status(400).json({ message: 'El precio base debe ser un número válido (mínimo $0.01)' });
        }
        
        if (priceUSD > 500) {
            return res.status(400).json({ message: 'El precio base no puede exceder $500 USD' });
        }
        
        // Validación precio por hijo extra (si se proporciona)
        const extraPrice = typeof extraChildPriceUSD === 'number' ? extraChildPriceUSD : 15;
        if (extraPrice < 0 || extraPrice > 100) {
            return res.status(400).json({ message: 'El precio por hijo extra debe estar entre $0 y $100 USD' });
        }
        
        let config = await GlobalConfig.findOne({ isDefault: true });
        
        if (!config) {
            config = new GlobalConfig({
                isDefault: true,
                welcomeKitV2: { priceUSD, extraChildPriceUSD: extraPrice, enabled: true }
            });
        } else {
            if (!config.welcomeKitV2) {
                config.welcomeKitV2 = {};
            }
            config.welcomeKitV2.priceUSD = priceUSD;
            config.welcomeKitV2.extraChildPriceUSD = extraPrice;
        }
        
        await config.save();
        
        console.log(`[Admin] Precio Kit V2 actualizado: Base=$${priceUSD}, Hijo extra=$${extraPrice} USD`);
        
        res.json({
            message: 'Precios del Kit de Bienvenida actualizados',
            welcomeKitV2: config.welcomeKitV2
        });
    } catch (error) {
        console.error('Error actualizando precio Kit V2:', error);
        res.status(500).json({ message: 'Error actualizando precio del Kit' });
    }
};

// Actualizar configuración de Early Bird (Fase 5 v5.0)
exports.updateEarlyBirdConfig = async (req, res) => {
    try {
        const {
            enabled,
            welcomeKitPriceUSD,
            welcomeKitRegularPriceUSD,
            expiresAfterMinutes,
            headline,
            subtitle,
            ctaText
        } = req.body;

        // Validaciones
        if (typeof welcomeKitPriceUSD !== 'number' || welcomeKitPriceUSD < 1) {
            return res.status(400).json({ message: 'Precio early bird inválido (mínimo 1 centavo)' });
        }
        if (typeof welcomeKitRegularPriceUSD !== 'number' || welcomeKitRegularPriceUSD < 1) {
            return res.status(400).json({ message: 'Precio regular inválido (mínimo 1 centavo)' });
        }
        if (welcomeKitPriceUSD >= welcomeKitRegularPriceUSD) {
            return res.status(400).json({ message: 'El precio early bird debe ser menor al precio regular' });
        }
        if (typeof expiresAfterMinutes === 'number' && (expiresAfterMinutes < 0 || expiresAfterMinutes > 1440)) {
            return res.status(400).json({ message: 'El countdown debe ser entre 0 y 1440 minutos' });
        }

        let config = await GlobalConfig.findOne({ isDefault: true });

        if (!config) {
            config = new GlobalConfig({ isDefault: true, memberships: {} });
        }

        if (!config.memberships) config.memberships = {};

        config.memberships.earlyBirdOffer = {
            enabled: enabled !== false,
            welcomeKitPriceUSD: welcomeKitPriceUSD,
            welcomeKitRegularPriceUSD: welcomeKitRegularPriceUSD,
            expiresAfterMinutes: typeof expiresAfterMinutes === 'number' ? expiresAfterMinutes : 30,
            headline: headline || '¡Oferta exclusiva para madrugadores!',
            subtitle: subtitle || 'Por registrarte hoy, accede al Welcome Kit con descuento único',
            ctaText: ctaText || 'Comprar Welcome Kit — $29 USD'
        };

        await config.save();

        console.log('[Admin] Configuración Early Bird actualizada:', config.memberships.earlyBirdOffer);

        res.json({
            message: 'Configuración Early Bird actualizada',
            earlyBirdOffer: config.memberships.earlyBirdOffer
        });
    } catch (error) {
        console.error('Error actualizando config Early Bird:', error);
        res.status(500).json({ message: 'Error actualizando configuración' });
    }
};

/**
 * Enviar recordatorio de membresía a un profesor específico
 */
exports.sendMembershipReminder = async (req, res) => {
    try {
        const { teacherId } = req.params;
        const MembershipReminderService = require('../services/MembershipReminderService');
        
        if (!MembershipReminderService.isConfigured()) {
            return res.status(503).json({ 
                success: false, 
                message: 'Servicio de email no configurado' 
            });
        }
        
        const sent = await MembershipReminderService.sendManualReminder(teacherId);
        
        if (sent) {
            res.json({ 
                success: true, 
                message: 'Recordatorio enviado exitosamente' 
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: 'Error enviando recordatorio' 
            });
        }
    } catch (error) {
        console.error('Error enviando recordatorio:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
};

/**
 * Ejecutar verificación de membresías manualmente (para testing)
 */
exports.runMembershipReminders = async (req, res) => {
    try {
        const MembershipReminderService = require('../services/MembershipReminderService');
        
        if (!MembershipReminderService.isConfigured()) {
            return res.status(503).json({ 
                success: false, 
                message: 'Servicio de email no configurado' 
            });
        }
        
        const result = await MembershipReminderService.runDailyCheck();
        
        res.json({
            success: true,
            message: `Verificación completada: ${result.sent} recordatorios enviados`,
            details: result
        });
    } catch (error) {
        console.error('Error ejecutando verificación:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
};

// ==================== COMISIONES POR PLAN Y TARIFA MÍNIMA ====================

// Obtener configuración de comisiones y tarifa mínima
exports.getCommissionConfig = async (req, res) => {
    try {
        const config = await GlobalConfig.findOne({ isDefault: true });
        const plans = config?.memberships?.teacherPlans || {};
        
        res.json({
            minHourlyRate: config?.memberships?.minHourlyRate || 15,
            plans: {
                free: {
                    platformCommission: plans.free?.platformCommission ?? 25,
                    teacherCommission: plans.free?.teacherCommission ?? 75
                },
                premium: {
                    platformCommission: plans.premium?.platformCommission ?? 15,
                    teacherCommission: plans.premium?.teacherCommission ?? 85
                },
                founder: {
                    platformCommission: plans.founder?.platformCommission ?? 15,
                    teacherCommission: plans.founder?.teacherCommission ?? 85
                }
            }
        });
    } catch (error) {
        console.error('Error obteniendo comisiones:', error);
        res.status(500).json({ message: 'Error obteniendo configuración de comisiones' });
    }
};

// Actualizar configuración de comisiones y tarifa mínima
exports.updateCommissionConfig = async (req, res) => {
    try {
        const { minHourlyRate, plans } = req.body;
        
        // Validar tarifa mínima
        if (typeof minHourlyRate !== 'number' || minHourlyRate < 1 || minHourlyRate > 500) {
            return res.status(400).json({ message: 'La tarifa mínima debe ser entre $1 y $500 USD' });
        }
        
        // Validar comisiones
        for (const [planName, planData] of Object.entries(plans || {})) {
            const p = planData.platformCommission;
            const t = planData.teacherCommission;
            if (typeof p !== 'number' || p < 0 || p > 100) {
                return res.status(400).json({ message: `Comisión inválida para plan ${planName}` });
            }
            if (p + t !== 100) {
                return res.status(400).json({ message: `Las comisiones del plan ${planName} deben sumar 100%` });
            }
        }
        
        let config = await GlobalConfig.findOne({ isDefault: true });
        if (!config) {
            config = new GlobalConfig({ isDefault: true });
        }
        
        // Inicializar memberships si no existe
        if (!config.memberships) config.memberships = {};
        
        // Actualizar tarifa mínima
        config.memberships.minHourlyRate = minHourlyRate;
        
        // Actualizar comisiones por plan
        if (!config.memberships.teacherPlans) config.memberships.teacherPlans = {};
        
        for (const [planName, planData] of Object.entries(plans)) {
            if (!config.memberships.teacherPlans[planName]) {
                config.memberships.teacherPlans[planName] = {};
            }
            config.memberships.teacherPlans[planName].platformCommission = planData.platformCommission;
            config.memberships.teacherPlans[planName].teacherCommission = planData.teacherCommission;
        }
        
        // Marcar subdocumento como modificado para que Mongoose lo guarde
        config.markModified('memberships');
        await config.save();
        
        // Invalidar cache de CommissionService
        try {
            const CommissionService = require('../services/CommissionService');
            CommissionService.invalidateCache();
        } catch (e) { /* CommissionService puede no estar importado */ }
        
        console.log('[Admin] Comisiones actualizadas:', {
            minHourlyRate,
            plans: Object.entries(plans).map(([k, v]) => `${k}: ${v.platformCommission}/${v.teacherCommission}`)
        });
        
        res.json({
            message: 'Comisiones y tarifa mínima actualizadas exitosamente',
            minHourlyRate,
            plans
        });
    } catch (error) {
        console.error('Error actualizando comisiones:', error);
        res.status(500).json({ message: 'Error actualizando comisiones' });
    }
};

// ===================== CRUD MercadoPago Credentials por País =====================
const MpCredentials = require('../models/MpCredentials');

/**
 * GET /admin/mp-credentials
 * Listar todas las credenciales MP (activas e inactivas).
 */
exports.getMpCredentials = async (req, res) => {
    try {
        const creds = await MpCredentials.find().sort({ countryCode: 1 }).lean();
        // Enmascarar tokens sensibles para la respuesta
        const safe = creds.map(c => ({
            _id: c._id,
            countryCode: c.countryCode,
            countryName: c.countryName,
            currency: c.currency,
            isActive: c.isActive,
            tokenStatus: c.tokenStatus,
            lastTokenCheck: c.lastTokenCheck,
            accessTokenPreview: c.accessToken ? c.accessToken.substring(0, 20) + '...' : '',
            publicKeyPreview: c.publicKey ? c.publicKey.substring(0, 20) + '...' : '',
            hasWebhookSecret: !!c.webhookSecret,
            collector: c.collector,
            payout: c.payout,
            updatedAt: c.updatedAt
        }));
        res.json({ success: true, credentials: safe });
    } catch (error) {
        console.error('[Admin] Error listando MpCredentials:', error);
        res.status(500).json({ error: 'Error al listar credenciales' });
    }
};

/**
 * POST /admin/mp-credentials
 * Crear o actualizar credenciales MP para un país.
 * Body: { countryCode, accessToken, publicKey, webhookSecret?, collector?, payout? }
 */
exports.upsertMpCredentials = async (req, res) => {
    try {
        const { countryCode, accessToken, publicKey, webhookSecret, collector, payout } = req.body;

        if (!countryCode || !accessToken || !publicKey) {
            return res.status(400).json({ error: 'countryCode, accessToken y publicKey son obligatorios' });
        }

        const code = countryCode.toUpperCase();
        const validCountries = ['CL', 'MX', 'AR', 'CO', 'BR', 'PE', 'UY'];
        if (!validCountries.includes(code)) {
            return res.status(400).json({ error: `País inválido. Válidos: ${validCountries.join(', ')}` });
        }

        const countryNames = { CL: 'Chile', MX: 'México', AR: 'Argentina', CO: 'Colombia', BR: 'Brasil', PE: 'Perú', UY: 'Uruguay' };
        const currencyMap = { CL: 'CLP', MX: 'MXN', AR: 'ARS', CO: 'COP', BR: 'BRL', PE: 'PEN', UY: 'UYU' };

        const updateData = {
            countryCode: code,
            countryName: countryNames[code],
            currency: currencyMap[code],
            accessToken,
            publicKey,
            isActive: true,
            tokenStatus: 'unknown'
        };

        if (webhookSecret !== undefined) updateData.webhookSecret = webhookSecret;
        if (collector) updateData.collector = collector;
        if (payout) updateData.payout = { ...payout, payoutCurrency: payout.payoutCurrency || currencyMap[code] };

        const result = await MpCredentials.findOneAndUpdate(
            { countryCode: code },
            { $set: updateData },
            { upsert: true, new: true, runValidators: true }
        );

        console.log(`[Admin] MpCredentials ${result.isNew !== false ? 'creado' : 'actualizado'}: ${code} (${countryNames[code]})`);

        res.json({
            success: true,
            message: `Credenciales de ${countryNames[code]} guardadas y activadas`,
            credential: {
                _id: result._id,
                countryCode: result.countryCode,
                countryName: result.countryName,
                currency: result.currency,
                isActive: result.isActive
            }
        });
    } catch (error) {
        console.error('[Admin] Error guardando MpCredentials:', error);
        res.status(500).json({ error: error.message || 'Error al guardar credenciales' });
    }
};

/**
 * PUT /admin/mp-credentials/:countryCode/toggle
 * Activar/desactivar credenciales de un país.
 */
exports.toggleMpCredentials = async (req, res) => {
    try {
        const code = req.params.countryCode.toUpperCase();
        const cred = await MpCredentials.findOne({ countryCode: code });
        if (!cred) return res.status(404).json({ error: `No hay credenciales para ${code}` });

        cred.isActive = !cred.isActive;
        await cred.save();

        console.log(`[Admin] MpCredentials ${code}: ${cred.isActive ? 'ACTIVADO' : 'DESACTIVADO'}`);
        res.json({ success: true, countryCode: code, isActive: cred.isActive });
    } catch (error) {
        console.error('[Admin] Error toggle MpCredentials:', error);
        res.status(500).json({ error: 'Error al cambiar estado' });
    }
};

/**
 * DELETE /admin/mp-credentials/:countryCode
 * Eliminar credenciales de un país.
 */
exports.deleteMpCredentials = async (req, res) => {
    try {
        const code = req.params.countryCode.toUpperCase();
        const result = await MpCredentials.deleteOne({ countryCode: code });
        if (result.deletedCount === 0) return res.status(404).json({ error: `No hay credenciales para ${code}` });

        console.log(`[Admin] MpCredentials eliminado: ${code}`);
        res.json({ success: true, message: `Credenciales de ${code} eliminadas` });
    } catch (error) {
        console.error('[Admin] Error eliminando MpCredentials:', error);
        res.status(500).json({ error: 'Error al eliminar credenciales' });
    }
};

/**
 * POST /admin/mp-credentials/:countryCode/test
 * Verificar que las credenciales funcionan haciendo una llamada a la API de MP.
 */
exports.testMpCredentials = async (req, res) => {
    try {
        const code = req.params.countryCode.toUpperCase();
        const cred = await MpCredentials.findOne({ countryCode: code });
        if (!cred) return res.status(404).json({ error: `No hay credenciales para ${code}` });

        // Verificar token haciendo GET a /users/me
        const response = await fetch('https://api.mercadopago.com/users/me', {
            headers: { 'Authorization': `Bearer ${cred.accessToken}` }
        });

        if (response.ok) {
            const data = await response.json();
            cred.tokenStatus = 'valid';
            cred.lastTokenCheck = new Date();
            if (data.email) cred.collector.email = data.email;
            if (data.id) cred.collector.userId = String(data.id);
            await cred.save();

            res.json({
                success: true,
                status: 'valid',
                account: {
                    id: data.id,
                    email: data.email,
                    nickname: data.nickname,
                    siteId: data.site_id,
                    countryId: data.country_id
                }
            });
        } else {
            cred.tokenStatus = 'expired';
            cred.lastTokenCheck = new Date();
            await cred.save();

            const errData = await response.json().catch(() => ({}));
            res.json({
                success: false,
                status: 'expired',
                error: errData.message || `HTTP ${response.status}`
            });
        }
    } catch (error) {
        console.error('[Admin] Error testeando MpCredentials:', error);
        res.status(500).json({ error: 'Error al verificar credenciales' });
    }
};