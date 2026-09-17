"""Integración: sugerencias para cargar una presentación.

Lámina, ubicación, alto y cilindro no son catálogos cerrados, pero en la
práctica se repiten los mismos valores (cilindro: 94% son 30 o 24). Ofrecerlos
al cargar evita el tipeo libre que ya nos dejó "lts", "lt" y " lts" conviviendo.
"""


def test_filtros_ofrece_los_valores_ya_usados(api):
    r = api.post("/api/clientes", json={"marca": "PYTEST OPCIONES"})
    cid = r.json()["id"]
    api.post(f"/api/clientes/{cid}/productos", json={
        "nombre": "Agua x 1 lt", "lamina": "PYTEST Cristal 99",
        "ubicacion": "PYTEST-Z9", "alto": 33, "cilindro": 77,
    })
    try:
        f = api.get("/api/dashboard/filtros")
        assert f.status_code == 200, f.text
        d = f.json()
        assert "PYTEST Cristal 99" in d["laminas"]
        assert "PYTEST-Z9" in d["ubicaciones"]
        assert 33 in d["altos"]
        assert 77 in d["cilindros"]
    finally:
        api.delete(f"/api/clientes/{cid}")


def test_las_sugerencias_vienen_por_frecuencia(api):
    """Lo más usado primero: el que carga encuentra su valor sin scrollear."""
    d = api.get("/api/dashboard/filtros").json()
    for clave in ("laminas", "ubicaciones", "altos", "cilindros"):
        assert isinstance(d[clave], list)
        assert len(d[clave]) == len(set(d[clave])), f"{clave} repite valores"
