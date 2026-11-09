"""Integración: los TIEMPOS DE ESPERA acumulados y los cuellos de botella.

RF-15 pide informar las esperas «por etapa, máquina y período, a fin de
identificar los cuellos de botella». El endpoint agrupa por las tres.

Qué mide exactamente, y hay que ser preciso porque el nombre promete más de lo
que el dato da: el operario escanea el QR AL ENTRAR a su etapa, así que entre
dos escaneos hay una sola medición que contiene las dos cosas —lo que la orden
esperó en la cola y lo que tardó la máquina— y con un escaneo por etapa no se
pueden separar. Así que lo que se informa es el TIEMPO QUE LA ORDEN PASÓ en
cada etapa, que es lo que sirve para encontrar el cuello: donde el trabajo se
acumula, se acumula igual si la máquina es lenta o si hay fila esperándola.

El reporte anterior (`/reportes/tiempos`) no servía para esto: promedia días
entre las `fecha_*` de la orden, que son DATE, y no sabe nada de máquinas.
"""
from datetime import date, datetime, timedelta, timezone

import pytest

from models import Cliente, Maquina, OrdenTrabajo, PlanProduccion

MARCA = "OTESPERA TEST SA"
RANGO = {"desde": "2033-01-01", "hasta": "2033-12-31"}
FECHA_OT = date(2033, 6, 1)
T0 = datetime(2033, 6, 1, 8, 0, tzinfo=timezone.utc)


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


@pytest.fixture()
def impresora_id(db_session):
    """Una impresora real del test DB: sólo impresión elige máquina."""
    m = db_session.query(Maquina).filter(
        Maquina.tipo == "impresion", Maquina.activa.is_(True)
    ).first()
    if not m:
        pytest.skip("el test DB no tiene impresoras sembradas")
    return m.id


def _orden(db, cliente_id, numero, pases, *, estado="completada"):
    """`pases` es [(etapa, dias_desde_T0, maquina_id|None)]."""
    o = OrdenTrabajo(numero=numero, cliente_id=cliente_id, fecha=FECHA_OT, estado=estado)
    db.add(o)
    db.commit()
    db.refresh(o)
    for etapa, dias, maq in pases:
        p = PlanProduccion(
            orden_trabajo_id=o.id, etapa=etapa, maquina_id=maq,
            estado="terminada", fecha_inicio=FECHA_OT,
        )
        db.add(p)
        db.commit()
        p.created_at = T0 + timedelta(days=dias)
        db.commit()
    return o


def test_agrupa_por_etapa_y_acumula_los_dias(api, db_session, cliente_id):
    """Dos órdenes: extrusión tarda 2 y 4 días → 6 acumulados, 3,0 de promedio."""
    _orden(db_session, cliente_id, "OTESP-A", [
        ("extrusion", 0, None), ("impresion", 2, None), ("finalizado", 3, None),
    ])
    _orden(db_session, cliente_id, "OTESP-B", [
        ("extrusion", 0, None), ("impresion", 4, None), ("finalizado", 5, None),
    ])
    r = api.get("/api/reportes/esperas", params={**RANGO, "agrupar": "etapa"})
    assert r.status_code == 200, r.text
    d = r.json()
    extr = next(f for f in d["filas"] if f["clave"] == "extrusion")
    assert extr["dias_acumulados"] == 6.0
    assert extr["dias_promedio"] == 3.0
    assert extr["pases"] == 2


def test_el_cuello_de_botella_es_la_etapa_que_mas_acumula(api, db_session, cliente_id):
    """Es para lo que existe el reporte: la primera fila es el cuello."""
    _orden(db_session, cliente_id, "OTESP-C", [
        ("extrusion", 0, None),    # dura 1
        ("impresion", 1, None),    # dura 9  ← el cuello
        ("troquelado", 10, None),  # dura 1
        ("finalizado", 11, None),
    ])
    d = api.get("/api/reportes/esperas", params={**RANGO, "agrupar": "etapa"}).json()
    assert d["filas"][0]["clave"] == "impresion"
    assert d["filas"][0]["dias_acumulados"] == 9.0
    assert d["cuello"] == "impresion"


def test_agrupa_por_maquina(api, db_session, cliente_id, impresora_id):
    _orden(db_session, cliente_id, "OTESP-D", [
        ("extrusion", 0, None),
        ("impresion", 1, impresora_id),
        ("finalizado", 4, None),
    ])
    d = api.get("/api/reportes/esperas", params={**RANGO, "agrupar": "maquina"}).json()
    fila = next(f for f in d["filas"] if f["clave"] == str(impresora_id))
    assert fila["dias_acumulados"] == 3.0
    assert fila["etiqueta"]  # el nombre de la máquina, no su id


def test_agrupa_por_mes(api, db_session, cliente_id):
    """El «período» del requerimiento: el cuello puede ser de un mes puntual."""
    _orden(db_session, cliente_id, "OTESP-E", [
        ("extrusion", 0, None), ("impresion", 2, None), ("finalizado", 3, None),
    ])
    d = api.get("/api/reportes/esperas", params={**RANGO, "agrupar": "mes"}).json()
    fila = next(f for f in d["filas"] if f["clave"] == "2033-06")
    assert fila["dias_acumulados"] == 3.0


def test_sin_datos_devuelve_vacio_y_no_rompe(api):
    d = api.get("/api/reportes/esperas",
                params={"desde": "1990-01-01", "hasta": "1990-12-31",
                        "agrupar": "etapa"}).json()
    assert d["filas"] == []
    assert d["cuello"] is None


def test_agrupacion_invalida_no_revienta(api):
    r = api.get("/api/reportes/esperas", params={**RANGO, "agrupar": "cualquiera"})
    assert r.status_code == 400


def test_el_ultimo_pase_sin_siguiente_no_aporta(api, db_session, cliente_id):
    """Una orden abierta cuyo último escaneo es troquelado: ese pase todavía no
    terminó, así que no tiene duración que informar."""
    _orden(db_session, cliente_id, "OTESP-F", [
        ("extrusion", 0, None), ("troquelado", 2, None),
    ], estado="en_proceso")
    d = api.get("/api/reportes/esperas", params={**RANGO, "agrupar": "etapa"}).json()
    claves = [f["clave"] for f in d["filas"]]
    assert "extrusion" in claves
    assert "troquelado" not in claves
