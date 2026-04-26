
-- Enum de papéis
CREATE TYPE public.app_role AS ENUM ('master', 'admin', 'user');

-- Enum de categorias
CREATE TYPE public.categoria_remessa AS ENUM ('HISENSE', 'TOSHIBA', 'MULTI', 'OPPO', 'ZTE');

-- Enum de status remessa
CREATE TYPE public.status_remessa AS ENUM ('aberta', 'em_conferencia', 'finalizada', 'recebida');

-- Enum de status divergência
CREATE TYPE public.status_divergencia AS ENUM ('pendente', 'ajustado');

-- Função timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role security definer
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- is_admin (admin OR master)
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','master'))
$$;

-- Trigger: cria profile e role 'user' ao registrar
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Profiles policies
CREATE POLICY "auth users view profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admin update any profile" ON public.profiles FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "admin insert profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()) OR auth.uid() = user_id);

-- User roles policies
CREATE POLICY "users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "master manages roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'master')) WITH CHECK (public.has_role(auth.uid(),'master'));
CREATE POLICY "admin assigns user role" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()) AND role = 'user');

-- App settings (linha única id=1)
CREATE TABLE public.app_settings (
  id INT PRIMARY KEY DEFAULT 1,
  app_name TEXT NOT NULL DEFAULT 'Conferência de Devolução',
  logo_url TEXT,
  login_image_url TEXT,
  background_url TEXT,
  card_text_color TEXT DEFAULT '#ffffff',
  card_bg_color TEXT DEFAULT '#1e293b',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT only_one_row CHECK (id = 1)
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.app_settings (id) VALUES (1);
CREATE POLICY "anyone reads settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "master updates settings" ON public.app_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'master'));

-- Remessas
CREATE TABLE public.remessas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT NOT NULL,
  categoria categoria_remessa NOT NULL,
  status status_remessa NOT NULL DEFAULT 'aberta',
  total_itens INT NOT NULL DEFAULT 0,
  total_qtd_esperada NUMERIC NOT NULL DEFAULT 0,
  criado_por UUID REFERENCES auth.users(id),
  recebido_por UUID REFERENCES auth.users(id),
  finalizada_em TIMESTAMPTZ,
  recebida_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.remessas ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_remessas_updated BEFORE UPDATE ON public.remessas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_remessas_status ON public.remessas(status);
CREATE INDEX idx_remessas_categoria ON public.remessas(categoria);

CREATE POLICY "auth view remessas" ON public.remessas FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage remessas" ON public.remessas FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "users update remessa progresso" ON public.remessas FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

-- Itens da remessa
CREATE TABLE public.remessa_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remessa_id UUID NOT NULL REFERENCES public.remessas(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  qtd_esperada NUMERIC NOT NULL DEFAULT 0,
  qtd_conferida NUMERIC NOT NULL DEFAULT 0,
  recebido_por UUID REFERENCES auth.users(id),
  recebido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.remessa_itens ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_itens_remessa ON public.remessa_itens(remessa_id);
CREATE INDEX idx_itens_codigo ON public.remessa_itens(codigo);

CREATE POLICY "auth view itens" ON public.remessa_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth update itens" ON public.remessa_itens FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "admin manage itens" ON public.remessa_itens FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Conferências (registro de cada bipagem)
CREATE TABLE public.conferencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remessa_id UUID NOT NULL REFERENCES public.remessas(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.remessa_itens(id) ON DELETE SET NULL,
  codigo TEXT NOT NULL,
  quantidade NUMERIC NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.conferencias ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_conf_remessa ON public.conferencias(remessa_id);

CREATE POLICY "auth view conferencias" ON public.conferencias FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert conferencias" ON public.conferencias FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admin manage conferencias" ON public.conferencias FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Divergências
CREATE TABLE public.divergencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remessa_id UUID NOT NULL REFERENCES public.remessas(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.remessa_itens(id) ON DELETE SET NULL,
  codigo TEXT NOT NULL,
  descricao TEXT,
  qtd_esperada NUMERIC NOT NULL,
  qtd_conferida NUMERIC NOT NULL,
  diferenca NUMERIC NOT NULL,
  status status_divergencia NOT NULL DEFAULT 'pendente',
  ajustado_por UUID REFERENCES auth.users(id),
  ajustado_em TIMESTAMPTZ,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.divergencias ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_div_updated BEFORE UPDATE ON public.divergencias FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_div_remessa ON public.divergencias(remessa_id);
CREATE INDEX idx_div_status ON public.divergencias(status);

CREATE POLICY "auth view div" ON public.divergencias FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage div" ON public.divergencias FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "auth insert div" ON public.divergencias FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth update div" ON public.divergencias FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

-- Storage bucket para personalização
INSERT INTO storage.buckets (id, name, public) VALUES ('app-assets', 'app-assets', true);
CREATE POLICY "public read app-assets" ON storage.objects FOR SELECT USING (bucket_id = 'app-assets');
CREATE POLICY "admin upload app-assets" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'app-assets' AND public.is_admin(auth.uid()));
CREATE POLICY "admin update app-assets" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'app-assets' AND public.is_admin(auth.uid()));
CREATE POLICY "admin delete app-assets" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'app-assets' AND public.is_admin(auth.uid()));
