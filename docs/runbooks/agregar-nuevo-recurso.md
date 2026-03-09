# Runbook — Agregar un nuevo recurso al ERP

Pasos para agregar un nuevo módulo completo (ej: "Proveedores").

## 1. Backend — Modelo

En `backend/models.py`:
```python
class Proveedor(Base):
    __tablename__ = "proveedores"
    id = Column(Integer, primary_key=True, autoincrement=True)
    # ... campos
    def to_dict(self) -> dict: ...
```

## 2. Backend — Migración

En `backend/migrate.py`, agregar a la lista `MIGRATIONS_*`:
```python
MIGRATIONS_PROVEEDORES = [
    ("Crear tabla proveedores", """
        CREATE TABLE IF NOT EXISTS proveedores (...);
    """),
]
all_migrations = ... + MIGRATIONS_PROVEEDORES
```

Correr: `python migrate.py`

## 3. Backend — Router

Crear `backend/routers/proveedores.py` con CRUD básico.

Registrar en `backend/main.py`:
```python
from routers import proveedores
app.include_router(proveedores.router)
```

## 4. Frontend — Tipos

En `frontend/src/lib/api/types.ts`:
```typescript
export type Proveedor = { id: number; nombre: string; ... }
export type ProveedoresListResponse = { data: Proveedor[]; total: number; ... }
```

## 5. Frontend — Cliente API

En `frontend/src/lib/api/client.ts`:
```typescript
proveedores: {
  list: (params?) => get<ProveedoresListResponse>("/api/proveedores", params),
  get: (id: number) => get<Proveedor>(`/api/proveedores/${id}`),
  create: (data) => post<Proveedor>("/api/proveedores", data),
  update: (id, data) => put<Proveedor>(`/api/proveedores/${id}`, data),
  delete: (id) => del<void>(`/api/proveedores/${id}`),
}
```

## 6. Frontend — Página

```
frontend/src/app/(dashboard)/proveedores/
  page.tsx                    → renderiza el componente tabla
  _components/
    proveedores-table.tsx     → usa DataTable de components/ui/data-table.tsx
```

## 7. Frontend — Sidebar

En `frontend/src/components/sidebar.tsx`, agregar al array `navigation`.
