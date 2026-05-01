-- Novos campos na remessa (criados no Recebimento)
ALTER TABLE public.remessas
  ADD COLUMN IF NOT EXISTS qtd_processo numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS origem text,
  ADD COLUMN IF NOT EXISTS origem_outros text,
  ADD COLUMN IF NOT EXISTS divergencia_recebimento boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS divergencia_recebimento_comentario text;

-- Novos campos para a Conferência
ALTER TABLE public.remessas
  ADD COLUMN IF NOT EXISTS conferencia_inicio timestamptz,
  ADD COLUMN IF NOT EXISTS conferencia_termino timestamptz,
  ADD COLUMN IF NOT EXISTS conferencia_turno_inicio text,
  ADD COLUMN IF NOT EXISTS conferencia_turno_fim text,
  ADD COLUMN IF NOT EXISTS conferencia_divergencia boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS conferencia_divergencia_comentario text;

-- Materiais de amostras (até 5 linhas por remessa)
CREATE TABLE IF NOT EXISTS public.materiais_amostras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remessa_id uuid NOT NULL,
  ordem int NOT NULL DEFAULT 1,
  codigo text,
  quantidade numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.materiais_amostras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth view materiais"
  ON public.materiais_amostras FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth insert materiais"
  ON public.materiais_amostras FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "auth update materiais"
  ON public.materiais_amostras FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "admin manage materiais"
  ON public.materiais_amostras FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE TRIGGER trg_materiais_updated
  BEFORE UPDATE ON public.materiais_amostras
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();