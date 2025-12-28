#!/bin/bash

# ============================================
# SCRIPT DE ROTACIÓN DE CREDENCIALES
# Ejecutar ANTES del primer deploy a producción
# ============================================

echo "🔒 PianoLink - Rotación de Credenciales de Producción"
echo "======================================================"
echo ""

# 1. Generar nuevo JWT_SECRET
echo "1️⃣ Generando nuevo JWT_SECRET criptográficamente seguro..."
NEW_JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
echo "✅ Nuevo JWT_SECRET generado (128 caracteres)"
echo ""

# 2. Instrucciones para MongoDB
echo "2️⃣ Rotar contraseña de MongoDB Atlas:"
echo "   a) Ve a: https://cloud.mongodb.com"
echo "   b) Selecciona tu cluster → Database Access"
echo "   c) Edita usuario 'Pianolink' → Cambiar contraseña"
echo "   d) Copia la nueva URI de conexión"
echo "   [PRESIONA ENTER CUANDO HAYAS COMPLETADO ESTE PASO]"
read -r

echo "📝 Pega la nueva MONGO_URI aquí:"
read -r NEW_MONGO_URI

# 3. Instrucciones para Cloudinary
echo ""
echo "3️⃣ Rotar Cloudinary API Secret:"
echo "   a) Ve a: https://cloudinary.com/console"
echo "   b) Settings → Security → Regenerate API Secret"
echo "   c) Copia el nuevo API Secret"
echo "   [PRESIONA ENTER CUANDO HAYAS COMPLETADO ESTE PASO]"
read -r

echo "📝 Pega el nuevo CLOUDINARY_API_SECRET aquí:"
read -r NEW_CLOUDINARY_SECRET

# 4. Crear nuevo archivo .env.production
echo ""
echo "4️⃣ Creando archivo .env.production..."

cat > .env.production << EOF
# ============================================
# PIANOLINK - VARIABLES DE PRODUCCIÓN
# Generado: $(date)
# NUNCA COMMITEAR ESTE ARCHIVO
# ============================================

NODE_ENV=production
PORT=3000

# MongoDB Atlas (URI rotada)
MONGO_URI=${NEW_MONGO_URI}

# JWT Secret (128 caracteres - rotado)
JWT_SECRET=${NEW_JWT_SECRET}

# Cloudinary (API Secret rotado)
CLOUDINARY_CLOUD_NAME=dnd0bhkpm
CLOUDINARY_API_KEY=351416792734871
CLOUDINARY_API_SECRET=${NEW_CLOUDINARY_SECRET}
EOF

echo "✅ Archivo .env.production creado"
echo ""

# 5. Backup del .env antiguo
if [ -f .env ]; then
    echo "5️⃣ Creando backup del .env antiguo..."
    mv .env .env.backup.$(date +%Y%m%d_%H%M%S)
    echo "✅ Backup creado"
fi

# 6. Verificar que .gitignore existe
echo ""
echo "6️⃣ Verificando .gitignore..."
if [ -f .gitignore ]; then
    if grep -q "^\.env$" .gitignore; then
        echo "✅ .gitignore correcto (.env ya excluido)"
    else
        echo ".env" >> .gitignore
        echo "✅ .env añadido a .gitignore"
    fi
else
    echo "⚠️  ADVERTENCIA: No se encontró .gitignore"
fi

# 7. Verificar estado de Git
echo ""
echo "7️⃣ Verificando repositorio Git..."
if git rev-parse --git-dir > /dev/null 2>&1; then
    echo "📦 Repositorio Git detectado"
    
    # Remover .env del historial si está trackeado
    if git ls-files --error-unmatch .env > /dev/null 2>&1; then
        echo "⚠️  .env está en el repositorio. Removiendo..."
        git rm --cached .env
        echo "✅ .env removido del staging (ejecuta 'git commit' para confirmar)"
    else
        echo "✅ .env no está trackeado en Git"
    fi
else
    echo "ℹ️  No es un repositorio Git (OK si es primera vez)"
fi

# 8. Resumen final
echo ""
echo "============================================"
echo "✅ ROTACIÓN COMPLETADA"
echo "============================================"
echo ""
echo "📋 SIGUIENTE PASO - Configurar variables en tu hosting:"
echo ""
echo "   Heroku:"
echo "   heroku config:set JWT_SECRET='${NEW_JWT_SECRET}'"
echo "   heroku config:set MONGO_URI='${NEW_MONGO_URI}'"
echo "   heroku config:set CLOUDINARY_API_SECRET='${NEW_CLOUDINARY_SECRET}'"
echo ""
echo "   Railway/Vercel/Render:"
echo "   Copia las variables de .env.production al panel de configuración"
echo ""
echo "⚠️  IMPORTANTE:"
echo "   1. .env.production contiene credenciales reales"
echo "   2. NUNCA lo commitees a Git"
echo "   3. Guárdalo en un gestor de contraseñas (1Password, LastPass)"
echo ""
echo "🚀 Sistema listo para deploy seguro"
