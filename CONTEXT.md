# CONTEXT.md — Claude への引き継ぎ書

> このファイルを会話の冒頭に貼り付けることで、前回の続きからすぐに作業を再開できます。

---

## プロジェクト概要

**プロジェクト名:** 建設AI 現場管理システム
**リポジトリ:** `hinfinitya00-sys/kensetsu-nippou`
**メインファイル:** `/Users/sonodaayato/kensetsu-nippou/daily-report.html`（シングルHTMLファイル）
**対象ユーザー:** 土木・法面工事の現場監督（現場でスマホから使う想定）

---

## 現在の完成状況（v1.1.0 時点）

### 実装済み ✅

| 機能 | 状態 |
|------|------|
| 基本情報フォーム（工事名・工事番号・元請会社・現場代理人・作業日） | ✅ |
| 天候選択（午前/午後 独立した5択ボタン） | ✅ |
| 職種別作業員数（土木作業員/重機オペ/交通誘導員/その他）+ 合計自動計算 | ✅ |
| 使用重機リスト（機械名+台数を動的追加/削除） | ✅ |
| 作業内容（工種セレクト・進捗率スライダー・明日の予定・特記事項） | ✅ |
| 安全管理（朝礼/KY/ヒヤリハット トグル + 条件表示） | ✅ |
| 品質管理（検査立会・写真枚数・気温） | ✅ |
| 音声入力（Web Speech API優先 / Whisper APIフォールバック） | ✅ |
| iOS Safari 対応（isSecureCtx判定 + HTTPS案内カード） | ✅ |
| ChatGPT API（gpt-4o/gpt-4o-mini）でA4・ですます調日報生成 | ✅ |
| コピー / テキストダウンロード / A4印刷ウィンドウ | ✅ |
| Googleドライブ保存（OAuth2 + 「建設日報」フォルダ自動作成 + リンク表示） | ✅ |
| APIキー・クライアントIDをlocalStorageに保存する設定画面 | ✅ |
| スマホ最適化UI（タップターゲット44px以上・iOS zoom防止） | ✅ |

### 未実装 / 課題 ⬜

- 過去日報の一覧・検索・再編集
- オフライン対応（PWA / Service Worker）
- 日報テンプレートの保存・呼び出し
- 画像添付（工事写真のEXIF情報読み取り）
- PDF出力（現状はブラウザ印刷のみ）
- 工程表との連携（進捗率の推移グラフ）
- 多言語対応（外国人技能実習生向け）

---

## 技術スタック

```
daily-report.html（シングルファイル・外部依存なし）
├── HTML/CSS/Vanilla JavaScript
├── OpenAI Chat Completions API  → 日報生成（gpt-4o）
├── OpenAI Whisper API           → 音声文字起こし（iOS用フォールバック）
├── Web Speech API               → リアルタイム音声認識（Android Chrome/Desktop）
├── Google Identity Services     → OAuth2トークン取得
└── Google Drive API v3          → ファイルアップロード・フォルダ管理
```

**重要な設計方針:**
- シングルHTMLファイル。ビルドツール・npm・バックエンドなし
- APIキーはlocalStorageのみ保存（絶対にコードに埋め込まない）
- 音声入力はブラウザ能力を自動検出して最適なAPIを使う
- iOSではfile://プロトコルでnavigator.mediaDevicesがundefinedになるため isSecureCtx で判定

---

## 重要な決定事項ログ

| 日付 | 決定内容 | 理由 |
|------|----------|------|
| 2026-03-11 | シングルHTMLファイル方式を採用 | 現場作業員がサーバー運用なしで使えるようにするため |
| 2026-03-11 | 音声入力はWeb Speech API優先・Whisperフォールバック方式 | iOS SafariがWeb Speech APIを無効化しているため |
| 2026-03-11 | Googleドライブの保存先を「建設日報」フォルダに統一 | 日報ファイルが散らばらないよう整理するため |
| 2026-03-11 | isSecureCtxをlocation.protocol/hostnameとwindow.isSecureContextの組み合わせで判定 | iOSのfile://でwindow.isSecureContextが不安定なため |
| 2026-03-11 | 日報フォーマットはA4一枚・ですます調に統一 | 元請会社への提出書類としての体裁を保つため |

---

## 次にやること（優先順位順）

### 優先度 高 🔴
1. **PDF出力機能** — `jsPDF` または `html2canvas` を使ってブラウザ印刷に依存しないPDF生成
2. **日報履歴保存** — IndexedDB に過去日報を保存し、一覧・再編集・再送信できる画面を追加
3. **テンプレート機能** — 工事名・工事番号・元請会社名などを保存して次回自動入力

### 優先度 中 🟡
4. **PWA化** — Service Workerでオフライン動作、ホーム画面追加対応
5. **写真添付** — input[type=file]で工事写真を添付し、日報と一緒にGoogleドライブに保存
6. **入力バリデーション強化** — 作業員数0・工事名未入力などの警告

### 優先度 低 🟢
7. **進捗グラフ** — 日報履歴から工種別・日別の進捗率をグラフ表示
8. **メール送信** — 生成した日報をそのままメール送信（Web Share API or mailto）
9. **多言語対応** — 外国人作業員向けに中国語・ベトナム語UI

---

## ファイル構成

```
kensetsu-nippou/
├── daily-report.html   # メインアプリ（全機能集約）
├── README.md           # プロジェクト説明
├── CONTEXT.md          # このファイル（Claude引き継ぎ書）
├── CHANGELOG.md        # 変更履歴
└── .gitignore
```

---

## デプロイ情報

| 種別 | URL |
|------|-----|
| GitHubリポジトリ | https://github.com/hinfinitya00-sys/kensetsu-nippou |
| GitHub Pages（iPhone音声入力用） | https://hinfinitya00-sys.github.io/kensetsu-nippou/daily-report.html |

## 作業再開時のコマンド

```bash
cd /Users/sonodaayato/kensetsu-nippou
open daily-report.html              # ブラウザで確認
python3 -m http.server 8080         # ローカルサーバー（iPhoneテスト用）

git add -A && git commit -m "feat: ..." && git push   # 変更をpush
```

---

*最終更新: 2026-03-12*
