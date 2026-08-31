"""Integración: campo ubicacion del producto + export de clientes a Excel.

Cubre lo nuevo:
  - `ubicacion` en cliente_productos: se crea, se actualiza y persiste.
  - GET /api/clientes/export/excel: devuelve un .xlsx válido con el header
    de la planilla histórica y los datos del cliente (una fila por producto).
"""
import io

from openpyxl import load_workbook


def _crear_cliente(api, marca):
    r = api.post("/api/clientes", json={
        "marca": marca,
        "rubro": "Agua",
        "provincia": "Córdoba",
        "localidad": "Río Cuarto",
    })
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_producto_ubicacion_crud(api):
    cid = _crear_cliente(api, "PYTEST UBICACION")
    try:
        # CREATE con ubicacion
        r = api.post(f"/api/clientes/{cid}/productos", json={
            "nombre": "Agua x 500 cc",
            "envase": "Starplastic",
            "envase_codificado": "STAR-260395",
            "ubicacion": "A-3",
        })
        assert r.status_code == 201, r.text
        prod = r.json()
        assert prod["ubicacion"] == "A-3"
        pid = prod["id"]

        # UPDATE de ubicacion
        r = api.put(f"/api/clientes/{cid}/productos/{pid}", json={"ubicacion": "G-2"})
        assert r.status_code == 200, r.text
        assert r.json()["ubicacion"] == "G-2"

        # Persiste en el GET del cliente
        r = api.get(f"/api/clientes/{cid}")
        assert r.status_code == 200
        productos = r.json()["productos"]
        assert any(p["id"] == pid and p["ubicacion"] == "G-2" for p in productos)
    finally:
        api.delete(f"/api/clientes/{cid}")


def test_producto_ubicacion_flat_create_y_update(api):
    """El alta/edición 'plana' de cliente (schema pydantic) también acepta ubicacion."""
    r = api.post("/api/clientes", json={
        "marca": "PYTEST UBIC FLAT",
        "producto": "Agua x 500 cc",
        "envase_codificado": "STAR-1",
        "ubicacion": "B-9",
    })
    assert r.status_code == 201, r.text
    cli = r.json()
    cid = cli["id"]
    try:
        assert cli["productos"][0]["ubicacion"] == "B-9"

        r = api.put(f"/api/clientes/{cid}", json={"ubicacion": "C-1"})
        assert r.status_code == 200, r.text
        assert r.json()["productos"][0]["ubicacion"] == "C-1"
    finally:
        api.delete(f"/api/clientes/{cid}")


def test_export_excel_estructura_y_datos(api):
    cid = _crear_cliente(api, "PYTEST EXPORT XLSX")
    try:
        r = api.post(f"/api/clientes/{cid}/productos", json={
            "nombre": "Agua x 1,5 lt",
            "envase": "Starplastic",
            "envase_codificado": "STAR-260114",
            "ubicacion": "A-6",
            "lamina": "Blco 31",
            "alto": 8,
            "cilindro": 24,
            "cierre": 13.25,
        })
        assert r.status_code == 201, r.text

        r = api.get("/api/clientes/export/excel")
        assert r.status_code == 200, r.text
        assert r.headers["content-type"].startswith(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        assert ".xlsx" in r.headers.get("content-disposition", "")

        wb = load_workbook(io.BytesIO(r.content))
        ws = wb.active
        assert ws.title == "Clientes"
        assert ws.freeze_panes == "A2"

        # Header = planilla histórica (hoja "Editable")
        header = [c.value for c in ws[1]]
        assert header == [
            "N° Cliente", "Marca", "Razon Social", "Domicilio", "Localidad",
            "Provincia", "País", "CUIT", "Telefono", "Producto", "Muestra",
            "Alto", "Cierre", "Tipo de Envase", "Codigo Envase", "Ubicacion",
            "Lamina", "Cilindro", "Maquina", "Transporte",
        ]

        # La fila del cliente creado trae producto + ubicacion
        col = {name: i for i, name in enumerate(header)}
        fila = next(
            (row for row in ws.iter_rows(min_row=2, values_only=True)
             if row[col["Marca"]] == "PYTEST EXPORT XLSX"),
            None,
        )
        assert fila is not None, "el cliente creado no aparece en el export"
        assert fila[col["Producto"]] == "Agua x 1,5 lt"
        assert fila[col["Tipo de Envase"]] == "Starplastic"
        assert fila[col["Codigo Envase"]] == "STAR-260114"
        assert fila[col["Ubicacion"]] == "A-6"
        assert fila[col["Alto"]] == 8
        assert fila[col["Cilindro"]] == 24
        assert fila[col["Provincia"]] == "Córdoba"
    finally:
        api.delete(f"/api/clientes/{cid}")


def test_export_excel_cliente_sin_productos_aparece(api):
    """Un cliente sin productos igual tiene su fila (columnas de producto vacías)."""
    cid = _crear_cliente(api, "PYTEST EXPORT SIN PROD")
    try:
        r = api.get("/api/clientes/export/excel")
        assert r.status_code == 200
        ws = load_workbook(io.BytesIO(r.content)).active
        header = [c.value for c in ws[1]]
        col = {name: i for i, name in enumerate(header)}
        fila = next(
            (row for row in ws.iter_rows(min_row=2, values_only=True)
             if row[col["Marca"]] == "PYTEST EXPORT SIN PROD"),
            None,
        )
        assert fila is not None
        assert fila[col["Producto"]] is None
        assert fila[col["Ubicacion"]] is None
    finally:
        api.delete(f"/api/clientes/{cid}")
