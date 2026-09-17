"""Unitarios: el freno de intentos de login va POR CUENTA.

La fuerza bruta ataca una cuenta concreta, así que ahí es donde hay que contar.
Agrupando por IP —y como todos llegan con la IP del proxy— una contraseña mal
tipeada por una persona dejaba afuera del sistema a toda la empresa.
"""
import pytest


@pytest.fixture(autouse=True)
def _limpio():
    from services.login_throttle import reiniciar
    reiniciar()
    yield
    reiniciar()


def test_permite_los_primeros_intentos():
    from services.login_throttle import registrar_intento
    for _ in range(5):
        assert registrar_intento("ana@etiplast.com", ahora=1000.0) is True


def test_corta_al_pasarse():
    from services.login_throttle import registrar_intento
    for _ in range(5):
        registrar_intento("ana@etiplast.com", ahora=1000.0)
    assert registrar_intento("ana@etiplast.com", ahora=1000.0) is False


def test_una_cuenta_bloqueada_no_afecta_a_las_demas():
    """El caso que rompía: uno se equivoca y quedan todos afuera."""
    from services.login_throttle import registrar_intento
    for _ in range(6):
        registrar_intento("ana@etiplast.com", ahora=1000.0)
    assert registrar_intento("beto@etiplast.com", ahora=1000.0) is True


def test_se_libera_pasada_la_ventana():
    from services.login_throttle import registrar_intento, VENTANA_SEG
    for _ in range(6):
        registrar_intento("ana@etiplast.com", ahora=1000.0)
    assert registrar_intento("ana@etiplast.com", ahora=1000.0 + VENTANA_SEG + 1) is True


def test_el_exito_limpia_el_contador():
    """Entrar bien no deja penalizado al usuario por sus errores previos."""
    from services.login_throttle import registrar_intento, limpiar
    for _ in range(4):
        registrar_intento("ana@etiplast.com", ahora=1000.0)
    limpiar("ana@etiplast.com")
    for _ in range(5):
        assert registrar_intento("ana@etiplast.com", ahora=1000.0) is True


def test_el_email_no_distingue_mayusculas():
    from services.login_throttle import registrar_intento
    for _ in range(5):
        registrar_intento("Ana@Etiplast.com", ahora=1000.0)
    assert registrar_intento("ana@etiplast.com", ahora=1000.0) is False
