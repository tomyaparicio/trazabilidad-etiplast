"""Integración: el listado cuenta CLIENTES, no filas.

GET /api/clientes une `cliente_productos` (1:N). Sin cuidado, un cliente con 3
presentaciones se cuenta 3 veces: el total miente y el LIMIT/OFFSET se come
clientes de la página. Estos tests fijan que el total y la página coincidan
con la cantidad real de clientes.
"""
import pytest

MARCA = "PYTEST LISTADO FANOUT"
RS = "PYTEST LISTADO FANOUT SA"
PRODUCTOS = ["Agua x 500 cc", "Agua x 1,5 lt", "Soda x 2 lt"]


@pytest.fixture()
def cliente_con_productos(api):
    r = api.post("/api/clientes", json={"marca": MARCA, "razon_social": RS})
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    for nombre in PRODUCTOS:
        assert api.post(f"/api/clientes/{cid}/productos", json={"nombre": nombre}).status_code == 201
    yield cid
    api.delete(f"/api/clientes/{cid}")


def _listar(api, **params):
    r = api.get("/api/clientes", params={"per_page": 100, **params})
    assert r.status_code == 200, r.text
    return r.json()


def test_total_no_se_infla_por_las_presentaciones(api, cliente_con_productos):
    """Un cliente con 3 presentaciones es UN cliente, no tres."""
    res = _listar(api, razon_social=RS)
    assert len(res["data"]) == 1
    assert res["total"] == 1, "el total cuenta clientes, no filas del join a productos"


def test_la_pagina_devuelve_tantos_clientes_como_dice_el_total(api, cliente_con_productos):
    """Si el join duplica filas, el LIMIT se llena de repetidos y la página queda corta."""
    res = _listar(api, per_page=20, page=1)
    assert len(res["data"]) == min(20, res["total"])
    ids = [c["id"] for c in res["data"]]
    assert len(ids) == len(set(ids)), "la página no repite clientes"


def test_la_busqueda_por_producto_sigue_encontrando_al_cliente(api, cliente_con_productos):
    """El join existía para buscar por nombre de producto — eso no se pierde."""
    res = _listar(api, search="Soda x 2 lt")
    marcas = {c["marca"] for c in res["data"]}
    assert MARCA in marcas
    assert res["total"] == len(res["data"])
