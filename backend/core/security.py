"""Dependencias compartidas (auth, etc.)."""
from typing import Optional

from fastapi import Depends, Header, HTTPException
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from core.config import SECRET_KEY, ALGORITHM
from core.database import get_db
from models import User, Role


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

    # `id` y `role` autoritativos desde la DB: si a un usuario le cambian el rol,
    # el cambio aplica en la request siguiente y no recién cuando expira el token
    # (antes se leía del JWT y un admin degradado conservaba permisos hasta 7 días).
    return {"email": email, "role": getattr(user, "role", None) or role, "id": user.id if user_id is None else user_id}


def verify_admin(user: dict = Depends(verify_token)) -> dict:
    """Verifica que el usuario sea administrador."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acceso denegado: se requiere rol de administrador")
    return user


def rol_permisos(clave: str, db: Session) -> Optional[Role]:
    """Rol (fila) por clave, o None."""
    return db.query(Role).filter(Role.clave == clave).first()


def tiene_permiso(user: dict, accion: str, db: Session) -> bool:
    """Versión no-bloqueante de `require_permiso`: devuelve True/False.

    Sirve para respuestas parciales (ej. el dashboard omite el bloque de
    finanzas si el rol no tiene 'facturas:ver' en vez de fallar con 403).
    """
    rol = rol_permisos(user.get("role"), db)
    if rol is None:
        return user.get("role") == "admin"
    if rol.protegido:
        return True
    return accion in (rol.acciones or [])


def require_permiso(accion: str):
    """Dependency factory: exige que el rol del usuario tenga `accion` (ej. 'clientes:crear').

    - El rol protegido (admin) puede todo.
    - Si el rol no tiene fila en `roles` pero es 'admin', también se permite (compat).
    """
    def _dep(user: dict = Depends(verify_token), db: Session = Depends(get_db)) -> dict:
        rol = rol_permisos(user.get("role"), db)
        if rol is None:
            if user.get("role") == "admin":
                return user
            raise HTTPException(status_code=403, detail="Rol sin permisos configurados")
        if rol.protegido:
            return user
        if accion not in (rol.acciones or []):
            raise HTTPException(status_code=403, detail=f"Sin permiso para: {accion}")
        return user
    return _dep
