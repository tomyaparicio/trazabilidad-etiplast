"""Integración: dos personas guardando a la vez no pueden dejar el mismo N° de cliente.

`razones_sociales.numero` no tiene UNIQUE en la base: lo único que protege al
número es la validación del endpoint. Pero validar y guardar son DOS pasos, y si
los dos guardados corren a la vez cada uno lee la base de ANTES, los dos ven el
número libre y los dos lo escriben. Queda un N° repartido entre dos empresas:
buscarlo trae clientes de las dos y en la planta nadie sabe cuál es cuál.

La defensa es el advisory lock de la numeración (`numero_cliente`, el mismo que
usa services/numeracion.py para repartir el próximo N°), tomado ANTES de validar:
el segundo espera a que el primero termine de guardar y recién ahí revisa — y ya
lo ve. Va después del bloqueo del nombre, siempre en ese orden, para que dos
guardados no puedan quedar trabados uno esperando al otro.

Cómo se reproduce acá: los endpoints se llaman de frente, cada uno con su sesión
en su propio hilo (son dos requests distintos, como en el servidor), y una
compuerta deja al primero adentro de la ventana peligrosa —ya validó, todavía no
guardó— hasta que el segundo llegue. Sin bloqueo el segundo llega y los dos
guardan; con bloqueo se queda esperando afuera, la compuerta se cansa de
esperarlo y el primero sigue solo.
"""
import threading

import pytest

PREFIJO = "PYTEST CARRERA N"

# Números altos y propios de este test: nadie más los usa, así que un choque es
# siempre el que estamos provocando.
NUMERO_EN_DISPUTA = 995001
NUMERO_A = 995011
NUMERO_B = 995012


def _limpiar(db_session):
    from models import Cliente, RazonSocial
    db_session.rollback()
    db_session.query(Cliente).filter(Cliente.marca.ilike(f"{PREFIJO}%")).delete(synchronize_session=False)
    db_session.query(RazonSocial).filter(RazonSocial.razon_social.ilike(f"{PREFIJO}%")).delete(synchronize_session=False)
    db_session.commit()


@pytest.fixture()
def limpio(api, db_session):
    _limpiar(db_session)
    yield
    _limpiar(db_session)


class _Compuerta:
    """Deja pasar al primero y lo hace esperar a que el segundo llegue hasta acá.

    Se monta sobre algo que corre DESPUÉS de validar y ANTES del commit: ahí está
    la ventana de la carrera. Si el segundo llega, es que los dos validaron contra
    la misma base vieja. Con el bloqueo puesto no llega —espera afuera—, se agota
    `ESPERA` y el primero sigue: es exactamente lo que se quiere probar.
    """
    # Más que lo que tarda un guardado y bastante menos que el lock_timeout (5 s)
    # que se le acaba al segundo si queda esperando el bloqueo.
    ESPERA = 1.5

    def __init__(self, original):
        self.original = original
        self.entro_el_primero = threading.Event()
        self.llego_el_segundo = threading.Event()
        self._candado = threading.Lock()
        self._turnos = 0

    def __call__(self, *args, **kwargs):
        with self._candado:
            self._turnos += 1
            soy_el_primero = self._turnos == 1
        if soy_el_primero:
            self.entro_el_primero.set()
            self.llego_el_segundo.wait(self.ESPERA)
        else:
            self.llego_el_segundo.set()
        return self.original(*args, **kwargs)


def _en_un_hilo(guardado):
    """Corre `guardado(db)` en su propio hilo con su propia sesión.

    Guarda lo que devolvió o el HTTPException que levantó: desde afuera se lee
    igual que la respuesta del endpoint.
    """
    from fastapi import HTTPException
    from tests.integration.conftest import _Session
    resultado = {}

    def _correr():
        db = _Session()
        try:
            resultado["datos"] = guardado(db)
        except HTTPException as e:
            resultado["status"] = e.status_code
            resultado["detail"] = e.detail
        except Exception as e:      # pragma: no cover — sólo si algo revienta de verdad
            resultado["explotó"] = repr(e)
        finally:
            db.rollback()
            db.close()

    hilo = threading.Thread(target=_correr, daemon=True)
    hilo.start()
    return hilo, resultado


def _a_la_vez(monkeypatch, primero, segundo):
    """Hace que los dos guardados se pisen y devuelve cómo le fue a cada uno.

    El segundo arranca recién cuando el primero ya está adentro de la ventana
    peligrosa: sin esto la carrera casi nunca se da y el test no probaría nada.
    """
    from services import auditoria
    compuerta = _Compuerta(auditoria.registrar)
    monkeypatch.setattr(auditoria, "registrar", compuerta)

    hilo_1, resultado_1 = _en_un_hilo(primero)
    assert compuerta.entro_el_primero.wait(10), "el primer guardado nunca llegó a la ventana peligrosa"
    hilo_2, resultado_2 = _en_un_hilo(segundo)
    for hilo in (hilo_1, hilo_2):
        hilo.join(20)
        assert not hilo.is_alive(), "un guardado quedó colgado"
    for resultado in (resultado_1, resultado_2):
        assert "explotó" not in resultado, resultado["explotó"]
    return resultado_1, resultado_2


def _con_el_numero(db_session, numero) -> list[str]:
    from models import RazonSocial
    db_session.expire_all()
    return [n for (n,) in db_session.query(RazonSocial.razon_social).filter(RazonSocial.numero == numero)]


def _rechazado(*resultados) -> list[dict]:
    return [r for r in resultados if r.get("status") is not None]


# ── El N° de una razón social ────────────────────────────────────────────────

def test_dos_ediciones_a_la_vez_no_pueden_dejar_el_mismo_numero(api, db_session, limpio, admin, monkeypatch):
    """Dos empresas distintas, las dos pasadas al mismo N° al mismo tiempo."""
    from routers.razones_sociales import actualizar_razon_social
    from schemas import RazonSocialUpdateSchema

    a = api.post("/api/razones-sociales", json={"razon_social": f"{PREFIJO} A SRL", "numero": NUMERO_A}).json()
    b = api.post("/api/razones-sociales", json={"razon_social": f"{PREFIJO} B SRL", "numero": NUMERO_B}).json()

    def _pasar_al_numero_en_disputa(rs_id):
        return lambda db: actualizar_razon_social(
            rs_id=rs_id, payload=RazonSocialUpdateSchema(numero=NUMERO_EN_DISPUTA), user=admin, db=db)

    r1, r2 = _a_la_vez(monkeypatch, _pasar_al_numero_en_disputa(a["id"]), _pasar_al_numero_en_disputa(b["id"]))

    quedaron = _con_el_numero(db_session, NUMERO_EN_DISPUTA)
    assert len(quedaron) == 1, f"el N° {NUMERO_EN_DISPUTA} quedó en {len(quedaron)} empresas: {quedaron}"
    rechazados = _rechazado(r1, r2)
    assert len(rechazados) == 1, "uno de los dos guardados tenía que rebotar"
    assert rechazados[0]["status"] == 409
    assert str(NUMERO_EN_DISPUTA) in rechazados[0]["detail"], "el error dice de qué número habla"


def test_un_alta_y_una_edicion_a_la_vez_tampoco(api, db_session, limpio, admin, monkeypatch):
    """La edición no toma el bloqueo del nombre, así que sin el de la numeración
    un alta con N° escrito a mano se le cuela por al lado."""
    from routers.razones_sociales import actualizar_razon_social, crear_razon_social
    from schemas import RazonSocialCreateSchema, RazonSocialUpdateSchema

    vieja = api.post("/api/razones-sociales", json={"razon_social": f"{PREFIJO} VIEJA SRL", "numero": NUMERO_A}).json()

    def _editar(db):
        return actualizar_razon_social(
            rs_id=vieja["id"], payload=RazonSocialUpdateSchema(numero=NUMERO_EN_DISPUTA), user=admin, db=db)

    def _crear(db):
        return crear_razon_social(
            payload=RazonSocialCreateSchema(razon_social=f"{PREFIJO} NUEVA SRL", numero=NUMERO_EN_DISPUTA),
            user=admin, db=db)

    r1, r2 = _a_la_vez(monkeypatch, _editar, _crear)

    quedaron = _con_el_numero(db_session, NUMERO_EN_DISPUTA)
    assert len(quedaron) == 1, f"el N° {NUMERO_EN_DISPUTA} quedó en {len(quedaron)} empresas: {quedaron}"
    assert len(_rechazado(r1, r2)) == 1, "uno de los dos guardados tenía que rebotar"


# ── El N° de una marca sin razón social ──────────────────────────────────────

def test_dos_altas_de_marca_con_el_mismo_numero_a_mano(api, db_session, limpio, admin, monkeypatch):
    """Sin razón social que lo aporte, el id_cliente ES el N° visible: dos altas
    simultáneas con el mismo número escrito a mano no pueden entrar las dos."""
    from models import Cliente
    from routers.clientes import crear_cliente
    from schemas import ClienteCreateSchema

    def _alta(marca):
        return lambda db: crear_cliente(
            payload=ClienteCreateSchema(marca=marca, id_cliente=NUMERO_EN_DISPUTA), user=admin, db=db)

    r1, r2 = _a_la_vez(monkeypatch, _alta(f"{PREFIJO} PRIMERA"), _alta(f"{PREFIJO} SEGUNDA"))

    db_session.expire_all()
    marcas = [m for (m,) in db_session.query(Cliente.marca).filter(Cliente.id_cliente == NUMERO_EN_DISPUTA)]
    assert len(marcas) == 1, f"el N° {NUMERO_EN_DISPUTA} quedó en {len(marcas)} marcas sueltas: {marcas}"
    rechazados = _rechazado(r1, r2)
    assert len(rechazados) == 1, "una de las dos altas tenía que rebotar"
    assert rechazados[0]["status"] == 400
    assert "Razón Social" in rechazados[0]["detail"], "el error dice adónde ir"
