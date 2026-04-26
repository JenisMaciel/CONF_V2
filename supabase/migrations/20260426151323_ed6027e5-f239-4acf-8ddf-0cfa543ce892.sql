
ALTER TABLE public.divergencias
  ADD COLUMN IF NOT EXISTS remessa_numero text,
  ADD COLUMN IF NOT EXISTS remessa_categoria text,
  ADD COLUMN IF NOT EXISTS finalizado_por uuid,
  ADD COLUMN IF NOT EXISTS finalizado_em timestamp with time zone;
