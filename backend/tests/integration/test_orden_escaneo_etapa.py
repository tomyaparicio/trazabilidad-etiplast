"""Integración: el escaneo del QR que mueve la orden por la planta.

El operario escanea el QR de la ficha ANTES de empezar su paso. Ese escaneo es
el único evento del sistema: de ahí sale dónde está cada pedido.

La regla que manda este módulo: **sólo IMPRESIÓN elige máquina.** Venus,
ReinaFlex, Taurus y la Autoadhesiva hacen cosas distintas, así que ahí importa
cuál. En extrusión y troquelado las máquinas son intercambiables — lo que
importa es que la etapa pasó, no en cuál de ellas.
"""
import pytest

from models import AuditLog, Cliente, Maquina, OrdenTrabajo, PlanProduccion

MARCA = "OTQR TEST SA"

# Parque del test: códigos que no pisan el catálogo real.
MAQUINAS_TEST = [
    ("PYTEST-QR-VENUS", "Venus Pytest",        "impresion",  True),
    ("PYTEST-QR-REINA", "ReinaFlex Pytest",    "impresion",  True),
    ("PYTEST-QR-VIEJA", "Impresora Jubilada",  "impresion",  False),
    ("PYTEST-QR-TRO",   "Troqueladora Pytest", "troquelado", True),
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


@pytest.fixture()
def orden(api, cliente_id):
    """Una OT en borrador, como queda recién cargada desde la oficina."""
    r = api.post("/api/ordenes", json={"cliente_id": cliente_id, "cantidad": 20000})
    assert r.status_code == 201, r.text
    return r.json()


def _pases(db, orden_id):
    return (
        db.query(PlanProduccion)
        .filter(PlanProduccion.orden_trabajo_id == orden_id)
        .order_by(PlanProduccion.id)
        .all()
    )


# ──────────────────────────────────────────────────────────────────────────────
# Impresión: la única etapa que elige máquina
# ──────────────────────────────────────────────────────────────────────────────

def test_impresion_registra_en_que_maquina(api, db_session, orden, maquinas):
    r = api.post(
        f"/api/ordenes/{orden['id']}/etapa",
        json={"etapa": "impresion", "maquina_id": maquinas["PYTEST-QR-VENUS"]},
    )
    assert r.status_code == 201, r.text

    filas = _pases(db_session, orden["id"])
    assert len(filas) == 1
    assert filas[0].maquina_id == maquinas["PYTEST-QR-VENUS"]
    assert filas[0].etapa == "impresion"
    assert filas[0].estado == "en_curso"
    # `created_at` es TIMESTAMPTZ y se llena solo: ahí está el momento del escaneo.
    assert filas[0].created_at is not None


def test_impresion_sin_maquina_no_se_puede(api, orden, maquinas):
    """Es la única etapa donde la máquina es obligatoria."""
    r = api.post(f"/api/ordenes/{orden['id']}/etapa", json={"etapa": "impresion"})
    assert r.status_code == 400
    assert "quina" in r.json()["detail"].lower()   # «máquina», sin depender del acento


def test_no_se_imprime_en_una_troqueladora(api, orden, maquinas):
    r = api.post(
        f"/api/ordenes/{orden['id']}/etapa",
        json={"etapa": "impresion", "maquina_id": maquinas["PYTEST-QR-TRO"]},
    )
    assert r.status_code == 400
    assert "impresion" in r.json()["detail"].lower()


def test_no_se_imprime_en_una_maquina_dada_de_baja(api, orden, maquinas):
    r = api.post(
        f"/api/ordenes/{orden['id']}/etapa",
        json={"etapa": "impresion", "maquina_id": maquinas["PYTEST-QR-VIEJA"]},
    )
    assert r.status_code == 400


def test_maquina_inexistente(api, orden):
    r = api.post(
        f"/api/ordenes/{orden['id']}/etapa",
        json={"etapa": "impresion", "maquina_id": 99999999},
    )
    assert r.status_code == 400


def test_una_orden_nueva_libera_la_impresora_de_la_anterior(
    api, db_session, cliente_id, maquinas
):
    """Venus toma otro trabajo: el que estaba ahí deja de ocuparla."""
    primera = api.post("/api/ordenes", json={"cliente_id": cliente_id}).json()
    segunda = api.post("/api/ordenes", json={"cliente_id": cliente_id}).json()

    for ot in (primera, segunda):
        r = api.post(
            f"/api/ordenes/{ot['id']}/etapa",
            json={"etapa": "impresion", "maquina_id": maquinas["PYTEST-QR-VENUS"]},
        )
        assert r.status_code == 201, r.text

    estados = {
        f.orden_trabajo_id: f.estado
        for f in db_session.query(PlanProduccion)
        .filter(PlanProduccion.maquina_id == maquinas["PYTEST-QR-VENUS"])
        .all()
    }
    assert estados[primera["id"]] == "terminada"
    assert estados[segunda["id"]] == "en_curso"


# ──────────────────────────────────────────────────────────────────────────────
# Extrusión y troquelado: sólo el estado, sin máquina
# ──────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("etapa", ["extrusion", "troquelado"])
def test_las_otras_etapas_se_escanean_sin_elegir_maquina(
    api, db_session, orden, etapa
):
    """Las máquinas de estas etapas son intercambiables: no se elige ninguna."""
    r = api.post(f"/api/ordenes/{orden['id']}/etapa", json={"etapa": etapa})
    assert r.status_code == 201, r.text
    assert r.json()["maquina"] is None

    filas = _pases(db_session, orden["id"])
    assert len(filas) == 1
    assert filas[0].etapa == etapa
    assert filas[0].maquina_id is None
    assert filas[0].estado == "en_curso"


def test_si_mandan_maquina_en_una_etapa_que_no_la_usa_se_ignora(
    api, db_session, orden, maquinas
):
    """Guardarla sería inventar un dato que nadie eligió."""
    r = api.post(
        f"/api/ordenes/{orden['id']}/etapa",
        json={"etapa": "troquelado", "maquina_id": maquinas["PYTEST-QR-TRO"]},
    )
    assert r.status_code == 201, r.text
    assert r.json()["maquina"] is None
    assert _pases(db_session, orden["id"])[0].maquina_id is None


def test_el_ultimo_escaneo_es_donde_esta_la_orden(api, db_session, orden, maquinas):
    """Extrusión → impresión: el paso anterior se cierra."""
    assert api.post(
        f"/api/ordenes/{orden['id']}/etapa", json={"etapa": "extrusion"}
    ).status_code == 201
    assert api.post(
        f"/api/ordenes/{orden['id']}/etapa",
        json={"etapa": "impresion", "maquina_id": maquinas["PYTEST-QR-VENUS"]},
    ).status_code == 201

    filas = _pases(db_session, orden["id"])
    assert [f.etapa for f in filas] == ["extrusion", "impresion"]
    assert filas[0].estado == "terminada"
    assert filas[1].estado == "en_curso"


# ──────────────────────────────────────────────────────────────────────────────
# La ficha de siempre se sigue llenando
# ──────────────────────────────────────────────────────────────────────────────

def test_el_escaneo_llena_los_campos_que_hoy_se_escriben_a_mano(
    api, db_session, orden, maquinas
):
    """`fecha_*`, `operador_*` y `*_maquina` es lo que hoy se anota en el papel
    y nunca vuelve al sistema. El escaneo los completa solo."""
    r = api.post(
        f"/api/ordenes/{orden['id']}/etapa",
        json={"etapa": "impresion", "maquina_id": maquinas["PYTEST-QR-VENUS"]},
    )
    assert r.status_code == 201, r.text

    db_session.expire_all()
    ot = db_session.query(OrdenTrabajo).get(orden["id"])
    assert ot.fecha_impresion is not None
    assert ot.impresion_maquina == "Venus Pytest"
    assert ot.operador_impresion  # el nombre de quien escaneó, no vacío


def test_una_etapa_sin_maquina_no_pisa_el_campo_de_maquina(
    api, db_session, orden
):
    """Troquelar no elige máquina, así que no tiene por qué borrar lo que haya."""
    db_session.query(OrdenTrabajo).filter(OrdenTrabajo.id == orden["id"]).update(
        {"troquelado_maquina": "Lo que cargó la oficina"}
    )
    db_session.commit()

    api.post(f"/api/ordenes/{orden['id']}/etapa", json={"etapa": "troquelado"})

    db_session.expire_all()
    ot = db_session.query(OrdenTrabajo).get(orden["id"])
    assert ot.troquelado_maquina == "Lo que cargó la oficina"
    assert ot.fecha_troquelado is not None
    assert ot.operador_troquelado


def test_el_primer_escaneo_arranca_la_produccion_y_genera_el_lote(
    api, db_session, orden
):
    assert orden["estado"] == "borrador"
    assert not orden.get("lote")

    assert api.post(
        f"/api/ordenes/{orden['id']}/etapa", json={"etapa": "extrusion"}
    ).status_code == 201

    db_session.expire_all()
    ot = db_session.query(OrdenTrabajo).get(orden["id"])
    assert ot.estado == "en_proceso"
    assert ot.lote and ot.lote.startswith("L-")


def test_escanear_troquelado_no_da_la_orden_por_terminada(api, db_session, orden):
    """Empezar a troquelar no es haber terminado: cerrar la orden sigue siendo
    una decisión de la oficina, no se infiere del último escaneo."""
    api.post(f"/api/ordenes/{orden['id']}/etapa", json={"etapa": "troquelado"})
    db_session.expire_all()
    assert db_session.query(OrdenTrabajo).get(orden["id"]).estado == "en_proceso"


# ──────────────────────────────────────────────────────────────────────────────
# Lo que no se puede escanear
# ──────────────────────────────────────────────────────────────────────────────

def test_etapa_invalida(api, orden):
    r = api.post(f"/api/ordenes/{orden['id']}/etapa", json={"etapa": "embalaje"})
    assert r.status_code in (400, 422)


def test_orden_inexistente(api):
    r = api.post("/api/ordenes/99999999/etapa", json={"etapa": "extrusion"})
    assert r.status_code == 404


def test_orden_cancelada_no_se_escanea(api, db_session, orden):
    db_session.query(OrdenTrabajo).filter(OrdenTrabajo.id == orden["id"]).update(
        {"estado": "cancelada"}
    )
    db_session.commit()
    r = api.post(f"/api/ordenes/{orden['id']}/etapa", json={"etapa": "extrusion"})
    assert r.status_code == 409


# ──────────────────────────────────────────────────────────────────────────────
# Quién escaneó
# ──────────────────────────────────────────────────────────────────────────────

def test_quien_escaneo_sale_del_token_y_no_del_body(api, db_session, orden, admin):
    """El body manda `created_by` de otro usuario: se ignora.

    Si la atribución saliera del request, cualquiera podría firmar el trabajo a
    nombre de otro. Sale del token, siempre.
    """
    r = api.post(
        f"/api/ordenes/{orden['id']}/etapa",
        json={"etapa": "extrusion", "created_by": 999999},
    )
    assert r.status_code == 201, r.text
    assert _pases(db_session, orden["id"])[0].created_by == admin["id"]


def test_el_escaneo_queda_auditado(api, db_session, orden, maquinas):
    api.post(
        f"/api/ordenes/{orden['id']}/etapa",
        json={"etapa": "impresion", "maquina_id": maquinas["PYTEST-QR-VENUS"]},
    )
    log = (
        db_session.query(AuditLog)
        .filter(AuditLog.entidad == "orden_trabajo", AuditLog.entidad_id == orden["id"])
        .order_by(AuditLog.id.desc())
        .first()
    )
    assert log is not None
    assert "impresion" in (log.descripcion or "").lower()


# ──────────────────────────────────────────────────────────────────────────────
# Qué se está haciendo
# ──────────────────────────────────────────────────────────────────────────────

def test_la_orden_dice_que_producto_es(api, db_session, cliente_id):
    """El que está en la máquina tiene que saber QUÉ está haciendo.

    `to_dict` resolvía el producto y después no lo devolvía: la variable quedaba
    sin usar y ni la ficha impresa ni la pantalla del escaneo sabían el nombre.
    """
    from models import ClienteProducto

    prod = ClienteProducto(cliente_id=cliente_id, nombre="Jugo x 1500 cc")
    db_session.add(prod)
    db_session.commit()
    db_session.refresh(prod)

    ot = api.post(
        "/api/ordenes",
        json={"cliente_id": cliente_id, "cliente_producto_id": prod.id},
    ).json()

    assert api.get(f"/api/ordenes/{ot['id']}").json()["producto_nombre"] == "Jugo x 1500 cc"


def test_orden_sin_producto_no_rompe(api, cliente_id):
    ot = api.post("/api/ordenes", json={"cliente_id": cliente_id}).json()
    assert api.get(f"/api/ordenes/{ot['id']}").json()["producto_nombre"] is None


def test_la_orden_avisa_si_la_muestra_no_esta_aprobada(api, db_session, cliente_id):
    """`muestra` vale OK o NOOK en la ficha del producto.

    Hay 10 productos con NOOK en la base. Mandar a imprimir 20.000 etiquetas de
    uno de esos es tirar el trabajo, y hasta ahora la ficha no lo decía en
    ningún lado: el dato existía y la API no lo devolvía.
    """
    from models import ClienteProducto

    prod = ClienteProducto(cliente_id=cliente_id, nombre="Jugo rechazado", muestra="NOOK")
    db_session.add(prod)
    db_session.commit()
    db_session.refresh(prod)

    ot = api.post("/api/ordenes", json={"cliente_id": cliente_id,
                                        "cliente_producto_id": prod.id}).json()
    assert api.get(f"/api/ordenes/{ot['id']}").json()["producto_muestra"] == "NOOK"


def test_orden_sin_muestra_cargada_devuelve_none(api, db_session, cliente_id):
    from models import ClienteProducto

    prod = ClienteProducto(cliente_id=cliente_id, nombre="Sin muestra")
    db_session.add(prod)
    db_session.commit()
    db_session.refresh(prod)

    ot = api.post("/api/ordenes", json={"cliente_id": cliente_id,
                                        "cliente_producto_id": prod.id}).json()
    assert api.get(f"/api/ordenes/{ot['id']}").json()["producto_muestra"] is None


def test_la_orden_trae_el_codigo_y_la_ubicacion_del_envase(api, db_session, cliente_id):
    """El que va al depósito a buscar el envase necesita saber DÓNDE está.

    En producción el 85% de los productos tiene estos dos datos cargados; la
    API no los devolvía, así que la ficha impresa no los podía mostrar.
    """
    from models import ClienteProducto

    prod = ClienteProducto(cliente_id=cliente_id, nombre="Agua", envase="Starplastic",
                           envase_codificado="STAR-260011", ubicacion="A-1")
    db_session.add(prod)
    db_session.commit()
    db_session.refresh(prod)

    ot = api.post("/api/ordenes", json={"cliente_id": cliente_id,
                                        "cliente_producto_id": prod.id}).json()
    d = api.get(f"/api/ordenes/{ot['id']}").json()
    assert d["envase_codificado"] == "STAR-260011"
    assert d["envase_ubicacion"] == "A-1"


def test_producto_sin_codigo_de_envase_no_rompe(api, db_session, cliente_id):
    from models import ClienteProducto

    prod = ClienteProducto(cliente_id=cliente_id, nombre="Sin codigo")
    db_session.add(prod)
    db_session.commit()
    db_session.refresh(prod)

    ot = api.post("/api/ordenes", json={"cliente_id": cliente_id,
                                        "cliente_producto_id": prod.id}).json()
    d = api.get(f"/api/ordenes/{ot['id']}").json()
    assert d["envase_codificado"] is None and d["envase_ubicacion"] is None
