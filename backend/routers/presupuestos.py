"""
Router de Presupuestos — Etiplast ERP
======================================
CRUD completo de presupuestos con ítems anidados, recalculo de totales
server-side y conversión a orden de trabajo (PRES-0001 → OT-XXXX).
"""
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import ValidationError
from sqlalchemy.orm import Session, joinedload

from core.database import get_db
from core.security import require_permiso, verify_token
from models import Cliente, OrdenTrabajo, Presupuesto, PresupuestoItem
from schemas import PresupuestoCreateSchema, PresupuestoItemSchema, PresupuestoUpdateSchema
from services import auditoria, notificaciones
from services.numeracion import generar_numero

router = APIRouter(prefix="/api", tags=["presupuestos"])

ESTADOS_VALIDOS = {"borrador", "enviado", "aprobado", "rechazado", "vencido", "convertido"}

_DOS_DECIMALES = Decimal("0.01")


# ──────────────────────────────────────────────────────────────────────────────
# Helpers internos
# ──────────────────────────────────────────────────────────────────────────────

def _eager_options():
    return [
        joinedload(Presupuesto.cliente),
        joinedload(Presupuesto.creador),
        joinedload(Presupuesto.items),
    ]


def _get_presupuesto(db: Session, presupuesto_id: int) -> Presupuesto:
    presupuesto = (
        db.query(Presupuesto)
        .options(*_eager_options())
        .filter(Presupuesto.id == presupuesto_id)
        .first()
    )
    if not presupuesto:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")
    return presupuesto


def _validar_estado(estado: Optional[str]):
    if estado is not None and estado not in ESTADOS_VALIDOS:
        raise HTTPException(
            status_code=400,
            detail=f"Estado inválido: {estado!r}. Válidos: {', '.join(sorted(ESTADOS_VALIDOS))}",
        )


def _validar_cliente(db: Session, cliente_id: Optional[int]):
    if cliente_id is not None:
        if not db.query(Cliente).filter(Cliente.id == cliente_id).first():
            raise HTTPException(status_code=404, detail="Cliente no encontrado")


def _subtotal_item(item: PresupuestoItemSchema) -> Decimal:
    """Subtotal de línea SIEMPRE recalculado: cantidad × precio_unitario."""
    cantidad = item.cantidad if item.cantidad is not None else Decimal("0")
    precio = item.precio_unitario if item.precio_unitario is not None else Decimal("0")
    return (cantidad * precio).quantize(_DOS_DECIMALES, rounding=ROUND_HALF_UP)


def _recalcular_totales(presupuesto: Presupuesto):
    """Recalcula subtotal y total del presupuesto a partir de sus ítems."""
    subtotal = sum(
        (i.subtotal if i.subtotal is not None else Decimal("0") for i in presupuesto.items),
        Decimal("0"),
    )
    desc = presupuesto.descuento_porcentaje if presupuesto.descuento_porcentaje is not None else Decimal("0")
    iva = presupuesto.iva_porcentaje if presupuesto.iva_porcentaje is not None else Decimal("0")
    total = subtotal * (Decimal("1") - Decimal(desc) / 100) * (Decimal("1") + Decimal(iva) / 100)
    presupuesto.subtotal = subtotal.quantize(_DOS_DECIMALES, rounding=ROUND_HALF_UP)
    presupuesto.total = total.quantize(_DOS_DECIMALES, rounding=ROUND_HALF_UP)


def _sync_items(db: Session, presupuesto: Presupuesto, items_data: List[Tuple[Optional[int], PresupuestoItemSchema]]):
    """
    Sincroniza los ítems del presupuesto con la lista enviada (variante del patrón
    _sync_bobinas de órdenes, pero preservando ids existentes):
      - los que no vienen → se borran
      - los que vienen con id existente → se actualizan
      - los que vienen sin id → se crean
    `items_data` son tuplas (id_o_None, schema): el schema ignora claves extra,
    así que el id se extrae del body crudo en el endpoint.
    """
    existentes = {i.id: i for i in presupuesto.items}
    ids_enviados = set()

    for item_id, row in items_data:
        if item_id is not None and item_id in existentes:
            item = existentes[item_id]
            item.cliente_producto_id = row.cliente_producto_id
            item.descripcion = row.descripcion
            item.cantidad = row.cantidad
            item.unidad = row.unidad
            item.precio_unitario = row.precio_unitario
            item.subtotal = _subtotal_item(row)
            ids_enviados.add(item_id)
        else:
            db.add(PresupuestoItem(
                presupuesto_id=presupuesto.id,
                cliente_producto_id=row.cliente_producto_id,
                descripcion=row.descripcion,
                cantidad=row.cantidad,
                unidad=row.unidad,
                precio_unitario=row.precio_unitario,
                subtotal=_subtotal_item(row),
            ))

    for item_id, item in existentes.items():
        if item_id not in ids_enviados:
            db.delete(item)

    db.flush()
    db.refresh(presupuesto)


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/presupuestos
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/presupuestos", summary="Listar presupuestos con paginación y filtros")
async def listar_presupuestos(
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    estado: Optional[str] = Query(None, description="Filtrar por estado"),
    cliente_id: Optional[int] = Query(None, description="Filtrar por cliente"),
    search: Optional[str] = Query(None, description="Buscar por número o marca de cliente"),
):
    query = db.query(Presupuesto)

    if estado:
        query = query.filter(Presupuesto.estado == estado)

    if cliente_id:
        query = query.filter(Presupuesto.cliente_id == cliente_id)

    if search:
        f = f"%{search}%"
        query = (
            query
            .outerjoin(Cliente, Cliente.id == Presupuesto.cliente_id)
            .filter(
                Presupuesto.numero.ilike(f) |
                Cliente.marca.ilike(f) |
                Presupuesto.prospecto_nombre.ilike(f)
            )
            .distinct()
        )

    total = query.count()

    presupuestos = (
        query
        .options(*_eager_options())
        .order_by(Presupuesto.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return {
        "data":        [p.to_dict() for p in presupuestos],
        "total":       total,
        "page":        page,
        "per_page":    per_page,
        "total_pages": -(-total // per_page) if total else 0,
    }


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/presupuestos/{id}
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/presupuestos/{presupuesto_id}", summary="Obtener presupuesto por ID")
async def obtener_presupuesto(
    presupuesto_id: int,
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    return _get_presupuesto(db, presupuesto_id).to_dict()


# ──────────────────────────────────────────────────────────────────────────────
# POST /api/presupuestos
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/presupuestos", status_code=201, summary="Crear nuevo presupuesto")
async def crear_presupuesto(
    datos: PresupuestoCreateSchema,
    user: dict = Depends(require_permiso("presupuestos:crear")),
    db: Session = Depends(get_db),
):
    _validar_estado(datos.estado)
    _validar_cliente(db, datos.cliente_id)

    if not datos.cliente_id and not (datos.prospecto_nombre or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Indicá un cliente o un nombre de prospecto",
        )

    numero = generar_numero(db, Presupuesto, "PRES")

    presupuesto = Presupuesto(
        numero=numero,
        cliente_id=datos.cliente_id,
        prospecto_nombre=datos.prospecto_nombre,
        fecha=datos.fecha or date.today(),
        validez_dias=datos.validez_dias,
        estado=datos.estado,
        moneda=datos.moneda,
        condiciones_pago=datos.condiciones_pago,
        descuento_porcentaje=datos.descuento_porcentaje,
        iva_porcentaje=datos.iva_porcentaje,
        observaciones=datos.observaciones,
        created_by=user.get("id"),
    )
    db.add(presupuesto)
    db.flush()  # obtener presupuesto.id

    for row in datos.items:
        db.add(PresupuestoItem(
            presupuesto_id=presupuesto.id,
            cliente_producto_id=row.cliente_producto_id,
            descripcion=row.descripcion,
            cantidad=row.cantidad,
            unidad=row.unidad,
            precio_unitario=row.precio_unitario,
            subtotal=_subtotal_item(row),
        ))
    db.flush()
    db.refresh(presupuesto)

    _recalcular_totales(presupuesto)

    auditoria.registrar(
        db, user, "crear", "presupuesto", presupuesto.id,
        f"Presupuesto {numero} creado",
    )
    db.commit()

    return _get_presupuesto(db, presupuesto.id).to_dict()


# ──────────────────────────────────────────────────────────────────────────────
# PUT /api/presupuestos/{id}
# ──────────────────────────────────────────────────────────────────────────────

@router.put("/presupuestos/{presupuesto_id}", summary="Actualizar presupuesto")
async def actualizar_presupuesto(
    presupuesto_id: int,
    datos_raw: Dict[str, Any] = Body(...),
    user: dict = Depends(require_permiso("presupuestos:editar")),
    db: Session = Depends(get_db),
):
    # Validación manual: el schema ignora claves extra (p.ej. `id` de cada ítem),
    # pero necesitamos esos ids para el sync — se extraen del body crudo.
    try:
        datos = PresupuestoUpdateSchema.model_validate(datos_raw)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.errors(include_url=False, include_input=False))

    presupuesto = _get_presupuesto(db, presupuesto_id)

    if presupuesto.estado == "convertido":
        raise HTTPException(
            status_code=400,
            detail="El presupuesto ya fue convertido a orden de trabajo y no puede editarse",
        )

    _validar_estado(datos.estado)
    if datos.estado == "convertido":
        raise HTTPException(
            status_code=400,
            detail="El estado 'convertido' solo se asigna mediante la conversión a orden de trabajo",
        )

    campos = datos.model_dump(exclude_unset=True)

    if "cliente_id" in campos:
        _validar_cliente(db, datos.cliente_id)
        presupuesto.cliente_id = datos.cliente_id
    if "prospecto_nombre" in campos:
        presupuesto.prospecto_nombre = datos.prospecto_nombre
    if "fecha" in campos and datos.fecha:
        presupuesto.fecha = datos.fecha
    if "validez_dias" in campos:
        presupuesto.validez_dias = datos.validez_dias
    if "estado" in campos and datos.estado:
        presupuesto.estado = datos.estado
    if "moneda" in campos and datos.moneda:
        presupuesto.moneda = datos.moneda
    if "condiciones_pago" in campos:
        presupuesto.condiciones_pago = datos.condiciones_pago
    if "descuento_porcentaje" in campos and datos.descuento_porcentaje is not None:
        presupuesto.descuento_porcentaje = datos.descuento_porcentaje
    if "iva_porcentaje" in campos and datos.iva_porcentaje is not None:
        presupuesto.iva_porcentaje = datos.iva_porcentaje
    if "observaciones" in campos:
        presupuesto.observaciones = datos.observaciones

    if not presupuesto.cliente_id and not (presupuesto.prospecto_nombre or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Indicá un cliente o un nombre de prospecto",
        )

    if datos.items is not None:
        items_raw = datos_raw.get("items") or []
        items_con_id: List[Tuple[Optional[int], PresupuestoItemSchema]] = []
        for idx, row in enumerate(datos.items):
            raw = items_raw[idx] if idx < len(items_raw) and isinstance(items_raw[idx], dict) else {}
            raw_id = raw.get("id")
            items_con_id.append((int(raw_id) if isinstance(raw_id, int) else None, row))
        _sync_items(db, presupuesto, items_con_id)

    _recalcular_totales(presupuesto)

    auditoria.registrar(
        db, user, "actualizar", "presupuesto", presupuesto.id,
        f"Presupuesto {presupuesto.numero} actualizado",
    )
    db.commit()

    return _get_presupuesto(db, presupuesto_id).to_dict()


# ──────────────────────────────────────────────────────────────────────────────
# DELETE /api/presupuestos/{id}
# ──────────────────────────────────────────────────────────────────────────────

@router.delete("/presupuestos/{presupuesto_id}", status_code=204, summary="Eliminar presupuesto (solo admin)")
async def eliminar_presupuesto(
    presupuesto_id: int,
    user: dict = Depends(require_permiso("presupuestos:borrar")),
    db: Session = Depends(get_db),
):
    presupuesto = db.query(Presupuesto).filter(Presupuesto.id == presupuesto_id).first()
    if not presupuesto:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")

    if presupuesto.estado == "convertido":
        raise HTTPException(
            status_code=400,
            detail="No se puede eliminar un presupuesto convertido a orden de trabajo",
        )

    numero = presupuesto.numero
    auditoria.registrar(
        db, user, "eliminar", "presupuesto", presupuesto.id,
        f"Presupuesto {numero} eliminado",
    )
    db.delete(presupuesto)
    db.commit()


# ──────────────────────────────────────────────────────────────────────────────
# POST /api/presupuestos/{id}/convertir
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/presupuestos/{presupuesto_id}/convertir", status_code=201,
             summary="Convertir presupuesto en orden de trabajo (borrador)")
async def convertir_presupuesto(
    presupuesto_id: int,
    user: dict = Depends(require_permiso("presupuestos:aprobar")),
    db: Session = Depends(get_db),
):
    presupuesto = _get_presupuesto(db, presupuesto_id)

    if presupuesto.estado == "convertido":
        raise HTTPException(
            status_code=400,
            detail="El presupuesto ya fue convertido a orden de trabajo",
        )

    if not presupuesto.cliente_id:
        raise HTTPException(
            status_code=400,
            detail="El presupuesto es de un prospecto sin cliente asociado: asigná un cliente antes de convertir",
        )

    # Cantidad total = suma de cantidades de los ítems
    cantidad_total = sum(
        (i.cantidad if i.cantidad is not None else Decimal("0") for i in presupuesto.items),
        Decimal("0"),
    )

    # Producto del primer ítem que tenga uno asociado
    cliente_producto_id = next(
        (i.cliente_producto_id for i in presupuesto.items if i.cliente_producto_id),
        None,
    )

    numero_ot = generar_numero(db, OrdenTrabajo, "OT")

    orden = OrdenTrabajo(
        numero=numero_ot,
        cliente_id=presupuesto.cliente_id,
        cliente_producto_id=cliente_producto_id,
        fecha=date.today(),
        estado="borrador",
        created_by=user.get("id"),
        cantidad=int(cantidad_total.quantize(Decimal("1"), rounding=ROUND_HALF_UP)) if cantidad_total else None,
        observaciones=presupuesto.observaciones,
    )
    db.add(orden)
    db.flush()  # obtener orden.id

    presupuesto.estado = "convertido"
    presupuesto.orden_trabajo_id = orden.id

    auditoria.registrar(
        db, user, "convertir", "presupuesto", presupuesto.id,
        f"Presupuesto {presupuesto.numero} convertido en orden {numero_ot}",
        datos={"orden_trabajo_id": orden.id, "orden_numero": numero_ot},
    )
    notificaciones.notificar(
        db,
        tipo="presupuesto_convertido",
        titulo=f"Presupuesto {presupuesto.numero} convertido",
        mensaje=f"El presupuesto {presupuesto.numero} se convirtió en la orden de trabajo {numero_ot}",
        link="/ordenes",
        roles=["admin", "user"],
    )
    db.commit()

    orden = (
        db.query(OrdenTrabajo)
        .options(
            joinedload(OrdenTrabajo.cliente),
            joinedload(OrdenTrabajo.cliente_producto),
            joinedload(OrdenTrabajo.bobinas),
            joinedload(OrdenTrabajo.creador),
            joinedload(OrdenTrabajo.responsable),
        )
        .filter(OrdenTrabajo.id == orden.id)
        .first()
    )
    return orden.to_dict()
