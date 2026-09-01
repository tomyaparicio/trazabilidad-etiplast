"""
Router de razones sociales — Etiplast ERP
==========================================
Entidad legal que agrupa múltiples marcas/clientes.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from database import get_db
from dependencies import verify_token
from models import RazonSocial, Cliente
from services import auditoria
from schemas import RazonSocialCreateSchema, RazonSocialUpdateSchema

router = APIRouter(prefix="/api", tags=["razones_sociales"])


def _validar_numero_libre(db: Session, numero, excluir_id=None):
    """El N° identifica al cliente en toda la planta: no puede repetirse.

    Si dos entidades legales comparten número, buscarlo devuelve clientes de
    ambas y nadie sabe cuál es cuál. Se corta acá, nombrando con quién choca.
    """
    if numero is None:
        return
    q = db.query(RazonSocial).filter(RazonSocial.numero == numero)
    if excluir_id is not None:
        q = q.filter(RazonSocial.id != excluir_id)
    otra = q.first()
    if otra:
        raise HTTPException(
            status_code=409,
            detail=f"El N° {numero} ya es de «{otra.razon_social}». Cada razón social lleva el suyo.",
        )


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/razones-sociales
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/razones-sociales", summary="Listar razones sociales")
async def listar_razones_sociales(
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(30, ge=1, le=200),
):
    import math

    term = f"%{search.strip()}%" if search else None

    # Query base con join para cantidad_marcas
    base_q = (
        db.query(RazonSocial, func.count(Cliente.id).label("cantidad_marcas"))
        .outerjoin(Cliente, Cliente.razon_social_id == RazonSocial.id)
        .group_by(RazonSocial.id)
    )

    # Conteo real (sin paginar)
    count_q = db.query(func.count(RazonSocial.id))

    if term:
        # Intentar búsqueda por número si el término es numérico
        try:
            num = int(search.strip())
            filter_expr = (
                RazonSocial.razon_social.ilike(term) |
                RazonSocial.cuit.ilike(term) |
                (RazonSocial.numero == num)
            )
        except ValueError:
            filter_expr = RazonSocial.razon_social.ilike(term) | RazonSocial.cuit.ilike(term)
        base_q  = base_q.filter(filter_expr)
        count_q = count_q.filter(filter_expr)

    total: int = count_q.scalar() or 0

    offset = (page - 1) * per_page
    rows = base_q.order_by(RazonSocial.razon_social).offset(offset).limit(per_page).all()

    return {
        "data":        [{**rs.to_dict(), "cantidad_marcas": cant} for rs, cant in rows],
        "total":       total,
        "page":        page,
        "per_page":    per_page,
        "total_pages": math.ceil(total / per_page) if total > 0 else 1,
    }


# ──────────────────────────────────────────────────────────────────────────────
# POST /api/razones-sociales
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/razones-sociales", status_code=201, summary="Crear razón social")
async def crear_razon_social(
    payload: RazonSocialCreateSchema,
    user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    rs = (payload.razon_social or "").strip()
    if not rs:
        raise HTTPException(status_code=400, detail="razon_social es requerido")

    _validar_numero_libre(db, payload.numero)

    obj = RazonSocial(razon_social=rs, cuit=payload.cuit, numero=payload.numero)
    db.add(obj)
    db.flush()   # asigna el id sin cerrar la transacción (la auditoría va adentro)

    auditoria.registrar(db, user, "crear", "razon_social", obj.id,
                        f"Creó razón social {obj.razon_social}",
                        datos={"razon_social": obj.razon_social, "cuit": obj.cuit, "numero": obj.numero})
    db.commit()
    db.refresh(obj)
    return {**obj.to_dict(), "cantidad_marcas": 0}


# ──────────────────────────────────────────────────────────────────────────────
# PUT /api/razones-sociales/{id}
# ──────────────────────────────────────────────────────────────────────────────

@router.put("/razones-sociales/{rs_id}", summary="Actualizar razón social")
async def actualizar_razon_social(
    rs_id: int,
    payload: RazonSocialUpdateSchema,
    user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    obj = db.query(RazonSocial).filter(RazonSocial.id == rs_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Razón social no encontrada")

    # El N° repercute en TODAS las marcas de la empresa y en cómo se las busca:
    # sin el "antes" no hay forma de reconstruir qué pasó.
    antes = {"razon_social": obj.razon_social, "cuit": obj.cuit, "numero": obj.numero}

    datos = payload.model_dump(exclude_unset=True)
    if "razon_social" in datos and datos["razon_social"]:
        obj.razon_social = datos["razon_social"].strip()
    if "cuit" in datos:
        obj.cuit = datos["cuit"]
    if "numero" in datos:
        _validar_numero_libre(db, datos["numero"], excluir_id=rs_id)
        obj.numero = datos["numero"]

    auditoria.registrar(db, user, "actualizar", "razon_social", obj.id,
                        f"Actualizó razón social {obj.razon_social}",
                        datos={"antes": antes,
                               "despues": {"razon_social": obj.razon_social, "cuit": obj.cuit,
                                           "numero": obj.numero}})
    db.commit()
    db.refresh(obj)

    cantidad = (
        db.query(func.count(Cliente.id))
        .filter(Cliente.razon_social_id == rs_id)
        .scalar()
    )
    return {**obj.to_dict(), "cantidad_marcas": cantidad}


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/razones-sociales/{id}  — con marcas y productos
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/razones-sociales/{rs_id}", summary="Obtener razón social con sus marcas y productos")
async def obtener_razon_social(
    rs_id: int,
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    from sqlalchemy.orm import subqueryload
    obj = (
        db.query(RazonSocial)
        .options(
            subqueryload(RazonSocial.clientes)
            .subqueryload(Cliente.productos),
            subqueryload(RazonSocial.clientes)
            .subqueryload(Cliente.rubro_obj),
        )
        .filter(RazonSocial.id == rs_id)
        .first()
    )
    if not obj:
        raise HTTPException(status_code=404, detail="Razón social no encontrada")

    return {
        **obj.to_dict(),
        "cantidad_marcas": len(obj.clientes),
        "marcas": [
            {
                "id":         c.id,
                # El N° de cliente es de la ENTIDAD LEGAL y lo comparten todas
                # sus marcas — misma regla que Cliente.to_dict() y el export.
                # Se cae al de la marca sólo si la razón social no tiene número.
                "id_cliente": c.numero_visible,
                "marca":      c.marca,
                "rubro":      c.rubro_obj.nombre if c.rubro_obj else None,
                "productos": [
                    {
                        "id":               p.id,
                        "nombre":           p.nombre,
                        "volumen_cantidad": float(p.volumen_cantidad) if p.volumen_cantidad is not None else None,
                        "volumen_unidad":   p.volumen_unidad,
                        "lamina":           p.lamina,
                        "alto":             float(p.alto) if p.alto is not None else None,
                        "cilindro":         float(p.cilindro) if p.cilindro is not None else None,
                        "cierre":           float(p.cierre) if p.cierre is not None else None,
                        "envase":           p.envase,
                    }
                    for p in c.productos
                ],
            }
            for c in sorted(obj.clientes, key=lambda x: x.marca or "")
        ],
    }
