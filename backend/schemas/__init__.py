"""Schemas de entrada (Pydantic) — Etiplast ERP.

Partido por dominio, con los mismos nombres de archivo que `models/`.
El __init__ re-exporta todo: `from schemas import ClienteCreateSchema`
sigue funcionando igual que cuando era un único archivo.
"""
from .base import _Schema

from .clientes import ClienteUpdateSchema, ClienteCreateSchema, RazonSocialUpdateSchema, RazonSocialCreateSchema
from .produccion import OrdenBobinaSchema, OrdenUpdateSchema, OrdenCreateSchema
from .comercial import PresupuestoItemSchema, PresupuestoCreateSchema, PresupuestoUpdateSchema, FacturaCreateSchema, FacturaUpdateSchema, RemitoItemSchema, RemitoCreateSchema, RemitoUpdateSchema
from .stock import StockItemCreateSchema, StockItemUpdateSchema, StockMovimientoCreateSchema
from .calidad import QcPlantillaItemSchema, QcPlantillaCreateSchema, QcPlantillaUpdateSchema, QcRegistroItemSchema, QcRegistroCreateSchema, QcRegistroUpdateSchema
from .catalogos import MaquinaUpdateSchema, MaquinaCreateSchema

__all__ = [
    "ClienteUpdateSchema",
    "ClienteCreateSchema",
    "RazonSocialUpdateSchema",
    "RazonSocialCreateSchema",
    "OrdenBobinaSchema",
    "OrdenUpdateSchema",
    "OrdenCreateSchema",
    "PresupuestoItemSchema",
    "PresupuestoCreateSchema",
    "PresupuestoUpdateSchema",
    "FacturaCreateSchema",
    "FacturaUpdateSchema",
    "RemitoItemSchema",
    "RemitoCreateSchema",
    "RemitoUpdateSchema",
    "StockItemCreateSchema",
    "StockItemUpdateSchema",
    "StockMovimientoCreateSchema",
    "QcPlantillaItemSchema",
    "QcPlantillaCreateSchema",
    "QcPlantillaUpdateSchema",
    "QcRegistroItemSchema",
    "QcRegistroCreateSchema",
    "QcRegistroUpdateSchema",
    "MaquinaUpdateSchema",
    "MaquinaCreateSchema",
]
