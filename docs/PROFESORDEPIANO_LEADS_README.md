# Leads PianoLink — ProfesorDePiano.cl 2015-2016
<!-- Fuente: profesordepiano.cl -->
<!-- Campaña GetResponse: profesordepiano -->
<!-- Este archivo es generado automáticamente por: -->
<!-- node scripts/extract-profesordepiano-leads.js -->

> ⚠️ Este archivo aún no ha sido generado.
> Sigue los pasos en la sección de uso más abajo.

---

## Cómo usar

### Paso 1 — Cambiar de cuenta Gmail

Este extractor usa la **segunda cuenta de Gmail** (la de ProfesorDePiano),
diferente a la usada para `leads_getresponse.md`.

**Si ambas cuentas están en el mismo proyecto de Google Cloud:**

```bash
# Solo necesitas generar un nuevo token para la cuenta correcta:
node scripts/gmail-oauth-setup-piano.js
```
Cuando se abra la URL en el navegador, asegúrate de estar logueado con
la cuenta Gmail de ProfesorDePiano. Si el navegador abre la cuenta
equivocada, usa una de estas opciones:

- **Opción A:** Abre la URL en una **ventana incógnito** y logéate con la cuenta ProfesorDePiano
- **Opción B:** Añade `&login_hint=TU_EMAIL@gmail.com` al final de la URL

**Si necesitas credenciales OAuth propias para esta cuenta:**

```
1. Ve a https://console.cloud.google.com  (logueado con la cuenta ProfesorDePiano)
2. APIs & Services → Credentials → + Create Credentials → OAuth 2.0 Client IDs
3. Tipo: "Desktop App"  |  Nombre: "PianoLink Gmail Piano"
4. Asegúrate de habilitar la Gmail API en ese proyecto
5. Descargar JSON → guardar como: secrets/gmail_credentials_piano.json
6. Ejecutar: node scripts/gmail-oauth-setup-piano.js
```

### Paso 2 — Ejecutar extracción

```bash
# Extrae todos los emails (máximo 1000 por defecto):
node scripts/extract-profesordepiano-leads.js

# Para un límite personalizado:
node scripts/extract-profesordepiano-leads.js --max=2000
```

### Paso 3 — Revisar salida

El resultado se guarda en: `data/leads_profesordepiano.md`

> **Nota:** `data/leads_getresponse.md` NO es modificado.
> Los duplicados entre ambas listas son marcados con ⚠️dup pero conservados.

---

## Archivos involucrados

| Archivo | Rol |
|---------|-----|
| `secrets/gmail_credentials_piano.json` | Credenciales OAuth (cuenta ProfesorDePiano) |
| `secrets/gmail_token_piano.json` | Token de acceso (generado por setup) |
| `scripts/gmail-oauth-setup-piano.js` | Autoriza la segunda cuenta Gmail |
| `scripts/extract-profesordepiano-leads.js` | Extrae y guarda los leads |
| `data/leads_profesordepiano.md` | **Salida: leads de esta campaña** |
| `data/leads_getresponse.md` | Lista anterior (solo lectura — detección duplicados) |

---

## Formato email esperado (inglés)

```
Name: [nombre]
Email: [email]
http_referer: [url]
Timestamp: [fecha]
Campaign: profesordepiano
```

---

## Estructura de salida

| nombre | email | fecha | ciudad | prioridad |
|--------|-------|-------|--------|-----------|
| ...    | ...   | ...   | ...    | alta/media/baja |

**Prioridad:**
- `alta`  → ciudad = Santiago
- `media` → otra ciudad
- `baja`  → sin ciudad (el formato de email no incluye campo ciudad)

> **Nota:** Los emails de GetResponse de esta campaña no incluyen campo ciudad.
> Todos los leads tendrán prioridad `baja` inicialmente.
> Puedes actualizar `data/leads_profesordepiano.md` manualmente si conoces las ciudades.
