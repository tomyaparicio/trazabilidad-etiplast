"""Catálogos administrables."""

from typing import Literal

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
    # Qué hoja de papel imprime esta máquina: ver el modelo.
    # Lista cerrada y no texto libre: un typo —«autoadesiva»— no puede caer
    # silenciosamente en el default y hacer que la impresora de autoadhesivos
    # imprima una sección de extrusión que no existe. Si no es ninguno de los
    # dos, la API lo rechaza con 422 y se ve al cargarlo, no al imprimir.
    ficha_tipo: Optional[Literal["film", "autoadhesiva"]] = None

class MaquinaCreateSchema(MaquinaUpdateSchema):
    nombre: str = Field(..., max_length=200)
