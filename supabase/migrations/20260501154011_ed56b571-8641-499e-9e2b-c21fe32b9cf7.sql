
ALTER TABLE public.remessas REPLICA IDENTITY FULL;
ALTER TABLE public.remessa_itens REPLICA IDENTITY FULL;
ALTER TABLE public.conferencias REPLICA IDENTITY FULL;
ALTER TABLE public.divergencias REPLICA IDENTITY FULL;
ALTER TABLE public.materiais_amostras REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.remessas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.remessa_itens;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conferencias;
ALTER PUBLICATION supabase_realtime ADD TABLE public.divergencias;
ALTER PUBLICATION supabase_realtime ADD TABLE public.materiais_amostras;
