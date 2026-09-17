"""Producción: órdenes de trabajo y lo que se consume en cada una."""

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

class OrdenTrabajo(Base):
    """
    Orden de trabajo que vincula cliente, producto y especificaciones de producción.
    Secciones: Extrusión, Impresión, Troquelado.
    """
    __tablename__ = "ordenes_trabajo"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    numero     = Column(String(20), unique=True, nullable=False, index=True)   # OT-0001
    cliente_id = Column(Integer, ForeignKey("clientes.id", ondelete="CASCADE"), nullable=False, index=True)
    cliente_producto_id = Column(Integer, ForeignKey("cliente_productos.id", ondelete="SET NULL"), nullable=True)
    fecha      = Column(Date, nullable=True)
    estado     = Column(String(20), default="borrador", nullable=False, index=True)
    # estados: borrador | pendiente | en_proceso | completada | cancelada
    created_by     = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    responsable_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    operador       = Column(String(150))
    lote           = Column(String(50), index=True)   # L-YYYYMMDD-OTNNNN (trazabilidad)

    # — Extrusión —
    extrusion_ancho              = Column(Numeric(10, 2))
    extrusion_color              = Column(String(100))
    extrusion_trat               = Column(String(100))
    extrusion_espesor            = Column(Numeric(10, 3))
    extrusion_cant_bob           = Column(Integer)
    extrusion_formulacion        = Column(String(300))
    extrusion_maquina            = Column(String(100))
    extrusion_observaciones      = Column(Text)
    operador_extrusion           = Column(String(150))

    # — Impresión —
    impresion_frente             = Column(Text)
    impresion_retroverso         = Column(Text)
    impresion_observaciones      = Column(Text)
    impresion_cilindro           = Column(Numeric(10, 2))
    impresion_colores            = Column(Text)
    operador_impresion           = Column(String(150))

    # — Troquelado —
    troquelado_ancho             = Column(Numeric(10, 2))
    troquelado_alto              = Column(Numeric(10, 2))
    troquelado_envase            = Column(String(200))
    troquelado_maquina           = Column(String(100))
    troquelado_observaciones     = Column(Text)
    operador_troquelado          = Column(String(150))

    # — Control de calidad —
    control_calidad              = Column(Text)

    # — Fechas por etapa —
    fecha_diseno                 = Column(Date)
    fecha_preprensa              = Column(Date)
    fecha_extrusion              = Column(Date)
    fecha_impresion              = Column(Date)
    fecha_troquelado             = Column(Date)
    fecha_entrega                = Column(Date)

    # — Totales —
    cantidad                     = Column(Integer)
    total_final                  = Column(Numeric(14, 2))
    observaciones                = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    cliente          = relationship("Cliente", back_populates="ordenes")
    cliente_producto = relationship("ClienteProducto")
    bobinas          = relationship(
        "OrdenExtrusionBobina", back_populates="orden",
        cascade="all, delete-orphan",
        order_by="OrdenExtrusionBobina.id",
    )
    creador      = relationship("User", foreign_keys=[created_by])
    responsable  = relationship("User", foreign_keys=[responsable_id])

    def __repr__(self):
        return f"<OrdenTrabajo numero={self.numero!r} estado={self.estado!r}>"

    def to_dict(self) -> dict:
        import json
        cliente = self.cliente
        pr      = self.cliente_producto

        colores = []
        if self.impresion_colores:
            try:
                colores = json.loads(self.impresion_colores)
            except (ValueError, TypeError):
                colores = []

        return {
            "id":               self.id,
            "numero":           self.numero,
            "cliente_id":       self.cliente_id,
            "cliente_nombre":   cliente.marca     if cliente else None,
            "cliente_numero":   cliente.numero_visible if cliente else None,
            "cliente_producto_id": self.cliente_producto_id,
            "fecha":            self.fecha.isoformat() if self.fecha else None,
            "estado":           self.estado,
            "created_by":          self.created_by,
            "creador_nombre":      self.creador.nombre_completo if self.creador else None,
            "responsable_id":      self.responsable_id,
            "responsable_nombre":  self.responsable.nombre_completo if self.responsable else None,
            "operador":            self.operador,
            "lote":                self.lote,
            # Extrusión
            "extrusion_ancho":           float(self.extrusion_ancho)   if self.extrusion_ancho   else None,
            "extrusion_color":           self.extrusion_color,
            "extrusion_trat":            self.extrusion_trat,
            "extrusion_espesor":         float(self.extrusion_espesor) if self.extrusion_espesor else None,
            "extrusion_cant_bob":        self.extrusion_cant_bob,
            "extrusion_formulacion":     self.extrusion_formulacion,
            "extrusion_maquina":         self.extrusion_maquina,
            "extrusion_observaciones":   self.extrusion_observaciones,
            "operador_extrusion":        self.operador_extrusion,
            "bobinas": [b.to_dict() for b in self.bobinas],
            # Impresión
            "impresion_frente":          self.impresion_frente,
            "impresion_retroverso":      self.impresion_retroverso,
            "impresion_observaciones":   self.impresion_observaciones,
            "impresion_cilindro":        float(self.impresion_cilindro) if self.impresion_cilindro else None,
            "impresion_colores":         colores,
            "operador_impresion":        self.operador_impresion,
            # Troquelado
            "troquelado_ancho":          float(self.troquelado_ancho)  if self.troquelado_ancho  else None,
            "troquelado_alto":           float(self.troquelado_alto)   if self.troquelado_alto   else None,
            "troquelado_envase":         self.troquelado_envase,
            "troquelado_maquina":        self.troquelado_maquina,
            "troquelado_observaciones":  self.troquelado_observaciones,
            "operador_troquelado":       self.operador_troquelado,
            # Control de calidad
            "control_calidad":           self.control_calidad,
            # Fechas por etapa
            "fecha_diseno":              self.fecha_diseno.isoformat()     if self.fecha_diseno     else None,
            "fecha_preprensa":           self.fecha_preprensa.isoformat()  if self.fecha_preprensa  else None,
            "fecha_extrusion":           self.fecha_extrusion.isoformat()  if self.fecha_extrusion  else None,
            "fecha_impresion":           self.fecha_impresion.isoformat()  if self.fecha_impresion  else None,
            "fecha_troquelado":          self.fecha_troquelado.isoformat() if self.fecha_troquelado else None,
            "fecha_entrega":             self.fecha_entrega.isoformat()    if self.fecha_entrega    else None,
            # Totales
            "cantidad":                  self.cantidad,
            "total_final":               float(self.total_final)           if self.total_final       else None,
            "observaciones":             self.observaciones,
            "created_at":                self.created_at.isoformat()       if self.created_at        else None,
            "updated_at":                self.updated_at.isoformat()       if self.updated_at        else None,
        }

class OrdenExtrusionBobina(Base):
    """
    Filas de la tabla MTS / KG/BOB dentro de la sección Extrusión de la OT.
    Relación N:1 con OrdenTrabajo.
    """
    __tablename__ = "orden_extrusion_bobinas"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    orden_id    = Column(Integer, ForeignKey("ordenes_trabajo.id", ondelete="CASCADE"), nullable=False, index=True)
    metros      = Column(Numeric(10, 2))
    kg_bob      = Column(Numeric(10, 3))
    numero_lote = Column(String(50))

    # Relaciones
    orden = relationship("OrdenTrabajo", back_populates="bobinas")

    def __repr__(self):
        return f"<OrdenExtrusionBobina orden_id={self.orden_id} metros={self.metros}>"

    def to_dict(self) -> dict:
        return {
            "id":          self.id,
            "orden_id":    self.orden_id,
            "metros":      float(self.metros)  if self.metros  else None,
            "kg_bob":      float(self.kg_bob)  if self.kg_bob  else None,
            "numero_lote": self.numero_lote,
        }
