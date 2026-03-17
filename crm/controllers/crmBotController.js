/**
 * crm/controllers/crmBotController.js
 * Controller para visualizar conversaciones del bot Mía en el CRM.
 */
const BotConversation = require('../../models/BotConversation');

/**
 * GET /api/crm/bot/conversations
 * Lista conversaciones del bot con paginación y filtros.
 */
exports.list = async (req, res) => {
    try {
        const { page = 1, limit = 30, search, hasLead } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const filter = {};

        if (hasLead === 'true') filter.leadRef = { $ne: null };
        if (hasLead === 'false') filter.leadRef = null;

        if (search) {
            filter.$or = [
                { phone: { $regex: search, $options: 'i' } },
                { 'leadData.nombre': { $regex: search, $options: 'i' } }
            ];
        }

        const [conversations, total] = await Promise.all([
            BotConversation.find(filter)
                .sort({ lastActivity: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate('leadRef', 'name email whatsapp type')
                .select('phone leadRef leadData lastActivity messageCount isActive createdAt')
                .lean(),
            BotConversation.countDocuments(filter)
        ]);

        // Stats rápidos
        const [totalConvos, withLead, activeToday] = await Promise.all([
            BotConversation.countDocuments({}),
            BotConversation.countDocuments({ leadRef: { $ne: null } }),
            BotConversation.countDocuments({
                lastActivity: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            })
        ]);

        res.json({
            success: true,
            data: conversations,
            stats: { totalConvos, withLead, activeToday },
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                pages: Math.ceil(total / Number(limit))
            }
        });
    } catch (error) {
        console.error('[Bot Controller] Error en list:', error);
        res.status(500).json({ success: false, error: 'Error al listar conversaciones' });
    }
};

/**
 * GET /api/crm/bot/conversations/:id
 * Detalle de una conversación con todos los mensajes.
 */
exports.getById = async (req, res) => {
    try {
        const convo = await BotConversation.findById(req.params.id)
            .populate('leadRef', 'name email whatsapp type source')
            .lean();

        if (!convo) {
            return res.status(404).json({ success: false, error: 'Conversación no encontrada' });
        }

        res.json({ success: true, data: convo });
    } catch (error) {
        console.error('[Bot Controller] Error en getById:', error);
        res.status(500).json({ success: false, error: 'Error al obtener conversación' });
    }
};

/**
 * GET /api/crm/bot/conversations/by-lead/:leadId
 * Conversación del bot vinculada a un lead específico.
 */
exports.getByLead = async (req, res) => {
    try {
        const convo = await BotConversation.findOne({ leadRef: req.params.leadId })
            .populate('leadRef', 'name email whatsapp type')
            .lean();

        if (!convo) {
            return res.status(404).json({ success: false, error: 'Sin conversación con Mía para este lead' });
        }

        res.json({ success: true, data: convo });
    } catch (error) {
        console.error('[Bot Controller] Error en getByLead:', error);
        res.status(500).json({ success: false, error: 'Error al obtener conversación' });
    }
};
