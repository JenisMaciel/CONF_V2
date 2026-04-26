-- Garante REPLICA IDENTITY FULL para receber todos os campos nos eventos realtime
ALTER TABLE public.remessas REPLICA IDENTITY FULL;
ALTER TABLE public.remessa_itens REPLICA IDENTITY FULL;
ALTER TABLE public.conferencias REPLICA IDENTITY FULL;
ALTER TABLE public.divergencias REPLICA IDENTITY FULL;
ALTER TABLE public.app_settings REPLICA IDENTITY FULL;

-- Adiciona as tabelas à publicação supabase_realtime (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='remessas') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.remessas';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='remessa_itens') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.remessa_itens';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='conferencias') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.conferencias';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='divergencias') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.divergencias';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='app_settings') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings';
  END IF;
END$$;