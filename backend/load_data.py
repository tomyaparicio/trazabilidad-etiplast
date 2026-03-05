"""
Script para crear la tabla y cargar los datos del Excel a la base de datos via ORM.
Ejecutar una sola vez: python load_data.py
"""
import os
import openpyxl
from sqlalchemy import text
from database import engine, SessionLocal, Base
from models import Cliente

# Registrar modelos en Base.metadata
import models  # noqa

EXCEL_PATH = os.environ.get(
    "EXCEL_PATH",
    os.path.join(os.path.dirname(__file__), "data.xlsx"),
)

# Normalización de provincias (tildes y variantes)
PROVINCIA_MAP = {
    "entre rios": "Entre Ríos",
    "entre ríos": "Entre Ríos",
    "tucuman": "Tucumán",
    "tucumán": "Tucumán",
    "rio negro": "Río Negro",
    "río negro": "Río Negro",
    "neuquen": "Neuquén",
    "neuquén": "Neuquén",
    "cordoba": "Córdoba",
    "córdoba": "Córdoba",
    "la paz": "Entre Ríos",  # La Paz es localidad de Entre Ríos
}

# Normalización de rubros
RUBRO_MAP = {
    "jugos/gaseosas": "Jugos-Gaseosas",
    "jugos-gaseosas": "Jugos-Gaseosas",
    "jugos-gaseosas/agua": "Jugos-Gaseosas",
    "limpieza/agua": "Limpieza",
}


def normalize_provincia(val):
    if not val:
        return None
    clean = val.strip()
    key = clean.lower()
    return PROVINCIA_MAP.get(key, clean)


def normalize_rubro(val):
    if not val:
        return None
    clean = val.strip()
    key = clean.lower()
    return RUBRO_MAP.get(key, clean)


def parse_int(value):
    """Convierte valores enteros, maneja formatos como '332 (380)'."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    val = str(value).strip()
    if "(" in val:
        val = val[:val.index("(")].strip()
    if " " in val:
        val = val.split()[0]
    try:
        return int(float(val))
    except ValueError:
        return None


def parse_numeric(value):
    """Convierte valores numéricos, maneja formatos como '9,75 (int)'."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    val = str(value).strip()
    if "(" in val:
        val = val[:val.index("(")].strip()
    val = val.replace(",", ".")
    try:
        return float(val)
    except ValueError:
        return None


def create_tables():
    """Crea todas las tablas definidas en los modelos ORM."""
    print("[1/2] Creando tablas en la base de datos...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    print("      Tabla 'clientes' creada correctamente!")


def load_data():
    """Lee el Excel y carga los datos usando SQLAlchemy ORM."""
    print(f"[2/2] Cargando datos desde: {EXCEL_PATH}")
    wb = openpyxl.load_workbook(EXCEL_PATH)
    ws = wb.active

    db = SessionLocal()
    count = 0

    try:
        for row in ws.iter_rows(min_row=2, values_only=True):
            # Skip empty rows
            if not row[0] and not (len(row) > 3 and row[3]):
                continue

            cliente = Cliente(
                id_cliente=parse_int(row[0]),
                marca=str(row[1]).strip() if row[1] else None,
                rubro=normalize_rubro(row[2]) if row[2] else None,
                razon_social=str(row[3]).strip() if row[3] else None,
                domicilio=str(row[4]).strip() if row[4] else None,
                localidad=str(row[5]).strip() if row[5] else None,
                provincia=normalize_provincia(row[6]) if row[6] else None,
                pais=str(row[7]).strip() if row[7] else "Argentina",
                cuit=str(row[8]).strip() if row[8] else None,
                telefono=str(row[9]).strip() if row[9] else None,
                producto=str(row[10]).strip() if row[10] else None,
                volumen_cantidad=parse_numeric(row[11]),
                volumen_unidad=str(row[12]).strip().lower() if row[12] else None,
                lamina=str(row[13]).strip() if row[13] else None,
                muestra=str(row[14]).strip() if row[14] else None,
                alto=parse_numeric(row[15]),
                cilindro=parse_numeric(row[16]),
                cierre=parse_numeric(row[17]),
                envase=str(row[18]).strip() if row[18] else None,
                observaciones=str(row[19]).strip() if len(row) > 19 and row[19] else None,
            )
            db.add(cliente)
            count += 1

            if count % 100 == 0:
                db.commit()
                print(f"      Insertados {count} clientes...")

        db.commit()
        print(f"      Total: {count} clientes cargados!")
    except Exception as e:
        db.rollback()
        print(f"      Error: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    print("=" * 50)
    print("  ETIPLAST ERP - Migracion de datos (ORM)")
    print("=" * 50)
    print()
    create_tables()
    load_data()
    print()
    print("Todo listo! Base de datos configurada.")
    print("=" * 50)
