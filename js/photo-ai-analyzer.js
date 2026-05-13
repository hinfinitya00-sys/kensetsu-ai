/**
 * photo-ai-analyzer.js
 * Claude Vision API による法面工事現場写真の自動解析
 */
'use strict';

const PHOTO_AI = (() => {

  const SYSTEM_PROMPT = `あなたは法面工事専門の施工管理AIです。
アップロードされた現場写真を分析し、以下のJSON形式のみで返答してください。
マークダウン・前置き文は不要です。JSONだけ返してください。

{
  "photo_category": "着手前・完成写真|施工状況写真|安全管理写真|使用材料写真|品質管理写真|出来形管理写真|その他",
  "estimated_work_type": "植生工|吹付工|法枠工|アンカー工|法面清掃工|仮設工|その他",
  "estimated_sub_type": "種子散布工|張芝工|筋芝工|植生シート工|植生マット工|植生基材吹付工|客土吹付工|コンクリート吹付工|モルタル吹付工|現場打法枠工|現場吹付法枠工|プレキャスト法枠工|グラウンドアンカー工|鉄筋挿入工|その他",
  "construction_stage": "着手前|施工中|完成",
  "key_elements": ["写真に写っている主要な構造物・資材"],
  "quality_check_items": ["確認できる品質管理項目"],
  "description": "施工管理上の説明（100文字程度）",
  "alert": "問題点・注意点（なければnull）"
}`;

  /**
   * 写真1枚をClaude Vision APIで解析
   * @param {string} base64Data - Base64エンコードされた画像データ（data:... プレフィックスなし）
   * @param {string} mediaType - MIMEタイプ（image/jpeg 等）
   * @param {string} apiKey - Anthropic API Key
   * @returns {Promise<object>} 解析結果
   */
  async function analyzePhoto(base64Data, mediaType, apiKey) {
    if (!apiKey) throw new Error('APIキーが設定されていません');

    const body = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64Data }
          },
          {
            type: 'text',
            text: 'この現場写真を分析してください。'
          }
        ]
      }],
      system: SYSTEM_PROMPT
    };

    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error?.message || `API error: ${res.status}`);
        }

        const data = await res.json();
        const text = data.content?.[0]?.text || '';

        // JSON部分を抽出
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('AI応答からJSONを抽出できませんでした');

        return JSON.parse(jsonMatch[0]);
      } catch (e) {
        lastError = e;
        if (attempt === 0) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    throw lastError || new Error('写真解析に失敗しました');
  }

  /**
   * 複数写真を順次解析
   * @param {Array<{base64: string, mediaType: string}>} files
   * @param {string} apiKey
   * @param {function} onProgress - (index, total, result) コールバック
   * @returns {Promise<object[]>}
   */
  async function batchAnalyzePhotos(files, apiKey, onProgress) {
    const results = [];
    for (let i = 0; i < files.length; i++) {
      try {
        const result = await analyzePhoto(files[i].base64, files[i].mediaType, apiKey);
        results.push(result);
        if (onProgress) onProgress(i, files.length, result);
      } catch (e) {
        results.push({
          photo_category: 'その他',
          estimated_work_type: 'その他',
          estimated_sub_type: 'その他',
          construction_stage: '施工中',
          key_elements: [],
          quality_check_items: [],
          description: '（AI解析に失敗しました。手動で入力してください）',
          alert: e.message,
          _error: true,
        });
        if (onProgress) onProgress(i, files.length, results[i]);
      }
    }
    return results;
  }

  /**
   * File → base64変換
   */
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        const base64 = dataUrl.split(',')[1];
        const mediaType = file.type || 'image/jpeg';
        resolve({ base64, mediaType, dataUrl });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  return { analyzePhoto, batchAnalyzePhotos, fileToBase64 };
})();
