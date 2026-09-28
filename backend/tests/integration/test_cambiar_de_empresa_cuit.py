"""Integración: cambiar de empresa desde la ficha no le toca el CUIT a la nueva.

La ficha de una marca muestra el CUIT de su EMPRESA (ver Cliente.to_dict), y al
guardar manda TODOS los campos con lo que se veía. Si en ese mismo guardado se la
pasa a otra empresa, el CUIT que llega es el que se veía de la ANTERIOR: nadie lo
escribió. Como el PUT copiaba «el cuit que llega» a la razón social vinculada,
la empresa DESTINO terminaba con el CUIT de la de origen — un dato fiscal
cambiado sin que nadie lo tocara, y que afecta a todas las marcas de esa empresa.

La regla: el CUIT se propaga a la empresa sólo si es la MISMA que la ficha tenía
abierta. Si en este guardado se cambió de empresa, lo que llega es la copia de la
pantalla y no se escribe. Editar el CUIT sin cambiar de empresa sigue andando
igual: es la forma de corregirlo desde la ficha.
"""
import pytest

PREFIJO = "PYTEST CAMBIO CUIT"
ORIGEN = {"razon_social": f"{PREFIJO} ORIGEN SRL", "numero": 994001, "cuit": "30-99400100-1"}
DESTINO = {"razon_social": f"{PREFIJO} DESTINO SRL", "numero": 994002, "cuit": "30-99400200-2"}

# Lo que manda la ficha al guardar: CAMPOS_EDITABLES de cliente-detail-dialog.tsx.
CAMPOS_FICHA = (
    "id_cliente", "marca", "rubro", "razon_social", "razon_social_id",
    "cuit", "telefono", "domicilio", "localidad", "provincia", "pais",
    "transporte", "transporte_domicilio", "transporte_localidad",
    "observaciones", "latitud", "longitud",
)


def _limpiar(db_session):
    from models import Cliente, RazonSocial
    db_session.rollback()
    db_session.query(Cliente).filter(Cliente.marca.ilike(f"{PREFIJO}%")).delete(synchronize_session=False)
    db_session.query(RazonSocial).filter(RazonSocial.razon_social.ilike(f"{PREFIJO}%")).delete(synchronize_session=False)
    db_session.commit()


@pytest.fixture()
def caso(api, db_session):
    """Dos empresas con CUIT propio y una marca colgada de la primera."""
    _limpiar(db_session)
    empresas = {}
    for clave, datos in (("origen", ORIGEN), ("destino", DESTINO)):
        r = api.post("/api/razones-sociales", json=datos)
        assert r.status_code == 201, r.text
        empresas[clave] = r.json()["id"]
    marca = api.post("/api/clientes", json={"marca": f"{PREFIJO} MARCA", "razon_social_id": empresas["origen"]})
    assert marca.status_code == 201, marca.text
    yield {**empresas, "marca": marca.json()["id"]}
    _limpiar(db_session)


def _guardar_ficha(api, cliente_id, **cambios):
    """Guarda como la ficha: todos los campos con lo que se veía, más lo que el
    usuario cambió."""
    ficha = api.get(f"/api/clientes/{cliente_id}").json()
    payload = {**{c: ficha.get(c) for c in CAMPOS_FICHA}, **cambios}
    return api.put(f"/api/clientes/{cliente_id}", json=payload)


def _cuit(db_session, rs_id):
    from models import RazonSocial
    db_session.expire_all()
    return db_session.get(RazonSocial, rs_id).cuit


# ── Cambiar de empresa no toca ningún CUIT ───────────────────────────────────

def test_cambiar_de_empresa_no_le_escribe_el_cuit_de_la_anterior(api, db_session, caso):
    assert api.get(f"/api/clientes/{caso['marca']}").json()["cuit"] == ORIGEN["cuit"], \
        "precondición: la ficha muestra el CUIT de su empresa"

    r = _guardar_ficha(api, caso["marca"],
                       razon_social_id=caso["destino"], razon_social=DESTINO["razon_social"])
    assert r.status_code == 200, r.text
    assert r.json()["razon_social_id"] == caso["destino"]

    assert _cuit(db_session, caso["destino"]) == DESTINO["cuit"], "la empresa destino quedó con el CUIT de la otra"
    assert _cuit(db_session, caso["origen"]) == ORIGEN["cuit"], "la empresa de origen perdió su CUIT"


def test_tampoco_si_la_empresa_destino_no_tenia_cuit(api, db_session, caso):
    """Sin CUIT propio el destino parece «vacío para completar», pero el que llega
    tampoco es suyo: sigue siendo el de la empresa anterior."""
    from models import RazonSocial
    db_session.query(RazonSocial).filter(RazonSocial.id == caso["destino"]).update({"cuit": None})
    db_session.commit()

    r = _guardar_ficha(api, caso["marca"],
                       razon_social_id=caso["destino"], razon_social=DESTINO["razon_social"])
    assert r.status_code == 200, r.text
    assert _cuit(db_session, caso["destino"]) is None


def test_ponerle_empresa_a_una_marca_suelta_tampoco_le_pisa_el_cuit(api, db_session, caso):
    """La marca sin empresa muestra su CUIT propio: al colgarla de una empresa,
    ese dato es de la marca y no puede escribirse sobre el de la empresa."""
    suelta = api.post("/api/clientes", json={"marca": f"{PREFIJO} SUELTA", "cuit": "20-11111111-1"})
    assert suelta.status_code == 201, suelta.text

    r = _guardar_ficha(api, suelta.json()["id"],
                       razon_social_id=caso["destino"], razon_social=DESTINO["razon_social"])
    assert r.status_code == 200, r.text
    assert _cuit(db_session, caso["destino"]) == DESTINO["cuit"]


# ── Editar el CUIT sin cambiar de empresa sigue andando ──────────────────────

def test_editar_el_cuit_sin_cambiar_de_empresa_lo_actualiza(api, db_session, caso):
    """La otra cara: corregir el CUIT desde la ficha de cualquiera de sus marcas
    es justamente para lo que está."""
    r = _guardar_ficha(api, caso["marca"], cuit="30-55555555-5")
    assert r.status_code == 200, r.text
    assert r.json()["cuit"] == "30-55555555-5"
    assert _cuit(db_session, caso["origen"]) == "30-55555555-5"


def test_el_cuit_corregido_lo_ven_todas_las_marcas_de_la_empresa(api, db_session, caso):
    hermana = api.post("/api/clientes", json={"marca": f"{PREFIJO} HERMANA", "razon_social_id": caso["origen"]})
    assert hermana.status_code == 201, hermana.text

    _guardar_ficha(api, caso["marca"], cuit="30-55555555-5")
    assert api.get(f"/api/clientes/{hermana.json()['id']}").json()["cuit"] == "30-55555555-5"
