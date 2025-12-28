#!/bin/bash

# ============================================
# PIANOLINK V4 - COMMIT FINAL SCRIPT
# Ejecutar después de validar PRE_LAUNCH_VALIDATION.md
# ============================================

echo "🎹 PianoLink V4 - Preparando Commit Final"
echo "=========================================="
echo ""

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. Verificar que estamos en el directorio correcto
if [ ! -f "server.js" ]; then
    echo -e "${RED}❌ Error: No estás en el directorio raíz de PianoLink${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Directorio verificado${NC}"
echo ""

# 2. Verificar que .env no está en staging
if git ls-files --error-unmatch .env > /dev/null 2>&1; then
    echo -e "${RED}⚠️  ADVERTENCIA: .env todavía está trackeado en Git${NC}"
    echo "Ejecutando: git rm --cached .env"
    git rm --cached .env
fi

echo -e "${GREEN}✅ .env no está trackeado${NC}"
echo ""

# 3. Mostrar estado actual
echo "📊 Estado del repositorio:"
echo "---"
git status --short
echo ""

# 4. Confirmar con el usuario
echo -e "${YELLOW}¿Deseas continuar con el commit? (y/n)${NC}"
read -r response
if [[ ! "$response" =~ ^[Yy]$ ]]; then
    echo "Commit cancelado por el usuario."
    exit 0
fi

# 5. Agregar todos los archivos
echo ""
echo "📦 Agregando archivos al staging area..."
git add .

# 6. Mostrar archivos que serán commiteados
echo ""
echo "📋 Archivos que serán commiteados:"
echo "---"
git status --short
echo ""

# 7. Confirmar nuevamente
echo -e "${YELLOW}¿Todo correcto? Proceder con el commit? (y/n)${NC}"
read -r response2
if [[ ! "$response2" =~ ^[Yy]$ ]]; then
    echo "Commit cancelado. Los archivos permanecen en staging."
    exit 0
fi

# 8. Realizar el commit
echo ""
echo "💾 Realizando commit..."
git commit -m "feat: PianoLink V4 BETA - Sistema completo con seguridad reforzada

- Security: Validación de roles en comandos administrativos
- Performance: Graceful shutdown + heartbeat inteligente
- Architecture: Dispose Pattern completo en todos los módulos
- Documentation: README profesional + auditoría de seguridad
- Stability: Conversión ES5 de arrow functions para compatibilidad
- Features: DiagnosticSidebar, MidiStateManager, Snapshot Protocol

Bloqueantes resueltos:
- BLOQUEANTE #1: .env removido de Git + .gitignore exhaustivo
- BLOQUEANTE #2: Validación de roomCode y autorización de usuario
- BLOQUEANTE #3: Memory leak del heartbeat solucionado

Sistema listo para despliegue en producción."

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Commit realizado exitosamente${NC}"
else
    echo -e "${RED}❌ Error al realizar commit${NC}"
    exit 1
fi

# 9. Preguntar si desea hacer push
echo ""
echo -e "${YELLOW}¿Deseas hacer push a GitHub? (y/n)${NC}"
read -r response3
if [[ "$response3" =~ ^[Yy]$ ]]; then
    echo ""
    echo "🚀 Haciendo push a origin/main..."
    git push origin main
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Push realizado exitosamente${NC}"
    else
        echo -e "${RED}❌ Error al hacer push${NC}"
        exit 1
    fi
fi

# 10. Preguntar si desea crear tag
echo ""
echo -e "${YELLOW}¿Deseas crear el tag v4.0.0-beta? (y/n)${NC}"
read -r response4
if [[ "$response4" =~ ^[Yy]$ ]]; then
    echo ""
    echo "🏷️  Creando tag v4.0.0-beta..."
    git tag -a v4.0.0-beta -m "PianoLink V4 BETA - Primera versión estable"
    
    echo "🚀 Haciendo push del tag..."
    git push origin v4.0.0-beta
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Tag creado y pusheado exitosamente${NC}"
    else
        echo -e "${RED}❌ Error al crear/pushear tag${NC}"
        exit 1
    fi
fi

# 11. Resumen final
echo ""
echo "============================================"
echo -e "${GREEN}✅ COMMIT FINAL COMPLETADO${NC}"
echo "============================================"
echo ""
echo "📋 Próximos pasos:"
echo ""
echo "1. Rotar credenciales para producción:"
echo "   $ ./rotate_credentials.sh"
echo ""
echo "2. Configurar GitHub Secrets:"
echo "   - Ve a: Settings → Secrets and variables → Actions"
echo "   - Añade: MONGO_URI, JWT_SECRET, CLOUDINARY_API_SECRET"
echo ""
echo "3. Desplegar a producción:"
echo "   Heroku:  $ git push heroku main"
echo "   Railway: Push automático desde GitHub"
echo ""
echo "4. Verificar deployment:"
echo "   $ heroku logs --tail"
echo ""
echo -e "${GREEN}🎹 PianoLink V4 BETA listo para producción!${NC}"
