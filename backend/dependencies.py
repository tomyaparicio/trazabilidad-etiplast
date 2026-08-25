"""Dependencias compartidas (auth, etc.)."""
from typing import Optional

from fastapi import Depends, Header, HTTPException
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from config import SECRET_KEY, ALGORITHM
from database import get_db
from models import User


def verify_token(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> dict:
    """
    Verifica el token JWT propio y revalida al usuario contra la DB en cada request.

    El JWT vive 7 días; sin revalidación, un usuario desactivado seguiría teniendo
    acceso hasta que expire el token. Por eso, además de verificar la firma,
    consultamos `is_active` en la DB (query barata, `email` está indexado): si el
    usuario fue borrado o desactivado, se corta el acceso de inmediato.
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Token requerido")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token inválido")
    token = authorization.replace("Bearer ", "")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=401, detail="Token inválido")
        role: str = payload.get("role", "user")
        user_id = payload.get("user_id")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

    # Revalidación contra la DB (revocación efectiva de sesiones).
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Usuario inactivo")

    # `id` autoritativo desde la DB; `role` se mantiene del token para no cambiar
    # el comportamiento de autorización existente.
    return {"email": email, "role": role, "id": user.id if user_id is None else user_id}


def verify_admin(user: dict = Depends(verify_token)) -> dict:
    """Verifica que el usuario sea administrador."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acceso denegado: se requiere rol de administrador")
    return user
