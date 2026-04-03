/**
 * js/auth.js — 建設AI マルチテナント認証モジュール
 *
 * 使い方:
 *   保護ページの <head> 先頭に以下を追加するだけ:
 *     <script src="js/auth.js"></script>
 *     <script>KS_AUTH.checkAuth();</script>
 *
 * API:
 *   KS_AUTH.login(apiKey)   → Promise<{ok, session, error}>  ログイン
 *   KS_AUTH.logout()        → void                           ログアウト
 *   KS_AUTH.checkAuth()     → session | null                 未認証なら login.html へリダイレクト
 *   KS_AUTH.getSession()    → session | null                 現在のセッションを返す
 *
 * Supabase 設定キー（admin.html の localStorage キーと共通）:
 *   dr_sb_url  ... Supabase Project URL
 *   dr_sb_key  ... Supabase anon key
 */

'use strict';

const KS_AUTH = (() => {
  // ─── 定数 ───────────────────────────────────────────────────
  const SESSION_KEY = 'ks_auth_session';
  const TTL_MS      = 24 * 60 * 60 * 1000; // セッション有効期間: 24時間
  const SB_URL_KEY  = 'dr_sb_url';
  const SB_KEY_KEY  = 'dr_sb_key';

  // ─── Supabase 設定取得 ───────────────────────────────────────
  function _sbCfg() {
    return {
      url: localStorage.getItem(SB_URL_KEY) || '',
      key: localStorage.getItem(SB_KEY_KEY) || '',
    };
  }

  // ─── SHA-256 ハッシュ (Web Crypto API) ──────────────────────
  async function _sha256(text) {
    const buf = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(text)
    );
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // ─── login.html への相対パスを解決 ───────────────────────────
  function _loginUrl(returnPath) {
    // 同一ディレクトリの login.html を参照（GitHub Pages / ローカル両対応）
    const base = location.pathname.replace(/\/[^/]*$/, '/');
    const ret  = encodeURIComponent(returnPath || location.pathname + location.search);
    return base + 'login.html?return=' + ret;
  }

  // ─── セッション取得 ──────────────────────────────────────────
  function getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !s.expires) return null;
      if (Date.now() >= s.expires) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return s;
    } catch {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
  }

  // ─── 認証チェック（保護ページの先頭で呼ぶ）─────────────────
  function checkAuth() {
    const s = getSession();
    if (!s) {
      location.replace(_loginUrl());
      return null;
    }
    return s;
  }

  // ─── ログアウト ──────────────────────────────────────────────
  function logout() {
    localStorage.removeItem(SESSION_KEY);
    location.replace(_loginUrl());
  }

  // ─── ログイン（Supabase API キー認証）───────────────────────
  async function login(apiKey) {
    if (!apiKey || !apiKey.trim()) {
      return { ok: false, error: 'APIキーを入力してください' };
    }

    const { url, key } = _sbCfg();
    if (!url || !key) {
      return {
        ok: false,
        error: 'Supabase設定が未完了です。管理画面の⚙️設定から入力してください。',
      };
    }

    try {
      const hash = await _sha256(apiKey.trim());

      // ── ① マイグレーションで作成した RPC を優先 ─────────────
      // supabase/001_auth_multitenant.sql に verify_api_key(p_key_hash text) が
      // 定義されている想定。SECURITY DEFINER で RLS を bypass する。
      let company = null;

      const rpcRes = await fetch(`${url}/rest/v1/rpc/verify_api_key`, {
        method:  'POST',
        headers: {
          apikey:          key,
          Authorization:   `Bearer ${key}`,
          'Content-Type':  'application/json',
          Prefer:          'return=representation',
        },
        body: JSON.stringify({ p_key_hash: hash }),
      });

      if (rpcRes.ok) {
        const data = await rpcRes.json();
        // RPC が単一オブジェクトを返す場合と配列の場合の両方に対応
        const row = Array.isArray(data) ? data[0] : data;
        if (row && row.id) company = row;
      }

      // ── ② RPC 未定義(404) の場合は直接 REST クエリにフォールバック ──
      // ※ companies テーブルに RLS ポリシー "allow anon by hash" が
      //   001_auth_multitenant.sql で追加されていれば有効
      if (!company) {
        const qRes = await fetch(
          `${url}/rest/v1/companies` +
          `?api_key_hash=eq.${encodeURIComponent(hash)}` +
          `&status=eq.active` +
          `&select=id,name,plan,expires_at`,
          {
            headers: {
              apikey:        key,
              Authorization: `Bearer ${key}`,
            },
          }
        );
        if (qRes.ok) {
          const rows = await qRes.json();
          if (rows && rows.length) company = rows[0];
        }
      }

      // ── 結果判定 ──────────────────────────────────────────────
      if (!company) {
        return { ok: false, error: 'APIキーが正しくありません' };
      }
      if (company.expires_at && new Date(company.expires_at) < new Date()) {
        return { ok: false, error: 'このAPIキーは有効期限切れです' };
      }

      // ── セッション作成 ────────────────────────────────────────
      const session = {
        companyId:   company.id,
        companyName: company.name,
        plan:        company.plan || 'basic',
        apiKey:      apiKey.trim(),
        expires:     Date.now() + TTL_MS,
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));

      // 既存コードが dr_cak から API キーを読んでいるため同期
      localStorage.setItem('dr_cak', apiKey.trim());

      return { ok: true, session };

    } catch (err) {
      console.error('[KS_AUTH] login error:', err);
      return { ok: false, error: 'ネットワークエラーが発生しました。接続を確認してください。' };
    }
  }

  // ─── 公開 API ────────────────────────────────────────────────
  return { login, logout, checkAuth, getSession };
})();
