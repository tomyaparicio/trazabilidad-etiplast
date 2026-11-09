"""Integración: el escaneo que CIERRA la orden — el 5to paso del recorrido.

Hasta acá el QR movía la orden por las tres etapas de planta (extrusión,
impresión, troquelado) y ahí se cortaba: nada en todo el backend ponía una
orden en `completada` salvo editarla a mano desde la pantalla de Órdenes. En
producción hay 3 órdenes y ninguna llegó nunca a `completada`, así que el paso
5 del tablero estaba vacío desde siempre y no había forma de medir cuánto tarda
un pedido de punta a punta.

El escaneo de `finalizado` es un escaneo MÁS del mismo QR —la ficha impresa no
cambia, la etapa se elige en la pantalla— pero no es una etapa de producción:

  - no tiene máquina,
  - no tiene `fecha_finalizado` ni `operador_finalizado` en la ficha (esas
    columnas no existen y no se crean): va a `fecha_cierre` y `operador_cierre`,
  - y la atribución de QUIÉN cerró sale del token y de ningún otro lado. Es la
    garantía por la que este endpoint existe en vez del PUT genérico.
"""
from datetime import datetime, timezone

import pytest

from models import AuditLog, Cliente, Maquina, OrdenTrabajo, PlanProduccion

MARCA = "OTCIERRE TEST SA"

# El nombre que `_nombre_de` arma con el usuario del token (fixture `admin`:
# nombre="Pytest", apellido="Admin"). Es contra ESTE valor que se compara la
# atribución del cierre, no contra «algo no vacío»: un test que sólo pide que
# haya texto pasa igual con el operario que vino en el body.
OPERARIO_DEL_TOKEN = "Pytest Admin"

MAQUINAS_TEST = [
    ("PYTEST-CI-VENUS", "Venus Cierre", "impresion", True),
]


def _limpiar(db):
    ids = [c.id for c in db.query(Cliente).filter(Cliente.marca == MARCA).all()]
    if not ids:
        return
    ot_ids = [
        o.id for o in db.query(OrdenTrabajo).filter(OrdenTrabajo.cliente_id.in_(ids)).all()
    ]
    if ot_ids:
        db.query(PlanProduccion).filter(
            PlanProduccion.orden_trabajo_id.in_(ot_ids)
        ).delete(synchronize_session=False)
        db.query(OrdenTrabajo).filter(OrdenTrabajo.id.in_(ot_ids)).delete(
            synchronize_session=False
        )
    db.query(Cliente).filter(Cliente.id.in_(ids)).delete(synchronize_session=False)
    db.commit()


@pytest.fixture()
def maquinas(db_session):
    codigos = [m[0] for m in MAQUINAS_TEST]
    db_session.query(Maquina).filter(Maquina.codigo.in_(codigos)).delete(
        synchronize_session=False
    )
    db_session.commit()
    for codigo, nombre, tipo, activa in MAQUINAS_TEST:
        db_session.add(Maquina(codigo=codigo, nombre=nombre, tipo=tipo, activa=activa))
    db_session.commit()
    filas = db_session.query(Maquina).filter(Maquina.codigo.in_(codigos)).all()
    try:
        yield {m.codigo: m.id for m in filas}
    finally:
        ids = [m.id for m in filas]
        db_session.query(PlanProduccion).filter(
            PlanProduccion.maquina_id.in_(ids)
        ).delete(synchronize_session=False)
        db_session.query(Maquina).filter(Maquina.codigo.in_(codigos)).delete(
            synchronize_session=False
        )
        db_session.commit()


@pytest.fixture()
def cliente_id(api, db_session):
    _limpiar(db_session)
    r = api.post("/api/clientes", json={"marca": MARCA})
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    try:
        yield cid
    finally:
        _limpiar(db_session)


@pytest.fixture()
def orden(api, cliente_id):
    """Una OT en borrador, como queda recién cargada desde la oficina."""
    r = api.post("/api/ordenes", json={"cliente_id": cliente_id, "cantidad": 20000})
    assert r.status_code == 201, r.text
    return r.json()


def _pases(db, orden_id):
    return (
        db.query(PlanProduccion)
        .filter(PlanProduccion.orden_trabajo_id == orden_id)
        .order_by(PlanProduccion.id)
        .all()
    )


def _recargar(db, orden_id) -> OrdenTrabajo:
    db.expire_all()
    return db.query(OrdenTrabajo).get(orden_id)


def _finalizar(api, orden_id, **body):
    return api.post(f"/api/ordenes/{orden_id}/etapa", json={"etapa": "finalizado", **body})


# ──────────────────────────────────────────────────────────────────────────────
# El cierre: la orden pasa a completada
# ──────────────────────────────────────────────────────────────────────────────

def test_escanear_finalizado_deja_la_orden_completada(api, db_session, orden):
    """El único camino del sistema para cerrar una orden sin editarla a mano."""
    r = _finalizar(api, orden["id"])
    assert r.status_code == 201, r.text
    assert r.json()["estado_orden"] == "completada"

    assert _recargar(db_session, orden["id"]).estado == "completada"


def test_el_cierre_escribe_cuando_y_quien(api, db_session, orden):
    """`fecha_cierre` + `operador_cierre`, y no las columnas de etapa."""
    antes = datetime.now(timezone.utc)
    assert _finalizar(api, orden["id"]).status_code == 201

    ot = _recargar(db_session, orden["id"])
    assert ot.fecha_cierre is not None
    # TIMESTAMPTZ y no DATE: el tablero muestra «hace cuánto» se cerró, y con
    # el día solo no se puede. Si fuera DATE esto vendría sin hora.
    assert ot.fecha_cierre >= antes.replace(microsecond=0)
    assert ot.fecha_cierre.tzinfo is not None
    assert ot.operador_cierre == OPERARIO_DEL_TOKEN


def test_el_que_cierra_sale_del_token_y_no_del_body(api, db_session, orden):
    """LA garantía de este endpoint, probada por los dos lados.

    El PUT genérico deja que el cliente mande cualquier `operador_*`; acá la
    atribución no puede salir del request. Se mandan las DOS formas de intentar
    pisarla:

      - `operador_cierre`: el nombre de la columna. `_Schema` descarta las
        claves de más, así que esta ni llega al router.
      - `operario`: una clave que el schema SÍ acepta —existe para la tablet
        compartida de las máquinas— y que en las tres etapas de planta pisa al
        usuario del token. En el cierre NO: cerrar una orden no es operar una
        máquina, es una decisión que queda firmada por la cuenta que la tomó.

    Sin el segundo caso el test pasaría igual con la atribución abierta, que es
    justo el agujero que este endpoint existe para tapar.
    """
    r = _finalizar(
        api, orden["id"],
        operador_cierre="Quien Yo Diga",
        operario="Tampoco Este",
    )
    assert r.status_code == 201, r.text

    ot = _recargar(db_session, orden["id"])
    assert ot.operador_cierre == OPERARIO_DEL_TOKEN
    assert ot.operador_cierre not in ("Quien Yo Diga", "Tampoco Este")
    # Y lo que devuelve la pantalla tiene que ser lo mismo que se guardó, o el
    # que escanea leería un nombre y la base tendría otro.
    assert r.json()["operario"] == OPERARIO_DEL_TOKEN


def test_en_las_etapas_de_planta_el_operario_del_body_si_manda(api, db_session, orden):
    """El contraste que hace que el test de arriba signifique algo.

    `operario` NO es un campo muerto: en las tres etapas de planta pisa al
    usuario del token a propósito, porque la tablet de la máquina es compartida
    y el que está ahí no es el que está logueado. Si fuera inerte en todas las
    etapas, «en el cierre no lo toma» no probaría nada.

    Vive en este archivo justamente por eso: es la otra mitad de la regla.
    """
    r = api.post(
        f"/api/ordenes/{orden['id']}/etapa",
        json={"etapa": "troquelado", "operario": "Ramón de la Troqueladora"},
    )
    assert r.status_code == 201, r.text

    ot = _recargar(db_session, orden["id"])
    assert ot.operador_troquelado == "Ramón de la Troqueladora"
    assert ot.operador_troquelado != OPERARIO_DEL_TOKEN


def test_el_cierre_no_toca_las_fechas_de_etapa(api, db_session, orden):
    """No hay `fecha_finalizado`: el `setattr(orden, f"fecha_{etapa}")` genérico
    se iría a un atributo que no es columna y el dato se perdería en silencio."""
    assert _finalizar(api, orden["id"]).status_code == 201

    ot = _recargar(db_session, orden["id"])
    assert ot.fecha_cierre is not None
    assert ot.fecha_extrusion is None
    assert ot.fecha_impresion is None
    assert ot.fecha_troquelado is None
    assert ot.operador_troquelado is None


def test_el_cierre_lo_devuelve_la_ficha_de_la_orden(api, orden):
    """El tablero y la pantalla de la orden leen por acá, así que `to_dict`
    tiene que devolver las dos columnas nuevas."""
    assert _finalizar(api, orden["id"]).status_code == 201

    d = api.get(f"/api/ordenes/{orden['id']}").json()
    assert d["fecha_cierre"]
    assert d["operador_cierre"] == OPERARIO_DEL_TOKEN


def test_una_orden_sin_cerrar_no_trae_fecha_de_cierre(api, orden):
    assert api.get(f"/api/ordenes/{orden['id']}").json()["fecha_cierre"] is None
    assert api.get(f"/api/ordenes/{orden['id']}").json()["operador_cierre"] is None


# ──────────────────────────────────────────────────────────────────────────────
# El rastro en `plan_produccion`
# ──────────────────────────────────────────────────────────────────────────────

def test_el_cierre_saca_la_orden_de_la_maquina(api, db_session, orden, maquinas):
    """La orden cerrada no puede seguir ocupando una impresora."""
    assert api.post(
        f"/api/ordenes/{orden['id']}/etapa",
        json={"etapa": "impresion", "maquina_id": maquinas["PYTEST-CI-VENUS"]},
    ).status_code == 201
    assert _pases(db_session, orden["id"])[0].estado == "en_curso"

    assert _finalizar(api, orden["id"]).status_code == 201

    db_session.expire_all()
    impresion = _pases(db_session, orden["id"])[0]
    assert impresion.etapa == "impresion"
    assert impresion.estado == "terminada"
    assert impresion.fecha_fin is not None


def test_el_cierre_deja_su_propio_pase(api, db_session, orden):
    """Para que el recorrido quede completo: el cierre también es un hecho que
    pasó, con su hora y su firma, y `plan_produccion` es donde vive el rastro."""
    assert _finalizar(api, orden["id"]).status_code == 201

    filas = _pases(db_session, orden["id"])
    assert len(filas) == 1
    assert filas[0].etapa == "finalizado"
    # Sin máquina: el cierre no se hace en ninguna.
    assert filas[0].maquina_id is None
    # Y cerrado, no `en_curso`: un pase abierto significa «la orden ESTÁ ahí
    # ahora» (ver ESTADOS_PASE), y la orden cerrada ya no está en ninguna parte.
    assert filas[0].estado == "terminada"
    assert filas[0].fecha_fin is not None
    assert filas[0].created_at is not None


def test_el_cierre_no_pide_maquina(api, db_session, orden):
    r = _finalizar(api, orden["id"])
    assert r.status_code == 201, r.text
    assert r.json()["maquina"] is None


def test_si_mandan_maquina_en_el_cierre_se_ignora(api, db_session, orden, maquinas):
    """Mismo criterio que extrusión y troquelado: guardarla sería inventar un
    dato que nadie eligió."""
    r = _finalizar(api, orden["id"], maquina_id=maquinas["PYTEST-CI-VENUS"])
    assert r.status_code == 201, r.text
    assert r.json()["maquina"] is None
    assert _pases(db_session, orden["id"])[0].maquina_id is None


def test_el_cierre_genera_el_lote_si_la_orden_no_lo_tenia(api, db_session, orden):
    assert not orden.get("lote")
    assert _finalizar(api, orden["id"]).status_code == 201
    ot = _recargar(db_session, orden["id"])
    assert ot.lote and ot.lote.startswith("L-")


# ──────────────────────────────────────────────────────────────────────────────
# Los casos de borde que hay que decidir
# ──────────────────────────────────────────────────────────────────────────────

def test_volver_a_escanear_una_completada_actualiza_el_cierre(api, db_session, orden):
    """Se permite, y manda el último escaneo.

    Escanear dos veces pasa en la planta —el segundo escaneo es un hecho real,
    alguien pasó el QR— y rechazarlo con un error sería decirle «no» a algo que
    el sistema puede explicar perfectamente. La orden ya está cerrada, así que
    el segundo escaneo no cambia el estado: refresca cuándo y quién, y deja su
    pase. Entre perder el rastro y guardarlo dos veces, se guarda.
    """
    assert _finalizar(api, orden["id"]).status_code == 201
    primero = _recargar(db_session, orden["id"]).fecha_cierre

    r = _finalizar(api, orden["id"])
    assert r.status_code == 201, r.text

    ot = _recargar(db_session, orden["id"])
    assert ot.estado == "completada"
    assert ot.fecha_cierre >= primero
    assert len(_pases(db_session, orden["id"])) == 2


def test_una_cancelada_sigue_sin_poder_escanearse(api, db_session, orden):
    """La orden que no se va a hacer tampoco se puede dar por terminada."""
    db_session.query(OrdenTrabajo).filter(OrdenTrabajo.id == orden["id"]).update(
        {"estado": "cancelada"}, synchronize_session=False
    )
    db_session.commit()

    r = _finalizar(api, orden["id"])
    assert r.status_code == 409

    ot = _recargar(db_session, orden["id"])
    assert ot.estado == "cancelada"
    assert ot.fecha_cierre is None
    assert _pases(db_session, orden["id"]) == []


def test_se_puede_cerrar_una_orden_que_nunca_entro_a_la_planta(api, db_session, orden):
    """Se PERMITE: la oficina puede cerrar algo que no pasó por máquina (una
    reimpresión de stock, un pedido que se entregó de lo que había hecho).

    Pero no pasa callado. Cerrar sin un solo escaneo de planta significa una de
    dos cosas, y las dos importan: o los operarios no escanearon —y entonces el
    tablero estuvo mintiendo todo el pedido—, o la orden nunca se produjo. El
    endpoint devuelve una `advertencia` para que la pantalla del escaneo lo
    diga en el momento, que es cuando se puede averiguar; después nadie
    distingue esa orden de una que recorrió la planta entera.
    """
    r = _finalizar(api, orden["id"])
    assert r.status_code == 201, r.text
    assert r.json()["advertencia"], "cerrar sin un solo pase tiene que avisar"

    assert _recargar(db_session, orden["id"]).estado == "completada"


def test_cerrar_una_orden_que_si_paso_por_la_planta_no_advierte_nada(
    api, orden, maquinas, admin
):
    """La orden lleva responsable y queda verificada antes del cierre: así no
    se dispara NINGUNA de las dos advertencias y se ve que la del escaneo de
    planta no salta cuando sí hubo escaneos.

    El responsable y la verificación entraron con el RF-11: sin responsable el
    cierre avisa que nadie revisó las etapas, y esa advertencia —legítima— le
    tapaba a este test lo que viene a comprobar."""
    assert api.put(
        f"/api/ordenes/{orden['id']}", json={"responsable_id": admin["id"]},
    ).status_code == 200

    assert api.post(
        f"/api/ordenes/{orden['id']}/etapa",
        json={"etapa": "impresion", "maquina_id": maquinas["PYTEST-CI-VENUS"]},
    ).status_code == 201

    assert api.post(f"/api/ordenes/{orden['id']}/verificar").status_code == 200

    assert _finalizar(api, orden["id"]).json()["advertencia"] is None


def test_las_etapas_de_planta_no_devuelven_advertencia(api, orden):
    """La advertencia es del cierre: en extrusión no significa nada."""
    r = api.post(f"/api/ordenes/{orden['id']}/etapa", json={"etapa": "extrusion"})
    assert r.status_code == 201, r.text
    assert r.json()["advertencia"] is None


# ──────────────────────────────────────────────────────────────────────────────
# Lo que sigue sin poder escanearse
# ──────────────────────────────────────────────────────────────────────────────

def test_una_etapa_invalida_sigue_rechazandose_y_el_error_nombra_las_validas(
    api, orden
):
    """El que escanea tiene que poder leer qué SÍ se puede mandar, y ahora el
    listado tiene cuatro opciones, no tres."""
    r = api.post(f"/api/ordenes/{orden['id']}/etapa", json={"etapa": "embalaje"})
    assert r.status_code == 400, r.text

    detalle = r.json()["detail"]
    for valida in ("extrusion", "impresion", "troquelado", "finalizado"):
        assert valida in detalle, detalle


def test_el_recorrido_completo_de_punta_a_punta(api, db_session, orden, maquinas):
    """Los cuatro escaneos, en orden: lo que hace el QR de una ficha real.

    Es el agujero que cierra esta tarea: antes el rastro se cortaba en
    troquelado y la orden quedaba `en_proceso` para siempre.
    """
    pasos = [
        {"etapa": "extrusion"},
        {"etapa": "impresion", "maquina_id": maquinas["PYTEST-CI-VENUS"]},
        {"etapa": "troquelado"},
        {"etapa": "finalizado"},
    ]
    for cuerpo in pasos:
        r = api.post(f"/api/ordenes/{orden['id']}/etapa", json=cuerpo)
        assert r.status_code == 201, r.text

    filas = _pases(db_session, orden["id"])
    assert [f.etapa for f in filas] == [
        "extrusion", "impresion", "troquelado", "finalizado",
    ]
    # Ningún pase abierto: la orden salió de la planta.
    assert [f.estado for f in filas] == ["terminada"] * 4

    ot = _recargar(db_session, orden["id"])
    assert ot.estado == "completada"
    assert ot.fecha_cierre is not None
    # Y la ficha de siempre quedó llena por las tres etapas de planta.
    assert ot.fecha_extrusion and ot.fecha_impresion and ot.fecha_troquelado


def test_el_cierre_queda_auditado(api, db_session, orden):
    assert _finalizar(api, orden["id"]).status_code == 201

    log = (
        db_session.query(AuditLog)
        .filter(AuditLog.entidad == "orden_trabajo", AuditLog.entidad_id == orden["id"])
        .order_by(AuditLog.id.desc())
        .first()
    )
    assert log is not None
    assert "finalizado" in (log.descripcion or "").lower()
