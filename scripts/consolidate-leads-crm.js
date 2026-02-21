/**
 * scripts/consolidate-leads-crm.js
 * 
 * CONSOLIDACIÓN MASIVA DE LEADS — PianoLink CRM
 * 
 * Fusiona 3 fuentes:
 *   1. docs/Leads_Resonancias.md (ex-alumnos con teléfono)
 *   2. docs/leads_resonancias_gmail.md (3,237 contactos Gmail escuela.resonancias)
 *   3. docs/leads_miseal_gmail.md (3,428 contactos Gmail miseal)
 * 
 * Pasos:
 *   0. Lee ex-alumnos del CRM existente → score 85-100
 *   1. Parsea ambos MD de Gmail, deduplica por email
 *   2. Scoring inteligente (0-100)
 *   3. Segmentación A/B/C/D
 *   4. Filtro de calidad (bots, bancos, servicios)
 *   5. Genera 3 archivos: consolidados, nurturing, descartados
 *   6. Upsert en MongoDB (Lead + CrmLead)
 *   7. Resumen ejecutivo con Top 20 + mensajes personalizados
 * 
 * Uso: node scripts/consolidate-leads-crm.js [--dry-run] [--skip-upload]
 */
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const Lead = require('../models/Lead');
const CrmLead = require('../crm/models/CrmLead');

// ============================================================================
// CONFIGURACIÓN
// ============================================================================
const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_UPLOAD = process.argv.includes('--skip-upload');

// Producto a vender
const PRODUCTO = 'Kit de bienvenida PianoLink — USD $44';

// Emails a descartar (servicios, bots, bancos, etc.)
const EMAILS_BLACKLIST_PATTERNS = [
  /noreply@/i, /no-reply@/i, /notificaciones@/i, /notifications@/i,
  /reminders@/i, /info@profesordepiano/i, /wordpress@/i,
  /@paypal\./i, /@bancointernacional\./i, /@bancofalabella\./i,
  /@cl\.bancofalabella\./i, /@starofservice\./i, /@especial\.2x3\./i,
  /@mailtrack\./i, /contact\.cl@starofservice/i, /member@paypal/i,
  /@sii\.cl$/i, /@correos\.cl$/i, /@servel\.cl$/i,
  /mailer-daemon@/i, /postmaster@/i, /daemon@/i,
];

// Dominios de empresa/servicio a descartar
const DOMAIN_BLACKLIST = [
  'paypal.com', 'starofservice.com', 'mailtrack.io', '2x3.cl',
  'bancointernacional.cl', 'bancofalabella.com',
];

// Nombres genéricos o bots
const NOMBRES_BLACKLIST = [
  'sin_nombre', 'face manager', 'administracion', 'banco falabella',
  'banco internacional', 'mailtrack reminder', 'starOfservice',
  '2x3.cl', 'enrique acosta herrera a través de paypal',
  'profesordepiano.cl', 'academia oriente',
];

// Campañas de alto valor (señal fuerte de interés piano)
const CAMPAIGN_SCORES = {
  'estudiantes_vigentes': 20,
  'clase_de_prueba': 15,
  'clase_demostrativa': 15,
  'pianoefectivo_prospectos': 12,
  'ofertabienvenida': 12,
  'profesordepiano': 10,
  'informacionescuela': 8,
  'escuelaresonancias': 8,
  'piano_resonancias': 10,
  'unica_vez_resonancias': 6,
  'giftcardresonancias': 5,
  'cv2017': 3,
  'conveinosempresas': 2,
  'seminarioswebpiano': 3,
  'simpleynatural': 2,
};

// Puntos por intención detectada
const INTENCION_SCORES = {
  'pago': 12,
  'reserva': 10,
  'quiere_aprender': 8,
  'pregunta_precio': 7,
  'pregunta_horario': 5,
  'piano': 6,
  'clases': 4,
  'pide_info': 4,
  'composición': 5,
  'armonía': 4,
  'teoría': 3,
  'registro': 3,
  'canto': 2,
  'guitarra': 1,
};

// ============================================================================
// FUNCIONES DE PARSEO
// ============================================================================

/**
 * Parsea un archivo MD de Gmail (leads_resonancias_gmail.md o leads_miseal_gmail.md)
 * Retorna array de contactos con: nombre, email, fecha, ciudad, campaña, fuente, intención, prioridadOriginal
 */
function parseMdGmail(filePath, sourceLabel) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const contactos = [];
  let currentPriority = 'P4'; // default

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detectar sección de prioridad
    if (line.startsWith('## PRIORIDAD 1')) currentPriority = 'P1';
    else if (line.startsWith('## PRIORIDAD 2')) currentPriority = 'P2';
    else if (line.startsWith('## PRIORIDAD 3')) currentPriority = 'P3';
    else if (line.startsWith('## PRIORIDAD 4')) currentPriority = 'P4';
    else if (line.startsWith('## DUPLICADOS')) currentPriority = 'DUP';
    else if (line.startsWith('## RESUMEN')) break; // No parsear resumen

    // Parsear filas de tabla (empiezan con | y NO son header/separator)
    if (line.startsWith('|') && !line.startsWith('|--') && !line.includes('nombre') && !line.includes('email') && line.includes('@')) {
      const cells = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
      if (cells.length >= 6) {
        const nombre = cells[0] || '';
        const email = (cells[1] || '').toLowerCase().trim();
        const fecha = cells[2] || '';
        const ciudad = cells[3] || '';
        const campana = cells[4] || '';
        const fuente = cells[5] || '';
        const intencion = cells[6] || '';

        if (email && email.includes('@')) {
          contactos.push({
            nombre,
            email,
            fecha,
            ciudad: ciudad === '—' ? '' : ciudad,
            campana: campana === '—' ? '' : campana,
            fuente,
            intencion,
            prioridadOriginal: currentPriority,
            sourceFile: sourceLabel,
            isDuplicate: currentPriority === 'DUP',
          });
        }
      }
    }
  }

  return contactos;
}

/**
 * Parsea el archivo Leads_Resonancias.md (ex-alumnos con teléfono)
 * Retorna array con: nombre, telefono, email, anio, curso, notas, prioridadResonancias
 */
function parseExAlumnosMd(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const contactos = [];
  let currentPriority = '';

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('## PRIORIDAD 1')) currentPriority = 'P1_exalumno';
    else if (trimmed.startsWith('## PRIORIDAD 2')) currentPriority = 'P2_exalumno';
    else if (trimmed.startsWith('## PRIORIDAD 3')) currentPriority = 'P3_exalumno';
    else if (trimmed.startsWith('## PRIORIDAD 4')) currentPriority = 'P4_exalumno';

    if (trimmed.startsWith('|') && !trimmed.startsWith('|--') && !trimmed.includes('nombre') && !trimmed.includes('telefono') && trimmed.includes('@')) {
      const cells = trimmed.split('|').map(c => c.trim()).filter(c => c.length > 0);
      if (cells.length >= 5) {
        const nombre = cells[0] || '';
        // P4 tiene formato distinto: nombre, telefono_apoderado, email_apoderado, año, notas
        const telefono = cells[1] || '';
        const email = (cells[2] || '').toLowerCase().trim();
        const anio = cells[3] || '';
        const curso = currentPriority === 'P4_exalumno' ? 'Piano' : (cells[4] || '');
        const notas = currentPriority === 'P4_exalumno' ? (cells[4] || '') : (cells[5] || '');

        if (email && email.includes('@')) {
          contactos.push({
            nombre,
            telefono: telefono.replace(/[^0-9]/g, ''),
            email,
            anio,
            curso,
            notas,
            prioridadResonancias: currentPriority,
            esExAlumno: true,
          });
        }
      }
    }
  }

  return contactos;
}

// ============================================================================
// SCORING
// ============================================================================

/**
 * Calcula score (0-100) para un contacto consolidado
 */
function calcularScore(contacto) {
  let score = 0;

  // — Base por prioridad original del archivo Gmail —
  if (contacto.prioridadesOriginales) {
    if (contacto.prioridadesOriginales.includes('P1')) score += 30;
    else if (contacto.prioridadesOriginales.includes('P2')) score += 25;
    else if (contacto.prioridadesOriginales.includes('P3')) score += 15;
    else if (contacto.prioridadesOriginales.includes('P4')) score += 5;
  }

  // — Bonus por ex-alumno Resonancias (máxima prioridad) —
  if (contacto.esExAlumno) {
    score = 85; // Base alta para ex-alumnos
    if (contacto.prioridadResonancias === 'P1_exalumno') score = 95;
    else if (contacto.prioridadResonancias === 'P2_exalumno') score = 90;
    else if (contacto.prioridadResonancias === 'P3_exalumno') score = 85;
    else if (contacto.prioridadResonancias === 'P4_exalumno') score = 87;
    // Tiene teléfono → +5
    if (contacto.telefono) score = Math.min(100, score + 3);
    return score;
  }

  // — Bonus por campaña GetResponse —
  if (contacto.campanas) {
    for (const camp of contacto.campanas) {
      const campKey = camp.toLowerCase().trim();
      if (CAMPAIGN_SCORES[campKey]) {
        score += CAMPAIGN_SCORES[campKey];
      }
    }
  }

  // — Bonus por intención (cap 30 puntos para no inflar) —
  if (contacto.intenciones) {
    const intencionesUnicas = [...new Set(contacto.intenciones)];
    let intencionBonus = 0;
    for (const intent of intencionesUnicas) {
      const key = intent.toLowerCase().trim();
      if (INTENCION_SCORES[key]) {
        intencionBonus += INTENCION_SCORES[key];
      }
    }
    score += Math.min(intencionBonus, 30); // Cap en 30 puntos
  }

  // — Bonus por fuente —
  if (contacto.fuentes) {
    if (contacto.fuentes.includes('gmail_directo')) score += 5;
    if (contacto.fuentes.includes('formulario')) score += 7;
    if (contacto.fuentes.includes('getresponse')) score += 3;
  }

  // — Bonus por aparecer en múltiples fuentes —
  if (contacto.sourceFiles && contacto.sourceFiles.length > 1) score += 5;
  if (contacto.fuentes && contacto.fuentes.length > 1) score += 3;

  // — Recencia: fechas más nuevas valen más —
  if (contacto.fechaMasReciente) {
    const year = parseInt(contacto.fechaMasReciente.substring(0, 4));
    if (year >= 2022) score += 8;
    else if (year >= 2020) score += 5;
    else if (year >= 2018) score += 3;
    else if (year >= 2016) score += 1;
  }

  // — Tiene ciudad — (dato enriquecido)
  if (contacto.ciudad && contacto.ciudad.length > 1) score += 2;

  // Limitar 0-100
  return Math.max(0, Math.min(100, score));
}

// ============================================================================
// FILTRO DE CALIDAD
// ============================================================================

function esEmailInvalido(email) {
  if (!email || !email.includes('@')) return true;

  // Patrones blacklist
  for (const pattern of EMAILS_BLACKLIST_PATTERNS) {
    if (pattern.test(email)) return true;
  }

  // Dominios blacklist
  const domain = email.split('@')[1];
  if (DOMAIN_BLACKLIST.includes(domain)) return true;

  return false;
}

function esNombreInvalido(nombre) {
  if (!nombre || nombre.length < 2) return true;
  const lower = nombre.toLowerCase().trim();
  return NOMBRES_BLACKLIST.some(n => lower.includes(n.toLowerCase()));
}

// ============================================================================
// CONSOLIDACIÓN PRINCIPAL
// ============================================================================

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  CONSOLIDACIÓN MASIVA DE LEADS — PianoLink CRM             ║');
  console.log('║  Producto: Kit de bienvenida PianoLink — USD $44           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  if (DRY_RUN) console.log('⚠️  MODO DRY-RUN: No se escribirá en la base de datos\n');
  if (SKIP_UPLOAD) console.log('⚠️  MODO SKIP-UPLOAD: Solo generará archivos, sin upsert a MongoDB\n');

  // ─── PASO 0: Leer ex-alumnos del archivo MD ───
  console.log('── PASO 0: Cargando ex-alumnos de Leads_Resonancias.md ──');
  const exAlumnosPath = path.join(__dirname, '..', 'docs', 'Leads_Resonancias.md');
  const exAlumnos = parseExAlumnosMd(exAlumnosPath);
  console.log(`  ✅ ${exAlumnos.length} ex-alumnos cargados desde MD\n`);

  // Crear mapa email → ex-alumno (para enriquecer)
  const exAlumnoMap = {};
  for (const ea of exAlumnos) {
    exAlumnoMap[ea.email] = ea;
  }

  // ─── PASO 1: Parsear ambos MD de Gmail + deduplicar ───
  console.log('── PASO 1: Parseando archivos Gmail y deduplicando ──');
  const resonanciasPath = path.join(__dirname, '..', 'docs', 'leads_resonancias_gmail.md');
  const misealPath = path.join(__dirname, '..', 'docs', 'leads_miseal_gmail.md');

  const contactosResonancias = parseMdGmail(resonanciasPath, 'resonancias');
  const contactosMiseal = parseMdGmail(misealPath, 'miseal');

  console.log(`  · leads_resonancias_gmail.md: ${contactosResonancias.length} filas`);
  console.log(`  · leads_miseal_gmail.md: ${contactosMiseal.length} filas`);

  // Consolidar todo en un mapa: email → contacto consolidado
  const consolidado = {};

  // Primero cargar ex-alumnos (máxima prioridad)
  for (const ea of exAlumnos) {
    const email = ea.email;
    if (!consolidado[email]) {
      consolidado[email] = {
        nombre: ea.nombre,
        email,
        telefono: ea.telefono,
        whatsappLink: ea.telefono ? `https://wa.me/${ea.telefono}` : '',
        ciudad: '',
        campanas: [],
        fuentes: ['ex_alumno_resonancias'],
        intenciones: ['piano', 'clases', 'quiere_aprender'],
        prioridadesOriginales: [],
        sourceFiles: ['ex_alumnos_md'],
        fechaMasReciente: ea.anio && ea.anio !== 's/f' ? `${ea.anio}-01-01` : '',
        esExAlumno: true,
        prioridadResonancias: ea.prioridadResonancias,
        cursoOriginal: ea.curso,
        anioInscripcion: ea.anio,
        notas: ea.notas,
      };
    }
  }

  // Función para agregar un contacto Gmail al consolidado
  function mergeContacto(c) {
    const email = c.email;
    if (!email) return;

    if (!consolidado[email]) {
      consolidado[email] = {
        nombre: c.nombre,
        email,
        telefono: '',
        whatsappLink: '',
        ciudad: c.ciudad || '',
        campanas: [],
        fuentes: [],
        intenciones: [],
        prioridadesOriginales: [],
        sourceFiles: [],
        fechaMasReciente: '',
        esExAlumno: false,
        prioridadResonancias: null,
        cursoOriginal: '',
        anioInscripcion: '',
        notas: '',
      };
    }

    const entry = consolidado[email];

    // Nombre: preferir el más completo
    if (c.nombre && c.nombre.length > (entry.nombre || '').length && c.nombre !== 'sin_nombre') {
      entry.nombre = c.nombre;
    }

    // Ciudad
    if (c.ciudad && !entry.ciudad) entry.ciudad = c.ciudad;

    // Campañas
    if (c.campana) {
      const camps = c.campana.split(',').map(x => x.trim()).filter(x => x && x !== '—');
      for (const camp of camps) {
        if (!entry.campanas.includes(camp)) entry.campanas.push(camp);
      }
    }

    // Fuentes
    if (c.fuente) {
      const fuentes = c.fuente.split(',').map(x => x.trim()).filter(x => x);
      for (const f of fuentes) {
        if (!entry.fuentes.includes(f)) entry.fuentes.push(f);
      }
    }

    // Intenciones
    if (c.intencion) {
      const ints = c.intencion.split(',').map(x => x.trim()).filter(x => x);
      for (const intent of ints) {
        if (!entry.intenciones.includes(intent)) entry.intenciones.push(intent);
      }
    }

    // Prioridad original
    if (c.prioridadOriginal && !entry.prioridadesOriginales.includes(c.prioridadOriginal)) {
      entry.prioridadesOriginales.push(c.prioridadOriginal);
    }

    // Source file
    if (c.sourceFile && !entry.sourceFiles.includes(c.sourceFile)) {
      entry.sourceFiles.push(c.sourceFile);
    }

    // Fecha más reciente
    if (c.fecha && c.fecha !== '—' && c.fecha > (entry.fechaMasReciente || '')) {
      entry.fechaMasReciente = c.fecha;
    }

    // Si está en ex-alumnos, marcar
    if (exAlumnoMap[email]) {
      const ea = exAlumnoMap[email];
      entry.esExAlumno = true;
      entry.prioridadResonancias = ea.prioridadResonancias;
      entry.telefono = ea.telefono || entry.telefono;
      entry.whatsappLink = ea.telefono ? `https://wa.me/${ea.telefono}` : entry.whatsappLink;
      entry.cursoOriginal = ea.curso;
      entry.anioInscripcion = ea.anio;
      entry.notas = ea.notas || entry.notas;
    }
  }

  // Procesar todos los contactos Gmail
  for (const c of contactosResonancias) mergeContacto(c);
  for (const c of contactosMiseal) mergeContacto(c);

  const totalConsolidado = Object.keys(consolidado).length;
  console.log(`  ✅ ${totalConsolidado} contactos únicos consolidados\n`);

  // ─── PASO 2: Scoring ───
  console.log('── PASO 2: Calculando scores ──');
  for (const email of Object.keys(consolidado)) {
    consolidado[email].score = calcularScore(consolidado[email]);
  }
  console.log('  ✅ Scores calculados\n');

  // ─── PASO 3: Segmentación ───
  console.log('── PASO 3: Segmentación A/B/C/D ──');
  const segmentos = { A: [], B: [], C: [], D: [], descartado: [] };

  for (const email of Object.keys(consolidado)) {
    const c = consolidado[email];

    // ─── PASO 4: Filtro de calidad (integrado) ───
    if (esEmailInvalido(c.email) || esNombreInvalido(c.nombre)) {
      c.segmento = 'descartado';
      c.motivoDescarte = esEmailInvalido(c.email) ? 'email_invalido' : 'nombre_invalido';
      segmentos.descartado.push(c);
      continue;
    }

    // Descartar el email propio de Miguel
    if (c.email === 'miseal@gmail.com' || c.email === 'escuela.resonancias@gmail.com') {
      c.segmento = 'descartado';
      c.motivoDescarte = 'email_propio';
      segmentos.descartado.push(c);
      continue;
    }

    // Segmentar
    if (c.score >= 70) {
      c.segmento = 'A';
      segmentos.A.push(c);
    } else if (c.score >= 45) {
      c.segmento = 'B';
      segmentos.B.push(c);
    } else if (c.score >= 20) {
      c.segmento = 'C';
      segmentos.C.push(c);
    } else {
      c.segmento = 'D';
      segmentos.D.push(c);
    }
  }

  // Ordenar cada segmento por score desc
  for (const key of ['A', 'B', 'C', 'D', 'descartado']) {
    segmentos[key].sort((a, b) => b.score - a.score);
  }

  console.log(`  · Segmento A (70-100): ${segmentos.A.length} contactos`);
  console.log(`  · Segmento B (45-69):  ${segmentos.B.length} contactos`);
  console.log(`  · Segmento C (20-44):  ${segmentos.C.length} contactos`);
  console.log(`  · Segmento D (0-19):   ${segmentos.D.length} contactos`);
  console.log(`  · Descartados:         ${segmentos.descartado.length} contactos`);
  console.log('');

  // ─── PASO 5: Generar archivos ───
  console.log('── PASO 5: Generando archivos de salida ──');

  const docsDir = path.join(__dirname, '..', 'docs');
  const now = new Date().toISOString().split('T')[0];

  // Archivo 1: leads_consolidados_crm.md (A + B)
  let mdConsolidados = `# Leads Consolidados CRM — PianoLink\n`;
  mdConsolidados += `# Generado: ${now}\n`;
  mdConsolidados += `# Segmentos A + B (score >= 45)\n`;
  mdConsolidados += `# Producto: ${PRODUCTO}\n\n---\n\n`;

  mdConsolidados += `## SEGMENTO A — Score 70-100 (${segmentos.A.length} contactos)\n\n`;
  mdConsolidados += `| # | nombre | email | score | telefono | ciudad | campañas | fuentes | ex-alumno |\n`;
  mdConsolidados += `|---|--------|-------|-------|----------|--------|----------|---------|-----------|\n`;
  segmentos.A.forEach((c, i) => {
    mdConsolidados += `| ${i + 1} | ${c.nombre} | ${c.email} | ${c.score} | ${c.telefono || '—'} | ${c.ciudad || '—'} | ${c.campanas.join(', ') || '—'} | ${c.sourceFiles.join(', ')} | ${c.esExAlumno ? '✅' : '—'} |\n`;
  });

  mdConsolidados += `\n---\n\n## SEGMENTO B — Score 45-69 (${segmentos.B.length} contactos)\n\n`;
  mdConsolidados += `| # | nombre | email | score | ciudad | campañas | fuentes | intenciones |\n`;
  mdConsolidados += `|---|--------|-------|-------|--------|----------|---------|-----------|\n`;
  segmentos.B.forEach((c, i) => {
    const topIntenciones = c.intenciones.slice(0, 5).join(', ');
    mdConsolidados += `| ${i + 1} | ${c.nombre} | ${c.email} | ${c.score} | ${c.ciudad || '—'} | ${c.campanas.join(', ') || '—'} | ${c.sourceFiles.join(', ')} | ${topIntenciones || '—'} |\n`;
  });

  mdConsolidados += `\n---\n\n## RESUMEN\n`;
  mdConsolidados += `- **Segmento A**: ${segmentos.A.length} contactos (score 70-100)\n`;
  mdConsolidados += `- **Segmento B**: ${segmentos.B.length} contactos (score 45-69)\n`;
  mdConsolidados += `- **Total listos para contactar**: ${segmentos.A.length + segmentos.B.length}\n`;
  mdConsolidados += `- **Ex-alumnos Resonancias en A**: ${segmentos.A.filter(c => c.esExAlumno).length}\n\n`;
  mdConsolidados += `---\n*Generado automáticamente el ${now}*\n`;

  fs.writeFileSync(path.join(docsDir, 'leads_consolidados_crm.md'), mdConsolidados);
  console.log(`  ✅ docs/leads_consolidados_crm.md (${segmentos.A.length + segmentos.B.length} contactos)`);

  // Archivo 2: leads_nurturing.md (C)
  let mdNurturing = `# Leads Nurturing — PianoLink\n`;
  mdNurturing += `# Generado: ${now}\n`;
  mdNurturing += `# Segmento C (score 20-44) — Para secuencias de email/contenido\n\n---\n\n`;
  mdNurturing += `| # | nombre | email | score | campañas | fuentes |\n`;
  mdNurturing += `|---|--------|-------|-------|----------|---------|\n`;
  segmentos.C.forEach((c, i) => {
    mdNurturing += `| ${i + 1} | ${c.nombre} | ${c.email} | ${c.score} | ${c.campanas.join(', ') || '—'} | ${c.sourceFiles.join(', ')} |\n`;
  });
  mdNurturing += `\n---\n`;
  mdNurturing += `- **Total**: ${segmentos.C.length} contactos\n`;
  mdNurturing += `- **Acción recomendada**: Email drip campaign con contenido gratuito de piano\n\n`;
  mdNurturing += `---\n*Generado automáticamente el ${now}*\n`;

  fs.writeFileSync(path.join(docsDir, 'leads_nurturing.md'), mdNurturing);
  console.log(`  ✅ docs/leads_nurturing.md (${segmentos.C.length} contactos)`);

  // Archivo 3: leads_descartados.md (D + descartados)
  let mdDescartados = `# Leads Descartados / Baja Prioridad — PianoLink\n`;
  mdDescartados += `# Generado: ${now}\n\n---\n\n`;
  mdDescartados += `## SEGMENTO D — Score 0-19 (${segmentos.D.length} contactos)\n\n`;
  mdDescartados += `| # | nombre | email | score | fuentes |\n`;
  mdDescartados += `|---|--------|-------|-------|---------|\n`;
  segmentos.D.forEach((c, i) => {
    mdDescartados += `| ${i + 1} | ${c.nombre} | ${c.email} | ${c.score} | ${c.sourceFiles.join(', ')} |\n`;
  });
  mdDescartados += `\n---\n\n## DESCARTADOS POR CALIDAD (${segmentos.descartado.length})\n\n`;
  mdDescartados += `| # | nombre | email | motivo |\n`;
  mdDescartados += `|---|--------|-------|--------|\n`;
  segmentos.descartado.forEach((c, i) => {
    mdDescartados += `| ${i + 1} | ${c.nombre} | ${c.email} | ${c.motivoDescarte} |\n`;
  });
  mdDescartados += `\n---\n*Generado automáticamente el ${now}*\n`;

  fs.writeFileSync(path.join(docsDir, 'leads_descartados.md'), mdDescartados);
  console.log(`  ✅ docs/leads_descartados.md (${segmentos.D.length + segmentos.descartado.length} contactos)\n`);

  // ─── PASO 6: Upsert en MongoDB ───
  if (!SKIP_UPLOAD && !DRY_RUN) {
    console.log('── PASO 6: Upsert en MongoDB (Lead + CrmLead) ──');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('  [DB] ✅ Conectado a MongoDB\n');

    const stats = { creados: 0, actualizados: 0, crmCreados: 0, crmActualizados: 0, errores: 0, omitidos: 0 };

    // Solo subir segmentos A + B + C (no D ni descartados a la DB)
    const contactosParaDB = [...segmentos.A, ...segmentos.B, ...segmentos.C];
    console.log(`  Procesando ${contactosParaDB.length} contactos para upsert...\n`);

    for (let i = 0; i < contactosParaDB.length; i++) {
      const c = contactosParaDB[i];
      try {
        let lead = await Lead.findOne({ email: c.email });

        if (lead) {
          // Actualizar lead existente con datos enriquecidos
          let changed = false;

          // Solo actualizar campos vacíos o enriquecer
          if (c.telefono && (!lead.whatsapp || lead.whatsapp === '')) {
            lead.whatsapp = c.telefono;
            lead.whatsappLink = c.whatsappLink;
            changed = true;
          }
          if (c.ciudad && !lead.country) {
            lead.notes = (lead.notes || '') + (lead.notes ? '. ' : '') + `Ciudad: ${c.ciudad}`;
            changed = true;
          }
          if (c.esExAlumno && lead.source !== 'ex_alumno_resonancias') {
            lead.source = 'ex_alumno_resonancias';
            lead.fuente = 'ex_alumno_resonancias';
            lead.lista = 'ex_estudiantes_resonancias';
            lead.prioridad = c.prioridadResonancias === 'P1_exalumno' ? 'alta' : 'media';
            lead.cursoOriginal = c.cursoOriginal || lead.cursoOriginal;
            lead.anioInscripcionResonancias = c.anioInscripcion || lead.anioInscripcionResonancias;
            changed = true;
          }
          if (changed) {
            await lead.save();
            stats.actualizados++;
          } else {
            stats.omitidos++;
          }
        } else {
          // Crear nuevo Lead
          const leadData = {
            name: c.nombre || 'Sin nombre',
            email: c.email,
            type: 'client',
            clientType: 'adult_learner',
            source: c.esExAlumno ? 'ex_alumno_resonancias' : 'other',
            status: 'new',
            notes: c.notas || '',
            fuente: c.esExAlumno ? 'ex_alumno_resonancias' : (c.fuentes[0] || ''),
            prioridad: c.esExAlumno ? (c.prioridadResonancias === 'P1_exalumno' ? 'alta' : 'media') : '',
            rol: 'prospecto_estudiante',
            estadoPipeline: 'nuevo',
            lista: c.esExAlumno ? 'ex_estudiantes_resonancias' : '',
            country: 'CL',
            timezone: 'America/Santiago',
          };

          if (c.telefono) {
            leadData.whatsapp = c.telefono;
            leadData.whatsappLink = c.whatsappLink;
          }
          if (c.cursoOriginal) leadData.cursoOriginal = c.cursoOriginal;
          if (c.anioInscripcion) leadData.anioInscripcionResonancias = c.anioInscripcion;

          lead = await Lead.create(leadData);
          stats.creados++;
        }

        // CrmLead: buscar o crear
        let crmLead = await CrmLead.findOne({ leadRef: lead._id });

        // Determinar segmento CRM
        let segmentCrm = 'cold';
        if (c.esExAlumno) segmentCrm = 'ex_estudiantes_resonancias';
        else if (c.score >= 80) segmentCrm = 'hot';
        else if (c.score >= 50) segmentCrm = 'warm';

        // Tags
        const tags = [];
        if (c.esExAlumno) tags.push('resonancias', `prioridad_${c.prioridadResonancias || 'media'}`);
        if (c.cursoOriginal) tags.push(`curso_${c.cursoOriginal.toLowerCase().replace(/\//g, '_')}`);
        if (c.anioInscripcion) tags.push(`año_${c.anioInscripcion}`);
        if (c.campanas.length > 0) tags.push(...c.campanas.map(camp => `camp_${camp}`));
        if (c.sourceFiles.includes('resonancias')) tags.push('gmail_resonancias');
        if (c.sourceFiles.includes('miseal')) tags.push('gmail_miseal');
        tags.push(`segmento_${c.segmento}`);
        tags.push('consolidacion_2026');

        if (crmLead) {
          // Actualizar score si subió
          if (c.score > crmLead.score) {
            crmLead.score = c.score;
            crmLead.scoreHistory.push({
              date: new Date(),
              score: c.score,
              reason: 'consolidacion_masiva_2026'
            });
          }
          // Agregar tags nuevos
          for (const tag of tags) {
            if (!crmLead.tags.includes(tag)) crmLead.tags.push(tag);
          }
          // Actualizar segmento si es ex-alumno
          if (c.esExAlumno) crmLead.segment = 'ex_estudiantes_resonancias';
          if (c.esExAlumno) crmLead.lista = 'ex_estudiantes_resonancias';

          await crmLead.save();
          stats.crmActualizados++;
        } else {
          await CrmLead.create({
            leadRef: lead._id,
            score: c.score,
            scoreHistory: [{ date: new Date(), score: c.score, reason: 'consolidacion_masiva_2026' }],
            locale: 'es',
            currency: 'CLP',
            timezone: 'America/Santiago',
            lifecycleStage: 'lead',
            segment: segmentCrm,
            lista: c.esExAlumno ? 'ex_estudiantes_resonancias' : '',
            tags,
            pipelineStudent: 'lead',
            attribution: {
              firstTouch: {
                channel: c.esExAlumno ? 'other' : (c.fuentes.includes('gmail_directo') ? 'email' : 'organic'),
                utmSource: 'consolidacion_masiva',
                utmCampaign: 'consolidacion_crm_2026',
                timestamp: new Date()
              },
              lastTouch: {
                channel: c.esExAlumno ? 'other' : (c.fuentes.includes('gmail_directo') ? 'email' : 'organic'),
                utmSource: 'consolidacion_masiva',
                utmCampaign: 'consolidacion_crm_2026',
                timestamp: new Date()
              },
              touchpoints: [{
                channel: c.esExAlumno ? 'other' : (c.fuentes.includes('gmail_directo') ? 'email' : 'organic'),
                utmSource: 'consolidacion_masiva',
                utmCampaign: 'consolidacion_crm_2026',
                timestamp: new Date()
              }]
            }
          });
          stats.crmCreados++;
        }

        // Log progreso cada 200
        if ((i + 1) % 200 === 0) {
          console.log(`  ⏳ ${i + 1}/${contactosParaDB.length} procesados...`);
        }

      } catch (err) {
        if (err.code === 11000) {
          stats.omitidos++;
        } else {
          stats.errores++;
          if (stats.errores <= 10) {
            console.error(`  ❌ ${c.email}: ${err.message}`);
          }
        }
      }
    }

    console.log('\n  ── Resumen Upsert MongoDB ──');
    console.log(`  Leads creados:        ${stats.creados}`);
    console.log(`  Leads actualizados:   ${stats.actualizados}`);
    console.log(`  Leads sin cambios:    ${stats.omitidos}`);
    console.log(`  CrmLeads creados:     ${stats.crmCreados}`);
    console.log(`  CrmLeads actualizados:${stats.crmActualizados}`);
    console.log(`  Errores:              ${stats.errores}`);
    console.log('');

    await mongoose.connection.close();
    console.log('  [DB] Conexión cerrada.\n');
  } else {
    console.log('── PASO 6: OMITIDO (--skip-upload o --dry-run) ──\n');
  }

  // ─── PASO 7: Resumen ejecutivo + Top 20 ───
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║              RESUMEN EJECUTIVO — CONSOLIDACIÓN              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log(`FUENTES PROCESADAS:`);
  console.log(`  · Leads_Resonancias.md (ex-alumnos):       ${exAlumnos.length} contactos`);
  console.log(`  · leads_resonancias_gmail.md:               ${contactosResonancias.length} filas`);
  console.log(`  · leads_miseal_gmail.md:                    ${contactosMiseal.length} filas`);
  console.log(`  · TOTAL ÚNICOS CONSOLIDADOS:                ${totalConsolidado}`);
  console.log('');

  console.log(`SEGMENTACIÓN:`);
  console.log(`  🟢 Segmento A (70-100): ${segmentos.A.length} contactos — LISTOS para contactar`);
  console.log(`  🟡 Segmento B (45-69):  ${segmentos.B.length} contactos — Interés medio-alto`);
  console.log(`  🟠 Segmento C (20-44):  ${segmentos.C.length} contactos — Nurturing (email drip)`);
  console.log(`  🔴 Segmento D (0-19):   ${segmentos.D.length} contactos — Fríos / No contactar`);
  console.log(`  ⛔ Descartados:         ${segmentos.descartado.length} contactos — Bots/servicios/inválidos`);
  console.log('');

  const exAlumnosEnA = segmentos.A.filter(c => c.esExAlumno);
  console.log(`EX-ALUMNOS RESONANCIAS EN SEGMENTO A: ${exAlumnosEnA.length}`);
  console.log(`  (Todos con score 85-100, máxima prioridad de contacto)\n`);

  // Top 20: ex-alumnos primero, luego por score
  const top20sorted = [...segmentos.A].sort((a, b) => {
    // Ex-alumnos primero
    if (a.esExAlumno && !b.esExAlumno) return -1;
    if (!a.esExAlumno && b.esExAlumno) return 1;
    // Luego por score desc
    return b.score - a.score;
  });
  const top20 = top20sorted.slice(0, 20);
  console.log('════════════════════════════════════════════════════════════');
  console.log('  TOP 20 LEADS RECOMENDADOS PARA CONTACTAR PRIMERO');
  console.log('════════════════════════════════════════════════════════════\n');

  for (let i = 0; i < top20.length; i++) {
    const c = top20[i];
    const num = String(i + 1).padStart(2, ' ');
    const scoreStr = String(c.score).padStart(3, ' ');
    const exTag = c.esExAlumno ? ' [EX-ALUMNO]' : '';
    const telTag = c.telefono ? ` 📱 ${c.telefono}` : '';
    console.log(`  ${num}. ${c.nombre} — ${c.email} — Score: ${scoreStr}${exTag}${telTag}`);

    // Mensaje personalizado
    if (c.esExAlumno) {
      const saludo = c.nombre.split(' ')[0];
      console.log(`      📱 WhatsApp: ${c.whatsappLink}`);
      console.log(`      💬 Mensaje sugerido:`);
      console.log(`         "Hola ${saludo}, soy Miguel de Resonancias 🎹 ¿Te acuerdas de las clases de ${c.cursoOriginal || 'piano'}?`);
      console.log(`          Lancé PianoLink, una plataforma nueva para seguir aprendiendo.`);
      console.log(`          Tenemos un ${PRODUCTO} especial para ex-alumnos. ¿Te cuento?"`);
    } else {
      const saludo = c.nombre.split(' ')[0];
      const interes = c.intenciones.includes('piano') ? 'piano' : (c.intenciones[0] || 'música');
      console.log(`      ✉️ Email sugerido:`);
      console.log(`         "Hola ${saludo}, vimos tu interés en ${interes}. PianoLink es la nueva`);
      console.log(`          plataforma de clases de piano online. ${PRODUCTO}.`);
      console.log(`          ¿Te gustaría probarlo?"`);
    }
    console.log('');
  }

  // Archivos generados
  console.log('════════════════════════════════════════════════════════════');
  console.log('  ARCHIVOS GENERADOS');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  📄 docs/leads_consolidados_crm.md  — ${segmentos.A.length + segmentos.B.length} contactos (A+B)`);
  console.log(`  📄 docs/leads_nurturing.md          — ${segmentos.C.length} contactos (C)`);
  console.log(`  📄 docs/leads_descartados.md        — ${segmentos.D.length + segmentos.descartado.length} contactos (D+descartados)`);
  console.log('════════════════════════════════════════════════════════════\n');
}

// ============================================================================
// EJECUTAR
// ============================================================================
main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
