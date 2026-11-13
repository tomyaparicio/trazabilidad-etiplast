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



# ──────────────────────────────────────────────────────────────────────────────
# Cobranzas
# ──────────────────────────────────────────────────────────────────────────────
# El `importe` NO lleva `gt=0` acá a propósito: Pydantic responde 422 y lo que
# el módulo tiene que devolver es 400 con un mensaje que se entienda. Lo mismo
# con `medio` y `cheque_estado`: se validan contra el catálogo en el router.
# Por la misma razón los campos del Update siguen aceptando null: que un null
# sea entrada VÁLIDA para Pydantic es lo que deja que el router distinga «no lo
# mandó» de «lo mandó vacío» y conteste 400 explicando qué falta, en vez de 422
# o —lo que pasaba antes— de aplicar un default encima de un dato real.
# `numero` no se acepta de entrada — siempre es el correlativo COB-NNNN. A
# diferencia de las facturas (que tienen números reales de ARCA cargados a mano),
# una cobranza no tiene número externo que respetar.

class CobranzaCreateSchema(_Schema):
    cliente_id:        int                                    # siempre se sabe de quién es la plata
    fecha:             Optional[date] = None                  # vacío = hoy
    medio:             str = "efectivo"                       # efectivo | transferencia | cheque
    importe:           Decimal
    observaciones:     Optional[str] = None
    cheque_numero:     Optional[str] = Field(None, max_length=50)
    cheque_banco:      Optional[str] = Field(None, max_length=100)
    cheque_fecha_pago: Optional[date] = None                  # obligatoria si medio == cheque
    cheque_estado:     Optional[str] = None                   # vacío = en_cartera
    factura_id:        OptId = None
    orden_trabajo_id:  OptId = None

class CobranzaUpdateSchema(_Schema):
    cliente_id:        OptId = None
    fecha:             Optional[date] = None
    medio:             Optional[str] = None
    importe:           Optional[Decimal] = None
    observaciones:     Optional[str] = None
    cheque_numero:     Optional[str] = Field(None, max_length=50)
    cheque_banco:      Optional[str] = Field(None, max_length=100)
    cheque_fecha_pago: Optional[date] = None
    cheque_estado:     Optional[str] = None
    factura_id:        OptId = None
    orden_trabajo_id:  OptId = None
