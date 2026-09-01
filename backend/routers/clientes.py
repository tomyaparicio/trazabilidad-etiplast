"""
Router de clientes — Etiplast ERP
===================================
CRUD completo sobre el esquema normalizado.
Las respuestas mantienen estructura plana para compatibilidad con el frontend.
"""
from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import cast, func, or_, String
from sqlalchemy.orm import Session, joinedload

from database import get_db
from dependencies import require_permiso, verify_token
from models import (
    Cliente, ClienteContacto, ClienteProducto,
    ClienteUbicacion, Provincia, RazonSocial, Rubro,
)
from schemas import ClienteCreateSchema, ClienteUpdateSchema
from services import auditoria

router = APIRouter(prefix="/api", tags=["clientes"])

# Centinela del filtro de razón social: pide los clientes que NO tienen ninguna.
# Va como valor de la misma query param para no agregar un segundo parámetro
# booleano que habría que mantener en sincronía con el <select> del front.
SIN_RAZON_SOCIAL = "__sin__"

# ──────────────────────────────────────────────────────────────────────────────
# Helpers internos
# ──────────────────────────────────────────────────────────────────────────────

def _sin_puntos(col):
    """La misma cadena sin puntos, para comparar sin que la puntuación estorbe.

    En la base conviven "S.R.L" y "SRL" (y "S.A." y "SA"). Normalizando los dos
    lados de la comparación, el que escribe cualquiera de las dos formas
    encuentra a las dos.
    """
    return func.replace(col, ".", "")


def razon_social_efectiva():
    """La razón social que realmente ve el usuario.

    Puede venir del catálogo (`razon_social_id` → `razones_sociales`) o, en los
    clientes viejos, del texto libre `clientes.razon_social`. El catálogo manda,
    igual que en el orden y en el export, para que filtrar y mostrar coincidan.
    Compartida con /dashboard/filtros, que arma el catálogo del <select>.
    """
    return func.coalesce(RazonSocial.razon_social, Cliente.razon_social)


def _eager_options():
    """Opciones de carga eager para traer todas las relaciones en 1 query."""
    return [
        joinedload(Cliente.rubro_obj),
        joinedload(Cliente.razon_social_obj),
        joinedload(Cliente.ubicacion).joinedload(ClienteUbicacion.provincia_obj),
        joinedload(Cliente.contacto),
        joinedload(Cliente.productos).joinedload(ClienteProducto.maquina_impresora),
    ]


def _get_or_create_razon_social(db: Session, razon_social: str, cuit: Optional[str] = None) -> RazonSocial:
    rs_text = razon_social.strip()
    obj = db.query(RazonSocial).filter(RazonSocial.razon_social == rs_text).first()
    if not obj:
        obj = RazonSocial(razon_social=rs_text, cuit=(cuit or "").strip() or None)
        db.add(obj)
        db.flush()
    return obj


def _get_or_create_rubro(db: Session, nombre: str) -> Rubro:
    nombre = nombre.strip()
    rubro = db.query(Rubro).filter(Rubro.nombre == nombre).first()
    if not rubro:
        rubro = Rubro(nombre=nombre)
        db.add(rubro)
        db.flush()
    return rubro


def _get_or_create_provincia(db: Session, nombre: str) -> Provincia:
    nombre = nombre.strip()
    prov = db.query(Provincia).filter(Provincia.nombre == nombre).first()
    if not prov:
        prov = Provincia(nombre=nombre)
        db.add(prov)
        db.flush()
    return prov


def _to_float(value) -> Optional[float]:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/clientes
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/clientes", summary="Listar clientes con paginación y filtros")
async def listar_clientes(
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1, description="Número de página"),
    per_page: int = Query(20, ge=1, le=100, description="Registros por página"),
    search: Optional[str] = Query(None, description="Búsqueda por marca, razón social, localidad o producto"),
    fuzzy: bool = Query(False, description="Búsqueda aproximada con pg_trgm (para reconocimiento de voz)"),
    rubro: Optional[str] = Query(None, description="Filtrar por rubro"),
    provincia: Optional[str] = Query(None, description="Filtrar por provincia"),
    razon_social: Optional[str] = Query(
        None,
        description=f"Filtrar por razón social. '{SIN_RAZON_SOCIAL}' = los clientes que no tienen ninguna",
    ),
    sort_by: Optional[str] = Query("marca", description="Campo de ordenamiento: id, marca, razon_social, localidad"),
    sort_dir: Optional[str] = Query("asc", description="Dirección: asc o desc"),
):
    # Unimos las auxiliares para búsqueda y ordenamiento. Sólo las que NO
    # multiplican filas: ubicación es 1:1 y razón social es N:1. Los productos
    # (1:N) van por EXISTS más abajo — unirlos duplicaría el cliente una vez por
    # presentación, inflando el total y comiéndose lugares de la página.
    query = (
        db.query(Cliente)
        .outerjoin(ClienteUbicacion,  ClienteUbicacion.cliente_id  == Cliente.id)
        .outerjoin(RazonSocial,       RazonSocial.id               == Cliente.razon_social_id)
    )

    # — Filtro de búsqueda textual —
    if search:
        if fuzzy:
            # Búsqueda aproximada con trigrama — útil cuando el texto viene de reconocimiento de voz
            # Umbral bajo (0.15) para capturar errores fonéticos como "jaugeri" → "jauregui"
            TRGM_THRESHOLD = 0.15
            s = search.lower()
            query = query.filter(or_(
                func.similarity(func.lower(func.coalesce(Cliente.marca, "")), s) > TRGM_THRESHOLD,
                func.similarity(func.lower(func.coalesce(Cliente.razon_social, "")), s) > TRGM_THRESHOLD,
                func.similarity(func.lower(func.coalesce(RazonSocial.razon_social, "")), s) > TRGM_THRESHOLD,
            )).order_by(
                func.greatest(
                    func.similarity(func.lower(func.coalesce(Cliente.marca, "")), s),
                    func.similarity(func.lower(func.coalesce(Cliente.razon_social, "")), s),
                ).desc()
            )
        else:
            # Ambos lados sin puntos: buscar "Bahia Jugos SRL" tiene que encontrar
            # a "Bahia Jugos S.R.L", y al reves.
            f = f"%{search.replace('.', '')}%"
            try:
                num = int(search.strip())
                # Se busca por el N° que se ve en pantalla y nada más: el de la
                # razón social, compartido por todas sus marcas. El id_cliente
                # interno NO es buscable — si lo fuera, un mismo cliente se
                # encontraría con dos números y ninguno sabría cuál es el bueno.
                # El coalesce cubre a los clientes sin razón social, donde el
                # número de la marca ES el que se muestra.
                id_filter = func.coalesce(RazonSocial.numero, Cliente.id_cliente) == num
            except ValueError:
                id_filter = None
            conditions = [
                _sin_puntos(Cliente.marca).ilike(f),
                _sin_puntos(Cliente.razon_social).ilike(f),
                _sin_puntos(RazonSocial.razon_social).ilike(f),
                _sin_puntos(ClienteUbicacion.localidad).ilike(f),
                # EXISTS en vez de join: encuentra al cliente por el nombre de
                # cualquiera de sus presentaciones, sin repetirlo por cada una.
                Cliente.productos.any(_sin_puntos(ClienteProducto.nombre).ilike(f)),
            ]
            if id_filter is not None:
                conditions.insert(0, id_filter)
            query = query.filter(or_(*conditions))

    # — Filtro por rubro (catálogo) —
    if rubro:
        rubro_obj = db.query(Rubro).filter(Rubro.nombre == rubro).first()
        query = query.filter(Cliente.rubro_id == rubro_obj.id) if rubro_obj else query.filter(False)

    # — Filtro por razón social (catálogo, texto libre legacy, o "las que no tienen") —
    if razon_social:
        efectiva = func.upper(func.trim(razon_social_efectiva()))
        if razon_social == SIN_RAZON_SOCIAL:
            query = query.filter(or_(efectiva.is_(None), efectiva == ""))
        else:
            query = query.filter(efectiva == razon_social.strip().upper())

    # — Filtro por provincia (usa la ubicación ya unida) —
    if provincia:
        prov_obj = db.query(Provincia).filter(Provincia.nombre == provincia).first()
        if prov_obj:
            query = query.filter(ClienteUbicacion.provincia_id == prov_obj.id)
        else:
            query = query.filter(False)

    total = query.count()

    # — Ordenamiento dinámico (no aplica cuando fuzzy ya ordenó por score) —
    if not fuzzy:
        SORT_FIELDS = {
            "id":           Cliente.id_cliente,
            "marca":        func.upper(Cliente.marca),
            "razon_social": func.coalesce(func.upper(RazonSocial.razon_social), func.upper(Cliente.razon_social)),
            "localidad":    func.upper(ClienteUbicacion.localidad),
        }
        sort_col = SORT_FIELDS.get(sort_by or "marca", func.upper(Cliente.marca))
        order_expr = sort_col.desc().nulls_last() if sort_dir == "desc" else sort_col.asc().nulls_last()
        query = query.order_by(order_expr)

    clientes = (
        query
        .options(*_eager_options())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return {
        "data":        [c.to_dict() for c in clientes],
        "total":       total,
        "page":        page,
        "per_page":    per_page,
        "total_pages": -(-total // per_page) if total else 0,
    }


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/clientes/export/excel — planilla completa estilo "Datos Clientes"
# ──────────────────────────────────────────────────────────────────────────────

# Columnas del Excel histórico (hoja "Editable" de NUEVO Datos Clientes.xlsx):
# una fila por producto, con los datos del cliente repetidos.
EXPORT_COLUMNAS = [
    ("N° Cliente",      9),
    ("Marca",          23),
    ("Razon Social",   28),
    ("Domicilio",      23),
    ("Localidad",      19),
    ("Provincia",      17),
    ("País",           12),
    ("CUIT",           16),
    ("Telefono",       20),
    ("Producto",       32),
    ("Muestra",        10),
    ("Alto",            7),
    ("Cierre",         10),
    ("Tipo de Envase", 16),
    ("Codigo Envase",  15),
    ("Ubicacion",      11),
    ("Lamina",         14),
    ("Cilindro",        9),
    ("Maquina",        10),
    ("Transporte",     28),
]


@router.get("/clientes/export/excel", summary="Exportar todos los clientes a Excel")
async def exportar_clientes_excel(
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """
    Genera un .xlsx con la base completa de clientes (una fila por producto),
    replicando el formato de la planilla histórica "Datos Clientes":
    encabezado en negrita con borde inferior, primera fila congelada.
    """
    import io
    from datetime import date

    from fastapi.responses import StreamingResponse
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, Side
    from openpyxl.utils import get_column_letter

    clientes = (
        db.query(Cliente)
        .options(*_eager_options())
        .all()
    )
    # N° Cliente con la MISMA regla que el UI (Cliente.to_dict): prioriza el
    # numero de la razón social (compartido entre marcas) y cae al id_cliente.
    def _numero(c):
        return c.numero_visible

    # Orden estable: por número de cliente (nulos al final) y marca.
    clientes.sort(key=lambda c: (_numero(c) is None, _numero(c) or 0, (c.marca or "").upper()))

    wb = Workbook()
    ws = wb.active
    ws.title = "Clientes"
    ws.freeze_panes = "A2"

    borde_fino = Border(bottom=Side(style="thin"))
    for col, (titulo, ancho) in enumerate(EXPORT_COLUMNAS, start=1):
        celda = ws.cell(row=1, column=col, value=titulo)
        celda.font = Font(bold=True)
        celda.border = borde_fino
        celda.alignment = Alignment(vertical="center", wrap_text=True)
        ws.column_dimensions[get_column_letter(col)].width = ancho
    ws.row_dimensions[1].height = 30

    def _num(valor):
        """Numeric → float para que Excel lo trate como número."""
        return float(valor) if valor is not None else None

    fila = 2
    for c in clientes:
        rs = c.razon_social_obj
        ub = c.ubicacion
        ct = c.contacto
        base = [
            _numero(c),
            c.marca,
            (rs.razon_social if rs else None) or c.razon_social,
            ub.domicilio if ub else None,
            ub.localidad if ub else None,
            (ub.provincia_obj.nombre if ub and ub.provincia_obj else None),
            ub.pais if ub else None,
            (rs.cuit if rs else None) or c.cuit,
            ct.telefono if ct else None,
        ]
        transporte = ub.transporte if ub else None
        # Sin productos → una fila igual, con las columnas de producto vacías.
        productos = c.productos or [None]
        for p in productos:
            maquina = None
            if p is not None and p.maquina_impresora:
                maquina = p.maquina_impresora.codigo or p.maquina_impresora.nombre
            fila_producto = [
                p.nombre if p else None,
                p.muestra if p else None,
                _num(p.alto) if p else None,
                _num(p.cierre) if p else None,
                p.envase if p else None,
                p.envase_codificado if p else None,
                p.ubicacion if p else None,
                p.lamina if p else None,
                _num(p.cilindro) if p else None,
                maquina,
            ]
            for col, valor in enumerate(base + fila_producto + [transporte], start=1):
                ws.cell(row=fila, column=col, value=valor)
            fila += 1

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    nombre = f"Datos Clientes Etiplast {date.today().isoformat()}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
    )


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/clientes/{id}
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/clientes/{cliente_id}", summary="Obtener cliente por ID")
async def obtener_cliente(
    cliente_id: int,
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    cliente = (
        db.query(Cliente)
        .options(*_eager_options())
        .filter(Cliente.id == cliente_id)
        .first()
    )
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return cliente.to_dict()


# ──────────────────────────────────────────────────────────────────────────────
# POST /api/clientes
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/clientes", status_code=201, summary="Crear nuevo cliente")
async def crear_cliente(
    payload: ClienteCreateSchema,
    _user: dict = Depends(require_permiso("clientes:crear")),
    db: Session = Depends(get_db),
):
    # Validación vía Pydantic; se opera sobre un dict para no cambiar la lógica.
    # exclude_none: las claves ausentes/None se omiten, igual que antes con Body dict.
    datos = payload.model_dump(exclude_none=True)

    # Determinar id_cliente
    id_cliente = datos.get("id_cliente")
    if id_cliente is None:
        max_id = db.query(func.max(Cliente.id_cliente)).scalar()
        id_cliente = (max_id or 0) + 1
    elif db.query(Cliente).filter(Cliente.id_cliente == id_cliente).first():
        raise HTTPException(status_code=400, detail=f"Ya existe un cliente con id_cliente={id_cliente}")

    # Resolver rubro_id
    rubro_id = None
    if datos.get("rubro"):
        rubro_id = _get_or_create_rubro(db, datos["rubro"]).id

    # Resolver razon_social_id
    rs_id = datos.get("razon_social_id")
    rs_text = datos.get("razon_social", "")
    if not rs_id and rs_text and rs_text.strip():
        rs_id = _get_or_create_razon_social(db, rs_text, datos.get("cuit")).id

    # Crear registro principal
    cliente = Cliente(
        id_cliente=id_cliente,
        marca=datos.get("marca"),
        razon_social=datos.get("razon_social"),
        cuit=datos.get("cuit"),
        razon_social_id=rs_id,
        rubro_id=rubro_id,
    )
    db.add(cliente)
    db.flush()  # obtener cliente.id antes del commit

    # Crear ubicación
    provincia_id = None
    if datos.get("provincia"):
        provincia_id = _get_or_create_provincia(db, datos["provincia"]).id

    db.add(ClienteUbicacion(
        cliente_id=cliente.id,
        domicilio=datos.get("domicilio"),
        localidad=datos.get("localidad"),
        provincia_id=provincia_id,
        pais=datos.get("pais") or "Argentina",
        transporte=datos.get("transporte"),
        transporte_domicilio=datos.get("transporte_domicilio"),
        transporte_localidad=datos.get("transporte_localidad"),
        latitud=_to_float(datos.get("latitud")),
        longitud=_to_float(datos.get("longitud")),
    ))

    # Crear contacto
    db.add(ClienteContacto(
        cliente_id=cliente.id,
        telefono=datos.get("telefono"),
        observaciones=datos.get("observaciones"),
    ))

    # Crear producto (si hay algún campo de producto)
    campos_producto = ["producto", "envase", "envase_codificado", "ubicacion", "volumen_cantidad",
                       "volumen_unidad", "lamina", "muestra", "alto", "cilindro", "cierre"]
    if any(datos.get(c) for c in campos_producto):
        db.add(ClienteProducto(
            cliente_id=cliente.id,
            nombre=datos.get("producto"),
            envase=datos.get("envase"),
            envase_codificado=datos.get("envase_codificado"),
            ubicacion=datos.get("ubicacion"),
            volumen_cantidad=_to_float(datos.get("volumen_cantidad")),
            volumen_unidad=datos.get("volumen_unidad"),
            lamina=datos.get("lamina"),
            muestra=datos.get("muestra"),
            alto=_to_float(datos.get("alto")),
            cilindro=_to_float(datos.get("cilindro")),
            cierre=_to_float(datos.get("cierre")),
        ))

    db.commit()

    # Recargar con relaciones para devolver dict completo
    db.refresh(cliente)
    cliente = (
        db.query(Cliente)
        .options(*_eager_options())
        .filter(Cliente.id == cliente.id)
        .first()
    )
    return cliente.to_dict()


# ──────────────────────────────────────────────────────────────────────────────
# PUT /api/clientes/{id}
# ──────────────────────────────────────────────────────────────────────────────

@router.put("/clientes/{cliente_id}", summary="Actualizar cliente")
async def actualizar_cliente(
    cliente_id: int,
    payload: ClienteUpdateSchema,
    _user: dict = Depends(require_permiso("clientes:editar")),
    db: Session = Depends(get_db),
):
    # exclude_unset: solo los campos realmente enviados → se preserva la semántica
    # de actualización parcial (`if campo in datos`).
    datos = payload.model_dump(exclude_unset=True)

    cliente = (
        db.query(Cliente)
        .options(*_eager_options())
        .filter(Cliente.id == cliente_id)
        .first()
    )
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    # — Identidad —
    for campo in ("marca", "razon_social", "cuit"):
        if campo in datos:
            setattr(cliente, campo, datos[campo])

    # Actualizar razon_social_id
    if "razon_social_id" in datos:
        cliente.razon_social_id = datos["razon_social_id"]
    elif "razon_social" in datos and datos["razon_social"] and datos["razon_social"].strip():
        # Si se actualizó el texto y no viene razon_social_id, buscar/crear la entidad
        rs = _get_or_create_razon_social(db, datos["razon_social"], datos.get("cuit"))
        cliente.razon_social_id = rs.id

    # Si viene cuit, actualizarlo también en la razón social vinculada
    if "cuit" in datos and cliente.razon_social_id:
        rs_obj = db.query(RazonSocial).filter(RazonSocial.id == cliente.razon_social_id).first()
        if rs_obj:
            rs_obj.cuit = datos["cuit"]

    if "rubro" in datos and datos["rubro"]:
        cliente.rubro_id = _get_or_create_rubro(db, datos["rubro"]).id
    elif "rubro" in datos and not datos["rubro"]:
        cliente.rubro_id = None

    # — Ubicación —
    ub = cliente.ubicacion
    if not ub:
        ub = ClienteUbicacion(cliente_id=cliente.id)
        db.add(ub)

    for campo in ("domicilio", "localidad", "pais", "transporte", "transporte_domicilio", "transporte_localidad"):
        if campo in datos:
            setattr(ub, campo, datos[campo])

    for campo in ("latitud", "longitud"):
        if campo in datos:
            setattr(ub, campo, _to_float(datos[campo]))

    if "provincia" in datos:
        if datos["provincia"]:
            ub.provincia_id = _get_or_create_provincia(db, datos["provincia"]).id
        else:
            ub.provincia_id = None

    # — Contacto —
    ct = cliente.contacto
    if not ct:
        ct = ClienteContacto(cliente_id=cliente.id)
        db.add(ct)

    for campo in ("telefono", "observaciones"):
        if campo in datos:
            setattr(ct, campo, datos[campo])

    # — Producto principal —
    pr = cliente.productos[0] if cliente.productos else None
    campos_producto = ["producto", "envase", "envase_codificado", "ubicacion", "volumen_cantidad",
                       "volumen_unidad", "lamina", "muestra", "alto", "cilindro", "cierre"]

    if any(c in datos for c in campos_producto):
        if not pr:
            pr = ClienteProducto(cliente_id=cliente.id)
            db.add(pr)

        if "producto" in datos:
            pr.nombre = datos["producto"]
        for campo in ("envase", "envase_codificado", "ubicacion", "volumen_unidad", "lamina", "muestra"):
            if campo in datos:
                setattr(pr, campo, datos[campo])
        for campo in ("volumen_cantidad", "alto", "cilindro", "cierre"):
            if campo in datos:
                setattr(pr, campo, _to_float(datos[campo]))

    db.commit()

    cliente = (
        db.query(Cliente)
        .options(*_eager_options())
        .filter(Cliente.id == cliente_id)
        .first()
    )
    return cliente.to_dict()


# ──────────────────────────────────────────────────────────────────────────────
# CRUD de cliente_productos (1:N)
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/clientes/{cliente_id}/productos", status_code=201, summary="Agregar producto a un cliente")
async def crear_producto_cliente(
    cliente_id: int,
    datos: Dict[str, Any] = Body(...),
    _user: dict = Depends(require_permiso("clientes:editar")),
    db: Session = Depends(get_db),
):
    if not db.query(Cliente).filter(Cliente.id == cliente_id).first():
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    producto = ClienteProducto(
        cliente_id=cliente_id,
        nombre=datos.get("nombre"),
        envase=datos.get("envase"),
        envase_codificado=datos.get("envase_codificado"),
        ubicacion=datos.get("ubicacion"),
        volumen_cantidad=_to_float(datos.get("volumen_cantidad")),
        volumen_unidad=datos.get("volumen_unidad"),
        lamina=datos.get("lamina"),
        muestra=datos.get("muestra"),
        alto=_to_float(datos.get("alto")),
        cilindro=_to_float(datos.get("cilindro")),
        cierre=_to_float(datos.get("cierre")),
        maquina_impresora_id=datos.get("maquina_impresora_id"),
    )
    db.add(producto)
    db.commit()
    db.refresh(producto)
    return producto.to_dict()


@router.put("/clientes/{cliente_id}/productos/{producto_id}", summary="Actualizar producto de un cliente")
async def actualizar_producto_cliente(
    cliente_id: int,
    producto_id: int,
    datos: Dict[str, Any] = Body(...),
    _user: dict = Depends(require_permiso("clientes:editar")),
    db: Session = Depends(get_db),
):
    producto = db.query(ClienteProducto).filter(
        ClienteProducto.id == producto_id,
        ClienteProducto.cliente_id == cliente_id,
    ).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    for campo in ("nombre", "envase", "envase_codificado", "ubicacion", "volumen_unidad", "lamina", "muestra"):
        if campo in datos:
            setattr(producto, campo, datos[campo])
    for campo in ("volumen_cantidad", "alto", "cilindro", "cierre"):
        if campo in datos:
            setattr(producto, campo, _to_float(datos[campo]))
    if "maquina_impresora_id" in datos:
        producto.maquina_impresora_id = datos["maquina_impresora_id"]

    db.commit()
    db.refresh(producto)
    return producto.to_dict()


@router.delete("/clientes/{cliente_id}/productos/{producto_id}", status_code=204, summary="Eliminar producto de un cliente")
async def eliminar_producto_cliente(
    cliente_id: int,
    producto_id: int,
    _user: dict = Depends(require_permiso("clientes:editar")),
    db: Session = Depends(get_db),
):
    producto = db.query(ClienteProducto).filter(
        ClienteProducto.id == producto_id,
        ClienteProducto.cliente_id == cliente_id,
    ).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    db.delete(producto)
    db.commit()


@router.delete("/clientes/{cliente_id}", status_code=204, summary="Eliminar cliente (solo admin)")
async def eliminar_cliente(
    cliente_id: int,
    user: dict = Depends(require_permiso("clientes:borrar")),
    db: Session = Depends(get_db),
):
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    auditoria.registrar(
        db, user, "eliminar", "cliente", cliente.id,
        f"Eliminó cliente {cliente.marca or cliente.razon_social or f'#{cliente.id}'}",
    )
    db.delete(cliente)
    db.commit()
