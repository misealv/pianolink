/**
 * Corrección real 2026-07: José Wilhelmy — restaurar anualidad de 48 clases
 *
 * Causa raíz (ver auditoría):
 * 1. Existen 2 cuentas duplicadas para la misma persona. La cuenta REAL
 *    (6997183bb6f86efb145056c0, josewilhelmy@gmail.com) es la que él usa
 *    para reservar (8 bookings reales). La cuenta duplicada
 *    (69f458a4ed8946b42b2f2abe, jose.wilhelmy@gmail.com) fue creada por
 *    error en un fix anterior (01-may-2026) y nunca fue usada por él.
 * 2. En la cuenta REAL, la migración "FASE 5" (01-may-2026) convirtió el
 *    legacy User.classesRemaining (que en ese momento ya estaba en 3, no 48)
 *    en una StudentSubscription con classesTotal:3 — perdiendo el número
 *    real de la anualidad contratada.
 * 3. Al agotarse esa suscripción de 3 clases, el sistema permitió seguir
 *    reservando sin descontar (subscriptionId: null en bookings de
 *    27-jun y 1-jul) — el bug de "no se descontaban las clases".
 *
 * Cálculo:
 *   48 (anualidad contratada) - 6 (clases confirmadas ya dictadas) + 1
 *   (compensación por cancelación del profesor el 8-jun) = 43 restantes.
 *
 * Acciones:
 *   A. Corregir StudentSubscription real: classesTotal=48, classesRemaining=43,
 *      classesCompleted=6, status=active.
 *   B. Sincronizar User.classesRemaining de la cuenta real = 43.
 *   C. Anular la suscripción fantasma de la cuenta duplicada (status=cancelled,
 *      classesRemaining=0) y marcar la cuenta duplicada visualmente.
 *
 * Ejecutar: node _fix_jose_2026_07_real.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { connectDirect } = require('./_db_direct_connect');

const REAL_USER_ID = '6997183bb6f86efb145056c0';
const REAL_SUB_ID = '69f46b94bb1022e9eea024f5';
const DUP_USER_ID = '69f458a4ed8946b42b2f2abe';
const DUP_SUB_ID = '69f480b0a254d65425631936';

const TOTAL_ANUAL = 48;
const CLASES_DICTADAS = 6;
const COMPENSACION = 1;
const RESTANTES = TOTAL_ANUAL - CLASES_DICTADAS + COMPENSACION; // 43

async function main() {
  await connectDirect(mongoose, process.env.MONGO_URI || process.env.MONGODB_URI);
  console.log('✅ Conectado a MongoDB');
  const db = mongoose.connection.db;
  const now = new Date();

  // --- A. Corregir suscripción REAL ---
  const realSubBefore = await db.collection('studentsubscriptions').findOne({ _id: new mongoose.Types.ObjectId(REAL_SUB_ID) });
  if (!realSubBefore) throw new Error('No se encontró la suscripción real, abortando.');

  const resA = await db.collection('studentsubscriptions').updateOne(
    { _id: new mongoose.Types.ObjectId(REAL_SUB_ID) },
    {
      $set: {
        classesTotal: TOTAL_ANUAL,
        classesRemaining: RESTANTES,
        classesCompleted: CLASES_DICTADAS,
        status: 'active'
      },
      $push: {
        statusHistory: {
          status: 'active',
          changedAt: now,
          changedBy: null,
          reason: `Corrección auditoría 2026-07: la migración FASE 5 había cargado solo 3 clases (residuo legacy) en vez de la anualidad real de ${TOTAL_ANUAL}. Se recalculó: ${TOTAL_ANUAL} contratadas - ${CLASES_DICTADAS} ya dictadas + ${COMPENSACION} compensación cancelación profesor = ${RESTANTES} restantes.`
        }
      }
    }
  );
  console.log(`[A] StudentSubscription real actualizada: ${resA.modifiedCount} doc(s)`);

  // --- B. Sincronizar User.classesRemaining real ---
  const resB = await db.collection('users').updateOne(
    { _id: new mongoose.Types.ObjectId(REAL_USER_ID) },
    { $set: { classesRemaining: RESTANTES } }
  );
  console.log(`[B] User.classesRemaining (real) actualizado: ${resB.modifiedCount} doc(s)`);

  // --- C. Anular suscripción fantasma + marcar cuenta duplicada ---
  const resC1 = await db.collection('studentsubscriptions').updateOne(
    { _id: new mongoose.Types.ObjectId(DUP_SUB_ID) },
    {
      $set: { status: 'cancelled', classesRemaining: 0 },
      $push: {
        statusHistory: {
          status: 'cancelled',
          changedAt: now,
          changedBy: null,
          reason: 'Auditoría 2026-07: suscripción creada por error en cuenta duplicada (jose.wilhelmy@gmail.com) que el alumno nunca usó. El pago manual asociado ($100) no correspondía a una transacción real verificada. Se anula para evitar doble asignación de clases. La anualidad real fue restaurada en la cuenta correcta (josewilhelmy@gmail.com).'
        }
      }
    }
  );
  console.log(`[C1] StudentSubscription duplicada anulada: ${resC1.modifiedCount} doc(s)`);

  const dupUser = await db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(DUP_USER_ID) });
  const resC2 = await db.collection('users').updateOne(
    { _id: new mongoose.Types.ObjectId(DUP_USER_ID) },
    { $set: { classesRemaining: 0, name: `${dupUser.name} [CUENTA DUPLICADA - NO USAR]` } }
  );
  console.log(`[C2] User duplicado marcado: ${resC2.modifiedCount} doc(s)`);

  // --- Verificación final ---
  const realUserAfter = await db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(REAL_USER_ID) });
  const realSubAfter = await db.collection('studentsubscriptions').findOne({ _id: new mongoose.Types.ObjectId(REAL_SUB_ID) });
  const dupSubAfter = await db.collection('studentsubscriptions').findOne({ _id: new mongoose.Types.ObjectId(DUP_SUB_ID) });
  const dupUserAfter = await db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(DUP_USER_ID) });

  console.log('\n=== RESULTADO FINAL ===');
  console.log('Cuenta real:', { name: realUserAfter.name, email: realUserAfter.email, classesRemaining: realUserAfter.classesRemaining });
  console.log('Subscripción real:', { classesTotal: realSubAfter.classesTotal, classesRemaining: realSubAfter.classesRemaining, classesCompleted: realSubAfter.classesCompleted, status: realSubAfter.status });
  console.log('Cuenta duplicada:', { name: dupUserAfter.name, classesRemaining: dupUserAfter.classesRemaining });
  console.log('Subscripción duplicada:', { status: dupSubAfter.status, classesRemaining: dupSubAfter.classesRemaining });

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
