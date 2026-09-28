"""Siembra la base de TEST con datos ficticios, para las capturas del informe.

Las capturas del punto «Interfaz gráfica» van dentro de un documento que se
entrega y se publica, así que no pueden mostrar clientes reales de Etiplast. Este
script llena la base descartable (`etiplast-test-pg`, puerto 5459) con empresas
inventadas que reproducen los casos que el informe necesita mostrar:

  · una razón social con VARIAS marcas compartiendo número de cliente
  · presentaciones con su especificación técnica completa
  · órdenes de trabajo en distintos estados

NUNCA correr esto contra la base de producción: aborta si la URL no es la de test.

    TEST_DATABASE_URL=... venv/bin/python seed_demo.py
"""
import os
import sys
from datetime import date, timedelta

# Este script vive en backend/tools/ pero importa core y models, que estan un
# nivel arriba: sin esto solo funciona si se lo corre desde backend/.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

import models
from models import (
    Base, Cliente, ClienteContacto, ClienteProducto, ClienteUbicacion, Envase,
    Factura, Maquina, OrdenTrabajo, Provincia, RazonSocial, Remito, RemitoItem,
    Role, Rubro, StockItem, StockMovimiento, User,
)

URL = os.getenv("SEED_DATABASE_URL") or os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+psycopg2://test:test@localhost:5459/etiplast_test")

# El script TRUNCATE tablas: sólo puede correr contra una base descartable, y
# nunca contra una remota. El nombre de la base es la única autorización válida.
DESCARTABLES = ("etiplast_test", "etiplast_capturas")
REMOTAS = ("railway", "rlwy.net", "amazonaws", "neon.tech", "supabase")
if not any(d in URL for d in DESCARTABLES) or any(r in URL for r in REMOTAS):
    sys.exit("ABORTA: esto sólo corre contra una base descartable y local "
             f"({' o '.join(DESCARTABLES)}). URL recibida: {URL}")

engine = create_engine(URL)
Session = sessionmaker(bind=engine)


# ── datos ficticios ───────────────────────────────────────────────────────────
# Empresas inventadas. Cualquier parecido con la cartera real es casualidad: la
# idea es mostrar la ESTRUCTURA (una razón social, varias marcas), no los datos.

PROVINCIAS = ["Córdoba", "Santa Fe", "Buenos Aires", "Mendoza", "Entre Ríos"]
RUBROS = ["Aguas y gaseosas", "Jugos", "Productos de limpieza", "Agroquímicos",
          "Aceites comestibles", "Lácteos"]
ENVASES = ["Botella PET 500 cc", "Botella PET 1,5 lt", "Bidón 6 lt",
           "Botella HDPE 900 cc", "Sachet 1 lt", "Bidón 20 lt"]
MAQUINAS = [("EXT-1", "Extrusora 1", "extrusion"),
            ("EXT-2", "Extrusora 2", "extrusion"),
            ("IMP-1", "Impresora 1", "impresion"),
            ("IMP-2", "Impresora 2", "impresion"),
            ("TRQ-1", "Troqueladora chica", "troquelado"),
            ("TRQ-2", "Troqueladora grande", "troquelado")]

# (razón social, número compartido, CUIT, localidad, provincia, rubro, [marcas])
EMPRESAS = [
    ("Aguas del Valle S.A.", 104, "30-71000001-4", "Villa Carlos Paz", "Córdoba",
     "Aguas y gaseosas", ["Manantial Puro", "Sierra Fresca", "Vertiente Azul"]),
    ("Jugos Aurora S.R.L.", 118, "30-71000002-2", "Rosario", "Santa Fe",
     "Jugos", ["Aurora Naranja", "Aurora Multifruta"]),
    ("Limpieza Norte S.A.S.", 132, "30-71000003-0", "Córdoba", "Córdoba",
     "Productos de limpieza", ["Brillo Total"]),
    ("Agro Sur S.A.", 147, "30-71000004-9", "Venado Tuerto", "Santa Fe",
     "Agroquímicos", ["Campo Verde", "Rinde Max"]),
    ("Aceitera La Colina S.R.L.", 155, "30-71000005-7", "Mendoza", "Mendoza",
     "Aceites comestibles", ["La Colina"]),
    ("Láctea del Litoral S.A.", 163, "30-71000006-5", "Paraná", "Entre Ríos",
     "Lácteos", ["Litoral Clásica", "Litoral Light"]),
]

LAMINAS = ["Polietileno 60 µ", "Polietileno 80 µ", "BOPP 30 µ", "Autoadhesiva"]


def limpiar(s):
    """Vacía las tablas que este script llena, respetando las dependencias."""
    for tabla in ("remito_items", "remitos", "stock_movimientos", "stock_items",
                  "facturas",
                  "orden_extrusion_bobinas", "ordenes_trabajo", "cliente_productos",
                  "cliente_ubicaciones", "cliente_contactos", "clientes",
                  "razones_sociales", "envases", "maquinas", "rubros", "provincias"):
        s.execute(text(f"TRUNCATE {tabla} RESTART IDENTITY CASCADE"))
    s.commit()


# Credenciales de DEMOSTRACIÓN. Valen sólo contra la base descartable local: no
# existen en staging ni en producción, y la base se puede borrar entera.
DEMO_EMAIL = "demo@etiplast.local"
DEMO_PASSWORD = "capturas-demo-2026"


def usuario_demo(s):
    """Crea (o repone) el usuario con el que se entra a sacar las capturas."""
    import bcrypt
    u = s.query(User).filter_by(email=DEMO_EMAIL).first()
    if u is None:
        u = User(email=DEMO_EMAIL)
        s.add(u)
    u.nombre, u.apellido, u.role, u.is_active = "Tomás", "Aparicio", "admin", True
    u.hashed_password = bcrypt.hashpw(DEMO_PASSWORD.encode(), bcrypt.gensalt()).decode()
    s.flush()
    return u


def sembrar():
    Base.metadata.create_all(engine)
    s = Session()
    limpiar(s)
    autor = usuario_demo(s)

    provincias = {n: Provincia(nombre=n) for n in PROVINCIAS}
    rubros = {n: Rubro(nombre=n) for n in RUBROS}
    envases = [Envase(nombre=n) for n in ENVASES]
    maquinas = [Maquina(codigo=c, nombre=n, tipo=t) for c, n, t in MAQUINAS]
    s.add_all([*provincias.values(), *rubros.values(), *envases, *maquinas])
    s.flush()

    impresoras = [m for m in maquinas if m.tipo == "impresion"]
    clientes = []

    for razon, numero, cuit, localidad, prov, rubro, marcas in EMPRESAS:
        rs = RazonSocial(
            numero=numero, razon_social=razon, cuit=cuit,
            domicilio=f"Ruta Provincial {numero} km {numero % 40}",
            localidad=localidad, provincia_id=provincias[prov].id, pais="Argentina",
            telefono=f"0351 4{numero:04d}", transporte="Transporte Interurbano S.A.",
        )
        s.add(rs)
        s.flush()

        for i, marca in enumerate(marcas):
            c = Cliente(id_cliente=numero, marca=marca, razon_social=razon,
                        cuit=cuit, razon_social_id=rs.id, rubro_id=rubros[rubro].id)
            s.add(c)
            s.flush()
            clientes.append(c)

            s.add(ClienteUbicacion(
                cliente_id=c.id, domicilio=rs.domicilio, localidad=localidad,
                provincia_id=provincias[prov].id, pais="Argentina"))
            s.add(ClienteContacto(
                cliente_id=c.id, telefono=rs.telefono,
                observaciones="Contacto: área de compras."))

            # Dos o tres presentaciones por marca, con especificación completa.
            for j in range(2 + (i % 2)):
                env = ENVASES[(numero + j) % len(ENVASES)]
                volumen, unidad = [(500, "cc"), (1.5, "lts"), (6, "lts"),
                                   (900, "cc"), (1, "lts"), (20, "lts")][(numero + j) % 6]
                s.add(ClienteProducto(
                    cliente_id=c.id,
                    nombre=f"Etiqueta {marca} {volumen} {unidad}",
                    envase=env, envase_codificado=f"E-{(numero + j) % 90 + 10}",
                    ubicacion=f"{chr(65 + j)}-{(numero + j) % 9 + 1}",
                    volumen_cantidad=volumen, volumen_unidad=unidad,
                    lamina=LAMINAS[(numero + j) % len(LAMINAS)],
                    alto=round(120 + (numero + j * 7) % 80, 2),
                    cilindro=round(180 + (numero + j * 5) % 60, 2),
                    cierre=round(2 + (numero + j) % 4, 2),
                    maquina_impresora_id=impresoras[j % len(impresoras)].id,
                ))
    s.flush()

    # Órdenes de trabajo repartidas entre los estados posibles.
    estados = ["completada", "completada", "completada", "completada",
               "en_proceso", "en_proceso", "pendiente", "pendiente", "borrador"]
    OPERARIOS = ["J. Suárez", "R. Gómez", "M. Ledesma", "C. Bustos", "A. Ferreyra"]
    hoy = date.today()
    for n, c in enumerate(clientes[:12], start=1):
        prod = s.query(ClienteProducto).filter_by(cliente_id=c.id).first()
        estado = estados[n % len(estados)]
        fecha = hoy - timedelta(days=(12 - n) * 19)
        # Hasta qué etapa llegó cada orden: es lo que el informe llama avance.
        avance = {"completada": 3, "en_proceso": 2, "pendiente": 1, "borrador": 0}[estado]
        op = lambda i: OPERARIOS[(n + i) % len(OPERARIOS)]
        s.add(OrdenTrabajo(
            numero=f"OT-{n:04d}", cliente_id=c.id,
            cliente_producto_id=prod.id if prod else None,
            fecha=fecha, estado=estado, operador=op(0), created_by=autor.id,
            responsable_id=autor.id,
            lote=f"L-{fecha:%Y%m%d}-{n:04d}" if avance else None,
            extrusion_ancho=round(220 + n * 3, 2), extrusion_color="Natural",
            extrusion_trat="Tratado 38 dinas", extrusion_espesor=round(0.06 + n / 1000, 3),
            extrusion_cant_bob=2 + n % 4,
            extrusion_formulacion="80 % PEBD + 20 % PEAD",
            extrusion_maquina=f"Extrusora {1 + n % 2}",
            operador_extrusion=op(0) if avance >= 1 else None,
            fecha_extrusion=fecha + timedelta(days=2) if avance >= 1 else None,
            impresion_frente=f"Etiqueta {c.marca}", impresion_colores="4 colores",
            impresion_cilindro=round(180 + n * 2, 2),
            operador_impresion=op(1) if avance >= 2 else None,
            fecha_impresion=fecha + timedelta(days=4) if avance >= 2 else None,
            troquelado_ancho=round(90 + n, 2), troquelado_alto=round(130 + n, 2),
            troquelado_maquina=f"Troqueladora {1 + n % 3}",
            operador_troquelado=op(2) if avance >= 3 else None,
            fecha_troquelado=fecha + timedelta(days=7) if avance >= 3 else None,
            fecha_entrega=fecha + timedelta(days=22 + n % 9),
            cantidad=5000 * n, total_final=None,
            observaciones="Orden de demostración — datos ficticios.",
        ))

    s.flush()

    # ── stock: insumos de extrusion e impresion, algunos bajo el minimo ────────
    INSUMOS = [
        ("MP-PEBD-CR", "Polietileno baja densidad — cristal", "materia_prima", "kg", 420, 1200),
        ("MP-PEBD-BL", "Polietileno baja densidad — blanco", "materia_prima", "kg", 1850, 1200),
        ("MP-PEAD", "Polietileno alta densidad", "materia_prima", "kg", 640, 500),
        ("TIN-AZUL", "Tinta azul proceso", "insumo", "kg", 12, 40),
        ("TIN-NEGRA", "Tinta negra proceso", "insumo", "kg", 96, 40),
        ("TIN-ROJA", "Tinta roja proceso", "insumo", "kg", 31, 40),
        ("SOL-ACET", "Solvente acetato", "insumo", "lt", 210, 150),
    ]
    items = []
    for cod, nom, tipo, uni, actual, minimo in INSUMOS:
        it = StockItem(codigo=cod, nombre=nom, tipo=tipo, categoria="Producción",
                       unidad=uni, stock_actual=actual, stock_minimo=minimo, activo=True)
        s.add(it)
        items.append(it)
    s.flush()
    for k, it in enumerate(items):
        # Un ingreso y un egreso por item, para que el kardex no este vacio.
        s.add(StockMovimiento(
            stock_item_id=it.id, tipo="ingreso", cantidad=200 + k * 30,
            motivo="Compra a proveedor", stock_anterior=it.stock_actual,
            stock_resultante=float(it.stock_actual) + 200 + k * 30,
            user_id=autor.id, observaciones="Movimiento de demostración."))
        s.add(StockMovimiento(
            stock_item_id=it.id, tipo="egreso", cantidad=200 + k * 30,
            motivo="Consumo de producción", stock_anterior=float(it.stock_actual) + 200 + k * 30,
            stock_resultante=it.stock_actual, user_id=autor.id,
            observaciones="Movimiento de demostración."))

    # ── remitos y egresos: cierran la cadena de trazabilidad del lote ─────────
    # Sin esto la pantalla de trazabilidad encuentra la orden pero muestra cero
    # movimientos y cero remitos, que es justo lo que el informe quiere ilustrar.
    terminadas = [o for o in s.query(OrdenTrabajo).order_by(OrdenTrabajo.id).all()
                  if o.estado == "completada" and o.lote]
    pt = StockItem(codigo="PT-ETIQ", nombre="Etiquetas terminadas", tipo="producto",
                   categoria="Producto terminado", unidad="un",
                   stock_actual=0, stock_minimo=0, activo=True)
    s.add(pt)
    s.flush()
    for n, o in enumerate(terminadas, start=1):
        rem = Remito(numero=f"REM-{n:04d}", cliente_id=o.cliente_id,
                     fecha=o.fecha + timedelta(days=21), estado="despachado",
                     transporte="Transporte Interurbano S.A.",
                     domicilio_entrega="Ruta Provincial 104 km 24",
                     created_by=autor.id, observaciones="Remito de demostración.")
        s.add(rem)
        s.flush()
        s.add(RemitoItem(remito_id=rem.id, orden_trabajo_id=o.id,
                         descripcion=f"Etiquetas orden {o.numero}",
                         cantidad=o.cantidad, unidad="un", lote=o.lote))
        s.add(StockMovimiento(
            stock_item_id=pt.id, tipo="egreso", cantidad=o.cantidad,
            motivo="Despacho de producto terminado", stock_anterior=o.cantidad,
            stock_resultante=0, orden_trabajo_id=o.id, remito_id=rem.id,
            lote=o.lote, user_id=autor.id,
            observaciones="Egreso de demostración."))

    # ── facturas: alimentan el tablero de finanzas ────────────────────────────
    for n, o in enumerate(s.query(OrdenTrabajo).order_by(OrdenTrabajo.id).all(), start=1):
        if o.estado != "completada":
            continue
        neto = 180000 + n * 47000
        s.add(Factura(
            cliente_id=o.cliente_id, orden_trabajo_id=o.id,
            fecha=o.fecha + timedelta(days=24),
            fecha_vencimiento=o.fecha + timedelta(days=54),
            subtotal=neto, iva_porcentaje=21, total=round(neto * 1.21, 2),
            created_by=autor.id, observaciones="Factura de demostración."))

    s.commit()
    print(f"razones sociales : {s.query(RazonSocial).count()}")
    print(f"clientes (marcas): {s.query(Cliente).count()}")
    print(f"presentaciones   : {s.query(ClienteProducto).count()}")
    print(f"órdenes          : {s.query(OrdenTrabajo).count()}")
    print(f"stock            : {s.query(StockItem).count()} ítems, "
          f"{s.query(StockMovimiento).count()} movimientos")
    print(f"remitos          : {s.query(Remito).count()}")
    print(f"facturas         : {s.query(Factura).count()}")
    print(f"usuarios         : {s.query(User).count()}  ·  roles: {s.query(Role).count()}")
    s.close()


if __name__ == "__main__":
    sembrar()
