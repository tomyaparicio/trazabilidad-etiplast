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
# La fecha del cierre: `fecha_cierre`, no la última edición
#
# `updated_at` era lo mejor que había sin agregar una columna, pero NO es la
# fecha de cierre: la mueve cualquier edición posterior. Corregirle una medida
# a una orden cerrada el mes pasado la mostraba como recién cerrada, arriba de
# todo, justo en la lista que se mira para saber qué salió hoy.
#
# Ahora el cierre tiene su propia marca, que la escribe el escaneo de
# `finalizado` y nada más vuelve a tocar. `updated_at` queda de respaldo para
# las órdenes que se cerraron ANTES de que existiera la columna.
# ──────────────────────────────────────────────────────────────────────────────

def _cuando(fila) -> datetime:
    """La fecha que el tablero muestra, parseada a instante comparable."""
    return datetime.fromisoformat(fila["fecha"])


def test_la_fecha_de_la_finalizada_es_el_cierre_y_no_la_ultima_edicion(
    api, cliente_id, crear_orden
):
    """Una orden cerrada hace tres días y editada hoy sigue diciendo tres días."""
    cierre = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(days=3)
    ot = crear_orden(
        cliente_id, "PYTEST-TB-CI-EDIT",
        fecha_cierre=cierre,
        updated_at=datetime.now(timezone.utc),   # la edición de después
    )

    f = _finalizada(api.get("/api/produccion/tablero").json(), ot)
    assert _cuando(f) == cierre


def test_la_finalizada_de_antes_de_la_columna_conserva_su_fecha(
    api, cliente_id, crear_orden
):
    """Las 3 órdenes que ya están cerradas en producción no tienen
    `fecha_cierre` y no se la puede inventar: sin el `coalesce` quedarían sin
    fecha y, en un DESC, los NULOS van PRIMERO — se treparían al tope."""
    edicion = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(days=5)
    ot = crear_orden(cliente_id, "PYTEST-TB-CI-VIEJA", updated_at=edicion)

    f = _finalizada(api.get("/api/produccion/tablero").json(), ot)
    assert _cuando(f) == edicion


def test_las_finalizadas_ordenan_por_la_misma_marca_que_muestran(
    api, cliente_id, crear_orden
):
    """La lista no puede estar ordenada por una fecha distinta de la que exhibe.

    El caso está armado para que el orden por `updated_at` —el de antes— y el
    desempate por `id DESC` den los DOS el resultado equivocado:

      - `reciente`: cerrada hace 1 h. Id MENOR.
      - `vieja`:    cerrada hace 3 h y editada recién, así que su `updated_at`
                    es el más alto de las dos. Id MAYOR.

    Por cierre va [reciente, vieja]; por `updated_at` o por id, [vieja, reciente].
    """
    ahora = datetime.now(timezone.utc).replace(microsecond=0)
    reciente = crear_orden(
        cliente_id, "PYTEST-TB-CI-ORD-R",
        fecha_cierre=ahora - timedelta(hours=1), updated_at=ahora - timedelta(hours=1),
    )
    vieja = crear_orden(
        cliente_id, "PYTEST-TB-CI-ORD-V",
        fecha_cierre=ahora - timedelta(hours=3), updated_at=ahora,
    )
    assert reciente < vieja, "los ids tienen que contradecir al orden esperado"

    cuerpo = api.get("/api/produccion/tablero").json()
    mias = [f for f in cuerpo["finalizadas"] if f["id"] in (reciente, vieja)]
    assert [f["id"] for f in mias] == [reciente, vieja]
    # Y las fechas que muestra bajan: si ordenara por otra marca, la lista
    # saldría con las fechas desordenadas a la vista.
    assert [_cuando(f) for f in mias] == sorted(
        (_cuando(f) for f in mias), reverse=True
    )


def test_el_desde_del_paso_cinco_es_la_misma_marca_que_finalizadas(
    api, cliente_id, crear_orden
):
    """Las dos vistas del paso 5 no pueden discrepar: es el mismo hecho."""
    cierre = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(days=2)
    ot = crear_orden(
        cliente_id, "PYTEST-TB-CI-DESDE",
        fecha_cierre=cierre, updated_at=datetime.now(timezone.utc),
    )

    cuerpo = api.get("/api/produccion/tablero").json()
    assert _en_paso(cuerpo, "finalizado", ot)["desde"] == _finalizada(cuerpo, ot)["fecha"]
    assert _cuando(_finalizada(cuerpo, ot)) == cierre


# ──────────────────────────────────────────────────────────────────────────────
# El escaneo de cierre visto desde el tablero
# ──────────────────────────────────────────────────────────────────────────────

def test_la_orden_finalizada_por_escaneo_cae_en_el_paso_cinco(
    api, cliente_id, maquinas
):
    """El paso 5 estaba vacío desde siempre porque nada lo llenaba: no había
    forma de cerrar una orden que no fuera editarla a mano."""
    ot = api.post("/api/ordenes", json={"cliente_id": cliente_id}).json()
    api.post(f"/api/ordenes/{ot['id']}/etapa",
             json={"etapa": "impresion", "maquina_id": maquinas["PYTEST-TB-VENUS"]})

    assert api.post(
        f"/api/ordenes/{ot['id']}/etapa", json={"etapa": "finalizado"}
    ).status_code == 201

    cuerpo = api.get("/api/produccion/tablero").json()
    assert _donde_esta(cuerpo, ot["id"]) == ["finalizado"]
    assert _finalizada(cuerpo, ot["id"])["fecha"]
    # Y deja de ocupar la impresora: la orden salió de la planta.
    assert _maquina(cuerpo, maquinas["PYTEST-TB-VENUS"])["orden"] is None
    assert ot["id"] not in [o["id"] for o in cuerpo["sin_ubicar"]]


def test_el_invariante_cierra_despues_de_finalizar_por_escaneo(
    api, db_session, cliente_id, maquinas
):
    """El pase nuevo tiene una etapa que NO está en `ETAPAS_PRODUCCION`, así
    que es exactamente la clase de fila que puede hacer caer una orden fuera de
    los cinco pasos. `pasos_total + canceladas` tiene que seguir dando el total.
    """
    ot = api.post("/api/ordenes", json={"cliente_id": cliente_id}).json()
    api.post(f"/api/ordenes/{ot['id']}/etapa",
             json={"etapa": "impresion", "maquina_id": maquinas["PYTEST-TB-VENUS"]})
    cierre = api.post(f"/api/ordenes/{ot['id']}/etapa", json={"etapa": "finalizado"})
    assert cierre.status_code == 201, cierre.text

    cuerpo = api.get("/api/produccion/tablero").json()
    resumen = cuerpo["resumen"]
    assert resumen["pasos_total"] + resumen["canceladas"] == _total_ordenes(db_session)
    assert resumen["pasos_total"] == sum(p["total"] for p in cuerpo["pasos"])
    assert len(_donde_esta(cuerpo, ot["id"])) == 1


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


# ──────────────────────────────────────────────────────────────────────────────
# Los cinco pasos del recorrido — la clave `pasos`
#
# Acá se prueba la propiedad que el tablero NO tenía: que una orden no se
# pierda. Antes el tablero sólo miraba pases `en_curso`, así que cuando otra
# orden entraba a la misma impresora —y el escaneo cerraba el pase anterior
# para liberar la máquina— la orden vieja se caía de la pantalla: no estaba en
# ninguna etapa y aparecía en `sin_ubicar`, que encima dice «nadie la escaneó»
# justo de una orden que escanearon dos veces.
#
# Un tablero de planta que pierde órdenes es PEOR que no tener tablero: da
# confianza falsa. De ahí que el test central de esta sección sea un invariante
# de conservación y no un caso de ejemplo.
# ──────────────────────────────────────────────────────────────────────────────

# El recorrido completo, en orden. Repetido a propósito y no importado del
# router: si alguien le cambia una clave o un número, el contrato con el
# frontend se rompe y este test tiene que ser el que avise.
PASOS_ESPERADOS = [
    ("orden_trabajo", 1, "Orden de trabajo"),
    ("extrusion",     2, "Extrusión"),
    ("impresion",     3, "Impresión"),
    ("troquelado",    4, "Troquelado"),
    ("finalizado",    5, "Finalizado"),
]


def _paso(cuerpo, clave):
    return next(p for p in cuerpo["pasos"] if p["clave"] == clave)


def _en_paso(cuerpo, clave, orden_id):
    """La fila de una orden dentro de un paso, o None si no está ahí."""
    return next((o for o in _paso(cuerpo, clave)["ordenes"] if o["id"] == orden_id), None)


def _donde_esta(cuerpo, orden_id):
    """En qué pasos aparece una orden.

    Devuelve una LISTA y no la primera coincidencia porque el invariante no es
    «está en algún paso» sino «está en EXACTAMENTE uno»: una orden duplicada en
    dos pasos también rompe la conservación, y hacia el otro lado (el total
    cuenta de más).
    """
    return [
        p["clave"] for p in cuerpo["pasos"]
        if any(o["id"] == orden_id for o in p["ordenes"])
    ]


def _total_ordenes(db):
    """Cuántas órdenes hay en la base, contadas por fuera del router."""
    return db.query(OrdenTrabajo).count()


def _cerrar_pases(db, orden_id):
    """Cierra a mano los pases abiertos de una orden.

    Reproduce lo que hace el escaneo cuando libera una máquina
    (`registrar_etapa` en routers/ordenes.py) sin tener que meter otra orden en
    la misma impresora.
    """
    db.query(PlanProduccion).filter(
        PlanProduccion.orden_trabajo_id == orden_id,
        PlanProduccion.estado == "en_curso",
    ).update({"estado": "terminada"}, synchronize_session=False)
    db.commit()


def test_los_cinco_pasos_vienen_siempre_y_en_orden(api):
    """Las cinco columnas están siempre, aunque estén en cero.

    Un paso ausente no se distingue de «no hay nada ahí» y le rompe la pantalla
    al que lo lee, así que la lista vacía es parte del contrato.
    """
    pasos = api.get("/api/produccion/tablero").json()["pasos"]

    assert [(p["clave"], p["numero"], p["titulo"]) for p in pasos] == PASOS_ESPERADOS
    for p in pasos:
        assert isinstance(p["total"], int)
        assert isinstance(p["ordenes"], list)


def test_la_orden_con_el_pase_cerrado_sigue_en_su_paso(api, cliente_id, maquinas, db_session):
    """El caso que hoy se pierde: escaneada, el pase cerrado, y en ningún lado.

    La máquina se liberó (otra orden entró, o la cerró el escaneo siguiente),
    pero la orden sigue EN PRODUCCIÓN y el último lugar donde se la vio es ese
    paso. Dejarla ahí marcada como «no está en la máquina» es la verdad
    disponible; borrarla de la pantalla, no.
    """
    ot = api.post("/api/ordenes", json={"cliente_id": cliente_id, "cantidad": 20000}).json()
    api.post(f"/api/ordenes/{ot['id']}/etapa",
             json={"etapa": "impresion", "maquina_id": maquinas["PYTEST-TB-REINA"]})
    _cerrar_pases(db_session, ot["id"])

    cuerpo = api.get("/api/produccion/tablero").json()
    assert _donde_esta(cuerpo, ot["id"]) == ["impresion"]

    fila = _en_paso(cuerpo, "impresion", ot["id"])
    assert fila["en_maquina"] is False          # el pase está cerrado
    assert fila["numero"] == ot["numero"]
    assert fila["cliente"] == MARCA
    assert fila["cantidad"] == 20000
    assert fila["desde"]                        # desde cuándo está en este paso
    assert fila["operario"]                     # quién lo escaneó


def test_la_orden_con_el_pase_abierto_figura_en_la_maquina(api, cliente_id, maquinas):
    """Pase abierto = la orden está ARRIBA de la máquina ahora mismo."""
    ot = api.post("/api/ordenes", json={"cliente_id": cliente_id}).json()
    api.post(f"/api/ordenes/{ot['id']}/etapa",
             json={"etapa": "impresion", "maquina_id": maquinas["PYTEST-TB-REINA"]})

    cuerpo = api.get("/api/produccion/tablero").json()
    assert _donde_esta(cuerpo, ot["id"]) == ["impresion"]

    fila = _en_paso(cuerpo, "impresion", ot["id"])
    assert fila["en_maquina"] is True
    assert fila["maquina"] == "PYTEST-TB-REINA (ReinaFlex Tablero)"


def test_cuando_entra_otra_orden_la_anterior_no_desaparece(api, cliente_id, maquinas):
    """El caso real medido en producción, de punta a punta.

    Dos órdenes a la MISMA impresora: el escaneo de la segunda cierra el pase
    de la primera para liberar la máquina (bien: una impresora no puede tener
    dos trabajos). Las dos tienen que seguir en el paso 3, y la columna de la
    máquina tiene que mostrar sólo a la que está encima.
    """
    vieja = api.post("/api/ordenes", json={"cliente_id": cliente_id}).json()
    api.post(f"/api/ordenes/{vieja['id']}/etapa",
             json={"etapa": "impresion", "maquina_id": maquinas["PYTEST-TB-VENUS"]})
    nueva = api.post("/api/ordenes", json={"cliente_id": cliente_id}).json()
    api.post(f"/api/ordenes/{nueva['id']}/etapa",
             json={"etapa": "impresion", "maquina_id": maquinas["PYTEST-TB-VENUS"]})

    cuerpo = api.get("/api/produccion/tablero").json()

    assert _donde_esta(cuerpo, vieja["id"]) == ["impresion"]
    assert _donde_esta(cuerpo, nueva["id"]) == ["impresion"]
    assert _en_paso(cuerpo, "impresion", vieja["id"])["en_maquina"] is False
    assert _en_paso(cuerpo, "impresion", nueva["id"])["en_maquina"] is True
    # La columna de la impresora no cambia: ahí va sólo lo que tiene encima.
    assert _maquina(cuerpo, maquinas["PYTEST-TB-VENUS"])["orden"]["id"] == nueva["id"]


def test_la_orden_en_produccion_que_nadie_escaneo_cae_en_el_primer_paso(
    api, cliente_id, db_session
):
    """En producción y sin un solo pase: nadie la vio nunca en la planta.

    El lugar honesto es el primer paso, la cola de entrada. Antes caía en
    `sin_ubicar` y ahí se queda —esa sección no cambia, la usa /planificacion—
    pero además tiene que estar en un paso, o el recorrido la pierde.
    """
    ot = api.post("/api/ordenes", json={"cliente_id": cliente_id}).json()
    db_session.query(OrdenTrabajo).filter(OrdenTrabajo.id == ot["id"]).update(
        {"estado": "en_proceso"}, synchronize_session=False
    )
    db_session.commit()

    cuerpo = api.get("/api/produccion/tablero").json()
    assert _donde_esta(cuerpo, ot["id"]) == ["orden_trabajo"]

    fila = _en_paso(cuerpo, "orden_trabajo", ot["id"])
    assert fila["en_maquina"] is False
    assert fila["maquina"] is None
    assert fila["operario"] is None


@pytest.mark.parametrize("estado", ["borrador", "pendiente"])
def test_la_orden_recien_emitida_cae_en_el_primer_paso(
    api, cliente_id, crear_orden, estado
):
    """`borrador` y `pendiente` son el mismo hecho para la planta: no arrancó."""
    ot = crear_orden(cliente_id, f"PYTEST-TB-PASO-{estado[:4].upper()}", estado=estado)

    cuerpo = api.get("/api/produccion/tablero").json()
    assert _donde_esta(cuerpo, ot) == ["orden_trabajo"]
    assert _en_paso(cuerpo, "orden_trabajo", ot)["desde"]   # hace cuánto espera


def test_la_orden_cerrada_cae_en_el_ultimo_paso(api, cliente_id, crear_orden):
    ot = crear_orden(cliente_id, "PYTEST-TB-PASO-FIN", estado="completada")

    cuerpo = api.get("/api/produccion/tablero").json()
    assert _donde_esta(cuerpo, ot) == ["finalizado"]
    assert _en_paso(cuerpo, "finalizado", ot)["en_maquina"] is False


def test_la_orden_cerrada_va_al_ultimo_paso_aunque_haya_pasado_por_una_maquina(
    api, cliente_id, maquinas, db_session
):
    """El estado manda sobre el último pase: cerrada es cerrada.

    Si el último pase ganara, una orden completada que pasó por impresión
    seguiría apareciendo en el paso 3 y el tablero diría que está en la planta.
    """
    ot = api.post("/api/ordenes", json={"cliente_id": cliente_id}).json()
    api.post(f"/api/ordenes/{ot['id']}/etapa",
             json={"etapa": "impresion", "maquina_id": maquinas["PYTEST-TB-VENUS"]})
    db_session.query(OrdenTrabajo).filter(OrdenTrabajo.id == ot["id"]).update(
        {"estado": "completada"}, synchronize_session=False
    )
    db_session.commit()

    cuerpo = api.get("/api/produccion/tablero").json()
    assert _donde_esta(cuerpo, ot["id"]) == ["finalizado"]


def test_la_cancelada_no_esta_en_ningun_paso_pero_se_cuenta(api, cliente_id, crear_orden):
    """Una cancelada no ocupa lugar en el recorrido, pero no desaparece callada.

    Por delta y no contra un absoluto: el Postgres de test está compartido
    entre los 32 archivos de integración y arrastra residuo, así que el único
    número honesto es cuánto SUBIÓ el contador por lo que hizo este test.
    """
    antes = api.get("/api/produccion/tablero").json()["resumen"]["canceladas"]

    ot = crear_orden(cliente_id, "PYTEST-TB-PASO-CANC", estado="cancelada")

    cuerpo = api.get("/api/produccion/tablero").json()
    assert _donde_esta(cuerpo, ot) == []
    assert cuerpo["resumen"]["canceladas"] == antes + 1


def test_con_dos_pases_la_orden_queda_en_el_ultimo(api, cliente_id, db_session):
    """Dos pases CERRADOS: va al del último, no al del primero.

    Si el router se quedara con cualquier pase en vez del más nuevo, el tablero
    mostraría la orden en una etapa que ya dejó atrás. Los dos pases se cierran
    a propósito: con uno abierto, un `estado == 'en_curso'` alcanzaría para
    acertar por casualidad.
    """
    ot = api.post("/api/ordenes", json={"cliente_id": cliente_id}).json()
    api.post(f"/api/ordenes/{ot['id']}/etapa", json={"etapa": "extrusion"})
    api.post(f"/api/ordenes/{ot['id']}/etapa", json={"etapa": "troquelado"})
    _cerrar_pases(db_session, ot["id"])

    cuerpo = api.get("/api/produccion/tablero").json()
    assert _donde_esta(cuerpo, ot["id"]) == ["troquelado"]
    assert _en_paso(cuerpo, "troquelado", ot["id"])["en_maquina"] is False


def test_el_total_del_paso_cuenta_todas_aunque_la_lista_corte_en_veinte(
    api, cliente_id, crear_orden
):
    """La lista viene recortada; `total` no.

    Con 57 órdenes en un paso, un `total` sacado del largo de la lista diría
    «20» para siempre, justo al lado de un número que sí es total.
    """
    antes = _paso(api.get("/api/produccion/tablero").json(), "finalizado")["total"]

    for i in range(22):
        crear_orden(cliente_id, f"PYTEST-TB-PASO-T{i:02d}", estado="completada")

    cuerpo = api.get("/api/produccion/tablero").json()
    paso = _paso(cuerpo, "finalizado")
    assert paso["total"] == antes + 22
    assert len(paso["ordenes"]) == 20

    # Y `pasos_total` tampoco puede salir del largo de las listas: con un paso
    # pasado del tope, sumar largos da de menos y el invariante se cae.
    assert paso["total"] > len(paso["ordenes"])
    assert cuerpo["resumen"]["pasos_total"] == sum(p["total"] for p in cuerpo["pasos"])


def test_ningun_paso_pierde_ordenes(api, db_session, cliente_id, maquinas, crear_orden):
    """EL invariante: `pasos_total + canceladas` == las órdenes de la base.

    Un flujo de planta que pierde órdenes da confianza falsa, así que no
    alcanza con probar caso por caso: hay que probar la CONSERVACIÓN. Cada
    orden no cancelada cae en exactamente un paso, y las canceladas se cuentan
    aparte: la suma no puede dar otra cosa que el total.

    El total se cuenta por fuera del router (`_total_ordenes`), con el residuo
    compartido del Postgres de test incluido a propósito: el residuo son
    órdenes reales en estados variados y también tienen que caer en algún paso.
    Nada más corre mientras este test corre, así que las dos lecturas ven la
    misma foto.

    Las órdenes propias se chequean además una por una, porque el total global
    podría cerrar por casualidad si el router perdiera una orden y contara otra
    dos veces.
    """
    mias: list[int] = []

    # (1) emitida y sin arrancar, en sus dos formas
    mias.append(crear_orden(cliente_id, "PYTEST-TB-INV-BORR", estado="borrador"))
    mias.append(crear_orden(cliente_id, "PYTEST-TB-INV-PEND", estado="pendiente"))

    # (2) en producción, con el pase ABIERTO
    abierta = api.post("/api/ordenes", json={"cliente_id": cliente_id}).json()
    api.post(f"/api/ordenes/{abierta['id']}/etapa", json={"etapa": "extrusion"})
    mias.append(abierta["id"])

    # (3) en producción, con el pase CERRADO — la que hoy se perdía
    cerrada = api.post("/api/ordenes", json={"cliente_id": cliente_id}).json()
    api.post(f"/api/ordenes/{cerrada['id']}/etapa",
             json={"etapa": "impresion", "maquina_id": maquinas["PYTEST-TB-VENUS"]})
    _cerrar_pases(db_session, cerrada["id"])
    mias.append(cerrada["id"])

    # (4) en producción y sin un solo pase
    huerfana = api.post("/api/ordenes", json={"cliente_id": cliente_id}).json()
    db_session.query(OrdenTrabajo).filter(OrdenTrabajo.id == huerfana["id"]).update(
        {"estado": "en_proceso"}, synchronize_session=False
    )
    db_session.commit()
    mias.append(huerfana["id"])

    # (5) cerrada por la oficina
    mias.append(crear_orden(cliente_id, "PYTEST-TB-INV-FIN", estado="completada"))

    # (6) cancelada: no va a ningún paso, se cuenta aparte
    cancelada = crear_orden(cliente_id, "PYTEST-TB-INV-CANC", estado="cancelada")

    cuerpo = api.get("/api/produccion/tablero").json()
    resumen = cuerpo["resumen"]

    # La conservación, con residuo y todo.
    assert resumen["pasos_total"] + resumen["canceladas"] == _total_ordenes(db_session)

    # `pasos_total` tiene que ser la suma de los cinco pasos y no un contador
    # suelto: si se calculara aparte, podría cerrar el invariante mientras la
    # pantalla muestra otra cosa.
    assert resumen["pasos_total"] == sum(p["total"] for p in cuerpo["pasos"])

    # Y cada orden de este test, en exactamente un paso.
    for orden_id in mias:
        assert len(_donde_esta(cuerpo, orden_id)) == 1, f"orden {orden_id} perdida o repetida"
    assert _donde_esta(cuerpo, cancelada) == []


def test_la_lista_del_paso_va_de_la_mas_reciente_a_la_mas_vieja(
    api, cliente_id, crear_orden
):
    """El tablero se lee de arriba: lo último que pasó va primero.

    La marca con la que ordena cada paso NO es la misma: el paso 5 ordena por
    el cierre (`updated_at`), el paso 1 por la emisión y los del medio por el
    escaneo. Si se ordenara por una marca de otro paso, la lista saldría
    revuelta sin que nada más se rompa.

    La vieja se da de alta PRIMERO (id menor) para que el desempate por
    `id DESC` no pueda satisfacer el assert por su cuenta.
    """
    vieja = crear_orden(
        cliente_id, "PYTEST-TB-ORD-V", estado="completada",
        updated_at=datetime.now(timezone.utc) - timedelta(days=3),
    )
    nueva = crear_orden(
        cliente_id, "PYTEST-TB-ORD-N", estado="completada",
        updated_at=datetime.now(timezone.utc),
    )
    assert vieja < nueva, "los ids tienen que contradecir al orden esperado"

    paso = _paso(api.get("/api/produccion/tablero").json(), "finalizado")
    mias = [o["id"] for o in paso["ordenes"] if o["id"] in (vieja, nueva)]
    assert mias == [nueva, vieja]


def test_el_desde_del_ultimo_paso_es_el_cierre_y_no_la_emision(
    api, cliente_id, crear_orden
):
    """En el paso 5 el hecho es el cierre, así que `desde` es `updated_at`.

    Con `created_at` diría «hace cuánto se cargó el pedido» —puede ser de meses
    antes— al lado de una columna que promete decir desde cuándo está en este
    paso. Tiene que coincidir con la fecha que ya muestra `finalizadas`, que es
    la misma marca.
    """
    cierre = datetime.now(timezone.utc) - timedelta(days=2)
    ot = crear_orden(
        cliente_id, "PYTEST-TB-DESDE", estado="completada",
        updated_at=cierre, created_at=datetime.now(timezone.utc) - timedelta(days=90),
    )

    cuerpo = api.get("/api/produccion/tablero").json()
    assert _en_paso(cuerpo, "finalizado", ot)["desde"] == _finalizada(cuerpo, ot)["fecha"]


# ──────────────────────────────────────────────────────────────────────────────
# `GET /api/produccion/version` — para que el tablero reaccione al escaneo
#
# El que escanea está en la tablet de planta; el que mira el tablero está en la
# oficina, en otro navegador. No hay forma de que el escaneo le avise a la otra
# pantalla sin preguntar, y preguntar por el tablero entero cada 3 segundos es
# caro. Este endpoint es la pregunta barata: un valor opaco que cambia si
# cambió algo que el tablero muestra.
#
# No es SSE a propósito: el frontend pasa por el proxy de Next
# (`frontend/src/app/api/backend/[...path]/route.ts`), que hace `await
# res.text()` y buferea la respuesta entera —un stream se colgaría—, y
# `vercel.json` no declara `maxDuration`, así que Vercel cortaría la función.
# ──────────────────────────────────────────────────────────────────────────────

def _version(api):
    r = api.get("/api/produccion/version")
    assert r.status_code == 200, r.text
    v = r.json()["v"]
    assert isinstance(v, str) and v, "la versión tiene que ser un string con algo adentro"
    return v


def test_la_version_pide_sesion(client):
    """Mismo candado que el tablero: sin token no se mira la planta.

    Usa el `client` pelado del conftest raíz, no `api`: ese pisa `verify_token`
    en toda la app y el test pasaría sin probar nada.
    """
    assert client.get("/api/produccion/version").status_code == 401


def test_la_version_no_se_mueve_si_no_paso_nada(api):
    """Dos llamadas seguidas dan lo mismo.

    Es la mitad que hace al endpoint útil: si cambiara siempre, el tablero se
    recargaría entero cada 3 segundos y habríamos empeorado las cosas.
    """
    assert _version(api) == _version(api)


def test_la_version_cambia_al_crear_una_orden(api, cliente_id):
    antes = _version(api)
    api.post("/api/ordenes", json={"cliente_id": cliente_id})
    assert _version(api) != antes


def test_la_version_cambia_al_borrar_una_orden(api, cliente_id):
    """Una orden MENOS cambia el tablero igual que una más.

    Es el caso que se escapa si la versión se arma sólo con marcas máximas:
    borrar una fila no mueve ningún `max`, así que sin contar filas la pantalla
    se quedaría mostrando una orden que ya no existe.

    Se borra la VIEJA de dos y no la única, a propósito: borrando la última, el
    `max(id)` también se mueve y el test pasaría por el motivo equivocado —
    probado rompiendo el conteo del router, que con una sola orden sobrevivía—.
    Dejando una orden más nueva en pie, ni `max(id)` ni `max(updated_at)` se
    mueven, y el conteo queda como la ÚNICA señal que puede notar el borrado.
    """
    vieja = api.post("/api/ordenes", json={"cliente_id": cliente_id}).json()
    nueva = api.post("/api/ordenes", json={"cliente_id": cliente_id}).json()
    assert vieja["id"] < nueva["id"]
    antes = _version(api)

    r = api.delete(f"/api/ordenes/{vieja['id']}")
    assert r.status_code == 204, r.text

    assert _version(api) != antes


def test_la_version_cambia_al_escanear(api, cliente_id, maquinas):
    """El pedido textual del usuario: que escanear mueva el tablero."""
    ot = api.post("/api/ordenes", json={"cliente_id": cliente_id}).json()
    antes = _version(api)

    api.post(f"/api/ordenes/{ot['id']}/etapa",
             json={"etapa": "impresion", "maquina_id": maquinas["PYTEST-TB-VENUS"]})

    assert _version(api) != antes


def test_la_version_cambia_cuando_se_cierra_un_pase(api, cliente_id, db_session, maquinas):
    """Cerrar un pase sin abrir otro también cambia lo que se ve.

    Es el caso más fácil de perder: no se crea ninguna fila, sólo cambia el
    estado de una que ya estaba, así que un contador de filas no lo nota.
    """
    ot = api.post("/api/ordenes", json={"cliente_id": cliente_id}).json()
    api.post(f"/api/ordenes/{ot['id']}/etapa",
             json={"etapa": "impresion", "maquina_id": maquinas["PYTEST-TB-VENUS"]})
    antes = _version(api)

    _cerrar_pases(db_session, ot["id"])

    assert _version(api) != antes


def test_la_version_cambia_cuando_la_orden_cambia_de_estado(api, cliente_id):
    """Cerrar una orden la mueve del paso 1 al 5: el tablero tiene que enterarse."""
    ot = api.post("/api/ordenes", json={"cliente_id": cliente_id}).json()
    antes = _version(api)

    r = api.put(f"/api/ordenes/{ot['id']}", json={"estado": "completada"})
    assert r.status_code == 200, r.text

    assert _version(api) != antes


def test_la_version_cambia_al_mover_stock(api, crear_item):
    """El depósito es parte del tablero: si se mueve, la versión se mueve."""
    item = crear_item("VER", "Ítem versión", actual=100, minimo=10)
    antes = _version(api)

    r = api.post(f"/api/stock/{item}/movimientos", json={
        "stock_item_id": item, "tipo": "egreso", "cantidad": 5, "motivo": "despacho",
    })
    assert r.status_code == 201, r.text

    assert _version(api) != antes


# ──────────────────────────────────────────────────────────────────────────────
# Presupuesto de consultas
# ──────────────────────────────────────────────────────────────────────────────

def _contar_consultas(hacer):
    """Cuántos SELECT manda a Postgres lo que haga `hacer`.

    Contado con el listener de SQLAlchemy y no a ojo: un N+1 no se ve leyendo
    el código —aparece cuando el bucle de Python toca un atributo perezoso— y
    es exactamente el error que este endpoint tiene que evitar.
    """
    from sqlalchemy import event
    from sqlalchemy.engine import Engine

    consultas: list[str] = []

    def _anotar(conn, cursor, sentencia, params, contexto, muchos):
        consultas.append(sentencia)

    # El listener va en la CLASE `Engine` y no en el engine del conftest:
    # importarlo desde acá levanta una SEGUNDA copia del módulo (pytest ya lo
    # cargó con otro nombre) con su propio engine, y el contador daba CERO. Un
    # `<= 9` que pasa con cero es un test que no prueba nada.
    event.listen(Engine, "before_cursor_execute", _anotar)
    try:
        hacer()
    finally:
        event.remove(Engine, "before_cursor_execute", _anotar)
    return consultas


def test_el_tablero_entra_en_su_presupuesto_de_consultas(api, cliente_id, maquinas):
    """El tablero se mira en una pantalla colgada en la planta, todo el día.

    Nueve consultas es el techo: con una por máquina, o una por orden para
    sacarle el último pase, el endpoint se iría a decenas y la pantalla de la
    oficina lo pediría cada vez. `pasos` sale de UNA sola consulta con
    funciones de ventana justamente por esto.
    """
    ot = api.post("/api/ordenes", json={"cliente_id": cliente_id}).json()
    api.post(f"/api/ordenes/{ot['id']}/etapa",
             json={"etapa": "impresion", "maquina_id": maquinas["PYTEST-TB-VENUS"]})

    consultas = _contar_consultas(lambda: api.get("/api/produccion/tablero"))
    assert consultas, "el contador no vio nada: el listener no está escuchando"
    assert len(consultas) <= 9, "\n\n".join(consultas)


def test_la_version_es_una_sola_consulta(api):
    """Es lo que se va a pedir cada 3 segundos: tiene que ser barato.

    Una sola consulta de agregados, sin traer ni una fila. Si alguna vez son
    dos, el endpoint perdió la gracia y conviene revisarlo antes que subir el
    número acá.
    """
    consultas = _contar_consultas(lambda: api.get("/api/produccion/version"))
    assert len(consultas) == 1, "\n\n".join(consultas)
