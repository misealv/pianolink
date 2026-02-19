const mongoose = require('mongoose');
require('dotenv').config();

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const User = require('./models/User');
  const teacher = await User.findById('693dcdfb8189f12ab33f4747');
  console.log('hourlyRate:', teacher.teacherData?.hourlyRate);
  console.log('plan:', teacher.teacherData?.plan);
  const teacherFee = teacher.teacherData?.plan === 'founder' ? 85 : 75;
  const base = Math.round((teacher.teacherData?.hourlyRate / (teacherFee / 100)) * 100);
  console.log('teacherFee:', teacherFee);
  console.log('basePricePerClass:', base, '→ $' + (base/100).toFixed(2));
  teacher.teacherData?.packages?.forEach(p => {
    const total = Math.round(base * p.classes * (1 - (p.discountPercent || 0) / 100));
    console.log(`  ${p.classes}cl: $${(total/100).toFixed(0)} | ${p.discountPercent}% | ${p.validDays}d`);
  });
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
