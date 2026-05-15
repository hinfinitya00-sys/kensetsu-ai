/**
 * photo-ledger.js
 * 写真台帳メインロジック
 * 依存: PHOTO_AI (photo-ai-analyzer.js), PHOTO_EXPORT (photo-pdf-export.js), Supabase, SortableJS
 */
'use strict';

const LEDGER = (() => {

  /* ── Supabase設定 ───────────────────────────────── */
  const SB_URL = 'https://bjohdzcoziezdkqcebhe.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqb2hkemNvemllemRrcWNlYmhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMTI5NTAsImV4cCI6MjA4ODg4ODk1MH0.SUZ35eULi_RQzNPDQG2n5cBJCdTDXJZ1pB307ZNbSPU';

  const $ = id => document.getElementById(id);
  function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  const DRAFT_KEY = 'kensetsu_photo_ledger_draft';
  let photos = [];
  let currentFilter = 'すべて';
  let sortableInstance = null;
  let apiKey = '';
  let selectMode = false;
  const selectedIds = new Set();

  function makeProjectId(name) {
    return (name || 'default').toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '') || 'default';
  }

  /* ── Toast ─────────────────────────────────────── */
  let _tt;
  function toast(msg, type = '', dur = 3000) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(_tt);
    _tt = setTimeout(() => { t.className = 'toast'; }, dur);
  }

  /* ── プロジェクト情報取得 ──────────────────────── */
  function getProjectInfo() {
    return {
      projectName: $('projectName')?.value.trim() || '',
      contractorName: $('contractorName')?.value.trim() || '',
      siteLocation: $('siteLocation')?.value.trim() || '',
      projectNumber: $('projectNumber')?.value.trim() || '',
      clientName: $('clientName')?.value.trim() || '',
      startDate: $('startDate')?.value || '',
      endDate: $('endDate')?.value || '',
      siteManager: $('siteManager')?.value.trim() || '',
      supervisor: $('supervisor')?.value.trim() || '',
    };
  }

  /* ── ファイルアップロード処理 ──────────────────── */
  async function handleFiles(fileList) {
    const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    if (!files.length) { toast('画像ファイルを選択してください', 'err'); return; }

    apiKey = $('apiKeyInput')?.value.trim() || '';

    // プリセット値を取得
    const presetWork = $('presetWorkType')?.value || '';
    const presetMeasure = $('presetMeasurement')?.value.trim() || '';
    const presetPhotog = $('presetPhotographer')?.value.trim() || '';

    for (const file of files) {
      const { base64, mediaType, dataUrl } = await PHOTO_AI.fileToBase64(file);
      const id = crypto.randomUUID();
      const today = new Date().toISOString().slice(0, 10);

      const photo = {
        _id: id,
        _dataUrl: dataUrl,
        _file: file,
        _analyzing: true,
        project_id: makeProjectId(getProjectInfo().projectName),
        project_name: getProjectInfo().projectName || 'default',
        work_type: presetWork || 'その他',
        photo_category: 'その他',
        sub_category: '',
        detail_category: '',
        measurement_point: presetMeasure,
        shot_date: today,
        photographer: presetPhotog,
        description: '解析中...',
        file_path: file.name,
        sequence_order: photos.length,
      };

      photos.push(photo);
      renderGrid();

      // AI解析
      if (apiKey) {
        try {
          const result = await PHOTO_AI.analyzePhoto(base64, mediaType, apiKey);
          photo.photo_category = result.photo_category || 'その他';
          photo.work_type = result.estimated_work_type || 'その他';
          photo.sub_category = result.estimated_sub_type || '';
          photo.description = result.description || '';
          if (result.measurement_point && !photo.measurement_point) {
            photo.measurement_point = result.measurement_point;
          }
          photo._alert = result.alert || null;
          photo._aiResult = result;
        } catch (e) {
          photo.description = '（AI解析失敗 - 手動入力してください）';
        }
      } else {
        photo.description = '（APIキー未設定 - 手動入力してください）';
      }

      photo._analyzing = false;
      renderGrid();
    }

    toast(`${files.length}枚の写真を追加しました`, 'ok');
    updateCount();
  }

  /* ── 写真削除 ──────────────────────────────────── */
  function deletePhoto(id) {
    if (!confirm('この写真を削除しますか？')) return;
    photos = photos.filter(p => p._id !== id);
    photos.forEach((p, i) => { p.sequence_order = i; });
    renderGrid();
    updateCount();
  }

  /* ── 複数選択・一括削除 ─────────────────────────── */
  function toggleSelectMode() {
    selectMode = !selectMode;
    selectedIds.clear();
    const btn = $('selectModeBtn');
    const bulkBtn = $('bulkDeleteBtn');
    if (btn) { btn.textContent = selectMode ? '✖️ 選択解除' : '☑️ 選択モード'; btn.style.background = selectMode ? 'var(--red)' : ''; }
    if (bulkBtn) bulkBtn.style.display = selectMode ? 'inline-flex' : 'none';
    updateBulkDeleteBtn();
    renderGrid();
  }

  function updateBulkDeleteBtn() {
    const btn = $('bulkDeleteBtn');
    if (btn) btn.textContent = `🗑️ 選択削除（${selectedIds.size}枚）`;
  }

  function toggleSelect(id) {
    if (selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id);
    updateBulkDeleteBtn();
    const card = document.querySelector(`.photo-card[data-id="${id}"]`);
    if (card) {
      card.classList.toggle('selected', selectedIds.has(id));
      const icon = card.querySelector('.check-icon');
      if (icon) icon.textContent = selectedIds.has(id) ? '☑️' : '☐';
    }
  }

  function bulkDelete() {
    if (!selectedIds.size) { toast('写真を選択してください', 'err'); return; }
    if (!confirm(`選択した${selectedIds.size}枚を削除しますか？`)) return;
    photos = photos.filter(p => !selectedIds.has(p._id));
    photos.forEach((p, i) => { p.sequence_order = i; });
    selectedIds.clear();
    selectMode = false;
    const btn = $('selectModeBtn');
    const bulkBtn = $('bulkDeleteBtn');
    if (btn) { btn.textContent = '☑️ 選択モード'; btn.style.background = ''; }
    if (bulkBtn) bulkBtn.style.display = 'none';
    renderGrid();
    updateCount();
    toast('削除しました。「保存・更新」で確定してください', 'ok');
  }

  /* ── 写真編集モーダル ──────────────────────────── */
  function openEditModal(id) {
    const photo = photos.find(p => p._id === id);
    if (!photo) return;

    const categories = PHOTO_EXPORT.CATEGORY_ORDER;
    const workTypes = ['植生工','吹付工','法枠工','アンカー工','法面清掃工','仮設工','その他'];

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>📝 写真情報を編集</h3>
        <div class="f-group" style="margin-bottom:12px;">
          <label style="font-size:11px;font-weight:700;color:var(--muted);">写真区分</label>
          <select id="editCategory" class="f-input">
            ${categories.map(c => `<option value="${c}" ${photo.photo_category === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="f-group" style="margin-bottom:12px;">
          <label style="font-size:11px;font-weight:700;color:var(--muted);">工種</label>
          <select id="editWorkType" class="f-input">
            ${workTypes.map(w => `<option value="${w}" ${photo.work_type === w ? 'selected' : ''}>${w}</option>`).join('')}
          </select>
        </div>
        <div class="f-group" style="margin-bottom:12px;">
          <label style="font-size:11px;font-weight:700;color:var(--muted);">種別</label>
          <input type="text" id="editSubCategory" class="f-input" value="${photo.sub_category || ''}">
        </div>
        <div class="f-group" style="margin-bottom:12px;">
          <label style="font-size:11px;font-weight:700;color:var(--muted);">測点</label>
          <input type="text" id="editMeasurement" class="f-input" value="${photo.measurement_point || ''}">
        </div>
        <div class="f-group" style="margin-bottom:12px;">
          <label style="font-size:11px;font-weight:700;color:var(--muted);">撮影日</label>
          <input type="date" id="editShotDate" class="f-input" value="${photo.shot_date || ''}">
        </div>
        <div class="f-group" style="margin-bottom:12px;">
          <label style="font-size:11px;font-weight:700;color:var(--muted);">撮影者</label>
          <input type="text" id="editPhotographer" class="f-input" value="${photo.photographer || ''}">
        </div>
        <div class="f-group" style="margin-bottom:12px;">
          <label style="font-size:11px;font-weight:700;color:var(--muted);">説明</label>
          <textarea id="editDescription" class="f-input" rows="3">${photo.description || ''}</textarea>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" onclick="this.closest('.modal-backdrop').remove()">キャンセル</button>
          <button class="btn-primary" id="editSaveBtn">保存</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    $('editSaveBtn').addEventListener('click', () => {
      photo.photo_category = $('editCategory').value;
      photo.work_type = $('editWorkType').value;
      photo.sub_category = $('editSubCategory').value;
      photo.measurement_point = $('editMeasurement').value;
      photo.shot_date = $('editShotDate').value;
      photo.photographer = $('editPhotographer').value;
      photo.description = $('editDescription').value;
      modal.remove();
      renderGrid();
      toast('更新しました', 'ok');
    });
  }

  /* ── グリッド描画 ──────────────────────────────── */
  function renderGrid() {
    const grid = $('photoGrid');
    if (!grid) return;

    const filtered = currentFilter === 'すべて'
      ? photos
      : photos.filter(p => p.photo_category === currentFilter);

    if (!filtered.length) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
          <span class="empty-icon">📷</span>
          <div class="empty-title">写真がありません</div>
          <div class="empty-sub">上のエリアから写真をアップロードしてください</div>
        </div>`;
      return;
    }

    grid.innerHTML = filtered.map(p => `
      <div class="photo-card${selectedIds.has(p._id) ? ' selected' : ''}" data-id="${p._id}">
        <div class="card-img-wrap">
          <img src="${p._dataUrl || ''}" alt="" loading="lazy">
          ${p._analyzing ? `
            <div class="progress-overlay">
              <div class="spinner"></div>
              <div class="progress-text">AI解析中...</div>
            </div>
          ` : ''}
          ${selectMode ? `
            <div class="select-overlay" onclick="event.stopPropagation();LEDGER.toggleSelect('${p._id}')">
              <span class="check-icon">${selectedIds.has(p._id) ? '☑️' : '☐'}</span>
            </div>
          ` : ''}
        </div>
        <div class="card-body">
          <div class="card-category">${p.photo_category || 'その他'}</div>
          <div class="card-desc">${p.description || ''}</div>
        </div>
        <div class="card-meta">
          <span>${p.shot_date || ''}</span>
          ${selectMode ? '' : `
          <div class="card-actions">
            <button class="card-btn" onclick="LEDGER.openEditModal('${p._id}')" title="編集">✏️</button>
            <button class="card-btn del" onclick="LEDGER.deletePhoto('${p._id}')" title="削除">🗑</button>
          </div>`}
        </div>
      </div>
    `).join('');

    // SortableJS初期化
    if (sortableInstance) sortableInstance.destroy();
    if (typeof Sortable !== 'undefined') {
      sortableInstance = Sortable.create(grid, {
        animation: 200,
        ghostClass: 'sortable-ghost',
        onEnd: () => {
          const cards = Array.from(grid.children);
          const newOrder = [];
          cards.forEach((card, idx) => {
            const id = card.dataset.id;
            const p = photos.find(pp => pp._id === id);
            if (p) { p.sequence_order = idx; newOrder.push(p); }
          });
          photos.length = 0;
          newOrder.forEach(p => photos.push(p));
          saveOrderToSupabase();
        },
      });
    }
  }

  /* ── タブ描画 ──────────────────────────────────── */
  function renderTabs() {
    const tabs = $('categoryTabs');
    if (!tabs) return;

    const allCategories = ['すべて', ...PHOTO_EXPORT.CATEGORY_ORDER];
    tabs.innerHTML = allCategories.map(cat =>
      `<button class="${cat === currentFilter ? 'active' : ''}" onclick="LEDGER.setFilter('${cat}')">${cat}</button>`
    ).join('');
  }

  function setFilter(cat) {
    currentFilter = cat;
    renderTabs();
    renderGrid();
  }

  function updateCount() {
    const el = $('photoCount');
    if (el) el.textContent = photos.length + '枚';
  }

  /* ── 出力 ──────────────────────────────────────── */
  function handlePrint() {
    if (!photos.length) { toast('先に台帳を読み込んでください', 'err'); return; }
    const info = getProjectInfo();
    const today = new Date().toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric' });
    const koki = [info.startDate, info.endDate].filter(Boolean).join(' ～ ');

    const photoHTML = photos.map(p => `
      <div class="p-card">
        <img src="${escHtml(p._dataUrl || p.file_url || '')}" alt=""
             onerror="this.style.background='#eee';this.style.height='120px'">
        <div class="p-cat">${escHtml(p.photo_category || '')}</div>
        <div class="p-desc">${escHtml(p.description || '')}</div>
        <div class="p-date">${escHtml(p.shot_date || '')} ${p.measurement_point ? '｜' + escHtml(p.measurement_point) : ''}</div>
      </div>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8">
<title>工事写真台帳 - ${escHtml(info.projectName || '')}</title>
<style>
  body{font-family:"Noto Sans JP","Hiragino Sans",sans-serif;margin:0;padding:0;background:#fff;}
  .cover{padding:60px 50px;page-break-after:always;}
  .cover h1{font-size:28pt;font-weight:bold;margin-bottom:16px;}
  .cover hr{border:2px solid #333;margin:16px 0;}
  .cover table{width:100%;font-size:13pt;line-height:2.2;border-collapse:collapse;}
  .cover td:first-child{width:130px;font-weight:bold;}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px;}
  .p-card{border:1px solid #aaa;padding:4px;break-inside:avoid;page-break-inside:avoid;}
  .p-card img{width:100%;height:150px;object-fit:cover;display:block;background:#ddd;}
  .p-cat{font-size:8pt;font-weight:bold;color:#333;margin-top:2px;}
  .p-desc{font-size:8pt;color:#444;}
  .p-date{font-size:7pt;color:#666;}
  .page-header{font-size:9pt;color:#666;border-bottom:1px solid #ccc;padding:4px 10px;display:flex;justify-content:space-between;}
  @page{size:A4 portrait;margin:12mm;}
  @media print{button{display:none;}}
</style></head><body>
<div class="cover">
  <h1>工事写真台帳</h1><hr>
  <table>
    <tr><td>工事名称</td><td>${escHtml(info.projectName || '—')}</td></tr>
    <tr><td>施工業者</td><td>${escHtml(info.contractorName || '—')}</td></tr>
    <tr><td>発注者名</td><td>${escHtml(info.clientName || '—')}</td></tr>
    <tr><td>現場所在地</td><td>${escHtml(info.siteLocation || '—')}</td></tr>
    <tr><td>工期</td><td>${escHtml(koki || '—')}</td></tr>
    ${info.siteManager ? '<tr><td>現場代理人</td><td>' + escHtml(info.siteManager) + '</td></tr>' : ''}
    <tr><td>作成日</td><td>${escHtml(today)}</td></tr>
  </table><hr>
</div>
<div class="page-header"><span>${escHtml(info.projectName || '')}</span><span>工事写真台帳</span></div>
<div class="grid">${photoHTML}</div>
<script>
window.addEventListener('load',function(){
  var imgs=document.querySelectorAll('img'),loaded=0;
  if(!imgs.length){window.print();return;}
  imgs.forEach(function(img){
    if(img.complete){loaded++;if(loaded>=imgs.length)window.print();}
    else{
      img.addEventListener('load',function(){loaded++;if(loaded>=imgs.length)window.print();});
      img.addEventListener('error',function(){loaded++;if(loaded>=imgs.length)window.print();});
    }
  });
});
<\/script></body></html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    toast('新しいタブで台帳が開きます。印刷ダイアログが自動的に表示されます', 'ok', 4000);
  }

  async function handleExportPDF() {
    if (!photos.length) { toast('写真がありません', 'err'); return; }
    toast('PDF生成中...しばらくお待ちください', '', 15000);
    await PHOTO_EXPORT.exportToPDF(photos, getProjectInfo());
    toast('PDFを保存しました ✅', 'ok');
  }

  function handleExportExcel() {
    if (!photos.length) { toast('写真がありません', 'err'); return; }
    PHOTO_EXPORT.exportToExcel(photos, getProjectInfo());
    toast('Excel出力を開始しました', 'ok');
  }

  function shareLink() {
    const projectId = makeProjectId(getProjectInfo().projectName);
    if (!projectId || projectId === 'default') {
      toast('工事名を入力してから共有リンクを生成してください', 'err');
      return;
    }
    const url = `https://hinfinitya00-sys.github.io/kensetsu-ai/photo-view.html?project=${projectId}`;
    navigator.clipboard.writeText(url).then(() => {
      toast('共有リンクをコピーしました ✅', 'ok');
    }).catch(() => {
      prompt('以下のURLをコピーしてください:', url);
    });
  }

  async function handleExportXMLZip() {
    if (!photos.length) { toast('写真がありません', 'err'); return; }
    toast('電子納品ZIP生成中...', '', 10000);
    await PHOTO_XML.exportToXMLZip(photos, getProjectInfo());
    toast('電子納品ZIPを保存しました ✅', 'ok');
  }

  /* ── 電子納品チェック ──────────────────────────── */
  function checkElectronicSubmission() {
    const info = getProjectInfo();
    const checks = [
      { label: '工事名が入力されている', ok: !!info.projectName, level: 'error' },
      { label: '工事番号が入力されている', ok: !!info.projectNumber, level: 'warn' },
      { label: '施工業者名が入力されている', ok: !!info.contractorName, level: 'error' },
      { label: '工期（着手・完成）が入力されている', ok: !!(info.startDate && info.endDate), level: 'warn' },
      { label: '写真が1枚以上ある', ok: photos.length > 0, level: 'error' },
      { label: '着手前写真または完成写真が含まれている', ok: photos.some(p => p.photo_category === '着手前写真' || p.photo_category === '完成写真'), level: 'warn' },
      { label: '全写真に工種が設定されている', ok: photos.every(p => p.work_type && p.work_type !== 'その他'), level: 'warn' },
      { label: '全写真に撮影日が設定されている', ok: photos.every(p => !!p.shot_date), level: 'error' },
      { label: '写真ファイルがJPEG/PNG形式', ok: photos.every(p => !p._file || p._file.type.startsWith('image/')), level: 'error' },
    ];

    const hasError = checks.some(c => !c.ok && c.level === 'error');
    const hasWarn = checks.some(c => !c.ok && c.level === 'warn');

    const listHtml = checks.map(c => {
      const icon = c.ok ? '✅' : (c.level === 'error' ? '❌' : '⚠️');
      const color = c.ok ? 'var(--green)' : (c.level === 'error' ? 'var(--red)' : 'var(--yellow)');
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px;">
        <span style="font-size:16px;">${icon}</span>
        <span style="color:${color};">${c.label}</span>
      </div>`;
    }).join('');

    let actionHtml;
    if (hasError) {
      actionHtml = `
        <button class="btn-primary" disabled style="opacity:.5;cursor:not-allowed;">❌ エラーを解決してください</button>
        <button class="btn-secondary" onclick="this.closest('.modal-backdrop').remove()">閉じる</button>`;
    } else if (hasWarn) {
      actionHtml = `
        <button class="btn-primary" onclick="this.closest('.modal-backdrop').remove();handleExportXMLZip();" style="background:linear-gradient(135deg,var(--yellow),#D97706);">⚠️ 警告を確認して出力</button>
        <button class="btn-secondary" onclick="this.closest('.modal-backdrop').remove()">閉じる</button>`;
    } else {
      actionHtml = `
        <button class="btn-primary" onclick="this.closest('.modal-backdrop').remove();handleExportXMLZip();">✅ 電子納品ZIPを出力</button>
        <button class="btn-secondary" onclick="this.closest('.modal-backdrop').remove()">閉じる</button>`;
    }

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>📋 電子納品チェック結果</h3>
        <div style="margin-bottom:16px;">${listHtml}</div>
        <div class="modal-actions">${actionHtml}</div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  }

  /* ── 並び順をDBに保存 ───────────────────────────── */
  async function saveOrderToSupabase() {
    const saved = photos.filter(p => p.file_url && p.file_path);
    if (!saved.length) return;
    for (const p of saved) {
      const fp = encodeURIComponent(p.file_path);
      const pid = encodeURIComponent(p.project_id || 'default');
      await fetch(
        `${SB_URL}/rest/v1/photo_reports?file_path=eq.${fp}&project_id=eq.${pid}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SB_KEY,
            'Authorization': 'Bearer ' + SB_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ sequence_order: p.sequence_order }),
        }
      ).catch(() => {});
    }
  }

  /* ── Supabase Storage アップロード ────────────── */
  async function uploadFileToStorage(file, projectId) {
    const today = new Date().toISOString().slice(0, 10);
    const uuid = crypto.randomUUID();
    const safeName = file.name.replace(/[^\w.\-]/g, '_');
    const filePath = `${projectId}/${today}/${uuid}_${safeName}`;

    const res = await fetch(`${SB_URL}/storage/v1/object/site-photos/${filePath}`, {
      method: 'PUT',
      headers: {
        'apikey': SB_KEY,
        'Authorization': 'Bearer ' + SB_KEY,
        'Content-Type': file.type || 'image/jpeg',
      },
      body: file,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Storage upload failed: ${res.status}`);
    }

    const fileUrl = `${SB_URL}/storage/v1/object/public/site-photos/${filePath}`;
    return { filePath, fileUrl };
  }

  /* ── Supabase保存（Storage + DB） ────────────── */
  async function saveToSupabase() {
    if (!photos.length) { toast('保存する写真がありません', 'err'); return; }
    const info = getProjectInfo();
    if (!info.projectName) { toast('工事名を入力してください', 'err'); return; }
    const projectId = makeProjectId(info.projectName);

    toast('保存中...', '', 15000);

    try {
      // Step1: 新しいファイルをStorageにアップロード
      for (const p of photos) {
        if (p._file && !p.file_url) {
          try {
            const { filePath, fileUrl } = await uploadFileToStorage(p._file, projectId);
            p.file_path = filePath;
            p.file_url = fileUrl;
          } catch (e) {
            console.warn('Storage upload failed:', p.file_path, e.message);
          }
        }
      }

      // Step2: UPSERT（同じproject_id+file_pathなら更新、なければ追加）
      const rows = photos.map(p => ({
        project_id: projectId,
        project_name: info.projectName,
        contractor_name: info.contractorName || null,
        site_location: info.siteLocation || null,
        work_type: p.work_type || 'その他',
        photo_category: p.photo_category || 'その他',
        sub_category: p.sub_category || null,
        detail_category: p.detail_category || null,
        measurement_point: p.measurement_point || null,
        shot_date: p.shot_date || new Date().toISOString().slice(0, 10),
        photographer: p.photographer || null,
        description: p.description || null,
        file_path: p.file_path || '',
        file_url: p.file_url || null,
        ai_analysis: p._aiResult || null,
        sequence_order: p.sequence_order || 0,
      }));

      const res = await fetch(`${SB_URL}/rest/v1/photo_reports?on_conflict=project_id,file_path`, {
        method: 'POST',
        headers: {
          'apikey': SB_KEY,
          'Authorization': 'Bearer ' + SB_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify(rows),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }

      // Step3: UIにない写真をDBから削除
      const currentFilePaths = photos.map(p => p.file_path).filter(Boolean);
      const encodedProject = encodeURIComponent(info.projectName || 'default');
      const dbRes = await fetch(
        `${SB_URL}/rest/v1/photo_reports?project_name=eq.${encodedProject}&select=id,file_path`,
        { headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY } }
      );
      if (dbRes.ok) {
        const dbRecords = await dbRes.json();
        const toDelete = dbRecords.filter(r => !currentFilePaths.includes(r.file_path));
        for (const rec of toDelete) {
          await fetch(`${SB_URL}/rest/v1/photo_reports?id=eq.${rec.id}`, {
            method: 'DELETE',
            headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY },
          });
        }
      }

      clearDraft();
      toast(`${photos.length}枚を保存しました ✅`, 'ok');
    } catch (e) {
      toast('保存に失敗: ' + e.message, 'err', 5000);
    }
  }

  /* ── Supabaseから読み込み ──────────────────────── */
  async function loadFromSupabase(projectName) {
    if (!projectName) { toast('工事名を入力してください', 'err'); return; }

    toast('読み込み中...', '', 5000);

    try {
      const encoded = encodeURIComponent(projectName);
      const res = await fetch(
        `${SB_URL}/rest/v1/photo_reports?project_name=eq.${encoded}&order=sequence_order.asc`,
        {
          headers: {
            'apikey': SB_KEY,
            'Authorization': 'Bearer ' + SB_KEY,
          },
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      if (!data.length) {
        toast('該当する台帳が見つかりませんでした', 'err');
        return;
      }

      // フォームに工事情報を復元
      const first = data[0];
      if ($('projectName'))     $('projectName').value = first.project_name || '';
      if ($('contractorName'))  $('contractorName').value = first.contractor_name || '';
      if ($('siteLocation'))    $('siteLocation').value = first.site_location || '';

      // photos配列にセット
      photos = data.map((r, i) => ({
        _id: r.id || crypto.randomUUID(),
        _dataUrl: r.file_url || '',
        _file: null,
        _analyzing: false,
        project_id: r.project_id || 'default',
        project_name: r.project_name || '',
        work_type: r.work_type || 'その他',
        photo_category: r.photo_category || 'その他',
        sub_category: r.sub_category || '',
        detail_category: r.detail_category || '',
        measurement_point: r.measurement_point || '',
        shot_date: r.shot_date || '',
        photographer: r.photographer || '',
        description: r.description || '',
        file_path: r.file_path || '',
        file_url: r.file_url || '',
        _aiResult: r.ai_analysis || null,
        sequence_order: r.sequence_order ?? i,
      }));

      renderGrid();
      updateCount();
      toast(`${data.length}枚の写真を読み込みました ✅`, 'ok');
    } catch (e) {
      toast('読み込みに失敗: ' + e.message, 'err', 5000);
    }
  }

  /* ── 過去台帳を呼び出す（一覧モーダル） ──────── */
  async function promptLoadFromDB() {
    // 保存済み工事名一覧を取得
    let data;
    try {
      const res = await fetch(
        `${SB_URL}/rest/v1/photo_reports?select=project_name,shot_date&order=created_at.desc`,
        { headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY } }
      );
      data = await res.json();
    } catch (e) {
      toast('一覧の取得に失敗しました', 'err');
      return;
    }

    // project_name の重複排除 + 最終撮影日を取得
    const projectMap = new Map();
    (data || []).forEach(r => {
      if (!r.project_name) return;
      const existing = projectMap.get(r.project_name);
      if (!existing || (r.shot_date && r.shot_date > (existing.lastDate || ''))) {
        projectMap.set(r.project_name, { name: r.project_name, lastDate: r.shot_date || '' });
      }
    });
    const projects = Array.from(projectMap.values());

    // モーダル生成
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';

    if (!projects.length) {
      modal.innerHTML = `
        <div class="modal-content">
          <h3>📂 保存済み台帳を選択</h3>
          <div style="color:var(--muted);font-size:13px;padding:20px 0;text-align:center;">
            保存済みの台帳がありません
          </div>
          <div class="modal-actions">
            <button class="btn-secondary" onclick="this.closest('.modal-backdrop').remove()">閉じる</button>
          </div>
        </div>`;
    } else {
      const listHtml = projects.map((p, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;
          padding:10px 12px;border:1px solid var(--border);border-radius:8px;
          margin-bottom:8px;background:var(--card2);">
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:700;color:var(--text);">${escHtml(p.name)}</div>
            <div style="font-size:11px;color:var(--muted);">最終撮影日: ${p.lastDate || '—'}</div>
          </div>
          <button class="btn-primary" style="padding:8px 16px;font-size:12px;"
            data-idx="${i}">選択</button>
        </div>
      `).join('');

      modal.innerHTML = `
        <div class="modal-content">
          <h3>📂 保存済み台帳を選択</h3>
          <div id="_projectList">${listHtml}</div>
          <div class="modal-actions">
            <button class="btn-secondary" onclick="this.closest('.modal-backdrop').remove()">閉じる</button>
          </div>
        </div>`;
    }

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    // 選択ボタンのイベント
    modal.querySelectorAll('[data-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        const proj = projects[idx];
        if (proj) {
          modal.remove();
          loadFromSupabase(proj.name);
        }
      });
    });
  }

  /* ── Storageから写真を復元 ──────────────────────── */
  async function restoreFromStorage() {
    const info = getProjectInfo();
    if (!info.projectName) { toast('工事名を入力してください', 'err'); return; }
    const projectId = makeProjectId(info.projectName);

    toast('Storageからファイル一覧を取得中...', '', 10000);

    try {
      // フォルダ一覧を再帰的に取得
      const listRes = await fetch(`${SB_URL}/storage/v1/object/list/site-photos`, {
        method: 'POST',
        headers: {
          'apikey': SB_KEY,
          'Authorization': 'Bearer ' + SB_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prefix: projectId + '/', limit: 1000 }),
      });

      if (!listRes.ok) throw new Error(`Storage list failed: ${listRes.status}`);
      const folders = await listRes.json();

      // 各サブフォルダ内のファイルを取得
      const allFiles = [];
      for (const folder of folders) {
        if (!folder.name) continue;
        const subRes = await fetch(`${SB_URL}/storage/v1/object/list/site-photos`, {
          method: 'POST',
          headers: {
            'apikey': SB_KEY,
            'Authorization': 'Bearer ' + SB_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ prefix: `${projectId}/${folder.name}/`, limit: 1000 }),
        });
        if (subRes.ok) {
          const files = await subRes.json();
          files.forEach(f => {
            if (f.name && f.metadata) {
              allFiles.push({
                path: `${projectId}/${folder.name}/${f.name}`,
                name: f.name,
              });
            }
          });
        }
      }

      if (!allFiles.length) {
        toast('Storageに写真が見つかりませんでした', 'err');
        return;
      }

      // photo_reportsにUPSERT
      const today = new Date().toISOString().slice(0, 10);
      const rows = allFiles.map((f, i) => ({
        project_id: projectId,
        project_name: info.projectName,
        contractor_name: info.contractorName || null,
        site_location: info.siteLocation || null,
        work_type: 'その他',
        photo_category: 'その他',
        shot_date: today,
        file_path: f.path,
        file_url: `${SB_URL}/storage/v1/object/public/site-photos/${f.path}`,
        sequence_order: i,
      }));

      const res = await fetch(`${SB_URL}/rest/v1/photo_reports?on_conflict=project_id,file_path`, {
        method: 'POST',
        headers: {
          'apikey': SB_KEY,
          'Authorization': 'Bearer ' + SB_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify(rows),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }

      toast(`${allFiles.length}枚の写真を復元しました。✏️で区分を編集してください`, 'ok', 5000);
      await loadFromSupabase(info.projectName);
    } catch (e) {
      toast('復元に失敗: ' + e.message, 'err', 5000);
    }
  }

  /* ── 下書き保存 ────────────────────────────────── */
  function saveDraft() {
    const draft = {
      projectName: $('projectName')?.value || '',
      contractorName: $('contractorName')?.value || '',
      siteLocation: $('siteLocation')?.value || '',
      projectNumber: $('projectNumber')?.value || '',
      clientName: $('clientName')?.value || '',
      startDate: $('startDate')?.value || '',
      endDate: $('endDate')?.value || '',
      siteManager: $('siteManager')?.value || '',
      supervisor: $('supervisor')?.value || '',
      apiKey: $('apiKeyInput')?.value || '',
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }

  function restoreDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      const fields = ['projectName','contractorName','siteLocation','projectNumber','clientName','startDate','endDate','siteManager','supervisor'];
      fields.forEach(id => { if ($(id) && draft[id]) $(id).value = draft[id]; });
      if ($('apiKeyInput') && draft.apiKey) $('apiKeyInput').value = draft.apiKey;
      if (draft.projectName) {
        toast(`下書きを復元しました（${draft.savedAt.slice(0,10)}）`, 'ok');
      }
    } catch(e) {}
  }

  function clearDraft() {
    localStorage.removeItem(DRAFT_KEY);
  }

  /* ── 初期化 ────────────────────────────────────── */
  function init() {
    // ドラッグ&ドロップ
    const zone = $('uploadZone');
    if (zone) {
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
      zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
      });
    }

    const fileInput = $('fileInput');
    if (fileInput) {
      fileInput.addEventListener('change', e => handleFiles(e.target.files));
    }

    // 下書き復元
    restoreDraft();

    // フォーム自動保存（500msデバウンス）
    let _draftTimer;
    ['projectName','contractorName','siteLocation','projectNumber','clientName','startDate','endDate','siteManager','supervisor','apiKeyInput'].forEach(id => {
      const el = $(id);
      if (el) {
        el.addEventListener('input', () => {
          clearTimeout(_draftTimer);
          _draftTimer = setTimeout(saveDraft, 500);
        });
      }
    });

    renderTabs();
    renderGrid();
    updateCount();
  }

  return {
    init, handleFiles, deletePhoto, openEditModal,
    setFilter, toggleSelectMode, toggleSelect, bulkDelete,
    handlePrint, handleExportPDF, handleExportExcel, handleExportXMLZip, shareLink, checkElectronicSubmission,
    saveToSupabase, loadFromSupabase, promptLoadFromDB, restoreFromStorage,
    saveDraft, restoreDraft, clearDraft,
  };
})();

document.addEventListener('DOMContentLoaded', () => LEDGER.init());
