"""Integración: la orden guarda EN QUÉ IMPRESORA se hizo, por id y no sólo por nombre.

POR QUÉ EXISTE ESTO. `ordenes_trabajo.impresion_maquina` guarda el nombre de la
impresora como texto suelto, y ese texto era lo ÚNICO que ataba la orden al
catálogo. La ficha impresa cruza por ahí para saber cómo es la hoja de esa
máquina —cuántos espacios de color trae y si es la de film o la de
autoadhesiva—, así que cualquier cosa que rompa el calce le cambia la
ESTRUCTURA de la hoja a una orden YA CARGADA:

  · renombrar la impresora en el catálogo,
  · darla de baja —que es lo que el sistema hace A PROPÓSITO cuando tiene pases
    de producción, para no borrar trazabilidad (ver `test_baja_maquina.py`)—,
  · deduplicar las dos filas de la autoadhesiva («Impresora Autoadhesiva» y
    «Taurus», que el dueño confirmó que son la misma máquina).

Ninguna de las tres toca la orden, y las tres se la cambiaban: una orden hecha
en la autoadhesiva se reimprimía con la sección de EXTRUSIÓN entera, que esa
máquina no hace, y perdía material, barniz, laminación y bobinado.

QUÉ SE GUARDA, Y QUÉ NO. Se guarda la MÁQUINA (su id), no el tipo de hoja. La
hoja es una propiedad de la impresora física, no del pedido: si mañana la
empresa corrige el catálogo —«che, ReinaFlex son ocho colores»—, las órdenes
viejas tienen que salir bien. Congelando el tipo en la orden, el error quedaría
grabado para siempre.

La configuración se corrige; la historia no se reescribe.
"""
import pytest

from models import Cliente, Maquina, OrdenTrabajo

MARCA = "ID IMPRESORA TEST SA"

MAQUINAS_TEST = [
    ("PYTID-VENUS", "Venus IdTest", "impresion", None),
    ("PYTID-AUTO", "Autoadhesiva IdTest", "impresion", "autoadhesiva"),
]


def _limpiar(db):
    ids = [c.id for c in db.query(Cliente).filter(Cliente.marca == MARCA).all()]
    if ids:
        db.query(OrdenTrabajo).filter(OrdenTrabajo.cliente_id.in_(ids)).delete(
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
    for codigo, nombre, tipo, ficha_tipo in MAQUINAS_TEST:
        db_session.add(Maquina(codigo=codigo, nombre=nombre, tipo=tipo, activa=True,
                               ficha_tipo=ficha_tipo))
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


def _orden(db_session, orden_id):
    db_session.expire_all()
    return db_session.query(OrdenTrabajo).filter(OrdenTrabajo.id == orden_id).first()


# ── Se guarda el id junto con el nombre ───────────────────────────────────────

def test_el_alta_guarda_nombre_e_id_de_la_impresora(api, db_session, maquinas, cliente_id):
    r = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "impresion_maquina": "Autoadhesiva IdTest",
    })
    assert r.status_code == 201, r.text
    cuerpo = r.json()
    assert cuerpo["impresion_maquina"] == "Autoadhesiva IdTest"
    assert cuerpo["impresion_maquina_id"] == maquinas["PYTID-AUTO"]

    o = _orden(db_session, cuerpo["id"])
    assert o.impresion_maquina_id == maquinas["PYTID-AUTO"]


def test_tambien_se_guarda_eligiendo_por_codigo(api, maquinas, cliente_id):
    """El alta acepta el código además del nombre; el id tiene que salir igual."""
    r = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "impresion_maquina": "PYTID-AUTO",
    })
    assert r.status_code == 201, r.text
    assert r.json()["impresion_maquina_id"] == maquinas["PYTID-AUTO"]
    assert r.json()["impresion_maquina"] == "Autoadhesiva IdTest"


def test_orden_sin_impresora_no_guarda_id(api, maquinas, cliente_id):
    r = api.post("/api/ordenes", json={"cliente_id": cliente_id})
    assert r.status_code == 201, r.text
    assert r.json()["impresion_maquina_id"] is None


# ── Lo que esto vino a proteger ───────────────────────────────────────────────

def test_renombrar_la_maquina_no_desengancha_la_orden(api, db_session, maquinas, cliente_id):
    """EL CASO QUE EL CRUCE POR NOMBRE NO SOPORTABA.

    Con el texto solo, renombrar «Autoadhesiva IdTest» a «Etirrollo» dejaba a la
    orden sin calce: la ficha no encontraba la máquina y caía a la hoja de film.
    """
    r = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "impresion_maquina": "Autoadhesiva IdTest",
    })
    assert r.status_code == 201, r.text
    orden_id = r.json()["id"]

    assert api.put(f"/api/admin/maquinas/{maquinas['PYTID-AUTO']}",
                   json={"nombre": "Etirrollo IdTest"}).status_code == 200

    o = _orden(db_session, orden_id)
    assert o.impresion_maquina_id == maquinas["PYTID-AUTO"], (
        "el vínculo con el catálogo tiene que sobrevivir al rename"
    )
    # Y la máquina sigue diciendo que su hoja es la autoadhesiva.
    fila = next(m for m in api.get("/api/maquinas?incluir_inactivas=true").json()
                if m["id"] == maquinas["PYTID-AUTO"])
    assert fila["ficha_tipo"] == "autoadhesiva"


def test_dar_de_baja_la_maquina_no_desengancha_la_orden(api, db_session, maquinas, cliente_id):
    r = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "impresion_maquina": "Autoadhesiva IdTest",
    })
    assert r.status_code == 201, r.text
    orden_id = r.json()["id"]

    assert api.put(f"/api/admin/maquinas/{maquinas['PYTID-AUTO']}",
                   json={"activa": False}).status_code == 200

    o = _orden(db_session, orden_id)
    assert o.impresion_maquina_id == maquinas["PYTID-AUTO"]
    # Y la ficha la puede leer, porque pide el catálogo con las inactivas.
    ids = {m["id"] for m in api.get("/api/maquinas?incluir_inactivas=true").json()}
    assert maquinas["PYTID-AUTO"] in ids


def test_borrar_la_maquina_no_borra_la_orden(api, db_session, maquinas, cliente_id):
    """`ON DELETE SET NULL`, no CASCADE: la orden es historia y no se borra.

    Sin pases de producción la máquina se elimina de verdad. La orden tiene que
    quedar en pie, sin id, y volver a resolverse por el nombre que guardó.
    """
    r = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "impresion_maquina": "Venus IdTest",
    })
    assert r.status_code == 201, r.text
    orden_id = r.json()["id"]

    assert api.delete(f"/api/admin/maquinas/{maquinas['PYTID-VENUS']}").status_code == 200

    o = _orden(db_session, orden_id)
    assert o is not None, "borrar una máquina NO puede llevarse puesta la orden"
    assert o.impresion_maquina_id is None
    assert o.impresion_maquina == "Venus IdTest", "el nombre queda como respaldo"


# ── Nombre e id no pueden quedar diciendo cosas distintas ─────────────────────

def test_cambiar_la_impresora_al_editar_mueve_las_dos_cosas(
    api, db_session, maquinas, cliente_id
):
    """Si el id quedara viejo, la orden diría una impresora y la ficha otra."""
    r = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "impresion_maquina": "Venus IdTest",
    })
    assert r.status_code == 201, r.text
    orden_id = r.json()["id"]
    assert _orden(db_session, orden_id).impresion_maquina_id == maquinas["PYTID-VENUS"]

    r = api.put(f"/api/ordenes/{orden_id}",
                json={"impresion_maquina": "Autoadhesiva IdTest"})
    assert r.status_code == 200, r.text

    o = _orden(db_session, orden_id)
    assert o.impresion_maquina == "Autoadhesiva IdTest"
    assert o.impresion_maquina_id == maquinas["PYTID-AUTO"]


def test_sacarle_la_impresora_a_la_orden_limpia_las_dos(
    api, db_session, maquinas, cliente_id
):
    r = api.post("/api/ordenes", json={
        "cliente_id": cliente_id,
        "impresion_maquina": "Venus IdTest",
    })
    assert r.status_code == 201, r.text
    orden_id = r.json()["id"]

    r = api.put(f"/api/ordenes/{orden_id}", json={"impresion_maquina": None})
    assert r.status_code == 200, r.text

    o = _orden(db_session, orden_id)
    assert o.impresion_maquina is None
    assert o.impresion_maquina_id is None


# ── El endpoint que la ficha impresa realmente lee ────────────────────────────

def test_el_catalogo_publico_trae_como_es_la_hoja(api, maquinas):
    """`GET /api/maquinas` es el que consume la ficha; si deja de traer estos
    campos la hoja sale mal y nadie se entera hasta tener el papel."""
    r = api.get("/api/maquinas")
    assert r.status_code == 200, r.text
    fila = next(m for m in r.json() if m["id"] == maquinas["PYTID-AUTO"])
    assert fila["ficha_tipo"] == "autoadhesiva"
    assert "ficha_colores" in fila


def test_el_endpoint_de_uso_tambien_trae_la_hoja(api, maquinas):
    """`/uso` alimenta el diálogo de baja, que ofrece destinos de reasignación:
    el frontend declara `ficha_tipo` como requerido en esas filas."""
    r = api.get(f"/api/admin/maquinas/{maquinas['PYTID-AUTO']}/uso")
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert "ficha_tipo" in cuerpo["maquina"]
    for destino in cuerpo.get("destinos", []):
        assert "ficha_tipo" in destino
        assert "ficha_colores" in destino
