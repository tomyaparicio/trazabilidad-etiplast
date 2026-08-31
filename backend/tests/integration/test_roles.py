"""Integración: RBAC — catálogo, ABM de roles, validación, protección del admin."""


def test_catalogo(api):
    r = api.get("/api/roles/catalogo")
    assert r.status_code == 200, r.text
    d = r.json()
    assert any(v["clave"] == "clientes" for v in d["vistas"])
    assert any(m["clave"] == "presupuestos" and "aprobar" in m["acciones"] for m in d["modulos"])


def test_mis_permisos_admin(api):
    r = api.get("/api/roles/mias")
    assert r.status_code == 200
    d = r.json()
    assert d["clave"] == "admin"
    assert "clientes:crear" in d["acciones"]  # admin puede todo


def test_abm_rol_con_validacion(api):
    # crear (con una acción basura que debe filtrarse)
    r = api.post("/api/admin/roles", json={
        "nombre": "Supervisor Test",
        "vistas": ["panel", "ordenes", "vista_inexistente"],
        "acciones": ["ordenes:ver", "ordenes:editar", "modulo:accion_basura"],
    })
    assert r.status_code == 201, r.text
    rol = r.json()
    rid = rol["id"]
    try:
        assert rol["clave"] == "supervisor_test"             # slug generado del nombre
        assert set(rol["acciones"]) == {"ordenes:ver", "ordenes:editar"}  # basura filtrada
        assert "vista_inexistente" not in rol["vistas"]      # vista basura filtrada

        # aparece en el listado
        assert any(x["id"] == rid for x in api.get("/api/admin/roles").json()["data"])

        # editar
        r = api.put(f"/api/admin/roles/{rid}", json={"nombre": "Supervisor 2", "vistas": ["panel"], "acciones": ["ordenes:ver"]})
        assert r.status_code == 200
        assert r.json()["nombre"] == "Supervisor 2"
        assert r.json()["vistas"] == ["panel"]
    finally:
        assert api.delete(f"/api/admin/roles/{rid}").status_code == 204


def test_no_se_puede_borrar_admin(api):
    admin_rol = next(x for x in api.get("/api/admin/roles").json()["data"] if x["clave"] == "admin")
    assert api.delete(f"/api/admin/roles/{admin_rol['id']}").status_code == 400  # protegido


def test_rol_personalizado_se_puede_asignar_a_un_usuario(api, db_session):
    """Un rol creado en /admin/roles debe poder asignarse (antes el backend
    tenía una lista fija admin/user/operario y lo rechazaba con 400)."""
    from models import Role, User

    clave, email = "administracion_test", "rol-custom@test.local"
    # Limpieza previa (idempotente)
    db_session.query(User).filter(User.email == email).delete(synchronize_session=False)
    db_session.query(Role).filter(Role.clave == clave).delete(synchronize_session=False)
    db_session.commit()

    r = api.post("/api/admin/roles", json={
        "clave": clave, "nombre": "Administración Test",
        "vistas": ["panel", "facturas"], "acciones": ["facturas:ver"],
    })
    assert r.status_code in (200, 201), r.text

    try:
        # Crear un usuario con ese rol nuevo
        r = api.post("/api/admin/usuarios", json={
            "email": email, "password": "secreto123", "nombre": "Rol", "apellido": "Custom",
            "role": clave,
        })
        assert r.status_code in (200, 201), r.text
        uid = r.json()["id"]
        assert r.json()["role"] == clave

        # Y también cambiárselo por PUT
        r = api.put(f"/api/admin/usuarios/{uid}", json={"role": "operario"})
        assert r.status_code == 200, r.text
        r = api.put(f"/api/admin/usuarios/{uid}", json={"role": clave})
        assert r.status_code == 200 and r.json()["role"] == clave

        # Un rol inexistente sigue rechazándose
        assert api.put(f"/api/admin/usuarios/{uid}", json={"role": "no_existe"}).status_code == 400
    finally:
        db_session.query(User).filter(User.email == email).delete(synchronize_session=False)
        db_session.query(Role).filter(Role.clave == clave).delete(synchronize_session=False)
        db_session.commit()
