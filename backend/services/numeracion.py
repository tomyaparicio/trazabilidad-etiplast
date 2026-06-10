"""
Servicio de numeración correlativa — Etiplast ERP
==================================================
Generaliza la numeración tipo OT-0001 / PRES-0001 / REM-0001 para cualquier
modelo con columna `numero`.
"""
from sqlalchemy.orm import Session


def generar_numero(db: Session, modelo, prefijo: str, ancho: int = 4) -> str:
    """
    Genera el siguiente número correlativo `{prefijo}-NNNN` para el modelo dado.

    Mismo comportamiento que el helper original de órdenes (OT-0001): lee todos
    los números existentes, toma el máximo del sufijo numérico y suma 1.
    """
    rows = db.query(modelo.numero).all()
    nums = []
    for (n,) in rows:
        try:
            nums.append(int(n.split("-")[1]))
        except Exception:
            pass
    siguiente = (max(nums) + 1) if nums else 1
    return f"{prefijo}-{siguiente:0{ancho}d}"
