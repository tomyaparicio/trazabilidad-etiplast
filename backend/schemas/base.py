"""
Schemas Pydantic v2 — Etiplast ERP
===================================
Validación de entrada para los módulos de la expansión (presupuestos, stock,
remitos, calidad) + schemas de referencia para clientes/órdenes.

Convenciones:
  - `extra="ignore"`: claves desconocidas se descartan en silencio.
  - Schemas *Update*: todos los campos opcionales (PATCH-style sobre PUT).
  - Los routers siguen devolviendo los `to_dict()` de los modelos (no se
    cambian shapes de respuesta).
"""
from datetime import date
from decimal import Decimal
from typing import Annotated, Any, List, Optional

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field


class _Schema(BaseModel):
    """Base común: ignora claves extra."""
    model_config = ConfigDict(extra="ignore")


# ──────────────────────────────────────────────────────────────────────────────
# Tipos permisivos para retrofit de clientes/órdenes.
# El frontend manda números como number|null, pero otros clientes (voz, IA,
# scripts) pueden mandar "" para un campo vacío. `_blank_to_none` normaliza ""
# a None ANTES de la validación, preservando el comportamiento defensivo que los
# routers ya tenían con `_to_float`/`_to_int` (que toleraban strings vacíos).
# ──────────────────────────────────────────────────────────────────────────────

def _blank_to_none(v: Any) -> Any:
    if isinstance(v, str) and v.strip() == "":
        return None
    return v


# Numérico laxo: acepta int/float/str-numérico, "" → None. Los routers siguen
# aplicando _to_float/_to_int, así que un int en un campo "float" no cambia nada.
OptNum = Annotated[Optional[float], BeforeValidator(_blank_to_none)]
# Id opcional: acepta int/str-numérico, "" → None.
OptId = Annotated[Optional[int], BeforeValidator(_blank_to_none)]


# ──────────────────────────────────────────────────────────────────────────────
# Presupuestos
# ──────────────────────────────────────────────────────────────────────────────
