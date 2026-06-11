"""
Router de Planificación de Producción — Etiplast ERP
=====================================================
Asignación de órdenes de trabajo a máquinas en rangos de fechas.
GET por rango/máquina/etapa, POST con warning de solapamiento (no bloquea),
PUT para reprogramar, DELETE. Todo audita; la asignación notifica.
"""
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from database import get_db
from dependencies import verify_token
from models import Maquina, OrdenTrabajo, PlanProduccion
from schemas import PlanProduccionCreateSchema, PlanProduccionUpdateSchema
from services import auditoria, notificaciones

router = APIRouter(prefix="/api", tags=["planificacion"])

ETAPAS_VALIDAS  = {"extrusion", "impresion", "troquelado"}
ESTADOS_VALIDOS = {"planificada", "en_curso", "terminada", "cancelada"}


# ──────────────────────────────────────────────────────────────────────────────
# Helpers internos
# ──────────────────────────────────────────────────────────────────────────────

def _eager_options():
    return [
        joinedload(PlanProduccion.orden_trabajo).joinedload(OrdenTrabajo.cliente),
        joinedload(PlanProduccion.maquina),
    ]


def _semana_actual() -> tuple[date, date]:
    """Lunes a domingo de la semana en curso."""
    hoy = date.today()
    lunes = hoy - timedelta(days=hoy.weekday())
    return lunes, lunes + timedelta(days=6)


def _plan_dict(plan: PlanProduccion) -> dict:
    """to_dict del modelo + datos de máquina/cliente que la grilla necesita."""
    d = plan.to_dict()
    d["maquina_tipo"]  = plan.maquina.tipo if plan.maquina else None
    d["cliente_marca"] = d.get("cliente_nombre")
    return d


def _detectar_solape(
    db: Session,
    maquina_id: int,
    fecha_inicio: Optional[date],
    fecha_fin: Optional[date],
    excluir_id: Optional[int] = None,
) -> Optional[PlanProduccion]:
    """
    Busca otro plan NO cancelado de la misma máquina cuyo rango de fechas
    se superponga con [fecha_inicio, fecha_fin]. Devuelve el primero o None.
    """
    if not fecha_inicio:
        return None
    fin = fecha_fin or fecha_inicio

    query = (
        db.query(PlanProduccion)
        .filter(
            PlanProduccion.maquina_id == maquina_id,
            PlanProduccion.estado != "cancelada",
            PlanProduccion.fecha_inicio.isnot(None),
            PlanProduccion.fecha_inicio <= fin,
        )
    )
    if excluir_id:
        query = query.filter(PlanProduccion.id != excluir_id)

    for otro in query.options(*_eager_options()).all():
        otro_fin = otro.fecha_fin or otro.fecha_inicio
        if otro_fin >= fecha_inicio:
            return otro
    return None


def _mensaje_solape(otro: PlanProduccion) -> str:
    ot_numero = otro.orden_trabajo.numero if otro.orden_trabajo else f"#{otro.orden_trabajo_id}"
    desde = otro.fecha_inicio.isoformat() if otro.fecha_inicio else "?"
    hasta = (otro.fecha_fin or otro.fecha_inicio)
    hasta = hasta.isoformat() if hasta else "?"
    maquina = otro.maquina.nombre if otro.maquina else "la máquina"
    return (
        f"La máquina {maquina} ya tiene planificada la orden {ot_numero} "
        f"entre {desde} y {hasta}. Se crea igual, revisá la carga."
    )


def _validar_payload(etapa: Optional[str], estado: Optional[str],
                     fecha_inicio: Optional[date], fecha_fin: Optional[date]):
    if etapa is not None and etapa not in ETAPAS_VALIDAS:
        raise HTTPException(status_code=400, detail=f"Etapa inválida: {etapa}. Válidas: {', '.join(sorted(ETAPAS_VALIDAS))}")
    if estado is not None and estado not in ESTADOS_VALIDOS:
        raise HTTPException(status_code=400, detail=f"Estado inválido: {estado}. Válidos: {', '.join(sorted(ESTADOS_VALIDOS))}")
    if fecha_inicio and fecha_fin and fecha_fin < fecha_inicio:
        raise HTTPException(status_code=400, detail="La fecha de fin no puede ser anterior a la de inicio")


def _get_maquina_activa(db: Session, maquina_id: int) -> Maquina:
    maquina = db.query(Maquina).filter(Maquina.id == maquina_id).first()
    if not maquina:
        raise HTTPException(status_code=404, detail="Máquina no encontrada")
    if not maquina.activa:
        raise HTTPException(status_code=400, detail=f"La máquina {maquina.nombre} está inactiva")
    return maquina


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/planificacion
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/planificacion", summary="Listar planes de producción por rango/máquina/etapa")
async def listar_planes(
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
    desde: Optional[date] = Query(None, description="Inicio del rango (default: lunes de la semana actual)"),
    hasta: Optional[date] = Query(None, description="Fin del rango (default: domingo de la semana actual)"),
    maquina_id: Optional[int] = Query(None, description="Filtrar por máquina"),
    etapa: Optional[str] = Query(None, description="Filtrar por etapa (extrusion|impresion|troquelado)"),
):
    if desde is None and hasta is None:
        desde, hasta = _semana_actual()
    elif desde is None:
        desde = hasta - timedelta(days=6)
    elif hasta is None:
        hasta = desde + timedelta(days=6)

    query = (
        db.query(PlanProduccion)
        .filter(
            PlanProduccion.fecha_inicio.isnot(None),
            PlanProduccion.fecha_inicio <= hasta,
        )
    )
    if maquina_id:
        query = query.filter(PlanProduccion.maquina_id == maquina_id)
    if etapa:
        query = query.filter(PlanProduccion.etapa == etapa)

    planes = (
        query
        .options(*_eager_options())
        .order_by(PlanProduccion.fecha_inicio.asc(), PlanProduccion.orden_prioridad.asc())
        .all()
    )

    # El solape por fecha_fin (nullable) se resuelve en Python: fin = fecha_fin o fecha_inicio.
    visibles = [p for p in planes if (p.fecha_fin or p.fecha_inicio) >= desde]
    return [_plan_dict(p) for p in visibles]


# ──────────────────────────────────────────────────────────────────────────────
# POST /api/planificacion
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/planificacion", summary="Planificar una orden de trabajo en una máquina")
async def crear_plan(
    payload: PlanProduccionCreateSchema,
    user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == payload.orden_trabajo_id).first()
    if not orden:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")

    maquina = _get_maquina_activa(db, payload.maquina_id)
    _validar_payload(payload.etapa, payload.estado, payload.fecha_inicio, payload.fecha_fin)

    solape = _detectar_solape(db, payload.maquina_id, payload.fecha_inicio, payload.fecha_fin)

    plan = PlanProduccion(
        orden_trabajo_id=payload.orden_trabajo_id,
        maquina_id=payload.maquina_id,
        etapa=payload.etapa,
        fecha_inicio=payload.fecha_inicio,
        fecha_fin=payload.fecha_fin,
        orden_prioridad=payload.orden_prioridad,
        estado=payload.estado,
        notas=payload.notas,
        created_by=user.get("id"),
    )
    db.add(plan)
    db.flush()

    auditoria.registrar(
        db, user, "crear", "plan_produccion", plan.id,
        f"Planificó {orden.numero} ({payload.etapa}) en {maquina.nombre} "
        f"del {payload.fecha_inicio} al {payload.fecha_fin or payload.fecha_inicio}",
        datos={"orden_trabajo_id": orden.id, "maquina_id": maquina.id, "solape": bool(solape)},
    )

    rango = f"del {payload.fecha_inicio} al {payload.fecha_fin or payload.fecha_inicio}"
    if orden.responsable_id:
        notificaciones.notificar(
            db, "plan_asignado",
            f"Orden {orden.numero} planificada",
            f"Se planificó la orden {orden.numero} ({payload.etapa}) en {maquina.nombre} {rango}.",
            link="/planificacion",
            user_ids=[orden.responsable_id],
        )
    else:
        notificaciones.notificar(
            db, "plan_asignado",
            f"Orden {orden.numero} planificada",
            f"Se planificó la orden {orden.numero} ({payload.etapa}) en {maquina.nombre} {rango}.",
            link="/planificacion",
            roles=["operario"],
        )

    db.commit()
    db.refresh(plan)

    resultado = _plan_dict(plan)
    if solape:
        resultado["warning"] = _mensaje_solape(solape)
    return resultado


# ──────────────────────────────────────────────────────────────────────────────
# PUT /api/planificacion/{plan_id}
# ──────────────────────────────────────────────────────────────────────────────

@router.put("/planificacion/{plan_id}", summary="Reprogramar / actualizar un plan de producción")
async def actualizar_plan(
    plan_id: int,
    payload: PlanProduccionUpdateSchema,
    user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    plan = (
        db.query(PlanProduccion)
        .options(*_eager_options())
        .filter(PlanProduccion.id == plan_id)
        .first()
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Plan de producción no encontrado")

    cambios = payload.model_dump(exclude_unset=True)

    if "orden_trabajo_id" in cambios:
        orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == cambios["orden_trabajo_id"]).first()
        if not orden:
            raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")

    if "maquina_id" in cambios:
        _get_maquina_activa(db, cambios["maquina_id"])

    fecha_inicio = cambios.get("fecha_inicio", plan.fecha_inicio)
    fecha_fin    = cambios.get("fecha_fin", plan.fecha_fin)
    _validar_payload(cambios.get("etapa"), cambios.get("estado"), fecha_inicio, fecha_fin)

    for campo, valor in cambios.items():
        setattr(plan, campo, valor)

    solape = _detectar_solape(db, plan.maquina_id, plan.fecha_inicio, plan.fecha_fin, excluir_id=plan.id)

    ot_numero = plan.orden_trabajo.numero if plan.orden_trabajo else f"#{plan.orden_trabajo_id}"
    auditoria.registrar(
        db, user, "actualizar", "plan_produccion", plan.id,
        f"Reprogramó el plan de {ot_numero}: {', '.join(sorted(cambios.keys()))}",
        datos={k: (v.isoformat() if isinstance(v, date) else v) for k, v in cambios.items()},
    )

    db.commit()
    db.refresh(plan)

    resultado = _plan_dict(plan)
    if solape:
        resultado["warning"] = _mensaje_solape(solape)
    return resultado


# ──────────────────────────────────────────────────────────────────────────────
# DELETE /api/planificacion/{plan_id}
# ──────────────────────────────────────────────────────────────────────────────

@router.delete("/planificacion/{plan_id}", status_code=204, summary="Eliminar un plan de producción")
async def eliminar_plan(
    plan_id: int,
    user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    plan = (
        db.query(PlanProduccion)
        .options(*_eager_options())
        .filter(PlanProduccion.id == plan_id)
        .first()
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Plan de producción no encontrado")

    ot_numero = plan.orden_trabajo.numero if plan.orden_trabajo else f"#{plan.orden_trabajo_id}"
    maquina   = plan.maquina.nombre if plan.maquina else f"#{plan.maquina_id}"
    auditoria.registrar(
        db, user, "eliminar", "plan_produccion", plan.id,
        f"Eliminó el plan de {ot_numero} en {maquina}",
    )

    db.delete(plan)
    db.commit()
    return None
