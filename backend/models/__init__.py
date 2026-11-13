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
    ETAPA_CIERRE, ETAPAS_ESCANEABLES,
    OrdenTrabajo, OrdenExtrusionBobina, PlanProduccion,
)
from .comercial import (
    MEDIO_DIFERIDO, MEDIOS_COBRANZA, MEDIOS_CONTADO,
    CHEQUE_ACREDITADO, CHEQUE_EN_CARTERA, CHEQUE_RECHAZADO,
    ESTADOS_CHEQUE, ESTADOS_CHEQUE_PENDIENTE,
    Presupuesto, PresupuestoItem, Factura, Remito, RemitoItem, Cobranza,
)
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
    "ETAPA_CIERRE",
    "ETAPAS_ESCANEABLES",
    "Presupuesto",
    "PresupuestoItem",
    "Factura",
    "Remito",
    "RemitoItem",
    "Cobranza",
    "MEDIO_DIFERIDO",
    "MEDIOS_COBRANZA",
    "MEDIOS_CONTADO",
    "CHEQUE_ACREDITADO",
    "CHEQUE_EN_CARTERA",
    "CHEQUE_RECHAZADO",
    "ESTADOS_CHEQUE",
    "ESTADOS_CHEQUE_PENDIENTE",
    "StockItem",
    "StockMovimiento",
    "QcPlantilla",
    "QcPlantillaItem",
    "QcRegistro",
    "QcRegistroItem",
]
