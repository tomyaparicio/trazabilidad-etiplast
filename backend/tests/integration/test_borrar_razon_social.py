"""Integración: borrar una razón social.

El caso que lo pidió: «Mannasero Zapata Hielos Alpina SRL» quedó creada con un
error de tipeo (la real es «Manassero»), sin ninguna marca, y no había forma de
sacarla de la lista.

La regla: se puede borrar aunque tenga marcas, pero alguien tiene que DECIDIR qué
pasa con ellas: pasarlas a otra razón social (`mover_a` / `nueva_razon_social`),
dejarlas sin razón social (`marcas=desvincular`) o borrarlas (`marcas=borrar`).
Sin decisión se rechaza.
"""
import pytest


def _ultima_auditoria(db_session):
    """Id de la última fila de auditoría. Los ids de clientes y razones sociales de
    tests viejos se pueden reutilizar en la DB de test, así que cada test mira sólo
    la auditoría que se generó después de este punto."""
    from models import AuditLog
    from sqlalchemy import func
    return db_session.query(func.coalesce(func.max(AuditLog.id), 0)).scalar()


def _borrar_rs(db_session, *ids):
    from models import RazonSocial
    db_session.query(RazonSocial).filter(RazonSocial.id.in_(ids)).delete(synchronize_session=False)
    db_session.commit()


@pytest.fixture()
def rs_vacia(api, db_session):
    r = api.post("/api/razones-sociales", json={"razon_social": "PYTEST BORRAR VACIA SRL"})
    assert r.status_code == 201, r.text
    rs_id = r.json()["id"]
    yield rs_id
    _borrar_rs(db_session, rs_id)


@pytest.fixture()
def con_marcas(api, db_session):
    """Una razón social con dos marcas, y otra a la que pasarlas."""
    origen = api.post("/api/razones-sociales", json={"razon_social": "PYTEST BORRAR ORIGEN SRL", "numero": 771001}).json()
    destino = api.post("/api/razones-sociales", json={"razon_social": "PYTEST BORRAR DESTINO SA", "numero": 771002}).json()
    marcas = []
    for nombre in ("PYTEST BORRAR MARCA UNO", "PYTEST BORRAR MARCA DOS"):
        c = api.post("/api/clientes", json={"marca": nombre, "razon_social_id": origen["id"]})
        assert c.status_code == 201, c.text
        marcas.append(c.json()["id"])
    yield {"origen": origen, "destino": destino, "marcas": marcas}
    for m in marcas:
        api.delete(f"/api/clientes/{m}")
    _borrar_rs(db_session, origen["id"], destino["id"])


# ── Sin marcas ────────────────────────────────────────────────────────────────

def test_borra_una_razon_social_sin_marcas(api, rs_vacia):
    r = api.delete(f"/api/razones-sociales/{rs_vacia}")
    assert r.status_code == 200, r.text
    assert api.get(f"/api/razones-sociales/{rs_vacia}").status_code == 404


def test_borrar_una_que_no_existe_da_404(api):
    assert api.delete("/api/razones-sociales/999999999").status_code == 404


def test_el_borrado_queda_auditado(api, db_session, rs_vacia):
    from models import AuditLog
    antes = _ultima_auditoria(db_session)
    api.delete(f"/api/razones-sociales/{rs_vacia}")
    db_session.expire_all()
    fila = (db_session.query(AuditLog)
            .filter(AuditLog.id > antes, AuditLog.entidad == "razon_social", AuditLog.entidad_id == rs_vacia,
                    AuditLog.accion == "eliminar")
            .first())
    assert fila is not None, "borrar una entidad legal tiene que dejar rastro"
    assert "PYTEST BORRAR VACIA SRL" in fila.descripcion


# ── Con marcas: hay que decir a dónde van ────────────────────────────────────

def test_con_marcas_y_sin_destino_se_rechaza(api, con_marcas):
    c = con_marcas
    r = api.delete(f"/api/razones-sociales/{c['origen']['id']}")
    assert r.status_code == 409, r.text
    assert "2 marcas" in r.json()["detail"], "dice por qué no se puede"
    # Y nada cambió.
    assert api.get(f"/api/razones-sociales/{c['origen']['id']}").status_code == 200
    for m in c["marcas"]:
        assert api.get(f"/api/clientes/{m}").json()["razon_social_id"] == c["origen"]["id"]


def test_con_destino_pasa_las_marcas_y_borra(api, con_marcas):
    c = con_marcas
    r = api.delete(f"/api/razones-sociales/{c['origen']['id']}?mover_a={c['destino']['id']}")
    assert r.status_code == 200, r.text
    assert api.get(f"/api/razones-sociales/{c['origen']['id']}").status_code == 404
    for m in c["marcas"]:
        ficha = api.get(f"/api/clientes/{m}").json()
        assert ficha["razon_social_id"] == c["destino"]["id"], "la marca sigue viva, en la nueva"
        assert ficha["razon_social"] == "PYTEST BORRAR DESTINO SA"


def test_las_marcas_toman_el_numero_del_destino(api, con_marcas):
    c = con_marcas
    api.delete(f"/api/razones-sociales/{c['origen']['id']}?mover_a={c['destino']['id']}")
    for m in c["marcas"]:
        assert api.get(f"/api/clientes/{m}").json()["id_cliente"] == 771002


def test_si_el_destino_no_tiene_numero_hereda_el_del_borrado(api, db_session, con_marcas):
    """Caso típico: se borra «Megaton» (N° 440) pasando todo a «Megaton SAS», que
    se había creado sin número. Las marcas NO pueden perder el 440."""
    from models import RazonSocial
    c = con_marcas
    destino = db_session.query(RazonSocial).filter(RazonSocial.id == c["destino"]["id"]).one()
    destino.numero = None
    db_session.commit()

    r = api.delete(f"/api/razones-sociales/{c['origen']['id']}?mover_a={c['destino']['id']}")
    assert r.status_code == 200, r.text
    assert api.get(f"/api/razones-sociales/{c['destino']['id']}").json()["numero"] == 771001
    for m in c["marcas"]:
        assert api.get(f"/api/clientes/{m}").json()["id_cliente"] == 771001


def test_no_se_puede_mover_a_si_misma(api, con_marcas):
    c = con_marcas
    r = api.delete(f"/api/razones-sociales/{c['origen']['id']}?mover_a={c['origen']['id']}")
    assert r.status_code == 400, r.text
    assert api.get(f"/api/razones-sociales/{c['origen']['id']}").status_code == 200


def test_destino_inexistente_se_rechaza_sin_tocar_nada(api, con_marcas):
    c = con_marcas
    r = api.delete(f"/api/razones-sociales/{c['origen']['id']}?mover_a=999999999")
    assert r.status_code == 400, r.text
    assert api.get(f"/api/razones-sociales/{c['origen']['id']}").status_code == 200
    for m in c["marcas"]:
        assert api.get(f"/api/clientes/{m}").json()["razon_social_id"] == c["origen"]["id"]


def test_el_movimiento_queda_auditado_en_la_razon_social_y_en_cada_marca(api, db_session, con_marcas):
    from models import AuditLog
    c = con_marcas
    antes = _ultima_auditoria(db_session)
    api.delete(f"/api/razones-sociales/{c['origen']['id']}?mover_a={c['destino']['id']}")
    db_session.expire_all()

    borrado = (db_session.query(AuditLog)
               .filter(AuditLog.id > antes, AuditLog.entidad == "razon_social", AuditLog.entidad_id == c["origen"]["id"],
                       AuditLog.accion == "eliminar")
               .one())
    assert borrado.datos["movidas_a"]["id"] == c["destino"]["id"]
    assert sorted(m["id"] for m in borrado.datos["marcas_movidas"]) == sorted(c["marcas"])

    # En la historia de cada cliente también tiene que verse por qué cambió de empresa.
    for m in c["marcas"]:
        fila = (db_session.query(AuditLog)
                .filter(AuditLog.id > antes, AuditLog.entidad == "cliente", AuditLog.entidad_id == m,
                        AuditLog.accion == "actualizar")
                .order_by(AuditLog.id.desc())
                .first())
        assert fila is not None
        assert "PYTEST BORRAR DESTINO SA" in fila.descripcion


# ── Lo que la empresa borrada le daba a sus marcas no se pierde ──────────────

DATOS_EMPRESA = {
    "cuit": "30-77100100-1", "domicilio": "Ruta 8 Km 12", "localidad": "Rio Cuarto",
    "provincia": "Córdoba", "telefono": "358-4999888", "transporte": "Expreso Norte",
}


@pytest.fixture()
def origen_con_datos(api, db_session):
    """Empresa con domicilio, teléfono, etc.; su marca no tiene datos propios y los
    hereda. El destino está pelado (como «Megaton SAS», creada sólo con el nombre)."""
    origen = api.post("/api/razones-sociales",
                      json={"razon_social": "PYTEST HERENCIA ORIGEN", "numero": 772001, **DATOS_EMPRESA}).json()
    destino = api.post("/api/razones-sociales", json={"razon_social": "PYTEST HERENCIA DESTINO"}).json()
    marca = api.post("/api/clientes", json={"marca": "PYTEST HERENCIA MARCA", "razon_social_id": origen["id"]})
    assert marca.status_code == 201, marca.text
    yield {"origen": origen, "destino": destino, "marca": marca.json()["id"]}
    api.delete(f"/api/clientes/{marca.json()['id']}")
    from models import RazonSocial
    db_session.query(RazonSocial).filter(
        RazonSocial.razon_social.like("PYTEST HERENCIA%")).delete(synchronize_session=False)
    db_session.commit()


def _ficha_empresa(api, cliente_id):
    f = api.get(f"/api/clientes/{cliente_id}").json()
    return {k: f[k] for k in DATOS_EMPRESA}


def test_destino_vacio_hereda_los_datos_de_la_empresa_borrada(api, origen_con_datos):
    c = origen_con_datos
    antes = _ficha_empresa(api, c["marca"])
    assert antes == DATOS_EMPRESA, "precondición: la marca los hereda de la empresa"

    r = api.delete(f"/api/razones-sociales/{c['origen']['id']}?mover_a={c['destino']['id']}")
    assert r.status_code == 200, r.text
    assert _ficha_empresa(api, c["marca"]) == DATOS_EMPRESA, "la ficha de la marca no cambia"


def test_los_datos_propios_del_destino_no_se_pisan(api, origen_con_datos):
    c = origen_con_datos
    api.put(f"/api/razones-sociales/{c['destino']['id']}", json={"telefono": "011-5555", "cuit": "30-99999999-9"})
    api.delete(f"/api/razones-sociales/{c['origen']['id']}?mover_a={c['destino']['id']}")
    destino = api.get(f"/api/razones-sociales/{c['destino']['id']}").json()
    assert destino["telefono"] == "011-5555"
    assert destino["cuit"] == "30-99999999-9"
    assert destino["domicilio"] == "Ruta 8 Km 12", "lo que le faltaba, sí lo hereda"


def test_el_cuit_viejo_de_la_marca_se_alinea_con_su_nueva_empresa(api, db_session, origen_con_datos):
    """La columna legacy clientes.cuit la usa el export: no puede quedar con el CUIT
    de una empresa que ya no es la suya."""
    from models import Cliente
    c = origen_con_datos
    api.put(f"/api/razones-sociales/{c['destino']['id']}", json={"cuit": "30-88888888-8"})
    api.delete(f"/api/razones-sociales/{c['origen']['id']}?mover_a={c['destino']['id']}")
    db_session.expire_all()
    assert db_session.get(Cliente, c["marca"]).cuit == "30-88888888-8"


def test_la_herencia_queda_auditada_en_el_destino_con_antes_y_despues(api, db_session, origen_con_datos):
    from models import AuditLog
    c = origen_con_datos
    antes = _ultima_auditoria(db_session)
    api.delete(f"/api/razones-sociales/{c['origen']['id']}?mover_a={c['destino']['id']}")
    db_session.expire_all()
    fila = (db_session.query(AuditLog)
            .filter(AuditLog.id > antes, AuditLog.entidad == "razon_social", AuditLog.entidad_id == c["destino"]["id"],
                    AuditLog.accion == "actualizar")
            .one())
    assert fila.datos["antes"]["domicilio"] is None
    assert fila.datos["despues"]["domicilio"] == "Ruta 8 Km 12"


def test_el_borrado_guarda_todos_los_datos_de_la_empresa(api, db_session, origen_con_datos):
    """Sin esto, lo que no se heredó (porque el destino ya tenía el suyo) se pierde
    sin dejar rastro."""
    from models import AuditLog
    c = origen_con_datos
    antes = _ultima_auditoria(db_session)
    api.delete(f"/api/razones-sociales/{c['origen']['id']}?mover_a={c['destino']['id']}")
    db_session.expire_all()
    fila = (db_session.query(AuditLog)
            .filter(AuditLog.id > antes, AuditLog.entidad == "razon_social", AuditLog.entidad_id == c["origen"]["id"],
                    AuditLog.accion == "eliminar")
            .one())
    assert fila.datos["telefono"] == "358-4999888"
    assert fila.datos["domicilio"] == "Ruta 8 Km 12"


def test_las_marcas_que_ya_tenia_el_destino_y_cambian_de_numero_quedan_auditadas(api, db_session, origen_con_datos):
    """Si el destino no tenía N°, hereda el de la borrada: sus marcas de antes
    también pasan a mostrar ese número, y eso tiene que quedar registrado."""
    from models import AuditLog
    c = origen_con_datos
    from models import RazonSocial
    destino = db_session.get(RazonSocial, c["destino"]["id"])
    destino.numero = None
    db_session.commit()
    previa = api.post("/api/clientes", json={"marca": "PYTEST HERENCIA PREVIA", "razon_social_id": c["destino"]["id"]}).json()
    try:
        antes = _ultima_auditoria(db_session)
        api.delete(f"/api/razones-sociales/{c['origen']['id']}?mover_a={c['destino']['id']}")
        assert api.get(f"/api/clientes/{previa['id']}").json()["id_cliente"] == 772001
        db_session.expire_all()
        fila = (db_session.query(AuditLog)
                .filter(AuditLog.id > antes, AuditLog.entidad == "cliente", AuditLog.entidad_id == previa["id"],
                        AuditLog.accion == "actualizar")
                .order_by(AuditLog.id.desc()).first())
        assert fila is not None and "772001" in fila.descripcion
    finally:
        api.delete(f"/api/clientes/{previa['id']}")


# ── Pasar las marcas a una razón social NUEVA ────────────────────────────────

def test_crea_la_nueva_y_se_queda_con_numero_y_datos_de_la_borrada(api, db_session, origen_con_datos):
    """El caso «Megaton» → «Megaton SAS»: la nueva nace recién al confirmar, con el
    N° y los datos de la que se borra. Las marcas no notan el cambio salvo el nombre."""
    from models import RazonSocial
    c = origen_con_datos
    r = api.delete(f"/api/razones-sociales/{c['origen']['id']}",
                   params={"nueva_razon_social": "  PYTEST HERENCIA NUEVA SAS "})
    assert r.status_code == 200, r.text

    db_session.expire_all()
    nueva = db_session.query(RazonSocial).filter(RazonSocial.razon_social == "PYTEST HERENCIA NUEVA SAS").one()
    ficha = api.get(f"/api/clientes/{c['marca']}").json()
    assert ficha["razon_social_id"] == nueva.id
    assert ficha["id_cliente"] == 772001
    assert _ficha_empresa(api, c["marca"]) == DATOS_EMPRESA


def test_nueva_con_un_nombre_que_ya_existe_se_rechaza(api, origen_con_datos):
    """Crear otra con el mismo nombre es exactamente cómo aparecieron los duplicados."""
    c = origen_con_datos
    r = api.delete(f"/api/razones-sociales/{c['origen']['id']}",
                   params={"nueva_razon_social": "pytest herencia destino"})
    assert r.status_code == 409, r.text
    assert "Ya existe" in r.json()["detail"], "rechaza por el nombre, no por tener marcas"
    assert api.get(f"/api/razones-sociales/{c['origen']['id']}").status_code == 200


def test_no_se_puede_mandar_destino_y_nueva_a_la_vez(api, origen_con_datos):
    c = origen_con_datos
    r = api.delete(f"/api/razones-sociales/{c['origen']['id']}",
                   params={"mover_a": c["destino"]["id"], "nueva_razon_social": "PYTEST HERENCIA OTRA"})
    assert r.status_code == 400, r.text


def test_nueva_con_nombre_vacio_se_rechaza(api, origen_con_datos):
    c = origen_con_datos
    r = api.delete(f"/api/razones-sociales/{c['origen']['id']}", params={"nueva_razon_social": "   "})
    assert r.status_code == 400, r.text
    assert api.get(f"/api/razones-sociales/{c['origen']['id']}").status_code == 200


# ── Segunda revisión ─────────────────────────────────────────────────────────

def test_responde_cuantas_marcas_movio_y_a_donde(api, con_marcas):
    """El aviso de la pantalla tiene que contar lo que pasó de verdad, no lo que
    había cuando se abrió el diálogo."""
    c = con_marcas
    r = api.delete(f"/api/razones-sociales/{c['origen']['id']}?mover_a={c['destino']['id']}")
    assert r.status_code == 200, r.text
    assert r.json()["accion"] == "mover"
    assert r.json()["marcas"] == 2
    assert r.json()["destino"]["razon_social"] == "PYTEST BORRAR DESTINO SA"


def test_sin_marcas_no_crea_la_nueva_ni_revisa_su_nombre(api, db_session, rs_vacia):
    """Si mientras tanto alguien le sacó las marcas, no se crea una razón social
    que nadie va a usar (ni se rechaza por un nombre que no se iba a crear)."""
    from models import RazonSocial
    otra = api.post("/api/razones-sociales", json={"razon_social": "PYTEST SIN MARCAS NOMBRE TOMADO"}).json()
    try:
        r = api.delete(f"/api/razones-sociales/{rs_vacia}",
                       params={"nueva_razon_social": "PYTEST SIN MARCAS NOMBRE TOMADO"})
        assert r.status_code == 200, r.text
        assert r.json() == {"accion": None, "marcas": 0, "destino": None}
        db_session.expire_all()
        assert db_session.query(RazonSocial).filter(
            RazonSocial.razon_social == "PYTEST SIN MARCAS NOMBRE TOMADO").count() == 1
    finally:
        _borrar_rs(db_session, otra["id"])


def test_la_direccion_se_hereda_entera_o_no_se_hereda(api, origen_con_datos):
    """Si el destino ya tiene PARTE de su dirección (localidad y provincia, sin
    calle), copiarle sólo la calle arma una dirección que no es de ninguna de las
    dos empresas: «Ruta 8 Km 12, Rosario, Santa Fe»."""
    c = origen_con_datos
    api.put(f"/api/razones-sociales/{c['destino']['id']}", json={"localidad": "Rosario", "provincia": "Santa Fe"})
    api.delete(f"/api/razones-sociales/{c['origen']['id']}?mover_a={c['destino']['id']}")
    destino = api.get(f"/api/razones-sociales/{c['destino']['id']}").json()
    assert destino["domicilio"] is None
    assert (destino["localidad"], destino["provincia"]) == ("Rosario", "Santa Fe")
    # Lo que no es dirección se sigue heredando.
    assert destino["telefono"] == "358-4999888"


def test_el_transporte_tambien_se_hereda_en_bloque(api, origen_con_datos):
    c = origen_con_datos
    api.put(f"/api/razones-sociales/{c['origen']['id']}", json={"transporte_localidad": "Rio Cuarto"})
    api.put(f"/api/razones-sociales/{c['destino']['id']}", json={"transporte": "Via Cargo"})
    api.delete(f"/api/razones-sociales/{c['origen']['id']}?mover_a={c['destino']['id']}")
    destino = api.get(f"/api/razones-sociales/{c['destino']['id']}").json()
    assert (destino["transporte"], destino["transporte_localidad"]) == ("Via Cargo", None)


def test_el_cuit_propio_de_la_marca_no_se_borra_si_el_destino_no_tiene(api, db_session, con_marcas):
    """El alta deja escribir el CUIT de la marca cuando su empresa no tiene uno:
    queda sólo en clientes.cuit y el export lo muestra. No puede perderse."""
    from models import Cliente
    c = con_marcas
    marca = db_session.get(Cliente, c["marcas"][0])
    marca.cuit = "30-55555555-5"
    db_session.commit()

    api.delete(f"/api/razones-sociales/{c['origen']['id']}?mover_a={c['destino']['id']}")
    db_session.expire_all()
    assert db_session.get(Cliente, c["marcas"][0]).cuit == "30-55555555-5"


def test_si_el_cuit_de_la_marca_cambia_queda_el_anterior_en_la_auditoria(api, db_session, con_marcas):
    from models import AuditLog, Cliente
    c = con_marcas
    marca = db_session.get(Cliente, c["marcas"][0])
    marca.cuit = "30-55555555-5"
    db_session.commit()
    api.put(f"/api/razones-sociales/{c['destino']['id']}", json={"cuit": "30-66666666-6"})

    antes = _ultima_auditoria(db_session)

    api.delete(f"/api/razones-sociales/{c['origen']['id']}?mover_a={c['destino']['id']}")
    db_session.expire_all()
    assert db_session.get(Cliente, c["marcas"][0]).cuit == "30-66666666-6"
    fila = (db_session.query(AuditLog)
            .filter(AuditLog.id > antes, AuditLog.entidad == "cliente", AuditLog.entidad_id == c["marcas"][0],
                    AuditLog.accion == "actualizar")
            .order_by(AuditLog.id.desc()).first())
    assert fila.datos["cuit"] == {"antes": "30-55555555-5", "despues": "30-66666666-6"}


# ── Dejar las marcas sin razón social ────────────────────────────────────────

def _desvincular(api, c):
    r = api.delete(f"/api/razones-sociales/{c['origen']['id']}", params={"marcas": "desvincular"})
    assert r.status_code == 200, r.text
    return r

def test_desvincular_deja_las_marcas_sin_razon_social_y_borra(api, origen_con_datos):
    c = origen_con_datos
    r = api.delete(f"/api/razones-sociales/{c['origen']['id']}", params={"marcas": "desvincular"})
    assert r.status_code == 200, r.text
    assert r.json() == {"accion": "desvincular", "marcas": 1, "destino": None}
    assert api.get(f"/api/razones-sociales/{c['origen']['id']}").status_code == 404
    ficha = api.get(f"/api/clientes/{c['marca']}").json()
    assert ficha["razon_social_id"] is None
    assert ficha["razon_social"] is None, "no puede seguir mostrando una empresa que ya no existe"


def test_las_desvinculadas_conservan_el_numero(api, origen_con_datos):
    """Se las sigue buscando por el N° de siempre hasta que les asignen otra."""
    c = origen_con_datos
    _desvincular(api, c)
    assert api.get(f"/api/clientes/{c['marca']}").json()["id_cliente"] == 772001


def test_las_desvinculadas_conservan_los_datos_de_la_empresa(api, origen_con_datos):
    c = origen_con_datos
    _desvincular(api, c)
    assert _ficha_empresa(api, c["marca"]) == DATOS_EMPRESA


def test_los_datos_propios_de_la_marca_no_se_pisan_al_desvincular(api, origen_con_datos):
    c = origen_con_datos
    api.put(f"/api/clientes/{c['marca']}", json={"telefono": "011-4444"})
    _desvincular(api, c)
    ficha = api.get(f"/api/clientes/{c['marca']}").json()
    assert ficha["telefono"] == "011-4444"
    assert ficha["domicilio"] == "Ruta 8 Km 12"


def test_desvincular_queda_auditado_en_cada_marca(api, db_session, origen_con_datos):
    from models import AuditLog
    c = origen_con_datos
    antes = _ultima_auditoria(db_session)
    _desvincular(api, c)
    db_session.expire_all()
    fila = (db_session.query(AuditLog)
            .filter(AuditLog.id > antes, AuditLog.entidad == "cliente", AuditLog.entidad_id == c["marca"],
                    AuditLog.accion == "actualizar")
            .order_by(AuditLog.id.desc()).first())
    assert fila is not None and "sin razón social" in fila.descripcion
    assert fila.datos["razon_social_id"] == {"antes": c["origen"]["id"], "despues": None}


def test_el_numero_automatico_no_repite_el_de_las_desvinculadas(api, db_session, origen_con_datos):
    c = origen_con_datos
    _desvincular(api, c)
    nueva = api.post("/api/razones-sociales", json={"razon_social": "PYTEST HERENCIA TRAS DESVINCULAR"}).json()
    assert nueva["numero"] != 772001


def test_no_se_puede_desvincular_y_mover_a_la_vez(api, con_marcas):
    c = con_marcas
    r = api.delete(f"/api/razones-sociales/{c['origen']['id']}",
                   params={"marcas": "desvincular", "mover_a": c["destino"]["id"]})
    assert r.status_code == 400, r.text
    assert api.get(f"/api/razones-sociales/{c['origen']['id']}").status_code == 200


def test_una_accion_desconocida_se_rechaza(api, con_marcas):
    c = con_marcas
    r = api.delete(f"/api/razones-sociales/{c['origen']['id']}", params={"marcas": "archivar"})
    assert r.status_code == 422, r.text


# ── Borrar las marcas también ────────────────────────────────────────────────

@pytest.fixture()
def marca_con_historial(api, db_session, con_marcas):
    """Una de las marcas con una orden de trabajo, un remito y una factura."""
    from models import OrdenTrabajo, Presupuesto, Remito
    c = con_marcas
    m = c["marcas"][0]
    orden = OrdenTrabajo(numero="OT-PYTEST-BORRAR-RS", cliente_id=m)
    remito = Remito(numero="REM-PYTEST-BRS", cliente_id=m)
    db_session.add_all([orden, remito])
    db_session.flush()
    # Un presupuesto ya convertido en esa orden: el caso que quedaba trabado.
    presupuesto = Presupuesto(numero="PRES-PYTEST-BRS", cliente_id=m, estado="convertido",
                              orden_trabajo_id=orden.id)
    db_session.add(presupuesto)
    db_session.commit()
    factura = api.post("/api/facturas", json={"cliente_id": m, "fecha": "2025-05-10", "subtotal": 100})
    assert factura.status_code == 201, factura.text
    yield {**c, "orden": orden.id, "remito": remito.id, "presupuesto": presupuesto.id,
           "factura": factura.json()["id"]}
    from models import Factura
    db_session.expire_all()
    db_session.query(Factura).filter(Factura.id == factura.json()["id"]).delete(synchronize_session=False)
    db_session.query(OrdenTrabajo).filter(OrdenTrabajo.numero == "OT-PYTEST-BORRAR-RS").delete(synchronize_session=False)
    db_session.query(Remito).filter(Remito.numero == "REM-PYTEST-BRS").delete(synchronize_session=False)
    db_session.query(Presupuesto).filter(Presupuesto.numero == "PRES-PYTEST-BRS").delete(synchronize_session=False)
    db_session.commit()


def _confirmado(marcas, ordenes, remitos, facturas, presupuestos):
    """Lo que el diálogo mostró y el usuario confirmó: QUÉ marcas (por id, no sólo
    cuántas) y cuántos documentos. Si al confirmar hay otra cosa, no se borra."""
    return ",".join(["-".join(str(m) for m in sorted(marcas)),
                     str(ordenes), str(remitos), str(facturas), str(presupuestos)])


def test_el_detalle_cuenta_el_historial_que_se_perderia(api, marca_con_historial):
    c = marca_con_historial
    d = api.get(f"/api/razones-sociales/{c['origen']['id']}").json()
    assert d["historial"] == {"ordenes": 1, "remitos": 1, "facturas": 1, "presupuestos": 1}


def test_borrar_marcas_borra_marcas_ordenes_y_remitos(api, db_session, marca_con_historial):
    from models import Cliente, Factura, OrdenTrabajo, Presupuesto, Remito
    c = marca_con_historial
    r = api.delete(f"/api/razones-sociales/{c['origen']['id']}", params={"marcas": "borrar", "confirmado": _confirmado(c["marcas"], 1, 1, 1, 1)})
    assert r.status_code == 200, r.text
    assert r.json() == {"accion": "borrar", "marcas": 2, "destino": None}

    db_session.expire_all()
    assert db_session.query(Cliente).filter(Cliente.id.in_(c["marcas"])).count() == 0
    assert db_session.get(OrdenTrabajo, c["orden"]) is None
    assert db_session.get(Remito, c["remito"]) is None
    # Un presupuesto sin cliente no sirve y, si estaba convertido, quedaba trabado
    # para siempre (no se podía editar ni borrar): se va con la marca.
    assert db_session.get(Presupuesto, c["presupuesto"]) is None
    # La factura no se borra (es plata): queda, pero sin cliente.
    factura = db_session.get(Factura, c["factura"])
    assert factura is not None and factura.cliente_id is None


def test_borrar_marcas_queda_auditado_con_lo_que_se_perdio(api, db_session, marca_con_historial):
    from models import AuditLog
    c = marca_con_historial
    antes = _ultima_auditoria(db_session)
    api.delete(f"/api/razones-sociales/{c['origen']['id']}", params={"marcas": "borrar", "confirmado": _confirmado(c["marcas"], 1, 1, 1, 1)})
    db_session.expire_all()
    fila = (db_session.query(AuditLog)
            .filter(AuditLog.id > antes, AuditLog.entidad == "cliente", AuditLog.entidad_id == c["marcas"][0],
                    AuditLog.accion == "eliminar")
            .one())
    assert fila.datos["historial"] == {"ordenes": 1, "remitos": 1, "facturas": 1, "presupuestos": 1}
    assert fila.datos["marca"] == "PYTEST BORRAR MARCA UNO"


def test_borrar_marcas_sin_confirmar_lo_que_se_vio_se_rechaza(api, marca_con_historial):
    c = marca_con_historial
    r = api.delete(f"/api/razones-sociales/{c['origen']['id']}", params={"marcas": "borrar"})
    assert r.status_code == 400, r.text
    assert api.get(f"/api/razones-sociales/{c['origen']['id']}").status_code == 200


def test_si_cambio_lo_que_se_iba_a_borrar_no_se_borra_nada(api, db_session, marca_con_historial):
    """El diálogo mostró 0 órdenes; mientras tanto alguien cargó una. No se puede
    borrar algo que el usuario no vio en el aviso."""
    from models import Cliente
    c = marca_con_historial
    r = api.delete(f"/api/razones-sociales/{c['origen']['id']}",
                   params={"marcas": "borrar", "confirmado": _confirmado(c["marcas"], 0, 1, 1, 1)})
    assert r.status_code == 409, r.text
    assert "cambió" in r.json()["detail"].lower()
    db_session.expire_all()
    assert db_session.query(Cliente).filter(Cliente.id.in_(c["marcas"])).count() == 2


# ── El N° que conservan las marcas sueltas sigue protegido ──────────────────

def test_no_se_puede_crear_otra_razon_social_con_el_numero_de_las_desvinculadas(api, db_session, origen_con_datos):
    c = origen_con_datos
    _desvincular(api, c)
    r = api.post("/api/razones-sociales", json={"razon_social": "PYTEST HERENCIA OTRA EMPRESA", "numero": 772001})
    assert r.status_code == 409, r.text
    assert "PYTEST HERENCIA MARCA" in r.json()["detail"], "dice qué marca lo usa"


def test_no_se_puede_poner_a_otra_razon_social_el_numero_de_las_desvinculadas(api, origen_con_datos):
    c = origen_con_datos
    _desvincular(api, c)
    r = api.put(f"/api/razones-sociales/{c['destino']['id']}", json={"numero": 772001})
    assert r.status_code == 409, r.text


def test_reagrupar_las_desvinculadas_y_devolverles_su_numero(api, origen_con_datos):
    """El camino para volver a juntarlas: se les asigna la razón social y recién
    ahí se le pone el N° viejo, que ya no choca con nadie."""
    c = origen_con_datos
    _desvincular(api, c)
    assert api.put(f"/api/clientes/{c['marca']}", json={"razon_social_id": c["destino"]["id"]}).status_code == 200
    r = api.put(f"/api/razones-sociales/{c['destino']['id']}", json={"numero": 772001})
    assert r.status_code == 200, r.text
    assert api.get(f"/api/clientes/{c['marca']}").json()["id_cliente"] == 772001


def test_mismas_cantidades_pero_otras_marcas_no_se_borra(api, db_session, marca_con_historial):
    """Mientras el aviso estaba abierto, una marca se fue a otra empresa y llegó
    otra nueva: siguen siendo 2, pero la nueva nunca apareció en el aviso."""
    from models import Cliente
    c = marca_con_historial
    visto = _confirmado(c["marcas"], 1, 1, 1, 1)
    assert api.put(f"/api/clientes/{c['marcas'][1]}", json={"razon_social_id": c["destino"]["id"]}).status_code == 200
    nueva = api.post("/api/clientes", json={"marca": "PYTEST BORRAR LLEGO DESPUES", "razon_social_id": c["origen"]["id"]})
    assert nueva.status_code == 201, nueva.text
    try:
        r = api.delete(f"/api/razones-sociales/{c['origen']['id']}", params={"marcas": "borrar", "confirmado": visto})
        assert r.status_code == 409, r.text
        db_session.expire_all()
        assert db_session.get(Cliente, nueva.json()["id"]) is not None
    finally:
        api.delete(f"/api/clientes/{nueva.json()['id']}")


def test_editar_una_razon_social_sin_cambiar_su_numero_no_choca_con_un_cliente_suelto(api, db_session):
    """El formulario siempre manda el N° actual. Si un cliente suelto viejo (p. ej.
    un «LIBRE» de la importación) muestra ese mismo número, cambiar sólo el CUIT
    no puede quedar bloqueado."""
    from models import Cliente
    rs = api.post("/api/razones-sociales", json={"razon_social": "PYTEST NUM SIN CAMBIO SAS", "numero": 773001}).json()
    suelto = Cliente(marca="PYTEST LIBRE", id_cliente=773001)
    db_session.add(suelto)
    db_session.commit()
    try:
        r = api.put(f"/api/razones-sociales/{rs['id']}", json={"numero": 773001, "cuit": "30-12121212-1"})
        assert r.status_code == 200, r.text
    finally:
        db_session.query(Cliente).filter(Cliente.id == suelto.id).delete(synchronize_session=False)
        db_session.commit()
        _borrar_rs(db_session, rs["id"])


# ── Un borrado rechazado no puede dejar marcas bloqueadas ────────────────────

@pytest.fixture()
def sesiones_sin_cerrar(api):
    """get_db que NO cierra la sesión al terminar el request: simula el momento en
    que la respuesta ya salió pero el cierre todavía no corrió. Si el endpoint no
    suelta los bloqueos antes de responder un error, siguen tomados acá."""
    from main import app
    from core.database import get_db
    from tests.integration.conftest import _Session
    abiertas = []

    def _get_db():
        s = _Session()
        abiertas.append(s)
        yield s

    anterior = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = _get_db
    yield abiertas
    app.dependency_overrides[get_db] = anterior
    for s in abiertas:
        s.rollback()
        s.close()


def _fila_libre(db_session, cliente_id) -> bool:
    from sqlalchemy import text
    from sqlalchemy.exc import OperationalError
    try:
        db_session.execute(text("SELECT id FROM clientes WHERE id = :id FOR UPDATE NOWAIT"), {"id": cliente_id})
        return True
    except OperationalError:
        return False
    finally:
        db_session.rollback()


def test_un_borrado_rechazado_suelta_los_bloqueos_antes_de_responder(api, db_session, con_marcas, sesiones_sin_cerrar):
    """Con un solo proceso, una edición de esa marca esperando el bloqueo colgaba
    todo el backend hasta reiniciarlo."""
    c = con_marcas
    r = api.delete(f"/api/razones-sociales/{c['origen']['id']}")   # sin opción → 409
    assert r.status_code == 409, r.text
    assert _fila_libre(db_session, c["marcas"][0]), "la marca quedó bloqueada después del 409"


def test_un_borrado_con_confirmacion_vieja_tambien_suelta_los_bloqueos(api, db_session, con_marcas, sesiones_sin_cerrar):
    c = con_marcas
    r = api.delete(f"/api/razones-sociales/{c['origen']['id']}",
                   params={"marcas": "borrar", "confirmado": _confirmado([1, 2], 0, 0, 0, 0)})
    assert r.status_code == 409, r.text
    assert _fila_libre(db_session, c["marcas"][0])


def test_si_otro_tiene_la_marca_bloqueada_no_espera_para_siempre(api, db_session, con_marcas, monkeypatch):
    """Si alguien está editando una de las marcas justo en ese momento, el borrado
    se rinde enseguida con un mensaje en vez de quedarse esperando."""
    from sqlalchemy import text
    import core.bloqueos
    monkeypatch.setattr(core.bloqueos, "ESPERA_BLOQUEO", "300ms")
    c = con_marcas
    db_session.execute(text("SELECT id FROM clientes WHERE id = :id FOR UPDATE"), {"id": c["marcas"][0]})
    try:
        r = api.delete(f"/api/razones-sociales/{c['origen']['id']}", params={"marcas": "desvincular"})
        assert r.status_code == 409, r.text
        assert "otra persona" in r.json()["detail"].lower()
    finally:
        db_session.rollback()
    assert api.get(f"/api/razones-sociales/{c['origen']['id']}").status_code == 200


def test_el_borrado_no_corre_en_el_hilo_del_servidor():
    """Espera bloqueos de la base: tiene que correr en un hilo aparte (def), no en
    el único hilo que atiende a todos (async def con llamadas bloqueantes)."""
    import inspect
    from routers.razones_sociales import eliminar_razon_social
    assert not inspect.iscoroutinefunction(eliminar_razon_social)
