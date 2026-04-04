-- ============================================================
-- 002_fix_attendance_logs.sql
-- attendance_logs テーブルの不足カラムを追加 + RLS修正
--
-- worker-attendance.html が INSERT するカラム一覧:
--   work_date, worker_id, worker_name, company, site_name,
--   work_content, work_hours, daily_rate, status,
--   absent_reason, late_time, late_reason, meter_photo_url
--
-- ADD COLUMN IF NOT EXISTS を使用しているため、
-- すでに存在するカラムはスキップされ安全に実行できます。
-- ============================================================

ALTER TABLE attendance_logs
  -- 欠勤・遅刻関連
  ADD COLUMN IF NOT EXISTS absent_reason    TEXT,
  ADD COLUMN IF NOT EXISTS late_time        TEXT,                        -- HH:MM 形式
  ADD COLUMN IF NOT EXISTS late_reason      TEXT,

  -- 作業員情報
  ADD COLUMN IF NOT EXISTS worker_name      TEXT,
  ADD COLUMN IF NOT EXISTS worker_id        UUID REFERENCES workers (id) ON DELETE SET NULL,

  -- 勤務情報
  ADD COLUMN IF NOT EXISTS status           TEXT NOT NULL DEFAULT 'present',
  ADD COLUMN IF NOT EXISTS work_hours       NUMERIC(5,2)  DEFAULT 8.0,
  ADD COLUMN IF NOT EXISTS daily_rate       INTEGER       DEFAULT 0,

  -- 現場情報
  ADD COLUMN IF NOT EXISTS company          TEXT,                        -- 現場会社名（元請）
  ADD COLUMN IF NOT EXISTS site_name        TEXT,
  ADD COLUMN IF NOT EXISTS work_content     TEXT,

  -- メタ
  ADD COLUMN IF NOT EXISTS notes            TEXT,
  ADD COLUMN IF NOT EXISTS work_date        DATE          DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS submitted_at     TIMESTAMPTZ   DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS meter_photo_url  TEXT;

-- ============================================================
-- RLS ポリシー修正
-- worker-attendance.html は認証なしで書き込めるよう INSERT のみ許可。
-- 既存ポリシーが存在する場合はいったん DROP してから再作成。
-- ============================================================

-- 既存の全アクセスポリシーを削除（存在する場合）
DROP POLICY IF EXISTS "attendance_anon_all"    ON attendance_logs;
DROP POLICY IF EXISTS "attendance_anon_insert" ON attendance_logs;

-- anon ユーザーに INSERT のみ許可（QRコードアクセス用）
CREATE POLICY "attendance_anon_insert" ON attendance_logs
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- 認証済みユーザーには全操作を許可（管理画面用）
DROP POLICY IF EXISTS "attendance_auth_all" ON attendance_logs;
CREATE POLICY "attendance_auth_all" ON attendance_logs
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- スキーマキャッシュのリロード（PostgREST に変更を通知）
-- ============================================================
NOTIFY pgrst, 'reload schema';
