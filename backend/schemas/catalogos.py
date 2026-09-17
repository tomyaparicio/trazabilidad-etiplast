"""Catálogos administrables."""

from .base import *  # noqa: F403  (Optional, Field, _Schema, OptId…)
from .base import (  # noqa: F401  — los usan las clases de abajo
    Annotated, Any, BaseModel, BeforeValidator, ConfigDict, Field,
    Decimal, List, Optional, OptId, OptNum, date, _Schema,
)

class MaquinaUpdateSchema(_Schema):
    nombre: Optional[str] = Field(None, max_length=200)
    tipo:   Optional[str] = Field(None, max_length=50)
    activa: Optional[bool] = None

class MaquinaCreateSchema(MaquinaUpdateSchema):
    nombre: str = Field(..., max_length=200)
