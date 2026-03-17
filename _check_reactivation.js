require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI).then(async () => {
  require('./models/Lead');
  const CrmLead = require('./crm/models/CrmLead');

  const candidatos = await CrmLead.countDocuments({
    tags: { $nin: ['reactivation-sent','email_invalido','spam_complaint'] },
    'emailPreferences.unsubscribed': { $ne: true },
    'emailPreferences.bounced': { $ne: true },
    $or: [
      { 'emailEngagement.totalSent': { $exists: false } },
      { 'emailEngagement.totalSent': 0 },
      { 'emailEngagement.totalSent': null }
    ]
  });

  const yaEnviados = await CrmLead.countDocuments({ tags: 'reactivation-sent' });

  const sample = await CrmLead.find({
    tags: { $nin: ['reactivation-sent','email_invalido','spam_complaint'] },
    'emailPreferences.unsubscribed': { $ne: true },
    'emailPreferences.bounced': { $ne: true },
    $or: [
      { 'emailEngagement.totalSent': { $exists: false } },
      { 'emailEngagement.totalSent': 0 },
      { 'emailEngagement.totalSent': null }
    ]
  }).populate('leadRef','email name').limit(10).lean();

  let validos = 0, placeholders = 0, sinRef = 0;
  for (const s of sample) {
    if (!s.leadRef) { sinRef++; continue; }
    if (s.leadRef.email && s.leadRef.email.includes('placeholder')) { placeholders++; continue; }
    if (s.leadRef.email) { validos++; console.log('  OK:', s.leadRef.email, '-', s.leadRef.name); }
  }

  console.log('\n=== REACTIVACIÓN ===');
  console.log('Candidatos pendientes:', candidatos);
  console.log('Ya enviados:', yaEnviados);
  console.log('Muestra (10): validos=' + validos, 'placeholders=' + placeholders, 'sinRef=' + sinRef);
  console.log('RESEND_API_KEY:', process.env.RESEND_API_KEY ? 'SI' : 'NO');
  console.log('RESEND_WEBHOOK_SECRET:', process.env.RESEND_WEBHOOK_SECRET ? 'SI' : 'NO');
  
  await mongoose.disconnect();
}).catch(e => { console.error('ERR:', e.message); process.exit(1); });
