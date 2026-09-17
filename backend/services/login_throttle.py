"""Freno de intentos de login, POR CUENTA.

La fuerza bruta ataca una cuenta concreta: ahí es donde hay que contar. El
límite por IP que había no servía para eso —el navegador llega por el proxy de
Vercel, así que todos comparten IP— y además tenía un efecto colateral serio:
una persona que tipeaba mal su contraseña dejaba a TODA la empresa sin poder
entrar durante un minuto.

Contando por cuenta, el que se equivoca se frena a sí mismo y nadie más.

El estado vive en memoria, igual que el del rate limiter global: se reinicia con
cada deploy y no se comparte entre instancias. Alcanza para lo que protege; si
algún día hay varias instancias, esto se muda a Redis.
"""
import time
from collections import defaultdict
from typing import Optional

# 5 intentos por minuto y por cuenta: suficiente para el que se equivoca de
# tecla, corto para el que prueba contraseñas.
MAX_INTENTOS = 5
VENTANA_SEG = 60.0

_intentos: dict[str, list[float]] = defaultdict(list)


def _clave(email: str) -> str:
    return (email or "").strip().lower()


def registrar_intento(email: str, ahora: Optional[float] = None) -> bool:
    """Anota un intento fallido. Devuelve False si la cuenta ya se pasó del límite."""
    t = time.monotonic() if ahora is None else ahora
    k = _clave(email)

    # Se descartan los intentos que quedaron fuera de la ventana.
    recientes = [x for x in _intentos[k] if t - x < VENTANA_SEG]
    if len(recientes) >= MAX_INTENTOS:
        _intentos[k] = recientes
        return False

    recientes.append(t)
    _intentos[k] = recientes
    return True


def limpiar(email: str) -> None:
    """Login exitoso: el usuario no queda penalizado por sus errores previos."""
    _intentos.pop(_clave(email), None)


def reiniciar() -> None:
    """Borra todo el estado. Sólo para los tests."""
    _intentos.clear()
