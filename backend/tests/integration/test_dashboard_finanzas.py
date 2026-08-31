"""Integración: agregados financieros del dashboard (facturación).

Verifica que `_metricas_financieras` sume las FACTURAS emitidas (excluyendo las
anuladas), separe lo cobrado y agregue los montos de presupuestos por estado.
Usa deltas (antes/después) para no depender de datos preexistentes en el test DB.
"""
from datetime import date

from routers.dashboard import _metricas_financieras
from models import Cliente, Factura, Presupuesto

_FACS = ["FC-FINTEST-1", "FC-FINTEST-2", "FC-FINTEST-3"]
_PRES = ["PRES-FINTEST-1", "PRES-FINTEST-2"]


def _limpiar(db):
    db.query(Factura).filter(Factura.numero.in_(_FACS)).delete(synchronize_session=False)
    db.query(Presupuesto).filter(Presupuesto.numero.in_(_PRES)).delete(synchronize_session=False)
    db.query(Cliente).filter(Cliente.marca == "FINTEST SA").delete(synchronize_session=False)
    db.commit()


_FACS_P = ["FC-FINTEST-P1", "FC-FINTEST-P2"]
_PRES_P = ["PRES-FINTEST-P1"]


def _limpiar_periodo(db):
    db.query(Factura).filter(Factura.numero.in_(_FACS_P)).delete(synchronize_session=False)
    db.query(Presupuesto).filter(Presupuesto.numero.in_(_PRES_P)).delete(synchronize_session=False)
    db.query(Cliente).filter(Cliente.marca == "FINTEST PERIODO SA").delete(synchronize_session=False)
    db.commit()


def test_metricas_financieras_filtro_por_anio_y_mes(db_session, api):
    """year/month acotan por fecha de EMISIÓN; la serie es el año completo."""
    from datetime import datetime, timezone

    _limpiar_periodo(db_session)
    fin = _metricas_financieras
    antes_mes = fin(db_session, year=2024, month=3)
    antes_anio = fin(db_session, year=2024)

    cli = Cliente(marca="FINTEST PERIODO SA")
    db_session.add(cli)
    db_session.commit()
    db_session.refresh(cli)

    db_session.add_all([
        # Marzo 2024 — pendiente
        Factura(numero="FC-FINTEST-P1", cliente_id=cli.id, estado="pendiente",
                fecha=date(2024, 3, 10), subtotal=1000, iva_porcentaje=0, total=1000),
        # Abril 2024 — cobrada
        Factura(numero="FC-FINTEST-P2", cliente_id=cli.id, estado="cobrada",
                fecha=date(2024, 4, 20), fecha_cobro=date(2024, 4, 25),
                subtotal=700, iva_porcentaje=0, total=700),
        Presupuesto(numero="PRES-FINTEST-P1", estado="aprobado", total=2000),
    ])
    db_session.commit()
    # Los presupuestos filtran por created_at (server_default) → backdate.
    db_session.query(Presupuesto).filter(Presupuesto.numero == "PRES-FINTEST-P1").update(
        {"created_at": datetime(2024, 3, 5, tzinfo=timezone.utc)}, synchronize_session=False)
    db_session.commit()

    try:
        # — Mes puntual: sólo la factura de marzo 2024 —
        d = fin(db_session, year=2024, month=3)
        assert d["facturacion_total"] - antes_mes["facturacion_total"] == 1000
        assert d["facturacion_completadas"] - antes_mes["facturacion_completadas"] == 0
        assert d["presupuestos_aprobados_monto"] - antes_mes["presupuestos_aprobados_monto"] == 2000
        assert d["anio"] == 2024 and d["mes"] == 3
        assert 2024 in d["anios_disponibles"]

        # — Año entero: marzo + abril; lo cobrado es sólo abril —
        da = fin(db_session, year=2024)
        assert da["facturacion_total"] - antes_anio["facturacion_total"] == 1700
        assert da["facturacion_completadas"] - antes_anio["facturacion_completadas"] == 700
        assert len(da["facturacion_mensual"]) == 12   # 2024 cerrado → 12 meses
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


def test_metricas_financieras_suma_facturas_y_presupuestos(db_session):
    """Facturación = facturas no anuladas; cobrado = sólo las 'cobrada'."""
    _limpiar(db_session)
    antes = _metricas_financieras(db_session)

    cli = Cliente(marca="FINTEST SA")
    db_session.add(cli)
    db_session.commit()
    db_session.refresh(cli)

    hoy = date.today()
    db_session.add_all([
        Factura(numero="FC-FINTEST-1", cliente_id=cli.id, estado="pendiente",
                fecha=hoy, subtotal=1000, iva_porcentaje=0, total=1000),
        Factura(numero="FC-FINTEST-2", cliente_id=cli.id, estado="cobrada",
                fecha=hoy, fecha_cobro=hoy, subtotal=500, iva_porcentaje=0, total=500),
        # Anulada: NO debe sumar en ningún agregado
        Factura(numero="FC-FINTEST-3", cliente_id=cli.id, estado="anulada",
                fecha=hoy, subtotal=9999, iva_porcentaje=0, total=9999),
        Presupuesto(numero="PRES-FINTEST-1", estado="aprobado", total=2000),
        Presupuesto(numero="PRES-FINTEST-2", estado="enviado", total=800),
    ])
    db_session.commit()

    try:
        d = _metricas_financieras(db_session)
        # Facturación = pendiente + cobrada (la anulada queda afuera)
        assert d["facturacion_total"] - antes["facturacion_total"] == 1500
        assert d["facturacion_completadas"] - antes["facturacion_completadas"] == 500
        # Presupuestos por estado
        assert d["presupuestos_aprobados_monto"] - antes["presupuestos_aprobados_monto"] == 2000
        assert d["presupuestos_pendientes_monto"] - antes["presupuestos_pendientes_monto"] == 800
        assert d["presupuestos_aprobados"] - antes["presupuestos_aprobados"] == 1
        assert d["presupuestos_pendientes"] - antes["presupuestos_pendientes"] == 1
        # Agregados generales
        assert 0 <= d["tasa_aprobacion"] <= 100
        assert isinstance(d["facturacion_mensual"], list)
        assert all("mes" in x and "monto" in x for x in d["facturacion_mensual"])
        assert d["facturacion_mom"] is None or isinstance(d["facturacion_mom"], (int, float))
    finally:
        _limpiar(db_session)
