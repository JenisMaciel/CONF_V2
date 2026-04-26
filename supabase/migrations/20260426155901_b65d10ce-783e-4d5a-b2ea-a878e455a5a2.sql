
CREATE TABLE public.email_destinatarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_destinatarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth view destinatarios"
  ON public.email_destinatarios FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "admin manage destinatarios"
  ON public.email_destinatarios FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER update_email_destinatarios_updated_at
  BEFORE UPDATE ON public.email_destinatarios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
