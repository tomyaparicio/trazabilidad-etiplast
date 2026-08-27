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
