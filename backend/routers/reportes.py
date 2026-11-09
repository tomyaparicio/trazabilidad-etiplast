"""
Router de Reportes y KPIs — Etiplast ERP
=========================================
Endpoints de agregados de negocio (Fase 2A):

  GET /api/reportes/produccion        producción agrupada (máquina|operador|cliente|mes)
  GET /api/reportes/tiempos           promedio de días entre etapas de la OT
  GET /api/reportes/ordenes-series    serie temporal de OTs creadas por mes
  GET /api/reportes/clientes-top      ranking de clientes por cantidad de OTs
  GET /api/reportes/stock-resumen     totales de stock por tipo + bajo mínimo
  GET /api/reportes/estimaciones      fecha estimada de fin y atraso proyectado
  GET /api/reportes/esperas           esperas acumuladas y cuello de botella

Todos los endpoints son DEFENSIVOS: cualquier error interno se captura y se
devuelve una respuesta vacía/segura (nunca 500). Sólo agregados, sin paginación.
"""
import logging
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Date, case, func
from sqlalchemy.orm import Session

from core.database import get_db
from core.security import verify_token
from models import (
    Cliente, Maquina, OrdenExtrusionBobina, OrdenTrabajo,
    PlanProduccion, StockItem,
)
from models.produccion import ETAPAS_PRODUCCION

router = APIRouter(prefix="/api", tags=["reportes"])

logger = logging.getLogger(__name__)

# Mensaje genérico para el cliente: el detalle real (str(exc)) se loguea server-side
# y NO se filtra en la respuesta (podría revelar estructura interna / datos).
_ERROR_GENERICO = "No se pudo generar el reporte"


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

AGRUPACIONES = ("maquina", "operador", "cliente", "mes")

# Estados que todavía no tienen desenlace: el pedido sigue vivo.
ESTADOS_ABIERTOS = ("borrador", "pendiente", "en_proceso")


def _parse_fecha(valor: Optional[str]) -> Optional[date]:
    """Convierte 'YYYY-MM-DD' a date; devuelve None si no parsea."""
    if not valor:
        return None
    try:
        return datetime.strptime(valor.strip()[:10], "%Y-%m-%d").date()
    except (ValueError, AttributeError):
        return None


def _aplicar_rango_fecha(query, columna, desde: Optional[date], hasta: Optional[date]):
    """Filtra una query por rango de fechas sobre `columna` (inclusive)."""
    if desde is not None:
        query = query.filter(columna >= desde)
    if hasta is not None:
        query = query.filter(columna <= hasta)
    return query


def _float(valor) -> float:
    """Convierte Decimal/None a float seguro."""
    try:
        return float(valor) if valor is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/reportes/produccion
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/reportes/produccion", summary="Producción agrupada")
def reporte_produccion(
    desde: Optional[str] = Query(None, description="YYYY-MM-DD (filtra por fecha de OT)"),
    hasta: Optional[str] = Query(None, description="YYYY-MM-DD"),
    agrupar: str = Query("maquina", description="maquina | operador | cliente | mes"),
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """
    Cuenta de OTs, suma de `cantidad` y suma de kg de bobinas, agrupado.
    El rango de fechas se aplica sobre OrdenTrabajo.fecha (fallback created_at).
    """
    if agrupar not in AGRUPACIONES:
        agrupar = "maquina"

    d_desde = _parse_fecha(desde)
    d_hasta = _parse_fecha(hasta)

    try:
        # Suma de kg de bobinas por orden (subconsulta) para no inflar el count de OTs
        kg_subq = (
            db.query(
                OrdenExtrusionBobina.orden_id.label("orden_id"),
                func.coalesce(func.sum(OrdenExtrusionBobina.kg_bob), 0).label("kg"),
            )
            .group_by(OrdenExtrusionBobina.orden_id)
            .subquery()
        )

        if agrupar == "maquina":
            # Máquina de extrusión de la OT (texto libre, igual que operador).
            # Antes se mapeaba vía planificación; ese módulo fue dado de baja.
            maquina_col = func.coalesce(func.nullif(OrdenTrabajo.extrusion_maquina, ""), "Sin máquina")
            rows = (
                _aplicar_rango_fecha(
                    db.query(
                        maquina_col.label("grupo"),
                        func.count(func.distinct(OrdenTrabajo.id)).label("ots"),
                        func.coalesce(func.sum(OrdenTrabajo.cantidad), 0).label("cantidad"),
                        func.coalesce(func.sum(kg_subq.c.kg), 0).label("kg"),
                    )
                    .select_from(OrdenTrabajo)
                    .outerjoin(kg_subq, kg_subq.c.orden_id == OrdenTrabajo.id),
                    OrdenTrabajo.fecha, d_desde, d_hasta,
                )
                .group_by(maquina_col)
                .order_by(func.count(func.distinct(OrdenTrabajo.id)).desc())
                .all()
            )

        elif agrupar == "operador":
            # Campo `operador` de la OT. Si está vacío en todas, igual no rompe.
            rows = (
                _aplicar_rango_fecha(
                    db.query(
                        func.coalesce(func.nullif(OrdenTrabajo.operador, ""), "Sin operador").label("grupo"),
                        func.count(func.distinct(OrdenTrabajo.id)).label("ots"),
                        func.coalesce(func.sum(OrdenTrabajo.cantidad), 0).label("cantidad"),
                        func.coalesce(func.sum(kg_subq.c.kg), 0).label("kg"),
                    )
                    .select_from(OrdenTrabajo)
                    .outerjoin(kg_subq, kg_subq.c.orden_id == OrdenTrabajo.id),
                    OrdenTrabajo.fecha, d_desde, d_hasta,
                )
                .group_by(func.coalesce(func.nullif(OrdenTrabajo.operador, ""), "Sin operador"))
                .order_by(func.count(func.distinct(OrdenTrabajo.id)).desc())
                .all()
            )

        elif agrupar == "cliente":
            rows = (
                _aplicar_rango_fecha(
                    db.query(
                        func.coalesce(Cliente.marca, "Sin cliente").label("grupo"),
                        func.count(func.distinct(OrdenTrabajo.id)).label("ots"),
                        func.coalesce(func.sum(OrdenTrabajo.cantidad), 0).label("cantidad"),
                        func.coalesce(func.sum(kg_subq.c.kg), 0).label("kg"),
                    )
                    .select_from(OrdenTrabajo)
                    .join(Cliente, Cliente.id == OrdenTrabajo.cliente_id)
                    .outerjoin(kg_subq, kg_subq.c.orden_id == OrdenTrabajo.id),
                    OrdenTrabajo.fecha, d_desde, d_hasta,
                )
                .group_by(Cliente.marca)
                .order_by(func.count(func.distinct(OrdenTrabajo.id)).desc())
                .all()
            )

        else:  # mes
            # date_trunc sobre created_at (siempre presente).
            mes_col = func.to_char(func.date_trunc("month", OrdenTrabajo.created_at), "YYYY-MM")
            rows = (
                _aplicar_rango_fecha(
                    db.query(
                        mes_col.label("grupo"),
                        func.count(func.distinct(OrdenTrabajo.id)).label("ots"),
                        func.coalesce(func.sum(OrdenTrabajo.cantidad), 0).label("cantidad"),
                        func.coalesce(func.sum(kg_subq.c.kg), 0).label("kg"),
                    )
                    .select_from(OrdenTrabajo)
                    .outerjoin(kg_subq, kg_subq.c.orden_id == OrdenTrabajo.id),
                    OrdenTrabajo.fecha, d_desde, d_hasta,
                )
                .group_by(mes_col)
                .order_by(mes_col)
                .all()
            )

        data = [
            {
                "grupo": r.grupo,
                "ots": int(r.ots or 0),
                "cantidad": int(r.cantidad or 0),
                "kg": round(_float(r.kg), 2),
            }
            for r in rows
        ]
        return {
            "agrupar": agrupar,
            "desde": d_desde.isoformat() if d_desde else None,
            "hasta": d_hasta.isoformat() if d_hasta else None,
            "data": data,
        }
    except Exception:  # noqa: BLE001 — defensivo, nunca 500
        logger.exception("Error en reporte de producción")
        return {
            "agrupar": agrupar,
            "desde": d_desde.isoformat() if d_desde else None,
            "hasta": d_hasta.isoformat() if d_hasta else None,
            "data": [],
            "error": _ERROR_GENERICO,
        }


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/reportes/tiempos
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/reportes/tiempos", summary="Promedio de días entre etapas")
def reporte_tiempos(
    desde: Optional[str] = Query(None, description="YYYY-MM-DD"),
    hasta: Optional[str] = Query(None, description="YYYY-MM-DD"),
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """
    Promedio de días entre etapas consecutivas usando los campos fecha_* de la OT:
      extrusión → impresión → troquelado → entrega.
    Sólo se promedian las OTs que tienen ambas fechas de la transición presentes.
    """
    transiciones = [
        ("extrusion_impresion", "Extrusión → Impresión", OrdenTrabajo.fecha_extrusion, OrdenTrabajo.fecha_impresion),
        ("impresion_troquelado", "Impresión → Troquelado", OrdenTrabajo.fecha_impresion, OrdenTrabajo.fecha_troquelado),
        ("troquelado_entrega", "Troquelado → Entrega", OrdenTrabajo.fecha_troquelado, OrdenTrabajo.fecha_entrega),
        ("extrusion_entrega", "Extrusión → Entrega (total)", OrdenTrabajo.fecha_extrusion, OrdenTrabajo.fecha_entrega),
    ]

    d_desde = _parse_fecha(desde)
    d_hasta = _parse_fecha(hasta)

    try:
        etapas = []
        for clave, etiqueta, col_ini, col_fin in transiciones:
            q = (
                db.query(
                    func.avg(col_fin - col_ini).label("prom"),
                    func.count(OrdenTrabajo.id).label("muestras"),
                )
                .filter(col_ini.isnot(None), col_fin.isnot(None))
            )
            # El rango se aplica sobre la fecha de inicio de la transición.
            q = _aplicar_rango_fecha(q, col_ini, d_desde, d_hasta)
            row = q.one()
            muestras = int(row.muestras or 0)
            # (Date - Date) en Postgres devuelve un entero de días.
            prom = round(_float(row.prom), 1) if row.prom is not None else None
            etapas.append({
                "clave": clave,
                "etapa": etiqueta,
                "dias_promedio": prom,
                "muestras": muestras,
            })

        hay_datos = any(e["muestras"] > 0 for e in etapas)
        return {
            "disponible": hay_datos,
            "desde": d_desde.isoformat() if d_desde else None,
            "hasta": d_hasta.isoformat() if d_hasta else None,
            "etapas": etapas,
        }
    except Exception:  # noqa: BLE001 — defensivo
        logger.exception("Error en reporte de tiempos")
        return {"disponible": False, "etapas": [], "error": _ERROR_GENERICO}


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/reportes/ordenes-series
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/reportes/ordenes-series", summary="Serie temporal de OTs por mes")
def reporte_ordenes_series(
    meses: int = Query(12, ge=1, le=60, description="Cantidad de meses hacia atrás"),
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """
    Cantidad de OTs creadas por mes (date_trunc sobre created_at), últimos N meses,
    rellenando con 0 los meses sin órdenes.
    """
    try:
        hoy = date.today()
        # Lista de claves YYYY-MM de los últimos `meses` meses (incluye el actual).
        claves: list[str] = []
        y, m = hoy.year, hoy.month
        for _ in range(meses):
            claves.append(f"{y:04d}-{m:02d}")
            m -= 1
            if m == 0:
                m = 12
                y -= 1
        claves.reverse()

        # Fecha de corte: primer día del mes más antiguo de la ventana.
        primer_anio, primer_mes = int(claves[0][:4]), int(claves[0][5:7])
        corte = date(primer_anio, primer_mes, 1)

        mes_col = func.to_char(func.date_trunc("month", OrdenTrabajo.created_at), "YYYY-MM")
        rows = (
            db.query(mes_col.label("mes"), func.count(OrdenTrabajo.id).label("cantidad"))
            .filter(OrdenTrabajo.created_at >= corte)
            .group_by(mes_col)
            .all()
        )
        conteos = {r.mes: int(r.cantidad or 0) for r in rows if r.mes}

        serie = [{"mes": clave, "cantidad": conteos.get(clave, 0)} for clave in claves]
        return {"meses": meses, "data": serie}
    except Exception:  # noqa: BLE001 — defensivo
        logger.exception("Error en serie temporal de órdenes")
        return {"meses": meses, "data": [], "error": _ERROR_GENERICO}


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/reportes/clientes-top
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/reportes/clientes-top", summary="Top clientes por cantidad de OTs")
def reporte_clientes_top(
    limit: int = Query(10, ge=1, le=100),
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Ranking de clientes por cantidad de órdenes de trabajo asociadas."""
    try:
        rows = (
            db.query(
                Cliente.id.label("cliente_id"),
                func.coalesce(Cliente.marca, "Sin nombre").label("marca"),
                func.count(OrdenTrabajo.id).label("ots"),
                func.coalesce(func.sum(OrdenTrabajo.cantidad), 0).label("cantidad"),
            )
            .join(OrdenTrabajo, OrdenTrabajo.cliente_id == Cliente.id)
            .group_by(Cliente.id, Cliente.marca)
            .order_by(func.count(OrdenTrabajo.id).desc())
            .limit(limit)
            .all()
        )
        data = [
            {
                "cliente_id": r.cliente_id,
                "marca": r.marca,
                "ots": int(r.ots or 0),
                "cantidad": int(r.cantidad or 0),
            }
            for r in rows
        ]
        return {"limit": limit, "data": data}
    except Exception:  # noqa: BLE001 — defensivo
        logger.exception("Error en ranking de clientes")
        return {"limit": limit, "data": [], "error": _ERROR_GENERICO}


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/reportes/stock-resumen
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/reportes/stock-resumen", summary="Totales de stock por tipo")
def reporte_stock_resumen(
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """
    Por cada tipo de StockItem activo: cantidad de ítems, suma de stock actual y
    cuántos están por debajo del mínimo. Incluye totales globales.
    """
    try:
        bajo_minimo_expr = func.coalesce(
            func.sum(
                case((StockItem.stock_actual < StockItem.stock_minimo, 1), else_=0)
            ),
            0,
        )
        rows = (
            db.query(
                func.coalesce(StockItem.tipo, "sin_tipo").label("tipo"),
                func.count(StockItem.id).label("items"),
                func.coalesce(func.sum(StockItem.stock_actual), 0).label("stock_total"),
                bajo_minimo_expr.label("bajo_minimo"),
            )
            .filter(StockItem.activo.is_(True))
            .group_by(StockItem.tipo)
            .all()
        )
        data = [
            {
                "tipo": r.tipo,
                "items": int(r.items or 0),
                "stock_total": round(_float(r.stock_total), 2),
                "bajo_minimo": int(r.bajo_minimo or 0),
            }
            for r in rows
        ]
        return {
            "data": data,
            "total_items": sum(d["items"] for d in data),
            "total_bajo_minimo": sum(d["bajo_minimo"] for d in data),
        }
    except Exception:  # noqa: BLE001 — defensivo
        logger.exception("Error en resumen de stock")
        return {"data": [], "total_items": 0, "total_bajo_minimo": 0, "error": _ERROR_GENERICO}


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/reportes/resumen
# ──────────────────────────────────────────────────────────────────────────────

# ──────────────────────────────────────────────────────────────────────────────
# GET /api/reportes/esperas
# ──────────────────────────────────────────────────────────────────────────────

AGRUPACIONES_ESPERA = ("etapa", "maquina", "mes")


@router.get("/reportes/esperas", summary="Esperas acumuladas y cuellos de botella")
def reporte_esperas(
    agrupar: str = Query("etapa", description="etapa | maquina | mes"),
    desde: Optional[str] = Query(None, description="YYYY-MM-DD (filtra por fecha de OT)"),
    hasta: Optional[str] = Query(None, description="YYYY-MM-DD"),
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """
    Tiempos acumulados por etapa, máquina o mes, para encontrar el cuello de
    botella (RF-15). La fila que más acumula viene primero y además se nombra
    aparte, en `cuello`.

    QUÉ MIDE, con precisión: el tiempo que la orden PASÓ en cada etapa, no la
    espera en cola. El operario escanea al entrar a su paso, así que entre dos
    escaneos consecutivos hay una sola medición que contiene la cola y el
    trabajo de la máquina juntos, y con un escaneo por etapa no se pueden
    separar. Para encontrar el cuello alcanza —donde el trabajo se acumula se
    acumula igual por lentitud que por fila—, pero el reporte no puede atribuir
    la causa, y por eso no lo dice.

    Al agrupar por máquina sólo aparece impresión: es la única etapa que elige
    máquina (ver ETAPAS_CON_MAQUINA). En extrusión y troquelado las máquinas
    son intercambiables y el escaneo no registra cuál, así que esos pases se
    informan sin máquina en vez de repartirse a la fuerza.

    El último pase de una orden que sigue abierta no aporta: todavía no
    terminó, así que no tiene duración.
    """
    if agrupar not in AGRUPACIONES_ESPERA:
        raise HTTPException(
            status_code=400,
            detail=f"Agrupación inválida: {agrupar}. Son {', '.join(AGRUPACIONES_ESPERA)}",
        )

    d_desde = _parse_fecha(desde)
    d_hasta = _parse_fecha(hasta)

    try:
        ordenes = _aplicar_rango_fecha(
            db.query(OrdenTrabajo), OrdenTrabajo.fecha, d_desde, d_hasta,
        ).filter(OrdenTrabajo.estado != "cancelada").all()

        vacio = {"agrupar": agrupar, "filas": [], "cuello": None,
                 "desde": d_desde.isoformat() if d_desde else None,
                 "hasta": d_hasta.isoformat() if d_hasta else None}
        if not ordenes:
            return vacio

        ids = [o.id for o in ordenes]
        pases_por_orden: dict[int, list] = {i: [] for i in ids}
        for pase in (
            db.query(PlanProduccion)
            .filter(PlanProduccion.orden_trabajo_id.in_(ids))
            .order_by(PlanProduccion.orden_trabajo_id, PlanProduccion.created_at)
            .all()
        ):
            pases_por_orden[pase.orden_trabajo_id].append(pase)

        nombres_maquina = {
            m.id: m.nombre for m in db.query(Maquina).all()
        }

        # clave → (dias acumulados, cantidad de pases, etiqueta para mostrar)
        acum: dict[str, list] = {}

        def _sumar(clave: str, etiqueta: str, dias: float):
            fila = acum.setdefault(clave, [0.0, 0, etiqueta])
            fila[0] += dias
            fila[1] += 1

        for o in ordenes:
            pases = pases_por_orden[o.id]
            for actual, siguiente in zip(pases, pases[1:]):
                if actual.etapa not in ETAPAS_PRODUCCION:
                    continue
                if not actual.created_at or not siguiente.created_at:
                    continue
                dias = (siguiente.created_at - actual.created_at).total_seconds() / 86400.0
                if dias < 0:
                    continue

                if agrupar == "etapa":
                    _sumar(actual.etapa, actual.etapa.capitalize(), dias)
                elif agrupar == "maquina":
                    if actual.maquina_id is None:
                        _sumar("sin-maquina", "Sin máquina registrada", dias)
                    else:
                        _sumar(str(actual.maquina_id),
                               nombres_maquina.get(actual.maquina_id) or f"Máquina {actual.maquina_id}",
                               dias)
                else:  # mes
                    clave = actual.created_at.strftime("%Y-%m")
                    _sumar(clave, clave, dias)

        filas = [
            {"clave": k,
             "etiqueta": v[2],
             "dias_acumulados": round(v[0], 1),
             "dias_promedio": round(v[0] / v[1], 1) if v[1] else None,
             "pases": v[1]}
            for k, v in acum.items()
        ]
        # Por mes se lee cronológicamente; en los otros dos, lo que más acumula
        # arriba: el reporte existe para encontrar el cuello, no para listar.
        if agrupar == "mes":
            filas.sort(key=lambda f: f["clave"])
        else:
            filas.sort(key=lambda f: -f["dias_acumulados"])

        # El cuello sólo tiene sentido cuando se agrupa por etapa o máquina: un
        # mes no es un recurso que se pueda destrabar.
        cuello = None
        if agrupar in ("etapa", "maquina") and filas:
            cuello = filas[0]["clave"]

        return {
            "agrupar": agrupar,
            "desde": d_desde.isoformat() if d_desde else None,
            "hasta": d_hasta.isoformat() if d_hasta else None,
            "filas": filas,
            "cuello": cuello,
        }
    except HTTPException:
        raise
    except Exception:  # noqa: BLE001 — defensivo
        logger.exception("Error en reporte de esperas")
        return {"agrupar": agrupar, "filas": [], "cuello": None, "error": _ERROR_GENERICO}


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/reportes/estimaciones
# ──────────────────────────────────────────────────────────────────────────────

def _duraciones_por_etapa(pases: list) -> dict[str, list[float]]:
    """Cuánto duró cada etapa, en días, según los escaneos de una orden.

    La duración de una etapa es lo que pasó entre SU escaneo y el SIGUIENTE: el
    operario escanea al entrar, así que el escaneo de impresión es el final de
    extrusión. Por eso el último pase no aporta duración (nada lo cierra) salvo
    que el que sigue sea el del cierre.

    Se mide sobre `created_at`, que es TIMESTAMPTZ, y no sobre las `fecha_*` de
    la orden: ésas son DATE, y dos etapas del mismo día darían cero.
    """
    out: dict[str, list[float]] = {}
    for actual, siguiente in zip(pases, pases[1:]):
        if actual.etapa not in ETAPAS_PRODUCCION:
            continue
        if not actual.created_at or not siguiente.created_at:
            continue
        dias = (siguiente.created_at - actual.created_at).total_seconds() / 86400.0
        if dias < 0:
            continue
        out.setdefault(actual.etapa, []).append(dias)
    return out


@router.get("/reportes/estimaciones", summary="Fecha estimada de fin y atraso proyectado")
def reporte_estimaciones(
    desde: Optional[str] = Query(None, description="YYYY-MM-DD (filtra por fecha de OT)"),
    hasta: Optional[str] = Query(None, description="YYYY-MM-DD"),
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """
    Para cada orden abierta: cuándo se estima que termina y cuántos días de
    atraso proyecta contra el plazo pactado con el cliente (RF-13 y RF-14).

    El promedio de cada etapa sale de las órdenes YA CERRADAS del rango —«las
    órdenes anteriores» del requerimiento—, medido sobre los escaneos del QR.
    Si una etapa nunca se midió, su promedio no existe y la orden que la
    necesita no se estima: es mejor no informar nada que informar un número
    inventado, porque sobre esta fecha la oficina le contesta al cliente.

    Igual que el cumplimiento de plazos, cada promedio viaja con su muestra:
    un promedio de 3 días sobre una sola orden no se puede leer igual que sobre
    cuarenta.
    """
    d_desde = _parse_fecha(desde)
    d_hasta = _parse_fecha(hasta)

    try:
        q = _aplicar_rango_fecha(
            db.query(OrdenTrabajo), OrdenTrabajo.fecha, d_desde, d_hasta,
        ).filter(OrdenTrabajo.estado != "cancelada")
        ordenes = q.all()
        if not ordenes:
            return {"disponible": False, "promedios_etapa": {}, "muestras_etapa": {},
                    "ordenes": [],
                    "desde": d_desde.isoformat() if d_desde else None,
                    "hasta": d_hasta.isoformat() if d_hasta else None}

        ids = [o.id for o in ordenes]
        pases_por_orden: dict[int, list] = {i: [] for i in ids}
        for pase in (
            db.query(PlanProduccion)
            .filter(PlanProduccion.orden_trabajo_id.in_(ids))
            .order_by(PlanProduccion.orden_trabajo_id, PlanProduccion.created_at)
            .all()
        ):
            pases_por_orden[pase.orden_trabajo_id].append(pase)

        # — Promedios: sólo de las cerradas, que son las que recorrieron todo —
        acumulado: dict[str, list[float]] = {}
        for o in ordenes:
            if o.estado != "completada":
                continue
            for etapa, dias in _duraciones_por_etapa(pases_por_orden[o.id]).items():
                acumulado.setdefault(etapa, []).extend(dias)

        promedios = {e: round(sum(v) / len(v), 1) for e, v in acumulado.items() if v}
        muestras = {e: len(v) for e, v in acumulado.items()}

        # — Estimación de cada orden abierta —
        filas = []
        for o in ordenes:
            if o.estado not in ESTADOS_ABIERTOS:
                continue
            pases = pases_por_orden[o.id]
            if not pases:
                # Sin un solo escaneo no se sabe cuándo arrancó.
                continue
            ultimo = pases[-1]
            hechas = [p.etapa for p in pases if p.etapa in ETAPAS_PRODUCCION]

            if ultimo.etapa in ETAPAS_PRODUCCION:
                desde_idx = ETAPAS_PRODUCCION.index(ultimo.etapa)
                pendientes = [e for e in ETAPAS_PRODUCCION[desde_idx + 1:] if e not in hechas]
                necesarias = [ultimo.etapa] + pendientes
            else:
                pendientes = [e for e in ETAPAS_PRODUCCION if e not in hechas]
                necesarias = pendientes

            fecha_estimada = None
            if ultimo.created_at and all(e in promedios for e in necesarias):
                dias = round(sum(promedios[e] for e in necesarias))
                fecha_estimada = ultimo.created_at.date() + timedelta(days=dias)

            # El atraso se recorta en cero: adelantarse no es «atraso negativo»,
            # es llegar en término, y un número negativo en la columna de atraso
            # se lee mal en el panel.
            atraso = None
            if fecha_estimada and o.fecha_comprometida:
                atraso = max(0, (fecha_estimada - o.fecha_comprometida).days)

            filas.append({
                "id": o.id,
                "numero": o.numero,
                "cliente_nombre": o.cliente.marca if o.cliente else None,
                "estado": o.estado,
                "etapa_actual": ultimo.etapa,
                "etapas_hechas": hechas,
                "etapas_faltantes": pendientes,
                "ultimo_escaneo": ultimo.created_at.isoformat() if ultimo.created_at else None,
                "fecha_comprometida": o.fecha_comprometida.isoformat() if o.fecha_comprometida else None,
                "fecha_estimada": fecha_estimada.isoformat() if fecha_estimada else None,
                "atraso_proyectado_dias": atraso,
            })

        # Ordenadas por el atraso que proyectan: lo que hay que mirar primero.
        filas.sort(key=lambda f: (-(f["atraso_proyectado_dias"] or 0),
                                  f["fecha_estimada"] or "9999-12-31"))

        return {
            "disponible": bool(promedios),
            "desde": d_desde.isoformat() if d_desde else None,
            "hasta": d_hasta.isoformat() if d_hasta else None,
            "promedios_etapa": promedios,
            "muestras_etapa": muestras,
            "ordenes": filas if promedios else [],
        }
    except Exception:  # noqa: BLE001 — defensivo
        logger.exception("Error en reporte de estimaciones")
        return {"disponible": False, "promedios_etapa": {}, "muestras_etapa": {},
                "ordenes": [], "error": _ERROR_GENERICO}


# ──────────────────────────────────────────────────────────────────────────────
# Cumplimiento de plazos
# ──────────────────────────────────────────────────────────────────────────────

def _desenlace():
    """La fecha en que el pedido efectivamente terminó.

    `fecha_entrega` es la buena. Pero hay órdenes que se cerraron con el escaneo
    de finalizado sin que nadie cargara la entrega, y descartarlas achicaría la
    muestra sin razón: para esas vale la fecha del cierre, que la escribe el
    sistema y no una persona. `fecha_cierre` es TIMESTAMPTZ, así que se la baja
    a DATE para poder compararla con un plazo que es DATE.
    """
    return func.coalesce(
        OrdenTrabajo.fecha_entrega,
        func.cast(OrdenTrabajo.fecha_cierre, Date),
    )


def _cumplimiento_plazos(db: Session, d_desde: Optional[date], d_hasta: Optional[date]) -> dict:
    """Cumplimiento de plazos del rango: el indicador que pide el RF-14.

    Compara el plazo pactado con el cliente (`fecha_comprometida`) contra el
    desenlace real de la orden. Devuelve tres cosas y las tres importan:

      pct_a_tiempo        porcentaje de órdenes terminadas en término, o None
      muestras_a_tiempo   sobre cuántas órdenes se calculó ese porcentaje
      atrasadas_abiertas  órdenes sin terminar cuyo plazo ya venció

    Por qué `None` y no `0.0` cuando no hay muestra: un 0% se lee como «ninguna
    salió en término», que es una afirmación sobre la planta. No tener con qué
    medir es otra cosa, y el reporte tiene que poder decir las dos.

    Por qué se informa `muestras_a_tiempo` junto al porcentaje: las órdenes
    cargadas antes de que existiera la columna no tienen plazo registrado y
    quedan fuera de la cuenta. Un 100% sobre dos órdenes y un 100% sobre
    doscientas son lecturas distintas, y quien mira el panel necesita el
    denominador para distinguirlas.
    """
    # — Terminadas con plazo y con desenlace: las únicas medibles —
    #
    # La cancelada queda afuera a propósito: un pedido que el cliente dio de
    # baja no es un plazo que la planta incumplió, y contarlo como atraso
    # ensuciaría el indicador con decisiones comerciales.
    desenlace = _desenlace()
    q = (
        db.query(
            func.count(OrdenTrabajo.id).label("medibles"),
            func.sum(
                case((desenlace <= OrdenTrabajo.fecha_comprometida, 1), else_=0)
            ).label("en_termino"),
        )
        .filter(
            OrdenTrabajo.estado == "completada",
            OrdenTrabajo.fecha_comprometida.isnot(None),
            desenlace.isnot(None),
        )
    )
    q = _aplicar_rango_fecha(q, OrdenTrabajo.fecha, d_desde, d_hasta)
    row = q.one()

    medibles = int(row.medibles or 0)
    en_termino = int(row.en_termino or 0)
    pct = round(en_termino * 100.0 / medibles, 1) if medibles else None

    # — Abiertas con el plazo ya vencido: atraso real, no proyectado —
    q_atraso = (
        db.query(func.count(OrdenTrabajo.id))
        .filter(
            OrdenTrabajo.estado.in_(ESTADOS_ABIERTOS),
            OrdenTrabajo.fecha_comprometida.isnot(None),
            OrdenTrabajo.fecha_comprometida < date.today(),
        )
    )
    q_atraso = _aplicar_rango_fecha(q_atraso, OrdenTrabajo.fecha, d_desde, d_hasta)

    return {
        "pct_a_tiempo": pct,
        "muestras_a_tiempo": medibles,
        "en_termino": en_termino,
        "atrasadas_abiertas": int(q_atraso.scalar() or 0),
    }


@router.get("/reportes/resumen", summary="KPIs resumidos del rango")
def reporte_resumen(
    desde: Optional[str] = Query(None, description="YYYY-MM-DD (filtra por fecha de OT)"),
    hasta: Optional[str] = Query(None, description="YYYY-MM-DD"),
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """
    KPIs para las tarjetas del panel de reportes, filtrados por rango sobre
    OrdenTrabajo.fecha:
      - total_ots, completadas, en_proceso (y resto por estado)
      - pct_a_tiempo: porcentaje de órdenes terminadas en término, comparando
        la fecha comprometida con el cliente contra el desenlace real, junto
        con la muestra sobre la que se calculó y las abiertas ya vencidas
        (ver `_cumplimiento_plazos`). Es null cuando ninguna orden del rango
        tiene plazo registrado.
      - items_bajo_stock: ítems de stock activos por debajo del mínimo.
    """
    d_desde = _parse_fecha(desde)
    d_hasta = _parse_fecha(hasta)

    try:
        q = _aplicar_rango_fecha(
            db.query(
                func.coalesce(func.nullif(OrdenTrabajo.estado, ""), "borrador").label("estado"),
                func.count(OrdenTrabajo.id).label("cant"),
            ),
            OrdenTrabajo.fecha, d_desde, d_hasta,
        ).group_by(func.coalesce(func.nullif(OrdenTrabajo.estado, ""), "borrador"))

        por_estado: dict[str, int] = {r.estado: int(r.cant or 0) for r in q.all()}
        total_ots = sum(por_estado.values())

        # Ítems de stock activos por debajo del mínimo (no depende del rango).
        items_bajo_stock = (
            db.query(func.count(StockItem.id))
            .filter(
                StockItem.activo.is_(True),
                StockItem.stock_actual < StockItem.stock_minimo,
            )
            .scalar()
        )

        return {
            "desde": d_desde.isoformat() if d_desde else None,
            "hasta": d_hasta.isoformat() if d_hasta else None,
            "total_ots": total_ots,
            "por_estado": por_estado,
            "completadas": por_estado.get("completada", 0),
            "en_proceso": por_estado.get("en_proceso", 0),
            "pendientes": por_estado.get("pendiente", 0),
            "canceladas": por_estado.get("cancelada", 0),
            **_cumplimiento_plazos(db, d_desde, d_hasta),
            "items_bajo_stock": int(items_bajo_stock or 0),
        }
    except Exception:  # noqa: BLE001 — defensivo
        logger.exception("Error en resumen de KPIs")
        return {
            "desde": d_desde.isoformat() if d_desde else None,
            "hasta": d_hasta.isoformat() if d_hasta else None,
            "total_ots": 0,
            "por_estado": {},
            "completadas": 0,
            "en_proceso": 0,
            "pendientes": 0,
            "canceladas": 0,
            "pct_a_tiempo": None,
            "muestras_a_tiempo": 0,
            "en_termino": 0,
            "atrasadas_abiertas": 0,
            "items_bajo_stock": 0,
            "error": _ERROR_GENERICO,
        }
