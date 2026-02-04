# 🎯 Cómo Usar el Sistema de AliExpress en el Admin Panel

## ✅ Producto Agregado

Ya agregué el cable MIDI USB de AliExpress:
- **URL**: https://www.aliexpress.com/item/1005003373147519.html
- **Precio de costo**: $2.50
- **Precio de venta**: $15.00
- **Margen**: $12.50 (500%)

---

## 🖥️ Acceder desde el Admin Panel

### Opción 1: Pestaña "Productos"

1. **Abre el Admin Panel**: http://localhost:3000/admin
2. **Ve a**: Welcome Kits → **Productos** (tab 🎹)
3. **Verás el cable** junto con los otros productos
4. Puedes:
   - ✏️ Editar precio
   - 🗑️ Eliminar
   - 👁️ Ver detalles

### Opción 2: Pestaña "DSers + AliExpress" (Recomendada)

1. **Abre el Admin Panel**: http://localhost:3000/admin
2. **Ve a**: Welcome Kits → **DSers + AliExpress** (tab 🛒)
3. **Verás**:
   - 🎉 Banner explicando que DSers es GRATIS
   - Estado de DSers (Activo/Inactivo)
   - Configuración de Affiliate ID
   - **Lista de productos de AliExpress**

4. **Funciones disponibles**:
   - **➕ Agregar de AliExpress**: Modal para agregar más productos
   - **📥 Exportar Pedidos CSV**: Cuando tengas ventas, exporta para DSers
   - ✏️ Editar producto
   - 🗑️ Eliminar producto

---

## ➕ Agregar Más Productos desde el Panel

### Paso a Paso:

1. **Busca el producto en AliExpress**
   - Ejemplo: "USB MIDI cable keyboard"
   - Copia la URL completa

2. **En Admin Panel → DSers + AliExpress**
   - Click en **"➕ Agregar de AliExpress"**

3. **Completa el formulario**:
   ```
   Nombre: Cable MIDI USB para Teclado
   URL: https://www.aliexpress.com/item/1005003373147519.html
   Precio en AliExpress: 2.50
   Margen de ganancia: 40% (o el que quieras)
   Categoría: Cable
   ```

4. **Vista previa del precio**:
   - El sistema calcula automáticamente: $2.50 × 1.40 = $3.50
   - Puedes ajustar el margen para cambiar el precio final

5. **Click "💾 Agregar Producto"**
   - ✅ Producto guardado en la base de datos
   - Aparece inmediatamente en la lista

---

## 📦 Gestión de Productos de AliExpress

### Ver Lista de Productos

En **DSers + AliExpress**, verás una lista con:
- Nombre del producto
- Categoría
- Precio de venta
- Link a AliExpress (para verificar disponibilidad)
- Botones de acción (editar/eliminar)

### Editar Producto

Por ahora:
- Elimina el producto existente
- Agrégalo de nuevo con los nuevos valores

(La función de edición está en desarrollo)

### Eliminar Producto

- Click en 🗑️ al lado del producto
- Confirma la eliminación
- Se elimina de la base de datos

---

## 💰 Configuración de DSers

### Activar/Desactivar Servicio

1. En **DSers + AliExpress**
2. Toggle el switch **"Estado DSers"**
3. Cuando está activo:
   - Los productos de AliExpress se muestran en la tienda
   - Puedes exportar pedidos

### Affiliate Tracking ID (Opcional)

Si quieres ganar comisiones adicionales:

1. Regístrate en [AliExpress Affiliate](https://portals.aliexpress.com/)
2. Obtén tu Tracking ID
3. Pégalo en el campo **"Affiliate Tracking ID"**
4. Click **"💾 Guardar Configuración"**

El sistema agregará automáticamente tu tracking a todas las URLs.

### Margen Predeterminado

- Define el margen % que se aplicará por defecto
- Ejemplo: 40% significa que un producto de $10 se venderá a $14
- Puedes cambiar el margen individualmente al agregar cada producto

---

## 📥 Exportar Pedidos para DSers

Cuando tengas ventas:

1. **En Admin Panel → DSers + AliExpress**
2. Click en **"📥 Exportar Pedidos CSV"**
3. Se descarga un archivo `dsers-orders-XXXXX.csv`
4. **En DSers.com**:
   - Ve a "My Orders → Import Orders"
   - Sube el CSV
   - Procesa los pedidos

---

## 🔄 Flujo Completo de Venta

### 1. Cliente Compra (Automático)
- Cliente selecciona Cable MIDI en kit-bienvenida
- Paga $15
- Orden guardada en sistema

### 2. Exportar a DSers (Manual - 30 segundos)
- Admin Panel → DSers + AliExpress
- Click "📥 Exportar Pedidos CSV"

### 3. Procesar en DSers (1 click)
- Importar CSV en DSers
- Click "Order to AliExpress"
- Pagar $2.50 en AliExpress

### 4. Envío (Automático)
- AliExpress envía al cliente
- Tracking sincronizado
- Cliente notificado

### 5. Ganancia
- Ingreso: $15
- Costo: $2.50
- **Ganancia: $12.50**

---

## 📊 Comparación: Gestión Normal vs AliExpress

### Productos Normales (CJDropshipping):
```
Admin Panel → Welcome Kits → CJDropshipping
- Configurar SKUs
- Márgenes por categoría
- Fulfillment automático por API
```

### Productos AliExpress (DSers):
```
Admin Panel → Welcome Kits → DSers + AliExpress
- Agregar URLs de productos
- Márgenes personalizados
- Fulfillment semi-automático (CSV)
```

---

## ⚡ Tips Rápidos

1. **Agregar productos rápido**: Usa el modal desde el admin panel (más rápido que scripts)
2. **Verificar disponibilidad**: Click en "Ver en AliExpress" para confirmar que el producto sigue disponible
3. **Ajustar precios**: Puedes eliminar y re-agregar con nuevo precio/margen
4. **Probar primero**: Haz un pedido de prueba a ti mismo antes de vender

---

## 🚀 Próximos Pasos Recomendados

1. ✅ **Ya tienes 1 cable agregado**
2. 🔍 **Busca más cables en AliExpress**:
   - Cable MIDI 5-Pin
   - Cable USB-C MIDI
   - Cable Micro-USB MIDI
3. ➕ **Agrégalos desde el admin panel**
4. 🧪 **Prueba el flujo** con una orden de prueba
5. 📈 **Escala** cuando veas que funciona

---

**🎹 Listo! Ya tienes todo configurado para vender productos de AliExpress sin costo mensual.**

---

*Última actualización: Febrero 2026*
