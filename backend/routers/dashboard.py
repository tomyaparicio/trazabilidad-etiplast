"""
Router del dashboard — Etiplast ERP
=====================================
Estadísticas y datos para filtros.
Usa las tablas de catálogo (rubros, provincias) para queries más eficientes.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from database import get_db
from dependencies import verify_token
from models import Cliente, ClienteProducto, ClienteUbicacion, OrdenTrabajo, Provincia, RazonSocial, Rubro

router = APIRouter(prefix="/api", tags=["dashboard"])


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
