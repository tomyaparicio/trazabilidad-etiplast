"""
Router de Roles (RBAC) — Etiplast ERP
=====================================
- Catálogo de vistas/acciones para la matriz del frontend.
- Permisos del usuario actual (para gate en el frontend).
- ABM de roles (crear/editar/borrar) — solo admin.
"""
import re
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core.database import get_db
from core.security import verify_token, verify_admin, rol_permisos
from models import Role, User
from services import auditoria
from core import rbac

router = APIRouter(prefix="/api", tags=["roles"])


class RoleIn(BaseModel):
    clave: Optional[str] = None
    nombre: str
    vistas: List[str] = []
    acciones: List[str] = []


def _validar(vistas: List[str], acciones: List[str]):
    """Filtra a lo que existe en el catálogo (evita basura/inyección de permisos)."""
    vs = [v for v in (vistas or []) if v in rbac.VISTAS_CLAVES]
    ac = [a for a in (acciones or []) if a in rbac.ACCIONES_CLAVES]
    return vs, ac


@router.get("/roles/catalogo", summary="Catálogo de vistas y acciones para la matriz")
async def get_catalogo(_user: dict = Depends(verify_token)):
    return rbac.catalogo()


@router.get("/roles/mias", summary="Permisos del usuario actual (para el frontend)")
async def mis_permisos(user: dict = Depends(verify_token), db: Session = Depends(get_db)):
    rol = rol_permisos(user.get("role"), db)
    if rol is None:
        if user.get("role") == "admin":  # admin legacy sin fila → todo
            return {"clave": "admin", "nombre": "Administrador",
                    "vistas": rbac.VISTAS_CLAVES, "acciones": rbac.ACCIONES_CLAVES, "protegido": True}
        return {"clave": user.get("role"), "nombre": user.get("role"),
                "vistas": [], "acciones": [], "protegido": False}
    # Un rol protegido (admin) puede TODO, igual que en require_permiso: se le
    # devuelve el catálogo completo para que el frontend no quede desfasado
    # cuando se agrega un módulo nuevo (su fila guardada puede estar vieja).
    if rol.protegido:
        d = rol.to_dict()
        d["vistas"] = rbac.VISTAS_CLAVES
        d["acciones"] = rbac.ACCIONES_CLAVES
        return d
    return rol.to_dict()


@router.get("/admin/roles", summary="Listar roles")
async def listar_roles(_admin: dict = Depends(verify_admin), db: Session = Depends(get_db)):
    return {"data": [r.to_dict() for r in db.query(Role).order_by(Role.id).all()]}


@router.post("/admin/roles", status_code=201, summary="Crear rol")
async def crear_rol(data: RoleIn, admin: dict = Depends(verify_admin), db: Session = Depends(get_db)):
    clave = re.sub(r"[^a-z0-9]+", "_", (data.clave or data.nombre or "").strip().lower()).strip("_")
    if not clave:
        raise HTTPException(status_code=400, detail="Nombre inválido")
    if db.query(Role).filter(Role.clave == clave).first():
        raise HTTPException(status_code=409, detail="Ya existe un rol con esa clave")
    vs, ac = _validar(data.vistas, data.acciones)
    rol = Role(clave=clave, nombre=data.nombre.strip(), vistas=vs, acciones=ac, protegido=False)
    db.add(rol)
    db.flush()   # asigna el id sin cerrar la transacción (la auditoría va adentro)

    # Los permisos definen quién ve la facturación: cambiarlos siempre deja rastro.
    auditoria.registrar(db, admin, "crear", "rol", rol.id,
                        f"Creó rol {rol.nombre}",
                        datos={"clave": rol.clave, "vistas": vs, "acciones": ac})
    db.commit()
    db.refresh(rol)
    return rol.to_dict()


@router.put("/admin/roles/{role_id}", summary="Editar rol (nombre/vistas/acciones)")
async def actualizar_rol(role_id: int, data: RoleIn, admin: dict = Depends(verify_admin), db: Session = Depends(get_db)):
    rol = db.query(Role).filter(Role.id == role_id).first()
    if not rol:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
    antes = {"nombre": rol.nombre, "vistas": rol.vistas, "acciones": rol.acciones}

    nombre = (data.nombre or "").strip()
    if nombre:
        rol.nombre = nombre
    if not rol.protegido:  # el rol protegido (admin) conserva todos sus permisos
        rol.vistas, rol.acciones = _validar(data.vistas, data.acciones)

    auditoria.registrar(db, admin, "actualizar", "rol", rol.id,
                        f"Actualizó rol {rol.nombre}",
                        datos={"antes": antes,
                               "despues": {"nombre": rol.nombre, "vistas": rol.vistas,
                                           "acciones": rol.acciones}})
    db.commit()
    db.refresh(rol)
    return rol.to_dict()


@router.delete("/admin/roles/{role_id}", status_code=204, summary="Borrar rol")
async def borrar_rol(role_id: int, admin: dict = Depends(verify_admin), db: Session = Depends(get_db)):
    rol = db.query(Role).filter(Role.id == role_id).first()
    if not rol:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
    if rol.protegido:
        raise HTTPException(status_code=400, detail="No se puede borrar el rol protegido (admin)")
    en_uso = db.query(User).filter(User.role == rol.clave).count()
    if en_uso:
        raise HTTPException(status_code=409, detail=f"El rol está asignado a {en_uso} usuario(s); reasignalos primero")
    auditoria.registrar(db, admin, "eliminar", "rol", rol.id,
                        f"Eliminó rol {rol.nombre}",
                        datos={"clave": rol.clave, "vistas": rol.vistas, "acciones": rol.acciones})
    db.delete(rol)
    db.commit()
    return None
