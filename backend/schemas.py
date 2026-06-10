"""
Schemas Pydantic v2 — Etiplast ERP
===================================
Validación de entrada para los módulos de la expansión (presupuestos, stock,
remitos, planificación, calidad) + schemas de referencia para clientes/órdenes.

Convenciones:
  - `extra="ignore"`: claves desconocidas se descartan en silencio.
  - Schemas *Update*: todos los campos opcionales (PATCH-style sobre PUT).
  - Los routers siguen devolviendo los `to_dict()` de los modelos (no se
    cambian shapes de respuesta).
"""
from datetime import date
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class _Schema(BaseModel):
    """Base común: ignora claves extra."""
    model_config = ConfigDict(extra="ignore")


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
# Planificación de producción
# ──────────────────────────────────────────────────────────────────────────────

class PlanProduccionCreateSchema(_Schema):
    orden_trabajo_id: int
    maquina_id:       int
    etapa:            str = Field(..., max_length=20)   # extrusion | impresion | troquelado
    fecha_inicio:     Optional[date] = None
    fecha_fin:        Optional[date] = None
    orden_prioridad:  int = 0
    estado:           str = "planificada"
    notas:            Optional[str] = None


class PlanProduccionUpdateSchema(_Schema):
    orden_trabajo_id: Optional[int] = None
    maquina_id:       Optional[int] = None
    etapa:            Optional[str] = Field(None, max_length=20)
    fecha_inicio:     Optional[date] = None
    fecha_fin:        Optional[date] = None
    orden_prioridad:  Optional[int] = None
    estado:           Optional[str] = None
    notas:            Optional[str] = None


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
# Referencia futura (retrofit Fase 3): clientes y órdenes
# Los endpoints actuales siguen aceptando Dict[str, Any]; estos schemas quedan
# como contrato de referencia para cuando se retrofitee la validación.
# ──────────────────────────────────────────────────────────────────────────────

class OrdenCreateSchema(_Schema):
    cliente_id:          int
    cliente_producto_id: Optional[int] = None
    fecha:               Optional[date] = None
    estado:              str = "borrador"
    responsable_id:      Optional[int] = None
    operador:            Optional[str] = Field(None, max_length=150)
    cantidad:            Optional[int] = None
    total_final:         Optional[Decimal] = None
    observaciones:       Optional[str] = None
    fecha_entrega:       Optional[date] = None


class ClienteCreateSchema(_Schema):
    marca:           str = Field(..., max_length=200)
    id_cliente:      Optional[int] = None
    razon_social_id: Optional[int] = None
    rubro_id:        Optional[int] = None
    domicilio:       Optional[str] = Field(None, max_length=300)
    localidad:       Optional[str] = Field(None, max_length=150)
    provincia_id:    Optional[int] = None
    pais:            Optional[str] = Field(None, max_length=100)
    telefono:        Optional[str] = Field(None, max_length=100)
    observaciones:   Optional[str] = None
