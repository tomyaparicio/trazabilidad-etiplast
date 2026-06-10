"""
Router de Planificación de Producción — Etiplast ERP
=====================================================
Esqueleto (Fase 0). Los endpoints de negocio se implementan en Fase 1D:
GET por rango/máquina/etapa, POST con warning de solapamiento, PUT reprogramar.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from dependencies import verify_token

router = APIRouter(prefix="/api", tags=["planificacion"])

# Endpoints de negocio: Fase 1D.
