"""Fixtures para tests de INTEGRACIÓN contra un Postgres de test real.

Requiere el contenedor `etiplast-test-pg` (puerto 5459) con el esquema migrado:

    docker run -d --name etiplast-test-pg -e POSTGRES_PASSWORD=test \\
      -e POSTGRES_USER=test -e POSTGRES_DB=etiplast_test -p 5459:5432 postgres:16-alpine
    DATABASE_URL="postgresql://test:test@localhost:5459/etiplast_test" python migrations/migrate.py

Si el Postgres de test no está disponible, estos tests se SALTAN (no fallan),
así la suite unitaria sigue corriendo sin Docker.
"""
import os

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

TEST_PG_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+psycopg2://test:test@localhost:5459/etiplast_test",
)

_engine = create_engine(TEST_PG_URL, pool_pre_ping=True)
_Session = sessionmaker(bind=_engine, autocommit=False, autoflush=False)


def _reachable() -> bool:
    try:
        with _engine.connect() as c:
            c.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


@pytest.fixture(scope="session")
def _pg():
    if not _reachable():
        pytest.skip("Postgres de test (:5459) no disponible — levantá el contenedor")
    return _engine


@pytest.fixture()
def db_session(_pg):
    s = _Session()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture()
def admin(db_session):
    """Siembra (o reutiliza) un usuario admin real en el test DB."""
    from models import User
    email = "pytest-admin@test.local"
    u = db_session.query(User).filter(User.email == email).first()
    if not u:
        u = User(
            email=email, hashed_password="x-not-used-in-tests",
            role="admin", is_active=True, nombre="Pytest", apellido="Admin",
        )
        db_session.add(u)
        db_session.commit()
        db_session.refresh(u)
    return {"email": u.email, "role": "admin", "id": u.id}


@pytest.fixture()
def api(admin):
    """TestClient con get_db → test DB y auth overrideada al admin sembrado."""
    from fastapi.testclient import TestClient
    from main import app
    from core.database import get_db
    from core.security import verify_token, verify_admin

    def _get_db():
        s = _Session()
        try:
            yield s
        finally:
            s.close()

    # El rate limit (120/min) es una defensa de producción, no del test: la suite
    # hace muchas más peticiones que eso y, al recibir 429, los teardown dejaban
    # clientes sin borrar que rompían la corrida siguiente.
    from core.middleware import limiter
    limiter.enabled = False

    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[verify_token] = lambda: admin
    app.dependency_overrides[verify_admin] = lambda: admin
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
