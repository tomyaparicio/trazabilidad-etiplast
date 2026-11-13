"""
Router de Cobranzas — Etiplast ERP
===================================
La plata que entra (COB-0001).

**La regla que define el módulo:** una cobranza en efectivo o transferencia es
plata YA; una cobranza con cheque es plata CUANDO EL CHEQUE SE ACREDITA. Los dos
números se calculan por separado y no se confunden nunca — si un cheque en
cartera se cuela en «entró», el dueño cree que tiene plata que todavía no tiene.

Por qué es un módulo aparte y no una columna más de `facturas`: la cobranza está
AGUAS ABAJO del comprobante. Cuando entre ARCA (ex AFIP) hay que reescribir
`facturas` entera —numeración y CAE asignados por el organismo, IVA
discriminado, e inmutabilidad: una factura con CAE no se edita ni se borra, se
corrige con nota de crédito—. A la cobranza eso le da lo mismo: recibir plata es
recibir plata. Es lo único de este circuito que se puede construir hoy sin que
haya que rehacerlo después.

Todos los totales se calculan EN SQL, nunca iterando en Python: es la misma
convención del dashboard, y con la cartera de cheques de un año entero traer
todas las filas para sumarlas en memoria no escala.
"""
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, case, extract, func, or_
from sqlalchemy.orm import Session, joinedload

from core.bloqueos import con_bloqueos
from core.database import get_db
from core.security import require_permiso
from models import (
    CHEQUE_ACREDITADO, CHEQUE_EN_CARTERA, CHEQUE_RECHAZADO,
    ESTADOS_CHEQUE, ESTADOS_CHEQUE_PENDIENTE,
    MEDIO_DIFERIDO, MEDIOS_COBRANZA, MEDIOS_CONTADO,
    Cliente, Cobranza, Factura, OrdenTrabajo,
)
from schemas import CobranzaCreateSchema, CobranzaUpdateSchema
from services import auditoria
from services.numeracion import generar_numero

router = APIRouter(prefix="/api", tags=["cobranzas"])

_DOS_DECIMALES = Decimal("0.01")


def _q(v) -> Decimal:
    """Decimal con 2 decimales (redondeo comercial), igual que en facturas."""
    return Decimal(str(v or 0)).quantize(_DOS_DECIMALES, rounding=ROUND_HALF_UP)


def _eager():
    return [
        joinedload(Cobranza.cliente),
        joinedload(Cobranza.factura),
        joinedload(Cobranza.orden_trabajo),
        joinedload(Cobranza.creador),
    ]


# ──────────────────────────────────────────────────────────────────────────────
# Las dos preguntas del módulo, en SQL
# ──────────────────────────────────────────────────────────────────────────────

def _es_plata_ya():
    """Condición: esta cobranza es plata que YA está disponible.

    Se deriva de MEDIOS_CONTADO (todo lo que no es el medio diferido), así que
    si mañana se agrega 'depósito' al catálogo entra solo en los totales en vez
    de desaparecer en silencio.
    """
    return or_(
        Cobranza.medio.in_(MEDIOS_CONTADO),
        and_(Cobranza.medio == MEDIO_DIFERIDO, Cobranza.cheque_estado == CHEQUE_ACREDITADO),
    )


def _cheque_pendiente():
    """Condición: cheque que todavía no acreditó (en cartera o depositado)."""
    return and_(Cobranza.medio == MEDIO_DIFERIDO, Cobranza.cheque_estado.in_(ESTADOS_CHEQUE_PENDIENTE))


def _cheque_rechazado():
    return and_(Cobranza.medio == MEDIO_DIFERIDO, Cobranza.cheque_estado == CHEQUE_RECHAZADO)


def _fecha_dinero():
    """En qué fecha ENTRÓ la plata (no en qué fecha se recibió el papel).

    Para el contado son la misma. Para un cheque no: uno recibido en enero con
    fecha de pago en marzo y ya acreditado entró en MARZO. Si se usara `fecha`,
    el mes de enero mostraría plata que en enero no estaba.
    """
    return case(
        (Cobranza.medio == MEDIO_DIFERIDO, func.coalesce(Cobranza.cheque_fecha_pago, Cobranza.fecha)),
        else_=Cobranza.fecha,
    )


# ──────────────────────────────────────────────────────────────────────────────
# Un null explícito NO es un campo ausente
# ──────────────────────────────────────────────────────────────────────────────
# `model_dump(exclude_unset=True)` deja afuera lo que el cliente NO mandó, así
# que una clave presente con valor null es una decisión suya, no una ausencia.
# Los dos idioms que confunden las dos cosas:
#
#     d.get("campo", actual)   → con {"campo": null} la clave EXISTE: devuelve
#                                None, NO `actual`.
#     valor or DEFAULT         → y ese None se lee como «no mandó nada», así que
#                                planta el DEFAULT encima de lo que había.
#
# Juntos reescribían plata: un `{"cheque_estado": null}` sobre un cheque
# ACREDITADO lo devolvía a `en_cartera` con un 200 y sin avisar —plata que ya
# había entrado volvía a figurar como promesa y el resumen cambiaba sin que
# nadie lo hubiera pedido—. De ahí las dos reglas del módulo para el null:
#
#   - Campo que la plata NECESITA (cliente_id, fecha, importe, medio, y el
#     cheque_estado de un cheque): 400 diciendo qué falta. Nunca un default
#     silencioso, nunca un 500.
#   - Campo opcional y nullable (observaciones, cheque_numero, cheque_banco,
#     factura_id, orden_trabajo_id): el null lo VACÍA, que es una operación real
#     («me equivoqué con el número de cheque»). Ahí `d.get(campo, actual)` dice
#     justo lo que se quiere decir y se deja a propósito.

_AUSENTE = object()
"""Centinela: el cliente no mandó la clave (distinto de mandarla vacía)."""


def _pedido(d: dict, clave: str):
    """Qué pidió el cliente para `clave`: el valor, o `_AUSENTE` si no la mandó.

    Es `d.get(clave, default)` hecho bien: el vacío llega como None —un valor
    más, que cada validador decide si acepta— y la ausencia llega marcada.
    """
    return d[clave] if clave in d else _AUSENTE


# Lo que una cobranza no puede perder. `cliente_id` y `fecha` son NOT NULL en la
# tabla: vaciarlos llegaba hasta el commit y salía como HTTP 500 —«me rompí»: el
# cliente no sabe si guardó o no—. `importe` es el número, y `medio` decide si
# ese número es plata o una promesa: un medio en NULL no es contado ni cheque,
# así que la cobranza se caería de los dos totales a la vez.
_SIN_VACIAR = (
    ("cliente_id", "el cliente"),
    ("fecha",      "la fecha"),
    ("importe",    "el importe"),
    ("medio",      "el medio de pago"),
)


def _validar_no_vaciables(d: dict) -> None:
    """400 —no 500— si el payload pide vaciar un campo que la plata necesita.

    Se usa sólo en la EDICIÓN. En el alta no hace falta y además molestaría: el
    schema ya exige `cliente_id` e `importe`, y una `fecha` vacía al crear es el
    default documentado (hoy), no un dato que falte.
    """
    for clave, nombre in _SIN_VACIAR:
        if _pedido(d, clave) is None:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Falta {nombre}: una cobranza no puede quedarse sin ese dato. "
                    f"Mandá un valor, o no mandes «{clave}» si no lo querés cambiar."
                ),
            )


# ──────────────────────────────────────────────────────────────────────────────
# Validaciones
# ──────────────────────────────────────────────────────────────────────────────

def _validar_refs(db: Session, cliente_id, factura_id, orden_id) -> None:
    """404 si se referencia algo inexistente (evita FK huérfanas silenciosas)."""
    if cliente_id is not None and not db.query(Cliente.id).filter(Cliente.id == cliente_id).first():
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if factura_id is not None and not db.query(Factura.id).filter(Factura.id == factura_id).first():
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    if orden_id is not None and not db.query(OrdenTrabajo.id).filter(OrdenTrabajo.id == orden_id).first():
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")


def _validar_importe(importe) -> Decimal:
    """El importe tiene que ser > 0: en cero no es una cobranza, y en negativo
    restaría de la plata que entró (que es exactamente lo que no puede pasar)."""
    valor = _q(importe)
    if valor <= 0:
        raise HTTPException(status_code=400, detail="El importe de la cobranza tiene que ser mayor a cero")
    return valor


def _validar_medio(medio) -> str:
    valor = (medio or "").strip().lower()
    if not valor:
        # Vacío no es «inválido», es «falta»: el mensaje tiene que distinguirlo
        # para que del otro lado se entienda qué corregir.
        raise HTTPException(
            status_code=400,
            detail=f"Falta el medio de pago: tiene que ser uno de: {', '.join(MEDIOS_COBRANZA)}",
        )
    if valor not in MEDIOS_COBRANZA:
        raise HTTPException(
            status_code=400,
            detail=f"Medio de pago inválido: «{medio}». Tiene que ser uno de: {', '.join(MEDIOS_COBRANZA)}",
        )
    return valor


def _resolver_cheque(medio: str, numero, banco, fecha_pago, estado) -> dict:
    """Qué se guarda en las cuatro columnas de cheque, según el medio.

    Un medio que NO es cheque no guarda nada: si quedara un `cheque_estado`
    colgado, la cobranza se caería de `entrado` (no está acreditada) sin
    aparecer en `en_cartera` — plata que se evapora del panel sin que nada falle.

    `estado` es lo que el cliente PIDIÓ, y las tres cosas que puede pedir se
    tratan distinto: `_AUSENTE` (no lo nombró) resuelve el default; un valor se
    valida contra el catálogo; y un vacío se RECHAZA, porque un cheque no tiene
    un estado «sin estado» y el único default posible (`en_cartera`) revertiría
    el que ya estaba guardado.
    """
    if medio != MEDIO_DIFERIDO:
        return {"cheque_numero": None, "cheque_banco": None, "cheque_fecha_pago": None, "cheque_estado": None}

    if not fecha_pago:
        raise HTTPException(
            status_code=400,
            detail="Un cheque necesita la fecha en que se puede cobrar: es lo que lo pone en el calendario de lo que va a entrar",
        )
    if estado is not _AUSENTE and not estado:
        raise HTTPException(
            status_code=400,
            detail=(
                "Falta el estado del cheque: un cheque siempre está en uno de estos "
                f"estados: {', '.join(ESTADOS_CHEQUE)}. Mandá el que corresponda, o no "
                "mandes «cheque_estado» si no lo querés cambiar."
            ),
        )
    # Acá `estado` ya es un valor de verdad o `_AUSENTE`: el default sólo se
    # aplica cuando NADIE pidió nada, nunca para tapar un vacío.
    estado_final = CHEQUE_EN_CARTERA if estado is _AUSENTE else estado
    if estado_final not in ESTADOS_CHEQUE:
        raise HTTPException(
            status_code=400,
            detail=f"Estado de cheque inválido: «{estado}». Tiene que ser uno de: {', '.join(ESTADOS_CHEQUE)}",
        )
    return {
        "cheque_numero": numero,
        "cheque_banco": banco,
        "cheque_fecha_pago": fecha_pago,
        "cheque_estado": estado_final,
    }


def _resumen_auditoria(c: Cobranza) -> dict:
    """Foto de la cobranza para la auditoría. Es plata: queda el antes y el después."""
    return {
        "numero": c.numero,
        "cliente_id": c.cliente_id,
        "medio": c.medio,
        "importe": float(c.importe or 0),
        "fecha": c.fecha.isoformat() if c.fecha else None,
        "cheque_estado": c.cheque_estado,
        "cheque_fecha_pago": c.cheque_fecha_pago.isoformat() if c.cheque_fecha_pago else None,
    }


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/cobranzas/resumen
# ──────────────────────────────────────────────────────────────────────────────
# Va ANTES de cualquier ruta con parámetro para que "resumen" no se interprete
# como un id.

@router.get("/cobranzas/resumen", summary="Números del panel de cobranzas")
def resumen_cobranzas(
    _user: dict = Depends(require_permiso("cobranzas:ver")),
    db: Session = Depends(get_db),
    year: Optional[int] = Query(None, ge=2000, le=2100, description="Año a medir (por defecto, el actual)"),
    month: Optional[int] = Query(None, ge=1, le=12, description="Mes a medir (por defecto, el actual)"),
):
    """Cuánta plata entró, cuánta está prometida y cuándo llega.

    - `entrado`      → plata disponible de verdad: contado + cheques ACREDITADOS.
    - `en_cartera`   → cheques que todavía no acreditaron. NO es plata.
    - `por_acreditar`→ calendario de esa cartera, por mes de la fecha de pago.
    - `rechazados`   → cheques que volvieron. No son ni una cosa ni la otra.
    """
    hoy = date.today()
    anio_ref = year or hoy.year
    mes_ref = month or hoy.month
    cuando = _fecha_dinero()

    def _entrado(*condiciones) -> float:
        return float(
            db.query(func.coalesce(func.sum(Cobranza.importe), 0))
            .filter(_es_plata_ya(), *condiciones)
            .scalar() or 0
        )

    def _stock(condicion) -> dict:
        """Total y cantidad de un conjunto de cheques (una sola consulta)."""
        total, cantidad = (
            db.query(
                func.coalesce(func.sum(Cobranza.importe), 0),
                func.count(Cobranza.id),
            )
            .filter(condicion)
            .one()
        )
        return {"total": float(total or 0), "cantidad": int(cantidad or 0)}

    # Calendario: los cheques pendientes agrupados por MES de la fecha de pago.
    # Incluye los meses ya pasados a propósito: un cheque vencido sin acreditar
    # es justo el que hay que ir a reclamar.
    mes_col = func.to_char(func.date_trunc("month", Cobranza.cheque_fecha_pago), "YYYY-MM")
    filas = (
        db.query(
            mes_col.label("mes"),
            func.coalesce(func.sum(Cobranza.importe), 0).label("total"),
            func.count(Cobranza.id).label("cantidad"),
        )
        .filter(_cheque_pendiente(), Cobranza.cheque_fecha_pago.isnot(None))
        .group_by(mes_col)
        .order_by(mes_col)
        .all()
    )

    return {
        "entrado": {
            "mes": _entrado(extract("year", cuando) == anio_ref, extract("month", cuando) == mes_ref),
            "anio": _entrado(extract("year", cuando) == anio_ref),
        },
        "en_cartera": _stock(_cheque_pendiente()),
        "por_acreditar": [
            {"mes": f.mes, "total": float(f.total or 0), "cantidad": int(f.cantidad or 0)}
            for f in filas
        ],
        "rechazados": _stock(_cheque_rechazado()),
        "periodo": {"year": anio_ref, "month": mes_ref},
    }


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/cobranzas
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/cobranzas", summary="Listar cobranzas")
def listar_cobranzas(
    _user: dict = Depends(require_permiso("cobranzas:ver")),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    cliente_id: Optional[int] = Query(None),
    medio: Optional[str] = Query(None, description="efectivo | transferencia | cheque"),
    cheque_estado: Optional[str] = Query(None, description="en_cartera | depositado | acreditado | rechazado"),
    desde: Optional[date] = Query(None, description="Fecha de recepción desde (inclusive)"),
    hasta: Optional[date] = Query(None, description="Fecha de recepción hasta (inclusive)"),
    search: Optional[str] = Query(None, description="Buscar por número de cobranza, N° de cheque o marca del cliente"),
):
    query = db.query(Cobranza)

    if cliente_id:
        query = query.filter(Cobranza.cliente_id == cliente_id)
    if medio:
        query = query.filter(Cobranza.medio == medio)
    if cheque_estado:
        query = query.filter(Cobranza.cheque_estado == cheque_estado)
    if desde:
        query = query.filter(Cobranza.fecha >= desde)
    if hasta:
        query = query.filter(Cobranza.fecha <= hasta)
    if search:
        f = f"%{search}%"
        query = (
            query
            .outerjoin(Cliente, Cliente.id == Cobranza.cliente_id)
            .filter(or_(
                Cobranza.numero.ilike(f),
                Cobranza.cheque_numero.ilike(f),
                Cliente.marca.ilike(f),
            ))
        )

    total = query.count()
    cobranzas = (
        query.options(*_eager())
        .order_by(Cobranza.fecha.desc().nulls_last(), Cobranza.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    # Totales del listado filtrado (cabecera de la pantalla). Los dos, siempre:
    # `monto_total` es todo lo cargado y `monto_entrado` sólo la plata que ya
    # está — mostrar uno solo invita a confundirlos.
    suma_total = (
        query.with_entities(func.coalesce(func.sum(Cobranza.importe), 0)).scalar() or 0
    )
    suma_entrada = (
        query.filter(_es_plata_ya())
        .with_entities(func.coalesce(func.sum(Cobranza.importe), 0))
        .scalar() or 0
    )

    return {
        "data": [c.to_dict() for c in cobranzas],
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": -(-total // per_page) if total else 0,
        "monto_total": float(suma_total or 0),
        "monto_entrado": float(suma_entrada or 0),
    }


# ──────────────────────────────────────────────────────────────────────────────
# POST /api/cobranzas
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/cobranzas", status_code=201, summary="Registrar cobranza")
# Numera con advisory lock: se suelta antes de responder cualquier error.
@con_bloqueos()
def crear_cobranza(
    payload: CobranzaCreateSchema,
    user: dict = Depends(require_permiso("cobranzas:crear")),
    db: Session = Depends(get_db),
):
    d = payload.model_dump(exclude_unset=True)

    medio = _validar_medio(d.get("medio") or "efectivo")
    importe = _validar_importe(d.get("importe"))
    cheque = _resolver_cheque(
        medio,
        d.get("cheque_numero"), d.get("cheque_banco"),
        d.get("cheque_fecha_pago"),
        # En el ALTA un estado vacío es el default documentado (el cheque nace en
        # cartera): no hay estado anterior que perder, así que acá sí vacío y
        # ausente son lo mismo. En la EDICIÓN no: ahí un vacío pisa plata.
        d.get("cheque_estado") or _AUSENTE,
    )
    _validar_refs(db, d.get("cliente_id"), d.get("factura_id"), d.get("orden_trabajo_id"))

    cobranza = Cobranza(
        numero=generar_numero(db, Cobranza, "COB"),
        cliente_id=d.get("cliente_id"),
        fecha=d.get("fecha") or date.today(),
        medio=medio,
        importe=importe,
        observaciones=d.get("observaciones"),
        factura_id=d.get("factura_id"),
        orden_trabajo_id=d.get("orden_trabajo_id"),
        created_by=user.get("id"),
        **cheque,
    )
    db.add(cobranza)
    db.flush()   # asigna el id sin cerrar la transacción (la auditoría va adentro)

    auditoria.registrar(
        db, user, "crear", "cobranza", cobranza.id,
        f"Cobranza {cobranza.numero} registrada",
        datos=_resumen_auditoria(cobranza),
    )
    db.commit()

    return db.query(Cobranza).options(*_eager()).filter(Cobranza.id == cobranza.id).first().to_dict()


# ──────────────────────────────────────────────────────────────────────────────
# PUT /api/cobranzas/{id}
# ──────────────────────────────────────────────────────────────────────────────

@router.put("/cobranzas/{cobranza_id}", summary="Actualizar cobranza")
def actualizar_cobranza(
    cobranza_id: int,
    payload: CobranzaUpdateSchema,
    user: dict = Depends(require_permiso("cobranzas:editar")),
    db: Session = Depends(get_db),
):
    cobranza = db.query(Cobranza).filter(Cobranza.id == cobranza_id).first()
    if not cobranza:
        raise HTTPException(status_code=404, detail="Cobranza no encontrada")

    d = payload.model_dump(exclude_unset=True)
    # Primero lo más barato de contestar y lo más fácil de entender del otro
    # lado: si el payload pide vaciar un campo que la plata necesita, es un 400
    # y no hay nada más que mirar.
    _validar_no_vaciables(d)
    antes = _resumen_auditoria(cobranza)

    # El medio resultante manda sobre los campos de cheque, haya cambiado o no:
    # pasar una cobranza de contado a cheque exige la fecha de pago igual que al
    # crearla, si no se podría dejar un cheque fuera del calendario por la
    # puerta de atrás.
    medio = _validar_medio(d["medio"] if "medio" in d else cobranza.medio)

    # El estado se resuelve ACÁ y no con `d.get("cheque_estado", actual)`: ese
    # idiom devolvía None cuando el cliente mandaba la clave en null, y adentro
    # el `or` lo tomaba por una ausencia y reseteaba el cheque a `en_cartera`.
    estado_pedido = _pedido(d, "cheque_estado")
    if estado_pedido is _AUSENTE:
        # No lo nombró: queda el que había. Y si no había —una cobranza de
        # contado que recién ahora pasa a cheque— sigue AUSENTE para que el
        # default se aplique: un cheque dado de alta por edición nace en cartera.
        estado_pedido = cobranza.cheque_estado or _AUSENTE

    cheque = _resolver_cheque(
        medio,
        # El número y el banco sí se pueden vaciar con un null: son nullable y
        # borrarlos es una corrección legítima, no plata que se mueve.
        d.get("cheque_numero", cobranza.cheque_numero),
        d.get("cheque_banco", cobranza.cheque_banco),
        # La fecha de pago no: en un cheque es obligatoria, y vaciarla ya cae en
        # el 400 de `_resolver_cheque` (sin ella el cheque no entra al calendario).
        d.get("cheque_fecha_pago", cobranza.cheque_fecha_pago),
        estado_pedido,
    )

    if "importe" in d:
        cobranza.importe = _validar_importe(d["importe"])

    _validar_refs(
        db,
        d.get("cliente_id"),
        d.get("factura_id"),
        d.get("orden_trabajo_id"),
    )

    for campo in ("cliente_id", "fecha", "observaciones", "factura_id", "orden_trabajo_id"):
        if campo in d:
            setattr(cobranza, campo, d[campo])
    cobranza.medio = medio
    for campo, valor in cheque.items():
        setattr(cobranza, campo, valor)

    auditoria.registrar(
        db, user, "actualizar", "cobranza", cobranza.id,
        f"Cobranza {cobranza.numero} actualizada",
        datos={"antes": antes, "despues": _resumen_auditoria(cobranza)},
    )
    db.commit()

    return db.query(Cobranza).options(*_eager()).filter(Cobranza.id == cobranza.id).first().to_dict()


# ──────────────────────────────────────────────────────────────────────────────
# DELETE /api/cobranzas/{id}
# ──────────────────────────────────────────────────────────────────────────────

@router.delete("/cobranzas/{cobranza_id}", status_code=204, summary="Eliminar cobranza")
def eliminar_cobranza(
    cobranza_id: int,
    user: dict = Depends(require_permiso("cobranzas:borrar")),
    db: Session = Depends(get_db),
):
    cobranza = db.query(Cobranza).filter(Cobranza.id == cobranza_id).first()
    if not cobranza:
        raise HTTPException(status_code=404, detail="Cobranza no encontrada")

    auditoria.registrar(
        db, user, "eliminar", "cobranza", cobranza_id,
        f"Cobranza {cobranza.numero} eliminada",
        datos=_resumen_auditoria(cobranza),
    )
    db.delete(cobranza)
    db.commit()
