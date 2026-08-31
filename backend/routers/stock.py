"""
Router de Stock — Etiplast ERP
===============================
CRUD de ítems de inventario (materias primas, producto terminado, insumos),
movimientos de stock (kardex) vía services/stock y alertas de stock bajo mínimo.
El stock actual NUNCA se edita directo: solo cambia a través de movimientos.
"""
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from database import get_db
from dependencies import require_permiso, verify_token
from models import StockItem, StockMovimiento, User
from schemas import (
    StockItemCreateSchema, StockItemUpdateSchema, StockMovimientoCreateSchema,
)
from services import auditoria
from services import stock as stock_service

router = APIRouter(prefix="/api", tags=["stock"])

TIPOS_ITEM = ("materia_prima", "producto_terminado", "insumo")


# ──────────────────────────────────────────────────────────────────────────────
# Helpers internos
# ──────────────────────────────────────────────────────────────────────────────

def _resolver_user_id(db: Session, user: dict) -> Optional[int]:
    """Devuelve el id del usuario del token; si no viene, lo busca por email."""
    user_id = user.get("id")
    if user_id is not None:
        return user_id
    email = user.get("email")
    if not email:
        return None
    u = db.query(User).filter(User.email == email).first()
    return u.id if u else None


def _validar_codigo_unico(db: Session, codigo: Optional[str], excluir_id: Optional[int] = None):
    """400 si ya existe otro ítem con el mismo código."""
    if not codigo:
        return
    query = db.query(StockItem).filter(StockItem.codigo == codigo)
    if excluir_id is not None:
        query = query.filter(StockItem.id != excluir_id)
    if query.first():
        raise HTTPException(status_code=400, detail=f"Ya existe un ítem con el código {codigo}")


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/stock/alertas  (ANTES de /stock/{id} para que no matchee como id)
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/stock/alertas", summary="Ítems activos con stock por debajo del mínimo")
async def alertas_stock(
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    items = (
        db.query(StockItem)
        .options(joinedload(StockItem.cliente))  # evita N+1 (to_dict lee cliente.marca)
        .filter(
            StockItem.activo.is_(True),
            StockItem.stock_actual < StockItem.stock_minimo,
        )
        .order_by(StockItem.nombre.asc())
        .all()
    )
    return [i.to_dict() for i in items]


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/stock
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/stock", summary="Listar ítems de stock con paginación y filtros")
async def listar_stock(
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    tipo: Optional[str] = Query(None, description="materia_prima | producto_terminado | insumo"),
    categoria: Optional[str] = Query(None, description="Filtrar por categoría"),
    search: Optional[str] = Query(None, description="Buscar por código o nombre"),
    bajo_minimo: bool = Query(False, description="Solo ítems con stock_actual < stock_minimo"),
):
    query = db.query(StockItem).filter(StockItem.activo.is_(True))

    if tipo:
        query = query.filter(StockItem.tipo == tipo)

    if categoria:
        query = query.filter(StockItem.categoria.ilike(f"%{categoria}%"))

    if search:
        f = f"%{search}%"
        query = query.filter(StockItem.codigo.ilike(f) | StockItem.nombre.ilike(f))

    if bajo_minimo:
        query = query.filter(StockItem.stock_actual < StockItem.stock_minimo)

    total = query.count()

    items = (
        query
        .options(joinedload(StockItem.cliente))  # evita N+1 (to_dict lee cliente.marca)
        .order_by(StockItem.nombre.asc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return {
        "data":        [i.to_dict() for i in items],
        "total":       total,
        "page":        page,
        "per_page":    per_page,
        "total_pages": -(-total // per_page) if total else 0,
    }


# ──────────────────────────────────────────────────────────────────────────────
# POST /api/stock
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/stock", status_code=201, summary="Crear ítem de stock")
async def crear_item(
    datos: StockItemCreateSchema,
    user: dict = Depends(require_permiso("stock:crear")),
    db: Session = Depends(get_db),
):
    if datos.tipo not in TIPOS_ITEM:
        raise HTTPException(
            status_code=400,
            detail="Tipo inválido: debe ser 'materia_prima', 'producto_terminado' o 'insumo'",
        )

    _validar_codigo_unico(db, datos.codigo)

    # El stock_actual NUNCA se setea directo: el ítem nace en 0 y, si se indicó
    # un stock inicial, se materializa con un movimiento de ingreso para que el
    # kardex sea la única fuente de verdad del inventario.
    item = StockItem(
        codigo=datos.codigo,
        nombre=datos.nombre,
        tipo=datos.tipo,
        categoria=datos.categoria,
        unidad=datos.unidad,
        stock_actual=Decimal("0"),
        stock_minimo=datos.stock_minimo,
        cliente_id=datos.cliente_id,
        cliente_producto_id=datos.cliente_producto_id,
        activo=datos.activo,
    )
    db.add(item)
    db.flush()  # obtener item.id para auditar

    auditoria.registrar(
        db, user,
        accion="crear",
        entidad="stock_item",
        entidad_id=item.id,
        descripcion=f"Ítem de stock creado: {item.codigo or ''} {item.nombre}".strip(),
    )

    # Movimiento inicial de stock (kardex) si se indicó stock_actual > 0
    stock_inicial = datos.stock_actual if datos.stock_actual is not None else Decimal("0")
    if stock_inicial and stock_inicial > 0:
        movimiento = stock_service.registrar_movimiento(
            db,
            stock_item_id=item.id,
            tipo="ingreso",
            cantidad=stock_inicial,
            motivo="inicial",
            user_id=_resolver_user_id(db, user),
            observaciones="Stock inicial al crear el ítem",
        )
        db.flush()
        auditoria.registrar(
            db, user,
            accion="movimiento",
            entidad="stock_item",
            entidad_id=item.id,
            descripcion=(
                f"Stock inicial de {stock_inicial} {item.unidad or ''} "
                f"en {item.codigo or item.nombre}"
            ).strip(),
            datos={
                "movimiento_id":    movimiento.id,
                "tipo":             "ingreso",
                "cantidad":         float(stock_inicial),
                "stock_resultante": float(movimiento.stock_resultante),
            },
        )

    db.commit()
    db.refresh(item)
    return item.to_dict()


# ──────────────────────────────────────────────────────────────────────────────
# PUT /api/stock/{id}
# ──────────────────────────────────────────────────────────────────────────────

@router.put("/stock/{item_id}", summary="Actualizar ítem de stock (no toca stock_actual)")
async def actualizar_item(
    item_id: int,
    datos: StockItemUpdateSchema,
    user: dict = Depends(require_permiso("stock:editar")),
    db: Session = Depends(get_db),
):
    item = db.query(StockItem).filter(StockItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Ítem de stock no encontrado")

    cambios = datos.model_dump(exclude_unset=True)

    # stock_actual NO se edita directo: solo vía movimientos (el schema ya lo
    # excluye, esto es defensa extra ante cambios futuros del schema).
    cambios.pop("stock_actual", None)

    if "tipo" in cambios and cambios["tipo"] not in TIPOS_ITEM:
        raise HTTPException(
            status_code=400,
            detail="Tipo inválido: debe ser 'materia_prima', 'producto_terminado' o 'insumo'",
        )

    if "codigo" in cambios:
        _validar_codigo_unico(db, cambios["codigo"], excluir_id=item.id)

    for campo, valor in cambios.items():
        setattr(item, campo, valor)

    auditoria.registrar(
        db, user,
        accion="actualizar",
        entidad="stock_item",
        entidad_id=item.id,
        descripcion=f"Ítem de stock actualizado: {item.codigo or ''} {item.nombre}".strip(),
        datos={"campos": list(cambios.keys())},
    )
    db.commit()
    db.refresh(item)
    return item.to_dict()


# ──────────────────────────────────────────────────────────────────────────────
# DELETE /api/stock/{id}  (solo admin, soft delete)
# ──────────────────────────────────────────────────────────────────────────────

@router.delete("/stock/{item_id}", status_code=204, summary="Desactivar ítem de stock (soft delete)")
async def eliminar_item(
    item_id: int,
    user: dict = Depends(require_permiso("stock:borrar")),
    db: Session = Depends(get_db),
):
    item = db.query(StockItem).filter(StockItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Ítem de stock no encontrado")

    item.activo = False

    auditoria.registrar(
        db, user,
        accion="eliminar",
        entidad="stock_item",
        entidad_id=item.id,
        descripcion=f"Ítem de stock desactivado: {item.codigo or ''} {item.nombre}".strip(),
    )
    db.commit()


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/stock/{id}/movimientos  (kardex)
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/stock/{item_id}/movimientos", summary="Kardex de movimientos de un ítem")
async def listar_movimientos(
    item_id: int,
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    if not db.query(StockItem).filter(StockItem.id == item_id).first():
        raise HTTPException(status_code=404, detail="Ítem de stock no encontrado")

    query = db.query(StockMovimiento).filter(StockMovimiento.stock_item_id == item_id)
    total = query.count()

    movimientos = (
        query
        .options(joinedload(StockMovimiento.usuario))
        .order_by(StockMovimiento.created_at.desc(), StockMovimiento.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return {
        "data":        [m.to_dict() for m in movimientos],
        "total":       total,
        "page":        page,
        "per_page":    per_page,
        "total_pages": -(-total // per_page) if total else 0,
    }


# ──────────────────────────────────────────────────────────────────────────────
# POST /api/stock/{id}/movimientos
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/stock/{item_id}/movimientos", status_code=201, summary="Registrar movimiento de stock")
async def crear_movimiento(
    item_id: int,
    datos: StockMovimientoCreateSchema,
    user: dict = Depends(require_permiso("stock:editar")),
    db: Session = Depends(get_db),
):
    item = db.query(StockItem).filter(StockItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Ítem de stock no encontrado")

    if datos.stock_item_id != item_id:
        raise HTTPException(
            status_code=400,
            detail="El stock_item_id del cuerpo no coincide con el de la URL",
        )

    user_id = _resolver_user_id(db, user)

    try:
        movimiento = stock_service.registrar_movimiento(
            db,
            stock_item_id=item_id,
            tipo=datos.tipo,
            cantidad=datos.cantidad,
            motivo=datos.motivo,
            user_id=user_id,
            orden_id=datos.orden_trabajo_id,
            remito_id=datos.remito_id,
            lote=datos.lote,
            observaciones=datos.observaciones,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    db.flush()  # obtener movimiento.id para auditar

    auditoria.registrar(
        db, user,
        accion="movimiento",
        entidad="stock_item",
        entidad_id=item.id,
        descripcion=(
            f"Movimiento de stock ({datos.tipo}) de {datos.cantidad} {item.unidad or ''} "
            f"en {item.codigo or item.nombre} — motivo: {datos.motivo or 'sin motivo'}"
        ).strip(),
        datos={
            "movimiento_id":    movimiento.id,
            "tipo":             datos.tipo,
            "cantidad":         float(datos.cantidad),
            "stock_resultante": float(movimiento.stock_resultante),
        },
    )
    db.commit()
    db.refresh(movimiento)
    return movimiento.to_dict()
