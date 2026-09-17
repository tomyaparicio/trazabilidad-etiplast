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


def siguiente_numero_cliente(db: Session) -> int:
    """Próximo N° de cliente libre, para una razón social nueva.

    El N° que ve y busca el usuario sale de dos lados: de la razón social, o
    —en los clientes sin razón social— del propio `id_cliente` de la marca.
    El siguiente tiene que estar libre en los DOS, si no una razón social
    nueva le robaría el número a un cliente suelto y buscarlo traería dos.

    Concurrencia: mismo advisory lock por transacción que `generar_numero`.
    Dos altas simultáneas esperan en fila en vez de llevarse el mismo número.
    """
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext('numero_cliente'))"))
    maximo = db.execute(text("""
        SELECT coalesce(max(n), 0) FROM (
            SELECT numero AS n FROM razones_sociales WHERE numero IS NOT NULL
            UNION ALL
            SELECT coalesce(rs.numero, cl.id_cliente)
            FROM clientes cl
            LEFT JOIN razones_sociales rs ON rs.id = cl.razon_social_id
        ) visibles
    """)).scalar()
    return int(maximo) + 1
