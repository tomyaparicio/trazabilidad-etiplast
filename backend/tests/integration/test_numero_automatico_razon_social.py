"""Integración: toda razón social nueva nace con su N° de cliente.

En producción se crearon 27 razones sociales en tres semanas y NINGUNA tenía
número: el alta no se lo asignaba. El N° es el que la empresa usa para buscar y
facturar, así que una razón social sin número es un cliente que no se encuentra.
"""
import pytest


def _borrar_rs(db_session, *ids):
    from models import RazonSocial
    db_session.query(RazonSocial).filter(RazonSocial.id.in_(ids)).delete(synchronize_session=False)
    db_session.commit()


def test_crear_razon_social_sin_numero_le_asigna_uno(api, db_session):
    r = api.post("/api/razones-sociales", json={"razon_social": "PYTEST AUTONUM UNO SRL"})
    assert r.status_code == 201, r.text
    try:
        assert r.json()["numero"] is not None, "nace con número"
    finally:
        _borrar_rs(db_session, r.json()["id"])


def test_dos_seguidas_reciben_numeros_distintos_y_consecutivos(api, db_session):
    a = api.post("/api/razones-sociales", json={"razon_social": "PYTEST AUTONUM A SRL"}).json()
    b = api.post("/api/razones-sociales", json={"razon_social": "PYTEST AUTONUM B SRL"}).json()
    try:
        assert a["numero"] != b["numero"]
        assert b["numero"] == a["numero"] + 1
    finally:
        _borrar_rs(db_session, a["id"], b["id"])


def test_el_numero_automatico_no_pisa_el_de_un_cliente_suelto(api, db_session):
    """El N° visible de un cliente sin razón social es su propio id_cliente: el
    próximo número tiene que estar libre también de ese lado."""
    alto = 999_000
    c = api.post("/api/clientes", json={"marca": "PYTEST AUTONUM SUELTO", "id_cliente": alto})
    assert c.status_code == 201, c.text
    rs = api.post("/api/razones-sociales", json={"razon_social": "PYTEST AUTONUM TRAS SUELTO"}).json()
    try:
        assert rs["numero"] > alto, "no reutiliza un número que ya ve un cliente suelto"
    finally:
        api.delete(f"/api/clientes/{c.json()['id']}")
        _borrar_rs(db_session, rs["id"])


def test_si_se_manda_un_numero_se_respeta(api, db_session):
    r = api.post("/api/razones-sociales", json={"razon_social": "PYTEST AUTONUM MANUAL", "numero": 888_001})
    assert r.status_code == 201, r.text
    try:
        assert r.json()["numero"] == 888_001
    finally:
        _borrar_rs(db_session, r.json()["id"])


def test_alta_de_cliente_con_razon_social_nueva_tambien_la_numera(api, db_session):
    """El otro camino: el alta de cliente crea la razón social cuando llega por texto."""
    from models import Cliente
    c = api.post("/api/clientes", json={"marca": "PYTEST AUTONUM VIA CLIENTE",
                                        "razon_social": "PYTEST AUTONUM VIA CLIENTE SRL"})
    assert c.status_code == 201, c.text
    cliente = db_session.query(Cliente).filter(Cliente.id == c.json()["id"]).one()
    rs_id = cliente.razon_social_id
    try:
        assert cliente.razon_social_obj.numero is not None
        # Y la marca muestra ese número, no uno propio distinto.
        assert c.json()["id_cliente"] == cliente.razon_social_obj.numero
    finally:
        api.delete(f"/api/clientes/{c.json()['id']}")
        _borrar_rs(db_session, rs_id)


def test_cliente_suelto_sin_numero_no_repite_el_de_una_razon_social_sin_marcas(api, db_session):
    """Una razón social recién creada todavía no tiene marcas: si el N° del cliente
    suelto se calcula sólo mirando clientes, le toca el mismo número que a ella."""
    rs = api.post("/api/razones-sociales", json={"razon_social": "PYTEST AUTONUM RS VACIA"}).json()
    c = api.post("/api/clientes", json={"marca": "PYTEST AUTONUM SUELTO SIN N"})
    assert c.status_code == 201, c.text
    try:
        assert c.json()["id_cliente"] != rs["numero"]
        assert c.json()["id_cliente"] > rs["numero"]
    finally:
        api.delete(f"/api/clientes/{c.json()['id']}")
        _borrar_rs(db_session, rs["id"])
