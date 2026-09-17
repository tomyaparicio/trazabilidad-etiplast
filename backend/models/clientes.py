"""Clientes: la entidad legal, sus marcas y las especificaciones de cada presentación."""

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

class RazonSocial(Base):
    """Entidad legal (empresa): nombre y CUIT. Puede tener múltiples marcas/clientes."""
    __tablename__ = "razones_sociales"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    numero       = Column(Integer, index=True)   # N° de cliente (compartido por todas sus marcas)
    razon_social = Column(String(300), nullable=False, index=True)
    cuit         = Column(String(20))

    # Datos de la EMPRESA, que sus marcas heredan (ver Cliente.dato_efectivo).
    # Están acá y no en cada marca porque son de la entidad legal: en la cartera
    # real, 30 de 35 empresas con varias marcas comparten el mismo domicilio.
    domicilio            = Column(String(300))
    localidad            = Column(String(150))
    provincia_id         = Column(Integer, ForeignKey("provincias.id", ondelete="SET NULL"), nullable=True, index=True)
    pais                 = Column(String(100))
    telefono             = Column(String(100))
    transporte           = Column(String(200))
    transporte_domicilio = Column(String(300))
    transporte_localidad = Column(String(150))
    created_at   = Column(DateTime(timezone=True), server_default=func.now())
    updated_at   = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    clientes = relationship("Cliente", back_populates="razon_social_obj")
    provincia_obj = relationship("Provincia", foreign_keys=[provincia_id])

    @property
    def provincia_nombre(self):
        return self.provincia_obj.nombre if self.provincia_obj else None

    def __repr__(self):
        return f"<RazonSocial id={self.id} razon_social={self.razon_social!r}>"

    def to_dict(self) -> dict:
        return {
            "id":           self.id,
            "numero":       self.numero,
            "razon_social": self.razon_social,
            "domicilio":            self.domicilio,
            "localidad":            self.localidad,
            "provincia_id":         self.provincia_id,
            "provincia":            self.provincia_obj.nombre if self.provincia_obj else None,
            "pais":                 self.pais,
            "telefono":             self.telefono,
            "transporte":           self.transporte,
            "transporte_domicilio": self.transporte_domicilio,
            "transporte_localidad": self.transporte_localidad,
            "cuit":         self.cuit,
        }



class Cliente(Base):
    """
    Identidad comercial del cliente.
    Sólo contiene datos que identifican al cliente como entidad de negocio.
    El resto (ubicación, contacto, productos) está en tablas separadas.
    """
    __tablename__ = "clientes"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    id_cliente = Column(Integer, index=True)   # no único: varias marcas pueden compartir el mismo número
    marca      = Column(String(200), index=True)
    razon_social = Column(String(300))   # legacy — se mantiene por compat; fuente de verdad: razon_social_obj
    cuit         = Column(String(20))    # legacy — idem
    razon_social_id = Column(Integer, ForeignKey("razones_sociales.id", ondelete="SET NULL"), nullable=True, index=True)
    rubro_id   = Column(Integer, ForeignKey("rubros.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    rubro_obj        = relationship("Rubro", back_populates="clientes")
    razon_social_obj = relationship("RazonSocial", back_populates="clientes")
    ubicacion = relationship(
        "ClienteUbicacion", back_populates="cliente",
        uselist=False, cascade="all, delete-orphan",
    )
    contacto = relationship(
        "ClienteContacto", back_populates="cliente",
        uselist=False, cascade="all, delete-orphan",
    )
    productos = relationship(
        "ClienteProducto", back_populates="cliente",
        cascade="all, delete-orphan",
        order_by="ClienteProducto.id",
    )
    ordenes = relationship(
        "OrdenTrabajo", back_populates="cliente",
        cascade="all, delete-orphan",
        order_by="OrdenTrabajo.id",
    )

    def __repr__(self):
        return f"<Cliente id={self.id} marca={self.marca!r}>"

    @property
    def numero_visible(self):
        """El N° de cliente que ve y tipea el usuario.

        Etiplast numera por ENTIDAD LEGAL: todas las marcas de una razón social
        comparten su número (Jubahi, Winsey y Cooperativa son 226 = Bahia Jugos).
        Sin razón social detrás, el número propio de la marca es el que se ve.
        Fuente única de esta regla — la usan la ficha, el listado, la búsqueda,
        el detalle de razón social, las órdenes y el export.
        """
        rs = self.razon_social_obj
        return rs.numero if rs and rs.numero is not None else self.id_cliente

    def dato_efectivo(self, propio, campo_rs: str):
        """El dato propio de la marca; si no tiene, el de su empresa.

        PENDIENTE DE DEFINIR: la empresa informó que maneja DOS direcciones —la
        fiscal de la razón social y la de entrega— y hoy ambas comparten el
        mismo campo. Hasta separarlas, no se pisa el dato de la marca.
        """
        if propio not in (None, ""):
            return propio
        rs = self.razon_social_obj
        return getattr(rs, campo_rs, None) if rs else None

    def to_dict(self) -> dict:
        """
        Devuelve estructura plana para compatibilidad con la API.
        Incluye datos de todas las tablas relacionadas.
        """
        ub = self.ubicacion
        ct = self.contacto
        pr = self.productos[0] if self.productos else None
        rs = self.razon_social_obj

        return {
            # — Identidad —
            "id":               self.id,
            "id_cliente":       self.numero_visible,
            "marca":            self.marca,
            "razon_social_id":  self.razon_social_id,
            "razon_social":     rs.razon_social if rs else self.razon_social,
            "cuit":             rs.cuit         if rs else self.cuit,
            "rubro":            self.rubro_obj.nombre if self.rubro_obj else None,
            "rubro_id":         self.rubro_id,
            # — Ubicación — lo propio de la marca, con la empresa como respaldo.
            "domicilio":    self.dato_efectivo(ub.domicilio if ub else None, "domicilio"),
            "localidad":    self.dato_efectivo(ub.localidad if ub else None, "localidad"),
            "provincia":    self.dato_efectivo(
                ub.provincia_obj.nombre if (ub and ub.provincia_obj) else None, "provincia_nombre"),
            "provincia_id": self.dato_efectivo(ub.provincia_id if ub else None, "provincia_id"),
            "pais":         self.dato_efectivo(ub.pais if ub else None, "pais") or "Argentina",
            "transporte":           self.dato_efectivo(ub.transporte if ub else None, "transporte"),
            "transporte_domicilio": self.dato_efectivo(ub.transporte_domicilio if ub else None, "transporte_domicilio"),
            "transporte_localidad": self.dato_efectivo(ub.transporte_localidad if ub else None, "transporte_localidad"),
            "latitud":      float(ub.latitud)  if (ub and ub.latitud)  else None,
            "longitud":     float(ub.longitud) if (ub and ub.longitud) else None,
            # — Contacto —
            "telefono":      self.dato_efectivo(ct.telefono if ct else None, "telefono"),
            "observaciones": ct.observaciones if ct else None,
            # — Producto principal —
            "producto":          pr.nombre            if pr else None,
            "envase":            pr.envase            if pr else None,
            "volumen_cantidad":  float(pr.volumen_cantidad) if (pr and pr.volumen_cantidad) else None,
            "volumen_unidad":    pr.volumen_unidad    if pr else None,
            "lamina":            pr.lamina            if pr else None,
            "muestra":           pr.muestra           if pr else None,
            "alto":              float(pr.alto)       if (pr and pr.alto)    else None,
            "cilindro":          float(pr.cilindro)   if (pr and pr.cilindro) else None,
            "cierre":            float(pr.cierre)     if (pr and pr.cierre)   else None,
            # — Todos los productos (1:N) —
            "productos":         [p.to_dict() for p in self.productos],
        }

class ClienteUbicacion(Base):
    """
    Datos de ubicación geográfica del cliente.
    Relación 1:1 con Cliente.
    """
    __tablename__ = "cliente_ubicaciones"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    cliente_id = Column(
        Integer,
        ForeignKey("clientes.id", ondelete="CASCADE"),
        unique=True, nullable=False, index=True,
    )
    domicilio   = Column(String(300))
    localidad   = Column(String(150))
    provincia_id = Column(Integer, ForeignKey("provincias.id", ondelete="SET NULL"), nullable=True, index=True)
    pais        = Column(String(100), default="Argentina")
    transporte            = Column(String(200))
    transporte_domicilio  = Column(String(300))
    transporte_localidad  = Column(String(150))
    latitud     = Column(Numeric(10, 6))
    longitud    = Column(Numeric(10, 6))

    # Relaciones
    cliente      = relationship("Cliente", back_populates="ubicacion")
    provincia_obj = relationship("Provincia", back_populates="ubicaciones")

    def __repr__(self):
        return f"<ClienteUbicacion cliente_id={self.cliente_id} localidad={self.localidad!r}>"

class ClienteContacto(Base):
    """
    Datos de contacto del cliente.
    Relación 1:1 con Cliente (puede extenderse a 1:N en el futuro).
    """
    __tablename__ = "cliente_contactos"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    cliente_id = Column(
        Integer,
        ForeignKey("clientes.id", ondelete="CASCADE"),
        unique=True, nullable=False, index=True,
    )
    telefono      = Column(String(100))
    observaciones = Column(Text)

    # Relaciones
    cliente = relationship("Cliente", back_populates="contacto")

    def __repr__(self):
        return f"<ClienteContacto cliente_id={self.cliente_id}>"

class ClienteProducto(Base):
    """
    Productos / especificaciones de envase por cliente.
    Relación 1:N con Cliente — un cliente puede tener múltiples productos.
    """
    __tablename__ = "cliente_productos"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    cliente_id = Column(
        Integer,
        ForeignKey("clientes.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    nombre                = Column(String(200))
    envase                = Column(String(200))
    envase_codificado     = Column(String(100))
    ubicacion             = Column(String(100))   # ubicación física del envase (ej: "A-3")
    volumen_cantidad      = Column(Numeric(12, 4))
    volumen_unidad        = Column(String(50))
    lamina                = Column(String(200))
    muestra               = Column(String(200))
    alto                  = Column(Numeric(10, 2))
    cilindro              = Column(Numeric(10, 2))
    cierre                = Column(Numeric(10, 2))
    maquina_impresora_id  = Column(Integer, ForeignKey("maquinas.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at            = Column(DateTime(timezone=True), server_default=func.now())
    updated_at            = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    cliente            = relationship("Cliente", back_populates="productos")
    maquina_impresora  = relationship("Maquina", foreign_keys=[maquina_impresora_id])

    def __repr__(self):
        return f"<ClienteProducto cliente_id={self.cliente_id} nombre={self.nombre!r}>"

    def to_dict(self) -> dict:
        return {
            "id":                    self.id,
            "cliente_id":            self.cliente_id,
            "nombre":                self.nombre,
            "envase":                self.envase,
            "envase_codificado":     self.envase_codificado,
            "ubicacion":             self.ubicacion,
            "volumen_cantidad":      float(self.volumen_cantidad) if self.volumen_cantidad else None,
            "volumen_unidad":        self.volumen_unidad,
            "lamina":                self.lamina,
            "muestra":               self.muestra,
            "alto":                  float(self.alto)     if self.alto     else None,
            "cilindro":              float(self.cilindro) if self.cilindro else None,
            "cierre":                float(self.cierre)   if self.cierre   else None,
            "maquina_impresora_id":  self.maquina_impresora_id,
            "maquina_impresora_nombre": self.maquina_impresora.nombre if self.maquina_impresora else None,
        }
