-- ============================================================
-- 005_provision_authenticated_companies.sql
-- Supabase Auth の既存ユーザーに会社を作成・紐付けする復旧用SQL。
-- SQL Editor で一度だけ実行する。
-- ============================================================

-- 新規登録時、ログイン済みユーザーが自社を作成できるようにする。
-- 旧スキーマの email / api_key_hash は認証方式では使用しないため任意にする。
ALTER TABLE public.companies ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.companies ALTER COLUMN api_key_hash DROP NOT NULL;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS companies_insert_authenticated ON public.companies;
CREATE POLICY companies_insert_authenticated ON public.companies
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS companies_select_own ON public.companies;
CREATE POLICY companies_select_own ON public.companies
  FOR SELECT TO authenticated
  USING (id IN (
    SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()
  ));

-- 会社未紐付けの既存ユーザーへ、メールアドレスを識別子にした会社を一件だけ作成する。
INSERT INTO public.companies (name, email)
SELECT
  COALESCE(NULLIF(u.raw_user_meta_data ->> 'company_name', ''), split_part(u.email, '@', 1)),
  u.email
FROM auth.users AS u
WHERE u.email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_companies AS uc WHERE uc.user_id = u.id
  )
ON CONFLICT (email) DO NOTHING;

-- 各ユーザーをメールアドレスが一致する会社へ管理者として紐付ける。
INSERT INTO public.user_companies (user_id, company_id, role)
SELECT u.id, c.id, 'admin'
FROM auth.users AS u
JOIN public.companies AS c ON c.email = u.email
WHERE u.email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_companies AS uc WHERE uc.user_id = u.id
  )
ON CONFLICT (user_id, company_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
