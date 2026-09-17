"""Integración: datos que las marcas de una empresa comparten.

Al elegir una razón social en el alta, tiene sentido traer lo que sus marcas ya
comparten: en producción, 27 de 34 empresas con varias marcas tienen la misma
localidad y 22 el mismo domicilio. El rubro NO se incluye a propósito: sólo
coincide en 5 de 34, así que autocompletarlo acertaría menos de lo que estorba.
"""
import pytest

RS = "PYTEST COMUNES S.R.L"
DOMICILIO, LOCALIDAD, TELEFONO, TRANSPORTE = "Av. Siempreviva 742", "Río Cuarto", "358-4123456", "Expreso Sur"


@pytest.fixture()
def empresa(api, db_session):
    r = api.post("/api/razones-sociales", json={"razon_social": RS, "numero": 95001})
    rs_id = r.json()["id"]
    c = api.post("/api/clientes", json={
        "marca": "PYTEST COMUNES PRIMERA", "razon_social_id": rs_id, "rubro": "Agua",
        "domicilio": DOMICILIO, "localidad": LOCALIDAD, "provincia": "Córdoba",
        "telefono": TELEFONO, "transporte": TRANSPORTE,
    })
    assert c.status_code == 201, c.text
    yield {"rs_id": rs_id, "cliente_id": c.json()["id"]}

    from models import RazonSocial
    api.delete(f"/api/clientes/{c.json()['id']}")
    db_session.query(RazonSocial).filter(RazonSocial.id == rs_id).delete()
    db_session.commit()


def test_devuelve_los_datos_que_comparten_las_marcas(api, empresa):
    r = api.get(f"/api/razones-sociales/{empresa['rs_id']}")
    assert r.status_code == 200, r.text
    d = r.json()["datos_comunes"]

    assert d["domicilio"] == DOMICILIO
    assert d["localidad"] == LOCALIDAD
    assert d["provincia"] == "Córdoba"
    assert d["telefono"] == TELEFONO
    assert d["transporte"] == TRANSPORTE


def test_no_incluye_el_rubro(api, empresa):
    """El rubro cambia entre marcas de la misma empresa: copiarlo sería adivinar mal."""
    d = api.get(f"/api/razones-sociales/{empresa['rs_id']}").json()["datos_comunes"]
    assert "rubro" not in d


def test_una_razon_social_sin_marcas_no_rompe(api, db_session):
    r = api.post("/api/razones-sociales", json={"razon_social": "PYTEST COMUNES VACIA"})
    rs_id = r.json()["id"]
    try:
        d = api.get(f"/api/razones-sociales/{rs_id}").json()["datos_comunes"]
        assert d == {} or all(v is None for v in d.values())
    finally:
        from models import RazonSocial
        db_session.query(RazonSocial).filter(RazonSocial.id == rs_id).delete()
        db_session.commit()
