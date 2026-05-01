/* =============================================================
   router.js  —  Hash-based SPA router for Inexpro CRM
   Loaded as a plain <script> tag; navigate() is a global.

   Hash convention (from index.html): #/route  (leading slash)
   e.g.  #/dashboard,  #/contacts/123/edit
   ============================================================= */

// ── Route table ─────────────────────────────────────────────────
// Each entry: { pattern: RegExp, handler: fn(matches) }
// Patterns are matched against the hash path (without the leading '#/').

const _routes = [
  // Dashboard
  { pattern: /^$|^dashboard$/,                    handler: ()        => Dashboard.render()          },
  { pattern: /^dashboard\/tcf$/,                  handler: ()        => TcfDashboard.render()       },

  // Contacts
  { pattern: /^contacts$/,                         handler: ()        => Contacts.list()             },
  { pattern: /^contacts\/new$/,                    handler: ()        => Contacts.form()             },
  { pattern: /^contacts\/([^/]+)\/edit$/,          handler: (m)       => Contacts.form(m[1])         },
  { pattern: /^contacts\/([^/]+)$/,                handler: (m)       => Contacts.detail(m[1])       },

  // Accounts
  { pattern: /^accounts$/,                         handler: ()        => Accounts.list()             },
  { pattern: /^accounts\/new$/,                    handler: ()        => Accounts.form()             },
  { pattern: /^accounts\/([^/]+)\/edit$/,          handler: (m)       => Accounts.form(m[1])         },
  { pattern: /^accounts\/([^/]+)$/,                handler: (m)       => Accounts.detail(m[1])       },

  // Engagements
  { pattern: /^engagements$/,                      handler: ()        => Engagements.list()          },
  { pattern: /^engagements\/new$/,                 handler: ()        => Engagements.form()          },
  { pattern: /^engagements\/([^/]+)\/edit$/,       handler: (m)       => Engagements.form(m[1])      },
  { pattern: /^engagements\/([^/]+)$/,             handler: (m)       => Engagements.detail(m[1])    },

  // Policies
  { pattern: /^policies$/,                         handler: ()        => Policies.list()             },
  { pattern: /^policies\/new$/,                    handler: ()        => Policies.form()             },
  { pattern: /^policies\/([^/]+)\/edit$/,          handler: (m)       => Policies.form(m[1])         },
  { pattern: /^policies\/([^/]+)$/,                handler: (m)       => Policies.detail(m[1])       },

  // Assets
  { pattern: /^assets$/,                           handler: ()        => Assets.list()               },
  { pattern: /^assets\/new$/,                      handler: ()        => Assets.form()               },
  { pattern: /^assets\/([^/]+)\/edit$/,            handler: (m)       => Assets.form(m[1])           },
  { pattern: /^assets\/([^/]+)$/,                  handler: (m)       => Assets.detail(m[1])         },

  // Risk Details
  { pattern: /^risk-details$/,                     handler: ()        => RiskDetails.list()          },
  { pattern: /^risk-details\/new$/,                handler: ()        => RiskDetails.form()          },
  { pattern: /^risk-details\/([^/]+)\/edit$/,      handler: (m)       => RiskDetails.form(m[1])      },
  { pattern: /^risk-details\/([^/]+)$/,            handler: (m)       => RiskDetails.detail(m[1])    },

  // Claims
  { pattern: /^claims$/,                           handler: ()        => Claims.list()               },
  { pattern: /^claims\/new$/,                      handler: ()        => Claims.form()               },
  { pattern: /^claims\/([^/]+)\/edit$/,            handler: (m)       => Claims.form(m[1])           },
  { pattern: /^claims\/([^/]+)$/,                  handler: (m)       => Claims.detail(m[1])         },

  // Advice Records
  { pattern: /^advice-records$/,                   handler: ()        => AdviceRecords.list()        },
  { pattern: /^advice-records\/new$/,              handler: ()        => AdviceRecords.form()        },
  { pattern: /^advice-records\/([^/]+)\/edit$/,    handler: (m)       => AdviceRecords.form(m[1])    },
  { pattern: /^advice-records\/([^/]+)$/,          handler: (m)       => AdviceRecords.detail(m[1])  },

  // Complaints
  { pattern: /^complaints$/,                       handler: ()        => Complaints.list()           },
  { pattern: /^complaints\/new$/,                  handler: ()        => Complaints.form()           },
  { pattern: /^complaints\/([^/]+)\/edit$/,        handler: (m)       => Complaints.form(m[1])       },
  { pattern: /^complaints\/([^/]+)$/,              handler: (m)       => Complaints.detail(m[1])     },

  // Reviews
  { pattern: /^reviews$/,                          handler: ()        => Reviews.list()              },
  { pattern: /^reviews\/new$/,                     handler: ()        => Reviews.form()              },
  { pattern: /^reviews\/([^/]+)\/edit$/,           handler: (m)       => Reviews.form(m[1])          },
  { pattern: /^reviews\/([^/]+)$/,                 handler: (m)       => Reviews.detail(m[1])        },

  // Workflows
  { pattern: /^workflows$/,                        handler: ()        => Workflows.list()            },
  { pattern: /^workflows\/new$/,                   handler: ()        => Workflows.form()            },
  { pattern: /^workflows\/([^/]+)\/edit$/,         handler: (m)       => Workflows.form(m[1])        },
  { pattern: /^workflows\/([^/]+)$/,               handler: (m)       => Workflows.detail(m[1])      },

  // Reports
  { pattern: /^reports$/,                          handler: ()        => Reports.render()            },

  // Policy Schedules
  { pattern: /^schedule\/contact\/([^/]+)$/, handler: (m) => PolicySchedule.renderForContact(m[1]) },
  { pattern: /^schedule\/account\/([^/]+)$/, handler: (m) => PolicySchedule.renderForAccount(m[1]) },
  { pattern: /^schedule\/policy\/([^/]+)$/,  handler: (m) => PolicySchedule.renderForPolicy(m[1])  },

  // Admin
  { pattern: /^profile$/,                          handler: ()        => Profile.render()            },
  { pattern: /^admin$/,                            handler: ()        => Admin.render()              },
  { pattern: /^admin\/users$/,                     handler: ()        => Admin.users()               },
  { pattern: /^admin\/audit$/,                     handler: ()        => Admin.auditLog()            },
  { pattern: /^notifications$/,                    handler: ()        => Notifications.render()      },

  // ── Compliance sub-modules ─────────────────────────────────
  // POPIA/FICA/Commission/Post-Sale edit views live INSIDE their parent detail
  // pages (Contact tabs, Policy tabs). Routes below remain for standalone lists
  // (Broker Profiles, Product Library, Data Breaches) and the TCF dashboard.
  { pattern: /^tcf-dashboard$/,                    handler: ()  => TcfDashboard.render()        },
  { pattern: /^broker-profiles$/,                  handler: ()  => Admin.brokerFitness()        },
  { pattern: /^broker-profiles\/new$/,                       handler: ()  => BrokerProfiles.form()             },
  { pattern: /^broker-profiles\/([^/]+)\/audit-report$/,     handler: (m) => BrokerProfiles.auditReport(m[1])  },
  { pattern: /^broker-profiles\/([^/]+)$/,                   handler: (m) => BrokerProfiles.detail(m[1])       },
  { pattern: /^products$/,                         handler: ()  => Admin.productsTab()          },
  { pattern: /^products\/new$/,                    handler: ()  => Products.form()              },
  { pattern: /^products\/([^/]+)\/edit$/,          handler: (m) => Products.form(m[1])          },
  { pattern: /^data-breaches$/,                    handler: ()  => Admin.dataBreachesTab()      },
  { pattern: /^popia$/,                            handler: ()  => Popia.list()                 },
  { pattern: /^popia\/account\/([^/]+)$/,          handler: (m) => Popia.detailAccount(m[1])    },
  { pattern: /^popia\/([^/]+)$/,                   handler: (m) => Popia.detail(m[1])           },
  { pattern: /^fica$/,                             handler: ()  => Fica.list()                  },
  { pattern: /^fica\/account\/([^/]+)$/,           handler: (m) => Fica.detailAccount(m[1])     },
  { pattern: /^fica\/([^/]+)$/,                    handler: (m) => Fica.detail(m[1])            },
];

// ── Internal helpers ────────────────────────────────────────────

/**
 * Extract the path portion from the current location.hash.
 * Strips the leading '#' and optional leading '/'.
 * e.g. '#/contacts/42/edit' → 'contacts/42/edit'
 *      '#dashboard'         → 'dashboard'
 */
function _getHashPath() {
  const raw = window.location.hash || '';          // e.g. '#/contacts/42'
  const path = raw.replace(/^#\/?/, '');           // 'contacts/42'
  return path.split('?')[0];                       // strip query string for route matching
}

/**
 * Resolve and invoke the matching route handler for the given path.
 * Injects a "404" message into #content-area if nothing matches.
 */
// Locked-module edit routes — clicking Edit on these triggers the centred
// admin-password challenge BEFORE the form is rendered. Cancel → user is
// bounced back to the detail view. This is what the user sees when they click
// "Edit" on a saved policy / claim / engagement / completed ROA / FICA / POPIA.
const _EDIT_LOCKED_ROUTES = [
  { rx: /^policies\/(\d+)\/edit$/,         module: 'policies',           detail: (id) => `/policies/${id}` },
  { rx: /^claims\/(\d+)\/edit$/,           module: 'claims',             detail: (id) => `/claims/${id}` },
  { rx: /^engagements\/(\d+)\/edit$/,      module: 'client_engagements', detail: (id) => `/engagements/${id}` },
  { rx: /^advice-records\/(\d+)\/edit$/,   module: 'advice_records',     detail: (id) => `/advice-records/${id}` },
];

async function _dispatch(path) {
  // Clear stale header title and action buttons before each new view loads
  const _hTitle   = document.getElementById('header-title');
  const _hActions = document.getElementById('header-actions');
  const _hCenter  = document.getElementById('header-center');
  if (_hTitle)   _hTitle.textContent = '';
  if (_hActions) _hActions.innerHTML = '';
  if (_hCenter)  _hCenter.innerHTML  = '';

  // Clear any per-module header widgets that were appended outside #header-actions
  document.querySelectorAll('[data-header-widget]').forEach(n => n.remove());

  // Edit-lock gate — prompt for admin password before rendering the edit form
  // for locked modules. New-record routes (`/new`) are excluded by pattern.
  if (typeof EditLock !== 'undefined') {
    for (const lk of _EDIT_LOCKED_ROUTES) {
      const m = path.match(lk.rx);
      if (m) {
        // Advice-records are only locked once `roa_completed = 1` — for drafts
        // we let the user edit freely. We don't have the row in hand here so
        // we ask the form handler to refuse on its own. To keep behaviour
        // simple and predictable, ROA drafts skip the gate; completed ROAs
        // get a 423 from the server which the form handler must catch.
        if (lk.module === 'advice_records') {
          // Try the gate; on cancel, bounce. The cache will be set on success
          // and the form will save freely. For drafts (no lock), the gate is
          // technically redundant but harmless — pressing Cancel still bounces,
          // which is the wrong behaviour. So skip ROA in the router and let
          // the inline complete-button flow handle it instead.
          break;
        }
        const ok = await EditLock.requestEditAccess({
          module:   lk.module,
          recordId: m[1],
          intent:   'edit',
        });
        if (!ok) {
          // Replace the /edit history entry with the detail URL so Back goes
          // to wherever the user came from (list / parent), not back into the
          // form they just declined to unlock.
          navigate(lk.detail(m[1]), { replace: true });
          return;
        }
        break;
      }
    }
  }

  for (const route of _routes) {
    const match = path.match(route.pattern);
    if (match) {
      // Run the handler; it is responsible for rendering into #content-area
      try {
        route.handler(match);
      } catch (err) {
        console.error('[Router] Handler error:', err);
        _render404();
      }
      _highlightNav(path);
      return;
    }
  }
  // No route matched
  _render404();
  _highlightNav(path);
}

/**
 * Show a simple "Page not found" message in #content-area.
 */
function _render404() {
  const contentArea = document.getElementById('content-area');
  if (!contentArea) return;
  contentArea.innerHTML = `
    <div style="
      display:flex; flex-direction:column; align-items:center;
      justify-content:center; min-height:300px; color:#666;
    ">
      <div style="font-size:48px; margin-bottom:16px;">404</div>
      <h2 style="margin:0 0 8px;">Page not found</h2>
      <p style="margin:0;">The page you requested does not exist.</p>
      <a href="#/dashboard" style="margin-top:20px; color:var(--color-primary,#1a73e8);">
        Go to Dashboard
      </a>
    </div>`;
  setPageTitle('Not Found');
  setBreadcrumb(['Home', 'Not Found']);
}

/**
 * Update the active state on sidebar nav links.
 * Matches on the data-route attribute as a prefix of the current path.
 */
function _highlightNav(path) {
  const links = document.querySelectorAll('#sidebar-nav .nav-link[data-route]');
  links.forEach(link => {
    const route = link.getAttribute('data-route') || '';
    // Active when the path equals the route or starts with route + '/'
    const isActive = path === route || path.startsWith(route + '/');
    link.classList.toggle('active', isActive);
    link.setAttribute('aria-current', isActive ? 'page' : 'false');
  });
}

// ── Public: navigate ────────────────────────────────────────────

// Programmatically navigate to a hash route. Accepts with or without the
// leading '#' or '#/'.
//
// If the caller is currently on a form-style hash ending in /edit, /new,
// /duplicate or /clone, the navigation is performed via history.replaceState
// so that the form entry is replaced instead of being pushed onto the history
// stack. This means clicking Back after a Save skips the edit form and lands
// on the previous screen (detail or list) — never re-opens the form the user
// just submitted. Pass { replace: false } to force a push, { replace: true }
// to force a replace; default is auto-detect.
//
// @param {string} hash      e.g. '/contacts/42', 'contacts/42', '#/contacts/42'
// @param {object} [options]
// @param {boolean} [options.replace] Force replace (true) or push (false).
function navigate(hash, options) {
  // Normalise: ensure it starts with '#/'
  let normalised = hash
    .replace(/^#+\/?/, '')    // strip leading '#' chars and optional '/'
    .replace(/^\//, '');      // strip remaining leading '/'

  const target = '#/' + normalised;

  // Auto-detect: if the user is currently on a form-style hash (.../edit,
  // .../new, .../duplicate, .../clone), default to replace so Back does not
  // re-open that form. Otherwise default to push (normal navigation).
  let replace = options && typeof options.replace === 'boolean' ? options.replace : null;
  if (replace === null) {
    const cur = (window.location.hash || '').replace(/^#\/?/, '');
    replace = typeof _isFormPath === 'function'
      ? _isFormPath(cur)
      : /(^|\/)(edit|new|duplicate|clone)(\?.*)?$/.test(cur);
  }

  if (replace && typeof window.history?.replaceState === 'function') {
    // Replace the current history entry, then dispatch — `replaceState` does
    // not fire `hashchange`, so we trigger the dispatcher manually.
    try {
      const baseUrl = window.location.href.split('#')[0];
      window.history.replaceState(null, '', baseUrl + target);
      _dispatch(_getHashPath());
      return;
    } catch (_) { /* fall through to push */ }
  }
  window.location.hash = '/' + normalised;
}

// ── Event listeners ─────────────────────────────────────────────

// Global click delegation: intercept anchor clicks that navigate INTO an
// edit/new/duplicate/clone form and rewrite them to replaceState. This way
// the form URL replaces the detail URL in history (rather than being pushed
// on top of it), so the eventual Save (which already replaces) leaves a
// clean stack and Back never re-opens the form the user just submitted.
// Helper: does this hash-path look like a form (ends in /edit, /new,
// /duplicate, or /clone, optionally followed by ?query)?
function _isFormPath(path) {
  return /(^|\/)(edit|new|duplicate|clone)(\?.*)?$/.test(path || '');
}

// Note: Edit-link clicks are intentionally NOT intercepted — they push to
// history as a normal anchor click does, so the browser Back button goes
// from /edit back to the detail view the user was on. Save handlers call
// navigate() which auto-detects the form context and uses replaceState, so
// the /edit entry is overwritten by the destination on save.

window.addEventListener('hashchange', () => {
  _dispatch(_getHashPath());
});

// popstate covers browser back/forward when hash is also changed programmatically
window.addEventListener('popstate', () => {
  _dispatch(_getHashPath());
});

// ── Kick off routing once DOM is ready ──────────────────────────

// This is called from main.js after auth succeeds, but also guard here.
function _initRouter() {
  const path = _getHashPath();
  // If no hash is set, default to dashboard
  if (!window.location.hash || window.location.hash === '#') {
    navigate('dashboard');
  } else {
    _dispatch(path);
  }
}

// Expose for main.js to call after auth
window.initRouter = _initRouter;
