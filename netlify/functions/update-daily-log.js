'use strict';

const crypto = require('crypto');

const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type':                 'application/json',
};

function json(statusCode, body) {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

async function sbFetch(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const prefer = options.method === 'PATCH' ? 'return=minimal' : 'return=representation';
  const res = await fetch(url, {
    ...options,
    headers: {
      'apikey':        SUPABASE_SECRET_KEY,
      'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        prefer,
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `Supabase ${res.status}`);
  }
  return data;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method Not Allowed' });
  }
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    console.error('[update-daily-log] 環境変数未設定');
    return json(500, { error: 'サーバー設定エラーが発生しました' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'リクエストの形式が不正です' });
  }

  const { company_api_key, log_id, form_data, report_text } = body;
  if (!company_api_key) return json(400, { error: '会社APIキーが必要です' });
  if (!log_id)          return json(400, { error: 'log_idが必要です' });

  // 会社確認
  const keyHash = hashKey(company_api_key);
  let company;
  try {
    const rows = await sbFetch(
      `companies?api_key_hash=eq.${encodeURIComponent(keyHash)}&select=id,status&limit=1`
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      return json(401, { error: '会社APIキーが無効です' });
    }
    company = rows[0];
  } catch (e) {
    console.error('[update-daily-log] company lookup failed:', e.message);
    return json(500, { error: 'DBエラー: ' + e.message });
  }

  if (company.status !== 'active') {
    return json(403, { error: `アカウントが無効です（状態: ${company.status}）` });
  }

  const d = form_data || {};

  // daily_logs のカラムに正しくマッピング
  const payload = {
    work_date:        d.workDate        || null,
    weather_am:       d.weatherAM       || null,
    weather_pm:       d.weatherPM       || null,
    work_description: d.workContent     || null,
    workers_count:    d.workerTotal != null ? Number(d.workerTotal) : null,
    workers_detail:   d.workers         ? JSON.stringify(d.workers)    : null,
    equipment_used:   d.equipment       ? JSON.stringify(d.equipment)  : null,
    safety_notes:     d.safetyNote      || null,
    quality_notes:    [
      d.workType     ? `工種: ${d.workType}`             : '',
      d.tomorrowPlan ? `明日の予定: ${d.tomorrowPlan}`   : '',
      d.remarks      ? `特記事項: ${d.remarks}`          : '',
    ].filter(Boolean).join('\n') || null,
    progress_rate:    d.progress != null ? Number(d.progress) : null,
    generated_report: report_text || null,
  };

  console.log('[update-daily-log] UPDATE log_id:', log_id, 'company_id:', company.id);

  try {
    // company_id を条件に含めることで他社のレコードを書き換えられないようにする
    await sbFetch(
      `daily_logs?id=eq.${encodeURIComponent(log_id)}&company_id=eq.${encodeURIComponent(company.id)}`,
      { method: 'PATCH', body: JSON.stringify(payload) }
    );
    console.log('[update-daily-log] UPDATE成功');
    return json(200, { ok: true });
  } catch (e) {
    console.error('[update-daily-log] UPDATE失敗:', e.message);
    return json(500, { error: 'DB更新エラー: ' + e.message });
  }
};
