"""Integración: la búsqueda de clientes ignora los puntos de la forma jurídica.

En la base conviven las dos escrituras: 67 razones sociales usan "S.R.L" y 26
usan "SRL". Con un ILIKE crudo, el que escribe una forma no encuentra a los de
la otra — y las marcas que comparten razón social quedan invisibles.
"""
import pytest

RS = "PYTEST BUSQUEDA JUGOS S.R.L"
MARCAS = ["PYTEST BUSCA ALFA", "PYTEST BUSCA BETA", "PYTEST BUSCA GAMMA"]


@pytest.fixture()
def hermanas(api):
    """Tres marcas distintas colgadas de la MISMA razón social (caso Bahia Jugos)."""
    ids = []
    for marca in MARCAS:
        r = api.post("/api/clientes", json={"marca": marca, "razon_social": RS})
        assert r.status_code == 201, r.text
        ids.append(r.json()["id"])
    yield ids
    for cid in ids:
        api.delete(f"/api/clientes/{cid}")


def _buscar(api, termino):
    r = api.get("/api/clientes", params={"search": termino, "per_page": 100})
    assert r.status_code == 200, r.text
    return {c["marca"] for c in r.json()["data"]}


def test_encuentra_escribiendo_igual_que_la_base(api, hermanas):
    assert _buscar(api, "PYTEST BUSQUEDA JUGOS S.R.L") == set(MARCAS)


def test_encuentra_escribiendo_srl_sin_puntos(api, hermanas):
    """El usuario escribe 'SRL' y la base dice 'S.R.L' — tiene que encontrarlas igual."""
    assert _buscar(api, "PYTEST BUSQUEDA JUGOS SRL") == set(MARCAS)


def test_encuentra_al_reves_con_puntos_de_mas(api, hermanas):
    """Y al revés: puntos de más en lo que se tipea tampoco deben romper la busqueda."""
    assert _buscar(api, "PYTEST BUSQUEDA JUGOS S.R.L.") == set(MARCAS)


def test_la_razon_social_compartida_trae_todas_las_marcas(api, hermanas):
    """Buscar por la razón social devuelve las 3 marcas, no una sola."""
    assert len(_buscar(api, "PYTEST BUSQUEDA JUGOS")) == 3


def test_no_afecta_la_busqueda_por_marca(api, hermanas):
    assert _buscar(api, "PYTEST BUSCA BETA") == {"PYTEST BUSCA BETA"}
