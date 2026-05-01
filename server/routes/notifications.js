'use strict';

const express = require('express');
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { unreadCount } = require('../lib/notifications');

const router = express.Router();
router.use(requireAuth);

// GET / — list notifications for the logged-in user
router.get('/', (req, res) => {
  const db = getDb();
  const showDismissed = req.query.dismissed === '1';
  const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);

  const where = ['user_id = ?'];
  const params = [req.session.userId];
  if (!showDismissed) where.push('dismissed_at IS NULL');

  const rows = db.prepare(`
    SELECT * FROM notifications
    WHERE ${where.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...params, limit);

  res.json({
    data: rows,
    unread: unreadCount(db, req.session.userId),
  });
});

// GET /unread-count — lightweight badge poll
router.get('/unread-count', (req, res) => {
  const db = getDb();
  res.json({ unread: unreadCount(db, req.session.userId) });
});

// POST /:id/read
router.post('/:id/read', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  db.prepare(
    `UPDATE notifications SET read_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ? AND read_at IS NULL`
  ).run(id, req.session.userId);
  res.json({ ok: true, unread: unreadCount(db, req.session.userId) });
});

// POST /read-all
router.post('/read-all', (req, res) => {
  const db = getDb();
  db.prepare(
    `UPDATE notifications SET read_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND read_at IS NULL`
  ).run(req.session.userId);
  res.json({ ok: true, unread: 0 });
});

// POST /:id/dismiss
router.post('/:id/dismiss', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  db.prepare(
    `UPDATE notifications SET dismissed_at = CURRENT_TIMESTAMP, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
     WHERE id = ? AND user_id = ?`
  ).run(id, req.session.userId);
  res.json({ ok: true, unread: unreadCount(db, req.session.userId) });
});

// POST /clear-dismissed
router.post('/clear-dismissed', (req, res) => {
  const db = getDb();
  db.prepare(
    `DELETE FROM notifications WHERE user_id = ? AND dismissed_at IS NOT NULL`
  ).run(req.session.userId);
  res.json({ ok: true });
});

module.exports = router;
