"""
Router de razones sociales — Etiplast ERP
==========================================
Entidad legal que agrupa múltiples marcas/clientes.
"""
import re
import unicodedata
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, text
from sqlalchemy.orm import Session, joinedload

from core.bloqueos import con_bloqueos
from core.database import get_db
from core.security import verify_admin, verify_token
from models import RazonSocial, Cliente, ClienteUbicacion, Provincia
from services import auditoria
from services.numeracion import esperar_otros_cambios_de_numero, siguiente_numero_cliente
from services.razones_sociales import (
    CAMPOS_EMPRESA, borrar_marcas, desvincular_marcas, historial_de, pasar_marcas,
)
from schemas import RazonSocialCreateSchema, RazonSocialUpdateSchema

router = APIRouter(prefix="/api", tags=["razones_sociales"])


# ──────────────────────────────────────────────────────────────────────────────
# Nombres repetidos
# ──────────────────────────────────────────────────────────────────────────────
# En producción se crearon «Megaton SAS» con «Megaton» ya cargada, «Isacer SAS»
# con «Isacer» y «Mannasero» con «Manassero». El buscador filtra con ILIKE
# %texto%: escrito con la sociedad al final (o con una letra cambiada) la que ya
# existía no aparecía, y lo único que se ofrecía era «Crear».

# Siglas que se sacan del final para comparar. Con puntos quedan como letras
# sueltas («S.A.S.» → «s a s»), así que se aceptan con o sin espacio entre letras.
_SIGLAS_SOCIETARIAS = ("sa", "srl", "sas", "sh", "sca", "scs", "sau", "saic", "saci", "saicf", "sacif", "ltda")
_FORMAS_SOCIETARIAS = (
    "sociedad anonima", "sociedad anonima unipersonal", "sociedad de responsabilidad limitada",
    "sociedad por acciones simplificada", "sociedad de hecho",
    "sociedad en comandita simple", "sociedad en comandita por acciones",
)
# `.+?` exige algo antes: un nombre que es SÓLO «S.A.» no queda vacío.
_FORMA_AL_FINAL = re.compile(
    r"^(.+?)\s+(?:"
    + "|".join([" ?".join(sigla) for sigla in _SIGLAS_SOCIETARIAS] + [re.escape(f) for f in _FORMAS_SOCIETARIAS])
    + r")$"
)


def normalizar_nombre_empresa(nombre: Optional[str]) -> str:
    """El nombre con el que se decide si dos razones sociales son la misma empresa.

    «Megaton S.A.S.», «MEGATON» y «Megatón SAS» dan «megaton»: minúsculas, sin
    tildes, sin puntuación, espacios colapsados y sin la forma societaria del final.
    Ojo: «X SA» y «X SRL» también dan lo mismo y pueden ser dos empresas distintas.
    Por eso el alta deja seguir si el usuario confirma que es otra (`crear_igual`).
    """
    texto = unicodedata.normalize("NFKD", nombre or "")
    texto = "".join(c for c in texto if not unicodedata.combining(c)).casefold()
    # La puntuación separa palabras: «Bahía-Jugos» es «Bahía Jugos».
    texto = " ".join(re.sub(r"[\W_]+", " ", texto).split())
    forma = _FORMA_AL_FINAL.match(texto)
    if forma:
        texto = forma.group(1)
    # Las siglas con puntos quedaron como letras sueltas («Y.P.F.» → «y p f»): se
    # juntan para que valgan lo mismo que escritas de corrido («YPF»). Una letra
    # sola («Juan y Pedro») queda igual.
    palabras, sigla = [], []
    for palabra in [*texto.split(), ""]:
        if len(palabra) == 1 and palabra.isalpha():
            sigla.append(palabra)
            continue
        if sigla:
            palabras.append("".join(sigla))
            sigla = []
        if palabra:
            palabras.append(palabra)
    return " ".join(palabras)


def _clave_exacta(nombre: Optional[str]) -> str:
    """El mismo nombre salvo mayúsculas y espacios: en pantalla se lee igual."""
    return " ".join((nombre or "").split()).casefold()


def _con_el_mismo_nombre(db: Session, nombre: str, excluir_id: Optional[int] = None):
    """(la del nombre exacto, la del nombre normalizado igual), o None en cada una.

    Se recorre el catálogo entero en Python (son cientos de filas) en vez de filtrar
    en SQL: así vale la MISMA normalización en todos lados, y no depende de cuánto
    se parezcan letra a letra («Z.Q.X.W. S.A.» y «ZQXW» casi no comparten trigramas).
    """
    clave, normalizado = _clave_exacta(nombre), normalizar_nombre_empresa(nombre)
    exacta = igual = None
    q = db.query(RazonSocial.id, RazonSocial.razon_social, RazonSocial.numero)
    if excluir_id is not None:
        q = q.filter(RazonSocial.id != excluir_id)
    for fila in q.order_by(RazonSocial.id):
        if exacta is None and _clave_exacta(fila.razon_social) == clave:
            exacta = fila
        if igual is None and normalizado and normalizar_nombre_empresa(fila.razon_social) == normalizado:
            igual = fila
    return exacta, igual


def _nombrar(fila) -> str:
    """«Megaton» (N° 440): el número es lo que la planta reconoce de un cliente."""
    return f"«{fila.razon_social}» ({f'N° {fila.numero}' if fila.numero is not None else 'sin N°'})"


def _esperar_otras_altas_de_nombre(db: Session) -> None:
    """Dos personas tocan «Crear» con el mismo nombre a la vez: las dos revisan antes
    de que la otra guarde, ninguna ve a la otra y quedan dos. Con este lock la
    segunda espera a que la primera termine, y al revisar ya la ve.

    Va ANTES de revisar el nombre y antes del lock de la numeración, siempre en ese
    orden: nadie los toma al revés, así que no pueden trabarse entre sí.
    """
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext('razon_social_nombre'))"))


# Parecido mínimo (similarity de pg_trgm, de 0 a 1) para ofrecer una razón social
# como «¿es alguna de estas?». Medido con pares reales: «Manassero SRL» contra
# «Mannasero» da 0,41 y «Megatron S.A.» contra «Megaton», 0,43; en cambio «Juan
# Perez SA» contra «Juan Gomez» da 0,32 y «Envases Cordoba» contra «Envases
# Rosario», 0,29. Ofrecer una de más cuesta un toque; una de menos, un duplicado.
UMBRAL_PARECIDO = 0.35
MAX_SIMILARES = 5

# Tildes afuera antes de comparar trigramas: «Megatón» contra «megaton» baja de
# 1 a 0,45 si no. Los puntos también: «S.A.S.» pasa a ser una palabra y no tres.
_CON_TILDE = "ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑÇáàäâéèëêíìïîóòöôúùüûñç"
_SIN_TILDE = "AAAAEEEEIIIIOOOOUUUUNCaaaaeeeeiiiioooouuuunc"
_NOMBRE_PARA_TRIGRAMAS = func.replace(
    func.lower(func.translate(func.coalesce(RazonSocial.razon_social, ""), _CON_TILDE, _SIN_TILDE)), ".", "")


# Campos que las marcas de una misma empresa suelen compartir. Medido sobre la
# cartera real: localidad coincide en 27 de 34 empresas con varias marcas,
# domicilio en 22 y teléfono en 20. El RUBRO queda afuera a propósito — sólo
# coincide en 5 de 34, así que autocompletarlo erraría más de lo que ayuda.
CAMPOS_COMUNES = (
    "domicilio", "localidad", "provincia", "pais",
    "telefono", "transporte", "transporte_domicilio", "transporte_localidad",
)


def _datos_comunes(clientes) -> dict:
    """El valor más frecuente de cada campo entre las marcas de la empresa.

    Sirve para precargar el alta de una marca nueva: si las otras están en la
    misma dirección y usan el mismo transporte, la nueva casi siempre también.
    """
    comunes = {}
    for campo in CAMPOS_COMUNES:
        conteo: dict[str, int] = {}
        for c in clientes:
            valor = (c.to_dict().get(campo) or "").strip() if isinstance(c.to_dict().get(campo), str) else None
            if valor:
                conteo[valor] = conteo.get(valor, 0) + 1
        comunes[campo] = max(conteo, key=conteo.get) if conteo else None
    return comunes


# Campos de la empresa que se pueden crear/editar desde la razón social
# (CAMPOS_EMPRESA, en services.razones_sociales). `provincia` viaja como texto y
# se resuelve al catálogo, igual que en clientes.


def _aplicar_datos_empresa(db: Session, obj: RazonSocial, datos: dict) -> None:
    """Vuelca los datos de la empresa sobre la razón social."""
    for campo in CAMPOS_EMPRESA:
        if campo in datos:
            setattr(obj, campo, datos[campo])
    if "provincia" in datos:
        nombre = (datos["provincia"] or "").strip()
        if nombre:
            prov = db.query(Provincia).filter(Provincia.nombre == nombre).first()
            if not prov:
                prov = Provincia(nombre=nombre)
                db.add(prov)
                db.flush()
            obj.provincia_id = prov.id
        else:
            obj.provincia_id = None


def _validar_numero_libre(db: Session, numero, excluir_id=None):
    """El N° identifica al cliente en toda la planta: no puede repetirse.

    Si dos entidades legales comparten número, buscarlo devuelve clientes de
    ambas y nadie sabe cuál es cuál. Se corta acá, nombrando con quién choca.

    OJO: esto REVISA, no reserva. La columna no tiene UNIQUE, así que quien llama
    tiene que haber tomado antes el turno de la numeración
    (`esperar_otros_cambios_de_numero`): si no, dos guardados simultáneos revisan
    los dos contra la base de antes y el número termina repartido entre las dos.
    """
    if numero is None:
        return
    q = db.query(RazonSocial).filter(RazonSocial.numero == numero)
    if excluir_id is not None:
        q = q.filter(RazonSocial.id != excluir_id)
    otra = q.first()
    if not otra:
        # También cuenta el N° que MUESTRAN los clientes sin razón social (o cuya
        # razón social no tiene número): al borrar una empresa dejando sus marcas
        # sueltas, el número queda en ellas y nada más lo protegía.
        suelta = (
            db.query(Cliente)
            .outerjoin(RazonSocial, RazonSocial.id == Cliente.razon_social_id)
            .filter(func.coalesce(RazonSocial.numero, Cliente.id_cliente) == numero)
        )
        if excluir_id is not None:
            suelta = suelta.filter(Cliente.razon_social_id.is_distinct_from(excluir_id))
        suelta = suelta.first()
        if suelta:
            nombre = suelta.marca or f"el cliente #{suelta.id}"
            raise HTTPException(
                status_code=409,
                detail=(
                    f"El N° {numero} lo usa «{nombre}». Si es de esta empresa, asignale "
                    f"esta razón social desde su ficha y después cambiá el número."
                ),
            )
    if otra:
        # El mensaje dice adónde ir: el motivo más común de este choque es querer
        # sumarle una marca a una empresa que ya existe, y eso no se hace creando
        # otra razón social con su mismo número.
        raise HTTPException(
            status_code=409,
            detail=(
                f"El N° {numero} ya es de «{otra.razon_social}». Cada razón social "
                f"lleva el suyo. Si querés sumarle otra marca a esa empresa, hacelo "
                f"desde Clientes → Nuevo cliente y elegila en el paso de razón social: "
                f"la marca nueva va a compartir el N° {numero}."
            ),
        )


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/razones-sociales
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/razones-sociales", summary="Listar razones sociales")
def listar_razones_sociales(
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(30, ge=1, le=200),
):
    import math

    term = f"%{search.strip()}%" if search else None

    # Query base con join para cantidad_marcas
    base_q = (
        db.query(RazonSocial, func.count(Cliente.id).label("cantidad_marcas"))
        .outerjoin(Cliente, Cliente.razon_social_id == RazonSocial.id)
        .group_by(RazonSocial.id)
    )

    # Conteo real (sin paginar)
    count_q = db.query(func.count(RazonSocial.id))

    if term:
        # Intentar búsqueda por número si el término es numérico
        try:
            num = int(search.strip())
            filter_expr = (
                RazonSocial.razon_social.ilike(term) |
                RazonSocial.cuit.ilike(term) |
                (RazonSocial.numero == num)
            )
        except ValueError:
            filter_expr = RazonSocial.razon_social.ilike(term) | RazonSocial.cuit.ilike(term)
        base_q  = base_q.filter(filter_expr)
        count_q = count_q.filter(filter_expr)

    total: int = count_q.scalar() or 0

    offset = (page - 1) * per_page
    rows = base_q.order_by(RazonSocial.razon_social).offset(offset).limit(per_page).all()

    return {
        "data":        [{**rs.to_dict(), "cantidad_marcas": cant} for rs, cant in rows],
        "total":       total,
        "page":        page,
        "per_page":    per_page,
        "total_pages": math.ceil(total / per_page) if total > 0 else 1,
    }


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/razones-sociales/similares
# ──────────────────────────────────────────────────────────────────────────────
# Registrada ANTES de /razones-sociales/{rs_id}: si no, «similares» cae en esa
# ruta como si fuera un id y responde 422.

@router.get("/razones-sociales/similares", summary="Razones sociales con el mismo nombre o uno parecido")
def razones_sociales_similares(
    nombre: str = Query(..., max_length=300, description="El nombre que se quiere crear"),
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Lo que la pantalla pregunta antes de crear: «¿es alguna de estas?».

    Primero las del mismo nombre normalizado (casi seguro es la misma empresa),
    después las parecidas, de la más a la menos parecida.
    """
    normalizado = normalizar_nombre_empresa(nombre)
    if not normalizado:
        return []

    parecido = func.similarity(_NOMBRE_PARA_TRIGRAMAS, normalizado)
    # El catálogo entero y no sólo las que superan el umbral: las del mismo nombre
    # se deciden en Python y pueden no parecerse letra a letra (ver _con_el_mismo_nombre).
    filas = db.query(RazonSocial.id, RazonSocial.razon_social, parecido.label("parecido")).all()
    clave = _clave_exacta(nombre)
    iguales = sorted(
        (f for f in filas if normalizar_nombre_empresa(f.razon_social) == normalizado),
        key=lambda f: (_clave_exacta(f.razon_social) != clave, -f.parecido, f.id),
    )
    ya = {f.id for f in iguales}
    parecidas = sorted(
        (f for f in filas if f.id not in ya and f.parecido >= UMBRAL_PARECIDO),
        key=lambda f: (-f.parecido, f.id),
    )
    ids = [f.id for f in [*iguales, *parecidas][:MAX_SIMILARES]]
    if not ids:
        return []

    detalle = {
        rs.id: (rs, cantidad)
        for rs, cantidad in (
            db.query(RazonSocial, func.count(Cliente.id))
            .outerjoin(Cliente, Cliente.razon_social_id == RazonSocial.id)
            .filter(RazonSocial.id.in_(ids))
            .group_by(RazonSocial.id)
        )
    }
    return [
        {
            "id": rs.id, "razon_social": rs.razon_social, "numero": rs.numero,
            "cuit": rs.cuit, "cantidad_marcas": cantidad,
        }
        for rs, cantidad in (detalle[i] for i in ids if i in detalle)
    ]


# ──────────────────────────────────────────────────────────────────────────────
# POST /api/razones-sociales
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/razones-sociales", status_code=201, summary="Crear razón social")
# Advisory locks, siempre en este orden: el del nombre y el de la numeración.
@con_bloqueos()
def crear_razon_social(
    payload: RazonSocialCreateSchema,
    user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    rs = (payload.razon_social or "").strip()
    if not rs:
        raise HTTPException(status_code=400, detail="razon_social es requerido")

    _esperar_otras_altas_de_nombre(db)
    exacta, igual = _con_el_mismo_nombre(db, rs)
    if exacta:
        # El mismo nombre exacto nunca es legítimo: ni confirmando se crea. Nadie
        # podría distinguirlas en la lista.
        raise HTTPException(
            status_code=409,
            detail=f"Ya existe {_nombrar(exacta)}. Elegila de la lista en vez de crear otra.",
        )
    if igual and not payload.crear_igual:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Ya existe {_nombrar(igual)}, que parece la misma empresa. Si es esa, "
                f"elegila de la lista. Si es otra empresa, confirmá que querés crearla igual."
            ),
        )

    # El turno de la numeración va ANTES de revisar el número, también cuando lo
    # escribió el usuario: si no, un alta y una edición que ponen el mismo N° al
    # mismo tiempo revisan las dos contra la base de antes y entran las dos.
    # Entre dos altas no alcanzaba con el bloqueo del nombre de acá arriba: la
    # edición no lo toma y se colaba por al lado.
    esperar_otros_cambios_de_numero(db)
    _validar_numero_libre(db, payload.numero)

    # Sin número explícito se le asigna el próximo libre: una razón social sin
    # N° es un cliente que no se puede buscar ni facturar por número.
    numero = payload.numero if payload.numero is not None else siguiente_numero_cliente(db)
    obj = RazonSocial(razon_social=rs, cuit=payload.cuit, numero=numero)
    _aplicar_datos_empresa(db, obj, payload.model_dump(exclude_unset=True))
    db.add(obj)
    db.flush()   # asigna el id sin cerrar la transacción (la auditoría va adentro)

    auditoria.registrar(db, user, "crear", "razon_social", obj.id,
                        f"Creó razón social {obj.razon_social}",
                        datos={"razon_social": obj.razon_social, "cuit": obj.cuit, "numero": obj.numero})
    db.commit()
    db.refresh(obj)
    return {**obj.to_dict(), "cantidad_marcas": 0}


# ──────────────────────────────────────────────────────────────────────────────
# PUT /api/razones-sociales/{id}
# ──────────────────────────────────────────────────────────────────────────────

@router.put("/razones-sociales/{rs_id}", summary="Actualizar razón social")
# Advisory locks, en el mismo orden que el alta: el del nombre cuando se lo
# cambia, y el de la numeración cuando se cambia el N°.
@con_bloqueos()
def actualizar_razon_social(
    rs_id: int,
    payload: RazonSocialUpdateSchema,
    user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    obj = db.query(RazonSocial).filter(RazonSocial.id == rs_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Razón social no encontrada")

    # El N° repercute en TODAS las marcas de la empresa y en cómo se las busca:
    # sin el "antes" no hay forma de reconstruir qué pasó.
    antes = {"razon_social": obj.razon_social, "cuit": obj.cuit, "numero": obj.numero}

    datos = payload.model_dump(exclude_unset=True)
    if "razon_social" in datos and datos["razon_social"]:
        nuevo = datos["razon_social"].strip()
        # Sólo si el nombre cambia de verdad (no mayúsculas ni espacios): el
        # formulario siempre manda el actual, y un duplicado que ya estaba en
        # producción no puede impedir corregir el CUIT o la dirección.
        if _clave_exacta(nuevo) != _clave_exacta(obj.razon_social):
            _esperar_otras_altas_de_nombre(db)
            exacta, _ = _con_el_mismo_nombre(db, nuevo, excluir_id=rs_id)
            # Sólo el nombre exacto: acá no hay dónde confirmar que «X SRL» es otra
            # empresa que «X SA», y renombrar a eso puede ser legítimo.
            if exacta:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Ya hay otra razón social con ese nombre: {_nombrar(exacta)}. "
                        f"Si son la misma empresa, borrá esta y pasale sus marcas a esa."
                    ),
                )
        obj.razon_social = nuevo
    if "cuit" in datos:
        obj.cuit = datos["cuit"]
    # Sólo se valida si el N° cambia: el formulario siempre manda el actual, y un
    # dato viejo que ya choca (p. ej. un «LIBRE» importado) no puede impedir
    # corregir el CUIT o la dirección.
    if "numero" in datos and datos["numero"] != obj.numero:
        # El turno de la numeración, igual que en el alta y siempre DESPUÉS del
        # bloqueo del nombre de acá arriba. Sin esto, dos ediciones simultáneas
        # revisaban las dos contra la base de antes y las dos empresas quedaban
        # con el mismo N° (la columna no tiene UNIQUE que las frene).
        esperar_otros_cambios_de_numero(db)
        _validar_numero_libre(db, datos["numero"], excluir_id=rs_id)
        obj.numero = datos["numero"]
    _aplicar_datos_empresa(db, obj, datos)

    auditoria.registrar(db, user, "actualizar", "razon_social", obj.id,
                        f"Actualizó razón social {obj.razon_social}",
                        datos={"antes": antes,
                               "despues": {"razon_social": obj.razon_social, "cuit": obj.cuit,
                                           "numero": obj.numero}})
    db.commit()
    db.refresh(obj)

    cantidad = (
        db.query(func.count(Cliente.id))
        .filter(Cliente.razon_social_id == rs_id)
        .scalar()
    )
    return {**obj.to_dict(), "cantidad_marcas": cantidad}


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/razones-sociales/{id}  — con marcas y productos
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/razones-sociales/{rs_id}", summary="Obtener razón social con sus marcas y productos")
def obtener_razon_social(
    rs_id: int,
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    from sqlalchemy.orm import subqueryload
    obj = (
        db.query(RazonSocial)
        .options(
            subqueryload(RazonSocial.clientes)
            .subqueryload(Cliente.productos),
            subqueryload(RazonSocial.clientes)
            .subqueryload(Cliente.rubro_obj),
            # Los usa _datos_comunes al armar la precarga: sin esto sale una
            # consulta por marca.
            subqueryload(RazonSocial.clientes)
            .subqueryload(Cliente.ubicacion).joinedload(ClienteUbicacion.provincia_obj),
            subqueryload(RazonSocial.clientes)
            .subqueryload(Cliente.contacto),
        )
        .filter(RazonSocial.id == rs_id)
        .first()
    )
    if not obj:
        raise HTTPException(status_code=404, detail="Razón social no encontrada")

    return {
        **obj.to_dict(),
        "cantidad_marcas": len(obj.clientes),
        # Para precargar el alta de una marca nueva de esta misma empresa.
        "datos_comunes": _datos_comunes(obj.clientes),
        # Lo que se perdería si se borran sus marcas: se muestra antes de confirmar.
        "historial": historial_de(db, [c.id for c in obj.clientes]),
        "marcas": [
            {
                "id":         c.id,
                # El N° de cliente es de la ENTIDAD LEGAL y lo comparten todas
                # sus marcas — misma regla que Cliente.to_dict() y el export.
                # Se cae al de la marca sólo si la razón social no tiene número.
                "id_cliente": c.numero_visible,
                "marca":      c.marca,
                "rubro":      c.rubro_obj.nombre if c.rubro_obj else None,
                "productos": [
                    {
                        "id":               p.id,
                        "nombre":           p.nombre,
                        "volumen_cantidad": float(p.volumen_cantidad) if p.volumen_cantidad is not None else None,
                        "volumen_unidad":   p.volumen_unidad,
                        "lamina":           p.lamina,
                        "alto":             float(p.alto) if p.alto is not None else None,
                        "cilindro":         float(p.cilindro) if p.cilindro is not None else None,
                        "cierre":           float(p.cierre) if p.cierre is not None else None,
                        "envase":           p.envase,
                    }
                    for p in c.productos
                ],
            }
            for c in sorted(obj.clientes, key=lambda x: x.marca or "")
        ],
    }


# ──────────────────────────────────────────────────────────────────────────────
# DELETE /api/razones-sociales/{id}
# ──────────────────────────────────────────────────────────────────────────────

@router.delete("/razones-sociales/{rs_id}", summary="Eliminar razón social (y decidir qué pasa con sus marcas)")
# Toma la razón social y sus marcas con FOR UPDATE. Una edición de esas marcas
# esperando llegó a colgar el backend: la espera se acota y los bloqueos se sueltan
# ANTES de responder cualquier error, no al cerrar la sesión (core/bloqueos.py).
@con_bloqueos(mensaje=("Otra persona está modificando esta razón social o sus marcas en este "
                       "momento. Probá de nuevo en unos segundos."))
def eliminar_razon_social(
    rs_id: int,
    mover_a: Optional[int] = Query(None, description="Razón social existente a la que pasan sus marcas"),
    nueva_razon_social: Optional[str] = Query(None, max_length=300,
                                              description="Nombre de una razón social NUEVA a la que pasan sus marcas"),
    marcas: Optional[Literal["desvincular", "borrar"]] = Query(
        None, description="En vez de pasarlas: dejarlas sin razón social, o borrarlas también"),
    confirmado: Optional[str] = Query(
        None, max_length=2000,
        description="Para borrar marcas: lo que se vio en el aviso, «id-id-id,ordenes,remitos,facturas,presupuestos»"),
    # Borrar una entidad legal es irreversible: sólo administradores.
    user: dict = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    return _eliminar_razon_social(rs_id, mover_a, nueva_razon_social, marcas, confirmado, user, db)


def _eliminar_razon_social(rs_id, mover_a, nueva_razon_social, marcas, confirmado, user, db: Session):
    elegidas = [x for x in (mover_a, nueva_razon_social, marcas) if x is not None]
    if len(elegidas) > 1:
        raise HTTPException(status_code=400, detail="Elegí una sola opción para sus marcas.")
    if mover_a == rs_id:
        raise HTTPException(status_code=400, detail="Elegí otra razón social: no se pueden pasar las marcas a la misma que se borra.")

    # FOR UPDATE sobre las dos filas y en orden de id: mientras se borra, nadie le
    # cuelga una marca nueva al origen ni borra el destino, y dos borrados cruzados
    # (A→B y B→A) esperan en fila en vez de trabarse.
    ids = sorted({rs_id} | ({mover_a} if mover_a is not None else set()))
    filas = {r.id: r for r in (db.query(RazonSocial).filter(RazonSocial.id.in_(ids))
                              .order_by(RazonSocial.id).with_for_update().all())}
    obj = filas.get(rs_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Razón social no encontrada")
    destino = filas.get(mover_a) if mover_a is not None else None
    if mover_a is not None and not destino:
        raise HTTPException(status_code=400, detail="La razón social a la que querés pasar las marcas no existe.")

    nombre_nueva = None
    if nueva_razon_social is not None:
        nombre_nueva = nueva_razon_social.strip()
        if not nombre_nueva:
            raise HTTPException(status_code=400, detail="Escribí el nombre de la razón social nueva.")

    # Las marcas también se bloquean: nadie las mueve ni les cuelga documentos
    # mientras se decide qué pasa con ellas. Si otro las estaba moviendo, esto
    # espera y después ya no las trae.
    marcas_rs = (db.query(Cliente).filter(Cliente.razon_social_id == rs_id)
                 .order_by(Cliente.id).with_for_update().all())
    cantidad = len(marcas_rs)

    # Con marcas y sin decir qué hacer con ellas no se borra: nadie decidió si
    # pasan a otra empresa, quedan sueltas o se borran.
    if cantidad and not elegidas:
        raise HTTPException(
            status_code=409,
            detail=(
                f"«{obj.razon_social}» tiene {cantidad} marca{'s' if cantidad != 1 else ''}. "
                f"Para borrarla, elegí qué hacer con ellas."
            ),
        )

    historial_borrado = None
    if cantidad and marcas == "borrar":
        # Borrar es irreversible: sólo se borra lo que el usuario vio en el aviso.
        # Si mientras tanto alguien sumó una marca o cargó una orden, se frena.
        # Por id y no sólo por cantidad: si una marca se fue y llegó otra, siguen
        # siendo las mismas cantidades pero la nueva nunca estuvo en el aviso.
        historial_borrado = historial_de(db, [c.id for c in marcas_rs])
        actual = ",".join(["-".join(str(c.id) for c in marcas_rs), *(str(n) for n in (
            historial_borrado["ordenes"], historial_borrado["remitos"],
            historial_borrado["facturas"], historial_borrado["presupuestos"]))])
        if confirmado is None:
            raise HTTPException(status_code=400, detail="Falta confirmar qué se va a borrar.")
        if confirmado != actual:
            raise HTTPException(
                status_code=409,
                detail="Cambió lo que se iba a borrar desde que abriste el aviso. Revisalo de nuevo antes de confirmar.",
            )

    if cantidad and nombre_nueva is not None:
        # Crear otra con el mismo nombre es justo como aparecieron los duplicados.
        # Se revisa sólo si se va a crear: si mientras tanto le sacaron las marcas,
        # no se crea nada y no tiene sentido rechazar por el nombre.
        existente = (db.query(RazonSocial)
                     .filter(func.lower(func.trim(RazonSocial.razon_social)) == nombre_nueva.lower())
                     .first())
        if existente:
            raise HTTPException(
                status_code=409,
                detail=f"Ya existe «{existente.razon_social}». Elegila de la lista en vez de crear otra.",
            )
        # Nace recién ahora, dentro de la misma transacción: si algo falla no queda
        # una razón social suelta. Sin número propio, hereda el de la que se borra.
        destino = RazonSocial(razon_social=nombre_nueva)
        db.add(destino)
        db.flush()
        auditoria.registrar(db, user, "crear", "razon_social", destino.id,
                            f"Creó razón social {destino.razon_social} para pasarle las marcas de {obj.razon_social}",
                            datos={"razon_social": destino.razon_social, "reemplaza_a": obj.id})

    # Todo lo de la empresa borrada queda en la auditoría: lo que no se heredó o
    # copió a otro lado se perdería sin rastro. Se toma antes de tocar las marcas.
    datos = obj.to_dict()
    descripcion = f"Eliminó razón social {obj.razon_social}"

    accion, afectadas = None, []
    if cantidad and marcas == "desvincular":
        accion, afectadas = "desvincular", desvincular_marcas(db, user, obj, marcas_rs)
        datos["marcas_desvinculadas"] = afectadas
        descripcion += f" y dejó {len(afectadas)} marca{'s' if len(afectadas) != 1 else ''} sin razón social"
    elif cantidad and marcas == "borrar":
        datos["historial_borrado"] = historial_borrado
        accion, afectadas = "borrar", borrar_marcas(db, user, obj, marcas_rs)
        datos["marcas_borradas"] = afectadas
        descripcion += f" junto con {len(afectadas)} marca{'s' if len(afectadas) != 1 else ''}"
    elif cantidad:
        accion, afectadas = "mover", pasar_marcas(db, user, obj, destino, marcas_rs)
        datos["marcas_movidas"] = afectadas
        datos["movidas_a"] = {"id": destino.id, "razon_social": destino.razon_social, "numero": destino.numero}
        descripcion += f" y pasó {len(afectadas)} marca{'s' if len(afectadas) != 1 else ''} a {destino.razon_social}"
    auditoria.registrar(db, user, "eliminar", "razon_social", obj.id, descripcion, datos=datos)

    # Las marcas ya se movieron, soltaron o borraron: flush antes del delete para
    # que el ORM no las vea colgadas de `obj` y les ponga razon_social_id = NULL.
    db.flush()
    db.expire(obj, ["clientes"])
    db.delete(obj)
    db.commit()

    # Lo que pasó de verdad: la pantalla arma su aviso con esto y no con el conteo
    # que vio al abrir el diálogo (alguien pudo mover marcas mientras tanto).
    return {
        "accion": accion,
        "marcas": len(afectadas),
        "destino": ({"id": destino.id, "razon_social": destino.razon_social, "numero": destino.numero}
                    if accion == "mover" else None),
    }
