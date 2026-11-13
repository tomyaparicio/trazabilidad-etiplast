"""La ficha tiene que decir QUÉ agua es.

En producción hay 244 grupos de productos que se llaman igual dentro del mismo
cliente: «2 pinos» tiene tres «Agua» y lo único que las separa es el volumen
—500 ml, 1,5 lt, 6 lt—, y cada una lleva otro cilindro y otra lámina. Una orden
que sólo dice «Agua» manda al operario a adivinar cuál de las tres.

Por eso `OrdenTrabajo.to_dict()` manda el volumen del producto además del
nombre. Van los dos campos crudos: cómo se escribe («1,5 lt» y no «1.5000lt»)
es decisión de quien lo muestra.
"""
from decimal import Decimal

import pytest

from models import Cliente, ClienteProducto, OrdenTrabajo

MARCA = "PYTEST-VOL SA"


def _limpiar(db):
    ids = [c.id for c in db.query(Cliente).filter(Cliente.marca == MARCA).all()]
    if not ids:
        return
    db.query(OrdenTrabajo).filter(OrdenTrabajo.cliente_id.in_(ids)).delete(synchronize_session=False)
    db.query(ClienteProducto).filter(ClienteProducto.cliente_id.in_(ids)).delete(synchronize_session=False)
    db.query(Cliente).filter(Cliente.id.in_(ids)).delete(synchronize_session=False)
    db.commit()


@pytest.fixture()
def tres_aguas(db_session):
    """El caso real: tres productos con el MISMO nombre y distinto volumen."""
    _limpiar(db_session)
    cli = Cliente(marca=MARCA)
    db_session.add(cli)
    db_session.commit()
    db_session.refresh(cli)

    prods = []
    for cantidad, unidad in ((Decimal("500"), "ml"), (Decimal("1.5"), "lt"), (Decimal("6"), "lt")):
        p = ClienteProducto(
            cliente_id=cli.id, nombre="Agua",
            volumen_cantidad=cantidad, volumen_unidad=unidad,
        )
        db_session.add(p)
        prods.append(p)
    db_session.commit()
    for p in prods:
        db_session.refresh(p)

    yield cli, prods
    _limpiar(db_session)


def test_la_orden_manda_el_volumen_del_producto(db_session, tres_aguas):
    """Sin esto, las tres órdenes son indistinguibles en la ficha."""
    cli, prods = tres_aguas
    vistos = []
    for p in prods:
        ot = OrdenTrabajo(numero=f"PYTEST-VOL-{p.id}", cliente_id=cli.id, cliente_producto_id=p.id)
        db_session.add(ot)
        db_session.commit()
        db_session.refresh(ot)
        d = ot.to_dict()
        assert d["producto_nombre"] == "Agua"
        vistos.append((d["producto_volumen_cantidad"], d["producto_volumen_unidad"]))

    # Lo que importa: las tres se distinguen entre sí.
    assert vistos == [(500.0, "ml"), (1.5, "lt"), (6.0, "lt")]
    assert len(set(vistos)) == 3, "tres órdenes del mismo nombre tienen que ser distinguibles"


def test_un_producto_sin_volumen_no_rompe(db_session, tres_aguas):
    """El 2% de los productos no lo tiene cargado: la clave viaja igual, en nulo."""
    cli, _ = tres_aguas
    p = ClienteProducto(cliente_id=cli.id, nombre="Agua sin medir")
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)

    ot = OrdenTrabajo(numero="PYTEST-VOL-SIN", cliente_id=cli.id, cliente_producto_id=p.id)
    db_session.add(ot)
    db_session.commit()
    db_session.refresh(ot)

    d = ot.to_dict()
    assert "producto_volumen_cantidad" in d and d["producto_volumen_cantidad"] is None
    assert "producto_volumen_unidad" in d and d["producto_volumen_unidad"] is None


def test_una_orden_sin_producto_tampoco_rompe(db_session, tres_aguas):
    """Una orden puede no tener producto: las claves tienen que estar igual."""
    cli, _ = tres_aguas
    ot = OrdenTrabajo(numero="PYTEST-VOL-NOPROD", cliente_id=cli.id)
    db_session.add(ot)
    db_session.commit()
    db_session.refresh(ot)

    d = ot.to_dict()
    assert d["producto_nombre"] is None
    assert d["producto_volumen_cantidad"] is None
    assert d["producto_volumen_unidad"] is None
