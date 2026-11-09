"""
Router de Órdenes de Trabajo — Etiplast ERP
============================================
CRUD completo de órdenes de trabajo con manejo de bobinas de extrusión.
Genera números correlativos tipo OT-0001.
"""
import json
from datetime import date, datetime, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from core.bloqueos import con_bloqueos
from core.database import get_db
from core.security import require_permiso, verify_token
from models import (
    ETAPA_CIERRE, ETAPAS_CON_MAQUINA, ETAPAS_ESCANEABLES, Cliente, ClienteProducto, Maquina,
    OrdenExtrusionBobina, OrdenTrabajo, PlanProduccion, User,
)
from schemas import (
    EscaneoEtapaSchema, OrdenCreateSchema, OrdenUpdateSchema,
    RehacerOrdenSchema,
)
from services import auditoria
from services.extrusion import calcular_metros_extrusion
from services.numeracion import generar_numero

router = APIRouter(prefix="/api", tags=["ordenes"])

# Estados válidos de una OT (ver models.OrdenTrabajo).
ESTADOS_ORDEN = ("borrador", "pendiente", "en_proceso", "completada", "cancelada")


# ──────────────────────────────────────────────────────────────────────────────
# Helpers internos
# ──────────────────────────────────────────────────────────────────────────────

def _eager_options():
    return [
        joinedload(OrdenTrabajo.cliente),
        joinedload(OrdenTrabajo.cliente_producto),
        joinedload(OrdenTrabajo.bobinas),
        joinedload(OrdenTrabajo.creador),
        joinedload(OrdenTrabajo.responsable),
    ]


def _to_float(value) -> Optional[float]:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def _to_int(value) -> Optional[int]:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def _parse_date(raw) -> Optional[date]:
    """Parseo defensivo de fecha ISO 'YYYY-MM-DD'. None si vacío o inválido (nunca 500)."""
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except (ValueError, TypeError):
        return None


def _resolver_maquina_impresion(db: Session, valor) -> Optional[str]:
    """Paso 0 de la OT: valida la impresora elegida y devuelve su nombre del catálogo.

    Acepta el nombre o el código de la máquina (sin importar mayúsculas ni
    espacios de más) y guarda siempre el nombre, que es lo que lee la gente de
    planta. Vacío o None = todavía no eligieron, y eso se permite.
    Si la máquina no está en el catálogo, no es de impresión o está dada de
    baja, corta con 400 y un mensaje que se entiende sin ser técnico.
    """
    if valor is None:
        return None
    texto = str(valor).strip()
    if not texto:
        return None

    impresoras = (
        db.query(Maquina)
        .filter(Maquina.tipo == "impresion", Maquina.activa.is_(True))
        .order_by(Maquina.nombre)
        .all()
    )
    buscado = texto.casefold()
    for m in impresoras:
        if buscado in ((m.nombre or "").strip().casefold(),
                       (m.codigo or "").strip().casefold()):
            return m.nombre

    disponibles = ", ".join(m.nombre for m in impresoras) or "no hay ninguna cargada"
    raise HTTPException(
        status_code=400,
        detail=(
            f"La máquina de impresión «{texto}» no figura en el listado. "
            f"Elegí una de estas: {disponibles}."
        ),
    )


def _alto_del_producto(db: Session, cliente_producto_id) -> Optional[float]:
    """El alto (en cm) que tiene cargado la ficha del producto elegido."""
    if not cliente_producto_id:
        return None
    pr = (
        db.query(ClienteProducto)
        .filter(ClienteProducto.id == cliente_producto_id)
        .first()
    )
    return _to_float(pr.alto) if pr else None


def _metros_extrusion(metros_enviados, cantidad, alto_cm) -> Optional[float]:
    """Los metros de film que se guardan en la orden.

    Si el que carga escribió los metros, mandan los de él: la pantalla ya hizo
    la cuenta y además el operario puede corregirla. Si no vinieron —una orden
    dada de alta por la API o por el agente de voz—, el backend la hace igual
    con la fórmula única de `services/extrusion.py`, así ninguna orden con
    cantidad y alto queda sin saber cuánto film preparar.
    """
    if metros_enviados is not None:
        return _to_float(metros_enviados)
    return calcular_metros_extrusion(cantidad, alto_cm)


def _sync_bobinas(db: Session, orden: OrdenTrabajo, bobinas_data: List[Dict]):
    """Reemplaza las bobinas de la orden con la lista enviada."""
    for b in list(orden.bobinas):
        db.delete(b)
    db.flush()
    for row in bobinas_data:
        db.add(OrdenExtrusionBobina(
            orden_id=orden.id,
            metros=_to_float(row.get("metros")),
            kg_bob=_to_float(row.get("kg_bob")),
            numero_lote=(row.get("numero_lote") or None),
        ))


def _autogenerar_lote(orden: OrdenTrabajo) -> str:
    """Genera el lote de trazabilidad: L-YYYYMMDD-NNNN (sufijo del número de OT)."""
    sufijo = orden.numero.split("-", 1)[-1] if orden.numero else str(orden.id)
    return f"L-{date.today().strftime('%Y%m%d')}-{sufijo}"


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/ordenes
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/ordenes", summary="Listar órdenes de trabajo con paginación y filtros")
def listar_ordenes(
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    estado: Optional[str] = Query(None, description="Filtrar por estado"),
    cliente_id: Optional[int] = Query(None, description="Filtrar por cliente"),
    search: Optional[str] = Query(None, description="Buscar por número o cliente"),
):
    query = db.query(OrdenTrabajo)

    if estado:
        query = query.filter(OrdenTrabajo.estado == estado)

    if cliente_id:
        query = query.filter(OrdenTrabajo.cliente_id == cliente_id)

    if search:
        f = f"%{search}%"
        query = (
            query
            .outerjoin(Cliente, Cliente.id == OrdenTrabajo.cliente_id)
            .filter(
                OrdenTrabajo.numero.ilike(f) |
                Cliente.marca.ilike(f) |
                Cliente.razon_social.ilike(f)
            )
            .distinct()
        )

    total = query.count()

    ordenes = (
        query
        .options(*_eager_options())
        .order_by(OrdenTrabajo.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return {
        "data":        [o.to_dict() for o in ordenes],
        "total":       total,
        "page":        page,
        "per_page":    per_page,
        "total_pages": -(-total // per_page) if total else 0,
    }


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/ordenes/{id}
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/ordenes/{orden_id}", summary="Obtener orden de trabajo por ID")
def obtener_orden(
    orden_id: int,
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    orden = (
        db.query(OrdenTrabajo)
        .options(*_eager_options())
        .filter(OrdenTrabajo.id == orden_id)
        .first()
    )
    if not orden:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")
    return orden.to_dict()


# ──────────────────────────────────────────────────────────────────────────────
# POST /api/ordenes
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/ordenes", status_code=201, summary="Crear nueva orden de trabajo")
# Numera con advisory lock: se suelta antes de responder cualquier error.
@con_bloqueos()
def crear_orden(
    payload: OrdenCreateSchema,
    user: dict = Depends(require_permiso("ordenes:crear")),
    db: Session = Depends(get_db),
):
    # exclude_none: las claves ausentes/None se omiten (los `.get(k, default)` siguen
    # funcionando, p.ej. bobinas/impresion_colores no se convierten en None).
    datos = payload.model_dump(exclude_none=True)

    cliente_id = datos.get("cliente_id")
    if not cliente_id:
        raise HTTPException(status_code=400, detail="cliente_id es requerido")

    if not db.query(Cliente).filter(Cliente.id == cliente_id).first():
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    # Validar cliente_producto_id si viene
    cliente_producto_id = datos.get("cliente_producto_id")
    if cliente_producto_id:
        if not db.query(ClienteProducto).filter(ClienteProducto.id == cliente_producto_id).first():
            raise HTTPException(status_code=404, detail="Producto de cliente no encontrado")

    estado = datos.get("estado", "borrador")
    if estado not in ESTADOS_ORDEN:
        raise HTTPException(status_code=400, detail=f"Estado inválido: {estado}")

    numero = generar_numero(db, OrdenTrabajo, "OT")

    # Colores: lista de hasta 6 strings
    colores = datos.get("impresion_colores", [])
    colores_json = json.dumps(colores) if colores else None

    # Fecha (parse defensivo; default hoy)
    fecha = _parse_date(datos.get("fecha")) or date.today()

    # Paso 0: con qué impresora se hace la orden (valida contra el catálogo)
    impresion_maquina = _resolver_maquina_impresion(db, datos.get("impresion_maquina"))

    # Metros de film: el alto sale de la ficha del producto, salvo que en la
    # pantalla lo hayan corregido a mano (y entonces viaja en troquelado_alto).
    alto_cm = datos.get("troquelado_alto")
    if alto_cm is None:
        alto_cm = _alto_del_producto(db, cliente_producto_id)
    extrusion_metros = _metros_extrusion(
        datos.get("extrusion_metros"), datos.get("cantidad"), alto_cm
    )

    orden = OrdenTrabajo(
        numero=numero,
        cliente_id=cliente_id,
        cliente_producto_id=cliente_producto_id,
        fecha=fecha,
        estado=estado,
        created_by=user.get("id"),
        responsable_id=_to_int(datos.get("responsable_id")),
        operador=datos.get("operador"),

        extrusion_ancho=_to_float(datos.get("extrusion_ancho")),
        extrusion_color=datos.get("extrusion_color"),
        extrusion_trat=datos.get("extrusion_trat"),
        extrusion_espesor=_to_float(datos.get("extrusion_espesor")),
        extrusion_cant_bob=_to_int(datos.get("extrusion_cant_bob")),
        extrusion_metros=extrusion_metros,
        extrusion_formulacion=datos.get("extrusion_formulacion"),
        extrusion_maquina=datos.get("extrusion_maquina"),
        extrusion_observaciones=datos.get("extrusion_observaciones"),
        operador_extrusion=datos.get("operador_extrusion"),

        impresion_frente=datos.get("impresion_frente"),
        impresion_retroverso=datos.get("impresion_retroverso"),
        impresion_observaciones=datos.get("impresion_observaciones"),
        impresion_cilindro=_to_float(datos.get("impresion_cilindro")),
        impresion_colores=colores_json,
        impresion_maquina=impresion_maquina,
        operador_impresion=datos.get("operador_impresion"),

        troquelado_ancho=_to_float(datos.get("troquelado_ancho")),
        troquelado_cierre=_to_float(datos.get("troquelado_cierre")),
        troquelado_alto=_to_float(datos.get("troquelado_alto")),
        troquelado_envase=datos.get("troquelado_envase"),
        troquelado_maquina=datos.get("troquelado_maquina"),
        troquelado_observaciones=datos.get("troquelado_observaciones"),
        operador_troquelado=datos.get("operador_troquelado"),

        control_calidad=datos.get("control_calidad"),

        fecha_comprometida=_parse_date(datos.get("fecha_comprometida")),
        fecha_diseno=_parse_date(datos.get("fecha_diseno")),
        fecha_preprensa=_parse_date(datos.get("fecha_preprensa")),
        fecha_extrusion=_parse_date(datos.get("fecha_extrusion")),
        fecha_impresion=_parse_date(datos.get("fecha_impresion")),
        fecha_troquelado=_parse_date(datos.get("fecha_troquelado")),
        fecha_entrega=_parse_date(datos.get("fecha_entrega")),

        cantidad=_to_int(datos.get("cantidad")),
        total_final=_to_float(datos.get("total_final")),
        observaciones=datos.get("observaciones"),
    )
    db.add(orden)
    db.flush()  # obtener orden.id

    bobinas_data = datos.get("bobinas", [])
    for row in bobinas_data:
        db.add(OrdenExtrusionBobina(
            orden_id=orden.id,
            metros=_to_float(row.get("metros")),
            kg_bob=_to_float(row.get("kg_bob")),
            numero_lote=(row.get("numero_lote") or None),
        ))

    auditoria.registrar(
        db, user, "crear", "orden_trabajo", orden.id, f"Creó orden {orden.numero}",
        datos={"numero": orden.numero, "cliente_id": orden.cliente_id, "estado": orden.estado,
               "impresion_maquina": orden.impresion_maquina,
               "cantidad": orden.cantidad, "extrusion_metros": extrusion_metros},
    )
    db.commit()

    orden = (
        db.query(OrdenTrabajo)
        .options(*_eager_options())
        .filter(OrdenTrabajo.id == orden.id)
        .first()
    )
    return orden.to_dict()


# ──────────────────────────────────────────────────────────────────────────────
# PUT /api/ordenes/{id}
# ──────────────────────────────────────────────────────────────────────────────

@router.put("/ordenes/{orden_id}", summary="Actualizar orden de trabajo")
def actualizar_orden(
    orden_id: int,
    payload: OrdenUpdateSchema,
    user: dict = Depends(require_permiso("ordenes:editar")),
    db: Session = Depends(get_db),
):
    # exclude_unset: solo los campos enviados → actualización parcial (`if k in datos`).
    datos = payload.model_dump(exclude_unset=True)

    orden = (
        db.query(OrdenTrabajo)
        .options(*_eager_options())
        .filter(OrdenTrabajo.id == orden_id)
        .first()
    )
    if not orden:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")

    antes = {"estado": orden.estado, "cliente_id": orden.cliente_id,
             "fecha": orden.fecha.isoformat() if orden.fecha else None}

    # Campos simples
    if "estado" in datos:
        if datos["estado"] not in ESTADOS_ORDEN:
            raise HTTPException(status_code=400, detail=f"Estado inválido: {datos['estado']}")
        orden.estado = datos["estado"]
        # Trazabilidad: al pasar a producción, autogenerar lote si no tiene
        if orden.estado == "en_proceso" and not orden.lote:
            orden.lote = _autogenerar_lote(orden)
    if "responsable_id" in datos:
        orden.responsable_id = _to_int(datos["responsable_id"])
    if "operador" in datos:
        orden.operador = datos["operador"]
    if "cliente_producto_id" in datos:
        orden.cliente_producto_id = datos["cliente_producto_id"]
    if "fecha" in datos and datos["fecha"]:
        orden.fecha = _parse_date(datos["fecha"])

    campos_extrusion_text = [
        "extrusion_color", "extrusion_trat", "extrusion_formulacion",
        "extrusion_maquina", "extrusion_observaciones", "operador_extrusion",
    ]
    for campo in campos_extrusion_text:
        if campo in datos:
            setattr(orden, campo, datos[campo])
    if "extrusion_ancho" in datos:
        orden.extrusion_ancho = _to_float(datos["extrusion_ancho"])
    if "extrusion_espesor" in datos:
        orden.extrusion_espesor = _to_float(datos["extrusion_espesor"])
    if "extrusion_cant_bob" in datos:
        orden.extrusion_cant_bob = _to_int(datos["extrusion_cant_bob"])

    campos_impresion_text = [
        "impresion_frente", "impresion_retroverso",
        "impresion_observaciones", "operador_impresion",
    ]
    for campo in campos_impresion_text:
        if campo in datos:
            setattr(orden, campo, datos[campo])
    if "impresion_cilindro" in datos:
        orden.impresion_cilindro = _to_float(datos["impresion_cilindro"])

    if "impresion_maquina" in datos:
        orden.impresion_maquina = _resolver_maquina_impresion(db, datos["impresion_maquina"])

    if "impresion_colores" in datos:
        colores = datos["impresion_colores"]
        orden.impresion_colores = json.dumps(colores) if colores else None

    campos_troquelado_text = [
        "troquelado_envase", "troquelado_maquina",
        "troquelado_observaciones", "operador_troquelado",
    ]
    for campo in campos_troquelado_text:
        if campo in datos:
            setattr(orden, campo, datos[campo])
    if "troquelado_ancho" in datos:
        orden.troquelado_ancho = _to_float(datos["troquelado_ancho"])
    if "troquelado_cierre" in datos:
        orden.troquelado_cierre = _to_float(datos["troquelado_cierre"])
    if "troquelado_alto" in datos:
        orden.troquelado_alto = _to_float(datos["troquelado_alto"])

    if "control_calidad" in datos:
        orden.control_calidad = datos["control_calidad"]

    # Fechas por etapa (parse defensivo)
    for fecha_campo in ("fecha_comprometida",
                        "fecha_diseno", "fecha_preprensa", "fecha_extrusion",
                        "fecha_impresion", "fecha_troquelado", "fecha_entrega"):
        if fecha_campo in datos:
            setattr(orden, fecha_campo, _parse_date(datos[fecha_campo]))

    if "cantidad" in datos:
        orden.cantidad = _to_int(datos["cantidad"])

    # Metros de film: si vinieron escritos, se respetan tal cual. Si no, pero
    # cambió algo de lo que entra en la cuenta (cantidad, alto o producto), se
    # rehace con lo que quedó guardado en la orden: dejar los metros viejos con
    # una cantidad nueva sería mandar a extrusión un número que ya no es.
    if "extrusion_metros" in datos:
        orden.extrusion_metros = _to_float(datos["extrusion_metros"])
    elif any(c in datos for c in ("cantidad", "troquelado_alto", "cliente_producto_id")):
        alto_cm = orden.troquelado_alto
        if alto_cm is None:
            alto_cm = _alto_del_producto(db, orden.cliente_producto_id)
        orden.extrusion_metros = calcular_metros_extrusion(orden.cantidad, alto_cm)

    if "total_final" in datos:
        orden.total_final = _to_float(datos["total_final"])
    if "observaciones" in datos:
        orden.observaciones = datos["observaciones"]

    # Bobinas: si viene la lista, reemplazar completa
    if "bobinas" in datos:
        _sync_bobinas(db, orden, datos["bobinas"] or [])

    auditoria.registrar(
        db, user, "actualizar", "orden_trabajo", orden.id, f"Actualizó orden {orden.numero}",
        datos={"antes": antes, "campos": sorted(datos.keys()),
               "despues": {"estado": orden.estado,
                           "extrusion_metros": _to_float(orden.extrusion_metros)}},
    )
    db.commit()

    orden = (
        db.query(OrdenTrabajo)
        .options(*_eager_options())
        .filter(OrdenTrabajo.id == orden_id)
        .first()
    )
    return orden.to_dict()


# ──────────────────────────────────────────────────────────────────────────────
# DELETE /api/ordenes/{id}
# ──────────────────────────────────────────────────────────────────────────────

@router.delete("/ordenes/{orden_id}", status_code=204, summary="Eliminar orden de trabajo (solo admin)")
def eliminar_orden(
    orden_id: int,
    user: dict = Depends(require_permiso("ordenes:borrar")),
    db: Session = Depends(get_db),
):
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == orden_id).first()
    if not orden:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")
    auditoria.registrar(
        db, user, "eliminar", "orden_trabajo", orden.id,
        f"Eliminó orden {orden.numero}",
    )
    db.delete(orden)
    db.commit()


# ──────────────────────────────────────────────────────────────────────────────
# POST /api/ordenes/{orden_id}/etapa  — el escaneo del QR
# ──────────────────────────────────────────────────────────────────────────────

def _nombre_de(db: Session, user: dict) -> str:
    """Nombre y apellido del usuario del token, para firmar el paso."""
    u = db.query(User).filter(User.id == user.get("id")).first()
    if not u:
        return user.get("email") or ""
    return " ".join(p for p in (u.nombre, u.apellido) if p).strip() or u.email


# ──────────────────────────────────────────────────────────────────────────────
# POST /api/ordenes/{orden_id}/rehacer  — el retrabajo del RF-16
# ──────────────────────────────────────────────────────────────────────────────

# Lo que describe QUÉ hay que fabricar: la especificación del trabajo. Es lo
# único que hereda la orden nueva.
#
# Lo que NO está en esta lista es deliberado y es la mitad del requerimiento:
# las `fecha_*` por etapa, los `operador_*`, el lote, el cierre y la
# verificación describen lo que YA SE HIZO, y eso pertenece a la orden original.
# Copiarlo al rehecho lo haría nacer con una producción que nadie ejecutó.
CAMPOS_ESPECIFICACION = (
    "cliente_id", "cliente_producto_id", "responsable_id",
    "extrusion_ancho", "extrusion_color", "extrusion_trat", "extrusion_espesor",
    "extrusion_cant_bob", "extrusion_metros", "extrusion_formulacion",
    "extrusion_maquina", "extrusion_observaciones",
    "impresion_frente", "impresion_retroverso", "impresion_observaciones",
    "impresion_cilindro", "impresion_colores", "impresion_maquina",
    "troquelado_ancho", "troquelado_cierre", "troquelado_alto",
    "troquelado_envase", "troquelado_maquina", "troquelado_observaciones",
    "cantidad", "total_final",
)


@router.post("/ordenes/{orden_id}/rehacer", status_code=201,
             summary="Marcar que una orden debe rehacerse y abrir el retrabajo (RF-16)")
def rehacer_orden(
    orden_id: int,
    payload: RehacerOrdenSchema,
    user: dict = Depends(require_permiso("ordenes:crear")),
    db: Session = Depends(get_db),
):
    """
    Registra que una orden debe rehacerse y abre la orden del retrabajo.

    NO reabre la original, y ésa es la decisión central: el requerimiento pide
    conservar el registro de la producción original, y reabrirla dejaría que el
    escaneo del trabajo nuevo pise los operarios, las máquinas y las fechas del
    trabajo que sí se hizo. El rechazo —que es justamente lo que la empresa
    necesita poder medir— desaparecería del historial.

    Quedan entonces dos órdenes y dos hechos separados: la original, marcada con
    su motivo, y el rehecho, que hereda la especificación y apunta a ella.

    Pide permiso de ALTA y no de edición: lo que hace es crear una orden.
    """
    motivo = (payload.motivo or "").strip()
    if not motivo:
        raise HTTPException(
            status_code=400,
            detail="Hace falta el motivo: un rechazo sin motivo no se puede analizar después",
        )

    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == orden_id).first()
    if not orden:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")
    if orden.rehacer:
        raise HTTPException(
            status_code=409,
            detail=f"La orden ya está marcada para rehacer: «{orden.rehacer_motivo}»",
        )

    # — La marca sobre la original. Nada más se toca —
    orden.rehacer = True
    orden.rehacer_motivo = motivo
    orden.rehacer_en = datetime.now(timezone.utc)
    orden.rehacer_por = user.get("id")

    # — El retrabajo: especificación heredada, producción en blanco —
    nueva = OrdenTrabajo(
        numero=generar_numero(db, OrdenTrabajo, "OT"),
        fecha=date.today(),
        estado="pendiente",
        created_by=user.get("id"),
        rehace_a_id=orden.id,
        # El plazo NO se hereda: el de la orden que falló ya está vencido o por
        # vencer, y arrastrarlo contaría como atraso del rehecho un
        # incumplimiento que todavía no ocurrió. Se renegocia con el cliente.
        fecha_comprometida=None,
        observaciones=f"Rehace la orden {orden.numero}. Motivo: {motivo}",
        **{c: getattr(orden, c) for c in CAMPOS_ESPECIFICACION},
    )
    db.add(nueva)
    db.flush()

    auditoria.registrar(
        db, user, "rehacer", "orden_trabajo", orden.id,
        f"Se marcó {orden.numero} para rehacer. Motivo: {motivo}",
        datos={"motivo": motivo, "orden_nueva_id": nueva.id,
               "orden_nueva_numero": nueva.numero},
    )
    db.commit()
    db.refresh(orden)
    db.refresh(nueva)

    return {"original": orden.to_dict(), "nueva": nueva.to_dict()}


# ──────────────────────────────────────────────────────────────────────────────
# POST / DELETE /api/ordenes/{orden_id}/verificar  — la verificación del RF-11
# ──────────────────────────────────────────────────────────────────────────────

# Mensaje único: lo usan el rechazo del cierre y la advertencia, y tienen que
# decir lo mismo.
_FALTA_VERIFICAR = (
    "La orden no está verificada: el responsable de producción tiene que "
    "revisar las etapas cargadas antes de darla por terminada."
)


@router.post("/ordenes/{orden_id}/verificar",
             summary="El responsable verifica las etapas cargadas (RF-11)")
def verificar_orden(
    orden_id: int,
    user: dict = Depends(require_permiso("ordenes:editar")),
    db: Session = Depends(get_db),
):
    """
    Deja constancia de que el responsable revisó lo que cargaron los operarios.
    Sin esto el cierre se rechaza (ver `registrar_etapa`).

    Quién verifica sale del TOKEN y nunca del request, por lo mismo que el
    cierre: una constancia que el cliente puede firmar a nombre de otro no es
    una constancia.
    """
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == orden_id).first()
    if not orden:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")
    if orden.estado == "cancelada":
        raise HTTPException(
            status_code=409,
            detail="La orden está cancelada: no hay nada que verificar",
        )

    orden.verificado_por = user.get("id")
    orden.verificado_en = datetime.now(timezone.utc)

    auditoria.registrar(
        db, user, "verificar", "orden_trabajo", orden.id,
        f"Verificación de las etapas de {orden.numero}",
        datos={"verificado_por": orden.verificado_por},
    )
    db.commit()
    db.refresh(orden)
    return orden.to_dict()


@router.delete("/ordenes/{orden_id}/verificar",
               summary="Dar marcha atrás una verificación")
def desverificar_orden(
    orden_id: int,
    user: dict = Depends(require_permiso("ordenes:editar")),
    db: Session = Depends(get_db),
):
    """
    Se verificó y después apareció algo para corregir. Vuelve a trabar el
    cierre hasta que se verifique de nuevo.
    """
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == orden_id).first()
    if not orden:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")

    orden.verificado_por = None
    orden.verificado_en = None

    auditoria.registrar(
        db, user, "desverificar", "orden_trabajo", orden.id,
        f"Se dio marcha atrás la verificación de {orden.numero}",
    )
    db.commit()
    db.refresh(orden)
    return orden.to_dict()


@router.post("/ordenes/{orden_id}/etapa", status_code=201,
             summary="Registrar el paso de una orden por una máquina (escaneo del QR)")
def registrar_etapa(
    orden_id: int,
    payload: EscaneoEtapaSchema,
    user: dict = Depends(require_permiso("ordenes:editar")),
    db: Session = Depends(get_db),
):
    """
    El operario escanea el QR de la ficha ANTES de arrancar su paso y elige la
    máquina. Este es el único evento de producción del sistema: de acá sale
    dónde está cada pedido.

    Endpoint propio y no el PUT genérico a propósito: el PUT deja que el cliente
    mande cualquier `operador_*`, y la atribución de quién hizo el trabajo no
    puede salir del request.

    El mismo QR cierra la orden: con `etapa="finalizado"` la saca de la máquina,
    la pone en `completada` y firma el cierre. No es una etapa de planta (ver
    `ETAPA_CIERRE` en models/produccion.py), así que no pide máquina y no
    escribe en las columnas por etapa de la ficha, sino en `fecha_cierre` y
    `operador_cierre`.
    """
    etapa = (payload.etapa or "").strip().lower()
    if etapa not in ETAPAS_ESCANEABLES:
        raise HTTPException(
            status_code=400,
            detail=f"Etapa inválida: {payload.etapa}. Son {', '.join(ETAPAS_ESCANEABLES)}",
        )
    cierre = etapa == ETAPA_CIERRE

    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == orden_id).first()
    if not orden:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")
    if orden.estado == "cancelada":
        raise HTTPException(status_code=409, detail="La orden está cancelada: no se puede escanear")

    # Sólo impresión elige máquina. Venus, ReinaFlex, Taurus y la Autoadhesiva
    # hacen cosas distintas; en extrusión y troquelado son intercambiables y lo
    # único que importa es que la etapa pasó. Si mandan una máquina en una etapa
    # que no la usa, se ignora: guardarla sería inventar un dato que nadie eligió.
    maquina = None
    if etapa in ETAPAS_CON_MAQUINA:
        if payload.maquina_id is None:
            raise HTTPException(
                status_code=400,
                detail=f"Falta la máquina: en {etapa} hay que elegir en cuál se hace",
            )
        maquina = db.query(Maquina).filter(Maquina.id == payload.maquina_id).first()
        if not maquina or not maquina.activa:
            raise HTTPException(status_code=400, detail="Máquina inexistente o dada de baja")
        if (maquina.tipo or "").strip().lower() != etapa:
            raise HTTPException(
                status_code=400,
                detail=f"La máquina «{maquina.nombre}» no es de {etapa}",
            )

    hoy = date.today()

    # Cerrar una orden que no tiene UN SOLO pase significa una de dos cosas, y
    # las dos importan: o los operarios nunca escanearon —y entonces el tablero
    # estuvo mintiendo todo el pedido— o la orden nunca se produjo. Se permite
    # igual (la oficina puede cerrar una entrega hecha con stock), pero vuelve
    # como `advertencia` para que la pantalla del escaneo lo diga EN EL MOMENTO,
    # que es cuando se puede averiguar. Después nadie distingue esa orden de una
    # que recorrió la planta entera. Se mira antes de agregar el pase del cierre.
    # El cierre exige la verificación del responsable (RF-11), y el límite es
    # tener responsable asignado: si la orden no tiene, no hay quién verifique
    # y trabar el cierre la dejaría muerta para siempre. En ese caso se cierra
    # igual y se avisa, con el mismo criterio que la advertencia de abajo.
    if cierre and orden.responsable_id and not orden.verificado_en:
        raise HTTPException(status_code=409, detail=_FALTA_VERIFICAR)

    advertencia = None
    if cierre and not orden.responsable_id and not orden.verificado_en:
        advertencia = (
            "Se cierra sin verificación porque la orden no tiene responsable "
            "de producción asignado: nadie revisó las etapas cargadas."
        )

    if cierre and advertencia is None and not db.query(
        db.query(PlanProduccion)
        .filter(PlanProduccion.orden_trabajo_id == orden.id)
        .exists()
    ).scalar():
        advertencia = (
            "Se cierra sin ningún escaneo de planta: esta orden no registra "
            "paso por extrusión, impresión ni troquelado."
        )

    # Dos liberaciones, y las dos van ANTES de crear el pase nuevo:
    #   - la orden suelta donde estaba (avanzó de etapa, o se cerró),
    #   - y si esta etapa usa máquina, la máquina suelta lo que tuviera encima.
    filtros = [PlanProduccion.orden_trabajo_id == orden.id]
    if maquina is not None:
        filtros.append(PlanProduccion.maquina_id == maquina.id)
    for filtro in filtros:
        db.query(PlanProduccion).filter(
            filtro, PlanProduccion.estado == "en_curso",
        ).update({"estado": "terminada", "fecha_fin": hoy}, synchronize_session=False)

    # El pase del cierre nace TERMINADO, y los de planta `en_curso`: un pase
    # abierto significa «la orden ESTÁ ahí ahora» (ver ESTADOS_PASE), y la orden
    # cerrada no está en ninguna parte. Dejarlo abierto la mostraría ocupando un
    # lugar para siempre y le ensuciaría el contador de pases abiertos a
    # `/api/produccion/version`.
    pase = PlanProduccion(
        orden_trabajo_id=orden.id,
        maquina_id=maquina.id if maquina else None,
        etapa=etapa,
        estado="terminada" if cierre else "en_curso",
        fecha_inicio=hoy,
        fecha_fin=hoy if cierre else None,
        notas=(payload.notas or None),
        created_by=user.get("id"),
    )
    db.add(pase)

    if cierre:
        # El cierre NO pasa por el `setattr(orden, f"fecha_{etapa}")` de abajo:
        # no hay `fecha_finalizado` ni `operador_finalizado`, así que el
        # `setattr` genérico escribiría un atributo suelto en el objeto Python y
        # el dato se perdería en el commit SIN UN SOLO ERROR. Van a las columnas
        # propias del cierre.
        #
        # `fecha_cierre` es TIMESTAMPTZ y se escribe con la hora completa, no
        # con `hoy`: el tablero muestra hace cuánto se cerró.
        #
        # Y el que firma sale del TOKEN, no de `payload.operario`. En las etapas
        # de planta ese campo existe para la tablet compartida —quién está
        # realmente en la máquina—, pero el cierre no se hace en una máquina: es
        # la decisión de dar el pedido por terminado, y queda firmada por la
        # cuenta que la tomó. Si pudiera venir en el request, cualquiera podría
        # cerrar órdenes a nombre de otro, que es justo lo que este endpoint
        # existe para impedir.
        operario = _nombre_de(db, user)
        orden.fecha_cierre = datetime.now(timezone.utc)
        orden.operador_cierre = operario[:150] or None
    else:
        # La ficha de siempre se sigue llenando: `fecha_*`, `operador_*` y
        # `*_maquina` son los campos que hoy se escriben a mano en el papel y
        # nunca vuelven al sistema. El escaneo los completa solo, y así el PDF
        # impreso y las pantallas viejas no se enteran de que cambió nada debajo.
        operario = (payload.operario or "").strip() or _nombre_de(db, user)
        setattr(orden, f"fecha_{etapa}", hoy)
        setattr(orden, f"operador_{etapa}", operario[:150] or None)
        # `*_maquina` sólo se pisa si esta etapa eligió una. Si no, se respeta lo
        # que haya cargado la oficina (el paso 0 ya elige la impresora).
        if maquina is not None:
            setattr(orden, f"{etapa}_maquina", (maquina.nombre or "")[:100] or None)

    # El escaneo del cierre es el ÚNICO que mueve la orden a `completada`: hasta
    # ahora sólo se podía editándola a mano, así que el paso 5 del tablero
    # estaba vacío y no había forma de medir el pedido de punta a punta.
    #
    # Las tres etapas de planta siguen sin cerrar nada: empezar a troquelar no
    # es haber terminado. Lo único que infieren es el arranque.
    if cierre:
        orden.estado = "completada"
    elif orden.estado in ("borrador", "pendiente"):
        orden.estado = "en_proceso"
    if not orden.lote:
        orden.lote = _autogenerar_lote(orden)

    auditoria.registrar(
        db, user, "escanear", "orden_trabajo", orden.id,
        f"Escaneo de {etapa}" + (f" en {maquina.nombre}" if maquina else ""),
        datos={"etapa": etapa,
               "maquina_id": maquina.id if maquina else None,
               "maquina": maquina.nombre if maquina else None,
               "operario": operario, "lote": orden.lote,
               # Queda en el log y no sólo en la respuesta: la pantalla la
               # muestra una vez, y a los dos días la pregunta («¿por qué esta
               # orden no tiene escaneos?») se contesta por acá.
               "advertencia": advertencia},
    )
    db.commit()
    db.refresh(pase)

    return {
        "orden_id":     orden.id,
        "numero":       orden.numero,
        "lote":         orden.lote,
        "estado_orden": orden.estado,
        "etapa":        etapa,
        "maquina":      maquina.to_dict() if maquina else None,
        "operario":     operario,
        "pase":         pase.to_dict(),
        # Nula salvo en el cierre de una orden sin ningún pase de planta.
        "advertencia":  advertencia,
    }
