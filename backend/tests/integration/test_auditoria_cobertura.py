"""Integración: qué acciones dejan rastro en la auditoría.

La auditoría solo servía para lo que ya estaba instrumentado: se veía "Eliminó
cliente" pero crear o editar uno no dejaba nada. Estos tests fijan la cobertura
de las operaciones que importan y, sobre todo, cierran el vocabulario de
acciones — que se habia desalineado entre el backend y el badge del front.
"""
import pytest

# Las únicas acciones válidas. El badge de /admin/auditoria colorea estas;
# cualquier otra cae en gris y se lee mal.
ACCIONES_VALIDAS = {"crear", "actualizar", "eliminar", "convertir", "despachar"}


@pytest.fixture()
def audit(db_session):
    """Devuelve las filas de auditoría creadas durante el test."""
    from models import AuditLog
    desde = db_session.query(AuditLog.id).order_by(AuditLog.id.desc()).first()
    corte = desde[0] if desde else 0

    def nuevas(entidad=None):
        db_session.expire_all()
        q = db_session.query(AuditLog).filter(AuditLog.id > corte)
        if entidad:
            q = q.filter(AuditLog.entidad == entidad)
        return q.order_by(AuditLog.id).all()

    return nuevas


def _acciones(filas):
    return [(f.accion, f.entidad) for f in filas]


# ─── Clientes ────────────────────────────────────────────────────────────────

def test_crear_y_editar_cliente_quedan_auditados(api, audit):
    r = api.post("/api/clientes", json={"marca": "PYTEST AUDIT CLIENTE"})
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    try:
        api.put(f"/api/clientes/{cid}", json={"marca": "PYTEST AUDIT CLIENTE B"})
        assert ("crear", "cliente") in _acciones(audit())
        assert ("actualizar", "cliente") in _acciones(audit())
    finally:
        api.delete(f"/api/clientes/{cid}")


def test_el_abm_de_presentaciones_queda_auditado(api, audit):
    r = api.post("/api/clientes", json={"marca": "PYTEST AUDIT PROD"})
    cid = r.json()["id"]
    try:
        p = api.post(f"/api/clientes/{cid}/productos", json={"nombre": "Agua x 1 lt"})
        assert p.status_code == 201, p.text
        pid = p.json()["id"]
        api.put(f"/api/clientes/{cid}/productos/{pid}", json={"lamina": "Cristal 24"})
        api.delete(f"/api/clientes/{cid}/productos/{pid}")

        hechas = _acciones(audit("cliente_producto"))
        assert ("crear", "cliente_producto") in hechas
        assert ("actualizar", "cliente_producto") in hechas
        assert ("eliminar", "cliente_producto") in hechas
    finally:
        api.delete(f"/api/clientes/{cid}")


# ─── Razones sociales ────────────────────────────────────────────────────────

def test_cambiar_el_numero_de_una_razon_social_queda_auditado(api, audit, db_session):
    """Cambiar el N° afecta a TODAS las marcas de la empresa: tiene que quedar."""
    r = api.post("/api/razones-sociales", json={"razon_social": "PYTEST AUDIT RS", "numero": 93001})
    assert r.status_code == 201, r.text
    rs_id = r.json()["id"]
    try:
        api.put(f"/api/razones-sociales/{rs_id}", json={"numero": 93002})
        filas = audit("razon_social")
        assert ("crear", "razon_social") in _acciones(filas)

        edicion = [f for f in filas if f.accion == "actualizar"]
        assert edicion, "editar la razón social tiene que auditarse"
        datos = edicion[-1].datos or {}
        assert datos.get("antes", {}).get("numero") == 93001
        assert datos.get("despues", {}).get("numero") == 93002
    finally:
        from models import RazonSocial
        db_session.query(RazonSocial).filter(RazonSocial.id == rs_id).delete()
        db_session.commit()


# ─── Roles (permisos) ────────────────────────────────────────────────────────

def test_el_abm_de_roles_queda_auditado(api, audit):
    r = api.post("/api/admin/roles", json={"nombre": "pytest audit rol", "vistas": [], "acciones": []})
    assert r.status_code in (200, 201), r.text
    rid = r.json()["id"]
    try:
        u = api.put(f"/api/admin/roles/{rid}", json={"nombre": "pytest audit rol B", "vistas": [], "acciones": []})
        assert u.status_code == 200, u.text
    finally:
        api.delete(f"/api/admin/roles/{rid}")

    hechas = _acciones(audit("rol"))
    assert ("crear", "rol") in hechas
    assert ("actualizar", "rol") in hechas
    assert ("eliminar", "rol") in hechas


# ─── Catálogos de administración ─────────────────────────────────────────────

def test_el_abm_de_rubros_queda_auditado(api, audit):
    r = api.post("/api/admin/rubros", json={"nombre": "PYTEST AUDIT RUBRO"})
    assert r.status_code in (200, 201), r.text
    rid = r.json()["id"]
    api.put(f"/api/admin/rubros/{rid}", json={"nombre": "PYTEST AUDIT RUBRO B"})
    api.delete(f"/api/admin/rubros/{rid}")

    hechas = _acciones(audit("rubro"))
    assert ("crear", "rubro") in hechas
    assert ("actualizar", "rubro") in hechas
    assert ("eliminar", "rubro") in hechas


# ─── Vocabulario ─────────────────────────────────────────────────────────────

def test_todas_las_acciones_usan_el_vocabulario_del_badge(api, audit):
    """Si el backend escribe 'editar' y el front colorea 'actualizar', la fila
    sale gris y con la etiqueta equivocada. El vocabulario queda cerrado acá."""
    cid = api.post("/api/clientes", json={"marca": "PYTEST AUDIT VOCAB"}).json()["id"]
    api.put(f"/api/clientes/{cid}", json={"marca": "PYTEST AUDIT VOCAB B"})
    api.delete(f"/api/clientes/{cid}")

    fuera = {f.accion for f in audit()} - ACCIONES_VALIDAS
    assert not fuera, f"acciones fuera del vocabulario del badge: {fuera}"


# ─── Catálogo de entidades para el filtro ────────────────────────────────────

def test_el_listado_expone_las_entidades_que_existen(api):
    """El <select> de entidades estaba hardcodeado y ya se habia desfasado:
    ofrecía "user" cuando el backend escribe "usuario", así que filtrar por
    Usuarios no devolvia nada. Ahora la lista sale de la propia tabla."""
    cid = api.post("/api/clientes", json={"marca": "PYTEST AUDIT ENTIDADES"}).json()["id"]
    api.delete(f"/api/clientes/{cid}")

    r = api.get("/api/admin/auditoria", params={"per_page": 1})
    assert r.status_code == 200, r.text
    entidades = r.json()["entidades"]
    assert "cliente" in entidades
    assert entidades == sorted(entidades), "llegan ordenadas"
    assert len(entidades) == len(set(entidades))


def test_se_puede_filtrar_por_cada_entidad_ofrecida(api):
    """Toda opción del filtro tiene que devolver algo — si no, es una opción muerta."""
    r = api.get("/api/admin/auditoria", params={"per_page": 1})
    for entidad in r.json()["entidades"]:
        res = api.get("/api/admin/auditoria", params={"entidad": entidad, "per_page": 1})
        assert res.status_code == 200
        assert res.json()["total"] > 0, f"la entidad «{entidad}» no devuelve filas"
