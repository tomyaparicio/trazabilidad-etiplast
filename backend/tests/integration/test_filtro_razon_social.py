"""Integración: filtro por razón social en GET /api/clientes.

Cubre:
  - filtrar por una razón social concreta (viene del catálogo `razones_sociales`)
  - filtrar los clientes que NO tienen razón social (centinela "__sin__")
  - clientes legacy, que guardan la razón social como texto libre sin `razon_social_id`
  - el catálogo de razones sociales que alimenta el <select> del front
"""
import pytest

PREFIJO = "PYTEST RSFILTER"
RS_UNO = "PYTEST RS UNO SA"
RS_DOS = "PYTEST RS DOS SA"
RS_LEGACY = "PYTEST RS LEGACY SA"


def _crear(api, marca, razon_social=None):
    body = {"marca": marca}
    if razon_social:
        body["razon_social"] = razon_social
    r = api.post("/api/clientes", json=body)
    assert r.status_code == 201, r.text
    return r.json()["id"]


@pytest.fixture()
def cartera(api):
    """Tres clientes: dos con razón social distinta y uno sin ninguna."""
    ids = {
        "alfa":  _crear(api, f"{PREFIJO} ALFA", RS_UNO),
        "beta":  _crear(api, f"{PREFIJO} BETA", RS_DOS),
        "gamma": _crear(api, f"{PREFIJO} GAMMA"),
    }
    yield ids
    for cid in ids.values():
        api.delete(f"/api/clientes/{cid}")


def _marcas(api, **params):
    """Marcas que devuelve el listado, acotado siempre a la cartera de prueba."""
    params.setdefault("search", PREFIJO)
    params.setdefault("per_page", 100)
    r = api.get("/api/clientes", params=params)
    assert r.status_code == 200, r.text
    return {c["marca"] for c in r.json()["data"]}


def test_sin_filtro_trae_toda_la_cartera(api, cartera):
    assert _marcas(api) == {f"{PREFIJO} {m}" for m in ("ALFA", "BETA", "GAMMA")}


def test_filtra_por_razon_social(api, cartera):
    assert _marcas(api, razon_social=RS_UNO) == {f"{PREFIJO} ALFA"}
    assert _marcas(api, razon_social=RS_DOS) == {f"{PREFIJO} BETA"}


def test_filtra_las_que_no_tienen_razon_social(api, cartera):
    assert _marcas(api, razon_social="__sin__") == {f"{PREFIJO} GAMMA"}


def test_razon_social_inexistente_no_trae_nada(api, cartera):
    assert _marcas(api, razon_social="NO EXISTE ESTA RAZON SOCIAL SA") == set()


def test_filtra_razon_social_legacy_sin_catalogo(api, cartera, db_session):
    """Los clientes viejos tienen la razón social como texto libre, sin FK al catálogo."""
    from models import Cliente
    c = db_session.query(Cliente).filter(Cliente.id == cartera["gamma"]).first()
    c.razon_social = RS_LEGACY
    c.razon_social_id = None
    db_session.commit()

    assert _marcas(api, razon_social=RS_LEGACY) == {f"{PREFIJO} GAMMA"}
    # y ya no cuenta como "sin razón social"
    assert _marcas(api, razon_social="__sin__") == set()


def test_catalogo_de_filtros_expone_razones_sociales(api, cartera):
    r = api.get("/api/dashboard/filtros")
    assert r.status_code == 200, r.text
    rs = r.json()["razones_sociales"]

    assert RS_UNO in rs and RS_DOS in rs
    assert rs == sorted(rs, key=str.upper), "el catálogo llega ordenado alfabéticamente"
    assert len(rs) == len(set(rs)), "el catálogo no repite razones sociales"
