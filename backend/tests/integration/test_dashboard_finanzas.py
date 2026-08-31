"""Integración: agregados financieros del dashboard (facturación).

Verifica que `_metricas_financieras` sume el valor de las órdenes (excluyendo
borrador y canceladas) y los montos de presupuestos por estado. Usa deltas
(antes/después) para no depender de datos preexistentes en el test DB.
"""
from routers.dashboard import _metricas_financieras
from models import Cliente, OrdenTrabajo, Presupuesto

_OTS = ["OT-FINTEST-1", "OT-FINTEST-2", "OT-FINTEST-3", "OT-FINTEST-4"]
_PRES = ["PRES-FINTEST-1", "PRES-FINTEST-2"]


def _limpiar(db):
    db.query(OrdenTrabajo).filter(OrdenTrabajo.numero.in_(_OTS)).delete(synchronize_session=False)
    db.query(Presupuesto).filter(Presupuesto.numero.in_(_PRES)).delete(synchronize_session=False)
    db.query(Cliente).filter(Cliente.marca == "FINTEST SA").delete(synchronize_session=False)
    db.commit()


_OTS_P = ["OT-FINTEST-P1", "OT-FINTEST-P2"]
_PRES_P = ["PRES-FINTEST-P1"]


def _limpiar_periodo(db):
    db.query(OrdenTrabajo).filter(OrdenTrabajo.numero.in_(_OTS_P)).delete(synchronize_session=False)
    db.query(Presupuesto).filter(Presupuesto.numero.in_(_PRES_P)).delete(synchronize_session=False)
    db.query(Cliente).filter(Cliente.marca == "FINTEST PERIODO SA").delete(synchronize_session=False)
    db.commit()


def test_metricas_financieras_filtro_por_anio_y_mes(db_session, api):
    """year/month acotan los agregados; la serie es el año completo; el endpoint responde."""
    from datetime import datetime, timezone
    from routers.dashboard import _metricas_financieras as fin

    _limpiar_periodo(db_session)
    antes_mes = fin(db_session, year=2024, month=3)
    antes_anio = fin(db_session, year=2024)

    cli = Cliente(marca="FINTEST PERIODO SA")
    db_session.add(cli)
    db_session.commit()
    db_session.refresh(cli)

    db_session.add_all([
        OrdenTrabajo(numero="OT-FINTEST-P1", cliente_id=cli.id, estado="pendiente", total_final=1000),
        OrdenTrabajo(numero="OT-FINTEST-P2", cliente_id=cli.id, estado="completada", total_final=700),
        Presupuesto(numero="PRES-FINTEST-P1", estado="aprobado", total=2000),
    ])
    db_session.commit()
    # Backdate: created_at tiene server_default → se pisa después del insert.
    db_session.query(OrdenTrabajo).filter(OrdenTrabajo.numero == "OT-FINTEST-P1").update(
        {"created_at": datetime(2024, 3, 10, tzinfo=timezone.utc)}, synchronize_session=False)
    db_session.query(OrdenTrabajo).filter(OrdenTrabajo.numero == "OT-FINTEST-P2").update(
        {"created_at": datetime(2024, 4, 20, tzinfo=timezone.utc)}, synchronize_session=False)
    db_session.query(Presupuesto).filter(Presupuesto.numero == "PRES-FINTEST-P1").update(
        {"created_at": datetime(2024, 3, 5, tzinfo=timezone.utc)}, synchronize_session=False)
    db_session.commit()

    try:
        # — Mes puntual: solo cae lo de marzo 2024 —
        d = fin(db_session, year=2024, month=3)
        assert d["facturacion_total"] - antes_mes["facturacion_total"] == 1000
        assert d["facturacion_completadas"] - antes_mes["facturacion_completadas"] == 0
        assert d["presupuestos_aprobados_monto"] - antes_mes["presupuestos_aprobados_monto"] == 2000
        assert d["anio"] == 2024 and d["mes"] == 3
        assert 2024 in d["anios_disponibles"]

        # — Año entero: caen marzo + abril —
        da = fin(db_session, year=2024)
        assert da["facturacion_total"] - antes_anio["facturacion_total"] == 1700
        assert da["facturacion_completadas"] - antes_anio["facturacion_completadas"] == 700
        # Serie = año completo (2024 ya cerró → 12 meses) con el monto en marzo
        assert len(da["facturacion_mensual"]) == 12
        marzo = next(x for x in da["facturacion_mensual"] if x["mes"] == "2024-03")
        marzo_antes = next((x for x in antes_anio["facturacion_mensual"] if x["mes"] == "2024-03"), {"monto": 0})
        assert marzo["monto"] - marzo_antes["monto"] == 1000

        # — Endpoint HTTP —
        r = api.get("/api/dashboard/finanzas", params={"year": 2024, "month": 3})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["anio"] == 2024 and body["mes"] == 3
        assert "facturacion_mensual" in body and "anios_disponibles" in body

        # — Validación de rango —
        assert api.get("/api/dashboard/finanzas", params={"year": 2024, "month": 13}).status_code == 422
    finally:
        _limpiar_periodo(db_session)


def test_metricas_financieras_suma_facturacion_y_presupuestos(db_session):
    _limpiar(db_session)  # idempotente: limpia restos de corridas previas
    antes = _metricas_financieras(db_session)

    cli = Cliente(marca="FINTEST SA")
    db_session.add(cli)
    db_session.commit()
    db_session.refresh(cli)

    db_session.add_all([
        OrdenTrabajo(numero="OT-FINTEST-1", cliente_id=cli.id, estado="pendiente", total_final=1000),
        OrdenTrabajo(numero="OT-FINTEST-2", cliente_id=cli.id, estado="completada", total_final=500),
        OrdenTrabajo(numero="OT-FINTEST-3", cliente_id=cli.id, estado="cancelada", total_final=9999),  # excluida
        OrdenTrabajo(numero="OT-FINTEST-4", cliente_id=cli.id, estado="borrador", total_final=7777),   # excluida
        Presupuesto(numero="PRES-FINTEST-1", estado="aprobado", total=2000),
        Presupuesto(numero="PRES-FINTEST-2", estado="enviado", total=800),
    ])
    db_session.commit()

    try:
        d = _metricas_financieras(db_session)
        # Facturación = pendiente + completada (NO cancelada ni borrador)
        assert d["facturacion_total"] - antes["facturacion_total"] == 1500
        assert d["facturacion_completadas"] - antes["facturacion_completadas"] == 500
        # Presupuestos por estado
        assert d["presupuestos_aprobados_monto"] - antes["presupuestos_aprobados_monto"] == 2000
        assert d["presupuestos_pendientes_monto"] - antes["presupuestos_pendientes_monto"] == 800
        assert d["presupuestos_aprobados"] - antes["presupuestos_aprobados"] == 1
        assert d["presupuestos_pendientes"] - antes["presupuestos_pendientes"] == 1
        # Agregados nuevos: tasa de aprobación, serie mensual y variación
        assert 0 <= d["tasa_aprobacion"] <= 100
        assert isinstance(d["facturacion_mensual"], list)
        assert all("mes" in x and "monto" in x for x in d["facturacion_mensual"])
        assert d["facturacion_mom"] is None or isinstance(d["facturacion_mom"], (int, float))
    finally:
        _limpiar(db_session)
