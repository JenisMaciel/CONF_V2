
DO $$
DECLARE
  new_user_id uuid := gen_random_uuid();
BEGIN
  -- Insere o usuário em auth.users com senha criptografada
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, recovery_sent_at, last_sign_in_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated',
    'authenticated',
    'jenis.maciel@grupomultilaser.com.br',
    crypt('Santos@1995', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Jenis Maciel"}',
    now(), now(), '', '', '', ''
  );

  -- Identidade
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (
    gen_random_uuid(), new_user_id,
    format('{"sub":"%s","email":"%s"}', new_user_id, 'jenis.maciel@grupomultilaser.com.br')::jsonb,
    'email', new_user_id::text, now(), now(), now()
  );

  -- Garantir profile (caso o trigger não tenha rodado)
  INSERT INTO public.profiles (user_id, email, display_name)
  VALUES (new_user_id, 'jenis.maciel@grupomultilaser.com.br', 'Jenis Maciel')
  ON CONFLICT DO NOTHING;

  -- Remover role padrão 'user' criada pelo trigger e atribuir 'master'
  DELETE FROM public.user_roles WHERE user_id = new_user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (new_user_id, 'master');
END $$;
