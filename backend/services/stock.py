"""
Servicio de stock — Etiplast ERP
=================================
Movimientos de inventario con bloqueo de fila (SELECT FOR UPDATE), snapshot
anterior/resultante y alerta de stock bajo mínimo. El commit lo hace el router.
"""
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from models import StockItem, StockMovimiento
from services import notificaciones as notificaciones_service


def registrar_movimiento(
    db: Session,
    stock_item_id: int,
    tipo: str,
    cantidad,
    motivo: str,
    user_id: Optional[int] = None,
    orden_id: Optional[int] = None,
    remito_id: Optional[int] = None,
    lote: Optional[str] = None,
    observaciones: Optional[str] = None,
) -> StockMovimiento:
    """
    Registra un movimiento de stock y actualiza `stock_actual`. NO hace commit.

    Tipos:
      - ingreso → suma `cantidad` al stock actual.
      - egreso  → resta `cantidad`; valida que no supere el stock disponible.
      - ajuste  → fija `stock_actual` en `cantidad` (valor absoluto nuevo).

    Si el movimiento cruza de >= mínimo a < mínimo, notifica a los admins
    (tipo 'stock_bajo'). Lanza ValueError con mensaje en español ante datos
    inválidos (el router lo traduce a HTTP 400).
    """
    item = (
        db.query(StockItem)
        .filter(StockItem.id == stock_item_id)
        .with_for_update()
        .first()
    )
    if not item:
        raise ValueError("Ítem de stock no encontrado")

    if tipo not in ("ingreso", "egreso", "ajuste"):
        raise ValueError("Tipo de movimiento inválido: debe ser 'ingreso', 'egreso' o 'ajuste'")

    try:
        cantidad = Decimal(str(cantidad))
    except Exception:
        raise ValueError("Cantidad inválida")

    if tipo in ("ingreso", "egreso") and cantidad <= 0:
        raise ValueError("La cantidad debe ser mayor a cero")
    if tipo == "ajuste" and cantidad < 0:
        raise ValueError("El ajuste no puede dejar stock negativo")

    anterior = Decimal(str(item.stock_actual)) if item.stock_actual is not None else Decimal("0")

    if tipo == "ingreso":
        resultante = anterior + cantidad
    elif tipo == "egreso":
        if cantidad > anterior:
            raise ValueError(
                f"Stock insuficiente: stock actual {anterior} {item.unidad or ''}".strip()
                + f", se intentó egresar {cantidad}"
            )
        resultante = anterior - cantidad
    else:  # ajuste
        resultante = cantidad

    item.stock_actual = resultante

    movimiento = StockMovimiento(
        stock_item_id=item.id,
        tipo=tipo,
        cantidad=cantidad,
        motivo=motivo,
        stock_anterior=anterior,
        stock_resultante=resultante,
        orden_trabajo_id=orden_id,
        remito_id=remito_id,
        lote=lote,
        observaciones=observaciones,
        user_id=user_id,
    )
    db.add(movimiento)

    # Alerta de stock bajo: solo cuando CRUZA el mínimo (no en cada movimiento)
    minimo = Decimal(str(item.stock_minimo)) if item.stock_minimo is not None else Decimal("0")
    if minimo > 0 and anterior >= minimo and resultante < minimo:
        notificaciones_service.notificar(
            db,
            tipo="stock_bajo",
            titulo=f"Stock bajo mínimo: {item.nombre}",
            mensaje=(
                f"El ítem {item.codigo or item.nombre} quedó en "
                f"{resultante} {item.unidad or ''} (mínimo: {minimo})."
            ).strip(),
            link="/stock",
            roles=["admin"],
        )

    return movimiento
