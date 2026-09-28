"""Integración: un endpoint que toma bloqueos no puede dejar a nadie esperando.

Dos reglas, probadas con un bloqueo de fila (FOR UPDATE de un ítem de stock) y
con uno lógico (el advisory lock de la numeración de clientes):

1. Si responde un error DESPUÉS de tomar un bloqueo, lo suelta antes de responder,
   no cuando se cierra la sesión (que puede llegar más tarde).
2. Si otro tiene el dato bloqueado, se rinde a los pocos segundos con un mensaje
   claro en vez de quedarse esperando para siempre.
"""
import threading
import time
from decimal import Decimal

import pytest
from sqlalchemy import text

PREFIJO = "PYTEST NOTRABA"
CODIGO = "PYTEST-NOTRABA-1"
# Red de seguridad: si el endpoint no se rinde solo, el bloqueo se suelta a los
# 3 s para que el test falle en vez de colgar la suite.
SOLTAR_SI_O_SI_SEG = 3.0


def _limpiar(db_session):
    from models import RazonSocial, StockItem
    db_session.rollback()
    db_session.query(StockItem).filter(StockItem.codigo.like("PYTEST-NOTRABA%")).delete(synchronize_session=False)
    db_session.query(RazonSocial).filter(RazonSocial.razon_social.like(f"{PREFIJO}%")).delete(synchronize_session=False)
    db_session.commit()


@pytest.fixture()
def item(api, db_session):
    """Ítem de stock propio con 5 kg: nadie más lo toca, bloquearlo no molesta a otros tests."""
    from models import StockItem
    _limpiar(db_session)
    it = StockItem(codigo=CODIGO, nombre=f"{PREFIJO} ITEM", tipo="materia_prima",
                   unidad="kg", stock_actual=Decimal("5"), stock_minimo=Decimal("0"))
    db_session.add(it)
    db_session.commit()
    yield it.id
    _limpiar(db_session)


@pytest.fixture()
def limpiar_rs(api, db_session):
    _limpiar(db_session)
    yield
    _limpiar(db_session)


@pytest.fixture()
def sesiones_sin_cerrar(api):
    """get_db que NO cierra la sesión al terminar el request: simula que la respuesta
    ya salió pero el cierre todavía no corrió. Si el endpoint no suelta los bloqueos
    antes de responder un error, siguen tomados acá."""
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


@pytest.fixture()
def espera_corta(monkeypatch):
    import core.bloqueos
    monkeypatch.setattr(core.bloqueos, "ESPERA_BLOQUEO", "300ms")


def _fila_libre(db_session, item_id) -> bool:
    from sqlalchemy.exc import OperationalError
    try:
        db_session.execute(text("SELECT id FROM stock_items WHERE id = :id FOR UPDATE NOWAIT"), {"id": item_id})
        return True
    except OperationalError:
        return False
    finally:
        db_session.rollback()


def _numeracion_libre(db_session) -> bool:
    try:
        return bool(db_session.execute(text("SELECT pg_try_advisory_xact_lock(hashtext('numero_cliente'))")).scalar())
    finally:
        db_session.rollback()


class _OtroUsuario:
    """Otra conexión que tiene tomado un bloqueo mientras el endpoint trabaja."""

    def __init__(self, sql, params=None):
        from tests.integration.conftest import _Session
        self.s = _Session()
        self.s.execute(text(sql), params or {})
        self._timer = threading.Timer(SOLTAR_SI_O_SI_SEG, self.s.rollback)
        self._timer.start()

    def soltar(self):
        self._timer.cancel()
        self._timer.join()
        self.s.rollback()
        self.s.close()


# ── 1. Error después de bloquear: suelta antes de responder ──────────────────

def test_un_movimiento_rechazado_suelta_el_item_antes_de_responder(api, db_session, item, sesiones_sin_cerrar):
    """Egresar más de lo que hay se rechaza DESPUÉS del FOR UPDATE del ítem."""
    r = api.post(f"/api/stock/{item}/movimientos",
                 json={"stock_item_id": item, "tipo": "egreso", "cantidad": "99", "motivo": "consumo"})
    assert r.status_code == 400, r.text
    assert "insuficiente" in r.json()["detail"].lower()
    assert _fila_libre(db_session, item), "el ítem quedó bloqueado después del 400"


def test_una_falla_inesperada_tambien_suelta_la_numeracion(api, db_session, limpiar_rs, sesiones_sin_cerrar, monkeypatch):
    """Cualquier excepción después del advisory lock (acá, la auditoría) lo suelta:
    si no, nadie más podía dar de alta clientes ni razones sociales."""
    from fastapi.testclient import TestClient
    from main import app
    from services import auditoria

    def _explota(*a, **k):
        raise RuntimeError("falla simulada después de numerar")
    monkeypatch.setattr(auditoria, "registrar", _explota)

    r = TestClient(app, raise_server_exceptions=False).post(
        "/api/razones-sociales", json={"razon_social": f"{PREFIJO} FALLA SRL"})
    assert r.status_code == 500
    assert _numeracion_libre(db_session), "la numeración de clientes quedó bloqueada"


# ── 2. Si otro lo tiene bloqueado: se rinde con un mensaje ───────────────────

def test_si_otro_bloquea_el_item_el_movimiento_no_espera_para_siempre(api, db_session, item, espera_corta):
    otro = _OtroUsuario("SELECT id FROM stock_items WHERE id = :id FOR UPDATE", {"id": item})
    try:
        inicio = time.monotonic()
        r = api.post(f"/api/stock/{item}/movimientos",
                     json={"stock_item_id": item, "tipo": "ingreso", "cantidad": "1", "motivo": "compra"})
        demora = time.monotonic() - inicio
    finally:
        otro.soltar()
    assert r.status_code == 409, r.text
    assert "otra persona" in r.json()["detail"].lower()
    assert demora < SOLTAR_SI_O_SI_SEG - 0.5
    # No quedó nada a medias: el stock sigue como estaba y se puede operar.
    ok = api.post(f"/api/stock/{item}/movimientos",
                  json={"stock_item_id": item, "tipo": "ingreso", "cantidad": "1", "motivo": "compra"})
    assert ok.status_code == 201, ok.text
    assert Decimal(str(ok.json()["stock_anterior"])) == Decimal("5")


def test_un_request_esperando_un_bloqueo_no_frena_a_los_demas(api, db_session, item, monkeypatch):
    """El cuelgue original: con `async def`, la espera corría en el único hilo que
    atiende a todos y nadie más recibía respuesta hasta que terminara. Acá los dos
    requests entran a la MISMA app a la vez, como en el uvicorn de Railway."""
    import anyio
    import httpx
    import core.bloqueos
    from main import app
    monkeypatch.setattr(core.bloqueos, "ESPERA_BLOQUEO", "2s")
    fin = {}

    async def _escenario():
        transporte = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transporte, base_url="http://test") as c:
            async def lento():
                fin["lento"] = (await c.post(f"/api/stock/{item}/movimientos", json={
                    "stock_item_id": item, "tipo": "ingreso", "cantidad": "1", "motivo": "compra"}),
                    time.monotonic())

            async def rapido():
                await anyio.sleep(0.3)   # que el lento ya esté esperando el bloqueo
                fin["rapido"] = (await c.get("/api/stock/alertas"), time.monotonic())

            async with anyio.create_task_group() as tg:
                tg.start_soon(lento)
                tg.start_soon(rapido)

    otro = _OtroUsuario("SELECT id FROM stock_items WHERE id = :id FOR UPDATE", {"id": item})
    try:
        inicio = time.monotonic()
        anyio.run(_escenario)
    finally:
        otro.soltar()
    (r_lento, fin_lento), (r_rapido, fin_rapido) = fin["lento"], fin["rapido"]
    assert r_rapido.status_code == 200, r_rapido.text
    assert fin_rapido < fin_lento, "el request rápido esperó a que terminara el que estaba bloqueado"
    assert fin_rapido - inicio < 1.5
    assert r_lento.status_code == 409, r_lento.text


def test_si_otro_esta_numerando_el_alta_no_espera_para_siempre(api, db_session, limpiar_rs, espera_corta):
    """lock_timeout también corta la espera de un advisory lock."""
    otro = _OtroUsuario("SELECT pg_advisory_xact_lock(hashtext('numero_cliente'))")
    try:
        inicio = time.monotonic()
        r = api.post("/api/razones-sociales", json={"razon_social": f"{PREFIJO} ESPERA SRL"})
        demora = time.monotonic() - inicio
    finally:
        otro.soltar()
    assert r.status_code == 409, r.text
    assert "otra persona" in r.json()["detail"].lower()
    assert demora < SOLTAR_SI_O_SI_SEG - 0.5
