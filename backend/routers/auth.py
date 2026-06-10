"""Rutas de autenticación."""
import logging
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from jose import jwt
from sqlalchemy.orm import Session

from config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_HOURS
from database import get_db
from dependencies import verify_token
from middleware import limiter
from models import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str

    model_config = {"json_schema_extra": {"examples": [{"email": "usuario@ejemplo.com", "password": "minimo6"}]}}


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def _create_token(email: str, role: str = "user", user_id: int | None = None, nombre: str | None = None, apellido: str | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    payload: dict = {"sub": email, "role": role, "exp": expire}
    if user_id is not None:
        payload["user_id"] = user_id
    if nombre:
        payload["nombre"] = nombre
    if apellido:
        payload["apellido"] = apellido
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


@router.post("/login", summary="Iniciar sesión")
@limiter.limit("5/minute")
def login(request: Request, data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not _verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Usuario inactivo")
    return {"access_token": _create_token(user.email, user.role or "user", user.id, user.nombre, user.apellido), "token_type": "bearer"}


@router.get("/me", summary="Datos del usuario autenticado")
def me(token_data: dict = Depends(verify_token), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == token_data["email"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return user.to_dict()
