# ADR 001 — Migración de Supabase a Railway + JWT custom

**Estado:** Implementado

## Contexto

El proyecto comenzó usando Supabase como backend-as-a-service (auth + DB). Se decidió migrar.

## Decisión

- **Base de datos**: PostgreSQL en Railway (control total del esquema)
- **Auth**: JWT custom con `python-jose` + bcrypt (sin depender de Supabase Auth)
- **Cookies**: httpOnly para el token (más seguro que localStorage)

## Consecuencias

- Mayor control sobre el esquema de DB y migraciones
- Sin vendor lock-in con Supabase
- Se necesita gestionar el ciclo de vida del JWT manualmente
- Las migraciones se corren con `python migrate.py`
