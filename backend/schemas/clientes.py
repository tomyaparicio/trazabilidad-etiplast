"""Qué se puede mandar al crear o editar clientes y razones sociales."""

from .base import *  # noqa: F403  (Optional, Field, _Schema, OptId…)
from .base import (  # noqa: F401  — los usan las clases de abajo
    Annotated, Any, BaseModel, BeforeValidator, ConfigDict, Field,
    Decimal, List, Optional, OptId, OptNum, date, _Schema,
)

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



class RazonSocialUpdateSchema(_Schema):
    razon_social: Optional[str] = Field(None, max_length=300)
    cuit:         Optional[str] = Field(None, max_length=20)
    # N° de cliente de la entidad legal, compartido por todas sus marcas.
    # gt=0 porque es un número de cliente, no un contador desde cero.
    numero:       Optional[int] = Field(None, gt=0)
    # Datos de la empresa que sus marcas heredan (ver Cliente.dato_efectivo).
    domicilio:            Optional[str] = Field(None, max_length=300)
    localidad:            Optional[str] = Field(None, max_length=150)
    provincia:            Optional[str] = Field(None, max_length=150)
    pais:                 Optional[str] = Field(None, max_length=100)
    telefono:             Optional[str] = Field(None, max_length=100)
    transporte:           Optional[str] = Field(None, max_length=200)
    transporte_domicilio: Optional[str] = Field(None, max_length=300)
    transporte_localidad: Optional[str] = Field(None, max_length=150)

class RazonSocialCreateSchema(RazonSocialUpdateSchema):
    razon_social: str = Field(..., max_length=300)
