-- ============================================================
-- 008_migrate_legacy_invoice_history.sql
-- 旧 public.invoice の請求書を現行 public.invoices へ移行する。
-- 既存IDは重複登録せず、何度実行しても安全。
-- ============================================================

-- to_jsonb を経由することで、旧テーブルに存在しない列を参照せずに移行する。
INSERT INTO public.invoices (
  id, company_id, invoice_no, invoice_date, due_date, invoice_type,
  project_name, project_site, project_no, period_start, period_end,
  recipient_name, recipient_person, issuer_name, issuer_reg_num,
  issuer_address, issuer_tel, issuer_bank, items, subtotal, tax_amount,
  total_amount, gensen_amount, final_amount, remarks, created_at
)
SELECT
  (legacy.row ->> 'id')::uuid,
  (legacy.row ->> 'company_id')::uuid,
  legacy.row ->> 'invoice_no',
  NULLIF(legacy.row ->> 'invoice_date', '')::date,
  NULLIF(legacy.row ->> 'due_date', '')::date,
  legacy.row ->> 'invoice_type',
  legacy.row ->> 'project_name',
  legacy.row ->> 'project_site',
  legacy.row ->> 'project_no',
  NULLIF(legacy.row ->> 'period_start', '')::date,
  NULLIF(legacy.row ->> 'period_end', '')::date,
  COALESCE(legacy.row ->> 'recipient_name', legacy.row ->> 'client_name'),
  legacy.row ->> 'recipient_person',
  legacy.row ->> 'issuer_name',
  legacy.row ->> 'issuer_reg_num',
  legacy.row ->> 'issuer_address',
  legacy.row ->> 'issuer_tel',
  legacy.row ->> 'issuer_bank',
  legacy.row -> 'items',
  NULLIF(legacy.row ->> 'subtotal', '')::numeric::integer,
  NULLIF(legacy.row ->> 'tax_amount', '')::numeric::integer,
  NULLIF(legacy.row ->> 'total_amount', '')::numeric::integer,
  NULLIF(legacy.row ->> 'gensen_amount', '')::numeric::integer,
  COALESCE(
    NULLIF(legacy.row ->> 'final_amount', '')::numeric::integer,
    NULLIF(legacy.row ->> 'total_amount', '')::numeric::integer
  ),
  COALESCE(legacy.row ->> 'remarks', legacy.row ->> 'data'),
  COALESCE(NULLIF(legacy.row ->> 'created_at', '')::timestamptz, now())
FROM (
  SELECT to_jsonb(legacy) AS row
  FROM public.invoice AS legacy
) AS legacy
WHERE legacy.row ->> 'company_id' IS NOT NULL
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- 件数確認: current_count が legacy_count 以上なら、旧データは移行済み。
SELECT
  (SELECT count(*) FROM public.invoice WHERE company_id IS NOT NULL) AS legacy_count,
  (SELECT count(*) FROM public.invoices) AS current_count;
