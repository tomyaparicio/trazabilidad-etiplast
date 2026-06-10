"""
Router de Control de Calidad — Etiplast ERP
============================================
Esqueleto (Fase 0). Los endpoints de negocio se implementan en Fase 1E:
CRUD de plantillas (admin) + GET/POST /api/ordenes/{id}/calidad.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from dependencies import verify_token

router = APIRouter(prefix="/api", tags=["calidad"])

# Endpoints de negocio: Fase 1E.
