"""Integración: el CIERRE de la etiqueta en la orden de trabajo.

El cierre es el diámetro de la tapa del envase (13,4 · 24,9 · 27,6…) y ya viene
cargado en la ficha de cada producto. En el paso de Troquelado reemplazó al
«Ancho», que nadie completaba.

VA EN SU PROPIA COLUMNA y no reaprovecha `troquelado_ancho`: son dos medidas
distintas de la misma etiqueta. Guardar un cierre en una columna que se llama
ancho se lee bien hoy y se malinterpreta dentro de seis meses, en un reporte o
en la tesis.
"""
import pytest

from models import Cliente, OrdenTrabajo

MARCA = "OTCIERRE TEST SA"


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


def test_el_cierre_se_guarda_y_vuelve_en_el_detalle(api, cliente_id):
    r = api.post("/api/ordenes", json={"cliente_id": cliente_id, "troquelado_cierre": 13.4})
    assert r.status_code == 201, r.text
    oid = r.json()["id"]
    assert r.json()["troquelado_cierre"] == 13.4
    assert api.get(f"/api/ordenes/{oid}").json()["troquelado_cierre"] == 13.4


def test_el_cierre_se_puede_editar(api, cliente_id):
    oid = api.post("/api/ordenes", json={"cliente_id": cliente_id, "troquelado_cierre": 13.4}).json()["id"]
    r = api.put(f"/api/ordenes/{oid}", json={"troquelado_cierre": 24.9})
    assert r.status_code == 200, r.text
    assert r.json()["troquelado_cierre"] == 24.9


def test_el_cierre_es_opcional(api, cliente_id):
    """Hay 68 productos sin cierre cargado: la orden tiene que poder guardarse."""
    r = api.post("/api/ordenes", json={"cliente_id": cliente_id})
    assert r.status_code == 201, r.text
    assert r.json()["troquelado_cierre"] is None


def test_el_cierre_no_pisa_el_ancho(api, cliente_id):
    """Son dos medidas distintas y cada una tiene su columna."""
    r = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "troquelado_cierre": 13.4,
        "troquelado_ancho": 48,
    })
    assert r.status_code == 201, r.text
    assert r.json()["troquelado_cierre"] == 13.4
    assert r.json()["troquelado_ancho"] == 48.0


def test_el_cierre_viaja_en_el_listado(api, cliente_id):
    oid = api.post("/api/ordenes", json={"cliente_id": cliente_id, "troquelado_cierre": 27.6}).json()["id"]
    listado = api.get("/api/ordenes", params={"cliente_id": cliente_id}).json()["data"]
    fila = next(o for o in listado if o["id"] == oid)
    assert fila["troquelado_cierre"] == 27.6
