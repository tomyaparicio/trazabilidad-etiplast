"""Integración: cada impresora dice cuántos colores entran en su hoja.

POR QUÉ EXISTE ESTO: la empresa no tiene UNA orden de trabajo en papel, tiene
UNA POR IMPRESORA. Son casi idénticas —mismas tres etapas, mismas tablas— pero
no del todo: la hoja de ReinaFlex trae OCHO espacios de color (1 a 8, en dos
filas de cuatro) y el sistema imprimía seis para todas. Un trabajo de siete u
ocho colores no entraba en la ficha.

DÓNDE VA EL DATO, Y POR QUÉ NO EN EL CÓDIGO: en el catálogo de máquinas. Si se
hardcodea `{"ReinaFlex": 8, "Venus": 6}` en la ficha, la primera vez que alguien
renombre una impresora o cargue una nueva la hoja miente y nadie se entera hasta
que sale impresa. El catálogo ya es editable desde Administración; que el número
viva ahí significa que la empresa lo carga sola, sin esperar a que alguien toque
el código.

`ficha_colores` en NULL quiere decir «no lo cargaron todavía», y la ficha usa su
valor por defecto. No es lo mismo que cero: cero sería una impresora sin
colores, que no existe.
"""
import pytest

from models import Maquina

CODIGO_TEST = "PYTFC-COLORES"


@pytest.fixture()
def maquina_id(api, db_session):
    """Una impresora de prueba, creada por la API y borrada al terminar."""
    db_session.query(Maquina).filter(Maquina.codigo.like("PYTFC-%")).delete(
        synchronize_session=False
    )
    db_session.commit()

    m = Maquina(codigo=CODIGO_TEST, nombre="Impresora Colores Test", tipo="impresion",
                activa=True)
    db_session.add(m)
    db_session.commit()
    creada = m.id
    try:
        yield creada
    finally:
        db_session.query(Maquina).filter(Maquina.codigo.like("PYTFC-%")).delete(
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

def test_maquina_nueva_no_trae_colores_cargados(api, maquina_id):
    """Sin cargar, el campo viaja en None: la ficha usa su valor por defecto."""
    assert _leer(api, maquina_id)["ficha_colores"] is None


def test_se_puede_cargar_cuantos_colores_entran_en_la_hoja(api, maquina_id):
    r = api.put(f"/api/admin/maquinas/{maquina_id}", json={"ficha_colores": 8})
    assert r.status_code == 200, r.text
    assert r.json()["ficha_colores"] == 8
    assert _leer(api, maquina_id)["ficha_colores"] == 8


def test_se_puede_cargar_al_crear_la_maquina(api, db_session):
    r = api.post("/api/admin/maquinas",
                 json={"nombre": "PYTFC Nueva", "tipo": "impresion", "ficha_colores": 8})
    assert r.status_code == 201, r.text
    assert r.json()["ficha_colores"] == 8
    db_session.query(Maquina).filter(Maquina.nombre == "PYTFC Nueva").delete(
        synchronize_session=False
    )
    db_session.commit()


def test_se_puede_volver_a_dejarlo_sin_cargar(api, maquina_id):
    """Cargarlo mal y querer sacarlo es un caso real; None vuelve al default."""
    assert api.put(f"/api/admin/maquinas/{maquina_id}",
                   json={"ficha_colores": 8}).status_code == 200
    r = api.put(f"/api/admin/maquinas/{maquina_id}", json={"ficha_colores": None})
    assert r.status_code == 200, r.text
    assert r.json()["ficha_colores"] is None


# ── Lo que no se acepta ───────────────────────────────────────────────────────

@pytest.mark.parametrize("valor", [0, -1, 13, 100])
def test_rechaza_cantidades_que_no_son_una_hoja_real(api, maquina_id, valor):
    """Cero no es «sin cargar» (eso es None) y 100 colores no es una impresora."""
    r = api.put(f"/api/admin/maquinas/{maquina_id}", json={"ficha_colores": valor})
    assert r.status_code == 422, r.text


def test_editar_otra_cosa_no_borra_los_colores(api, maquina_id):
    """`exclude_unset`: tocar el nombre no puede llevarse puesto el dato."""
    assert api.put(f"/api/admin/maquinas/{maquina_id}",
                   json={"ficha_colores": 8}).status_code == 200
    r = api.put(f"/api/admin/maquinas/{maquina_id}", json={"nombre": "Otro Nombre Test"})
    assert r.status_code == 200, r.text
    assert r.json()["ficha_colores"] == 8
