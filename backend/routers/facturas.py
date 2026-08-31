"""
Router de Facturas — Etiplast ERP
==================================
CRUD de facturas emitidas (FC-0001). Es la fuente de verdad del dinero del
dashboard: `facturación` = facturas no anuladas, `cobrado` = facturas cobradas.

Los totales se recalculan SIEMPRE server-side a partir de subtotal + IVA:
el cliente no puede mandar un total inconsistente.
"""
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from database import get_db
from dependencies import require_permiso, verify_token
from models import Cliente, Factura, OrdenTrabajo
from schemas import FacturaCreateSchema, FacturaUpdateSchema
from services import auditoria
from services.numeracion import generar_numero

router = APIRouter(prefix="/api", tags=["facturas"])

ESTADOS_VALIDOS = {"pendiente", "cobrada", "anulada"}
TIPOS_VALIDOS = {"A", "B", "C", "X"}

_DOS_DECIMALES = Decimal("0.01")


def _q(v) -> Decimal:
    """Decimal con 2 decimales (redondeo comercial)."""
    return Decimal(str(v or 0)).quantize(_DOS_DECIMALES, rounding=ROUND_HALF_UP)


def _calcular_total(subtotal, iva_porcentaje) -> Decimal:
    """total = subtotal + IVA. Se recalcula siempre en el server."""
    sub = _q(subtotal)
    iva = _q(iva_porcentaje)
    return _q(sub + (sub * iva / Decimal("100")))


def _eager():
    return [joinedload(Factura.cliente), joinedload(Factura.orden_trabajo), joinedload(Factura.creador)]


def _validar_refs(db: Session, cliente_id: Optional[int], orden_id: Optional[int]) -> None:
    """404 si se referencia un cliente u orden inexistente (evita FK huérfanas silenciosas)."""
    if cliente_id is not None and not db.query(Cliente.id).filter(Cliente.id == cliente_id).first():
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if orden_id is not None and not db.query(OrdenTrabajo.id).filter(OrdenTrabajo.id == orden_id).first():
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/facturas
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/facturas", summary="Listar facturas")
async def listar_facturas(
    _user: dict = Depends(require_permiso("facturas:ver")),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    estado: Optional[str] = Query(None, description="pendiente | cobrada | anulada"),
    cliente_id: Optional[int] = Query(None),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    month: Optional[int] = Query(None, ge=1, le=12),
    search: Optional[str] = Query(None, description="Buscar por número o marca del cliente"),
):
    from sqlalchemy import extract, or_

    query = db.query(Factura)

    if estado:
        query = query.filter(Factura.estado == estado)
    if cliente_id:
        query = query.filter(Factura.cliente_id == cliente_id)
    if year:
        query = query.filter(extract("year", Factura.fecha) == year)
        if month:
            query = query.filter(extract("month", Factura.fecha) == month)
    if search:
        f = f"%{search}%"
        query = (
            query
            .outerjoin(Cliente, Cliente.id == Factura.cliente_id)
            .filter(or_(Factura.numero.ilike(f), Cliente.marca.ilike(f)))
        )

    total = query.count()
    facturas = (
        query.options(*_eager())
        .order_by(Factura.fecha.desc().nulls_last(), Factura.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    # Totales del listado filtrado (cabecera de la pantalla).
    # IMPORTANTE: excluyen las ANULADAS, igual que el dashboard — si no, la
    # pantalla mostraría plata anulada como facturada/pendiente de cobro y las
    # dos vistas darían números distintos para el mismo período.
    from sqlalchemy import func as _f
    suma_total = (
        query.filter(Factura.estado != "anulada")
        .with_entities(_f.coalesce(_f.sum(Factura.total), 0))
        .scalar() or 0
    )
    suma_cobrada = (
        query.filter(Factura.estado == "cobrada")
        .with_entities(_f.coalesce(_f.sum(Factura.total), 0))
        .scalar() or 0
    )

    return {
        "data": [f.to_dict() for f in facturas],
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": -(-total // per_page) if total else 0,
        "monto_total": float(suma_total or 0),
        "monto_cobrado": float(suma_cobrada or 0),
    }


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/facturas/{id}
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/facturas/{factura_id}", summary="Obtener factura")
async def obtener_factura(
    factura_id: int,
    _user: dict = Depends(require_permiso("facturas:ver")),
    db: Session = Depends(get_db),
):
    f = db.query(Factura).options(*_eager()).filter(Factura.id == factura_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    return f.to_dict()


# ──────────────────────────────────────────────────────────────────────────────
# POST /api/facturas
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/facturas", status_code=201, summary="Crear factura")
async def crear_factura(
    payload: FacturaCreateSchema,
    user: dict = Depends(require_permiso("facturas:crear")),
    db: Session = Depends(get_db),
):
    d = payload.model_dump(exclude_unset=True)

    if d.get("estado") and d["estado"] not in ESTADOS_VALIDOS:
        raise HTTPException(status_code=422, detail=f"Estado inválido: {d['estado']}")
    if d.get("tipo") and d["tipo"] not in TIPOS_VALIDOS:
        raise HTTPException(status_code=422, detail=f"Tipo inválido: {d['tipo']}")

    _validar_refs(db, d.get("cliente_id"), d.get("orden_trabajo_id"))

    # Número: el que mandan (si no está tomado) o el siguiente correlativo.
    numero = (d.get("numero") or "").strip()
    if numero:
        if db.query(Factura.id).filter(Factura.numero == numero).first():
            raise HTTPException(status_code=409, detail=f"Ya existe una factura con el número {numero}")
    else:
        numero = generar_numero(db, Factura, "FC")

    estado = d.get("estado") or "pendiente"
    factura = Factura(
        numero=numero,
        tipo=d.get("tipo") or "B",
        cliente_id=d.get("cliente_id"),
        orden_trabajo_id=d.get("orden_trabajo_id"),
        fecha=d.get("fecha") or date.today(),
        fecha_vencimiento=d.get("fecha_vencimiento"),
        estado=estado,
        # Si nace cobrada y no mandan fecha de cobro, se asume la de la factura.
        fecha_cobro=d.get("fecha_cobro") or (d.get("fecha") or date.today() if estado == "cobrada" else None),
        subtotal=_q(d.get("subtotal")),
        iva_porcentaje=_q(d.get("iva_porcentaje") if d.get("iva_porcentaje") is not None else 21),
        total=_calcular_total(d.get("subtotal"), d.get("iva_porcentaje") if d.get("iva_porcentaje") is not None else 21),
        observaciones=d.get("observaciones"),
        created_by=user.get("id"),
    )
    db.add(factura)
    db.flush()   # asigna el id sin cerrar la transacción (la auditoría va adentro)

    auditoria.registrar(db, user, "crear", "factura", factura.id, f"Factura {factura.numero} creada",
                        datos={"numero": factura.numero, "cliente_id": factura.cliente_id,
                               "total": float(factura.total or 0), "estado": factura.estado,
                               "fecha": factura.fecha.isoformat() if factura.fecha else None})
    db.commit()

    return db.query(Factura).options(*_eager()).filter(Factura.id == factura.id).first().to_dict()


# ──────────────────────────────────────────────────────────────────────────────
# PUT /api/facturas/{id}
# ──────────────────────────────────────────────────────────────────────────────

@router.put("/facturas/{factura_id}", summary="Actualizar factura")
async def actualizar_factura(
    factura_id: int,
    payload: FacturaUpdateSchema,
    user: dict = Depends(require_permiso("facturas:editar")),
    db: Session = Depends(get_db),
):
    factura = db.query(Factura).filter(Factura.id == factura_id).first()
    if not factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    d = payload.model_dump(exclude_unset=True)

    # Snapshot previo: la auditoría del dinero guarda antes/después.
    antes = {
        "numero": factura.numero,
        "estado": factura.estado,
        "total": float(factura.total or 0),
        "fecha": factura.fecha.isoformat() if factura.fecha else None,
    }

    if "estado" in d and d["estado"] not in ESTADOS_VALIDOS:
        raise HTTPException(status_code=422, detail=f"Estado inválido: {d['estado']}")
    if "tipo" in d and d["tipo"] not in TIPOS_VALIDOS:
        raise HTTPException(status_code=422, detail=f"Tipo inválido: {d['tipo']}")

    _validar_refs(db, d.get("cliente_id"), d.get("orden_trabajo_id"))

    if "numero" in d and d["numero"]:
        nuevo = d["numero"].strip()
        if nuevo != factura.numero and db.query(Factura.id).filter(Factura.numero == nuevo).first():
            raise HTTPException(status_code=409, detail=f"Ya existe una factura con el número {nuevo}")
        factura.numero = nuevo

    for campo in ("tipo", "cliente_id", "orden_trabajo_id", "fecha", "fecha_vencimiento", "observaciones"):
        if campo in d:
            setattr(factura, campo, d[campo])

    if "estado" in d:
        factura.estado = d["estado"]
        # Marcar cobrada sin fecha → hoy; salir de cobrada → se limpia la fecha.
        if d["estado"] == "cobrada" and not (d.get("fecha_cobro") or factura.fecha_cobro):
            factura.fecha_cobro = date.today()
        if d["estado"] != "cobrada":
            factura.fecha_cobro = None
    if "fecha_cobro" in d and factura.estado == "cobrada":
        factura.fecha_cobro = d["fecha_cobro"]

    # Total: se recalcula si cambió subtotal o IVA (nunca se toma del cliente).
    if "subtotal" in d:
        factura.subtotal = _q(d["subtotal"])
    if "iva_porcentaje" in d:
        factura.iva_porcentaje = _q(d["iva_porcentaje"])
    if "subtotal" in d or "iva_porcentaje" in d:
        factura.total = _calcular_total(factura.subtotal, factura.iva_porcentaje)

    auditoria.registrar(db, user, "editar", "factura", factura.id, f"Factura {factura.numero} actualizada",
                        datos={"antes": antes, "despues": {"numero": factura.numero, "estado": factura.estado,
                               "total": float(factura.total or 0),
                               "fecha": factura.fecha.isoformat() if factura.fecha else None}})
    db.commit()

    return db.query(Factura).options(*_eager()).filter(Factura.id == factura.id).first().to_dict()


# ──────────────────────────────────────────────────────────────────────────────
# DELETE /api/facturas/{id}
# ──────────────────────────────────────────────────────────────────────────────

@router.delete("/facturas/{factura_id}", status_code=204, summary="Eliminar factura")
async def eliminar_factura(
    factura_id: int,
    user: dict = Depends(require_permiso("facturas:borrar")),
    db: Session = Depends(get_db),
):
    factura = db.query(Factura).filter(Factura.id == factura_id).first()
    if not factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    numero = factura.numero
    auditoria.registrar(db, user, "borrar", "factura", factura_id, f"Factura {numero} eliminada",
                        datos={"numero": numero, "cliente_id": factura.cliente_id,
                               "total": float(factura.total or 0), "estado": factura.estado,
                               "fecha": factura.fecha.isoformat() if factura.fecha else None})
    db.delete(factura)
    db.commit()
