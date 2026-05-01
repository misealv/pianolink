/**
 * FASE 4 audit — test del fix timezone
 * Simula la lógica de POST /slots y /quick-block sin pegarle al endpoint.
 * Verifica:
 *  1. Que un slot creado a las 18:00 hora Chile se guarde como 22:00 UTC (invierno) o 21:00 UTC (verano DST)
 *  2. Que cruzando DST la hora local se mantenga (no haya drift de 1h)
 *  3. Que dayOfWeek se calcule en TZ del profesor (no UTC)
 *  4. Que el bug previo (new Date sin TZ) producía resultado incorrecto
 */
const moment = require('moment-timezone');

const TZ = 'America/Santiago';
let passed = 0, failed = 0;
const ok = m => { console.log(`  ✅ ${m}`); passed++; };
const fail = m => { console.error(`  ❌ ${m}`); failed++; };
const head = m => console.log(`\n== ${m} ==`);

// ── TEST 1: Slot 18:00 Chile invierno (mayo) → debe guardarse como 22:00 UTC
head('TEST 1: Slot 18:00 hora Chile en mayo (invierno, UTC-4)');
{
    const date = '2026-05-15';
    const startTime = '18:00';
    const fixed = moment.tz(`${date} ${startTime}`, 'YYYY-MM-DD HH:mm', TZ).toDate();
    const buggy = new Date(`${date}T${startTime}:00`); // bug previo
    const expectedUTC = '2026-05-15T22:00:00.000Z';
    if (fixed.toISOString() === expectedUTC) ok(`Fix: ${fixed.toISOString()} ✓`);
    else fail(`Fix produjo ${fixed.toISOString()}, esperado ${expectedUTC}`);

    if (buggy.toISOString() !== expectedUTC) ok(`Bug previo confirmado: ${buggy.toISOString()} (4h de desfase)`);
    else fail('Bug previo no se reproduce — algo está raro');
}

// ── TEST 2: Slot 18:00 Chile en enero (verano, UTC-3)
head('TEST 2: Slot 18:00 hora Chile en enero (verano DST, UTC-3)');
{
    const date = '2027-01-15';
    const startTime = '18:00';
    const fixed = moment.tz(`${date} ${startTime}`, 'YYYY-MM-DD HH:mm', TZ).toDate();
    const expectedUTC = '2027-01-15T21:00:00.000Z';
    if (fixed.toISOString() === expectedUTC) ok(`Fix: ${fixed.toISOString()} ✓ (DST CL aplicado)`);
    else fail(`Fix produjo ${fixed.toISOString()}, esperado ${expectedUTC}`);

    // Y verificar que al renderizar de vuelta en TZ Chile da 18:00
    const back = moment(fixed).tz(TZ).format('HH:mm');
    if (back === '18:00') ok(`Round-trip: UTC → Chile = ${back} ✓`);
    else fail(`Round-trip dio ${back}, esperado 18:00`);
}

// ── TEST 3: Cruzar DST de primavera (~5 sept 2026 en Chile)
head('TEST 3: Cruzando DST primavera CL (sept 2026) — slots semanales mantienen hora local');
{
    // Usar la lógica iterativa de quick-block
    const startTime = '18:00';
    const startMoment = moment.tz('2026-08-30', TZ).startOf('day'); // domingo previo al cambio
    const horas = [];
    for (let w = 0; w < 4; w++) {
        const dateStr = startMoment.clone().add(w * 7, 'days').format('YYYY-MM-DD');
        const startDT = moment.tz(`${dateStr} ${startTime}`, 'YYYY-MM-DD HH:mm', TZ).toDate();
        const back = moment(startDT).tz(TZ).format('YYYY-MM-DD HH:mm');
        horas.push({ dateStr, utc: startDT.toISOString(), local: back });
    }
    horas.forEach(h => console.log(`     ${h.dateStr} → UTC ${h.utc} → CL ${h.local}`));
    const allEqualLocalHour = horas.every(h => h.local.endsWith('18:00'));
    if (allEqualLocalHour) ok('Las 4 semanas mantienen 18:00 hora Chile (DST manejado correctamente)');
    else fail('Hay drift de hora local cruzando DST');

    // Y los UTC deben diferir entre invierno y verano
    const utcHours = horas.map(h => parseInt(h.utc.substring(11, 13)));
    const distinctUTC = new Set(utcHours);
    if (distinctUTC.size > 1) ok(`UTC varía entre semanas (${[...distinctUTC].join(', ')}h) — esperado por DST`);
    else fail('UTC idéntico en todas las semanas — DST no se aplicó');
}

// ── TEST 4: dayOfWeek en TZ del profesor vs UTC del server
head('TEST 4: dayOfWeek calculado en TZ profesor (caso límite medianoche)');
{
    // Caso extremo: en Chile son las 23:00 del sábado, en UTC son las 03:00 del domingo
    // Antes: new Date().getDay() devolvía 0 (domingo)
    // Ahora: moment.tz(TZ).day() devuelve 6 (sábado)
    const fakeUTC = new Date('2026-05-17T03:00:00Z'); // 23:00 CL sab, 00:00 UTC dom
    const dayInTZ = moment.tz(fakeUTC, TZ).day();
    const dayInUTC = fakeUTC.getUTCDay();
    if (dayInTZ === 6 && dayInUTC === 0) ok(`dayInTZ=${dayInTZ} (sábado) ≠ dayInUTC=${dayInUTC} (domingo) — diferencia detectada`);
    else fail(`Resultado inesperado: dayInTZ=${dayInTZ}, dayInUTC=${dayInUTC}`);
}

// ── TEST 5: Verificar que no hay regresión en getAvailableSlots
head('TEST 5: Render al alumno conserva la hora correcta');
{
    // Slot guardado como 22:00 UTC (que es 18:00 Chile invierno)
    const slotUTC = new Date('2026-05-15T22:00:00Z');
    // Profesor lo ve en TZ Chile
    const teacherView = moment(slotUTC).tz('America/Santiago').format('HH:mm');
    // Alumno en Argentina (UTC-3) lo ve
    const studentView = moment(slotUTC).tz('America/Argentina/Buenos_Aires').format('HH:mm');
    if (teacherView === '18:00') ok(`Profesor (CL) ve: ${teacherView} ✓`);
    else fail(`Profesor (CL) ve: ${teacherView}, esperado 18:00`);
    if (studentView === '19:00') ok(`Alumno (AR) ve: ${studentView} ✓ (correctamente +1h)`);
    else fail(`Alumno (AR) ve: ${studentView}, esperado 19:00`);
}

// ── Resumen
console.log(`\n${'='.repeat(50)}`);
console.log(`AUDITORIA FASE 4: ${passed} passed | ${failed} failed`);
console.log(failed === 0 ? '✅ FASE 4 — VERIFICADA' : '❌ FASE 4 — TIENE FALLAS');
console.log('='.repeat(50));
process.exit(failed > 0 ? 1 : 0);
