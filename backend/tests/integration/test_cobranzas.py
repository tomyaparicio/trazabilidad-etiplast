"""Integración: módulo de COBRANZAS — la plata que entra.

Lo que hace distinto a este módulo, y lo único que estos tests defienden:

    una cobranza en efectivo o transferencia es plata YA;
    una cobranza con cheque es plata CUANDO EL CHEQUE SE ACREDITA.

Los dos números tienen que poder calcularse por separado y no confundirse nunca.
Por eso el test del resumen (`/api/cobranzas/resumen`) es EL test: si un cheque
en cartera se cuela en `entrado`, el dueño cree que tiene plata que todavía no
tiene y paga sueldos con un papel.

La base de test está COMPARTIDA con el resto de los archivos de integración y
arrastra residuo, así que todo acá se acota al dato propio (marcas con prefijo
`COBTEST`) o se mide POR DELTA (resumen antes → resumen después).
"""
from datetime import date

from models import Cliente, Cobranza, Factura

MARCA_PREFIJO = "COBTEST"


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _limpiar(db, marca):
    """Borra el cliente de la prueba y TODO lo que cuelga de él."""
    ids = [c.id for c in db.query(Cliente).filter(Cliente.marca == marca).all()]
    if ids:
        db.query(Cobranza).filter(Cobranza.cliente_id.in_(ids)).delete(synchronize_session=False)
        db.query(Factura).filter(Factura.cliente_id.in_(ids)).delete(synchronize_session=False)
        db.query(Cliente).filter(Cliente.id.in_(ids)).delete(synchronize_session=False)
        db.commit()


def _cliente(api, marca):
    r = api.post("/api/clientes", json={"marca": marca})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _resumen(api):
    r = api.get("/api/cobranzas/resumen")
    assert r.status_code == 200, r.text
    return r.json()


def _mes_de(d: date) -> str:
    return f"{d.year}-{d.month:02d}"


def _por_acreditar(resumen, clave_mes):
    """Total del mes `clave_mes` en el calendario (0 si ese mes no figura)."""
    for fila in resumen["por_acreditar"]:
        if fila["mes"] == clave_mes:
            return fila["total"], fila["cantidad"]
    return 0, 0


# ─── Alta por medio de pago ──────────────────────────────────────────────────

def test_crear_cobranza_en_efectivo_y_transferencia(api, db_session):
    marca = f"{MARCA_PREFIJO} CONTADO SA"
    _limpiar(db_session, marca)
    cid = _cliente(api, marca)
    try:
        for medio in ("efectivo", "transferencia"):
            r = api.post("/api/cobranzas", json={
                "cliente_id": cid, "fecha": "2026-03-10",
                "medio": medio, "importe": 15000.50,
            })
            assert r.status_code == 201, r.text
            c = r.json()
            assert c["medio"] == medio
            assert c["importe"] == 15000.50
            assert c["numero"].startswith("COB-")
            assert c["cliente_nombre"] == marca
            # Una cobranza de contado no tiene nada de cheque.
            assert c["cheque_estado"] is None
            assert c["cheque_fecha_pago"] is None
    finally:
        _limpiar(db_session, marca)


def test_crear_cobranza_con_cheque(api, db_session):
    marca = f"{MARCA_PREFIJO} CHEQUE SA"
    _limpiar(db_session, marca)
    cid = _cliente(api, marca)
    try:
        r = api.post("/api/cobranzas", json={
            "cliente_id": cid, "fecha": "2026-03-10",
            "medio": "cheque", "importe": 80000,
            "cheque_numero": "12345678", "cheque_banco": "Banco Nación",
            "cheque_fecha_pago": "2026-05-09",
        })
        assert r.status_code == 201, r.text
        c = r.json()
        assert c["medio"] == "cheque"
        assert c["cheque_numero"] == "12345678"
        assert c["cheque_banco"] == "Banco Nación"
        assert c["cheque_fecha_pago"] == "2026-05-09"
        # El cheque nace EN CARTERA: es plata con fecha, todavía no es plata.
        assert c["cheque_estado"] == "en_cartera", "el default al crear es en_cartera"
    finally:
        _limpiar(db_session, marca)


# ─── Validaciones ────────────────────────────────────────────────────────────

def test_cheque_sin_fecha_de_pago_se_rechaza(api, db_session):
    """Un cheque sin fecha de pago no se puede poner en el calendario, que es
    la razón de ser del módulo."""
    marca = f"{MARCA_PREFIJO} SINFECHA SA"
    _limpiar(db_session, marca)
    cid = _cliente(api, marca)
    try:
        r = api.post("/api/cobranzas", json={
            "cliente_id": cid, "medio": "cheque", "importe": 1000,
            "cheque_numero": "999",
        })
        assert r.status_code == 400, r.text

        # Tampoco se puede dejar un cheque sin fecha por la puerta de atrás:
        # crear de contado y después cambiarle el medio a cheque.
        r = api.post("/api/cobranzas", json={
            "cliente_id": cid, "medio": "efectivo", "importe": 1000,
        })
        assert r.status_code == 201, r.text
        cob_id = r.json()["id"]
        assert api.put(f"/api/cobranzas/{cob_id}", json={"medio": "cheque"}).status_code == 400
    finally:
        _limpiar(db_session, marca)


def test_importe_cero_o_negativo_se_rechaza(api, db_session):
    """Un importe 0 no es una cobranza; uno negativo restaría de la plata que entró."""
    marca = f"{MARCA_PREFIJO} IMPORTE SA"
    _limpiar(db_session, marca)
    cid = _cliente(api, marca)
    try:
        for malo in (0, -1, -50000.25):
            r = api.post("/api/cobranzas", json={
                "cliente_id": cid, "medio": "efectivo", "importe": malo,
            })
            assert r.status_code == 400, f"importe {malo} debería rechazarse: {r.text}"

        r = api.post("/api/cobranzas", json={"cliente_id": cid, "medio": "efectivo", "importe": 100})
        assert r.status_code == 201, r.text
        cob_id = r.json()["id"]
        assert api.put(f"/api/cobranzas/{cob_id}", json={"importe": 0}).status_code == 400
        assert api.put(f"/api/cobranzas/{cob_id}", json={"importe": -3}).status_code == 400
    finally:
        _limpiar(db_session, marca)


def test_medio_que_no_es_cheque_no_guarda_datos_de_cheque(api, db_session):
    """Mandar datos de cheque con medio efectivo no deja medio cheque a medias:
    si no se ignoraran, un `cheque_estado` colgado haría que la cobranza
    desapareciera de `entrado` (no está acreditada) sin aparecer en `en_cartera`."""
    marca = f"{MARCA_PREFIJO} IGNORA SA"
    _limpiar(db_session, marca)
    cid = _cliente(api, marca)
    try:
        r = api.post("/api/cobranzas", json={
            "cliente_id": cid, "medio": "transferencia", "importe": 2000,
            "cheque_numero": "no-va", "cheque_banco": "no-va",
            "cheque_fecha_pago": "2026-09-09", "cheque_estado": "depositado",
        })
        assert r.status_code == 201, r.text
        c = r.json()
        assert c["cheque_numero"] is None
        assert c["cheque_banco"] is None
        assert c["cheque_fecha_pago"] is None
        assert c["cheque_estado"] is None

        # Y pasar de cheque a contado limpia lo que había.
        r = api.post("/api/cobranzas", json={
            "cliente_id": cid, "medio": "cheque", "importe": 3000,
            "cheque_numero": "777", "cheque_fecha_pago": "2026-09-09",
        })
        assert r.status_code == 201, r.text
        cob_id = r.json()["id"]
        r = api.put(f"/api/cobranzas/{cob_id}", json={"medio": "efectivo"})
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["cheque_numero"] is None
        assert c["cheque_fecha_pago"] is None
        assert c["cheque_estado"] is None
    finally:
        _limpiar(db_session, marca)


def test_estado_de_cheque_invalido_se_rechaza(api, db_session):
    marca = f"{MARCA_PREFIJO} ESTADO SA"
    _limpiar(db_session, marca)
    cid = _cliente(api, marca)
    try:
        r = api.post("/api/cobranzas", json={
            "cliente_id": cid, "medio": "cheque", "importe": 1000,
            "cheque_fecha_pago": "2026-07-07", "cheque_estado": "inventado",
        })
        assert r.status_code == 400, r.text

        r = api.post("/api/cobranzas", json={
            "cliente_id": cid, "medio": "cheque", "importe": 1000,
            "cheque_fecha_pago": "2026-07-07",
        })
        assert r.status_code == 201, r.text
        cob_id = r.json()["id"]
        assert api.put(f"/api/cobranzas/{cob_id}", json={"cheque_estado": "cobrado"}).status_code == 400
        # Los cuatro válidos sí entran.
        for bueno in ("en_cartera", "depositado", "acreditado", "rechazado"):
            r = api.put(f"/api/cobranzas/{cob_id}", json={"cheque_estado": bueno})
            assert r.status_code == 200, r.text
            assert r.json()["cheque_estado"] == bueno

        # Un medio inventado tampoco entra.
        assert api.post("/api/cobranzas", json={
            "cliente_id": cid, "medio": "trueque", "importe": 1000,
        }).status_code == 400
    finally:
        _limpiar(db_session, marca)


# ─── EL test: el resumen ─────────────────────────────────────────────────────

def test_resumen_separa_la_plata_que_entro_de_la_que_tiene_fecha(api, db_session):
    """La regla que define el módulo, medida por delta sobre el resumen.

    - efectivo y transferencia cuentan en `entrado` el mismo día;
    - un cheque EN CARTERA no cuenta en `entrado`, pero sí en `en_cartera`;
    - cuando se ACREDITA, entra en `entrado` y sale de `en_cartera`;
    - si se RECHAZA, no cuenta en ninguno de los dos y sí en `rechazados`.
    """
    marca = f"{MARCA_PREFIJO} RESUMEN SA"
    _limpiar(db_session, marca)
    cid = _cliente(api, marca)
    hoy = date.today().isoformat()
    try:
        base = _resumen(api)

        # ── Contado: plata YA ──
        for medio, importe in (("efectivo", 1000), ("transferencia", 500)):
            r = api.post("/api/cobranzas", json={
                "cliente_id": cid, "fecha": hoy, "medio": medio, "importe": importe,
            })
            assert r.status_code == 201, r.text

        d = _resumen(api)
        assert d["entrado"]["mes"] - base["entrado"]["mes"] == 1500
        assert d["entrado"]["anio"] - base["entrado"]["anio"] == 1500
        assert d["en_cartera"]["total"] - base["en_cartera"]["total"] == 0, \
            "el contado NO es plata en cartera"

        # ── Cheque en cartera: plata CON FECHA, no plata ──
        # Fecha de pago = hoy para que, al acreditarse, el delta del mes sea
        # comprobable (la plata del cheque entra el día en que se acredita).
        r = api.post("/api/cobranzas", json={
            "cliente_id": cid, "fecha": hoy, "medio": "cheque", "importe": 7000,
            "cheque_numero": "RES-1", "cheque_fecha_pago": hoy,
        })
        assert r.status_code == 201, r.text
        cheque_id = r.json()["id"]

        d = _resumen(api)
        assert d["entrado"]["mes"] - base["entrado"]["mes"] == 1500, \
            "un cheque EN CARTERA no es plata que entró"
        assert d["en_cartera"]["total"] - base["en_cartera"]["total"] == 7000
        assert d["en_cartera"]["cantidad"] - base["en_cartera"]["cantidad"] == 1

        # ── Depositado sigue siendo cartera (todavía no acreditó) ──
        assert api.put(f"/api/cobranzas/{cheque_id}", json={"cheque_estado": "depositado"}).status_code == 200
        d = _resumen(api)
        assert d["entrado"]["mes"] - base["entrado"]["mes"] == 1500, \
            "depositado no es acreditado: la plata todavía no está"
        assert d["en_cartera"]["total"] - base["en_cartera"]["total"] == 7000

        # ── Acreditado: AHORA sí es plata, y sale de la cartera ──
        assert api.put(f"/api/cobranzas/{cheque_id}", json={"cheque_estado": "acreditado"}).status_code == 200
        d = _resumen(api)
        assert d["entrado"]["mes"] - base["entrado"]["mes"] == 8500, \
            "el cheque acreditado tiene que sumar en entrado"
        assert d["en_cartera"]["total"] - base["en_cartera"]["total"] == 0, \
            "el cheque acreditado tiene que salir de en_cartera"
        assert d["en_cartera"]["cantidad"] - base["en_cartera"]["cantidad"] == 0

        # ── Rechazado: no es plata ni cartera; es un problema aparte ──
        assert api.put(f"/api/cobranzas/{cheque_id}", json={"cheque_estado": "rechazado"}).status_code == 200
        d = _resumen(api)
        assert d["entrado"]["mes"] - base["entrado"]["mes"] == 1500, \
            "un cheque rechazado NO es plata que entró"
        assert d["en_cartera"]["total"] - base["en_cartera"]["total"] == 0, \
            "un cheque rechazado NO está en cartera"
        assert d["rechazados"]["total"] - base["rechazados"]["total"] == 7000
        assert d["rechazados"]["cantidad"] - base["rechazados"]["cantidad"] == 1
    finally:
        _limpiar(db_session, marca)


def test_la_plata_del_cheque_entra_el_mes_en_que_se_acredita(api, db_session):
    """Un cheque recibido HOY con fecha de pago el año que viene y ya acreditado
    NO es plata de este mes: la plata entra el día en que el cheque se cobra.
    Si se midiera por la fecha de recepción, el mes en curso mostraría plata que
    este mes no estuvo."""
    marca = f"{MARCA_PREFIJO} DIFERIDO SA"
    _limpiar(db_session, marca)
    cid = _cliente(api, marca)
    hoy = date.today()
    pago = date(hoy.year + 1, hoy.month, 15)   # mismo mes, año que viene
    try:
        base = _resumen(api)
        base_futuro = api.get("/api/cobranzas/resumen", params={
            "year": pago.year, "month": pago.month,
        }).json()

        r = api.post("/api/cobranzas", json={
            "cliente_id": cid, "fecha": hoy.isoformat(),
            "medio": "cheque", "importe": 50000,
            "cheque_fecha_pago": pago.isoformat(), "cheque_estado": "acreditado",
        })
        assert r.status_code == 201, r.text

        d = _resumen(api)
        assert d["entrado"]["mes"] - base["entrado"]["mes"] == 0, \
            "la plata del cheque no entró este mes: entra cuando el cheque se cobra"
        assert d["entrado"]["anio"] - base["entrado"]["anio"] == 0

        # Y en el período en que SÍ se cobra, está.
        f = api.get("/api/cobranzas/resumen", params={
            "year": pago.year, "month": pago.month,
        }).json()
        assert f["entrado"]["mes"] - base_futuro["entrado"]["mes"] == 50000
        assert f["entrado"]["anio"] - base_futuro["entrado"]["anio"] == 50000
    finally:
        _limpiar(db_session, marca)


def test_resumen_arma_el_calendario_por_mes_de_pago(api, db_session):
    """`por_acreditar` agrupa los cheques pendientes por MES de cheque_fecha_pago,
    no por el día en que se recibieron."""
    marca = f"{MARCA_PREFIJO} CALENDARIO SA"
    _limpiar(db_session, marca)
    cid = _cliente(api, marca)
    hoy = date.today()
    try:
        base = _resumen(api)
        # Dos meses distintos, bien lejos, para no pelearse con el residuo.
        mes_a = date(hoy.year + 2, 4, 15)
        mes_b = date(hoy.year + 2, 6, 20)
        clave_a, clave_b = _mes_de(mes_a), _mes_de(mes_b)
        base_a, base_a_cant = _por_acreditar(base, clave_a)
        base_b, base_b_cant = _por_acreditar(base, clave_b)

        # Dos cheques al mismo mes + uno a otro mes. Todos recibidos HOY.
        for fecha_pago, importe in ((mes_a, 1000), (mes_a, 2000), (mes_b, 4000)):
            r = api.post("/api/cobranzas", json={
                "cliente_id": cid, "fecha": hoy.isoformat(),
                "medio": "cheque", "importe": importe,
                "cheque_fecha_pago": fecha_pago.isoformat(),
            })
            assert r.status_code == 201, r.text
        # Un cheque ya acreditado NO va al calendario: ya no hay nada que esperar.
        r = api.post("/api/cobranzas", json={
            "cliente_id": cid, "fecha": hoy.isoformat(),
            "medio": "cheque", "importe": 9999,
            "cheque_fecha_pago": mes_a.isoformat(), "cheque_estado": "acreditado",
        })
        assert r.status_code == 201, r.text

        d = _resumen(api)
        total_a, cant_a = _por_acreditar(d, clave_a)
        total_b, cant_b = _por_acreditar(d, clave_b)
        assert total_a - base_a == 3000, "los dos cheques del mismo mes se agrupan"
        assert cant_a - base_a_cant == 2, "el acreditado no cuenta en el calendario"
        assert total_b - base_b == 4000
        assert cant_b - base_b_cant == 1

        # El calendario viene ordenado por mes (el frontend lo pinta como viene).
        meses = [f["mes"] for f in d["por_acreditar"]]
        assert meses == sorted(meses)
    finally:
        _limpiar(db_session, marca)


# ─── Listado y filtros ───────────────────────────────────────────────────────

def test_listado_filtra_por_cliente_medio_estado_y_fechas(api, db_session):
    marca = f"{MARCA_PREFIJO} LISTADO SA"
    _limpiar(db_session, marca)
    cid = _cliente(api, marca)
    try:
        api.post("/api/cobranzas", json={
            "cliente_id": cid, "fecha": "2026-01-10", "medio": "efectivo", "importe": 100,
        })
        api.post("/api/cobranzas", json={
            "cliente_id": cid, "fecha": "2026-02-10", "medio": "cheque", "importe": 200,
            "cheque_fecha_pago": "2026-04-10",
        })
        api.post("/api/cobranzas", json={
            "cliente_id": cid, "fecha": "2026-03-10", "medio": "cheque", "importe": 300,
            "cheque_fecha_pago": "2026-05-10", "cheque_estado": "acreditado",
        })

        b = api.get("/api/cobranzas", params={"cliente_id": cid}).json()
        assert b["total"] == 3
        assert b["monto_total"] == 600.0

        b = api.get("/api/cobranzas", params={"cliente_id": cid, "medio": "cheque"}).json()
        assert b["total"] == 2

        b = api.get("/api/cobranzas", params={"cliente_id": cid, "cheque_estado": "acreditado"}).json()
        assert b["total"] == 1 and b["data"][0]["importe"] == 300.0

        b = api.get("/api/cobranzas", params={
            "cliente_id": cid, "desde": "2026-02-01", "hasta": "2026-02-28",
        }).json()
        assert b["total"] == 1 and b["data"][0]["importe"] == 200.0
    finally:
        _limpiar(db_session, marca)


# ─── Vínculos opcionales ─────────────────────────────────────────────────────

def test_borrar_la_factura_no_borra_la_cobranza(api, db_session):
    """El FK a facturas es SET NULL: la plata que entró no se va con el
    comprobante. Importa de verdad porque cuando entre ARCA hay que reescribir
    `facturas`, y la cobranza tiene que sobrevivir a eso."""
    marca = f"{MARCA_PREFIJO} FKFACT SA"
    _limpiar(db_session, marca)
    cid = _cliente(api, marca)
    try:
        r = api.post("/api/facturas", json={
            "cliente_id": cid, "fecha": "2026-03-01", "subtotal": 1000, "iva_porcentaje": 0,
        })
        assert r.status_code == 201, r.text
        fid = r.json()["id"]

        r = api.post("/api/cobranzas", json={
            "cliente_id": cid, "fecha": "2026-03-02", "medio": "efectivo",
            "importe": 1000, "factura_id": fid,
        })
        assert r.status_code == 201, r.text
        cob_id = r.json()["id"]
        assert r.json()["factura_id"] == fid

        assert api.delete(f"/api/facturas/{fid}").status_code == 204

        db_session.expire_all()
        cob = db_session.query(Cobranza).filter(Cobranza.id == cob_id).first()
        assert cob is not None, "borrar la factura NO debe borrar la cobranza"
        assert cob.factura_id is None, "el FK tiene que quedar en NULL"
        assert float(cob.importe) == 1000.0
    finally:
        _limpiar(db_session, marca)


def test_referencias_inexistentes_se_rechazan(api, db_session):
    marca = f"{MARCA_PREFIJO} REFS SA"
    _limpiar(db_session, marca)
    cid = _cliente(api, marca)
    try:
        assert api.post("/api/cobranzas", json={
            "cliente_id": 99999999, "medio": "efectivo", "importe": 100,
        }).status_code == 404
        assert api.post("/api/cobranzas", json={
            "cliente_id": cid, "medio": "efectivo", "importe": 100, "factura_id": 99999999,
        }).status_code == 404
        assert api.post("/api/cobranzas", json={
            "cliente_id": cid, "medio": "efectivo", "importe": 100, "orden_trabajo_id": 99999999,
        }).status_code == 404
    finally:
        _limpiar(db_session, marca)


# ─── CRUD completo + auditoría ───────────────────────────────────────────────

def test_editar_y_borrar_cobranza(api, db_session):
    marca = f"{MARCA_PREFIJO} CRUD SA"
    _limpiar(db_session, marca)
    cid = _cliente(api, marca)
    try:
        r = api.post("/api/cobranzas", json={
            "cliente_id": cid, "fecha": "2026-03-10", "medio": "efectivo", "importe": 100,
            "observaciones": "pago parcial",
        })
        assert r.status_code == 201, r.text
        cob_id = r.json()["id"]

        r = api.put(f"/api/cobranzas/{cob_id}", json={"importe": 250, "observaciones": "pago total"})
        assert r.status_code == 200, r.text
        assert r.json()["importe"] == 250.0
        assert r.json()["observaciones"] == "pago total"

        assert api.delete(f"/api/cobranzas/{cob_id}").status_code == 204
        assert api.put(f"/api/cobranzas/{cob_id}", json={"importe": 1}).status_code == 404
        assert api.delete(f"/api/cobranzas/{cob_id}").status_code == 404
    finally:
        _limpiar(db_session, marca)


def test_crear_editar_y_borrar_quedan_auditados(api, db_session):
    """La plata siempre deja rastro: quién la cargó, la cambió o la borró."""
    from models import AuditLog

    marca = f"{MARCA_PREFIJO} AUDIT SA"
    _limpiar(db_session, marca)
    cid = _cliente(api, marca)
    ultimo = db_session.query(AuditLog.id).order_by(AuditLog.id.desc()).first()
    corte = ultimo[0] if ultimo else 0
    try:
        r = api.post("/api/cobranzas", json={
            "cliente_id": cid, "medio": "efectivo", "importe": 100,
        })
        assert r.status_code == 201, r.text
        cob_id = r.json()["id"]
        assert api.put(f"/api/cobranzas/{cob_id}", json={"importe": 200}).status_code == 200
        assert api.delete(f"/api/cobranzas/{cob_id}").status_code == 204

        db_session.expire_all()
        filas = (
            db_session.query(AuditLog)
            .filter(AuditLog.id > corte, AuditLog.entidad == "cobranza")
            .order_by(AuditLog.id)
            .all()
        )
        assert [f.accion for f in filas] == ["crear", "actualizar", "eliminar"], \
            f"auditoría incompleta: {[(f.accion, f.entidad) for f in filas]}"
        # El cambio de importe guarda antes y después (es plata).
        edicion = filas[1]
        assert edicion.datos["antes"]["importe"] == 100.0
        assert edicion.datos["despues"]["importe"] == 200.0
    finally:
        _limpiar(db_session, marca)


# ─── Permisos ────────────────────────────────────────────────────────────────

def test_un_rol_sin_permiso_no_ve_la_plata(api, db_session):
    """La plata la ven sólo los administradores: el permiso tiene que EXISTIR
    para poder darse o quitarse desde /admin/roles, y sin él es 403."""
    from core import rbac
    from core.security import verify_token
    from main import app
    from models import Role

    # El permiso está en el catálogo (si no, /admin/roles lo filtra como basura).
    assert "cobranzas" in rbac.VISTAS_CLAVES
    for accion in ("ver", "crear", "editar", "borrar"):
        assert f"cobranzas:{accion}" in rbac.ACCIONES_CLAVES

    # Y por defecto NO lo tienen user ni operario.
    for clave in ("user", "operario"):
        rol = next(r for r in rbac.ROLES_DEFAULT if r["clave"] == clave)
        assert "cobranzas" not in rol["vistas"], f"{clave} no debería ver cobranzas"
        assert not [a for a in rol["acciones"] if a.startswith("cobranzas:")], \
            f"{clave} no debería tener acciones de cobranzas"

    clave = "sincobranzas_test"
    db_session.query(Role).filter(Role.clave == clave).delete(synchronize_session=False)
    db_session.commit()
    db_session.add(Role(
        clave=clave, nombre="Sin cobranzas",
        vistas=["panel"], acciones=["ordenes:ver"], protegido=False,
    ))
    db_session.commit()

    sin_permiso = {"email": "sincobranzas@test.local", "role": clave, "id": None}
    como_admin = app.dependency_overrides[verify_token]
    app.dependency_overrides[verify_token] = lambda: sin_permiso
    try:
        assert api.get("/api/cobranzas").status_code == 403
        assert api.get("/api/cobranzas/resumen").status_code == 403
        assert api.post("/api/cobranzas", json={"cliente_id": 1, "medio": "efectivo", "importe": 1}).status_code == 403
        assert api.put("/api/cobranzas/1", json={"importe": 1}).status_code == 403
        assert api.delete("/api/cobranzas/1").status_code == 403
    finally:
        app.dependency_overrides[verify_token] = como_admin
        db_session.query(Role).filter(Role.clave == clave).delete(synchronize_session=False)
        db_session.commit()


# ─── El null explícito: la clave existe, pero viene vacía ────────────────────
# `model_dump(exclude_unset=True)` deja afuera lo que el cliente NO mandó, así
# que una clave presente en null es una decisión suya, no una ausencia. Los dos
# idioms que las confunden —`d.get(campo, actual)` y `valor or DEFAULT`— juntos
# reescribían plata, y eso es lo que defienden los tres tests que siguen.

def test_un_null_no_revierte_un_cheque_acreditado(api, db_session):
    """Después del resumen, EL test del archivo: plata que ya entró no puede
    volver a ser una promesa porque llegó un campo vacío.

    `PUT {"cheque_estado": null}` sobre un cheque ACREDITADO respondía 200 y lo
    dejaba `en_cartera`: la plata se caía de `entrado`, volvía al calendario de
    lo que va a entrar, y nadie se enteraba. Se mira el campo Y el resumen,
    porque un test que sólo mire el campo pasa mientras el resumen miente.
    """
    marca = f"{MARCA_PREFIJO} NULLCHEQUE SA"
    _limpiar(db_session, marca)
    cid = _cliente(api, marca)
    hoy = date.today()
    clave_mes = _mes_de(hoy)
    try:
        base = _resumen(api)

        r = api.post("/api/cobranzas", json={
            "cliente_id": cid, "fecha": hoy.isoformat(),
            "medio": "cheque", "importe": 123456,
            "cheque_numero": "NULL-1", "cheque_fecha_pago": hoy.isoformat(),
        })
        assert r.status_code == 201, r.text
        cob_id = r.json()["id"]

        # El cheque se acredita: AHORA la plata entró.
        r = api.put(f"/api/cobranzas/{cob_id}", json={"cheque_estado": "acreditado"})
        assert r.status_code == 200, r.text
        entro = _resumen(api)
        assert entro["entrado"]["mes"] - base["entrado"]["mes"] == 123456
        assert entro["en_cartera"]["total"] - base["en_cartera"]["total"] == 0

        # Y acá el null: un cheque no puede quedarse sin estado, y mucho menos
        # volver al estado inicial por omisión.
        r = api.put(f"/api/cobranzas/{cob_id}", json={"cheque_estado": None})
        assert r.status_code == 400, (
            f"un cheque_estado vacío sobre un cheque acreditado no puede "
            f"responder {r.status_code}: {r.text}"
        )
        assert r.json()["detail"], "el 400 tiene que explicar qué falta"

        # El cheque SIGUE acreditado…
        b = api.get("/api/cobranzas", params={"cliente_id": cid}).json()
        assert b["total"] == 1
        c = b["data"][0]
        assert c["cheque_estado"] == "acreditado", "el null revirtió el estado del cheque"
        assert c["es_plata_ya"] is True

        # …y el resumen no se movió un peso.
        d = _resumen(api)
        assert d["entrado"]["mes"] == entro["entrado"]["mes"], \
            "la plata que ya había entrado se cayó de `entrado`"
        assert d["entrado"]["anio"] == entro["entrado"]["anio"]
        assert d["en_cartera"]["total"] == entro["en_cartera"]["total"], \
            "la plata que ya había entrado volvió a figurar como promesa"
        assert d["en_cartera"]["cantidad"] == entro["en_cartera"]["cantidad"]
        assert _por_acreditar(d, clave_mes) == _por_acreditar(entro, clave_mes), \
            "el cheque acreditado volvió al calendario de lo que va a entrar"

        # Un estado en string vacío es el mismo pedido por otra puerta.
        r = api.put(f"/api/cobranzas/{cob_id}", json={"cheque_estado": ""})
        assert r.status_code == 400, f"un estado en «» tampoco puede pasar: {r.text}"
        b = api.get("/api/cobranzas", params={"cliente_id": cid}).json()
        assert b["data"][0]["cheque_estado"] == "acreditado"
    finally:
        _limpiar(db_session, marca)


def test_un_null_de_cheque_en_una_cobranza_de_contado_se_ignora(api, db_session):
    """El front manda el objeto entero y los campos de cheque van en null: en
    una cobranza de contado eso no es un error, es ruido —los campos de cheque
    ya se ignoran— y tiene que seguir respondiendo 200.

    Y el alta de cheque POR EDICIÓN (contado → cheque sin mandar estado) tiene
    que seguir naciendo `en_cartera`: ahí el estado guardado es NULL de verdad,
    y confundirlo con un null pedido a propósito rompería la transición.
    """
    marca = f"{MARCA_PREFIJO} NULLCONTADO SA"
    _limpiar(db_session, marca)
    cid = _cliente(api, marca)
    try:
        r = api.post("/api/cobranzas", json={
            "cliente_id": cid, "medio": "efectivo", "importe": 4000,
        })
        assert r.status_code == 201, r.text
        cob_id = r.json()["id"]

        r = api.put(f"/api/cobranzas/{cob_id}", json={
            "observaciones": "pago en caja",
            "cheque_numero": None, "cheque_banco": None,
            "cheque_fecha_pago": None, "cheque_estado": None,
        })
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["medio"] == "efectivo"
        assert c["observaciones"] == "pago en caja"
        assert c["cheque_estado"] is None
        assert c["es_plata_ya"] is True

        # contado → cheque en un solo PUT, sin mandar estado.
        r = api.put(f"/api/cobranzas/{cob_id}", json={
            "medio": "cheque", "cheque_numero": "PASA-1",
            "cheque_banco": "Banco Nación", "cheque_fecha_pago": "2027-02-10",
        })
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["medio"] == "cheque"
        assert c["cheque_estado"] == "en_cartera", \
            "un cheque dado de alta por edición nace en cartera"
        assert c["es_plata_ya"] is False

        # Y en un cheque, vaciar lo que SÍ es opcional sigue siendo 200: el
        # número y el banco son nullable, borrarlos es una operación real.
        r = api.put(f"/api/cobranzas/{cob_id}", json={"cheque_numero": None, "cheque_banco": None})
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["cheque_numero"] is None and c["cheque_banco"] is None
        assert c["cheque_estado"] == "en_cartera", "vaciar el número no toca el estado"
        assert c["cheque_fecha_pago"] == "2027-02-10", "ni la fecha de pago"
    finally:
        _limpiar(db_session, marca)


def test_vaciar_un_campo_que_la_plata_necesita_es_400_y_no_500(api, db_session):
    """`cliente_id` y `fecha` son NOT NULL en la tabla; `importe` es el número y
    `medio` decide si ese número es plata o una promesa.

    Mandar cualquiera de los cuatro en null llegaba hasta el commit y salía como
    HTTP 500 —«me rompí»: el cliente no sabe si guardó o no— cuando lo que pasó
    es que falta un dato. Eso es un 400, y la cobranza queda intacta.
    """
    marca = f"{MARCA_PREFIJO} NOTNULL SA"
    _limpiar(db_session, marca)
    cid = _cliente(api, marca)
    try:
        r = api.post("/api/cobranzas", json={
            "cliente_id": cid, "fecha": "2026-04-15", "medio": "transferencia",
            "importe": 9100.75, "observaciones": "seña",
        })
        assert r.status_code == 201, r.text
        cob_id = r.json()["id"]

        for campo in ("cliente_id", "fecha", "importe", "medio"):
            r = api.put(f"/api/cobranzas/{cob_id}", json={campo: None})
            assert r.status_code == 400, (
                f"«{campo}» en null tiene que ser 400 (falta un dato), "
                f"no {r.status_code}: {r.text}"
            )
            assert r.json()["detail"], f"el 400 de «{campo}» tiene que explicar qué falta"

        # Nada de eso tocó la cobranza.
        b = api.get("/api/cobranzas", params={"cliente_id": cid}).json()
        assert b["total"] == 1
        c = b["data"][0]
        assert c["cliente_id"] == cid
        assert c["fecha"] == "2026-04-15"
        assert c["importe"] == 9100.75
        assert c["medio"] == "transferencia"
        assert c["observaciones"] == "seña", "un PUT rechazado no escribe nada"

        # Lo que sí es opcional se puede vaciar: ahí el null es una operación.
        r = api.put(f"/api/cobranzas/{cob_id}", json={"observaciones": None})
        assert r.status_code == 200, r.text
        assert r.json()["observaciones"] is None
    finally:
        _limpiar(db_session, marca)
