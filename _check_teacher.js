const mongoose = require('mongoose');
require('dotenv').config();

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const User = require('./models/User');
  const teacher = await User.findById('693dcdfb8189f12ab33f4747');
  console.log('hourlyRate:', teacher.teacherData?.hourlyRate);
  console.log('plan:', teacher.teacherData?.plan);
  console.log('packages:');
  teacher.teacherData?.packages?.forEach((p, i) => {
    console.log(`  [${i}] classes=${p.classes} discount=${p.discountPercent}% validDays=${p.validDays} isActive=${p.isActive} _id=${p._id}`);
  });
  
  // Simular el cálculo del fallback
  const hourlyRate = teacher.teacherData?.hourlyRate || 25;
  const teacherFee = teacher.teacherData?.plan === 'founder' ? 85 : 75;
  const studentPricePerClass = Math.round((hourlyRate / (teacherFee / 100)) * 100);
  console.log('\n=== CALCULO FALLBACK ===');
  console.log('hourlyRate:', hourlyRate, 'teacherFee:', teacherFee, '%');
  console.log('studentPricePerClass (centavos):', studentPricePerClass);
  console.log('studentPricePerClass (USD):', studentPricePerClass / 100);
  
  teacher.teacherData?.packages?.forEach(p => {
    const totalCents = Math.round(studentPricePerClass * p.classes * (1 - (p.discountPercent || 0) / 100));
    const perClassCents = Math.round(studentPricePerClass * (1 - (p.discountPercent || 0) / 100));
    console.log(`  ${p.classes} clases: total=${totalCents} centavos ($${(totalCents/100).toFixed(2)}) | perClass=${perClassCents} centavos ($${(perClassCents/100).toFixed(2)}) | validDays=${p.validDays}`);
  });
  
  // Lo que muestra el dashboard del profesor
  console.log('\n=== LO QUE MUESTRA EL DASHBOARD ===');
  teacher.teacherData?.packages?.forEach(p => {
    const pricePerClass = hourlyRate / (teacherFee / 100);
    const discounted = pricePerClass * (1 - (p.discountPercent || 0) / 100);
    const total = discounted * p.classes;
    console.log(`  ${p.classes} clases: $${Math.round(total)} ($${discounted.toFixed(2)}/clase) | ${p.validDays} días`);
  });
  
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
