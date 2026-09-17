"""Qué se puede mandar al crear o editar órdenes de trabajo."""

from .base import *  # noqa: F403  (Optional, Field, _Schema, OptId…)
from .base import (  # noqa: F401  — los usan las clases de abajo
    Annotated, Any, BaseModel, BeforeValidator, ConfigDict, Field,
    Decimal, List, Optional, OptId, OptNum, date, _Schema,
)

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
