#!/bin/bash
# Deploy pianolink-v4 a Fly.io usando token scoped (sin auth interactivo)
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Cargar token desde .env
export FLY_API_TOKEN=$(grep '^FLY_API_TOKEN=' .env | cut -d'=' -f2-)

if [ -z "$FLY_API_TOKEN" ]; then
  echo "❌ FLY_API_TOKEN no encontrado en .env"
  exit 1
fi

export FLYCTL_INSTALL="$HOME/.fly"
export PATH="$FLYCTL_INSTALL/bin:$PATH"

echo "🎹 Desplegando pianolink-v4..."
flyctl deploy --app pianolink-v4
