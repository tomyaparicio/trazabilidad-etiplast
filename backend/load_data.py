"""
Script para crear la tabla y cargar los datos del Excel a Supabase via ORM.
Ejecutar una sola vez: py load_data.py
"""
import openpyxl
from sqlalchemy import text
from database import engine, SessionLocal, Base
from models import Cliente

# Registrar modelos en Base.metadata
import models  # noqa

EXCEL_PATH = r"C:\Users\APA\Downloads\Hoja de cálculo sin título.xlsx"


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
    print("[1/3] Creando tablas en la base de datos...")
    Base.metadata.create_all(bind=engine)
    print("      Tabla 'clientes' creada correctamente!")


def enable_rls():
    """Habilita Row Level Security y crea políticas de acceso."""
    print("[2/3] Configurando Row Level Security...")
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE clientes ENABLE ROW LEVEL SECURITY"))

        policies = [
            ("usuarios_leer_clientes", "SELECT", "USING (true)"),
            ("usuarios_insertar_clientes", "INSERT", "WITH CHECK (true)"),
            ("usuarios_actualizar_clientes", "UPDATE", "USING (true)"),
        ]

        for name, action, clause in policies:
            try:
                conn.execute(text(
                    f"CREATE POLICY {name} ON clientes FOR {action} TO authenticated {clause}"
                ))
                print(f"      Politica '{name}' creada")
            except Exception:
                print(f"      Politica '{name}' ya existe, omitida")

        conn.commit()
    print("      RLS configurado!")


def load_data():
    """Lee el Excel y carga los datos usando SQLAlchemy ORM."""
    print(f"[3/3] Cargando datos desde: {EXCEL_PATH}")
    wb = openpyxl.load_workbook(EXCEL_PATH)
    ws = wb.active

    db = SessionLocal()
    count = 0

    try:
        for row in ws.iter_rows(min_row=2, values_only=True):
            if not row[0] and not (len(row) > 3 and row[3]):
                continue

            cliente = Cliente(
                numero_cliente=parse_int(row[0]),
                marca=str(row[1]).strip() if row[1] else None,
                rubro=str(row[2]).strip() if row[2] else None,
                razon_social=str(row[3]).strip() if row[3] else None,
                domicilio=str(row[4]).strip() if row[4] else None,
                localidad=str(row[5]).strip() if row[5] else None,
                provincia=str(row[6]).strip() if row[6] else None,
                pais=str(row[7]).strip() if row[7] else "Argentina",
                cuit=str(row[8]).strip() if row[8] else None,
                telefono=str(row[9]).strip() if row[9] else None,
                producto=str(row[10]).strip() if row[10] else None,
                lamina=str(row[11]).strip() if row[11] else None,
                muestra=str(row[12]).strip() if row[12] else None,
                alto=parse_numeric(row[13]),
                cilindro=parse_numeric(row[14]),
                cierre=str(row[15]).strip() if row[15] else None,
                envase=str(row[16]).strip() if row[16] else None,
                lamina_2=str(row[17]).strip() if row[17] else None,
                cilindro_2=parse_numeric(row[18]),
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
    enable_rls()
    load_data()
    print()
    print("Todo listo! Base de datos configurada.")
    print("=" * 50)
