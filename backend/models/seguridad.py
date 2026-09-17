"""Seguridad y trazabilidad: usuarios, roles, auditoría y notificaciones."""

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

class User(Base):
    """Usuarios del sistema ERP con autenticación JWT."""
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    email           = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    nombre          = Column(String(100), nullable=True)
    apellido        = Column(String(100), nullable=True)
    is_active       = Column(Boolean, default=True)
    role            = Column(String(20), default="user")

    @property
    def nombre_completo(self) -> str:
        partes = [self.nombre, self.apellido]
        return " ".join(p for p in partes if p) or self.email.split("@")[0]

    def __repr__(self):
        return f"<User id={self.id} email={self.email!r} role={self.role!r}>"

    def to_dict(self) -> dict:
        return {
            "id":              self.id,
            "email":           self.email,
            "nombre":          self.nombre,
            "apellido":        self.apellido,
            "nombre_completo": self.nombre_completo,
            "is_active":       self.is_active,
            "role":            self.role,
        }

class Role(Base):
    """Rol RBAC: define qué VISTAS ve y qué ACCIONES puede hacer. Editable por un admin."""
    __tablename__ = "roles"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    clave      = Column(String(30), unique=True, nullable=False, index=True)   # slug: admin, user, operario…
    nombre     = Column(String(80), nullable=False)
    vistas     = Column(JSONB, nullable=False, default=list)                   # ["panel","clientes",…]
    acciones   = Column(JSONB, nullable=False, default=list)                   # ["clientes:crear",…]
    protegido  = Column(Boolean, default=False, nullable=False)                # admin: no se borra ni pierde permisos
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<Role clave={self.clave!r} nombre={self.nombre!r}>"

    def to_dict(self) -> dict:
        return {
            "id":        self.id,
            "clave":     self.clave,
            "nombre":    self.nombre,
            "vistas":    self.vistas or [],
            "acciones":  self.acciones or [],
            "protegido": self.protegido,
        }



class AuditLog(Base):
    """Registro de auditoría de acciones sobre entidades del sistema."""
    __tablename__ = "audit_log"
    __table_args__ = (
        Index("ix_audit_log_entidad_entidad_id", "entidad", "entidad_id"),
    )

    id          = Column(Integer, primary_key=True, autoincrement=True)
    user_id     = Column(Integer, nullable=True, index=True)
    user_email  = Column(String(255))
    accion      = Column(String(20))    # crear | actualizar | eliminar | convertir | despachar...
    entidad     = Column(String(50))    # presupuesto | remito | orden_trabajo | stock_item...
    entidad_id  = Column(Integer)
    descripcion = Column(String(300))
    datos       = Column(JSONB, nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    def __repr__(self):
        return f"<AuditLog id={self.id} accion={self.accion!r} entidad={self.entidad!r}>"

    def to_dict(self) -> dict:
        return {
            "id":          self.id,
            "user_id":     self.user_id,
            "user_email":  self.user_email,
            "accion":      self.accion,
            "entidad":     self.entidad,
            "entidad_id":  self.entidad_id,
            "descripcion": self.descripcion,
            "datos":       self.datos,
            "created_at":  self.created_at.isoformat() if self.created_at else None,
        }



class Notificacion(Base):
    """Notificación interna materializada por usuario destino."""
    __tablename__ = "notificaciones"
    __table_args__ = (
        Index("ix_notificaciones_user_id_leida", "user_id", "leida"),
    )

    id         = Column(Integer, primary_key=True, autoincrement=True)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    tipo       = Column(String(30))     # stock_bajo | orden_estado | presupuesto | remito...
    titulo     = Column(String(200))
    mensaje    = Column(Text)
    link       = Column(String(300))
    leida      = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<Notificacion id={self.id} user_id={self.user_id} tipo={self.tipo!r}>"

    def to_dict(self) -> dict:
        return {
            "id":         self.id,
            "user_id":    self.user_id,
            "tipo":       self.tipo,
            "titulo":     self.titulo,
            "mensaje":    self.mensaje,
            "link":       self.link,
            "leida":      self.leida,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
