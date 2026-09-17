"""Presupuestos, facturas y remitos."""

from .base import *  # noqa: F403  (Optional, Field, _Schema, OptId…)
from .base import (  # noqa: F401  — los usan las clases de abajo
    Annotated, Any, BaseModel, BeforeValidator, ConfigDict, Field,
    Decimal, List, Optional, OptId, OptNum, date, _Schema,
)

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
