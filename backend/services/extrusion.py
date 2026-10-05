"""Extrusión: cuánto film hay que sacar para una tirada de etiquetas.

Un solo lugar. La cuenta la muestra la pantalla mientras el operario carga la
orden, pero también la tiene que poder hacer el backend cuando la orden entra
por la API o por el agente de voz (donde no hay pantalla que calcule nada). Si
la fórmula viviera en los dos lados, tarde o temprano darían números distintos
y nadie sabría cuál creerle.

Son dos pasos y los dos se muestran:
  · `metros_crudos`             → la cuenta exacta (3.622,50)
  · `calcular_metros_extrusion` → lo que se extruda de verdad (3.623)
"""
from decimal import Decimal, InvalidOperation, ROUND_CEILING, ROUND_HALF_UP
from typing import Optional

# Margen de arranque, puesta a punto y recortes, como PROPORCIÓN de la tirada.
#
# POR QUÉ UN PORCENTAJE Y NO METROS FIJOS: antes eran 400 m fijos más un
# redondeo al próximo mil. En tiradas chicas eso casi duplicaba el pedido
# —1.200 m de film terminaban siendo 2.000— y en tiradas grandes se quedaba
# corto. El desperdicio crece con la tirada, así que el margen también.
MARGEN_EXTRUSION = Decimal("0.05")   # 5%

_CENTIMETROS_POR_METRO = Decimal(100)
_DOS_DECIMALES = Decimal("0.01")   # los mismos que guarda la columna


def _a_decimal(valor) -> Optional[Decimal]:
    """Pasa a Decimal lo que llegue (int, float, str) o None si no es un número.

    Decimal y no float: estos metros los firma un operario, así que 3.622,50
    tiene que dar 3.622,50 y no 3.622,499999999997.
    """
    if valor is None or valor == "":
        return None
    try:
        return Decimal(str(valor).strip())
    except (InvalidOperation, ValueError, TypeError):
        return None


def metros_crudos(cantidad, alto_cm) -> Optional[float]:
    """La cuenta exacta, sin subir al metro.

        metros = cantidad × (alto_cm ÷ 100) × 1,05

    Cada etiqueta consume su ALTO de film. El alto se carga en CENTÍMETROS
    porque así viene en la ficha del producto (ej. 11,5 cm), y para pasarlo a
    metros hay que correrle la coma dos lugares a la izquierda: 11,5 → 0,115.
    Al total se le suma el 5% de margen.

    Ejemplo real de la planta:
        10.000 etiquetas × 12 cm → 10.000 × 0,12 = 1.200 + 5% = 1.260 m

    Este número es el que se MUESTRA para explicar de dónde sale el total, pero
    no es el que se extruda: para eso está `calcular_metros_extrusion`.

    Devuelve None cuando falta la cantidad o el alto, o cuando alguno no es
    positivo: sin esos dos datos no hay cuenta posible y es preferible dejar la
    orden sin metros antes que guardar un número inventado.
    """
    cant = _a_decimal(cantidad)
    alto = _a_decimal(alto_cm)
    if cant is None or alto is None or cant <= 0 or alto <= 0:
        return None

    film = cant * alto / _CENTIMETROS_POR_METRO
    metros = film * (Decimal(1) + MARGEN_EXTRUSION)
    return float(metros.quantize(_DOS_DECIMALES, rounding=ROUND_HALF_UP))


def calcular_metros_extrusion(cantidad, alto_cm) -> Optional[float]:
    """Los metros que se extrudan de verdad: la cuenta subida al metro entero.

        1.260    → 1.260   (ya es entero, no se toca)
        3.622,50 → 3.623
        0,36     → 1       (una tirada mínima igual pide un metro)

    SIEMPRE PARA ARRIBA, nunca para abajo: si faltan metros a mitad de la
    tirada hay que frenar la máquina. Que sobre film se guarda para la próxima;
    que falte, no se arregla.
    """
    crudos = metros_crudos(cantidad, alto_cm)
    if crudos is None:
        return None
    # ROUND_CEILING sobre Decimal y no `math.ceil` sobre float: `ceil` arrastra
    # el error binario y un 1.260,0000000000002 pediría 1.261 sin motivo.
    return float(Decimal(str(crudos)).to_integral_value(rounding=ROUND_CEILING))
