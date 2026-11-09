"""Integración: la FECHA ESTIMADA de finalización y el ATRASO PROYECTADO.

RF-13 pide estimar cuándo va a terminar una orden «a partir de los tiempos
reales insumidos por las etapas ya registradas y por las órdenes anteriores», y
RF-14 pide el atraso proyectado contra el plazo pactado.

De dónde salen los tiempos reales: de `plan_produccion`. Cada escaneo del QR
deja una fila con `created_at` TIMESTAMPTZ, así que la duración de una etapa es
lo que pasó entre su escaneo y el siguiente. Las `fecha_*` de la orden no
sirven para esto: son DATE y dos etapas del mismo día se leerían como cero.

Cómo se estima: se promedia por etapa sobre las órdenes YA CERRADAS (ésas son
«las órdenes anteriores» del requerimiento), y para una orden abierta se suma
lo que le falta a partir del último escaneo. Sin órdenes cerradas no hay
promedio y la estimación no se informa — no se inventa un número.
"""
from datetime import date, datetime, timedelta, timezone

import pytest

from models import Cliente, OrdenTrabajo, PlanProduccion

MARCA = "OTESTIM TEST SA"
RANGO = {"desde": "2032-01-01", "hasta": "2032-12-31"}
FECHA_OT = date(2032, 6, 1)

# Ancla fija para los escaneos sembrados: así las duraciones son exactas y el
# test no depende de la hora en que corre.
T0 = datetime(2032, 6, 1, 8, 0, tzinfo=timezone.utc)


def _limpiar(db):
    ids = [c.id for c in db.query(Cliente).filter(Cliente.marca == MARCA).all()]
    if ids:
        oids = [o.id for o in db.query(OrdenTrabajo).filter(
            OrdenTrabajo.cliente_id.in_(ids)).all()]
        if oids:
            db.query(PlanProduccion).filter(
                PlanProduccion.orden_trabajo_id.in_(oids)
            ).delete(synchronize_session=False)
        db.query(OrdenTrabajo).filter(OrdenTrabajo.cliente_id.in_(ids)).delete(
            synchronize_session=False
        )
        db.query(Cliente).filter(Cliente.id.in_(ids)).delete(synchronize_session=False)
        db.commit()


@pytest.fixture()
def cliente_id(db_session):
    _limpiar(db_session)
    c = Cliente(marca=MARCA, razon_social=MARCA)
    db_session.add(c)
    db_session.commit()
    db_session.refresh(c)
    yield c.id
    _limpiar(db_session)


def _orden(db, cliente_id, numero, *, estado, pases, comprometida=None):
    """Siembra una orden con sus pases. `pases` es [(etapa, dias_desde_T0)]."""
    o = OrdenTrabajo(
        numero=numero, cliente_id=cliente_id, fecha=FECHA_OT,
        estado=estado, fecha_comprometida=comprometida,
    )
    db.add(o)
    db.commit()
    db.refresh(o)
    for etapa, dias in pases:
        p = PlanProduccion(
            orden_trabajo_id=o.id, etapa=etapa,
            estado="terminada", fecha_inicio=FECHA_OT,
        )
        db.add(p)
        db.commit()
        # `created_at` lo pone el server_default, así que para sembrar
        # duraciones hay que escribirlo después del insert.
        p.created_at = T0 + timedelta(days=dias)
        db.commit()
    return o


def _cerrada_de_referencia(db, cliente_id, numero, *, extrusion=2, impresion=3, troquelado=1):
    """Una orden cerrada que aporta sus duraciones al promedio.

    extrusión dura `extrusion` días (de su escaneo al de impresión), y así.
    """
    acum = 0
    pases = [("extrusion", acum)]
    acum += extrusion
    pases.append(("impresion", acum))
    acum += impresion
    pases.append(("troquelado", acum))
    acum += troquelado
    pases.append(("finalizado", acum))
    return _orden(db, cliente_id, numero, estado="completada", pases=pases)


def test_sin_ordenes_cerradas_no_hay_estimacion(api, db_session, cliente_id):
    """No se inventa un promedio: si nunca se cerró nada, no hay con qué estimar."""
    _orden(db_session, cliente_id, "OTESTIM-A", estado="en_proceso",
           pases=[("extrusion", 0)])
    r = api.get("/api/reportes/estimaciones", params=RANGO)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["disponible"] is False
    assert d["ordenes"] == []


def test_estima_la_fecha_sumando_lo_que_falta(api, db_session, cliente_id):
    """La orden escaneó extrusión el día 0. Con promedios de 2/3/1 le faltan
    los 2 de extrusión + 3 de impresión + 1 de troquelado = 6 días."""
    _cerrada_de_referencia(db_session, cliente_id, "OTESTIM-REF1")
    _orden(db_session, cliente_id, "OTESTIM-B", estado="en_proceso",
           pases=[("extrusion", 0)])

    d = api.get("/api/reportes/estimaciones", params=RANGO).json()
    assert d["disponible"] is True
    fila = next(o for o in d["ordenes"] if o["numero"] == "OTESTIM-B")
    assert fila["fecha_estimada"] == (T0.date() + timedelta(days=6)).isoformat()
    assert fila["etapas_faltantes"] == ["impresion", "troquelado"]


def test_cuanto_mas_avanzada_la_orden_menos_le_falta(api, db_session, cliente_id):
    """La que ya troqueló sólo espera el día del cierre."""
    _cerrada_de_referencia(db_session, cliente_id, "OTESTIM-REF2")
    _orden(db_session, cliente_id, "OTESTIM-C", estado="en_proceso",
           pases=[("extrusion", 0), ("impresion", 2), ("troquelado", 5)])

    d = api.get("/api/reportes/estimaciones", params=RANGO).json()
    fila = next(o for o in d["ordenes"] if o["numero"] == "OTESTIM-C")
    assert fila["etapas_faltantes"] == []
    # Escaneó troquelado el día 5 y troquelado promedia 1 día.
    assert fila["fecha_estimada"] == (T0.date() + timedelta(days=6)).isoformat()


def test_el_atraso_proyectado_es_la_diferencia_contra_el_plazo(api, db_session, cliente_id):
    """Termina estimada el día 6 y se prometió el día 2: cuatro días de atraso."""
    _cerrada_de_referencia(db_session, cliente_id, "OTESTIM-REF3")
    _orden(db_session, cliente_id, "OTESTIM-D", estado="en_proceso",
           pases=[("extrusion", 0)],
           comprometida=T0.date() + timedelta(days=2))

    d = api.get("/api/reportes/estimaciones", params=RANGO).json()
    fila = next(o for o in d["ordenes"] if o["numero"] == "OTESTIM-D")
    assert fila["atraso_proyectado_dias"] == 4


def test_la_que_llega_antes_del_plazo_no_tiene_atraso(api, db_session, cliente_id):
    """Adelantarse no es atraso negativo: es cero."""
    _cerrada_de_referencia(db_session, cliente_id, "OTESTIM-REF4")
    _orden(db_session, cliente_id, "OTESTIM-E", estado="en_proceso",
           pases=[("extrusion", 0)],
           comprometida=T0.date() + timedelta(days=30))

    d = api.get("/api/reportes/estimaciones", params=RANGO).json()
    fila = next(o for o in d["ordenes"] if o["numero"] == "OTESTIM-E")
    assert fila["atraso_proyectado_dias"] == 0


def test_sin_plazo_pactado_no_hay_atraso_que_proyectar(api, db_session, cliente_id):
    """La estimación igual se informa: sirve para avisarle al cliente."""
    _cerrada_de_referencia(db_session, cliente_id, "OTESTIM-REF5")
    _orden(db_session, cliente_id, "OTESTIM-F", estado="en_proceso",
           pases=[("extrusion", 0)])

    d = api.get("/api/reportes/estimaciones", params=RANGO).json()
    fila = next(o for o in d["ordenes"] if o["numero"] == "OTESTIM-F")
    assert fila["fecha_estimada"] is not None
    assert fila["atraso_proyectado_dias"] is None


def test_la_orden_sin_ningun_escaneo_no_se_estima(api, db_session, cliente_id):
    """Sin un solo pase no se sabe cuándo arrancó: estimar sería adivinar."""
    _cerrada_de_referencia(db_session, cliente_id, "OTESTIM-REF6")
    _orden(db_session, cliente_id, "OTESTIM-G", estado="pendiente", pases=[])

    d = api.get("/api/reportes/estimaciones", params=RANGO).json()
    assert all(o["numero"] != "OTESTIM-G" for o in d["ordenes"])


def test_las_cerradas_y_canceladas_no_se_estiman(api, db_session, cliente_id):
    """Ya terminaron: no hay nada que proyectar."""
    _cerrada_de_referencia(db_session, cliente_id, "OTESTIM-REF7")
    _orden(db_session, cliente_id, "OTESTIM-H", estado="cancelada",
           pases=[("extrusion", 0)])

    d = api.get("/api/reportes/estimaciones", params=RANGO).json()
    numeros = [o["numero"] for o in d["ordenes"]]
    assert "OTESTIM-H" not in numeros
    assert "OTESTIM-REF7" not in numeros


def test_informa_el_promedio_y_la_muestra_de_cada_etapa(api, db_session, cliente_id):
    """Igual que el cumplimiento de plazos: el promedio sin su muestra no se
    puede interpretar."""
    _cerrada_de_referencia(db_session, cliente_id, "OTESTIM-REF8")
    _cerrada_de_referencia(db_session, cliente_id, "OTESTIM-REF9",
                           extrusion=4, impresion=3, troquelado=1)

    d = api.get("/api/reportes/estimaciones", params=RANGO).json()
    # extrusión: 2 y 4 días → 3,0 sobre 2 muestras.
    assert d["promedios_etapa"]["extrusion"] == 3.0
    assert d["muestras_etapa"]["extrusion"] == 2
    assert d["promedios_etapa"]["impresion"] == 3.0
