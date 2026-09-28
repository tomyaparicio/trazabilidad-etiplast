"""El servidor no se puede trabar por una consulta lenta.

Hay UN solo proceso de uvicorn. FastAPI corre los `async def` en el hilo del event
loop, el mismo que atiende a TODOS los requests, y SQLAlchemy acá es sincrónico:
una consulta lenta, una conexión fría de Railway o una espera de bloqueo adentro
de un `async def` frenaba a todo el mundo (hubo un cuelgue que sólo se destrabó
con kill -9). Con `def`, FastAPI lo corre en un hilo aparte y el resto sigue
atendiendo.

Estos tests no tocan la base: miran cómo está armada la app.
"""
import inspect

from fastapi.routing import APIRoute

# Endpoints (método, ruta) que PUEDEN ser `async def` aunque usen la base, con el
# motivo. Vacía a propósito: sumar uno tiene que ser una decisión explícita.
EXCEPCIONES: dict[tuple[str, str], str] = {}

# Endpoints que toman bloqueos explícitos (FOR UPDATE o pg_advisory_xact_lock) y
# por eso tienen que soltarlos antes de responder un error. Revisado caso por caso.
CON_BLOQUEOS: dict[tuple[str, str], str] = {
    ("POST", "/api/facturas"): "numeración FC (advisory lock)",
    ("POST", "/api/ordenes"): "numeración OT (advisory lock)",
    ("POST", "/api/presupuestos"): "numeración PRES (advisory lock)",
    ("POST", "/api/presupuestos/{presupuesto_id}/convertir"): "numeración OT (advisory lock)",
    ("POST", "/api/remitos"): "numeración REM (advisory lock)",
    ("POST", "/api/remitos/{remito_id}/despachar"): "egresos de stock (FOR UPDATE del ítem)",
    ("POST", "/api/stock"): "stock inicial (FOR UPDATE del ítem)",
    ("POST", "/api/stock/{item_id}/movimientos"): "movimiento (FOR UPDATE del ítem)",
    ("POST", "/api/clientes"): "N° de cliente (advisory lock)",
    ("PUT", "/api/clientes/{cliente_id}"): "razón social nueva con N° (advisory lock)",
    ("POST", "/api/razones-sociales"): "nombre y N° de cliente (advisory locks)",
    ("PUT", "/api/razones-sociales/{rs_id}"): "nombre y N° de cliente (advisory locks)",
    ("DELETE", "/api/razones-sociales/{rs_id}"): "razón social y sus marcas (FOR UPDATE)",
}


def _rutas():
    from main import app
    return [r for r in app.routes if isinstance(r, APIRoute)]


def _es_corrutina(call) -> bool:
    """Lo que FastAPI correría en el hilo del event loop en vez de en un hilo aparte."""
    candidatos = (call, getattr(call, "__call__", None))   # también clases con __call__ async
    return any(inspect.iscoroutinefunction(c) or inspect.isasyncgenfunction(c) for c in candidatos)


def _usa_la_base(dependant) -> bool:
    from core.database import get_db
    return any(d.call is get_db or _usa_la_base(d) for d in dependant.dependencies)


def _eslabones_async_con_base(dependant, nombre: str):
    """Cada función de la cadena (endpoint o dependencia) que es async y usa la base."""
    from core.database import get_db
    malos = []
    if _es_corrutina(dependant.call) and (dependant.call is get_db or _usa_la_base(dependant)):
        malos.append(nombre)
    for d in dependant.dependencies:
        malos += _eslabones_async_con_base(d, getattr(d.call, "__qualname__", repr(d.call)))
    return malos


def test_la_revision_encuentra_los_endpoints_que_usan_la_base():
    """Si el recorrido no viera la base, el test de abajo pasaría sin revisar nada."""
    con_base = {(m, r.path) for r in _rutas() if _usa_la_base(r.dependant) for m in r.methods}
    assert len(con_base) > 50
    assert ("GET", "/api/clientes") in con_base
    assert ("POST", "/auth/login") in con_base


def test_ningun_endpoint_que_usa_la_base_corre_en_el_hilo_del_servidor():
    problemas = []
    for r in _rutas():
        if any((m, r.path) in EXCEPCIONES for m in r.methods):
            continue
        for eslabon in _eslabones_async_con_base(r.dependant, r.endpoint.__qualname__):
            problemas.append(f"{'/'.join(sorted(r.methods))} {r.path} → {eslabon}")
    assert not problemas, (
        "Estos son `async def` y usan la base (bloqueante): pasalos a `def`.\n  "
        + "\n  ".join(sorted(set(problemas)))
    )


def test_las_excepciones_existen_y_dicen_por_que():
    rutas = {(m, r.path) for r in _rutas() for m in r.methods}
    for clave, motivo in EXCEPCIONES.items():
        assert clave in rutas, f"{clave} ya no existe: sacala de EXCEPCIONES"
        assert motivo.strip(), f"{clave} necesita el motivo de la excepción"


def test_las_dependencias_de_seguridad_no_corren_en_el_hilo_del_servidor():
    """Consultan la base en CADA request: si fueran async, trabarían todo."""
    from core.database import get_db
    from core.security import require_permiso, verify_admin, verify_token
    for dep in (get_db, verify_token, verify_admin, require_permiso("clientes:ver")):
        assert not _es_corrutina(dep), f"{dep.__qualname__} no puede ser async"


def test_los_endpoints_con_bloqueos_los_sueltan_antes_de_responder():
    endpoints = {(m, r.path): r.endpoint for r in _rutas() for m in r.methods}
    faltan = []
    for clave, motivo in CON_BLOQUEOS.items():
        assert clave in endpoints, f"{clave} ya no existe: actualizá CON_BLOQUEOS"
        if not getattr(endpoints[clave], "suelta_bloqueos", False):
            faltan.append(f"{clave[0]} {clave[1]} ({motivo})")
    assert not faltan, "Toman bloqueos y no usan @con_bloqueos:\n  " + "\n  ".join(faltan)


# ── Pool de conexiones ────────────────────────────────────────────────────────

def _hilos_del_servidor() -> int:
    """Cuántos endpoints `def` corren a la vez: el límite de hilos de anyio."""
    import anyio
    import anyio.to_thread

    async def _limite():
        return anyio.to_thread.current_default_thread_limiter().total_tokens
    return int(anyio.run(_limite))


def test_el_pool_tiene_una_conexion_para_cada_hilo():
    """Si hay menos conexiones que hilos, los hilos esperan una conexión sin que la
    base esté ocupada. Con psycopg2 no se conecta hasta usarlo: no toca ninguna base."""
    from core.database import crear_engine
    engine = crear_engine("postgresql+psycopg2://nadie:nada@localhost:1/ninguna")
    try:
        maximo = engine.pool.size() + engine.pool._max_overflow
        assert maximo >= _hilos_del_servidor()
        # Railway admite ~100 conexiones y en un deploy conviven la instancia vieja y
        # la nueva: entre las dos tienen que dejar lugar para migrate.py y un psql.
        assert 2 * maximo <= 90
        # Si alguna vez se agota, que falle rápido con un error y no congele el hilo.
        assert engine.pool.timeout() <= 10
        assert engine.pool._pre_ping
    finally:
        engine.dispose()


def test_el_engine_de_sqlite_de_los_tests_sigue_armandose():
    """SQLite en memoria no acepta las opciones de pool de Postgres."""
    from core.database import crear_engine
    engine = crear_engine("sqlite:///:memory:")
    engine.dispose()
