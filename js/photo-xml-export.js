/**
 * photo-xml-export.js
 * 国土交通省「デジタル写真管理情報基準 令和5年3月」準拠 PHOTO.XML + ZIP出力
 * 依存: JSZip (CDN)
 */
'use strict';

const PHOTO_XML = (() => {

  function fmtDateXML(d) {
    if (!d) return '';
    const dt = new Date(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }

  function fmtDateSlash(d) {
    if (!d) return '';
    const dt = new Date(d);
    return `${dt.getFullYear()}/${String(dt.getMonth()+1).padStart(2,'0')}/${String(dt.getDate()).padStart(2,'0')}`;
  }

  function escXml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /* ── PHOTO05.DTD（固定文字列） ──────────────── */
  const PHOTO05_DTD = `<!-- PHOTO05.DTD (Simplified) -->
<!ELEMENT 写真情報 (写真管理情報, 写真情報*)>
<!ELEMENT 写真管理情報 (適用要領基準, 工事名, 工事番号, 契約番号?, 作成年月日, 受注者名, 写真枚数)>
<!ELEMENT 適用要領基準 (#PCDATA)>
<!ELEMENT 工事名 (#PCDATA)>
<!ELEMENT 工事番号 (#PCDATA)>
<!ELEMENT 契約番号 (#PCDATA)>
<!ELEMENT 作成年月日 (#PCDATA)>
<!ELEMENT 受注者名 (#PCDATA)>
<!ELEMENT 写真枚数 (#PCDATA)>
<!ELEMENT 写真ファイル情報 (シリアル番号, 写真ファイル名, 写真ファイル日本語名, メディア番号)>
<!ELEMENT シリアル番号 (#PCDATA)>
<!ELEMENT 写真ファイル名 (#PCDATA)>
<!ELEMENT 写真ファイル日本語名 (#PCDATA)>
<!ELEMENT メディア番号 (#PCDATA)>
<!ELEMENT 撮影工種区分 (写真-大分類, 写真区分, 工種, 種別, 細別, 写真タイトル)>
<!ELEMENT 写真-大分類 (#PCDATA)>
<!ELEMENT 写真区分 (#PCDATA)>
<!ELEMENT 工種 (#PCDATA)>
<!ELEMENT 種別 (#PCDATA)>
<!ELEMENT 細別 (#PCDATA)>
<!ELEMENT 写真タイトル (#PCDATA)>
<!ELEMENT 撮影情報 (撮影箇所, 撮影年月日, 撮影者)>
<!ELEMENT 撮影箇所 (#PCDATA)>
<!ELEMENT 撮影年月日 (#PCDATA)>
<!ELEMENT 撮影者 (#PCDATA)>
<!ELEMENT 代表写真 (#PCDATA)>
<!ELEMENT 提出頻度写真 (#PCDATA)>
`;

  /* ── PHOTO.XML 生成 ────────────────────────── */
  function generateXML(photos, info) {
    const today = fmtDateXML(new Date().toISOString().slice(0, 10));

    const photoEntries = photos.map((p, i) => {
      const serial = String(i + 1).padStart(4, '0');
      const filename = `P${serial}.JPG`;
      return `
  <写真情報>
    <写真ファイル情報>
      <シリアル番号>${serial}</シリアル番号>
      <写真ファイル名>${filename}</写真ファイル名>
      <写真ファイル日本語名>${escXml(p.description || '')}</写真ファイル日本語名>
      <メディア番号>1</メディア番号>
    </写真ファイル情報>
    <撮影工種区分>
      <写真-大分類>工事</写真-大分類>
      <写真区分>${escXml(p.photo_category || '')}</写真区分>
      <工種>${escXml(p.work_type || '')}</工種>
      <種別>${escXml(p.sub_category || '')}</種別>
      <細別>${escXml(p.detail_category || '')}</細別>
      <写真タイトル>${escXml(p.description || '')}</写真タイトル>
    </撮影工種区分>
    <撮影情報>
      <撮影箇所>${escXml(p.measurement_point || '')}</撮影箇所>
      <撮影年月日>${fmtDateSlash(p.shot_date)}</撮影年月日>
      <撮影者>${escXml(p.photographer || '')}</撮影者>
    </撮影情報>
    <代表写真>${i === 0 ? '1' : '0'}</代表写真>
    <提出頻度写真>1</提出頻度写真>
  </写真情報>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<写真情報>
  <写真管理情報>
    <適用要領基準>公共土木02</適用要領基準>
    <工事名>${escXml(info.projectName || '')}</工事名>
    <工事番号>${escXml(info.projectNumber || '')}</工事番号>
    <契約番号></契約番号>
    <作成年月日>${today}</作成年月日>
    <受注者名>${escXml(info.contractorName || '')}</受注者名>
    <写真枚数>${photos.length}</写真枚数>
  </写真管理情報>${photoEntries}
</写真情報>`;
  }

  /* ── dataURL → Blob変換 ────────────────────── */
  function dataURLtoBlob(dataUrl) {
    if (!dataUrl || !dataUrl.startsWith('data:')) return null;
    const parts = dataUrl.split(',');
    const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const b64 = atob(parts[1]);
    const arr = new Uint8Array(b64.length);
    for (let i = 0; i < b64.length; i++) arr[i] = b64.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  /* ── ZIP出力 ───────────────────────────────── */
  async function exportToXMLZip(photos, info) {
    if (typeof JSZip === 'undefined') {
      alert('JSZipライブラリが読み込まれていません');
      return;
    }

    const zip = new JSZip();
    const photoFolder = zip.folder('PHOTO');
    const picFolder = photoFolder.folder('PIC');
    photoFolder.folder('DRA');

    // PHOTO.XML
    const xml = generateXML(photos, info);
    photoFolder.file('PHOTO.XML', xml);

    // PHOTO05.DTD
    photoFolder.file('PHOTO05.DTD', PHOTO05_DTD);

    // 写真ファイル
    for (let i = 0; i < photos.length; i++) {
      const serial = String(i + 1).padStart(4, '0');
      const filename = `P${serial}.JPG`;
      const photo = photos[i];

      if (photo._dataUrl) {
        const blob = dataURLtoBlob(photo._dataUrl);
        if (blob) {
          picFolder.file(filename, blob);
        }
      } else if (photo.file_url) {
        try {
          const res = await fetch(photo.file_url);
          if (res.ok) {
            const blob = await res.blob();
            picFolder.file(filename, blob);
          }
        } catch (e) {
          console.warn(`Failed to fetch ${photo.file_url}:`, e.message);
        }
      }
    }

    // ZIP生成＆ダウンロード
    const today = fmtDateXML(new Date().toISOString().slice(0, 10));
    const projectNum = (info.projectNumber || 'PHOTO').replace(/[^\w-]/g, '_');
    const zipName = `PHOTO_${projectNum}_${today}.zip`;

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = zipName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return { exportToXMLZip, generateXML };
})();
