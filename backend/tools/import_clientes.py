"""
Importa clientes desde el Excel "NUEVO Datos Clientes.xlsx"
Fuentes:
  - "Copia de ALFABET 1"  → datos de cliente + productos (1 fila por producto)
  - "DATOS CLIENTES"      → rubro y observaciones por cliente

⚠️  NOTA — DUPLICADO. El importador CANÓNICO es `backend/import_clientes.py`.
    Esta variante lee además la hoja "DATOS CLIENTES" (rubro + observaciones) y
    usa TRUNCATE ... CASCADE, que BORRA también `ordenes_trabajo`. Se mantiene
    porque la lógica de rubros/observaciones aún no está en el canónico; no
    borrar este archivo sin migrar esa lógica primero.

⚠️  DESTRUCTIVO: borra clientes y órdenes de trabajo. Los usuarios NO se tocan.

USO:
  cd backend
  source venv/bin/activate
  python tools/import_clientes.py          # pide confirmación
  python tools/import_clientes.py --yes    # saltea la confirmación (scripts/CI)
"""

import sys
import os
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from database import SessionLocal
from models import (
    Cliente, ClienteUbicacion, ClienteContacto,
    ClienteProducto, RazonSocial, Rubro, Provincia
)
from sqlalchemy import text

EXCEL_PATH = "/Users/tomasaparicio/Downloads/NUEVO Datos Clientes.xlsx"
COL_ID = "N° Cliente "   # ← tiene trailing space en el Excel


# ─── helpers ──────────────────────────────────────────────────────────────────

def s(val):
    """String limpio o None."""
    if val is None:
        return None
    if hasattr(val, 'strftime'):        # datetime → None (error de carga)
        return None
    v = str(val).strip()
    return v if v and v.lower() not in ('nan', 'none') else None


def n(val):
    """Numeric o None."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


# ─── main ─────────────────────────────────────────────────────────────────────

def _confirmar_borrado():
    """Confirmación explícita antes del TRUNCATE destructivo. `--yes` la saltea."""
    if "--yes" in sys.argv or "-y" in sys.argv:
        return
    print("\n⚠️  Esto BORRARÁ (TRUNCATE) clientes Y órdenes de trabajo.")
    resp = input("    Escribí 'BORRAR' para confirmar: ").strip()
    if resp != "BORRAR":
        print("Cancelado — no se tocó la base de datos.")
        sys.exit(0)


def run():
    print("=" * 60)
    print("  ETIPLAST — Importación de clientes desde Excel")
    print("=" * 60)

    _confirmar_borrado()

    # 1. Leer Excel
    print("\nLeyendo Excel...")
    alfabet = pd.read_excel(EXCEL_PATH, sheet_name="Copia de ALFABET 1", dtype=str)
    datos   = pd.read_excel(EXCEL_PATH, sheet_name="DATOS CLIENTES",     dtype=str)

    # 2. Filtrar filas válidas (N° Cliente numérico)
    alfabet[COL_ID] = pd.to_numeric(alfabet[COL_ID], errors="coerce")
    alfabet = alfabet[alfabet[COL_ID].notna()].copy()
    alfabet[COL_ID] = alfabet[COL_ID].astype(int)

    datos[COL_ID] = pd.to_numeric(datos[COL_ID], errors="coerce")
    datos = datos[datos[COL_ID].notna()].copy()
    datos[COL_ID] = datos[COL_ID].astype(int)

    print(f"  ALFABET: {len(alfabet)} filas válidas")
    print(f"  DATOS CLIENTES: {len(datos)} filas válidas")

    # 3. Mapas auxiliares desde DATOS CLIENTES (1 fila por cliente, primera aparición)
    datos_first = datos.drop_duplicates(subset=[COL_ID], keep="first").set_index(COL_ID)
    rubro_map = datos_first["Rubro"].to_dict()        if "Rubro"        in datos_first else {}
    obs_map   = datos_first["Observaciones"].to_dict() if "Observaciones" in datos_first else {}

    # 4. Conectar a DB
    db = SessionLocal()
    try:
        # 5. Limpiar tablas de clientes (CASCADE borra también ordenes_trabajo)
        print("\nLimpiando tablas existentes...")
        db.execute(text("TRUNCATE TABLE ordenes_trabajo     RESTART IDENTITY CASCADE"))
        db.execute(text("TRUNCATE TABLE cliente_productos   RESTART IDENTITY CASCADE"))
        db.execute(text("TRUNCATE TABLE cliente_contactos   RESTART IDENTITY CASCADE"))
        db.execute(text("TRUNCATE TABLE cliente_ubicaciones RESTART IDENTITY CASCADE"))
        db.execute(text("TRUNCATE TABLE clientes            RESTART IDENTITY CASCADE"))
        db.execute(text("TRUNCATE TABLE razones_sociales    RESTART IDENTITY CASCADE"))
        db.execute(text("TRUNCATE TABLE rubros              RESTART IDENTITY CASCADE"))
        db.execute(text("TRUNCATE TABLE provincias          RESTART IDENTITY CASCADE"))
        db.commit()
        print("  ✓ Tablas limpias")

        # 6. Importar
        rubros_cache    = {}   # nombre → id
        provincias_cache = {}  # nombre → id
        razones_cache   = {}   # (razon_social, cuit) → id

        clientes_ok  = 0
        productos_ok = 0
        errores      = []

        grupos = alfabet.groupby(COL_ID)
        total  = len(grupos)

        for idx, (n_cliente, grupo) in enumerate(grupos, 1):
            try:
                primera = grupo.iloc[0]

                # ── Rubro ──────────────────────────────────────────────
                rubro_id = None
                rubro_nombre = s(rubro_map.get(n_cliente))
                if rubro_nombre:
                    if rubro_nombre not in rubros_cache:
                        r = Rubro(nombre=rubro_nombre)
                        db.add(r); db.flush()
                        rubros_cache[rubro_nombre] = r.id
                    rubro_id = rubros_cache[rubro_nombre]

                # ── Provincia ──────────────────────────────────────────
                provincia_id = None
                prov_nombre = s(primera.get("Provincia"))
                if prov_nombre:
                    if prov_nombre not in provincias_cache:
                        p = Provincia(nombre=prov_nombre)
                        db.add(p); db.flush()
                        provincias_cache[prov_nombre] = p.id
                    provincia_id = provincias_cache[prov_nombre]

                # ── Razón Social ───────────────────────────────────────
                razon_social_id = None
                rs_nombre = s(primera.get("Razon Social"))
                rs_cuit   = s(primera.get("CUIT"))
                if rs_nombre:
                    key = (rs_nombre, rs_cuit)
                    if key not in razones_cache:
                        rs = RazonSocial(razon_social=rs_nombre, cuit=rs_cuit)
                        db.add(rs); db.flush()
                        razones_cache[key] = rs.id
                    razon_social_id = razones_cache[key]

                # ── Cliente ────────────────────────────────────────────
                marca = s(primera.get("Marca"))
                cliente = Cliente(
                    id_cliente      = n_cliente,
                    marca           = marca,
                    razon_social    = rs_nombre,
                    cuit            = rs_cuit,
                    razon_social_id = razon_social_id,
                    rubro_id        = rubro_id,
                )
                db.add(cliente); db.flush()

                # ── Ubicación ──────────────────────────────────────────
                transporte = s(primera.get("Transporte"))
                ubicacion = ClienteUbicacion(
                    cliente_id   = cliente.id,
                    domicilio    = s(primera.get("Domicilio")),
                    localidad    = s(primera.get("Localidad")),
                    provincia_id = provincia_id,
                    pais         = s(primera.get("País")) or "Argentina",
                    transporte   = transporte,
                )
                db.add(ubicacion)

                # ── Contacto ───────────────────────────────────────────
                telefono = s(primera.get("Telefono"))
                obs      = s(obs_map.get(n_cliente))
                if telefono or obs:
                    db.add(ClienteContacto(
                        cliente_id    = cliente.id,
                        telefono      = telefono,
                        observaciones = obs,
                    ))

                # ── Productos (1 fila por producto) ────────────────────
                for _, fila in grupo.iterrows():
                    nombre_prod = s(fila.get("Producto"))
                    if not nombre_prod:
                        continue
                    db.add(ClienteProducto(
                        cliente_id = cliente.id,
                        nombre     = nombre_prod,
                        envase     = s(fila.get("Tipo de Envase")),
                        lamina     = s(fila.get("Lamina")),
                        muestra    = s(fila.get("Muestra")),
                        alto       = n(fila.get("Alto")),
                        cilindro   = n(fila.get("Cilindro")),
                        cierre     = n(fila.get("Cierre")),
                    ))
                    productos_ok += 1

                clientes_ok += 1

                # Commit cada 50 clientes para no acumular demasiado en memoria
                if idx % 50 == 0:
                    db.commit()
                    print(f"  {idx}/{total} clientes procesados...")

            except Exception as e:
                errores.append(f"Cliente {n_cliente}: {e}")

        db.commit()

        # 7. Resumen
        print("\n" + "=" * 60)
        print("  ✓ Importación completada")
        print(f"  Clientes importados : {clientes_ok}")
        print(f"  Productos importados: {productos_ok}")
        print(f"  Rubros              : {len(rubros_cache)}")
        print(f"  Provincias          : {len(provincias_cache)}")
        print(f"  Razones sociales    : {len(razones_cache)}")
        if errores:
            print(f"\n  ⚠ {len(errores)} errores:")
            for e in errores[:10]:
                print(f"    - {e}")
        print("=" * 60)

    except Exception as e:
        db.rollback()
        print(f"\n✗ Error fatal: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run()
