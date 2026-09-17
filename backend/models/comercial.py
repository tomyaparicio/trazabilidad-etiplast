"""Circuito comercial: presupuesto → orden → remito → factura."""

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

class Presupuesto(Base):
    """Presupuesto / cotización (PRES-0001). Puede convertirse en orden de trabajo."""
    __tablename__ = "presupuestos"

    id                   = Column(Integer, primary_key=True, autoincrement=True)
    numero               = Column(String(20), unique=True, index=True)   # PRES-0001
    cliente_id           = Column(Integer, ForeignKey("clientes.id", ondelete="SET NULL"), nullable=True, index=True)
    prospecto_nombre     = Column(String(200))   # cliente potencial aún no cargado
    fecha                = Column(Date)
    validez_dias         = Column(Integer, default=30)
    estado               = Column(String(20), default="borrador", index=True)
    # estados: borrador | enviado | aprobado | rechazado | vencido | convertido
    moneda               = Column(String(10), default="ARS")
    condiciones_pago     = Column(String(200))
    subtotal             = Column(Numeric(14, 2))
    descuento_porcentaje = Column(Numeric(5, 2), default=0)
    iva_porcentaje       = Column(Numeric(5, 2), default=21)
    total                = Column(Numeric(14, 2))
    observaciones        = Column(Text)
    orden_trabajo_id     = Column(Integer, ForeignKey("ordenes_trabajo.id", ondelete="SET NULL"), nullable=True)
    created_by           = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at           = Column(DateTime(timezone=True), server_default=func.now())
    updated_at           = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    cliente = relationship("Cliente")
    creador = relationship("User", foreign_keys=[created_by])
    items   = relationship(
        "PresupuestoItem", back_populates="presupuesto",
        cascade="all, delete-orphan",
        order_by="PresupuestoItem.id",
    )

    def __repr__(self):
        return f"<Presupuesto numero={self.numero!r} estado={self.estado!r}>"

    def to_dict(self) -> dict:
        return {
            "id":                   self.id,
            "numero":               self.numero,
            "cliente_id":           self.cliente_id,
            "cliente_nombre":       self.cliente.marca if self.cliente else None,
            "prospecto_nombre":     self.prospecto_nombre,
            "fecha":                self.fecha.isoformat() if self.fecha else None,
            "validez_dias":         self.validez_dias,
            "estado":               self.estado,
            "moneda":               self.moneda,
            "condiciones_pago":     self.condiciones_pago,
            "subtotal":             float(self.subtotal)             if self.subtotal             is not None else None,
            "descuento_porcentaje": float(self.descuento_porcentaje) if self.descuento_porcentaje is not None else None,
            "iva_porcentaje":       float(self.iva_porcentaje)       if self.iva_porcentaje       is not None else None,
            "total":                float(self.total)                if self.total                is not None else None,
            "observaciones":        self.observaciones,
            "orden_trabajo_id":     self.orden_trabajo_id,
            "created_by":           self.created_by,
            "creador_nombre":       self.creador.nombre_completo if self.creador else None,
            "items":                [i.to_dict() for i in self.items],
            "created_at":           self.created_at.isoformat() if self.created_at else None,
            "updated_at":           self.updated_at.isoformat() if self.updated_at else None,
        }

class PresupuestoItem(Base):
    """Línea de detalle de un presupuesto."""
    __tablename__ = "presupuesto_items"

    id                  = Column(Integer, primary_key=True, autoincrement=True)
    presupuesto_id      = Column(Integer, ForeignKey("presupuestos.id", ondelete="CASCADE"), nullable=False, index=True)
    cliente_producto_id = Column(Integer, ForeignKey("cliente_productos.id", ondelete="SET NULL"), nullable=True)
    descripcion         = Column(String(300))
    cantidad            = Column(Numeric(12, 2))
    unidad              = Column(String(20))
    precio_unitario     = Column(Numeric(14, 4))
    subtotal            = Column(Numeric(14, 2))

    # Relaciones
    presupuesto = relationship("Presupuesto", back_populates="items")

    def __repr__(self):
        return f"<PresupuestoItem presupuesto_id={self.presupuesto_id} descripcion={self.descripcion!r}>"

    def to_dict(self) -> dict:
        return {
            "id":                  self.id,
            "presupuesto_id":      self.presupuesto_id,
            "cliente_producto_id": self.cliente_producto_id,
            "descripcion":         self.descripcion,
            "cantidad":            float(self.cantidad)        if self.cantidad        is not None else None,
            "unidad":              self.unidad,
            "precio_unitario":     float(self.precio_unitario) if self.precio_unitario is not None else None,
            "subtotal":            float(self.subtotal)        if self.subtotal        is not None else None,
        }



class Factura(Base):
    """
    Factura emitida a un cliente (FC-0001).

    Es la fuente de verdad del dinero en el dashboard: `facturación` suma las
    facturas no anuladas y `cobrado` las que están en estado 'cobrada'.
    Puede vincularse opcionalmente a una orden de trabajo.
    """
    __tablename__ = "facturas"

    id               = Column(Integer, primary_key=True, autoincrement=True)
    numero           = Column(String(30), unique=True, index=True)   # FC-0001
    tipo             = Column(String(5), default="B")                # A | B | C | X
    cliente_id       = Column(Integer, ForeignKey("clientes.id", ondelete="SET NULL"), nullable=True, index=True)
    orden_trabajo_id = Column(Integer, ForeignKey("ordenes_trabajo.id", ondelete="SET NULL"), nullable=True, index=True)
    # NOT NULL a propósito: la fecha de emisión es el eje temporal de todos los
    # agregados; una factura sin fecha sumaría en los totales pero desaparecería
    # del gráfico y de cualquier filtro por año/mes.
    fecha            = Column(Date, nullable=False, index=True)
    fecha_vencimiento = Column(Date)
    estado           = Column(String(20), default="pendiente", index=True)  # pendiente | cobrada | anulada
    fecha_cobro      = Column(Date)
    subtotal         = Column(Numeric(14, 2))
    iva_porcentaje   = Column(Numeric(5, 2), default=21)
    total            = Column(Numeric(14, 2))
    observaciones    = Column(Text)
    created_by       = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at       = Column(DateTime(timezone=True), server_default=func.now())
    updated_at       = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    cliente       = relationship("Cliente")
    orden_trabajo = relationship("OrdenTrabajo")
    creador       = relationship("User", foreign_keys=[created_by])

    def __repr__(self):
        return f"<Factura numero={self.numero!r} estado={self.estado!r} total={self.total}>"

    def to_dict(self) -> dict:
        return {
            "id":                self.id,
            "numero":            self.numero,
            "tipo":              self.tipo,
            "cliente_id":        self.cliente_id,
            "cliente_nombre":    self.cliente.marca if self.cliente else None,
            "orden_trabajo_id":  self.orden_trabajo_id,
            "orden_numero":      self.orden_trabajo.numero if self.orden_trabajo else None,
            "fecha":             self.fecha.isoformat()             if self.fecha             else None,
            "fecha_vencimiento": self.fecha_vencimiento.isoformat() if self.fecha_vencimiento else None,
            "estado":            self.estado,
            "fecha_cobro":       self.fecha_cobro.isoformat()       if self.fecha_cobro       else None,
            "subtotal":          float(self.subtotal)       if self.subtotal       is not None else None,
            "iva_porcentaje":    float(self.iva_porcentaje) if self.iva_porcentaje is not None else None,
            "total":             float(self.total)          if self.total          is not None else None,
            "observaciones":     self.observaciones,
            "created_by":        self.created_by,
            "creador_nombre":    self.creador.nombre_completo if self.creador else None,
            "created_at":        self.created_at.isoformat() if self.created_at else None,
        }



class Remito(Base):
    """Remito de entrega (REM-0001). Documento no fiscal."""
    __tablename__ = "remitos"

    id                = Column(Integer, primary_key=True, autoincrement=True)
    numero            = Column(String(20), unique=True, index=True)   # REM-0001
    cliente_id        = Column(Integer, ForeignKey("clientes.id", ondelete="CASCADE"), nullable=False, index=True)
    fecha             = Column(Date)
    estado            = Column(String(20), default="pendiente", index=True)
    # estados: pendiente | despachado | entregado | anulado
    transporte        = Column(String(200))
    domicilio_entrega = Column(String(300))
    observaciones     = Column(Text)
    created_by        = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at        = Column(DateTime(timezone=True), server_default=func.now())
    updated_at        = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    cliente = relationship("Cliente")
    creador = relationship("User", foreign_keys=[created_by])
    items   = relationship(
        "RemitoItem", back_populates="remito",
        cascade="all, delete-orphan",
        order_by="RemitoItem.id",
    )

    def __repr__(self):
        return f"<Remito numero={self.numero!r} estado={self.estado!r}>"

    def to_dict(self) -> dict:
        return {
            "id":                self.id,
            "numero":            self.numero,
            "cliente_id":        self.cliente_id,
            "cliente_nombre":    self.cliente.marca if self.cliente else None,
            "fecha":             self.fecha.isoformat() if self.fecha else None,
            "estado":            self.estado,
            "transporte":        self.transporte,
            "domicilio_entrega": self.domicilio_entrega,
            "observaciones":     self.observaciones,
            "created_by":        self.created_by,
            "creador_nombre":    self.creador.nombre_completo if self.creador else None,
            "items":             [i.to_dict() for i in self.items],
            "created_at":        self.created_at.isoformat() if self.created_at else None,
            "updated_at":        self.updated_at.isoformat() if self.updated_at else None,
        }

class RemitoItem(Base):
    """Línea de detalle de un remito."""
    __tablename__ = "remito_items"

    id               = Column(Integer, primary_key=True, autoincrement=True)
    remito_id        = Column(Integer, ForeignKey("remitos.id", ondelete="CASCADE"), nullable=False, index=True)
    orden_trabajo_id = Column(Integer, ForeignKey("ordenes_trabajo.id", ondelete="SET NULL"), nullable=True, index=True)
    descripcion      = Column(String(300))
    cantidad         = Column(Numeric(14, 2))
    unidad           = Column(String(20))
    lote             = Column(String(50), index=True)

    # Relaciones
    remito        = relationship("Remito", back_populates="items")
    orden_trabajo = relationship("OrdenTrabajo")

    def __repr__(self):
        return f"<RemitoItem remito_id={self.remito_id} descripcion={self.descripcion!r}>"

    def to_dict(self) -> dict:
        return {
            "id":               self.id,
            "remito_id":        self.remito_id,
            "orden_trabajo_id": self.orden_trabajo_id,
            "orden_numero":     self.orden_trabajo.numero if self.orden_trabajo else None,
            "descripcion":      self.descripcion,
            "cantidad":         float(self.cantidad) if self.cantidad is not None else None,
            "unidad":           self.unidad,
            "lote":             self.lote,
        }
