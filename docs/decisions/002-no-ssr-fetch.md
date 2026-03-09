# ADR 002 — Sin fetch SSR bloqueante en páginas del dashboard

**Estado:** Implementado

## Contexto

Las páginas del dashboard (clientes, órdenes) hacían `apiFetchServer` en el Server Component antes de renderizar. Esto causaba que cada navegación esperara la respuesta de Railway (que puede estar en cold-start).

## Decisión

Las páginas del dashboard renderizan inmediatamente con datos vacíos. Los componentes cliente hacen el fetch de datos de forma asíncrona mostrando un skeleton mientras cargan.

## Implementación

```tsx
// ❌ Antes (bloqueante)
export default async function ClientesPage() {
  const data = await apiFetchServer("/api/clientes")  // bloquea hasta que Railway responde
  return <ClientesTable initialData={data} />
}

// ✅ Ahora (instantáneo)
export default function ClientesPage() {
  return <ClientesTable initialClientes={[]} initialTotal={0} filtros={{ rubros: [], provincias: [] }} />
  // el componente hace el fetch client-side y muestra skeleton
}
```

## Consecuencias

- Carga inicial de página instantánea
- UX con skeleton en lugar de pantalla en blanco
- El layout también decodifica el JWT localmente (sin llamar a `/auth/me`)
