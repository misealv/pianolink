/**
 * scripts/seedTestTeachers.js
 * 
 * Crea 10 profesores de prueba con:
 * - Perfiles completos (foto, bio, especialidades, idiomas)
 * - Diferentes países (AR, MX, CL, CO, PE, UY, EC, VE, ES, CR)
 * - Diferentes precios y paquetes de 4, 8 y 12 clases
 * - Disponibilidades variadas para probar filtros
 * - Clase de prueba habilitada
 * 
 * Uso: node scripts/seedTestTeachers.js
 * Para limpiar: node scripts/seedTestTeachers.js --clean
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const TeacherPackage = require('../models/TeacherPackage');
const AvailabilityTemplate = require('../models/AvailabilityTemplate');

// ==================== DATOS DE PROFESORES ====================
const teachers = [
  {
    name: 'María',
    lastName: 'González',
    email: 'maria.gonzalez@test.pianolink.com',
    country: 'Argentina',
    countryCode: 'AR',
    timezone: 'America/Argentina/Buenos_Aires',
    flag: '🇦🇷 Argentina',
    hourlyRate: 20,
    specialties: ['clásico', 'tango', 'niños'],
    languages: ['español', 'inglés'],
    experience: 'Pianista concertista egresada del Conservatorio Nacional de Buenos Aires. 12 años de experiencia docente con niños y adultos. Especialista en repertorio clásico y tango argentino.',
    education: 'Licenciatura en Piano - Conservatorio Nacional de Música, Buenos Aires. Masterclass con Martha Argerich.',
    bio: 'Apasionada por transmitir la música a nuevas generaciones. Mi método combina técnica clásica con el sentimiento del tango.',
    profilePhotoUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop&crop=face',
    videoUrl: 'https://www.youtube.com/watch?v=example1',
    packages: [
      { classes: 4, discountPercent: 5 },
      { classes: 8, discountPercent: 10 },
      { classes: 12, discountPercent: 15 }
    ],
    // Lunes a viernes mañana (9-13)
    availability: [
      { dayOfWeek: 1, startTime: '09:00', endTime: '13:00' },
      { dayOfWeek: 2, startTime: '09:00', endTime: '13:00' },
      { dayOfWeek: 3, startTime: '09:00', endTime: '13:00' },
      { dayOfWeek: 4, startTime: '09:00', endTime: '13:00' },
      { dayOfWeek: 5, startTime: '09:00', endTime: '13:00' }
    ]
  },
  {
    name: 'Carlos',
    lastName: 'Ramírez',
    email: 'carlos.ramirez@test.pianolink.com',
    country: 'México',
    countryCode: 'MX',
    timezone: 'America/Mexico_City',
    flag: '🇲🇽 México',
    hourlyRate: 18,
    specialties: ['jazz', 'blues', 'improvisación'],
    languages: ['español', 'inglés'],
    experience: 'Músico de jazz con 15 años tocando en vivo en Ciudad de México. Profesor de improvisación y armonía jazz en varias escuelas.',
    education: 'Berklee College of Music (online program). Diplomado en Jazz - UNAM.',
    bio: 'El jazz es libertad. Te enseño a expresarte con las teclas, no solo a leer partituras.',
    profilePhotoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=face',
    videoUrl: 'https://www.youtube.com/watch?v=example2',
    packages: [
      { classes: 4, discountPercent: 0 },
      { classes: 8, discountPercent: 8 },
      { classes: 12, discountPercent: 12 }
    ],
    // Tarde-noche (16-21) Lun, Mié, Vie
    availability: [
      { dayOfWeek: 1, startTime: '16:00', endTime: '21:00' },
      { dayOfWeek: 3, startTime: '16:00', endTime: '21:00' },
      { dayOfWeek: 5, startTime: '16:00', endTime: '21:00' }
    ]
  },
  {
    name: 'Valentina',
    lastName: 'Muñoz',
    email: 'valentina.munoz@test.pianolink.com',
    country: 'Chile',
    countryCode: 'CL',
    timezone: 'America/Santiago',
    flag: '🇨🇱 Chile',
    hourlyRate: 25,
    specialties: ['clásico', 'teoría musical', 'preparación exámenes'],
    languages: ['español', 'francés'],
    experience: 'Profesora de piano clásico con 8 años de experiencia. Preparo alumnos para exámenes ABRSM y Trinity College.',
    education: 'Magíster en Interpretación Musical - Universidad de Chile. Certificación ABRSM Teaching Diploma.',
    bio: 'Creo en la disciplina con cariño. Cada alumno tiene su propio ritmo de aprendizaje.',
    profilePhotoUrl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop&crop=face',
    videoUrl: 'https://www.youtube.com/watch?v=example3',
    packages: [
      { classes: 4, discountPercent: 5 },
      { classes: 8, discountPercent: 12 },
      { classes: 12, discountPercent: 18 }
    ],
    // Mañana y tarde Lun-Sáb
    availability: [
      { dayOfWeek: 1, startTime: '08:00', endTime: '12:00' },
      { dayOfWeek: 1, startTime: '15:00', endTime: '19:00' },
      { dayOfWeek: 2, startTime: '08:00', endTime: '12:00' },
      { dayOfWeek: 3, startTime: '08:00', endTime: '12:00' },
      { dayOfWeek: 3, startTime: '15:00', endTime: '19:00' },
      { dayOfWeek: 4, startTime: '08:00', endTime: '12:00' },
      { dayOfWeek: 5, startTime: '08:00', endTime: '12:00' },
      { dayOfWeek: 5, startTime: '15:00', endTime: '19:00' },
      { dayOfWeek: 6, startTime: '10:00', endTime: '14:00' }
    ]
  },
  {
    name: 'Andrés',
    lastName: 'Medina',
    email: 'andres.medina@test.pianolink.com',
    country: 'Colombia',
    countryCode: 'CO',
    timezone: 'America/Bogota',
    flag: '🇨🇴 Colombia',
    hourlyRate: 15,
    specialties: ['pop', 'acompañamiento', 'principiantes'],
    languages: ['español'],
    experience: 'Tecladista profesional de bandas de pop y cumbia. 6 años enseñando piano a principiantes y nivel intermedio.',
    education: 'Profesional en Música - Universidad Javeriana, Bogotá. Curso de Pedagogía Musical Suzuki.',
    bio: '¡Aprender piano es más fácil de lo que crees! Te enseño tus canciones favoritas desde la primera clase.',
    profilePhotoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop&crop=face',
    videoUrl: 'https://www.youtube.com/watch?v=example4',
    packages: [
      { classes: 4, discountPercent: 0 },
      { classes: 8, discountPercent: 5 },
      { classes: 12, discountPercent: 10 }
    ],
    // Solo tardes (14-20) Lun-Jue
    availability: [
      { dayOfWeek: 1, startTime: '14:00', endTime: '20:00' },
      { dayOfWeek: 2, startTime: '14:00', endTime: '20:00' },
      { dayOfWeek: 3, startTime: '14:00', endTime: '20:00' },
      { dayOfWeek: 4, startTime: '14:00', endTime: '20:00' }
    ]
  },
  {
    name: 'Lucía',
    lastName: 'Torres',
    email: 'lucia.torres@test.pianolink.com',
    country: 'Perú',
    countryCode: 'PE',
    timezone: 'America/Lima',
    flag: '🇵🇪 Perú',
    hourlyRate: 22,
    specialties: ['clásico', 'romántico', 'adultos mayores'],
    languages: ['español', 'inglés', 'portugués'],
    experience: 'Concertista y profesora con 10 años de trayectoria. Especialista en enseñanza a adultos y tercera edad.',
    education: 'Conservatorio Nacional de Música de Lima. Postgrado en Pedagogía Musical - Universidad de São Paulo.',
    bio: 'Nunca es tarde para empezar. He visto alumnos de 70 años tocar Chopin en 2 años.',
    profilePhotoUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=400&fit=crop&crop=face',
    videoUrl: 'https://www.youtube.com/watch?v=example5',
    packages: [
      { classes: 4, discountPercent: 5 },
      { classes: 8, discountPercent: 10 },
      { classes: 12, discountPercent: 20 }
    ],
    // Mañanas Lun-Vie + Sábado completo
    availability: [
      { dayOfWeek: 1, startTime: '07:00', endTime: '12:00' },
      { dayOfWeek: 2, startTime: '07:00', endTime: '12:00' },
      { dayOfWeek: 3, startTime: '07:00', endTime: '12:00' },
      { dayOfWeek: 4, startTime: '07:00', endTime: '12:00' },
      { dayOfWeek: 5, startTime: '07:00', endTime: '12:00' },
      { dayOfWeek: 6, startTime: '09:00', endTime: '18:00' }
    ]
  },
  {
    name: 'Federico',
    lastName: 'Larrea',
    email: 'federico.larrea@test.pianolink.com',
    country: 'Uruguay',
    countryCode: 'UY',
    timezone: 'America/Montevideo',
    flag: '🇺🇾 Uruguay',
    hourlyRate: 30,
    specialties: ['clásico', 'composición', 'avanzado'],
    languages: ['español', 'italiano', 'inglés'],
    experience: 'Compositor y concertista internacional. Ganador del Concurso Chopin de Sudamérica 2018. 20 años de docencia.',
    education: 'Doctorado en Música - Conservatorio Giuseppe Verdi, Milán. Licenciatura - Universidad de la República, Montevideo.',
    bio: 'La música clásica es un universo infinito. Te acompaño a descubrirlo nota por nota.',
    profilePhotoUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=400&fit=crop&crop=face',
    videoUrl: 'https://www.youtube.com/watch?v=example6',
    packages: [
      { classes: 4, discountPercent: 0 },
      { classes: 8, discountPercent: 10 },
      { classes: 12, discountPercent: 15 }
    ],
    // Pocas horas - exclusivo (Martes y Jueves tarde)
    availability: [
      { dayOfWeek: 2, startTime: '17:00', endTime: '20:00' },
      { dayOfWeek: 4, startTime: '17:00', endTime: '20:00' }
    ]
  },
  {
    name: 'Daniela',
    lastName: 'Paredes',
    email: 'daniela.paredes@test.pianolink.com',
    country: 'Ecuador',
    countryCode: 'EC',
    timezone: 'America/Guayaquil',
    flag: '🇪🇨 Ecuador',
    hourlyRate: 16,
    specialties: ['niños', 'método Suzuki', 'iniciación musical'],
    languages: ['español'],
    experience: 'Especialista en enseñanza musical infantil con metodología Suzuki. 7 años trabajando con niños de 4 a 12 años.',
    education: 'Licenciatura en Educación Musical - Universidad de las Artes, Guayaquil. Certificación Suzuki Nivel 3.',
    bio: '¡Los niños aprenden jugando! Mis clases son interactivas, divertidas y llenas de música.',
    profilePhotoUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&h=400&fit=crop&crop=face',
    videoUrl: 'https://www.youtube.com/watch?v=example7',
    packages: [
      { classes: 4, discountPercent: 5 },
      { classes: 8, discountPercent: 10 },
      { classes: 12, discountPercent: 15 }
    ],
    // Mañanas y primeras horas de la tarde Lun-Vie
    availability: [
      { dayOfWeek: 1, startTime: '08:00', endTime: '14:00' },
      { dayOfWeek: 2, startTime: '08:00', endTime: '14:00' },
      { dayOfWeek: 3, startTime: '08:00', endTime: '14:00' },
      { dayOfWeek: 4, startTime: '08:00', endTime: '14:00' },
      { dayOfWeek: 5, startTime: '08:00', endTime: '14:00' }
    ]
  },
  {
    name: 'Ricardo',
    lastName: 'Blanco',
    email: 'ricardo.blanco@test.pianolink.com',
    country: 'Venezuela',
    countryCode: 'VE',
    timezone: 'America/Caracas',
    flag: '🇻🇪 Venezuela',
    hourlyRate: 17,
    specialties: ['latin', 'salsa', 'música popular'],
    languages: ['español', 'inglés'],
    experience: 'Pianista del Sistema Nacional de Orquestas de Venezuela. 9 años de experiencia enseñando música latina y popular.',
    education: 'Estudios en el Sistema Nacional de Orquestas Juveniles, Caracas. Diplomado en Arreglos - Berklee Online.',
    bio: 'La música latina tiene un sabor especial en el piano. Te enseño a sentir el ritmo con las manos.',
    profilePhotoUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=400&fit=crop&crop=face',
    videoUrl: 'https://www.youtube.com/watch?v=example8',
    packages: [
      { classes: 4, discountPercent: 0 },
      { classes: 8, discountPercent: 7 },
      { classes: 12, discountPercent: 12 }
    ],
    // Noches Lun-Vie + Domingos mañana
    availability: [
      { dayOfWeek: 1, startTime: '19:00', endTime: '23:00' },
      { dayOfWeek: 2, startTime: '19:00', endTime: '23:00' },
      { dayOfWeek: 3, startTime: '19:00', endTime: '23:00' },
      { dayOfWeek: 4, startTime: '19:00', endTime: '23:00' },
      { dayOfWeek: 5, startTime: '19:00', endTime: '23:00' },
      { dayOfWeek: 0, startTime: '09:00', endTime: '13:00' }
    ]
  },
  {
    name: 'Elena',
    lastName: 'Martín',
    email: 'elena.martin@test.pianolink.com',
    country: 'España',
    countryCode: 'ES',
    timezone: 'Europe/Madrid',
    flag: '🇪🇸 España',
    hourlyRate: 35,
    specialties: ['clásico', 'barroco', 'clavecín'],
    languages: ['español', 'francés', 'inglés', 'alemán'],
    experience: 'Profesora del Real Conservatorio de Madrid con 18 años de carrera. Especialista en repertorio barroco y clásico.',
    education: 'Título Superior de Piano - Real Conservatorio Superior de Música de Madrid. Máster en Musicología - Sorbonne, París.',
    bio: 'Desde Bach hasta Debussy, el piano es el instrumento más completo. Formación rigurosa con alma.',
    profilePhotoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=400&fit=crop&crop=face',
    videoUrl: 'https://www.youtube.com/watch?v=example9',
    packages: [
      { classes: 4, discountPercent: 5 },
      { classes: 8, discountPercent: 12 },
      { classes: 12, discountPercent: 20 }
    ],
    // Horario europeo: mañanas (diferencia horaria con LATAM = tardes allá)
    availability: [
      { dayOfWeek: 1, startTime: '10:00', endTime: '14:00' },
      { dayOfWeek: 2, startTime: '10:00', endTime: '14:00' },
      { dayOfWeek: 2, startTime: '16:00', endTime: '20:00' },
      { dayOfWeek: 3, startTime: '10:00', endTime: '14:00' },
      { dayOfWeek: 4, startTime: '10:00', endTime: '14:00' },
      { dayOfWeek: 4, startTime: '16:00', endTime: '20:00' },
      { dayOfWeek: 5, startTime: '10:00', endTime: '14:00' }
    ]
  },
  {
    name: 'José Pablo',
    lastName: 'Solano',
    email: 'josepablo.solano@test.pianolink.com',
    country: 'Costa Rica',
    countryCode: 'CR',
    timezone: 'America/Costa_Rica',
    flag: '🇨🇷 Costa Rica',
    hourlyRate: 19,
    specialties: ['contemporáneo', 'producción musical', 'teclados'],
    languages: ['español', 'inglés'],
    experience: 'Productor musical y tecladista con experiencia en bandas internacionales. 5 años enseñando piano y producción.',
    education: 'Producción Musical - SAE Institute. Estudios de Piano - Universidad de Costa Rica.',
    bio: 'El piano moderno va más allá de las teclas. Te enseño a producir, grabar y crear tu propia música.',
    profilePhotoUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&h=400&fit=crop&crop=face',
    videoUrl: 'https://www.youtube.com/watch?v=example10',
    packages: [
      { classes: 4, discountPercent: 0 },
      { classes: 8, discountPercent: 8 },
      { classes: 12, discountPercent: 15 }
    ],
    // Fines de semana intensivos + Miércoles noche
    availability: [
      { dayOfWeek: 3, startTime: '19:00', endTime: '22:00' },
      { dayOfWeek: 6, startTime: '09:00', endTime: '18:00' },
      { dayOfWeek: 0, startTime: '09:00', endTime: '18:00' }
    ]
  }
];

// ==================== FUNCIONES AUXILIARES ====================

/**
 * Genera slug único a partir del nombre
 */
function generateSlug(name, lastName) {
  const base = `${name}-${lastName}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `prof-${base}`;
}

/**
 * Calcula precio del paquete (en centavos USD)
 */
function calcPackagePrice(hourlyRate, classCount, discountPercent) {
  const basePrice = hourlyRate * classCount * 100; // en centavos
  const discount = Math.round(basePrice * discountPercent / 100);
  return basePrice - discount;
}

// ==================== SEED PRINCIPAL ====================

async function seedTeachers() {
  try {
    // Conectar a MongoDB
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      console.error('❌ MONGO_URI no configurada en .env');
      process.exit(1);
    }

    mongoose.set('strictQuery', false);
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Conectado a MongoDB');

    // Verificar flag --clean
    if (process.argv.includes('--clean')) {
      await cleanTestTeachers();
      await mongoose.disconnect();
      return;
    }

    const createdTeachers = [];
    const password = await bcrypt.hash('PianoTest2026!', 10);

    for (const t of teachers) {
      // Verificar si ya existe
      const existing = await User.findOne({ email: t.email });
      if (existing) {
        console.log(`⏭️  ${t.name} ${t.lastName} ya existe (${t.email})`);
        createdTeachers.push(existing);
        continue;
      }

      const slug = generateSlug(t.name, t.lastName);

      // Crear usuario profesor
      const user = new User({
        name: t.name,
        lastName: t.lastName,
        email: t.email,
        password: password,
        whatsapp: `+${Math.floor(Math.random() * 9000000000) + 1000000000}`,
        country: t.country,
        timezone: t.timezone,
        role: 'teacher',
        slug: slug,
        isFounder: false,
        branding: {
          country: t.flag,
          profilePhotoUrl: t.profilePhotoUrl,
          bio: t.bio
        },
        teacherData: {
          subscriptionStatus: 'active',
          subscriptionExpiresAt: new Date('2027-12-31'),
          hourlyRate: t.hourlyRate,
          packages: t.packages.map(p => ({
            classes: p.classes,
            discountPercent: p.discountPercent,
            isActive: true
          })),
          profile: {
            isPublic: true,
            specialties: t.specialties,
            experience: t.experience,
            education: t.education,
            languages: t.languages,
            videoUrl: t.videoUrl,
            acceptsTrialClass: true
          },
          commissionPercent: 80,
          paymentInfo: {
            country: t.countryCode,
            method: 'mercadopago',
            isVerified: true,
            verifiedAt: new Date()
          }
        }
      });

      // Guardar sin trigger de bcrypt (ya hasheamos antes)
      user.$__.$options = user.$__.$options || {};
      const saved = await user.save();
      console.log(`✅ Profesor creado: ${t.name} ${t.lastName} (${t.country}) - $${t.hourlyRate}/clase`);

      // Crear paquetes en TeacherPackage
      for (const pkg of t.packages) {
        const price = calcPackagePrice(t.hourlyRate, pkg.classes, pkg.discountPercent);
        const pricePerClass = Math.round(price / pkg.classes);
        
        await TeacherPackage.create({
          teacherId: saved._id,
          category: 'piano',
          name: `Paquete ${pkg.classes} clases de Piano`,
          description: `${pkg.classes} clases de piano de 45 minutos${pkg.discountPercent > 0 ? ` con ${pkg.discountPercent}% de descuento` : ''}`,
          classCount: pkg.classes,
          classDurationMinutes: 45,
          priceUSD: price,
          pricePerClassUSD: pricePerClass,
          validityDays: pkg.classes <= 4 ? 30 : pkg.classes <= 8 ? 60 : 90,
          isRecurring: true,
          billingCycleDays: pkg.classes <= 4 ? 30 : pkg.classes <= 8 ? 60 : 90,
          isActive: true,
          isFeatured: pkg.classes === 8 // El paquete de 8 es el destacado
        });
      }
      console.log(`   📦 ${t.packages.length} paquetes creados`);

      // Crear plantilla de disponibilidad
      await AvailabilityTemplate.create({
        teacherId: saved._id,
        name: 'Horario Regular',
        timezone: t.timezone,
        bufferMinutes: 10,
        defaultDuration: 45,
        weeklySlots: t.availability.map(a => ({
          dayOfWeek: a.dayOfWeek,
          startTime: a.startTime,
          endTime: a.endTime,
          slotDuration: 45,
          maxStudents: 1,
          isActive: true
        })),
        exceptions: [],
        isActive: true
      });
      console.log(`   📅 Disponibilidad configurada (${t.availability.length} bloques semanales)`);

      createdTeachers.push(saved);
    }

    // ==================== RESUMEN ====================
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMEN DE PROFESORES DE PRUEBA');
    console.log('='.repeat(60));
    console.log(`Total: ${createdTeachers.length} profesores\n`);

    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    for (let i = 0; i < teachers.length; i++) {
      const t = teachers[i];
      const days = [...new Set(t.availability.map(a => dayNames[a.dayOfWeek]))].join(', ');
      console.log(`${i + 1}. ${t.name} ${t.lastName}`);
      console.log(`   🌍 ${t.flag} | 💰 $${t.hourlyRate}/clase`);
      console.log(`   🎹 ${t.specialties.join(', ')}`);
      console.log(`   📅 ${days}`);
      console.log(`   📧 ${t.email} | 🔑 PianoTest2026!`);
      console.log('');
    }

    console.log('='.repeat(60));
    console.log('🔑 Contraseña para todos: PianoTest2026!');
    console.log('='.repeat(60));

    await mongoose.disconnect();
    console.log('\n✅ Seed completado. Conexión cerrada.');
  } catch (error) {
    console.error('❌ Error en seed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// ==================== LIMPIEZA ====================

async function cleanTestTeachers() {
  console.log('🧹 Limpiando profesores de prueba...');
  
  const emails = teachers.map(t => t.email);
  const testUsers = await User.find({ email: { $in: emails } });
  const ids = testUsers.map(u => u._id);

  if (ids.length === 0) {
    console.log('   No se encontraron profesores de prueba.');
    return;
  }

  // Eliminar paquetes
  const pkgResult = await TeacherPackage.deleteMany({ teacherId: { $in: ids } });
  console.log(`   📦 ${pkgResult.deletedCount} paquetes eliminados`);

  // Eliminar disponibilidades
  const availResult = await AvailabilityTemplate.deleteMany({ teacherId: { $in: ids } });
  console.log(`   📅 ${availResult.deletedCount} plantillas de disponibilidad eliminadas`);

  // Eliminar usuarios
  const userResult = await User.deleteMany({ email: { $in: emails } });
  console.log(`   👤 ${userResult.deletedCount} profesores eliminados`);

  console.log('✅ Limpieza completa.');
}

// ==================== EJECUTAR ====================
seedTeachers();
