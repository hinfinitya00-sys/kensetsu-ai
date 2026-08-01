-- 請求書履歴の所在確認（読み取り専用）

-- 現在の invoices テーブルにある履歴を会社別に表示
SELECT
  i.company_id,
  COALESCE(c.name, '会社マスタ未登録') AS company_name,
  COUNT(*) AS invoice_count,
  MIN(i.created_at) AS oldest_saved_at,
  MAX(i.created_at) AS newest_saved_at
FROM public.invoices AS i
LEFT JOIN public.companies AS c ON c.id = i.company_id
GROUP BY i.company_id, c.name
ORDER BY newest_saved_at DESC;

-- ログインユーザーが閲覧できる会社一覧
SELECT c.id AS company_id, c.name AS company_name, uc.role
FROM auth.users AS u
JOIN public.user_companies AS uc ON uc.user_id = u.id
JOIN public.companies AS c ON c.id = uc.company_id
WHERE lower(u.email) = lower('hinfinitya00@gmail.com')
ORDER BY c.name;

-- 旧テーブル invoice が残っているかの確認
SELECT to_regclass('public.invoice') AS legacy_invoice_table;
