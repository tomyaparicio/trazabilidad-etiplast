"""Rutas del dashboard y filtros."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from models import Cliente
from dependencies import verify_token

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/dashboard/stats", summary="Estadísticas del dashboard")
async def dashboard_stats(
    authorization: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    total_clientes = db.query(func.count(Cliente.id)).scalar()

    rubros_query = (
        db.query(Cliente.rubro, func.count(Cliente.id))
        .group_by(Cliente.rubro)
        .order_by(func.count(Cliente.id).desc())
        .all()
    )
    rubros = [
        {"nombre": r or "Sin rubro", "cantidad": c}
        for r, c in rubros_query
    ]

    provincias_query = (
        db.query(Cliente.provincia, func.count(Cliente.id))
        .group_by(Cliente.provincia)
        .order_by(func.count(Cliente.id).desc())
        .limit(10)
        .all()
    )
    provincias = [
        {"nombre": p or "Sin provincia", "cantidad": c}
        for p, c in provincias_query
    ]

    return {
        "total_clientes": total_clientes,
        "rubros": rubros,
        "provincias": provincias,
    }


@router.get("/dashboard/filtros", summary="Rubros y provincias para filtros")
async def obtener_filtros(
    authorization: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    rubros = sorted([
        r[0] for r in db.query(Cliente.rubro).distinct().all()
        if r[0]
    ])
    provincias = sorted([
        p[0] for p in db.query(Cliente.provincia).distinct().all()
        if p[0]
    ])

    return {"rubros": rubros, "provincias": provincias}
