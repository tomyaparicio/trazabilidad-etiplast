"""CRUD de clientes."""
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import Optional, Dict, Any

from database import get_db
from models import Cliente, User
from dependencies import verify_token

router = APIRouter(prefix="/api", tags=["clientes"])


@router.get("/clientes")
async def listar_clientes(
    _user: User = Depends(verify_token),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    rubro: Optional[str] = Query(None),
    provincia: Optional[str] = Query(None),
):
    query = db.query(Cliente)

    if search:
        f = f"%{search}%"
        query = query.filter(
            or_(
                Cliente.marca.ilike(f),
                Cliente.razon_social.ilike(f),
                Cliente.localidad.ilike(f),
                Cliente.producto.ilike(f),
            )
        )
    if rubro:
        query = query.filter(Cliente.rubro == rubro)
    if provincia:
        query = query.filter(Cliente.provincia == provincia)

    total = query.count()
    clientes = (
        query.order_by(func.upper(Cliente.marca).asc().nulls_last())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return {
        "data": [c.to_dict() for c in clientes],
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": -(-total // per_page) if total else 0,
    }


@router.get("/clientes/{cliente_id}")
async def obtener_cliente(
    cliente_id: int,
    _user: User = Depends(verify_token),
    db: Session = Depends(get_db),
):
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return cliente.to_dict()


@router.post("/clientes")
async def crear_cliente(
    _user: User = Depends(verify_token),
    db: Session = Depends(get_db),
    datos: Dict[str, Any] = Body(...),
):
    id_cliente = datos.get("id_cliente")
    if id_cliente is None:
        max_id = db.query(func.max(Cliente.id_cliente)).scalar()
        id_cliente = (max_id or 0) + 1
    elif db.query(Cliente).filter(Cliente.id_cliente == id_cliente).first():
        raise HTTPException(status_code=400, detail=f"Ya existe id_cliente {id_cliente}")

    campos = [
        "marca", "rubro", "razon_social", "domicilio", "localidad", "provincia",
        "pais", "cuit", "telefono", "producto", "volumen_cantidad", "volumen_unidad",
        "lamina", "muestra", "alto", "cilindro", "cierre", "envase", "observaciones",
        "transporte",
    ]
    numericos = {"volumen_cantidad", "alto", "cilindro", "cierre"}

    data: Dict[str, Any] = {"id_cliente": id_cliente}
    for c in campos:
        if c in datos:
            v = datos[c]
            if c in numericos and v not in (None, ""):
                try:
                    v = float(v)
                except (ValueError, TypeError):
                    v = None
            data[c] = v
        elif c == "pais":
            data[c] = "Argentina"

    cliente = Cliente(**data)
    db.add(cliente)
    db.commit()
    db.refresh(cliente)
    return cliente.to_dict()


@router.put("/actualizaCliente/{cliente_id}")
async def actualizar_cliente(
    cliente_id: int,
    _user: User = Depends(verify_token),
    db: Session = Depends(get_db),
    datos: Dict[str, Any] = Body(...),
):
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    campos = [
        "id_cliente", "marca", "rubro", "razon_social", "domicilio", "localidad",
        "provincia", "pais", "cuit", "telefono", "producto", "volumen_cantidad",
        "volumen_unidad", "lamina", "muestra", "alto", "cilindro", "cierre",
        "envase", "observaciones", "transporte",
    ]
    for c in campos:
        if c in datos:
            setattr(cliente, c, datos[c])

    db.commit()
    db.refresh(cliente)
    return cliente.to_dict()
