ALTER TABLE public.remessas ADD COLUMN IF NOT EXISTS prioridade integer NOT NULL DEFAULT 999;
CREATE INDEX IF NOT EXISTS idx_remessas_prioridade ON public.remessas(prioridade);

-- Permitir que o próprio usuário apague suas bipagens enquanto remessa estiver em conferência
DROP POLICY IF EXISTS "user delete own conferencia em conferencia" ON public.conferencias;
CREATE POLICY "user delete own conferencia em conferencia"
ON public.conferencias
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.remessas r
    WHERE r.id = conferencias.remessa_id
      AND r.status IN ('aberta','em_conferencia')
  )
);