'use strict';

const crypto = require('crypto');

// ── 環境変数 ────────────────────────────────────────────────
const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const OPENAI_API_KEY      = process.env.OPENAI_API_KEY;

// ── CORS ヘッダー ───────────────────────────────────────────
const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type':                 'application/json',
};

function json(statusCode, body) {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

// ── SHA-256 ハッシュ ────────────────────────────────────────
function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// ── Supabase REST API ───────────────────────────────────────
async function sbFetch(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'apikey':        SUPABASE_SECRET_KEY,
      'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error((data?.message || data?.error || `Supabase ${res.status}`));
  }
  return data;
}

// ── プロンプト構築 ──────────────────────────────────────────
function buildPrompt(d) {
  const dt = new Date(d.workDate + 'T00:00:00').toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  });
  const eqStr = (d.equipment || []).length
    ? d.equipment.map(e => `・${e.name} × ${e.count}台`).join('\n')
    : '（記録なし）';
  const wkr = d.workers || {};
  const wkrStr = `土木作業員:${wkr.civil || 0}名 / 重機オペレーター:${wkr.ope || 0}名 / 交通誘導員:${wkr.traffic || 0}名 / その他:${wkr.other || 0}名 / 合計:${d.workerTotal || 0}名`;

  const user = `
【工事名称】${d.projectName}
【現場名】${d.siteName || '—'}
【工事番号】${d.projectNo || '—'}
【元請会社】${d.contractor || '—'}
【現場代理人】${d.supervisor || '—'}
【作業日】${dt}
【天候】午前:${d.weatherAM} / 午後:${d.weatherPM}${d.temperature ? ` / 気温:${d.temperature}℃` : ''}
【作業員構成】${wkrStr}
【使用重機・機械】
${eqStr}
【工種】${d.workType}（進捗率:${d.progress}%）
【本日の作業内容】
${d.workContent || '（未記入）'}
【明日の作業予定】
${d.tomorrowPlan || '（未記入）'}
【特記事項】
${d.remarks || 'なし'}
【安全管理】朝礼:${d.morning || '未記入'} / KY活動:${d.ky || '未記入'} / ヒヤリハット:${d.hazard || '未記入'}${d.hazardDetail ? ` / 内容:${d.hazardDetail}` : ''}
${d.safetyNote ? `【安全指示事項】${d.safetyNote}` : ''}
【品質管理】検査・立会:${d.inspection || '未記入'}${d.inspDetail ? `（${d.inspDetail}）` : ''} / 写真撮影:${d.photoCount || '0'}枚
`.trim();

  const system = `あなたは土木・法面工事の経験豊富な現場監督です。
与えられた現場情報をもとに、A4一枚に収まる正式な工事日報をですます調で作成してください。

## 出力フォーマット（必ずこの通りに）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
　　　　　工　事　日　報
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【工事情報】
工事名称：〇〇〇〇〇
工事番号：〇〇〇　　現場名：〇〇〇
元請会社：〇〇〇　　現場代理人：〇〇〇

【作業日時・天候】
作業日：〇年〇月〇日（〇）
天候：午前 〇〇 ／ 午後 〇〇　　気温：〇〇

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【作業員構成】　計〇名
土木作業員〇名　重機オペ〇名　交通誘導員〇名　その他〇名

【使用重機・機械】
（機械名と台数を列挙）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【本日の作業概要】
工種：〇〇　　進捗率：〇〇%
（2〜3文で簡潔にですます調で）

【作業詳細】
（入力内容を整形し箇条書きで具体的に。専門用語を適切に使用。）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【安全管理】
朝礼：〇〇　KY活動：〇〇　ヒヤリハット：〇〇
（ヒヤリハットがある場合は内容を記載）
（安全指示事項を記載。入力がない場合も一般的な法面工事の安全注意事項を1〜2点補足。）

【品質管理】
検査・立会：〇〇（内容）
写真撮影：〇〇枚

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【明日の作業予定】
（入力内容を整形。未記入の場合は今日の作業の流れから自然に推測。）

【特記事項・所見】
（入力内容を記載。未記入なら「特になし」。）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
作成日時：〇年〇月〇日 〇〇:〇〇
担当者：＿＿＿＿＿＿＿＿＿＿＿＿（署名）

## 注意事項
- ですます調で統一すること
- マークダウン記法（**太字**など）は一切使わない
- A4一枚に収まる分量（800〜1100文字程度）
- 専門用語（法枠、グラウンドアンカー、切土、盛土、法肩、法尻など）を適切に使用
- 現在時刻を「作成日時」に記入すること`;

  return { system, user };
}

// ── メインハンドラー ────────────────────────────────────────
exports.handler = async (event) => {
  // CORS プリフライト
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method Not Allowed' });
  }

  // 環境変数チェック
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !OPENAI_API_KEY) {
    console.error('[generate-report] 環境変数未設定');
    return json(500, { error: 'サーバー設定エラーが発生しました' });
  }

  // リクエストパース
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'リクエストの形式が不正です' });
  }

  const { company_api_key, form_data } = body;
  if (!company_api_key) return json(400, { error: '会社APIキーが必要です' });
  if (!form_data)       return json(400, { error: 'フォームデータが必要です' });

  // ── STEP 1: 契約確認 ───────────────────────────────────────
  const keyHash = hashKey(company_api_key);
  let company;
  try {
    const rows = await sbFetch(
      `companies?api_key_hash=eq.${encodeURIComponent(keyHash)}&select=id,name,plan,status,expires_at`
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      return json(401, { error: '会社APIキーが無効です。管理者にお問い合わせください。' });
    }
    company = rows[0];
  } catch (e) {
    console.error('[generate-report] Supabase lookup error:', e.message);
    return json(500, { error: 'データベースエラーが発生しました' });
  }

  if (company.status !== 'active') {
    return json(403, { error: `アカウントが無効です（状態: ${company.status}）。管理者にお問い合わせください。` });
  }
  if (company.expires_at && new Date(company.expires_at) < new Date()) {
    return json(403, { error: '契約期限が切れています。更新手続きをお願いします。' });
  }

  // ── STEP 2: OpenAI 呼び出し ────────────────────────────────
  const { system, user } = buildPrompt(form_data);
  let reportText = '';
  let tokensUsed = 0;

  try {
    const oaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model:       'gpt-4o',
        messages:    [{ role: 'system', content: system }, { role: 'user', content: user }],
        max_tokens:  2000,
        temperature: 0.55,
      }),
    });

    if (!oaiRes.ok) {
      const e = await oaiRes.json().catch(() => ({}));
      throw new Error(e.error?.message || `OpenAI HTTP ${oaiRes.status}`);
    }

    const oaiData = await oaiRes.json();
    reportText = oaiData.choices?.[0]?.message?.content?.trim() || '';
    tokensUsed = oaiData.usage?.total_tokens || 0;

    if (!reportText) throw new Error('AIからの応答が空でした');
  } catch (e) {
    console.error('[generate-report] OpenAI error:', e.message);
    return json(502, { error: 'AI日報生成エラー: ' + e.message });
  }

  // ── STEP 3: 利用ログ記録 ───────────────────────────────────
  try {
    await sbFetch('usage_logs', {
      method: 'POST',
      body: JSON.stringify({
        company_id:  company.id,
        action:      'generate_report',
        tokens_used: tokensUsed,
      }),
    });
  } catch (e) {
    console.error('[generate-report] usage_logs insert failed:', e.message);
  }

  // ── STEP 4: プロジェクト自動作成 or 取得 ───────────────────
  let projectId = null;
  try {
    const projectName = (form_data.projectName || '').trim();
    if (projectName) {
      const existing = await sbFetch(
        `projects?company_id=eq.${encodeURIComponent(company.id)}&name=eq.${encodeURIComponent(projectName)}&select=id&limit=1`
      );
      if (Array.isArray(existing) && existing.length > 0) {
        projectId = existing[0].id;
      } else {
        const created = await sbFetch('projects', {
          method: 'POST',
          body: JSON.stringify({
            name:       projectName,
            work_type:  form_data.workType   || null,
            client:     form_data.contractor || null,
            location:   form_data.siteName   || null,
            status:     '進行中',
            company_id: company.id,
          }),
        });
        projectId = Array.isArray(created) ? created[0]?.id : created?.id;
      }
    }
  } catch (e) {
    console.error('[generate-report] project upsert failed:', e.message);
  }

  // ── STEP 5: daily_logs に保存 ──────────────────────────────
  let logId = null;
  try {
    const logRow = await sbFetch('daily_logs', {
      method: 'POST',
      body: JSON.stringify({
        project_id:        projectId,
        company_id:        company.id,
        work_date:         form_data.workDate        || null,
        weather_am:        form_data.weatherAM       || null,
        weather_pm:        form_data.weatherPM       || null,
        work_description:  form_data.workContent     || null,
        workers_count:     form_data.workerTotal      ?? null,
        workers_detail:    form_data.workers   || null,   // jsonbにはオブジェクトをそのまま渡す
        equipment_used:    form_data.equipment || null,   // jsonbにはarrayをそのまま渡す
        safety_notes:      form_data.safetyNote       || null,
        quality_notes:     [
          form_data.workType    ? `工種: ${form_data.workType}` : '',
          form_data.tomorrowPlan ? `明日の予定: ${form_data.tomorrowPlan}` : '',
          form_data.remarks     ? `特記事項: ${form_data.remarks}` : '',
        ].filter(Boolean).join('\n') || null,
        progress_rate:     form_data.progress != null ? Number(form_data.progress) : null,
        generated_report:  reportText,
      }),
    });
    logId = Array.isArray(logRow) ? logRow[0]?.id : logRow?.id;
    console.log('[generate-report] daily_logs INSERT ok, id:', logId);
  } catch (e) {
    console.error('[generate-report] daily_logs insert failed:', e.message);
  }

  return json(200, { report: reportText, log_id: logId });
};
