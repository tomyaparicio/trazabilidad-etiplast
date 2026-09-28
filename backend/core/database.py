import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import URL, make_url
from sqlalchemy.orm import sessionmaker, DeclarativeBase

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

# ── Pool de conexiones ────────────────────────────────────────────────────────
# Los endpoints son `def`: FastAPI los corre en el pool de hilos de anyio, que
# atiende hasta 40 a la vez. Cada request usa UNA conexión (la sesión de get_db,
# compartida con sus dependencias). El default de SQLAlchemy (5 + 10 = 15) dejaba
# hasta 25 hilos esperando una conexión con la base ociosa: el pool, no Postgres,
# era el cuello de botella. Por eso el máximo iguala a los hilos: 10 + 30 = 40.
#
# - POOL_SIZE 10: las que quedan abiertas en reposo. Alcanza para el uso normal
#   de la oficina sin tener conexiones ociosas de más en Railway.
# - MAX_OVERFLOW 30: las extra que se abren en un pico y se cierran al terminar.
# - Techo: Railway admite ~100 conexiones. En un deploy conviven la instancia
#   vieja y la nueva (2 × 40 = 80), y queda lugar para migrate.py y un psql.
#   Subirlo por encima de 45 arriesga "too many connections" justo en un deploy.
# - POOL_TIMEOUT 10 s (default 30): con una conexión por hilo, en el uso normal no
#   se agota. Sí puede con más de 40 requests en vuelo: cada uno retiene su conexión
#   entre la dependencia (verify_token) y el endpoint mientras espera un hilo libre,
#   y los hilos a su vez esperan conexión. Esa espera cruzada sólo la corta este
#   timeout: mejor un error a los 10 s que un hilo congelado medio minuto.
# - pool_pre_ping: Railway corta conexiones ociosas; se prueban antes de usarlas.
POOL_SIZE = 10
MAX_OVERFLOW = 30
POOL_TIMEOUT = 10


def crear_engine(url):
    """Engine con el pool dimensionado para los hilos del servidor.

    SQLite (los tests unitarios) usa otro tipo de pool que no acepta estas
    opciones: a ese sólo se le pasa lo común.
    """
    if make_url(url).get_backend_name() == "sqlite":
        return create_engine(url, pool_pre_ping=True)
    return create_engine(
        url,
        pool_pre_ping=True,
        pool_size=POOL_SIZE,
        max_overflow=MAX_OVERFLOW,
        pool_timeout=POOL_TIMEOUT,
    )


if DATABASE_URL:
    # Railway usa postgresql://, SQLAlchemy necesita postgresql+psycopg2://
    if DATABASE_URL.startswith("postgresql://"):
        DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)
    engine = crear_engine(DATABASE_URL)
else:
    # Fallback a variables individuales (desarrollo local)
    database_url = URL.create(
        drivername="postgresql+psycopg2",
        username=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", ""),
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "5432")),
        database=os.getenv("DB_NAME", "postgres"),
    )
    engine = crear_engine(database_url)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
