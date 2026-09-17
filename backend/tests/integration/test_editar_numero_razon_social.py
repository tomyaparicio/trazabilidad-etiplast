"""Integración: cambiar el N° de cliente de una razón social desde la API.

El N° es de la entidad legal y lo comparten todas sus marcas, así que editarlo
tiene que repercutir en todas de una. Y como es el número con el que se busca,
dos razones sociales no pueden compartirlo: se rechaza el duplicado nombrando
con cuál choca.
"""
import pytest

RS_A = "PYTEST EDITNUM UNO S.R.L"
RS_B = "PYTEST EDITNUM DOS S.R.L"


def _crear_rs(api, nombre, numero=None):
    body = {"razon_social": nombre}
    if numero is not None:
        body["numero"] = numero
    r = api.post("/api/razones-sociales", json=body)
    assert r.status_code == 201, r.text
    return r.json()


@pytest.fixture()
def escenario(api, db_session):
    """Dos razones sociales; la primera con dos marcas colgando."""
    a = _crear_rs(api, RS_A, 91001)
    b = _crear_rs(api, RS_B, 91002)
    clientes = []
    for marca, id_cli in [("PYTEST EDITNUM ALFA", 91050), ("PYTEST EDITNUM BETA", 91060)]:
        r = api.post("/api/clientes", json={"marca": marca, "razon_social_id": a["id"], "id_cliente": id_cli})
        assert r.status_code == 201, r.text
        clientes.append(r.json()["id"])
    yield {"a": a, "b": b, "clientes": clientes}

    from models import RazonSocial
    for cid in clientes:
        api.delete(f"/api/clientes/{cid}")
    db_session.query(RazonSocial).filter(RazonSocial.id.in_([a["id"], b["id"]])).delete(synchronize_session=False)
    db_session.commit()


def test_se_crea_con_numero(api, escenario):
    assert escenario["a"]["numero"] == 91001


def test_cambiar_el_numero_repercute_en_todas_sus_marcas(api, escenario):
    r = api.put(f"/api/razones-sociales/{escenario['a']['id']}", json={"numero": 91999})
    assert r.status_code == 200, r.text
    assert r.json()["numero"] == 91999

    res = api.get("/api/clientes", params={"search": "PYTEST EDITNUM ", "per_page": 100})
    assert {c["id_cliente"] for c in res.json()["data"]} == {91999}


def test_despues_de_cambiarlo_se_busca_por_el_numero_nuevo(api, escenario):
    api.put(f"/api/razones-sociales/{escenario['a']['id']}", json={"numero": 91999})
    res = api.get("/api/clientes", params={"search": "91999", "per_page": 100})
    assert {c["marca"] for c in res.json()["data"]} == {"PYTEST EDITNUM ALFA", "PYTEST EDITNUM BETA"}


def test_rechaza_un_numero_ya_usado_por_otra_razon_social(api, escenario):
    r = api.put(f"/api/razones-sociales/{escenario['a']['id']}", json={"numero": 91002})
    assert r.status_code == 409, r.text
    assert RS_B in r.json()["detail"], "el error dice con cuál choca"


def test_guardar_su_propio_numero_no_es_conflicto(api, escenario):
    r = api.put(f"/api/razones-sociales/{escenario['a']['id']}", json={"numero": 91001})
    assert r.status_code == 200, r.text


def test_rechaza_numeros_invalidos(api, escenario):
    for malo in (0, -5):
        r = api.put(f"/api/razones-sociales/{escenario['a']['id']}", json={"numero": malo})
        assert r.status_code == 422, f"{malo} deberia rechazarse, dio {r.status_code}"


def test_se_puede_borrar_el_numero(api, escenario):
    r = api.put(f"/api/razones-sociales/{escenario['a']['id']}", json={"numero": None})
    assert r.status_code == 200, r.text
    assert r.json()["numero"] is None

    # Sin N° de entidad legal, cada marca vuelve a mostrar el suyo.
    res = api.get("/api/clientes", params={"search": "PYTEST EDITNUM ", "per_page": 100})
    assert {c["id_cliente"] for c in res.json()["data"]} == {91050, 91060}


def test_editar_el_nombre_no_pisa_el_numero(api, escenario):
    r = api.put(f"/api/razones-sociales/{escenario['a']['id']}", json={"razon_social": RS_A + " BIS"})
    assert r.status_code == 200, r.text
    assert r.json()["numero"] == 91001, "no mandar 'numero' no debe borrarlo"


def test_el_error_de_numero_repetido_explica_como_sumar_una_marca(api, escenario):
    """El choque más común es querer sumar una marca a una empresa que ya existe.
    El mensaje tiene que decir adónde ir, no sólo qué está prohibido."""
    r = api.put(f"/api/razones-sociales/{escenario['a']['id']}", json={"numero": 91002})
    assert r.status_code == 409
    detalle = r.json()["detail"]
    assert RS_B in detalle, "dice de quién es el número"
    assert "Nuevo cliente" in detalle, "dice adónde ir a sumar la marca"
