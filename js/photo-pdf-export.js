/**
 * photo-pdf-export.js
 * 工事写真台帳の PDF / Excel 出力（元請け提出レベル）
 * 依存: jsPDF (CDN), SheetJS (CDN)
 */
'use strict';

const PHOTO_EXPORT = (() => {

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

  /* ── PDF 出力 ──────────────────────────────────── */
  async function exportToPDF(photos, projectInfo) {
    if (typeof jspdf === 'undefined' && typeof jsPDF === 'undefined') {
      alert('jsPDFライブラリが読み込まれていません');
      return;
    }
    const { jsPDF } = window.jspdf || window;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pw = 210, ph = 297, m = 15;
    const cw = pw - m * 2;

    const sorted = sortPhotos(photos);
    // 着手前・完成を分離
    const beforeAfter = sorted.filter(p => p.photo_category === '着手前・完成写真');
    const others = sorted.filter(p => p.photo_category !== '着手前・完成写真');

    // 総ページ数を事前計算
    const beforeAfterPages = Math.ceil(beforeAfter.length / 2);
    const otherPages = Math.ceil(others.length / 4);
    const totalPages = 1 + beforeAfterPages + otherPages; // 表紙 + 見開き + 通常

    // ── 表紙 ──
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('工事写真台帳', pw / 2, 60, { align: 'center' });
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('工事写真台帳', pw / 2, 80, { align: 'center' });

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    let iy = 110;
    const infoRows = [
      ['工事番号', projectInfo.projectNumber || ''],
      ['工事名', projectInfo.projectName || ''],
      ['発注者', projectInfo.clientName || ''],
      ['施工業者', projectInfo.contractorName || ''],
      ['現場所在地', projectInfo.siteLocation || ''],
      ['工期', (projectInfo.startDate ? fmtDateJP(projectInfo.startDate) : '') +
               (projectInfo.startDate && projectInfo.endDate ? ' ～ ' : '') +
               (projectInfo.endDate ? fmtDateJP(projectInfo.endDate) : '')],
      ['作成日', fmtDateJP(new Date().toISOString().slice(0, 10))],
    ];
    infoRows.forEach(([label, val]) => {
      if (!val) return;
      doc.setFont('helvetica', 'bold');
      doc.text(label + ':', m + 30, iy);
      doc.setFont('helvetica', 'normal');
      doc.text(String(val), m + 70, iy);
      iy += 9;
    });

    // フッターヘルパー
    let pageNum = 1;
    function addFooter() {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(projectInfo.projectName || '', m, ph - 8);
      doc.text(`${pageNum} / ${totalPages}`, pw - m, ph - 8, { align: 'right' });
      pageNum++;
    }
    addFooter();

    // ── 見開き比較ページ（着手前・完成） ──
    const halfW = (cw - 6) / 2;
    const halfH = halfW * 0.75;
    for (let i = 0; i < beforeAfter.length; i += 2) {
      doc.addPage();
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('着手前・完成 比較写真', pw / 2, m, { align: 'center' });

      for (let j = 0; j < 2; j++) {
        const photo = beforeAfter[i + j];
        if (!photo) continue;
        const x = m + j * (halfW + 6);
        const y = m + 8;

        // 写真
        if (photo._dataUrl) {
          try { doc.addImage(photo._dataUrl, 'JPEG', x, y, halfW, halfH); } catch(e) {
            doc.setDrawColor(200); doc.rect(x, y, halfW, halfH);
          }
        } else {
          doc.setDrawColor(200); doc.rect(x, y, halfW, halfH);
        }

        // 電子小黒板オーバーレイ
        drawBlackboard(doc, x, y + halfH - 18, halfW, 18, photo, projectInfo);

        // キャプション
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        const stage = photo.construction_stage || (j === 0 ? '着手前' : '完成');
        doc.text(`[${stage}] ${photo.shot_date || ''}`, x, y + halfH + 4);
        doc.text((photo.description || '').substring(0, 60), x, y + halfH + 8);
      }
      addFooter();
    }

    // ── 通常ページ（2列×2行 = 4枚/ページ） ──
    const imgW = (cw - 8) / 2;
    const imgH = imgW * 0.75;
    const textH = 14;
    const blockH = imgH + textH + 4;

    for (let i = 0; i < others.length; i++) {
      if (i % 4 === 0) {
        doc.addPage();
        addFooter();
      }

      const col = (i % 4) % 2;
      const row = Math.floor((i % 4) / 2);
      const x = m + col * (imgW + 8);
      const y = m + row * (blockH + 6);

      const photo = others[i];

      // 写真
      if (photo._dataUrl) {
        try { doc.addImage(photo._dataUrl, 'JPEG', x, y, imgW, imgH); } catch(e) {
          doc.setDrawColor(200); doc.rect(x, y, imgW, imgH);
        }
      } else {
        doc.setDrawColor(200); doc.rect(x, y, imgW, imgH);
      }

      // 電子小黒板オーバーレイ
      drawBlackboard(doc, x, y + imgH - 16, imgW, 16, photo, projectInfo);

      // キャプション
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      let ty = y + imgH + 3;
      doc.text(`[${photo.photo_category || ''}] ${photo.work_type || ''} / ${photo.sub_category || ''}`, x, ty);
      ty += 3.5;
      doc.text(`${photo.measurement_point ? photo.measurement_point + ' | ' : ''}${photo.shot_date || ''}`, x, ty);
      ty += 3.5;
      doc.text((photo.description || '').substring(0, 80), x, ty);
    }

    doc.save(`写真台帳_${projectInfo.projectName || 'report'}.pdf`);
  }

  /* ── 電子小黒板描画 ────────────────────────────── */
  function drawBlackboard(doc, x, y, w, h, photo, projectInfo) {
    // 半透明黒矩形
    doc.setFillColor(0, 0, 0);
    doc.setGState(new doc.GState({ opacity: 0.65 }));
    doc.rect(x, y, w, h, 'F');
    doc.setGState(new doc.GState({ opacity: 1 }));

    // 白文字
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'normal');
    const lines = [
      (projectInfo.projectName || '').substring(0, 40),
      `${photo.work_type || ''} / ${photo.sub_category || ''}`,
      photo.measurement_point || '',
      photo.shot_date || '',
    ].filter(l => l);
    let ly = y + 3.5;
    lines.forEach(line => {
      doc.text(line, x + 1.5, ly);
      ly += 3.2;
    });
    doc.setTextColor(0, 0, 0);
  }

  /* ── Excel 出力 ────────────────────────────────── */
  function exportToExcel(photos, projectInfo) {
    if (typeof XLSX === 'undefined') {
      alert('SheetJSライブラリが読み込まれていません');
      return;
    }

    const sorted = sortPhotos(photos);
    const rows = sorted.map((p, i) => ({
      'No': i + 1,
      '写真区分': p.photo_category || '',
      '工種': p.work_type || '',
      '種別': p.sub_category || '',
      '細別': p.detail_category || '',
      '測点': p.measurement_point || '',
      '撮影日': p.shot_date || '',
      '撮影者': p.photographer || '',
      '説明': p.description || '',
      'ファイル名': p.file_path || '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 5 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 12 },
      { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 40 }, { wch: 20 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '写真管理一覧');
    XLSX.writeFile(wb, `写真管理_${projectInfo.projectName || 'report'}.xlsx`);
  }

  return { exportToPDF, exportToExcel, sortPhotos, CATEGORY_ORDER };
})();
