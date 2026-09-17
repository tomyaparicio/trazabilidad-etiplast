"""config.py — sanidad de las constantes de configuración."""


def test_secret_key_presente():
    from core.config import SECRET_KEY
    assert SECRET_KEY
    assert len(SECRET_KEY) >= 8


def test_algorithm_es_hs256():
    from core.config import ALGORITHM
    assert ALGORITHM == "HS256"


def test_expire_hours_es_entero_positivo():
    from core.config import ACCESS_TOKEN_EXPIRE_HOURS
    assert isinstance(ACCESS_TOKEN_EXPIRE_HOURS, int)
    assert ACCESS_TOKEN_EXPIRE_HOURS > 0
