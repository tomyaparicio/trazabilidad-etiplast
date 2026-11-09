"""Integración: el CUMPLIMIENTO DE PLAZOS en el resumen de reportes.

`pct_a_tiempo` existía como clave y devolvía siempre `null`, con un comentario
en el código que decía por qué: no había fecha comprometida en el modelo. Ahora
la hay, así que el indicador se calcula.

Qué cuenta y qué no:

  - Entra al porcentaje la orden que tiene plazo pactado Y desenlace (fecha de
    entrega real, o fecha de cierre si se cerró sin registrar la entrega).
  - Queda afuera la que no tiene plazo: no se puede medir contra nada. Las
    órdenes anteriores a la columna están en ese caso y son muchas, así que el
    endpoint informa `muestras_a_tiempo` — un 100% sobre dos órdenes no es lo
    mismo que sobre doscientas, y el que lee el reporte tiene que poder verlo.
  - Las abiertas no entran al porcentaje (todavía no se sabe), pero sí se
    cuentan aparte en `atrasadas_abiertas` cuando su plazo ya pasó: eso es
    atraso real, no proyectado, y es lo que la planta necesita mirar hoy.

El rango de fechas de este test es 2031 a propósito: el endpoint filtra por
`OrdenTrabajo.fecha` y así ninguna otra orden del test DB entra en la cuenta.
"""
from datetime import date

import pytest

from models import Cliente, OrdenTrabajo

MARCA = "OTCUMPL TEST SA"
RANGO = {"desde": "2031-01-01", "hasta": "2031-12-31"}
FECHA_OT = date(2031, 6, 1)

# Para los tests de atraso hace falta un plazo YA VENCIDO, y «vencido» se mide
# contra hoy: con fechas de 2031 la orden no está atrasada, está a tiempo. Por
# eso esos casos usan su propio rango en el pasado, igual de vacío de datos
# ajenos que el de 2031.
RANGO_PASADO = {"desde": "2019-01-01", "hasta": "2019-12-31"}
FECHA_OT_PASADA = date(2019, 6, 1)


def _limpiar(db):
    ids = [c.id for c in db.query(Cliente).filter(Cliente.marca == MARCA).all()]
    if ids:
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


def _sembrar(db, cliente_id, ordenes, fecha_ot=FECHA_OT):
    """`ordenes` es una lista de dicts con las claves que importan al reporte."""
    for i, o in enumerate(ordenes):
        db.add(OrdenTrabajo(
            numero=f"OTCUMPL-{i}-{id(ordenes)}",
            cliente_id=cliente_id,
            fecha=fecha_ot,
            **o,
        ))
    db.commit()


def test_sin_ninguna_orden_con_plazo_el_indicador_es_null(api, db_session, cliente_id):
    """Honestidad del indicador: si no hay con qué medir, no se informa un 0% —
    eso se leería como «ninguna salió en término»."""
    _sembrar(db_session, cliente_id, [
        {"estado": "completada", "fecha_entrega": date(2031, 6, 10)},
    ])
    r = api.get("/api/reportes/resumen", params=RANGO)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["pct_a_tiempo"] is None
    assert d["muestras_a_tiempo"] == 0


def test_cuenta_a_tiempo_la_entregada_antes_del_plazo(api, db_session, cliente_id):
    _sembrar(db_session, cliente_id, [
        {"estado": "completada",
         "fecha_comprometida": date(2031, 6, 20),
         "fecha_entrega": date(2031, 6, 18)},
    ])
    d = api.get("/api/reportes/resumen", params=RANGO).json()
    assert d["pct_a_tiempo"] == 100.0
    assert d["muestras_a_tiempo"] == 1


def test_el_mismo_dia_del_plazo_cuenta_a_tiempo(api, db_session, cliente_id):
    """Entregar el día pactado es cumplir. El límite es inclusivo."""
    _sembrar(db_session, cliente_id, [
        {"estado": "completada",
         "fecha_comprometida": date(2031, 6, 20),
         "fecha_entrega": date(2031, 6, 20)},
    ])
    d = api.get("/api/reportes/resumen", params=RANGO).json()
    assert d["pct_a_tiempo"] == 100.0


def test_cuenta_fuera_de_termino_la_entregada_despues(api, db_session, cliente_id):
    _sembrar(db_session, cliente_id, [
        {"estado": "completada",
         "fecha_comprometida": date(2031, 6, 20),
         "fecha_entrega": date(2031, 6, 25)},
    ])
    d = api.get("/api/reportes/resumen", params=RANGO).json()
    assert d["pct_a_tiempo"] == 0.0
    assert d["muestras_a_tiempo"] == 1


def test_el_porcentaje_es_sobre_las_medibles(api, db_session, cliente_id):
    """Tres con plazo (dos en término) y una sin plazo: 66,7% sobre 3, no sobre 4."""
    _sembrar(db_session, cliente_id, [
        {"estado": "completada", "fecha_comprometida": date(2031, 6, 20), "fecha_entrega": date(2031, 6, 18)},
        {"estado": "completada", "fecha_comprometida": date(2031, 6, 20), "fecha_entrega": date(2031, 6, 20)},
        {"estado": "completada", "fecha_comprometida": date(2031, 6, 20), "fecha_entrega": date(2031, 6, 28)},
        {"estado": "completada", "fecha_entrega": date(2031, 6, 18)},
    ])
    d = api.get("/api/reportes/resumen", params=RANGO).json()
    assert d["muestras_a_tiempo"] == 3
    assert d["pct_a_tiempo"] == 66.7


def test_la_abierta_con_plazo_vencido_cuenta_como_atrasada(api, db_session, cliente_id):
    """No entra al porcentaje —no terminó— pero el atraso ya existe."""
    _sembrar(db_session, cliente_id, [
        {"estado": "en_proceso", "fecha_comprometida": date(2019, 6, 20)},
    ], fecha_ot=FECHA_OT_PASADA)
    d = api.get("/api/reportes/resumen", params=RANGO_PASADO).json()
    assert d["pct_a_tiempo"] is None
    assert d["muestras_a_tiempo"] == 0
    assert d["atrasadas_abiertas"] == 1


def test_la_abierta_con_plazo_por_venir_no_esta_atrasada(api, db_session, cliente_id):
    _sembrar(db_session, cliente_id, [
        {"estado": "en_proceso", "fecha_comprometida": date(2099, 1, 1)},
    ], fecha_ot=FECHA_OT_PASADA)
    d = api.get("/api/reportes/resumen", params=RANGO_PASADO).json()
    assert d["atrasadas_abiertas"] == 0


def test_la_cancelada_no_cuenta_ni_como_atrasada_ni_en_el_porcentaje(api, db_session, cliente_id):
    """Un pedido que el cliente dio de baja no es un plazo incumplido."""
    _sembrar(db_session, cliente_id, [
        {"estado": "cancelada", "fecha_comprometida": date(2019, 6, 20)},
        {"estado": "cancelada", "fecha_comprometida": date(2019, 6, 20), "fecha_entrega": date(2019, 7, 1)},
    ], fecha_ot=FECHA_OT_PASADA)
    d = api.get("/api/reportes/resumen", params=RANGO_PASADO).json()
    assert d["pct_a_tiempo"] is None
    assert d["muestras_a_tiempo"] == 0
    assert d["atrasadas_abiertas"] == 0
