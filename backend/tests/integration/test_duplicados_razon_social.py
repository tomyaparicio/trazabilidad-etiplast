"""Integración: «Crear» no puede dar de alta una razón social que ya existe.

En producción aparecieron duplicados como «Megaton» (N° 440, sin marcas) y
«Megaton SAS» (sin N°, con la marca), «Isacer» / «Isacer SAS» y «Manassero» /
«Mannasero». El buscador filtra con ILIKE %texto%: al escribir «Megaton SAS» no
aparece «Megaton», y lo único que se ofrece es «Crear».

Tres defensas, probadas acá:
1. Un nombre normalizado (sin tildes, puntuación ni forma societaria) para saber
   que «Megaton S.A.S.» y «MEGATON» son la misma empresa.
2. GET /similares, para preguntarle al usuario «¿es alguna de estas?» antes de crear.
3. El alta rechaza el mismo nombre; el normalizado, salvo que se confirme que es
   otra empresa (puede haber «X SA» y «X SRL» legítimas).
"""
import threading
import time

import pytest

from routers.razones_sociales import normalizar_nombre_empresa

PREFIJO = "PYTEST DUPRS"


# ── Normalización (sin base) ─────────────────────────────────────────────────

@pytest.mark.parametrize("a, b", [
    ("Megaton S.A.S.", "MEGATON"),
    ("  Isacer   SAS ", "isacer"),
    ("Lácteos Ñandú S.R.L.", "lacteos nandu"),
    ("Bahía-Jugos, S.A.", "BAHIA JUGOS"),
    ("Y.P.F. S.A.", "YPF"),
    ("Megaton S A S", "Megaton"),
])
def test_normalizar_iguala_mayusculas_tildes_puntuacion_y_espacios(a, b):
    assert normalizar_nombre_empresa(a) == normalizar_nombre_empresa(b)


@pytest.mark.parametrize("forma", [
    "SA", "S.A.", "SRL", "S.R.L.", "S.R.L", "SAS", "S.A.S.", "SH", "S.H.",
    "SCA", "S.C.A.", "SCS", "S.C.S.", "SAU", "S.A.U.", "SAIC", "S.A.I.C.",
    "Sociedad Anónima", "Sociedad de Responsabilidad Limitada",
])
def test_normalizar_saca_la_forma_societaria_del_final(forma):
    assert normalizar_nombre_empresa(f"Plasticos Norte {forma}") == "plasticos norte"


@pytest.mark.parametrize("nombre, esperado", [
    ("Casa", "casa"),               # termina en «sa» pero es parte de la palabra
    ("Fresas del Valle", "fresas del valle"),
    ("SA Plasticos", "sa plasticos"),   # sólo se saca AL FINAL
    ("Juan y Pedro SRL", "juan y pedro"),
])
def test_normalizar_no_corta_palabras_que_terminan_parecido(nombre, esperado):
    assert normalizar_nombre_empresa(nombre) == esperado


def test_normalizar_un_nombre_que_es_solo_la_forma_no_queda_vacio():
    assert normalizar_nombre_empresa("S.A.") == "sa"
    assert normalizar_nombre_empresa("   ") == ""


def test_x_sa_y_x_srl_son_el_mismo_nombre_normalizado():
    """Por eso el alta pide confirmación en vez de prohibirlo: pueden ser dos
    empresas legítimas distintas."""
    assert normalizar_nombre_empresa("Etiquetas X SA") == normalizar_nombre_empresa("Etiquetas X SRL")


# ── Fixtures ─────────────────────────────────────────────────────────────────

def _limpiar(api, db_session, ids_extra):
    from sqlalchemy import func, or_
    from models import Cliente, RazonSocial
    db_session.rollback()
    # Las marcas por la API: borrarlas a mano deja colgadas su ubicación y contacto.
    for (cid,) in db_session.query(Cliente.id).filter(Cliente.marca.like(f"{PREFIJO}%")).all():
        api.delete(f"/api/clientes/{cid}")
    db_session.expire_all()
    db_session.query(RazonSocial).filter(or_(
        func.upper(RazonSocial.razon_social).like(f"{PREFIJO}%"),
        RazonSocial.id.in_(ids_extra),
    )).delete(synchronize_session=False)
    db_session.commit()


@pytest.fixture()
def limpio(api, db_session):
    """Borra lo del prefijo antes y después. Devuelve una lista donde anotar los ids
    de las que no pueden llevar el prefijo en el nombre."""
    ids_extra = []
    _limpiar(api, db_session, ids_extra)
    yield ids_extra
    _limpiar(api, db_session, ids_extra)


def _crear(api, nombre, **extra):
    r = api.post("/api/razones-sociales", json={"razon_social": nombre, **extra})
    assert r.status_code == 201, r.text
    return r.json()


def _insertar_directo(db_session, nombre, numero=None):
    """Como quedaron los duplicados viejos de producción: la API ya no los deja crear."""
    from models import RazonSocial
    obj = RazonSocial(razon_social=nombre, numero=numero)
    db_session.add(obj)
    db_session.commit()
    return obj.id


def _similares(api, nombre):
    r = api.get("/api/razones-sociales/similares", params={"nombre": nombre})
    assert r.status_code == 200, r.text
    return r.json()


def _cantidad(db_session, nombre_normalizado):
    from models import RazonSocial
    db_session.expire_all()
    return sum(1 for (n,) in db_session.query(RazonSocial.razon_social).all()
               if normalizar_nombre_empresa(n) == nombre_normalizado)


# ── GET /api/razones-sociales/similares ──────────────────────────────────────

def test_megaton_sas_encuentra_a_megaton_con_su_numero(api, limpio):
    megaton = _crear(api, f"{PREFIJO} Megaton", numero=774401, cuit="30-77440100-1")
    res = _similares(api, f"{PREFIJO} Megaton S.A.S.")
    assert res, "tiene que ofrecer la que ya existe"
    assert res[0] == {
        "id": megaton["id"], "razon_social": f"{PREFIJO} Megaton", "numero": 774401,
        "cuit": "30-77440100-1", "cantidad_marcas": 0,
    }


def test_primero_las_de_mismo_nombre_despues_las_parecidas(api, limpio):
    """«Isacero» se parece MÁS por trigramas a «Isacer» que «Isacer SAS» (el SAS
    suma trigramas propios), pero la del mismo nombre es la que casi seguro es."""
    parecida = _crear(api, f"{PREFIJO} Isacero")
    igual = _crear(api, f"{PREFIJO} Isacer SAS")
    ids = [r["id"] for r in _similares(api, f"{PREFIJO} Isacer")]
    assert igual["id"] in ids and parecida["id"] in ids
    assert ids.index(igual["id"]) < ids.index(parecida["id"])


def test_encuentra_un_nombre_mal_escrito(api, limpio):
    manassero = _crear(api, f"{PREFIJO} Manassero")
    ids = [r["id"] for r in _similares(api, f"{PREFIJO} Mannasero")]
    assert manassero["id"] in ids


def test_no_trae_empresas_que_no_se_parecen(api, limpio):
    manassero = _crear(api, f"{PREFIJO} Manassero")
    ids = [r["id"] for r in _similares(api, "Kolynos Zapateria Central")]
    assert manassero["id"] not in ids


def test_la_del_mismo_nombre_aparece_aunque_no_se_parezca_letra_a_letra(api, limpio, db_session):
    """«Z.Q.X.W. S.A.» y «ZQXW» son el mismo nombre, pero letra a letra casi no se
    parecen (pg_trgm lee «z», «q», «x», «w» como palabras sueltas). Sin el prefijo
    en el nombre: compartirlo las haría parecidas y el test no probaría nada."""
    zqxw = _insertar_directo(db_session, "Z.Q.X.W. S.A.")
    limpio.append(zqxw)
    ids = [r["id"] for r in _similares(api, "zqxw")]
    assert zqxw in ids


def test_devuelve_como_maximo_cinco(api, limpio):
    for i in range(7):
        _crear(api, f"{PREFIJO} Cinco {i} SRL")
    assert len(_similares(api, f"{PREFIJO} Cinco")) == 5


def test_cuenta_las_marcas(api, limpio):
    rs = _crear(api, f"{PREFIJO} Con Marcas")
    for marca in ("UNO", "DOS"):
        r = api.post("/api/clientes", json={"marca": f"{PREFIJO} {marca}", "razon_social_id": rs["id"]})
        assert r.status_code == 201, r.text
    [res] = [r for r in _similares(api, f"{PREFIJO} Con Marcas SA") if r["id"] == rs["id"]]
    assert res["cantidad_marcas"] == 2


def test_con_nombre_vacio_no_trae_nada(api, limpio):
    _crear(api, f"{PREFIJO} Cualquiera")
    assert _similares(api, "   ") == []


# ── POST /api/razones-sociales ───────────────────────────────────────────────

def test_el_mismo_nombre_exacto_da_409_aunque_pida_crear_igual(api, limpio, db_session):
    _crear(api, f"{PREFIJO} Exacta SRL", numero=774402)
    for variante in (f"  {PREFIJO.lower()}   exacta srl ", f"{PREFIJO} EXACTA SRL"):
        r = api.post("/api/razones-sociales", json={"razon_social": variante, "crear_igual": True})
        assert r.status_code == 409, r.text
        assert f"«{PREFIJO} Exacta SRL»" in r.json()["detail"]
        assert "774402" in r.json()["detail"]
    assert _cantidad(db_session, normalizar_nombre_empresa(f"{PREFIJO} Exacta")) == 1


def test_el_mismo_nombre_normalizado_da_409_nombrando_la_existente_y_su_numero(api, limpio, db_session):
    _crear(api, f"{PREFIJO} Megaton", numero=774403)
    r = api.post("/api/razones-sociales", json={"razon_social": f"{PREFIJO} Megatón S.A.S."})
    assert r.status_code == 409, r.text
    detalle = r.json()["detail"]
    assert f"«{PREFIJO} Megaton»" in detalle and "774403" in detalle
    assert _cantidad(db_session, normalizar_nombre_empresa(f"{PREFIJO} Megaton")) == 1


def test_el_409_dice_que_la_existente_no_tiene_numero(api, limpio, db_session):
    _insertar_directo(db_session, f"{PREFIJO} Sin Numero SAS")
    r = api.post("/api/razones-sociales", json={"razon_social": f"{PREFIJO} Sin Numero"})
    assert r.status_code == 409, r.text
    assert f"«{PREFIJO} Sin Numero SAS»" in r.json()["detail"]
    assert "sin N°" in r.json()["detail"]


def test_crear_igual_permite_otra_empresa_con_el_mismo_nombre_normalizado(api, limpio, db_session):
    _crear(api, f"{PREFIJO} Etiquetas X SA")
    r = api.post("/api/razones-sociales", json={"razon_social": f"{PREFIJO} Etiquetas X SRL", "crear_igual": True})
    assert r.status_code == 201, r.text
    assert r.json()["razon_social"] == f"{PREFIJO} Etiquetas X SRL"


def test_un_nombre_solo_parecido_no_bloquea_el_alta(api, limpio):
    """Parecido no es igual: «Mannasero» puede ser otra empresa. Eso lo pregunta la
    pantalla con /similares; el alta sólo frena lo que es seguro el mismo nombre."""
    _crear(api, f"{PREFIJO} Manassero")
    r = api.post("/api/razones-sociales", json={"razon_social": f"{PREFIJO} Mannasero"})
    assert r.status_code == 201, r.text


def test_dos_altas_simultaneas_con_el_mismo_nombre_no_crean_dos(api, limpio, db_session, monkeypatch):
    """Dos personas tocan «Crear» a la vez: las dos revisan, ninguna ve a la otra
    (todavía no guardó) y quedan dos. La segunda tiene que esperar a la primera."""
    import anyio
    import httpx
    from main import app
    from services import auditoria

    original = auditoria.registrar
    primera = threading.Event()

    def registrar_lento(*args, **kwargs):
        # La primera alta se demora entre revisar el nombre y guardar: justo la
        # ventana en la que entra la segunda.
        if not primera.is_set():
            primera.set()
            time.sleep(0.6)
        return original(*args, **kwargs)

    monkeypatch.setattr(auditoria, "registrar", registrar_lento)
    nombre = f"{PREFIJO} Carrera SRL"
    respuestas = []

    async def _escenario():
        transporte = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transporte, base_url="http://test") as c:
            async def alta(esperar_a_la_primera):
                if esperar_a_la_primera:
                    while not primera.is_set():
                        await anyio.sleep(0.01)
                    await anyio.sleep(0.1)
                respuestas.append(await c.post("/api/razones-sociales", json={"razon_social": nombre}))

            async with anyio.create_task_group() as tg:
                tg.start_soon(alta, False)
                tg.start_soon(alta, True)

    anyio.run(_escenario)
    assert sorted(r.status_code for r in respuestas) == [201, 409], [r.text for r in respuestas]
    assert _cantidad(db_session, normalizar_nombre_empresa(nombre)) == 1


# ── PUT /api/razones-sociales/{id} ───────────────────────────────────────────

def test_renombrar_al_nombre_exacto_de_otra_da_409(api, limpio, db_session):
    _crear(api, f"{PREFIJO} Ocupado", numero=774404)
    otra = _crear(api, f"{PREFIJO} Libre")
    r = api.put(f"/api/razones-sociales/{otra['id']}", json={"razon_social": f" {PREFIJO.lower()}  ocupado "})
    assert r.status_code == 409, r.text
    assert f"«{PREFIJO} Ocupado»" in r.json()["detail"] and "774404" in r.json()["detail"]
    assert api.get(f"/api/razones-sociales/{otra['id']}").json()["razon_social"] == f"{PREFIJO} Libre"


def test_renombrar_cambiando_mayusculas_no_choca_consigo_misma(api, limpio):
    rs = _crear(api, f"{PREFIJO} Propia")
    r = api.put(f"/api/razones-sociales/{rs['id']}", json={"razon_social": f"{PREFIJO} PROPIA"})
    assert r.status_code == 200, r.text
    assert r.json()["razon_social"] == f"{PREFIJO} PROPIA"


def test_duplicados_viejos_no_bloquean_editar_otros_datos(api, limpio, db_session):
    """El formulario de edición manda siempre el nombre actual: un duplicado que ya
    estaba en producción no puede impedir corregir el CUIT o el domicilio."""
    uno = _insertar_directo(db_session, f"{PREFIJO} Vieja")
    _insertar_directo(db_session, f"{PREFIJO} VIEJA")
    r = api.put(f"/api/razones-sociales/{uno}",
                json={"razon_social": f"{PREFIJO} Vieja", "cuit": "30-77440500-1", "domicilio": "Calle 1"})
    assert r.status_code == 200, r.text
    assert r.json()["cuit"] == "30-77440500-1"
    # Ni cambiando sólo mayúsculas o espacios: sigue siendo el mismo nombre.
    r = api.put(f"/api/razones-sociales/{uno}", json={"razon_social": f"{PREFIJO}  vieja"})
    assert r.status_code == 200, r.text


def test_renombrar_a_un_nombre_solo_normalizado_igual_se_permite(api, limpio):
    """En la edición no hay dónde confirmar «es otra empresa»: se frena sólo el
    mismo nombre exacto, que nunca es legítimo."""
    _crear(api, f"{PREFIJO} Norte SA")
    otra = _crear(api, f"{PREFIJO} Sur SA")
    r = api.put(f"/api/razones-sociales/{otra['id']}", json={"razon_social": f"{PREFIJO} Norte SRL"})
    assert r.status_code == 200, r.text
