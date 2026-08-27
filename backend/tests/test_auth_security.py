"""routers/auth.py — hashing de contraseñas y creación de JWT."""
from jose import jwt

from config import SECRET_KEY, ALGORITHM
from routers.auth import _hash_password, _verify_password, _create_token


def test_hash_verify_roundtrip():
    h = _hash_password("secreto123")
    assert h != "secreto123"
    assert _verify_password("secreto123", h) is True


def test_verify_password_incorrecta():
    h = _hash_password("secreto123")
    assert _verify_password("otra-clave", h) is False


def test_hash_usa_bcrypt():
    # bcrypt produce hashes con prefijo $2a/$2b/$2y
    assert _hash_password("x").startswith("$2")


def test_create_token_incluye_claims():
    tok = _create_token("user@test.com", role="admin", user_id=7, nombre="Juan")
    payload = jwt.decode(tok, SECRET_KEY, algorithms=[ALGORITHM])
    assert payload["sub"] == "user@test.com"
    assert payload["role"] == "admin"
    assert payload["user_id"] == 7
    assert payload["nombre"] == "Juan"
    assert "exp" in payload


def test_create_token_defaults():
    payload = jwt.decode(_create_token("a@b.com"), SECRET_KEY, algorithms=[ALGORITHM])
    assert payload["role"] == "user"
    assert "user_id" not in payload  # no se agrega si es None
