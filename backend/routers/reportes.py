"""
Router de Reportes y KPIs — Etiplast ERP
=========================================
Esqueleto (Fase 0). Los endpoints de negocio se implementan en Fase 2A:
producción agrupada, tiempos entre etapas, series de órdenes, clientes top,
resumen de stock.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from dependencies import verify_token

router = APIRouter(prefix="/api", tags=["reportes"])

# Endpoints de negocio: Fase 2A.
