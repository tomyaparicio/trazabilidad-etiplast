"""
Servicio de notificaciones — Etiplast ERP
==========================================
Materializa una fila de `notificaciones` por cada usuario destino.
El commit lo hace el router que invoca.
"""
from typing import List, Optional

from sqlalchemy.orm import Session

from models import Notificacion, User


def notificar(
    db: Session,
    tipo: str,
    titulo: str,
    mensaje: str,
    link: Optional[str] = None,
    user_ids: Optional[List[int]] = None,
    roles: Optional[List[str]] = None,
) -> List[Notificacion]:
    """
    Crea una Notificacion por usuario destino. NO hace commit.

    Destinatarios:
      - `user_ids` → esos usuarios (activos).
      - `roles`    → usuarios activos con alguno de esos roles.
      - ninguno    → todos los usuarios activos.
    """
    query = db.query(User).filter(User.is_active.is_(True))
    if user_ids:
        query = query.filter(User.id.in_(user_ids))
    elif roles:
        query = query.filter(User.role.in_(roles))

    notificaciones = []
    for user in query.all():
        notif = Notificacion(
            user_id=user.id,
            tipo=tipo,
            titulo=titulo,
            mensaje=mensaje,
            link=link,
        )
        db.add(notif)
        notificaciones.append(notif)
    return notificaciones
