const mongoose = require('mongoose');
require('dotenv').config();

async function check() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const fs = require('fs');
  const models = fs.readdirSync('./models').filter(f => f.endsWith('.js'));
  console.log('Modelos:', models.join(', '));
  
  const omarId = '699659eb02fb6a0b455f5ea9';
  
  // StudentSubscription
  const SS = require('./models/StudentSubscription');
  const subs = await SS.find({ studentId: omarId });
  console.log('\n=== StudentSubscription ===');
  subs.forEach(s => console.log(JSON.stringify(s.toObject(), null, 2)));
  if (!subs.length) console.log('(ninguna)');
  
  // WelcomeKit
  try {
    const WK = require('./models/WelcomeKit');
    const kits = await WK.find({ userId: omarId });
    console.log('\n=== WelcomeKit (userId) ===');
    kits.forEach(k => console.log(JSON.stringify(k.toObject(), null, 2)));
    if (!kits.length) {
      const kits2 = await WK.find({ studentId: omarId });
      console.log('=== WelcomeKit (studentId) ===');
      kits2.forEach(k => console.log(JSON.stringify(k.toObject(), null, 2)));
    }
  } catch(e) {
    console.log('No WelcomeKit model:', e.message);
  }

  // Revisar qué devuelve /api/client/me para Omar
  // Simular la lógica de myKit
  const sub = await SS.findOne({ studentId: omarId }).sort({ createdAt: -1 });
  if (sub) {
    console.log('\n=== Kit/Sub más reciente ===');
    console.log('overallStatus:', sub.overallStatus);
    console.log('status:', sub.status);
    console.log('kitType:', sub.kitType);
    console.log('trialClass:', JSON.stringify(sub.trialClass, null, 2));
  }

  process.exit(0);
}
check().catch(e => { console.error(e); process.exit(1); });
