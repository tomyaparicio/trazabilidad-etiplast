# Prompt — Agregar nuevo recurso al ERP

Usar este prompt cuando se quiere agregar un módulo nuevo completo.

---

Quiero agregar el recurso **[NOMBRE]** al ERP Etiplast.

El recurso tiene los siguientes campos:
- [campo1]: [tipo y descripción]
- [campo2]: [tipo y descripción]

Necesito:
1. Modelo SQLAlchemy en `backend/models.py` con `to_dict()`
2. Migración en `backend/migrate.py`
3. Router CRUD en `backend/routers/[nombre].py` con GET lista (paginado + búsqueda), GET por ID, POST, PUT, DELETE
4. Registrar el router en `backend/main.py`
5. Tipos TypeScript en `frontend/src/lib/api/types.ts`
6. Métodos en `frontend/src/lib/api/client.ts` bajo `api.[nombre]`
7. Página `frontend/src/app/(dashboard)/[nombre]/page.tsx` (sin SSR bloqueante)
8. Componente tabla usando `DataTable` en `_components/[nombre]-table.tsx`
9. Link en el sidebar (`frontend/src/components/sidebar.tsx`)

Seguir las mismas convenciones que `clientes` y `ordenes`.
