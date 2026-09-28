"""
Bloqueos de la base sin trabar el servidor — Etiplast ERP
==========================================================
Algunos endpoints toman bloqueos a propósito: FOR UPDATE sobre una fila (stock,
razones sociales) o el advisory lock de la numeración correlativa (OT-0001, N° de
cliente…). Mientras los tienen, cualquier otro que quiera ese mismo dato espera.
Dos cosas pueden convertir esa espera en un backend colgado:

1. Responder un error SIN soltar el bloqueo. Se suelta recién al cerrar la sesión,
   y ese cierre corre DESPUÉS del endpoint (según la versión de FastAPI, incluso
   después de mandar la respuesta). Mientras tanto, el que espera ocupa un hilo y
   una conexión; con varios así, no quedan hilos para cerrar nada.
2. Esperar sin límite a que otro suelte. Una transacción trabada deja atrás una
   fila de requests que no terminan nunca.

`@con_bloqueos()` resuelve las dos: limita la espera (lock_timeout) y hace
rollback ante CUALQUIER error antes de que salga la respuesta. Va sólo en los
endpoints que toman bloqueos explícitos: en el resto no hay nada que soltar.
"""
import functools
import inspect
from contextlib import contextmanager

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

# Cuánto espera un endpoint a que otro suelte un dato. Lo normal es que un
# bloqueo dure milisegundos (lo que tarda en guardarse un alta); pasado esto, algo
# está trabado y es mejor avisarle al usuario que dejarlo mirando la pantalla.
ESPERA_BLOQUEO = "5s"

MENSAJE_OCUPADO = (
    "Otra persona está guardando cambios en estos mismos datos en este momento. "
    "Esperá unos segundos y probá de nuevo."
)

# Código de Postgres cuando se agota lock_timeout (lock_not_available).
_LOCK_NOT_AVAILABLE = "55P03"


@contextmanager
def bloqueos_acotados(db: Session, mensaje: str = MENSAJE_OCUPADO):
    """Espera acotada a los bloqueos de la transacción, y rollback si algo falla.

    `SET LOCAL` (vía set_config con is_local=true) vale hasta el commit o rollback
    de ESTA transacción: no queda pegado a la conexión cuando vuelve al pool.
    """
    # Se lee acá y no como default del parámetro: así un test puede acortarla.
    db.execute(text("SELECT set_config('lock_timeout', :espera, true)"), {"espera": ESPERA_BLOQUEO})
    try:
        yield
    except OperationalError as e:
        db.rollback()
        if getattr(e.orig, "pgcode", None) == _LOCK_NOT_AVAILABLE:
            raise HTTPException(status_code=409, detail=mensaje) from e
        raise
    except Exception:
        # También los HTTPException de validación: un 400 "stock insuficiente" se
        # decide DESPUÉS del FOR UPDATE del ítem, y no puede salir con el ítem tomado.
        db.rollback()
        raise


def con_bloqueos(mensaje: str = MENSAJE_OCUPADO):
    """Decorador para endpoints `def` que toman bloqueos (usan el parámetro `db`).

    Va DEBAJO de `@router.<método>(...)`, pegado a la función, para que FastAPI
    registre la versión envuelta. `functools.wraps` conserva la firma: FastAPI sigue
    viendo los mismos parámetros y dependencias.
    """
    def decorador(endpoint):
        # Se valida al importar: un error acá se ve al levantar, no en producción.
        if inspect.iscoroutinefunction(endpoint):
            raise TypeError(f"{endpoint.__qualname__}: con bloqueos tiene que ser `def`, no `async def`")
        if "db" not in inspect.signature(endpoint).parameters:
            raise TypeError(f"{endpoint.__qualname__}: @con_bloqueos necesita el parámetro `db`")

        @functools.wraps(endpoint)
        def envoltura(*args, **kwargs):
            # FastAPI llama a los endpoints siempre con argumentos por nombre.
            with bloqueos_acotados(kwargs["db"], mensaje):
                return endpoint(*args, **kwargs)

        envoltura.suelta_bloqueos = True
        return envoltura
    return decorador
