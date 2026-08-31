"""
Modelos SQLAlchemy — Etiplast ERP
=================================
Esquema normalizado (3FN):

  rubros            — catálogo de rubros/categorías
  provincias        — catálogo de provincias
  clientes          — identidad comercial del cliente
  cliente_ubicacion — domicilio y ubicación (1:1)
  cliente_contacto  — teléfono y observaciones (1:1)
  cliente_productos — productos/envases (1:N — un cliente puede tener varios)
  users             — usuarios del sistema
"""

from sqlalchemy import (
    Boolean, Column, Date, DateTime, ForeignKey, Index,
    Integer, Numeric, String, Text, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from database import Base


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


# ──────────────────────────────────────────────────────────────────────────────
# Razones Sociales (entidad legal — agrupa múltiples marcas/clientes)
# ──────────────────────────────────────────────────────────────────────────────

class RazonSocial(Base):
    """Entidad legal (empresa): nombre y CUIT. Puede tener múltiples marcas/clientes."""
    __tablename__ = "razones_sociales"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    numero       = Column(Integer, index=True)   # N° de cliente (compartido por todas sus marcas)
    razon_social = Column(String(300), nullable=False, index=True)
    cuit         = Column(String(20))
    created_at   = Column(DateTime(timezone=True), server_default=func.now())
    updated_at   = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    clientes = relationship("Cliente", back_populates="razon_social_obj")

    def __repr__(self):
        return f"<RazonSocial id={self.id} razon_social={self.razon_social!r}>"

    def to_dict(self) -> dict:
        return {
            "id":           self.id,
            "numero":       self.numero,
            "razon_social": self.razon_social,
            "cuit":         self.cuit,
        }


# ──────────────────────────────────────────────────────────────────────────────
# Cliente y sus tablas relacionadas
# ──────────────────────────────────────────────────────────────────────────────

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
            "id_cliente":       rs.numero if rs and rs.numero is not None else self.id_cliente,
            "marca":            self.marca,
            "razon_social_id":  self.razon_social_id,
            "razon_social":     rs.razon_social if rs else self.razon_social,
            "cuit":             rs.cuit         if rs else self.cuit,
            "rubro":            self.rubro_obj.nombre if self.rubro_obj else None,
            "rubro_id":         self.rubro_id,
            # — Ubicación —
            "domicilio":    ub.domicilio    if ub else None,
            "localidad":    ub.localidad    if ub else None,
            "provincia":    ub.provincia_obj.nombre if (ub and ub.provincia_obj) else None,
            "provincia_id": ub.provincia_id if ub else None,
            "pais":         ub.pais         if ub else "Argentina",
            "transporte":           ub.transporte           if ub else None,
            "transporte_domicilio": ub.transporte_domicilio if ub else None,
            "transporte_localidad": ub.transporte_localidad if ub else None,
            "latitud":      float(ub.latitud)  if (ub and ub.latitud)  else None,
            "longitud":     float(ub.longitud) if (ub and ub.longitud) else None,
            # — Contacto —
            "telefono":      ct.telefono      if ct else None,
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


# ──────────────────────────────────────────────────────────────────────────────
# Máquinas (catálogo)
# ──────────────────────────────────────────────────────────────────────────────

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


# ──────────────────────────────────────────────────────────────────────────────
# Usuarios del sistema
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


# ──────────────────────────────────────────────────────────────────────────────
# Órdenes de Trabajo
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
            "cliente_numero":   cliente.id_cliente if cliente else None,
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


# ──────────────────────────────────────────────────────────────────────────────
# Auditoría
# ──────────────────────────────────────────────────────────────────────────────

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


# ──────────────────────────────────────────────────────────────────────────────
# Notificaciones
# ──────────────────────────────────────────────────────────────────────────────

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


# ──────────────────────────────────────────────────────────────────────────────
# Presupuestos
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


# ──────────────────────────────────────────────────────────────────────────────
# Stock
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


# ──────────────────────────────────────────────────────────────────────────────
# Remitos (no fiscales)
# ──────────────────────────────────────────────────────────────────────────────

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

# ──────────────────────────────────────────────────────────────────────────────
# Control de calidad
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
