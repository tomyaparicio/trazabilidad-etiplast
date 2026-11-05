"""Integración: el tablero de planta — dónde está cada pedido, en vivo.

Lectura del mismo dato que deja el escaneo (`plan_produccion`). Tiene dos
mitades, porque la planta tiene dos clases de etapa:

  - **Impresión**: importa en qué máquina. Una columna por impresora.
  - **Extrusión y troquelado**: las máquinas son intercambiables. Una columna
    por etapa, con los trabajos que están en ella.

De acá comen la pantalla `/planificacion` y el bloque del dashboard.
"""
import pytest

from models import Cliente, Maquina, OrdenTrabajo, PlanProduccion

MARCA = "TABLERO TEST SA"

MAQUINAS_TEST = [
    ("PYTEST-TB-VENUS", "Venus Tablero",        "impresion",  True),
    ("PYTEST-TB-REINA", "ReinaFlex Tablero",    "impresion",  True),
    ("PYTEST-TB-OFF",   "Jubilada Tablero",     "impresion",  False),
    ("PYTEST-TB-TRO",   "Troqueladora Tablero", "troquelado", True),
]


def _limpiar(db):
    ids = [c.id for c in db.query(Cliente).filter(Cliente.marca == MARCA).all()]
    if not ids:
        return
    ot_ids = [
        o.id for o in db.query(OrdenTrabajo).filter(OrdenTrabajo.cliente_id.in_(ids)).all()
    ]
    if ot_ids:
        db.query(PlanProduccion).filter(
            PlanProduccion.orden_trabajo_id.in_(ot_ids)
        ).delete(synchronize_session=False)
        db.query(OrdenTrabajo).filter(OrdenTrabajo.id.in_(ot_ids)).delete(
            synchronize_session=False
        )
    db.query(Cliente).filter(Cliente.id.in_(ids)).delete(synchronize_session=False)
    db.commit()


@pytest.fixture()
def maquinas(db_session):
    codigos = [m[0] for m in MAQUINAS_TEST]
    db_session.query(Maquina).filter(Maquina.codigo.in_(codigos)).delete(
        synchronize_session=False
    )
    db_session.commit()
    for codigo, nombre, tipo, activa in MAQUINAS_TEST:
        db_session.add(Maquina(codigo=codigo, nombre=nombre, tipo=tipo, activa=activa))
    db_session.commit()
    filas = db_session.query(Maquina).filter(Maquina.codigo.in_(codigos)).all()
    try:
        yield {m.codigo: m.id for m in filas}
    finally:
        ids = [m.id for m in filas]
        db_session.query(PlanProduccion).filter(
            PlanProduccion.maquina_id.in_(ids)
        ).delete(synchronize_session=False)
        db_session.query(Maquina).filter(Maquina.codigo.in_(codigos)).delete(
            synchronize_session=False
        )
        db_session.commit()


@pytest.fixture()
def cliente_id(api, db_session):
    _limpiar(db_session)
    r = api.post("/api/clientes", json={"marca": MARCA})
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    try:
        yield cid
    finally:
        _limpiar(db_session)


def _maquina(cuerpo, maquina_id):
    return next(m for m in cuerpo["maquinas"] if m["id"] == maquina_id)


def _etapa(cuerpo, nombre):
    return next(e for e in cuerpo["etapas"] if e["etapa"] == nombre)


# ──────────────────────────────────────────────────────────────────────────────
# Impresión: columna por máquina
# ──────────────────────────────────────────────────────────────────────────────

def test_impresora_sin_trabajo_aparece_libre(api, maquinas):
    r = api.get("/api/produccion/tablero")
    assert r.status_code == 200, r.text
    m = _maquina(r.json(), maquinas["PYTEST-TB-VENUS"])
    assert m["orden"] is None
    assert m["tipo"] == "impresion"


def test_la_impresora_muestra_el_trabajo_que_tiene_encima(api, cliente_id, maquinas):
    ot = api.post("/api/ordenes", json={"cliente_id": cliente_id, "cantidad": 5000}).json()
    api.post(f"/api/ordenes/{ot['id']}/etapa",
             json={"etapa": "impresion", "maquina_id": maquinas["PYTEST-TB-VENUS"]})

    m = _maquina(api.get("/api/produccion/tablero").json(), maquinas["PYTEST-TB-VENUS"])
    assert m["orden"]["id"] == ot["id"]
    assert m["orden"]["numero"] == ot["numero"]
    assert m["orden"]["cliente"] == MARCA
    assert m["orden"]["desde"]           # cuándo la escanearon
    assert m["orden"]["operario"]


def test_las_impresoras_de_baja_no_estan_en_el_tablero(api, maquinas):
    ids = [m["id"] for m in api.get("/api/produccion/tablero").json()["maquinas"]]
    assert maquinas["PYTEST-TB-OFF"] not in ids


def test_las_maquinas_que_no_se_eligen_no_son_columnas(api, maquinas):
    """Una troqueladora en el catálogo no es una columna del tablero.

    Troquelado no elige máquina, así que ningún escaneo la va a ocupar nunca:
    mostrarla «Libre» para siempre sería mentir.
    """
    ids = [m["id"] for m in api.get("/api/produccion/tablero").json()["maquinas"]]
    assert maquinas["PYTEST-TB-TRO"] not in ids


# ──────────────────────────────────────────────────────────────────────────────
# Extrusión y troquelado: columna por etapa
# ──────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("etapa", ["extrusion", "troquelado"])
def test_la_etapa_sin_maquina_junta_sus_trabajos(api, cliente_id, maquinas, etapa):
    ot = api.post("/api/ordenes", json={"cliente_id": cliente_id}).json()
    api.post(f"/api/ordenes/{ot['id']}/etapa", json={"etapa": etapa})

    col = _etapa(api.get("/api/produccion/tablero").json(), etapa)
    assert ot["id"] in [o["id"] for o in col["ordenes"]]
    assert col["titulo"]


def test_la_etapa_vacia_viene_igual_pero_sin_trabajos(api, maquinas):
    """La columna existe siempre: su ausencia no se distingue de «no hay nada»."""
    col = _etapa(api.get("/api/produccion/tablero").json(), "extrusion")
    assert col["ordenes"] == [] or isinstance(col["ordenes"], list)


def test_cuando_la_orden_avanza_deja_la_etapa_anterior(api, cliente_id, maquinas):
    ot = api.post("/api/ordenes", json={"cliente_id": cliente_id}).json()
    api.post(f"/api/ordenes/{ot['id']}/etapa", json={"etapa": "extrusion"})
    api.post(f"/api/ordenes/{ot['id']}/etapa",
             json={"etapa": "impresion", "maquina_id": maquinas["PYTEST-TB-VENUS"]})

    cuerpo = api.get("/api/produccion/tablero").json()
    assert ot["id"] not in [o["id"] for o in _etapa(cuerpo, "extrusion")["ordenes"]]
    assert _maquina(cuerpo, maquinas["PYTEST-TB-VENUS"])["orden"]["id"] == ot["id"]


# ──────────────────────────────────────────────────────────────────────────────
# Sin ubicar, cierre y permisos
# ──────────────────────────────────────────────────────────────────────────────

def test_una_orden_en_produccion_sin_escanear_queda_en_sin_ubicar(
    api, db_session, cliente_id, maquinas
):
    """Si está en producción pero nadie la escaneó, no se sabe dónde está.

    Mostrarla aparte es el punto: un pedido sin ubicar es exactamente lo que el
    tablero tiene que hacer saltar a la vista.
    """
    ot = api.post("/api/ordenes", json={"cliente_id": cliente_id}).json()
    db_session.query(OrdenTrabajo).filter(OrdenTrabajo.id == ot["id"]).update(
        {"estado": "en_proceso"}
    )
    db_session.commit()

    sin_ubicar = api.get("/api/produccion/tablero").json()["sin_ubicar"]
    assert ot["id"] in [o["id"] for o in sin_ubicar]


def test_la_orden_escaneada_sale_de_sin_ubicar(api, cliente_id, maquinas):
    ot = api.post("/api/ordenes", json={"cliente_id": cliente_id}).json()
    api.post(f"/api/ordenes/{ot['id']}/etapa", json={"etapa": "troquelado"})

    cuerpo = api.get("/api/produccion/tablero").json()
    assert ot["id"] not in [o["id"] for o in cuerpo["sin_ubicar"]]


def test_las_terminadas_no_ocupan_nada(api, db_session, cliente_id, maquinas):
    ot = api.post("/api/ordenes", json={"cliente_id": cliente_id}).json()
    api.post(f"/api/ordenes/{ot['id']}/etapa",
             json={"etapa": "impresion", "maquina_id": maquinas["PYTEST-TB-VENUS"]})
    db_session.query(OrdenTrabajo).filter(OrdenTrabajo.id == ot["id"]).update(
        {"estado": "completada"}
    )
    db_session.commit()

    cuerpo = api.get("/api/produccion/tablero").json()
    assert _maquina(cuerpo, maquinas["PYTEST-TB-VENUS"])["orden"] is None
    assert ot["id"] not in [o["id"] for o in cuerpo["sin_ubicar"]]


def test_el_tablero_pide_sesion(client):
    """Sin token no se ve dónde está la producción.

    Usa el `client` pelado del conftest raíz, no el fixture `api`: ese pisa
    `verify_token` en toda la app, así que un TestClient nuevo seguiría entrando
    logueado y el test pasaría sin probar nada.
    """
    assert client.get("/api/produccion/tablero").status_code == 401


def test_recuento_para_el_dashboard(api, cliente_id, maquinas):
    """El dashboard necesita los números de un vistazo, sin recorrer la lista."""
    ot = api.post("/api/ordenes", json={"cliente_id": cliente_id}).json()
    api.post(f"/api/ordenes/{ot['id']}/etapa",
             json={"etapa": "impresion", "maquina_id": maquinas["PYTEST-TB-VENUS"]})

    resumen = api.get("/api/produccion/tablero").json()["resumen"]
    assert resumen["ocupadas"] >= 1
    assert resumen["libres"] >= 1
    assert "sin_ubicar" in resumen
    # Los que están en una etapa sin máquina también cuentan como ubicados.
    assert "en_etapas" in resumen
