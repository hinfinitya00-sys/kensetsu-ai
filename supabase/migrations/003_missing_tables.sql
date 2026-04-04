-- ============================================================
-- 003_missing_tables.sql
-- user_companies / invoice テーブル追加
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

CREATE TABLE IF NOT EXISTS invoice (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES companies(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  invoice_no   TEXT,
  client_name  TEXT,
  total_amount NUMERIC,
  data         TEXT
);

ALTER TABLE invoice ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inv_sel ON invoice;
CREATE POLICY inv_sel ON invoice
  FOR SELECT USING (company_id IN (
    SELECT company_id FROM user_companies WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS inv_ins ON invoice;
CREATE POLICY inv_ins ON invoice
  FOR INSERT WITH CHECK (company_id IN (
    SELECT company_id FROM user_companies WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS inv_upd ON invoice;
CREATE POLICY inv_upd ON invoice
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
