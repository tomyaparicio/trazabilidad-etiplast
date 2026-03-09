"""
Router de clientes — Etiplast ERP
===================================
CRUD completo sobre el esquema normalizado.
Las respuestas mantienen estructura plana para compatibilidad con el frontend.
"""
from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import cast, func, or_, String
from sqlalchemy.orm import Session, joinedload

from database import get_db
from dependencies import verify_token
from models import (
    Cliente, ClienteContacto, ClienteProducto,
    ClienteUbicacion, Provincia, RazonSocial, Rubro,
)

router = APIRouter(prefix="/api", tags=["clientes"])

# ──────────────────────────────────────────────────────────────────────────────
# Helpers internos
# ──────────────────────────────────────────────────────────────────────────────

def _eager_options():
    """Opciones de carga eager para traer todas las relaciones en 1 query."""
    return [
        joinedload(Cliente.rubro_obj),
        joinedload(Cliente.razon_social_obj),
        joinedload(Cliente.ubicacion).joinedload(ClienteUbicacion.provincia_obj),
        joinedload(Cliente.contacto),
        joinedload(Cliente.productos),
    ]


def _get_or_create_razon_social(db: Session, razon_social: str, cuit: Optional[str] = None) -> RazonSocial:
    rs_text = razon_social.strip()
    obj = db.query(RazonSocial).filter(RazonSocial.razon_social == rs_text).first()
    if not obj:
        obj = RazonSocial(razon_social=rs_text, cuit=(cuit or "").strip() or None)
        db.add(obj)
        db.flush()
    return obj


def _get_or_create_rubro(db: Session, nombre: str) -> Rubro:
    nombre = nombre.strip()
    rubro = db.query(Rubro).filter(Rubro.nombre == nombre).first()
    if not rubro:
        rubro = Rubro(nombre=nombre)
        db.add(rubro)
        db.flush()
    return rubro


def _get_or_create_provincia(db: Session, nombre: str) -> Provincia:
    nombre = nombre.strip()
    prov = db.query(Provincia).filter(Provincia.nombre == nombre).first()
    if not prov:
        prov = Provincia(nombre=nombre)
        db.add(prov)
        db.flush()
    return prov


def _to_float(value) -> Optional[float]:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/clientes
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/clientes", summary="Listar clientes con paginación y filtros")
async def listar_clientes(
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1, description="Número de página"),
    per_page: int = Query(20, ge=1, le=100, description="Registros por página"),
    search: Optional[str] = Query(None, description="Búsqueda por marca, razón social, localidad o producto"),
    rubro: Optional[str] = Query(None, description="Filtrar por rubro"),
    provincia: Optional[str] = Query(None, description="Filtrar por provincia"),
    sort_by: Optional[str] = Query("marca", description="Campo de ordenamiento: id, marca, razon_social, localidad"),
    sort_dir: Optional[str] = Query("asc", description="Dirección: asc o desc"),
):
    # Siempre unimos las tablas auxiliares para búsqueda y ordenamiento sin duplicar joins
    query = (
        db.query(Cliente)
        .outerjoin(ClienteUbicacion,  ClienteUbicacion.cliente_id  == Cliente.id)
        .outerjoin(ClienteProducto,   ClienteProducto.cliente_id   == Cliente.id)
        .outerjoin(RazonSocial,       RazonSocial.id               == Cliente.razon_social_id)
    )

    # — Filtro de búsqueda textual —
    if search:
        f = f"%{search}%"
        query = query.filter(or_(
            cast(Cliente.id_cliente, String).ilike(f),
            cast(Cliente.id, String).ilike(f),
            Cliente.marca.ilike(f),
            Cliente.razon_social.ilike(f),
            RazonSocial.razon_social.ilike(f),
            ClienteUbicacion.localidad.ilike(f),
            ClienteProducto.nombre.ilike(f),
        )).distinct()

    # — Filtro por rubro (catálogo) —
    if rubro:
        rubro_obj = db.query(Rubro).filter(Rubro.nombre == rubro).first()
        query = query.filter(Cliente.rubro_id == rubro_obj.id) if rubro_obj else query.filter(False)

    # — Filtro por provincia (usa la ubicación ya unida) —
    if provincia:
        prov_obj = db.query(Provincia).filter(Provincia.nombre == provincia).first()
        if prov_obj:
            query = query.filter(ClienteUbicacion.provincia_id == prov_obj.id)
        else:
            query = query.filter(False)

    total = query.count()

    # — Ordenamiento dinámico —
    SORT_FIELDS = {
        "id":           Cliente.id_cliente,
        "marca":        func.upper(Cliente.marca),
        "razon_social": func.coalesce(func.upper(RazonSocial.razon_social), func.upper(Cliente.razon_social)),
        "localidad":    func.upper(ClienteUbicacion.localidad),
    }
    sort_col = SORT_FIELDS.get(sort_by or "marca", func.upper(Cliente.marca))
    order_expr = sort_col.desc().nulls_last() if sort_dir == "desc" else sort_col.asc().nulls_last()

    clientes = (
        query
        .options(*_eager_options())
        .order_by(order_expr)
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return {
        "data":        [c.to_dict() for c in clientes],
        "total":       total,
        "page":        page,
        "per_page":    per_page,
        "total_pages": -(-total // per_page) if total else 0,
    }


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/clientes/{id}
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/clientes/{cliente_id}", summary="Obtener cliente por ID")
async def obtener_cliente(
    cliente_id: int,
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    cliente = (
        db.query(Cliente)
        .options(*_eager_options())
        .filter(Cliente.id == cliente_id)
        .first()
    )
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return cliente.to_dict()


# ──────────────────────────────────────────────────────────────────────────────
# POST /api/clientes
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/clientes", status_code=201, summary="Crear nuevo cliente")
async def crear_cliente(
    datos: Dict[str, Any] = Body(...),
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    # Determinar id_cliente
    id_cliente = datos.get("id_cliente")
    if id_cliente is None:
        max_id = db.query(func.max(Cliente.id_cliente)).scalar()
        id_cliente = (max_id or 0) + 1
    elif db.query(Cliente).filter(Cliente.id_cliente == id_cliente).first():
        raise HTTPException(status_code=400, detail=f"Ya existe un cliente con id_cliente={id_cliente}")

    # Resolver rubro_id
    rubro_id = None
    if datos.get("rubro"):
        rubro_id = _get_or_create_rubro(db, datos["rubro"]).id

    # Resolver razon_social_id
    rs_id = datos.get("razon_social_id")
    rs_text = datos.get("razon_social", "")
    if not rs_id and rs_text and rs_text.strip():
        rs_id = _get_or_create_razon_social(db, rs_text, datos.get("cuit")).id

    # Crear registro principal
    cliente = Cliente(
        id_cliente=id_cliente,
        marca=datos.get("marca"),
        razon_social=datos.get("razon_social"),
        cuit=datos.get("cuit"),
        razon_social_id=rs_id,
        rubro_id=rubro_id,
    )
    db.add(cliente)
    db.flush()  # obtener cliente.id antes del commit

    # Crear ubicación
    provincia_id = None
    if datos.get("provincia"):
        provincia_id = _get_or_create_provincia(db, datos["provincia"]).id

    db.add(ClienteUbicacion(
        cliente_id=cliente.id,
        domicilio=datos.get("domicilio"),
        localidad=datos.get("localidad"),
        provincia_id=provincia_id,
        pais=datos.get("pais") or "Argentina",
        transporte=datos.get("transporte"),
    ))

    # Crear contacto
    db.add(ClienteContacto(
        cliente_id=cliente.id,
        telefono=datos.get("telefono"),
        observaciones=datos.get("observaciones"),
    ))

    # Crear producto (si hay algún campo de producto)
    campos_producto = ["producto", "envase", "volumen_cantidad", "volumen_unidad",
                       "lamina", "muestra", "alto", "cilindro", "cierre"]
    if any(datos.get(c) for c in campos_producto):
        db.add(ClienteProducto(
            cliente_id=cliente.id,
            nombre=datos.get("producto"),
            envase=datos.get("envase"),
            volumen_cantidad=_to_float(datos.get("volumen_cantidad")),
            volumen_unidad=datos.get("volumen_unidad"),
            lamina=datos.get("lamina"),
            muestra=datos.get("muestra"),
            alto=_to_float(datos.get("alto")),
            cilindro=_to_float(datos.get("cilindro")),
            cierre=_to_float(datos.get("cierre")),
        ))

    db.commit()

    # Recargar con relaciones para devolver dict completo
    db.refresh(cliente)
    cliente = (
        db.query(Cliente)
        .options(*_eager_options())
        .filter(Cliente.id == cliente.id)
        .first()
    )
    return cliente.to_dict()


# ──────────────────────────────────────────────────────────────────────────────
# PUT /api/clientes/{id}
# ──────────────────────────────────────────────────────────────────────────────

@router.put("/clientes/{cliente_id}", summary="Actualizar cliente")
async def actualizar_cliente(
    cliente_id: int,
    datos: Dict[str, Any] = Body(...),
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    cliente = (
        db.query(Cliente)
        .options(*_eager_options())
        .filter(Cliente.id == cliente_id)
        .first()
    )
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    # — Identidad —
    for campo in ("marca", "razon_social", "cuit"):
        if campo in datos:
            setattr(cliente, campo, datos[campo])

    # Actualizar razon_social_id
    if "razon_social_id" in datos:
        cliente.razon_social_id = datos["razon_social_id"]
    elif "razon_social" in datos and datos["razon_social"] and datos["razon_social"].strip():
        # Si se actualizó el texto y no viene razon_social_id, buscar/crear la entidad
        rs = _get_or_create_razon_social(db, datos["razon_social"], datos.get("cuit"))
        cliente.razon_social_id = rs.id

    if "rubro" in datos and datos["rubro"]:
        cliente.rubro_id = _get_or_create_rubro(db, datos["rubro"]).id
    elif "rubro" in datos and not datos["rubro"]:
        cliente.rubro_id = None

    # — Ubicación —
    ub = cliente.ubicacion
    if not ub:
        ub = ClienteUbicacion(cliente_id=cliente.id)
        db.add(ub)

    for campo in ("domicilio", "localidad", "pais", "transporte"):
        if campo in datos:
            setattr(ub, campo, datos[campo])

    if "provincia" in datos:
        if datos["provincia"]:
            ub.provincia_id = _get_or_create_provincia(db, datos["provincia"]).id
        else:
            ub.provincia_id = None

    # — Contacto —
    ct = cliente.contacto
    if not ct:
        ct = ClienteContacto(cliente_id=cliente.id)
        db.add(ct)

    for campo in ("telefono", "observaciones"):
        if campo in datos:
            setattr(ct, campo, datos[campo])

    # — Producto principal —
    pr = cliente.productos[0] if cliente.productos else None
    campos_producto = ["producto", "envase", "volumen_cantidad", "volumen_unidad",
                       "lamina", "muestra", "alto", "cilindro", "cierre"]

    if any(c in datos for c in campos_producto):
        if not pr:
            pr = ClienteProducto(cliente_id=cliente.id)
            db.add(pr)

        if "producto" in datos:
            pr.nombre = datos["producto"]
        for campo in ("envase", "volumen_unidad", "lamina", "muestra"):
            if campo in datos:
                setattr(pr, campo, datos[campo])
        for campo in ("volumen_cantidad", "alto", "cilindro", "cierre"):
            if campo in datos:
                setattr(pr, campo, _to_float(datos[campo]))

    db.commit()

    cliente = (
        db.query(Cliente)
        .options(*_eager_options())
        .filter(Cliente.id == cliente_id)
        .first()
    )
    return cliente.to_dict()
