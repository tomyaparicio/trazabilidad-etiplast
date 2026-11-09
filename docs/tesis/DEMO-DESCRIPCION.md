# La demostración: qué muestra y cómo se reproduce

Documento que acompaña al video del Entregable 4. Explica qué se ve en la
demostración, qué requerimiento satisface cada parte, y cómo levantar el
prototipo para verificarlo por cuenta propia.

Para **grabar** el video, el guión cronometrado está en
[`GUION-DEMO.md`](GUION-DEMO.md). Este documento explica el contenido; aquel
explica la ejecución.

### Dónde está el video

El archivo **no se versiona en este repositorio**: son 14 MB de binario que
quedarían en el historial de Git para siempre y que cambian por completo en
cada regrabación. Se publica aparte y se enlaza desde acá:

> **Video de la demostración:** `(pegar acá el enlace de descarga)`

Formato: MP4 (H.264), 1440×900, 5 min 29 s, sin audio. La narración se graba
encima siguiendo el guión.

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
| 1 | El formulario de papel que se usa hoy | El punto de partida: no tiene campo para la fecha comprometida | — |
| 2 | Alta de la orden; al elegir el producto la especificación se completa sola | La especificación no se vuelve a transcribir a mano | RF-03, RF-04 |
| 3 | Carga de la **fecha comprometida** | El dato que no existía en ningún soporte | **RF-05** |
| 4 | Impresión de la ficha: recuadro «Entregar:» y código QR | El plazo llega al operario en la máquina | RF-06 |
| 5 | Escaneo del QR desde el teléfono: extrusión | El registro del paso por la planta, sin cargar nada a mano | RF-07, RF-10 |
| 6 | Tablero de planta: la orden aparece ubicada | La oficina ve dónde está el pedido mientras se produce | RF-12 |
| 7 | Escaneo de impresión, eligiendo máquina | Las impresoras no son intercambiables y la etapa lo refleja | RF-08 |
| 8 | Escaneo de troquelado | | RF-09 |
| 9 | Intento de cierre **sin verificar**: el sistema lo rechaza | El control del responsable es una condición, no una sugerencia | **RF-11** |
| 10 | Verificación y cierre | Queda constancia de quién verificó y cuándo | RF-11, RF-10 |
| 11 | Búsqueda por número de lote | Reconstrucción del pedido: máquina, operario y fecha de cada etapa | RF-12 |
| 12 | Reportes · tarjeta «A tiempo» | El porcentaje de cumplimiento, con la muestra sobre la que se calcula | **RF-14** |
| 13 | Reportes · «Cuándo termina cada orden» | Fecha estimada de fin y atraso proyectado por orden abierta | **RF-13**, RF-14 |
| 14 | Reportes · «Dónde se acumula el trabajo» | El cuello de botella por etapa, máquina y período | **RF-15** |
| 15 | Marcar una orden para rehacer, con motivo | El retrabajo queda registrado sin borrar la producción original | **RF-16** |
| 16 | Roles y permisos · auditoría | Cada puesto ve lo suyo; toda acción queda registrada | RF-20, RF-21 |

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
