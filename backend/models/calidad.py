"""Control de calidad: plantillas configurables y registros por orden."""

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

class QcPlantilla(Base):
    """Plantilla de checklist de control de calidad por etapa."""
    __tablename__ = "qc_plantillas"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    etapa      = Column(String(20), index=True)   # extrusion | impresion | troquelado
    nombre     = Column(String(200))
    activa     = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    items = relationship(
        "QcPlantillaItem", back_populates="plantilla",
        cascade="all, delete-orphan",
        order_by="QcPlantillaItem.orden",
    )

    def __repr__(self):
        return f"<QcPlantilla etapa={self.etapa!r} nombre={self.nombre!r}>"

    def to_dict(self) -> dict:
        return {
            "id":         self.id,
            "etapa":      self.etapa,
            "nombre":     self.nombre,
            "activa":     self.activa,
            "items":      [i.to_dict() for i in self.items],
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

class QcPlantillaItem(Base):
    """Ítem de checklist dentro de una plantilla QC."""
    __tablename__ = "qc_plantilla_items"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    plantilla_id = Column(Integer, ForeignKey("qc_plantillas.id", ondelete="CASCADE"), nullable=False, index=True)
    descripcion  = Column(String(300))
    orden        = Column(Integer)

    # Relaciones
    plantilla = relationship("QcPlantilla", back_populates="items")

    def __repr__(self):
        return f"<QcPlantillaItem plantilla_id={self.plantilla_id} descripcion={self.descripcion!r}>"

    def to_dict(self) -> dict:
        return {
            "id":           self.id,
            "plantilla_id": self.plantilla_id,
            "descripcion":  self.descripcion,
            "orden":        self.orden,
        }

class QcRegistro(Base):
    """Registro de control de calidad realizado sobre una orden de trabajo."""
    __tablename__ = "qc_registros"

    id               = Column(Integer, primary_key=True, autoincrement=True)
    orden_trabajo_id = Column(Integer, ForeignKey("ordenes_trabajo.id", ondelete="CASCADE"), nullable=False, index=True)
    etapa            = Column(String(20))    # extrusion | impresion | troquelado
    plantilla_id     = Column(Integer, ForeignKey("qc_plantillas.id", ondelete="SET NULL"), nullable=True)
    user_id          = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resultado        = Column(String(20))    # aprobado | rechazado | observado
    observaciones    = Column(Text)
    created_at       = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    usuario = relationship("User", foreign_keys=[user_id])
    items   = relationship(
        "QcRegistroItem", back_populates="registro",
        cascade="all, delete-orphan",
        order_by="QcRegistroItem.id",
    )

    def __repr__(self):
        return f"<QcRegistro orden_trabajo_id={self.orden_trabajo_id} etapa={self.etapa!r} resultado={self.resultado!r}>"

    def to_dict(self) -> dict:
        return {
            "id":               self.id,
            "orden_trabajo_id": self.orden_trabajo_id,
            "etapa":            self.etapa,
            "plantilla_id":     self.plantilla_id,
            "user_id":          self.user_id,
            "usuario_nombre":   self.usuario.nombre_completo if self.usuario else None,
            "resultado":        self.resultado,
            "observaciones":    self.observaciones,
            "items":            [i.to_dict() for i in self.items],
            "created_at":       self.created_at.isoformat() if self.created_at else None,
        }

class QcRegistroItem(Base):
    """Resultado de un ítem de checklist dentro de un registro QC."""
    __tablename__ = "qc_registro_items"

    id               = Column(Integer, primary_key=True, autoincrement=True)
    registro_id      = Column(Integer, ForeignKey("qc_registros.id", ondelete="CASCADE"), nullable=False, index=True)
    item_descripcion = Column(String(300))
    cumple           = Column(Boolean)
    valor            = Column(String(100))
    observacion      = Column(String(300))

    # Relaciones
    registro = relationship("QcRegistro", back_populates="items")

    def __repr__(self):
        return f"<QcRegistroItem registro_id={self.registro_id} cumple={self.cumple}>"

    def to_dict(self) -> dict:
        return {
            "id":               self.id,
            "registro_id":      self.registro_id,
            "item_descripcion": self.item_descripcion,
            "cumple":           self.cumple,
            "valor":            self.valor,
            "observacion":      self.observacion,
        }
