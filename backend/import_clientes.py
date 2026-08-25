"""
Importación desde Excel — Etiplast ERP
========================================
Sheet: "Copia de ALFABET 1"
Archivo: /Users/tomasaparicio/Downloads/Copia de NUEVO Datos Clientes.xlsx

Uso:
    python import_clientes.py            → local (pide confirmación)
    python import_clientes.py --prod     → Railway (requiere .env.prod)
    python import_clientes.py --yes      → saltea la confirmación (scripts/CI)

⚠️  BORRA todos los datos de clientes ANTES de importar.
⚠️  TAMBIÉN BORRA todas las órdenes de trabajo (tabla ordenes_trabajo), porque
    tienen FK a clientes. Los USUARIOS NO se tocan.

Importador CANÓNICO. Existe un duplicado en `tools/import_clientes.py` (variante
que además lee la hoja "DATOS CLIENTES" para rubro/observaciones y usa
TRUNCATE ... CASCADE). Ver la nota al inicio de ese archivo.
"""

import os
import sys
import re
import pandas as pd
from decimal import Decimal, InvalidOperation

# ── Cargar entorno ─────────────────────────────────────────────────────────────
_here = os.path.dirname(os.path.abspath(__file__))
_prod = "--prod" in sys.argv

if _prod:
    _env_file = os.path.join(_here, ".env.prod")
    if not os.path.exists(_env_file):
        print("❌  No existe backend/.env.prod")
        sys.exit(1)
    from dotenv import load_dotenv
    load_dotenv(_env_file, override=True)
    print("🚀  Modo PRODUCCIÓN — Railway")
else:
    print("💻  Modo LOCAL")

from sqlalchemy import text
from database import engine, SessionLocal
from models import (
    Base, Cliente, ClienteUbicacion, ClienteContacto,
    ClienteProducto, RazonSocial, Rubro, Provincia, Envase,
)

# ── Config ─────────────────────────────────────────────────────────────────────
EXCEL_PATH = "/Users/tomasaparicio/Downloads/Copia de NUEVO Datos Clientes.xlsx"
SHEET_NAME = "Copia de ALFABET 1"

# Normalización de provincias (variantes sin tilde → con tilde)
PROV_NORM = {
    "Entre Rios":        "Entre Ríos",
    "Rio Negro":         "Río Negro",
    "Tucuman":           "Tucumán",
    "Neuquen":           "Neuquén",
    "Cordoba":           "Córdoba",
    "Buenos Aires Gba":  "Buenos Aires",
}


# ── Helpers ────────────────────────────────────────────────────────────────────

def clean(val) -> str | None:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    s = str(val).strip()
    return s if s else None


def parse_num(val) -> Decimal | None:
    s = clean(val)
    if not s:
        return None
    # Tomar primer número: "25,1/24,9" → "25.1", "9,75 (int)" → "9.75"
    s = s.replace(",", ".")
    m = re.search(r"[\d]+\.?[\d]*", s)
    if not m:
        return None
    try:
        return Decimal(m.group())
    except InvalidOperation:
        return None


def norm_provincia(val) -> str | None:
    s = clean(val)
    if not s:
        return None
    return PROV_NORM.get(s, s)


def _confirmar_borrado():
    """Confirmación explícita antes de un borrado destructivo. `--yes` la saltea."""
    if "--yes" in sys.argv or "-y" in sys.argv:
        return
    destino = "PRODUCCIÓN (Railway)" if _prod else "local"
    print(f"\n⚠️  Esto BORRARÁ clientes Y órdenes de trabajo en la base {destino}.")
    resp = input("    Escribí 'BORRAR' para confirmar: ").strip()
    if resp != "BORRAR":
        print("Cancelado — no se tocó la base de datos.")
        sys.exit(0)


def is_valid_row(row) -> bool:
    """Filtra filas que son separadores de sección (letras A, B, ...) o vacías."""
    n = row.get("N° Cliente")
    if n is None or (isinstance(n, float) and pd.isna(n)):
        return False
    try:
        int(float(n))
        return True
    except (ValueError, TypeError):
        return False


# ── Borrar datos de clientes ───────────────────────────────────────────────────

def borrar_datos(db):
    print("\n⚠️  Borrando datos de clientes...")
    # Orden respetando FKs
    db.execute(text("DELETE FROM cliente_productos"))
    db.execute(text("DELETE FROM cliente_contactos"))
    db.execute(text("DELETE FROM cliente_ubicaciones"))
    db.execute(text("DELETE FROM ordenes_trabajo"))   # FK → clientes
    db.execute(text("DELETE FROM clientes"))
    db.execute(text("DELETE FROM razones_sociales"))
    db.execute(text("DELETE FROM rubros"))
    db.execute(text("DELETE FROM provincias"))
    db.execute(text("DELETE FROM envases"))
    db.commit()
    print("  ✓ Datos borrados")


# ── Importar ───────────────────────────────────────────────────────────────────

def importar():
    print(f"\nLeyendo {SHEET_NAME}...")
    df = pd.read_excel(EXCEL_PATH, sheet_name=SHEET_NAME, dtype=str)
    df = df.rename(columns=lambda c: c.strip())

    # Filtrar filas válidas
    rows = [row for _, row in df.iterrows() if is_valid_row(row.to_dict())]
    print(f"  {len(rows)} filas válidas de {len(df)} totales")

    _confirmar_borrado()

    db = SessionLocal()
    try:
        borrar_datos(db)

        # ── 1. Catálogos ───────────────────────────────────────────────────────

        print("\nCreando catálogos...")

        # Provincias
        prov_nombres = set()
        for r in rows:
            p = norm_provincia(r.get("Provincia"))
            if p:
                prov_nombres.add(p)
        prov_map: dict[str, int] = {}
        for nombre in sorted(prov_nombres):
            p = Provincia(nombre=nombre)
            db.add(p)
            db.flush()
            prov_map[nombre] = p.id
        print(f"  ✓ {len(prov_map)} provincias")

        # Envases (de la columna "Tipo de Envase")
        envase_nombres = set()
        for r in rows:
            e = clean(r.get("Tipo de Envase"))
            if e and e not in ("?", "CONSULTAR"):
                envase_nombres.add(e)
        envase_map: dict[str, int] = {}
        for nombre in sorted(envase_nombres):
            e = Envase(nombre=nombre)
            db.add(e)
            db.flush()
            envase_map[nombre] = e.id
        print(f"  ✓ {len(envase_map)} envases")

        db.commit()

        # ── 2. Razones Sociales ────────────────────────────────────────────────

        print("\nCreando razones sociales...")
        # Agrupar por nombre de RS; usar el primer N° Cliente como numero
        rs_data: dict[str, dict] = {}   # razon_social_nombre → {numero, cuit}
        for r in rows:
            rs_nombre = clean(r.get("Razon Social"))
            if not rs_nombre:
                continue
            n_cliente = int(float(r["N° Cliente"]))
            cuit = clean(r.get("CUIT"))
            if rs_nombre not in rs_data:
                rs_data[rs_nombre] = {"numero": n_cliente, "cuit": cuit}
            else:
                # Conservar el número más bajo y el cuit si no lo tenemos
                if n_cliente < rs_data[rs_nombre]["numero"]:
                    rs_data[rs_nombre]["numero"] = n_cliente
                if not rs_data[rs_nombre]["cuit"] and cuit:
                    rs_data[rs_nombre]["cuit"] = cuit

        rs_map: dict[str, int] = {}   # nombre → id
        for nombre, data in rs_data.items():
            rs = RazonSocial(
                razon_social=nombre,
                cuit=data["cuit"],
                numero=data["numero"],
            )
            db.add(rs)
            db.flush()
            rs_map[nombre] = rs.id

        db.commit()
        print(f"  ✓ {len(rs_map)} razones sociales")

        # ── 3. Clientes (una fila por N° Cliente + Marca) ─────────────────────

        print("\nCreando clientes...")
        # Agrupar por (N° Cliente, Marca) — cada combinación es un cliente distinto
        clientes_rows: dict[tuple, list] = {}
        for r in rows:
            nc    = int(float(r["N° Cliente"]))
            marca = clean(r.get("Marca")) or ""
            key   = (nc, marca)
            clientes_rows.setdefault(key, []).append(r)

        creados = 0

        for (id_cliente, marca), grupo in sorted(clientes_rows.items()):
            r0 = grupo[0]   # primera fila del grupo = datos del cliente

            rs_nombre  = clean(r0.get("Razon Social"))
            rs_id      = rs_map.get(rs_nombre) if rs_nombre else None
            domicilio  = clean(r0.get("Domicilio"))
            localidad  = clean(r0.get("Localidad"))
            provincia  = norm_provincia(r0.get("Provincia"))
            prov_id    = prov_map.get(provincia) if provincia else None
            pais       = clean(r0.get("País")) or "Argentina"
            telefono   = clean(r0.get("Telefono"))
            transporte = clean(r0.get("Transporte"))

            c = Cliente(
                id_cliente=id_cliente,
                marca=marca or None,
                razon_social=rs_nombre,   # campo legacy
                razon_social_id=rs_id,
            )
            db.add(c)
            db.flush()

            db.add(ClienteUbicacion(
                cliente_id=c.id,
                domicilio=domicilio,
                localidad=localidad,
                provincia_id=prov_id,
                pais=pais,
                transporte=transporte,
            ))

            if telefono:
                db.add(ClienteContacto(
                    cliente_id=c.id,
                    telefono=telefono,
                ))

            # ── Productos (todas las filas del grupo = misma marca, distintos productos) ──
            vistos = set()
            for r in grupo:
                producto = clean(r.get("Producto"))
                if not producto or producto in vistos:
                    continue
                vistos.add(producto)

                envase_raw = clean(r.get("Tipo de Envase"))
                envase = envase_raw if envase_raw and envase_raw not in ("?", "CONSULTAR") else None

                db.add(ClienteProducto(
                    cliente_id=c.id,
                    nombre=producto,
                    envase=envase,
                    lamina=clean(r.get("Lamina")),
                    muestra=clean(r.get("Muestra")),
                    alto=parse_num(r.get("Alto")),
                    cilindro=parse_num(r.get("Cilindro")),
                    cierre=parse_num(r.get("Cierre")),
                ))

            creados += 1

            if creados % 100 == 0:
                db.commit()
                print(f"    ... {creados} clientes")

        db.commit()
        print(f"  ✓ {creados} clientes")

        # ── Resumen ────────────────────────────────────────────────────────────
        total_prods = db.execute(text("SELECT COUNT(*) FROM cliente_productos")).scalar()
        print(f"\n{'=' * 52}")
        print(f"  Importación completada")
        print(f"  Clientes:          {creados}")
        print(f"  Razones Sociales:  {len(rs_map)}")
        print(f"  Provincias:        {len(prov_map)}")
        print(f"  Productos:         {total_prods}")
        print(f"  Envases:           {len(envase_map)}")
        print(f"{'=' * 52}\n")

    except Exception as e:
        db.rollback()
        print(f"\n❌ Error: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    importar()
