"""Dependencias compartidas (auth, etc.)."""
from fastapi import Header, HTTPException
from jose import JWTError, jwt

from config import SECRET_KEY, ALGORITHM


def verify_token(authorization: str = Header(...)) -> dict:
    """Verifica el token JWT propio."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token inválido")
    token = authorization.replace("Bearer ", "")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=401, detail="Token inválido")
        return {"email": email}
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
