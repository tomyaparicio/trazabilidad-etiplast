# Etiplast ERP

Sistema de trazabilidad y planificación para una fábrica de etiquetas plásticas.

Trabajo Final de Grado · Ingeniería en Software · Universidad Siglo 21

---

## El problema

Etiplast fabrica etiquetas y fundas de polietileno para embotelladoras y
fraccionadoras. El circuito de producción se gestiona **en papel**: cuando una
orden entra a la planta, deja de existir para la oficina hasta que vuelve
terminada.

De ahí salen dos carencias concretas, y el sistema está construido alrededor de
ellas:

**No se sabe dónde está un pedido.** Cuando un cliente llama, hay que bajar a
la planta a preguntar. La respuesta es una estimación verbal.

**No se puede medir el cumplimiento de plazos.** Ningún formulario del circuito
tiene un campo para la fecha comprometida con el cliente: se acuerda por
mensajería y no queda registrada en ningún lado. Sin ese dato no hay contra qué
comparar, y la empresa no puede dimensionar su propio incumplimiento.

## La solución

La orden se carga **con su plazo**, sale impresa con un **código QR**, y cada
operario la escanea desde el teléfono al empezar su etapa. El paso por la
planta queda registrado sin que nadie cargue nada a mano: el operario sale de
la sesión, la fecha del reloj y la máquina de la pantalla.

Con eso, tres cosas que antes no se podían saber:

| | |
|---|---|
| **Dónde está cada pedido** | En vivo, mientras se produce |
| **Qué porcentaje sale en término** | Con la muestra sobre la que está medido |
| **Dónde se traba la planta** | Tiempos acumulados por etapa, máquina y período |

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | FastAPI · SQLAlchemy · PostgreSQL |
| Frontend | Next.js 16 (App Router) · Tailwind · shadcn/ui |
| Auth | JWT en cookie `httpOnly`, con roles y permisos configurables |
| Deploy | Railway (API + base) · Vercel (frontend) |

## Estructura

```
backend/
  core/         configuración, base de datos, seguridad, RBAC, middleware
  models/       modelos SQLAlchemy, un archivo por dominio
  schemas/      validación de entrada (Pydantic)
  routers/      un archivo por recurso
  services/     reglas de negocio que no son de un recurso solo
  migrations/   migraciones SQL idempotentes
  tests/        485 tests (unitarios + integración contra Postgres)

frontend/src/
  app/          rutas (App Router)
  components/   componentes compartidos
  lib/api/      cliente HTTP centralizado y tipos de la API
```

## Levantarlo

```bash
# Backend
cd backend && python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # completar DATABASE_URL y SECRET_KEY
python migrations/migrate.py
uvicorn main:app --reload

# Frontend
cd frontend && npm install && npm run dev
```

La API queda en `localhost:8000` (documentación interactiva en `/docs`) y el
frontend en `localhost:3000`.

Para cargar datos de prueba —empresas inventadas, ningún dato real—:

```bash
python backend/tools/seed_demo.py
```

> **Cuidado:** este script hace `TRUNCATE` antes de sembrar. Corrélo contra una
> base vacía o descartable, nunca contra una que tenga datos que te importen.

## Tests

```bash
cd backend && venv/bin/python -m pytest
```

**485 tests.** Los de integración corren contra un Postgres descartable y se
saltean solos si no está levantado:

```bash
docker run -d --name etiplast-test-pg \
  -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test -e POSTGRES_DB=etiplast_test \
  -p 5459:5432 postgres:16-alpine

DATABASE_URL="postgresql://test:test@localhost:5459/etiplast_test" \
  python migrations/migrate.py
```

## Algunas decisiones que vale la pena mirar

**El cálculo de film vive en el backend, no en la pantalla.**
`metros = cantidad × (alto_cm ÷ 100) + 400`, redondeado siempre hacia arriba.
El margen son 400 metros fijos y no un porcentaje porque es la cuenta que hace
la planta: con 5 % los números no coincidían con los de ellos. Está en el
backend y no duplicado en el frontend porque la orden también entra por la API,
y una fórmula en dos lugares termina dando dos resultados.
→ [`backend/services/extrusion.py`](backend/services/extrusion.py)

**Rehacer una orden no la reabre.** Crea una orden nueva que hereda la
especificación y apunta a la original, que queda marcada con el motivo.
Reabrirla dejaría que los escaneos del retrabajo pisaran los operarios, las
máquinas y las fechas del trabajo que sí se hizo — y el rechazo, que es
justamente lo que hay que poder medir, desaparecería del historial.
→ [`backend/routers/ordenes.py`](backend/routers/ordenes.py)

**El cierre exige verificación, pero sólo si hay a quién exigírsela.** Si la
orden tiene responsable asignado, no cierra sin su visto bueno. Si no lo tiene,
cierra igual y avisa: trabarla dejaría la orden muerta para siempre.

**Todo porcentaje viaja con su muestra.** Un 100 % sobre dos órdenes no es lo
mismo que sobre doscientas, y la pantalla lo dice. Cuando no hay muestra, el
valor es `null` y no `0 %`: cero es una afirmación sobre la planta, y sin datos
no se puede afirmar nada.

**Las migraciones son idempotentes.** Todo es `ADD COLUMN IF NOT EXISTS` y
`CREATE INDEX IF NOT EXISTS`, y corren solas en cada deploy.

## Una aclaración sobre los datos

Este repositorio **no contiene datos de clientes de la empresa**. Las capturas,
las semillas y la demostración usan razones sociales inventadas. La base real
nunca se versiona.

## Estado

Prototipo funcional, en uso evaluativo. El núcleo —trazabilidad de la orden de
trabajo— está completo y cubierto por tests. Alrededor hay módulos
complementarios (presupuestos, remitos, facturas, control de calidad, stock)
que exceden ese núcleo y quedan fuera del modelo de requerimientos formal.

---

Tomás Aparicio · [github.com/tomyaparicio](https://github.com/tomyaparicio)
