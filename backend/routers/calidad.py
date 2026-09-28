"""
Router de Control de Calidad — Etiplast ERP
============================================
CRUD de plantillas QC (admin) + registros de control de calidad por
orden de trabajo. Un registro rechazado notifica a los administradores.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from core.database import get_db
from core.security import require_permiso, verify_token
from models import (
    OrdenTrabajo, QcPlantilla, QcPlantillaItem, QcRegistro, QcRegistroItem,
)
from schemas import (
    QcPlantillaCreateSchema, QcPlantillaUpdateSchema, QcRegistroCreateSchema,
)
from services import auditoria
from services import notificaciones as notificaciones_service

router = APIRouter(prefix="/api", tags=["calidad"])

ETAPAS_VALIDAS = {"extrusion", "impresion", "troquelado"}
RESULTADOS_VALIDOS = {"aprobado", "rechazado", "observado"}


# ──────────────────────────────────────────────────────────────────────────────
# Helpers internos
# ──────────────────────────────────────────────────────────────────────────────

def _get_plantilla(db: Session, plantilla_id: int) -> QcPlantilla:
    plantilla = (
        db.query(QcPlantilla)
        .options(joinedload(QcPlantilla.items))
        .filter(QcPlantilla.id == plantilla_id)
        .first()
    )
    if not plantilla:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")
    return plantilla


def _sync_items(db: Session, plantilla: QcPlantilla, items_data: List) -> None:
    """Reemplaza los ítems de la plantilla con la lista enviada."""
    for item in list(plantilla.items):
        db.delete(item)
    db.flush()
    for idx, item in enumerate(items_data):
        db.add(QcPlantillaItem(
            plantilla_id=plantilla.id,
            descripcion=item.descripcion,
            orden=item.orden if item.orden is not None else idx + 1,
        ))


def _registro_dict(registro: QcRegistro, nombres_plantillas: dict) -> dict:
    """to_dict() del registro enriquecido con email del usuario y nombre de plantilla."""
    data = registro.to_dict()
    data["user_email"] = registro.usuario.email if registro.usuario else None
    data["plantilla_nombre"] = nombres_plantillas.get(registro.plantilla_id)
    return data


def _nombres_plantillas(db: Session, registros: List[QcRegistro]) -> dict:
    """Mapa {plantilla_id: nombre} para los registros dados (una sola query)."""
    ids = {r.plantilla_id for r in registros if r.plantilla_id is not None}
    if not ids:
        return {}
    filas = (
        db.query(QcPlantilla.id, QcPlantilla.nombre)
        .filter(QcPlantilla.id.in_(ids))
        .all()
    )
    return {pid: nombre for pid, nombre in filas}


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/calidad/plantillas
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/calidad/plantillas", summary="Listar plantillas de control de calidad")
def listar_plantillas(
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
    etapa: Optional[str] = Query(None, description="Filtrar por etapa"),
):
    query = db.query(QcPlantilla).options(joinedload(QcPlantilla.items))
    if etapa:
        query = query.filter(QcPlantilla.etapa == etapa)
    plantillas = query.order_by(QcPlantilla.id).all()
    return [p.to_dict() for p in plantillas]


# ──────────────────────────────────────────────────────────────────────────────
# POST /api/calidad/plantillas
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/calidad/plantillas", status_code=201, summary="Crear plantilla QC")
def crear_plantilla(
    datos: QcPlantillaCreateSchema,
    user: dict = Depends(require_permiso("calidad:crear")),
    db: Session = Depends(get_db),
):
    if datos.etapa not in ETAPAS_VALIDAS:
        raise HTTPException(status_code=400, detail=f"Etapa inválida: {datos.etapa}")

    plantilla = QcPlantilla(
        etapa=datos.etapa,
        nombre=datos.nombre,
        activa=datos.activa,
    )
    db.add(plantilla)
    db.flush()  # obtener plantilla.id

    for idx, item in enumerate(datos.items):
        db.add(QcPlantillaItem(
            plantilla_id=plantilla.id,
            descripcion=item.descripcion,
            orden=item.orden if item.orden is not None else idx + 1,
        ))

    auditoria.registrar(
        db, user, "crear", "qc_plantilla", plantilla.id,
        f"Creó la plantilla QC '{plantilla.nombre}' (etapa {plantilla.etapa})",
        datos={"etapa": plantilla.etapa, "nombre": plantilla.nombre,
               "items": len(datos.items)},
    )
    db.commit()

    return _get_plantilla(db, plantilla.id).to_dict()


# ──────────────────────────────────────────────────────────────────────────────
# PUT /api/calidad/plantillas/{id}
# ──────────────────────────────────────────────────────────────────────────────

@router.put("/calidad/plantillas/{plantilla_id}", summary="Actualizar plantilla QC")
def actualizar_plantilla(
    plantilla_id: int,
    datos: QcPlantillaUpdateSchema,
    user: dict = Depends(require_permiso("calidad:editar")),
    db: Session = Depends(get_db),
):
    plantilla = _get_plantilla(db, plantilla_id)

    if datos.etapa is not None:
        if datos.etapa not in ETAPAS_VALIDAS:
            raise HTTPException(status_code=400, detail=f"Etapa inválida: {datos.etapa}")
        plantilla.etapa = datos.etapa
    if datos.nombre is not None:
        plantilla.nombre = datos.nombre
    if datos.activa is not None:
        plantilla.activa = datos.activa
    if datos.items is not None:
        _sync_items(db, plantilla, datos.items)

    auditoria.registrar(
        db, user, "actualizar", "qc_plantilla", plantilla.id,
        f"Editó la plantilla QC '{plantilla.nombre}' (etapa {plantilla.etapa})",
    )
    db.commit()

    return _get_plantilla(db, plantilla_id).to_dict()


# ──────────────────────────────────────────────────────────────────────────────
# DELETE /api/calidad/plantillas/{id}
# ──────────────────────────────────────────────────────────────────────────────

@router.delete("/calidad/plantillas/{plantilla_id}", status_code=204,
               summary="Eliminar plantilla QC (soft si tiene registros)")
def eliminar_plantilla(
    plantilla_id: int,
    user: dict = Depends(require_permiso("calidad:borrar")),
    db: Session = Depends(get_db),
):
    plantilla = _get_plantilla(db, plantilla_id)

    tiene_registros = (
        db.query(QcRegistro.id)
        .filter(QcRegistro.plantilla_id == plantilla_id)
        .first()
        is not None
    )

    if tiene_registros:
        # Soft delete: conserva la plantilla para los registros históricos.
        plantilla.activa = False
        auditoria.registrar(
            db, user, "desactivar", "qc_plantilla", plantilla.id,
            f"Desactivó la plantilla QC '{plantilla.nombre}' (tiene registros asociados)",
        )
    else:
        auditoria.registrar(
            db, user, "eliminar", "qc_plantilla", plantilla.id,
            f"Eliminó la plantilla QC '{plantilla.nombre}' (etapa {plantilla.etapa})",
        )
        db.delete(plantilla)

    db.commit()


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/ordenes/{orden_id}/calidad
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/ordenes/{orden_id}/calidad",
            summary="Listar registros QC de una orden de trabajo")
def listar_registros_orden(
    orden_id: int,
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    if not db.query(OrdenTrabajo.id).filter(OrdenTrabajo.id == orden_id).first():
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")

    registros = (
        db.query(QcRegistro)
        .options(
            joinedload(QcRegistro.items),
            joinedload(QcRegistro.usuario),
        )
        .filter(QcRegistro.orden_trabajo_id == orden_id)
        .order_by(QcRegistro.created_at.desc(), QcRegistro.id.desc())
        .all()
    )
    nombres = _nombres_plantillas(db, registros)
    return [_registro_dict(r, nombres) for r in registros]


# ──────────────────────────────────────────────────────────────────────────────
# POST /api/ordenes/{orden_id}/calidad
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/ordenes/{orden_id}/calidad", status_code=201,
             summary="Registrar un control de calidad sobre una orden")
def crear_registro_orden(
    orden_id: int,
    datos: QcRegistroCreateSchema,
    user: dict = Depends(require_permiso("calidad:crear")),
    db: Session = Depends(get_db),
):
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == orden_id).first()
    if not orden:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")

    if datos.etapa not in ETAPAS_VALIDAS:
        raise HTTPException(status_code=400, detail=f"Etapa inválida: {datos.etapa}")
    if datos.resultado not in RESULTADOS_VALIDOS:
        raise HTTPException(status_code=400, detail=f"Resultado inválido: {datos.resultado}")

    if datos.plantilla_id is not None:
        if not db.query(QcPlantilla.id).filter(QcPlantilla.id == datos.plantilla_id).first():
            raise HTTPException(status_code=404, detail="Plantilla no encontrada")

    registro = QcRegistro(
        orden_trabajo_id=orden_id,  # el path manda, no el body
        etapa=datos.etapa,
        plantilla_id=datos.plantilla_id,
        user_id=user.get("id"),
        resultado=datos.resultado,
        observaciones=datos.observaciones,
    )
    db.add(registro)
    db.flush()  # obtener registro.id

    for item in datos.items:
        db.add(QcRegistroItem(
            registro_id=registro.id,
            item_descripcion=item.item_descripcion,
            cumple=item.cumple,
            valor=item.valor,
            observacion=item.observacion,
        ))

    auditoria.registrar(
        db, user, "crear", "qc_registro", registro.id,
        f"Registró control de calidad {datos.resultado} "
        f"(etapa {datos.etapa}) en la orden {orden.numero}",
        datos={"orden_trabajo_id": orden_id, "etapa": datos.etapa,
               "resultado": datos.resultado},
    )

    if datos.resultado == "rechazado":
        notificaciones_service.notificar(
            db,
            tipo="qc_rechazado",
            titulo=f"Control de calidad rechazado en {orden.numero}",
            mensaje=(
                f"La etapa {datos.etapa} de la orden {orden.numero} "
                f"fue rechazada en el control de calidad."
            ),
            link=f"/ordenes?search={orden.numero}",
            roles=["admin"],
        )

    db.commit()

    registro = (
        db.query(QcRegistro)
        .options(
            joinedload(QcRegistro.items),
            joinedload(QcRegistro.usuario),
        )
        .filter(QcRegistro.id == registro.id)
        .first()
    )
    return _registro_dict(registro, _nombres_plantillas(db, [registro]))
