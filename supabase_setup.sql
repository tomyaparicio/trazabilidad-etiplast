-- ============================================================
-- CONFIGURACIÓN SUPABASE PARA ERP ETIPLAST
-- ============================================================
-- El frontend ahora usa Supabase directamente (sin backend FastAPI).
-- Ejecuta este SQL en Supabase:
--   1. Ve a https://supabase.com/dashboard
--   2. Selecciona tu proyecto
--   3. SQL Editor → New query
--   4. Pega todo este archivo y haz clic en Run
-- ============================================================

-- 1. Función para estadísticas del dashboard
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'total_clientes', (SELECT count(*)::int FROM clientes),
    'rubros', COALESCE(
      (SELECT json_agg(json_build_object('nombre', nombre, 'cantidad', cantidad) ORDER BY cantidad DESC)
       FROM (
         SELECT COALESCE(rubro, 'Sin rubro') AS nombre, count(*)::int AS cantidad
         FROM clientes GROUP BY rubro
       ) r),
      '[]'::json
    ),
    'provincias', COALESCE(
      (SELECT json_agg(json_build_object('nombre', nombre, 'cantidad', cantidad) ORDER BY cantidad DESC)
       FROM (
         SELECT COALESCE(provincia, 'Sin provincia') AS nombre, count(*)::int AS cantidad
         FROM clientes GROUP BY provincia ORDER BY cantidad DESC LIMIT 10
       ) p),
      '[]'::json
    )
  );
$$;

-- Permitir a usuarios autenticados ejecutar la función
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO anon;

-- 2. Políticas RLS para la tabla clientes (si no existen)
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

-- Permitir lectura a usuarios autenticados
DROP POLICY IF EXISTS "Allow authenticated read clientes" ON clientes;
CREATE POLICY "Allow authenticated read clientes" ON clientes
  FOR SELECT TO authenticated USING (true);

-- Permitir actualización a usuarios autenticados
DROP POLICY IF EXISTS "Allow authenticated update clientes" ON clientes;
CREATE POLICY "Allow authenticated update clientes" ON clientes
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Permitir inserción a usuarios autenticados
DROP POLICY IF EXISTS "Allow authenticated insert clientes" ON clientes;
CREATE POLICY "Allow authenticated insert clientes" ON clientes
  FOR INSERT TO authenticated WITH CHECK (true);

-- 3. Función para obtener filtros (rubros y provincias)
CREATE OR REPLACE FUNCTION public.get_filtros()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'rubros', COALESCE(
      (SELECT json_agg(r ORDER BY r) FROM (SELECT DISTINCT rubro AS r FROM clientes WHERE rubro IS NOT NULL) x),
      '[]'::json
    ),
    'provincias', COALESCE(
      (SELECT json_agg(p ORDER BY p) FROM (SELECT DISTINCT provincia AS p FROM clientes WHERE provincia IS NOT NULL) y),
      '[]'::json
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_filtros() TO authenticated;

-- 4. Migración: agregar columna transporte (qué transporta usa el cliente)
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS transporte TEXT;
