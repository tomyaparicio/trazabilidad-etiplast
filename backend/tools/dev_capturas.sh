#!/usr/bin/env bash
# Levanta el backend apuntado a la base DESCARTABLE de capturas, sin tocar el
# backend/.env del entorno de desarrollo. La usa la configuración
# "backend-capturas" de la configuracion local de arranque.
#
#   core/database.py hace load_dotenv() SIN override, así que la variable de
#   entorno le gana al .env. Por eso alcanza con exportarla acá.
set -euo pipefail
cd "$(dirname "$0")/.."
export DATABASE_URL="postgresql://tomasaparicio@localhost:5432/etiplast_capturas"
exec venv/bin/uvicorn main:app --reload --port 8000
