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

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

import models
from models import (
    Base, Cliente, ClienteContacto, ClienteProducto, ClienteUbicacion, Envase,
    Maquina, OrdenTrabajo, Provincia, RazonSocial, Role, Rubro, User,
)

URL = os.getenv("TEST_DATABASE_URL",
                "postgresql+psycopg2://test:test@localhost:5459/etiplast_test")

if "5459" not in URL or "etiplast_test" not in URL:
    sys.exit(f"ABORTA: esto sólo corre contra la base de test. URL recibida: {URL}")

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
    for tabla in ("orden_extrusion_bobinas", "ordenes_trabajo", "cliente_productos",
                  "cliente_ubicaciones", "cliente_contactos", "clientes",
                  "razones_sociales", "envases", "maquinas", "rubros", "provincias"):
        s.execute(text(f"TRUNCATE {tabla} RESTART IDENTITY CASCADE"))
    s.commit()


def sembrar():
    Base.metadata.create_all(engine)
    s = Session()
    limpiar(s)

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
    estados = ["completada", "en_proceso", "en_proceso", "pendiente", "pendiente",
               "borrador"]
    hoy = date.today()
    for n, c in enumerate(clientes[:12], start=1):
        prod = s.query(ClienteProducto).filter_by(cliente_id=c.id).first()
        estado = estados[n % len(estados)]
        fecha = hoy - timedelta(days=(12 - n) * 3)
        s.add(OrdenTrabajo(
            numero=f"OT-{n:04d}", cliente_id=c.id,
            cliente_producto_id=prod.id if prod else None,
            fecha=fecha, estado=estado, operador="Operario de planta",
            lote=f"L-{fecha:%Y%m%d}-{n:04d}",
            extrusion_ancho=round(220 + n * 3, 2), extrusion_color="Natural",
            extrusion_trat="Tratado 38 dinas", extrusion_espesor=round(0.06 + n / 1000, 3),
            fecha_impresion=fecha + timedelta(days=4),
            fecha_troquelado=fecha + timedelta(days=7),
            fecha_entrega=fecha + timedelta(days=30),
            cantidad=5000 * n, total_final=None,
            observaciones="Orden de demostración — datos ficticios.",
        ))

    s.commit()
    print(f"razones sociales : {s.query(RazonSocial).count()}")
    print(f"clientes (marcas): {s.query(Cliente).count()}")
    print(f"presentaciones   : {s.query(ClienteProducto).count()}")
    print(f"órdenes          : {s.query(OrdenTrabajo).count()}")
    print(f"usuarios         : {s.query(User).count()}  ·  roles: {s.query(Role).count()}")
    s.close()


if __name__ == "__main__":
    sembrar()
