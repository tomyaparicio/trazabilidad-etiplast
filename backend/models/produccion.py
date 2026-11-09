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
    # Metros de film a extrudar = cantidad × (alto_cm / 100) + 400 de margen.
    # Nullable a propósito: las órdenes viejas se cargaron sin esta cuenta.
    extrusion_metros             = Column(Numeric(12, 2))
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
    impresion_maquina            = Column(String(100))
    operador_impresion           = Column(String(150))

    # — Troquelado —
    troquelado_ancho             = Column(Numeric(10, 2))
    # Diámetro de la tapa del envase (13,4 · 24,9 · 27,6…). Viene de la ficha
    # del producto. Columna propia y no reaprovechar `troquelado_ancho`: son
    # dos medidas distintas y confundirlas se paga en un reporte.
    troquelado_cierre            = Column(Numeric(10, 2))
    troquelado_alto              = Column(Numeric(10, 2))
    troquelado_envase            = Column(String(200))
    troquelado_maquina           = Column(String(100))
    troquelado_observaciones     = Column(Text)
    operador_troquelado          = Column(String(150))

    # — Control de calidad —
    control_calidad              = Column(Text)

    # — Cierre: el 5to paso del recorrido (escaneo de `finalizado`) —
    #
    # TIMESTAMPTZ y no DATE como las `fecha_*` de abajo: el tablero muestra
    # HACE CUÁNTO se cerró, y con el día solo no se puede.
    #
    # Y columna propia y no `updated_at`: esa la corre cualquier edición
    # posterior, así que corregirle una medida a una orden cerrada el mes
    # pasado la mostraba como recién cerrada. Esta la escribe el escaneo del
    # cierre y nada más la vuelve a tocar.
    #
    # Nullable porque las órdenes cerradas ANTES de que existiera la columna no
    # la tienen, y la fecha de su cierre no se puede inventar.
    fecha_cierre                 = Column(DateTime(timezone=True))
    # Quién escaneó el cierre. Sale del token, nunca del request (ver
    # `registrar_etapa` en routers/ordenes.py).
    operador_cierre              = Column(String(150))

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
            # El nombre del producto: el que está en la máquina necesita
            # saber QUÉ está haciendo, y hasta ahora la ficha no lo decía.
            "producto_nombre":  pr.nombre if pr else None,
            # OK / NOOK. Si la muestra está rechazada, mandar a imprimir
            # 20.000 etiquetas es tirar el trabajo: tiene que verse.
            "producto_muestra": pr.muestra if pr else None,
            # Dónde está el envase en el depósito. En producción el 85% de
            # los productos los tiene cargados, y el que va a buscarlo va
            # con la hoja en la mano, no con la computadora.
            "envase_codificado": pr.envase_codificado if pr else None,
            "envase_ubicacion":  pr.ubicacion         if pr else None,
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
            "extrusion_metros":          float(self.extrusion_metros) if self.extrusion_metros is not None else None,
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
            "impresion_maquina":         self.impresion_maquina,
            "operador_impresion":        self.operador_impresion,
            # Troquelado
            "troquelado_ancho":          float(self.troquelado_ancho)  if self.troquelado_ancho  else None,
            "troquelado_cierre":         float(self.troquelado_cierre) if self.troquelado_cierre else None,
            "troquelado_alto":           float(self.troquelado_alto)   if self.troquelado_alto   else None,
            "troquelado_envase":         self.troquelado_envase,
            "troquelado_maquina":        self.troquelado_maquina,
            "troquelado_observaciones":  self.troquelado_observaciones,
            "operador_troquelado":       self.operador_troquelado,
            # Control de calidad
            "control_calidad":           self.control_calidad,
            # Cierre (paso 5): cuándo y quién la dio por terminada
            "fecha_cierre":              self.fecha_cierre.isoformat()     if self.fecha_cierre     else None,
            "operador_cierre":           self.operador_cierre,
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
# Paso por máquina
# ──────────────────────────────────────────────────────────────────────────────

# Las tres etapas de producción, en orden. Cada una se hace en una máquina del
# tipo homónimo del catálogo (`maquinas.tipo`), así que el mapeo es 1 a 1 y no
# hace falta una tabla de equivalencias.
ETAPAS_PRODUCCION = ("extrusion", "impresion", "troquelado")

# Estados de un pase por máquina.
#   planificada → la asignó la oficina, todavía no la escaneó nadie
#   en_curso    → el operario escaneó al entrar: la orden ESTÁ en esa máquina
#   terminada   → la máquina se liberó (la orden avanzó, o entró otra orden)
ESTADOS_PASE = ("planificada", "en_curso", "terminada")

# Las etapas donde IMPORTA en qué máquina se hizo.
#
# Sólo impresión: Venus, ReinaFlex, Taurus y la Autoadhesiva hacen cosas
# distintas, así que el operario elige. En extrusión y troquelado las máquinas
# son intercambiables — alcanza con saber que la etapa pasó.
ETAPAS_CON_MAQUINA = ("impresion",)

# El cierre: el 5to paso del recorrido, el escaneo que da la orden por
# terminada. Se escanea con el MISMO QR —la ficha impresa no cambia, la etapa
# se elige en la pantalla— pero NO es una etapa de producción:
#
#   - no se hace en ninguna máquina,
#   - no tiene `fecha_finalizado` ni `operador_finalizado` en la ficha: va a
#     `fecha_cierre` y `operador_cierre`, que son columnas propias,
#   - y no se le hace control de calidad (`ETAPAS_VALIDAS` en routers/calidad.py).
ETAPA_CIERRE = "finalizado"

# Lo que el escaneo del QR acepta.
#
# Separada de `ETAPAS_PRODUCCION` a propósito, y no es cosmética: esa tupla la
# consumen el control de calidad y el patrón `operador_{etapa}` /
# `fecha_{etapa}` de la ficha, que para el cierre NO tienen columna. Ampliarla
# haría que el cierre pasara por validaciones y por un `setattr` que se irían a
# atributos inexistentes — el dato se perdería sin un solo error.
ETAPAS_ESCANEABLES = (*ETAPAS_PRODUCCION, ETAPA_CIERRE)


class PlanProduccion(Base):
    """
    Un pase de una orden por una máquina.

    Es la única fuente de «dónde está cada pedido»: el operario escanea el QR
    de la ficha antes de arrancar su paso y elige la máquina, y eso deja una
    fila acá. El último pase `en_curso` de una orden es su posición actual; el
    conjunto de pases es su recorrido por la planta.

    `created_at` es TIMESTAMPTZ y se llena solo, así que guarda el momento
    exacto del escaneo sin necesidad de tocar `fecha_inicio` (que es DATE y
    viene de cuando la tabla se pensó para planificar, no para registrar).
    """
    __tablename__ = "plan_produccion"

    id               = Column(Integer, primary_key=True, autoincrement=True)
    orden_trabajo_id = Column(Integer, ForeignKey("ordenes_trabajo.id", ondelete="CASCADE"),
                              nullable=False, index=True)
    # Opcional: sólo impresión elige máquina (ver ETAPAS_CON_MAQUINA). En
    # extrusión y troquelado las máquinas son intercambiables y queda en NULL.
    maquina_id       = Column(Integer, ForeignKey("maquinas.id", ondelete="CASCADE"),
                              nullable=True, index=True)
    etapa            = Column(String(20))
    fecha_inicio     = Column(Date, index=True)
    fecha_fin        = Column(Date)
    orden_prioridad  = Column(Integer, default=0)
    estado           = Column(String(20), default="planificada")
    notas            = Column(Text)
    created_by       = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    created_at       = Column(DateTime(timezone=True), server_default=func.now())
    updated_at       = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return (f"<PlanProduccion ot={self.orden_trabajo_id} "
                f"maquina={self.maquina_id} etapa={self.etapa} estado={self.estado}>")

    def to_dict(self) -> dict:
        return {
            "id":               self.id,
            "orden_trabajo_id": self.orden_trabajo_id,
            "maquina_id":       self.maquina_id,
            "etapa":            self.etapa,
            "estado":           self.estado,
            "fecha_inicio":     self.fecha_inicio.isoformat() if self.fecha_inicio else None,
            "fecha_fin":        self.fecha_fin.isoformat()    if self.fecha_fin    else None,
            "notas":            self.notas,
            "created_by":       self.created_by,
            "created_at":       self.created_at.isoformat()   if self.created_at   else None,
        }
