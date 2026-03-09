"""
Router de razones sociales — Etiplast ERP
==========================================
Entidad legal que agrupa múltiples marcas/clientes.
"""
from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from database import get_db
from dependencies import verify_token
from models import RazonSocial, Cliente

router = APIRouter(prefix="/api", tags=["razones_sociales"])


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/razones-sociales
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/razones-sociales", summary="Listar razones sociales")
async def listar_razones_sociales(
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
    search: Optional[str] = Query(None),
    per_page: int = Query(30, ge=1, le=200),
):
    query = db.query(RazonSocial)
    if search:
        query = query.filter(RazonSocial.razon_social.ilike(f"%{search}%"))
    items = query.order_by(RazonSocial.razon_social).limit(per_page).all()
    return {"data": [rs.to_dict() for rs in items], "total": len(items)}


# ──────────────────────────────────────────────────────────────────────────────
# POST /api/razones-sociales
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/razones-sociales", status_code=201, summary="Crear razón social")
async def crear_razon_social(
    datos: Dict[str, Any] = Body(...),
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    rs = datos.get("razon_social", "").strip()
    if not rs:
        raise HTTPException(status_code=400, detail="razon_social es requerido")

    obj = RazonSocial(razon_social=rs, cuit=datos.get("cuit"))
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj.to_dict()


# ──────────────────────────────────────────────────────────────────────────────
# PUT /api/razones-sociales/{id}
# ──────────────────────────────────────────────────────────────────────────────

@router.put("/razones-sociales/{rs_id}", summary="Actualizar razón social")
async def actualizar_razon_social(
    rs_id: int,
    datos: Dict[str, Any] = Body(...),
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    obj = db.query(RazonSocial).filter(RazonSocial.id == rs_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Razón social no encontrada")

    if "razon_social" in datos and datos["razon_social"]:
        obj.razon_social = datos["razon_social"].strip()
    if "cuit" in datos:
        obj.cuit = datos["cuit"]

    db.commit()
    db.refresh(obj)
    return obj.to_dict()


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/razones-sociales/{id}  — con lista de marcas
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/razones-sociales/{rs_id}", summary="Obtener razón social con sus marcas")
async def obtener_razon_social(
    rs_id: int,
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    obj = (
        db.query(RazonSocial)
        .options(joinedload(RazonSocial.clientes))
        .filter(RazonSocial.id == rs_id)
        .first()
    )
    if not obj:
        raise HTTPException(status_code=404, detail="Razón social no encontrada")

    return {
        **obj.to_dict(),
        "marcas": [
            {"id": c.id, "id_cliente": c.id_cliente, "marca": c.marca}
            for c in obj.clientes
        ],
    }
