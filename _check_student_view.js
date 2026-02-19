const mongoose = require('mongoose');
require('dotenv').config();

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const User = require('./models/User');
  const TeacherPackage = require('./models/TeacherPackage');
  
  const teacherId = '693dcdfb8189f12ab33f4747';
  const teacher = await User.findById(teacherId);
  
  // 1. Buscar en TeacherPackage (sistema nuevo)
  const dbPackages = await TeacherPackage.find({ teacherId, isActive: true }).sort({ isFeatured: -1, priceUSD: 1 });
  console.log('=== TeacherPackage collection ===');
  console.log('Cantidad:', dbPackages.length);
  dbPackages.forEach(p => {
    console.log(`  ${p.classCount} clases | $${(p.priceUSD/100).toFixed(2)} | ${p.validityDays}d`);
  });
  
  // 2. Fallback: teacherData.packages
  console.log('\n=== Fallback (teacherData.packages) ===');
  const hourlyRate = teacher.teacherData?.hourlyRate || 25;
  const teacherFee = teacher.teacherData?.plan === 'founder' ? 85 : 75;
  const studentPricePerClass = Math.round((hourlyRate / (teacherFee / 100)) * 100);
  console.log('hourlyRate:', hourlyRate, '| teacherFee:', teacherFee, '| studentPricePerClass:', studentPricePerClass, 'centavos');
  
  teacher.teacherData?.packages?.filter(p => p.isActive !== false).forEach(p => {
    const priceUSD = Math.round(studentPricePerClass * p.classes * (1 - (p.discountPercent || 0) / 100));
    const perClass = Math.round(studentPricePerClass * (1 - (p.discountPercent || 0) / 100));
    console.log(`  ${p.classes} clases | priceUSD: ${priceUSD} cents ($${(priceUSD/100).toFixed(2)}) | per class: ${perClass} cents ($${(perClass/100).toFixed(2)}) | validDays: ${p.validDays}`);
  });
  
  // 3. Lo que muestra el dashboard del profesor
  console.log('\n=== Dashboard profesor (my-rates) ===');
  const studentPrice = hourlyRate / (teacherFee / 100);
  teacher.teacherData?.packages?.forEach(p => {
    const pricePerClass = studentPrice * (1 - p.discountPercent / 100);
    const total = pricePerClass * p.classes;
    console.log(`  ${p.classes} clases | $${total.toFixed(2)} ($${pricePerClass.toFixed(2)}/clase) | ${p.validDays} días`);
  });
  
  // 4. Comparación: si hay discrepancia
  console.log('\n=== COMPARACIÓN ===');
  teacher.teacherData?.packages?.forEach(p => {
    const fallbackPrice = Math.round(studentPricePerClass * p.classes * (1 - (p.discountPercent || 0) / 100));
    const dashboardPrice = studentPrice * p.classes * (1 - p.discountPercent / 100);
    const diff = Math.abs((fallbackPrice / 100) - dashboardPrice);
    console.log(`  ${p.classes} clases: alumno=$${(fallbackPrice/100).toFixed(2)} | dashboard=$${dashboardPrice.toFixed(2)} | diff=$${diff.toFixed(2)}`);
  });
  
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
