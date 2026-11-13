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


# ──────────────────────────────────────────────────────────────────────────────
# Cobranzas — la plata que entra
# ──────────────────────────────────────────────────────────────────────────────
# La mayoría de los clientes paga con CHEQUE, que es plata con fecha, no plata.
# El estado binario de `facturas` (pendiente | cobrada | anulada) no alcanza:
# con un cheque a 60 días, marcar la factura cobrada MIENTE (la plata no está) y
# dejarla pendiente también (el cliente ya pagó).
#
# La cobranza está AGUAS ABAJO del comprobante: es el acto de recibir plata, y le
# da lo mismo si la factura salió de ARCA, de `generar_numero` o si no hay
# comprobante. Por eso es su propio módulo y no una columna más de `facturas`
# —que cuando entre ARCA hay que reescribir entera (numeración y CAE asignados
# por el organismo, e inmutabilidad: una factura con CAE no se edita ni se borra).

# Medios de pago posibles. El DIFERIDO es el que convierte una cobranza en una
# promesa: se deriva de acá para que agregar un medio nuevo al catálogo lo cuente
# como plata de contado y no lo haga desaparecer en silencio de los totales.
MEDIO_DIFERIDO = "cheque"
MEDIOS_COBRANZA = ("efectivo", "transferencia", MEDIO_DIFERIDO)
MEDIOS_CONTADO = tuple(m for m in MEDIOS_COBRANZA if m != MEDIO_DIFERIDO)

# Recorrido de un cheque. Los dos primeros son plata que TODAVÍA NO ESTÁ (está en
# la caja fuerte o en el banco esperando); `acreditado` es el único que convierte
# el papel en plata; `rechazado` no es ni una cosa ni la otra: es un problema.
CHEQUE_ACREDITADO = "acreditado"
CHEQUE_RECHAZADO = "rechazado"
CHEQUE_EN_CARTERA = "en_cartera"
ESTADOS_CHEQUE = (CHEQUE_EN_CARTERA, "depositado", CHEQUE_ACREDITADO, CHEQUE_RECHAZADO)
# Lo que sigue pendiente de acreditarse: alimenta `en_cartera` y el calendario.
ESTADOS_CHEQUE_PENDIENTE = tuple(
    e for e in ESTADOS_CHEQUE if e not in (CHEQUE_ACREDITADO, CHEQUE_RECHAZADO)
)


class Cobranza(Base):
    """Plata recibida de un cliente (COB-0001).

    La regla que define el módulo: una cobranza en efectivo o transferencia es
    plata YA; una cobranza con cheque es plata CUANDO EL CHEQUE SE ACREDITA. Los
    dos números se calculan por separado y no se confunden nunca.
    """
    __tablename__ = "cobranzas"

    id                = Column(Integer, primary_key=True, autoincrement=True)
    numero            = Column(String(20), unique=True, index=True)   # COB-0001
    # NOT NULL: siempre se sabe de quién es la plata. Una cobranza sin cliente
    # sumaría en el total y no se podría explicar de dónde salió.
    cliente_id        = Column(Integer, ForeignKey("clientes.id", ondelete="CASCADE"), nullable=False, index=True)
    # NOT NULL: es el eje temporal de todos los agregados (igual que en facturas).
    fecha             = Column(Date, nullable=False, index=True)
    medio             = Column(String(20), default="efectivo", index=True)   # efectivo | transferencia | cheque
    importe           = Column(Numeric(14, 2), nullable=False)
    observaciones     = Column(Text)

    # ── Sólo cuando medio == 'cheque' ──
    cheque_numero     = Column(String(50))
    cheque_banco      = Column(String(100))
    # La fecha DIFERIDA: es la que arma el calendario de lo que va a entrar, y la
    # que decide en qué mes entró la plata cuando el cheque se acredita.
    cheque_fecha_pago = Column(Date, index=True)
    cheque_estado     = Column(String(20), index=True)   # en_cartera | depositado | acreditado | rechazado

    # ── Vínculos opcionales: se llenan si existen, no son requisito ──
    # SET NULL a propósito: la plata que entró no se va con el comprobante.
    factura_id        = Column(Integer, ForeignKey("facturas.id", ondelete="SET NULL"), nullable=True, index=True)
    orden_trabajo_id  = Column(Integer, ForeignKey("ordenes_trabajo.id", ondelete="SET NULL"), nullable=True, index=True)

    created_by        = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at        = Column(DateTime(timezone=True), server_default=func.now())
    updated_at        = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    cliente       = relationship("Cliente")
    factura       = relationship("Factura")
    orden_trabajo = relationship("OrdenTrabajo")
    creador       = relationship("User", foreign_keys=[created_by])

    def __repr__(self):
        return f"<Cobranza numero={self.numero!r} medio={self.medio!r} importe={self.importe}>"

    @property
    def es_plata_ya(self) -> bool:
        """True si esta cobranza es plata que YA está disponible."""
        if self.medio != MEDIO_DIFERIDO:
            return self.medio in MEDIOS_CONTADO
        return self.cheque_estado == CHEQUE_ACREDITADO

    def to_dict(self) -> dict:
        return {
            "id":                self.id,
            "numero":            self.numero,
            "cliente_id":        self.cliente_id,
            "cliente_nombre":    self.cliente.marca if self.cliente else None,
            "fecha":             self.fecha.isoformat() if self.fecha else None,
            "medio":             self.medio,
            "importe":           float(self.importe) if self.importe is not None else None,
            "observaciones":     self.observaciones,
            "cheque_numero":     self.cheque_numero,
            "cheque_banco":      self.cheque_banco,
            "cheque_fecha_pago": self.cheque_fecha_pago.isoformat() if self.cheque_fecha_pago else None,
            "cheque_estado":     self.cheque_estado,
            "es_plata_ya":       self.es_plata_ya,
            "factura_id":        self.factura_id,
            "factura_numero":    self.factura.numero if self.factura else None,
            "orden_trabajo_id":  self.orden_trabajo_id,
            "orden_numero":      self.orden_trabajo.numero if self.orden_trabajo else None,
            "created_by":        self.created_by,
            "creador_nombre":    self.creador.nombre_completo if self.creador else None,
            "created_at":        self.created_at.isoformat() if self.created_at else None,
            "updated_at":        self.updated_at.isoformat() if self.updated_at else None,
        }
