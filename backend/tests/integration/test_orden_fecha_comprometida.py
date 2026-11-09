"""Integración: la FECHA COMPROMETIDA con el cliente en la orden de trabajo.

Es el plazo que la empresa le prometió al cliente, y hasta ahora no estaba en
ninguna parte: ni en el formulario de papel que se relevó ni en el sistema. Esa
ausencia es la que impedía medir si los pedidos salen en término.

VA EN SU PROPIA COLUMNA y no reaprovecha `fecha_entrega`: esa es la fecha REAL
en que el pedido salió, y la comprometida es la que se prometió antes de
empezar. Son el dato y su referencia — compararlas es, justamente, lo que mide
el cumplimiento de plazos. Guardar las dos en una sola columna hace imposible
la comparación.
"""
import pytest

from models import Cliente, OrdenTrabajo

MARCA = "OTPLAZO TEST SA"


def _limpiar(db):
    ids = [c.id for c in db.query(Cliente).filter(Cliente.marca == MARCA).all()]
    if ids:
        db.query(OrdenTrabajo).filter(OrdenTrabajo.cliente_id.in_(ids)).delete(
            synchronize_session=False
        )
        db.query(Cliente).filter(Cliente.id.in_(ids)).delete(synchronize_session=False)
        db.commit()


@pytest.fixture()
def cliente_id(db_session):
    _limpiar(db_session)
    c = Cliente(marca=MARCA, razon_social=MARCA)
    db_session.add(c)
    db_session.commit()
    db_session.refresh(c)
    yield c.id
    _limpiar(db_session)


def test_se_guarda_y_vuelve_en_el_detalle(api, cliente_id):
    r = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "fecha_comprometida": "2026-03-15",
    })
    assert r.status_code == 201, r.text
    oid = r.json()["id"]
    assert r.json()["fecha_comprometida"] == "2026-03-15"
    assert api.get(f"/api/ordenes/{oid}").json()["fecha_comprometida"] == "2026-03-15"


def test_se_puede_editar(api, cliente_id):
    """El plazo se renegocia: el cliente pide una semana más y hay que poder
    dejar constancia del plazo vigente."""
    oid = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "fecha_comprometida": "2026-03-15",
    }).json()["id"]
    r = api.put(f"/api/ordenes/{oid}", json={"fecha_comprometida": "2026-03-22"})
    assert r.status_code == 200, r.text
    assert r.json()["fecha_comprometida"] == "2026-03-22"


def test_es_opcional(api, cliente_id):
    """Las órdenes cargadas antes de que existiera la columna no la tienen, y
    el plazo de un pedido viejo no se puede inventar."""
    r = api.post("/api/ordenes", json={"cliente_id": cliente_id})
    assert r.status_code == 201, r.text
    assert r.json()["fecha_comprometida"] is None


def test_no_pisa_la_fecha_de_entrega_real(api, cliente_id):
    """Las dos conviven: una es la promesa, la otra lo que pasó."""
    r = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "fecha_comprometida": "2026-03-15",
        "fecha_entrega": "2026-03-20",
    })
    assert r.status_code == 201, r.text
    assert r.json()["fecha_comprometida"] == "2026-03-15"
    assert r.json()["fecha_entrega"] == "2026-03-20"


def test_se_puede_borrar_mandando_null(api, cliente_id):
    """Si se cargó mal, hay que poder dejarla vacía otra vez."""
    oid = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "fecha_comprometida": "2026-03-15",
    }).json()["id"]
    r = api.put(f"/api/ordenes/{oid}", json={"fecha_comprometida": None})
    assert r.status_code == 200, r.text
    assert r.json()["fecha_comprometida"] is None
