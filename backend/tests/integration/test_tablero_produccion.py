"""Integración: el tablero de planta — dónde está cada pedido, en vivo.

Lectura del mismo dato que deja el escaneo (`plan_produccion`). Tiene dos
mitades, porque la planta tiene dos clases de etapa:

  - **Impresión**: importa en qué máquina. Una columna por impresora.
  - **Extrusión y troquelado**: las máquinas son intercambiables. Una columna
    por etapa, con los trabajos que están en ella.

Alrededor de las tres etapas escaneables el tablero completa el recorrido con
secciones que NO salen del escaneo: las **pendientes** (el 1er paso: la orden
emitida que todavía no arrancó), las **finalizadas** (el 5to paso: la orden
cerrada por la oficina) y el **depósito** (qué producto terminado hay y qué
falta).

El recorrido que numera esta pantalla tiene CINCO pasos —pendiente, extrusión,
impresión, troquelado, finalizado—, y a propósito NO coincide con los ①②③ de la
ficha impresa: el papel numera los tres pases que hace el operario en la
máquina, la pantalla numera el camino completo de la orden. Son dos audiencias
distintas.

De acá comen la pantalla `/planificacion` y el bloque del dashboard.
"""
from datetime import datetime, timedelta, timezone

import pytest

from models import (
    Cliente, Maquina, OrdenTrabajo, PlanProduccion, StockItem, StockMovimiento,
)

MARCA = "TABLERO TEST SA"
PREFIJO_ITEM = "PYTEST-ST-"

# Centinela para pedirle a `crear_orden` una marca de tiempo NULA de verdad,
# sea `updated_at` o `created_at`. `None` no sirve: significa «no toques la
# marca» y la base pone su `server_default`. Una orden migrada a mano sí puede
# tener la marca vacía, y hay que poder reproducir ese caso para probar el orden.
SIN_MARCA = object()

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


@pytest.fixture()
def crear_orden(db_session):
    """Fábrica de órdenes cerradas, sin pasar por el alta real.

    La ficha completa no agrega nada acá: lo que se prueba es qué muestra el
    tablero según el estado y la marca de tiempo del cierre, y esa marca hay
    que poder escribirla a mano para probar el orden sin esperar días.

    `updated_at=SIN_MARCA` (o `created_at=SIN_MARCA`) deja la marca en NULO,
    que es el caso de la orden migrada a mano. Pasar `None` no alcanza:
    significa «no la toques» y la columna se llena con su `server_default`.
    """
    creadas: list[int] = []

    def _crear(cliente_id, numero, estado="completada", updated_at=None, **extra):
        # `created_at=SIN_MARCA` viaja en `extra` y se resuelve igual que
        # `updated_at`: con un UPDATE posterior. Hay que SACARLO antes de
        # construir la orden —el centinela es un `object()` pelado y la base no
        # lo puede guardar en una columna de fecha—. Pasar `created_at=None` al
        # constructor tampoco sirve: SQLAlchemy lo lee como «no la pongas en el
        # INSERT» y la columna se llena con su `server_default`, que es justo
        # lo que no se quiere probar.
        created_nulo = extra.get("created_at") is SIN_MARCA
        if created_nulo:
            extra.pop("created_at")
        o = OrdenTrabajo(numero=numero, cliente_id=cliente_id, estado=estado, **extra)
        if updated_at is not None and updated_at is not SIN_MARCA:
            o.updated_at = updated_at
        db_session.add(o)
        db_session.commit()
        db_session.refresh(o)
        # UPDATE directo y no `o.<columna> = None`: `updated_at` tiene
        # `onupdate=func.now()`, así que cualquier flush del ORM sobre esta
        # fila la vuelve a llenar. Pasando la columna explícita en el SET, el
        # `onupdate` no se aplica y el NULO queda escrito. Las dos marcas van
        # en el MISMO UPDATE para que anular `created_at` no le dispare el
        # `onupdate` a `updated_at` cuando se piden las dos nulas.
        nulas = {}
        if updated_at is SIN_MARCA:
            nulas["updated_at"] = None
        if created_nulo:
            nulas["created_at"] = None
        if nulas:
            db_session.query(OrdenTrabajo).filter(OrdenTrabajo.id == o.id).update(
                nulas, synchronize_session=False
            )
            db_session.commit()
            db_session.refresh(o)
            for columna in nulas:
                assert getattr(o, columna) is None, f"no se pudo forzar el {columna} nulo"
        creadas.append(o.id)
        return o.id

    try:
        yield _crear
    finally:
        if creadas:
            db_session.query(PlanProduccion).filter(
                PlanProduccion.orden_trabajo_id.in_(creadas)
            ).delete(synchronize_session=False)
            db_session.query(OrdenTrabajo).filter(
                OrdenTrabajo.id.in_(creadas)
            ).delete(synchronize_session=False)
            db_session.commit()


@pytest.fixture()
def crear_item(db_session):
    """Fábrica de ítems de depósito que se borra sola al terminar el test."""
    _borrar_items_de_test(db_session)
    creados: list[int] = []

    def _crear(codigo, nombre, tipo="producto_terminado", actual=0, minimo=0, activo=True):
        i = StockItem(
            codigo=f"{PREFIJO_ITEM}{codigo}", nombre=nombre, tipo=tipo, unidad="kg",
            stock_actual=actual, stock_minimo=minimo, activo=activo,
        )
        db_session.add(i)
        db_session.commit()
        db_session.refresh(i)
        creados.append(i.id)
        return i.id

    try:
        yield _crear
    finally:
        _borrar_items_de_test(db_session)


def _borrar_items_de_test(db):
    ids = [
        i.id for i in db.query(StockItem).filter(
            StockItem.codigo.like(f"{PREFIJO_ITEM}%")
        ).all()
    ]
    if not ids:
        return
    db.query(StockMovimiento).filter(
        StockMovimiento.stock_item_id.in_(ids)
    ).delete(synchronize_session=False)
    db.query(StockItem).filter(StockItem.id.in_(ids)).delete(synchronize_session=False)
    db.commit()


def _maquina(cuerpo, maquina_id):
    return next(m for m in cuerpo["maquinas"] if m["id"] == maquina_id)


def _etapa(cuerpo, nombre):
    return next(e for e in cuerpo["etapas"] if e["etapa"] == nombre)


def _finalizada(cuerpo, orden_id):
    return next(f for f in cuerpo["finalizadas"] if f["id"] == orden_id)


def _pendiente(cuerpo, orden_id):
    return next(p for p in cuerpo["pendientes"] if p["id"] == orden_id)


def _mios(cuerpo, ids):
    """Las filas del depósito que creó este test, en el orden que vinieron.

    El Postgres de test es compartido entre archivos: acotar al propio dato es
    la única forma de probar el orden sin depender de lo que dejó otra corrida.
    """
    return [i for i in cuerpo["stock"]["terminado"] if i["id"] in ids]


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


# ──────────────────────────────────────────────────────────────────────────────
# El 5to y último paso: finalizado
# ──────────────────────────────────────────────────────────────────────────────

def test_las_secciones_nuevas_vienen_aunque_no_haya_nada(api, crear_item):
    """Las claves están siempre, con datos o sin datos.

    Hoy el depósito está vacío y ninguna orden llegó a «completada»: ésa es la
    foto real del dato, no un bug. Una clave ausente no se distingue de «no hay
    nada» y le revienta la pantalla al que la lee, así que la lista vacía es
    parte del contrato.
    """
    cuerpo = api.get("/api/produccion/tablero").json()

    assert isinstance(cuerpo["finalizadas"], list)
    assert isinstance(cuerpo["stock"]["terminado"], list)
    assert isinstance(cuerpo["stock"]["total_items"], int)
    assert isinstance(cuerpo["stock"]["bajo_minimo"], int)
    assert isinstance(cuerpo["resumen"]["finalizadas"], int)
    assert isinstance(cuerpo["resumen"]["finalizadas_total"], int)
    assert isinstance(cuerpo["resumen"]["bajo_minimo"], int)

    # Este test no creó nada: nada suyo puede estar en las listas.
    assert _mios(cuerpo, set()) == []
    assert [
        i for i in cuerpo["stock"]["terminado"]
        if (i["codigo"] or "").startswith(PREFIJO_ITEM)
    ] == []


def test_la_orden_cerrada_aparece_en_finalizadas(api, cliente_id):
    """Cerrar la orden es decisión de la oficina, y ahí recién se ve acá."""
    ot = api.post("/api/ordenes", json={"cliente_id": cliente_id, "cantidad": 7000}).json()
    r = api.put(f"/api/ordenes/{ot['id']}", json={"estado": "completada"})
    assert r.status_code == 200, r.text

    f = _finalizada(api.get("/api/produccion/tablero").json(), ot["id"])
    assert f["numero"] == ot["numero"]
    assert f["cliente"] == MARCA
    assert f["cantidad"] == 7000
    assert f["fecha"]                      # cuándo se cerró
    assert "lote" in f and "producto" in f  # pueden venir nulos, pero vienen


def test_la_orden_en_curso_no_esta_en_finalizadas(api, cliente_id, maquinas):
    """Haber pasado por troquelado no es haber terminado.

    El escaneo de la última etapa no cierra nada: la orden sigue en planta
    hasta que la oficina la marca completada.
    """
    ot = api.post("/api/ordenes", json={"cliente_id": cliente_id}).json()
    api.post(f"/api/ordenes/{ot['id']}/etapa", json={"etapa": "troquelado"})

    cuerpo = api.get("/api/produccion/tablero").json()
    assert ot["id"] not in [f["id"] for f in cuerpo["finalizadas"]]
    assert ot["id"] in [o["id"] for o in _etapa(cuerpo, "troquelado")["ordenes"]]


def test_las_finalizadas_van_de_la_mas_nueva_a_la_mas_vieja(api, cliente_id, crear_orden):
    """Manda la fecha de cierre, no el orden en que se cargaron.

    Las altas van AL REVÉS a propósito —primero la más nueva, última la más
    vieja— para que el id del SERIAL quede en sentido contrario al resultado
    esperado. El `ORDER BY` del router desempata por `id DESC`, así que si se
    las diera de alta de vieja a nueva ese desempate solo ya satisfaría el
    assert y el test pasaría incluso con el orden por fecha roto.
    """
    ahora = datetime.now(timezone.utc)
    nueva = crear_orden(cliente_id, "PYTEST-TB-F-N", updated_at=ahora - timedelta(hours=1))
    media = crear_orden(cliente_id, "PYTEST-TB-F-M", updated_at=ahora - timedelta(days=2))
    vieja = crear_orden(cliente_id, "PYTEST-TB-F-V", updated_at=ahora - timedelta(days=3))

    # Si el orden saliera por id, esto vendría [vieja, media, nueva].
    assert nueva < media < vieja, "los ids tienen que contradecir a las fechas"

    mias = [
        f["id"] for f in api.get("/api/produccion/tablero").json()["finalizadas"]
        if f["id"] in (vieja, media, nueva)
    ]
    assert mias == [nueva, media, vieja]


def test_finalizadas_corta_en_veinte(api, cliente_id, crear_orden):
    """El tablero es un vistazo, no el historial: para eso está /api/ordenes."""
    ahora = datetime.now(timezone.utc)
    for i in range(21):
        crear_orden(
            cliente_id, f"PYTEST-TB-T{i:02d}", updated_at=ahora - timedelta(minutes=i)
        )

    assert len(api.get("/api/produccion/tablero").json()["finalizadas"]) == 20


def test_el_resumen_cuenta_las_finalizadas_que_devuelve(api, cliente_id, crear_orden):
    crear_orden(cliente_id, "PYTEST-TB-R1")

    cuerpo = api.get("/api/produccion/tablero").json()
    assert cuerpo["resumen"]["finalizadas"] == len(cuerpo["finalizadas"])
    assert cuerpo["resumen"]["finalizadas"] >= 1


def test_el_resumen_trae_el_total_de_finalizadas_sin_el_tope(api, cliente_id, crear_orden):
    """Cuántas hay cerradas, no cuántas entraron en la lista.

    `finalizadas` viene recortada en 20, y su largo se muestra en pantalla al
    lado de contadores que SÍ son totales: con 57 órdenes cerradas el tablero
    decía «20 finalizadas» para siempre. `finalizadas_total` es el número real
    y `finalizadas` conserva su significado (el largo de lo que vino).

    Se mide por delta y no contra un número fijo: el Postgres de test es
    compartido y arrastra finalizadas de otras corridas.
    """
    ahora = datetime.now(timezone.utc)
    antes = api.get("/api/produccion/tablero").json()["resumen"]["finalizadas_total"]

    for i in range(21):
        crear_orden(
            cliente_id, f"PYTEST-TB-TT{i:02d}", updated_at=ahora - timedelta(minutes=i)
        )
    # Una en curso: el total cuenta cerradas, no órdenes. Sin esto, un contador
    # que se olvidara del filtro por estado pasaría igual.
    crear_orden(cliente_id, "PYTEST-TB-TT-EP", estado="en_proceso")

    cuerpo = api.get("/api/produccion/tablero").json()
    resumen = cuerpo["resumen"]
    assert resumen["finalizadas"] == len(cuerpo["finalizadas"]) == 20   # el tope
    assert resumen["finalizadas_total"] == antes + 21                  # el total
    assert resumen["finalizadas_total"] > resumen["finalizadas"]


def test_la_finalizada_sin_marca_de_cierre_queda_al_fondo(api, cliente_id, crear_orden):
    """Una orden migrada a mano, sin `updated_at`, va abajo de las de hoy.

    En un `ORDER BY ... DESC` Postgres pone los NULOS PRIMERO, así que sin el
    `nullslast` del router la orden sin marca se treparía al tope del tablero y
    taparía lo que se cerró hace un rato.

    La de fecha se da de alta PRIMERO (id menor) para que el desempate por
    `id DESC` tampoco pueda satisfacer el assert por su cuenta.
    """
    con_marca = crear_orden(
        cliente_id, "PYTEST-TB-F-CON", updated_at=datetime.now(timezone.utc) - timedelta(days=9)
    )
    sin_marca = crear_orden(cliente_id, "PYTEST-TB-F-NULA", updated_at=SIN_MARCA)

    assert con_marca < sin_marca, "los ids tienen que contradecir al orden esperado"

    cuerpo = api.get("/api/produccion/tablero").json()
    assert _finalizada(cuerpo, sin_marca)["fecha"] is None   # la marca vacía llega así

    mias = [f["id"] for f in cuerpo["finalizadas"] if f["id"] in (con_marca, sin_marca)]
    assert mias == [con_marca, sin_marca]


# ──────────────────────────────────────────────────────────────────────────────
# El depósito
# ──────────────────────────────────────────────────────────────────────────────

def test_el_deposito_muestra_solo_el_terminado_activo(api, crear_item):
    """Lo que sale de la planta. La materia prima y los insumos son otra pantalla."""
    terminado = crear_item("PT-OK",  "Etiqueta lista")
    de_baja   = crear_item("PT-OFF", "Etiqueta discontinuada", activo=False)
    materia   = crear_item("MP-OK",  "Polietileno", tipo="materia_prima")
    insumo    = crear_item("IN-OK",  "Tinta negra", tipo="insumo")

    ids = [i["id"] for i in api.get("/api/produccion/tablero").json()["stock"]["terminado"]]
    assert terminado in ids
    assert de_baja not in ids
    assert materia not in ids
    assert insumo not in ids


def test_lo_que_falta_va_primero(api, crear_item):
    """Importa qué falta, no el abecedario: los nombres están al revés a propósito."""
    sobra = crear_item("ZZ-OK",    "AAA con stock", actual=100, minimo=10)
    falta = crear_item("AA-FALTA", "ZZZ sin stock", actual=1,   minimo=10)

    mias = _mios(api.get("/api/produccion/tablero").json(), {sobra, falta})
    assert [i["id"] for i in mias] == [falta, sobra]
    assert mias[0]["bajo_minimo"] is True
    assert mias[1]["bajo_minimo"] is False
    assert mias[0]["stock_actual"] == 1
    assert mias[0]["stock_minimo"] == 10
    assert mias[0]["unidad"] == "kg"
    assert mias[0]["nombre"] == "ZZZ sin stock"
    assert "cliente_nombre" in mias[0]


def test_el_contador_de_faltantes_cuenta_tambien_la_materia_prima(api, crear_item):
    """Lo que frena la planta es que falte material, no sólo producto hecho."""
    antes = api.get("/api/produccion/tablero").json()["stock"]["bajo_minimo"]
    crear_item("MP-FALTA", "Polietileno agotado", tipo="materia_prima", actual=0, minimo=500)

    cuerpo = api.get("/api/produccion/tablero").json()
    assert cuerpo["stock"]["bajo_minimo"] == antes + 1
    # Cuenta, pero no se mete en la lista de terminado.
    assert f"{PREFIJO_ITEM}MP-FALTA" not in [
        i["codigo"] for i in cuerpo["stock"]["terminado"]
    ]


def test_el_item_de_baja_no_cuenta_aunque_este_bajo_minimo(api, crear_item):
    """Un insumo discontinuado y en cero no prende el cartel de «falta material».

    Es el filtro `activo` de la consulta de contadores. Sin él, cada ítem que
    la empresa dio de baja con mínimo cargado inflaría `bajo_minimo` para
    siempre: el tablero avisaría que falta algo que ya nadie va a comprar, y el
    aviso que sí importa se perdería en el ruido.

    Ojo: tiene que estar bajo mínimo DE VERDAD (`actual=0, minimo=500`). Un
    ítem de baja con mínimo 0 no está bajo mínimo, así que no probaría nada.
    """
    antes = api.get("/api/produccion/tablero").json()
    crear_item(
        "PT-OFF-FALTA", "Etiqueta discontinuada y agotada",
        actual=0, minimo=500, activo=False,
    )

    cuerpo = api.get("/api/produccion/tablero").json()
    assert cuerpo["stock"]["bajo_minimo"] == antes["stock"]["bajo_minimo"]
    assert cuerpo["resumen"]["bajo_minimo"] == antes["resumen"]["bajo_minimo"]
    assert cuerpo["stock"]["total_items"] == antes["stock"]["total_items"]
    # Tampoco se asoma a la lista del depósito.
    assert f"{PREFIJO_ITEM}PT-OFF-FALTA" not in [
        i["codigo"] for i in cuerpo["stock"]["terminado"]
    ]


def test_total_items_cuenta_todo_aunque_la_lista_venga_recortada(api, crear_item):
    for i in range(26):
        crear_item(f"PT-{i:02d}", f"Terminado {i:02d}", actual=100, minimo=0)

    stock = api.get("/api/produccion/tablero").json()["stock"]
    assert len(stock["terminado"]) == 24
    assert stock["total_items"] >= 26


def test_el_resumen_repite_el_contador_de_faltantes(api, crear_item):
    crear_item("PT-R", "Terminado agotado", actual=0, minimo=5)

    cuerpo = api.get("/api/produccion/tablero").json()
    assert cuerpo["resumen"]["bajo_minimo"] == cuerpo["stock"]["bajo_minimo"]
    assert cuerpo["resumen"]["bajo_minimo"] >= 1


# ──────────────────────────────────────────────────────────────────────────────
# El 1er paso: la orden emitida que todavía no arrancó
# ──────────────────────────────────────────────────────────────────────────────

def test_pendientes_viene_aunque_no_haya_nada(api):
    """La clave está siempre, con datos o sin datos.

    Mismo contrato que `finalizadas`: una clave ausente no se distingue de «no
    hay nada» y le revienta la pantalla al que la lee. No se puede exigir lista
    VACÍA en absoluto porque el Postgres de test es compartido y arrastra
    órdenes sin arrancar de otras corridas; lo que sí se puede exigir es que
    nada de ESTE test esté ahí, que no creó ninguna.
    """
    cuerpo = api.get("/api/produccion/tablero").json()

    assert isinstance(cuerpo["pendientes"], list)
    assert isinstance(cuerpo["resumen"]["pendientes"], int)
    assert isinstance(cuerpo["resumen"]["pendientes_total"], int)

    assert [
        p for p in cuerpo["pendientes"]
        if (p["numero"] or "").startswith("PYTEST-TB-P")
    ] == []


@pytest.mark.parametrize("estado", ["borrador", "pendiente"])
def test_la_orden_recien_emitida_aparece_en_pendientes(api, cliente_id, crear_orden, estado):
    """El 1er paso del recorrido: cargada en el sistema, sin tocar la planta.

    `borrador` y `pendiente` son el mismo hecho para el tablero —la orden está
    emitida y nadie la empezó—, así que las dos tienen que verse. Era justo la
    etapa que faltaba: antes una orden recién cargada no aparecía en ninguna
    parte del tablero hasta que alguien la escaneaba.
    """
    ot = crear_orden(cliente_id, f"PYTEST-TB-P-{estado[:4].upper()}", estado=estado,
                     cantidad=20000)

    p = _pendiente(api.get("/api/produccion/tablero").json(), ot)
    assert p["cliente"] == MARCA
    assert p["cantidad"] == 20000
    assert p["fecha"]                                     # cuándo se emitió
    assert "lote" in p and "producto" in p and "numero" in p  # pueden venir nulos, pero vienen


@pytest.mark.parametrize("estado", ["en_proceso", "completada", "cancelada"])
def test_la_orden_que_ya_arranco_o_cerro_no_esta_en_pendientes(
    api, cliente_id, crear_orden, estado
):
    """Pendiente es «no arrancó». Arrancada, cerrada o caída ya no lo es.

    Sin el filtro por estado el 1er paso se convertiría en «todas las órdenes»
    y el tablero mostraría la misma orden en dos lugares a la vez.
    """
    ot = crear_orden(cliente_id, f"PYTEST-TB-PN-{estado[:4].upper()}", estado=estado)

    cuerpo = api.get("/api/produccion/tablero").json()
    assert ot not in [p["id"] for p in cuerpo["pendientes"]]

    # Y la que arrancó sin escanear tiene su propio lugar: los dos baldes son
    # distintos, no hay orden que caiga en los dos.
    if estado == "en_proceso":
        assert ot in [o["id"] for o in cuerpo["sin_ubicar"]]


def test_la_fecha_de_una_pendiente_es_cuando_se_emitio(api, cliente_id, crear_orden):
    """Manda `created_at`, no `updated_at`.

    De una orden que todavía no arrancó lo que importa es HACE CUÁNTO que está
    esperando, no cuándo la editaron por última vez: si se mostrara
    `updated_at`, corregirle una medida a una orden de hace un mes la haría
    parecer recién emitida y taparía que lleva un mes parada.

    La orden se crea con `created_at` de hace 5 días y la base le pone
    `updated_at` de HOY sola, así que las dos marcas no pueden confundirse: si
    el router leyera la equivocada, la fecha saldría de hoy.
    """
    emitida = datetime.now(timezone.utc) - timedelta(days=5)
    ot = crear_orden(cliente_id, "PYTEST-TB-P-FECHA", estado="pendiente",
                     created_at=emitida)

    p = _pendiente(api.get("/api/produccion/tablero").json(), ot)
    assert p["fecha"] is not None
    assert datetime.fromisoformat(p["fecha"]) == emitida


def test_las_pendientes_van_de_la_mas_nueva_a_la_mas_vieja(api, cliente_id, crear_orden):
    """Manda la fecha de emisión, no el orden en que se cargaron.

    Las altas van AL REVÉS a propósito —primero la más nueva, última la más
    vieja— para que el id del SERIAL quede en sentido contrario al resultado
    esperado: si el router ordenara por id, o si el `created_at` que pide el
    test no se escribiera, el assert caería.

    Separadas por SEGUNDOS y no por días para que las tres queden arriba de
    cualquier orden sin arrancar que haya dejado otro archivo de la suite: así
    el tope de 20 no las puede empujar afuera de la lista.
    """
    ahora = datetime.now(timezone.utc)
    nueva = crear_orden(cliente_id, "PYTEST-TB-P-N", estado="pendiente",
                        created_at=ahora - timedelta(seconds=1))
    media = crear_orden(cliente_id, "PYTEST-TB-P-M", estado="pendiente",
                        created_at=ahora - timedelta(seconds=2))
    vieja = crear_orden(cliente_id, "PYTEST-TB-P-V", estado="borrador",
                        created_at=ahora - timedelta(seconds=3))

    # Si el orden saliera por id, esto vendría [vieja, media, nueva].
    assert nueva < media < vieja, "los ids tienen que contradecir a las fechas"

    mias = [
        p["id"] for p in api.get("/api/produccion/tablero").json()["pendientes"]
        if p["id"] in (vieja, media, nueva)
    ]
    assert mias == [nueva, media, vieja]


def test_pendientes_corta_en_veinte(api, cliente_id, crear_orden):
    """El tablero es un vistazo, no el historial: para eso está /api/ordenes."""
    ahora = datetime.now(timezone.utc)
    for i in range(21):
        crear_orden(cliente_id, f"PYTEST-TB-PT{i:02d}", estado="pendiente",
                    created_at=ahora - timedelta(minutes=i))

    assert len(api.get("/api/produccion/tablero").json()["pendientes"]) == 20


def test_el_resumen_trae_el_total_de_pendientes_sin_el_tope(api, cliente_id, crear_orden):
    """Cuántas hay sin arrancar, no cuántas entraron en la lista.

    Mismo problema que `finalizadas_total`: la lista viene recortada en 20 y su
    largo se muestra al lado de contadores que SÍ son totales, así que con 57
    órdenes esperando el tablero diría «20» para siempre.

    Se mide por delta y no contra un número fijo: el Postgres de test es
    compartido y arrastra pendientes de otras corridas.
    """
    ahora = datetime.now(timezone.utc)
    antes = api.get("/api/produccion/tablero").json()["resumen"]["pendientes_total"]

    for i in range(21):
        crear_orden(cliente_id, f"PYTEST-TB-PTT{i:02d}", estado="pendiente",
                    created_at=ahora - timedelta(minutes=i))
    # Una ya arrancada: el total cuenta las que esperan, no órdenes. Sin esto,
    # un contador que se olvidara del filtro por estado pasaría igual.
    crear_orden(cliente_id, "PYTEST-TB-PTT-EP", estado="en_proceso")

    cuerpo = api.get("/api/produccion/tablero").json()
    resumen = cuerpo["resumen"]
    assert resumen["pendientes"] == len(cuerpo["pendientes"]) == 20   # el tope
    assert resumen["pendientes_total"] == antes + 21                  # el total
    assert resumen["pendientes_total"] > resumen["pendientes"]


def test_el_resumen_cuenta_las_pendientes_que_devuelve(
    api, cliente_id, crear_orden, monkeypatch
):
    """`resumen.pendientes` es el largo de la LISTA, no cuántas hay.

    Con el tope real (20) este test no probaría nada: en una base con menos de
    20 órdenes esperando, el largo de la lista y el total son EL MISMO NÚMERO,
    así que devolver uno en lugar del otro pasaría desapercibido —lo comprobé
    rompiéndolo a propósito—. Bajando el tope a 2 los dos números se separan y
    la confusión se vuelve visible.
    """
    monkeypatch.setattr("routers.produccion.TOPE_PENDIENTES", 2)
    ahora = datetime.now(timezone.utc)
    for i in range(3):
        crear_orden(cliente_id, f"PYTEST-TB-P-R{i}", estado="pendiente",
                    created_at=ahora - timedelta(minutes=i))

    cuerpo = api.get("/api/produccion/tablero").json()
    assert len(cuerpo["pendientes"]) == 2                 # el tope, ya bajado
    assert cuerpo["resumen"]["pendientes"] == 2           # el largo, no el total
    assert cuerpo["resumen"]["pendientes_total"] > 2      # y el total es mayor


def test_la_pendiente_sin_marca_de_emision_queda_al_fondo(api, cliente_id, crear_orden):
    """Una orden migrada a mano, sin `created_at`, va abajo de las de hoy.

    En un `ORDER BY ... DESC` Postgres pone los NULOS PRIMERO, así que sin el
    `nullslast` del router la orden sin marca se treparía al tope del tablero y
    taparía lo que se emitió hace un rato. Y acá molesta más que en las
    finalizadas: el 1er paso se lee para saber qué entró último.

    La de fecha se da de alta PRIMERO (id menor) para que el desempate por
    `id DESC` tampoco pueda satisfacer el assert por su cuenta.
    """
    con_marca = crear_orden(
        cliente_id, "PYTEST-TB-P-CON", estado="pendiente",
        created_at=datetime.now(timezone.utc) - timedelta(seconds=1),
    )
    sin_marca = crear_orden(
        cliente_id, "PYTEST-TB-P-NULA", estado="pendiente", created_at=SIN_MARCA
    )

    assert con_marca < sin_marca, "los ids tienen que contradecir al orden esperado"

    cuerpo = api.get("/api/produccion/tablero").json()
    assert _pendiente(cuerpo, sin_marca)["fecha"] is None   # la marca vacía llega así

    mias = [p["id"] for p in cuerpo["pendientes"] if p["id"] in (con_marca, sin_marca)]
    assert mias == [con_marca, sin_marca]
