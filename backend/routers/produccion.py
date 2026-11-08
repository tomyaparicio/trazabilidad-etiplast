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

Alrededor de las tres etapas escaneables el tablero completa el recorrido con
secciones que NO salen del escaneo: las **pendientes** (el 1er paso: la orden
emitida que todavía no arrancó), las **finalizadas** (el 5to paso: la orden
cerrada por la oficina) y el **depósito** (qué producto terminado hay y qué
falta).

El recorrido que numera esta pantalla tiene CINCO pasos —pendiente, extrusión,
impresión, troquelado, finalizado—, y a propósito NO coincide con los ①②③ de la
ficha impresa: el papel numera los tres pases que hace el operario EN LA
MÁQUINA, la pantalla numera el camino completo de LA ORDEN. Son dos audiencias
distintas, así que los números no tienen por qué ser los mismos.
"""
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import case, func, nullslast, select
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

# El 5to paso del flujo de planta: finalizado. No es una etapa escaneable más
# —el QR sigue teniendo tres pases y la ficha impresa no cambia— sino la orden
# cerrada por la oficina (`ESTADOS_ORDEN` en routers/ordenes.py). El escaneo de
# troquelado no cierra nada: haber troquelado no es haber entregado.
ESTADO_FINALIZADA = "completada"

# Del depósito, el tablero muestra lo que sale de la planta.
TIPO_TERMINADO = "producto_terminado"

# Lo que entra en pantalla de un vistazo. El tablero no es el historial: para
# eso están /api/ordenes y /api/stock, que paginan.
TOPE_PENDIENTES = 20
TOPE_FINALIZADAS = 20
TOPE_STOCK = 24

TITULOS_ETAPA = {
    "extrusion":  "Extrusión",
    "impresion":  "Impresión",
    "troquelado": "Troquelado",
}

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
    # ahí el hecho es el cierre, y el cierre lo marca `updated_at`.
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

    # El 5to y último paso: las que ya salieron. Se muestran con `updated_at` y
    # no con otra marca porque es la única que no depende de que alguien la
    # escriba: la pone la base sola (`onupdate=now()`) en el mismo UPDATE que
    # pasa el estado a «completada». `created_at` es cuándo se cargó el pedido
    # —puede ser de meses antes, y es justo la marca que usan las pendientes,
    # donde el hecho que importa es el otro—, `fecha_entrega` es una promesa al
    # cliente (una fecha futura, no un hecho) y `fecha_troquelado` la escribe el
    # escaneo de una etapa que no es el cierre, así que ni marca el final ni
    # está siempre.
    # `updated_at` tampoco es exacta: una edición posterior la corre. Es la
    # mejor disponible sin agregar una columna, y agregarla pedía migración.
    finalizadas = [
        {
            "id":       o.id,
            "numero":   o.numero,
            "lote":     o.lote,
            "cliente":  c.marca if c else None,
            "producto": p.nombre if p else None,
            "cantidad": o.cantidad,
            "fecha":    o.updated_at.isoformat() if o.updated_at else None,
        }
        for o, c, p in (
            db.query(OrdenTrabajo, Cliente, ClienteProducto)
            .outerjoin(Cliente, Cliente.id == OrdenTrabajo.cliente_id)
            .outerjoin(ClienteProducto, ClienteProducto.id == OrdenTrabajo.cliente_producto_id)
            .filter(OrdenTrabajo.estado == ESTADO_FINALIZADA)
            # Una orden migrada a mano puede no tener marca: al fondo, no
            # arriba (Postgres pone los nulos primero en un DESC).
            .order_by(nullslast(OrdenTrabajo.updated_at.desc()), OrdenTrabajo.id.desc())
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
    total_items, bajo_minimo, finalizadas_total, pendientes_total = (
        db.query(
            func.count(case((StockItem.tipo == TIPO_TERMINADO, 1))),
            func.count(case((BAJO_MINIMO, 1))),
            FINALIZADAS_TOTAL,
            PENDIENTES_TOTAL,
        )
        .filter(StockItem.activo.is_(True))
        .one()
    )

    ocupadas = sum(1 for c in columnas if c["orden"])
    return {
        "pendientes":  pendientes,
        "maquinas":    columnas,
        "etapas":      etapas,
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
        },
    }
