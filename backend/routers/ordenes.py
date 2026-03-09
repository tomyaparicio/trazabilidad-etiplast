"""
Router de Órdenes de Trabajo — Etiplast ERP
============================================
CRUD completo de órdenes de trabajo con manejo de bobinas de extrusión.
Genera números correlativos tipo OT-0001.
"""
import json
from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from database import get_db
from dependencies import verify_token
from models import (
    Cliente, ClienteProducto, OrdenExtrusionBobina, OrdenTrabajo,
)

router = APIRouter(prefix="/api", tags=["ordenes"])


# ──────────────────────────────────────────────────────────────────────────────
# Helpers internos
# ──────────────────────────────────────────────────────────────────────────────

def _eager_options():
    return [
        joinedload(OrdenTrabajo.cliente),
        joinedload(OrdenTrabajo.cliente_producto),
        joinedload(OrdenTrabajo.bobinas),
    ]


def _generar_numero(db: Session) -> str:
    """Genera el siguiente número correlativo OT-NNNN."""
    rows = db.query(OrdenTrabajo.numero).all()
    nums = []
    for (n,) in rows:
        try:
            nums.append(int(n.split("-")[1]))
        except Exception:
            pass
    siguiente = (max(nums) + 1) if nums else 1
    return f"OT-{siguiente:04d}"


def _to_float(value) -> Optional[float]:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def _to_int(value) -> Optional[int]:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def _sync_bobinas(db: Session, orden: OrdenTrabajo, bobinas_data: List[Dict]):
    """Reemplaza las bobinas de la orden con la lista enviada."""
    for b in list(orden.bobinas):
        db.delete(b)
    db.flush()
    for row in bobinas_data:
        db.add(OrdenExtrusionBobina(
            orden_id=orden.id,
            metros=_to_float(row.get("metros")),
            kg_bob=_to_float(row.get("kg_bob")),
        ))


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/ordenes
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/ordenes", summary="Listar órdenes de trabajo con paginación y filtros")
async def listar_ordenes(
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    estado: Optional[str] = Query(None, description="Filtrar por estado"),
    cliente_id: Optional[int] = Query(None, description="Filtrar por cliente"),
    search: Optional[str] = Query(None, description="Buscar por número o cliente"),
):
    query = db.query(OrdenTrabajo)

    if estado:
        query = query.filter(OrdenTrabajo.estado == estado)

    if cliente_id:
        query = query.filter(OrdenTrabajo.cliente_id == cliente_id)

    if search:
        f = f"%{search}%"
        query = (
            query
            .outerjoin(Cliente, Cliente.id == OrdenTrabajo.cliente_id)
            .filter(
                OrdenTrabajo.numero.ilike(f) |
                Cliente.marca.ilike(f) |
                Cliente.razon_social.ilike(f)
            )
            .distinct()
        )

    total = query.count()

    ordenes = (
        query
        .options(*_eager_options())
        .order_by(OrdenTrabajo.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return {
        "data":        [o.to_dict() for o in ordenes],
        "total":       total,
        "page":        page,
        "per_page":    per_page,
        "total_pages": -(-total // per_page) if total else 0,
    }


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/ordenes/{id}
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/ordenes/{orden_id}", summary="Obtener orden de trabajo por ID")
async def obtener_orden(
    orden_id: int,
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    orden = (
        db.query(OrdenTrabajo)
        .options(*_eager_options())
        .filter(OrdenTrabajo.id == orden_id)
        .first()
    )
    if not orden:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")
    return orden.to_dict()


# ──────────────────────────────────────────────────────────────────────────────
# POST /api/ordenes
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/ordenes", status_code=201, summary="Crear nueva orden de trabajo")
async def crear_orden(
    datos: Dict[str, Any] = Body(...),
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    cliente_id = datos.get("cliente_id")
    if not cliente_id:
        raise HTTPException(status_code=400, detail="cliente_id es requerido")

    if not db.query(Cliente).filter(Cliente.id == cliente_id).first():
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    # Validar cliente_producto_id si viene
    cliente_producto_id = datos.get("cliente_producto_id")
    if cliente_producto_id:
        if not db.query(ClienteProducto).filter(ClienteProducto.id == cliente_producto_id).first():
            raise HTTPException(status_code=404, detail="Producto de cliente no encontrado")

    numero = _generar_numero(db)

    # Colores: lista de hasta 6 strings
    colores = datos.get("impresion_colores", [])
    colores_json = json.dumps(colores) if colores else None

    # Fecha
    fecha_raw = datos.get("fecha")
    fecha = date.fromisoformat(fecha_raw) if fecha_raw else date.today()

    orden = OrdenTrabajo(
        numero=numero,
        cliente_id=cliente_id,
        cliente_producto_id=cliente_producto_id,
        fecha=fecha,
        estado=datos.get("estado", "borrador"),
        created_by=_user.get("id"),

        extrusion_ancho=_to_float(datos.get("extrusion_ancho")),
        extrusion_color=datos.get("extrusion_color"),
        extrusion_trat=datos.get("extrusion_trat"),
        extrusion_espesor=_to_float(datos.get("extrusion_espesor")),
        extrusion_cant_bob=_to_int(datos.get("extrusion_cant_bob")),
        extrusion_formulacion=datos.get("extrusion_formulacion"),

        impresion_frente=datos.get("impresion_frente"),
        impresion_retroverso=datos.get("impresion_retroverso"),
        impresion_cilindro=_to_float(datos.get("impresion_cilindro")),
        impresion_colores=colores_json,

        troquelado_ancho=_to_float(datos.get("troquelado_ancho")),
        troquelado_alto=_to_float(datos.get("troquelado_alto")),
        troquelado_envase=datos.get("troquelado_envase"),

        cantidad=_to_int(datos.get("cantidad")),
        total_final=_to_float(datos.get("total_final")),
        observaciones=datos.get("observaciones"),
    )
    db.add(orden)
    db.flush()  # obtener orden.id

    bobinas_data = datos.get("bobinas", [])
    for row in bobinas_data:
        db.add(OrdenExtrusionBobina(
            orden_id=orden.id,
            metros=_to_float(row.get("metros")),
            kg_bob=_to_float(row.get("kg_bob")),
        ))

    db.commit()

    orden = (
        db.query(OrdenTrabajo)
        .options(*_eager_options())
        .filter(OrdenTrabajo.id == orden.id)
        .first()
    )
    return orden.to_dict()


# ──────────────────────────────────────────────────────────────────────────────
# PUT /api/ordenes/{id}
# ──────────────────────────────────────────────────────────────────────────────

@router.put("/ordenes/{orden_id}", summary="Actualizar orden de trabajo")
async def actualizar_orden(
    orden_id: int,
    datos: Dict[str, Any] = Body(...),
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    orden = (
        db.query(OrdenTrabajo)
        .options(*_eager_options())
        .filter(OrdenTrabajo.id == orden_id)
        .first()
    )
    if not orden:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")

    # Campos simples
    if "estado" in datos:
        orden.estado = datos["estado"]
    if "cliente_producto_id" in datos:
        orden.cliente_producto_id = datos["cliente_producto_id"]
    if "fecha" in datos and datos["fecha"]:
        orden.fecha = date.fromisoformat(datos["fecha"])

    campos_extrusion = [
        "extrusion_ancho", "extrusion_color", "extrusion_trat",
        "extrusion_espesor", "extrusion_cant_bob", "extrusion_formulacion",
    ]
    for campo in campos_extrusion:
        if campo in datos:
            if campo in ("extrusion_ancho", "extrusion_espesor"):
                setattr(orden, campo, _to_float(datos[campo]))
            elif campo == "extrusion_cant_bob":
                setattr(orden, campo, _to_int(datos[campo]))
            else:
                setattr(orden, campo, datos[campo])

    campos_impresion = ["impresion_frente", "impresion_retroverso", "impresion_cilindro"]
    for campo in campos_impresion:
        if campo in datos:
            if campo == "impresion_cilindro":
                setattr(orden, campo, _to_float(datos[campo]))
            else:
                setattr(orden, campo, datos[campo])

    if "impresion_colores" in datos:
        colores = datos["impresion_colores"]
        orden.impresion_colores = json.dumps(colores) if colores else None

    campos_troquelado = ["troquelado_ancho", "troquelado_alto", "troquelado_envase"]
    for campo in campos_troquelado:
        if campo in datos:
            if campo in ("troquelado_ancho", "troquelado_alto"):
                setattr(orden, campo, _to_float(datos[campo]))
            else:
                setattr(orden, campo, datos[campo])

    if "cantidad" in datos:
        orden.cantidad = _to_int(datos["cantidad"])
    if "total_final" in datos:
        orden.total_final = _to_float(datos["total_final"])
    if "observaciones" in datos:
        orden.observaciones = datos["observaciones"]

    # Bobinas: si viene la lista, reemplazar completa
    if "bobinas" in datos:
        _sync_bobinas(db, orden, datos["bobinas"])

    db.commit()

    orden = (
        db.query(OrdenTrabajo)
        .options(*_eager_options())
        .filter(OrdenTrabajo.id == orden_id)
        .first()
    )
    return orden.to_dict()


# ──────────────────────────────────────────────────────────────────────────────
# DELETE /api/ordenes/{id}
# ──────────────────────────────────────────────────────────────────────────────

@router.delete("/ordenes/{orden_id}", status_code=204, summary="Eliminar orden de trabajo")
async def eliminar_orden(
    orden_id: int,
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == orden_id).first()
    if not orden:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")
    db.delete(orden)
    db.commit()
