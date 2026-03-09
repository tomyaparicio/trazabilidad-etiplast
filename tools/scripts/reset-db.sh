#!/bin/bash
# Corre las migraciones desde cero
# Uso: cd backend && bash ../tools/scripts/reset-db.sh

set -e
source venv/bin/activate
echo "Corriendo migraciones..."
python migrate.py
echo "✓ Base de datos actualizada"
