/**
 * js/auth.js — 建設AI Supabase Auth 認証モジュール (v2)
 *
 * 使い方（保護ページの <head> 先頭）:
 *   <script src="js/auth.js"></script>
 *   <script>KS_AUTH.checkAuth();</script>
 *
 * API:
 *   KS_AUTH.checkAuth()      → Promise<session|null>  未認証なら login.html へ
 *   KS_AUTH.getSession()     → object|null            キャッシュ済み会社情報
 *   KS_AUTH.getCompanyId()   → string|null
 *   KS_AUTH.getCompanyName() → string|null
 *   KS_AUTH.logout()         → Promise<void>
 *
 * Supabase 設定（localStorage）:
 *   dr_sb_url  ... Supabase Project URL
 *   dr_sb_key  ... Supabase anon key
 */

'use strict';

const KS_AUTH = (() => {

  /* ── 定数 ─────────────────────────────────────── */
  const SB_URL_KEY  = 'dr_sb_url';
  const SB_KEY_KEY  = 'dr_sb_key';
  const COMPANY_KEY = 'ks_company';
  const CDN_URL     = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  let companyOptions = [];

  /* ── Supabase クライアント生成 ─────────────────── */
  function _client() {
    const url = localStorage.getItem(SB_URL_KEY);
    const key = localStorage.getItem(SB_KEY_KEY);
    if (!url || !key) return null;
    if (typeof window.supabase === 'undefined') return null;
    return window.supabase.createClient(url, key);
  }

  /* ── CDN 非同期ロード ──────────────────────────── */
  function _loadCDN() {
    return new Promise((resolve, reject) => {
      if (typeof window.supabase !== 'undefined') { resolve(); return; }
      const s = document.createElement('script');
      s.src = CDN_URL;
      s.onload  = resolve;
      s.onerror = () => reject(new Error('Supabase CDN load failed'));
      document.head.appendChild(s);
    });
  }

  /* ── ローカルセッション存在チェック（同期・高速）── */
  function _hasLocalSession() {
    const url = localStorage.getItem(SB_URL_KEY);
    if (!url) return false;
    const m = url.match(/https?:\/\/([^.]+)\.supabase\.co/);
    if (!m) return false;
    const ref = m[1];
    const raw = localStorage.getItem(`sb-${ref}-auth-token`);
    if (!raw) return false;
    try {
      const d = JSON.parse(raw);
      if (!d) return false;
      const token = d.access_token || d.session?.access_token;
      if (!token) return false;
      const exp = d.expires_at || d.session?.expires_at;
      return !exp || exp * 1000 > Date.now();
    } catch { return false; }
  }

  /* ── login.html への遷移 URL ──────────────────── */
  function _loginUrl() {
    const base = location.pathname.replace(/\/[^/]*$/, '/');
    const ret  = encodeURIComponent(location.pathname + location.search);
    return base + 'login.html?return=' + ret;
  }

  /* ── HTML エスケープ ─────────────────────────── */
  function _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── 会社情報をキャッシュ ──────────────────────── */
  async function _ensureCompany(client, userId) {
    try {
      // ユーザーが所属する会社をすべて取得する。
      const { data, error } = await client
        .from('user_companies')
        .select('company_id, companies(id, name)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      companyOptions = (data || []).map(row => {
        const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
        return company ? { id: row.company_id, name: company.name } : null;
      }).filter(Boolean);

      if (!companyOptions.length) {
        localStorage.removeItem(COMPANY_KEY);
        return;
      }

      const current = getSession();
      const selected = companyOptions.find(company => company.id === current?.id) || companyOptions[0];
      localStorage.setItem(COMPANY_KEY, JSON.stringify(selected));
    } catch (e) {
      companyOptions = [];
      localStorage.removeItem(COMPANY_KEY);
      console.error('[KS_AUTH] _ensureCompany:', e);
    }
  }

  /* ── ページ右上に会社切替 + ログアウトを挿入 ───── */
  function _injectBar() {
    if (document.getElementById('ks-auth-bar')) return;
    const name = getCompanyName() || '未設定';
    const bar  = document.createElement('div');
    bar.id = 'ks-auth-bar';
    bar.style.cssText = [
      'position:fixed', 'top:0', 'right:0', 'z-index:99999',
      'background:rgba(11,20,38,.9)', 'backdrop-filter:blur(10px)',
      '-webkit-backdrop-filter:blur(10px)',
      'padding:7px 14px', 'display:flex', 'align-items:center', 'gap:8px',
      'font-size:12px', "font-family:'Noto Sans JP',sans-serif", 'color:#E8EDF8',
      'border-bottom-left-radius:10px',
      'border:1px solid #2A3D6B', 'border-top:none', 'border-right:none',
    ].join(';');
    const options = companyOptions.length
      ? companyOptions.map(company => `<option value="${_esc(company.id)}"${company.id === getCompanyId() ? ' selected' : ''}>${_esc(company.name)}</option>`).join('')
      : `<option value="">${_esc(name)}</option>`;
    bar.innerHTML =
      '<label for="ks-company-select" style="display:flex;align-items:center;gap:5px;color:#7A8CAE;font-size:14px">🏢' +
      '<span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">請求書を作成する会社</span>' +
      `<select id="ks-company-select" aria-label="請求書を作成する会社" style="min-height:34px;max-width:190px;background:#172744;border:1px solid #3B5A92;border-radius:6px;color:#E8EDF8;padding:4px 26px 4px 8px;font:700 12px 'Noto Sans JP',sans-serif;cursor:pointer">${options}</select></label>` +
      '<button id="ks-logout-btn" style="' +
        'background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.35);' +
        'color:#FCA5A5;padding:3px 10px;border-radius:6px;font-size:11px;' +
        'cursor:pointer;font-family:inherit;' +
      '">ログアウト</button>';

    const attach = () => {
      if (!document.body) return;
      document.body.appendChild(bar);
      const companySelect = document.getElementById('ks-company-select');
      companySelect.addEventListener('change', () => {
        const selected = companyOptions.find(company => company.id === companySelect.value);
        if (!selected) return;
        localStorage.setItem(COMPANY_KEY, JSON.stringify(selected));
        window.dispatchEvent(new CustomEvent('ks-company-change', { detail: selected }));
      });
      document.getElementById('ks-logout-btn')
        .addEventListener('click', () => KS_AUTH.logout());
    };
    document.readyState === 'loading'
      ? document.addEventListener('DOMContentLoaded', attach)
      : attach();
  }

  /* ══════════════════════════════════════════════
     公開 API
  ══════════════════════════════════════════════ */

  /**
   * 認証チェック — 保護ページの <head> で呼ぶ。
   * 非ログインなら login.html へリダイレクト。
   * ログイン済みなら右上に会社名バーを挿入して session を返す。
   */
  async function checkAuth() {
    // ① body を非表示（ちらつき防止）— await より前なので同期実行
    const hide = document.createElement('style');
    hide.id = 'ks-auth-loading';
    hide.textContent = 'body{visibility:hidden!important}';
    (document.head || document.documentElement).appendChild(hide);

    const show = () => {
      const el = document.getElementById('ks-auth-loading');
      if (el) el.remove();
    };

    // ② 高速ローカルチェック（同期）
    if (!_hasLocalSession()) {
      location.replace(_loginUrl());
      return null;
    }

    // ③ Supabase CDN ロード → サーバーサイドセッション検証
    try {
      await _loadCDN();
      const client = _client();
      if (!client) { location.replace(_loginUrl()); return null; }

      const { data: { session }, error } = await client.auth.getSession();
      if (error || !session) { location.replace(_loginUrl()); return null; }

      // ④ 会社情報キャッシュ
      await _ensureCompany(client, session.user.id);

      // ⑤ 表示再開 + 会社バー挿入
      show();
      _injectBar();
      return session;
    } catch (e) {
      console.error('[KS_AUTH] checkAuth error:', e);
      location.replace(_loginUrl());
      return null;
    }
  }

  /** キャッシュ済みセッション（会社情報オブジェクト）を返す */
  function getSession() {
    try {
      const raw = localStorage.getItem(COMPANY_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function getCompanyId()   { return getSession()?.id   ?? null; }
  function getCompanyName() { return getSession()?.name ?? null; }

  /** ログアウトして login.html へ */
  async function logout() {
    try {
      await _loadCDN();
      const c = _client();
      if (c) await c.auth.signOut();
    } catch {}
    localStorage.removeItem(COMPANY_KEY);
    const base = location.pathname.replace(/\/[^/]*$/, '/');
    location.replace(base + 'login.html');
  }

  return { checkAuth, getSession, getCompanyId, getCompanyName, logout };
})();
