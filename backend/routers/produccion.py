"""
Router de Producción — Etiplast ERP
====================================
El tablero de planta: dónde está cada pedido, en vivo.

Lectura del rastro que dejan los escaneos del QR (`plan_produccion`). No hay
otro origen.

El tablero tiene dos mitades porque la planta tiene dos clases de etapa:

  - **Impresión** elige máquina (Venus, ReinaFlex, Taurus, Autoadhesiva hacen
    cosas distintas) → una columna por impresora.
  - **Extrusión y troquelado** no: las máquinas son intercambiables → una
    columna por etapa, con los trabajos que están en ella.

Alrededor de las tres etapas de máquina el tablero completa el recorrido con
las **pendientes** (el 1er paso: la orden emitida que todavía no arrancó, que
no sale del escaneo justamente porque lo que la define es que nadie la
escaneó), las **finalizadas** (el 5to paso: la orden cerrada, por el escaneo de
`finalizado` o a mano desde la oficina) y el **depósito** (qué producto
terminado hay y qué falta).

El recorrido que numera esta pantalla tiene CINCO pasos —pendiente, extrusión,
impresión, troquelado, finalizado—, y a propósito NO coincide con los ①②③ de la
ficha impresa: el papel numera los tres pases que hace el operario EN LA
MÁQUINA, la pantalla numera el camino completo de LA ORDEN. Son dos audiencias
distintas, así que los números no tienen por qué ser los mismos.
"""
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import Text, and_, case, cast, func, nullslast, select
from sqlalchemy.orm import Session

from core.database import get_db
from core.security import verify_token
from models import (
    ETAPAS_CON_MAQUINA, ETAPAS_PRODUCCION, Cliente, ClienteProducto, Maquina,
    OrdenTrabajo, PlanProduccion, StockItem,
)

router = APIRouter(prefix="/api/produccion", tags=["produccion"])

# Una orden ocupa lugar sólo mientras se está haciendo. Una completada o
# cancelada libera la máquina aunque nadie haya escaneado la salida.
ESTADOS_EN_PLANTA = ("en_proceso",)

# El 1er paso del recorrido: la orden emitida que todavía no arrancó. Tampoco
# sale del escaneo —justamente, lo que la define es que nadie la escaneó— sino
# del estado que le puso la oficina al cargarla (`ESTADOS_ORDEN` en
# routers/ordenes.py). `borrador` y `pendiente` son el mismo hecho para la
# planta: está cargada y no empezó. Faltaba en el tablero, así que una orden
# recién emitida no aparecía en ninguna parte hasta el primer escaneo.
#
# Ojo que no es lo mismo que `sin_ubicar`: ésa YA arrancó (está `en_proceso`) y
# nadie sabe dónde está, que es un problema. Ésta no arrancó, y eso es normal.
ESTADOS_PENDIENTES = ("borrador", "pendiente")

# El 5to paso del flujo de planta: finalizado, o sea la orden `completada`
# (`ESTADOS_ORDEN` en routers/ordenes.py).
#
# Ya no es sólo una decisión de la oficina: hay un escaneo propio para cerrar
# (`ETAPA_CIERRE`, el 4to que puede hacer el QR). La ficha impresa igual no
# cambia —sigue numerando los ①②③ pases de máquina— porque el cierre no se hace
# en ninguna: la etapa se elige en la pantalla del escaneo.
#
# Lo que sigue sin cerrar nada son las tres etapas de planta: el escaneo de
# troquelado no da la orden por terminada, haber troquelado no es haber entregado.
ESTADO_FINALIZADA = "completada"

# La orden cancelada no está en ninguna parte del recorrido: no se va a hacer.
# Pero NO puede desaparecer callada —se cuenta en `resumen.canceladas`— porque
# el que mira el tablero cuenta órdenes, y un número que no cierra con el
# listado es la clase de cosa que hace desconfiar de toda la pantalla.
ESTADO_CANCELADA = "cancelada"

# Del depósito, el tablero muestra lo que sale de la planta.
TIPO_TERMINADO = "producto_terminado"

# Lo que entra en pantalla de un vistazo. El tablero no es el historial: para
# eso están /api/ordenes y /api/stock, que paginan.
TOPE_PENDIENTES = 20
TOPE_FINALIZADAS = 20
TOPE_STOCK = 24
TOPE_PASO = 20

TITULOS_ETAPA = {
    "extrusion":  "Extrusión",
    "impresion":  "Impresión",
    "troquelado": "Troquelado",
}

# ──────────────────────────────────────────────────────────────────────────────
# Los cinco pasos del recorrido
# ──────────────────────────────────────────────────────────────────────────────
# Las tres etapas escaneables son el MEDIO del camino. Una orden también está
# en algún lugar antes del primer escaneo y después del último, así que el
# recorrido tiene cinco pasos y las claves salen de `ETAPAS_PRODUCCION` para
# que no puedan desalinearse con el resto del router.
PASO_INICIAL = "orden_trabajo"
PASO_FINAL   = "finalizado"
CLAVES_PASO  = (PASO_INICIAL, *ETAPAS_PRODUCCION, PASO_FINAL)
TITULOS_PASO = {
    PASO_INICIAL: "Orden de trabajo",
    PASO_FINAL:   "Finalizado",
    **TITULOS_ETAPA,
}

# Cuántas canceladas hay. Misma técnica que `FINALIZADAS_TOTAL`: viaja de
# prestado en la consulta de contadores del depósito para no gastar otro viaje.
CANCELADAS_TOTAL = (
    select(func.count(OrdenTrabajo.id))
    .where(OrdenTrabajo.estado == ESTADO_CANCELADA)
    .scalar_subquery()
)

# La marca del cierre, en UN solo lugar: la usan la fecha que se muestra, su
# `ORDER BY` y el `desde` del paso 5. Ordenar por una marca distinta de la que
# se exhibe deja la lista revuelta a la vista sin que nada más se rompa.
#
# `fecha_cierre` la escribe el escaneo de `finalizado` en el momento del cierre
# y nada más la vuelve a tocar. `updated_at` NO sirve sola —era lo que había
# antes—: cualquier edición posterior la corre, así que corregirle una medida a
# una orden cerrada el mes pasado la mostraba como recién cerrada, arriba de
# todo, justo en la lista que se mira para saber qué salió hoy.
#
# Pero queda de respaldo, porque las órdenes cerradas ANTES de que existiera la
# columna no tienen `fecha_cierre` y su fecha de cierre no se puede inventar.
# Sin el `coalesce` quedarían sin fecha y, en un DESC, Postgres pone los NULOS
# PRIMERO: las más viejas se treparían al tope.
MARCA_CIERRE = func.coalesce(OrdenTrabajo.fecha_cierre, OrdenTrabajo.updated_at)

# Mismo criterio que `StockItem.to_dict()`: un stock nulo con mínimo cargado
# está bajo mínimo. Se calcula en SQL una sola vez para que la bandera de cada
# fila y los contadores no puedan discrepar.
BAJO_MINIMO = (
    func.coalesce(StockItem.stock_actual, 0) < func.coalesce(StockItem.stock_minimo, 0)
)

# Cuántas finalizadas hay DE VERDAD. La lista que devuelve el tablero viene con
# tope, así que su largo no es el total: con 57 cerradas diría «20» para
# siempre, justo al lado de contadores que sí son totales.
#
# Va de subconsulta escalar dentro de la consulta de contadores del depósito, y
# no en una consulta propia, porque el endpoint cuida su número de viajes a la
# base (ver el comentario de `filas`). No se puede resolver juntando tablas en
# el mismo FROM: esos contadores filtran por `StockItem.activo`, un WHERE que
# con las órdenes no tiene nada que ver, y meterlas ahí las dejaría atadas a
# que exista un ítem activo en el depósito. Como la subconsulta no está
# correlacionada con la fila de afuera, Postgres la evalúa una sola vez
# (InitPlan) y el costo es el de un count suelto.
FINALIZADAS_TOTAL = (
    select(func.count(OrdenTrabajo.id))
    .where(OrdenTrabajo.estado == ESTADO_FINALIZADA)
    .scalar_subquery()
)

# Y lo mismo para las que esperan: la lista también viene con tope, así que su
# largo tampoco es el total. Mismo patrón que `FINALIZADAS_TOTAL` y en la misma
# consulta de contadores, por la misma razón: no gastar otro viaje a la base.
PENDIENTES_TOTAL = (
    select(func.count(OrdenTrabajo.id))
    .where(OrdenTrabajo.estado.in_(ESTADOS_PENDIENTES))
    .scalar_subquery()
)


def _resumen_orden(
    orden: OrdenTrabajo,
    pase: PlanProduccion,
    cliente: Optional[Cliente],
    producto: Optional[ClienteProducto],
) -> dict:
    return {
        "id":       orden.id,
        "numero":   orden.numero,
        "lote":     orden.lote,
        "cliente":  cliente.marca if cliente else None,
        "producto": producto.nombre if producto else None,
        "cantidad": orden.cantidad,
        "etapa":    pase.etapa,
        # Cuándo la escanearon. `created_at` es el momento real del escaneo;
        # `fecha_inicio` es sólo el día, porque la tabla nació para planificar.
        "desde":    pase.created_at.isoformat() if pase.created_at else None,
        "operario": getattr(orden, f"operador_{pase.etapa}", None),
    }


def _pasos(db: Session) -> list[dict]:
    """El recorrido completo: en qué paso está cada orden, sin perder ninguna.

    Esto arregla el agujero grande que tenía el tablero: las columnas de
    máquina y de etapa sólo miran pases `en_curso`, y el escaneo CIERRA el pase
    anterior cuando otra orden entra a la misma impresora (está bien: una
    impresora no puede tener dos trabajos). Desde ese momento la orden vieja
    —que sigue en producción— no estaba en ninguna columna y caía en
    `sin_ubicar`, que encima dice «nadie la escaneó» de una orden escaneada dos
    veces. Un tablero que pierde órdenes es peor que no tener tablero: da
    confianza falsa.

    La regla nueva es: el paso de una orden lo marca su ÚLTIMO pase, abierto o
    cerrado. Un pase cerrado no significa «no está»: significa «pasó por acá y
    nadie la escaneó en la etapa siguiente», que es justo lo que hay que ir a
    buscar a la planta. `en_maquina` distingue los dos casos.

    Todo en UNA consulta. El endpoint cuida su número de viajes a la base y
    traer los pases para ordenarlos en Python sería un N+1 encubierto:

      1. `ultimo`: `row_number()` por orden sobre `plan_produccion`, así queda
         el pase más nuevo de cada una sin un GROUP BY + segundo viaje.
      2. `base`:   a qué paso va cada orden y desde cuándo.
      3. `rankeo`: `row_number()` y `count()` por paso, para sacar el tope de 20
         Y el total de verdad de la misma pasada (el largo de una lista
         recortada no es un total: con 57 cerradas diría «20» para siempre).
    """
    ultimo = (
        select(
            PlanProduccion.orden_trabajo_id.label("orden_id"),
            PlanProduccion.etapa.label("etapa"),
            PlanProduccion.estado.label("estado"),
            PlanProduccion.maquina_id.label("maquina_id"),
            # El momento real del escaneo. `fecha_inicio` es sólo el día,
            # porque la tabla nació para planificar.
            PlanProduccion.created_at.label("desde"),
            func.row_number().over(
                partition_by=PlanProduccion.orden_trabajo_id,
                # Por `id` y no por fecha: dos escaneos del mismo día empatan
                # en `fecha_inicio` (es DATE) y el orden quedaría a la suerte
                # del plan de Postgres.
                order_by=PlanProduccion.id.desc(),
            ).label("rn"),
        )
        .subquery()
    )

    # Una etapa que no está en el catálogo (dato viejo, o `NULL`) NO puede
    # hacer desaparecer la orden: cae al primer paso. Entre perder una orden y
    # mostrarla en el lugar equivocado, se muestra.
    etapa_conocida = ultimo.c.etapa.in_(ETAPAS_PRODUCCION)

    # Las ramas de la asignación, en orden de prioridad, y en UN solo lugar:
    # cada una dice a qué paso va la orden Y desde cuándo está ahí. Son dos
    # `CASE` gemelos armados de la misma lista justamente para que no puedan
    # desalinearse — un `desde` que no corresponda al paso ordena la lista por
    # una fecha de otra cosa.
    #
    # El estado manda sobre el pase: una orden cerrada por la oficina va al
    # paso 5 aunque su último pase sea de impresión, o el tablero diría que
    # todavía está en la planta.
    ramas = (
        (OrdenTrabajo.estado == ESTADO_FINALIZADA,     PASO_FINAL,     MARCA_CIERRE),
        (OrdenTrabajo.estado.in_(ESTADOS_PENDIENTES),  PASO_INICIAL,   OrdenTrabajo.created_at),
        (etapa_conocida,                               ultimo.c.etapa, ultimo.c.desde),
    )
    # El `else` cubre lo que queda: en producción y sin un solo pase, o sea
    # nadie la vio nunca en la planta. Su lugar honesto es la cola de entrada.
    clave = case(*[(cond, paso)  for cond, paso, _ in ramas], else_=PASO_INICIAL)
    desde = case(*[(cond, marca) for cond, _, marca in ramas], else_=OrdenTrabajo.created_at)

    base = (
        select(
            OrdenTrabajo.id.label("id"),
            OrdenTrabajo.numero.label("numero"),
            OrdenTrabajo.lote.label("lote"),
            Cliente.marca.label("cliente"),
            ClienteProducto.nombre.label("producto"),
            OrdenTrabajo.cantidad.label("cantidad"),
            clave.label("clave"),
            desde.label("desde"),
            # Quién firmó el pase. El operario se guarda en una columna por
            # etapa (`operador_impresion`…), así que el `CASE` hace de pivote.
            case(
                *[
                    (ultimo.c.etapa == e, getattr(OrdenTrabajo, f"operador_{e}"))
                    for e in ETAPAS_PRODUCCION
                ]
            ).label("operario"),
            # El código solo no alcanza (nadie en la planta llama «IMP-002» a
            # la Reinaflex) y el nombre solo tampoco (hay dos Venus). El `CASE`
            # es por los pases sin máquina: `concat` trata el NULO como vacío y
            # devolvería « ()».
            case(
                (Maquina.id.is_(None), None),
                else_=func.concat(Maquina.codigo, " (", Maquina.nombre, ")"),
            ).label("maquina"),
            # Pase abierto = está arriba de la máquina AHORA. Sin pase el
            # `WHEN` da NULO, que no es verdadero, y cae en el `else`.
            case((ultimo.c.estado == "en_curso", True), else_=False).label("en_maquina"),
        )
        .select_from(OrdenTrabajo)
        .outerjoin(ultimo, and_(ultimo.c.orden_id == OrdenTrabajo.id, ultimo.c.rn == 1))
        .outerjoin(Maquina, Maquina.id == ultimo.c.maquina_id)
        .outerjoin(Cliente, Cliente.id == OrdenTrabajo.cliente_id)
        .outerjoin(ClienteProducto, ClienteProducto.id == OrdenTrabajo.cliente_producto_id)
        .where(OrdenTrabajo.estado != ESTADO_CANCELADA)
        .subquery()
    )

    rankeo = (
        select(
            *base.c,
            func.row_number().over(
                partition_by=base.c.clave,
                # Una orden migrada a mano puede no tener marca: al fondo, no
                # arriba (Postgres pone los nulos primero en un DESC).
                order_by=(nullslast(base.c.desde.desc()), base.c.id.desc()),
            ).label("pos"),
            func.count().over(partition_by=base.c.clave).label("total"),
        )
        .subquery()
    )

    filas = db.execute(
        select(rankeo).where(rankeo.c.pos <= TOPE_PASO).order_by(rankeo.c.clave, rankeo.c.pos)
    ).all()

    # Los cinco pasos siempre, aunque estén en cero: un paso ausente no se
    # distingue de «no hay nada ahí» y le revienta la pantalla al que lo lee.
    pasos = {
        c: {"clave": c, "numero": i, "titulo": TITULOS_PASO[c], "total": 0, "ordenes": []}
        for i, c in enumerate(CLAVES_PASO, start=1)
    }

    for f in filas:
        # Indexado directo y no `.get()`: si el `CASE` llegara a producir una
        # clave que no es ninguno de los cinco pasos, eso es una orden
        # PERDIDA. Que explote es mucho mejor que que la pantalla mienta.
        paso = pasos[f.clave]
        paso["total"] = f.total
        # Máquina y operario sólo tienen sentido en las tres etapas de planta:
        # en el paso 1 todavía no la tocó nadie y en el 5 ya salió. Y
        # `en_maquina` tiene que ser falso ahí aunque haya quedado un pase
        # abierto sin cerrar, o el tablero diría que una orden entregada está
        # ocupando una impresora.
        en_planta = f.clave in ETAPAS_PRODUCCION
        paso["ordenes"].append({
            "id":         f.id,
            "numero":     f.numero,
            "lote":       f.lote,
            "cliente":    f.cliente,
            "producto":   f.producto,
            "cantidad":   f.cantidad,
            "desde":      f.desde.isoformat() if f.desde else None,
            "operario":   f.operario   if en_planta else None,
            "maquina":    f.maquina    if en_planta else None,
            "en_maquina": bool(f.en_maquina) if en_planta else False,
        })

    return [pasos[c] for c in CLAVES_PASO]


@router.get("/tablero", summary="Tablero de planta: dónde está cada pedido")
def tablero(
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    # Sólo las máquinas de etapas que eligen máquina. Una troqueladora cargada
    # en el catálogo no es una columna: ningún escaneo la va a ocupar nunca, y
    # mostrarla «Libre» para siempre sería mentir.
    maquinas = (
        db.query(Maquina)
        .filter(Maquina.activa.is_(True), Maquina.tipo.in_(ETAPAS_CON_MAQUINA))
        .order_by(Maquina.tipo, Maquina.nombre)
        .all()
    )

    # Un solo golpe a la base: los pases en curso con su orden, cliente y
    # producto. Sin esto el tablero haría una consulta por máquina.
    filas = (
        db.query(PlanProduccion, OrdenTrabajo, Cliente, ClienteProducto)
        .join(OrdenTrabajo, OrdenTrabajo.id == PlanProduccion.orden_trabajo_id)
        .outerjoin(Cliente, Cliente.id == OrdenTrabajo.cliente_id)
        .outerjoin(ClienteProducto, ClienteProducto.id == OrdenTrabajo.cliente_producto_id)
        .filter(
            PlanProduccion.estado == "en_curso",
            OrdenTrabajo.estado.in_(ESTADOS_EN_PLANTA),
        )
        .order_by(PlanProduccion.id)
        .all()
    )

    # Por máquina queda el pase más nuevo. No debería haber dos (el escaneo
    # cierra el anterior), pero si una corrida vieja dejó algo colgado, el
    # tablero muestra lo último y no se rompe.
    por_maquina: dict[int, dict] = {}
    por_etapa: dict[str, list] = {e: [] for e in ETAPAS_PRODUCCION}
    ubicadas: set[int] = set()

    for pase, orden, cliente, producto in filas:
        resumen = _resumen_orden(orden, pase, cliente, producto)
        ubicadas.add(orden.id)
        if pase.maquina_id is not None:
            por_maquina[pase.maquina_id] = resumen
        elif pase.etapa in por_etapa:
            por_etapa[pase.etapa].append(resumen)

    columnas = [
        {
            "id":     m.id,
            "codigo": m.codigo,
            "nombre": m.nombre,
            "tipo":   m.tipo,
            "orden":  por_maquina.get(m.id),
        }
        for m in maquinas
    ]

    # Las etapas que no eligen máquina, siempre presentes aunque estén vacías:
    # una columna ausente no se distingue de «no hay nada ahí».
    etapas = [
        {
            "etapa":   e,
            "titulo":  TITULOS_ETAPA.get(e, e),
            "ordenes": por_etapa[e],
        }
        for e in ETAPAS_PRODUCCION
        if e not in ETAPAS_CON_MAQUINA
    ]

    # El 1er paso: emitida y sin arrancar. No hay escaneo que la ubique porque
    # todavía no tiene que haberlo: es la cola de entrada de la planta.
    #
    # La fecha es `created_at` y NO `updated_at` como en las finalizadas, y la
    # diferencia importa: de una orden que no arrancó lo que se quiere saber es
    # HACE CUÁNTO QUE ESTÁ ESPERANDO. Con `updated_at`, corregirle una medida a
    # una orden de hace un mes la haría figurar como recién emitida y taparía
    # justo el dato que se viene a buscar acá. En las finalizadas es al revés:
    # ahí el hecho es el cierre, y el cierre lo marca `fecha_cierre` (ver
    # `MARCA_CIERRE`), que la escribe el escaneo de finalizado y después nadie
    # mueve. `updated_at` quedó ahí sólo de respaldo, para las órdenes que se
    # cerraron antes de que esa columna existiera.
    pendientes = [
        {
            "id":       o.id,
            "numero":   o.numero,
            "lote":     o.lote,
            "cliente":  c.marca if c else None,
            "producto": p.nombre if p else None,
            "cantidad": o.cantidad,
            "fecha":    o.created_at.isoformat() if o.created_at else None,
        }
        for o, c, p in (
            db.query(OrdenTrabajo, Cliente, ClienteProducto)
            .outerjoin(Cliente, Cliente.id == OrdenTrabajo.cliente_id)
            .outerjoin(ClienteProducto, ClienteProducto.id == OrdenTrabajo.cliente_producto_id)
            .filter(OrdenTrabajo.estado.in_(ESTADOS_PENDIENTES))
            # Una orden migrada a mano puede no tener marca: al fondo, no
            # arriba (Postgres pone los nulos primero en un DESC).
            .order_by(nullslast(OrdenTrabajo.created_at.desc()), OrdenTrabajo.id.desc())
            .limit(TOPE_PENDIENTES)
            .all()
        )
    ]

    # Está en producción y nadie la escaneó: no se sabe dónde está. Mostrarlas
    # aparte es media gracia del tablero.
    sin_ubicar = [
        {
            "id":       o.id,
            "numero":   o.numero,
            "lote":     o.lote,
            "cliente":  c.marca if c else None,
            "cantidad": o.cantidad,
        }
        for o, c in (
            db.query(OrdenTrabajo, Cliente)
            .outerjoin(Cliente, Cliente.id == OrdenTrabajo.cliente_id)
            .filter(OrdenTrabajo.estado.in_(ESTADOS_EN_PLANTA))
            .order_by(OrdenTrabajo.id)
            .all()
        )
        if o.id not in ubicadas
    ]

    # El 5to y último paso: las que ya salieron. La fecha es `MARCA_CIERRE`, o
    # sea el `fecha_cierre` que escribe el escaneo de `finalizado` con
    # `updated_at` de respaldo para las que se cerraron antes de que existiera
    # la columna (el porqué de las dos, en `MARCA_CIERRE`).
    #
    # Las otras marcas no sirven: `created_at` es cuándo se cargó el pedido
    # —puede ser de meses antes, y es justo la que usan las pendientes, donde el
    # hecho que importa es el otro—, `fecha_entrega` es una promesa al cliente
    # (una fecha futura, no un hecho) y `fecha_troquelado` la escribe el escaneo
    # de una etapa que no es el cierre, así que ni marca el final ni está
    # siempre.
    #
    # La MISMA expresión viaja en el SELECT y en el ORDER BY a propósito: si se
    # escribieran por separado podrían desalinearse, y una lista ordenada por
    # una fecha distinta de la que muestra se ve revuelta sin más explicación.
    finalizadas = [
        {
            "id":       o.id,
            "numero":   o.numero,
            "lote":     o.lote,
            "cliente":  c.marca if c else None,
            "producto": p.nombre if p else None,
            "cantidad": o.cantidad,
            "fecha":    cerrada.isoformat() if cerrada else None,
        }
        for o, c, p, cerrada in (
            db.query(
                OrdenTrabajo, Cliente, ClienteProducto,
                MARCA_CIERRE.label("cerrada"),
            )
            .outerjoin(Cliente, Cliente.id == OrdenTrabajo.cliente_id)
            .outerjoin(ClienteProducto, ClienteProducto.id == OrdenTrabajo.cliente_producto_id)
            .filter(OrdenTrabajo.estado == ESTADO_FINALIZADA)
            # Una orden migrada a mano puede no tener ninguna de las dos
            # marcas: al fondo, no arriba (Postgres pone los nulos primero en
            # un DESC).
            .order_by(nullslast(MARCA_CIERRE.desc()), OrdenTrabajo.id.desc())
            .limit(TOPE_FINALIZADAS)
            .all()
        )
    ]

    # El depósito. Columnas sueltas y no `to_dict()`: el tablero necesita un
    # subconjunto, y leer `item.cliente` fila por fila sería un N+1.
    terminado = [
        {
            "id":             item_id,
            "codigo":         codigo,
            "nombre":         nombre,
            "unidad":         unidad,
            "stock_actual":   float(actual) if actual is not None else None,
            "stock_minimo":   float(minimo) if minimo is not None else None,
            "bajo_minimo":    bool(falta),
            "cliente_nombre": marca,
        }
        for item_id, codigo, nombre, unidad, actual, minimo, falta, marca in (
            db.query(
                StockItem.id, StockItem.codigo, StockItem.nombre, StockItem.unidad,
                StockItem.stock_actual, StockItem.stock_minimo,
                BAJO_MINIMO.label("bajo_minimo"), Cliente.marca,
            )
            .outerjoin(Cliente, Cliente.id == StockItem.cliente_id)
            .filter(StockItem.activo.is_(True), StockItem.tipo == TIPO_TERMINADO)
            # Primero lo que falta: el tablero se mira para saber qué frena la
            # planta, no para leer el inventario en orden alfabético.
            .order_by(BAJO_MINIMO.desc(), StockItem.nombre.asc())
            .limit(TOPE_STOCK)
            .all()
        )
    ]

    # Los contadores en una sola pasada. `total_items` dice cuánto hay en el
    # depósito, porque la lista de arriba viene recortada; los faltantes
    # cuentan cualquier tipo: la materia prima que falta frena la planta igual
    # que el producto terminado, y es justo la que nadie va a ver en la lista.
    # Los totales de órdenes viajan de prestado acá (ver `FINALIZADAS_TOTAL` y
    # `PENDIENTES_TOTAL`): es el mismo problema —un número que la lista
    # recortada no puede dar— y no vale otro viaje a la base por cada uno.
    total_items, bajo_minimo, finalizadas_total, pendientes_total, canceladas = (
        db.query(
            func.count(case((StockItem.tipo == TIPO_TERMINADO, 1))),
            func.count(case((BAJO_MINIMO, 1))),
            FINALIZADAS_TOTAL,
            PENDIENTES_TOTAL,
            CANCELADAS_TOTAL,
        )
        .filter(StockItem.activo.is_(True))
        .one()
    )

    pasos = _pasos(db)

    ocupadas = sum(1 for c in columnas if c["orden"])
    return {
        "pendientes":  pendientes,
        "maquinas":    columnas,
        "etapas":      etapas,
        "pasos":       pasos,
        "sin_ubicar":  sin_ubicar,
        "finalizadas": finalizadas,
        "stock": {
            "terminado":   terminado,
            "total_items": total_items,
            "bajo_minimo": bajo_minimo,
        },
        "resumen": {
            "ocupadas":    ocupadas,
            "libres":      len(columnas) - ocupadas,
            "en_etapas":   sum(len(e["ordenes"]) for e in etapas),
            "sin_ubicar":  len(sin_ubicar),
            # En los dos casos, dos números distintos a propósito: el de
            # nombre pelado es cuántas trae la lista (con tope), el `_total`
            # cuántas hay de verdad.
            "pendientes":        len(pendientes),
            "pendientes_total":  pendientes_total,
            "finalizadas":       len(finalizadas),
            "finalizadas_total": finalizadas_total,
            "bajo_minimo": bajo_minimo,
            # El invariante del recorrido, a la vista: estos dos sumados tienen
            # que dar el total de órdenes de la base. Si no cierra, el tablero
            # está perdiendo órdenes y hay que mirar `_pasos`.
            "pasos_total": sum(p["total"] for p in pasos),
            "canceladas":  canceladas,
        },
    }


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/produccion/version
# ──────────────────────────────────────────────────────────────────────────────
# Qué resume cada tabla: cuántas filas hay y cuáles son sus marcas más altas.
#
# El conteo NO es redundante con el `max`: borrar una fila no mueve ningún
# máximo, y una orden borrada cambia el tablero igual que una nueva.
#
# El conteo de pases ABIERTOS está por el caso más difícil: cuando el escaneo
# cierra un pase para liberar la máquina no se crea ni se borra ninguna fila,
# sólo cambia el `estado` de una que ya estaba. `max(updated_at)` también lo
# nota (`onupdate=func.now()` se aplica incluso en el UPDATE masivo de
# `registrar_etapa`, porque la columna no viaja en el SET), pero esa garantía
# depende de que nadie escriba `updated_at` a mano en el SET. El contador no
# depende de nada: si un pase se cierra, baja. Las dos señales, mismo barrido.
def _huella(pk, *marcas):
    """Una tabla resumida en UNA columna de texto, sin traer filas."""
    return select(
        func.concat_ws(
            ".",
            func.count(pk),
            # `concat_ws` SALTEA los argumentos nulos, así que una tabla vacía
            # correría las posiciones y dos estados distintos podrían dar la
            # misma huella. El `coalesce` deja el hueco escrito.
            *[func.coalesce(cast(m, Text), "-") for m in marcas],
        )
    ).scalar_subquery()


HUELLA_ORDENES = _huella(
    OrdenTrabajo.id, func.max(OrdenTrabajo.id), func.max(OrdenTrabajo.updated_at),
)
HUELLA_PASES = _huella(
    PlanProduccion.id,
    func.max(PlanProduccion.id),
    func.max(PlanProduccion.updated_at),
    func.count(case((PlanProduccion.estado == "en_curso", 1))),
)
HUELLA_STOCK = _huella(
    StockItem.id, func.max(StockItem.id), func.max(StockItem.updated_at),
)


@router.get("/version", summary="Versión del tablero: cambia si cambió algo que muestra")
def version(
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Un valor opaco que cambia cuando cambia algo que el tablero muestra.

    Para qué: el que escanea está en la tablet de la planta y el que mira el
    tablero está en la oficina, en otro navegador. El escaneo no tiene forma de
    avisarle a la otra pantalla, así que la pantalla pregunta. Pedir el tablero
    entero cada 3 segundos es caro (son 8 consultas, con listas y joins);
    pedir ESTO es una sola consulta de agregados que no trae ni una fila, y el
    tablero completo se recarga sólo cuando el valor cambió.

    Y no es SSE a propósito: el frontend pasa por el proxy de Next
    (`frontend/src/app/api/backend/[...path]/route.ts`), que hace
    `await res.text()` y buferea la respuesta entera —un stream se colgaría—, y
    `vercel.json` no declara `maxDuration`, así que Vercel cortaría la función
    igual.

    El valor es OPACO: el cliente sólo compara si cambió. Nada de parsearlo —
    el formato puede cambiar cuando el tablero muestre otra cosa.
    """
    huellas = db.execute(select(HUELLA_ORDENES, HUELLA_PASES, HUELLA_STOCK)).one()
    return {"v": "|".join(huellas)}
