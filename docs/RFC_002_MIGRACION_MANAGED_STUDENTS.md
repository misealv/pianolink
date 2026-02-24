# RFC-002: Migración de `managedStudents[]` a Users Reales

**Fecha:** 24 de febrero de 2026  
**Autor:** Arquitecto Senior / Copilot  
**Estado:** Propuesta  
**Sprint:** 5 (Diseño)  
**Depende de:** RFC-001 (Unificación de Roles)  
**Impacto:** 🔴 Migración de datos en producción

---

## 1. Problema

Los `managedStudents[]` son subdocumentos embebidos dentro de `User.clientData`:

```javascript
// Estado actual — NO son Users
clientData: {
    accountType: 'guardian',
    managedStudents: [{
        _id: ObjectId(),     // ID de subdocumento Mongoose (auto-generado)
        name: "Sofía López",
        age: 8,
        classesRemaining: 2, // LEGACY
        classesUsed: 3
    }]
}
```

### Consecuencias

| Limitación | Impacto |
|-----------|---------|
| No tienen cuenta propia | No pueden loguearse, no reciben emails |
| No tienen perfil | No se les puede asignar nivel, instrumento, historial propio |
| Saldo disperso | `classesRemaining` está aquí Y en `StudentSubscription` |
| Búsqueda frágil | Reembolsos buscan por `name.toLowerCase()` — puede fallar con acentos/duplicados |
| No son referenciables | `Booking.studentId` a veces apunta al `client._id`, no al hijo real |
| 87+ touchpoints | Cualquier cambio al modelo requiere tocar 14+ archivos |

---

## 2. Estado Objetivo

Cada `managedStudent` se convierte en un `User` real:

```javascript
// Hijo promovido a User
{
    name: "Sofía López",
    email: "sofia-lopez-<parentSlug>@pianolink.internal",  // Email interno auto-generado
    password: "<random-hash>",    // No puede loguearse (hasta que se genere magic link)
    role: "student",
    studentData: {
        parentId: ObjectId("parent_user_id"),
        source: "platform",
        level: "beginner",
        instrument: "piano",
        age: 8,
        isGuardian: false
    }
}
```

---

## 3. Script de Migración

### 3.1 Pre-migración: Auditoría

```javascript
// scripts/audit-managed-students.js
// Ejecutar ANTES de migrar para identificar problemas

async function auditManagedStudents() {
    const guardians = await User.find({
        role: 'client',
        'clientData.accountType': 'guardian',
        'clientData.managedStudents.0': { $exists: true }
    });
    
    const report = {
        totalGuardians: guardians.length,
        totalChildren: 0,
        duplicateNames: [],           // Mismo guardian, hijos con nombre igual
        orphanBookings: [],           // Bookings cuyo studentId no matchea ningún hijo
        balanceDiscrepancies: [],     // classesRemaining no cuadra con StudentSubscription
        childrenWithExistingUser: []  // ¿Ya existe un User con ese nombre+age?
    };
    
    for (const guardian of guardians) {
        const children = guardian.clientData.managedStudents || [];
        report.totalChildren += children.length;
        
        // Detectar duplicados
        const names = children.map(c => c.name.toLowerCase().trim());
        const dupes = names.filter((n, i) => names.indexOf(n) !== i);
        if (dupes.length > 0) {
            report.duplicateNames.push({
                guardianId: guardian._id,
                guardianName: guardian.name,
                duplicates: dupes
            });
        }
        
        // Verificar bookings
        const bookings = await Booking.find({
            clientId: guardian._id,
            status: { $in: ['confirmed', 'completed'] }
        });
        for (const booking of bookings) {
            const studentName = booking.studentName;
            const match = children.find(c => 
                c.name.toLowerCase().trim() === (studentName || '').toLowerCase().trim()
            );
            if (!match && studentName) {
                report.orphanBookings.push({
                    bookingId: booking._id,
                    studentName,
                    guardianId: guardian._id
                });
            }
        }
        
        // Verificar balance
        for (const child of children) {
            const sub = await StudentSubscription.findOne({
                studentId: guardian._id,  // Subs actuales están a nombre del guardian
                status: 'active'
            });
            if (sub && sub.classesRemaining !== child.classesRemaining) {
                report.balanceDiscrepancies.push({
                    guardianId: guardian._id,
                    childName: child.name,
                    childBalance: child.classesRemaining,
                    subBalance: sub.classesRemaining
                });
            }
        }
    }
    
    return report;
}
```

### 3.2 Migración Principal

```javascript
// scripts/migrate-managed-students.js
// Ejecutable: node scripts/migrate-managed-students.js [--dry-run]

const DRY_RUN = process.argv.includes('--dry-run');

async function migrateManagedStudents() {
    const guardians = await User.find({
        role: 'client',
        'clientData.accountType': 'guardian',
        'clientData.managedStudents.0': { $exists: true }
    });
    
    const results = { created: 0, skipped: 0, errors: [] };
    
    for (const guardian of guardians) {
        const children = guardian.clientData.managedStudents || [];
        
        for (const child of children) {
            try {
                // Verificar si ya existe un User para este hijo
                const existing = await User.findOne({
                    'studentData.parentId': guardian._id,
                    name: child.name
                });
                if (existing) {
                    results.skipped++;
                    continue;
                }
                
                // Generar email interno único
                const slug = guardian.slug || guardian._id.toString().slice(-6);
                const safeName = child.name.toLowerCase()
                    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                    .replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 20);
                const internalEmail = `${safeName}-${slug}@pianolink.internal`;
                
                // Generar password random (no podrán loguearse directamente)
                const randomPassword = require('crypto').randomBytes(32).toString('hex');
                
                const newStudent = {
                    name: child.name,
                    email: internalEmail,
                    password: randomPassword,
                    role: 'student',
                    studentData: {
                        parentId: guardian._id,
                        source: 'platform',
                        level: 'beginner',
                        instrument: 'piano',
                        age: child.age || null,
                        isGuardian: false
                    },
                    // NO copiar classesRemaining — se usará StudentSubscription
                    classesRemaining: 0,
                    classesCompleted: child.classesUsed || 0,
                    createdAt: guardian.createdAt  // Preservar antigüedad
                };
                
                if (!DRY_RUN) {
                    const created = await User.create(newStudent);
                    
                    // Migrar los subdocumento _id → nuevo User._id en:
                    // 1. Bookings donde clientId=guardian y studentName matchea
                    await Booking.updateMany(
                        {
                            clientId: guardian._id,
                            studentName: { $regex: new RegExp(`^${escapeRegex(child.name)}$`, 'i') }
                        },
                        {
                            $set: {
                                studentId: created._id,
                                payerId: guardian._id  // Nuevo campo
                            }
                        }
                    );
                    
                    // 2. StudentSubscription donde studentId=guardian
                    //    (reasignar al hijo si solo hay 1 hijo, o splitear)
                    // NOTA: Esto requiere lógica especial si guardian tiene múltiples hijos
                    //       Ver sección 3.3
                    
                    // 3. Enrollments donde studentId=guardian
                    await StudentEnrollment.updateMany(
                        { student: guardian._id, dependentName: child.name },
                        { $set: { student: created._id } }
                    );
                }
                
                results.created++;
                console.log(`[OK] ${child.name} (hijo de ${guardian.name}) → User created`);
                
            } catch (err) {
                results.errors.push({
                    guardianId: guardian._id,
                    childName: child.name,
                    error: err.message
                });
            }
        }
        
        // Migrar guardian: client → student con isGuardian
        if (!DRY_RUN) {
            await User.updateOne({ _id: guardian._id }, {
                $set: {
                    role: 'student',
                    'studentData.isGuardian': true,
                    'studentData.billingEmail': guardian.clientData?.billingEmail || guardian.email
                }
                // NO $unset clientData todavía — fase de limpieza posterior
            });
        }
    }
    
    // Migrar clients individuales (sin hijos) → student
    if (!DRY_RUN) {
        const individualsResult = await User.updateMany(
            { role: 'client', 'clientData.accountType': { $in: ['individual', null] } },
            {
                $set: {
                    role: 'student',
                    'studentData.isGuardian': false
                }
            }
        );
        results.individualsConverted = individualsResult.modifiedCount;
    }
    
    return results;
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

### 3.3 Caso especial: Guardian con múltiples hijos y 1 suscripción

**Problema:** Si un guardian compró 8 clases y tiene 2 hijos, la `StudentSubscription` está a nombre del guardian. ¿A cuál hijo se asigna?

**Solución:**

```javascript
// Si guardian tiene 1 hijo → reasignar directamente
// Si guardian tiene N hijos → mantener suscripción a nombre del guardian (payerId)
//   y crear referencia: subscription.payerId = guardian._id, 
//   cada class consume de la misma subscription pero el booking indica qué hijo tomó clase

// Esquema:
StudentSubscription {
    studentId: hijo._id,     // A quién beneficia (puede haber 1 sub por hijo)
    payerId: guardian._id,   // Quién paga (NUEVO)
    // ... resto igual
}

// Si no es posible splitear (saldo compartido), usar:
StudentSubscription {
    studentId: guardian._id,  // Se mantiene temporalmente
    payerId: guardian._id,
    beneficiaries: [hijo1._id, hijo2._id]  // NUEVO — campo temporal
}
```

**Recomendación:** Para v6.0, cada hijo tiene su propia suscripción. Durante la migración, si hay saldo y múltiples hijos, dividir el saldo equitativamente y crear N suscripciones.

---

## 4. Migración de Bookings (`clientId` → `payerId`)

```javascript
// scripts/migrate-booking-payer.js

async function migrateBookingPayer() {
    // Paso 1: Todos los bookings con clientId → copiar a payerId
    const result1 = await Booking.updateMany(
        { clientId: { $exists: true, $ne: null } },
        [{ $set: { payerId: '$clientId' } }]
    );
    
    // Paso 2: Bookings sin clientId pero con studentId → payerId = studentId
    const result2 = await Booking.updateMany(
        { clientId: { $in: [null, undefined] }, studentId: { $exists: true } },
        [{ $set: { payerId: '$studentId' } }]
    );
    
    // Paso 3 (posterior): $unset clientId cuando todo el código use payerId
    // await Booking.updateMany({}, { $unset: { clientId: '' } });
    
    return { withClient: result1.modifiedCount, withoutClient: result2.modifiedCount };
}
```

---

## 5. Orden de Ejecución

| Paso | Script | Pre-requisito | Reversible |
|------|--------|---------------|-----------|
| 0 | `audit-managed-students.js` | Ninguno | N/A (solo lectura) |
| 1 | Schema: agregar `studentData.isGuardian`, `parentId`, `billingEmail` | Deploy schema change | Sí |
| 2 | Schema: agregar `Booking.payerId`, `StudentSubscription.payerId` | Deploy schema change | Sí |
| 3 | `migrate-managed-students.js --dry-run` | Pasos 1-2 | N/A |
| 4 | `migrate-managed-students.js` | Verificar dry-run | Parcial (Users creados) |
| 5 | `migrate-booking-payer.js` | Paso 4 | Sí (clientId preservado) |
| 6 | Deploy: código usa `payerId` + `parentId` | Pasos 4-5 | Sí (dual read) |
| 7 | Eliminar `clientData`, `classesRemaining` legacy, rol `client` | Todo el código migrado | No |

### Ventana de mantenimiento requerida

- **Pasos 0-3:** Sin downtime (schema additions, dry-run)
- **Pasos 4-5:** ~5 minutos de mantenimiento (bloquear bookings mientras migra)
- **Pasos 6-7:** Deploy normal

---

## 6. Rollback

Si la migración falla a medio camino:

1. Los Users creados para hijos tienen `studentData.parentId` → se pueden identificar y eliminar
2. Los Bookings tienen `clientId` preservado (no se elimina hasta paso 7)
3. Los guardians mantienen `clientData.managedStudents[]` intacto (no se borra hasta paso 7)
4. El schema soporta ambos formatos en paralelo durante la fase de compatibilidad

---

## 7. Validación Post-Migración

```javascript
// scripts/validate-migration.js

async function validateMigration() {
    const checks = {};
    
    // 1. No deben quedar usuarios con role='client'
    checks.remainingClients = await User.countDocuments({ role: 'client' });
    
    // 2. Cada managedStudent debe tener un User correspondiente
    const guardians = await User.find({ 'studentData.isGuardian': true });
    checks.guardiansWithOrphans = 0;
    for (const g of guardians) {
        const children = await User.find({ 'studentData.parentId': g._id });
        const originalCount = g.clientData?.managedStudents?.length || 0;
        if (children.length < originalCount) {
            checks.guardiansWithOrphans++;
        }
    }
    
    // 3. Todos los Bookings deben tener payerId
    checks.bookingsWithoutPayer = await Booking.countDocuments({
        payerId: { $in: [null, undefined] }
    });
    
    // 4. classesRemaining en User root debe ser 0 para todos
    checks.usersWithLegacyBalance = await User.countDocuments({
        role: 'student',
        classesRemaining: { $gt: 0 }
    });
    
    // 5. No deben existir StudentSubscriptions con studentId apuntando a un client
    const clientIds = await User.find({ role: 'client' }).distinct('_id');
    checks.subsPointingToClients = await StudentSubscription.countDocuments({
        studentId: { $in: clientIds }
    });
    
    return checks;
    // Todos los valores deben ser 0 para considerar migración exitosa
}
```

---

*Fin de RFC-002.*
