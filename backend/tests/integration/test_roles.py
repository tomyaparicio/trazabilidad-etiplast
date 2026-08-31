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
