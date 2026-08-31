"""
Servicio de numeración correlativa — Etiplast ERP
==================================================
Generaliza la numeración tipo OT-0001 / PRES-0001 / REM-0001 para cualquier
modelo con columna `numero`.
"""
from sqlalchemy import text
from sqlalchemy.orm import Session


def generar_numero(db: Session, modelo, prefijo: str, ancho: int = 4) -> str:
    """
    Genera el siguiente número correlativo `{prefijo}-NNNN` para el modelo dado.

    Concurrencia: dos requests que crean el mismo tipo de documento a la vez
    podrían leer el mismo máximo y generar números duplicados (o chocar contra la
    constraint UNIQUE y devolver 500). Para evitarlo tomamos un advisory lock a
    nivel de TRANSACCIÓN keyed por el prefijo: cualquier otro generador del mismo
    prefijo espera hasta que esta transacción haga commit/rollback. Es un lock
    lógico (no bloquea la tabla) y se libera solo al cerrar la transacción, que es
    justo cuando ya se insertó el número nuevo.

    NO cambia el formato de salida (OT-0001, PRES-0001, REM-0001).
    """
    # hashtext(text) -> int4; pg_advisory_xact_lock acepta un bigint (cast implícito).
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:prefijo))"), {"prefijo": prefijo})

    # Sólo se consideran los números con el formato propio ({prefijo}-NNNN). Si no,
    # un número cargado a mano con otro formato (ej. "0001-00000123" de una factura
    # real) contaminaba la serie y disparaba el correlativo a un valor absurdo.
    import re
    patron = re.compile(rf"^{re.escape(prefijo)}-(\d+)$")

    rows = db.query(modelo.numero).all()
    nums = []
    for (n,) in rows:
        m = patron.match((n or "").strip())
        if m:
            nums.append(int(m.group(1)))
    siguiente = (max(nums) + 1) if nums else 1
    return f"{prefijo}-{siguiente:0{ancho}d}"
