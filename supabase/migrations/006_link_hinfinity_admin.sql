-- ============================================================
-- 006_link_hinfinity_admin.sql
-- hinfinitya00@gmail.com の会社紐付けを確実に復旧する一回限りのSQL。
-- Supabase SQL Editor で実行する。
-- ============================================================

ALTER TABLE public.companies ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.companies ALTER COLUMN api_key_hash DROP NOT NULL;

DO $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_email constant text := 'hinfinitya00@gmail.com';
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(v_email)
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authユーザー % が見つかりません。ログイン画面のメールアドレスを確認してください。', v_email;
  END IF;

  -- すでに紐付いている場合はその会社を維持する。
  SELECT company_id INTO v_company_id
  FROM public.user_companies
  WHERE user_id = v_user_id
  LIMIT 1;

  -- メールアドレスに対応する既存会社を優先する。
  IF v_company_id IS NULL THEN
    SELECT id INTO v_company_id
    FROM public.companies
    WHERE lower(email) = lower(v_email)
    ORDER BY created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  -- 会社がなければ、このログインアカウント専用の会社を作成する。
  IF v_company_id IS NULL THEN
    INSERT INTO public.companies (name, email)
    VALUES ('hinfinitya00', v_email)
    RETURNING id INTO v_company_id;
  END IF;

  INSERT INTO public.user_companies (user_id, company_id, role)
  VALUES (v_user_id, v_company_id, 'admin')
  ON CONFLICT (user_id, company_id) DO UPDATE SET role = EXCLUDED.role;
END $$;

-- 実行結果確認: 1行表示されれば復旧完了。
SELECT u.email, c.id AS company_id, c.name AS company_name, uc.role
FROM auth.users AS u
JOIN public.user_companies AS uc ON uc.user_id = u.id
JOIN public.companies AS c ON c.id = uc.company_id
WHERE lower(u.email) = lower('hinfinitya00@gmail.com');

NOTIFY pgrst, 'reload schema';
