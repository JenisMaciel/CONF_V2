-- Converter colunas de categoria de ENUM para TEXT livre (para aceitar Processo digitado manualmente)
ALTER TABLE public.remessas
  ALTER COLUMN categoria TYPE text USING categoria::text;

ALTER TABLE public.remessas
  ALTER COLUMN categoria DROP DEFAULT;

-- A coluna remessa_categoria em divergencias já é text — manter
-- Remover o enum se não estiver mais em uso em outras colunas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_class c ON a.attrelid = c.oid
    JOIN pg_type t ON a.atttypid = t.oid
    WHERE t.typname = 'categoria_remessa' AND a.attisdropped = false
  ) THEN
    DROP TYPE IF EXISTS public.categoria_remessa;
  END IF;
END $$;