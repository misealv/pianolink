/**
 * scripts/seed-resonancias-leads.js
 * Inserta los ex-alumnos de Escuela Resonancias como Lead + CrmLead en la BD.
 * Idempotente: no duplica si el email ya existe.
 *
 * Uso:  node scripts/seed-resonancias-leads.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Lead = require('../models/Lead');
const CrmLead = require('../crm/models/CrmLead');

// ============================================================
// DATOS — Extraídos de docs/Leads_Resonancias.md
// ============================================================

const PRIORIDAD_1 = [
    { nombre: 'Natalia Gómez', telefono: '56983605544', email: 'natygomezallende@gmail.com', anio: '2016', curso: 'Piano', notas: 'Tenía instrumento. Quería tocar piezas de su agrado' },
    { nombre: 'Eduardo Quiroz', telefono: '56993186109', email: 'eduardoquiroz@gmail.com', anio: '2016', curso: 'Piano', notas: 'Tenía instrumento. Quería leer música y tocar bien' },
    { nombre: 'Luciano Stefanelli', telefono: '56987650904', email: 'teociano@gmail.com', anio: '2016', curso: 'Piano', notas: 'Tenía instrumento. Clásico y moderno. Adulto mayor activo' },
    { nombre: 'Mauricio Bugueño', telefono: '56989981030', email: 'nerobug66@gmail.com', anio: '2016', curso: 'Piano', notas: 'Tenía instrumento. Adulto, motivación de mantenerse' },
    { nombre: 'Luz Lyon', telefono: '56995457560', email: 'llyonf@gmail.com', anio: '2019', curso: 'Piano', notas: 'Tenía instrumento. Quería tocar fluidamente' },
    { nombre: 'Pamela Torres', telefono: '56930023393', email: 'pamela.torresb@gmail.com', anio: '2019', curso: 'Piano', notas: 'Tenía instrumento. Quería tocar distintos géneros' },
    { nombre: 'Anzu Yamamoto', telefono: '56966108837', email: 'maulina198725@gmail.com', anio: '2019', curso: 'Piano', notas: 'Tenía instrumento. Objetivo: mejorar' },
    { nombre: 'Ariel Prieto', telefono: '56966992254', email: 'prieto.benitez.ariel@gmail.com', anio: '2020', curso: 'Piano', notas: 'Tenía instrumento. Técnica y musicalidad' },
    { nombre: 'Antonieta Surawski', telefono: '56991998082', email: 'asurasur@gmail.com', anio: '2020', curso: 'Piano', notas: 'Tenía instrumento. Quería repertorio sólido' },
    { nombre: 'Rolando Rebolledo', telefono: '56994509707', email: 'rebolledosalazar@gmail.com', anio: '2020', curso: 'Piano', notas: 'Tenía instrumento. Técnica avanzada' },
    { nombre: 'Macarena Cristi', telefono: '56972815869', email: 'macarenac.latife@gmail.com', anio: '2020', curso: 'Piano', notas: 'Tenía instrumento. Música clásica' },
    { nombre: 'Walter Águila', telefono: '56932939921', email: 'walter.aguila@gmail.com', anio: '2020', curso: 'Piano', notas: 'Tenía instrumento. Interpretación y dominio' },
    { nombre: 'Jacqueline Prieto', telefono: '56991443257', email: 'beatriz_eva@hotmail.com', anio: '2021', curso: 'Piano', notas: 'Tenía instrumento. Quería avanzar' },
    { nombre: 'Pilar Acuña', telefono: '56998455476', email: 'pilar.acuna@uchile.cl', anio: '2021', curso: 'Piano', notas: 'Tenía instrumento. Recuperar nivel + piano popular' },
    { nombre: 'Hangyeol Yoon', telefono: '56981581664', email: 'hangoalyoon03@gmail.com', anio: '2021', curso: 'Piano', notas: 'Tenía instrumento. Nivel profesional, varios estilos' },
    { nombre: 'Javier Escare', telefono: '56942343532', email: 'javier.escare.mellado@gmail.com', anio: '2018', curso: 'Piano', notas: 'Tenía instrumento. Nivel intermedio' },
    { nombre: 'Jorge Monardes', telefono: '56995180191', email: 'jorge.f.monardes@gmail.com', anio: '2018', curso: 'Piano', notas: 'Tenía instrumento. Leer música, conciencia del tiempo' },
    { nombre: 'Renata Alves', telefono: '56982376870', email: 'renata.alves.10@gmail.com', anio: '2018', curso: 'Piano', notas: 'Tenía instrumento' },
    { nombre: 'Javier Gonzalez', telefono: '56976594596', email: 'jgonzalezsandoval@gmail.com', anio: '2014', curso: 'Piano', notas: 'Tenía instrumento' },
];

const PRIORIDAD_2 = [
    { nombre: 'Sebastián Faundes', telefono: '56982222105', email: 'faundez.madariaga@gmail.com', anio: '2014', curso: 'Piano', notas: 'Quería formación sólida de teoría y mecánica' },
    { nombre: 'Fernanda Poblete', telefono: '56989232712', email: 'fernanda.p.canessa@gmail.com', anio: '2016', curso: 'Piano', notas: 'Quería leer partituras y tocar con fluidez' },
    { nombre: 'Felipe Zuñiga', telefono: '56964059560', email: 'felipezg1998@gmail.com', anio: '2016', curso: 'Piano', notas: 'Quería enseñarle a su hija, muy motivado' },
    { nombre: 'Tamara López', telefono: '56975495927', email: 'tamara.lopez@gmail.com', anio: '2016', curso: 'Piano', notas: 'Quería música clásica y componer' },
    { nombre: 'Carlos Araya', telefono: '56978493941', email: 'craraya@uc.cl', anio: '2016', curso: 'Piano', notas: 'Leer música y técnica' },
    { nombre: 'Catalina Pérez', telefono: '56957721100', email: 'catalinaperezromo@gmail.com', anio: '2016', curso: 'Piano', notas: 'Aprender a tocar y leer música' },
    { nombre: 'Ricardo Franco', telefono: '56962090964', email: 'ricardofrancob@hotmail.com', anio: '2016', curso: 'Piano', notas: 'Interpretar una pieza musical' },
    { nombre: 'Gonzalo Maraboli', telefono: '56993265568', email: 'gonzalomaraboli@gmail.com', anio: '2016', curso: 'Piano', notas: 'Técnica y lectura' },
    { nombre: 'Julia Roselló', telefono: '56985159952', email: 'julia.rosello@usach.cl', anio: '2016', curso: 'Piano', notas: 'Nivel intermedio, leer partituras' },
    { nombre: 'María Fernanda Flores', telefono: '56992475211', email: 'fernanda660@hotmail.com', anio: '2016', curso: 'Piano', notas: 'Leer música e interpretación' },
    { nombre: 'Felipe Leyton', telefono: '56968431086', email: 'faleyton@uc.cl', anio: '2016', curso: 'Piano', notas: 'Quería tocar el Canon en D' },
    { nombre: 'Aníbal Vera', telefono: '56991295102', email: 'asurvera@gmail.com', anio: '2016', curso: 'Piano', notas: 'Nivel intermedio' },
    { nombre: 'Cristian Cuevas', telefono: '56975482086', email: 'ccuevas84@gmail.com', anio: '2016', curso: 'Piano', notas: 'Tocar y leer música' },
    { nombre: 'Katherine Lambergt', telefono: '56957721325', email: 'klamberg93@gmail.com', anio: '2016', curso: 'Piano', notas: 'Leer partitura' },
    { nombre: 'Txomin Arrieta', telefono: '56975599748', email: 'txomin.arrieta@gmail.com', anio: '2016', curso: 'Piano', notas: 'Nivel intermedio' },
    { nombre: 'Fabián Arellano', telefono: '56973609580', email: 'farellano@vedata.cl', anio: '2016', curso: 'Piano', notas: 'Nivel intermedio' },
    { nombre: 'Soledad Valdebenito', telefono: '56986451689', email: 'nsvaldebenito@gmail.com', anio: '2016', curso: 'Piano', notas: 'Nivel básico' },
    { nombre: 'Rodrigo Miranda', telefono: '56961238170', email: 'rodrigo.nicolas.mirandap@gmail.com', anio: '2017', curso: 'Piano', notas: 'Repertorio clásico' },
    { nombre: 'Daniela Riquelme', telefono: '56977925454', email: 'danielafernandariquelme@gmail.com', anio: '2017', curso: 'Piano', notas: 'Practicar en casa' },
    { nombre: 'María Paz Palominos', telefono: '56993191699', email: 'm.pazpalominos@gmail.com', anio: '2018', curso: 'Piano', notas: 'Autonomía para leer música' },
    { nombre: 'Diego Hidalgo', telefono: '56981397278', email: 'diehidal@gmail.com', anio: '2018', curso: 'Piano', notas: 'Nivel intermedio o avanzado' },
    { nombre: 'Omar Palma', telefono: '56992403901', email: 'ompalma@gmail.com', anio: '2018', curso: 'Piano', notas: '' },
    { nombre: 'Damaris Ballesteros', telefono: '56952880074', email: 'damab1465@gmail.com', anio: '2018', curso: 'Piano', notas: 'Aprender a interpretar' },
    { nombre: 'Alfredo Marcano', telefono: '56975429584', email: 'alfredojmarcano@gmail.com', anio: '2018', curso: 'Piano', notas: '' },
    { nombre: 'Xin He', telefono: '56993026232', email: '8624mybirth@163.com', anio: '2018', curso: 'Piano', notas: '' },
    { nombre: 'Gonzalo Aranguiz', telefono: '56981883815', email: 'verafiestas.karin@gmail.com', anio: '2018', curso: 'Piano', notas: 'Contacto es Karin Vera' },
    { nombre: 'Macarena Torro', telefono: '56982920378', email: 'mdtoro@uc.cl', anio: '2019', curso: 'Piano', notas: 'Nivel elemental' },
    { nombre: 'Macarena Guerrero', telefono: '56933899950', email: 'macarena.egv@gmail.com', anio: '2019', curso: 'Piano', notas: 'Nivel elemental' },
    { nombre: 'Paulina Zúñiga', telefono: '56987754312', email: 'paulina.zuniga@nokia.com', anio: '2019', curso: 'Piano', notas: 'Nivel elemental' },
    { nombre: 'Mauricio Durán', telefono: '56957567624', email: 'yeyedu@gmail.com', anio: '2019', curso: 'Piano', notas: 'Nivel elemental' },
    { nombre: 'María Ignacia Valenzuela', telefono: '56972909754', email: 'mignaciavv7@gmail.com', anio: '2019', curso: 'Piano', notas: 'Nivel elemental' },
    { nombre: 'Gabriel Nieto', telefono: '56951309866', email: 'genietomu@gmail.com', anio: '2019', curso: 'Piano', notas: 'Nivel elemental' },
    { nombre: 'Sandra Fuentes', telefono: '56999654518', email: 'sandrafuentesl@gmail.com', anio: '2019', curso: 'Piano', notas: 'Nivel elemental' },
    { nombre: 'Maria Paz Fuentes', telefono: '56944580558', email: 'mpfuentesra@gmail.com', anio: '2019', curso: 'Piano', notas: 'Nivel elemental' },
    { nombre: 'Marvic Pineda', telefono: '56950189435', email: 'marjepin@gmail.com', anio: '2020', curso: 'Piano', notas: 'Leer partituras' },
    { nombre: 'Sergio Bembow', telefono: '56978976144', email: 'sergiobembow@gmail.com', anio: '2020', curso: 'Piano', notas: 'Base sólida desde cero' },
    { nombre: 'Nicolás Musalem', telefono: '56992405659', email: 'nicomusalem@gmail.com', anio: '2020', curso: 'Piano', notas: 'Complementar gusto por música' },
    { nombre: 'Raúl Cristi', telefono: '56978568481', email: 'rraulcristi@yahoo.com', anio: '2020', curso: 'Piano', notas: 'Melodías clásicas, leer partituras' },
    { nombre: 'Richard Soria', telefono: '56974380428', email: 'richarsoriamora@gmail.com', anio: '2020', curso: 'Piano', notas: 'Tocar de forma fluida' },
    { nombre: 'Aída Torres', telefono: '56979646733', email: 'aida.torresv@gmail.com', anio: '2021', curso: 'Piano', notas: 'Leer y tocar, no solo canciones' },
    { nombre: 'Julliet Romero', telefono: '56966856042', email: 'jullietrr06@gmail.com', anio: '2021', curso: 'Piano', notas: 'Aprender y disfrutar' },
    { nombre: 'Pedro Oliva', telefono: '56963082612', email: 'pedro_olivaf@hotmail.com', anio: '2021', curso: 'Piano', notas: 'Tocar teclado en banda' },
    { nombre: 'Juan González', telefono: '56946702324', email: 'jgu1@hotmail.com', anio: '2021', curso: 'Piano', notas: 'Jazz, composición, partituras. Muy motivado' },
    { nombre: 'Rodrigo Yañez', telefono: '56944203403', email: 'rodrigo2409@gmail.com', anio: '2021', curso: 'Piano', notas: 'Leer música' },
    { nombre: 'Scarlett Fontecilla', telefono: '56940093911', email: 'fontecillacaviedes@gmail.com', anio: '2020', curso: 'Piano', notas: 'Adulta joven, melodías' },
    { nombre: 'José Jorquera', telefono: '56942423121', email: 'josejorquera@gmail.com', anio: 's/f', curso: 'Piano', notas: 'Sin fecha, tiene instrumento' },
    { nombre: 'Rina Aperi', telefono: '56965513916', email: 'rinaaperi@gmail.com', anio: '2019', curso: 'Piano/Canto', notas: 'Nivel elemental piano' },
];

const PRIORIDAD_3 = [
    { nombre: 'José Ignacio Torres', telefono: '56976457547', email: 'torresignacio88@gmail.com', anio: '2016', curso: 'Guitarra', notas: 'Podría abrirse a piano. Adulto musical' },
    { nombre: 'Alanis Parra', telefono: '56996122748', email: 'alanisdanae@hotmail.com', anio: '2017', curso: 'Guitarra', notas: 'Joven adulta, creativa, podría interesar piano' },
    { nombre: 'Lorenza Rivas', telefono: '56940159003', email: 'marianelachamorrob@gmail.com', anio: '2021', curso: 'Piano/Guitarra', notas: 'Contacto apoderada Marianela. Tenía instrumento' },
    { nombre: 'Martín Díaz', telefono: '56948037850', email: 'martineduardocrack@gmail.com', anio: '2020', curso: 'Piano', notas: 'Contacto apoderado Eduardo. Tenía instrumento' },
    { nombre: 'Benjamín Gómez', telefono: '56965710605', email: 'ed.gomezgarcia@gmail.com', anio: '2018', curso: 'Piano', notas: 'Contacto apoderado Edgardo. Tenía instrumento' },
    { nombre: 'Felipe de la Maza', telefono: '56962207455', email: 'vhormazabal@delamazaycia.cl', anio: '2014', curso: 'Piano', notas: 'Contacto apoderado Ricardo. Tenía instrumento' },
];

// ============================================================
// LÓGICA DE SEED
// ============================================================

/**
 * Determina la etiqueta de prioridad según el grupo.
 */
function mapPrioridad(grupo) {
    if (grupo === 1) return 'alta';
    if (grupo === 2) return 'media';
    return 'guitarra_abierto_piano';
}

/**
 * Determina el score CRM inicial según la prioridad.
 */
function scoreInicial(grupo) {
    if (grupo === 1) return 45; // Warm — tenían instrumento
    if (grupo === 2) return 30; // Cold-warm
    return 15;                  // Cold
}

async function seedResonancias() {
    await connectDB();
    console.log('\n🎹  Seed Resonancias — Iniciando...\n');

    const todos = [
        ...PRIORIDAD_1.map(r => ({ ...r, grupo: 1 })),
        ...PRIORIDAD_2.map(r => ({ ...r, grupo: 2 })),
        ...PRIORIDAD_3.map(r => ({ ...r, grupo: 3 })),
    ];

    let creados = 0;
    let yaExistian = 0;
    let errores = 0;

    for (const row of todos) {
        try {
            // 1) Buscar o crear Lead core
            let coreLead = await Lead.findOne({ email: row.email.toLowerCase() });

            if (!coreLead) {
                coreLead = await Lead.create({
                    name: row.nombre,
                    email: row.email.toLowerCase(),
                    whatsapp: row.telefono,
                    whatsappLink: `https://wa.me/${row.telefono.replace(/[^0-9]/g, '')}`,
                    type: 'client',
                    clientType: 'adult_learner',
                    source: 'ex_alumno_resonancias',
                    status: 'new',
                    notes: row.notas || '',
                    fuente: 'ex_alumno_resonancias',
                    prioridad: mapPrioridad(row.grupo),
                    rol: 'prospecto_estudiante',
                    estadoPipeline: 'nuevo',
                    cursoOriginal: row.curso,
                    anioInscripcionResonancias: row.anio,
                    lista: 'ex_estudiantes_resonancias',
                    country: 'CL',
                    timezone: 'America/Santiago',
                });
            }

            // 2) Buscar o crear CrmLead
            let crmLead = await CrmLead.findOne({ leadRef: coreLead._id });

            if (!crmLead) {
                const tags = [
                    'ex_alumno_resonancias',
                    `prioridad_${mapPrioridad(row.grupo)}`,
                    `curso_${row.curso.toLowerCase().replace(/\//g, '_')}`,
                    `anio_${row.anio}`,
                ];

                crmLead = await CrmLead.create({
                    leadRef: coreLead._id,
                    score: scoreInicial(row.grupo),
                    segment: 'ex_estudiantes_resonancias',
                    lista: 'ex_estudiantes_resonancias',
                    tags,
                    locale: 'es',
                    currency: 'CLP',
                    timezone: 'America/Santiago',
                    lifecycleStage: 'lead',
                    attribution: {
                        firstTouch: {
                            channel: 'direct',
                            utmSource: 'resonancias_historico',
                            utmMedium: 'seed',
                            utmCampaign: 'reactivacion_ex_alumnos',
                            timestamp: new Date(),
                        },
                        lastTouch: {
                            channel: 'direct',
                            utmSource: 'resonancias_historico',
                            utmMedium: 'seed',
                            utmCampaign: 'reactivacion_ex_alumnos',
                            timestamp: new Date(),
                        },
                        touchpoints: [{
                            channel: 'direct',
                            timestamp: new Date(),
                            utmSource: 'resonancias_historico',
                            utmMedium: 'seed',
                            utmCampaign: 'reactivacion_ex_alumnos',
                        }],
                    },
                    scoreHistory: [{
                        score: scoreInicial(row.grupo),
                        reason: 'seed_resonancias_import',
                    }],
                });

                creados++;
                console.log(`  ✅  ${row.nombre} (P${row.grupo})`);
            } else {
                yaExistian++;
                console.log(`  ⏩  ${row.nombre} — ya existía`);
            }
        } catch (err) {
            // Duplicado de email u otro error
            if (err.code === 11000) {
                yaExistian++;
                console.log(`  ⏩  ${row.nombre} — duplicado (email ya registrado)`);
            } else {
                errores++;
                console.error(`  ❌  ${row.nombre}: ${err.message}`);
            }
        }
    }

    console.log('\n───────────────────────────────────');
    console.log(`  Total procesados : ${todos.length}`);
    console.log(`  Nuevos creados   : ${creados}`);
    console.log(`  Ya existían      : ${yaExistian}`);
    console.log(`  Errores          : ${errores}`);
    console.log('───────────────────────────────────\n');

    await mongoose.disconnect();
    console.log('🔌  Desconectado de MongoDB.\n');
    process.exit(0);
}

seedResonancias().catch(err => {
    console.error('💥  Error fatal:', err);
    process.exit(1);
});
