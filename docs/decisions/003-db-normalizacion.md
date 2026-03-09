# ADR 003 — Normalización 3NF de la base de datos

**Estado:** Implementado

## Contexto

El esquema original tenía una tabla `clientes` con todos los datos en columnas planas (localidad, provincia como strings, producto embebido, etc.).

## Decisión

Esquema normalizado a 3FN:

| Tabla | Propósito |
|-------|-----------|
| `clientes` | Datos de identidad (marca, razón social, CUIT, rubro_id) |
| `cliente_ubicaciones` | Ubicación geográfica (1:1) |
| `cliente_contactos` | Datos de contacto (1:1) |
| `cliente_productos` | Especificaciones de producto (1:N) |
| `rubros` | Catálogo de rubros |
| `provincias` | Catálogo de provincias |

## API pública

El `to_dict()` de `Cliente` devuelve una estructura **plana** para compatibilidad con el frontend existente — los joins se hacen en el modelo, no en el router.

## Consecuencias

- Sin duplicación de datos (rubros y provincias como catálogos)
- Más fácil agregar múltiples productos por cliente en el futuro
- El frontend recibe la misma estructura que antes (migración transparente)
