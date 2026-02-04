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
        const { name, email, slug, country } = req.body;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        // Actualizamos campos básicos
        user.name = name || user.name;
        user.email = email || user.email;
        
        // El slug es opcional, si viene vacío lo dejamos undefined o mantenemos el anterior
        if (slug !== undefined) user.slug = slug; 

        // Actualizamos el objeto branding (asegurando que exista)
        if (!user.branding) user.branding = {};
        
        // Aquí guardamos el PAÍS
        user.branding.country = country || '🏳️ Internacional';

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
            } : undefined
        });
        
        await newClient.save();
        
        console.log(`✅ Cliente creado: ${name} (${email}) - Tipo: ${clientData?.accountType}`);
        
        // Log del pago manual si existe
        if (paymentInfo && paymentInfo.amount) {
            console.log(`💵 Pago manual registrado: $${paymentInfo.amount} via ${paymentInfo.method}`);
            // Aquí podrías crear un registro de pago en otra colección si lo deseas
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
        if (!client || client.role !== 'client') {
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
        if (!client || client.role !== 'client') {
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
                return res.status(400).json({ message: 'Alumno no encontrado' });
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
        
        await client.save();
        
        // Log del pago si existe
        if (payment && payment.amount) {
            console.log(`💵 Pago registrado: $${payment.amount} via ${payment.method || 'no especificado'}`);
        }
        
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
        const WelcomeKit = require('../models/WelcomeKit');
        const Subscription = require('../models/Subscription');
        const Payment = require('../models/Payment');
        
        const payments = [];
        
        // 1. Buscar pagos de Welcome Kit
        const kits = await WelcomeKit.find({ 
            $or: [
                { clientId: id },
                { clientEmail: (await User.findById(id))?.email }
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
        
        // 2. Buscar suscripciones del cliente
        const subscriptions = await Subscription.find({ 
            $or: [
                { studentId: id },
                { teacherId: id }
            ]
        }).sort({ createdAt: -1 });
        
        for (const sub of subscriptions) {
            // Pago inicial de suscripción
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
        
        // 3. Buscar pagos manuales registrados en el usuario
        const user = await User.findById(id);
        if (user?.paymentHistory && Array.isArray(user.paymentHistory)) {
            for (const p of user.paymentHistory) {
                payments.push({
                    type: 'manual',
                    date: p.date || p.createdAt,
                    amount: p.amount || 0,
                    currency: p.currency || 'USD',
                    provider: p.method || 'manual',
                    status: 'approved',
                    description: p.notes || 'Pago manual',
                    externalId: null,
                    details: {
                        classes: p.classes,
                        notes: p.notes
                    }
                });
            }
        }
        
        // 4. Si compró kit, agregar el registro del pago inicial
        if (user?.kitPurchased && user?.kitPurchaseDate && !payments.find(p => p.type === 'welcome_kit')) {
            payments.push({
                type: 'welcome_kit',
                date: user.kitPurchaseDate,
                amount: 0, // No tenemos el monto aquí
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