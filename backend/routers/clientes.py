"""Rutas de clientes."""
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import Optional, Dict, Any

from database import get_db
from models import Cliente
from dependencies import verify_token

router = APIRouter(prefix="/api", tags=["clientes"])


@router.get("/clientes")
async def listar_clientes(
    authorization: str = Depends(verify_token),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    rubro: Optional[str] = Query(None),
    provincia: Optional[str] = Query(None),
):
    query = db.query(Cliente)

    if search:
        search_filter = f"%{search}%"
        query = query.filter(
            or_(
                Cliente.marca.ilike(search_filter),
                Cliente.razon_social.ilike(search_filter),
                Cliente.localidad.ilike(search_filter),
                Cliente.producto.ilike(search_filter),
            )
        )

    if rubro:
        query = query.filter(Cliente.rubro == rubro)

    if provincia:
        query = query.filter(Cliente.provincia == provincia)

    total = query.count()
    offset = (page - 1) * per_page
    clientes = query.order_by(
        func.upper(Cliente.marca).asc().nulls_last()
    ).offset(offset).limit(per_page).all()

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
    authorization: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    return cliente.to_dict()


@router.post("/clientes")
async def crear_cliente(
    authorization: str = Depends(verify_token),
    db: Session = Depends(get_db),
    datos: Dict[str, Any] = Body(...),
):
    """Crea un nuevo cliente."""
    id_cliente = datos.get("id_cliente")
    if id_cliente is None:
        max_id = db.query(func.max(Cliente.id_cliente)).scalar()
        id_cliente = (max_id or 0) + 1
    else:
        existente = db.query(Cliente).filter(Cliente.id_cliente == id_cliente).first()
        if existente:
            raise HTTPException(
                status_code=400,
                detail=f"Ya existe un cliente con id_cliente {id_cliente}",
            )

    campos_permitidos = [
        "id_cliente", "marca", "rubro", "razon_social", "domicilio",
        "localidad", "provincia", "pais", "cuit", "telefono", "producto",
        "volumen_cantidad", "volumen_unidad", "lamina", "muestra",
        "alto", "cilindro", "cierre", "envase", "observaciones", "transporte",
    ]

    campos_numericos = {"id_cliente", "volumen_cantidad", "alto", "cilindro", "cierre"}

    def _normalizar_valor(campo: str, valor: Any) -> Any:
        if valor is None:
            return None
        if campo in campos_numericos and valor != "":
            try:
                return float(valor) if campo != "id_cliente" else int(valor)
            except (ValueError, TypeError):
                return None
        return valor

    cliente_data: Dict[str, Any] = {"id_cliente": id_cliente}
    for campo in campos_permitidos:
        if campo == "id_cliente":
            continue
        if campo in datos:
            cliente_data[campo] = _normalizar_valor(campo, datos[campo])
        elif campo == "pais":
            cliente_data[campo] = datos.get("pais", "Argentina")

    cliente = Cliente(**cliente_data)
    db.add(cliente)
    db.commit()
    db.refresh(cliente)
    return cliente.to_dict()


@router.put("/actualizaCliente/{cliente_id}")
async def actualizar_cliente(
    cliente_id: int,
    authorization: str = Depends(verify_token),
    db: Session = Depends(get_db),
    datos: Dict[str, Any] = Body(...),
):
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    campos_permitidos = [
        "id_cliente", "marca", "rubro", "razon_social", "domicilio",
        "localidad", "provincia", "pais", "cuit", "telefono", "producto",
        "volumen_cantidad", "volumen_unidad", "lamina", "muestra",
        "alto", "cilindro", "cierre", "envase", "observaciones", "transporte",
    ]

    for campo in campos_permitidos:
        if campo in datos:
            setattr(cliente, campo, datos[campo])

    db.commit()
    db.refresh(cliente)
    return cliente.to_dict()
