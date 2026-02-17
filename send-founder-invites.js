/**
 * send-founder-invites.js
 * Envía emails de invitación de Profesor Fundador a los leads pendientes.
 * 
 * Uso:
 *   node send-founder-invites.js              → Envía a todos los leads teacher no convertidos
 *   node send-founder-invites.js --dry-run    → Muestra qué se enviaría sin enviar
 *   node send-founder-invites.js --only=email → Envía solo a un email específico
 * 
 * Requiere: MONGO_URI y RESEND_API_KEY en .env
 */
const mongoose = require('mongoose');
require('dotenv').config();

const Lead = require('./models/Lead');
const User = require('./models/User');
const FounderInvite = require('./models/FounderInvite');
const emailService = require('./services/EmailService');

const DRY_RUN = process.argv.includes('--dry-run');
const ONLY_EMAIL = process.argv.find(a => a.startsWith('--only='))?.split('=')[1];
const BASE_URL = process.env.APP_URL || process.env.FRONTEND_URL || 'https://pianolink.net';

async function main() {
    console.log(`\n🎹 ENVÍO DE INVITACIONES — Profesores Fundadores`);
    console.log(`   Modo: ${DRY_RUN ? '🔍 DRY RUN' : '🚀 ENVÍO REAL'}`);
    if (ONLY_EMAIL) console.log(`   Filtro: solo ${ONLY_EMAIL}`);
    console.log('');

    await mongoose.connect(process.env.MONGO_URI);

    // Buscar leads elegibles
    const query = {
        type: 'teacher',
        status: { $nin: ['converted', 'rejected'] }
    };
    if (ONLY_EMAIL) query.email = ONLY_EMAIL;

    const leads = await Lead.find(query).sort({ createdAt: 1 });
    console.log(`   Leads elegibles: ${leads.length}\n`);

    if (leads.length === 0) {
        console.log('   No hay leads pendientes de invitación.');
        await mongoose.disconnect();
        return;
    }

    const results = { sent: [], skipped: [], failed: [] };

    for (const lead of leads) {
        const prefix = `   [${lead.name}]`;

        // Verificar si ya tiene cuenta
        const existingUser = await User.findOne({ email: lead.email });
        if (existingUser) {
            console.log(`${prefix} ⏭️  Ya tiene cuenta — omitido`);
            results.skipped.push({ name: lead.name, email: lead.email, reason: 'Ya tiene cuenta' });
            continue;
        }

        // Crear o recuperar invitación
        const invite = await FounderInvite.createForLead(lead);
        const inviteUrl = `${BASE_URL}/founder-invite/${invite.token}`;

        if (invite.status === 'sent') {
            console.log(`${prefix} ⏭️  Ya se envió invitación el ${invite.sentAt?.toLocaleDateString()} — omitido`);
            results.skipped.push({ name: lead.name, email: lead.email, reason: 'Ya enviada' });
            continue;
        }

        console.log(`${prefix} 📧 ${lead.email}`);
        console.log(`${prefix}    URL: ${inviteUrl}`);

        if (DRY_RUN) {
            results.sent.push({ name: lead.name, email: lead.email });
            continue;
        }

        try {
            // Enviar email
            const emailResult = await emailService.sendFounderInvitation({
                teacherName: lead.name,
                recipientEmail: lead.email,
                inviteUrl
            });

            // Marcar invitación como enviada
            await invite.markAsSent(emailResult?.id);

            // Actualizar status del lead
            if (lead.status === 'new') {
                lead.status = 'contacted';
                lead.contactedAt = new Date();
            }
            if (lead.addFollowUp) {
                await lead.addFollowUp('email_sent', 'Invitación Profesor Fundador enviada', 'pending');
            }
            await lead.save();

            console.log(`${prefix} ✅ Enviado (ID: ${emailResult?.id || 'sim'})`);
            results.sent.push({ name: lead.name, email: lead.email });

            // Rate limiting: 500ms entre envíos
            await new Promise(r => setTimeout(r, 500));

        } catch (error) {
            console.error(`${prefix} ❌ Error: ${error.message}`);
            results.failed.push({ name: lead.name, email: lead.email, error: error.message });
        }
    }

    // Resumen
    console.log('\n═══════════════════════════════════════════');
    console.log('   RESUMEN');
    console.log('═══════════════════════════════════════════');
    console.log(`   ✅ Enviados:  ${results.sent.length}`);
    console.log(`   ⏭️  Omitidos:  ${results.skipped.length}`);
    console.log(`   ❌ Fallidos:  ${results.failed.length}`);

    if (results.sent.length > 0) {
        console.log('\n   Enviados:');
        results.sent.forEach(r => console.log(`     • ${r.name} (${r.email})`));
    }
    if (results.skipped.length > 0) {
        console.log('\n   Omitidos:');
        results.skipped.forEach(r => console.log(`     • ${r.name} — ${r.reason}`));
    }
    if (results.failed.length > 0) {
        console.log('\n   Fallidos:');
        results.failed.forEach(r => console.log(`     • ${r.name} — ${r.error}`));
    }

    console.log('═══════════════════════════════════════════\n');

    await mongoose.disconnect();
}

main().catch(e => {
    console.error('💥 Error fatal:', e);
    process.exit(1);
});
