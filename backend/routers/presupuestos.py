"""
Router de Presupuestos — Etiplast ERP
======================================
Esqueleto (Fase 0). Los endpoints de negocio se implementan en Fase 1A:
CRUD + POST /api/presupuestos/{id}/convertir → orden de trabajo.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from dependencies import verify_token

router = APIRouter(prefix="/api", tags=["presupuestos"])

# Endpoints de negocio: Fase 1A.
