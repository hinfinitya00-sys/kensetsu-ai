/**
 * photo-pdf-export.js
 * 工事写真台帳 PDF / Excel 出力
 * 日本語: Canvas画像化 → addImage（jsPDF text()不使用）
 * 写真: Image/fetch → Canvas → dataURL（CORS対策）
 * 依存: jsPDF (CDN), SheetJS (CDN)
 */
'use strict';

const PHOTO_EXPORT = (() => {

  const PAGE_W = 210, PAGE_H = 297, MARGIN = 15;
  const HEADER_H = 12;
  const CW = PAGE_W - MARGIN * 2;

  const CATEGORY_ORDER = [
    '着手前・完成写真', '施工状況写真', '安全管理写真',
    '使用材料写真', '品質管理写真', '出来形管理写真', 'その他'
  ];

  function sortPhotos(photos) {
    return [...photos].sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a.photo_category);
      const bi = CATEGORY_ORDER.indexOf(b.photo_category);
      if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return (a.sequence_order || 0) - (b.sequence_order || 0);
    });
  }

  function fmtDateJP(d) {
    if (!d) return '';
    const dt = new Date(d);
    return `${dt.getFullYear()}年${dt.getMonth()+1}月${dt.getDate()}日`;
  }

  function truncate(s, max) { return (s||'').length > max ? s.substring(0,max)+'…' : (s||''); }

  /* ═══ テキスト → Canvas → dataURL ═══════════════ */
  function textToImage(text, options = {}) {
    const fontSize = options.fontSize || 20;
    const color = options.color || '#000000';
    const bgColor = options.bgColor || null;
    const maxWidth = options.maxWidth || 600;
    const padding = options.padding || 8;
    const fontWeight = options.fontWeight || '';

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const fontStr = `${fontWeight} ${fontSize}px "Noto Sans JP", "Hiragino Sans", sans-serif`.trim();
    ctx.font = fontStr;

    // 折り返し処理
    const chars = Array.from(text || '');
    const lines = [];
    let line = '';
    for (const ch of chars) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth - padding * 2 && line !== '') {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    if (!lines.length) lines.push('');

    const lineHeight = fontSize * 1.4;
    canvas.width = maxWidth;
    canvas.height = Math.ceil(lines.length * lineHeight + padding * 2);

    if (bgColor) {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    ctx.font = fontStr;
    ctx.fillStyle = color;
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => {
      ctx.fillText(l, padding, padding + i * lineHeight);
    });

    return canvas.toDataURL('image/png');
  }

  /* テキスト画像をPDFに貼る */
  function addText(doc, text, x, y, w, h, opts = {}) {
    if (!text) return;
    const img = textToImage(text, {
      fontSize: opts.fontSize || 20,
      color: opts.color || '#000000',
      bgColor: opts.bgColor || null,
      maxWidth: Math.ceil(w * 8),
      padding: 4,
      fontWeight: opts.bold ? 'bold' : '',
    });
    doc.addImage(img, 'PNG', x, y, w, h);
  }

  /* ═══ 画像圧縮（Canvas経由リサイズ） ═════════════ */
  function compressDataUrl(dataUrl) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1200;
        let w = img.naturalWidth, h = img.naturalHeight;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  /* ═══ 全画像を事前にbase64キャッシュ（圧縮付き） ═ */
  const _SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqb2hkemNvemllemRrcWNlYmhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMTI5NTAsImV4cCI6MjA4ODg4ODk1MH0.SUZ35eULi_RQzNPDQG2n5cBJCdTDXJZ1pB307ZNbSPU';

  async function preloadAllImages(photos) {
    const cache = {};
    for (const photo of photos) {
      const key = photo.file_path || photo._id;
      const url = photo._dataUrl || photo.file_url;
      if (!url) { cache[key] = null; continue; }
      try {
        let raw = url;
        if (!url.startsWith('data:')) {
          const res = await fetch(url, {
            headers: { 'apikey': _SB_KEY, 'Authorization': 'Bearer ' + _SB_KEY },
          });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const blob = await res.blob();
          raw = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        }
        cache[key] = await compressDataUrl(raw);
      } catch (e) {
        console.warn('画像プリロード失敗:', url, e.message);
        cache[key] = null;
      }
    }
    return cache;
  }

  /* ═══ 描画ヘルパー ═════════════════════════════ */

  function drawHeader(doc, info, categoryLabel) {
    addText(doc, truncate(info.projectName, 45), MARGIN, MARGIN - 4.5, 75, 3.5, { fontSize: 16, color: '#666666' });
    if (categoryLabel) {
      addText(doc, categoryLabel, PAGE_W - MARGIN - 40, MARGIN - 4.5, 40, 3.5, { fontSize: 16, color: '#666666' });
    }
    doc.setDrawColor(200);
    doc.line(MARGIN, MARGIN, PAGE_W - MARGIN, MARGIN);
  }

  function drawFooter(doc, info, pageNum, totalPages) {
    const fy = PAGE_H - MARGIN + 2;
    doc.setDrawColor(200);
    doc.line(MARGIN, fy, PAGE_W - MARGIN, fy);
    addText(doc, truncate(info.contractorName, 35), MARGIN, fy + 1, 60, 3.5, { fontSize: 14, color: '#777777' });
    // ページ番号は英数字のみなのでdoc.textでOK
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120);
    doc.text(`${pageNum} / ${totalPages}`, PAGE_W - MARGIN, fy + 5, { align: 'right' });
    doc.setTextColor(0);
  }

  function drawBlackboard(doc, bx, by, bbW, bbH, photo, info) {
    doc.setFillColor(0, 0, 0);
    doc.setGState(new doc.GState({ opacity: 0.65 }));
    doc.rect(bx, by, bbW, bbH, 'F');
    doc.setGState(new doc.GState({ opacity: 1 }));

    const lh = bbH / 4.5;
    const lines = [
      truncate(info.projectName, 30),
      `${photo.work_type||''} / ${photo.sub_category||''}`,
      photo.measurement_point || '',
      photo.shot_date || '',
    ].filter(l => l);
    let ly = by + 0.5;
    lines.forEach(line => {
      addText(doc, line, bx + 1, ly, bbW - 2, lh, { fontSize: 14, color: '#ffffff' });
      ly += lh;
    });
  }

  function drawPhoto(doc, photo, x, y, w, h, imageCache) {
    const key = photo.file_path || photo._id;
    const dataUrl = (imageCache && imageCache[key]) || photo._dataUrl;

    if (dataUrl && dataUrl.startsWith('data:')) {
      try {
        const format = dataUrl.includes('image/png') ? 'PNG' : 'JPEG';
        doc.addImage(dataUrl, format, x, y, w, h);
        return;
      } catch(e) { console.error('addImage失敗:', e.message); }
    }
    doc.setFillColor(230, 230, 230);
    doc.rect(x, y, w, h, 'F');
    doc.setDrawColor(180);
    doc.rect(x, y, w, h);
    doc.line(x, y, x + w, y + h);
    doc.line(x + w, y, x, y + h);
  }

  function drawSectionTitle(doc, title, info, pageNum, totalPages) {
    doc.addPage();
    drawHeader(doc, info, title);
    drawFooter(doc, info, pageNum, totalPages);
    addText(doc, title, MARGIN, PAGE_H / 2 - 15, CW, 12, { fontSize: 42, bold: true });
  }

  /* ═══ メイン: PDF出力 ═══════════════════════════ */
  async function exportToPDF(photos, info) {
    if (typeof jspdf === 'undefined' && typeof jsPDF === 'undefined') {
      alert('jsPDFライブラリが読み込まれていません'); return;
    }
    const { jsPDF } = window.jspdf || window;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    const sorted = sortPhotos(photos);

    /* 全画像を事前キャッシュ */
    const imageCache = await preloadAllImages(sorted);

    const beforeAfter = sorted.filter(p => p.photo_category === '着手前・完成写真');
    const grouped = {};
    CATEGORY_ORDER.forEach(cat => {
      if (cat === '着手前・完成写真') return;
      const items = sorted.filter(p => p.photo_category === cat);
      if (items.length) grouped[cat] = items;
    });

    let totalPages = 1;
    if (beforeAfter.length) totalPages += 1 + Math.ceil(beforeAfter.length / 2);
    Object.entries(grouped).forEach(([, items]) => { totalPages += 1 + Math.ceil(items.length / 4); });
    totalPages += 1;
    let pn = 1;

    // ── 表紙 ──
    addText(doc, '工事写真台帳', MARGIN, 55, CW, 14, { fontSize: 48, bold: true });
    doc.setDrawColor(0); doc.setLineWidth(0.5);
    doc.line(MARGIN + 30, 72, PAGE_W - MARGIN - 30, 72);

    let cy = 82;
    const koki = (info.startDate ? fmtDateJP(info.startDate) : '') +
                 (info.startDate && info.endDate ? ' ～ ' : '') +
                 (info.endDate ? fmtDateJP(info.endDate) : '');
    // 必須行（空でも表示）
    const requiredRows = [
      ['工事名称', info.projectName || '—'],
      ['発注者', info.clientName || '—'],
      ['施工業者', info.contractorName || '—'],
      ['現場所在地', info.siteLocation || '—'],
      ['工期', koki || '—'],
      ['作成日', fmtDateJP(new Date().toISOString().slice(0,10))],
    ];
    // 省略可能行（値がある場合のみ）
    const optionalRows = [
      ['工事番号', info.projectNumber],
      ['現場代理人', info.siteManager],
      ['監理技術者', info.supervisor],
    ].filter(([, val]) => !!val);

    // 工事名称の直後に工事番号を挿入
    const allRows = [];
    requiredRows.forEach(row => {
      allRows.push(row);
      if (row[0] === '工事名称') {
        const pnRow = optionalRows.find(r => r[0] === '工事番号');
        if (pnRow) allRows.push(pnRow);
      }
    });
    // 作成日の前に代理人・技術者を挿入
    const insertIdx = allRows.findIndex(r => r[0] === '作成日');
    const personRows = optionalRows.filter(r => r[0] !== '工事番号');
    if (personRows.length && insertIdx >= 0) {
      allRows.splice(insertIdx, 0, ...personRows);
    }

    allRows.forEach(([label, val]) => {
      addText(doc, label, MARGIN + 30, cy, 35, 5, { fontSize: 20, bold: true });
      addText(doc, ': ' + String(val), MARGIN + 68, cy, 90, 5, { fontSize: 20 });
      cy += 9;
    });
    doc.line(MARGIN + 30, cy + 4, PAGE_W - MARGIN - 30, cy + 4);
    pn++;

    // ── 着手前・完成写真 ──
    if (beforeAfter.length) {
      drawSectionTitle(doc, '着手前・完成写真', info, pn, totalPages); pn++;
      const halfW = (CW - 6) / 2, halfH = halfW * 0.75;
      for (let i = 0; i < beforeAfter.length; i += 2) {
        doc.addPage();
        drawHeader(doc, info, '着手前・完成写真');
        drawFooter(doc, info, pn, totalPages); pn++;
        for (let j = 0; j < 2; j++) {
          const photo = beforeAfter[i + j];
          if (!photo) continue;
          const x = MARGIN + j * (halfW + 6), y = MARGIN + HEADER_H;
          drawPhoto(doc, photo, x, y, halfW, halfH, imageCache);
          drawBlackboard(doc, x, y + halfH - halfH * 0.28, halfW * 0.75, halfH * 0.28, photo, info);
          addText(doc, j === 0 ? '【施工前】' : '【施工後】', x, y + halfH + 2, 30, 4, { fontSize: 16, bold: true });
          addText(doc, truncate(photo.description, 50), x, y + halfH + 6, halfW, 3.5, { fontSize: 14, color: '#333' });
        }
      }
    }

    // ── カテゴリ別 ──
    const imgW = (CW - 8) / 2, imgH = imgW * 0.75;
    const blockH = imgH + 18;

    for (const [cat, items] of Object.entries(grouped)) {
      drawSectionTitle(doc, cat, info, pn, totalPages); pn++;
      for (let i = 0; i < items.length; i++) {
        if (i % 4 === 0) {
          doc.addPage();
          drawHeader(doc, info, cat);
          drawFooter(doc, info, pn, totalPages); pn++;
        }
        const col = (i % 4) % 2, row = Math.floor((i % 4) / 2);
        const x = MARGIN + col * (imgW + 8);
        const y = MARGIN + HEADER_H + row * (blockH + 4);
        const photo = items[i];

        drawPhoto(doc, photo, x, y, imgW, imgH, imageCache);
        drawBlackboard(doc, x, y + imgH - imgH * 0.28, imgW * 0.75, imgH * 0.28, photo, info);

        let ty = y + imgH + 1;
        addText(doc, `${photo.work_type||''} / ${photo.sub_category||''}`, x, ty, imgW, 3, { fontSize: 14, color: '#333' });
        ty += 3.5;
        addText(doc, `${photo.measurement_point||''} | ${photo.shot_date||''}`, x, ty, imgW, 3, { fontSize: 14, color: '#555' });
        ty += 3.5;
        addText(doc, truncate(photo.description, 65), x, ty, imgW, 3, { fontSize: 13, color: '#333' });
      }
    }

    // ── 一覧表（横向き） ──
    doc.addPage('a4', 'landscape');
    addText(doc, '写真管理一覧', 15, 10, 60, 6, { fontSize: 24, bold: true });
    const lw = 297;
    const cols = ['No','写真区分','工種','種別','測点','撮影日','撮影者','説明'];
    const colW = [10, 30, 22, 26, 18, 20, 16, lw - 30 - 10 - 30 - 22 - 26 - 18 - 20 - 16];

    let tx2 = 15, ty2 = 20;
    doc.setFillColor(240, 240, 240);
    doc.rect(15, ty2 - 1, lw - 30, 5, 'F');
    cols.forEach((c, ci) => {
      addText(doc, c, tx2, ty2 - 1, colW[ci], 4, { fontSize: 14, bold: true });
      tx2 += colW[ci];
    });
    ty2 += 5;

    sorted.forEach((p, i) => {
      if (ty2 > 195) { doc.addPage('a4', 'landscape'); ty2 = 15; }
      tx2 = 15;
      [String(i+1), p.photo_category||'', p.work_type||'', p.sub_category||'',
       p.measurement_point||'', p.shot_date||'', p.photographer||'', truncate(p.description, 45)
      ].forEach((v, ci) => {
        addText(doc, v, tx2, ty2, colW[ci], 3.5, { fontSize: 13 });
        tx2 += colW[ci];
      });
      doc.setDrawColor(220);
      doc.line(15, ty2 + 4, lw - 15, ty2 + 4);
      ty2 += 4.5;
    });

    doc.save(`写真台帳_${info.projectName||'report'}.pdf`);
  }

  /* ── Excel ─────────────────────────────────────── */
  function exportToExcel(photos, info) {
    if (typeof XLSX === 'undefined') { alert('SheetJSが読み込まれていません'); return; }
    const sorted = sortPhotos(photos);
    const rows = sorted.map((p, i) => ({
      'No': i+1, '写真区分': p.photo_category||'', '工種': p.work_type||'',
      '種別': p.sub_category||'', '細別': p.detail_category||'', '測点': p.measurement_point||'',
      '撮影日': p.shot_date||'', '撮影者': p.photographer||'', '説明': p.description||'',
      'ファイル名': p.file_path||'',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{wch:5},{wch:16},{wch:12},{wch:14},{wch:12},{wch:10},{wch:12},{wch:10},{wch:40},{wch:20}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '写真管理一覧');
    XLSX.writeFile(wb, `写真管理_${info.projectName||'report'}.xlsx`);
  }

  return { exportToPDF, exportToExcel, sortPhotos, CATEGORY_ORDER };
})();
