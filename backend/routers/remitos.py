"""
Router de Remitos — Etiplast ERP
=================================
Esqueleto (Fase 0). Los endpoints de negocio se implementan en Fase 1C:
CRUD + POST /{id}/despachar + GET /api/trazabilidad?lote=.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from dependencies import verify_token

router = APIRouter(prefix="/api", tags=["remitos"])

# Endpoints de negocio: Fase 1C.
