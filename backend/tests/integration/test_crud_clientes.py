"""Integración: CRUD completo de clientes contra Postgres real.

Prueba el ciclo entero end-to-end (endpoint → ORM → DB): crear, leer, listar,
buscar, actualizar y borrar, verificando que persiste en cada paso.
"""


def test_ciclo_crud_cliente(api):
    # ── CREATE ──
    r = api.post("/api/clientes", json={
        "marca": "PYTEST SA",
        "rubro": "Agua",
        "provincia": "Córdoba",
        "localidad": "Río Cuarto",
        "producto": "Film termocontraíble",
    })
    assert r.status_code == 201, r.text
    cli = r.json()
    cid = cli["id"]
    assert cli["marca"] == "PYTEST SA"

    # ── READ (por id) ──
    r = api.get(f"/api/clientes/{cid}")
    assert r.status_code == 200
    assert r.json()["marca"] == "PYTEST SA"
    assert r.json()["rubro"] == "Agua"

    # ── READ (listado + búsqueda) → debe aparecer ──
    r = api.get("/api/clientes", params={"search": "PYTEST SA"})
    assert r.status_code == 200
    assert any(c["id"] == cid for c in r.json()["data"])

    # ── UPDATE ──
    r = api.put(f"/api/clientes/{cid}", json={"marca": "PYTEST SA EDITADO"})
    assert r.status_code == 200
    assert r.json()["marca"] == "PYTEST SA EDITADO"
    # persiste
    assert api.get(f"/api/clientes/{cid}").json()["marca"] == "PYTEST SA EDITADO"

    # ── DELETE (requiere admin) ──
    r = api.delete(f"/api/clientes/{cid}")
    assert r.status_code == 204

    # ── verificar que ya no existe ──
    assert api.get(f"/api/clientes/{cid}").status_code == 404


def test_crear_cliente_autonumera_id_cliente(api):
    """Sin id_cliente explícito, el endpoint asigna el siguiente correlativo."""
    r = api.post("/api/clientes", json={"marca": "PYTEST AUTONUM"})
    assert r.status_code == 201, r.text
    data = r.json()
    assert isinstance(data.get("id_cliente"), int) and data["id_cliente"] > 0
    # limpieza
    api.delete(f"/api/clientes/{data['id']}")
