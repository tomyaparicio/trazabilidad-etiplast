"""Integración: CRUD de facturas + su impacto en el dashboard.

Cubre lo que hace distinto a este módulo:
  - el TOTAL se calcula server-side (subtotal + IVA), nunca se acepta del cliente,
  - numeración correlativa FC-NNNN y rechazo de números duplicados,
  - marcar cobrada completa la fecha de cobro sola,
  - las anuladas no cuentan como facturación,
  - lo facturado impacta en /api/dashboard/finanzas.
"""
from models import Cliente, Factura


def _limpiar(db, marca):
    ids = [c.id for c in db.query(Cliente).filter(Cliente.marca == marca).all()]
    if ids:
        db.query(Factura).filter(Factura.cliente_id.in_(ids)).delete(synchronize_session=False)
        db.query(Cliente).filter(Cliente.id.in_(ids)).delete(synchronize_session=False)
        db.commit()


def _cliente(api, marca):
    r = api.post("/api/clientes", json={"marca": marca})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_crud_factura_y_total_calculado(api, db_session):
    marca = "FACTEST SA"
    _limpiar(db_session, marca)
    cid = _cliente(api, marca)
    try:
        # ── CREATE: total lo calcula el server (1000 + 21% = 1210) ──
        r = api.post("/api/facturas", json={
            "cliente_id": cid, "fecha": "2025-05-10",
            "subtotal": 1000, "iva_porcentaje": 21,
            "total": 999999,  # intento de mandar un total inconsistente: se ignora
        })
        assert r.status_code == 201, r.text
        f = r.json()
        assert f["total"] == 1210.0, "el total debe recalcularse server-side"
        assert f["numero"].startswith("FC-")
        assert f["estado"] == "pendiente"
        assert f["cliente_nombre"] == marca
        fid = f["id"]

        # ── READ ──
        assert api.get(f"/api/facturas/{fid}").json()["total"] == 1210.0

        # ── LISTA: trae totales del filtro ──
        r = api.get("/api/facturas", params={"cliente_id": cid})
        assert r.status_code == 200
        body = r.json()
        assert body["total"] == 1 and body["monto_total"] == 1210.0
        assert body["monto_cobrado"] == 0.0

        # ── UPDATE: cambiar subtotal recalcula el total ──
        r = api.put(f"/api/facturas/{fid}", json={"subtotal": 2000})
        assert r.status_code == 200, r.text
        assert r.json()["total"] == 2420.0

        # ── Marcar cobrada: completa fecha_cobro sola ──
        r = api.put(f"/api/facturas/{fid}", json={"estado": "cobrada"})
        assert r.status_code == 200
        assert r.json()["estado"] == "cobrada"
        assert r.json()["fecha_cobro"] is not None

        # ── Volver a pendiente: limpia la fecha de cobro ──
        r = api.put(f"/api/facturas/{fid}", json={"estado": "pendiente"})
        assert r.json()["fecha_cobro"] is None

        # ── Validaciones ──
        assert api.put(f"/api/facturas/{fid}", json={"estado": "inventado"}).status_code == 422
        assert api.post("/api/facturas", json={"cliente_id": 999999, "subtotal": 1}).status_code == 404

        # ── Número duplicado → 409 ──
        numero = api.get(f"/api/facturas/{fid}").json()["numero"]
        assert api.post("/api/facturas", json={"numero": numero, "subtotal": 1}).status_code == 409

        # ── DELETE ──
        assert api.delete(f"/api/facturas/{fid}").status_code == 204
        assert api.get(f"/api/facturas/{fid}").status_code == 404
    finally:
        _limpiar(db_session, marca)


def test_facturas_impactan_en_dashboard(api, db_session):
    """Lo facturado (no anulado) suma en /api/dashboard/finanzas; lo cobrado aparte."""
    marca = "FACTEST DASH SA"
    _limpiar(db_session, marca)
    cid = _cliente(api, marca)
    try:
        antes = api.get("/api/dashboard/finanzas", params={"year": 2025, "month": 7}).json()

        # 1000 pendiente + 500 cobrada + 9999 anulada (esta no debe contar)
        for sub, estado in ((1000, "pendiente"), (500, "cobrada"), (9999, "anulada")):
            r = api.post("/api/facturas", json={
                "cliente_id": cid, "fecha": "2025-07-15",
                "subtotal": sub, "iva_porcentaje": 0, "estado": estado,
            })
            assert r.status_code == 201, r.text

        d = api.get("/api/dashboard/finanzas", params={"year": 2025, "month": 7}).json()
        assert d["facturacion_total"] - antes["facturacion_total"] == 1500
        assert d["facturacion_completadas"] - antes["facturacion_completadas"] == 500
        assert 2025 in d["anios_disponibles"]

        # La serie del año incluye julio con el monto facturado
        anual = api.get("/api/dashboard/finanzas", params={"year": 2025}).json()
        julio = next(x for x in anual["facturacion_mensual"] if x["mes"] == "2025-07")
        assert julio["monto"] >= 1500
    finally:
        _limpiar(db_session, marca)


def test_anuladas_no_suman_en_los_totales_del_listado(api, db_session):
    """Regresión: monto_total/pendiente del listado excluyen las ANULADAS,
    igual que el dashboard (antes la pantalla y el panel se contradecían)."""
    marca = "FACTEST ANULADAS SA"
    _limpiar(db_session, marca)
    cid = _cliente(api, marca)
    try:
        for sub, estado in ((1000, "pendiente"), (500, "cobrada"), (9999, "anulada")):
            r = api.post("/api/facturas", json={
                "cliente_id": cid, "fecha": "2025-09-10",
                "subtotal": sub, "iva_porcentaje": 0, "estado": estado,
            })
            assert r.status_code == 201, r.text

        b = api.get("/api/facturas", params={"cliente_id": cid}).json()
        assert b["monto_total"] == 1500.0, "la anulada NO debe sumar en Facturado"
        assert b["monto_cobrado"] == 500.0
        assert b["monto_total"] - b["monto_cobrado"] == 1000.0, "pendiente de cobro sin la anulada"
        assert b["total"] == 3, "el conteo de filas sí incluye la anulada (se listan)"
    finally:
        _limpiar(db_session, marca)


def test_importes_negativos_rechazados(api, db_session):
    """Regresión: subtotal/IVA negativos restaban de la facturación."""
    marca = "FACTEST NEG SA"
    _limpiar(db_session, marca)
    cid = _cliente(api, marca)
    try:
        assert api.post("/api/facturas", json={"cliente_id": cid, "subtotal": -500}).status_code == 422
        assert api.post("/api/facturas", json={"cliente_id": cid, "subtotal": 100, "iva_porcentaje": -21}).status_code == 422
        assert api.post("/api/facturas", json={"cliente_id": cid, "subtotal": 100, "iva_porcentaje": 500}).status_code == 422

        r = api.post("/api/facturas", json={"cliente_id": cid, "subtotal": 100, "iva_porcentaje": 21})
        assert r.status_code == 201
        assert api.put(f"/api/facturas/{r.json()['id']}", json={"subtotal": -1}).status_code == 422
    finally:
        _limpiar(db_session, marca)


def test_numeracion_ignora_numeros_con_otro_formato(api, db_session):
    """Regresión: un número manual tipo '0001-00000123' contaminaba el correlativo."""
    marca = "FACTEST NUM SA"
    _limpiar(db_session, marca)
    cid = _cliente(api, marca)
    try:
        # Número real de AFIP cargado a mano (no sigue el formato FC-NNNN)
        r = api.post("/api/facturas", json={
            "numero": "0001-00099999", "cliente_id": cid, "subtotal": 10, "iva_porcentaje": 0,
        })
        assert r.status_code == 201, r.text

        # El correlativo NO debe saltar a FC-100000
        r = api.post("/api/facturas", json={"cliente_id": cid, "subtotal": 10, "iva_porcentaje": 0})
        assert r.status_code == 201, r.text
        numero = r.json()["numero"]
        assert numero.startswith("FC-")
        assert int(numero.split("-")[1]) < 99999, f"el correlativo se contaminó: {numero}"
    finally:
        _limpiar(db_session, marca)


def test_finanzas_del_dashboard_exige_permiso_de_facturas(api, db_session):
    """La plata es admin-only: un rol sin 'facturas:ver' no debe verla."""
    from models import Role
    from dependencies import tiene_permiso

    # El admin (protegido) sí puede
    assert api.get("/api/dashboard/finanzas").status_code == 200

    # Un rol sin el permiso, no (se valida el helper que usa /dashboard/stats)
    clave = "sinfacturas_test"
    db_session.query(Role).filter(Role.clave == clave).delete(synchronize_session=False)
    db_session.commit()
    db_session.add(Role(clave=clave, nombre="Sin facturas", vistas=["panel"], acciones=["ordenes:ver"], protegido=False))
    db_session.commit()
    try:
        assert tiene_permiso({"role": clave}, "facturas:ver", db_session) is False
        assert tiene_permiso({"role": "admin"}, "facturas:ver", db_session) is True
    finally:
        db_session.query(Role).filter(Role.clave == clave).delete(synchronize_session=False)
        db_session.commit()
