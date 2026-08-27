"""services/numeracion.py — numeración correlativa (OT-0001, PRES-0001…).

Se mockea la sesión de DB: `execute` (advisory lock de Postgres) es no-op y
`query(...).all()` devuelve filas fijas. Así se testea la LÓGICA de numeración
sin depender de Postgres.
"""
from types import SimpleNamespace

from services.numeracion import generar_numero


class _FakeQuery:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeDB:
    def __init__(self, rows):
        self._rows = rows
        self.executed = []

    def execute(self, *args, **kwargs):
        self.executed.append((args, kwargs))
        return None

    def query(self, *args, **kwargs):
        return _FakeQuery(self._rows)


_MODELO = SimpleNamespace(numero="numero")


def test_primer_numero_cuando_vacio():
    assert generar_numero(_FakeDB([]), _MODELO, "OT") == "OT-0001"


def test_siguiente_es_max_mas_uno():
    db = _FakeDB([("OT-0001",), ("OT-0002",), ("OT-0005",)])
    assert generar_numero(db, _MODELO, "OT") == "OT-0006"


def test_respeta_ancho_personalizado():
    # DB vacía → siguiente = 1, con ancho 6 se rellena a 6 dígitos
    assert generar_numero(_FakeDB([]), _MODELO, "OT", ancho=6) == "OT-000001"


def test_prefijo_distinto():
    assert generar_numero(_FakeDB([("PRES-0009",)]), _MODELO, "PRES") == "PRES-0010"


def test_ignora_numeros_malformados():
    db = _FakeDB([("BASURA",), ("OT-",), ("OT-0003",)])
    assert generar_numero(db, _MODELO, "OT") == "OT-0004"


def test_toma_advisory_lock_antes_de_leer():
    db = _FakeDB([])
    generar_numero(db, _MODELO, "OT")
    assert db.executed, "debe tomar el advisory lock (pg_advisory_xact_lock)"
