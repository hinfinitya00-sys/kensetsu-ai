/**
 * photo-pdf-export.js
 * 工事写真台帳の PDF / Excel 出力
 * 依存: jsPDF (CDN), SheetJS (CDN)
 */
'use strict';

const PHOTO_EXPORT = (() => {

  /* ── カテゴリ順（国交省基準） ──────────────────── */
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

  /* ── PDF 出力 ──────────────────────────────────── */
  async function exportToPDF(photos, projectInfo) {
    if (typeof jspdf === 'undefined' && typeof jsPDF === 'undefined') {
      alert('jsPDFライブラリが読み込まれていません');
      return;
    }
    const { jsPDF } = window.jspdf || window;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pw = 210, ph = 297, m = 15;
    const cw = pw - m * 2, ch = ph - m * 2;

    // ── 表紙 ──
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.text('工事写真台帳', pw / 2, 80, { align: 'center' });

    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    const info = [
      ['工事名', projectInfo.projectName || ''],
      ['施工業者', projectInfo.contractorName || ''],
      ['現場所在地', projectInfo.siteLocation || ''],
      ['作成日', new Date().toLocaleDateString('ja-JP')],
    ];
    let iy = 110;
    info.forEach(([label, val]) => {
      doc.setFont('helvetica', 'bold');
      doc.text(label + ':', m + 20, iy);
      doc.setFont('helvetica', 'normal');
      doc.text(val, m + 60, iy);
      iy += 10;
    });

    // ── 写真ページ（2列×2行 = 4枚/ページ） ──
    const sorted = sortPhotos(photos);
    const imgW = (cw - 8) / 2;
    const imgH = imgW * 0.75;
    const textH = 18;
    const blockH = imgH + textH + 4;

    for (let i = 0; i < sorted.length; i++) {
      if (i % 4 === 0) {
        doc.addPage();
        // フッター
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(projectInfo.projectName || '', m, ph - 8);
        doc.text(
          String(Math.floor(i / 4) + 1),
          pw - m, ph - 8, { align: 'right' }
        );
      }

      const col = (i % 4) % 2;
      const row = Math.floor((i % 4) / 2);
      const x = m + col * (imgW + 8);
      const y = m + row * (blockH + 6);

      const photo = sorted[i];

      // 画像を配置（dataURLがある場合）
      if (photo._dataUrl) {
        try {
          doc.addImage(photo._dataUrl, 'JPEG', x, y, imgW, imgH);
        } catch (e) {
          doc.setDrawColor(200);
          doc.rect(x, y, imgW, imgH);
          doc.setFontSize(10);
          doc.text('(image)', x + imgW / 2, y + imgH / 2, { align: 'center' });
        }
      } else {
        doc.setDrawColor(200);
        doc.rect(x, y, imgW, imgH);
        doc.setFontSize(10);
        doc.text('(no image)', x + imgW / 2, y + imgH / 2, { align: 'center' });
      }

      // キャプション
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      let ty = y + imgH + 3;
      const lines = [
        `[${photo.photo_category || ''}] ${photo.work_type || ''} / ${photo.sub_category || ''}`,
        `${photo.measurement_point ? photo.measurement_point + ' | ' : ''}${photo.shot_date || ''}`,
        photo.description || '',
      ];
      lines.forEach(line => {
        const trimmed = line.substring(0, 80);
        doc.text(trimmed, x, ty);
        ty += 3.5;
      });
    }

    doc.save(`写真台帳_${projectInfo.projectName || 'report'}.pdf`);
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

    // ヘッダースタイル
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[addr]) {
        ws[addr].s = {
          font: { bold: true, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: 'FF6B00' } },
        };
      }
    }

    // 列幅
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
