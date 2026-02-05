const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const DiagnosticAudit = require('./models/DiagnosticAudit');
  
  const audit = await DiagnosticAudit.findOne({ status: 'active' }).sort({ startedAt: -1 });
  
  if (!audit) {
    console.log('No hay auditoría activa');
    process.exit(0);
  }
  
  console.log('=== AUDITORÍA ACTIVA ===');
  console.log('ID:', audit.auditId);
  console.log('Inicio:', audit.startedAt);
  console.log('Eventos totales:', audit.events?.length || 0);
  console.log('');
  console.log('=== ÚLTIMOS 15 EVENTOS ===');
  
  const lastEvents = (audit.events || []).slice(-15);
  lastEvents.forEach(e => {
    const data = JSON.stringify(e.data || {}).substring(0, 80);
    console.log(`[${new Date(e.timestamp).toLocaleTimeString()}] ${e.category}:${e.type} ${data}`);
  });
  
  console.log('');
  console.log('=== RESUMEN POR CATEGORÍA ===');
  const categories = {};
  (audit.events || []).forEach(e => {
    categories[e.category] = (categories[e.category] || 0) + 1;
  });
  Object.entries(categories).forEach(([cat, count]) => {
    console.log(`  ${cat}: ${count}`);
  });
  
  process.exit(0);
}).catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
