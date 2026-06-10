"""
Servicio de auditoría — Etiplast ERP
=====================================
Registra acciones sobre entidades en `audit_log`. Los routers llaman a
`registrar(...)` de forma explícita; el commit lo hace el router.
"""
from typing import Optional

from sqlalchemy.orm import Session

from models import AuditLog, User


def registrar(
    db: Session,
    user: Optional[dict],
    accion: str,
    entidad: str,
    entidad_id: int,
    descripcion: str,
    datos: Optional[dict] = None,
) -> AuditLog:
    """
    Crea una fila de auditoría. NO hace commit (responsabilidad del router).

    `user` es el dict del token (verify_token): {"email", "role", "id"}.
    Si el token no trae user_id, se busca el usuario por email; si no existe,
    queda en NULL.
    """
    user_id = user.get("id") if user else None
    user_email = user.get("email") if user else None

    if user_id is None and user_email:
        u = db.query(User).filter(User.email == user_email).first()
        if u:
            user_id = u.id

    log = AuditLog(
        user_id=user_id,
        user_email=user_email,
        accion=accion,
        entidad=entidad,
        entidad_id=entidad_id,
        descripcion=descripcion,
        datos=datos,
    )
    db.add(log)
    return log
