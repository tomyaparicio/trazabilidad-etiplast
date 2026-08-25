"""
Script de migraciones — Etiplast ERP
=====================================
Ejecutar desde la carpeta backend:

  python migrate.py           → base de datos LOCAL (backend/.env)
  python migrate.py --prod    → base de datos RAILWAY (backend/.env.prod)

Las migraciones son idempotentes (pueden correrse múltiples veces sin error).
"""
import os
import sys

# ── Cargar el .env correcto ANTES de importar database (que lee DATABASE_URL) ──
_here = os.path.dirname(os.path.abspath(__file__))
_prod = "--prod" in sys.argv

if _prod:
    _env_file = os.path.join(_here, ".env.prod")
    if not os.path.exists(_env_file):
        print("❌  No existe backend/.env.prod")
        print("   Crealo con:")
        print("   DATABASE_URL=postgresql://postgres:<pass>@<host>:<port>/railway")
        sys.exit(1)
    from dotenv import load_dotenv
    load_dotenv(_env_file, override=True)
    print("🚀  Modo PRODUCCIÓN — Railway")
else:
    print("💻  Modo LOCAL")

from sqlalchemy import text   # noqa: E402
from database import engine, Base  # noqa: E402
import models  # noqa: E402 — registra todos los modelos para create_all


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

    # 3. Poblar rubros desde datos existentes (solo si existe la columna legacy)
    ("Poblar rubros desde clientes",
     """
     DO $$
     BEGIN
         IF EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_name='clientes' AND column_name='rubro'
         ) THEN
             INSERT INTO rubros (nombre)
             SELECT DISTINCT TRIM(rubro)
             FROM clientes
             WHERE rubro IS NOT NULL AND TRIM(rubro) != ''
             ON CONFLICT (nombre) DO NOTHING;
         END IF;
     END $$;
     """),

    # 4. Poblar provincias desde datos existentes (solo si existe la columna legacy)
    ("Poblar provincias desde clientes",
     """
     DO $$
     BEGIN
         IF EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_name='clientes' AND column_name='provincia'
         ) THEN
             INSERT INTO provincias (nombre)
             SELECT DISTINCT TRIM(provincia)
             FROM clientes
             WHERE provincia IS NOT NULL AND TRIM(provincia) != ''
             ON CONFLICT (nombre) DO NOTHING;
         END IF;
     END $$;
     """),

    # 5. Agregar FK rubro_id y updated_at a clientes
    ("Agregar rubro_id y updated_at a clientes",
     """
     ALTER TABLE clientes
         ADD COLUMN IF NOT EXISTS rubro_id   INTEGER REFERENCES rubros(id) ON DELETE SET NULL,
         ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

     CREATE INDEX IF NOT EXISTS ix_clientes_rubro_id ON clientes (rubro_id);
     """),

    # 6. Poblar rubro_id desde la columna legacy rubro (solo si existe)
    ("Poblar rubro_id en clientes",
     """
     DO $$
     BEGIN
         IF EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_name='clientes' AND column_name='rubro'
         ) THEN
             UPDATE clientes c
             SET rubro_id = r.id
             FROM rubros r
             WHERE TRIM(c.rubro) = r.nombre
               AND c.rubro_id IS NULL;
         END IF;
     END $$;
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

    # 8. Migrar datos de ubicación (solo si existe columna legacy provincia)
    ("Migrar ubicaciones desde clientes",
     """
     DO $$
     BEGIN
         IF EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_name='clientes' AND column_name='provincia'
         ) THEN
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
         END IF;
     END $$;
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

    # 10. Migrar datos de contacto (solo si existe columna legacy telefono)
    ("Migrar contactos desde clientes",
     """
     DO $$
     BEGIN
         IF EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_name='clientes' AND column_name='telefono'
         ) THEN
             INSERT INTO cliente_contactos (cliente_id, telefono, observaciones)
             SELECT id, telefono, observaciones
             FROM clientes
             ON CONFLICT (cliente_id) DO NOTHING;
         END IF;
     END $$;
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

    # 12. Migrar datos de producto (solo si existe columna legacy producto)
    ("Migrar productos desde clientes",
     """
     DO $$
     BEGIN
         IF EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_name='clientes' AND column_name='producto'
         ) THEN
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
         END IF;
     END $$;
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
     DO $$
     BEGIN
         IF EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_name='clientes' AND column_name='razon_social'
         ) THEN
             INSERT INTO razones_sociales (razon_social, cuit)
             SELECT DISTINCT TRIM(razon_social), TRIM(cuit)
             FROM clientes
             WHERE razon_social IS NOT NULL AND TRIM(razon_social) != ''
             ON CONFLICT DO NOTHING;
         END IF;
     END $$;
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

    ("Convertir índice único id_cliente a no-único",
     """
     DO $$
     BEGIN
         -- Dropear el índice único si existe (esquema legacy)
         IF EXISTS (
             SELECT 1 FROM pg_indexes
             WHERE tablename = 'clientes'
               AND indexname = 'ix_clientes_id_cliente'
         ) THEN
             DROP INDEX ix_clientes_id_cliente;
             CREATE INDEX ix_clientes_id_cliente ON clientes (id_cliente);
         END IF;
     END $$;
     """),

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
# Deduplicación de razones_sociales
# Agrupa por nombre (case-insensitive, trim) y conserva el ID más bajo.
# Antes de borrar, rescata el CUIT del grupo si el canónico no lo tiene.
# ──────────────────────────────────────────────────────────────────────────────

MIGRATIONS_DEDUP_RAZONES = [

    ("Rescatar CUIT en entrada canónica de razones_sociales",
     """
     UPDATE razones_sociales rs
     SET cuit = sub.best_cuit
     FROM (
         SELECT
             MIN(id)                                                    AS canonical_id,
             MIN(cuit) FILTER (WHERE cuit IS NOT NULL AND TRIM(cuit) != '') AS best_cuit
         FROM razones_sociales
         GROUP BY LOWER(TRIM(razon_social))
     ) sub
     WHERE rs.id = sub.canonical_id
       AND (rs.cuit IS NULL OR TRIM(rs.cuit) = '')
       AND sub.best_cuit IS NOT NULL;
     """),

    ("Revincular clientes al ID canónico de su razón social",
     """
     WITH dedup AS (
         SELECT id,
                MIN(id) OVER (PARTITION BY LOWER(TRIM(razon_social))) AS canonical_id
         FROM razones_sociales
     )
     UPDATE clientes
     SET razon_social_id = dedup.canonical_id
     FROM dedup
     WHERE clientes.razon_social_id = dedup.id
       AND dedup.id <> dedup.canonical_id;
     """),

    ("Eliminar razones_sociales duplicadas (conservar la de menor ID por nombre)",
     """
     DELETE FROM razones_sociales
     WHERE id NOT IN (
         SELECT MIN(id)
         FROM razones_sociales
         GROUP BY LOWER(TRIM(razon_social))
     );
     """),
]

MIGRATIONS_RESPONSABLE = [
    ("Agregar responsable_id a ordenes_trabajo",
     """
     ALTER TABLE ordenes_trabajo
     ADD COLUMN IF NOT EXISTS responsable_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
     """),
]


# ──────────────────────────────────────────────────────────────────────────────
# V2 — Nuevas funcionalidades industriales y logísticas
# ──────────────────────────────────────────────────────────────────────────────

MIGRATIONS_V2 = [

    # ── Clientes ──────────────────────────────────────────────────────────────

    ("V2: Agregar envase_codificado a cliente_productos",
     "ALTER TABLE cliente_productos ADD COLUMN IF NOT EXISTS envase_codificado VARCHAR(100)"),

    ("V2: Agregar latitud y longitud a cliente_ubicaciones",
     """
     ALTER TABLE cliente_ubicaciones
         ADD COLUMN IF NOT EXISTS latitud  NUMERIC(10, 6),
         ADD COLUMN IF NOT EXISTS longitud NUMERIC(10, 6);
     """),

    # ── Maquinas (catálogo) ───────────────────────────────────────────────────

    ("V2: Crear tabla maquinas",
     """
     CREATE TABLE IF NOT EXISTS maquinas (
         id         SERIAL PRIMARY KEY,
         codigo     VARCHAR(50) UNIQUE NOT NULL,
         nombre     VARCHAR(200) NOT NULL,
         tipo       VARCHAR(50),
         activa     BOOLEAN DEFAULT TRUE,
         created_at TIMESTAMPTZ DEFAULT NOW()
     );
     CREATE INDEX IF NOT EXISTS ix_maquinas_codigo ON maquinas (codigo);
     CREATE INDEX IF NOT EXISTS ix_maquinas_tipo   ON maquinas (tipo);
     """),

    # ── Órdenes de Trabajo ────────────────────────────────────────────────────

    ("V2: Agregar fechas de etapas a ordenes_trabajo",
     """
     ALTER TABLE ordenes_trabajo
         ADD COLUMN IF NOT EXISTS fecha_diseno     DATE,
         ADD COLUMN IF NOT EXISTS fecha_preprensa  DATE,
         ADD COLUMN IF NOT EXISTS fecha_extrusion  DATE,
         ADD COLUMN IF NOT EXISTS fecha_impresion  DATE,
         ADD COLUMN IF NOT EXISTS fecha_troquelado DATE,
         ADD COLUMN IF NOT EXISTS fecha_entrega    DATE;
     """),

    ("V2: Agregar máquinas a ordenes_trabajo",
     """
     ALTER TABLE ordenes_trabajo
         ADD COLUMN IF NOT EXISTS extrusion_maquina  VARCHAR(100),
         ADD COLUMN IF NOT EXISTS troquelado_maquina VARCHAR(100);
     """),

    ("V2: Agregar operadores a ordenes_trabajo",
     """
     ALTER TABLE ordenes_trabajo
         ADD COLUMN IF NOT EXISTS operador_extrusion  VARCHAR(150),
         ADD COLUMN IF NOT EXISTS operador_impresion  VARCHAR(150),
         ADD COLUMN IF NOT EXISTS operador_troquelado VARCHAR(150);
     """),

    ("V2: Agregar observaciones por proceso a ordenes_trabajo",
     """
     ALTER TABLE ordenes_trabajo
         ADD COLUMN IF NOT EXISTS extrusion_observaciones  TEXT,
         ADD COLUMN IF NOT EXISTS troquelado_observaciones TEXT,
         ADD COLUMN IF NOT EXISTS control_calidad          TEXT;
     """),

    # ── Transporte ────────────────────────────────────────────────────────────

    ("V2: Agregar domicilio y localidad de transporte a cliente_ubicaciones",
     """
     ALTER TABLE cliente_ubicaciones
         ADD COLUMN IF NOT EXISTS transporte_domicilio VARCHAR(300),
         ADD COLUMN IF NOT EXISTS transporte_localidad VARCHAR(150);
     """),

    ("V2: Agregar operador general a ordenes_trabajo",
     """
     ALTER TABLE ordenes_trabajo
         ADD COLUMN IF NOT EXISTS operador VARCHAR(150);
     """),
]


# ──────────────────────────────────────────────────────────────────────────────
# Catálogo de Envases
# ──────────────────────────────────────────────────────────────────────────────

MIGRATIONS_ENVASES = [

    ("Crear tabla envases",
     """
     CREATE TABLE IF NOT EXISTS envases (
         id         SERIAL PRIMARY KEY,
         nombre     VARCHAR(200) UNIQUE NOT NULL,
         created_at TIMESTAMPTZ DEFAULT NOW()
     );
     CREATE INDEX IF NOT EXISTS ix_envases_nombre ON envases (nombre);
     """),

    ("Poblar envases desde cliente_productos",
     """
     INSERT INTO envases (nombre)
     SELECT DISTINCT TRIM(envase)
     FROM cliente_productos
     WHERE envase IS NOT NULL AND TRIM(envase) <> ''
     ON CONFLICT (nombre) DO NOTHING;
     """),
]


# ──────────────────────────────────────────────────────────────────────────────
# Número de cliente en razones_sociales
# El número pertenece a la entidad legal, no a cada marca individualmente.
# ──────────────────────────────────────────────────────────────────────────────

MIGRATIONS_RS_NUMERO = [

    ("RS: Agregar columna numero a razones_sociales",
     "ALTER TABLE razones_sociales ADD COLUMN IF NOT EXISTS numero INTEGER"),

    ("RS: Poblar numero desde id_cliente de clientes asociados",
     """
     UPDATE razones_sociales rs
     SET numero = sub.numero
     FROM (
         SELECT razon_social_id, MIN(id_cliente) AS numero
         FROM clientes
         WHERE razon_social_id IS NOT NULL AND id_cliente IS NOT NULL
         GROUP BY razon_social_id
     ) sub
     WHERE rs.id = sub.razon_social_id
       AND rs.numero IS NULL;
     """),

    ("RS: Índice en razones_sociales.numero",
     "CREATE INDEX IF NOT EXISTS ix_razones_sociales_numero ON razones_sociales (numero)"),
]


# ──────────────────────────────────────────────────────────────────────────────
# Fuzzy Search — pg_trgm para búsqueda fonética/aproximada (agente de voz)
# ──────────────────────────────────────────────────────────────────────────────

MIGRATIONS_FUZZY = [

    ("Fuzzy: Habilitar extensión pg_trgm",
     "CREATE EXTENSION IF NOT EXISTS pg_trgm"),

    ("Fuzzy: Índice trigrama en clientes.marca",
     """
     CREATE INDEX IF NOT EXISTS idx_clientes_marca_trgm
     ON clientes USING gin(lower(coalesce(marca, '')) gin_trgm_ops)
     """),

    ("Fuzzy: Índice trigrama en clientes.razon_social",
     """
     CREATE INDEX IF NOT EXISTS idx_clientes_razon_social_trgm
     ON clientes USING gin(lower(coalesce(razon_social, '')) gin_trgm_ops)
     """),
]

MIGRATIONS_MAQUINA_PRODUCTO = [

    ("Producto: Agregar maquina_impresora_id a cliente_productos",
     """
     ALTER TABLE cliente_productos
     ADD COLUMN IF NOT EXISTS maquina_impresora_id INTEGER
         REFERENCES maquinas(id) ON DELETE SET NULL
     """),

    ("Producto: Índice en maquina_impresora_id",
     "CREATE INDEX IF NOT EXISTS ix_cliente_productos_maquina_impresora_id ON cliente_productos (maquina_impresora_id)"),
]


# ──────────────────────────────────────────────────────────────────────────────
# Expansión — Tablas transversales (auditoría y notificaciones)
# ──────────────────────────────────────────────────────────────────────────────

MIGRATIONS_EXPANSION_BASE = [

    ("Expansión: Crear tabla audit_log",
     """
     CREATE TABLE IF NOT EXISTS audit_log (
         id          SERIAL PRIMARY KEY,
         user_id     INTEGER,
         user_email  VARCHAR(255),
         accion      VARCHAR(20),
         entidad     VARCHAR(50),
         entidad_id  INTEGER,
         descripcion VARCHAR(300),
         datos       JSONB,
         created_at  TIMESTAMPTZ DEFAULT NOW()
     );
     CREATE INDEX IF NOT EXISTS ix_audit_log_entidad_entidad_id ON audit_log (entidad, entidad_id);
     CREATE INDEX IF NOT EXISTS ix_audit_log_created_at         ON audit_log (created_at);
     CREATE INDEX IF NOT EXISTS ix_audit_log_user_id            ON audit_log (user_id);
     """),

    ("Expansión: Crear tabla notificaciones",
     """
     CREATE TABLE IF NOT EXISTS notificaciones (
         id         SERIAL PRIMARY KEY,
         user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         tipo       VARCHAR(30),
         titulo     VARCHAR(200),
         mensaje    TEXT,
         link       VARCHAR(300),
         leida      BOOLEAN DEFAULT FALSE,
         created_at TIMESTAMPTZ DEFAULT NOW()
     );
     CREATE INDEX IF NOT EXISTS ix_notificaciones_user_id_leida ON notificaciones (user_id, leida);
     """),
]


# ──────────────────────────────────────────────────────────────────────────────
# Expansión — Módulos (presupuestos, stock, remitos, planificación, calidad)
# Orden de FKs: remitos ANTES que stock_movimientos (remito_id).
# ──────────────────────────────────────────────────────────────────────────────

MIGRATIONS_EXPANSION_MODULOS = [

    ("Expansión: Crear tabla presupuestos",
     """
     CREATE TABLE IF NOT EXISTS presupuestos (
         id                   SERIAL PRIMARY KEY,
         numero               VARCHAR(20) UNIQUE,
         cliente_id           INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
         prospecto_nombre     VARCHAR(200),
         fecha                DATE,
         validez_dias         INTEGER DEFAULT 30,
         estado               VARCHAR(20) DEFAULT 'borrador',
         moneda               VARCHAR(10) DEFAULT 'ARS',
         condiciones_pago     VARCHAR(200),
         subtotal             NUMERIC(14, 2),
         descuento_porcentaje NUMERIC(5, 2) DEFAULT 0,
         iva_porcentaje       NUMERIC(5, 2) DEFAULT 21,
         total                NUMERIC(14, 2),
         observaciones        TEXT,
         orden_trabajo_id     INTEGER REFERENCES ordenes_trabajo(id) ON DELETE SET NULL,
         created_by           INTEGER REFERENCES users(id) ON DELETE SET NULL,
         created_at           TIMESTAMPTZ DEFAULT NOW(),
         updated_at           TIMESTAMPTZ DEFAULT NOW()
     );
     CREATE INDEX IF NOT EXISTS ix_presupuestos_numero     ON presupuestos (numero);
     CREATE INDEX IF NOT EXISTS ix_presupuestos_estado     ON presupuestos (estado);
     CREATE INDEX IF NOT EXISTS ix_presupuestos_cliente_id ON presupuestos (cliente_id);
     """),

    ("Expansión: Crear tabla presupuesto_items",
     """
     CREATE TABLE IF NOT EXISTS presupuesto_items (
         id                  SERIAL PRIMARY KEY,
         presupuesto_id      INTEGER NOT NULL REFERENCES presupuestos(id) ON DELETE CASCADE,
         cliente_producto_id INTEGER REFERENCES cliente_productos(id) ON DELETE SET NULL,
         descripcion         VARCHAR(300),
         cantidad            NUMERIC(12, 2),
         unidad              VARCHAR(20),
         precio_unitario     NUMERIC(14, 4),
         subtotal            NUMERIC(14, 2)
     );
     CREATE INDEX IF NOT EXISTS ix_presupuesto_items_presupuesto_id ON presupuesto_items (presupuesto_id);
     """),

    ("Expansión: Crear tabla stock_items",
     """
     CREATE TABLE IF NOT EXISTS stock_items (
         id                  SERIAL PRIMARY KEY,
         codigo              VARCHAR(50) UNIQUE,
         nombre              VARCHAR(200) NOT NULL,
         tipo                VARCHAR(30) NOT NULL,
         categoria           VARCHAR(100),
         unidad              VARCHAR(20) DEFAULT 'kg',
         stock_actual        NUMERIC(14, 3) DEFAULT 0,
         stock_minimo        NUMERIC(14, 3) DEFAULT 0,
         cliente_id          INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
         cliente_producto_id INTEGER REFERENCES cliente_productos(id) ON DELETE SET NULL,
         activo              BOOLEAN DEFAULT TRUE,
         created_at          TIMESTAMPTZ DEFAULT NOW(),
         updated_at          TIMESTAMPTZ DEFAULT NOW()
     );
     CREATE INDEX IF NOT EXISTS ix_stock_items_codigo     ON stock_items (codigo);
     CREATE INDEX IF NOT EXISTS ix_stock_items_tipo       ON stock_items (tipo);
     CREATE INDEX IF NOT EXISTS ix_stock_items_cliente_id ON stock_items (cliente_id);
     """),

    ("Expansión: Crear tabla remitos",
     """
     CREATE TABLE IF NOT EXISTS remitos (
         id                SERIAL PRIMARY KEY,
         numero            VARCHAR(20) UNIQUE,
         cliente_id        INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
         fecha             DATE,
         estado            VARCHAR(20) DEFAULT 'pendiente',
         transporte        VARCHAR(200),
         domicilio_entrega VARCHAR(300),
         observaciones     TEXT,
         created_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
         created_at        TIMESTAMPTZ DEFAULT NOW(),
         updated_at        TIMESTAMPTZ DEFAULT NOW()
     );
     CREATE INDEX IF NOT EXISTS ix_remitos_numero     ON remitos (numero);
     CREATE INDEX IF NOT EXISTS ix_remitos_estado     ON remitos (estado);
     CREATE INDEX IF NOT EXISTS ix_remitos_cliente_id ON remitos (cliente_id);
     """),

    ("Expansión: Crear tabla remito_items",
     """
     CREATE TABLE IF NOT EXISTS remito_items (
         id               SERIAL PRIMARY KEY,
         remito_id        INTEGER NOT NULL REFERENCES remitos(id) ON DELETE CASCADE,
         orden_trabajo_id INTEGER REFERENCES ordenes_trabajo(id) ON DELETE SET NULL,
         descripcion      VARCHAR(300),
         cantidad         NUMERIC(14, 2),
         unidad           VARCHAR(20),
         lote             VARCHAR(50)
     );
     CREATE INDEX IF NOT EXISTS ix_remito_items_remito_id        ON remito_items (remito_id);
     CREATE INDEX IF NOT EXISTS ix_remito_items_orden_trabajo_id ON remito_items (orden_trabajo_id);
     CREATE INDEX IF NOT EXISTS ix_remito_items_lote             ON remito_items (lote);
     """),

    ("Expansión: Crear tabla stock_movimientos",
     """
     CREATE TABLE IF NOT EXISTS stock_movimientos (
         id               SERIAL PRIMARY KEY,
         stock_item_id    INTEGER NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
         tipo             VARCHAR(20),
         cantidad         NUMERIC(14, 3),
         motivo           VARCHAR(50),
         stock_anterior   NUMERIC(14, 3),
         stock_resultante NUMERIC(14, 3),
         orden_trabajo_id INTEGER REFERENCES ordenes_trabajo(id) ON DELETE SET NULL,
         remito_id        INTEGER REFERENCES remitos(id) ON DELETE SET NULL,
         lote             VARCHAR(50),
         observaciones    TEXT,
         user_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
         created_at       TIMESTAMPTZ DEFAULT NOW()
     );
     CREATE INDEX IF NOT EXISTS ix_stock_movimientos_stock_item_id ON stock_movimientos (stock_item_id);
     CREATE INDEX IF NOT EXISTS ix_stock_movimientos_created_at    ON stock_movimientos (created_at);
     """),

    ("Expansión: Crear tabla plan_produccion",
     """
     CREATE TABLE IF NOT EXISTS plan_produccion (
         id               SERIAL PRIMARY KEY,
         orden_trabajo_id INTEGER NOT NULL REFERENCES ordenes_trabajo(id) ON DELETE CASCADE,
         maquina_id       INTEGER NOT NULL REFERENCES maquinas(id) ON DELETE CASCADE,
         etapa            VARCHAR(20),
         fecha_inicio     DATE,
         fecha_fin        DATE,
         orden_prioridad  INTEGER DEFAULT 0,
         estado           VARCHAR(20) DEFAULT 'planificada',
         notas            TEXT,
         created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
         created_at       TIMESTAMPTZ DEFAULT NOW(),
         updated_at       TIMESTAMPTZ DEFAULT NOW()
     );
     CREATE INDEX IF NOT EXISTS ix_plan_produccion_orden_trabajo_id ON plan_produccion (orden_trabajo_id);
     CREATE INDEX IF NOT EXISTS ix_plan_produccion_maquina_id       ON plan_produccion (maquina_id);
     CREATE INDEX IF NOT EXISTS ix_plan_produccion_fecha_inicio     ON plan_produccion (fecha_inicio);
     """),

    ("Expansión: Crear tabla qc_plantillas",
     """
     CREATE TABLE IF NOT EXISTS qc_plantillas (
         id         SERIAL PRIMARY KEY,
         etapa      VARCHAR(20),
         nombre     VARCHAR(200),
         activa     BOOLEAN DEFAULT TRUE,
         created_at TIMESTAMPTZ DEFAULT NOW()
     );
     CREATE INDEX IF NOT EXISTS ix_qc_plantillas_etapa ON qc_plantillas (etapa);
     """),

    ("Expansión: Crear tabla qc_plantilla_items",
     """
     CREATE TABLE IF NOT EXISTS qc_plantilla_items (
         id           SERIAL PRIMARY KEY,
         plantilla_id INTEGER NOT NULL REFERENCES qc_plantillas(id) ON DELETE CASCADE,
         descripcion  VARCHAR(300),
         orden        INTEGER
     );
     CREATE INDEX IF NOT EXISTS ix_qc_plantilla_items_plantilla_id ON qc_plantilla_items (plantilla_id);
     """),

    ("Expansión: Crear tabla qc_registros",
     """
     CREATE TABLE IF NOT EXISTS qc_registros (
         id               SERIAL PRIMARY KEY,
         orden_trabajo_id INTEGER NOT NULL REFERENCES ordenes_trabajo(id) ON DELETE CASCADE,
         etapa            VARCHAR(20),
         plantilla_id     INTEGER REFERENCES qc_plantillas(id) ON DELETE SET NULL,
         user_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
         resultado        VARCHAR(20),
         observaciones    TEXT,
         created_at       TIMESTAMPTZ DEFAULT NOW()
     );
     CREATE INDEX IF NOT EXISTS ix_qc_registros_orden_trabajo_id ON qc_registros (orden_trabajo_id);
     """),

    ("Expansión: Crear tabla qc_registro_items",
     """
     CREATE TABLE IF NOT EXISTS qc_registro_items (
         id               SERIAL PRIMARY KEY,
         registro_id      INTEGER NOT NULL REFERENCES qc_registros(id) ON DELETE CASCADE,
         item_descripcion VARCHAR(300),
         cumple           BOOLEAN,
         valor            VARCHAR(100),
         observacion      VARCHAR(300)
     );
     CREATE INDEX IF NOT EXISTS ix_qc_registro_items_registro_id ON qc_registro_items (registro_id);
     """),
]


# ──────────────────────────────────────────────────────────────────────────────
# Expansión — Trazabilidad en órdenes de trabajo
# ──────────────────────────────────────────────────────────────────────────────

MIGRATIONS_EXPANSION_OT = [

    ("Expansión: Agregar lote a ordenes_trabajo",
     """
     ALTER TABLE ordenes_trabajo ADD COLUMN IF NOT EXISTS lote VARCHAR(50);
     CREATE INDEX IF NOT EXISTS ix_ordenes_trabajo_lote ON ordenes_trabajo (lote);
     """),

    ("Expansión: Agregar numero_lote a orden_extrusion_bobinas",
     "ALTER TABLE orden_extrusion_bobinas ADD COLUMN IF NOT EXISTS numero_lote VARCHAR(50)"),
]


# ──────────────────────────────────────────────────────────────────────────────
# Expansión — Seeds idempotentes (plantillas QC + parque de máquinas)
# ──────────────────────────────────────────────────────────────────────────────

MIGRATIONS_EXPANSION_SEEDS = [

    ("Seed: Plantilla QC de extrusión",
     """
     DO $$
     DECLARE pid INT;
     BEGIN
         IF NOT EXISTS (SELECT 1 FROM qc_plantillas WHERE etapa = 'extrusion') THEN
             INSERT INTO qc_plantillas (etapa, nombre, activa)
             VALUES ('extrusion', 'Control de extrusión estándar', TRUE)
             RETURNING id INTO pid;
             INSERT INTO qc_plantilla_items (plantilla_id, descripcion, orden) VALUES
                 (pid, 'Espesor uniforme según especificación', 1),
                 (pid, 'Ancho de bobina según especificación', 2),
                 (pid, 'Tratamiento corona correcto', 3),
                 (pid, 'Sin gels, agujeros ni impurezas', 4),
                 (pid, 'Color según muestra aprobada', 5);
         END IF;
     END $$;
     """),

    ("Seed: Plantilla QC de impresión",
     """
     DO $$
     DECLARE pid INT;
     BEGIN
         IF NOT EXISTS (SELECT 1 FROM qc_plantillas WHERE etapa = 'impresion') THEN
             INSERT INTO qc_plantillas (etapa, nombre, activa)
             VALUES ('impresion', 'Control de impresión estándar', TRUE)
             RETURNING id INTO pid;
             INSERT INTO qc_plantilla_items (plantilla_id, descripcion, orden) VALUES
                 (pid, 'Registro de colores correcto', 1),
                 (pid, 'Tonos según pantone / muestra aprobada', 2),
                 (pid, 'Sin manchas ni defectos de impresión', 3),
                 (pid, 'Texto legible y completo', 4),
                 (pid, 'Adhesión de tinta correcta', 5);
         END IF;
     END $$;
     """),

    ("Seed: Plantilla QC de troquelado",
     """
     DO $$
     DECLARE pid INT;
     BEGIN
         IF NOT EXISTS (SELECT 1 FROM qc_plantillas WHERE etapa = 'troquelado') THEN
             INSERT INTO qc_plantillas (etapa, nombre, activa)
             VALUES ('troquelado', 'Control de troquelado estándar', TRUE)
             RETURNING id INTO pid;
             INSERT INTO qc_plantilla_items (plantilla_id, descripcion, orden) VALUES
                 (pid, 'Medidas alto/ancho según especificación', 1),
                 (pid, 'Corte limpio sin rebabas', 2),
                 (pid, 'Cierre correcto', 3),
                 (pid, 'Cantidad según orden', 4);
         END IF;
     END $$;
     """),

    # Impresoras flexo: solo se insertan si NO hay ya impresoras cargadas
    # (en prod ya existen con otros nombres/códigos — no duplicar el parque).
    ("Seed: Máquina Impresora Flexo 1 (IMP-01)",
     """
     INSERT INTO maquinas (codigo, nombre, tipo, activa)
     SELECT 'IMP-01', 'Impresora Flexo 1', 'impresion', TRUE
     WHERE NOT EXISTS (SELECT 1 FROM maquinas WHERE codigo = 'IMP-01')
       AND NOT EXISTS (SELECT 1 FROM maquinas WHERE tipo = 'impresion' AND codigo NOT IN ('IMP-AUTO'));
     """),

    ("Seed: Máquina Impresora Flexo 2 (IMP-02)",
     """
     INSERT INTO maquinas (codigo, nombre, tipo, activa)
     SELECT 'IMP-02', 'Impresora Flexo 2', 'impresion', TRUE
     WHERE NOT EXISTS (SELECT 1 FROM maquinas WHERE codigo = 'IMP-02')
       AND NOT EXISTS (SELECT 1 FROM maquinas WHERE tipo = 'impresion' AND codigo NOT IN ('IMP-01', 'IMP-AUTO'));
     """),

    ("Seed: Máquina Impresora Autoadhesiva (IMP-AUTO)",
     """
     INSERT INTO maquinas (codigo, nombre, tipo, activa)
     SELECT 'IMP-AUTO', 'Impresora Autoadhesiva', 'impresion', TRUE
     WHERE NOT EXISTS (
         SELECT 1 FROM maquinas
         WHERE codigo = 'IMP-AUTO' OR LOWER(nombre) LIKE '%autoadhesiva%'
     );
     """),

    ("Seed: Máquina Troqueladora 1 (TRO-01)",
     """
     INSERT INTO maquinas (codigo, nombre, tipo, activa)
     SELECT 'TRO-01', 'Troqueladora 1', 'troquelado', TRUE
     WHERE NOT EXISTS (
         SELECT 1 FROM maquinas
         WHERE codigo = 'TRO-01' OR LOWER(TRIM(nombre)) = 'troqueladora 1'
     );
     """),

    ("Seed: Máquina Troqueladora 2 (TRO-02)",
     """
     INSERT INTO maquinas (codigo, nombre, tipo, activa)
     SELECT 'TRO-02', 'Troqueladora 2', 'troquelado', TRUE
     WHERE NOT EXISTS (
         SELECT 1 FROM maquinas
         WHERE codigo = 'TRO-02' OR LOWER(TRIM(nombre)) = 'troqueladora 2'
     );
     """),

    ("Seed: Máquina Troqueladora 3 (TRO-03)",
     """
     INSERT INTO maquinas (codigo, nombre, tipo, activa)
     SELECT 'TRO-03', 'Troqueladora 3', 'troquelado', TRUE
     WHERE NOT EXISTS (
         SELECT 1 FROM maquinas
         WHERE codigo = 'TRO-03' OR LOWER(TRIM(nombre)) = 'troqueladora 3'
     );
     """),
]


# ──────────────────────────────────────────────────────────────────────────────
# Resincronización de secuencias
# Tras un import masivo con IDs explícitos, la secuencia SERIAL queda por detrás
# del MAX(id) y el próximo INSERT choca con la PK (duplicate key / 500). Este
# setval la reajusta. Es idempotente: correrlo de nuevo deja el mismo valor.
# ──────────────────────────────────────────────────────────────────────────────

MIGRATIONS_SEQ_RESYNC = [
    ("Resincronizar secuencias de id (users, clientes, razones_sociales)",
     """
     DO $$
     DECLARE
         tbl text;
         seq text;
     BEGIN
         FOREACH tbl IN ARRAY ARRAY['users', 'clientes', 'razones_sociales'] LOOP
             seq := pg_get_serial_sequence(tbl, 'id');
             IF seq IS NOT NULL THEN
                 EXECUTE format(
                     'SELECT setval(%L, COALESCE((SELECT MAX(id) FROM %I), 1), true)',
                     seq, tbl
                 );
             END IF;
         END LOOP;
     END $$;
     """),
]


# ──────────────────────────────────────────────────────────────────────────────
# Runner principal
# ──────────────────────────────────────────────────────────────────────────────

def _ensure_tracking_table(conn):
    """Tabla de control de migraciones ya aplicadas (para saltearlas en re-runs)."""
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            nombre      TEXT PRIMARY KEY,
            aplicada_at TIMESTAMPTZ DEFAULT now()
        )
    """))
    conn.commit()


def run_migrations():
    print("=" * 52)
    print("   ETIPLAST ERP — Migraciones de base de datos")
    print("=" * 52)

    db_url  = os.getenv("DATABASE_URL", "(no configurada)")
    db_host = "Railway (PRODUCCIÓN)" if "railway" in db_url.lower() else "local"
    print(f"\n  Conectando a: {db_host}...\n")

    # Crear tablas nuevas si no existen (modelos actuales). Defensivo: un fallo acá
    # tampoco debe impedir el arranque.
    print("Verificando esquema...")
    try:
        Base.metadata.create_all(bind=engine)
        print("  ✓ Esquema verificado\n")
    except Exception as e:
        print(f"  ✗ create_all falló (se continúa): {e}\n")

    all_migrations = MIGRATIONS_LEGACY + MIGRATIONS_NORMALIZACION + MIGRATIONS_RAZONES_SOCIALES + MIGRATIONS_ORDENES + MIGRATIONS_SPLIT_MARCAS + MIGRATIONS_DEDUP_RAZONES + MIGRATIONS_RESPONSABLE + MIGRATIONS_V2 + MIGRATIONS_ENVASES + MIGRATIONS_RS_NUMERO + MIGRATIONS_FUZZY + MIGRATIONS_MAQUINA_PRODUCTO + MIGRATIONS_EXPANSION_BASE + MIGRATIONS_EXPANSION_MODULOS + MIGRATIONS_EXPANSION_OT + MIGRATIONS_EXPANSION_SEEDS + MIGRATIONS_SEQ_RESYNC

    aplicadas = 0
    salteadas = 0
    fallidas  = 0

    with engine.connect() as conn:
        # Tracking: saltear las migraciones ya aplicadas → re-runs = no-op real.
        try:
            _ensure_tracking_table(conn)
            ya_aplicadas = {
                r[0] for r in conn.execute(text("SELECT nombre FROM schema_migrations")).fetchall()
            }
        except Exception as e:
            print(f"  ⚠  No se pudo leer schema_migrations (se intentarán todas): {e}")
            ya_aplicadas = set()

        for name, sql in all_migrations:
            if name in ya_aplicadas:
                salteadas += 1
                continue
            try:
                conn.execute(text(sql))
                conn.execute(
                    text("INSERT INTO schema_migrations (nombre) VALUES (:n) ON CONFLICT (nombre) DO NOTHING"),
                    {"n": name},
                )
                conn.commit()
                ya_aplicadas.add(name)
                aplicadas += 1
                print(f"  ✓ {name}")
            except Exception as e:
                # NO se relanza: un fallo de migración NO debe tumbar el arranque.
                conn.rollback()
                fallidas += 1
                print(f"  ✗ {name}: {e}")
                print("     ↳ se omite y se continúa")

    print(f"\nMigraciones: {aplicadas} aplicadas, {salteadas} ya estaban, {fallidas} con error.")
    print("=" * 52)


if __name__ == "__main__":
    # El arranque nunca debe caerse por migraciones (Procfile: migrate && uvicorn).
    # Los errores por migración ya se capturan y omiten dentro de run_migrations();
    # este try extra cubre fallos de conexión para que uvicorn igual levante.
    try:
        run_migrations()
    except Exception as e:
        print(f"\n⚠  Error no fatal en migraciones (se continúa para no bloquear el arranque): {e}")
    sys.exit(0)
