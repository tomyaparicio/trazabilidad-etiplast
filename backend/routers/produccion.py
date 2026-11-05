"""
Router de Producción — Etiplast ERP
====================================
El tablero de planta: dónde está cada pedido, en vivo.

Lectura del rastro que dejan los escaneos del QR (`plan_produccion`). No hay
otro origen.

El tablero tiene dos mitades porque la planta tiene dos clases de etapa:

  - **Impresión** elige máquina (Venus, ReinaFlex, Taurus, Autoadhesiva hacen
    cosas distintas) → una columna por impresora.
  - **Extrusión y troquelado** no: las máquinas son intercambiables → una
    columna por etapa, con los trabajos que están en ella.
"""
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core.database import get_db
from core.security import verify_token
from models import (
    ETAPAS_CON_MAQUINA, ETAPAS_PRODUCCION, Cliente, ClienteProducto, Maquina,
    OrdenTrabajo, PlanProduccion,
)

router = APIRouter(prefix="/api/produccion", tags=["produccion"])

# Una orden ocupa lugar sólo mientras se está haciendo. Una completada o
# cancelada libera la máquina aunque nadie haya escaneado la salida.
ESTADOS_EN_PLANTA = ("en_proceso",)

TITULOS_ETAPA = {
    "extrusion":  "Extrusión",
    "impresion":  "Impresión",
    "troquelado": "Troquelado",
}


def _resumen_orden(
    orden: OrdenTrabajo,
    pase: PlanProduccion,
    cliente: Optional[Cliente],
    producto: Optional[ClienteProducto],
) -> dict:
    return {
        "id":       orden.id,
        "numero":   orden.numero,
        "lote":     orden.lote,
        "cliente":  cliente.marca if cliente else None,
        "producto": producto.nombre if producto else None,
        "cantidad": orden.cantidad,
        "etapa":    pase.etapa,
        # Cuándo la escanearon. `created_at` es el momento real del escaneo;
        # `fecha_inicio` es sólo el día, porque la tabla nació para planificar.
        "desde":    pase.created_at.isoformat() if pase.created_at else None,
        "operario": getattr(orden, f"operador_{pase.etapa}", None),
    }


@router.get("/tablero", summary="Tablero de planta: dónde está cada pedido")
def tablero(
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    # Sólo las máquinas de etapas que eligen máquina. Una troqueladora cargada
    # en el catálogo no es una columna: ningún escaneo la va a ocupar nunca, y
    # mostrarla «Libre» para siempre sería mentir.
    maquinas = (
        db.query(Maquina)
        .filter(Maquina.activa.is_(True), Maquina.tipo.in_(ETAPAS_CON_MAQUINA))
        .order_by(Maquina.tipo, Maquina.nombre)
        .all()
    )

    # Un solo golpe a la base: los pases en curso con su orden, cliente y
    # producto. Sin esto el tablero haría una consulta por máquina.
    filas = (
        db.query(PlanProduccion, OrdenTrabajo, Cliente, ClienteProducto)
        .join(OrdenTrabajo, OrdenTrabajo.id == PlanProduccion.orden_trabajo_id)
        .outerjoin(Cliente, Cliente.id == OrdenTrabajo.cliente_id)
        .outerjoin(ClienteProducto, ClienteProducto.id == OrdenTrabajo.cliente_producto_id)
        .filter(
            PlanProduccion.estado == "en_curso",
            OrdenTrabajo.estado.in_(ESTADOS_EN_PLANTA),
        )
        .order_by(PlanProduccion.id)
        .all()
    )

    # Por máquina queda el pase más nuevo. No debería haber dos (el escaneo
    # cierra el anterior), pero si una corrida vieja dejó algo colgado, el
    # tablero muestra lo último y no se rompe.
    por_maquina: dict[int, dict] = {}
    por_etapa: dict[str, list] = {e: [] for e in ETAPAS_PRODUCCION}
    ubicadas: set[int] = set()

    for pase, orden, cliente, producto in filas:
        resumen = _resumen_orden(orden, pase, cliente, producto)
        ubicadas.add(orden.id)
        if pase.maquina_id is not None:
            por_maquina[pase.maquina_id] = resumen
        elif pase.etapa in por_etapa:
            por_etapa[pase.etapa].append(resumen)

    columnas = [
        {
            "id":     m.id,
            "codigo": m.codigo,
            "nombre": m.nombre,
            "tipo":   m.tipo,
            "orden":  por_maquina.get(m.id),
        }
        for m in maquinas
    ]

    # Las etapas que no eligen máquina, siempre presentes aunque estén vacías:
    # una columna ausente no se distingue de «no hay nada ahí».
    etapas = [
        {
            "etapa":   e,
            "titulo":  TITULOS_ETAPA.get(e, e),
            "ordenes": por_etapa[e],
        }
        for e in ETAPAS_PRODUCCION
        if e not in ETAPAS_CON_MAQUINA
    ]

    # Está en producción y nadie la escaneó: no se sabe dónde está. Mostrarlas
    # aparte es media gracia del tablero.
    sin_ubicar = [
        {
            "id":       o.id,
            "numero":   o.numero,
            "lote":     o.lote,
            "cliente":  c.marca if c else None,
            "cantidad": o.cantidad,
        }
        for o, c in (
            db.query(OrdenTrabajo, Cliente)
            .outerjoin(Cliente, Cliente.id == OrdenTrabajo.cliente_id)
            .filter(OrdenTrabajo.estado.in_(ESTADOS_EN_PLANTA))
            .order_by(OrdenTrabajo.id)
            .all()
        )
        if o.id not in ubicadas
    ]

    ocupadas = sum(1 for c in columnas if c["orden"])
    return {
        "maquinas":   columnas,
        "etapas":     etapas,
        "sin_ubicar": sin_ubicar,
        "resumen": {
            "ocupadas":   ocupadas,
            "libres":     len(columnas) - ocupadas,
            "en_etapas":  sum(len(e["ordenes"]) for e in etapas),
            "sin_ubicar": len(sin_ubicar),
        },
    }
