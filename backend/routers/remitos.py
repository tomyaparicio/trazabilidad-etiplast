"""
Router de Remitos + Trazabilidad — Etiplast ERP
================================================
CRUD de remitos de entrega (REM-0001, no fiscales) + despacho con egreso de
stock vinculado + trazabilidad por lote (OT → bobinas → movimientos → remitos).

Estados: pendiente | despachado | entregado | anulado
  - POST /{id}/despachar: pendiente → despachado (egresos de stock + notificación)
  - PUT: despachado → entregado; cualquiera → anulado (solo admin)
  - No editable si estado = despachado | entregado.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from core.bloqueos import con_bloqueos
from core.database import get_db
from core.security import require_permiso, verify_token
from models import (
    Cliente, OrdenExtrusionBobina, OrdenTrabajo, Remito, RemitoItem,
    StockItem, StockMovimiento,
)
from schemas import RemitoCreateSchema, RemitoItemSchema, RemitoUpdateSchema
from services import auditoria
from services import notificaciones as notificaciones_service
from services.numeracion import generar_numero
from services.stock import registrar_movimiento

router = APIRouter(prefix="/api", tags=["remitos"])

ESTADOS_REMITO = ("pendiente", "despachado", "entregado", "anulado")


# ──────────────────────────────────────────────────────────────────────────────
# Helpers internos
# ──────────────────────────────────────────────────────────────────────────────

def _eager_options():
    return [
        joinedload(Remito.cliente),
        joinedload(Remito.creador),
        joinedload(Remito.items).joinedload(RemitoItem.orden_trabajo),
    ]


def _get_remito(db: Session, remito_id: int) -> Remito:
    remito = (
        db.query(Remito)
        .options(*_eager_options())
        .filter(Remito.id == remito_id)
        .first()
    )
    if not remito:
        raise HTTPException(status_code=404, detail="Remito no encontrado")
    return remito


def _domicilio_cliente(cliente: Cliente) -> Optional[str]:
    """Compone el domicilio de entrega por defecto desde la ubicación del cliente."""
    ub = cliente.ubicacion
    if not ub:
        return None
    partes = [p for p in (ub.domicilio, ub.localidad) if p]
    return ", ".join(partes) if partes else None


def _validar_items(db: Session, cliente_id: int, items: List[RemitoItemSchema]):
    """Valida que las OT referenciadas existan y pertenezcan al cliente."""
    for item in items:
        if item.orden_trabajo_id:
            ot = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == item.orden_trabajo_id).first()
            if not ot:
                raise HTTPException(
                    status_code=404,
                    detail=f"Orden de trabajo {item.orden_trabajo_id} no encontrada",
                )
            if ot.cliente_id != cliente_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"La orden {ot.numero} no pertenece al cliente del remito",
                )


def _sync_items(db: Session, remito: Remito, items: List[RemitoItemSchema]):
    """Reemplaza los ítems del remito con la lista enviada."""
    for it in list(remito.items):
        db.delete(it)
    db.flush()
    for item in items:
        db.add(RemitoItem(
            remito_id=remito.id,
            orden_trabajo_id=item.orden_trabajo_id,
            descripcion=item.descripcion,
            cantidad=item.cantidad,
            unidad=item.unidad,
            lote=item.lote,
        ))


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/remitos
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/remitos", summary="Listar remitos con paginación y filtros")
def listar_remitos(
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    estado: Optional[str] = Query(None, description="Filtrar por estado"),
    cliente_id: Optional[int] = Query(None, description="Filtrar por cliente"),
    search: Optional[str] = Query(None, description="Buscar por número o cliente"),
):
    query = db.query(Remito)

    if estado:
        query = query.filter(Remito.estado == estado)

    if cliente_id:
        query = query.filter(Remito.cliente_id == cliente_id)

    if search:
        f = f"%{search}%"
        query = (
            query
            .outerjoin(Cliente, Cliente.id == Remito.cliente_id)
            .filter(
                Remito.numero.ilike(f) |
                Cliente.marca.ilike(f) |
                Cliente.razon_social.ilike(f)
            )
            .distinct()
        )

    total = query.count()

    remitos = (
        query
        .options(*_eager_options())
        .order_by(Remito.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return {
        "data":        [r.to_dict() for r in remitos],
        "total":       total,
        "page":        page,
        "per_page":    per_page,
        "total_pages": -(-total // per_page) if total else 0,
    }


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/remitos/{id}
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/remitos/{remito_id}", summary="Obtener remito por ID")
def obtener_remito(
    remito_id: int,
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    remito = _get_remito(db, remito_id)
    data = remito.to_dict()
    # Datos extra del cliente para el remito impreso
    cliente = remito.cliente
    if cliente:
        rs = cliente.razon_social_obj
        data["cliente_razon_social"] = rs.razon_social if rs else cliente.razon_social
        data["cliente_cuit"]         = rs.cuit if rs else cliente.cuit
    return data


# ──────────────────────────────────────────────────────────────────────────────
# POST /api/remitos
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/remitos", status_code=201, summary="Crear nuevo remito")
# Numera con advisory lock: se suelta antes de responder cualquier error.
@con_bloqueos()
def crear_remito(
    payload: RemitoCreateSchema,
    user: dict = Depends(require_permiso("remitos:crear")),
    db: Session = Depends(get_db),
):
    cliente = db.query(Cliente).filter(Cliente.id == payload.cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    # Un remito SIEMPRE nace "pendiente": el `estado` del payload se ignora a
    # propósito. Crear directamente en "despachado" saltearía el egreso de stock
    # (que solo ocurre vía POST /{id}/despachar). El cambio de estado va por
    # PUT (→ entregado/anulado) o por el endpoint de despacho.
    _validar_items(db, payload.cliente_id, payload.items)

    numero = generar_numero(db, Remito, "REM")

    remito = Remito(
        numero=numero,
        cliente_id=payload.cliente_id,
        fecha=payload.fecha,
        estado="pendiente",
        transporte=payload.transporte,
        domicilio_entrega=payload.domicilio_entrega or _domicilio_cliente(cliente),
        observaciones=payload.observaciones,
        created_by=user.get("id"),
    )
    db.add(remito)
    db.flush()  # obtener remito.id

    for item in payload.items:
        db.add(RemitoItem(
            remito_id=remito.id,
            orden_trabajo_id=item.orden_trabajo_id,
            descripcion=item.descripcion,
            cantidad=item.cantidad,
            unidad=item.unidad,
            lote=item.lote,
        ))

    auditoria.registrar(
        db, user, "crear", "remito", remito.id,
        f"Creó remito {numero} para {cliente.marca or cliente.razon_social or f'cliente #{cliente.id}'}",
    )
    db.commit()

    return _get_remito(db, remito.id).to_dict()


# ──────────────────────────────────────────────────────────────────────────────
# PUT /api/remitos/{id}
# ──────────────────────────────────────────────────────────────────────────────

@router.put("/remitos/{remito_id}", summary="Actualizar remito")
def actualizar_remito(
    remito_id: int,
    payload: RemitoUpdateSchema,
    user: dict = Depends(require_permiso("remitos:editar")),
    db: Session = Depends(get_db),
):
    remito = _get_remito(db, remito_id)
    datos = payload.model_dump(exclude_unset=True)

    nuevo_estado = datos.get("estado")
    cambia_estado = nuevo_estado is not None and nuevo_estado != remito.estado

    # ── Transiciones de estado ──
    if cambia_estado:
        if nuevo_estado not in ESTADOS_REMITO:
            raise HTTPException(status_code=400, detail=f"Estado inválido: {nuevo_estado}")
        if nuevo_estado == "anulado":
            if user.get("role") != "admin":
                raise HTTPException(status_code=403, detail="Solo un administrador puede anular un remito")
        elif nuevo_estado == "entregado":
            if remito.estado != "despachado":
                raise HTTPException(status_code=400, detail="Solo un remito despachado puede marcarse como entregado")
        elif nuevo_estado == "despachado":
            raise HTTPException(status_code=400, detail="Usá el endpoint de despacho (POST /api/remitos/{id}/despachar)")
        else:  # → pendiente
            raise HTTPException(status_code=400, detail=f"Transición de estado no permitida: {remito.estado} → {nuevo_estado}")

    # ── Edición de campos: bloqueada si está despachado o entregado ──
    campos_edicion = {k for k in datos.keys() if k != "estado"}
    if campos_edicion and remito.estado in ("despachado", "entregado"):
        raise HTTPException(
            status_code=400,
            detail=f"El remito {remito.numero} ya fue {remito.estado} y no puede editarse",
        )

    if "cliente_id" in datos and datos["cliente_id"] and datos["cliente_id"] != remito.cliente_id:
        if not db.query(Cliente).filter(Cliente.id == datos["cliente_id"]).first():
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
        remito.cliente_id = datos["cliente_id"]

    if "fecha" in datos:
        remito.fecha = datos["fecha"]
    if "transporte" in datos:
        remito.transporte = datos["transporte"]
    if "domicilio_entrega" in datos:
        remito.domicilio_entrega = datos["domicilio_entrega"]
    if "observaciones" in datos:
        remito.observaciones = datos["observaciones"]

    if payload.items is not None:
        _validar_items(db, remito.cliente_id, payload.items)
        _sync_items(db, remito, payload.items)

    if cambia_estado:
        estado_anterior = remito.estado
        remito.estado = nuevo_estado
        accion = "anular" if nuevo_estado == "anulado" else "entregar"
        auditoria.registrar(
            db, user, accion, "remito", remito.id,
            f"Remito {remito.numero}: {estado_anterior} → {nuevo_estado}",
        )
        if nuevo_estado == "entregado":
            notificaciones_service.notificar(
                db,
                tipo="remito_entregado",
                titulo=f"Remito {remito.numero} entregado",
                mensaje=f"El remito {remito.numero} fue marcado como entregado.",
                link="/remitos",
                roles=["admin", "user"],
            )
    else:
        auditoria.registrar(
            db, user, "actualizar", "remito", remito.id,
            f"Actualizó remito {remito.numero}",
        )

    db.commit()

    return _get_remito(db, remito_id).to_dict()


# ──────────────────────────────────────────────────────────────────────────────
# DELETE /api/remitos/{id}
# ──────────────────────────────────────────────────────────────────────────────

@router.delete("/remitos/{remito_id}", status_code=204, summary="Eliminar remito (solo admin, solo pendiente)")
def eliminar_remito(
    remito_id: int,
    user: dict = Depends(require_permiso("remitos:borrar")),
    db: Session = Depends(get_db),
):
    remito = _get_remito(db, remito_id)
    if remito.estado != "pendiente":
        raise HTTPException(
            status_code=400,
            detail=f"Solo se pueden eliminar remitos pendientes (estado actual: {remito.estado})",
        )
    auditoria.registrar(
        db, user, "eliminar", "remito", remito.id,
        f"Eliminó remito {remito.numero}",
    )
    db.delete(remito)
    db.commit()


# ──────────────────────────────────────────────────────────────────────────────
# POST /api/remitos/{id}/despachar
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/remitos/{remito_id}/despachar", summary="Despachar remito (egresos de stock + notificación)")
# Cada egreso toma el ítem de stock con FOR UPDATE hasta el commit.
@con_bloqueos()
def despachar_remito(
    remito_id: int,
    user: dict = Depends(require_permiso("remitos:editar")),
    db: Session = Depends(get_db),
):
    remito = _get_remito(db, remito_id)
    if remito.estado != "pendiente":
        raise HTTPException(
            status_code=400,
            detail=f"Solo se puede despachar un remito pendiente (estado actual: {remito.estado})",
        )

    warnings: List[str] = []

    for item in remito.items:
        if not item.orden_trabajo_id:
            continue
        ot = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == item.orden_trabajo_id).first()
        if not ot:
            continue

        # Copiar el lote de la OT al ítem si está vacío
        if not item.lote and ot.lote:
            item.lote = ot.lote

        # Egreso de producto terminado vinculado al producto de la OT
        stock_item = None
        if ot.cliente_producto_id:
            stock_item = (
                db.query(StockItem)
                .filter(
                    StockItem.tipo == "producto_terminado",
                    StockItem.cliente_producto_id == ot.cliente_producto_id,
                )
                .first()
            )

        if not stock_item:
            warnings.append(
                f"Sin ítem de stock de producto terminado para la OT {ot.numero} — no se registró egreso"
            )
            continue

        if item.cantidad is None:
            warnings.append(
                f"El ítem de la OT {ot.numero} no tiene cantidad — no se registró egreso"
            )
            continue

        try:
            registrar_movimiento(
                db,
                stock_item_id=stock_item.id,
                tipo="egreso",
                cantidad=item.cantidad,
                motivo="despacho",
                user_id=user.get("id"),
                orden_id=ot.id,
                remito_id=remito.id,
                lote=item.lote,
            )
        except ValueError as e:
            warnings.append(f"OT {ot.numero}: {e}")

    remito.estado = "despachado"

    cliente_nombre = (
        remito.cliente.marca or remito.cliente.razon_social
        if remito.cliente else f"cliente #{remito.cliente_id}"
    )
    auditoria.registrar(
        db, user, "despachar", "remito", remito.id,
        f"Despachó remito {remito.numero} ({cliente_nombre})",
        datos={"warnings": warnings} if warnings else None,
    )
    notificaciones_service.notificar(
        db,
        tipo="remito_despachado",
        titulo=f"Remito {remito.numero} despachado",
        mensaje=f"El remito {remito.numero} de {cliente_nombre} fue despachado.",
        link="/remitos",
        roles=["admin", "user"],
    )

    db.commit()

    data = _get_remito(db, remito_id).to_dict()
    data["warnings"] = warnings
    return data


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/trazabilidad?lote=XXX
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/trazabilidad", summary="Trazabilidad completa por número de lote")
def trazabilidad_por_lote(
    lote: str = Query(..., min_length=1, description="Número de lote a rastrear"),
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    lote = lote.strip()

    # Órdenes: lote de la OT o numero_lote de alguna de sus bobinas
    ordenes_ids = {
        oid for (oid,) in
        db.query(OrdenTrabajo.id).filter(OrdenTrabajo.lote == lote).all()
    }
    ordenes_ids.update(
        oid for (oid,) in
        db.query(OrdenExtrusionBobina.orden_id)
        .filter(OrdenExtrusionBobina.numero_lote == lote)
        .all()
    )

    ordenes = []
    if ordenes_ids:
        ordenes = (
            db.query(OrdenTrabajo)
            .options(
                joinedload(OrdenTrabajo.cliente),
                joinedload(OrdenTrabajo.bobinas),
            )
            .filter(OrdenTrabajo.id.in_(ordenes_ids))
            .order_by(OrdenTrabajo.id)
            .all()
        )

    # Remitos cuyos ítems tienen ese lote
    remitos = (
        db.query(Remito)
        .options(*_eager_options())
        .join(RemitoItem, RemitoItem.remito_id == Remito.id)
        .filter(RemitoItem.lote == lote)
        .distinct()
        .order_by(Remito.id)
        .all()
    )

    # Movimientos de stock con ese lote
    movimientos = (
        db.query(StockMovimiento)
        .options(
            joinedload(StockMovimiento.stock_item),
            joinedload(StockMovimiento.usuario),
        )
        .filter(StockMovimiento.lote == lote)
        .order_by(StockMovimiento.created_at)
        .all()
    )

    def _mov_dict(m: StockMovimiento) -> dict:
        d = m.to_dict()
        d["stock_item_nombre"] = m.stock_item.nombre if m.stock_item else None
        d["stock_item_codigo"] = m.stock_item.codigo if m.stock_item else None
        return d

    return {
        "lote":              lote,
        "ordenes":           [o.to_dict() for o in ordenes],
        "remitos":           [r.to_dict() for r in remitos],
        "movimientos_stock": [_mov_dict(m) for m in movimientos],
    }
