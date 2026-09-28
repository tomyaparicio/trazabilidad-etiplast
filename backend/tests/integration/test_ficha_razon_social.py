"""Integración: sacarle la razón social a una marca desde su ficha.

En la ficha se puede vaciar la razón social (clientes «en negro»). Antes el PUT
sólo ponía `razon_social_id = null`, y la marca:
- pasaba a mostrar su id_cliente INTERNO como N°: otro número, que además podía
  ser el de otra empresa;
- perdía lo que mostraba heredado de su empresa (domicilio, teléfono, CUIT…).

Ahora hace lo mismo que borrar la empresa eligiendo «dejarlas sin razón social»
(`desvincular_marcas`): conserva el N° y copia lo heredado a la marca.

DECISIÓN — la ficha manda TODOS los campos en el mismo PUT, con lo que se veía:
1. Primero se desvincula: la marca queda con el N° y los datos de la empresa
   copiados como propios.
2. Después se aplica lo que llegó. Un campo que vuelve DISTINTO de lo que la
   ficha mostraba lo escribió el usuario, y gana sobre lo copiado, aunque lo haya
   vaciado a propósito.
3. Un campo que vuelve IGUAL a lo que se veía no lo escribió nadie: es la copia de
   la pantalla, y no pisa lo que dejó el paso 1. En casi todos los campos da lo
   mismo, pero en el CUIT no. Con empresa, la ficha muestra el CUIT de la
   EMPRESA. Si la empresa no tiene y la marca guardaba uno propio, la ficha manda
   el CUIT vacío que se veía, y escribirlo borraría un dato que el usuario nunca
   tocó.

Al revés (primero lo que llega y después copiar sólo lo vacío) volverían los
datos que el usuario borró a propósito, y el CUIT de la empresa pisaría el que
acababa de escribir.
"""
import pytest

PREFIJO = "PYTEST FICHA RS"
NUMERO = 778101

EMPRESA = {
    "razon_social": f"{PREFIJO} EMPRESA SRL", "numero": NUMERO, "cuit": "30-77810100-1",
    "domicilio": "Ruta 9 Km 5", "localidad": "Villa Maria", "provincia": "Córdoba",
    "telefono": "353-4111222", "transporte": "Expreso Sur",
    "transporte_domicilio": "Belgrano 50", "transporte_localidad": "Villa Maria",
}

# Lo que la marca muestra heredado de su empresa mientras la tiene.
HEREDADOS = (
    "cuit", "domicilio", "localidad", "provincia", "telefono",
    "transporte", "transporte_domicilio", "transporte_localidad",
)

# Lo que manda la ficha al guardar: CAMPOS_EDITABLES de cliente-detail-dialog.tsx.
CAMPOS_FICHA = (
    "id_cliente", "marca", "rubro", "razon_social", "razon_social_id",
    "cuit", "telefono", "domicilio", "localidad", "provincia", "pais",
    "transporte", "transporte_domicilio", "transporte_localidad",
    "observaciones", "latitud", "longitud",
)

# Vaciar el buscador de razón social deja las dos cosas en null.
SIN_RAZON_SOCIAL = {"razon_social_id": None, "razon_social": None}


def _limpiar(db_session):
    from models import Cliente, RazonSocial
    db_session.rollback()
    db_session.query(Cliente).filter(Cliente.marca.like(f"{PREFIJO}%")).delete(synchronize_session=False)
    db_session.query(RazonSocial).filter(RazonSocial.razon_social.like(f"{PREFIJO}%")).delete(synchronize_session=False)
    db_session.commit()


@pytest.fixture()
def empresa(api, db_session):
    """Una empresa con todos sus datos y dos marcas que no tienen datos propios:
    los muestran heredados."""
    _limpiar(db_session)   # por si una corrida anterior se cortó a la mitad
    rs = api.post("/api/razones-sociales", json=EMPRESA)
    assert rs.status_code == 201, rs.text
    ids = {}
    for clave in ("marca", "hermana"):
        r = api.post("/api/clientes", json={"marca": f"{PREFIJO} {clave.upper()}", "razon_social_id": rs.json()["id"]})
        assert r.status_code == 201, r.text
        ids[clave] = r.json()["id"]
    yield {"rs": rs.json()["id"], **ids}
    _limpiar(db_session)


def _ficha(api, cliente_id):
    r = api.get(f"/api/clientes/{cliente_id}")
    assert r.status_code == 200, r.text
    return r.json()


def _guardar_ficha(api, cliente_id, **cambios):
    """Guarda como la ficha: todos los campos con lo que se veía, más lo que el
    usuario cambió. Un campo vaciado viaja como null."""
    ficha = _ficha(api, cliente_id)
    payload = {**{c: ficha.get(c) for c in CAMPOS_FICHA}, **cambios}
    return api.put(f"/api/clientes/{cliente_id}",
                   json={k: (None if v == "" else v) for k, v in payload.items()})


def _ultima_auditoria(db_session):
    """Los ids de clientes se reutilizan en la DB de test: cada test mira sólo la
    auditoría que se generó después de este punto."""
    from sqlalchemy import func
    from models import AuditLog
    return db_session.query(func.coalesce(func.max(AuditLog.id), 0)).scalar()


def _auditoria_sin_razon_social(db_session, desde, cliente_id):
    from models import AuditLog
    db_session.expire_all()
    return (db_session.query(AuditLog)
            .filter(AuditLog.id > desde, AuditLog.entidad == "cliente", AuditLog.entidad_id == cliente_id,
                    AuditLog.descripcion.like("Quedó sin razón social%"))
            .all())


# ── Conserva el N° y lo que heredaba ─────────────────────────────────────────

def test_sacarle_la_razon_social_conserva_su_numero(api, empresa):
    """Se la sigue buscando por el N° de siempre hasta que le asignen otra."""
    assert _ficha(api, empresa["marca"])["id_cliente"] == NUMERO, "precondición: muestra el N° de su empresa"

    r = _guardar_ficha(api, empresa["marca"], **SIN_RAZON_SOCIAL)
    assert r.status_code == 200, r.text
    assert (r.json()["razon_social_id"], r.json()["razon_social"]) == (None, None)
    assert r.json()["id_cliente"] == NUMERO
    assert _ficha(api, empresa["marca"])["id_cliente"] == NUMERO

    encontrados = api.get("/api/clientes", params={"search": str(NUMERO), "per_page": 100}).json()["data"]
    assert empresa["marca"] in [c["id"] for c in encontrados]


def test_la_ficha_se_ve_igual_salvo_la_razon_social(api, empresa):
    antes = _ficha(api, empresa["marca"])
    assert {k: antes[k] for k in HEREDADOS} == {k: EMPRESA[k] for k in HEREDADOS}, \
        "precondición: la marca muestra los datos de su empresa"

    r = _guardar_ficha(api, empresa["marca"], **SIN_RAZON_SOCIAL)
    assert r.status_code == 200, r.text
    for campo in (*HEREDADOS, "id_cliente", "pais", "marca"):
        assert r.json()[campo] == antes[campo], campo


def test_conserva_lo_heredado_aunque_el_pedido_mande_solo_la_razon_social(api, empresa):
    """La ficha manda todo, pero conservar los datos no puede depender de eso."""
    antes = {k: v for k, v in _ficha(api, empresa["marca"]).items() if k in (*HEREDADOS, "id_cliente")}
    r = api.put(f"/api/clientes/{empresa['marca']}", json={"razon_social_id": None})
    assert r.status_code == 200, r.text
    assert {k: v for k, v in _ficha(api, empresa["marca"]).items() if k in antes} == antes


def test_la_empresa_y_su_otra_marca_quedan_como_estaban(api, empresa):
    _guardar_ficha(api, empresa["marca"], **SIN_RAZON_SOCIAL, cuit="20-11111111-2", domicilio="San Martin 1200")
    rs = api.get(f"/api/razones-sociales/{empresa['rs']}").json()
    assert {k: rs[k] for k in ("numero", *HEREDADOS)} == {k: EMPRESA[k] for k in ("numero", *HEREDADOS)}, \
        "lo escrito en la ficha de una marca que se va no le cambia los datos a la empresa"
    assert [m["id"] for m in rs["marcas"]] == [empresa["hermana"]]
    hermana = _ficha(api, empresa["hermana"])
    assert (hermana["razon_social_id"], hermana["id_cliente"]) == (empresa["rs"], NUMERO)


# ── Lo que el usuario escribió en la ficha gana ──────────────────────────────

def test_lo_que_el_usuario_cambio_en_la_ficha_gana_sobre_lo_copiado(api, empresa):
    r = _guardar_ficha(api, empresa["marca"], **SIN_RAZON_SOCIAL,
                       domicilio="San Martin 1200", cuit="20-11111111-2", telefono="")
    assert r.status_code == 200, r.text
    ficha = r.json()
    assert ficha["domicilio"] == "San Martin 1200"
    assert ficha["cuit"] == "20-11111111-2", "el CUIT de la empresa no pisa el que acaba de escribir"
    assert ficha["telefono"] is None, "lo vació a propósito: no vuelve el de la empresa"
    assert ficha["localidad"] == "Villa Maria", "lo que no tocó queda copiado"
    assert ficha["id_cliente"] == NUMERO


def test_no_se_pierde_el_cuit_propio_que_la_ficha_no_mostraba(api, db_session, empresa):
    """Con empresa, la ficha muestra el CUIT de la empresa. Si la empresa no tiene
    y la marca guardaba uno propio, la ficha manda el CUIT vacío que se veía: eso
    no es el usuario borrándolo."""
    from models import Cliente, RazonSocial
    db_session.get(RazonSocial, empresa["rs"]).cuit = None
    db_session.get(Cliente, empresa["marca"]).cuit = "30-44444444-4"
    db_session.commit()
    assert _ficha(api, empresa["marca"])["cuit"] is None, "precondición: la ficha no lo muestra"

    r = _guardar_ficha(api, empresa["marca"], **SIN_RAZON_SOCIAL)
    assert r.status_code == 200, r.text
    assert r.json()["cuit"] == "30-44444444-4"


def test_el_nombre_de_la_empresa_que_vuelve_tal_cual_no_queda_pegado(api, empresa):
    """Si el pedido devuelve el nombre que se veía, la marca no puede seguir
    mostrando (ni filtrándose como) una empresa a la que ya no pertenece."""
    r = api.put(f"/api/clientes/{empresa['marca']}",
                json={"razon_social_id": None, "razon_social": EMPRESA["razon_social"]})
    assert r.status_code == 200, r.text
    assert r.json()["razon_social"] is None


def test_una_marca_que_ya_estaba_sin_razon_social_se_guarda_como_siempre(api, db_session, empresa):
    api.put(f"/api/clientes/{empresa['marca']}", json={"razon_social_id": None})
    desde = _ultima_auditoria(db_session)

    r = _guardar_ficha(api, empresa["marca"], telefono="011-5555", domicilio="")
    assert r.status_code == 200, r.text
    assert (r.json()["telefono"], r.json()["domicilio"], r.json()["id_cliente"]) == ("011-5555", None, NUMERO)
    assert _auditoria_sin_razon_social(db_session, desde, empresa["marca"]) == [], \
        "no tenía razón social: no hay nada que desvincular"


# ── Auditoría ────────────────────────────────────────────────────────────────

def test_queda_auditado_que_se_la_sacaron_desde_la_ficha(api, db_session, empresa):
    from models import Cliente
    interno = db_session.get(Cliente, empresa["marca"]).id_cliente
    desde = _ultima_auditoria(db_session)

    _guardar_ficha(api, empresa["marca"], **SIN_RAZON_SOCIAL)
    filas = _auditoria_sin_razon_social(db_session, desde, empresa["marca"])
    assert len(filas) == 1, "tiene que quedar por qué cambió su N°"
    fila = filas[0]
    assert "desde su ficha" in fila.descripcion
    assert EMPRESA["razon_social"] in fila.descripcion
    assert "al borrarse" not in fila.descripcion, "la empresa no se borró"
    assert fila.datos["razon_social_id"] == {"antes": empresa["rs"], "despues": None}
    assert fila.datos["id_cliente"] == {"antes": interno, "despues": NUMERO}


def test_borrar_la_empresa_dejando_sus_marcas_sueltas_sigue_diciendo_que_se_borro(api, db_session, empresa):
    desde = _ultima_auditoria(db_session)
    r = api.delete(f"/api/razones-sociales/{empresa['rs']}", params={"marcas": "desvincular"})
    assert r.status_code == 200, r.text
    filas = _auditoria_sin_razon_social(db_session, desde, empresa["marca"])
    assert len(filas) == 1
    assert f"al borrarse «{EMPRESA['razon_social']}»" in filas[0].descripcion


# ── Razón social que no existe ───────────────────────────────────────────────

def test_una_razon_social_que_no_existe_se_rechaza_sin_tocar_nada(api, empresa):
    """Pasa si alguien borró la empresa mientras la ficha estaba abierta. Antes
    reventaba con un error de la base."""
    r = _guardar_ficha(api, empresa["marca"], razon_social_id=999999999,
                       marca=f"{PREFIJO} CAMBIADA", telefono="011-9999")
    assert r.status_code == 400, r.text
    assert "no existe" in r.json()["detail"]
    ficha = _ficha(api, empresa["marca"])
    assert ficha["marca"] == f"{PREFIJO} MARCA"
    assert ficha["razon_social_id"] == empresa["rs"]
    assert ficha["telefono"] == EMPRESA["telefono"]
