/**
 * Script temporal: crear CrmLead y enrollar en secuencia Día 88
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');

(async () => {
  await connectDB();
  
  const Lead = require('./models/Lead');
  const CrmLead = require('./crm/models/CrmLead');
  const CrmSequence = require('./crm/models/CrmSequence');
  const CrmLeadService = require('./crm/services/CrmLeadService');
  const CrmSequenceService = require('./crm/services/CrmSequenceService');
  
  // 1) Obtener lead core
  const lead = await Lead.findOne({ email: 'miseal@ug.uchile.cl' });
  if (!lead) {
    console.log('Lead no encontrado');
    process.exit(1);
  }
  console.log('Lead core:', lead._id.toString(), 'type:', lead.type);
  
  // 2) Crear CrmLead si no existe
  let crmLead = await CrmLead.findOne({ email: 'miseal@ug.uchile.cl' });
  if (!crmLead) {
    const result = await CrmLeadService.findOrCreateFromCoreLead(lead._id, {
      channel: 'organic',
      utmSource: 'landing',
      utmMedium: 'comenzar',
      utmCampaign: 'dia88',
      landingPage: '/l/waitlist',
      tags: ['landing:waitlist']
    });
    if (result.success) {
      crmLead = result.data;
      console.log('CrmLead creado:', crmLead._id.toString());
    } else {
      console.error('Error creando CrmLead:', result.error);
      process.exit(1);
    }
  } else {
    console.log('CrmLead ya existía:', crmLead._id.toString());
  }
  
  // 3) Buscar secuencia Día 88
  const seq = await CrmSequence.findOne({ 
    name: /Día 88.*Nurturing/i, 
    status: 'active' 
  });
  if (!seq) {
    console.log('Secuencia activa no encontrada');
    process.exit(1);
  }
  console.log('Secuencia:', seq.name, seq._id.toString());
  
  // 4) Enrollar
  const enrollResult = await CrmSequenceService.enrollLead(seq._id, crmLead._id);
  console.log('Enrollment:', JSON.stringify(enrollResult, null, 2));
  
  // 5) Verificar
  const updated = await CrmLead.findById(crmLead._id);
  console.log('activeSequences:', JSON.stringify(updated.activeSequences, null, 2));
  
  await mongoose.disconnect();
  process.exit(0);
})();
