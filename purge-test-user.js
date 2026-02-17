/**
 * Script para borrar TODOS los registros asociados a un email.
 * Uso: node purge-test-user.js <email>
 * Ejemplo: node purge-test-user.js miseal@ug.uchile.cl
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');

// Modelos core
const User = require('./models/User');
const Lead = require('./models/Lead');
const Payment = require('./models/Payment');
const WelcomeKit = require('./models/WelcomeKit');
const Coupon = require('./models/Coupon');
const OnboardingSlot = require('./models/OnboardingSlot');

// Modelos CRM
const CrmLead = require('./crm/models/CrmLead');
const CrmInteraction = require('./crm/models/CrmInteraction');
const CrmConversion = require('./crm/models/CrmConversion');

async function purge(email) {
  console.log(`\n🔍 Buscando registros para: ${email}\n`);

  // 1. Buscar User
  const user = await User.findOne({ email });
  const userId = user?._id;
  console.log(`  User: ${user ? user._id : 'no encontrado'}`);

  // 2. Buscar Lead
  const lead = await Lead.findOne({ email });
  const leadId = lead?._id;
  console.log(`  Lead: ${lead ? lead._id : 'no encontrado'}`);

  // 3. Buscar CrmLead
  let crmLead = null;
  if (leadId) {
    crmLead = await CrmLead.findOne({ leadRef: leadId });
  }
  if (!crmLead) {
    crmLead = await CrmLead.findOne({ email });
  }
  const crmLeadId = crmLead?._id;
  console.log(`  CrmLead: ${crmLead ? crmLead._id : 'no encontrado'}`);

  // --- Borrar en orden inverso de dependencia ---
  const results = [];

  // CRM
  if (crmLeadId) {
    const r1 = await CrmInteraction.deleteMany({ leadRef: crmLeadId });
    results.push(`  CrmInteraction: ${r1.deletedCount} borrados`);

    const r2 = await CrmConversion.deleteMany({ leadRef: crmLeadId });
    results.push(`  CrmConversion: ${r2.deletedCount} borrados`);

    await CrmLead.deleteOne({ _id: crmLeadId });
    results.push(`  CrmLead: 1 borrado`);
  }

  // Payments (por email y por userId)
  const paymentQuery = { $or: [{ leadEmail: email }] };
  if (userId) paymentQuery.$or.push({ userId });
  const r3 = await Payment.deleteMany(paymentQuery);
  results.push(`  Payment: ${r3.deletedCount} borrados`);

  // WelcomeKit (por email y por clientId)
  const wkQuery = { $or: [{ clientEmail: email }] };
  if (userId) wkQuery.$or.push({ clientId: userId }, { beneficiaryId: userId });
  const r4 = await WelcomeKit.deleteMany(wkQuery);
  results.push(`  WelcomeKit: ${r4.deletedCount} borrados`);

  // Coupons
  const couponQuery = { $or: [{ assignedToEmail: email }] };
  if (userId) couponQuery.$or.push({ assignedToUserId: userId });
  const r5 = await Coupon.deleteMany(couponQuery);
  results.push(`  Coupon: ${r5.deletedCount} borrados`);

  // OnboardingSlot
  const r6 = await OnboardingSlot.deleteMany({ 'booking.clientEmail': email });
  results.push(`  OnboardingSlot: ${r6.deletedCount} borrados`);

  // Lead
  if (lead) {
    await Lead.deleteOne({ _id: leadId });
    results.push(`  Lead: 1 borrado`);
  }

  // User (al final)
  if (user) {
    await User.deleteOne({ _id: userId });
    results.push(`  User: 1 borrado`);
  }

  console.log(`\n📋 Resultados:\n${results.join('\n')}`);
  console.log(`\n✅ Purga completa para ${email}\n`);
}

(async () => {
  const email = process.argv[2];
  if (!email) {
    console.error('Uso: node purge-test-user.js <email>');
    process.exit(1);
  }

  await connectDB();
  await purge(email);
  await mongoose.disconnect();
  process.exit(0);
})();
