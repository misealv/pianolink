/**
 * scripts/import-resonancias-leads.js
 * 
 * Importa todos los contactos del archivo Leads_Resonancias.md
 * como leads del segmento "Ex Estudiantes Resonancias".
 * 
 * Reglas:
 * - No duplica si el email ya existe
 * - Genera whatsappLink automáticamente
 * - Crea Lead (core) + CrmLead (enriquecido) por cada contacto
 * - Marca apoderados en notas
 * 
 * Uso: node scripts/import-resonancias-leads.js
 */
const mongoose = require('mongoose');
require('dotenv').config();

const Lead = require('../models/Lead');
const CrmLead = require('../crm/models/CrmLead');

// ============================================================================
// DATOS — Extraídos del archivo docs/Leads_Resonancias.md
// ============================================================================

// Prioridad 1 — Piano + Instrumento propio + Adulto
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

// Prioridad 2 — Piano + Adulto + Sin instrumento registrado
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
    { nombre: 'Gonzalo Aranguiz', telefono: '56981883815', email: 'verafiestas.karin@gmail.com', anio: '2018', curso: 'Piano', notas: 'Contacto es Karin Vera. Contactar vía apoderado', esApoderado: true },
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

// Prioridad 3 — Guitarra abiertos a piano / Apoderados adultos
const PRIORIDAD_3 = [
    { nombre: 'José Ignacio Torres', telefono: '56976457547', email: 'torresignacio88@gmail.com', anio: '2016', curso: 'Guitarra', notas: 'Podría abrirse a piano. Adulto musical' },
    { nombre: 'Alanis Parra', telefono: '56996122748', email: 'alanisdanae@hotmail.com', anio: '2017', curso: 'Guitarra', notas: 'Joven adulta, creativa, podría interesar piano' },
    { nombre: 'Lorenza Rivas', telefono: '56940159003', email: 'marianelachamorrob@gmail.com', anio: '2021', curso: 'Piano/Guitarra', notas: 'Contacto apoderada Marianela. Tenía instrumento. Contactar vía apoderado', esApoderado: true },
    { nombre: 'Martín Díaz', telefono: '56948037850', email: 'martineduardocrack@gmail.com', anio: '2020', curso: 'Piano', notas: 'Contacto apoderado Eduardo. Tenía instrumento. Contactar vía apoderado', esApoderado: true },
    { nombre: 'Benjamín Gómez', telefono: '56965710605', email: 'ed.gomezgarcia@gmail.com', anio: '2018', curso: 'Piano', notas: 'Contacto apoderado Edgardo. Tenía instrumento. Contactar vía apoderado', esApoderado: true },
    { nombre: 'Felipe de la Maza', telefono: '56962207455', email: 'vhormazabal@delamazaycia.cl', anio: '2014', curso: 'Piano', notas: 'Contacto apoderado Ricardo. Tenía instrumento. Contactar vía apoderado', esApoderado: true },
    { nombre: 'Emilio de la Maza', telefono: '56962207455', email: 'vhormazabal@delamazaycia.cl', anio: '2014', curso: 'Piano/Guitarra', notas: 'Mismo apoderado Felipe. Tenía instrumento. Contactar vía apoderado', esApoderado: true },
];

// Prioridad 4 — Menores en 2019, adultos hoy
const PRIORIDAD_4 = [
    { nombre: 'Martina Abarca', telefono: '56979945055', email: 'martinaabarcas@gmail.com', anio: '2019', curso: 'Piano', notas: 'Hoy ~21 años. Email propio disponible' },
    { nombre: 'Alessandro Soncco', telefono: '56999036373', email: 'maryta.sm2018@gmail.com', anio: '2022', curso: 'Piano', notas: 'Hoy ~12 años, contactar apoderada. Contactar vía apoderado', esApoderado: true },
    { nombre: 'Hangyeol Yoon', telefono: '56981581664', email: 'hangoalyoon03@gmail.com', anio: '2021', curso: 'Piano', notas: 'Hoy ~22 años, email propio, muy motivado' },
];

// ============================================================================
// FUNCIÓN PRINCIPAL DE IMPORTACIÓN
// ============================================================================

async function importResonanciasLeads() {
    console.log('\n════════════════════════════════════════════════════════');
    console.log('  IMPORTACIÓN: Ex Estudiantes Resonancias → PianoLink CRM');
    console.log('════════════════════════════════════════════════════════\n');

    await mongoose.connect(process.env.MONGO_URI);
    console.log('[DB] ✅ Conectado a MongoDB\n');

    // Contadores para resumen
    const stats = {
        alta: { insertados: 0, duplicados: 0, whatsappGenerados: 0 },
        media: { insertados: 0, duplicados: 0, whatsappGenerados: 0 },
        guitarra_abierto_piano: { insertados: 0, duplicados: 0, whatsappGenerados: 0 },
        menor_ahora_adulto: { insertados: 0, duplicados: 0, whatsappGenerados: 0 },
        errores: []
    };

    // Mapeo de prioridades
    const lotes = [
        { datos: PRIORIDAD_1, prioridad: 'alta', label: 'PRIORIDAD 1 — Alta (Piano + Instrumento + Adulto)' },
        { datos: PRIORIDAD_2, prioridad: 'media', label: 'PRIORIDAD 2 — Media (Piano + Adulto + Sin instrumento)' },
        { datos: PRIORIDAD_3, prioridad: 'guitarra_abierto_piano', label: 'PRIORIDAD 3 — Guitarra/Apoderados' },
        { datos: PRIORIDAD_4, prioridad: 'menor_ahora_adulto', label: 'PRIORIDAD 4 — Menores ahora adultos' },
    ];

    for (const lote of lotes) {
        console.log(`\n── ${lote.label} (${lote.datos.length} contactos) ──`);

        for (const contacto of lote.datos) {
            try {
                const emailLimpio = contacto.email.toLowerCase().trim();

                // Verificar duplicados por email
                const existente = await Lead.findOne({ email: emailLimpio });
                if (existente) {
                    console.log(`  ⏭️  DUPLICADO: ${contacto.nombre} (${emailLimpio})`);
                    stats[lote.prioridad].duplicados++;
                    continue;
                }

                // Generar whatsappLink
                const telefonoLimpio = contacto.telefono.replace(/[^0-9]/g, '');
                const whatsappLink = `https://wa.me/${telefonoLimpio}`;

                // Construir notas con marca de apoderado si aplica
                let notasFinales = contacto.notas || '';
                if (contacto.esApoderado && !notasFinales.includes('Contactar vía apoderado')) {
                    notasFinales = notasFinales ? `${notasFinales}. Contactar vía apoderado` : 'Contactar vía apoderado';
                }

                // 1. Crear Lead en el core
                const nuevoLead = await Lead.create({
                    name: contacto.nombre,
                    email: emailLimpio,
                    whatsapp: contacto.telefono,
                    whatsappLink: whatsappLink,
                    type: 'client',
                    clientType: 'adult_learner',
                    source: 'ex_alumno_resonancias',
                    status: 'new',
                    notes: notasFinales,
                    fuente: 'ex_alumno_resonancias',
                    prioridad: lote.prioridad,
                    rol: 'prospecto_estudiante',
                    estadoPipeline: 'nuevo',
                    cursoOriginal: contacto.curso,
                    anioInscripcionResonancias: contacto.anio,
                    lista: 'ex_estudiantes_resonancias',
                    country: 'CL',
                    timezone: 'America/Santiago'
                });

                // 2. Crear CrmLead enriquecido
                await CrmLead.create({
                    leadRef: nuevoLead._id,
                    score: lote.prioridad === 'alta' ? 40 : lote.prioridad === 'media' ? 25 : 15,
                    locale: 'es',
                    currency: 'CLP',
                    timezone: 'America/Santiago',
                    lifecycleStage: 'lead',
                    segment: 'ex_estudiantes_resonancias',
                    lista: 'ex_estudiantes_resonancias',
                    tags: [
                        'resonancias',
                        `prioridad_${lote.prioridad}`,
                        `curso_${contacto.curso.toLowerCase().replace(/\//g, '_')}`,
                        `año_${contacto.anio}`
                    ],
                    attribution: {
                        firstTouch: {
                            channel: 'other',
                            utmSource: 'resonancias_import',
                            utmCampaign: 'ex_alumnos_resonancias_2026',
                            timestamp: new Date()
                        },
                        lastTouch: {
                            channel: 'other',
                            utmSource: 'resonancias_import',
                            utmCampaign: 'ex_alumnos_resonancias_2026',
                            timestamp: new Date()
                        },
                        touchpoints: [{
                            channel: 'other',
                            utmSource: 'resonancias_import',
                            utmCampaign: 'ex_alumnos_resonancias_2026',
                            timestamp: new Date()
                        }]
                    }
                });

                stats[lote.prioridad].insertados++;
                stats[lote.prioridad].whatsappGenerados++;
                console.log(`  ✅ ${contacto.nombre} — ${emailLimpio} — ${whatsappLink}`);

            } catch (err) {
                // Error de duplicado de MongoDB (índice único)
                if (err.code === 11000) {
                    console.log(`  ⏭️  DUPLICADO (DB): ${contacto.nombre} (${contacto.email})`);
                    stats[lote.prioridad].duplicados++;
                } else {
                    console.error(`  ❌ ERROR: ${contacto.nombre} — ${err.message}`);
                    stats.errores.push({ nombre: contacto.nombre, error: err.message });
                }
            }
        }
    }

    // ============================================================================
    // RESUMEN FINAL
    // ============================================================================
    console.log('\n════════════════════════════════════════════════════════');
    console.log('  RESUMEN DE IMPORTACIÓN');
    console.log('════════════════════════════════════════════════════════');

    let totalInsertados = 0;
    let totalDuplicados = 0;
    let totalWhatsapp = 0;

    const resumenPrioridades = [
        { key: 'alta', label: 'P1 — Alta' },
        { key: 'media', label: 'P2 — Media' },
        { key: 'guitarra_abierto_piano', label: 'P3 — Guitarra/Apoderados' },
        { key: 'menor_ahora_adulto', label: 'P4 — Menor→Adulto' },
    ];

    for (const p of resumenPrioridades) {
        const s = stats[p.key];
        console.log(`  ${p.label}: ${s.insertados} ingresados | ${s.duplicados} duplicados | ${s.whatsappGenerados} WhatsApp`);
        totalInsertados += s.insertados;
        totalDuplicados += s.duplicados;
        totalWhatsapp += s.whatsappGenerados;
    }

    console.log('  ────────────────────────────────────────');
    console.log(`  TOTAL INGRESADOS:       ${totalInsertados}`);
    console.log(`  TOTAL DUPLICADOS:       ${totalDuplicados}`);
    console.log(`  TOTAL WHATSAPP LINKS:   ${totalWhatsapp}`);

    if (stats.errores.length > 0) {
        console.log(`  ERRORES:                ${stats.errores.length}`);
        stats.errores.forEach(e => console.log(`    · ${e.nombre}: ${e.error}`));
    }

    console.log('════════════════════════════════════════════════════════\n');

    await mongoose.connection.close();
    console.log('[DB] Conexión cerrada.\n');
}

// Ejecutar
importResonanciasLeads().catch(err => {
    console.error('[FATAL]', err);
    process.exit(1);
});
