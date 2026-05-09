-- ─────────────────────────────────────────────────────────────────────────────
-- VISITAS DE PÁGINA — ejecutar en el SQL Editor de Supabase
-- ─────────────────────────────────────────────────────────────────────────────

-- Tabla de visitas
CREATE TABLE IF NOT EXISTS page_views (
  id         bigserial    PRIMARY KEY,
  page       text         NOT NULL,
  user_role  text         NOT NULL DEFAULT 'anonymous',
  visited_at timestamptz  NOT NULL DEFAULT now()
);

-- Índice para queries por fecha (stats del admin)
CREATE INDEX IF NOT EXISTS idx_page_views_visited_at ON page_views (visited_at DESC);

-- Función para registrar una visita — accesible por anon, nunca retorna datos
CREATE OR REPLACE FUNCTION log_page_view(p_page text, p_role text DEFAULT 'anonymous')
RETURNS void
SECURITY DEFINER SET search_path = public
LANGUAGE sql AS $$
  INSERT INTO page_views (page, user_role) VALUES (p_page, p_role);
$$;
GRANT EXECUTE ON FUNCTION log_page_view TO anon;

-- Función para consultar estadísticas (últimos 30 días agrupado por página y día)
CREATE OR REPLACE FUNCTION get_page_view_stats()
RETURNS TABLE(page text, day date, total bigint)
SECURITY DEFINER SET search_path = public
LANGUAGE sql AS $$
  SELECT page, visited_at::date AS day, COUNT(*) AS total
  FROM page_views
  WHERE visited_at >= now() - INTERVAL '30 days'
  GROUP BY page, visited_at::date
  ORDER BY day DESC, total DESC;
$$;
GRANT EXECUTE ON FUNCTION get_page_view_stats TO anon;
