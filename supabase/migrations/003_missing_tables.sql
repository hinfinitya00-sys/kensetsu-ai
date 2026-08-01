-- ============================================================
-- 003_missing_tables.sql
-- user_companies / invoices テーブル追加
-- ============================================================

CREATE TABLE IF NOT EXISTS user_companies (
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, company_id)
);

ALTER TABLE user_companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS uc_sel ON user_companies;
CREATE POLICY uc_sel ON user_companies
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS uc_ins ON user_companies;
CREATE POLICY uc_ins ON user_companies
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- ============================================================

CREATE TABLE IF NOT EXISTS invoices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_no       TEXT,
  invoice_date     DATE,
  due_date         DATE,
  invoice_type     TEXT,
  project_name     TEXT,
  project_site     TEXT,
  project_no       TEXT,
  period_start     DATE,
  period_end       DATE,
  recipient_name   TEXT,
  recipient_person TEXT,
  issuer_name      TEXT,
  issuer_reg_num   TEXT,
  issuer_address   TEXT,
  issuer_tel       TEXT,
  issuer_bank      TEXT,
  items            JSONB,
  subtotal         INTEGER,
  tax_amount       INTEGER,
  total_amount     INTEGER,
  gensen_amount    INTEGER,
  final_amount     INTEGER,
  remarks          TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inv_sel ON invoices;
CREATE POLICY inv_sel ON invoices
  FOR SELECT USING (company_id IN (
    SELECT company_id FROM user_companies WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS inv_ins ON invoices;
CREATE POLICY inv_ins ON invoices
  FOR INSERT WITH CHECK (company_id IN (
    SELECT company_id FROM user_companies WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS inv_upd ON invoices;
CREATE POLICY inv_upd ON invoices
  FOR UPDATE USING (company_id IN (
    SELECT company_id FROM user_companies WHERE user_id = auth.uid()
  ));

-- hinfinitya00@gmail.com を最初の company に紐付け
DO $$
DECLARE
  v_user_id    UUID;
  v_company_id UUID;
BEGIN
  SELECT id INTO v_user_id    FROM auth.users   WHERE email = 'hinfinitya00@gmail.com' LIMIT 1;
  SELECT id INTO v_company_id FROM companies     LIMIT 1;
  IF v_user_id IS NOT NULL AND v_company_id IS NOT NULL THEN
    INSERT INTO user_companies (user_id, company_id, role)
    VALUES (v_user_id, v_company_id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
