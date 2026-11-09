# La demostración: qué muestra y cómo se reproduce

Documento que acompaña al video del Entregable 4. Explica qué se ve en la
demostración, qué requerimiento satisface cada parte, y cómo levantar el
prototipo para verificarlo por cuenta propia.

El video **no lleva narración hablada**: cada escena se explica con un cartel
en pantalla que enuncia qué se está mostrando y por qué importa. Se puede ver
sin sonido, en cualquier equipo y sin auriculares.

### Dónde está el video

El archivo **no se versiona en este repositorio**: son 14 MB de binario que
quedarían en el historial de Git para siempre y que cambian por completo en
cada regrabación. Se publica aparte y se enlaza desde acá:

> **Video de la demostración:** `(pegar acá el enlace de descarga)`

Formato: MP4 (H.264), 1440×900, 5 min 51 s, sin audio.

---

## 1. Qué se demuestra

El video recorre **el circuito completo de una orden de trabajo**: se carga con
el plazo comprometido con el cliente, se imprime con un código QR, recorre las
tres etapas de la planta registrándose con ese código, el responsable la
verifica, se cierra, y a partir de ese registro el sistema mide el cumplimiento
de plazos y señala el cuello de botella.

Se eligió ese recorrido y no un paseo por el menú porque es el que responde al
problema relevado. El relevamiento concluyó dos cosas:

1. que la orden, una vez que entra a la planta, deja de existir para la oficina
   hasta que vuelve terminada, y
2. que **ningún documento del circuito registra la fecha comprometida con el
   cliente**, de modo que la empresa no puede medir si entrega en término.

La demostración está armada para mostrar que el prototipo resuelve esas dos
cosas. Todo lo demás, aunque funcione, se deja fuera del video.

---

## 2. Qué se ve, escena por escena

| # | Escena | Qué demuestra | RF |
|---|--------|---------------|-----|
| 1 | Placa de apertura y el enunciado del problema | El circuito se gestiona en papel: cuando la orden entra a la planta, deja de existir para la oficina | — |
| 2 | **Panel de control · pestaña Producción**: la tira de etapas y «Qué hay en la planta» | En qué paso está parada cada orden y cuáles llevan más tiempo esperando | **RF-12** |
| 3 | Listado de órdenes de trabajo | Cada pedido con su número, su estado y su etapa | RF-12 |
| 4 | La **fecha comprometida** en la ficha de la orden | El dato que no registraba ningún formulario del circuito | **RF-05** |
| 5 | Verificación del responsable antes del cierre | El sistema no da por terminada una orden que nadie revisó; queda quién verificó y cuándo | **RF-11** |
| 6 | La ficha impresa: recuadro «Entregar:» y código QR | El plazo llega al operario en la máquina, en papel | RF-06 |
| 7 | Escaneo desde el teléfono: impresión, eligiendo máquina | El paso por la planta se registra sin cargar nada a mano; el operario sale de la sesión | RF-07, RF-08, RF-10 |
| 8 | Tablero de planta | La oficina ve dónde está el pedido mientras se produce | RF-12 |
| 9 | Reportes · «A tiempo» | El porcentaje de cumplimiento, junto a la muestra sobre la que está medido | **RF-14** |
| 10 | Reportes · «Cuándo termina cada orden» | Fecha estimada de fin y atraso proyectado, con los tiempos reales de las cerradas | **RF-13**, RF-14 |
| 11 | Reportes · «Dónde se traba la planta» | El cuello de botella por etapa, máquina y período | **RF-15** |
| 12 | Marcar una orden para rehacer, con motivo | El retrabajo abre una orden nueva y conserva la producción original | **RF-16** |
| 13 | Placa de cierre: el circuito completo | Carga con plazo · seguimiento por QR · verificación · cierre · medición | — |

El video demuestra **once requerimientos**: RF-05 a RF-08, RF-10 a RF-16.
No es el alcance completo del sistema, sino el núcleo del argumento: el
circuito de la orden de trabajo de punta a punta. Lo que queda fuera está en
el apartado siguiente.

Los seis requerimientos en negrita son los que el documento declaraba y el
prototipo no implementaba hasta esta entrega.

---

## 3. Lo que el video no muestra

Está construido y declarado en el apartado de alcances, pero queda fuera del
video porque excede el núcleo y diluiría el argumento en seis minutos:

- **Presupuestos** — registro con ítems y total, y conversión del presupuesto
  aprobado en orden de trabajo.
- **Remitos y despacho** — emisión del remito y egreso de stock del producto
  terminado.
- **Facturas** — registro de lo facturado y lo cobrado, para la dirección. No
  reemplaza la facturación fiscal.
- **Control de calidad** — plantillas de control y registro del resultado sobre
  cada orden.
- **Stock** con aviso de mínimo, el ABM completo de clientes y la planificación
  por máquina.

Y estas cuatro, que sí pertenecen al circuito de la orden y están
implementadas y cubiertas por los tests, pero no se filmaron para no estirar
el video más allá de los seis minutos:

- **Alta de la orden con la especificación autocompletada** al elegir el
  producto del cliente (RF-03, RF-04). El video entra con las órdenes ya
  cargadas.
- **Escaneo de extrusión y de troquelado** (RF-09). Se filma sólo el de
  impresión, que es el único que además pide elegir máquina.
- **El intento de cierre rechazado** por falta de verificación. El video
  muestra la verificación, no el rechazo.
- **Roles, permisos y auditoría** (RF-20, RF-21). Se ven de refilón en el menú
  lateral, pero no hay escena dedicada.

---

## 4. Cómo reproducirlo

### Prototipo publicado

- Aplicación: `https://erpetiplast.vercel.app`
- API: `https://erpetiplast-production.up.railway.app` — documentación
  interactiva en `/docs`

### Levantarlo en una máquina propia

Requiere Python 3.11+, Node 20+ y PostgreSQL 16.

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # completar DATABASE_URL y SECRET_KEY
python migrations/migrate.py  # crea el esquema
uvicorn main:app --reload --port 8000
```

```bash
# Frontend
cd frontend
npm install
npm run dev                   # http://localhost:3000
```

### Datos de prueba

El repositorio incluye `backend/tools/seed_demo.py`, que siembra una base
descartable con razones sociales, productos, máquinas y órdenes **ficticias**,
y crea el usuario con el que se entra a la demostración.

> **Advertencia:** ese script empieza con un `TRUNCATE` de las tablas que llena.
> Correrlo únicamente contra una base vacía o descartable, nunca contra una con
> datos que importen.

```bash
cd backend && source venv/bin/activate && python tools/seed_demo.py
```

Terminado el sembrado, se entra en `http://localhost:3000` con:

| | |
|---|---|
| Usuario | `demo@etiplast.local` |
| Contraseña | `capturas-demo-2026` |

Es un usuario de demostración con rol de administrador, creado por ese mismo
script sobre la base descartable. No existe fuera de ella.

Ninguna pantalla de la demostración muestra datos reales de clientes de la
empresa: las razones sociales, los CUIT, los domicilios y los teléfonos que se
ven son inventados.

---

## 5. Cómo verificar que hace lo que dice

El prototipo tiene **485 pruebas automatizadas**. Las de integración corren
contra un PostgreSQL real y descartable:

```bash
docker run -d --name etiplast-test-pg \
  -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test \
  -e POSTGRES_DB=etiplast_test -p 5459:5432 postgres:16-alpine

DATABASE_URL="postgresql://test:test@localhost:5459/etiplast_test" \
  python migrations/migrate.py

cd backend && source venv/bin/activate && pytest
```

Las pruebas de los requerimientos que la demostración exhibe:

| Archivo | Qué comprueba |
|---------|---------------|
| `tests/integration/test_orden_fecha_comprometida.py` | El plazo se guarda, se edita y es opcional; no pisa la fecha de entrega real |
| `tests/integration/test_reporte_cumplimiento_plazos.py` | El porcentaje a tiempo, su muestra y las atrasadas; la cancelada no cuenta como incumplida |
| `tests/integration/test_reporte_estimaciones.py` | La fecha estimada, el atraso proyectado y los casos en que no se estima |
| `tests/integration/test_reporte_esperas.py` | Los acumulados por etapa, máquina y mes, y el cuello de botella |
| `tests/integration/test_orden_verificacion.py` | El cierre trabado sin verificación y la constancia de quién y cuándo |
| `tests/integration/test_orden_rehacer.py` | El retrabajo, y que la producción original quede intacta |

Si el PostgreSQL de prueba no está levantado, esas pruebas **se saltean** en
lugar de fallar, para que la suite unitaria siga corriendo sin Docker.

---

## 6. Dos precisiones honestas sobre lo que se ve

Conviene anticiparlas, porque el video muestra números y los números se
repreguntan.

**El porcentaje de cumplimiento está calculado sobre pocas órdenes.** Es
correcto que así sea: la fecha comprometida no existía antes de este prototipo,
ni en el papel ni en el sistema anterior, de modo que las órdenes previas no
tienen plazo registrado y no entran en la cuenta. Inventarles uno sería
fabricar la medición. Por eso el indicador se muestra siempre junto a su
muestra, y por eso aparece vacío —y no en cero— cuando no hay con qué medir: un
0 % afirmaría que ningún pedido salió en término, que es una afirmación sobre
la planta, y no tener muestra es otra cosa.

**El reporte de cuellos de botella no mide la espera en cola.** Mide el tiempo
que la orden pasó en cada etapa, que contiene la espera y el trabajo de la
máquina juntos. El operario escanea el código al entrar a su paso, así que
entre dos escaneos consecutivos hay una sola medición y las dos componentes no
se pueden separar; hacerlo requeriría un segundo escaneo al salir. La medición
alcanza para el fin que el requerimiento declara —identificar dónde se acumula
el trabajo— y el sistema no atribuye la causa porque el dato no la soporta. La
pantalla lo dice explícitamente, debajo de la tabla.
