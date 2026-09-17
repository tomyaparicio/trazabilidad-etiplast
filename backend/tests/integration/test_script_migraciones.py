"""Integración: el script de migraciones corre igual que en Railway.

El Procfile ejecuta `python3 migrations/migrate.py` en cada deploy. Tras mover
el backend a carpetas (core/, migrations/…), un import viejo (`import rbac`)
hacía fallar el seed de roles en silencio: el script lo loggea y sigue, así que
el deploy «andaba» pero los roles nuevos nunca se sembraban.
"""
import os
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
TEST_DB = "postgresql://test:test@localhost:5459/etiplast_test"


def test_migrate_corre_sin_errores_desde_la_raiz_del_backend(_pg):
    r = subprocess.run(
        [sys.executable, "migrations/migrate.py"],
        cwd=BACKEND, capture_output=True, text=True, timeout=120,
        env={**os.environ, "DATABASE_URL": TEST_DB},
    )
    salida = r.stdout + r.stderr
    assert r.returncode == 0, salida
    assert "falló" not in salida, salida
    assert "0 con error" in salida, salida
