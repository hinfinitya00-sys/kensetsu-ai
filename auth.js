/**
 * auth.js — 建設AIシステム 管理画面認証モジュール
 *
 * パスワードは Supabase の localStorage 設定から取得するか、
 * デフォルト値 ADMIN_PASSWORD を使用します。
 *
 * 変更する場合は ADMIN_PASSWORD を書き換えてください。
 */

(function (global) {
  'use strict';

  const ADMIN_PASSWORD = 'kensetsu2024'; // ← デフォルトパスワード
  const SESSION_KEY    = 'ks_auth_session';
  const SESSION_HOURS  = 8;

  /**
   * パスワード + 日付文字列から簡易トークンを生成
   */
  function makeToken(password) {
    const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return btoa(unescape(encodeURIComponent(password + ':' + dateStr)));
  }

  /**
   * 保存済みセッションが有効かチェック
   */
  function isSessionValid() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return false;
      const session = JSON.parse(raw);
      if (!session.token || !session.expires) return false;
      if (Date.now() > session.expires) {
        localStorage.removeItem(SESSION_KEY);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 認証チェック。未認証なら login.html へリダイレクト。
   * 各管理ページの <head> 内で呼び出す。
   */
  function checkAuth() {
    if (!isSessionValid()) {
      // 戻り先URLをクエリパラメータで渡す
      const returnTo = encodeURIComponent(location.pathname + location.search);
      location.replace('login.html?return=' + returnTo);
    }
  }

  /**
   * ログイン処理。正しければセッション保存して true を返す。
   */
  function login(password) {
    if (!password) return false;
    if (password !== ADMIN_PASSWORD) return false;

    const expires = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
    const session = {
      token:   makeToken(password),
      expires: expires,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return true;
  }

  /**
   * ログアウト。セッション削除して login.html へリダイレクト。
   */
  function logout() {
    localStorage.removeItem(SESSION_KEY);
    location.replace('login.html');
  }

  // グローバルに公開
  global.checkAuth = checkAuth;
  global.login     = login;
  global.logout    = logout;

})(window);
