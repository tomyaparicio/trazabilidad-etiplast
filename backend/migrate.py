"""
Script para aplicar migraciones a la base de datos.
Ejecutar desde la carpeta backend: python3 migrate.py

Para Railway: DATABASE_URL se inyecta automáticamente.
Para local: creá .env con DATABASE_URL de Railway o Postgres local.
"""
import os
from sqlalchemy import text
from database import engine, Base

# Registrar modelos para create_all
import models  # noqa

MIGRATIONS = [
    ("Agregar columna transporte", "ALTER TABLE clientes ADD COLUMN IF NOT EXISTS transporte TEXT"),
    ("Crear tabla users si no existe", """
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            hashed_password VARCHAR(255) NOT NULL,
            is_active BOOLEAN DEFAULT TRUE
        );
        CREATE INDEX IF NOT EXISTS ix_users_email ON users (email);
    """),
    ("Agregar columna role a users", """
        ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';
        UPDATE users SET role = 'admin' WHERE id = (SELECT MIN(id) FROM users) AND (role IS NULL OR role = 'user');
    """),
]


def run_migrations():
    print("=" * 50)
    print("  ETIPLAST ERP - Migraciones de base de datos")
    print("=" * 50)
    print()

    db_url = os.getenv("DATABASE_URL", "(no configurada)")
    db_host = "railway" if "railway" in db_url.lower() else "local"
    print(f"  Conectando a: {db_host}...")
    print()

    # 1. Crear tablas si no existen
    print("Creando tablas si no existen...")
    Base.metadata.create_all(bind=engine)
    print("  ✓ Tablas verificadas")

    # 2. Aplicar migraciones
    with engine.connect() as conn:
        for name, sql in MIGRATIONS:
            try:
                conn.execute(text(sql))
                conn.commit()
                print(f"  ✓ {name}")
            except Exception as e:
                print(f"  ✗ {name}: {e}")
                raise

    print()
    print("Migraciones aplicadas correctamente.")
    print("=" * 50)


if __name__ == "__main__":
    import sys
    db = os.getenv("DATABASE_URL") or os.getenv("RAILWAY_ENVIRONMENT")
    if not db and not os.path.exists(os.path.join(os.path.dirname(__file__), ".env")):
        print("⚠️  DATABASE_URL no configurada. Creá backend/.env con:")
        print("   DATABASE_URL=postgresql://... (desde Railway → Postgres → Variables)")
        print()
    try:
        run_migrations()
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)
