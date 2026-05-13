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
  let photos = [];
  let currentFilter = 'すべて';
  let sortableInstance = null;
  let apiKey = '';

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
    };
  }

  /* ── ファイルアップロード処理 ──────────────────── */
  async function handleFiles(fileList) {
    const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    if (!files.length) { toast('画像ファイルを選択してください', 'err'); return; }

    apiKey = $('apiKeyInput')?.value.trim() || '';

    for (const file of files) {
      const { base64, mediaType, dataUrl } = await PHOTO_AI.fileToBase64(file);
      const id = crypto.randomUUID();
      const today = new Date().toISOString().slice(0, 10);

      const photo = {
        _id: id,
        _dataUrl: dataUrl,
        _file: file,
        _analyzing: true,
        project_id: 'default',
        project_name: getProjectInfo().projectName || 'default',
        work_type: 'その他',
        photo_category: 'その他',
        sub_category: '',
        detail_category: '',
        measurement_point: '',
        shot_date: today,
        photographer: '',
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
    renderGrid();
    updateCount();
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
      <div class="photo-card" data-id="${p._id}">
        <div class="card-img-wrap">
          <img src="${p._dataUrl || ''}" alt="" loading="lazy">
          ${p._analyzing ? `
            <div class="progress-overlay">
              <div class="spinner"></div>
              <div class="progress-text">AI解析中...</div>
            </div>
          ` : ''}
        </div>
        <div class="card-body">
          <div class="card-category">${p.photo_category || 'その他'}</div>
          <div class="card-desc">${p.description || ''}</div>
        </div>
        <div class="card-meta">
          <span>${p.shot_date || ''}</span>
          <div class="card-actions">
            <button class="card-btn" onclick="LEDGER.openEditModal('${p._id}')" title="編集">✏️</button>
            <button class="card-btn del" onclick="LEDGER.deletePhoto('${p._id}')" title="削除">🗑</button>
          </div>
        </div>
      </div>
    `).join('');

    // SortableJS初期化
    if (sortableInstance) sortableInstance.destroy();
    if (typeof Sortable !== 'undefined') {
      sortableInstance = Sortable.create(grid, {
        animation: 200,
        ghostClass: 'sortable-ghost',
        onEnd: (evt) => {
          const ids = Array.from(grid.children).map(el => el.dataset.id);
          ids.forEach((id, i) => {
            const p = photos.find(pp => pp._id === id);
            if (p) p.sequence_order = i;
          });
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
  function handleExportPDF() {
    if (!photos.length) { toast('写真がありません', 'err'); return; }
    PHOTO_EXPORT.exportToPDF(photos, getProjectInfo());
    toast('PDF出力を開始しました', 'ok');
  }

  function handleExportExcel() {
    if (!photos.length) { toast('写真がありません', 'err'); return; }
    PHOTO_EXPORT.exportToExcel(photos, getProjectInfo());
    toast('Excel出力を開始しました', 'ok');
  }

  /* ── Supabase保存 ──────────────────────────────── */
  async function saveToSupabase() {
    if (!photos.length) { toast('保存する写真がありません', 'err'); return; }
    const info = getProjectInfo();

    try {
      const rows = photos.map(p => ({
        project_id: p.project_id || 'default',
        project_name: info.projectName || 'default',
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
        ai_analysis: p._aiResult || null,
        sequence_order: p.sequence_order || 0,
      }));

      const res = await fetch(`${SB_URL}/rest/v1/photo_reports`, {
        method: 'POST',
        headers: {
          'apikey': SB_KEY,
          'Authorization': 'Bearer ' + SB_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(rows),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }

      toast('Supabaseに保存しました', 'ok');
    } catch (e) {
      toast('保存に失敗: ' + e.message, 'err', 5000);
    }
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

    renderTabs();
    renderGrid();
    updateCount();
  }

  return {
    init, handleFiles, deletePhoto, openEditModal,
    setFilter, handleExportPDF, handleExportExcel, saveToSupabase,
  };
})();

document.addEventListener('DOMContentLoaded', () => LEDGER.init());
