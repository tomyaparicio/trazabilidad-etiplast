"""Rutas de administración de usuarios (solo admin)."""
import logging

import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from database import get_db
from models import User
from dependencies import verify_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin"])


class CreateUserRequest(BaseModel):
    email: str
    password: str
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    role: str = "user"


class UpdateUserRequest(BaseModel):
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


@router.get("/usuarios", summary="Listar usuarios")
def listar_usuarios(
    admin: dict = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    usuarios = db.query(User).order_by(User.id).all()
    return [u.to_dict() for u in usuarios]


@router.post("/usuarios", summary="Crear usuario")
def crear_usuario(
    data: CreateUserRequest,
    admin: dict = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    email = (data.email or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="El email es requerido")
    if not data.password or len(data.password) < 6:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 6 caracteres")
    if data.role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="El rol debe ser 'admin' o 'user'")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="El usuario ya existe")

    hashed = _hash_password(data.password)
    user = User(
        email=email,
        hashed_password=hashed,
        nombre=(data.nombre or "").strip() or None,
        apellido=(data.apellido or "").strip() or None,
        role=data.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    logger.info("Admin %s creó usuario: %s (rol=%s)", admin["email"], email, data.role)
    return user.to_dict()


@router.put("/usuarios/{user_id}", summary="Actualizar usuario")
def actualizar_usuario(
    user_id: int,
    data: UpdateUserRequest,
    admin: dict = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if data.nombre is not None:
        user.nombre = data.nombre.strip() or None
    if data.apellido is not None:
        user.apellido = data.apellido.strip() or None
    if data.role is not None:
        if data.role not in ("admin", "user"):
            raise HTTPException(status_code=400, detail="El rol debe ser 'admin' o 'user'")
        user.role = data.role
    if data.is_active is not None:
        user.is_active = data.is_active
    db.commit()
    db.refresh(user)
    logger.info("Admin %s actualizó usuario %s: role=%s, active=%s", admin["email"], user.email, user.role, user.is_active)
    return user.to_dict()
