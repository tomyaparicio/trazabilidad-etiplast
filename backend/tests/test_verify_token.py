"""dependencies.py — verify_token (el guardián de autenticación).

Cubre los caminos de seguridad: sin token, prefijo inválido, token roto,
usuario inexistente, usuario inactivo y token válido. La sesión de DB se mockea.
"""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from core.security import verify_token
from routers.auth import _create_token


class _Query:
    def __init__(self, user):
        self._user = user

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self._user


class _FakeDB:
    def __init__(self, user):
        self._user = user

    def query(self, *args, **kwargs):
        return _Query(self._user)


def _raises_status(authorization, user, status):
    with pytest.raises(HTTPException) as exc:
        verify_token(authorization=authorization, db=_FakeDB(user))
    assert exc.value.status_code == status


def test_sin_token_401():
    _raises_status(None, None, 401)


def test_prefijo_no_bearer_401():
    _raises_status("Basic abc", None, 401)


def test_token_roto_401():
    _raises_status("Bearer no-es-un-jwt", None, 401)


def test_usuario_inexistente_401():
    tok = _create_token("x@test.com", user_id=1)
    _raises_status(f"Bearer {tok}", None, 401)


def test_usuario_inactivo_403():
    tok = _create_token("x@test.com", user_id=1)
    _raises_status(f"Bearer {tok}", SimpleNamespace(id=1, is_active=False), 403)


def test_token_valido_devuelve_datos():
    tok = _create_token("x@test.com", role="admin", user_id=42)
    out = verify_token(authorization=f"Bearer {tok}", db=_FakeDB(SimpleNamespace(id=42, is_active=True)))
    assert out == {"email": "x@test.com", "role": "admin", "id": 42}
