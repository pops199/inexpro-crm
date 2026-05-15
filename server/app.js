require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const { initDb } = require('./db/database');
const { auditMiddleware } = require('./middleware/audit');
const { errorHandler, notFound } = require('./middleware/error');

// Route imports
const authRoutes = require('./routes/auth');
const contactRoutes = require('./routes/contacts');
const accountRoutes = require('./routes/accounts');
const engagementRoutes = require('./routes/engagements');
const policyRoutes = require('./routes/policies');
const policySectionRoutes = require('./routes/policy-sections');
const assetRoutes = require('./routes/assets');
const riskDetailRoutes = require('./routes/risk-details');
const claimRoutes = require('./routes/claims');
const adviceRoutes = require('./routes/advice-records');
const complaintRoutes = require('./routes/complaints');
const reviewRoutes = require('./routes/reviews');
const documentRoutes = require('./routes/documents');
const reportRoutes = require('./routes/reports');
const adminRoutes = require('./routes/admin');
const timelineRoutes = require('./routes/timeline');
const settingsRoutes = require('./routes/settings');
const workflowRoutes = require('./routes/workflows');
const dashboardRoutes = require('./routes/dashboard');
const viewPrefsRoutes = require('./routes/view-prefs');
// ─── Compliance routes (FAIS/POPIA/FICA/TCF/COFI) ────────────
const popiaRoutes          = require('./routes/popia');
const ficaRoutes           = require('./routes/fica');
const brokerProfileRoutes  = require('./routes/broker-profiles');
const productRoutes        = require('./routes/products');
const postSaleEventRoutes  = require('./routes/post-sale-events');
const commissionLogRoutes  = require('./routes/commission-log');
const tcfDashboardRoutes   = require('./routes/tcf-dashboard');
const notificationsRoutes  = require('./routes/notifications');
const systemUpdateRoutes   = require('./routes/system-update');
const signatureRequestRoutes = require('./routes/signature-requests');
const publicSigningRoutes    = require('./routes/public-signing');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialise DB and run schema
initDb();
console.log('✅ Database initialised');

// Clear any leftover .update-lock from the previous (now-exited)
// process. Without this, an in-app update or restore that triggered
// `process.exit(0)` would leave the UI showing "Update in progress" on
// the next boot, locking out further updates and rollback.
try {
  require('./lib/updater').clearStaleLockAtBoot();
} catch (_) { /* no-op */ }

// Session store
const SQLiteStore = require('connect-sqlite3')(session);

// ─── Middleware ──────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(session({
  store: new SQLiteStore({
    db: 'sessions.db',
    dir: path.dirname(process.env.DB_PATH || './server/db/inexpro.db')
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.COOKIE_SECURE === 'true',
    httpOnly: true,
    maxAge: 8 * 60 * 60 * 1000 // 8 hours
  }
}));

app.use(auditMiddleware);

// Convert empty strings → null in JSON bodies so SQLite CHECK constraints
// (which only allow specific values OR NULL) don't fail on unset picklists.
// Applied recursively so nested objects are also normalised.
function nullifyEmpty(obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    if (obj[key] === '') {
      obj[key] = null;
    } else if (obj[key] && typeof obj[key] === 'object') {
      nullifyEmpty(obj[key]);
    }
  }
}
app.use((req, _res, next) => {
  if (req.body && typeof req.body === 'object') nullifyEmpty(req.body);
  next();
});

// Serve static frontend
// HTML: no-cache (always revalidate) so new deploys are picked up immediately.
// JS/CSS/images: cache for 1 hour but revalidate with ETag — avoids re-downloading
// unchanged files on every single navigation, which was causing sluggishness.
const publicDir = path.join(__dirname, '../client/public');
const htmlOpts = { etag: true, lastModified: true, setHeaders: (res, filePath) => {
  if (filePath.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-cache');
  } else {
    res.setHeader('Cache-Control', 'no-cache');
  }
}};
app.use('/claim_forms', (req, res, next) => {
  if (path.extname(req.path).toLowerCase() !== '.pdf') {
    return res.status(404).send('Not found');
  }
  next();
}, express.static(path.join(publicDir, 'claim_forms'), htmlOpts));
app.use(express.static(publicDir, htmlOpts));
// Serve /src and /styles from client/src (index.html references /src/...)
app.use('/src', express.static(path.join(__dirname, '../client/src'), { etag: true, lastModified: true, setHeaders: (res) => { res.setHeader('Cache-Control', 'no-cache'); } }));
// Serve signature images (used for per-user email signatures)
app.use('/signatures', express.static(path.join(__dirname, '../signatures'), { etag: true, lastModified: true, setHeaders: (res) => { res.setHeader('Cache-Control', 'no-cache'); } }));

// ─── API Routes ──────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/engagements', engagementRoutes);
app.use('/api/policies', policyRoutes);
app.use('/api/policy-sections', policySectionRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/risk-details', riskDetailRoutes);
app.use('/api/claims', claimRoutes);
app.use('/api/advice-records', adviceRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/timeline', timelineRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/view-prefs', viewPrefsRoutes);
// Compliance (COFI/FAIS/POPIA/FICA/TCF)
app.use('/api/popia',            popiaRoutes);
app.use('/api/fica',             ficaRoutes);
app.use('/api/broker-profiles',  brokerProfileRoutes);
app.use('/api/products',         productRoutes);
app.use('/api/post-sale-events', postSaleEventRoutes);
app.use('/api/commission-log',   commissionLogRoutes);
app.use('/api/tcf',              tcfDashboardRoutes);
app.use('/api/notifications',    notificationsRoutes);
app.use('/api/admin/system',     systemUpdateRoutes);
app.use('/api/signature-requests', signatureRequestRoutes);

// Public e-signing pages (no auth) — client follows /sign/<token> from email
app.use('/sign', publicSigningRoutes);

// ─── SPA fallback ───────────────────────────────────────────
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, '../client/public/index.html'));
});

// ─── Error handling ──────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Start ───────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Inexpro CRM running at http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   DB: ${process.env.DB_PATH}`);
});

module.exports = app;
