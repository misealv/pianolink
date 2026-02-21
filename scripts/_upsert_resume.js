/**
 * scripts/_upsert_resume.js
 * 
 * Retoma el upsert a MongoDB que se interrumpió en consolidate-leads-crm.js
 * Salta contactos que ya existen (idempotente por email).
 * Procesa en lotes de 500 con pausa entre lotes.
 * 
 * Uso: node scripts/_upsert_resume.js [--phase=1|2|3]
 *   --phase=1  → Segmento A (274 contactos)
 *   --phase=2  → Segmento B (3407 contactos)  
 *   --phase=3  → Segmento C (2580 contactos)
 *   (sin flag)  → Todos los segmentos A+B+C
 */
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const Lead = require('../models/Lead');
const CrmLead = require('../crm/models/CrmLead');

// Tomar fase de args
const phaseArg = process.argv.find(a => a.startsWith('--phase='));
const PHASE = phaseArg ? parseInt(phaseArg.split('=')[1]) : 0; // 0 = all

// ============================================================================
// PARSEO (idéntico al consolidate pero sin generar archivos)
// ============================================================================

const EMAILS_BLACKLIST_PATTERNS = [
  /noreply@/i, /no-reply@/i, /notificaciones@/i, /notifications@/i,
  /reminders@/i, /info@profesordepiano/i, /wordpress@/i,
  /@paypal\./i, /@bancointernacional\./i, /@bancofalabella\./i,
  /@cl\.bancofalabella\./i, /@starofservice\./i, /@especial\.2x3\./i,
  /@mailtrack\./i, /contact\.cl@starofservice/i, /member@paypal/i,
  /@sii\.cl$/i, /@correos\.cl$/i, /@servel\.cl$/i,
  /mailer-daemon@/i, /postmaster@/i, /daemon@/i,
];
const DOMAIN_BLACKLIST = ['paypal.com','starofservice.com','mailtrack.io','2x3.cl','bancointernacional.cl','bancofalabella.com'];
const NOMBRES_BLACKLIST = ['sin_nombre','face manager','administracion','banco falabella','banco internacional','mailtrack reminder','starOfservice','2x3.cl','enrique acosta herrera a través de paypal','profesordepiano.cl','academia oriente'];

const CAMPAIGN_SCORES = { estudiantes_vigentes:20, clase_de_prueba:15, clase_demostrativa:15, pianoefectivo_prospectos:12, ofertabienvenida:12, profesordepiano:10, informacionescuela:8, escuelaresonancias:8, piano_resonancias:10, unica_vez_resonancias:6, giftcardresonancias:5, cv2017:3, conveinosempresas:2, seminarioswebpiano:3, simpleynatural:2 };
const INTENCION_SCORES = { pago:12, reserva:10, quiere_aprender:8, pregunta_precio:7, pregunta_horario:5, piano:6, clases:4, pide_info:4, composición:5, armonía:4, teoría:3, registro:3, canto:2, guitarra:1 };

function parseMdGmail(filePath, sourceLabel) {
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  const contactos = [];
  let cp = 'P4';
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('## PRIORIDAD 1')) cp = 'P1';
    else if (t.startsWith('## PRIORIDAD 2')) cp = 'P2';
    else if (t.startsWith('## PRIORIDAD 3')) cp = 'P3';
    else if (t.startsWith('## PRIORIDAD 4')) cp = 'P4';
    else if (t.startsWith('## DUPLICADOS')) cp = 'DUP';
    else if (t.startsWith('## RESUMEN')) break;
    if (t.startsWith('|') && !t.startsWith('|--') && !t.includes('nombre') && !t.includes('email') && t.includes('@')) {
      const cells = t.split('|').map(c => c.trim()).filter(c => c.length > 0);
      if (cells.length >= 6) {
        const email = (cells[1] || '').toLowerCase().trim();
        if (email && email.includes('@')) {
          contactos.push({ nombre: cells[0]||'', email, fecha: cells[2]||'', ciudad: cells[3]==='—'?'':cells[3], campana: cells[4]==='—'?'':cells[4], fuente: cells[5]||'', intencion: cells[6]||'', prioridadOriginal: cp, sourceFile: sourceLabel, isDuplicate: cp==='DUP' });
        }
      }
    }
  }
  return contactos;
}

function parseExAlumnosMd(filePath) {
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  const contactos = [];
  let cp = '';
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('## PRIORIDAD 1')) cp = 'P1_exalumno';
    else if (t.startsWith('## PRIORIDAD 2')) cp = 'P2_exalumno';
    else if (t.startsWith('## PRIORIDAD 3')) cp = 'P3_exalumno';
    else if (t.startsWith('## PRIORIDAD 4')) cp = 'P4_exalumno';
    if (t.startsWith('|') && !t.startsWith('|--') && !t.includes('nombre') && !t.includes('telefono') && t.includes('@')) {
      const cells = t.split('|').map(c => c.trim()).filter(c => c.length > 0);
      if (cells.length >= 5) {
        const email = (cells[2] || '').toLowerCase().trim();
        if (email && email.includes('@')) {
          contactos.push({ nombre: cells[0], telefono: (cells[1]||'').replace(/[^0-9]/g,''), email, anio: cells[3], curso: cp==='P4_exalumno'?'Piano':(cells[4]||''), notas: cp==='P4_exalumno'?(cells[4]||''):(cells[5]||''), prioridadResonancias: cp, esExAlumno: true });
        }
      }
    }
  }
  return contactos;
}

function calcularScore(c) {
  let score = 0;
  if (c.prioridadesOriginales) {
    if (c.prioridadesOriginales.includes('P1')) score += 30;
    else if (c.prioridadesOriginales.includes('P2')) score += 25;
    else if (c.prioridadesOriginales.includes('P3')) score += 15;
    else if (c.prioridadesOriginales.includes('P4')) score += 5;
  }
  if (c.esExAlumno) {
    score = 85;
    if (c.prioridadResonancias === 'P1_exalumno') score = 95;
    else if (c.prioridadResonancias === 'P2_exalumno') score = 90;
    else if (c.prioridadResonancias === 'P3_exalumno') score = 85;
    else if (c.prioridadResonancias === 'P4_exalumno') score = 87;
    if (c.telefono) score = Math.min(100, score + 3);
    return score;
  }
  if (c.campanas) { for (const camp of c.campanas) { const k = camp.toLowerCase().trim(); if (CAMPAIGN_SCORES[k]) score += CAMPAIGN_SCORES[k]; } }
  if (c.intenciones) { let ib = 0; for (const i of [...new Set(c.intenciones)]) { const k = i.toLowerCase().trim(); if (INTENCION_SCORES[k]) ib += INTENCION_SCORES[k]; } score += Math.min(ib, 30); }
  if (c.fuentes) { if (c.fuentes.includes('gmail_directo')) score += 5; if (c.fuentes.includes('formulario')) score += 7; if (c.fuentes.includes('getresponse')) score += 3; }
  if (c.sourceFiles && c.sourceFiles.length > 1) score += 5;
  if (c.fuentes && c.fuentes.length > 1) score += 3;
  if (c.fechaMasReciente) { const y = parseInt(c.fechaMasReciente.substring(0,4)); if (y>=2022) score+=8; else if (y>=2020) score+=5; else if (y>=2018) score+=3; else if (y>=2016) score+=1; }
  if (c.ciudad && c.ciudad.length > 1) score += 2;
  return Math.max(0, Math.min(100, score));
}

function esInvalido(email, nombre) {
  if (!email || !email.includes('@')) return true;
  for (const p of EMAILS_BLACKLIST_PATTERNS) { if (p.test(email)) return true; }
  const domain = email.split('@')[1];
  if (DOMAIN_BLACKLIST.includes(domain)) return true;
  if (!nombre || nombre.length < 2) return true;
  const lower = nombre.toLowerCase().trim();
  if (NOMBRES_BLACKLIST.some(n => lower.includes(n.toLowerCase()))) return true;
  if (email === 'miseal@gmail.com' || email === 'escuela.resonancias@gmail.com') return true;
  return false;
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  console.log('\n═══ UPSERT RESUME — Retomando carga a MongoDB ═══\n');

  // Parsear todo en memoria
  const docsDir = path.join(__dirname, '..', 'docs');
  const exAlumnos = parseExAlumnosMd(path.join(docsDir, 'Leads_Resonancias.md'));
  const exAlumnoMap = {};
  for (const ea of exAlumnos) exAlumnoMap[ea.email] = ea;

  const cr = parseMdGmail(path.join(docsDir, 'leads_resonancias_gmail.md'), 'resonancias');
  const cm = parseMdGmail(path.join(docsDir, 'leads_miseal_gmail.md'), 'miseal');
  console.log(`Parseados: ${exAlumnos.length} ex-alumnos, ${cr.length} resonancias, ${cm.length} miseal`);

  // Consolidar
  const consolidado = {};
  for (const ea of exAlumnos) {
    consolidado[ea.email] = { nombre:ea.nombre, email:ea.email, telefono:ea.telefono, whatsappLink:ea.telefono?`https://wa.me/${ea.telefono}`:'', ciudad:'', campanas:[], fuentes:['ex_alumno_resonancias'], intenciones:['piano','clases','quiere_aprender'], prioridadesOriginales:[], sourceFiles:['ex_alumnos_md'], fechaMasReciente:ea.anio&&ea.anio!=='s/f'?`${ea.anio}-01-01`:'', esExAlumno:true, prioridadResonancias:ea.prioridadResonancias, cursoOriginal:ea.curso, anioInscripcion:ea.anio, notas:ea.notas };
  }

  function merge(c) {
    if (!c.email) return;
    if (!consolidado[c.email]) {
      consolidado[c.email] = { nombre:c.nombre, email:c.email, telefono:'', whatsappLink:'', ciudad:c.ciudad||'', campanas:[], fuentes:[], intenciones:[], prioridadesOriginales:[], sourceFiles:[], fechaMasReciente:'', esExAlumno:false, prioridadResonancias:null, cursoOriginal:'', anioInscripcion:'', notas:'' };
    }
    const e = consolidado[c.email];
    if (c.nombre && c.nombre.length > (e.nombre||'').length && c.nombre !== 'sin_nombre') e.nombre = c.nombre;
    if (c.ciudad && !e.ciudad) e.ciudad = c.ciudad;
    if (c.campana) { for (const x of c.campana.split(',').map(x=>x.trim()).filter(x=>x&&x!=='—')) { if (!e.campanas.includes(x)) e.campanas.push(x); } }
    if (c.fuente) { for (const x of c.fuente.split(',').map(x=>x.trim()).filter(x=>x)) { if (!e.fuentes.includes(x)) e.fuentes.push(x); } }
    if (c.intencion) { for (const x of c.intencion.split(',').map(x=>x.trim()).filter(x=>x)) { if (!e.intenciones.includes(x)) e.intenciones.push(x); } }
    if (c.prioridadOriginal && !e.prioridadesOriginales.includes(c.prioridadOriginal)) e.prioridadesOriginales.push(c.prioridadOriginal);
    if (c.sourceFile && !e.sourceFiles.includes(c.sourceFile)) e.sourceFiles.push(c.sourceFile);
    if (c.fecha && c.fecha !== '—' && c.fecha > (e.fechaMasReciente||'')) e.fechaMasReciente = c.fecha;
    if (exAlumnoMap[c.email]) { const ea = exAlumnoMap[c.email]; e.esExAlumno=true; e.prioridadResonancias=ea.prioridadResonancias; e.telefono=ea.telefono||e.telefono; e.whatsappLink=ea.telefono?`https://wa.me/${ea.telefono}`:e.whatsappLink; e.cursoOriginal=ea.curso; e.anioInscripcion=ea.anio; e.notas=ea.notas||e.notas; }
  }
  for (const c of cr) merge(c);
  for (const c of cm) merge(c);

  // Score + Segmentar + Filtrar
  const segA = [], segB = [], segC = [];
  for (const email of Object.keys(consolidado)) {
    const c = consolidado[email];
    c.score = calcularScore(c);
    if (esInvalido(c.email, c.nombre)) continue;
    if (c.score >= 70) { c.segmento = 'A'; segA.push(c); }
    else if (c.score >= 45) { c.segmento = 'B'; segB.push(c); }
    else if (c.score >= 20) { c.segmento = 'C'; segC.push(c); }
    // D y descartados no se suben
  }

  console.log(`Segmentos: A=${segA.length}, B=${segB.length}, C=${segC.length}`);

  // Seleccionar qué procesar según fase
  let contactos;
  if (PHASE === 1) { contactos = segA; console.log(`\n▶ FASE 1: Solo Segmento A (${segA.length} contactos)`); }
  else if (PHASE === 2) { contactos = segB; console.log(`\n▶ FASE 2: Solo Segmento B (${segB.length} contactos)`); }
  else if (PHASE === 3) { contactos = segC; console.log(`\n▶ FASE 3: Solo Segmento C (${segC.length} contactos)`); }
  else { contactos = [...segA, ...segB, ...segC]; console.log(`\n▶ TODAS LAS FASES: ${contactos.length} contactos`); }

  // Conectar DB
  await mongoose.connect(process.env.MONGO_URI);
  console.log('[DB] ✅ Conectado\n');

  const stats = { creados:0, actualizados:0, crmCreados:0, crmActualizados:0, yaExistian:0, errores:0 };
  const BATCH = 500;

  for (let batch = 0; batch < contactos.length; batch += BATCH) {
    const slice = contactos.slice(batch, batch + BATCH);
    const batchNum = Math.floor(batch / BATCH) + 1;
    const totalBatches = Math.ceil(contactos.length / BATCH);
    console.log(`── Lote ${batchNum}/${totalBatches} (${slice.length} contactos) ──`);

    for (const c of slice) {
      try {
        let lead = await Lead.findOne({ email: c.email });

        if (lead) {
          // Verificar si ya tiene CrmLead con tag consolidacion_2026
          const existingCrm = await CrmLead.findOne({ leadRef: lead._id, tags: 'consolidacion_2026' });
          if (existingCrm) {
            // Ya procesado en la corrida anterior, saltar
            stats.yaExistian++;
            continue;
          }

          // Actualizar lead existente con datos enriquecidos
          let changed = false;
          if (c.telefono && (!lead.whatsapp || lead.whatsapp === '')) {
            lead.whatsapp = c.telefono; lead.whatsappLink = c.whatsappLink; changed = true;
          }
          if (c.ciudad && !lead.country) {
            lead.notes = (lead.notes||'') + (lead.notes?'. ':'') + `Ciudad: ${c.ciudad}`; changed = true;
          }
          if (c.esExAlumno && lead.source !== 'ex_alumno_resonancias') {
            lead.source = 'ex_alumno_resonancias'; lead.fuente = 'ex_alumno_resonancias';
            lead.lista = 'ex_estudiantes_resonancias'; lead.prioridad = c.prioridadResonancias==='P1_exalumno'?'alta':'media';
            lead.cursoOriginal = c.cursoOriginal||lead.cursoOriginal; lead.anioInscripcionResonancias = c.anioInscripcion||lead.anioInscripcionResonancias;
            changed = true;
          }
          if (changed) { await lead.save(); stats.actualizados++; }
        } else {
          // Crear nuevo Lead
          const ld = {
            name: c.nombre||'Sin nombre', email: c.email, type: 'client', clientType: 'adult_learner',
            source: c.esExAlumno ? 'ex_alumno_resonancias' : 'other', status: 'new', notes: c.notas||'',
            fuente: c.esExAlumno ? 'ex_alumno_resonancias' : (c.fuentes[0]||''), 
            prioridad: c.esExAlumno ? (c.prioridadResonancias==='P1_exalumno'?'alta':'media') : '',
            rol: 'prospecto_estudiante', estadoPipeline: 'nuevo',
            lista: c.esExAlumno ? 'ex_estudiantes_resonancias' : '', country: 'CL', timezone: 'America/Santiago'
          };
          if (c.telefono) { ld.whatsapp = c.telefono; ld.whatsappLink = c.whatsappLink; }
          if (c.cursoOriginal) ld.cursoOriginal = c.cursoOriginal;
          if (c.anioInscripcion) ld.anioInscripcionResonancias = c.anioInscripcion;
          lead = await Lead.create(ld);
          stats.creados++;
        }

        // CrmLead
        let crmLead = await CrmLead.findOne({ leadRef: lead._id });

        let segmentCrm = 'cold';
        if (c.esExAlumno) segmentCrm = 'ex_estudiantes_resonancias';
        else if (c.score >= 80) segmentCrm = 'hot';
        else if (c.score >= 50) segmentCrm = 'warm';

        const tags = [];
        if (c.esExAlumno) tags.push('resonancias', `prioridad_${c.prioridadResonancias||'media'}`);
        if (c.cursoOriginal) tags.push(`curso_${c.cursoOriginal.toLowerCase().replace(/\//g,'_')}`);
        if (c.anioInscripcion) tags.push(`año_${c.anioInscripcion}`);
        if (c.campanas.length > 0) tags.push(...c.campanas.map(x => `camp_${x}`));
        if (c.sourceFiles.includes('resonancias')) tags.push('gmail_resonancias');
        if (c.sourceFiles.includes('miseal')) tags.push('gmail_miseal');
        tags.push(`segmento_${c.segmento}`);
        tags.push('consolidacion_2026');

        if (crmLead) {
          if (c.score > crmLead.score) {
            crmLead.score = c.score;
            crmLead.scoreHistory.push({ date: new Date(), score: c.score, reason: 'consolidacion_masiva_2026' });
          }
          for (const tag of tags) { if (!crmLead.tags.includes(tag)) crmLead.tags.push(tag); }
          if (c.esExAlumno) { crmLead.segment = 'ex_estudiantes_resonancias'; crmLead.lista = 'ex_estudiantes_resonancias'; }
          await crmLead.save();
          stats.crmActualizados++;
        } else {
          await CrmLead.create({
            leadRef: lead._id, score: c.score,
            scoreHistory: [{ date: new Date(), score: c.score, reason: 'consolidacion_masiva_2026' }],
            locale: 'es', currency: 'CLP', timezone: 'America/Santiago', lifecycleStage: 'lead',
            segment: segmentCrm, lista: c.esExAlumno ? 'ex_estudiantes_resonancias' : '', tags,
            pipelineStudent: 'lead',
            attribution: {
              firstTouch: { channel: c.esExAlumno?'other':(c.fuentes.includes('gmail_directo')?'email':'organic'), utmSource:'consolidacion_masiva', utmCampaign:'consolidacion_crm_2026', timestamp: new Date() },
              lastTouch: { channel: c.esExAlumno?'other':(c.fuentes.includes('gmail_directo')?'email':'organic'), utmSource:'consolidacion_masiva', utmCampaign:'consolidacion_crm_2026', timestamp: new Date() },
              touchpoints: [{ channel: c.esExAlumno?'other':(c.fuentes.includes('gmail_directo')?'email':'organic'), utmSource:'consolidacion_masiva', utmCampaign:'consolidacion_crm_2026', timestamp: new Date() }]
            }
          });
          stats.crmCreados++;
        }
      } catch (err) {
        if (err.code === 11000) { stats.yaExistian++; }
        else { stats.errores++; if (stats.errores <= 5) console.error(`  ❌ ${c.email}: ${err.message}`); }
      }
    }

    console.log(`  ✅ Lote ${batchNum} completo — Creados:${stats.creados} Act:${stats.actualizados} CrmNew:${stats.crmCreados} CrmAct:${stats.crmActualizados} Skip:${stats.yaExistian} Err:${stats.errores}\n`);
  }

  console.log('═══ RESUMEN FINAL UPSERT ═══');
  console.log(`  Leads creados:          ${stats.creados}`);
  console.log(`  Leads actualizados:     ${stats.actualizados}`);
  console.log(`  CrmLeads creados:       ${stats.crmCreados}`);
  console.log(`  CrmLeads actualizados:  ${stats.crmActualizados}`);
  console.log(`  Ya existían (skip):     ${stats.yaExistian}`);
  console.log(`  Errores:                ${stats.errores}`);

  await mongoose.connection.close();
  console.log('[DB] Conexión cerrada.\n');
}

main().catch(err => { console.error('[FATAL]', err); process.exit(1); });
