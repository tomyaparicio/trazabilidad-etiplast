"""Dependencias compartidas (auth, etc.)."""
from typing import Optional

from fastapi import Header, HTTPException, Depends
from jose import JWTError, jwt

from config import SECRET_KEY, ALGORITHM


def verify_token(authorization: Optional[str] = Header(None)) -> dict:
    """Verifica el token JWT propio."""
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
        return {"email": email, "role": role, "id": user_id}
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")


def verify_admin(user: dict = Depends(verify_token)) -> dict:
    """Verifica que el usuario sea administrador."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acceso denegado: se requiere rol de administrador")
    return user
