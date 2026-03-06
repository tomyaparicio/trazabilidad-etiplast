"""Rutas de autenticación."""
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from jose import jwt
from sqlalchemy.orm import Session

from config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_HOURS
from database import get_db
from models import User

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def _create_token(email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    return jwt.encode({"sub": email, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


@router.post("/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not _verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Usuario inactivo")
    return {"access_token": _create_token(user.email), "token_type": "bearer"}


@router.post("/crear-usuario")
def crear_usuario(data: LoginRequest, db: Session = Depends(get_db)):
    """Crea un usuario (solo para setup inicial — proteger o eliminar en producción)."""
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="El usuario ya existe")
    hashed = _hash_password(data.password)
    user = User(email=data.email, hashed_password=hashed)
    db.add(user)
    db.commit()
    return {"message": f"Usuario '{data.email}' creado exitosamente"}
