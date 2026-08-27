"""Tests de API con TestClient — sólo rutas que NO tocan la base de datos.

Verifican que la app levanta y que el gate de autenticación responde 401 sin
token. (Los tests de endpoints que consultan la DB requieren un Postgres de
test; ver README de tests.)
"""


def test_health_ok(client):
    r = client.get("/health")
    assert r.status_code == 200


def test_openapi_disponible(client):
    r = client.get("/openapi.json")
    assert r.status_code == 200
    assert r.json().get("openapi", "").startswith("3.")


def test_me_sin_token_401(client):
    assert client.get("/auth/me").status_code == 401


def test_me_token_invalido_401(client):
    r = client.get("/auth/me", headers={"Authorization": "Bearer token-falso"})
    assert r.status_code == 401


def test_login_body_incompleto_422(client):
    # falta 'password' → validación de FastAPI antes de tocar la DB
    r = client.post("/auth/login", json={"email": "a@b.com"})
    assert r.status_code == 422
