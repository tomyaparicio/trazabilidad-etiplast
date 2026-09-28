"""
Router del dashboard — Etiplast ERP
=====================================
Estadísticas y datos para filtros.
Usa las tablas de catálogo (rubros, provincias) para queries más eficientes.
"""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import extract, func
from sqlalchemy.orm import Session, joinedload

from core.database import get_db
from core.security import require_permiso, tiene_permiso, verify_token
from models import Cliente, ClienteProducto, ClienteUbicacion, Factura, OrdenTrabajo, Presupuesto, Provincia, RazonSocial, Rubro

router = APIRouter(prefix="/api", tags=["dashboard"])


def _metricas_financieras(db: Session, year: Optional[int] = None, month: Optional[int] = None) -> dict:
    """Agregados de $ para el tab Administrativo, filtrables por período.

    "Facturación" = suma de las FACTURAS emitidas (tabla `facturas`), excluyendo
    las anuladas. "Cobrado" = las facturas en estado 'cobrada'. La fecha que
    manda es `facturas.fecha` (fecha de emisión), no la de creación del registro.

    Período: sin params = histórico completo.
    `year` acota todos los agregados a ese año; `month` (requiere year) acota
    los agregados a ese mes, pero la serie mensual sigue siendo del año entero
    (así el gráfico muestra el año con el mes elegido en contexto).
    """
    from datetime import date

    # Facturas que "cuentan" como facturación (las anuladas no).
    validas = Factura.estado != "anulada"

    # Filtros de período: facturas por fecha de emisión, presupuestos por creación.
    periodo_fac, periodo_pres = [], []
    if year:
        periodo_fac.append(extract("year", Factura.fecha) == year)
        periodo_pres.append(extract("year", Presupuesto.created_at) == year)
        if month:
            periodo_fac.append(extract("month", Factura.fecha) == month)
            periodo_pres.append(extract("month", Presupuesto.created_at) == month)

    facturacion_total = (
        db.query(func.coalesce(func.sum(Factura.total), 0))
        .filter(validas, *periodo_fac)
        .scalar()
    )
    # "Completadas" pasa a significar COBRADAS (dinero efectivamente ingresado).
    facturacion_completadas = (
        db.query(func.coalesce(func.sum(Factura.total), 0))
        .filter(Factura.estado == "cobrada", *periodo_fac)
        .scalar()
    )
    ticket_promedio = (
        db.query(func.coalesce(func.avg(Factura.total), 0))
        .filter(validas, Factura.total.isnot(None), *periodo_fac)
        .scalar()
    )

    def _presu(estado: str):
        monto = (
            db.query(func.coalesce(func.sum(Presupuesto.total), 0))
            .filter(Presupuesto.estado == estado, *periodo_pres)
            .scalar()
        )
        cant = (
            db.query(func.count(Presupuesto.id))
            .filter(Presupuesto.estado == estado, *periodo_pres)
            .scalar()
        )
        return float(monto or 0), int(cant or 0)

    aprob_monto, aprob_cant = _presu("aprobado")
    pend_monto, pend_cant = _presu("enviado")

    # Tasa de aprobación: aprobados sobre presupuestos ya presentados (no borrador)
    presupuestos_total = (
        db.query(func.count(Presupuesto.id))
        .filter(Presupuesto.estado != "borrador", *periodo_pres)
        .scalar() or 0
    )
    tasa_aprobacion = round(aprob_cant / presupuestos_total * 100) if presupuestos_total else 0

    # Serie mensual para el gráfico: del año elegido (completa, con ceros) o
    # histórica (últimos 8 meses con datos) si no hay filtro.
    mes_col = func.to_char(func.date_trunc("month", Factura.fecha), "YYYY-MM")
    q_serie = db.query(
        mes_col.label("mes"),
        func.coalesce(func.sum(Factura.total), 0).label("monto"),
    ).filter(validas, Factura.fecha.isnot(None))
    if year:
        q_serie = q_serie.filter(extract("year", Factura.fecha) == year)
    filas = q_serie.group_by(mes_col).order_by(mes_col).all()
    por_mes = {f.mes: float(f.monto or 0) for f in filas}

    hoy = date.today()
    if year:
        # Año completo (hasta el mes actual si es el año en curso).
        ultimo = hoy.month if year == hoy.year else 12
        serie = [{"mes": f"{year}-{m:02d}", "monto": por_mes.get(f"{year}-{m:02d}", 0.0)} for m in range(1, ultimo + 1)]
    else:
        # Últimos 8 meses CONSECUTIVOS hasta hoy (con ceros). Antes se tomaban los
        # 8 meses "con datos", así que un mes sin facturar desaparecía del gráfico
        # y el "vs mes anterior" comparaba meses no consecutivos.
        serie = []
        for k in range(7, -1, -1):
            y, m = divmod((hoy.year * 12 + hoy.month - 1) - k, 12)
            clave = f"{y}-{m + 1:02d}"
            serie.append({"mes": clave, "monto": por_mes.get(clave, 0.0)})

    def _monto_mes(a: int, m: int) -> float:
        return float(
            db.query(func.coalesce(func.sum(Factura.total), 0))
            .filter(
                validas,
                extract("year", Factura.fecha) == a,
                extract("month", Factura.fecha) == m,
            )
            .scalar() or 0
        )

    # Variación mes-a-mes: del mes elegido vs su anterior (cruza el año si hace
    # falta); sin mes elegido, últimos dos puntos de la serie.
    facturacion_mom = None
    if year and month:
        actual = por_mes.get(f"{year}-{month:02d}", 0.0)
        previo = _monto_mes(year, month - 1) if month > 1 else _monto_mes(year - 1, 12)
        if previo:
            facturacion_mom = round((actual - previo) / previo * 100)
        elif actual:
            facturacion_mom = 100
    elif len(serie) >= 2:
        actual, previo = serie[-1]["monto"], serie[-2]["monto"]
        if previo:
            facturacion_mom = round((actual - previo) / previo * 100)
        elif actual:
            facturacion_mom = 100

    # Años con facturas emitidas (para armar el filtro en el frontend).
    anios = [
        int(r[0]) for r in
        db.query(extract("year", Factura.fecha)).distinct().order_by(extract("year", Factura.fecha).desc()).all()
        if r[0] is not None
    ]
    if hoy.year not in anios:
        anios.insert(0, hoy.year)

    return {
        "facturacion_total":             float(facturacion_total or 0),
        "facturacion_completadas":       float(facturacion_completadas or 0),
        "facturacion_mom":               facturacion_mom,
        "facturacion_mensual":           serie,
        "ticket_promedio":               round(float(ticket_promedio or 0), 2),
        "presupuestos_aprobados_monto":  aprob_monto,
        "presupuestos_pendientes_monto": pend_monto,
        "presupuestos_aprobados":        aprob_cant,
        "presupuestos_pendientes":       pend_cant,
        "presupuestos_total":            int(presupuestos_total),
        "tasa_aprobacion":               tasa_aprobacion,
        "anio":                          year,
        "mes":                           month,
        "anios_disponibles":             anios,
    }


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/dashboard/finanzas — métricas financieras filtrables por período
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/dashboard/finanzas", summary="Métricas financieras (filtrables por año y mes)")
def dashboard_finanzas(
    year: Optional[int] = Query(None, ge=2000, le=2100, description="Año a filtrar"),
    month: Optional[int] = Query(None, ge=1, le=12, description="Mes a filtrar (requiere year)"),
    _user: dict = Depends(require_permiso("facturas:ver")),
    db: Session = Depends(get_db),
):
    return _metricas_financieras(db, year=year, month=month)


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/dashboard/stats
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/dashboard/stats", summary="Estadísticas generales del sistema")
def dashboard_stats(
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    # Total de marcas (= clientes)
    total_clientes = db.query(func.count(Cliente.id)).scalar()

    # Total de razones sociales
    total_razones_sociales = db.query(func.count(RazonSocial.id)).scalar()

    # Total de productos distintos (cliente_productos)
    total_productos = db.query(func.count(ClienteProducto.id)).scalar()

    # Marcas sin razón social vinculada
    marcas_sin_rs = (
        db.query(func.count(Cliente.id))
        .filter(Cliente.razon_social_id.is_(None))
        .scalar()
    )

    # Promedio de productos por marca (solo marcas con al menos 1)
    avg_subq = (
        db.query(func.count(ClienteProducto.id).label("cnt"))
        .filter(ClienteProducto.cliente_id == Cliente.id)
        .correlate(Cliente)
        .scalar_subquery()
    )
    marcas_con_productos = (
        db.query(func.count(Cliente.id))
        .filter(avg_subq > 0)
        .scalar()
    )

    # Distribución por rubro (usando catálogo)
    rubros_query = (
        db.query(Rubro.nombre, func.count(Cliente.id).label("cantidad"))
        .outerjoin(Cliente, Cliente.rubro_id == Rubro.id)
        .group_by(Rubro.id, Rubro.nombre)
        .order_by(func.count(Cliente.id).desc())
        .all()
    )
    # Clientes sin rubro asignado
    sin_rubro = (
        db.query(func.count(Cliente.id))
        .filter(Cliente.rubro_id.is_(None))
        .scalar()
    )
    rubros = [{"nombre": nombre, "cantidad": cantidad} for nombre, cantidad in rubros_query]
    if sin_rubro:
        rubros.append({"nombre": "Sin rubro", "cantidad": sin_rubro})

    # Top 10 provincias (usando catálogo)
    provincias_query = (
        db.query(Provincia.nombre, func.count(ClienteUbicacion.id).label("cantidad"))
        .join(ClienteUbicacion, ClienteUbicacion.provincia_id == Provincia.id)
        .group_by(Provincia.id, Provincia.nombre)
        .order_by(func.count(ClienteUbicacion.id).desc())
        .limit(10)
        .all()
    )
    provincias = [{"nombre": nombre, "cantidad": cantidad} for nombre, cantidad in provincias_query]

    # ── Órdenes de Trabajo ────────────────────────────────────────────────────
    ESTADOS = ["borrador", "pendiente", "en_proceso", "completada", "cancelada"]
    ACTIVOS = ["pendiente", "en_proceso"]

    ordenes_por_estado = {}
    for estado in ESTADOS:
        ordenes_por_estado[estado] = (
            db.query(func.count(OrdenTrabajo.id))
            .filter(OrdenTrabajo.estado == estado)
            .scalar() or 0
        )

    ordenes_activas = sum(ordenes_por_estado[e] for e in ACTIVOS)

    # Últimas 8 órdenes (cualquier estado), más recientes primero
    ot_recientes = (
        db.query(OrdenTrabajo)
        .options(
            joinedload(OrdenTrabajo.cliente),
            joinedload(OrdenTrabajo.creador),
            joinedload(OrdenTrabajo.responsable),
        )
        .order_by(OrdenTrabajo.created_at.desc())
        .limit(3)
        .all()
    )
    ordenes_recientes = [
        {
            "id":                  o.id,
            "numero":              o.numero,
            "cliente_nombre":      o.cliente.marca if o.cliente else None,
            "estado":              o.estado,
            "fecha":               o.fecha.isoformat() if o.fecha else None,
            "cantidad":            o.cantidad,
            "created_at":          o.created_at.isoformat() if o.created_at else None,
            "creador_nombre":      o.creador.nombre_completo if o.creador else None,
            "responsable_nombre":  o.responsable.nombre_completo if o.responsable else None,
        }
        for o in ot_recientes
    ]

    return {
        "total_clientes":        total_clientes,
        "total_razones_sociales": total_razones_sociales,
        "total_productos":        total_productos,
        "marcas_sin_rs":          marcas_sin_rs,
        "marcas_con_productos":   marcas_con_productos,
        "rubros":                 rubros,
        "provincias":             provincias,
        # OTs
        "ordenes_activas":      ordenes_activas,
        "ordenes_por_estado":   ordenes_por_estado,
        "ordenes_recientes":    ordenes_recientes,
        # Finanzas (facturación = valor de órdenes; no es dinero cobrado)
        # Sólo para roles con permiso de facturas (la plata es admin-only).
        "finanzas":             _metricas_financieras(db) if tiene_permiso(_user, "facturas:ver", db) else None,
    }


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/dashboard/filtros
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/dashboard/filtros", summary="Opciones disponibles para filtros")
def obtener_filtros(
    _user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """
    Devuelve rubros, provincias, envases y razones sociales,
    ordenados alfabéticamente.
    """
    rubros = [
        r.nombre for r in
        db.query(Rubro).order_by(Rubro.nombre).all()
    ]
    provincias = [
        p.nombre for p in
        db.query(Provincia).order_by(Provincia.nombre).all()
    ]
    from models import Envase
    envases = [
        e.nombre for e in
        db.query(Envase).order_by(Envase.nombre).all()
    ]

    # Razones sociales: sólo las que algún cliente usa realmente (catálogo o texto
    # libre legacy), así ninguna opción del <select> devuelve una lista vacía.
    from routers.clientes import razon_social_efectiva
    efectiva = razon_social_efectiva()
    vistas: dict[str, str] = {}
    filas = (
        db.query(efectiva)
        .select_from(Cliente)
        .outerjoin(RazonSocial, RazonSocial.id == Cliente.razon_social_id)
        .filter(efectiva.isnot(None))
        .distinct()
        .all()
    )
    for (valor,) in filas:
        texto = (valor or "").strip()
        # Case-insensitive: "Acme SA" y "ACME SA" son una sola opción.
        if texto:
            vistas.setdefault(texto.upper(), texto)
    razones_sociales = sorted(vistas.values(), key=str.upper)

    # Sugerencias para cargar una presentación. No son catálogos cerrados —
    # se puede escribir uno nuevo — pero en la práctica se repiten siempre los
    # mismos, así que se ofrecen ordenados por uso. Es lo que evita que
    # convivan "lts", "lt" y " lts" por tipear a mano.
    def _mas_usados(col, limite=60):
        filas = (
            db.query(col, func.count(ClienteProducto.id).label("n"))
            .filter(col.isnot(None))
            .group_by(col)
            .order_by(func.count(ClienteProducto.id).desc())
            .limit(limite)
            .all()
        )
        vistos, salida = set(), []
        for valor, _ in filas:
            v = valor.strip() if isinstance(valor, str) else valor
            if v in ("", None) or v in vistos:
                continue
            vistos.add(v)
            salida.append(v)
        return salida

    return {
        "rubros": rubros,
        "provincias": provincias,
        "envases": envases,
        "razones_sociales": razones_sociales,
        "laminas":     _mas_usados(ClienteProducto.lamina),
        "ubicaciones": _mas_usados(ClienteProducto.ubicacion),
        "altos":       [float(a) for a in _mas_usados(ClienteProducto.alto, 20)],
        "cilindros":   [float(c) for c in _mas_usados(ClienteProducto.cilindro, 20)],
    }
