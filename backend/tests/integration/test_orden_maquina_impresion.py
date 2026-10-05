"""Integración: con qué máquina impresora se hace cada orden de trabajo.

El paso 0 del alta de una OT es elegir la impresora (Venus, ReinaFlex o la
Autoadhesiva — «Taurus» en el catálogo ES la autoadhesiva). Acá se cubre que
esa elección:
  - se pueda mandar al crear y al editar,
  - vuelva en el detalle de la orden,
  - quede auditada,
  - y que NO se pueda guardar una máquina que no esté en el catálogo.
"""
import pytest

from models import AuditLog, Cliente, Maquina, OrdenTrabajo

MARCA = "OTMAQ TEST SA"

# Máquinas propias del test: nombres que no pisan las del catálogo real.
MAQUINAS_TEST = [
    ("PYTEST-VENUS", "Venus Pytest", "impresion", True),
    ("PYTEST-REINA", "ReinaFlex Pytest", "impresion", True),
    ("PYTEST-AUTO", "Autoadhesiva Pytest", "impresion", True),
    ("PYTEST-VIEJA", "Impresora Jubilada Pytest", "impresion", False),
    ("PYTEST-TROQ", "Troqueladora Pytest", "troquelado", True),
]


def _limpiar(db):
    ids = [c.id for c in db.query(Cliente).filter(Cliente.marca == MARCA).all()]
    if ids:
        db.query(OrdenTrabajo).filter(OrdenTrabajo.cliente_id.in_(ids)).delete(
            synchronize_session=False
        )
        db.query(Cliente).filter(Cliente.id.in_(ids)).delete(synchronize_session=False)
        db.commit()


@pytest.fixture()
def maquinas(db_session):
    """Siembra el parque de impresoras del test y lo borra al terminar."""
    codigos = [m[0] for m in MAQUINAS_TEST]
    db_session.query(Maquina).filter(Maquina.codigo.in_(codigos)).delete(
        synchronize_session=False
    )
    db_session.commit()
    for codigo, nombre, tipo, activa in MAQUINAS_TEST:
        db_session.add(Maquina(codigo=codigo, nombre=nombre, tipo=tipo, activa=activa))
    db_session.commit()
    try:
        yield {m[1]: m[0] for m in MAQUINAS_TEST}
    finally:
        db_session.query(Maquina).filter(Maquina.codigo.in_(codigos)).delete(
            synchronize_session=False
        )
        db_session.commit()


@pytest.fixture()
def cliente_id(api, db_session):
    _limpiar(db_session)
    r = api.post("/api/clientes", json={"marca": MARCA})
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    try:
        yield cid
    finally:
        _limpiar(db_session)


def test_crear_orden_con_maquina_de_impresion_valida(api, maquinas, cliente_id):
    r = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "impresion_maquina": "Venus Pytest",
    })
    assert r.status_code == 201, r.text
    assert r.json()["impresion_maquina"] == "Venus Pytest"


def test_crear_orden_sin_maquina_sigue_andando(api, maquinas, cliente_id):
    """El paso 0 no rompe las órdenes que todavía no eligen impresora."""
    r = api.post("/api/ordenes", json={"cliente_id": cliente_id})
    assert r.status_code == 201, r.text
    assert r.json()["impresion_maquina"] is None


def test_crear_orden_con_maquina_inexistente_da_400(api, maquinas, cliente_id):
    r = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "impresion_maquina": "Maquina Fantasma",
    })
    assert r.status_code == 400, r.text
    detalle = r.json()["detail"]
    assert "Maquina Fantasma" in detalle
    assert "máquina de impresión" in detalle.lower()


def test_no_acepta_una_maquina_de_otro_tipo(api, maquinas, cliente_id):
    """Una troqueladora no es una impresora, aunque esté en el catálogo."""
    r = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "impresion_maquina": "Troqueladora Pytest",
    })
    assert r.status_code == 400, r.text


def test_no_acepta_una_maquina_dada_de_baja(api, maquinas, cliente_id):
    r = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "impresion_maquina": "Impresora Jubilada Pytest",
    })
    assert r.status_code == 400, r.text


def test_acepta_el_codigo_y_guarda_el_nombre(api, maquinas, cliente_id):
    """El front puede mandar el código; en la orden queda el nombre legible."""
    r = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "impresion_maquina": "pytest-auto",   # código, en minúscula
    })
    assert r.status_code == 201, r.text
    assert r.json()["impresion_maquina"] == "Autoadhesiva Pytest"


def test_editar_orden_cambia_de_maquina(api, maquinas, cliente_id):
    oid = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "impresion_maquina": "Venus Pytest",
    }).json()["id"]

    r = api.put(f"/api/ordenes/{oid}", json={"impresion_maquina": "ReinaFlex Pytest"})
    assert r.status_code == 200, r.text
    assert r.json()["impresion_maquina"] == "ReinaFlex Pytest"

    # Cambiar a una que no existe no pisa lo guardado
    r = api.put(f"/api/ordenes/{oid}", json={"impresion_maquina": "Maquina Fantasma"})
    assert r.status_code == 400, r.text
    assert api.get(f"/api/ordenes/{oid}").json()["impresion_maquina"] == "ReinaFlex Pytest"

    # Vaciar el campo sí se permite (todavía no eligieron)
    r = api.put(f"/api/ordenes/{oid}", json={"impresion_maquina": None})
    assert r.status_code == 200, r.text
    assert r.json()["impresion_maquina"] is None


def test_la_maquina_viaja_en_el_detalle_y_en_el_listado(api, maquinas, cliente_id):
    oid = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "impresion_maquina": "ReinaFlex Pytest",
    }).json()["id"]

    assert api.get(f"/api/ordenes/{oid}").json()["impresion_maquina"] == "ReinaFlex Pytest"

    listado = api.get("/api/ordenes", params={"cliente_id": cliente_id}).json()["data"]
    fila = next(o for o in listado if o["id"] == oid)
    assert fila["impresion_maquina"] == "ReinaFlex Pytest"


def test_la_eleccion_queda_auditada(api, db_session, maquinas, cliente_id):
    oid = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "impresion_maquina": "Venus Pytest",
    }).json()["id"]

    log = (
        db_session.query(AuditLog)
        .filter(AuditLog.entidad == "orden_trabajo", AuditLog.entidad_id == oid,
                AuditLog.accion == "crear")
        .order_by(AuditLog.id.desc())
        .first()
    )
    assert log is not None, "crear la orden tiene que dejar rastro en auditoría"
    assert (log.datos or {}).get("impresion_maquina") == "Venus Pytest"

    api.put(f"/api/ordenes/{oid}", json={"impresion_maquina": "ReinaFlex Pytest"})
    log = (
        db_session.query(AuditLog)
        .filter(AuditLog.entidad == "orden_trabajo", AuditLog.entidad_id == oid,
                AuditLog.accion == "actualizar")
        .order_by(AuditLog.id.desc())
        .first()
    )
    assert log is not None
    assert "impresion_maquina" in (log.datos or {}).get("campos", [])
