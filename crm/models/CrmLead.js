/**
 * crm/models/CrmLead.js
 * Lead enriquecido con scoring, atribución, segmentación e i18n.
 * Referencia al Lead original del core para no duplicar datos base.
 * 
 * PIPELINES SEPARADOS:
 *   - Estudiantes: lead → contacted → demo_scheduled → demo_completed → trial_class → enrolled → churned
 *   - Profesores:  lead → contacted → application_review → interview → onboarding → active → inactive
 */
const mongoose = require('mongoose');

const touchpointSchema = new mongoose.Schema({
    channel: { 
        type: String, 
        enum: ['meta_ads', 'google_ads', 'organic', 'referral', 'email', 'whatsapp', 'direct', 'social', 'other'],
        required: true 
    },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'CrmCampaign', default: null },
    timestamp: { type: Date, default: Date.now },
    pageUrl: { type: String, default: '' },
    utmSource: { type: String, default: '' },
    utmMedium: { type: String, default: '' },
    utmCampaign: { type: String, default: '' },
    utmContent: { type: String, default: '' },
    utmTerm: { type: String, default: '' }
}, { _id: false });

const attributionSchema = new mongoose.Schema({
    channel: { type: String, default: '' },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'CrmCampaign', default: null },
    adSetId: { type: String, default: '' },
    adId: { type: String, default: '' },
    utmSource: { type: String, default: '' },
    utmMedium: { type: String, default: '' },
    utmCampaign: { type: String, default: '' },
    utmContent: { type: String, default: '' },
    utmTerm: { type: String, default: '' },
    landingPage: { type: String, default: '' },
    referrer: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now }
}, { _id: false });

// Sub-esquema para tareas de seguimiento
const taskSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    type: { 
        type: String, 
        enum: ['call', 'email', 'whatsapp', 'meeting', 'follow_up', 'review', 'other'],
        default: 'follow_up'
    },
    dueDate: { type: Date, required: true },
    completedAt: { type: Date, default: null },
    status: {
        type: String,
        enum: ['pending', 'completed', 'overdue', 'cancelled'],
        default: 'pending'
    },
    assignedTo: { type: String, default: 'admin', trim: true },
    notes: { type: String, default: '' },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    }
}, { timestamps: true });

// Sub-esquema para razón de pérdida (lead lost)
const lostReasonSchema = new mongoose.Schema({
    reason: {
        type: String,
        enum: [
            'no_response', 'price_too_high', 'chose_competitor', 'not_ready',
            'bad_experience', 'schedule_conflict', 'location', 'other'
        ],
        required: true
    },
    details: { type: String, default: '' },
    lostAt: { type: Date, default: Date.now }
}, { _id: false });

const crmLeadSchema = new mongoose.Schema({
    // === REFERENCIA AL LEAD ORIGINAL ===
    leadRef: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Lead', 
        required: true,
        unique: true,
        index: true
    },

    // === SCORING ===
    score: { type: Number, default: 0, min: 0, max: 100 },
    scoreHistory: [{
        date: { type: Date, default: Date.now },
        score: { type: Number },
        reason: { type: String }
    }],

    // === PIPELINE (por tipo de lead) ===
    // Etapas para Estudiantes
    pipelineStudent: {
        type: String,
        enum: [null, 'lead', 'contacted', 'demo_scheduled', 'demo_completed', 'trial_class', 'enrolled', 'lost'],
        default: null  // Solo se usa si leadRef.type === 'client'
    },
    // Etapas para Profesores
    pipelineTeacher: {
        type: String,
        enum: [null, 'lead', 'contacted', 'application_review', 'interview', 'onboarding', 'active', 'rejected'],
        default: null  // Solo se usa si leadRef.type === 'teacher'
    },

    // === RAZÓN DE PÉRDIDA ===
    lostReason: { type: lostReasonSchema, default: null },

    // === ATRIBUCIÓN ===
    attribution: {
        firstTouch: { type: attributionSchema, default: () => ({}) },
        lastTouch: { type: attributionSchema, default: () => ({}) },
        touchpoints: [touchpointSchema]
    },

    // === TRACKING IDS EXTERNOS ===
    externalIds: {
        fbClickId: { type: String, default: '' },
        fbBrowserId: { type: String, default: '' },
        gClientId: { type: String, default: '' },
        gClickId: { type: String, default: '' }
    },

    // === SEGMENTACIÓN ===
    tags: [{ type: String, trim: true }],
    segment: { 
        type: String, 
        enum: ['cold', 'warm', 'hot', 'customer', 'churned', 'ex_estudiantes_resonancias'],
        default: 'cold'
    },

    // Lista/segmento especial independiente del pipeline principal
    lista: { type: String, default: '', trim: true },

    // === TAREAS DE SEGUIMIENTO ===
    tasks: [taskSchema],
    nextFollowUp: { type: Date, default: null, index: true },

    // === SECUENCIAS DE EMAIL ===
    activeSequences: [{
        sequenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'CrmSequence' },
        currentStep: { type: Number, default: 0 },
        startedAt: { type: Date, default: Date.now },
        pausedAt: { type: Date, default: null },
        completedAt: { type: Date, default: null },
        status: { 
            type: String, 
            enum: ['active', 'paused', 'completed', 'unsubscribed'],
            default: 'active'
        }
    }],

    emailPreferences: {
        unsubscribed: { type: Boolean, default: false },
        unsubscribedAt: { type: Date, default: null },
        bounced: { type: Boolean, default: false },
        bouncedAt: { type: Date, default: null }
    },

    // === EMAIL ENGAGEMENT (tracking de aperturas/clicks/bounces) ===
    emailEngagement: {
        totalSent: { type: Number, default: 0 },
        totalDelivered: { type: Number, default: 0 },
        totalOpened: { type: Number, default: 0 },
        totalClicked: { type: Number, default: 0 },
        totalBounced: { type: Number, default: 0 },
        lastSentAt: { type: Date, default: null },
        lastOpenedAt: { type: Date, default: null },
        lastClickedAt: { type: Date, default: null },
        complained: { type: Boolean, default: false },
        engagementLevel: {
            type: String,
            enum: ['none', 'cold', 'warm', 'hot', 'super_hot'],
            default: 'none'
        }
    },

    // === INTERNACIONALIZACIÓN ===
    locale: { type: String, default: 'es', trim: true },
    currency: { type: String, default: 'USD', trim: true },
    timezone: { type: String, default: 'America/Santiago', trim: true },

    // === LIFECYCLE (genérico, compatible con anteriores queries) ===
    lifecycleStage: {
        type: String,
        enum: ['subscriber', 'lead', 'mql', 'sql', 'opportunity', 'customer', 'evangelist'],
        default: 'lead'
    },
    
    // Valor de vida del cliente (centavos)
    customerValue: { type: Number, default: 0 },

    convertedAt: { type: Date, default: null },

    // === DATOS EXTRA DEL PIPELINE ===
    // Para profesores: datos del proceso de validación
    teacherData: {
        yearsExperience: { type: Number, default: null },
        specialties: [{ type: String, trim: true }],    // ej: ['clasica', 'jazz', 'pop']
        certifications: { type: String, default: '' },
        videoUrl: { type: String, default: '' },          // Video de presentación
        interviewDate: { type: Date, default: null },
        interviewNotes: { type: String, default: '' },
        approvedAt: { type: Date, default: null },
        rejectionReason: { type: String, default: '' }
    },

    // Para estudiantes: datos del journey
    studentData: {
        level: {
            type: String,
            enum: ['beginner', 'intermediate', 'advanced', null],
            default: null
        },
        goals: { type: String, default: '' },              // Qué quiere lograr
        preferredSchedule: { type: String, default: '' },   // Horarios preferidos
        budget: { type: String, default: '' },              // Rango de presupuesto
        demoDate: { type: Date, default: null },
        demoResult: {
            type: String,
            enum: ['interested', 'needs_time', 'not_interested', null],
            default: null
        },
        trialClassDate: { type: Date, default: null },
        trialClassTeacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        matchedTeacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
    }
}, {
    timestamps: true,
    collection: 'crm_leads'
});

// === ÍNDICES ===
crmLeadSchema.index({ segment: 1, createdAt: -1 });
crmLeadSchema.index({ lifecycleStage: 1 });
crmLeadSchema.index({ score: -1 });
crmLeadSchema.index({ 'attribution.firstTouch.channel': 1 });
crmLeadSchema.index({ tags: 1 });
crmLeadSchema.index({ pipelineStudent: 1 });
crmLeadSchema.index({ pipelineTeacher: 1 });
crmLeadSchema.index({ nextFollowUp: 1 });
crmLeadSchema.index({ 'tasks.status': 1, 'tasks.dueDate': 1 });

// === VIRTUALS ===

/**
 * Retorna la etapa del pipeline activo según el tipo de lead
 */
crmLeadSchema.virtual('currentPipelineStage').get(function() {
    return this.pipelineStudent || this.pipelineTeacher || this.lifecycleStage || 'lead';
});

/**
 * Retorna las tareas pendientes (no completadas ni canceladas)
 */
crmLeadSchema.virtual('pendingTasks').get(function() {
    if (!this.tasks) return [];
    return this.tasks.filter(t => t.status === 'pending' || t.status === 'overdue');
});

/**
 * Retorna true si el lead tiene tareas vencidas
 */
crmLeadSchema.virtual('hasOverdueTasks').get(function() {
    if (!this.tasks) return false;
    const now = new Date();
    return this.tasks.some(t => t.status === 'pending' && t.dueDate < now);
});

// === MÉTODOS ===

/**
 * Actualiza el score y registra en historial.
 * Limita historial a últimos 50 registros para evitar crecimiento ilimitado.
 */
crmLeadSchema.methods.updateScore = function(newScore, reason) {
    this.score = Math.max(0, Math.min(100, newScore));
    this.scoreHistory.push({ score: this.score, reason });
    
    // Limitar historial de score a 50 entradas
    if (this.scoreHistory.length > 50) {
        this.scoreHistory = this.scoreHistory.slice(-50);
    }
    
    // Auto-segmentar basado en score — NO sobreescribir 'customer' ni 'churned'
    const protectedSegments = ['customer', 'churned'];
    if (!protectedSegments.includes(this.segment)) {
        if (this.score >= 80) this.segment = 'hot';
        else if (this.score >= 50) this.segment = 'warm';
        else this.segment = 'cold';
    }
    
    return this.save();
};

/**
 * Avanza el pipeline del lead a la siguiente etapa.
 * Valida que la transición sea válida según el tipo.
 */
crmLeadSchema.methods.advancePipeline = function(newStage) {
    // Determinar tipo vía pipeline actual
    if (this.pipelineStudent !== null && this.pipelineStudent !== undefined) {
        const studentFlow = ['lead', 'contacted', 'demo_scheduled', 'demo_completed', 'trial_class', 'enrolled', 'lost'];
        if (!studentFlow.includes(newStage)) {
            throw new Error(`Etapa inválida para pipeline estudiante: ${newStage}`);
        }
        this.pipelineStudent = newStage;
        // Sincronizar lifecycleStage
        const stageMap = { lead: 'lead', contacted: 'mql', demo_scheduled: 'sql', demo_completed: 'sql', trial_class: 'opportunity', enrolled: 'customer', lost: 'lead' };
        this.lifecycleStage = stageMap[newStage] || 'lead';
    } else if (this.pipelineTeacher !== null && this.pipelineTeacher !== undefined) {
        const teacherFlow = ['lead', 'contacted', 'application_review', 'interview', 'onboarding', 'active', 'rejected'];
        if (!teacherFlow.includes(newStage)) {
            throw new Error(`Etapa inválida para pipeline profesor: ${newStage}`);
        }
        this.pipelineTeacher = newStage;
        const stageMap = { lead: 'lead', contacted: 'mql', application_review: 'sql', interview: 'sql', onboarding: 'opportunity', active: 'customer', rejected: 'lead' };
        this.lifecycleStage = stageMap[newStage] || 'lead';
    }

    // Manejar conversión
    if (newStage === 'enrolled' || newStage === 'active') {
        this.convertedAt = new Date();
        this.segment = 'customer';
    }

    return this.save();
};

/**
 * Marca el lead como perdido/rechazado con razón
 */
crmLeadSchema.methods.markLost = function(reason, details = '') {
    this.lostReason = { reason, details, lostAt: new Date() };
    if (this.pipelineStudent !== null && this.pipelineStudent !== undefined) {
        this.pipelineStudent = 'lost';
    } else if (this.pipelineTeacher !== null && this.pipelineTeacher !== undefined) {
        this.pipelineTeacher = 'rejected';
    }
    this.segment = 'churned';
    return this.save();
};

/**
 * Agrega una tarea de seguimiento al lead
 */
crmLeadSchema.methods.addTask = function(taskData) {
    this.tasks.push(taskData);
    // Actualizar nextFollowUp con la tarea pendiente más próxima
    this._updateNextFollowUp();
    return this.save();
};

/**
 * Completa una tarea por su ID
 */
crmLeadSchema.methods.completeTask = function(taskId) {
    const task = this.tasks.id(taskId);
    if (!task) throw new Error('Tarea no encontrada');
    task.status = 'completed';
    task.completedAt = new Date();
    this._updateNextFollowUp();
    return this.save();
};

/**
 * Recalcula nextFollowUp basado en tareas pendientes
 */
crmLeadSchema.methods._updateNextFollowUp = function() {
    const pendingTasks = this.tasks.filter(t => t.status === 'pending');
    if (pendingTasks.length === 0) {
        this.nextFollowUp = null;
    } else {
        pendingTasks.sort((a, b) => a.dueDate - b.dueDate);
        this.nextFollowUp = pendingTasks[0].dueDate;
    }
};

/**
 * Registra un nuevo touchpoint de atribución
 */
crmLeadSchema.methods.addTouchpoint = function(touchpointData) {
    const touchpoint = { ...touchpointData, timestamp: new Date() };
    
    if (this.attribution.touchpoints.length === 0) {
        this.attribution.firstTouch = touchpoint;
    }
    this.attribution.lastTouch = touchpoint;
    this.attribution.touchpoints.push(touchpoint);
    
    return this.save();
};

// === PRE-SAVE: Marcar tareas vencidas automáticamente ===
crmLeadSchema.pre('save', function(next) {
    if (this.tasks && this.tasks.length > 0) {
        const now = new Date();
        this.tasks.forEach(task => {
            if (task.status === 'pending' && task.dueDate < now) {
                task.status = 'overdue';
            }
        });
    }
    next();
});

// === STATICS ===

/**
 * Busca el CrmLead por referencia al Lead original
 */
crmLeadSchema.statics.findByLeadRef = function(leadId) {
    return this.findOne({ leadRef: leadId });
};

/**
 * Obtiene distribución de leads por segmento
 */
crmLeadSchema.statics.getSegmentDistribution = async function() {
    return this.aggregate([
        { $group: { _id: '$segment', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ]);
};

/**
 * Obtiene los top leads por score
 */
crmLeadSchema.statics.getTopLeads = function(limit = 10) {
    return this.find({ score: { $gt: 0 } })
        .sort({ score: -1 })
        .limit(limit)
        .populate('leadRef', 'name email type status');
};

/**
 * Obtiene leads con tareas pendientes o vencidas
 */
crmLeadSchema.statics.getLeadsWithPendingTasks = function(limit = 50) {
    return this.find({
        'tasks.status': { $in: ['pending', 'overdue'] }
    })
        .populate('leadRef', 'name email type')
        .sort({ nextFollowUp: 1 })
        .limit(limit)
        .lean();
};

/**
 * Obtiene leads sin seguimiento (sin tareas pendientes y no convertidos)
 */
crmLeadSchema.statics.getLeadsWithoutFollowUp = function(daysSinceLastActivity = 7) {
    const cutoff = new Date(Date.now() - daysSinceLastActivity * 24 * 60 * 60 * 1000);
    return this.find({
        nextFollowUp: null,
        segment: { $nin: ['customer', 'churned'] },
        updatedAt: { $lt: cutoff }
    })
        .populate('leadRef', 'name email type')
        .sort({ updatedAt: 1 })
        .lean();
};

/**
 * Distribución del pipeline de estudiantes
 */
crmLeadSchema.statics.getStudentPipelineDistribution = async function() {
    return this.aggregate([
        { $match: { pipelineStudent: { $ne: null } } },
        { $group: { _id: '$pipelineStudent', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ]);
};

/**
 * Distribución del pipeline de profesores
 */
crmLeadSchema.statics.getTeacherPipelineDistribution = async function() {
    return this.aggregate([
        { $match: { pipelineTeacher: { $ne: null } } },
        { $group: { _id: '$pipelineTeacher', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ]);
};

module.exports = mongoose.model('CrmLead', crmLeadSchema);
