"""Config y fixtures de pytest para el backend Etiplast.

Aísla el entorno de test ANTES de importar cualquier módulo del backend:
- SECRET_KEY fijo → tokens JWT deterministas.
- DATABASE_URL a SQLite en memoria → NUNCA se conecta a la base real (Railway).

Los tests unitarios mockean la sesión de DB; los de API sólo ejercitan rutas
que no llegan a la base (health, openapi, auth sin token).
"""
import os
import sys

# --- Entorno de test (debe fijarse antes de importar config/database) ---
os.environ["SECRET_KEY"] = "test-secret-key-pytest-not-for-production-00000000"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"  # jamás tocar Railway en tests
os.environ.pop("RAILWAY_ENVIRONMENT", None)

# Permite importar módulos top-level del backend (services, routers, dependencies…)
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(scope="session")
def client():
    """TestClient sin lifespan (no dispara startup ni conexiones a la DB)."""
    from main import app
    return TestClient(app)
