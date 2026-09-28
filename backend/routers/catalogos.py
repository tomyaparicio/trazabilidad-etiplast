"""
Router de Catálogos (lectura) — Etiplast ERP
=============================================
Catálogos accesibles para cualquier usuario autenticado.
El CRUD de máquinas vive en /api/admin/maquinas (solo admin).
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core.database import get_db
from core.security import verify_token
from models import Maquina

router = APIRouter(prefix="/api", tags=["catalogos"])


@router.get("/maquinas", summary="Listar máquinas activas")
def listar_maquinas(
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    maquinas = (
        db.query(Maquina)
        .filter(Maquina.activa.is_(True))
        .order_by(Maquina.tipo, Maquina.nombre)
        .all()
    )
    return [m.to_dict() for m in maquinas]
