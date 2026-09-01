"""Integración: el N° de cliente lo manda la RAZÓN SOCIAL, no la marca.

Etiplast numera por entidad legal: todas las marcas de una misma razón social
comparten un solo N° de cliente (caso real: Bahia Jugos S.R.L → 226 para
Jubahi, Winsey y Cooperativa). `Cliente.to_dict()` ya aplica esa regla; el
detalle de razón social devolvía el número crudo de cada marca y contradecía
al resto del sistema.
"""
import pytest

RS = "PYTEST NUMERO COMPARTIDO S.R.L"
NUMERO_RS = 90001


@pytest.fixture()
def grupo(api, db_session):
    """Dos marcas bajo la misma razón social, con id_cliente distintos."""
    ids = []
    for marca, id_cli in [("PYTEST NUM ALFA", 90050), ("PYTEST NUM BETA", 90060)]:
        r = api.post("/api/clientes", json={"marca": marca, "razon_social": RS, "id_cliente": id_cli})
        assert r.status_code == 201, r.text
        ids.append(r.json()["id"])

    from models import Cliente, RazonSocial
    rs = db_session.query(RazonSocial).filter(RazonSocial.razon_social == RS).one()
    rs.numero = NUMERO_RS                      # el N° oficial de la entidad legal
    db_session.commit()
    yield {"rs_id": rs.id, "clientes": ids}

    for cid in ids:
        api.delete(f"/api/clientes/{cid}")
    db_session.query(RazonSocial).filter(RazonSocial.id == rs.id).delete()
    db_session.commit()


def test_el_listado_muestra_el_numero_de_la_razon_social(api, grupo):
    r = api.get("/api/clientes", params={"search": "PYTEST NUM ", "per_page": 100})
    assert r.status_code == 200, r.text
    numeros = {c["id_cliente"] for c in r.json()["data"]}
    assert numeros == {NUMERO_RS}, "las dos marcas comparten el N° de la razón social"


def test_la_ficha_muestra_el_numero_de_la_razon_social(api, grupo):
    for cid in grupo["clientes"]:
        r = api.get(f"/api/clientes/{cid}")
        assert r.status_code == 200
        assert r.json()["id_cliente"] == NUMERO_RS


def test_el_detalle_de_razon_social_usa_el_mismo_numero(api, grupo):
    """Esta es la pantalla que contradecía al resto: mostraba el N° por marca."""
    r = api.get(f"/api/razones-sociales/{grupo['rs_id']}")
    assert r.status_code == 200, r.text
    marcas = r.json()["marcas"]
    assert len(marcas) == 2
    assert {m["id_cliente"] for m in marcas} == {NUMERO_RS}


def test_sin_numero_en_la_razon_social_cae_al_de_la_marca(api, db_session, grupo):
    """Si la entidad legal no tiene N° cargado, se sigue viendo el de cada marca."""
    from models import RazonSocial
    rs = db_session.query(RazonSocial).filter(RazonSocial.id == grupo["rs_id"]).one()
    rs.numero = None
    db_session.commit()

    r = api.get(f"/api/razones-sociales/{grupo['rs_id']}")
    assert {m["id_cliente"] for m in r.json()["marcas"]} == {90050, 90060}


def _marcas_buscando(api, termino):
    r = api.get("/api/clientes", params={"search": str(termino), "per_page": 100})
    assert r.status_code == 200, r.text
    return {c["marca"] for c in r.json()["data"]}


def test_buscar_por_el_numero_compartido_trae_todas_las_marcas(api, grupo):
    """Si en pantalla dice 226, tipear 226 tiene que traer las 3 marcas."""
    assert _marcas_buscando(api, NUMERO_RS) == {"PYTEST NUM ALFA", "PYTEST NUM BETA"}


def test_no_se_busca_por_el_numero_interno_de_la_marca(api, grupo):
    """Sólo se busca por el N° de la razón social — el que se ve en pantalla.

    El id_cliente interno (90050/90060) existe para diferenciar las marcas por
    dentro, pero NO es un número buscable: si lo fuera, un mismo cliente se
    encontraría con dos números distintos y ninguno sabría cuál es el bueno.
    """
    assert _marcas_buscando(api, 90050) == set()
    assert _marcas_buscando(api, 90060) == set()


def test_el_cliente_sin_razon_social_se_busca_por_su_propio_numero(api):
    """Sin entidad legal detrás, el número de la marca ES el que se muestra."""
    r = api.post("/api/clientes", json={"marca": "PYTEST NUM SUELTO", "id_cliente": 90070})
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    try:
        assert _marcas_buscando(api, 90070) == {"PYTEST NUM SUELTO"}
    finally:
        api.delete(f"/api/clientes/{cid}")


def test_la_orden_de_trabajo_muestra_el_numero_de_la_razon_social(api, db_session, grupo):
    """La misma marca no puede mostrar un N° en Clientes y otro en su orden."""
    from models import OrdenTrabajo
    orden = OrdenTrabajo(numero="OT-PYTEST-NUM", cliente_id=grupo["clientes"][0])
    db_session.add(orden)
    db_session.commit()
    try:
        r = api.get(f"/api/ordenes/{orden.id}")
        assert r.status_code == 200, r.text
        assert r.json()["cliente_numero"] == NUMERO_RS
    finally:
        db_session.query(OrdenTrabajo).filter(OrdenTrabajo.id == orden.id).delete()
        db_session.commit()
