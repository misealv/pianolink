# INFORME LEGAL — PIANOLINK
### Documento preparado para: **Franco Orsi, Abogado**
### Fecha: 16 de febrero de 2026
### Preparado por: Equipo PianoLink

---

> **Objetivo de este documento:** Presentar el modelo de negocio completo de PianoLink para que el abogado Franco Orsi pueda redactar los Términos y Condiciones de Uso, Políticas de Privacidad y demás instrumentos legales necesarios para la operación comercial de la plataforma.

---

## ÍNDICE

1. [Descripción General de PianoLink](#1-descripción-general-de-pianolink)
2. [Partes Involucradas y sus Relaciones Jurídicas](#2-partes-involucradas-y-sus-relaciones-jurídicas)
3. [Modelo Económico: Ingresos, Comisiones y Precios](#3-modelo-económico-ingresos-comisiones-y-precios)
4. [Flujo de Pagos y Custodia de Fondos (Escrow)](#4-flujo-de-pagos-y-custodia-de-fondos-escrow)
5. [Formas de Pago y Operación Internacional](#5-formas-de-pago-y-operación-internacional)
6. [Política de No-Show y Cancelaciones](#6-política-de-no-show-y-cancelaciones)
7. [Retiro de un Profesor con Clases Pendientes](#7-retiro-de-un-profesor-con-clases-pendientes)
8. [Disputas y Resolución de Conflictos](#8-disputas-y-resolución-de-conflictos)
9. [Obligaciones Tributarias y Documentación Fiscal](#9-obligaciones-tributarias-y-documentación-fiscal)
10. [Datos Personales Recopilados](#10-datos-personales-recopilados)
11. [Propiedad Intelectual y Licencias](#11-propiedad-intelectual-y-licencias)
12. [Productos Físicos y Dropshipping](#12-productos-físicos-y-dropshipping)
13. [Requerimientos Legales para Términos y Condiciones](#13-requerimientos-legales-para-términos-y-condiciones)
14. [Temas Abiertos que Requieren Decisión Legal](#14-temas-abiertos-que-requieren-decisión-legal)

---

## 1. Descripción General de PianoLink

### ¿Qué es PianoLink?

PianoLink es una **plataforma SaaS (Software as a Service) tipo marketplace** que conecta profesores de piano con estudiantes para clases particulares online en tiempo real. Su diferenciador tecnológico es la integración de **tecnología MIDI (Musical Instrument Digital Interface)** que permite al profesor ver en tiempo real qué teclas presiona el alumno, con latencia inferior a 50ms.

### Datos de la Plataforma

| Concepto | Detalle |
|----------|---------|
| Razón social / titular | Miguel Antonio Sepúlveda Alvarez (persona natural, Chile) |
| Dominios | pianolink.cl, pianolink.net |
| Email comercial | hola@pianolink.net |
| WhatsApp comercial | +56 9 5908 9770 |
| Horario comercial | Lunes a Viernes, 9:00-18:00 (hora Chile) |
| Infraestructura | Fly.io (servidor, São Paulo), MongoDB Atlas (base de datos, cloud) |
| Jurisdicción actual | Chile |

### Naturaleza del servicio

PianoLink **no es una institución educativa**. Es una plataforma tecnológica de intermediación que:
- Provee la infraestructura técnica (salas virtuales, sincronización MIDI, sistema de pagos)
- Gestiona la agenda y reservas de clases
- Recauda pagos de estudiantes y distribuye a profesores
- No establece relación laboral con los profesores

---

## 2. Partes Involucradas y sus Relaciones Jurídicas

### 2.1 Las Tres Partes

```
┌─────────────────────────────────────────────────────────────┐
│                        PIANOLINK                            │
│              (Plataforma / Intermediario)                   │
│                                                             │
│   Provee: tecnología, cobro, distribución, soporte          │
│   Cobra: comisión + membresías + kits                       │
└───────────────┬───────────────────────┬─────────────────────┘
                │                       │
        Contrato de                Contrato de
       Prestación de              Uso / Servicio
        Servicios                  Educativo
                │                       │
    ┌───────────▼──────────┐   ┌────────▼──────────────┐
    │     PROFESOR          │   │     ESTUDIANTE         │
    │  (Prestador           │   │  (Usuario consumidor)  │
    │   independiente)      │   │                        │
    │                       │   │  Paga por clases       │
    │  Imparte clases       │   │  Agenda y asiste       │
    │  Define su tarifa     │   │  Puede ser menor       │
    │  Cobra vía PianoLink  │   │  con apoderado         │
    └───────────────────────┘   └────────────────────────┘
```

### 2.2 Relación PianoLink → Profesor

| Aspecto | Descripción |
|---------|-------------|
| **Naturaleza** | Prestación de servicios independiente. **No existe relación laboral** entre PianoLink y el profesor. |
| **Registro** | El profesor se registra voluntariamente, configura su perfil, tarifa y disponibilidad. |
| **Exclusividad** | **No hay exclusividad.** El profesor puede enseñar en otras plataformas simultáneamente. |
| **Tarifa** | El profesor fija libremente su tarifa por hora (mínimo $15 USD/hora). |
| **Pago** | PianoLink recauda de los estudiantes y transfiere al profesor su porcentaje mensualmente. |
| **Obligaciones del profesor** | Impartir las clases agendadas, respetar horarios, notificar cancelaciones con 24h de antelación. |
| **Obligaciones de PianoLink** | Proveer infraestructura tecnológica, cobrar a estudiantes, pagar al profesor dentro de los plazos establecidos. |
| **Terminación** | Cualquiera de las partes puede dar por terminada la relación. Ver sección 7 para el caso de clases pendientes. |

### 2.3 Relación PianoLink → Estudiante

| Aspecto | Descripción |
|---------|-------------|
| **Naturaleza** | Contrato de prestación de servicios tecnológicos + intermediación educativa. |
| **Registro** | El estudiante (o su apoderado/tutor en caso de menores) se registra y acepta los T&C. |
| **Menores de edad** | Se contempla la figura de **"cliente apoderado" (guardian)** que gestiona la cuenta de uno o más menores. |
| **Pago** | El estudiante paga directamente a PianoLink. PianoLink gestiona la distribución al profesor. |
| **Garantía** | Si el profesor no se presenta (no-show), el estudiante recibe la clase de vuelta + 1 clase de compensación. |
| **Cancelación** | Hasta 24h antes de la clase = sin penalización. Menos de 24h = pierde la clase. |
| **Soporte** | PianoLink media en disputas entre profesor y estudiante. |

### 2.4 Relación Profesor → Estudiante

| Aspecto | Descripción |
|---------|-------------|
| **Naturaleza** | Relación educativa directa facilitada por la plataforma. PianoLink no es parte del servicio educativo en sí. |
| **Comunicación** | Se realiza a través de la plataforma. No se incentiva el contacto fuera de ella (aunque no está prohibido). |
| **Estudiantes privados** | Los profesores Premium/Founder pueden **invitar a sus propios alumnos** a la plataforma con comisión 0% para PianoLink. |

### 2.5 Tipos de Usuarios en el Sistema

| Rol | Descripción | Subtipos |
|-----|-------------|----------|
| **Admin** | Administrador de PianoLink. Gestiona la plataforma, verifica documentos, aprueba pagos. | — |
| **Teacher** | Profesor registrado que imparte clases. | Free, Premium, Founder |
| **Student** | Alumno inscrito que recibe clases. | Origen plataforma, origen invitación privada |
| **Client** | Apoderado/tutor que paga y gestiona cuentas de menores. | Individual, Guardian (tutor), Organization |

---

## 3. Modelo Económico: Ingresos, Comisiones y Precios

### 3.1 Fuentes de Ingreso de PianoLink

PianoLink obtiene ingresos de **cuatro fuentes**:

#### Fuente 1: Comisión por Clase (variable según plan del profesor)

| Plan del profesor | Tipo de alumno | Comisión PianoLink | Recibe el profesor |
|-------------------|----------------|--------------------|--------------------|
| **Free** ($0/mes) | Plataforma | **25%** | **75%** |
| **Premium** ($19/mes) | Plataforma | **15%** | **85%** |
| **Founder** ($10/mes, de por vida) | Plataforma | **15%** | **85%** |
| **Premium** ($19/mes) | Privado (invitado por el profesor) | **0%** | **100%** |
| **Founder** ($10/mes, de por vida) | Privado (invitado por el profesor) | **0%** | **100%** |
| **Free** ($0/mes) | Privado | ❌ No puede invitar alumnos privados | — |

> **Nota clave para T&C:** El profesor Free no puede invitar alumnos propios. Debe upgrade a Premium o Founder para ese beneficio.

#### Fuente 2: Membresía Mensual del Profesor

| Plan | Costo mensual | Condiciones |
|------|---------------|-------------|
| Free | $0 | Comisión del 25%, sin alumnos privados |
| Premium | **$19 USD/mes** | Comisión del 15%, alumnos privados ilimitados, prioridad en asignación |
| Founder | **$10 USD/mes** | Mismos beneficios que Premium. Precio congelado de por vida para early adopters. |

#### Fuente 3: Welcome Kit (Kit de Bienvenida)

| Concepto | Precio |
|----------|--------|
| Kit de bienvenida estándar | **$44 USD** |
| Hijo adicional (apoderado con múltiples menores) | **$15 USD** por cada hijo extra |
| Kit early bird (oferta post-waitlist) | **$29 USD** |

**Incluye:** Cable MIDI (si aplica), sesión de setup técnico guiada, primera clase de prueba con profesor asignado.

#### Fuente 4: Productos Físicos (Accesorios)

PianoLink comercializa accesorios musicales (teclados, pedales, cables, soportes) mediante **dropshipping** con proveedores como CJDropshipping y AliExpress. El margen de ganancia varía por producto.

### 3.2 Precios que Fija el Profesor

| Concepto | Rango | Default |
|----------|-------|---------|
| Tarifa por hora | Mínimo $15 USD/hora | $25 USD/hora |
| Clase de prueba (trial) | Configurable por profesor | $15 USD |
| Paquetes de clases | Libre (mín. $1 USD total) | Según profesor |

### 3.3 Paquetes de Clases

Los profesores pueden crear paquetes personalizados con:
- Número de clases (ej: 4, 8, 12)
- Duración por clase (30, 45, 60 o 90 minutos)
- Categoría (piano, teoría, armonía, solfeo, composición, improvisación)
- Vigencia (7 a 365 días)
- Descuento por volumen opcional
- Renovación automática (configurable)

### 3.4 Grace Period (Período de Gracia) al Expirar Membresía

Cuando un profesor Premium/Founder deja de pagar su membresía:

1. **7 días de gracia:** Mantiene todos los beneficios de su plan.
2. **Día 8:** Downgrade automático a plan Free (comisión pasa a 25%).
3. **Alumnos privados existentes:** Se mantienen con comisión 0% por **30 días adicionales de gracia**. Pasados los 30 días, pasan a comisión 25/75.
4. **Nuevas invitaciones:** Se bloquean inmediatamente al expirar la membresía.
5. **No se expulsa a alumnos existentes** del profesor.

> **Tema legal:** ¿Debe notificarse al profesor con cuántos días de anticipación antes del downgrade? ¿Es necesario darle la opción de renovar antes de aplicar el cambio de comisión a sus alumnos privados?

---

## 4. Flujo de Pagos y Custodia de Fondos (Escrow)

### 4.1 Flujo Completo (de principio a fin)

```
1. ESTUDIANTE compra paquete de clases      →  $120 USD
2. PianoLink RECAUDA el 100% vía MP/PayPal  →  $120 USD en custodia
3. Estudiante agenda clases con su profesor
4. Profesor imparte la clase
5. Profesor marca la clase como "completada"
6. Estudiante tiene 48 horas para confirmar
7. Si no confirma en 48h → se auto-confirma
8. Ventana de disputa: 96 horas desde la marca del profesor
9. Clase validada → se libera el % del profesor del escrow
10. FIN DE MES: PianoLink genera batch de pago
11. Profesor sube documento tributario (boleta/factura)
12. Admin verifica y aprueba el documento
13. Admin ejecuta transferencia al profesor
14. Profesor recibe su pago
```

### 4.2 Modelo de Custodia (Escrow)

PianoLink opera como **custodio de los fondos** del estudiante:

- **El 100% del pago** del estudiante ingresa a PianoLink.
- Los fondos se mantienen en custodia (escrow) hasta que la clase es **validada** (confirmada por el estudiante o auto-confirmada tras 48h).
- Una vez validada, se separa contablemente la comisión de PianoLink y el monto del profesor.
- El pago al profesor se ejecuta **mensualmente** (no por clase individual).
- El profesor ve su saldo disponible en un **Wallet digital** dentro de la plataforma.

> **⚠️ TEMA LEGAL CRÍTICO:** La custodia de fondos de terceros puede estar sujeta a regulaciones financieras en Chile y en los países donde opera. Evaluar si se requiere alguna licencia o registro como entidad de servicios de pago. Revisar normativa de la CMF (Comisión para el Mercado Financiero) en Chile y equivalentes en LATAM.

### 4.3 Sistema Contable Interno

PianoLink mantiene un **libro contable (Ledger) inmutable** tipo blockchain:
- Cada transacción genera un registro que incluye un hash encadenado con la transacción anterior.
- Los registros nunca se editan ni eliminan.
- Tipos de movimiento: crédito (ganancia por clase, bonos, reversiones) y débito (retiros, comisión plataforma, reembolsos, chargebacks).
- Toda entrada incluye: monto bruto, comisión de plataforma, monto neto, porcentajes aplicados, razón de la comisión, origen del alumno, plan del profesor.

### 4.4 Payout Mensual al Profesor

| Paso | Descripción | Plazo |
|------|-------------|-------|
| 1 | Sistema genera automáticamente el batch de pago | Día 1 de cada mes, 00:00 UTC |
| 2 | Profesor recibe notificación y sube documento tributario | 5 días hábiles para subir |
| 3 | Admin verifica documento tributario | 2-3 días hábiles |
| 4 | Admin ejecuta transferencia manualmente | 5 días hábiles |
| **Total estimado** | | **~10-15 días hábiles desde el cierre del mes** |

### 4.5 Métodos de Retiro del Profesor

| Método | Comisión por retiro | Disponibilidad |
|--------|---------------------|----------------|
| Transferencia bancaria | **0%** | Chile y países con MP |
| MercadoPago | **0%** | Países LATAM con MP |
| PayPal | **3%** | Mundial |
| Wise | **1%** | Internacional |
| Criptomonedas | **1.5%** | Internacional |

- **Monto mínimo de retiro:** $10 USD
- **Plazo de procesamiento:** 5 días hábiles

---

## 5. Formas de Pago y Operación Internacional

### 5.1 Proveedores de Pago

| Proveedor | Países | Moneda de cobro |
|-----------|--------|-----------------|
| **MercadoPago** | Chile, México, Argentina, Colombia, Brasil, Perú, Uruguay | Moneda local (CLP, MXN, ARS, COP, BRL, PEN, UYU) |
| **PayPal** | Resto del mundo | USD |

> **Stripe** está preparado en código pero **congelado** porque Chile no está soportado como país de recepción. Se activará cuando PianoLink tenga entidad legal en un país compatible (ej: USA, España).

### 5.2 Regla de Enrutamiento de Pagos

| Tipo de cobro | Se usa el país de... | Razón |
|---------------|----------------------|-------|
| Clase de piano | **El profesor** | Para que el payout coincida con la cuenta MP del profesor |
| Membresía del profesor | **El profesor** | Es él quien paga |
| Welcome Kit | **El estudiante/cliente** | Determina envío y moneda |
| Early Bird | **El lead** | Detectado por IP o selección |

### 5.3 Detección Geográfica

Se detecta automáticamente el país del usuario por su dirección IP usando el servicio ip-api.com. Si no se puede detectar, el default es Chile. El usuario también puede seleccionar manualmente su país.

### 5.4 Operación Multi-País

PianoLink opera con un **conjunto de credenciales de MercadoPago por país.** Actualmente solo Chile está activo; los demás 6 países están preparados para activar cuando se requiera.

> **⚠️ TEMA LEGAL:** ¿Se requiere registro comercial o tributario en cada país donde PianoLink recauda pagos? ¿Qué implicaciones tiene recaudar en moneda local de otro país sin entidad legal allí?

---

## 6. Política de No-Show y Cancelaciones

### 6.1 Tabla de Escenarios con Consecuencias

| Escenario | ¿Qué pasa con la clase? | ¿El profesor cobra? | Compensación |
|-----------|--------------------------|----------------------|--------------|
| **Estudiante no asiste (no-show)** | Se descuenta 1 clase del saldo del estudiante | ✅ **Sí**, el profesor cobra la clase | Ninguna. El estudiante pierde la clase. |
| **Profesor no asiste (no-show)** | Se devuelve 1 clase al saldo del estudiante | ❌ **No**, el profesor no cobra | +1 clase de compensación al estudiante |
| **Estudiante cancela ≥24h antes** | Se devuelve la clase al saldo | N/A | Reagendamiento libre |
| **Estudiante cancela <24h antes** | **Penalización del 50%** — pierde la clase | Depende de configuración | Puede solicitar recuperación al profesor |
| **Profesor cancela ≥24h antes** | Se reagenda sin impacto | N/A | Sin penalización |
| **Profesor reincidente (3 no-shows)** | — | — | **Suspensión del profesor** |

### 6.2 Sistema de Recuperación de Clases

Si un estudiante pierde una clase (por cancelación tardía o no-show), puede **solicitar una clase de recuperación** al profesor. Este sistema funciona así:

1. El estudiante solicita recuperación desde la plataforma.
2. El **profesor decide** si aprueba o deniega la solicitud.
3. Si se aprueba: se devuelve el crédito de clase al saldo del estudiante.
4. Si se deniega: la clase permanece consumida.

> **Tema para T&C:** ¿Debe el profesor justificar la denegación? ¿Hay un plazo máximo para solicitar recuperación? ¿Cuántas recuperaciones se permiten por período?

### 6.3 Strikes del Profesor

- Cada no-show del profesor suma **1 strike**.
- Al acumular **3 strikes**, el sistema aplica **suspensión automática**.
- La suspensión puede ser temporal o permanente según decisión del admin.

> **Tema para T&C:** Definir consecuencias claras de la suspensión: ¿se congelan pagos pendientes? ¿se transfieren alumnos? ¿hay derecho de apelación?

---

## 7. Retiro de un Profesor con Clases Pendientes

### 7.1 Escenario

Un profesor que decide retirarse de PianoLink pero tiene estudiantes con clases prepagadas pendientes.

### 7.2 Mecanismo Actual en el Sistema

El sistema contempla la **transferencia de suscripción** a otro profesor:

1. Los fondos en escrow (clases no consumidas) NO se liberan al profesor que se retira.
2. El administrador asigna otro profesor disponible al estudiante.
3. El escrow se transfiere al nuevo profesor (el nuevo profesor cobrará cada clase que dé).
4. El estudiante es notificado del cambio.

### 7.3 Escenarios que Requieren Definición Legal

| Situación | Pregunta abierta |
|-----------|------------------|
| Profesor se retira voluntariamente | ¿Con cuánta anticipación debe avisar? ¿30 días? |
| Profesor es suspendido/expulsado | ¿Pierde los fondos pendientes de cobro? ¿O se le pagan las clases ya dadas? |
| No hay otro profesor disponible | ¿Se reembolsa al estudiante? ¿Parcial o total? |
| Profesor quiere llevarse a sus alumnos fuera de la plataforma | ¿Hay cláusula de no competencia? ¿Restricción temporal? |
| Profesor tiene deuda con PianoLink (membresía impaga) | ¿Se puede descontar del saldo pendiente? |

> **⚠️ TEMA LEGAL CRÍTICO:** Definir claramente en los T&C:
> - Plazo de preaviso de retiro
> - Destino de los fondos en custodia
> - Proceso de transferencia de alumnos
> - Protección del estudiante ante abandono del profesor

---

## 8. Disputas y Resolución de Conflictos

### 8.1 Sistema de Validación de Clases

```
Profesor marca clase como completada
         │
         ▼
    48 horas para que el estudiante confirme
         │
    ┌────┴────────┐
    │             │
Confirma     No responde
    │             │
    ▼             ▼
 Validada   Auto-confirmada
                  │
            96h ventana de disputa
                  │
         ┌────────┴────────┐
         │                 │
    No disputa         Disputa abierta
         │                 │
         ▼                 ▼
      Pago          Admin resuelve
    liberado
```

### 8.2 Resoluciones Posibles de una Disputa

| Resolución | Efecto |
|------------|--------|
| **A favor del estudiante** | Se devuelve la clase al saldo del estudiante. Profesor no cobra. |
| **A favor del profesor** | La clase se mantiene validada. Profesor cobra normalmente. |
| **Dividida (split)** | Se reparte el costo según criterio del admin. |
| **Anulada (void)** | Se elimina la clase como si no hubiera existido. |

### 8.3 Escalamiento

- Si una disputa no se resuelve en **7 días**, el sistema alerta automáticamente al administrador.
- El administrador actúa como **árbitro** de primera instancia.

> **Tema para T&C:** ¿Es vinculante la decisión del admin? ¿Existe una segunda instancia? ¿Se puede recurrir a arbitraje externo? ¿Jurisdicción aplicable?

---

## 9. Obligaciones Tributarias y Documentación Fiscal

### 9.1 Documentos que Debe Presentar el Profesor

Antes de recibir su primer pago, el profesor debe:

1. **Registrar su información fiscal:** Número de identificación tributaria (RUT en Chile, RFC en México, CUIT en Argentina, NIF en España, etc.)
2. **Subir documento tributario** por cada batch de pago:

| País | Documento requerido |
|------|---------------------|
| Chile | Boleta de honorarios |
| Argentina | Factura |
| México | Factura (CFDI) |
| España | Factura / Invoice |
| USA | Invoice |
| Otros | Recibo / Invoice equivalente |

### 9.2 Responsabilidad Tributaria

> **⚠️ DEFINIR LEGALMENTE:**
> - ¿PianoLink actúa como agente retenedor de impuestos?
> - En Chile, las boletas de honorarios tienen retención del 13,75% (2026). ¿PianoLink emite o el profesor emite?
> - ¿Qué responsabilidad tiene PianoLink si un profesor no declara sus ingresos?
> - ¿Se debe informar al SII (Chile) sobre los pagos realizados a profesores?

---

## 10. Datos Personales Recopilados

### 10.1 Datos por Tipo de Usuario

| Dato | Profesor | Estudiante | Apoderado | Lead (prospecto) |
|------|----------|------------|-----------|-------------------|
| Nombre completo | ✅ | ✅ | ✅ | ✅ |
| Email | ✅ | ✅ | ✅ | ✅ |
| Contraseña (hasheada) | ✅ | ✅ | ✅ | ❌ |
| WhatsApp | ✅ | Opcional | Opcional | ✅ |
| País | ✅ | ✅ | ✅ | ✅ |
| Zona horaria | ✅ | ✅ | ✅ | ✅ |
| Dirección IP | ✅ (detección) | ✅ (detección) | ✅ (detección) | ✅ (detección) |
| Identificación tributaria | ✅ (RUT, RFC, etc.) | ❌ | ❌ | ❌ |
| Datos bancarios/pago | ✅ (para recibir pagos) | ❌ (paga vía MP/PayPal) | ❌ | ❌ |
| Foto de perfil | ✅ | ❌ | ❌ | ❌ |
| Video presentación | ✅ (opcional) | ❌ | ❌ | ❌ |
| Edad del estudiante | ❌ | ✅ | ❌ | ✅ (beneficiarios) |
| Nivel musical | ❌ | ✅ | ❌ | ✅ |

### 10.2 Datos de Tracking y Marketing

| Dato | Propósito |
|------|-----------|
| Facebook Click ID (fbclid) | Atribuir conversiones de anuncios |
| Google Client ID (gClientId) | Analytics |
| UTM (source, medium, campaign) | Atribuir origen de registro |
| Landing pages visitadas | Métricas de conversión |
| Referrer URL | Origen del tráfico |
| Meta Pixel | Tracking de eventos (PageView, Lead, ViewContent) |

### 10.3 Cookies

- Cookie de sesión (autenticación JWT)
- Cookie de countdown para oferta early bird (30 minutos, persistente)

> **⚠️ REQUERIMIENTO LEGAL:**
> - **Política de Privacidad** obligatoria (Ley 19.628 Chile + GDPR si hay usuarios europeos)
> - **Política de Cookies** obligatoria para usuarios de la UE
> - **Consentimiento informado** para tracking de Facebook/Google
> - **Derecho de supresión** de datos personales bajo solicitud
> - Si se registran menores: cumplir con protecciones especiales (COPPA en USA, normativa local)

---

## 11. Propiedad Intelectual y Licencias

### 11.1 Software

- El código fuente de PianoLink se encuentra actualmente bajo **licencia MIT** (open source).
- **Decisión pendiente:** ¿Conviene cambiar a una licencia propietaria antes del lanzamiento comercial?

### 11.2 Contenido de las Clases

- Las clases en vivo **no se graban** por defecto.
- Si se implementara grabación en el futuro: ¿de quién es la propiedad intelectual? ¿Del profesor, del estudiante, de PianoLink?

### 11.3 Marca

- "PianoLink" como marca comercial — ¿está registrada en INAPI (Chile)?
- Logotipo y elementos gráficos de la plataforma.

> **Acción recomendada:** Registrar la marca "PianoLink" y revisar si existe registro previo.

---

## 12. Productos Físicos y Dropshipping

### 12.1 Modelo de Venta

PianoLink comercializa accesorios musicales mediante **dropshipping**:
- PianoLink **no tiene stock propio**.
- Los productos se envían directamente desde proveedores (CJDropshipping, AliExpress) al cliente.
- PianoLink actúa como **intermediario comercial**.

### 12.2 Categorías de Productos

Teclados, soportes, pedales, cables MIDI, accesorios, bundles.

### 12.3 Implicaciones Legales

| Tema | Pregunta |
|------|----------|
| Garantía | ¿Quién responde por defectos? ¿PianoLink o el proveedor original? |
| Devoluciones | ¿Cuál es la política de devolución? (SERNAC en Chile exige mínimo 10 días) |
| Impuestos aduaneros | ¿Quién asume los impuestos de importación si el envío es internacional? |
| Responsabilidad del producto | Si un cable defectuoso daña un teclado del cliente, ¿quién responde? |

---

## 13. Requerimientos Legales para Términos y Condiciones

### 13.1 Documentos que Necesitamos Redactar

| Documento | Alcance | Prioridad |
|-----------|---------|-----------|
| **Términos y Condiciones para Profesores** | Relación contractual, comisiones, obligaciones, pagos, retiro, propiedad intelectual | 🔴 Alta |
| **Términos y Condiciones para Estudiantes** | Uso de la plataforma, pagos, cancelaciones, no-show, disputas, menores de edad | 🔴 Alta |
| **Política de Privacidad** | Datos recopilados, uso, almacenamiento, derechos del titular, transfers internacionales | 🔴 Alta |
| **Política de Cookies** | Tipos de cookies, propósitos, consentimiento | 🟡 Media |
| **Política de Reembolsos** | Condiciones, plazos, proceso | 🔴 Alta |
| **Contrato de Adhesión para Profesores** | Formalizar la relación de prestación de servicios | 🟡 Media |
| **Política de Protección de Menores** | Lineamientos para clases con menores, verificación de identidad del profesor | 🔴 Alta |
| **Acuerdo de Nivel de Servicio (SLA)** | Disponibilidad de la plataforma, soporte técnico | 🟢 Baja |

### 13.2 Cláusulas Esenciales para T&C de Profesores

1. ✅ Naturaleza no laboral de la relación
2. ✅ Tabla de comisiones por plan (Free/Premium/Founder)
3. ✅ Proceso y plazos de pago (mensual, con documentación tributaria)
4. ✅ Grace period de 7 días en membresía + 30 días de comisión para alumnos privados
5. ✅ Obligación de asistir a clases agendadas
6. ✅ Política de no-show y strikes (3 strikes = suspensión)
7. ✅ Proceso de retiro voluntario y destino de clases pendientes
8. ✅ Cláusula de no solicitud directa de alumnos de plataforma (si aplica)
9. ✅ Uso de marca PianoLink en perfiles públicos
10. ✅ Verificación de identidad y antecedentes (especialmente para clases con menores)
11. ✅ Propiedad del contenido generado
12. ✅ Causales de expulsión

### 13.3 Cláusulas Esenciales para T&C de Estudiantes

1. ✅ Aceptación de que PianoLink es intermediario, no una institución educativa
2. ✅ Proceso de pago y custodia de fondos
3. ✅ Política de cancelación (24h de anticipación)
4. ✅ Política de no-show (pierde la clase)
5. ✅ Ventana de disputa (48h confirmación + 96h disputa)
6. ✅ Política de reembolso
7. ✅ Protección en caso de retiro del profesor
8. ✅ Para menores: consentimiento del apoderado obligatorio
9. ✅ Uso aceptable de la plataforma
10. ✅ Limitación de responsabilidad (PianoLink no garantiza resultados educativos)

---

## 14. Temas Abiertos que Requieren Decisión Legal

### 14.1 Urgentes (Antes del Lanzamiento)

| # | Tema | Impacto | Pregunta |
|---|------|---------|----------|
| 1 | **Custodia de fondos (escrow)** | Regulatorio | ¿Se requiere licencia de la CMF u otra autoridad para mantener fondos de terceros? |
| 2 | **Operación multi-país sin entidad local** | Tributario | ¿Puede PianoLink recaudar vía MercadoPago en México, Argentina, etc. siendo persona natural chilena? |
| 3 | **Menores de edad** | Protección al consumidor | ¿Qué verificaciones se requieren? ¿Background check a los profesores? |
| 4 | **Tipo societario** | Societario | ¿Conviene constituir una SpA (Chile), LLC (USA) u otra? |
| 5 | **Retención de impuestos** | Tributario | ¿PianoLink debe retener impuestos a profesores extranjeros? |
| 6 | **Licencia del software** | PI | ¿Cambiar de MIT (open source) a propietaria? |

### 14.2 Importantes (Corto Plazo)

| # | Tema | Impacto | Pregunta |
|---|------|---------|----------|
| 7 | **Registro de marca** | PI | ¿Está "PianoLink" registrada en INAPI? |
| 8 | **Cláusula de no competencia** | Contractual | ¿Prohibir al profesor captar alumnos de plataforma fuera de PianoLink? |
| 9 | **Jurisdicción y ley aplicable** | Procesal | ¿Tribunales de Chile? ¿Arbitraje? ¿Qué pasa con usuarios de otros países? |
| 10 | **GDPR / CCPA** | Datos personales | ¿Se necesita cumplimiento si hay usuarios europeos o de California? |
| 11 | **Facturación electrónica** | Tributario | ¿PianoLink debe emitir boletas/facturas electrónicas por los cobros? |
| 12 | **Garantía en dropshipping** | Consumidor | ¿PianoLink responde legalmente por productos de terceros? |
| 13 | **Chargebacks** | Financiero | ¿Qué pasa si un estudiante disputa el cargo en su banco? ¿Cómo se protege PianoLink? |

### 14.3 Deseables (Mediano Plazo)

| # | Tema | Impacto | Pregunta |
|---|------|---------|----------|
| 14 | **Seguro de responsabilidad civil** | Riesgo | ¿Se necesita un seguro para la operación? |
| 15 | **Grabación de clases** | PI / Privacidad | Si se implementa, ¿consentimiento de ambas partes? |
| 16 | **Programa de referidos** | Marketing | Implicaciones legales de pagar comisiones por referidos |
| 17 | **Cumplimiento PCI-DSS** | Pagos | MercadoPago y PayPal cubren el cumplimiento, ¿pero PianoLink debe certificar algo? |

---

## ANEXO A: Diagrama de Flujo Financiero

```
ESTUDIANTE                    PIANOLINK                        PROFESOR
    │                             │                                │
    │─── Paga paquete $120 ──────▶│                                │
    │    (MercadoPago/PayPal)     │                                │
    │                             │── $120 en escrow               │
    │                             │                                │
    │─── Toma clase 1 ──────────▶│                                │
    │                             │── Clase validada               │
    │                             │── Libera $8.50 (prof 85%)      │
    │                             │── Retiene $1.50 (PL 15%)       │
    │                             │                                │
    │─── Toma clase 2-12 ───────▶│── Mismo proceso ──────────────▶│
    │                             │                                │
    │                             │── Fin de mes                   │
    │                             │── Genera batch: ~$102 prof     │
    │                             │                                │
    │                             │── Prof sube boleta ◀───────────│
    │                             │── Admin verifica               │
    │                             │── Admin transfiere ───────────▶│
    │                             │                                │
    │                             │── PianoLink retiene ~$18       │
    │                             │   (comisión del mes)           │
```

> **Nota:** El ejemplo asume plan Premium (85/15). Para plan Free sería 75/25.

---

## ANEXO B: Cronología de Validación de una Clase

```
Hora 0    ── Profesor marca clase como "completada"
Hora 0-48 ── Estudiante puede confirmar o rechazar
Hora 48   ── Si no hay respuesta → AUTO-CONFIRMACIÓN
Hora 0-96 ── Ventana total de disputa abierta
Hora 96   ── Clase queda firme, fondos listos para payout
Día 7+    ── Si disputa abierta sin resolver → escalamiento a admin
```

---

## ANEXO C: Tabla Resumen de Precios (en USD)

| Concepto | Precio | Notas |
|----------|--------|-------|
| Membresía Free (profesor) | $0/mes | Comisión 25% |
| Membresía Premium (profesor) | $19/mes | Comisión 15%, alumnos privados |
| Membresía Founder (profesor) | $10/mes | Precio congelado de por vida |
| Welcome Kit | $44 | Cable MIDI + setup + trial |
| Welcome Kit Early Bird | $29 | Oferta limitada post-waitlist |
| Hijo adicional (apoderado) | $15 | Por cada menor extra |
| Tarifa mínima profesor | $15/hora | Configurable por el profesor |
| Clase de prueba (trial) | ~$15 | Default, configurable |
| Pago profesor por trial | $10 | Fijo |
| Monto mínimo de retiro | $10 | Del wallet del profesor |

---

*Documento generado el 16 de febrero de 2026 para uso interno del equipo legal de PianoLink.*
*Toda la información proviene del código fuente y documentación técnica vigente.*
*Este documento no constituye asesoría legal.*
