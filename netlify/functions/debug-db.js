'use strict';

// ── デバッグ用 DB 疎通確認エンドポイント ─────────────────────────
// 本番運用が安定したら削除してください
// 使用: GET /.netlify/functions/debug-db
// ──────────────────────────────────────────────────────────────

const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type':                 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  const result = {
    timestamp: new Date().toISOString(),
    env: {
      SUPABASE_URL:        SUPABASE_URL  ? `${SUPABASE_URL.slice(0, 30)}...` : '❌ 未設定',
      SUPABASE_SECRET_KEY: SUPABASE_SECRET_KEY ? `${SUPABASE_SECRET_KEY.slice(0, 8)}...（${SUPABASE_SECRET_KEY.length}文字）` : '❌ 未設定',
    },
    tables: {},
    errors: [],
  };

  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    result.errors.push('環境変数が未設定です');
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify(result, null, 2) };
  }

  const headers = {
    'apikey':        SUPABASE_SECRET_KEY,
    'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`,
    'Content-Type':  'application/json',
  };

  // 各テーブルの行数を確認（データ内容は返さない）
  for (const table of ['companies', 'projects', 'daily_logs', 'usage_logs']) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/${table}?select=id&limit=1`,
        { headers, method: 'HEAD' }
      );
      // Content-Range ヘッダーから件数取得
      const range = r.headers.get('content-range');
      result.tables[table] = r.ok
        ? `✅ アクセス可 (Content-Range: ${range || '不明'})`
        : `❌ エラー ${r.status}`;
    } catch (e) {
      result.tables[table] = `❌ 例外: ${e.message}`;
      result.errors.push(`${table}: ${e.message}`);
    }
  }

  // 最新のdaily_logs 1件のカラム名を確認（機密データなし）
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/daily_logs?select=id,work_date,progress_rate,generated_report&limit=1&order=created_at.desc`,
      { headers }
    );
    const data = await r.json().catch(() => null);
    if (r.ok && Array.isArray(data) && data.length > 0) {
      const row = data[0];
      result.latest_daily_log = {
        id:              row.id,
        work_date:       row.work_date,
        progress_rate:   row.progress_rate,
        has_report:      !!row.generated_report,
        report_length:   row.generated_report?.length || 0,
      };
    } else if (r.ok) {
      result.latest_daily_log = '（レコードなし）';
    } else {
      result.errors.push(`daily_logs latest fetch: ${r.status}`);
    }
  } catch (e) {
    result.errors.push(`daily_logs latest: ${e.message}`);
  }

  const status = result.errors.length === 0 ? 200 : 500;
  return { statusCode: status, headers: CORS_HEADERS, body: JSON.stringify(result, null, 2) };
};
