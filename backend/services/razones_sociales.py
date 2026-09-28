"""
Servicio de razones sociales — Etiplast ERP
============================================
Qué pasa con las marcas al borrar su empresa: pasarlas a otra, dejarlas sin
razón social o borrarlas. Dejarla sin razón social se usa también al sacársela a
una marca desde su ficha. No hace commit: eso es del router.
"""
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import (
    Cliente, ClienteContacto, ClienteUbicacion, Factura, OrdenTrabajo, Presupuesto,
    RazonSocial, Remito,
)
from services import auditoria

# Datos de la empresa que sus marcas heredan (ver Cliente.dato_efectivo).
CAMPOS_EMPRESA = (
    "domicilio", "localidad", "pais", "telefono",
    "transporte", "transporte_domicilio", "transporte_localidad",
)

# Lo que el destino toma de la empresa borrada cuando no lo tiene: sin esto, una
# marca que mostraba el domicilio o el CUIT de su empresa quedaría en blanco.
#
# La dirección y el transporte van EN BLOQUE: se copian sólo si el destino no
# tiene nada de ese bloque. Campo por campo, a un destino con localidad pero sin
# calle le quedaba «Ruta 8 Km 12, Rosario»: una dirección que no es de nadie.
# El país no decide el bloque (casi todas dicen «Argentina»), pero viaja con él.
BLOQUES_HEREDABLES = (
    ("numero",),
    ("cuit",),
    ("telefono",),
    ("domicilio", "localidad", "provincia_id"),
    ("transporte", "transporte_domicilio", "transporte_localidad"),
)
ACOMPANAN_BLOQUE = {"domicilio": ("pais",)}


def _vacio(valor) -> bool:
    return valor is None or (isinstance(valor, str) and not valor.strip())


def _a_heredar(origen: RazonSocial, destino: RazonSocial) -> list[str]:
    campos = []
    for bloque in BLOQUES_HEREDABLES:
        if all(_vacio(getattr(destino, c)) for c in bloque) and \
           any(not _vacio(getattr(origen, c)) for c in bloque):
            campos.extend(bloque)
            campos.extend(c for c in ACOMPANAN_BLOQUE.get(bloque[0], ())
                          if not _vacio(getattr(origen, c)))
    return campos


def pasar_marcas(
    db: Session,
    user: Optional[dict],
    origen: RazonSocial,
    destino: RazonSocial,
    marcas: Optional[list[Cliente]] = None,
) -> list[dict]:
    """Pasa todas las marcas de `origen` a `destino` y devuelve cuáles movió.

    El N° de cliente y los datos de empresa son de la razón social, así que al
    moverse las marcas pasan a mostrar los del destino. Lo que el destino NO tiene
    lo hereda del origen: el caso típico es borrar «Megaton» (N° 440) pasando todo
    a «Megaton SAS», creada sólo con el nombre, y las marcas no pueden perder ni
    el 440 ni el domicilio.
    """
    if marcas is None:
        marcas = _marcas_de(db, origen)

    heredados = _a_heredar(origen, destino)
    if heredados:
        antes = {c: getattr(destino, c) for c in heredados}
        # Si el destino gana número, sus marcas de antes también cambian el N° que
        # muestran (antes veían su id_cliente propio): se registra en cada una.
        previas = []
        if "numero" in heredados:
            previas = [(cl, cl.numero_visible) for cl in
                       db.query(Cliente).filter(Cliente.razon_social_id == destino.id).all()]
        for c in heredados:
            setattr(destino, c, getattr(origen, c))
        auditoria.registrar(
            db, user, "actualizar", "razon_social", destino.id,
            f"Tomó de «{origen.razon_social}» (borrada) lo que no tenía: {', '.join(heredados)}",
            datos={"antes": antes, "despues": {c: getattr(destino, c) for c in heredados}},
        )
        for cliente, numero_antes in previas:
            auditoria.registrar(
                db, user, "actualizar", "cliente", cliente.id,
                f"Su N° pasó de {numero_antes} a {destino.numero}: «{destino.razon_social}» "
                f"heredó el número de «{origen.razon_social}»",
                datos={"numero": {"antes": numero_antes, "despues": destino.numero}},
            )

    movidas = []
    for cliente in marcas:
        datos = {"razon_social_id": {"antes": origen.id, "despues": destino.id}}
        cliente.razon_social_id = destino.id
        # Columnas legacy, alineadas con la empresa nueva (el export todavía lee el
        # CUIT de acá). El CUIT sólo se reemplaza por otro: si el destino no tiene,
        # el que se cargó en la propia marca es el único que hay y no se tira.
        cliente.razon_social = destino.razon_social
        if not _vacio(destino.cuit) and cliente.cuit != destino.cuit:
            datos["cuit"] = {"antes": cliente.cuit, "despues": destino.cuit}
            cliente.cuit = destino.cuit
        movidas.append({"id": cliente.id, "marca": cliente.marca})
        auditoria.registrar(
            db, user, "actualizar", "cliente", cliente.id,
            f"Pasó de «{origen.razon_social}» a «{destino.razon_social}» al borrarse la primera",
            datos=datos,
        )
    return movidas


# Lo que cuelga de una marca. Borrarla BORRA sus órdenes y remitos (FK en
# cascada) y sus presupuestos (se borran a mano, ver borrar_marcas). Sus facturas
# quedan sin cliente (SET NULL): no se borra plata, pero como la factura no guarda
# el nombre, ya no se sabe de quién era.
HISTORIAL = (
    ("ordenes", OrdenTrabajo),
    ("remitos", Remito),
    ("facturas", Factura),
    ("presupuestos", Presupuesto),
)


def historial_de(db: Session, cliente_ids: list[int]) -> dict:
    """Cuántos documentos tienen estas marcas, para avisar antes de borrarlas."""
    if not cliente_ids:
        return {clave: 0 for clave, _ in HISTORIAL}
    return {
        clave: db.query(func.count(modelo.id)).filter(modelo.cliente_id.in_(cliente_ids)).scalar() or 0
        for clave, modelo in HISTORIAL
    }


def _marcas_de(db: Session, origen: RazonSocial) -> list[Cliente]:
    return db.query(Cliente).filter(Cliente.razon_social_id == origen.id).order_by(Cliente.id).all()


# Datos de empresa que la marca mostraba heredados y que viven en sus propias filas.
CAMPOS_UBICACION = (
    "domicilio", "localidad", "provincia_id", "pais",
    "transporte", "transporte_domicilio", "transporte_localidad",
)


def desvincular_marcas(db: Session, user: Optional[dict], origen: RazonSocial,
                       marcas: Optional[list[Cliente]] = None,
                       motivo: Optional[str] = None) -> list[dict]:
    """Deja las marcas sin razón social, sin que cambie lo que muestran.

    - Conservan el N° de la empresa: se las sigue buscando por ese número hasta
      que alguien les asigne otra razón social.
    - Lo que heredaban (domicilio, teléfono, CUIT…) se copia a la marca, campo por
      campo y sólo donde la marca no tenía dato propio: es exactamente lo que se
      veía en la ficha.

    `motivo` completa la auditoría («Quedó sin razón social …»). Por defecto dice
    que se borró la empresa; desde la ficha, la empresa sigue existiendo y decirlo
    sería mentir en la historia del cliente.
    """
    motivo = motivo or f"al borrarse «{origen.razon_social}»"
    sueltas = []
    for cliente in (marcas if marcas is not None else _marcas_de(db, origen)):
        datos = {"razon_social_id": {"antes": origen.id, "despues": None}}
        copiados = {}

        ub = cliente.ubicacion
        if ub is None:
            ub = ClienteUbicacion()
            cliente.ubicacion = ub
        for campo in CAMPOS_UBICACION:
            if _vacio(getattr(ub, campo)) and not _vacio(getattr(origen, campo)):
                setattr(ub, campo, getattr(origen, campo))
                copiados[campo] = getattr(origen, campo)

        ct = cliente.contacto
        if ct is None:
            ct = ClienteContacto()
            cliente.contacto = ct
        if _vacio(ct.telefono) and not _vacio(origen.telefono):
            ct.telefono = origen.telefono
            copiados["telefono"] = origen.telefono

        # La ficha mostraba el CUIT de la empresa. Si la empresa no tenía, se deja
        # el que se haya cargado en la propia marca.
        if not _vacio(origen.cuit) and cliente.cuit != origen.cuit:
            datos["cuit"] = {"antes": cliente.cuit, "despues": origen.cuit}
            cliente.cuit = origen.cuit

        if origen.numero is not None and cliente.id_cliente != origen.numero:
            datos["id_cliente"] = {"antes": cliente.id_cliente, "despues": origen.numero}
            cliente.id_cliente = origen.numero

        cliente.razon_social_id = None
        cliente.razon_social = None   # legacy: si no, seguiría mostrando la empresa borrada
        if copiados:
            datos["copiados_de_la_empresa"] = copiados
        sueltas.append({"id": cliente.id, "marca": cliente.marca})
        auditoria.registrar(
            db, user, "actualizar", "cliente", cliente.id,
            f"Quedó sin razón social {motivo}",
            datos=datos,
        )
    return sueltas


def borrar_marcas(db: Session, user: Optional[dict], origen: RazonSocial,
                  marcas: Optional[list[Cliente]] = None) -> list[dict]:
    """Borra las marcas junto con la razón social, dejando constancia de lo que se
    llevó cada una (sus órdenes y remitos se borran con ella)."""
    borradas = []
    for cliente in (marcas if marcas is not None else _marcas_de(db, origen)):
        auditoria.registrar(
            db, user, "eliminar", "cliente", cliente.id,
            f"Eliminó cliente {cliente.marca or f'#{cliente.id}'} al borrar la razón social «{origen.razon_social}»",
            datos={
                "marca": cliente.marca,
                "id_cliente": cliente.numero_visible,
                "razon_social": origen.razon_social,
                "historial": historial_de(db, [cliente.id]),
            },
        )
        borradas.append({"id": cliente.id, "marca": cliente.marca})
        # Sin cliente un presupuesto no sirve, y si estaba convertido quedaba
        # trabado: sin orden y sin poder editarse ni borrarse. Se van con la marca.
        for presupuesto in db.query(Presupuesto).filter(Presupuesto.cliente_id == cliente.id).all():
            db.delete(presupuesto)
        db.delete(cliente)
    return borradas
