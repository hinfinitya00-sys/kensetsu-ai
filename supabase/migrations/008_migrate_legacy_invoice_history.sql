-- ============================================================
-- 008_migrate_legacy_invoice_history.sql
-- 旧 public.invoice の請求書を現行 public.invoices へ移行する。
-- 既存IDは重複登録せず、何度実行しても安全。
-- ============================================================

INSERT INTO public.invoices (
  id,
  company_id,
  invoice_no,
  recipient_name,
  total_amount,
  final_amount,
  remarks,
  created_at
)
SELECT
  legacy.id,
  legacy.company_id,
  legacy.invoice_no,
  legacy.client_name,
  ROUND(legacy.total_amount)::integer,
  ROUND(legacy.total_amount)::integer,
  CASE
    WHEN legacy.data IS NULL OR btrim(legacy.data) = '' THEN NULL
    ELSE '旧システムから移行したデータ: ' || legacy.data
  END,
  COALESCE(legacy.created_at, now())
FROM public.invoice AS legacy
WHERE legacy.company_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- 件数確認: legacy_count と current_count が一致すれば移行完了。
SELECT
  (SELECT count(*) FROM public.invoice WHERE company_id IS NOT NULL) AS legacy_count,
  (SELECT count(*) FROM public.invoices) AS current_count;
