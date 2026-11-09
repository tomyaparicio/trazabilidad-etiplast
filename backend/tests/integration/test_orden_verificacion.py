"""Integración: la VERIFICACIÓN DEL RESPONSABLE antes de cerrar la orden.

RF-11 pide requerir la verificación del responsable de producción sobre las
etapas cargadas antes de dar una orden por terminada, dejando constancia de
quién verificó y cuándo.

Por qué existe: lo que el operario carga en la máquina nadie lo revisa. Si una
medida quedó mal escrita, el error viaja con la orden hasta el cliente. La
verificación es el paso que hoy se hace de palabra —el encargado mira la ficha
antes de dar el pedido por listo— y que el sistema no registraba en ninguna
parte.

LA REGLA, y el límite importa: el cierre exige verificación cuando la orden
TIENE un responsable asignado. Si no lo tiene, no hay quién verifique, y
bloquear el cierre dejaría la orden trabada para siempre; en ese caso se cierra
igual y el escaneo devuelve una advertencia, por el mismo criterio con el que
ya avisa cuando se cierra una orden que nunca pasó por la planta. La ausencia
de responsable es un dato a corregir en la orden, no un motivo para trabarla.
"""
import pytest

from models import Cliente, OrdenTrabajo, PlanProduccion, User

MARCA = "OTVERIF TEST SA"


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
def responsable_id(db_session, admin):
    """El responsable de la orden es el mismo usuario con el que corre `api`,
    así los tests del camino feliz no necesitan un segundo login. El fixture
    `admin` devuelve el dict del token, no el modelo."""
    return admin["id"]


def _orden(api, cliente_id, **extra):
    r = api.post("/api/ordenes", json={"cliente_id": cliente_id, **extra})
    assert r.status_code == 201, r.text
    return r.json()["id"]


# ── Constancia de la verificación ────────────────────────────────────────────

def test_una_orden_nueva_no_esta_verificada(api, cliente_id):
    oid = _orden(api, cliente_id)
    d = api.get(f"/api/ordenes/{oid}").json()
    assert d["verificado_en"] is None
    assert d["verificado_por"] is None
    assert d["verificado_por_nombre"] is None


def test_verificar_deja_constancia_de_quien_y_cuando(api, cliente_id, responsable_id):
    oid = _orden(api, cliente_id, responsable_id=responsable_id)
    r = api.post(f"/api/ordenes/{oid}/verificar")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["verificado_en"] is not None
    assert d["verificado_por"] == responsable_id
    assert d["verificado_por_nombre"]


def test_la_constancia_vuelve_en_la_ficha(api, cliente_id, responsable_id):
    oid = _orden(api, cliente_id, responsable_id=responsable_id)
    api.post(f"/api/ordenes/{oid}/verificar")
    d = api.get(f"/api/ordenes/{oid}").json()
    assert d["verificado_en"] is not None
    assert d["verificado_por"] == responsable_id


def test_se_puede_desverificar_si_hay_que_corregir_algo(api, cliente_id, responsable_id):
    """El encargado verifica, aparece un error, hay que volver atrás."""
    oid = _orden(api, cliente_id, responsable_id=responsable_id)
    api.post(f"/api/ordenes/{oid}/verificar")
    r = api.delete(f"/api/ordenes/{oid}/verificar")
    assert r.status_code == 200, r.text
    assert r.json()["verificado_en"] is None
    assert r.json()["verificado_por"] is None


def test_verificar_una_orden_inexistente_da_404(api):
    assert api.post("/api/ordenes/99999999/verificar").status_code == 404


def test_no_se_verifica_una_orden_cancelada(api, cliente_id, responsable_id):
    oid = _orden(api, cliente_id, responsable_id=responsable_id)
    api.put(f"/api/ordenes/{oid}", json={"estado": "cancelada"})
    r = api.post(f"/api/ordenes/{oid}/verificar")
    assert r.status_code == 409


# ── El cierre exige la verificación ─────────────────────────────────────────

def test_sin_verificar_el_cierre_se_rechaza(api, cliente_id, responsable_id):
    oid = _orden(api, cliente_id, responsable_id=responsable_id)
    r = api.post(f"/api/ordenes/{oid}/etapa", json={"etapa": "finalizado"})
    assert r.status_code == 409, r.text
    assert "verific" in r.json()["detail"].lower()
    assert api.get(f"/api/ordenes/{oid}").json()["estado"] != "completada"


def test_verificada_el_cierre_pasa(api, cliente_id, responsable_id):
    oid = _orden(api, cliente_id, responsable_id=responsable_id)
    api.post(f"/api/ordenes/{oid}/verificar")
    r = api.post(f"/api/ordenes/{oid}/etapa", json={"etapa": "finalizado"})
    assert r.status_code == 201, r.text
    assert api.get(f"/api/ordenes/{oid}").json()["estado"] == "completada"


def test_las_etapas_de_planta_no_piden_verificacion(api, cliente_id, responsable_id):
    """La verificación es del CIERRE. Trabar extrusión pararía la planta."""
    oid = _orden(api, cliente_id, responsable_id=responsable_id)
    r = api.post(f"/api/ordenes/{oid}/etapa", json={"etapa": "extrusion"})
    assert r.status_code == 201, r.text


def test_sin_responsable_asignado_el_cierre_pasa_con_advertencia(api, cliente_id):
    """No hay quién verifique: trabar el cierre dejaría la orden muerta."""
    oid = _orden(api, cliente_id)
    r = api.post(f"/api/ordenes/{oid}/etapa", json={"etapa": "finalizado"})
    assert r.status_code == 201, r.text
    assert api.get(f"/api/ordenes/{oid}").json()["estado"] == "completada"
    adv = r.json().get("advertencia") or ""
    assert "verific" in adv.lower() or "responsable" in adv.lower()


def test_desverificar_vuelve_a_trabar_el_cierre(api, cliente_id, responsable_id):
    oid = _orden(api, cliente_id, responsable_id=responsable_id)
    api.post(f"/api/ordenes/{oid}/verificar")
    api.delete(f"/api/ordenes/{oid}/verificar")
    r = api.post(f"/api/ordenes/{oid}/etapa", json={"etapa": "finalizado"})
    assert r.status_code == 409


def test_la_verificacion_queda_auditada(api, db_session, cliente_id, responsable_id):
    """Dejar constancia es el requerimiento: tiene que quedar en el log también."""
    from models import AuditLog
    oid = _orden(api, cliente_id, responsable_id=responsable_id)
    api.post(f"/api/ordenes/{oid}/verificar")
    reg = (
        db_session.query(AuditLog)
        .filter(AuditLog.entidad == "orden_trabajo", AuditLog.entidad_id == oid)
        .order_by(AuditLog.id.desc())
        .first()
    )
    assert reg is not None
    assert reg.accion == "verificar"
