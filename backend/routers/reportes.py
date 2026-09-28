"""
Router de Reportes y KPIs — Etiplast ERP
=========================================
Endpoints de agregados de negocio (Fase 2A):

  GET /api/reportes/produccion        producción agrupada (máquina|operador|cliente|mes)
  GET /api/reportes/tiempos           promedio de días entre etapas de la OT
  GET /api/reportes/ordenes-series    serie temporal de OTs creadas por mes
  GET /api/reportes/clientes-top      ranking de clientes por cantidad de OTs
  GET /api/reportes/stock-resumen     totales de stock por tipo + bajo mínimo

Todos los endpoints son DEFENSIVOS: cualquier error interno se captura y se
devuelve una respuesta vacía/segura (nunca 500). Sólo agregados, sin paginación.
"""
import logging
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from core.database import get_db
from core.security import verify_token
from models import (
    Cliente, OrdenExtrusionBobina, OrdenTrabajo,
    StockItem,
)

router = APIRouter(prefix="/api", tags=["reportes"])

logger = logging.getLogger(__name__)

# Mensaje genérico para el cliente: el detalle real (str(exc)) se loguea server-side
# y NO se filtra en la respuesta (podría revelar estructura interna / datos).
_ERROR_GENERICO = "No se pudo generar el reporte"


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

AGRUPACIONES = ("maquina", "operador", "cliente", "mes")


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
      - pct_a_tiempo: NO calculable con el esquema actual (no hay fecha
        comprometida de entrega, sólo `fecha_entrega` real) → siempre null.
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
            "pct_a_tiempo": None,  # sin fecha comprometida en el modelo
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
            "items_bajo_stock": 0,
            "error": _ERROR_GENERICO,
        }
