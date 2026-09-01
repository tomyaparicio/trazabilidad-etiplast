"""Integración: sumar una marca nueva a una razón social que ya existe.

Es el caso normal de Etiplast: una empresa (Bahia Jugos) tiene varias marcas y
TODAS llevan su mismo N° de cliente. El alta validaba que el id_cliente fuera
único y por eso rechazaba justo eso — contradiciendo al propio modelo, que
declara la columna como "no único: varias marcas pueden compartir el número".
"""
import pytest

RS = "PYTEST ALTA COMPARTIDA S.R.L"
NUMERO_RS = 92001


@pytest.fixture()
def razon_social(api, db_session):
    r = api.post("/api/razones-sociales", json={"razon_social": RS, "numero": NUMERO_RS})
    assert r.status_code == 201, r.text
    rs = r.json()

    # Como en producción: el N° de la razón social coincide con el id_cliente
    # de su primera marca (así quedó al importar la planilla).
    r = api.post("/api/clientes", json={
        "marca": "PYTEST ALTA PRIMERA", "razon_social_id": rs["id"], "id_cliente": NUMERO_RS,
    })
    assert r.status_code == 201, r.text
    creados = [r.json()["id"]]

    yield {"rs": rs, "creados": creados}

    from models import RazonSocial
    for cid in creados:
        api.delete(f"/api/clientes/{cid}")
    db_session.query(RazonSocial).filter(RazonSocial.id == rs["id"]).delete()
    db_session.commit()


def test_sumar_una_marca_a_una_razon_social_existente(api, razon_social):
    """El wizard manda el N° de la razón social: no puede rebotar por duplicado."""
    r = api.post("/api/clientes", json={
        "marca": "PYTEST ALTA SEGUNDA",
        "razon_social_id": razon_social["rs"]["id"],
        "id_cliente": NUMERO_RS,          # lo que autocompleta la pantalla
    })
    assert r.status_code == 201, r.text
    razon_social["creados"].append(r.json()["id"])
    assert r.json()["id_cliente"] == NUMERO_RS


def test_las_dos_marcas_muestran_el_mismo_numero(api, razon_social):
    r = api.post("/api/clientes", json={
        "marca": "PYTEST ALTA SEGUNDA",
        "razon_social_id": razon_social["rs"]["id"],
        "id_cliente": NUMERO_RS,
    })
    assert r.status_code == 201, r.text
    razon_social["creados"].append(r.json()["id"])

    res = api.get("/api/clientes", params={"search": "PYTEST ALTA ", "per_page": 100})
    datos = res.json()["data"]
    assert {c["marca"] for c in datos} == {"PYTEST ALTA PRIMERA", "PYTEST ALTA SEGUNDA"}
    assert {c["id_cliente"] for c in datos} == {NUMERO_RS}


def test_un_cliente_suelto_no_puede_pisar_el_numero_de_otra_empresa(api, razon_social):
    """Sin razón social detrás, el id_cliente ES el N° visible: no puede chocar."""
    r = api.post("/api/clientes", json={"marca": "PYTEST ALTA INTRUSA", "id_cliente": NUMERO_RS})
    assert r.status_code == 400, r.text
    assert RS in r.json()["detail"], "el error dice con quién choca"


def test_sin_numero_se_autoasigna(api, razon_social):
    r = api.post("/api/clientes", json={"marca": "PYTEST ALTA AUTO"})
    assert r.status_code == 201, r.text
    razon_social["creados"].append(r.json()["id"])
    assert r.json()["id_cliente"] is not None
