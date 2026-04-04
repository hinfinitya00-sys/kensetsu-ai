# 建設AI 現場管理システム

土木・法面工事の現場向け、AIを活用した現場管理Webアプリです。
シングルHTMLファイルで動作し、スマートフォンブラウザからそのまま使用できます。

## 主な機能

- **全項目対応フォーム** — 工事名・工事番号・元請会社・現場代理人・天候（午前/午後）・職種別作業員数・使用重機・工種・進捗率・安全管理・品質管理
- **音声入力** — Web Speech API（Android Chrome）/ OpenAI Whisper API（iPhone Safari）の自動切り替え
- **AI日報生成** — ChatGPT API（GPT-4o）がA4一枚・ですます調のプロ仕様日報を自動生成
- **Googleドライブ保存** — OAuth2認証で「建設日報」フォルダに自動保存、保存後リンク表示
- **テキスト保存 / 印刷** — A4印刷用ウィンドウ出力対応

## 技術スタック

| 種別 | 内容 |
|------|------|
| フロントエンド | HTML / CSS / Vanilla JavaScript（シングルファイル） |
| AI | OpenAI ChatGPT API（gpt-4o / gpt-4o-mini） |
| 音声認識 | Web Speech API + OpenAI Whisper API（フォールバック） |
| クラウド保存 | Google Drive API v3 + Google Identity Services |
| 配信要件 | 音声入力にはHTTPS または localhost が必要 |

## セットアップ

### 1. OpenAI APIキー（必須）
ブラウザで `daily-report.html` を開き、右上の ⚙️ からAPIキーを設定する。

### 2. Googleドライブ保存（任意）
1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクト作成
2. Google Drive API を有効化
3. OAuth2クライアントID（Webアプリ）を作成
4. 承認済みJavaScriptオリジンにページのURLを追加
5. ⚙️ 設定画面でクライアントIDを入力

### 3. iPhoneで音声入力を使う場合
`file://` ではマイクにアクセスできないため、HTTPS配信が必要。

```bash
# ローカルサーバー（同一Wi-Fi内のiPhoneからアクセス可）
python3 -m http.server 8080
```

または [Netlify Drop](https://app.netlify.com/drop) にドラッグ＆ドロップで即時HTTPS配信。

## ファイル構成

```
kensetsu-ai/
├── daily-report.html   # メインアプリ（全機能をこの1ファイルに集約）
├── README.md
├── CONTEXT.md          # Claude向け引き継ぎ書
├── CHANGELOG.md        # 変更履歴
└── .gitignore
```

## 注意事項

- APIキーはブラウザのlocalStorageにのみ保存されます
- このリポジトリにAPIキーを絶対にコミットしないでください
