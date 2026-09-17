"""
Router de Órdenes de Trabajo — Etiplast ERP
============================================
CRUD completo de órdenes de trabajo con manejo de bobinas de extrusión.
Genera números correlativos tipo OT-0001.
"""
import json
from datetime import date
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from core.database import get_db
from core.security import require_permiso, verify_token
from models import (
    Cliente, ClienteProducto, OrdenExtrusionBobina, OrdenTrabajo,
)
from schemas import OrdenCreateSchema, OrdenUpdateSchema
from services import auditoria
from services.numeracion import generar_numero

router = APIRouter(prefix="/api", tags=["ordenes"])

# Estados válidos de una OT (ver models.OrdenTrabajo).
ESTADOS_ORDEN = ("borrador", "pendiente", "en_proceso", "completada", "cancelada")


# ──────────────────────────────────────────────────────────────────────────────
# Helpers internos
# ──────────────────────────────────────────────────────────────────────────────

def _eager_options():
    return [
        joinedload(OrdenTrabajo.cliente),
        joinedload(OrdenTrabajo.cliente_producto),
        joinedload(OrdenTrabajo.bobinas),
        joinedload(OrdenTrabajo.creador),
        joinedload(OrdenTrabajo.responsable),
    ]


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


def _parse_date(raw) -> Optional[date]:
    """Parseo defensivo de fecha ISO 'YYYY-MM-DD'. None si vacío o inválido (nunca 500)."""
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
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
            numero_lote=(row.get("numero_lote") or None),
        ))


def _autogenerar_lote(orden: OrdenTrabajo) -> str:
    """Genera el lote de trazabilidad: L-YYYYMMDD-NNNN (sufijo del número de OT)."""
    sufijo = orden.numero.split("-", 1)[-1] if orden.numero else str(orden.id)
    return f"L-{date.today().strftime('%Y%m%d')}-{sufijo}"


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
    payload: OrdenCreateSchema,
    user: dict = Depends(require_permiso("ordenes:crear")),
    db: Session = Depends(get_db),
):
    # exclude_none: las claves ausentes/None se omiten (los `.get(k, default)` siguen
    # funcionando, p.ej. bobinas/impresion_colores no se convierten en None).
    datos = payload.model_dump(exclude_none=True)

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

    estado = datos.get("estado", "borrador")
    if estado not in ESTADOS_ORDEN:
        raise HTTPException(status_code=400, detail=f"Estado inválido: {estado}")

    numero = generar_numero(db, OrdenTrabajo, "OT")

    # Colores: lista de hasta 6 strings
    colores = datos.get("impresion_colores", [])
    colores_json = json.dumps(colores) if colores else None

    # Fecha (parse defensivo; default hoy)
    fecha = _parse_date(datos.get("fecha")) or date.today()

    orden = OrdenTrabajo(
        numero=numero,
        cliente_id=cliente_id,
        cliente_producto_id=cliente_producto_id,
        fecha=fecha,
        estado=estado,
        created_by=_user.get("id"),
        responsable_id=_to_int(datos.get("responsable_id")),
        operador=datos.get("operador"),

        extrusion_ancho=_to_float(datos.get("extrusion_ancho")),
        extrusion_color=datos.get("extrusion_color"),
        extrusion_trat=datos.get("extrusion_trat"),
        extrusion_espesor=_to_float(datos.get("extrusion_espesor")),
        extrusion_cant_bob=_to_int(datos.get("extrusion_cant_bob")),
        extrusion_formulacion=datos.get("extrusion_formulacion"),
        extrusion_maquina=datos.get("extrusion_maquina"),
        extrusion_observaciones=datos.get("extrusion_observaciones"),
        operador_extrusion=datos.get("operador_extrusion"),

        impresion_frente=datos.get("impresion_frente"),
        impresion_retroverso=datos.get("impresion_retroverso"),
        impresion_observaciones=datos.get("impresion_observaciones"),
        impresion_cilindro=_to_float(datos.get("impresion_cilindro")),
        impresion_colores=colores_json,
        operador_impresion=datos.get("operador_impresion"),

        troquelado_ancho=_to_float(datos.get("troquelado_ancho")),
        troquelado_alto=_to_float(datos.get("troquelado_alto")),
        troquelado_envase=datos.get("troquelado_envase"),
        troquelado_maquina=datos.get("troquelado_maquina"),
        troquelado_observaciones=datos.get("troquelado_observaciones"),
        operador_troquelado=datos.get("operador_troquelado"),

        control_calidad=datos.get("control_calidad"),

        fecha_diseno=_parse_date(datos.get("fecha_diseno")),
        fecha_preprensa=_parse_date(datos.get("fecha_preprensa")),
        fecha_extrusion=_parse_date(datos.get("fecha_extrusion")),
        fecha_impresion=_parse_date(datos.get("fecha_impresion")),
        fecha_troquelado=_parse_date(datos.get("fecha_troquelado")),
        fecha_entrega=_parse_date(datos.get("fecha_entrega")),

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
            numero_lote=(row.get("numero_lote") or None),
        ))

    auditoria.registrar(
        db, user, "crear", "orden_trabajo", orden.id, f"Creó orden {orden.numero}",
        datos={"numero": orden.numero, "cliente_id": orden.cliente_id, "estado": orden.estado},
    )
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
    payload: OrdenUpdateSchema,
    user: dict = Depends(require_permiso("ordenes:editar")),
    db: Session = Depends(get_db),
):
    # exclude_unset: solo los campos enviados → actualización parcial (`if k in datos`).
    datos = payload.model_dump(exclude_unset=True)

    orden = (
        db.query(OrdenTrabajo)
        .options(*_eager_options())
        .filter(OrdenTrabajo.id == orden_id)
        .first()
    )
    if not orden:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")

    antes = {"estado": orden.estado, "cliente_id": orden.cliente_id,
             "fecha": orden.fecha.isoformat() if orden.fecha else None}

    # Campos simples
    if "estado" in datos:
        if datos["estado"] not in ESTADOS_ORDEN:
            raise HTTPException(status_code=400, detail=f"Estado inválido: {datos['estado']}")
        orden.estado = datos["estado"]
        # Trazabilidad: al pasar a producción, autogenerar lote si no tiene
        if orden.estado == "en_proceso" and not orden.lote:
            orden.lote = _autogenerar_lote(orden)
    if "responsable_id" in datos:
        orden.responsable_id = _to_int(datos["responsable_id"])
    if "operador" in datos:
        orden.operador = datos["operador"]
    if "cliente_producto_id" in datos:
        orden.cliente_producto_id = datos["cliente_producto_id"]
    if "fecha" in datos and datos["fecha"]:
        orden.fecha = _parse_date(datos["fecha"])

    campos_extrusion_text = [
        "extrusion_color", "extrusion_trat", "extrusion_formulacion",
        "extrusion_maquina", "extrusion_observaciones", "operador_extrusion",
    ]
    for campo in campos_extrusion_text:
        if campo in datos:
            setattr(orden, campo, datos[campo])
    if "extrusion_ancho" in datos:
        orden.extrusion_ancho = _to_float(datos["extrusion_ancho"])
    if "extrusion_espesor" in datos:
        orden.extrusion_espesor = _to_float(datos["extrusion_espesor"])
    if "extrusion_cant_bob" in datos:
        orden.extrusion_cant_bob = _to_int(datos["extrusion_cant_bob"])

    campos_impresion_text = [
        "impresion_frente", "impresion_retroverso",
        "impresion_observaciones", "operador_impresion",
    ]
    for campo in campos_impresion_text:
        if campo in datos:
            setattr(orden, campo, datos[campo])
    if "impresion_cilindro" in datos:
        orden.impresion_cilindro = _to_float(datos["impresion_cilindro"])

    if "impresion_colores" in datos:
        colores = datos["impresion_colores"]
        orden.impresion_colores = json.dumps(colores) if colores else None

    campos_troquelado_text = [
        "troquelado_envase", "troquelado_maquina",
        "troquelado_observaciones", "operador_troquelado",
    ]
    for campo in campos_troquelado_text:
        if campo in datos:
            setattr(orden, campo, datos[campo])
    if "troquelado_ancho" in datos:
        orden.troquelado_ancho = _to_float(datos["troquelado_ancho"])
    if "troquelado_alto" in datos:
        orden.troquelado_alto = _to_float(datos["troquelado_alto"])

    if "control_calidad" in datos:
        orden.control_calidad = datos["control_calidad"]

    # Fechas por etapa (parse defensivo)
    for fecha_campo in ("fecha_diseno", "fecha_preprensa", "fecha_extrusion",
                        "fecha_impresion", "fecha_troquelado", "fecha_entrega"):
        if fecha_campo in datos:
            setattr(orden, fecha_campo, _parse_date(datos[fecha_campo]))

    if "cantidad" in datos:
        orden.cantidad = _to_int(datos["cantidad"])
    if "total_final" in datos:
        orden.total_final = _to_float(datos["total_final"])
    if "observaciones" in datos:
        orden.observaciones = datos["observaciones"]

    # Bobinas: si viene la lista, reemplazar completa
    if "bobinas" in datos:
        _sync_bobinas(db, orden, datos["bobinas"] or [])

    auditoria.registrar(
        db, user, "actualizar", "orden_trabajo", orden.id, f"Actualizó orden {orden.numero}",
        datos={"antes": antes, "campos": sorted(datos.keys()),
               "despues": {"estado": orden.estado}},
    )
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

@router.delete("/ordenes/{orden_id}", status_code=204, summary="Eliminar orden de trabajo (solo admin)")
async def eliminar_orden(
    orden_id: int,
    user: dict = Depends(require_permiso("ordenes:borrar")),
    db: Session = Depends(get_db),
):
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == orden_id).first()
    if not orden:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")
    auditoria.registrar(
        db, user, "eliminar", "orden_trabajo", orden.id,
        f"Eliminó orden {orden.numero}",
    )
    db.delete(orden)
    db.commit()
