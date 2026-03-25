-- ============================================================
-- 建設業 工事日報システム — Supabase スキーマ
-- Supabase SQL Editor で実行してください
-- ============================================================

-- 拡張機能（uuid 自動生成）
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ────────────────────────────────────────────────────────────
-- 1. companies — 契約企業管理
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  email        text        UNIQUE NOT NULL,
  plan         text        NOT NULL DEFAULT 'basic',  -- basic / pro / enterprise
  status       text        NOT NULL DEFAULT 'active', -- active / suspended / cancelled
  api_key_hash text        UNIQUE NOT NULL,           -- SHA-256(会社APIキー)
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz                            -- NULL = 無期限
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_companies_api_key_hash ON companies (api_key_hash);
CREATE INDEX IF NOT EXISTS idx_companies_status       ON companies (status);

-- RLS（Row Level Security）— サービスロールキーのみアクセス可
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 2. usage_logs — API利用ログ
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usage_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        REFERENCES companies (id) ON DELETE SET NULL,
  action      text        NOT NULL DEFAULT 'generate_report',
  tokens_used integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_usage_logs_company_id ON usage_logs (company_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs (created_at DESC);

-- RLS
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 3. survey_responses — Google Forms の代替アンケート回答保存
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS survey_responses (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  q1_answer        text,       -- 一番大変な書類作業（自由記述）
  q2_company_size  text,       -- 会社規模（1-5人 / 6-20人 / 21-50人 / 51人以上）
  q3_prefecture    text,       -- 都道府県
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 4. projects — 工事プロジェクト管理
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid        NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  name       text        NOT NULL,
  work_type  text,
  client     text,
  location   text,
  status     text        NOT NULL DEFAULT '進行中',  -- 進行中 / 完了 / 中断
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_company_id ON projects (company_id);
CREATE INDEX IF NOT EXISTS idx_projects_name       ON projects (company_id, name);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 5. daily_logs — 日報ログ（1日1レコード）
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_logs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid        REFERENCES projects (id) ON DELETE SET NULL,
  company_id       uuid        NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  work_date        date,
  weather_am       text,
  weather_pm       text,
  work_description text,
  workers_count    integer,
  workers_detail   jsonb,      -- {civil, ope, traffic, other}
  equipment_used   jsonb,      -- [{name, count}, ...]
  safety_notes     text,
  quality_notes    text,
  progress_rate    integer,    -- 0〜100
  generated_report text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_logs_company_id  ON daily_logs (company_id);
CREATE INDEX IF NOT EXISTS idx_daily_logs_project_id  ON daily_logs (project_id);
CREATE INDEX IF NOT EXISTS idx_daily_logs_work_date   ON daily_logs (work_date DESC);

ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 6. site_photos — 現場写真管理
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_photos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid        REFERENCES projects (id) ON DELETE SET NULL,
  company_id  uuid        NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  log_id      uuid        REFERENCES daily_logs (id) ON DELETE SET NULL,
  photo_url   text        NOT NULL,              -- Supabase Storage の公開URL
  caption     text,                              -- 写真キャプション
  taken_at    date,                              -- 撮影日
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_photos_company_id  ON site_photos (company_id);
CREATE INDEX IF NOT EXISTS idx_site_photos_project_id  ON site_photos (project_id);
CREATE INDEX IF NOT EXISTS idx_site_photos_log_id      ON site_photos (log_id);
CREATE INDEX IF NOT EXISTS idx_site_photos_taken_at    ON site_photos (taken_at DESC);

ALTER TABLE site_photos ENABLE ROW LEVEL SECURITY;

-- 管理ダッシュボード用 SELECT ポリシー（必要に応じて有効化）
-- CREATE POLICY "site_photos_read" ON site_photos FOR SELECT TO anon USING (true);

-- ────────────────────────────────────────────────────────────
-- 7. invoices — 請求書
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid        NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
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
  items            jsonb,      -- [{desc, qty, unit, price, amt}, ...]
  subtotal         integer,
  tax_amount       integer,
  total_amount     integer,
  gensen_amount    integer,
  final_amount     integer,
  remarks          text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_company_id   ON invoices (company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_date ON invoices (invoice_date DESC);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- ────────────────────────────────────────────────────────────
-- 8. workers — 作業員マスタ
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workers (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  company     text        NOT NULL,
  daily_rate  integer     NOT NULL DEFAULT 15000,
  work_rates  jsonb       NOT NULL DEFAULT '{}',  -- {"作業種別": 単価, ...}
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workers_name      ON workers (name);
CREATE INDEX IF NOT EXISTS idx_workers_is_active ON workers (is_active);

ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workers_anon_all" ON workers FOR ALL TO anon USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 9. sites — 現場マスタ
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sites (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL UNIQUE,
  company    text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sites_anon_all" ON sites FOR ALL TO anon USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 10. attendance_logs — 出勤報告ログ
--     ※ absent_note カラムは存在しません。備考は absent_reason に結合して保存します。
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_logs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_date        date        NOT NULL,
  worker_id        uuid        REFERENCES workers (id) ON DELETE SET NULL,
  worker_name      text        NOT NULL,
  company          text,                         -- 現場会社名（元請）
  site_name        text,
  work_content     text,
  work_hours       numeric(5,2) DEFAULT 8.0,
  daily_rate       integer      DEFAULT 0,
  status           text        NOT NULL DEFAULT 'present',
                                                 -- present / absent / vacation / late
  absent_reason    text,                         -- 欠勤理由（備考も結合して格納）
  late_time        text,                         -- HH:MM 形式
  late_reason      text,
  meter_photo_url  text,
  submitted_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendance_logs_work_date    ON attendance_logs (work_date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_worker_name  ON attendance_logs (worker_name);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_status       ON attendance_logs (status);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_submitted_at ON attendance_logs (submitted_at DESC);

ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance_anon_all" ON attendance_logs FOR ALL TO anon USING (true) WITH CHECK (true);

-- サンプルデータ（テスト用 — 本番では削除してください）
-- API キー "TEST-API-KEY-12345" の SHA-256 ハッシュ
-- ────────────────────────────────────────────────────────────
-- INSERT INTO companies (name, email, plan, status, api_key_hash, expires_at)
-- VALUES (
--   'テスト建設株式会社',
--   'test@example.com',
--   'basic',
--   'active',
--   encode(digest('TEST-API-KEY-12345', 'sha256'), 'hex'),
--   now() + interval '1 year'
-- );
