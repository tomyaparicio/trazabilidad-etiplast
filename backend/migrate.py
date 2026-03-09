"""
Script de migraciones — Etiplast ERP
=====================================
Ejecutar desde la carpeta backend: python3 migrate.py

Las migraciones son idempotentes (pueden correrse múltiples veces sin error).
"""
import os
import sys
from sqlalchemy import text
from database import engine, Base
import models  # noqa — registra todos los modelos para create_all


# ──────────────────────────────────────────────────────────────────────────────
# Migraciones históricas (columnas legacy)
# ──────────────────────────────────────────────────────────────────────────────

MIGRATIONS_LEGACY = [
    ("Agregar columna transporte a clientes",
     "ALTER TABLE clientes ADD COLUMN IF NOT EXISTS transporte TEXT"),

    ("Crear tabla users",
     """
     CREATE TABLE IF NOT EXISTS users (
         id SERIAL PRIMARY KEY,
         email VARCHAR(255) UNIQUE NOT NULL,
         hashed_password VARCHAR(255) NOT NULL,
         is_active BOOLEAN DEFAULT TRUE
     );
     CREATE INDEX IF NOT EXISTS ix_users_email ON users (email);
     """),

    ("Agregar columna role a users",
     """
     ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';
     UPDATE users
     SET role = 'admin'
     WHERE id = (SELECT MIN(id) FROM users)
       AND (role IS NULL OR role = 'user');
     """),

    ("Agregar columnas nombre y apellido a users",
     """
     ALTER TABLE users ADD COLUMN IF NOT EXISTS nombre  VARCHAR(100);
     ALTER TABLE users ADD COLUMN IF NOT EXISTS apellido VARCHAR(100);
     """),
]


# ──────────────────────────────────────────────────────────────────────────────
# Normalización de la tabla clientes (3FN)
# ──────────────────────────────────────────────────────────────────────────────

MIGRATIONS_NORMALIZACION = [

    # 1. Catálogo de rubros
    ("Crear tabla rubros",
     """
     CREATE TABLE IF NOT EXISTS rubros (
         id         SERIAL PRIMARY KEY,
         nombre     VARCHAR(100) UNIQUE NOT NULL,
         created_at TIMESTAMPTZ DEFAULT NOW()
     );
     CREATE INDEX IF NOT EXISTS ix_rubros_nombre ON rubros (nombre);
     """),

    # 2. Catálogo de provincias
    ("Crear tabla provincias",
     """
     CREATE TABLE IF NOT EXISTS provincias (
         id     SERIAL PRIMARY KEY,
         nombre VARCHAR(100) UNIQUE NOT NULL
     );
     CREATE INDEX IF NOT EXISTS ix_provincias_nombre ON provincias (nombre);
     """),

    # 3. Poblar rubros desde datos existentes
    ("Poblar rubros desde clientes",
     """
     INSERT INTO rubros (nombre)
     SELECT DISTINCT TRIM(rubro)
     FROM clientes
     WHERE rubro IS NOT NULL AND TRIM(rubro) != ''
     ON CONFLICT (nombre) DO NOTHING;
     """),

    # 4. Poblar provincias desde datos existentes
    ("Poblar provincias desde clientes",
     """
     INSERT INTO provincias (nombre)
     SELECT DISTINCT TRIM(provincia)
     FROM clientes
     WHERE provincia IS NOT NULL AND TRIM(provincia) != ''
     ON CONFLICT (nombre) DO NOTHING;
     """),

    # 5. Agregar FK rubro_id y updated_at a clientes
    ("Agregar rubro_id y updated_at a clientes",
     """
     ALTER TABLE clientes
         ADD COLUMN IF NOT EXISTS rubro_id   INTEGER REFERENCES rubros(id) ON DELETE SET NULL,
         ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

     CREATE INDEX IF NOT EXISTS ix_clientes_rubro_id ON clientes (rubro_id);
     """),

    # 6. Poblar rubro_id desde la columna legacy rubro
    ("Poblar rubro_id en clientes",
     """
     UPDATE clientes c
     SET rubro_id = r.id
     FROM rubros r
     WHERE TRIM(c.rubro) = r.nombre
       AND c.rubro_id IS NULL;
     """),

    # 7. Tabla de ubicaciones (1:1)
    ("Crear tabla cliente_ubicaciones",
     """
     CREATE TABLE IF NOT EXISTS cliente_ubicaciones (
         id           SERIAL PRIMARY KEY,
         cliente_id   INTEGER NOT NULL UNIQUE REFERENCES clientes(id) ON DELETE CASCADE,
         domicilio    VARCHAR(300),
         localidad    VARCHAR(150),
         provincia_id INTEGER REFERENCES provincias(id) ON DELETE SET NULL,
         pais         VARCHAR(100) DEFAULT 'Argentina',
         transporte   VARCHAR(200)
     );
     CREATE INDEX IF NOT EXISTS ix_cliente_ubicaciones_cliente_id ON cliente_ubicaciones (cliente_id);
     CREATE INDEX IF NOT EXISTS ix_cliente_ubicaciones_provincia_id ON cliente_ubicaciones (provincia_id);
     """),

    # 8. Migrar datos de ubicación
    ("Migrar ubicaciones desde clientes",
     """
     INSERT INTO cliente_ubicaciones (cliente_id, domicilio, localidad, provincia_id, pais, transporte)
     SELECT
         c.id,
         c.domicilio,
         c.localidad,
         p.id,
         COALESCE(NULLIF(TRIM(c.pais), ''), 'Argentina'),
         c.transporte
     FROM clientes c
     LEFT JOIN provincias p ON TRIM(p.nombre) = TRIM(c.provincia)
     ON CONFLICT (cliente_id) DO NOTHING;
     """),

    # 9. Tabla de contactos (1:1, extensible a 1:N)
    ("Crear tabla cliente_contactos",
     """
     CREATE TABLE IF NOT EXISTS cliente_contactos (
         id            SERIAL PRIMARY KEY,
         cliente_id    INTEGER NOT NULL UNIQUE REFERENCES clientes(id) ON DELETE CASCADE,
         telefono      VARCHAR(100),
         observaciones TEXT
     );
     CREATE INDEX IF NOT EXISTS ix_cliente_contactos_cliente_id ON cliente_contactos (cliente_id);
     """),

    # 10. Migrar datos de contacto
    ("Migrar contactos desde clientes",
     """
     INSERT INTO cliente_contactos (cliente_id, telefono, observaciones)
     SELECT id, telefono, observaciones
     FROM clientes
     ON CONFLICT (cliente_id) DO NOTHING;
     """),

    # 11. Tabla de productos (1:N)
    ("Crear tabla cliente_productos",
     """
     CREATE TABLE IF NOT EXISTS cliente_productos (
         id               SERIAL PRIMARY KEY,
         cliente_id       INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
         nombre           VARCHAR(200),
         envase           VARCHAR(200),
         volumen_cantidad NUMERIC(12, 4),
         volumen_unidad   VARCHAR(50),
         lamina           VARCHAR(200),
         muestra          VARCHAR(200),
         alto             NUMERIC(10, 2),
         cilindro         NUMERIC(10, 2),
         cierre           NUMERIC(10, 2),
         created_at       TIMESTAMPTZ DEFAULT NOW(),
         updated_at       TIMESTAMPTZ DEFAULT NOW()
     );
     CREATE INDEX IF NOT EXISTS ix_cliente_productos_cliente_id ON cliente_productos (cliente_id);
     """),

    # 12. Migrar datos de producto
    ("Migrar productos desde clientes",
     """
     INSERT INTO cliente_productos
         (cliente_id, nombre, envase, volumen_cantidad, volumen_unidad,
          lamina, muestra, alto, cilindro, cierre)
     SELECT
         id, producto, envase, volumen_cantidad, volumen_unidad,
         lamina, muestra, alto, cilindro, cierre
     FROM clientes
     WHERE NOT EXISTS (
         SELECT 1 FROM cliente_productos cp WHERE cp.cliente_id = clientes.id
     );
     """),
]


# ──────────────────────────────────────────────────────────────────────────────
# Razones Sociales (entidad legal que agrupa marcas)
# ──────────────────────────────────────────────────────────────────────────────

MIGRATIONS_RAZONES_SOCIALES = [

    ("Crear tabla razones_sociales",
     """
     CREATE TABLE IF NOT EXISTS razones_sociales (
         id           SERIAL PRIMARY KEY,
         razon_social VARCHAR(300) NOT NULL,
         cuit         VARCHAR(20),
         created_at   TIMESTAMPTZ DEFAULT NOW(),
         updated_at   TIMESTAMPTZ DEFAULT NOW()
     );
     CREATE INDEX IF NOT EXISTS ix_razones_sociales_razon_social ON razones_sociales (razon_social);
     """),

    ("Poblar razones_sociales desde clientes",
     """
     INSERT INTO razones_sociales (razon_social, cuit)
     SELECT DISTINCT TRIM(razon_social), TRIM(cuit)
     FROM clientes
     WHERE razon_social IS NOT NULL AND TRIM(razon_social) != ''
     ON CONFLICT DO NOTHING;
     """),

    ("Agregar razon_social_id a clientes",
     """
     ALTER TABLE clientes
         ADD COLUMN IF NOT EXISTS razon_social_id INTEGER REFERENCES razones_sociales(id) ON DELETE SET NULL;
     CREATE INDEX IF NOT EXISTS ix_clientes_razon_social_id ON clientes (razon_social_id);
     """),

    ("Vincular clientes existentes a su razon_social",
     """
     UPDATE clientes c
     SET razon_social_id = rs.id
     FROM razones_sociales rs
     WHERE TRIM(c.razon_social) = TRIM(rs.razon_social)
       AND c.razon_social_id IS NULL;
     """),
]


# ──────────────────────────────────────────────────────────────────────────────
# Órdenes de Trabajo
# ──────────────────────────────────────────────────────────────────────────────

MIGRATIONS_ORDENES = [

    ("Crear tabla ordenes_trabajo",
     """
     CREATE TABLE IF NOT EXISTS ordenes_trabajo (
         id                      SERIAL PRIMARY KEY,
         numero                  VARCHAR(20) UNIQUE NOT NULL,
         cliente_id              INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
         cliente_producto_id     INTEGER REFERENCES cliente_productos(id) ON DELETE SET NULL,
         fecha                   DATE,
         estado                  VARCHAR(20) NOT NULL DEFAULT 'borrador',
         created_by              INTEGER REFERENCES users(id) ON DELETE SET NULL,

         extrusion_ancho         NUMERIC(10, 2),
         extrusion_color         VARCHAR(100),
         extrusion_trat          VARCHAR(100),
         extrusion_espesor       NUMERIC(10, 3),
         extrusion_cant_bob      INTEGER,
         extrusion_formulacion   VARCHAR(300),

         impresion_frente        TEXT,
         impresion_retroverso    TEXT,
         impresion_cilindro      NUMERIC(10, 2),
         impresion_colores       TEXT,

         troquelado_ancho        NUMERIC(10, 2),
         troquelado_alto         NUMERIC(10, 2),
         troquelado_envase       VARCHAR(200),

         cantidad                INTEGER,
         total_final             NUMERIC(14, 2),
         observaciones           TEXT,

         created_at              TIMESTAMPTZ DEFAULT NOW(),
         updated_at              TIMESTAMPTZ DEFAULT NOW()
     );
     CREATE INDEX IF NOT EXISTS ix_ordenes_trabajo_cliente_id ON ordenes_trabajo (cliente_id);
     CREATE INDEX IF NOT EXISTS ix_ordenes_trabajo_estado     ON ordenes_trabajo (estado);
     CREATE INDEX IF NOT EXISTS ix_ordenes_trabajo_numero     ON ordenes_trabajo (numero);
     """),

    ("Agregar impresion_observaciones a ordenes_trabajo",
     "ALTER TABLE ordenes_trabajo ADD COLUMN IF NOT EXISTS impresion_observaciones TEXT"),

    ("Crear tabla orden_extrusion_bobinas",
     """
     CREATE TABLE IF NOT EXISTS orden_extrusion_bobinas (
         id       SERIAL PRIMARY KEY,
         orden_id INTEGER NOT NULL REFERENCES ordenes_trabajo(id) ON DELETE CASCADE,
         metros   NUMERIC(10, 2),
         kg_bob   NUMERIC(10, 3)
     );
     CREATE INDEX IF NOT EXISTS ix_orden_extrusion_bobinas_orden_id ON orden_extrusion_bobinas (orden_id);
     """),
]


# ──────────────────────────────────────────────────────────────────────────────
# Split de marcas con "/" (marca1/marca2 → dos filas separadas)
# ──────────────────────────────────────────────────────────────────────────────

MIGRATIONS_SPLIT_MARCAS = [

    ("Split marcas con '/' en clientes",
     """
     DO $$
     DECLARE
         r      RECORD;
         parts  TEXT[];
         i      INT;
         new_id INT;
     BEGIN
         FOR r IN SELECT * FROM clientes WHERE marca LIKE '%/%' LOOP
             parts := string_to_array(r.marca, '/');
             IF array_length(parts, 1) < 2 THEN CONTINUE; END IF;

             -- Actualizar fila original con la primera marca
             UPDATE clientes SET marca = TRIM(parts[1]) WHERE id = r.id;

             -- Insertar filas nuevas para las marcas restantes
             FOR i IN 2..array_length(parts, 1) LOOP
                 IF TRIM(parts[i]) = '' THEN CONTINUE; END IF;

                 INSERT INTO clientes (
                     id_cliente, marca, rubro, razon_social, cuit,
                     domicilio, localidad, provincia, pais, telefono,
                     producto, volumen_cantidad, volumen_unidad, lamina, muestra,
                     alto, cilindro, cierre, envase, observaciones, transporte,
                     rubro_id, razon_social_id, updated_at
                 )
                 SELECT
                     id_cliente, TRIM(parts[i]), rubro, razon_social, cuit,
                     domicilio, localidad, provincia, pais, telefono,
                     producto, volumen_cantidad, volumen_unidad, lamina, muestra,
                     alto, cilindro, cierre, envase, observaciones, transporte,
                     rubro_id, razon_social_id, NOW()
                 FROM clientes WHERE id = r.id
                 RETURNING id INTO new_id;

                 -- Copiar ubicacion
                 INSERT INTO cliente_ubicaciones
                     (cliente_id, domicilio, localidad, provincia_id, pais, transporte)
                 SELECT new_id, domicilio, localidad, provincia_id, pais, transporte
                 FROM   cliente_ubicaciones WHERE cliente_id = r.id
                 ON CONFLICT (cliente_id) DO NOTHING;

                 -- Copiar contacto
                 INSERT INTO cliente_contactos (cliente_id, telefono, observaciones)
                 SELECT new_id, telefono, observaciones
                 FROM   cliente_contactos WHERE cliente_id = r.id
                 ON CONFLICT (cliente_id) DO NOTHING;

                 -- Copiar productos
                 INSERT INTO cliente_productos (
                     cliente_id, nombre, envase, volumen_cantidad, volumen_unidad,
                     lamina, muestra, alto, cilindro, cierre
                 )
                 SELECT
                     new_id, nombre, envase, volumen_cantidad, volumen_unidad,
                     lamina, muestra, alto, cilindro, cierre
                 FROM cliente_productos WHERE cliente_id = r.id;

             END LOOP;
         END LOOP;
     END $$;
     """),
]


# ──────────────────────────────────────────────────────────────────────────────
# Runner principal
# ──────────────────────────────────────────────────────────────────────────────

def run_migrations():
    print("=" * 52)
    print("   ETIPLAST ERP — Migraciones de base de datos")
    print("=" * 52)

    db_url = os.getenv("DATABASE_URL", "(no configurada)")
    db_host = "Railway" if "railway" in db_url.lower() else "local"
    print(f"\n  Conectando a: {db_host}...\n")

    # Crear tablas nuevas si no existen (modelos actuales)
    print("Verificando esquema...")
    Base.metadata.create_all(bind=engine)
    print("  ✓ Esquema verificado\n")

    all_migrations = MIGRATIONS_LEGACY + MIGRATIONS_NORMALIZACION + MIGRATIONS_RAZONES_SOCIALES + MIGRATIONS_ORDENES + MIGRATIONS_SPLIT_MARCAS

    with engine.connect() as conn:
        for name, sql in all_migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
                print(f"  ✓ {name}")
            except Exception as e:
                conn.rollback()
                print(f"  ✗ {name}: {e}")
                raise

    print("\nMigraciones aplicadas correctamente.")
    print("=" * 52)


if __name__ == "__main__":
    db = os.getenv("DATABASE_URL") or os.getenv("RAILWAY_ENVIRONMENT")
    if not db and not os.path.exists(os.path.join(os.path.dirname(__file__), ".env")):
        print("⚠️  DATABASE_URL no configurada. Creá backend/.env con:")
        print("   DATABASE_URL=postgresql://...  (desde Railway → Postgres → Variables)")
        print()
    try:
        run_migrations()
    except Exception as e:
        print(f"\n❌ Error fatal: {e}")
        sys.exit(1)
