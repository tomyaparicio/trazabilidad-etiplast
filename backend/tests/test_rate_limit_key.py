"""Unitarios: a quién agrupa el rate limiter.

El navegador nunca habla con el backend: pasa por el proxy de Vercel, que no
reenvía la IP del usuario. Agrupando por IP, TODA la empresa compartía un solo
balde de 120/min. La identidad correcta es la del token, que viene firmada.
"""
from types import SimpleNamespace

import pytest
from jose import jwt

from core.config import ALGORITHM, SECRET_KEY


def _request(token: str | None = None, xff: str | None = None, ip: str = "1.2.3.4"):
    headers = {}
    if token:
        headers["authorization"] = f"Bearer {token}"
    if xff:
        headers["x-forwarded-for"] = xff
    return SimpleNamespace(headers=headers, client=SimpleNamespace(host=ip))


def _token(sub: str) -> str:
    return jwt.encode({"sub": sub}, SECRET_KEY, algorithm=ALGORITHM)


def test_dos_usuarios_detras_del_mismo_proxy_no_comparten_balde():
    """El caso real: todos llegan con la IP de Vercel, pero son personas distintas."""
    from core.middleware import clave_rate_limit
    a = clave_rate_limit(_request(_token("ana@etiplast.com"), xff="10.0.0.1"))
    b = clave_rate_limit(_request(_token("beto@etiplast.com"), xff="10.0.0.1"))
    assert a != b, "cada usuario con su propio límite"
    assert "ana@etiplast.com" in a


def test_sin_token_cae_a_la_ip():
    """Las rutas públicas (login) no tienen usuario todavía."""
    from core.middleware import clave_rate_limit
    clave = clave_rate_limit(_request(None, ip="9.9.9.9"))
    assert "9.9.9.9" in clave


def test_un_token_invalido_no_rompe_ni_da_privilegio():
    """Un token basura no debe tirar la petición ni permitir evadir el límite."""
    from core.middleware import clave_rate_limit
    clave = clave_rate_limit(_request("no-es-un-token", ip="9.9.9.9"))
    assert "9.9.9.9" in clave


def test_no_se_puede_falsificar_la_identidad_con_un_token_sin_firmar():
    """Firmado con otra clave: se ignora y se cae a la IP."""
    from core.middleware import clave_rate_limit
    falso = jwt.encode({"sub": "admin@etiplast.com"}, "clave-equivocada", algorithm=ALGORITHM)
    clave = clave_rate_limit(_request(falso, ip="9.9.9.9"))
    assert "admin@etiplast.com" not in clave
    assert "9.9.9.9" in clave
