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
    # Espacios de color de la hoja de papel de esta impresora.
    # ge=1 y no ge=0: cero sería una impresora que no imprime colores, que no
    # existe; «no lo cargaron» se dice con None. le=12 es un tope de cordura —
    # la hoja más grande que tienen trae 8— para que un dedazo no imprima una
    # ficha con cien renglones y se lleve puesto el alto de la hoja.
    ficha_colores: Optional[int] = Field(None, ge=1, le=12)

class MaquinaCreateSchema(MaquinaUpdateSchema):
    nombre: str = Field(..., max_length=200)
