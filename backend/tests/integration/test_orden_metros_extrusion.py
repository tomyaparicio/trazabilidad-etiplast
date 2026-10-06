"""Integración: los metros de film quedan guardados en la orden de trabajo.

En la primera pantalla del alta (la de Venus) se carga la CANTIDAD de etiquetas
y, con el alto del producto, sale solo cuántos metros de film hay que extrudar:

    metros = cantidad × (alto_cm ÷ 100) + 400, subido al metro entero

La cuenta la muestra la pantalla, pero el número tiene que quedar GUARDADO en
la orden: es lo que después lee el de extrusión para saber cuánto film preparar.
Y si la orden entra por la API o por el agente de voz (sin pantalla), el backend
la hace igual, para que ninguna orden quede sin metros.
"""
import pytest

from models import AuditLog, Cliente, OrdenTrabajo

MARCA = "OTMETROS TEST SA"


def _limpiar(db):
    ids = [c.id for c in db.query(Cliente).filter(Cliente.marca == MARCA).all()]
    if ids:
        db.query(OrdenTrabajo).filter(OrdenTrabajo.cliente_id.in_(ids)).delete(
            synchronize_session=False
        )
        db.query(Cliente).filter(Cliente.id.in_(ids)).delete(synchronize_session=False)
        db.commit()


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


@pytest.fixture()
def producto_id(api, cliente_id):
    """Un producto con alto 11,5 cm — el ejemplo real que dio el dueño."""
    r = api.post(f"/api/clientes/{cliente_id}/productos", json={
        "nombre": "Etiqueta Pytest Metros", "alto": 11.5,
    })
    assert r.status_code == 201, r.text
    return r.json()["id"]


# ──────────────────────────────────────────────────────────────────────────────
# Alta
# ──────────────────────────────────────────────────────────────────────────────

def test_alta_con_cantidad_y_alto_del_producto_calcula_los_metros(
    api, cliente_id, producto_id
):
    """30.000 × 0,115 = 3.450 + 400 = 3.850 m."""
    r = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "cliente_producto_id": producto_id,
        "cantidad": 30_000,
    })
    assert r.status_code == 201, r.text
    assert r.json()["extrusion_metros"] == 3850.0


def test_alta_con_alto_corregido_a_mano_usa_ese_alto(api, cliente_id, producto_id):
    """El operario puede corregir el alto en la pantalla; manda el que vale."""
    r = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "cliente_producto_id": producto_id,
        "cantidad": 100_000,
        "troquelado_alto": 23,        # pisa los 11,5 del producto
    })
    assert r.status_code == 201, r.text
    assert r.json()["extrusion_metros"] == 23400.0   # 23.000 + 400


def test_alta_con_metros_explicitos_los_respeta(api, cliente_id, producto_id):
    """Si el que carga escribió los metros, mandan los de él, no la cuenta."""
    r = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "cliente_producto_id": producto_id,
        "cantidad": 100_000,
        "extrusion_metros": 2000,
    })
    assert r.status_code == 201, r.text
    assert r.json()["extrusion_metros"] == 2000.0


def test_alta_sin_cantidad_no_rompe_y_queda_sin_metros(api, cliente_id, producto_id):
    r = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "cliente_producto_id": producto_id,
    })
    assert r.status_code == 201, r.text
    assert r.json()["extrusion_metros"] is None


def test_alta_con_cantidad_pero_sin_ningun_alto_queda_sin_metros(api, cliente_id):
    """Sin alto no hay cuenta posible: se guarda igual, sin inventar el número."""
    r = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "cantidad": 100_000,
    })
    assert r.status_code == 201, r.text
    assert r.json()["extrusion_metros"] is None
    assert r.json()["cantidad"] == 100_000


# ──────────────────────────────────────────────────────────────────────────────
# Edición
# ──────────────────────────────────────────────────────────────────────────────

def test_editar_la_cantidad_recalcula_los_metros(api, cliente_id, producto_id):
    oid = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "cliente_producto_id": producto_id,
        "cantidad": 100_000,
    }).json()["id"]

    r = api.put(f"/api/ordenes/{oid}", json={"cantidad": 200_000})
    assert r.status_code == 200, r.text
    assert r.json()["extrusion_metros"] == 23400.0   # 23.000 + 400


def test_editar_mandando_los_metros_a_mano_no_los_pisa(api, cliente_id, producto_id):
    oid = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "cliente_producto_id": producto_id,
        "cantidad": 100_000,
    }).json()["id"]

    r = api.put(f"/api/ordenes/{oid}", json={
        "cantidad": 200_000,
        "extrusion_metros": 3000,
    })
    assert r.status_code == 200, r.text
    assert r.json()["extrusion_metros"] == 3000.0


def test_editar_solo_el_alto_tambien_recalcula(api, cliente_id, producto_id):
    oid = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "cliente_producto_id": producto_id,
        "cantidad": 100_000,
    }).json()["id"]

    r = api.put(f"/api/ordenes/{oid}", json={"troquelado_alto": 23})
    assert r.status_code == 200, r.text
    assert r.json()["extrusion_metros"] == 23400.0   # 23.000 + 400


def test_editar_otra_cosa_no_toca_los_metros_guardados(api, cliente_id, producto_id):
    """Cambiar una observación no tiene por qué recalcular nada."""
    oid = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "cliente_producto_id": producto_id,
        "cantidad": 100_000,
        "extrusion_metros": 2000,
    }).json()["id"]

    r = api.put(f"/api/ordenes/{oid}", json={"observaciones": "urgente"})
    assert r.status_code == 200, r.text
    assert r.json()["extrusion_metros"] == 2000.0


# ──────────────────────────────────────────────────────────────────────────────
# Dónde se ve
# ──────────────────────────────────────────────────────────────────────────────

def test_los_metros_viajan_en_el_detalle_y_en_el_listado(api, cliente_id, producto_id):
    oid = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "cliente_producto_id": producto_id,
        "cantidad": 100_000,
    }).json()["id"]

    assert api.get(f"/api/ordenes/{oid}").json()["extrusion_metros"] == 11900.0

    listado = api.get("/api/ordenes", params={"cliente_id": cliente_id}).json()["data"]
    fila = next(o for o in listado if o["id"] == oid)
    assert fila["extrusion_metros"] == 11900.0


def test_los_metros_quedan_auditados(api, db_session, cliente_id, producto_id):
    oid = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "cliente_producto_id": producto_id,
        "cantidad": 100_000,
    }).json()["id"]

    log = (
        db_session.query(AuditLog)
        .filter(AuditLog.entidad == "orden_trabajo", AuditLog.entidad_id == oid,
                AuditLog.accion == "crear")
        .order_by(AuditLog.id.desc())
        .first()
    )
    assert log is not None, "crear la orden tiene que dejar rastro en auditoría"
    assert (log.datos or {}).get("extrusion_metros") == 11900.0

    api.put(f"/api/ordenes/{oid}", json={"cantidad": 200_000})
    log = (
        db_session.query(AuditLog)
        .filter(AuditLog.entidad == "orden_trabajo", AuditLog.entidad_id == oid,
                AuditLog.accion == "actualizar")
        .order_by(AuditLog.id.desc())
        .first()
    )
    assert log is not None
    assert "cantidad" in (log.datos or {}).get("campos", [])
    assert (log.datos or {}).get("despues", {}).get("extrusion_metros") == 23400.0
