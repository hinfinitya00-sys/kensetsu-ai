/**
 * photo-pdf-export.js
 * 工事写真台帳 PDF / Excel 出力（元請け提出レベル）
 * 日本語テキストはCanvas経由で画像化してPDFに貼り付ける
 * 依存: jsPDF (CDN), SheetJS (CDN)
 */
'use strict';

const PHOTO_EXPORT = (() => {

  const PAGE_W = 210, PAGE_H = 297, MARGIN = 15;
  const FOOTER_H = 10, HEADER_H = 12;
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

  /* ── 日本語テキスト → Canvas画像 → PDF貼付 ──── */
  const _canvas = document.createElement('canvas');
  const _ctx = _canvas.getContext('2d');

  function addJPText(doc, text, x, y, w, h, options = {}) {
    if (!text) return;
    const {
      color = '#000000',
      bgColor = null,
      fontSize = 24,
      fontWeight = 'normal',
      align = 'left',
    } = options;

    const scale = 4;
    const canvasW = Math.max(Math.ceil(w * scale * 2.5), 100);
    const canvasH = Math.max(Math.ceil(h * scale * 2.5), 30);
    _canvas.width = canvasW;
    _canvas.height = canvasH;

    // 背景
    if (bgColor) {
      _ctx.fillStyle = bgColor;
      _ctx.fillRect(0, 0, canvasW, canvasH);
    } else {
      _ctx.clearRect(0, 0, canvasW, canvasH);
    }

    // テキスト描画
    _ctx.fillStyle = color;
    const fontStr = `${fontWeight === 'bold' ? 'bold ' : ''}${fontSize * scale}px "Noto Sans JP", "Hiragino Sans", sans-serif`;
    _ctx.font = fontStr;
    _ctx.textBaseline = 'middle';

    let tx = 4;
    if (align === 'center') {
      _ctx.textAlign = 'center';
      tx = canvasW / 2;
    } else if (align === 'right') {
      _ctx.textAlign = 'right';
      tx = canvasW - 4;
    } else {
      _ctx.textAlign = 'left';
    }
    _ctx.fillText(text, tx, canvasH / 2);

    const imgData = _canvas.toDataURL('image/png');
    doc.addImage(imgData, 'PNG', x, y, w, h);
  }

  /* ── 小黒板テキスト（白文字・背景なし） ────────── */
  function addBBText(doc, text, x, y, w, h) {
    addJPText(doc, text, x, y, w, h, { color: '#ffffff', fontSize: 14 });
  }

  /* ── ヘッダー描画 ──────────────────────────────── */
  function drawHeader(doc, info, categoryLabel) {
    addJPText(doc, truncate(info.projectName, 50), MARGIN, MARGIN - 4, 80, 3.5, { color: '#666666', fontSize: 16 });
    if (categoryLabel) {
      addJPText(doc, categoryLabel, PAGE_W - MARGIN - 40, MARGIN - 4, 40, 3.5, { color: '#666666', fontSize: 16, align: 'right' });
    }
    doc.setDrawColor(200);
    doc.line(MARGIN, MARGIN, PAGE_W - MARGIN, MARGIN);
  }

  /* ── フッター描画 ──────────────────────────────── */
  function drawFooter(doc, info, pageNum, totalPages) {
    const fy = PAGE_H - MARGIN + 2;
    doc.setDrawColor(200);
    doc.line(MARGIN, fy, PAGE_W - MARGIN, fy);
    addJPText(doc, truncate(info.contractorName, 40), MARGIN, fy + 1, 70, 3.5, { color: '#777777', fontSize: 14 });
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120);
    doc.text(`${pageNum} / ${totalPages}`, PAGE_W - MARGIN, fy + 5, { align: 'right' });
    doc.setTextColor(0);
  }

  /* ── 電子小黒板描画 ────────────────────────────── */
  function drawBlackboard(doc, x, y, imgW, imgH, photo, info) {
    const bbW = imgW * 0.75;
    const bbH = imgH * 0.28;
    const bx = x;
    const by = y + imgH - bbH;

    doc.setFillColor(0, 0, 0);
    doc.setGState(new doc.GState({ opacity: 0.65 }));
    doc.rect(bx, by, bbW, bbH, 'F');
    doc.setGState(new doc.GState({ opacity: 1 }));

    const lineH = bbH / 4.5;
    const lines = [
      truncate(info.projectName, 35),
      `${photo.work_type||''} / ${photo.sub_category||''}`,
      photo.measurement_point || '',
      photo.shot_date || '',
    ].filter(l => l);
    let ly = by + 0.5;
    lines.forEach(line => {
      addBBText(doc, line, bx + 1, ly, bbW - 2, lineH);
      ly += lineH;
    });
  }

  /* ── 写真描画ヘルパー ──────────────────────────── */
  function drawPhoto(doc, photo, x, y, w, h) {
    if (photo._dataUrl) {
      try { doc.addImage(photo._dataUrl, 'JPEG', x, y, w, h); return; } catch(e) {}
    }
    doc.setDrawColor(200);
    doc.rect(x, y, w, h);
    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text('(no image)', x + w/2, y + h/2, { align: 'center' });
    doc.setTextColor(0);
  }

  /* ── セクション見出しページ ────────────────────── */
  function drawSectionTitle(doc, title, info, pageNum, totalPages) {
    doc.addPage();
    drawHeader(doc, info, title);
    drawFooter(doc, info, pageNum, totalPages);
    addJPText(doc, title, MARGIN, PAGE_H / 2 - 15, CW, 10, { fontSize: 40, fontWeight: 'bold', align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120);
    doc.text('Construction Photo Ledger', PAGE_W / 2, PAGE_H / 2 + 5, { align: 'center' });
    doc.setTextColor(0);
  }

  /* ═══ メイン: PDF出力 ═══════════════════════════ */
  async function exportToPDF(photos, info) {
    if (typeof jspdf === 'undefined' && typeof jsPDF === 'undefined') {
      alert('jsPDFライブラリが読み込まれていません'); return;
    }
    const { jsPDF } = window.jspdf || window;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    const sorted = sortPhotos(photos);
    const beforeAfter = sorted.filter(p => p.photo_category === '着手前・完成写真');
    const grouped = {};
    CATEGORY_ORDER.forEach(cat => {
      if (cat === '着手前・完成写真') return;
      const items = sorted.filter(p => p.photo_category === cat);
      if (items.length) grouped[cat] = items;
    });

    let totalPages = 1;
    if (beforeAfter.length) totalPages += 1 + Math.ceil(beforeAfter.length / 2);
    Object.entries(grouped).forEach(([, items]) => {
      totalPages += 1 + Math.ceil(items.length / 4);
    });
    totalPages += 1;
    let pn = 1;

    // ── 表紙 ──
    addJPText(doc, '工事写真台帳', MARGIN, 55, CW, 14, { fontSize: 48, fontWeight: 'bold', align: 'center' });

    doc.setDrawColor(0); doc.setLineWidth(0.5);
    doc.line(MARGIN + 30, 72, PAGE_W - MARGIN - 30, 72);

    let cy = 82;
    const coverRows = [
      ['工事名称', info.projectName],
      ['工事番号', info.projectNumber],
      ['発注者', info.clientName],
      ['施工業者', info.contractorName],
      ['現場所在地', info.siteLocation],
      ['工期', (info.startDate ? fmtDateJP(info.startDate) : '') +
              (info.startDate && info.endDate ? ' ～ ' : '') +
              (info.endDate ? fmtDateJP(info.endDate) : '')],
      ['現場代理人', info.siteManager],
      ['監理技術者', info.supervisor],
      ['作成日', fmtDateJP(new Date().toISOString().slice(0,10))],
    ];
    coverRows.forEach(([label, val]) => {
      if (!val) return;
      addJPText(doc, label, MARGIN + 30, cy, 35, 5, { fontSize: 20, fontWeight: 'bold' });
      addJPText(doc, ': ' + String(val), MARGIN + 68, cy, 90, 5, { fontSize: 20 });
      cy += 9;
    });

    doc.setDrawColor(0);
    doc.line(MARGIN + 30, cy + 4, PAGE_W - MARGIN - 30, cy + 4);
    pn++;

    // ── 着手前・完成写真（見開き） ──
    if (beforeAfter.length) {
      drawSectionTitle(doc, '着手前・完成写真', info, pn, totalPages);
      pn++;

      const halfW = (CW - 6) / 2;
      const halfH = halfW * 0.75;
      for (let i = 0; i < beforeAfter.length; i += 2) {
        doc.addPage();
        drawHeader(doc, info, '着手前・完成写真');
        drawFooter(doc, info, pn, totalPages);
        pn++;

        for (let j = 0; j < 2; j++) {
          const photo = beforeAfter[i + j];
          if (!photo) continue;
          const x = MARGIN + j * (halfW + 6);
          const y = MARGIN + HEADER_H;

          drawPhoto(doc, photo, x, y, halfW, halfH);
          drawBlackboard(doc, x, y, halfW, halfH, photo, info);

          addJPText(doc, j === 0 ? '【施工前】' : '【施工後】', x, y + halfH + 2, 30, 4, { fontSize: 16, fontWeight: 'bold' });
          addJPText(doc, truncate(photo.description, 50), x, y + halfH + 6, halfW, 3.5, { fontSize: 14, color: '#333333' });
        }
      }
    }

    // ── カテゴリ別写真ページ ──
    const imgW = (CW - 8) / 2;
    const imgH = imgW * 0.75;
    const captionH = 14;
    const blockH = imgH + captionH + 4;

    Object.entries(grouped).forEach(([cat, items]) => {
      drawSectionTitle(doc, cat, info, pn, totalPages);
      pn++;

      for (let i = 0; i < items.length; i++) {
        if (i % 4 === 0) {
          doc.addPage();
          drawHeader(doc, info, cat);
          drawFooter(doc, info, pn, totalPages);
          pn++;
        }

        const col = (i % 4) % 2;
        const row = Math.floor((i % 4) / 2);
        const x = MARGIN + col * (imgW + 8);
        const y = MARGIN + HEADER_H + row * (blockH + 4);
        const photo = items[i];

        drawPhoto(doc, photo, x, y, imgW, imgH);
        drawBlackboard(doc, x, y, imgW, imgH, photo, info);

        let ty = y + imgH + 1;
        addJPText(doc, `${photo.work_type||''} / ${photo.sub_category||''}`, x, ty, imgW, 3, { fontSize: 14, color: '#333333' });
        ty += 3.5;
        addJPText(doc, `${photo.measurement_point||''} | ${photo.shot_date||''}`, x, ty, imgW, 3, { fontSize: 14, color: '#555555' });
        ty += 3.5;
        addJPText(doc, truncate(photo.description, 70), x, ty, imgW, 3, { fontSize: 13, color: '#333333' });
      }
    });

    // ── 写真管理一覧表（横向き） ──
    doc.addPage('a4', 'landscape');
    const lw = 297;
    addJPText(doc, '写真管理一覧', 15, 10, 60, 6, { fontSize: 24, fontWeight: 'bold' });

    const cols = ['No','写真区分','工種','種別','測点','撮影日','撮影者','説明'];
    const colW = [10, 30, 22, 26, 18, 20, 16, lw - 30 - 10 - 30 - 22 - 26 - 18 - 20 - 16];
    let tx = 15, ty2 = 20;

    // ヘッダー
    doc.setFillColor(240, 240, 240);
    doc.rect(15, ty2 - 1, lw - 30, 5, 'F');
    cols.forEach((c, ci) => {
      addJPText(doc, c, tx, ty2 - 1, colW[ci], 4, { fontSize: 14, fontWeight: 'bold' });
      tx += colW[ci];
    });
    ty2 += 5;

    // 行データ
    sorted.forEach((p, i) => {
      if (ty2 > 195) {
        doc.addPage('a4', 'landscape');
        ty2 = 15;
      }
      tx = 15;
      const vals = [
        String(i + 1), p.photo_category||'', p.work_type||'',
        p.sub_category||'', p.measurement_point||'',
        p.shot_date||'', p.photographer||'', truncate(p.description, 50),
      ];
      vals.forEach((v, ci) => {
        addJPText(doc, v, tx, ty2, colW[ci], 3.5, { fontSize: 13 });
        tx += colW[ci];
      });
      doc.setDrawColor(220);
      doc.line(15, ty2 + 4, lw - 15, ty2 + 4);
      ty2 += 4.5;
    });

    doc.save(`写真台帳_${info.projectName||'report'}.pdf`);
  }

  /* ── Excel 出力 ────────────────────────────────── */
  function exportToExcel(photos, info) {
    if (typeof XLSX === 'undefined') { alert('SheetJSが読み込まれていません'); return; }
    const sorted = sortPhotos(photos);
    const rows = sorted.map((p, i) => ({
      'No': i + 1, '写真区分': p.photo_category||'', '工種': p.work_type||'',
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
