// ================================================================
// NOTIFICATIONS COMPONENT
// Sidebar bell badge + center-pane list view
// ================================================================
const Notifications = (() => {
  const esc = (s) => Utils.esc(s);

  let _pollTimer = null;
  let _started   = false;

  // ── Severity → colour ─────────────────────────────────────────
  const SEV = {
    info:    { bg: '#3498db', fg: '#fff', label: 'Info'    },
    success: { bg: '#27ae60', fg: '#fff', label: 'Success' },
    warning: { bg: '#d68910', fg: '#fff', label: 'Warning' },
    danger:  { bg: '#c0392b', fg: '#fff', label: 'Action'  },
  };

  // ── Bell badge polling ────────────────────────────────────────
  async function refreshBadge() {
    try {
      const r = await Api.notifications.unreadCount();
      const badge = document.getElementById('sidebar-bell-badge');
      if (!badge) return;
      const n = r.unread || 0;
      if (n > 0) {
        badge.style.display = 'inline-block';
        badge.textContent   = n > 99 ? '99+' : String(n);
      } else {
        badge.style.display = 'none';
      }
    } catch (_) {}
  }

  function startPolling() {
    if (_started) return;
    _started = true;
    refreshBadge();
    _pollTimer = setInterval(refreshBadge, 60 * 1000);
  }

  function stopPolling() {
    _started = false;
    if (_pollTimer) clearInterval(_pollTimer);
    _pollTimer = null;
  }

  // ── Center-pane view ──────────────────────────────────────────
  let _showDismissed = false;

  async function render() {
    setPageTitle('Notifications');
    setBreadcrumb(['Notifications']);
    const el = document.getElementById('content-area');
    el.innerHTML = `<div class="loading-spinner-wrapper"><div class="loading-spinner"></div></div>`;

    try {
      const r = await Api.notifications.list({ dismissed: _showDismissed ? 1 : 0, limit: 200 });
      const items = r.data || [];
      const unread = r.unread || 0;

      const headerActions = document.getElementById('header-actions');
      if (headerActions) {
        headerActions.innerHTML = `
          <button class="btn btn-secondary btn-sm" id="nf-toggle-dismissed">
            ${_showDismissed ? 'Hide dismissed' : 'Show dismissed'}
          </button>
          <button class="btn btn-secondary btn-sm" id="nf-read-all" ${unread ? '' : 'disabled'}>
            Mark all read
          </button>
          ${_showDismissed ? `<button class="btn btn-secondary btn-sm" id="nf-clear">Clear dismissed</button>` : ''}
        `;
      }

      const row = (n) => {
        const sev = SEV[n.severity] || SEV.info;
        const isUnread = !n.read_at;
        const dimmed = n.dismissed_at ? 'opacity:.55;' : '';
        return `
          <div class="card nf-row" data-id="${n.id}"
               style="display:flex;gap:.85rem;padding:.85rem 1rem;margin-bottom:.5rem;align-items:flex-start;${dimmed}
                      border-left:4px solid ${sev.bg};${isUnread ? 'background:#fffef7;' : ''}">
            <div style="flex:0 0 auto;background:${sev.bg};color:${sev.fg};border-radius:4px;padding:.15rem .5rem;font-size:.7rem;font-weight:600;letter-spacing:.5px;text-transform:uppercase;">
              ${esc(sev.label)}
            </div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;">
                <div style="font-weight:600;${isUnread ? '' : 'color:#555;'}">
                  ${esc(n.title)}
                  ${isUnread ? '<span style="margin-left:.4rem;color:#c0392b;">●</span>' : ''}
                </div>
                <div style="font-size:.78rem;color:#777;white-space:nowrap;">${esc(String(n.created_at).replace('T', ' ').slice(0, 16))}</div>
              </div>
              ${n.body ? `<div style="margin-top:.25rem;font-size:.9rem;color:#444;">${esc(n.body)}</div>` : ''}
              <div style="margin-top:.5rem;display:flex;gap:.5rem;flex-wrap:wrap;">
                ${n.link ? (() => {
                  // External / static-asset links (anything that isn't a #/ hash route)
                  // open in a new tab so the SPA isn't navigated away from.
                  const isExternal = !String(n.link).startsWith('#');
                  const targetAttr = isExternal ? ' target="_blank" rel="noopener"' : '';
                  return `<a href="${esc(n.link)}" class="btn btn-xs btn-primary nf-open" data-id="${n.id}"${targetAttr}>Open</a>`;
                })() : ''}
                ${isUnread && !n.dismissed_at ? `<button class="btn btn-xs btn-secondary nf-read" data-id="${n.id}">Mark read</button>` : ''}
                ${!n.dismissed_at ? `<button class="btn btn-xs btn-secondary nf-dismiss" data-id="${n.id}">Dismiss</button>` : ''}
                <span style="margin-left:auto;font-size:.75rem;color:#888;">${esc(n.category)}</span>
              </div>
            </div>
          </div>`;
      };

      el.innerHTML = `
        <div class="page-wrapper" style="max-width:880px;">
          <div style="margin-bottom:.75rem;color:#666;font-size:.9rem;">
            ${unread ? `<strong style="color:#c0392b;">${unread} unread</strong> — ` : ''}
            ${items.length} notification(s) ${_showDismissed ? '(including dismissed)' : ''}
          </div>
          ${items.length
            ? items.map(row).join('')
            : `<div class="card" style="padding:2rem;text-align:center;color:#666;">
                 You have no notifications${_showDismissed ? '' : ' — try "Show dismissed".'}
               </div>`}
        </div>
      `;

      document.getElementById('nf-toggle-dismissed')?.addEventListener('click', () => {
        _showDismissed = !_showDismissed;
        render();
      });
      document.getElementById('nf-read-all')?.addEventListener('click', async () => {
        await Api.notifications.readAll();
        await refreshBadge();
        render();
      });
      document.getElementById('nf-clear')?.addEventListener('click', async () => {
        if (!confirm('Permanently remove all dismissed notifications?')) return;
        await Api.notifications.clearDismissed();
        render();
      });
      el.querySelectorAll('.nf-read').forEach(b => b.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        await Api.notifications.read(b.dataset.id);
        await refreshBadge();
        render();
      }));
      el.querySelectorAll('.nf-dismiss').forEach(b => b.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        await Api.notifications.dismiss(b.dataset.id);
        await refreshBadge();
        render();
      }));
      el.querySelectorAll('.nf-open').forEach(b => b.addEventListener('click', async () => {
        // Auto-mark-read when user clicks Open
        try { await Api.notifications.read(b.dataset.id); } catch (_) {}
        refreshBadge();
      }));
    } catch (err) {
      el.innerHTML = Utils.errorHtml('Failed to load notifications.', err);
    }
  }

  return { render, refreshBadge, startPolling, stopPolling };
})();

window.Notifications = Notifications;
