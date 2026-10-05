"""La cuenta de cuántos metros de film hay que extrudar para una tirada.

Cada etiqueta consume su ALTO de film, y al total se le suma un 5% de margen
(arranque, puesta a punto y recortes). El alto se carga en CENTÍMETROS, así que
va dividido por 100: 11,5 cm → 0,115 m.

    metros = cantidad × (alto_cm ÷ 100) × 1,05

POR QUÉ UN PORCENTAJE Y NO METROS FIJOS: antes eran 400 m fijos más un redondeo
al próximo mil. En tiradas chicas eso duplicaba el pedido (1.200 m de film
terminaban siendo 2.000). El margen tiene que crecer con el trabajo, no ser un
número suelto.

POR QUÉ CENTÍMETROS Y NO MILÍMETROS: los altos cargados en la ficha de producto
van de 4 a 20 (los más usados: 10, 6, 8, 15). Una etiqueta de gaseosa de 10 mm
sería del grosor de una uña; de 10 cm es una etiqueta de botella de verdad.

Vive en un solo lugar (`services.extrusion`) porque la usan la pantalla, la API
y el agente de voz, y las tres tienen que dar el MISMO número.
"""
from services.extrusion import (
    MARGEN_EXTRUSION,
    calcular_metros_extrusion,
    metros_crudos,
)


# ──────────────────────────────────────────────────────────────────────────────
# La cuenta cruda
# ──────────────────────────────────────────────────────────────────────────────

def test_el_margen_es_del_cinco_por_ciento():
    assert float(MARGEN_EXTRUSION) == 0.05


def test_el_ejemplo_real_de_la_planta():
    """10.000 etiquetas de 12 cm → 10.000 × 0,12 = 1.200 + 5% = 1.260 m."""
    assert metros_crudos(10_000, 12) == 1260.0
    assert calcular_metros_extrusion(10_000, 12) == 1260.0


def test_el_margen_se_aplica_sobre_el_film_y_no_es_un_numero_suelto():
    """El doble de etiquetas es el doble de margen: crece con el trabajo."""
    assert metros_crudos(10_000, 10) == 1050.0    # 1.000 + 5%
    assert metros_crudos(20_000, 10) == 2100.0    # 2.000 + 5%


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
    assert metros_crudos("10000", "12") == 1260.0
    assert calcular_metros_extrusion("10000", "12") == 1260.0
    assert metros_crudos("", "11.5") is None
    assert metros_crudos("mil", "11.5") is None


def test_el_crudo_redondea_a_dos_decimales_como_la_columna():
    # 30.000 × 0,115 = 3.450 + 5% = 3.622,50
    assert metros_crudos(30_000, 11.5) == 3622.5


def test_no_arrastra_error_de_coma_flotante():
    """0,1 + 0,2 no puede aparecer nunca en un número que firma un operario."""
    assert metros_crudos(10_000, 0.3) == 31.5


# ──────────────────────────────────────────────────────────────────────────────
# El total que se extruda: la cuenta subida al metro entero
# ──────────────────────────────────────────────────────────────────────────────

def test_los_metros_no_quedan_con_decimales():
    """Nadie pide 3.622,50 m de film: se sube al metro entero."""
    assert metros_crudos(30_000, 11.5) == 3622.5
    assert calcular_metros_extrusion(30_000, 11.5) == 3623.0


def test_una_cuenta_entera_se_queda_donde_esta():
    """1.260 clavados no se tocan: no se suma un metro porque sí."""
    assert calcular_metros_extrusion(10_000, 12) == 1260.0


def test_nunca_devuelve_menos_que_la_cuenta():
    """La regla de fondo: sobrar film se guarda, faltar frena la máquina."""
    for cantidad, alto in [(1, 11.5), (999, 7.5), (10_000, 12), (30_000, 11.5),
                           (32_608, 11.5), (100_000, 10), (250_000, 6)]:
        assert calcular_metros_extrusion(cantidad, alto) >= metros_crudos(cantidad, alto)


def test_una_tirada_minima_da_al_menos_un_metro():
    """3 etiquetas de 11,5 cm son 0,36 m: se pide 1, no 0."""
    assert metros_crudos(3, 11.5) == 0.36
    assert calcular_metros_extrusion(3, 11.5) == 1.0
