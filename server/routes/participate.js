import express from 'express';
import db from '../db.js';
import authMiddleware from '../middleware/auth.js';
import participateRateLimiter from '../middleware/rateLimiter.js';
import nlp from '../utils/nlp.js';

const router = express.Router();

const GENERIC_ENTRY_ERROR = 'Invalid campaign code, campaign is not active, or your email is not on the invited participant list.';

// Helper to sanitise comment text
function sanitiseText(str) {
  if (!str) return '';
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .trim();
}

// ── 0. GET /api/participate/token/:token ──
// Token-based zero-login consultation access for invited stakeholders
router.get('/token/:token', async (req, res) => {
  try {
    const rawToken = req.params.token;
    if (!rawToken || !rawToken.trim()) {
      return res.status(400).json({ error: 'A valid consultation token is required.' });
    }
    const token = rawToken.trim();

    const partRes = await db.query(
      `SELECT cp.id as participation_id, cp.campaign_id, cp.stakeholder_id,
              cp.submission_status, cp.submitted_at, cp.invitation_status,
              c.title, c.description, c.objectives, c.additional_instructions, c.status,
              c.opening_date, c.closing_date, c.organisation_id,
              o.name as organisation_name,
              s.first_name, s.last_name, s.email, s.department, s.designation, s.category
       FROM campaign_participants cp
       JOIN campaigns c ON cp.campaign_id = c.id
       JOIN organisations o ON c.organisation_id = o.id
       JOIN stakeholders s ON cp.stakeholder_id = s.id
       WHERE cp.invitation_token = $1`,
      [token]
    );

    if (partRes.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired consultation access link.' });
    }

    const row = partRes.rows[0];

    // Status checks
    if (row.status === 'DELETED') {
      return res.status(400).json({ error: 'This consultation has been closed and is no longer available.' });
    }

    if (row.status === 'DRAFT') {
      return res.status(400).json({ error: 'This consultation campaign is in draft mode and has not yet been published.' });
    }

    const now = new Date();
    if (row.status === 'CLOSED' || now < new Date(row.opening_date) || now > new Date(row.closing_date)) {
      return res.status(400).json({ error: 'This consultation is currently closed and no longer accepting submissions.' });
    }

    // Check duplicate submission
    const existingSubmission = await db.query(
      `SELECT id FROM feedback_submissions WHERE campaign_id = $1 AND stakeholder_id = $2`,
      [row.campaign_id, row.stakeholder_id]
    );

    if (row.submission_status === 'SUBMITTED' || row.submitted_at !== null || existingSubmission.rows.length > 0) {
      return res.status(409).json({
        error: 'You have already submitted feedback for this consultation. Each stakeholder is permitted one submission.',
        alreadySubmitted: true,
      });
    }

    // Fetch questions
    const questionsRes = await db.query(
      `SELECT id, question_text, question_order, question_type, is_required, options, min_value, max_value, min_length, max_length
       FROM campaign_questions
       WHERE campaign_id = $1
       ORDER BY question_order ASC`,
      [row.campaign_id]
    );

    const questions = questionsRes.rows.map(q => {
      let opts = [];
      try {
        opts = typeof q.options === 'string' ? JSON.parse(q.options) : (q.options || []);
      } catch {
        opts = [];
      }
      return {
        id: q.id,
        questionText: q.question_text,
        questionOrder: q.question_order,
        questionType: q.question_type || 'TEXT',
        isRequired: q.is_required !== false,
        options: opts,
        minValue: q.min_value ?? 1,
        maxValue: q.max_value ?? 5,
        minLength: q.min_length,
        maxLength: q.max_length,
      };
    });

    return res.json({
      token,
      campaign: {
        id: row.campaign_id,
        title: row.title,
        description: row.description,
        objectives: row.objectives,
        additionalInstructions: row.additional_instructions,
        organisationName: row.organisation_name,
        openingDate: row.opening_date,
        closingDate: row.closing_date,
      },
      stakeholder: {
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        department: row.department,
        designation: row.designation,
        category: row.category,
      },
      questions,
    });
  } catch (err) {
    console.error('Error fetching consultation by token:', err);
    return res.status(500).json({ error: 'Failed to load consultation.' });
  }
});

// ── 0b. POST /api/participate/submit/:token ──
// Token-based feedback submission with NLP sentiment analysis
router.post('/submit/:token', participateRateLimiter, async (req, res) => {
  try {
    const rawToken = req.params.token;
    if (!rawToken || !rawToken.trim()) {
      return res.status(400).json({ error: 'A valid consultation token is required.' });
    }
    const token = rawToken.trim();
    const { answers = [] } = req.body;

    const partRes = await db.query(
      `SELECT cp.id as participation_id, cp.campaign_id, cp.stakeholder_id,
              cp.submission_status, cp.submitted_at,
              c.title, c.status, c.opening_date, c.closing_date, c.organisation_id
       FROM campaign_participants cp
       JOIN campaigns c ON cp.campaign_id = c.id
       WHERE cp.invitation_token = $1`,
      [token]
    );

    if (partRes.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired consultation access link.' });
    }

    const row = partRes.rows[0];

    // Status checks
    if (row.status === 'DELETED') {
      return res.status(400).json({ error: 'This consultation has been closed and is no longer available.' });
    }
    if (row.status === 'DRAFT') {
      return res.status(400).json({ error: 'This consultation is not yet open for feedback.' });
    }

    const now = new Date();
    if (row.status === 'CLOSED' || now < new Date(row.opening_date) || now > new Date(row.closing_date)) {
      return res.status(400).json({ error: 'This consultation is currently closed and no longer accepting submissions.' });
    }

    // Check duplicate submission
    const existingSubmission = await db.query(
      `SELECT id FROM feedback_submissions WHERE campaign_id = $1 AND stakeholder_id = $2`,
      [row.campaign_id, row.stakeholder_id]
    );

    if (row.submission_status === 'SUBMITTED' || row.submitted_at !== null || existingSubmission.rows.length > 0) {
      return res.status(409).json({
        error: 'You have already submitted feedback for this consultation. Each stakeholder is permitted one submission.',
        alreadySubmitted: true,
      });
    }

    // Fetch questions to validate required answers
    const questionsRes = await db.query(
      `SELECT id, question_text, question_type, is_required, options, min_value, max_value, min_length, max_length
       FROM campaign_questions
       WHERE campaign_id = $1`,
      [row.campaign_id]
    );
    const questionsMap = new Map(questionsRes.rows.map(q => [q.id, q]));

    // Build answers map: questionId -> answerObj
    const userAnswersMap = new Map();
    for (const a of answers) {
      if (a && a.questionId) {
        userAnswersMap.set(parseInt(a.questionId, 10), a);
      }
    }

    // Validate required questions
    for (const [qId, q] of questionsMap.entries()) {
      if (q.is_required) {
        const userAns = userAnswersMap.get(qId);
        const val = userAns ? (userAns.value ?? userAns.text ?? userAns.rating ?? userAns.selectedOptions) : null;
        if (val === null || val === undefined || (typeof val === 'string' && !val.trim()) || (Array.isArray(val) && val.length === 0)) {
          return res.status(400).json({ error: `Question "${q.question_text}" is required.` });
        }
      }
    }

    // 1. Create feedback_submission
    const subRes = await db.query(
      `INSERT INTO feedback_submissions (campaign_id, stakeholder_id, participation_id, organisation_id, submission_status)
       VALUES ($1, $2, $3, $4, 'COMPLETED') RETURNING id`,
      [row.campaign_id, row.stakeholder_id, row.participation_id, row.organisation_id]
    );
    const submissionId = subRes.rows[0].id;

    // 2. Process and store each answer
    for (const ans of answers) {
      const qId = parseInt(ans.questionId, 10);
      const q = questionsMap.get(qId);
      if (!q) continue;

      const qType = q.question_type || 'TEXT';
      let answerValue = '';
      let sentiment = null;
      let sentimentStatus = 'NOT_APPLICABLE';
      let sentimentProcessedAt = null;

      if (qType === 'TEXT') {
        const rawText = typeof ans.value === 'string' ? ans.value : (ans.text || '');
        answerValue = sanitiseText(rawText);
        if (answerValue.trim()) {
          // Send to NLP sentiment service
          const nlpResult = await nlp.analyzeSentiment(answerValue);
          sentiment = nlpResult.sentiment;
          sentimentStatus = nlpResult.status;
          sentimentProcessedAt = new Date();

          // Also sync to legacy comments table for backward compatibility
          try {
            await db.query(
              `INSERT INTO comments (campaign_id, question_id, stakeholder_id, text, sentiment)
               VALUES ($1, $2, $3, $4, $5)`,
              [row.campaign_id, qId, row.stakeholder_id, answerValue, sentiment || 'Neutral']
            );
          } catch (_) {}
        }
      } else if (qType === 'CHECKBOX') {
        const opts = Array.isArray(ans.value) ? ans.value : (Array.isArray(ans.selectedOptions) ? ans.selectedOptions : [ans.value].filter(Boolean));
        answerValue = JSON.stringify(opts);
      } else if (qType === 'RATING') {
        answerValue = String(ans.value ?? ans.rating ?? '');
      } else {
        // RADIO, DROPDOWN
        answerValue = String(ans.value ?? ans.selectedOption ?? '');
      }

      await db.query(
        `INSERT INTO feedback_answers (
          submission_id, question_id, response_type, answer_value, sentiment, sentiment_processing_status, sentiment_processed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [submissionId, qId, qType, answerValue, sentiment, sentimentStatus, sentimentProcessedAt]
      );
    }

    // 3. Mark campaign_participants as submitted
    await db.query(
      `UPDATE campaign_participants
       SET submission_status = 'SUBMITTED', invitation_status = 'SUBMITTED', submitted_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [row.participation_id]
    );

    return res.status(201).json({
      message: 'Thank you! Your feedback has been recorded successfully.',
      submissionId,
    });
  } catch (err) {
    console.error('Error submitting consultation feedback:', err);
    return res.status(500).json({ error: 'Failed to record feedback. Please try again.' });
  }
});

// ── 1. POST /api/participate/enter ──
router.post('/enter', participateRateLimiter, async (req, res) => {
  try {
    const { campaignCode, email } = req.body;

    if (!campaignCode || !email) {
      return res.status(400).json({ error: GENERIC_ENTRY_ERROR });
    }

    const cleanCode = campaignCode.toUpperCase().trim();
    const cleanEmail = email.toLowerCase().trim();

    // 1. Check campaign exists and status is OPEN
    const campRes = await db.query(
      `SELECT id, title, description, status, opening_date, closing_date
       FROM campaigns
       WHERE UPPER(campaign_code) = $1 AND status = 'OPEN'`,
      [cleanCode]
    );

    if (campRes.rows.length === 0) {
      return res.status(400).json({ error: GENERIC_ENTRY_ERROR });
    }

    const campaign = campRes.rows[0];
    const now = new Date();

    // 2. Check current date is within opening_date and closing_date
    if (now < new Date(campaign.opening_date) || now > new Date(campaign.closing_date)) {
      return res.status(400).json({ error: GENERIC_ENTRY_ERROR });
    }

    // 3. Check stakeholder is in this campaign's participant list
    // Note: A stakeholder previously removed (is_active=false) stays eligible for campaigns they were already selected for!
    const participantRes = await db.query(
      `SELECT s.id as stakeholder_id, s.first_name, s.last_name
       FROM campaign_participants cp
       JOIN stakeholders s ON cp.stakeholder_id = s.id
       WHERE cp.campaign_id = $1 AND (LOWER(s.email) = $2 OR LOWER(COALESCE(s.alternate_email, '')) = $2)`,
      [campaign.id, cleanEmail]
    );

    if (participantRes.rows.length === 0) {
      return res.status(400).json({ error: GENERIC_ENTRY_ERROR });
    }

    const stakeholder = participantRes.rows[0];

    // 4. Generate short-lived participation JWT (2 hours)
    const participationToken = authMiddleware.generateParticipationToken({
      campaignId: campaign.id,
      stakeholderId: stakeholder.stakeholder_id,
      email: cleanEmail,
    });

    // 5. Fetch campaign questions
    const questionsRes = await db.query(
      `SELECT id, question_text, question_order
       FROM campaign_questions
       WHERE campaign_id = $1
       ORDER BY question_order ASC`,
      [campaign.id]
    );

    return res.json({
      token: participationToken,
      campaign: {
        id: campaign.id,
        title: campaign.title,
        description: campaign.description,
        closingDate: campaign.closing_date,
      },
      questions: questionsRes.rows.map(q => ({
        id: q.id,
        questionText: q.question_text,
        questionOrder: q.question_order,
      })),
      stakeholder: {
        firstName: stakeholder.first_name,
      },
    });
  } catch (err) {
    console.error('Error entering campaign consultation:', err);
    return res.status(400).json({ error: GENERIC_ENTRY_ERROR });
  }
});

// ── 2. POST /api/participate/comments ──
router.post('/comments', authMiddleware.authenticateParticipation, async (req, res) => {
  try {
    const { answers = [] } = req.body;
    const { campaignId, stakeholderId } = req.participation;

    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: 'Please submit at least one response.' });
    }

    // 1. Re-check campaign is still OPEN and active
    const campRes = await db.query(
      'SELECT id, status, opening_date, closing_date FROM campaigns WHERE id = $1',
      [campaignId]
    );

    if (campRes.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }

    const campaign = campRes.rows[0];
    const now = new Date();

    if (campaign.status !== 'OPEN' || now < new Date(campaign.opening_date) || now > new Date(campaign.closing_date)) {
      return res.status(400).json({ error: 'This consultation is currently closed and no longer accepting submissions.' });
    }

    // 2. Check stakeholder comment submission cap (max 20 per campaign)
    const existingCountRes = await db.query(
      'SELECT COUNT(*) FROM comments WHERE campaign_id = $1 AND stakeholder_id = $2',
      [campaignId, stakeholderId]
    );
    const existingCount = parseInt(existingCountRes.rows[0].count, 10);

    if (existingCount + answers.length > 20) {
      return res.status(400).json({
        error: `Submission limit reached. You can submit at most 20 responses per campaign (currently submitted: ${existingCount}).`,
      });
    }

    // 3. Validate answers: text length 5 to 2000 chars each
    for (const ans of answers) {
      const clean = sanitiseText(ans.text);
      if (clean.length < 5) {
        return res.status(400).json({
          error: 'Each answer must contain at least 5 characters.',
        });
      }
      if (clean.length > 2000) {
        return res.status(400).json({
          error: 'Each answer must not exceed 2000 characters.',
        });
      }
    }

    // 4. Save comments with NLP sentiment classification
    for (const ans of answers) {
      const clean = sanitiseText(ans.text);
      let sentiment = null;
      try {
        const nlpRes = await nlp.analyzeSentiment(clean);
        sentiment = nlpRes.sentiment;
      } catch (_) {}

      await db.query(
        `INSERT INTO comments (campaign_id, question_id, stakeholder_id, text, sentiment)
         VALUES ($1, $2, $3, $4, $5)`,
        [campaignId, ans.questionId, stakeholderId, clean, sentiment || 'Neutral']
      );
    }

    // 5. Update campaign_participants submission status
    await db.query(
      `UPDATE campaign_participants
       SET invitation_status = 'SUBMITTED', submitted_at = CURRENT_TIMESTAMP
       WHERE campaign_id = $1 AND stakeholder_id = $2`,
      [campaignId, stakeholderId]
    );

    return res.status(201).json({
      message: 'Thank you! Your feedback has been recorded successfully.',
      submittedCount: answers.length,
    });
  } catch (err) {
    console.error('Error submitting feedback comments:', err);
    return res.status(500).json({ error: 'Failed to record feedback. Please try again.' });
  }
});

// ── 3. POST /api/participate/verify-stakeholder ──
// Public verification endpoint for stakeholders to confirm enrollment using User ID + Organisation Code
router.post('/verify-stakeholder', participateRateLimiter, async (req, res) => {
  try {
    const { userId, orgCode } = req.body;

    if (!userId || !orgCode) {
      return res.status(400).json({
        error: 'Both User ID and Organisation Code are required to verify your enrollment.',
      });
    }

    const cleanUserId = userId.toString().trim();
    const cleanOrgCode = orgCode.toString().toUpperCase().trim();

    // 1. Find organisation by org_code
    const orgRes = await db.query(
      'SELECT id, name FROM organisations WHERE UPPER(org_code) = $1',
      [cleanOrgCode]
    );

    if (orgRes.rows.length === 0) {
      return res.status(400).json({
        error: 'Invalid User ID or Organisation Code. Please check the details in your confirmation email.',
      });
    }

    const org = orgRes.rows[0];

    // 2. Find stakeholder in this organisation by employee_id (case-insensitive), email, or numeric id
    const numericId = /^\d+$/.test(cleanUserId) ? parseInt(cleanUserId, 10) : -1;
    let shRes = await db.query(
      `SELECT id, first_name, last_name, email, department, status, is_active
       FROM stakeholders
       WHERE organisation_id = $1
         AND (UPPER(COALESCE(employee_id, '')) = $2 OR LOWER(COALESCE(email, '')) = $3 OR id = $4)`,
      [org.id, cleanUserId.toUpperCase(), cleanUserId.toLowerCase(), numericId]
    );

    if (shRes.rows.length === 0) {
      // Check if it corresponds to an invited Campaign Manager
      const mgrInvite = await db.query(
        `SELECT id, first_name, last_name, email, department, status 
         FROM manager_invitations 
         WHERE organisation_id = $1 AND (LOWER(email) = $2 OR UPPER(id::text) = $3)`,
        [org.id, cleanUserId.toLowerCase(), cleanUserId.toUpperCase()]
      );

      if (mgrInvite.rows.length > 0) {
        await db.query(
          `UPDATE manager_invitations SET status = 'ACCEPTED' WHERE id = $1`,
          [mgrInvite.rows[0].id]
        );
        const mgr = mgrInvite.rows[0];
        return res.json({
          message: 'Enrollment confirmed successfully!',
          stakeholder: {
            id: mgr.id,
            fullName: `${mgr.first_name} ${mgr.last_name || ''}`.trim(),
            email: mgr.email,
            userId: mgr.email,
            department: mgr.department,
            status: 'ACTIVE',
            orgName: org.name,
          },
        });
      }

      return res.status(400).json({
        error: 'Invalid User ID or Organisation Code. Please check the details in your confirmation email.',
      });
    }

    const sh = shRes.rows[0];

    // 3. Update stakeholder status to ACTIVE and is_active = true
    await db.query(
      `UPDATE stakeholders
       SET is_active = true, status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [sh.id]
    );

    // 4. Record in activity_logs so Administrator sees the confirmation event
    try {
      await db.query(
        `INSERT INTO activity_logs (organisation_id, user_id, action_type, description)
         VALUES ($1, NULL, 'STAKEHOLDER_VERIFIED', $2)`,
        [
          org.id,
          `Stakeholder ${sh.first_name} ${sh.last_name} (${cleanUserId}) verified their enrollment and is now Active.`,
        ]
      );
    } catch (logErr) {
      console.warn('Activity log insert warning:', logErr.message);
    }

    return res.json({
      message: `Enrollment confirmed! ${sh.first_name} ${sh.last_name} is now registered as an Active stakeholder for ${org.name}.`,
      stakeholder: {
        fullName: `${sh.first_name} ${sh.last_name}`.trim(),
        userId: cleanUserId,
        orgName: org.name,
        department: sh.department || 'General',
        status: 'ACTIVE',
      },
    });
  } catch (err) {
    console.error('Error verifying stakeholder enrollment:', err);
    return res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

export default router;
