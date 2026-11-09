"""Integración: REGISTRAR QUE UNA ORDEN DEBE REHACERSE (RF-16).

El requerimiento tiene dos mitades y la segunda es la que manda el diseño:
«registrar que una orden debe rehacerse, CONSERVANDO EL REGISTRO DE LA
PRODUCCIÓN ORIGINAL».

Por eso rehacer NO reabre la orden. Reabrirla y volver a escanearla encima
pisaría los operarios, las máquinas y las fechas del trabajo que sí se hizo, y
el rechazo —que es lo que hay que poder medir— desaparecería del historial. En
su lugar: la original queda marcada, con motivo, autor y fecha, y se crea una
orden NUEVA que hereda la especificación y apunta a la que viene a reemplazar.

Así quedan los dos hechos por separado: lo que se produjo y falló, y lo que se
produjo para arreglarlo.
"""
import pytest

from models import Cliente, OrdenTrabajo, PlanProduccion

MARCA = "OTREHACER TEST SA"


def _limpiar(db):
    ids = [c.id for c in db.query(Cliente).filter(Cliente.marca == MARCA).all()]
    if ids:
        oids = [o.id for o in db.query(OrdenTrabajo).filter(
            OrdenTrabajo.cliente_id.in_(ids)).all()]
        if oids:
            db.query(PlanProduccion).filter(
                PlanProduccion.orden_trabajo_id.in_(oids)
            ).delete(synchronize_session=False)
            # Primero se sueltan los punteros entre órdenes: si no, el DELETE
            # choca contra la FK de la orden que rehace a otra.
            db.query(OrdenTrabajo).filter(OrdenTrabajo.id.in_(oids)).update(
                {"rehace_a_id": None}, synchronize_session=False
            )
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
def producida(api, db_session, cliente_id):
    """Una orden con producción real encima: especificación, escaneo y cierre."""
    oid = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "cantidad": 20000,
        "extrusion_color": "Blanco",
        "troquelado_cierre": 13.4,
        "fecha_comprometida": "2034-05-10",
    }).json()["id"]
    assert api.post(f"/api/ordenes/{oid}/etapa",
                    json={"etapa": "extrusion"}).status_code == 201
    assert api.post(f"/api/ordenes/{oid}/etapa",
                    json={"etapa": "finalizado"}).status_code == 201
    return oid


MOTIVO = "El cliente rechazó el lote: el color no coincide con la muestra."


# ── La marca sobre la original ──────────────────────────────────────────────

def test_una_orden_nueva_no_esta_marcada_para_rehacer(api, cliente_id):
    oid = api.post("/api/ordenes", json={"cliente_id": cliente_id}).json()["id"]
    d = api.get(f"/api/ordenes/{oid}").json()
    assert d["rehacer"] is False
    assert d["rehacer_motivo"] is None
    assert d["rehacer_en"] is None


def test_marcar_para_rehacer_deja_motivo_autor_y_fecha(api, producida, admin):
    r = api.post(f"/api/ordenes/{producida}/rehacer", json={"motivo": MOTIVO})
    assert r.status_code == 201, r.text
    original = r.json()["original"]
    assert original["rehacer"] is True
    assert original["rehacer_motivo"] == MOTIVO
    assert original["rehacer_en"] is not None
    assert original["rehacer_por"] == admin["id"]


def test_el_motivo_es_obligatorio(api, producida):
    """Un rechazo sin motivo no sirve para nada: no se puede analizar después."""
    assert api.post(f"/api/ordenes/{producida}/rehacer", json={}).status_code == 422
    assert api.post(f"/api/ordenes/{producida}/rehacer",
                    json={"motivo": "   "}).status_code == 400


def test_rehacer_una_orden_inexistente_da_404(api):
    r = api.post("/api/ordenes/99999999/rehacer", json={"motivo": MOTIVO})
    assert r.status_code == 404


# ── El registro original queda intacto ──────────────────────────────────────

def test_la_produccion_original_no_se_toca(api, db_session, producida):
    antes = api.get(f"/api/ordenes/{producida}").json()
    api.post(f"/api/ordenes/{producida}/rehacer", json={"motivo": MOTIVO})
    despues = api.get(f"/api/ordenes/{producida}").json()

    # Es la mitad del requerimiento: lo que se produjo sigue registrado igual.
    for campo in ("estado", "fecha_extrusion", "operador_extrusion",
                  "fecha_cierre", "operador_cierre", "lote", "cantidad",
                  "extrusion_color", "troquelado_cierre"):
        assert despues[campo] == antes[campo], campo


def test_los_pases_de_la_original_siguen_ahi(api, db_session, producida):
    antes = db_session.query(PlanProduccion).filter(
        PlanProduccion.orden_trabajo_id == producida).count()
    api.post(f"/api/ordenes/{producida}/rehacer", json={"motivo": MOTIVO})
    db_session.expire_all()
    assert db_session.query(PlanProduccion).filter(
        PlanProduccion.orden_trabajo_id == producida).count() == antes


def test_la_original_no_se_reabre(api, producida):
    """Reabrirla dejaría que un escaneo nuevo pise al operario que ya trabajó."""
    api.post(f"/api/ordenes/{producida}/rehacer", json={"motivo": MOTIVO})
    assert api.get(f"/api/ordenes/{producida}").json()["estado"] == "completada"


# ── La orden nueva ──────────────────────────────────────────────────────────

def test_se_crea_una_orden_nueva_que_apunta_a_la_original(api, producida):
    r = api.post(f"/api/ordenes/{producida}/rehacer", json={"motivo": MOTIVO})
    nueva = r.json()["nueva"]
    assert nueva["id"] != producida
    assert nueva["numero"] != r.json()["original"]["numero"]
    assert nueva["rehace_a_id"] == producida
    assert nueva["rehace_a_numero"] == r.json()["original"]["numero"]


def test_la_nueva_hereda_la_especificacion(api, producida):
    """No se transcribe a mano: es el mismo producto con la misma medida."""
    nueva = api.post(f"/api/ordenes/{producida}/rehacer",
                     json={"motivo": MOTIVO}).json()["nueva"]
    assert nueva["cantidad"] == 20000
    assert nueva["extrusion_color"] == "Blanco"
    assert nueva["troquelado_cierre"] == 13.4


def test_la_nueva_nace_sin_produccion_encima(api, producida):
    """Hereda QUÉ hay que hacer, no lo que ya se hizo."""
    nueva = api.post(f"/api/ordenes/{producida}/rehacer",
                     json={"motivo": MOTIVO}).json()["nueva"]
    assert nueva["estado"] == "pendiente"
    assert nueva["fecha_extrusion"] is None
    assert nueva["operador_extrusion"] is None
    assert nueva["fecha_cierre"] is None
    assert nueva["verificado_en"] is None
    assert nueva["rehacer"] is False


def test_la_nueva_no_arrastra_el_plazo_vencido(api, producida):
    """El plazo de la orden que falló no es el plazo del rehecho: se renegocia,
    y dejarlo heredado contaría un atraso que todavía no existe."""
    nueva = api.post(f"/api/ordenes/{producida}/rehacer",
                     json={"motivo": MOTIVO}).json()["nueva"]
    assert nueva["fecha_comprometida"] is None


def test_no_se_rehace_dos_veces_la_misma_orden(api, producida):
    """La segunda marca pisaría el motivo de la primera y dejaría dos órdenes
    nuevas para un solo rechazo."""
    assert api.post(f"/api/ordenes/{producida}/rehacer",
                    json={"motivo": MOTIVO}).status_code == 201
    r = api.post(f"/api/ordenes/{producida}/rehacer", json={"motivo": "otra vez"})
    assert r.status_code == 409


def test_queda_auditado(api, db_session, producida):
    from models import AuditLog
    api.post(f"/api/ordenes/{producida}/rehacer", json={"motivo": MOTIVO})
    reg = (
        db_session.query(AuditLog)
        .filter(AuditLog.entidad == "orden_trabajo",
                AuditLog.entidad_id == producida,
                AuditLog.accion == "rehacer")
        .first()
    )
    assert reg is not None
    assert MOTIVO in (reg.descripcion or "")
