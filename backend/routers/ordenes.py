"""
Router de Órdenes de Trabajo — Etiplast ERP
============================================
CRUD completo de órdenes de trabajo con manejo de bobinas de extrusión.
Genera números correlativos tipo OT-0001.
"""
import json
from datetime import date
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from core.bloqueos import con_bloqueos
from core.database import get_db
from core.security import require_permiso, verify_token
from models import (
    ETAPAS_CON_MAQUINA, ETAPAS_PRODUCCION, Cliente, ClienteProducto, Maquina, OrdenExtrusionBobina,
    OrdenTrabajo, PlanProduccion, User,
)
from schemas import EscaneoEtapaSchema, OrdenCreateSchema, OrdenUpdateSchema
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
    for fecha_campo in ("fecha_diseno", "fecha_preprensa", "fecha_extrusion",
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
    """
    etapa = (payload.etapa or "").strip().lower()
    if etapa not in ETAPAS_PRODUCCION:
        raise HTTPException(
            status_code=400,
            detail=f"Etapa inválida: {payload.etapa}. Son {', '.join(ETAPAS_PRODUCCION)}",
        )

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

    # Dos liberaciones, y las dos van ANTES de crear el pase nuevo:
    #   - la orden suelta donde estaba (avanzó de etapa),
    #   - y si esta etapa usa máquina, la máquina suelta lo que tuviera encima.
    filtros = [PlanProduccion.orden_trabajo_id == orden.id]
    if maquina is not None:
        filtros.append(PlanProduccion.maquina_id == maquina.id)
    for filtro in filtros:
        db.query(PlanProduccion).filter(
            filtro, PlanProduccion.estado == "en_curso",
        ).update({"estado": "terminada", "fecha_fin": hoy}, synchronize_session=False)

    pase = PlanProduccion(
        orden_trabajo_id=orden.id,
        maquina_id=maquina.id if maquina else None,
        etapa=etapa,
        estado="en_curso",
        fecha_inicio=hoy,
        notas=(payload.notas or None),
        created_by=user.get("id"),
    )
    db.add(pase)

    # La ficha de siempre se sigue llenando: `fecha_*`, `operador_*` y
    # `*_maquina` son los campos que hoy se escriben a mano en el papel y nunca
    # vuelven al sistema. El escaneo los completa solo, y así el PDF impreso y
    # las pantallas viejas no se enteran de que cambió nada debajo.
    operario = (payload.operario or "").strip() or _nombre_de(db, user)
    setattr(orden, f"fecha_{etapa}", hoy)
    setattr(orden, f"operador_{etapa}", operario[:150] or None)
    # `*_maquina` sólo se pisa si esta etapa eligió una. Si no, se respeta lo
    # que haya cargado la oficina (el paso 0 ya elige la impresora).
    if maquina is not None:
        setattr(orden, f"{etapa}_maquina", (maquina.nombre or "")[:100] or None)

    # Primer escaneo = arrancó la producción. Cerrar la orden sigue siendo una
    # decisión de la oficina: empezar a troquelar no es haber terminado.
    if orden.estado in ("borrador", "pendiente"):
        orden.estado = "en_proceso"
    if not orden.lote:
        orden.lote = _autogenerar_lote(orden)

    auditoria.registrar(
        db, user, "escanear", "orden_trabajo", orden.id,
        f"Escaneo de {etapa}" + (f" en {maquina.nombre}" if maquina else ""),
        datos={"etapa": etapa,
               "maquina_id": maquina.id if maquina else None,
               "maquina": maquina.nombre if maquina else None,
               "operario": operario, "lote": orden.lote},
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
    }
