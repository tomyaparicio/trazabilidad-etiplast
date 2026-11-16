"""Integración: dar de baja una máquina sin llevarse puesto nada.

ESTO EXISTE POR UN INCIDENTE REAL. Se borraron máquinas del catálogo en
producción y Postgres propagó por dos caminos distintos:

  cliente_productos.maquina_impresora_id  →  ON DELETE SET NULL   (se vació)
  plan_produccion.maquina_id              →  ON DELETE CASCADE    (se BORRÓ)

Lo primero dejó productos sin impresora. Lo segundo borró los pases de
producción —el registro de por qué máquina pasó cada orden, que es la
trazabilidad— y no había backup: el plan de Railway es Hobby y la pestaña
Backups dice «No Backups».

La regla que sale de ahí, y que estos tests fijan:

  · los PRODUCTOS se reasignan — son configuración, decir «de ahora en más
    este producto va en la otra» es verdad;
  · los PASES NO se reasignan — son historia, y moverlos diría que una orden
    pasó por una máquina por la que no pasó. Si hay pases, la máquina no se
    borra: se da de BAJA y las filas siguen apuntándole;
  · una máquina que no usa nadie sí se borra de verdad, que para eso está
    (el catálogo de producción tiene troqueladoras duplicadas de más).
"""
import pytest

from models import Cliente, ClienteProducto, Maquina, OrdenTrabajo, PlanProduccion

MARCA = "BAJA MAQUINA TEST SA"

MAQUINAS_TEST = [
    ("PYTBM-VIEJA", "Vieja Baja", "impresion", True),
    ("PYTBM-NUEVA", "Nueva Baja", "impresion", True),
    ("PYTBM-OTROTIPO", "Troqueladora Baja", "troquelado", True),
]


def _limpiar(db):
    ids = [c.id for c in db.query(Cliente).filter(Cliente.marca == MARCA).all()]
    if ids:
        ot_ids = [o.id for o in db.query(OrdenTrabajo)
                  .filter(OrdenTrabajo.cliente_id.in_(ids)).all()]
        if ot_ids:
            db.query(PlanProduccion).filter(
                PlanProduccion.orden_trabajo_id.in_(ot_ids)
            ).delete(synchronize_session=False)
        db.query(OrdenTrabajo).filter(OrdenTrabajo.cliente_id.in_(ids)).delete(
            synchronize_session=False
        )
        db.query(ClienteProducto).filter(ClienteProducto.cliente_id.in_(ids)).delete(
            synchronize_session=False
        )
        db.query(Cliente).filter(Cliente.id.in_(ids)).delete(synchronize_session=False)
        db.commit()


@pytest.fixture()
def maquinas(db_session):
    codigos = [m[0] for m in MAQUINAS_TEST]
    db_session.query(Maquina).filter(Maquina.codigo.in_(codigos)).delete(
        synchronize_session=False
    )
    db_session.commit()
    for codigo, nombre, tipo, activa in MAQUINAS_TEST:
        db_session.add(Maquina(codigo=codigo, nombre=nombre, tipo=tipo, activa=activa))
    db_session.commit()
    creadas = {
        m.codigo: m.id
        for m in db_session.query(Maquina).filter(Maquina.codigo.in_(codigos)).all()
    }
    try:
        yield creadas
    finally:
        db_session.query(Maquina).filter(Maquina.codigo.in_(codigos)).delete(
            synchronize_session=False
        )
        db_session.commit()


@pytest.fixture()
def cliente_id(api, db_session):
    _limpiar(db_session)
    r = api.post("/api/clientes", json={"marca": MARCA})
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    try:
        yield cid
    finally:
        _limpiar(db_session)


def _producto(api, cliente_id, maquina_id=None):
    r = api.post(f"/api/clientes/{cliente_id}/productos",
                 json={"nombre": "Etiqueta Baja", "maquina_impresora_id": maquina_id})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _pase(db_session, api, cliente_id, maquina_id):
    """Un pase de producción por esa máquina, que es historia y no se toca."""
    r = api.post("/api/ordenes", json={"cliente_id": cliente_id})
    assert r.status_code == 201, r.text
    orden_id = r.json()["id"]
    p = PlanProduccion(orden_trabajo_id=orden_id, maquina_id=maquina_id,
                       etapa="impresion", estado="completada")
    db_session.add(p)
    db_session.commit()
    return p.id


def _existe(db_session, maquina_id):
    db_session.expire_all()
    return db_session.query(Maquina).filter(Maquina.id == maquina_id).first()


# ── Sin uso: se borra de verdad ───────────────────────────────────────────────

def test_maquina_sin_uso_se_borra(api, db_session, maquinas):
    vieja = maquinas["PYTBM-VIEJA"]
    r = api.delete(f"/api/admin/maquinas/{vieja}")
    assert r.status_code == 200, r.text
    assert r.json().get("eliminada") is True
    assert _existe(db_session, vieja) is None


# ── Con productos: hay que decir a dónde pasan ────────────────────────────────

def test_con_productos_y_sin_destino_no_borra_y_explica(api, db_session, maquinas, cliente_id):
    vieja = maquinas["PYTBM-VIEJA"]
    producto_id = _producto(api, cliente_id, vieja)

    r = api.delete(f"/api/admin/maquinas/{vieja}")
    assert r.status_code == 409, r.text
    detalle = r.json()["detail"]
    assert detalle["codigo"] == "en_uso"
    assert detalle["productos"] == 1

    # No se borró nada, y el producto sigue donde estaba.
    assert _existe(db_session, vieja) is not None
    db_session.expire_all()
    p = db_session.query(ClienteProducto).filter(ClienteProducto.id == producto_id).first()
    assert p.maquina_impresora_id == vieja


def test_con_destino_pasa_los_productos_y_borra(api, db_session, maquinas, cliente_id):
    vieja, nueva = maquinas["PYTBM-VIEJA"], maquinas["PYTBM-NUEVA"]
    producto_id = _producto(api, cliente_id, vieja)

    r = api.delete(f"/api/admin/maquinas/{vieja}?reasignar_a={nueva}")
    assert r.status_code == 200, r.text
    assert r.json()["productos_reasignados"] == 1

    db_session.expire_all()
    p = db_session.query(ClienteProducto).filter(ClienteProducto.id == producto_id).first()
    assert p.maquina_impresora_id == nueva
    assert _existe(db_session, vieja) is None


# ── Con historia de producción: se da de baja, NO se borra ────────────────────

def test_con_pases_se_da_de_baja_y_la_historia_queda(api, db_session, maquinas, cliente_id):
    vieja = maquinas["PYTBM-VIEJA"]
    pase_id = _pase(db_session, api, cliente_id, vieja)

    r = api.delete(f"/api/admin/maquinas/{vieja}")
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert cuerpo.get("dada_de_baja") is True
    assert cuerpo.get("eliminada") is not True

    # La máquina sigue existiendo, inactiva, y el pase le sigue apuntando.
    m = _existe(db_session, vieja)
    assert m is not None and m.activa is False
    pase = db_session.query(PlanProduccion).filter(PlanProduccion.id == pase_id).first()
    assert pase is not None and pase.maquina_id == vieja


# ── Destinos que no sirven ────────────────────────────────────────────────────

def test_no_se_puede_reasignar_a_si_misma(api, maquinas, cliente_id):
    vieja = maquinas["PYTBM-VIEJA"]
    _producto(api, cliente_id, vieja)
    r = api.delete(f"/api/admin/maquinas/{vieja}?reasignar_a={vieja}")
    assert r.status_code == 400, r.text


def test_no_se_puede_reasignar_a_una_de_otro_tipo(api, maquinas, cliente_id):
    """Los productos guardan una IMPRESORA: mandarlos a una troqueladora es basura."""
    vieja, troq = maquinas["PYTBM-VIEJA"], maquinas["PYTBM-OTROTIPO"]
    _producto(api, cliente_id, vieja)
    r = api.delete(f"/api/admin/maquinas/{vieja}?reasignar_a={troq}")
    assert r.status_code == 400, r.text


def test_no_se_puede_reasignar_a_una_que_no_existe(api, maquinas, cliente_id):
    vieja = maquinas["PYTBM-VIEJA"]
    _producto(api, cliente_id, vieja)
    r = api.delete(f"/api/admin/maquinas/{vieja}?reasignar_a=99999999")
    assert r.status_code == 400, r.text
