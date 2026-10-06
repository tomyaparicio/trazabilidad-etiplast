"""Extrusión: cuánto film hay que sacar para una tirada de etiquetas.

Un solo lugar. La cuenta la muestra la pantalla mientras el operario carga la
orden, pero también la tiene que poder hacer el backend cuando la orden entra
por la API o por el agente de voz (donde no hay pantalla que calcule nada). Si
la fórmula viviera en los dos lados, tarde o temprano darían números distintos
y nadie sabría cuál creerle.

Son dos pasos y los dos se muestran:
  · `metros_crudos`             → la cuenta exacta (5.400)
  · `calcular_metros_extrusion` → lo que se extruda de verdad (5.400)
"""
from decimal import Decimal, InvalidOperation, ROUND_CEILING, ROUND_HALF_UP
from typing import Optional

# Metros de arranque, puesta a punto y recortes. Es un número FIJO: no depende
# del tamaño de la tirada.
#
# POR QUÉ 400 FIJOS Y NO UN PORCENTAJE: es la cuenta que la planta hace a mano y
# con la que pide el film. Se probó con un 5% y los números no coincidían con
# los de ellos (50.000 etiquetas de 10 cm dan 5.400, no 5.250). Manda la planta.
MARGEN_METROS_EXTRUSION = 400

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

        metros = cantidad × (alto_cm ÷ 100) + 400

    Cada etiqueta consume su ALTO de film. El alto se carga en CENTÍMETROS
    porque así viene en la ficha del producto (ej. 11,5 cm), y para pasarlo a
    metros hay que correrle la coma dos lugares a la izquierda: 11,5 → 0,115.
    Al total se le suman los 400 m de margen.

    Ejemplo real de la planta:
        50.000 etiquetas × 10 cm → 50.000 × 0,1 = 5.000 + 400 = 5.400 m

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
    metros = film + Decimal(MARGEN_METROS_EXTRUSION)
    return float(metros.quantize(_DOS_DECIMALES, rounding=ROUND_HALF_UP))


def calcular_metros_extrusion(cantidad, alto_cm) -> Optional[float]:
    """Los metros que se extrudan de verdad: la cuenta subida al metro entero.

        5.400    → 5.400   (ya es entero, no se toca)
        3.850,35 → 3.851

    SIEMPRE PARA ARRIBA, nunca para abajo: si faltan metros a mitad de la
    tirada hay que frenar la máquina. Que sobre film se guarda para la próxima;
    que falte, no se arregla.
    """
    crudos = metros_crudos(cantidad, alto_cm)
    if crudos is None:
        return None
    # ROUND_CEILING sobre Decimal y no `math.ceil` sobre float: `ceil` arrastra
    # el error binario y un 5.400,0000000000002 pediría 5.401 sin motivo.
    return float(Decimal(str(crudos)).to_integral_value(rounding=ROUND_CEILING))
