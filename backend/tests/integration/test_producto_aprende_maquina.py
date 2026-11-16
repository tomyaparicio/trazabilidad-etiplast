"""Integración: el producto aprende con qué impresora se hace.

POR QUÉ EXISTE ESTO: borrar una máquina del catálogo vacía
`cliente_productos.maquina_impresora_id` en TODOS los productos que la usaban
—la FK es `ON DELETE SET NULL`—, y no hay backup del que sacarlo de vuelta. En
vez de un script que adivine, el dato se repuebla solo: cada vez que se carga
una orden eligiendo impresora, si el producto todavía no tiene ninguna, se le
guarda esa. A la orden siguiente ese producto ya la sabe y no hay que elegirla.

LA REGLA QUE NO SE NEGOCIA: **nunca pisa una máquina ya guardada.** Que una
orden se haya hecho por excepción en otra impresora no puede cambiar en qué
máquina va ese producto de acá en adelante; eso se cambia en la ficha del
producto, a mano y a propósito.
"""
import pytest

from models import Cliente, ClienteProducto, Maquina, OrdenTrabajo

MARCA = "APRENDE MAQUINA TEST SA"

MAQUINAS_TEST = [
    ("PYTAP-VENUS", "Venus Aprende", "impresion", True),
    ("PYTAP-REINA", "ReinaFlex Aprende", "impresion", True),
]


def _limpiar(db):
    ids = [c.id for c in db.query(Cliente).filter(Cliente.marca == MARCA).all()]
    if ids:
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
        m.nombre: m.id
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


def _crear_producto(api, cliente_id, **extra):
    r = api.post(f"/api/clientes/{cliente_id}/productos",
                 json={"nombre": "Etiqueta Aprende", **extra})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _maquina_del_producto(db_session, producto_id):
    db_session.expire_all()
    p = db_session.query(ClienteProducto).filter(ClienteProducto.id == producto_id).first()
    return p.maquina_impresora_id if p else None


# ── Lo que tiene que pasar ────────────────────────────────────────────────────

def test_producto_sin_maquina_aprende_la_de_la_orden(api, db_session, maquinas, cliente_id):
    """El caso que repuebla los datos: producto en blanco, orden con impresora."""
    producto_id = _crear_producto(api, cliente_id)
    assert _maquina_del_producto(db_session, producto_id) is None

    r = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "cliente_producto_id": producto_id,
        "impresion_maquina": "Venus Aprende",
    })
    assert r.status_code == 201, r.text

    assert _maquina_del_producto(db_session, producto_id) == maquinas["Venus Aprende"]


def test_no_pisa_la_maquina_que_el_producto_ya_tenia(api, db_session, maquinas, cliente_id):
    """Una orden por excepción en otra máquina NO cambia la ficha del producto."""
    producto_id = _crear_producto(
        api, cliente_id, maquina_impresora_id=maquinas["ReinaFlex Aprende"]
    )
    assert _maquina_del_producto(db_session, producto_id) == maquinas["ReinaFlex Aprende"]

    r = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "cliente_producto_id": producto_id,
        "impresion_maquina": "Venus Aprende",
    })
    assert r.status_code == 201, r.text

    assert _maquina_del_producto(db_session, producto_id) == maquinas["ReinaFlex Aprende"]


def test_orden_sin_impresora_no_toca_el_producto(api, db_session, maquinas, cliente_id):
    producto_id = _crear_producto(api, cliente_id)

    r = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "cliente_producto_id": producto_id,
    })
    assert r.status_code == 201, r.text

    assert _maquina_del_producto(db_session, producto_id) is None


def test_orden_sin_producto_no_rompe(api, maquinas, cliente_id):
    """Se pueden cargar órdenes sin elegir producto; el alta no se puede caer."""
    r = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "impresion_maquina": "Venus Aprende",
    })
    assert r.status_code == 201, r.text


def test_tambien_aprende_al_editar_la_orden(api, db_session, maquinas, cliente_id):
    """La impresora se puede elegir después, editando; ahí también se aprende."""
    producto_id = _crear_producto(api, cliente_id)
    r = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "cliente_producto_id": producto_id,
    })
    assert r.status_code == 201, r.text
    orden_id = r.json()["id"]
    assert _maquina_del_producto(db_session, producto_id) is None

    r = api.put(f"/api/ordenes/{orden_id}", json={"impresion_maquina": "ReinaFlex Aprende"})
    assert r.status_code == 200, r.text

    assert _maquina_del_producto(db_session, producto_id) == maquinas["ReinaFlex Aprende"]
