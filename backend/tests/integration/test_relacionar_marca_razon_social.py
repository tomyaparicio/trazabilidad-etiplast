"""Integración: pasar una marca ya creada a la razón social que corresponde.

El caso real de producción: la marca de «Megaton» se cargó colgada de un
duplicado nuevo («Megaton SAS», sin número) en vez de la empresa que ya existía
(«Megaton», N° 440). Para corregirlo hay que poder RELACIONAR esa marca con la
razón social vieja, que tome su número, y después borrar el duplicado vacío.
"""
import pytest

VIEJA, DUPLICADA = "PYTEST MEGATON", "PYTEST MEGATON SAS"


@pytest.fixture()
def caso_megaton(api, db_session):
    vieja = api.post("/api/razones-sociales", json={"razon_social": VIEJA, "numero": 770440}).json()
    # Hoy el alta frena «Megaton SAS» si ya existe «Megaton»: el duplicado de
    # producción se reproduce confirmando que se quiere crear igual.
    dup = api.post("/api/razones-sociales", json={"razon_social": DUPLICADA, "crear_igual": True}).json()
    marca = api.post("/api/clientes", json={"marca": "PYTEST MEGATON AGUA", "razon_social_id": dup["id"]})
    assert marca.status_code == 201, marca.text
    yield {"vieja": vieja, "dup": dup, "marca_id": marca.json()["id"]}

    from models import RazonSocial
    api.delete(f"/api/clientes/{marca.json()['id']}")
    db_session.query(RazonSocial).filter(RazonSocial.id.in_([vieja["id"], dup["id"]])).delete(synchronize_session=False)
    db_session.commit()


def test_la_marca_se_puede_pasar_a_la_razon_social_vieja(api, caso_megaton):
    c = caso_megaton
    r = api.put(f"/api/clientes/{c['marca_id']}", json={"razon_social_id": c["vieja"]["id"]})
    assert r.status_code == 200, r.text
    assert r.json()["razon_social_id"] == c["vieja"]["id"]
    assert r.json()["razon_social"] == VIEJA


def test_al_pasarla_toma_el_numero_de_la_empresa_vieja(api, caso_megaton):
    """Es el punto de todo: que quede con el N° 440 y no con uno nuevo."""
    c = caso_megaton
    api.put(f"/api/clientes/{c['marca_id']}", json={"razon_social_id": c["vieja"]["id"]})
    assert api.get(f"/api/clientes/{c['marca_id']}").json()["id_cliente"] == 770440


def test_despues_el_duplicado_queda_vacio_y_se_puede_borrar(api, caso_megaton):
    """El circuito completo de limpieza: relacionar, y recién ahí borrar."""
    c = caso_megaton
    # Mientras la marca siga colgada del duplicado, no se puede borrar.
    assert api.delete(f"/api/razones-sociales/{c['dup']['id']}").status_code == 409

    api.put(f"/api/clientes/{c['marca_id']}", json={"razon_social_id": c["vieja"]["id"]})

    assert api.delete(f"/api/razones-sociales/{c['dup']['id']}").status_code == 200
    # Y la marca sigue viva, en la empresa correcta.
    assert api.get(f"/api/clientes/{c['marca_id']}").json()["razon_social"] == VIEJA


def test_con_el_payload_completo_que_manda_la_ficha(api, caso_megaton):
    """La ficha del cliente no manda sólo razon_social_id: manda TODOS los campos
    editables, incluido el N° viejo que tenía la marca. Eso no tiene que pisar el
    número de la empresa a la que se la pasa."""
    c = caso_megaton
    ficha = api.get(f"/api/clientes/{c['marca_id']}").json()
    payload = {**{k: ficha.get(k) for k in ("id_cliente", "marca", "rubro", "cuit", "telefono")},
               "razon_social_id": c["vieja"]["id"], "razon_social": VIEJA}
    r = api.put(f"/api/clientes/{c['marca_id']}", json=payload)
    assert r.status_code == 200, r.text
    assert r.json()["id_cliente"] == 770440
