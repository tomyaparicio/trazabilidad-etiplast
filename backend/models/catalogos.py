"""Catálogos: tablas de referencia que otras entidades apuntan por id."""

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

class Rubro(Base):
    """Catálogo de rubros/categorías de la industria."""
    __tablename__ = "rubros"

    id     = Column(Integer, primary_key=True, autoincrement=True)
    nombre = Column(String(100), unique=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    clientes = relationship("Cliente", back_populates="rubro_obj")

    def __repr__(self):
        return f"<Rubro id={self.id} nombre={self.nombre!r}>"

class Envase(Base):
    """Catálogo de tipos de envase."""
    __tablename__ = "envases"

    id     = Column(Integer, primary_key=True, autoincrement=True)
    nombre = Column(String(200), unique=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<Envase id={self.id} nombre={self.nombre!r}>"

class Provincia(Base):
    """Catálogo de provincias (Argentina + internacional)."""
    __tablename__ = "provincias"

    id     = Column(Integer, primary_key=True, autoincrement=True)
    nombre = Column(String(100), unique=True, nullable=False, index=True)

    # Relaciones
    ubicaciones = relationship("ClienteUbicacion", back_populates="provincia_obj")

    def __repr__(self):
        return f"<Provincia id={self.id} nombre={self.nombre!r}>"



class Maquina(Base):
    """Catálogo de máquinas de producción (extrusión, troquelado, impresión)."""
    __tablename__ = "maquinas"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    codigo     = Column(String(50), unique=True, nullable=False, index=True)
    nombre     = Column(String(200), nullable=False)
    tipo       = Column(String(50))   # 'extrusion' | 'troquelado' | 'impresion'
    activa     = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def to_dict(self) -> dict:
        return {
            "id":     self.id,
            "codigo": self.codigo,
            "nombre": self.nombre,
            "tipo":   self.tipo,
            "activa": self.activa,
        }
