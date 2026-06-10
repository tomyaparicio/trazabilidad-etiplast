"""
Router de Stock — Etiplast ERP
===============================
Esqueleto (Fase 0). Los endpoints de negocio se implementan en Fase 1B:
CRUD de ítems + movimientos (services/stock) + GET /api/stock/alertas.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from dependencies import verify_token

router = APIRouter(prefix="/api", tags=["stock"])

# Endpoints de negocio: Fase 1B.
