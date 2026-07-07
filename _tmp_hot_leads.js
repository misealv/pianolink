require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  const CrmLead = require('./crm/models/CrmLead');
  const CrmInteraction = require('./crm/models/CrmInteraction');

  // 1. Total leads activos
  const total = await CrmLead.countDocuments({
    'emailPreferences.bounced': { $ne: true },
    'emailPreferences.unsubscribed': { $ne: true }
  });

  // 2. Cuántos han recibido al menos 1 email
  const conEmail = await CrmLead.countDocuments({
    'emailEngagement.totalSent': { $gte: 1 },
    'emailPreferences.bounced': { $ne: true },
    'emailPreferences.unsubscribed': { $ne: true }
  });

  // 3. Distribución por engagement
  const dist = await CrmLead.aggregate([
    { $match: { 'emailPreferences.bounced': { $ne: true }, 'emailPreferences.unsubscribed': { $ne: true } } },
    { $group: { _id: '$emailEngagement.engagementLevel', count: { $sum: 1 }, avgScore: { $avg: '$score' } } },
    { $sort: { avgScore: -1 } }
  ]);

  // 4. Secuencia: cuántos leads en cada paso
  const seqDist = await CrmLead.aggregate([
    { $match: { 'activeSequences.0': { $exists: true } } },
    { $unwind: '$activeSequences' },
    { $match: { 'activeSequences.status': 'active' } },
    { $group: { _id: '$activeSequences.currentStep', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);

  // 5. Top 25 leads por score (los más calientes)
  const hot = await CrmLead.find({
    'emailPreferences.bounced': { $ne: true },
    'emailPreferences.unsubscribed': { $ne: true },
    score: { $gte: 15 }
  })
    .sort({ score: -1 })
    .limit(25)
    .select('nombre email score emailEngagement pipelineStage activeSequences')
    .lean();

  // 6. Leads que clickearon (señal más fuerte de interés)
  const clickers = await CrmLead.find({
    'emailPreferences.bounced': { $ne: true },
    'emailPreferences.unsubscribed': { $ne: true },
    'emailEngagement.totalClicked': { $gte: 1 }
  })
    .sort({ 'emailEngagement.totalClicked': -1 })
    .select('nombre email score emailEngagement pipelineStage')
    .lean();

  // 7. Emails enviados en los últimos 7 días
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const recentSent = await CrmInteraction.countDocuments({ type: 'email_sent', createdAt: { $gte: weekAgo } });
  const recentOpens = await CrmInteraction.countDocuments({ type: 'email_open', createdAt: { $gte: weekAgo } });
  const recentClicks = await CrmInteraction.countDocuments({ type: 'email_click', createdAt: { $gte: weekAgo } });

  // OUTPUT
  console.log('=== RESUMEN ENVÍOS PIANOLINK ===');
  console.log('Total leads activos:', total);
  console.log('Leads que han recibido ≥1 email:', conEmail);
  console.log('');
  console.log('DISTRIBUCIÓN POR ENGAGEMENT:');
  dist.forEach(d => console.log('  ' + (d._id || 'none') + ': ' + d.count + ' leads (score prom: ' + (d.avgScore || 0).toFixed(0) + ')'));

  console.log('');
  console.log('LEADS POR PASO DE SECUENCIA (activos):');
  seqDist.forEach(s => console.log('  Paso ' + s._id + ': ' + s.count + ' leads'));

  console.log('');
  console.log('ÚLTIMA SEMANA (16-23 mar):');
  console.log('  Emails enviados:', recentSent);
  console.log('  Opens:', recentOpens);
  console.log('  Clicks:', recentClicks);

  console.log('');
  console.log('=== LEADS QUE HAN CLICKEADO (señal más fuerte) ===');
  clickers.forEach(l => {
    const e = l.emailEngagement || {};
    console.log('  ' + l.score + 'pts | ' + (e.engagementLevel || '-') + ' | sent:' + (e.totalSent || 0) + ' open:' + (e.totalOpened || 0) + ' click:' + (e.totalClicked || 0) + ' | ' + (l.pipelineStage || 'nuevo') + ' | ' + (l.nombre || '-') + ' | ' + (l.email || '-'));
  });

  console.log('');
  console.log('=== TOP 25 LEADS POR SCORE ===');
  hot.forEach(l => {
    const e = l.emailEngagement || {};
    const sq = (l.activeSequences || []).find(s => s.status === 'active');
    console.log('  ' + l.score + 'pts | ' + (e.engagementLevel || '-') + ' | sent:' + (e.totalSent || 0) + ' open:' + (e.totalOpened || 0) + ' click:' + (e.totalClicked || 0) + ' | seq:' + (sq ? 'paso' + sq.currentStep : '-') + ' | ' + (l.pipelineStage || 'nuevo') + ' | ' + (l.nombre || '-') + ' | ' + (l.email || '-'));
  });

  await mongoose.disconnect();
})();
