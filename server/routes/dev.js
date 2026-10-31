import express from 'express';
import db from '../db.js';

const router = express.Router();

// Guard: Disabled in production
router.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Dev endpoints are disabled in production.' });
  }
  next();
});

// GET /api/dev/emails (optional ?to=email query)
router.get('/emails', async (req, res) => {
  try {
    const toFilter = req.query.to ? req.query.to.toLowerCase().trim() : null;
    let queryText = 'SELECT id, to_email, subject, body, template, sent_at FROM dev_emails';
    const params = [];

    if (toFilter) {
      queryText += ' WHERE LOWER(to_email) = $1';
      params.push(toFilter);
    }

    queryText += ' ORDER BY sent_at DESC';

    const result = await db.query(queryText, params);
    return res.json({ emails: result.rows });
  } catch (err) {
    console.error('Error fetching dev emails:', err);
    return res.status(500).json({ error: 'Failed to fetch dev emails.' });
  }
});

// DELETE /api/dev/emails/:id
router.delete('/emails/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.query('DELETE FROM dev_emails WHERE id = $1', [id]);
    return res.json({ message: 'Email deleted from outbox.' });
  } catch (err) {
    console.error('Error deleting dev email:', err);
    return res.status(500).json({ error: 'Failed to delete email.' });
  }
});

// DELETE /api/dev/emails
router.delete('/emails', async (req, res) => {
  try {
    await db.query('DELETE FROM dev_emails');
    return res.json({ message: 'All dev emails cleared.' });
  } catch (err) {
    console.error('Error clearing dev emails:', err);
    return res.status(500).json({ error: 'Failed to clear dev emails.' });
  }
});

export default router;
