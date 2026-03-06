"""
Script para aplicar migraciones a la base de datos.
Ejecutar desde la carpeta backend: python migrate.py

Para Supabase: configura DATABASE_URL en .env con la connection string de
Supabase Dashboard > Settings > Database > Connection string (URI)
"""
from sqlalchemy import text
from database import engine, Base

# Registrar modelos para create_all
import models  # noqa

MIGRATIONS = [
    ("Agregar columna transporte", "ALTER TABLE clientes ADD COLUMN IF NOT EXISTS transporte TEXT"),
    ("Recrear tabla users con email", """
        DROP TABLE IF EXISTS users;
        CREATE TABLE users (
            id SERIAL PRIMARY KEY,
            email VARCHAR UNIQUE NOT NULL,
            hashed_password VARCHAR NOT NULL,
            is_active BOOLEAN DEFAULT TRUE
        );
        CREATE INDEX IF NOT EXISTS ix_users_email ON users (email);
    """),
]


def run_migrations():
    print("=" * 50)
    print("  ETIPLAST ERP - Migraciones de base de datos")
    print("=" * 50)
    print()

    # 1. Crear tablas si no existen (incluye transporte)
    print("  Creando tablas si no existen...")
    Base.metadata.create_all(bind=engine)
    print("  ✓ Tablas verificadas")

    # 2. Aplicar migraciones (ALTER para tablas existentes sin la columna)
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
    run_migrations()
