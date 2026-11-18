"""Integración: el catálogo de máquinas y las que están dadas de baja.

POR QUÉ EXISTE ESTO. `GET /api/maquinas` devolvía SÓLO las activas, que es lo
correcto para quien va a ELEGIR una: ofrecer una máquina dada de baja es mandar
al operario a cargar una orden para una máquina que ya no está.

Pero hay otro lector, y necesita lo contrario. La ORDEN DE TRABAJO IMPRESA cruza
el nombre que la orden guardó —`ordenes_trabajo.impresion_maquina`, texto suelto
sin FK— contra este catálogo, para saber cómo es la hoja de esa impresora:
cuántos espacios de color trae y si es la de film o la de autoadhesiva.

Con el filtro puesto, dar de baja una máquina LE CAMBIA LA HOJA A LAS ÓRDENES YA
CARGADAS: el nombre guardado deja de encontrarse, la ficha cae al valor por
defecto, y una orden hecha en la autoadhesiva se reimprime con una sección de
extrusión que nunca tuvo.

Y la baja no es hipotética: es lo que el sistema hace A PROPÓSITO cuando la
máquina tiene pases de producción —ver `test_baja_maquina.py`—, justamente
porque esa historia no se puede borrar. Así que la misma regla que protege los
pases tenía un agujero en la ficha impresa.

LA REGLA: la configuración se corrige, la historia no se reescribe.
"""
import pytest

from models import Maquina

CODIGO_ACTIVA = "PYTCI-ACTIVA"
CODIGO_BAJA = "PYTCI-BAJA"


@pytest.fixture()
def maquinas(db_session):
    """Dos impresoras de prueba: una activa y una dada de baja."""
    db_session.query(Maquina).filter(Maquina.codigo.like("PYTCI-%")).delete(
        synchronize_session=False
    )
    db_session.commit()

    db_session.add(Maquina(codigo=CODIGO_ACTIVA, nombre="PYTCI Activa Test",
                           tipo="impresion", activa=True, ficha_colores=8))
    db_session.add(Maquina(codigo=CODIGO_BAJA, nombre="PYTCI Baja Test",
                           tipo="impresion", activa=False,
                           ficha_tipo="autoadhesiva", ficha_colores=6))
    db_session.commit()
    creadas = {
        m.codigo: m.id
        for m in db_session.query(Maquina).filter(Maquina.codigo.like("PYTCI-%")).all()
    }
    try:
        yield creadas
    finally:
        db_session.query(Maquina).filter(Maquina.codigo.like("PYTCI-%")).delete(
            synchronize_session=False
        )
        db_session.commit()


def _ids(respuesta):
    return {m["id"] for m in respuesta.json()}


# ── Lo de siempre no cambia ───────────────────────────────────────────────────

def test_por_defecto_sigue_devolviendo_solo_las_activas(api, maquinas):
    """El selector de máquina del alta depende de esto: no puede ofrecer bajas."""
    r = api.get("/api/maquinas")
    assert r.status_code == 200, r.text
    ids = _ids(r)
    assert maquinas[CODIGO_ACTIVA] in ids
    assert maquinas[CODIGO_BAJA] not in ids


def test_incluir_inactivas_false_explicito_es_lo_mismo_que_no_mandarlo(api, maquinas):
    r = api.get("/api/maquinas?incluir_inactivas=false")
    assert r.status_code == 200, r.text
    assert maquinas[CODIGO_BAJA] not in _ids(r)


# ── Lo nuevo: poder leer la historia ──────────────────────────────────────────

def test_incluir_inactivas_trae_tambien_las_dadas_de_baja(api, maquinas):
    r = api.get("/api/maquinas?incluir_inactivas=true")
    assert r.status_code == 200, r.text
    ids = _ids(r)
    assert maquinas[CODIGO_BAJA] in ids, (
        "sin esto, una orden cargada en esta máquina pierde su hoja al reimprimirse"
    )
    assert maquinas[CODIGO_ACTIVA] in ids, "las activas tienen que seguir estando"


def test_la_maquina_de_baja_conserva_como_es_su_hoja(api, maquinas):
    """No alcanza con que aparezca: tiene que traer con qué armar la ficha."""
    r = api.get("/api/maquinas?incluir_inactivas=true")
    assert r.status_code == 200, r.text
    fila = next(m for m in r.json() if m["id"] == maquinas[CODIGO_BAJA])
    assert fila["ficha_tipo"] == "autoadhesiva"
    assert fila["ficha_colores"] == 6
    assert fila["activa"] is False


def test_la_hoja_de_una_orden_vieja_no_cambia_al_dar_de_baja_la_maquina(
    api, db_session, maquinas
):
    """El caso completo, que es el que importa.

    Una orden guardó el NOMBRE de la impresora. Si después se da de baja esa
    máquina, la ficha tiene que poder seguir diciendo que era la autoadhesiva.
    """
    nombre_guardado = "PYTCI Baja Test"

    # Así lo lee la ficha impresa: con las inactivas incluidas.
    r = api.get("/api/maquinas?incluir_inactivas=true")
    encontrada = next(
        (m for m in r.json() if m["nombre"] == nombre_guardado), None
    )
    assert encontrada is not None
    assert encontrada["ficha_tipo"] == "autoadhesiva"

    # Y así lo leía antes —sólo activas—: no la encuentra y la hoja miente.
    r = api.get("/api/maquinas")
    assert all(m["nombre"] != nombre_guardado for m in r.json())


# ── Permisos ──────────────────────────────────────────────────────────────────

def test_no_hace_falta_ser_admin(api, maquinas):
    """La ficha la imprime el operario, no un administrador."""
    assert api.get("/api/maquinas?incluir_inactivas=true").status_code == 200
