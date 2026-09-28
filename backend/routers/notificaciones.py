"""
Router de Notificaciones — Etiplast ERP
========================================
Notificaciones internas por usuario: listado, contador de no leídas y
marcado de lectura (individual y masivo).
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from core.database import get_db
from core.security import verify_token
from models import Notificacion, User

router = APIRouter(prefix="/api", tags=["notificaciones"])


def _usuario_actual(db: Session, token: dict) -> User:
    """Resuelve el usuario del token (por id si viene, sino por email)."""
    user = None
    if token.get("id") is not None:
        user = db.query(User).filter(User.id == token["id"]).first()
    if user is None:
        user = db.query(User).filter(User.email == token.get("email")).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return user


@router.get("/notificaciones", summary="Listar notificaciones del usuario actual")
def listar_notificaciones(
    token: dict = Depends(verify_token),
    db: Session = Depends(get_db),
    solo_no_leidas: bool = Query(False, description="Solo notificaciones no leídas"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    user = _usuario_actual(db, token)

    query = db.query(Notificacion).filter(Notificacion.user_id == user.id)
    if solo_no_leidas:
        query = query.filter(Notificacion.leida.is_(False))

    total = query.count()
    notificaciones = (
        query
        .order_by(Notificacion.created_at.desc(), Notificacion.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return {
        "data":        [n.to_dict() for n in notificaciones],
        "total":       total,
        "page":        page,
        "per_page":    per_page,
        "total_pages": -(-total // per_page) if total else 0,
    }


@router.get("/notificaciones/count", summary="Cantidad de notificaciones no leídas")
def contar_no_leidas(
    token: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    user = _usuario_actual(db, token)
    count = (
        db.query(Notificacion)
        .filter(Notificacion.user_id == user.id, Notificacion.leida.is_(False))
        .count()
    )
    return {"count": count}


@router.post("/notificaciones/{notificacion_id}/leer", summary="Marcar notificación como leída")
def marcar_leida(
    notificacion_id: int,
    token: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    user = _usuario_actual(db, token)
    notif = (
        db.query(Notificacion)
        .filter(Notificacion.id == notificacion_id, Notificacion.user_id == user.id)
        .first()
    )
    if not notif:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")
    notif.leida = True
    db.commit()
    return notif.to_dict()


@router.post("/notificaciones/leer-todas", summary="Marcar todas las notificaciones como leídas")
def marcar_todas_leidas(
    token: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    user = _usuario_actual(db, token)
    actualizadas = (
        db.query(Notificacion)
        .filter(Notificacion.user_id == user.id, Notificacion.leida.is_(False))
        .update({"leida": True}, synchronize_session=False)
    )
    db.commit()
    return {"ok": True, "actualizadas": actualizadas}
