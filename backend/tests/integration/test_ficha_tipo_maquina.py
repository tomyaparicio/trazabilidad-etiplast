"""Integración: cada impresora dice QUÉ HOJA imprime, no sólo cuántos colores.

POR QUÉ EXISTE ESTO, Y POR QUÉ NO ALCANZABA `ficha_colores`: mientras las tres
hojas de papel eran la misma con más o menos renglones de color, un número en
el catálogo bastaba. No lo son. La hoja de la AUTOADHESIVA es OTRA HOJA, porque
es otro proceso:

  · Venus y ReinaFlex EXTRUDEN el film acá adentro. Su paso 1 es EXTRUSIÓN y
    pide ancho, color, espesor y los kilos de cada bobina que sale.
  · La autoadhesiva COMPRA el material en bobina —OPP blanco, papel— y no tiene
    nada que extrudar. Su paso 1 es MATERIAL: qué material es y de qué ancho
    vino. El 2 agrega BARNIZ y LAMINACIÓN, y el 3 pide el troquel en alto×largo
    y hacia dónde se bobina.

Imprimirle a esa máquina la hoja de film le pone al operario una sección de
extrusión entera que no aplica.

LA LISTA ES CERRADA a propósito (`Literal["film", "autoadhesiva"]`). Con texto
libre, un typo como «autoadesiva» no rompe nada visible: cae en el default y la
impresora de autoadhesivos imprime la hoja equivocada, y nadie se entera hasta
que sale del papel. Con la lista cerrada se rechaza con 422 al cargarlo, que es
cuando hay alguien mirando la pantalla.

NULL significa «film», que es la hoja que el sistema venía imprimiendo para
todas. Así ninguna máquina ya cargada cambia de hoja sola.
"""
import pytest

from models import Maquina

CODIGO_TEST = "PYTFT-HOJA"


@pytest.fixture()
def maquina_id(api, db_session):
    """Una impresora de prueba, creada por la API y borrada al terminar."""
    db_session.query(Maquina).filter(Maquina.codigo.like("PYTFT-%")).delete(
        synchronize_session=False
    )
    db_session.commit()

    m = Maquina(codigo=CODIGO_TEST, nombre="Impresora Hoja Test", tipo="impresion",
                activa=True)
    db_session.add(m)
    db_session.commit()
    creada = m.id
    try:
        yield creada
    finally:
        db_session.query(Maquina).filter(Maquina.codigo.like("PYTFT-%")).delete(
            synchronize_session=False
        )
        db_session.commit()


def _leer(api, maquina_id):
    r = api.get("/api/admin/maquinas")
    assert r.status_code == 200, r.text
    fila = next((m for m in r.json() if m["id"] == maquina_id), None)
    assert fila is not None, "la máquina de prueba no aparece en el listado"
    return fila


# ── El dato existe y viaja ────────────────────────────────────────────────────

def test_maquina_nueva_no_trae_hoja_cargada(api, maquina_id):
    """Sin cargar viaja en None: la ficha imprime la hoja de film, como siempre."""
    assert _leer(api, maquina_id)["ficha_tipo"] is None


@pytest.mark.parametrize("hoja", ["autoadhesiva", "film"])
def test_se_puede_decir_que_hoja_imprime(api, maquina_id, hoja):
    r = api.put(f"/api/admin/maquinas/{maquina_id}", json={"ficha_tipo": hoja})
    assert r.status_code == 200, r.text
    assert r.json()["ficha_tipo"] == hoja
    assert _leer(api, maquina_id)["ficha_tipo"] == hoja


def test_se_puede_cargar_al_crear_la_maquina(api, db_session):
    r = api.post("/api/admin/maquinas",
                 json={"nombre": "PYTFT Nueva", "tipo": "impresion",
                       "ficha_tipo": "autoadhesiva"})
    assert r.status_code == 201, r.text
    assert r.json()["ficha_tipo"] == "autoadhesiva"
    db_session.query(Maquina).filter(Maquina.nombre == "PYTFT Nueva").delete(
        synchronize_session=False
    )
    db_session.commit()


def test_se_puede_volver_a_dejarlo_sin_cargar(api, maquina_id):
    """Marcarla mal y querer deshacerlo es un caso real; None vuelve al default."""
    assert api.put(f"/api/admin/maquinas/{maquina_id}",
                   json={"ficha_tipo": "autoadhesiva"}).status_code == 200
    r = api.put(f"/api/admin/maquinas/{maquina_id}", json={"ficha_tipo": None})
    assert r.status_code == 200, r.text
    assert r.json()["ficha_tipo"] is None


# ── Lo que no se acepta ───────────────────────────────────────────────────────

@pytest.mark.parametrize("valor", ["autoadesiva", "AUTOADHESIVA", "papel", "", "film2", 1])
def test_rechaza_hojas_que_no_existen(api, maquina_id, valor):
    """Un typo no puede caer en el default y mandar la hoja equivocada a la máquina."""
    r = api.put(f"/api/admin/maquinas/{maquina_id}", json={"ficha_tipo": valor})
    assert r.status_code == 422, r.text


# ── Que no se pisen entre sí ──────────────────────────────────────────────────

def test_editar_otra_cosa_no_borra_la_hoja(api, maquina_id):
    """`exclude_unset`: tocar el nombre no puede llevarse puesto el dato."""
    assert api.put(f"/api/admin/maquinas/{maquina_id}",
                   json={"ficha_tipo": "autoadhesiva"}).status_code == 200
    r = api.put(f"/api/admin/maquinas/{maquina_id}", json={"nombre": "Otro Nombre Hoja"})
    assert r.status_code == 200, r.text
    assert r.json()["ficha_tipo"] == "autoadhesiva"


def test_la_hoja_y_los_colores_son_independientes(api, maquina_id):
    """Son dos preguntas distintas: CUÁL hoja y CUÁNTOS renglones de color.

    La autoadhesiva imprime 6 colores igual que Venus — lo que cambia es todo
    lo demás. Guardar uno no puede tocar el otro.
    """
    assert api.put(f"/api/admin/maquinas/{maquina_id}",
                   json={"ficha_colores": 8}).status_code == 200
    r = api.put(f"/api/admin/maquinas/{maquina_id}", json={"ficha_tipo": "autoadhesiva"})
    assert r.status_code == 200, r.text
    assert r.json()["ficha_colores"] == 8
    assert r.json()["ficha_tipo"] == "autoadhesiva"

    r = api.put(f"/api/admin/maquinas/{maquina_id}", json={"ficha_colores": None})
    assert r.status_code == 200, r.text
    assert r.json()["ficha_colores"] is None
    assert r.json()["ficha_tipo"] == "autoadhesiva"
