-- 工事プロジェクト管理
CREATE TABLE IF NOT EXISTS photo_projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'tsubasa-kougyou',
  project_name TEXT NOT NULL,
  project_no TEXT,
  client_name TEXT,
  site_location TEXT,
  work_type TEXT,
  start_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI解析済み写真データ
CREATE TABLE IF NOT EXISTS site_photos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'tsubasa-kougyou',
  project_id UUID REFERENCES photo_projects(id) ON DELETE CASCADE,
  taken_at DATE DEFAULT CURRENT_DATE,
  photo_data TEXT,
  photo_category TEXT CHECK (photo_category IN
    ('着手前','施工中','完了','品質管理','安全管理','材料')),
  work_type_detected TEXT,
  description_ai TEXT,
  description_final TEXT,
  sort_order INTEGER DEFAULT 0,
  ai_processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE photo_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_photo_projects" ON photo_projects FOR ALL USING (true);
CREATE POLICY "allow_all_site_photos" ON site_photos FOR ALL USING (true);
