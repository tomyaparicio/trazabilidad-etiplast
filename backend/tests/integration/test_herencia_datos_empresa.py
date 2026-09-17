"""Integración: la marca hereda los datos de su empresa, pero puede tener los suyos.

Domicilio, teléfono y transporte son de la entidad legal: en la cartera real, 30
de 35 empresas con varias marcas comparten el mismo domicilio. Las 5 que difieren
(Bahia Jugos, Hielomar, Chiflon, Villa Giardino, Labza) tienen el propio cargado
en la marca — y ese tiene que seguir mandando.
"""
import pytest

RS = "PYTEST HERENCIA S.R.L"
DOM_EMPRESA, TEL_EMPRESA, TRANSP = "Ruta 8 Km 12", "358-4999888", "Expreso Norte"
DOM_PROPIO = "Parque Industrial Lote 4"


@pytest.fixture()
def empresa(api, db_session):
    r = api.post("/api/razones-sociales", json={
        "razon_social": RS, "numero": 96001,
        "domicilio": DOM_EMPRESA, "localidad": "Río Cuarto",
        "telefono": TEL_EMPRESA, "transporte": TRANSP,
    })
    assert r.status_code == 201, r.text
    rs_id = r.json()["id"]
    creados = []
    yield {"rs_id": rs_id, "creados": creados}

    from models import RazonSocial
    for cid in creados:
        api.delete(f"/api/clientes/{cid}")
    db_session.query(RazonSocial).filter(RazonSocial.id == rs_id).delete()
    db_session.commit()


def test_la_marca_sin_datos_propios_hereda_los_de_la_empresa(api, empresa):
    r = api.post("/api/clientes", json={"marca": "PYTEST HER HEREDA", "razon_social_id": empresa["rs_id"]})
    assert r.status_code == 201, r.text
    empresa["creados"].append(r.json()["id"])

    c = api.get(f"/api/clientes/{r.json()['id']}").json()
    assert c["domicilio"] == DOM_EMPRESA
    assert c["localidad"] == "Río Cuarto"
    assert c["telefono"] == TEL_EMPRESA
    assert c["transporte"] == TRANSP


def test_el_dato_propio_de_la_marca_no_se_pisa(api, empresa):
    """Hasta separar domicilio fiscal de domicilio de entrega, lo cargado en la
    marca no se toca: puede ser la dirección de entrega, que es otra cosa."""
    r = api.post("/api/clientes", json={
        "marca": "PYTEST HER PROPIA", "razon_social_id": empresa["rs_id"],
        "domicilio": DOM_PROPIO,
    })
    assert r.status_code == 201, r.text
    empresa["creados"].append(r.json()["id"])

    c = api.get(f"/api/clientes/{r.json()['id']}").json()
    assert c["domicilio"] == DOM_PROPIO, "lo propio de la marca no se pisa"
    assert c["telefono"] == TEL_EMPRESA


def test_cambiar_el_dato_de_la_empresa_alcanza_a_todas_las_que_heredan(api, empresa):
    a = api.post("/api/clientes", json={"marca": "PYTEST HER A", "razon_social_id": empresa["rs_id"]}).json()
    b = api.post("/api/clientes", json={
        "marca": "PYTEST HER B", "razon_social_id": empresa["rs_id"], "domicilio": DOM_PROPIO,
    }).json()
    empresa["creados"] += [a["id"], b["id"]]

    r = api.put(f"/api/razones-sociales/{empresa['rs_id']}", json={"domicilio": "Nueva Sede 100"})
    assert r.status_code == 200, r.text

    assert api.get(f"/api/clientes/{a['id']}").json()["domicilio"] == "Nueva Sede 100"
    assert api.get(f"/api/clientes/{b['id']}").json()["domicilio"] == DOM_PROPIO, "la que tiene propio no se toca"


def test_un_cliente_sin_razon_social_no_hereda_nada(api):
    r = api.post("/api/clientes", json={"marca": "PYTEST HER SUELTO", "domicilio": "Su propia calle"})
    cid = r.json()["id"]
    try:
        c = api.get(f"/api/clientes/{cid}").json()
        assert c["domicilio"] == "Su propia calle"
        assert c["telefono"] is None
    finally:
        api.delete(f"/api/clientes/{cid}")
