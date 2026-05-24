-- 単価マスタ（労務・材料・機械費）
CREATE TABLE IF NOT EXISTS price_master (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'tsubasa-kougyou',
  category TEXT NOT NULL CHECK (category IN ('labor','material','equipment','package')),
  item_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  unit TEXT NOT NULL,
  unit_price NUMERIC NOT NULL,
  prefecture TEXT DEFAULT '福岡県',
  valid_from DATE DEFAULT CURRENT_DATE,
  source TEXT,
  memo TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, item_code, prefecture)
);

-- 法面概算記録
CREATE TABLE IF NOT EXISTS slope_estimates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'tsubasa-kougyou',
  estimate_no TEXT,
  site_name TEXT,
  client_name TEXT,
  work_type TEXT NOT NULL,
  area_sqm NUMERIC NOT NULL,
  thickness_cm NUMERIC,
  prefecture TEXT DEFAULT '福岡県',
  options JSONB DEFAULT '{}',
  input_prices JSONB DEFAULT '{}',
  result_quick NUMERIC,
  result_detail NUMERIC,
  result_breakdown JSONB,
  transferred BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE price_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE slope_estimates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_price_master" ON price_master FOR ALL USING (true);
CREATE POLICY "allow_all_slope_estimates" ON slope_estimates FOR ALL USING (true);

-- 初期単価データ
INSERT INTO price_master (company_id, category, item_code, item_name, unit, unit_price, source) VALUES
('tsubasa-kougyou','material','MAT001','ラス金網','㎡',275,'翼工業実績R8'),
('tsubasa-kougyou','material','MAT002','主アンカー','本',155,'翼工業実績R8'),
('tsubasa-kougyou','material','MAT003','補助アンカー','本',29,'翼工業実績R8'),
('tsubasa-kougyou','material','MAT004','スペーサー','個',51,'翼工業実績R8'),
('tsubasa-kougyou','material','MAT005','キュアマット','巻',4400,'翼工業実績R8'),
('tsubasa-kougyou','material','MAT006','砂','㎥',5200,'翼工業実績R8'),
('tsubasa-kougyou','material','MAT007','セメント（25kg袋）','袋',700,'翼工業実績R8'),
('tsubasa-kougyou','material','MAT008','植生マット','㎡',380,'翼工業実績R8'),
('tsubasa-kougyou','material','MAT009','植生ピン','本',25,'翼工業実績R8'),
('tsubasa-kougyou','material','MAT010','種子吹付材料一式','㎡',650,'翼工業実績R8'),
('tsubasa-kougyou','labor','LAB001','ラス張工','㎡',945,'翼工業実績R8'),
('tsubasa-kougyou','labor','LAB002','モルタル吹付工','㎡',2430,'翼工業実績R8'),
('tsubasa-kougyou','labor','LAB003','種子吹付工','㎡',450,'翼工業概算R8'),
('tsubasa-kougyou','labor','LAB004','植生マット張工','㎡',350,'翼工業概算R8'),
('tsubasa-kougyou','equipment','EQP001','機械運搬費','式',200000,'翼工業実績R8'),
('tsubasa-kougyou','equipment','EQP002','機械設置費（搬入搬出）','式',300000,'翼工業実績R8'),
('tsubasa-kougyou','equipment','EQP003','法面整形工','式',150000,'翼工業実績R8'),
('tsubasa-kougyou','equipment','EQP004','法面清掃工','式',150000,'翼工業実績R8'),
('tsubasa-kougyou','package','PKG001','モルタル吹付7cm_東京基準','㎡',4800,'国交省R8施工パッケージ'),
('tsubasa-kougyou','package','PKG002','種子吹付_東京基準','㎡',1200,'国交省R8施工パッケージ'),
('tsubasa-kougyou','package','PKG003','植生マット_東京基準','㎡',950,'国交省R8施工パッケージ')
ON CONFLICT (company_id, item_code, prefecture) DO NOTHING;
