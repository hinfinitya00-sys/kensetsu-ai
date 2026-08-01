-- ============================================================
-- 004_create_invoices.sql
-- invoice.html が使用する public.invoices テーブルを作成する。
-- Supabase SQL Editor で一度だけ実行する。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.invoices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_no       text,
  invoice_date     date,
  due_date         date,
  invoice_type     text,
  project_name     text,
  project_site     text,
  project_no       text,
  period_start     date,
  period_end       date,
  recipient_name   text,
  recipient_person text,
  issuer_name      text,
  issuer_reg_num   text,
  issuer_address   text,
  issuer_tel       text,
  issuer_bank      text,
  items            jsonb,
  subtotal         integer,
  tax_amount       integer,
  total_amount     integer,
  gensen_amount    integer,
  final_amount     integer,
  remarks          text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_company_id ON public.invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_date ON public.invoices(invoice_date DESC);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoices_select_own_company ON public.invoices;
CREATE POLICY invoices_select_own_company ON public.invoices
  FOR SELECT TO authenticated
  USING (company_id IN (
    SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS invoices_insert_own_company ON public.invoices;
CREATE POLICY invoices_insert_own_company ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (
    SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS invoices_update_own_company ON public.invoices;
CREATE POLICY invoices_update_own_company ON public.invoices
  FOR UPDATE TO authenticated
  USING (company_id IN (
    SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()
  ))
  WITH CHECK (company_id IN (
    SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS invoices_delete_own_company ON public.invoices;
CREATE POLICY invoices_delete_own_company ON public.invoices
  FOR DELETE TO authenticated
  USING (company_id IN (
    SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()
  ));

NOTIFY pgrst, 'reload schema';
