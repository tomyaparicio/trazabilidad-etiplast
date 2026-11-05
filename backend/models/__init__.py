"""Modelos SQLAlchemy — Etiplast ERP.

Partido por dominio. Este __init__ re-exporta todo, así que
`from models import Cliente` sigue funcionando igual que cuando era un
único archivo — y SQLAlchemy encuentra el registry completo al importar
el paquete, que es lo que necesitan las relaciones por nombre.
"""
from core.database import Base

from .catalogos import Rubro, Envase, Provincia, Maquina
from .clientes import RazonSocial, Cliente, ClienteUbicacion, ClienteContacto, ClienteProducto
from .seguridad import User, Role, AuditLog, Notificacion
from .produccion import (
    ETAPAS_PRODUCCION, ESTADOS_PASE, ETAPAS_CON_MAQUINA,
    OrdenTrabajo, OrdenExtrusionBobina, PlanProduccion,
)
from .comercial import Presupuesto, PresupuestoItem, Factura, Remito, RemitoItem
from .stock import StockItem, StockMovimiento
from .calidad import QcPlantilla, QcPlantillaItem, QcRegistro, QcRegistroItem

__all__ = [
    "Base",
    "Rubro",
    "Envase",
    "Provincia",
    "Maquina",
    "RazonSocial",
    "Cliente",
    "ClienteUbicacion",
    "ClienteContacto",
    "ClienteProducto",
    "User",
    "Role",
    "AuditLog",
    "Notificacion",
    "OrdenTrabajo",
    "OrdenExtrusionBobina",
    "PlanProduccion",
    "ETAPAS_PRODUCCION",
    "ESTADOS_PASE",
    "ETAPAS_CON_MAQUINA",
    "Presupuesto",
    "PresupuestoItem",
    "Factura",
    "Remito",
    "RemitoItem",
    "StockItem",
    "StockMovimiento",
    "QcPlantilla",
    "QcPlantillaItem",
    "QcRegistro",
    "QcRegistroItem",
]
