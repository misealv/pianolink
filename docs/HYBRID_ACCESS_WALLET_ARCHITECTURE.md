# 🎹 ARQUITECTURA: Sistema Híbrido de Acceso y Billetera
## PianoLink v3.0

---

## 1. DISEÑO DE IDENTIDAD: Cliente vs Invitado

### 1.1 Matriz de Identificación

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        FLUJO DE IDENTIFICACIÓN EN SALA                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐  │
│  │  ENTRADA VÍA    │     │  VERIFICAR JWT/      │     │  IDENTIFICAR COMO   │  │
│  │  LINK + NOMBRE  │────>│  SESIÓN EN HEADER    │────>│  "GUEST" (temporal) │  │
│  │  (Flujo actual) │     │  ¿Tiene token?       │     │  Sin registro $$$   │  │
│  └─────────────────┘     │         │             │     └─────────────────────┘  │
│                          │         │ NO          │                              │
│                          │         ▼             │                              │
│  ┌─────────────────┐     │    ┌────────────┐    │     ┌─────────────────────┐  │
│  │  ENTRADA DESDE  │     │    │ SÍ (TOKEN) │    │     │  IDENTIFICAR COMO   │  │
│  │  DASHBOARD      │────>│    └────────────┘    │────>│  "CLIENT" (userId)  │  │
│  │  (Autenticado)  │     │         │            │     │  Registrar en $$$   │  │
│  └─────────────────┘     │         ▼            │     └─────────────────────┘  │
│                          │  ┌──────────────────┐│                              │
│                          │  │ Validar:         ││                              │
│                          │  │ - user.role      ││                              │
│                          │  │ - enrollment     ││                              │
│                          │  │ - classesRemaining│                              │
│                          │  └──────────────────┘│                              │
│                          └──────────────────────┘                              │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Propuesta de Identificación en Socket

**Modificación del payload de `join-room`:**

```javascript
// FLUJO ACTUAL (INVITADO)
socket.emit("join-room", {
    roomCode: "ABCD",
    username: "NombreManual",
    userRole: "student"  // ← Genérico
});

// FLUJO NUEVO (HÍBRIDO)
socket.emit("join-room", {
    roomCode: "ABCD",
    username: "NombreManual",
    userRole: "student",
    // ↓ NUEVOS CAMPOS OPCIONALES ↓
    authToken: "JWT_TOKEN_O_NULL",   // Si viene del dashboard
    identityType: "guest" | "client", // Explícito
    studentId: "ObjectId_o_null"      // Si es cliente registrado
});
```

### 1.3 Flujo de Reconocimiento en Backend

```
                    join-room payload
                          │
                          ▼
           ┌──────────────────────────────┐
           │  ¿authToken presente y       │
           │  válido (verificar JWT)?     │
           └──────────────────────────────┘
                    │           │
                   SÍ          NO
                    │           │
                    ▼           ▼
         ┌───────────────┐  ┌───────────────┐
         │ CLIENTE       │  │ INVITADO      │
         │ (Registrado)  │  │ (Temporal)    │
         └───────────────┘  └───────────────┘
                │                   │
                ▼                   ▼
    ┌─────────────────────┐  ┌──────────────────────┐
    │ • Guardar userId    │  │ • Guardar solo       │
    │ • Validar enrollment│  │   socketId + nombre  │
    │ • Verificar clases  │  │ • Marcar como        │
    │   disponibles       │  │   "guest" en room    │
    │ • Habilitar billing │  │ • NO billing         │
    └─────────────────────┘  └──────────────────────┘
```

---

## 2. MODO PRÁCTICA (Practice Mode)

### 2.1 Concepto

El **Modo Práctica** permite que un Alumno Cliente entre a la sala de su profesor aunque este no esté conectado. El sistema:

- ✅ Activa WebMIDI localmente (el alumno puede tocar)
- ✅ NO inicia streaming (no hay profesor)
- ✅ Registra acceso (auditoría)
- ❌ NO descuenta clases
- ❌ NO genera transacciones

### 2.2 Estados de Sala

```javascript
// room.state puede ser:
const ROOM_STATES = {
    OFFLINE: 'offline',       // Nadie conectado
    PRACTICE: 'practice',     // Solo alumnos (sin profesor)
    LIVE: 'live',             // Profesor presente
    STREAMING: 'streaming'    // Clase activa con alumnos
};
```

### 2.3 Flujo de Estados

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  [OFFLINE] ──────────────────────────────────────────────────────────────┐   │
│      │                                                                   │   │
│      │  Cliente entra (sin profesor)                                    │   │
│      ▼                                                                   │   │
│  [PRACTICE] ←───────────────────────────────────────────────────────────┤   │
│      │                        │                                          │   │
│      │ Profesor conecta      │ Último alumno sale                       │   │
│      ▼                        ▼                                          │   │
│  [LIVE] ───────────────────────────────────────────────────────────────┘    │
│      │                                                                       │
│      │ Profesor activa clase                                                │
│      ▼                                                                       │
│  [STREAMING] (classeInProgress = true)                                      │
│      │                                                                       │
│      │ Profesor finaliza clase                                              │
│      ▼                                                                       │
│  [LIVE] → ClassRecord generado                                              │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. ARQUITECTURA DE BILLETERA (Wallet/Ledger)

### 3.1 Modelo de Datos Completo

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              MODELO FINANCIERO                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────────┐                                                          │
│  │     WALLET       │  (1 por profesor + 1 de plataforma)                      │
│  │                  │                                                          │
│  │  ownerId: User   │◄──────────────────────────────────┐                      │
│  │  balance: {      │                                   │                      │
│  │    available,    │                                   │                      │
│  │    pending,      │                                   │ wallet.addCredit()   │
│  │    totalEarned   │                                   │ wallet.addDebit()    │
│  │  }               │                                   │                      │
│  └────────┬─────────┘                                   │                      │
│           │                                             │                      │
│           │ 1:N                                         │                      │
│           ▼                                             │                      │
│  ┌──────────────────┐                                   │                      │
│  │  LEDGER_ENTRY    │  (Inmutable, append-only)         │                      │
│  │                  │                                   │                      │
│  │  sequenceNumber  │  ← Número único secuencial        │                      │
│  │  walletId        │  ← FK a Wallet                    │                      │
│  │  type: credit/   │                                   │                      │
│  │        debit     │                                   │                      │
│  │  category:       │                                   │                      │
│  │    class_earning │ ← Clase con cliente               │                      │
│  │    membership_   │ ← Clase con invitado (sin $$$)    │                      │
│  │      activity    │                                   │                      │
│  │    withdrawal    │ ← Retiro                          │                      │
│  │  amount          │                                   │                      │
│  │  previousHash    │  ← Blockchain-like                │                      │
│  │  entryHash       │  ← Integridad                     │                      │
│  └────────┬─────────┘                                   │                      │
│           │                                             │                      │
│           │ referencia                                  │                      │
│           ▼                                             │                      │
│  ┌──────────────────┐                          ┌────────┴─────────┐           │
│  │  CLASS_RECORD    │  (Nuevo modelo)          │   WITHDRAWAL     │           │
│  │                  │                          │                  │           │
│  │  sessionId       │  ← FK a Session          │  walletId        │           │
│  │  teacherId       │                          │  amount          │           │
│  │  studentId?      │  ← null si invitado      │  status          │           │
│  │  studentName     │                          │  method          │           │
│  │  studentType:    │                          └──────────────────┘           │
│  │    'client' |    │                                                         │
│  │    'guest'       │                                                         │
│  │  duration        │                                                         │
│  │  price: {        │                                                         │
│  │    grossAmount,  │  ← Solo si studentType='client'                        │
│  │    platformFee,  │                                                         │
│  │    netAmount,    │                                                         │
│  │    currency      │                                                         │
│  │  }               │                                                         │
│  │  billingType:    │                                                         │
│  │    'platform' |  │  ← Cliente paga a través de nosotros                   │
│  │    'external' |  │  ← Profesor cobra directo (membresía)                  │
│  │    'none'        │  ← Clase de práctica/demo                              │
│  └──────────────────┘                                                         │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Categorías de LedgerEntry

| Categoría | Tipo | Descripción |
|-----------|------|-------------|
| `class_earning` | credit | Ganancia por clase con **cliente de plataforma** (80%) |
| `membership_activity` | - | Registro de clase con **invitado** (sin transacción $$$) |
| `platform_fee` | credit | Comisión que recibe PianoLink (20%) |
| `withdrawal` | debit | Retiro a PayPal/Bank |
| `refund` | debit | Reembolso a cliente |
| `bonus` | credit | Bonos promocionales |
| `adjustment_credit` | credit | Ajuste manual a favor |
| `adjustment_debit` | debit | Ajuste manual en contra |

### 3.3 Flujo de Registro por Tipo de Clase

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  CLASE CON CLIENTE (studentType: 'client')                                      │
│  ─────────────────────────────────────────                                      │
│                                                                                 │
│  1. ClassRecord creado con price.grossAmount                                    │
│  2. LedgerEntry: credit → Wallet del Profesor (netAmount = 80%)                │
│  3. LedgerEntry: credit → Wallet de Plataforma (platformFee = 20%)             │
│  4. User.classesRemaining-- (cliente)                                           │
│  5. User.teacherData.earnings.pending++ (profesor)                              │
│                                                                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  CLASE CON INVITADO (studentType: 'guest')                                      │
│  ─────────────────────────────────────────                                      │
│                                                                                 │
│  1. ClassRecord creado con billingType: 'external'                              │
│  2. LedgerEntry: membership_activity (sin amount, solo auditoría)               │
│  3. NO hay transacción financiera                                               │
│  4. Session stats actualizadas                                                  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. SALAS: ¿Persistentes o Dinámicas?

### 4.1 Comparativa

| Aspecto | Sala Persistente | Sala Dinámica |
|---------|------------------|---------------|
| **Concepto** | "Estudio físico" del profesor | Una sala por cada sesión agendada |
| **Código** | Fijo (ej: profesor.roomCode = "ABCD") | Generado por booking (ej: "SES-abc123") |
| **Ventajas** | - Link permanente<br>- Fácil de recordar<br>- Menos sobrecarga de DB<br>- Estado persistente (biblioteca) | - Aislamiento por sesión<br>- Mejor tracking por clase<br>- Más fácil billing 1:1 |
| **Desventajas** | - Requiere validación de quién entra<br>- Difícil separar clases distintas | - Más complejidad<br>- Más recursos (crear/destruir)<br>- Cliente necesita link nuevo cada vez |
| **WebRTC** | Misma peer connection puede reutilizarse | Nueva conexión por sesión |
| **Seguridad** | Requiere validación de enrollment | Token único por sesión |

### 4.2 Recomendación: **Modelo Híbrido**

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│                          MODELO HÍBRIDO RECOMENDADO                             │
│                                                                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         ROOM (Persistente)                              │   │
│  │                                                                         │   │
│  │  code: "ABCD"  ← Link permanente del profesor                          │   │
│  │  teacherId     ← Dueño                                                 │   │
│  │  library[]     ← PDFs persistentes                                     │   │
│  │  settings      ← Configuración                                         │   │
│  │                                                                         │   │
│  │    ┌─────────────────────────────────────────────────────────────┐     │   │
│  │    │                CLASS_SESSION (Efímera)                      │     │   │
│  │    │                                                             │     │   │
│  │    │  roomId: "ABCD"                                             │     │   │
│  │    │  bookingId?: ObjectId  ← Si viene de booking (cliente)      │     │   │
│  │    │  startTime, endTime                                         │     │   │
│  │    │  participants[]        ← Quién participó                    │     │   │
│  │    │  type: 'scheduled' | 'ad-hoc'                               │     │   │
│  │    │                                                             │     │   │
│  │    │  → Al cerrar, genera ClassRecord                           │     │   │
│  │    └─────────────────────────────────────────────────────────────┘     │   │
│  │                                                                         │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  RESULTADO:                                                                     │
│  • Profesor tiene UN link fijo (Room.code)                                     │
│  • Cada vez que "activa" la clase, se crea una ClassSession                    │
│  • ClassSession puede estar vinculada a un Booking (cliente agendado)          │
│  • O ser ad-hoc (profesor inicia clase con invitados)                          │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Beneficios del Modelo Híbrido

1. **Para Invitados**: Link permanente, flujo actual intacto
2. **Para Clientes**: Pueden entrar al mismo link, pero el sistema los detecta
3. **Para Billing**: ClassSession vincula con Booking y permite calcular pagos
4. **Para WebRTC**: Sala persistente reduce reconnections innecesarias

---

## 5. IMPLEMENTACIÓN: Servicio de Cierre de Clase

### 5.1 Diagrama de Secuencia

```
┌─────────┐     ┌──────────────┐     ┌──────────────────┐     ┌────────┐     ┌─────────────┐
│ Profesor│     │   Socket.io  │     │ClassClosureService│     │   DB   │     │  Wallet     │
└────┬────┘     └──────┬───────┘     └────────┬─────────┘     └───┬────┘     └──────┬──────┘
     │                 │                      │                   │                 │
     │  end-class      │                      │                   │                 │
     │────────────────>│                      │                   │                 │
     │                 │                      │                   │                 │
     │                 │  closeClass(roomCode,│                   │                 │
     │                 │  participants)       │                   │                 │
     │                 │─────────────────────>│                   │                 │
     │                 │                      │                   │                 │
     │                 │                      │ ──┐ START TRANSACTION               │
     │                 │                      │   │ (session.startTransaction)      │
     │                 │                      │ <─┘                                 │
     │                 │                      │                   │                 │
     │                 │                      │  1. getSession()  │                 │
     │                 │                      │──────────────────>│                 │
     │                 │                      │<──────────────────│                 │
     │                 │                      │                   │                 │
     │                 │                      │  2. Para cada participante:        │
     │                 │                      │     isClient = checkIdentity()     │
     │                 │                      │                   │                 │
     │                 │                      │  3. createClassRecord()            │
     │                 │                      │──────────────────>│                 │
     │                 │                      │                   │                 │
     │                 │                      │  4. IF CLIENT:    │                 │
     │                 │                      │     createLedgerEntry()            │
     │                 │                      │─────────────────────────────────>  │
     │                 │                      │     updateWalletBalance()          │
     │                 │                      │─────────────────────────────────>  │
     │                 │                      │     decrementClasses()             │
     │                 │                      │──────────────────>│                 │
     │                 │                      │                   │                 │
     │                 │                      │  5. IF GUEST:     │                 │
     │                 │                      │     createActivityLog()            │
     │                 │                      │──────────────────>│                 │
     │                 │                      │                   │                 │
     │                 │                      │ ──┐ COMMIT TRANSACTION             │
     │                 │                      │   │ (session.commitTransaction)    │
     │                 │                      │ <─┘                                 │
     │                 │                      │                   │                 │
     │                 │  {success, records}  │                   │                 │
     │                 │<─────────────────────│                   │                 │
     │                 │                      │                   │                 │
     │ class-ended     │                      │                   │                 │
     │<────────────────│                      │                   │                 │
     │                 │                      │                   │                 │
```

### 5.2 Atomicidad con MongoDB Transactions

```javascript
// Pseudo-código del servicio
async closeClass(roomCode, sessionData, participants) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        // 1. Crear ClassRecord para cada participante
        for (const participant of participants) {
            const record = await this.createClassRecord(sessionData, participant, { session });
            
            if (participant.identityType === 'client') {
                // 2. Crear entrada en Ledger (profesor gana 80%)
                await this.createLedgerEntry(record, { session });
                
                // 3. Actualizar Wallet del profesor
                await this.updateWallet(record.teacherId, record.price.netAmount, { session });
                
                // 4. Descontar clase al cliente
                await this.decrementClientClasses(participant.userId, { session });
            }
        }
        
        // 5. Finalizar sesión
        await this.finalizeSession(roomCode, { session });
        
        await session.commitTransaction();
        return { success: true };
        
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
}
```

---

## 6. CONSIDERACIONES DE SEGURIDAD

### 6.1 Validación de Identidad

```javascript
// Middleware de validación en socket
function validateParticipantIdentity(socket, payload) {
    if (payload.authToken) {
        // Verificar JWT
        const decoded = jwt.verify(payload.authToken, process.env.JWT_SECRET);
        
        // Verificar enrollment
        const enrollment = await Enrollment.findOne({
            studentId: decoded.userId,
            roomId: payload.roomId,
            status: 'active'
        });
        
        if (!enrollment) {
            return { type: 'guest', reason: 'NO_ENROLLMENT' };
        }
        
        // Verificar clases disponibles
        const user = await User.findById(decoded.userId);
        if (user.classesRemaining <= 0) {
            socket.emit('error', { code: 'NO_CLASSES', message: 'Sin clases disponibles' });
            return { type: 'guest', reason: 'NO_CLASSES' };
        }
        
        return { type: 'client', userId: decoded.userId, user };
    }
    
    return { type: 'guest' };
}
```

### 6.2 Prevención de Fraude

- **Rate limiting**: Máximo N clases por día por profesor
- **Duración mínima**: Clase debe durar al menos X minutos para contar
- **Validación cruzada**: Session.duration debe coincidir con ClassRecord
- **Auditoría**: Todos los cambios en Wallet tienen trail inmutable

---

## 7. PRÓXIMOS PASOS

1. ✅ Crear modelo `ClassRecord`
2. ✅ Crear servicio `ClassClosureService`
3. ✅ Modificar socket handler para identidad híbrida
4. ⬜ Agregar endpoints para dashboard de Wallet
5. ⬜ Implementar Modo Práctica en frontend
6. ⬜ Tests de integración para flujo completo
