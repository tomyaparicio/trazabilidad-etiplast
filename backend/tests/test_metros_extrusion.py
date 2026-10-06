"""La cuenta de cuántos metros de film hay que extrudar para una tirada.

Cada etiqueta consume su ALTO de film, y al total se le suman 400 metros fijos
de margen (arranque, puesta a punto y recortes). El alto se carga en
CENTÍMETROS, así que va dividido por 100: 11,5 cm → 0,115 m.

    metros = cantidad × (alto_cm ÷ 100) + 400

POR QUÉ 400 FIJOS Y NO UN PORCENTAJE: es la cuenta que hace la planta a mano y
con la que pide el film. Se probó con un 5% y los números no coincidían con los
de ellos (50.000 etiquetas de 10 cm dan 5.400, no 5.250). Manda la planta.

POR QUÉ CENTÍMETROS Y NO MILÍMETROS: los altos cargados en la ficha de producto
van de 4 a 20 (los más usados: 10, 6, 8, 15). Una etiqueta de gaseosa de 10 mm
sería del grosor de una uña; de 10 cm es una etiqueta de botella de verdad.

Vive en un solo lugar (`services.extrusion`) porque la usan la pantalla, la API
y el agente de voz, y las tres tienen que dar el MISMO número.
"""
from services.extrusion import (
    MARGEN_METROS_EXTRUSION,
    calcular_metros_extrusion,
    metros_crudos,
)


# ──────────────────────────────────────────────────────────────────────────────
# La cuenta cruda
# ──────────────────────────────────────────────────────────────────────────────

def test_el_margen_son_400_metros():
    assert MARGEN_METROS_EXTRUSION == 400


def test_el_ejemplo_real_de_la_planta():
    """50.000 etiquetas de 10 cm → 50.000 × 0,1 = 5.000 + 400 = 5.400 m."""
    assert metros_crudos(50_000, 10) == 5400.0
    assert calcular_metros_extrusion(50_000, 10) == 5400.0


def test_el_margen_es_el_mismo_sin_importar_el_tamano_de_la_tirada():
    """400 fijos: no crece con la tirada, es el arranque de la máquina."""
    assert metros_crudos(10_000, 10) == 1400.0    # 1.000 + 400
    assert metros_crudos(20_000, 10) == 2400.0    # 2.000 + 400


def test_sin_cantidad_no_hay_cuenta():
    assert metros_crudos(None, 11.5) is None
    assert calcular_metros_extrusion(None, 11.5) is None


def test_sin_alto_no_hay_cuenta():
    assert metros_crudos(100_000, None) is None
    assert calcular_metros_extrusion(100_000, None) is None


def test_cantidad_o_alto_en_cero_no_dan_solo_el_margen():
    """Cero no es un dato: sin cantidad o sin alto no hay trabajo que calcular."""
    assert metros_crudos(0, 11.5) is None
    assert metros_crudos(100_000, 0) is None
    assert calcular_metros_extrusion(0, 11.5) is None


def test_numeros_negativos_se_descartan():
    assert metros_crudos(-100, 11.5) is None
    assert metros_crudos(100, -11.5) is None


def test_acepta_lo_que_llega_por_la_api_como_texto():
    """El agente de voz y los scripts mandan strings; no tienen que romper."""
    assert metros_crudos("50000", "10") == 5400.0
    assert calcular_metros_extrusion("50000", "10") == 5400.0
    assert metros_crudos("", "11.5") is None
    assert metros_crudos("mil", "11.5") is None


def test_el_crudo_redondea_a_dos_decimales_como_la_columna():
    # 3 etiquetas × 0,115 = 0,345 + 400 = 400,35
    assert metros_crudos(3, 11.5) == 400.35


def test_no_arrastra_error_de_coma_flotante():
    """0,1 + 0,2 no puede aparecer nunca en un número que firma un operario."""
    assert metros_crudos(10_000, 0.3) == 430.0


# ──────────────────────────────────────────────────────────────────────────────
# El total que se extruda: la cuenta subida al metro entero
# ──────────────────────────────────────────────────────────────────────────────

def test_los_metros_no_quedan_con_decimales():
    """Nadie pide 3.850,35 m de film: se sube al metro entero."""
    assert metros_crudos(30_003, 11.5) == 3850.35
    assert calcular_metros_extrusion(30_003, 11.5) == 3851.0


def test_una_cuenta_entera_se_queda_donde_esta():
    """1.600 clavados no se tocan: no se suma un metro porque sí."""
    assert metros_crudos(10_000, 12) == 1600.0
    assert calcular_metros_extrusion(10_000, 12) == 1600.0


def test_nunca_devuelve_menos_que_la_cuenta():
    """La regla de fondo: sobrar film se guarda, faltar frena la máquina."""
    for cantidad, alto in [(1, 11.5), (999, 7.5), (10_000, 12), (30_000, 11.5),
                           (32_608, 11.5), (100_000, 10), (250_000, 6)]:
        assert calcular_metros_extrusion(cantidad, alto) >= metros_crudos(cantidad, alto)


def test_una_tirada_minima_igual_paga_el_arranque():
    """3 etiquetas son 0,35 m de etiqueta, pero la máquina igual arranca."""
    assert calcular_metros_extrusion(3, 11.5) == 401.0
