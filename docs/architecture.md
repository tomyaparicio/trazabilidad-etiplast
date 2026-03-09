# Arquitectura — Etiplast ERP

## Diagrama general

```
Browser
  │
  ├─ GET /cualquier-pagina
  │     └─ Next.js Server Component
  │           └─ Decodifica JWT local (sin llamada al backend)
  │
  └─ fetch /api/backend/clientes  (client-side)
        └─ Next.js Route Handler (/api/backend/[...path])
              └─ Inyecta Authorization: Bearer <token>
                    └─ FastAPI en Railway
                          └─ PostgreSQL en Railway
```

## Autenticación

1. Login → POST `/api/auth/login` (Next.js route) → llama a FastAPI `/auth/login`
2. FastAPI devuelve JWT → Next.js lo guarda como cookie `auth-token` (httpOnly, secure)
3. Cada request al backend pasa por el proxy `/api/backend/[...path]` que lee la cookie y agrega el header `Authorization: Bearer <token>`
4. El JWT contiene: `sub` (email), `role`, `user_id`, `exp`

## Middleware (Next.js)

- Protege todas las rutas del dashboard
- Redirige a `/login` si no hay cookie `auth-token`
- Redirige a `/` si hay cookie y se accede a `/login`

## Proxy backend

`frontend/src/app/api/backend/[...path]/route.ts`

- Recibe cualquier método (GET, POST, PUT, DELETE)
- Lee la cookie `auth-token` del servidor
- Reenvía al backend con el header de auth
- Retorna la respuesta del backend al cliente

## Frontend — estructura de páginas

```
app/
  (dashboard)/          → layout con sidebar (requiere auth)
    page.tsx            → dashboard/estadísticas
    clientes/           → ABM clientes
    ordenes/            → órdenes de trabajo
    perfil/             → perfil del usuario logueado
    admin/usuarios/     → gestión de usuarios (solo admin)
  login/                → página pública
  register/             → página pública
  print/ordenes/[id]/   → página standalone para PDF (sin sidebar)
  api/
    auth/               → login, logout, register (Next.js handlers)
    backend/[...path]/  → proxy al backend
```

## Backend — estructura de routers

```
routers/
  auth.py       → login, /me
  clientes.py   → CRUD clientes (con esquema normalizado)
  ordenes.py    → CRUD órdenes de trabajo
  dashboard.py  → stats, filtros
  admin.py      → gestión de usuarios (solo admin)
```
