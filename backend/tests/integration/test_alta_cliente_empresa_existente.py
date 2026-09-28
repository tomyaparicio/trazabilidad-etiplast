"""Integración: dar de alta una marca escribiendo el nombre de la empresa.

Dos agujeros del alta de clientes, los dos por el mismo lado: la razón social que
llega como TEXTO.

1. Duplicados. Este es el camino por el que en producción entraron «Megaton SAS»
   con «Megaton» ya cargada (y «Isacer SAS», y «Mannasero»): el alta comparaba el
   nombre letra a letra contra `razones_sociales.razon_social`, así que cualquier
   diferencia de mayúsculas, espacios o forma societaria creaba otra empresa —
   esquivando todo el anti-duplicados que sí tiene el alta de razones sociales.
   Quien carga una marca quiere COLGARLA de la empresa que ya está, no clonarla:
   si el nombre es el mismo (exacto o normalizado), se devuelve la que existe.

2. Empresa borrada. Si alguien borró la razón social mientras se cargaba la
   marca, el alta reventaba con el error de clave foránea de la base (500). La
   edición ya avisaba con un 400 claro; ahora las dos dicen exactamente lo mismo.
"""
import pytest

PREFIJO = "PYTEST ALTA EXIST"
EMPRESA = f"{PREFIJO} MEGATON"
NUMERO = 993001


def _limpiar(db_session):
    from models import Cliente, RazonSocial
    db_session.rollback()
    db_session.query(Cliente).filter(Cliente.marca.ilike(f"{PREFIJO}%")).delete(synchronize_session=False)
    db_session.query(RazonSocial).filter(RazonSocial.razon_social.ilike(f"{PREFIJO}%")).delete(synchronize_session=False)
    db_session.commit()


@pytest.fixture()
def empresa(api, db_session):
    """Una empresa ya cargada, con su N° — como «Megaton» (440) en producción."""
    _limpiar(db_session)
    r = api.post("/api/razones-sociales", json={"razon_social": EMPRESA, "numero": NUMERO})
    assert r.status_code == 201, r.text
    yield r.json()
    _limpiar(db_session)


def _empresas(db_session) -> list[str]:
    from models import RazonSocial
    db_session.expire_all()
    return [n for (n,) in db_session.query(RazonSocial.razon_social)
            .filter(RazonSocial.razon_social.ilike(f"{PREFIJO}%")).order_by(RazonSocial.id)]


def _alta(api, marca, **extra):
    return api.post("/api/clientes", json={"marca": f"{PREFIJO} {marca}", **extra})


# ── 1. El alta no clona una empresa que ya existe ────────────────────────────

@pytest.mark.parametrize("escrito", [
    f"{EMPRESA} SAS",          # la forma societaria al final: así entró «Megaton SAS»
    f"{EMPRESA} S.A.S.",
    EMPRESA.lower(),           # sólo cambian las mayúsculas
    f"  {EMPRESA}   ",         # sólo cambian los espacios
])
def test_el_alta_con_el_nombre_escrito_usa_la_empresa_que_ya_esta(api, db_session, empresa, escrito):
    r = _alta(api, "AGUA", razon_social=escrito)
    assert r.status_code == 201, r.text
    assert r.json()["razon_social_id"] == empresa["id"], "colgó la marca de otra empresa"
    assert _empresas(db_session) == [EMPRESA], "creó una razón social de más"


def test_la_marca_queda_con_el_numero_de_la_empresa_que_ya_estaba(api, empresa):
    """Es el daño real del duplicado: la marca quedaba con un N° nuevo y en la
    planta ya no se la encontraba por el de siempre."""
    r = _alta(api, "AGUA", razon_social=f"{EMPRESA} SAS")
    assert r.status_code == 201, r.text
    assert r.json()["id_cliente"] == NUMERO
    assert api.get(f"/api/clientes/{r.json()['id']}").json()["id_cliente"] == NUMERO


def test_el_cuit_que_llega_no_le_pisa_el_suyo_a_la_empresa_que_ya_estaba(api, db_session, empresa):
    """La empresa que ya está tiene sus datos revisados: el alta de una marca no
    es el lugar para cambiárselos."""
    from models import RazonSocial
    db_session.query(RazonSocial).filter(RazonSocial.id == empresa["id"]).update({"cuit": "30-99300100-1"})
    db_session.commit()

    r = _alta(api, "AGUA", razon_social=EMPRESA, cuit="20-11111111-1")
    assert r.status_code == 201, r.text
    db_session.expire_all()
    assert db_session.get(RazonSocial, empresa["id"]).cuit == "30-99300100-1"


def test_si_no_hay_ninguna_con_ese_nombre_la_crea(api, db_session, empresa):
    """Lo que tiene que seguir funcionando: un nombre nuevo es una empresa nueva."""
    r = _alta(api, "OTRA", razon_social=f"{PREFIJO} PLASTICOS DEL SUR SRL")
    assert r.status_code == 201, r.text
    assert r.json()["razon_social_id"] != empresa["id"]
    assert sorted(_empresas(db_session)) == sorted([EMPRESA, f"{PREFIJO} PLASTICOS DEL SUR SRL"])


def test_desde_la_ficha_de_la_marca_tampoco_se_clona(api, db_session, empresa):
    """La ficha también manda la razón social como texto cuando no se elige de la
    lista: el mismo agujero por el otro endpoint."""
    marca = _alta(api, "SUELTA")
    assert marca.status_code == 201, marca.text

    r = api.put(f"/api/clientes/{marca.json()['id']}", json={"razon_social": f"{EMPRESA} S.A.S."})
    assert r.status_code == 200, r.text
    assert r.json()["razon_social_id"] == empresa["id"]
    assert _empresas(db_session) == [EMPRESA]


# ── 2. La empresa que dejó de existir mientras se cargaba ────────────────────

@pytest.fixture()
def borrada(api, db_session):
    """Una razón social que ya no está: la pantalla la tiene elegida igual."""
    _limpiar(db_session)
    r = api.post("/api/razones-sociales", json={"razon_social": f"{PREFIJO} FANTASMA SRL"})
    assert r.status_code == 201, r.text
    rs_id = r.json()["id"]
    assert api.delete(f"/api/razones-sociales/{rs_id}").status_code == 200
    yield rs_id
    _limpiar(db_session)


def test_el_alta_con_una_empresa_borrada_avisa_en_vez_de_reventar(api, borrada):
    r = api.post("/api/clientes", json={"marca": f"{PREFIJO} HUERFANA", "razon_social_id": borrada})
    assert r.status_code == 400, r.text
    assert "ya no existe" in r.json()["detail"]


def test_el_aviso_es_el_mismo_en_el_alta_y_en_la_edicion(api, db_session, borrada):
    """Una sola explicación para la misma situación: el usuario no tiene por qué
    leer dos textos distintos según desde dónde guardó."""
    marca = api.post("/api/clientes", json={"marca": f"{PREFIJO} VIVA"})
    assert marca.status_code == 201, marca.text

    alta = api.post("/api/clientes", json={"marca": f"{PREFIJO} HUERFANA", "razon_social_id": borrada})
    edicion = api.put(f"/api/clientes/{marca.json()['id']}", json={"razon_social_id": borrada})
    assert (alta.status_code, edicion.status_code) == (400, 400), (alta.text, edicion.text)
    assert alta.json()["detail"] == edicion.json()["detail"]


def test_la_marca_no_queda_a_medio_crear(api, db_session, borrada):
    """El 500 dejaba la transacción abortada; acá no se guarda nada."""
    from models import Cliente
    api.post("/api/clientes", json={"marca": f"{PREFIJO} HUERFANA", "razon_social_id": borrada})
    db_session.expire_all()
    assert db_session.query(Cliente).filter(Cliente.marca == f"{PREFIJO} HUERFANA").first() is None
