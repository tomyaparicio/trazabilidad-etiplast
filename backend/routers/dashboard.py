"""
Router del dashboard — Etiplast ERP
=====================================
Estadísticas y datos para filtros.
Usa las tablas de catálogo (rubros, provincias) para queries más eficientes.
"""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import extract, func
from sqlalchemy.orm import Session, joinedload

from database import get_db
from dependencies import verify_token
from models import Cliente, ClienteProducto, ClienteUbicacion, OrdenTrabajo, Presupuesto, Provincia, RazonSocial, Rubro

router = APIRouter(prefix="/api", tags=["dashboard"])


def _metricas_financieras(db: Session, year: Optional[int] = None, month: Optional[int] = None) -> dict:
    """Agregados de $ para el tab Administrativo, filtrables por período.

    "Facturación" = valor de las órdenes (total_final); NO representa dinero
    efectivamente cobrado (el sistema no registra pagos/cobros). Se excluyen
    las órdenes en borrador y canceladas.

    Período: sin params = histórico completo (comportamiento original).
    `year` acota todos los agregados a ese año; `month` (requiere year) acota
    los agregados a ese mes, pero la serie mensual sigue siendo del año entero
    (así el gráfico muestra el año con el mes elegido en contexto).
    """
    from datetime import date

    vivas = OrdenTrabajo.estado.notin_(["cancelada", "borrador"])

    # Filtros de período sobre la fecha de creación (agregados).
    periodo_ot, periodo_pres = [], []
    if year:
        periodo_ot.append(extract("year", OrdenTrabajo.created_at) == year)
        periodo_pres.append(extract("year", Presupuesto.created_at) == year)
        if month:
            periodo_ot.append(extract("month", OrdenTrabajo.created_at) == month)
            periodo_pres.append(extract("month", Presupuesto.created_at) == month)

    facturacion_total = (
        db.query(func.coalesce(func.sum(OrdenTrabajo.total_final), 0))
        .filter(vivas, *periodo_ot)
        .scalar()
    )
    facturacion_completadas = (
        db.query(func.coalesce(func.sum(OrdenTrabajo.total_final), 0))
        .filter(OrdenTrabajo.estado == "completada", *periodo_ot)
        .scalar()
    )
    ticket_promedio = (
        db.query(func.coalesce(func.avg(OrdenTrabajo.total_final), 0))
        .filter(vivas, OrdenTrabajo.total_final.isnot(None), *periodo_ot)
        .scalar()
    )

    def _presu(estado: str):
        monto = (
            db.query(func.coalesce(func.sum(Presupuesto.total), 0))
            .filter(Presupuesto.estado == estado, *periodo_pres)
            .scalar()
        )
        cant = (
            db.query(func.count(Presupuesto.id))
            .filter(Presupuesto.estado == estado, *periodo_pres)
            .scalar()
        )
        return float(monto or 0), int(cant or 0)

    aprob_monto, aprob_cant = _presu("aprobado")
    pend_monto, pend_cant = _presu("enviado")

    # Tasa de aprobación: aprobados sobre presupuestos ya presentados (no borrador)
    presupuestos_total = (
        db.query(func.count(Presupuesto.id))
        .filter(Presupuesto.estado != "borrador", *periodo_pres)
        .scalar() or 0
    )
    tasa_aprobacion = round(aprob_cant / presupuestos_total * 100) if presupuestos_total else 0

    # Serie mensual para el gráfico: del año elegido (completa, con ceros) o
    # histórica (últimos 8 meses con datos) si no hay filtro.
    mes_col = func.to_char(func.date_trunc("month", OrdenTrabajo.created_at), "YYYY-MM")
    q_serie = db.query(
        mes_col.label("mes"),
        func.coalesce(func.sum(OrdenTrabajo.total_final), 0).label("monto"),
    ).filter(vivas)
    if year:
        q_serie = q_serie.filter(extract("year", OrdenTrabajo.created_at) == year)
    filas = q_serie.group_by(mes_col).order_by(mes_col).all()
    por_mes = {f.mes: float(f.monto or 0) for f in filas}

    hoy = date.today()
    if year:
        # Año completo (hasta el mes actual si es el año en curso).
        ultimo = hoy.month if year == hoy.year else 12
        serie = [{"mes": f"{year}-{m:02d}", "monto": por_mes.get(f"{year}-{m:02d}", 0.0)} for m in range(1, ultimo + 1)]
    else:
        serie = [{"mes": m, "monto": v} for m, v in sorted(por_mes.items())][-8:]

    def _monto_mes(a: int, m: int) -> float:
        return float(
            db.query(func.coalesce(func.sum(OrdenTrabajo.total_final), 0))
            .filter(
                vivas,
                extract("year", OrdenTrabajo.created_at) == a,
                extract("month", OrdenTrabajo.created_at) == m,
            )
            .scalar() or 0
        )

    # Variación mes-a-mes: del mes elegido vs su anterior (cruza el año si hace
    # falta); sin mes elegido, últimos dos puntos de la serie.
    facturacion_mom = None
    if year and month:
        actual = por_mes.get(f"{year}-{month:02d}", 0.0)
        previo = _monto_mes(year, month - 1) if month > 1 else _monto_mes(year - 1, 12)
        if previo:
            facturacion_mom = round((actual - previo) / previo * 100)
        elif actual:
            facturacion_mom = 100
    elif len(serie) >= 2:
        actual, previo = serie[-1]["monto"], serie[-2]["monto"]
        if previo:
            facturacion_mom = round((actual - previo) / previo * 100)
        elif actual:
            facturacion_mom = 100

    # Años con órdenes (para armar el filtro en el frontend).
    anios = [
        int(r[0]) for r in
        db.query(extract("year", OrdenTrabajo.created_at)).distinct().order_by(extract("year", OrdenTrabajo.created_at).desc()).all()
        if r[0] is not None
    ]
    if hoy.year not in anios:
        anios.insert(0, hoy.year)

    return {
        "facturacion_total":             float(facturacion_total or 0),
        "facturacion_completadas":       float(facturacion_completadas or 0),
        "facturacion_mom":               facturacion_mom,
        "facturacion_mensual":           serie,
        "ticket_promedio":               round(float(ticket_promedio or 0), 2),
        "presupuestos_aprobados_monto":  aprob_monto,
        "presupuestos_pendientes_monto": pend_monto,
        "presupuestos_aprobados":        aprob_cant,
        "presupuestos_pendientes":       pend_cant,
        "presupuestos_total":            int(presupuestos_total),
        "tasa_aprobacion":               tasa_aprobacion,
        "anio":                          year,
        "mes":                           month,
        "anios_disponibles":             anios,
    }


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/dashboard/finanzas — métricas financieras filtrables por período
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/dashboard/finanzas", summary="Métricas financieras (filtrables por año y mes)")
async def dashboard_finanzas(
    year: Optional[int] = Query(None, ge=2000, le=2100, description="Año a filtrar"),
    month: Optional[int] = Query(None, ge=1, le=12, description="Mes a filtrar (requiere year)"),
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    return _metricas_financieras(db, year=year, month=month)


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/dashboard/stats
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/dashboard/stats", summary="Estadísticas generales del sistema")
async def dashboard_stats(
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    # Total de marcas (= clientes)
    total_clientes = db.query(func.count(Cliente.id)).scalar()

    # Total de razones sociales
    total_razones_sociales = db.query(func.count(RazonSocial.id)).scalar()

    # Total de productos distintos (cliente_productos)
    total_productos = db.query(func.count(ClienteProducto.id)).scalar()

    # Marcas sin razón social vinculada
    marcas_sin_rs = (
        db.query(func.count(Cliente.id))
        .filter(Cliente.razon_social_id.is_(None))
        .scalar()
    )

    # Promedio de productos por marca (solo marcas con al menos 1)
    avg_subq = (
        db.query(func.count(ClienteProducto.id).label("cnt"))
        .filter(ClienteProducto.cliente_id == Cliente.id)
        .correlate(Cliente)
        .scalar_subquery()
    )
    marcas_con_productos = (
        db.query(func.count(Cliente.id))
        .filter(avg_subq > 0)
        .scalar()
    )

    # Distribución por rubro (usando catálogo)
    rubros_query = (
        db.query(Rubro.nombre, func.count(Cliente.id).label("cantidad"))
        .outerjoin(Cliente, Cliente.rubro_id == Rubro.id)
        .group_by(Rubro.id, Rubro.nombre)
        .order_by(func.count(Cliente.id).desc())
        .all()
    )
    # Clientes sin rubro asignado
    sin_rubro = (
        db.query(func.count(Cliente.id))
        .filter(Cliente.rubro_id.is_(None))
        .scalar()
    )
    rubros = [{"nombre": nombre, "cantidad": cantidad} for nombre, cantidad in rubros_query]
    if sin_rubro:
        rubros.append({"nombre": "Sin rubro", "cantidad": sin_rubro})

    # Top 10 provincias (usando catálogo)
    provincias_query = (
        db.query(Provincia.nombre, func.count(ClienteUbicacion.id).label("cantidad"))
        .join(ClienteUbicacion, ClienteUbicacion.provincia_id == Provincia.id)
        .group_by(Provincia.id, Provincia.nombre)
        .order_by(func.count(ClienteUbicacion.id).desc())
        .limit(10)
        .all()
    )
    provincias = [{"nombre": nombre, "cantidad": cantidad} for nombre, cantidad in provincias_query]

    # ── Órdenes de Trabajo ────────────────────────────────────────────────────
    ESTADOS = ["borrador", "pendiente", "en_proceso", "completada", "cancelada"]
    ACTIVOS = ["pendiente", "en_proceso"]

    ordenes_por_estado = {}
    for estado in ESTADOS:
        ordenes_por_estado[estado] = (
            db.query(func.count(OrdenTrabajo.id))
            .filter(OrdenTrabajo.estado == estado)
            .scalar() or 0
        )

    ordenes_activas = sum(ordenes_por_estado[e] for e in ACTIVOS)

    # Últimas 8 órdenes (cualquier estado), más recientes primero
    ot_recientes = (
        db.query(OrdenTrabajo)
        .options(
            joinedload(OrdenTrabajo.cliente),
            joinedload(OrdenTrabajo.creador),
            joinedload(OrdenTrabajo.responsable),
        )
        .order_by(OrdenTrabajo.created_at.desc())
        .limit(3)
        .all()
    )
    ordenes_recientes = [
        {
            "id":                  o.id,
            "numero":              o.numero,
            "cliente_nombre":      o.cliente.marca if o.cliente else None,
            "estado":              o.estado,
            "fecha":               o.fecha.isoformat() if o.fecha else None,
            "cantidad":            o.cantidad,
            "created_at":          o.created_at.isoformat() if o.created_at else None,
            "creador_nombre":      o.creador.nombre_completo if o.creador else None,
            "responsable_nombre":  o.responsable.nombre_completo if o.responsable else None,
        }
        for o in ot_recientes
    ]

    return {
        "total_clientes":        total_clientes,
        "total_razones_sociales": total_razones_sociales,
        "total_productos":        total_productos,
        "marcas_sin_rs":          marcas_sin_rs,
        "marcas_con_productos":   marcas_con_productos,
        "rubros":                 rubros,
        "provincias":             provincias,
        # OTs
        "ordenes_activas":      ordenes_activas,
        "ordenes_por_estado":   ordenes_por_estado,
        "ordenes_recientes":    ordenes_recientes,
        # Finanzas (facturación = valor de órdenes; no es dinero cobrado)
        "finanzas":             _metricas_financieras(db),
    }


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/dashboard/filtros
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/dashboard/filtros", summary="Opciones disponibles para filtros")
async def obtener_filtros(
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """
    Devuelve rubros y provincias desde sus catálogos,
    ordenados alfabéticamente.
    """
    rubros = [
        r.nombre for r in
        db.query(Rubro).order_by(Rubro.nombre).all()
    ]
    provincias = [
        p.nombre for p in
        db.query(Provincia).order_by(Provincia.nombre).all()
    ]
    from models import Envase
    envases = [
        e.nombre for e in
        db.query(Envase).order_by(Envase.nombre).all()
    ]

    return {"rubros": rubros, "provincias": provincias, "envases": envases}
