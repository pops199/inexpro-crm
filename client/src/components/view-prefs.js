/* ═══════════════════════════════════════════════════════════════════════════
   ViewPrefs — shared helper for per-user column/sort customization
   ═══════════════════════════════════════════════════════════════════════════
   Usage (from a list component):

     const { catalog, config } = await ViewPrefs.load('workflows');
     // Build visible columns based on config.columns order + visible flag.
     // Use config.sortBy / config.sortDir when calling the list API.

     ViewPrefs.attachButton({
       moduleKey: 'workflows',
       catalog,
       current: config,
       onChange: newConfig => { ... re-render the list ... },
     });

   The helper handles the modal UI, drag-to-reorder, save/reset.
   ═══════════════════════════════════════════════════════════════════════════ */

const ViewPrefs = (() => {

  async function load(moduleKey) {
    return Api.viewPrefs.get(moduleKey);
  }

  function _catalogById(catalog) {
    return Object.fromEntries((catalog.columns || []).map(c => [c.id, c]));
  }

  /* ─── "⚙ Columns" button wired into #header-actions ─── */

  function attachButton({ moduleKey, catalog, current, onChange }) {
    const host = document.getElementById('header-actions');
    if (!host) return;

    // Only inject once per render
    if (host.querySelector('.js-view-prefs-btn')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-secondary js-view-prefs-btn';
    btn.innerHTML = '⚙ Columns';
    btn.style.marginLeft = '.4rem';
    btn.addEventListener('click', () => openEditor({ moduleKey, catalog, current, onChange }));
    host.appendChild(btn);
  }

  /* ─── Modal editor ─── */

  function openEditor({ moduleKey, catalog, current, onChange }) {
    // Deep-clone the config so edits stay local until save
    const working = {
      columns: JSON.parse(JSON.stringify(current.columns || [])),
      sortBy:  current.sortBy  || catalog.defaultSort.sortBy,
      sortDir: current.sortDir || catalog.defaultSort.sortDir,
    };

    // Ensure every catalog column is represented (append hidden if missing)
    const known = new Set(working.columns.map(c => c.id));
    for (const c of catalog.columns) {
      if (!known.has(c.id)) working.columns.push({ id: c.id, visible: false });
    }

    const modal   = document.getElementById('global-modal');
    const dialog  = document.getElementById('global-modal-dialog');
    const titleEl = document.getElementById('global-modal-title');
    const bodyEl  = document.getElementById('global-modal-body');
    const footerEl = document.getElementById('global-modal-footer');
    if (dialog) dialog.style.maxWidth = '820px';
    titleEl.textContent = `${catalog.label || moduleKey} — Columns & Sort`;

    bodyEl.innerHTML = `
      <div class="dash-edit">
        <div class="dash-edit-grid">
          <!-- Visible columns (ordered) -->
          <div class="dash-edit-col">
            <div class="dash-edit-col-title">Visible columns <span class="muted">(drag to reorder)</span></div>
            <div id="vp-visible"></div>
          </div>
          <!-- Hidden / available columns -->
          <div class="dash-edit-col">
            <div class="dash-edit-col-title">Hidden columns</div>
            <div id="vp-hidden"></div>

            <div class="dash-edit-col-title" style="margin-top:1rem;">Default sort</div>
            <div style="display:flex;gap:.5rem;">
              <select id="vp-sort-by" class="form-control" style="flex:1;">
                ${catalog.columns.filter(c => c.sortable).map(c =>
                  `<option value="${c.id}" ${c.id === working.sortBy ? 'selected' : ''}>${_esc(c.label)}</option>`
                ).join('')}
              </select>
              <select id="vp-sort-dir" class="form-control" style="width:110px;">
                <option value="asc"  ${working.sortDir === 'asc'  ? 'selected' : ''}>Ascending</option>
                <option value="desc" ${working.sortDir === 'desc' ? 'selected' : ''}>Descending</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    `;

    footerEl.innerHTML = `
      <button class="btn btn-secondary" id="vp-reset">Restore defaults</button>
      <span style="flex:1;"></span>
      <button class="btn btn-secondary" id="vp-cancel">Cancel</button>
      <button class="btn btn-primary"   id="vp-save">Save</button>
    `;
    footerEl.style.display = 'flex';
    footerEl.style.gap = '.5rem';
    footerEl.style.alignItems = 'center';

    modal.style.display = 'flex';

    const byId = _catalogById(catalog);

    function renderLists() {
      const vis = document.getElementById('vp-visible');
      const hid = document.getElementById('vp-hidden');
      if (!vis || !hid) return;

      const visibleCols = working.columns.filter(c => c.visible);
      const hiddenCols  = working.columns.filter(c => !c.visible);

      vis.innerHTML = visibleCols.length ? visibleCols.map(renderVisibleRow).join('') :
        `<div class="dash-edit-empty">No columns visible. Add some from the right.</div>`;
      hid.innerHTML = hiddenCols.length ? hiddenCols.map(renderHiddenRow).join('') :
        `<div class="dash-edit-empty">All columns are visible.</div>`;

      _wireVisible();
      _wireHidden();
    }

    function renderVisibleRow(entry) {
      const meta = byId[entry.id];
      if (!meta) return '';
      return `
        <div class="dash-edit-row" draggable="true" data-id="${_esc(entry.id)}">
          <span class="dash-edit-handle" title="Drag to reorder">⋮⋮</span>
          <span class="dash-edit-row-label">
            <strong>${_esc(meta.label)}</strong>
            ${meta.sortable ? '' : '<span class="muted" style="font-size:.7rem;">(not sortable)</span>'}
          </span>
          <button class="btn btn-sm btn-secondary" type="button" data-move="up"   data-id="${_esc(entry.id)}">↑</button>
          <button class="btn btn-sm btn-secondary" type="button" data-move="down" data-id="${_esc(entry.id)}">↓</button>
          <button class="btn btn-sm btn-danger"    type="button" data-hide="${_esc(entry.id)}" title="Hide column">✕</button>
        </div>`;
    }

    function renderHiddenRow(entry) {
      const meta = byId[entry.id];
      if (!meta) return '';
      return `
        <label class="dash-edit-item">
          <input type="checkbox" data-show="${_esc(entry.id)}">
          <span class="dash-edit-item-body">
            <span class="dash-edit-item-label">${_esc(meta.label)}</span>
            ${meta.sortable ? `<span class="dash-edit-item-desc">Sortable</span>` : ''}
          </span>
        </label>`;
    }

    function _wireVisible() {
      const host = document.getElementById('vp-visible');
      if (!host) return;

      host.querySelectorAll('button[data-move]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id  = btn.dataset.id;
          const dir = btn.dataset.move === 'up' ? -1 : 1;
          const idx = working.columns.findIndex(c => c.id === id);
          const target = idx + dir;
          if (idx < 0 || target < 0 || target >= working.columns.length) return;
          const [moved] = working.columns.splice(idx, 1);
          working.columns.splice(target, 0, moved);
          renderLists();
        });
      });
      host.querySelectorAll('button[data-hide]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.hide;
          const entry = working.columns.find(c => c.id === id);
          if (entry) entry.visible = false;
          renderLists();
        });
      });

      // drag & drop
      let dragId = null;
      host.querySelectorAll('.dash-edit-row').forEach(row => {
        row.addEventListener('dragstart', e => {
          dragId = row.dataset.id;
          row.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
        });
        row.addEventListener('dragend', () => {
          row.classList.remove('dragging');
          dragId = null;
        });
        row.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
        row.addEventListener('drop', e => {
          e.preventDefault();
          const overId = row.dataset.id;
          if (!dragId || dragId === overId) return;
          const from = working.columns.findIndex(c => c.id === dragId);
          const to   = working.columns.findIndex(c => c.id === overId);
          if (from < 0 || to < 0) return;
          const [moved] = working.columns.splice(from, 1);
          working.columns.splice(to, 0, moved);
          renderLists();
        });
      });
    }

    function _wireHidden() {
      const host = document.getElementById('vp-hidden');
      if (!host) return;
      host.querySelectorAll('input[data-show]').forEach(cb => {
        cb.addEventListener('change', () => {
          const id = cb.dataset.show;
          const entry = working.columns.find(c => c.id === id);
          if (entry) entry.visible = true;
          renderLists();
        });
      });
    }

    // Capture sort controls on save
    function readSortInputs() {
      const sb = document.getElementById('vp-sort-by');
      const sd = document.getElementById('vp-sort-dir');
      if (sb) working.sortBy  = sb.value;
      if (sd) working.sortDir = sd.value;
    }

    renderLists();

    function _close() {
      modal.style.display = 'none';
      if (dialog) dialog.style.maxWidth = '';
    }

    document.getElementById('vp-cancel').onclick = _close;
    document.getElementById('global-modal-close').onclick = _close;

    document.getElementById('vp-save').onclick = async () => {
      readSortInputs();
      try {
        const res = await Api.viewPrefs.save(moduleKey, working);
        _close();
        showToast('Column settings saved');
        onChange && onChange(res.config, res.catalog);
      } catch (err) {
        showToast('Failed to save: ' + (err.message || err), 'error');
      }
    };

    document.getElementById('vp-reset').onclick = async () => {
      if (!confirmDialog('Restore default columns and sort for this view?')) return;
      try {
        const res = await Api.viewPrefs.reset(moduleKey);
        _close();
        showToast('Columns restored to default');
        onChange && onChange(res.config, res.catalog);
      } catch (err) {
        showToast('Failed to reset: ' + (err.message || err), 'error');
      }
    };
  }

  /* ─── Utility: produce the ordered, visible column list ─── */

  function visibleColumns(catalog, config) {
    const byId = _catalogById(catalog);
    return (config.columns || [])
      .filter(c => c.visible)
      .map(c => byId[c.id])
      .filter(Boolean);
  }

  /* ─── HTML-escape helper (local, not Utils.esc, to stay decoupled) ─── */
  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  return { load, attachButton, openEditor, visibleColumns };
})();
