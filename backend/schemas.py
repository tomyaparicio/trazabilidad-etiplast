"""
Schemas Pydantic v2 — Etiplast ERP
===================================
Validación de entrada para los módulos de la expansión (presupuestos, stock,
remitos, calidad) + schemas de referencia para clientes/órdenes.

Convenciones:
  - `extra="ignore"`: claves desconocidas se descartan en silencio.
  - Schemas *Update*: todos los campos opcionales (PATCH-style sobre PUT).
  - Los routers siguen devolviendo los `to_dict()` de los modelos (no se
    cambian shapes de respuesta).
"""
from datetime import date
from decimal import Decimal
from typing import Annotated, Any, List, Optional

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field


class _Schema(BaseModel):
    """Base común: ignora claves extra."""
    model_config = ConfigDict(extra="ignore")


# ──────────────────────────────────────────────────────────────────────────────
# Tipos permisivos para retrofit de clientes/órdenes.
# El frontend manda números como number|null, pero otros clientes (voz, IA,
# scripts) pueden mandar "" para un campo vacío. `_blank_to_none` normaliza ""
# a None ANTES de la validación, preservando el comportamiento defensivo que los
# routers ya tenían con `_to_float`/`_to_int` (que toleraban strings vacíos).
# ──────────────────────────────────────────────────────────────────────────────

def _blank_to_none(v: Any) -> Any:
    if isinstance(v, str) and v.strip() == "":
        return None
    return v


# Numérico laxo: acepta int/float/str-numérico, "" → None. Los routers siguen
# aplicando _to_float/_to_int, así que un int en un campo "float" no cambia nada.
OptNum = Annotated[Optional[float], BeforeValidator(_blank_to_none)]
# Id opcional: acepta int/str-numérico, "" → None.
OptId = Annotated[Optional[int], BeforeValidator(_blank_to_none)]


# ──────────────────────────────────────────────────────────────────────────────
# Presupuestos
# ──────────────────────────────────────────────────────────────────────────────

class PresupuestoItemSchema(_Schema):
    cliente_producto_id: Optional[int] = None
    descripcion:         Optional[str] = Field(None, max_length=300)
    cantidad:            Optional[Decimal] = None
    unidad:              Optional[str] = Field(None, max_length=20)
    precio_unitario:     Optional[Decimal] = None
    subtotal:            Optional[Decimal] = None


class PresupuestoCreateSchema(_Schema):
    cliente_id:           Optional[int] = None
    prospecto_nombre:     Optional[str] = Field(None, max_length=200)
    fecha:                Optional[date] = None
    validez_dias:         int = 30
    estado:               str = "borrador"
    moneda:               str = Field("ARS", max_length=10)
    condiciones_pago:     Optional[str] = Field(None, max_length=200)
    descuento_porcentaje: Decimal = Decimal("0")
    iva_porcentaje:       Decimal = Decimal("21")
    observaciones:        Optional[str] = None
    items:                List[PresupuestoItemSchema] = []


class PresupuestoUpdateSchema(_Schema):
    cliente_id:           Optional[int] = None
    prospecto_nombre:     Optional[str] = Field(None, max_length=200)
    fecha:                Optional[date] = None
    validez_dias:         Optional[int] = None
    estado:               Optional[str] = None
    moneda:               Optional[str] = Field(None, max_length=10)
    condiciones_pago:     Optional[str] = Field(None, max_length=200)
    descuento_porcentaje: Optional[Decimal] = None
    iva_porcentaje:       Optional[Decimal] = None
    observaciones:        Optional[str] = None
    items:                Optional[List[PresupuestoItemSchema]] = None


# ──────────────────────────────────────────────────────────────────────────────
# Facturas
# ──────────────────────────────────────────────────────────────────────────────

class FacturaCreateSchema(_Schema):
    numero:            Optional[str] = Field(None, max_length=30)   # vacío = correlativo FC-NNNN
    tipo:              str = Field("B", max_length=5)               # A | B | C | X
    cliente_id:        OptId = None
    orden_trabajo_id:  OptId = None
    fecha:             Optional[date] = None                        # vacío = hoy
    fecha_vencimiento: Optional[date] = None
    estado:            str = "pendiente"                            # pendiente | cobrada | anulada
    fecha_cobro:       Optional[date] = None
    subtotal:          Decimal = Field(Decimal("0"), ge=0)      # sin importes negativos
    iva_porcentaje:    Decimal = Field(Decimal("21"), ge=0, le=100)
    observaciones:     Optional[str] = None
    # `total` NO se acepta del cliente: se calcula server-side (subtotal + IVA).


class FacturaUpdateSchema(_Schema):
    numero:            Optional[str] = Field(None, max_length=30)
    tipo:              Optional[str] = Field(None, max_length=5)
    cliente_id:        OptId = None
    orden_trabajo_id:  OptId = None
    fecha:             Optional[date] = None
    fecha_vencimiento: Optional[date] = None
    estado:            Optional[str] = None
    fecha_cobro:       Optional[date] = None
    subtotal:          Optional[Decimal] = Field(None, ge=0)
    iva_porcentaje:    Optional[Decimal] = Field(None, ge=0, le=100)
    observaciones:     Optional[str] = None


# ──────────────────────────────────────────────────────────────────────────────
# Stock
# ──────────────────────────────────────────────────────────────────────────────

class StockItemCreateSchema(_Schema):
    codigo:              Optional[str] = Field(None, max_length=50)
    nombre:              str = Field(..., max_length=200)
    tipo:                str = Field(..., max_length=30)   # materia_prima | producto_terminado | insumo
    categoria:           Optional[str] = Field(None, max_length=100)
    unidad:              str = Field("kg", max_length=20)
    stock_actual:        Decimal = Decimal("0")
    stock_minimo:        Decimal = Decimal("0")
    cliente_id:          Optional[int] = None
    cliente_producto_id: Optional[int] = None
    activo:              bool = True


class StockItemUpdateSchema(_Schema):
    codigo:              Optional[str] = Field(None, max_length=50)
    nombre:              Optional[str] = Field(None, max_length=200)
    tipo:                Optional[str] = Field(None, max_length=30)
    categoria:           Optional[str] = Field(None, max_length=100)
    unidad:              Optional[str] = Field(None, max_length=20)
    stock_minimo:        Optional[Decimal] = None
    cliente_id:          Optional[int] = None
    cliente_producto_id: Optional[int] = None
    activo:              Optional[bool] = None


class StockMovimientoCreateSchema(_Schema):
    stock_item_id:    int
    tipo:             str = Field(..., max_length=20)   # ingreso | egreso | ajuste
    cantidad:         Decimal
    motivo:           Optional[str] = Field(None, max_length=50)
    orden_trabajo_id: Optional[int] = None
    remito_id:        Optional[int] = None
    lote:             Optional[str] = Field(None, max_length=50)
    observaciones:    Optional[str] = None


# ──────────────────────────────────────────────────────────────────────────────
# Remitos
# ──────────────────────────────────────────────────────────────────────────────

class RemitoItemSchema(_Schema):
    orden_trabajo_id: Optional[int] = None
    descripcion:      Optional[str] = Field(None, max_length=300)
    cantidad:         Optional[Decimal] = None
    unidad:           Optional[str] = Field(None, max_length=20)
    lote:             Optional[str] = Field(None, max_length=50)


class RemitoCreateSchema(_Schema):
    cliente_id:        int
    fecha:             Optional[date] = None
    estado:            str = "pendiente"
    transporte:        Optional[str] = Field(None, max_length=200)
    domicilio_entrega: Optional[str] = Field(None, max_length=300)
    observaciones:     Optional[str] = None
    items:             List[RemitoItemSchema] = []


class RemitoUpdateSchema(_Schema):
    cliente_id:        Optional[int] = None
    fecha:             Optional[date] = None
    estado:            Optional[str] = None
    transporte:        Optional[str] = Field(None, max_length=200)
    domicilio_entrega: Optional[str] = Field(None, max_length=300)
    observaciones:     Optional[str] = None
    items:             Optional[List[RemitoItemSchema]] = None


# ──────────────────────────────────────────────────────────────────────────────
# Control de calidad
# ──────────────────────────────────────────────────────────────────────────────

class QcPlantillaItemSchema(_Schema):
    descripcion: str = Field(..., max_length=300)
    orden:       Optional[int] = None


class QcPlantillaCreateSchema(_Schema):
    etapa:  str = Field(..., max_length=20)   # extrusion | impresion | troquelado
    nombre: str = Field(..., max_length=200)
    activa: bool = True
    items:  List[QcPlantillaItemSchema] = []


class QcPlantillaUpdateSchema(_Schema):
    etapa:  Optional[str] = Field(None, max_length=20)
    nombre: Optional[str] = Field(None, max_length=200)
    activa: Optional[bool] = None
    items:  Optional[List[QcPlantillaItemSchema]] = None


class QcRegistroItemSchema(_Schema):
    item_descripcion: Optional[str] = Field(None, max_length=300)
    cumple:           Optional[bool] = None
    valor:            Optional[str] = Field(None, max_length=100)
    observacion:      Optional[str] = Field(None, max_length=300)


class QcRegistroCreateSchema(_Schema):
    orden_trabajo_id: int
    etapa:            str = Field(..., max_length=20)
    plantilla_id:     Optional[int] = None
    resultado:        str = Field(..., max_length=20)   # aprobado | rechazado | observado
    observaciones:    Optional[str] = None
    items:            List[QcRegistroItemSchema] = []


class QcRegistroUpdateSchema(_Schema):
    etapa:         Optional[str] = Field(None, max_length=20)
    plantilla_id:  Optional[int] = None
    resultado:     Optional[str] = Field(None, max_length=20)
    observaciones: Optional[str] = None
    items:         Optional[List[QcRegistroItemSchema]] = None


# ──────────────────────────────────────────────────────────────────────────────
# Clientes (retrofit de validación)
# Todos los campos son opcionales para no romper payloads existentes. Las fechas
# no aplican a clientes. Los routers siguen devolviendo `to_dict()` y siguen
# usando `_to_float`/`_to_int` sobre estos valores, por lo que el shape y el
# comportamiento defensivo se mantienen intactos.
# ──────────────────────────────────────────────────────────────────────────────

class ClienteUpdateSchema(_Schema):
    # — Identidad —
    marca:           Optional[str] = Field(None, max_length=200)
    id_cliente:      OptId = None
    razon_social:    Optional[str] = Field(None, max_length=300)
    cuit:            Optional[str] = Field(None, max_length=20)
    razon_social_id: OptId = None
    rubro:           Optional[str] = Field(None, max_length=100)   # texto; el router hace get_or_create
    # — Ubicación —
    provincia:            Optional[str] = Field(None, max_length=100)  # texto; get_or_create
    domicilio:            Optional[str] = Field(None, max_length=300)
    localidad:            Optional[str] = Field(None, max_length=150)
    pais:                 Optional[str] = Field(None, max_length=100)
    transporte:           Optional[str] = Field(None, max_length=200)
    transporte_domicilio: Optional[str] = Field(None, max_length=300)
    transporte_localidad: Optional[str] = Field(None, max_length=150)
    latitud:              OptNum = None
    longitud:             OptNum = None
    # — Contacto —
    telefono:      Optional[str] = Field(None, max_length=100)
    observaciones: Optional[str] = None
    # — Producto principal —
    producto:          Optional[str] = Field(None, max_length=200)
    envase:            Optional[str] = Field(None, max_length=200)
    envase_codificado: Optional[str] = Field(None, max_length=100)
    ubicacion:         Optional[str] = Field(None, max_length=100)   # ubicación física del envase (ej: "A-3")
    volumen_cantidad:  OptNum = None
    volumen_unidad:    Optional[str] = Field(None, max_length=50)
    lamina:            Optional[str] = Field(None, max_length=200)
    muestra:           Optional[str] = Field(None, max_length=200)
    alto:              OptNum = None
    cilindro:          OptNum = None
    cierre:            OptNum = None


class ClienteCreateSchema(ClienteUpdateSchema):
    """Alta de cliente: mismos campos, todos opcionales (marca puede faltar como hoy)."""
    pass


# ──────────────────────────────────────────────────────────────────────────────
# Órdenes de trabajo (retrofit de validación)
# Fechas como str: el router las parsea con `_parse_date` (tolera "" e inválidas).
# La validez de `estado` se chequea en el router contra ESTADOS_ORDEN.
# ──────────────────────────────────────────────────────────────────────────────

class OrdenBobinaSchema(_Schema):
    metros:      OptNum = None
    kg_bob:      OptNum = None
    numero_lote: Optional[str] = Field(None, max_length=50)


class OrdenUpdateSchema(_Schema):
    cliente_id:          OptId = None
    cliente_producto_id: OptId = None
    fecha:               Optional[str] = None
    estado:              Optional[str] = Field(None, max_length=20)
    responsable_id:      OptId = None
    operador:            Optional[str] = Field(None, max_length=150)

    # — Extrusión —
    extrusion_ancho:         OptNum = None
    extrusion_color:         Optional[str] = Field(None, max_length=100)
    extrusion_trat:          Optional[str] = Field(None, max_length=100)
    extrusion_espesor:       OptNum = None
    extrusion_cant_bob:      OptNum = None
    extrusion_formulacion:   Optional[str] = Field(None, max_length=300)
    extrusion_maquina:       Optional[str] = Field(None, max_length=100)
    extrusion_observaciones: Optional[str] = None
    operador_extrusion:      Optional[str] = Field(None, max_length=150)
    bobinas:                 Optional[List[OrdenBobinaSchema]] = None

    # — Impresión —
    impresion_frente:        Optional[str] = None
    impresion_retroverso:    Optional[str] = None
    impresion_observaciones: Optional[str] = None
    impresion_cilindro:      OptNum = None
    impresion_colores:       Optional[List[str]] = None
    operador_impresion:      Optional[str] = Field(None, max_length=150)

    # — Troquelado —
    troquelado_ancho:         OptNum = None
    troquelado_alto:          OptNum = None
    troquelado_envase:        Optional[str] = Field(None, max_length=200)
    troquelado_maquina:       Optional[str] = Field(None, max_length=100)
    troquelado_observaciones: Optional[str] = None
    operador_troquelado:      Optional[str] = Field(None, max_length=150)

    # — Control de calidad —
    control_calidad: Optional[str] = None

    # — Fechas por etapa (str; el router parsea) —
    fecha_diseno:     Optional[str] = None
    fecha_preprensa:  Optional[str] = None
    fecha_extrusion:  Optional[str] = None
    fecha_impresion:  Optional[str] = None
    fecha_troquelado: Optional[str] = None
    fecha_entrega:    Optional[str] = None

    # — Totales —
    cantidad:      OptNum = None
    total_final:   OptNum = None
    observaciones: Optional[str] = None


class OrdenCreateSchema(OrdenUpdateSchema):
    """Alta de OT: cliente_id obligatorio, estado por defecto 'borrador'."""
    cliente_id: int
    estado:     str = "borrador"


# ──────────────────────────────────────────────────────────────────────────────
# Razones sociales
# ──────────────────────────────────────────────────────────────────────────────

class RazonSocialUpdateSchema(_Schema):
    razon_social: Optional[str] = Field(None, max_length=300)
    cuit:         Optional[str] = Field(None, max_length=20)
    # N° de cliente de la entidad legal, compartido por todas sus marcas.
    # gt=0 porque es un número de cliente, no un contador desde cero.
    numero:       Optional[int] = Field(None, gt=0)


class RazonSocialCreateSchema(RazonSocialUpdateSchema):
    razon_social: str = Field(..., max_length=300)


# ──────────────────────────────────────────────────────────────────────────────
# Máquinas (catálogo, solo admin)
# ──────────────────────────────────────────────────────────────────────────────

class MaquinaUpdateSchema(_Schema):
    nombre: Optional[str] = Field(None, max_length=200)
    tipo:   Optional[str] = Field(None, max_length=50)
    activa: Optional[bool] = None


class MaquinaCreateSchema(MaquinaUpdateSchema):
    nombre: str = Field(..., max_length=200)
