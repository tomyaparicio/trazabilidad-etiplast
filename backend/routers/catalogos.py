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
    incluir_inactivas: bool = False,
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Catálogo de máquinas.

    POR DEFECTO SÓLO LAS ACTIVAS, que es lo que necesita quien va a ELEGIR una:
    ofrecer una máquina dada de baja es mandar al operario a cargar una orden
    para una máquina que ya no está.

    `incluir_inactivas=true` es para quien va a LEER algo ya cargado. El caso
    concreto es la orden de trabajo impresa: cruza el nombre que la orden
    guardó contra este catálogo para saber cómo es la hoja de esa impresora
    —cuántos colores entran y si es la de film o la de autoadhesiva—.

    Sin esto, dar de baja una máquina le cambia la hoja a las órdenes YA
    CARGADAS: el nombre guardado deja de encontrarse, la ficha cae al valor por
    defecto, y una orden hecha en la autoadhesiva se reimprime con una sección
    de extrusión que nunca tuvo. Y la baja no es hipotética — es lo que hace el
    sistema a propósito cuando la máquina tiene pases de producción, porque esa
    historia no se puede borrar.

    La configuración se corrige; la historia no se reescribe.
    """
    q = db.query(Maquina)
    if not incluir_inactivas:
        q = q.filter(Maquina.activa.is_(True))
    return [m.to_dict() for m in q.order_by(Maquina.tipo, Maquina.nombre).all()]
