"""Ítems de inventario y sus movimientos."""

from .base import *  # noqa: F403  (Optional, Field, _Schema, OptId…)
from .base import (  # noqa: F401  — los usan las clases de abajo
    Annotated, Any, BaseModel, BeforeValidator, ConfigDict, Field,
    Decimal, List, Optional, OptId, OptNum, date, _Schema,
)

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
