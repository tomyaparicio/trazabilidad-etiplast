"""Inventario de insumos y sus movimientos."""

from sqlalchemy import (
    Boolean, Column, Date, DateTime, ForeignKey, Index,
    Integer, Numeric, String, Text, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from core.database import Base


# ──────────────────────────────────────────────────────────────────────────────
# Catálogos
# ──────────────────────────────────────────────────────────────────────────────

class StockItem(Base):
    """Ítem de inventario: materia prima, producto terminado o insumo."""
    __tablename__ = "stock_items"

    id                  = Column(Integer, primary_key=True, autoincrement=True)
    codigo              = Column(String(50), unique=True, index=True)
    nombre              = Column(String(200), nullable=False)
    tipo                = Column(String(30), nullable=False, index=True)
    # tipos: materia_prima | producto_terminado | insumo
    categoria           = Column(String(100))
    unidad              = Column(String(20), default="kg")
    stock_actual        = Column(Numeric(14, 3), default=0)
    stock_minimo        = Column(Numeric(14, 3), default=0)
    cliente_id          = Column(Integer, ForeignKey("clientes.id", ondelete="SET NULL"), nullable=True, index=True)
    cliente_producto_id = Column(Integer, ForeignKey("cliente_productos.id", ondelete="SET NULL"), nullable=True)
    activo              = Column(Boolean, default=True)
    created_at          = Column(DateTime(timezone=True), server_default=func.now())
    updated_at          = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    cliente = relationship("Cliente")

    def __repr__(self):
        return f"<StockItem codigo={self.codigo!r} nombre={self.nombre!r}>"

    def to_dict(self) -> dict:
        return {
            "id":                  self.id,
            "codigo":              self.codigo,
            "nombre":              self.nombre,
            "tipo":                self.tipo,
            "categoria":           self.categoria,
            "unidad":              self.unidad,
            "stock_actual":        float(self.stock_actual) if self.stock_actual is not None else None,
            "stock_minimo":        float(self.stock_minimo) if self.stock_minimo is not None else None,
            "cliente_id":          self.cliente_id,
            "cliente_nombre":      self.cliente.marca if self.cliente else None,
            "cliente_producto_id": self.cliente_producto_id,
            "activo":              self.activo,
            "bajo_minimo":         (
                float(self.stock_actual or 0) < float(self.stock_minimo or 0)
            ),
            "created_at":          self.created_at.isoformat() if self.created_at else None,
            "updated_at":          self.updated_at.isoformat() if self.updated_at else None,
        }



class StockMovimiento(Base):
    """Movimiento de stock (kardex). Definido después de Remito por la FK remito_id."""
    __tablename__ = "stock_movimientos"

    id               = Column(Integer, primary_key=True, autoincrement=True)
    stock_item_id    = Column(Integer, ForeignKey("stock_items.id", ondelete="CASCADE"), nullable=False, index=True)
    tipo             = Column(String(20))    # ingreso | egreso | ajuste
    cantidad         = Column(Numeric(14, 3))
    motivo           = Column(String(50))    # produccion | despacho | compra | ajuste_inventario...
    stock_anterior   = Column(Numeric(14, 3))
    stock_resultante = Column(Numeric(14, 3))
    orden_trabajo_id = Column(Integer, ForeignKey("ordenes_trabajo.id", ondelete="SET NULL"), nullable=True)
    remito_id        = Column(Integer, ForeignKey("remitos.id", ondelete="SET NULL"), nullable=True)
    lote             = Column(String(50))
    observaciones    = Column(Text)
    user_id          = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at       = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relaciones
    stock_item = relationship("StockItem")
    usuario    = relationship("User", foreign_keys=[user_id])

    def __repr__(self):
        return f"<StockMovimiento stock_item_id={self.stock_item_id} tipo={self.tipo!r} cantidad={self.cantidad}>"

    def to_dict(self) -> dict:
        return {
            "id":               self.id,
            "stock_item_id":    self.stock_item_id,
            "tipo":             self.tipo,
            "cantidad":         float(self.cantidad)         if self.cantidad         is not None else None,
            "motivo":           self.motivo,
            "stock_anterior":   float(self.stock_anterior)   if self.stock_anterior   is not None else None,
            "stock_resultante": float(self.stock_resultante) if self.stock_resultante is not None else None,
            "orden_trabajo_id": self.orden_trabajo_id,
            "remito_id":        self.remito_id,
            "lote":             self.lote,
            "observaciones":    self.observaciones,
            "user_id":          self.user_id,
            "usuario_nombre":   self.usuario.nombre_completo if self.usuario else None,
            "created_at":       self.created_at.isoformat() if self.created_at else None,
        }


# ──────────────────────────────────────────────────────────────────────────────
# Planificación de producción
# ──────────────────────────────────────────────────────────────────────────────
