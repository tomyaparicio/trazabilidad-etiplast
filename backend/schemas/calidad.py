"""Plantillas y registros de control de calidad."""

from .base import *  # noqa: F403  (Optional, Field, _Schema, OptId…)
from .base import (  # noqa: F401  — los usan las clases de abajo
    Annotated, Any, BaseModel, BeforeValidator, ConfigDict, Field,
    Decimal, List, Optional, OptId, OptNum, date, _Schema,
)

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
