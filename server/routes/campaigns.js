import express from 'express';
import db from '../db.js';
import cryptoUtils from '../utils/crypto.js';
import emailUtils from '../utils/email.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

router.use(authMiddleware.authenticate);

// Helper to check if user has Admin role
function isAdmin(user) {
  return user.roles && user.roles.includes('ADMIN');
}

// Helper to check if user has Campaign Manager role
function isManager(user) {
  return user.roles && user.roles.includes('CAMPAIGN_MANAGER');
}

// Helper to record activity log
async function logActivity(orgId, userId, actionType, description) {
  try {
    await db.query(
      `INSERT INTO activity_logs (organisation_id, user_id, action_type, description)
       VALUES ($1, $2, $3, $4)`,
      [orgId, userId, actionType, description]
    );
  } catch (err) {
    console.warn('Activity log insert warning:', err.message);
  }
}

// ── 1. POST /api/campaigns ──
// CAMPAIGN_MANAGER only. Admin cannot create campaigns (returns 403).
router.post('/', async (req, res) => {
  try {
    // If user is Admin and NOT Campaign Manager -> 403 Forbidden
    if (isAdmin(req.user) && !isManager(req.user)) {
      return res.status(403).json({ error: 'Administrators cannot create campaigns. Only Campaign Managers have this capability.' });
    }

    if (!isManager(req.user)) {
      return res.status(403).json({ error: 'Only Campaign Managers can create campaigns.' });
    }

    const {
      title,
      description = '',
      objectives = '',
      additionalInstructions = '',
      openingDate,
      closingDate,
      questions = [],
      stakeholderIds = [],
      status = 'DRAFT',
      publishNow = false,
    } = req.body;
    const orgId = req.user.organisationId;

    if (!title || !openingDate || !closingDate) {
      return res.status(400).json({ error: 'Title, opening date, and closing date are required.' });
    }

    if (!objectives || !objectives.trim()) {
      return res.status(400).json({ error: 'Consultation Objectives are required.' });
    }

    const openD = new Date(openingDate);
    const closeD = new Date(closingDate);
    if (closeD < openD) {
      return res.status(400).json({ error: 'End/closing date must not be earlier than start/opening date.' });
    }

    if (!Array.isArray(questions) || questions.length < 1 || questions.length > 10) {
      return res.status(400).json({ error: 'A campaign must have between 1 and 10 questions.' });
    }

    // Validate each question structure and answer options
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const qText = typeof q === 'string' ? q : (q.questionText || q.text || '');
      if (!qText || !qText.trim()) {
        return res.status(400).json({ error: `Question ${i + 1} text cannot be empty.` });
      }

      const qType = typeof q === 'object' && q.questionType ? q.questionType.toUpperCase() : 'TEXT';
      if (['RADIO', 'CHECKBOX', 'DROPDOWN'].includes(qType)) {
        let opts = [];
        if (Array.isArray(q.options)) {
          opts = q.options.map(o => (typeof o === 'string' ? o.trim() : (o.label || o.value || '').trim())).filter(Boolean);
        } else if (typeof q.options === 'string') {
          try { opts = JSON.parse(q.options); } catch { opts = []; }
        }

        if (opts.length < 2) {
          return res.status(400).json({ error: `Question ${i + 1} (${qType}) must have at least 2 non-empty answer options.` });
        }
        const set = new Set(opts.map(o => o.toLowerCase()));
        if (set.size !== opts.length) {
          return res.status(400).json({ error: `Question ${i + 1} contains duplicate answer options.` });
        }
      }
    }

    // If initial stakeholderIds provided, verify all are ACTIVE in this organisation
    const uniqueShIds = Array.from(new Set((stakeholderIds || []).map(id => parseInt(id, 10)).filter(Boolean)));
    if (uniqueShIds.length > 0) {
      for (const shId of uniqueShIds) {
        const shCheck = await db.query(
          'SELECT id, is_active FROM stakeholders WHERE id = $1 AND organisation_id = $2',
          [shId, orgId]
        );
        if (shCheck.rows.length === 0 || !shCheck.rows[0].is_active) {
          return res.status(400).json({
            error: `Stakeholder ID ${shId} is not an active stakeholder in this organisation.`,
          });
        }
      }
    }

    const initialStatus = (publishNow || status === 'OPEN') ? 'OPEN' : 'DRAFT';

    // If publishing immediately, require at least 1 active stakeholder
    if (initialStatus === 'OPEN' && uniqueShIds.length === 0) {
      return res.status(400).json({ error: 'Cannot publish a campaign without selecting at least one active stakeholder.' });
    }

    // Generate unique 8-character uppercase campaign code
    let campaignCode;
    let isUnique = false;
    while (!isUnique) {
      campaignCode = cryptoUtils.generateCampaignCode();
      const existing = await db.query('SELECT id FROM campaigns WHERE campaign_code = $1', [campaignCode]);
      if (existing.rows.length === 0) isUnique = true;
    }

    const campaignRes = await db.query(
      `INSERT INTO campaigns (
        organisation_id, campaign_code, title, description, objectives, additional_instructions,
        created_by, opening_date, closing_date, status, published_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        orgId,
        campaignCode,
        title.trim(),
        description.trim(),
        (objectives || '').trim(),
        (additionalInstructions || '').trim(),
        req.user.userId,
        openD,
        closeD,
        initialStatus,
        initialStatus === 'OPEN' ? new Date() : null,
      ]
    );

    const campaign = campaignRes.rows[0];

    // Insert dynamic questions
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const qText = typeof q === 'string' ? q.trim() : (q.questionText || q.text || '').trim();
      const qType = typeof q === 'object' && q.questionType ? q.questionType.toUpperCase() : 'TEXT';
      const isReq = typeof q === 'object' && typeof q.isRequired === 'boolean' ? q.isRequired : true;

      let optionsStr = '[]';
      if (typeof q === 'object' && q.options) {
        if (Array.isArray(q.options)) {
          optionsStr = JSON.stringify(q.options.map(o => (typeof o === 'string' ? o.trim() : (o.label || o.value || '').trim())).filter(Boolean));
        } else if (typeof q.options === 'string') {
          optionsStr = q.options;
        }
      }

      const minVal = typeof q === 'object' && q.minValue !== undefined ? parseInt(q.minValue, 10) : 1;
      const maxVal = typeof q === 'object' && q.maxValue !== undefined ? parseInt(q.maxValue, 10) : 5;
      const minLen = typeof q === 'object' && q.minLength !== undefined && q.minLength !== null ? parseInt(q.minLength, 10) : null;
      const maxLen = typeof q === 'object' && q.maxLength !== undefined && q.maxLength !== null ? parseInt(q.maxLength, 10) : null;

      await db.query(
        `INSERT INTO campaign_questions (
          campaign_id, question_text, question_order, question_type, is_required, options, min_value, max_value, min_length, max_length
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [campaign.id, qText, i + 1, qType, isReq, optionsStr, minVal, maxVal, minLen, maxLen]
      );
    }

    // Insert participants with unique access tokens
    for (const shId of uniqueShIds) {
      const token = cryptoUtils.generateInvitationToken();
      await db.query(
        `INSERT INTO campaign_participants (campaign_id, stakeholder_id, invitation_status, invitation_token)
         VALUES ($1, $2, $3, $4)`,
        [campaign.id, shId, initialStatus === 'OPEN' ? 'SENT' : 'PENDING', token]
      );
    }

    await logActivity(
      orgId,
      req.user.userId,
      initialStatus === 'OPEN' ? 'CAMPAIGN_OPENED' : 'CAMPAIGN_CREATED',
      `Consultation campaign "${title.trim()}" (${campaignCode}) ${initialStatus === 'OPEN' ? 'published' : 'created as draft'} with ${uniqueShIds.length} assigned stakeholders.`
    );

    return res.status(201).json({
      message: initialStatus === 'OPEN' ? 'Campaign published successfully.' : 'Campaign saved as DRAFT.',
      campaign,
    });
  } catch (err) {
    console.error('Error creating campaign:', err);
    return res.status(500).json({ error: 'Failed to create campaign.' });
  }
});

// ── 2. GET /api/campaigns ──
// Admin sees all in org with response counts; Manager sees only own campaigns.
router.get('/', async (req, res) => {
  try {
    const orgId = req.user.organisationId;
    const userIsAdmin = isAdmin(req.user);

    let queryText = `
      SELECT c.id, c.campaign_code, c.title, c.description, c.objectives, c.status,
             c.opening_date, c.closing_date, c.created_at, c.created_by,
             c.deleted_by, c.deleted_at, c.deletion_reason,
             u.first_name as creator_first_name, u.last_name as creator_last_name, u.email as creator_email, u.department as creator_department
      FROM campaigns c
      JOIN users u ON c.created_by = u.id
      WHERE c.organisation_id = $1 AND c.status != 'DELETED'
    `;
    const params = [orgId];

    if (!userIsAdmin) {
      queryText += ' AND c.created_by = $2';
      params.push(req.user.userId);
    }

    queryText += ' ORDER BY c.created_at DESC';

    const campaignsRes = await db.query(queryText, params);
    const campaigns = campaignsRes.rows;

    for (const c of campaigns) {
      const respCount = await db.query('SELECT COUNT(*) FROM comments WHERE campaign_id = $1', [c.id]);
      const partCount = await db.query('SELECT COUNT(*) FROM campaign_participants WHERE campaign_id = $1', [c.id]);
      const subShCount = await db.query('SELECT COUNT(DISTINCT stakeholder_id) FROM comments WHERE campaign_id = $1', [c.id]);
      c.response_count = parseInt(respCount.rows[0]?.count || '0', 10);
      c.participant_count = parseInt(partCount.rows[0]?.count || '0', 10);
      c.participated_count = parseInt(subShCount.rows[0]?.count || '0', 10);
    }

    // Also fetch soft-deleted campaigns for Deleted Campaign History view
    let delQuery = `
      SELECT c.id, c.campaign_code, c.title, c.description, c.objectives, c.status, c.previous_status,
             c.opening_date, c.closing_date, c.created_at, c.created_by,
             c.deleted_by, c.deleted_at, c.deletion_reason,
             u.first_name as creator_first_name, u.last_name as creator_last_name,
             du.first_name as deleter_first_name, du.last_name as deleter_last_name
      FROM campaigns c
      JOIN users u ON c.created_by = u.id
      LEFT JOIN users du ON c.deleted_by = du.id
      WHERE c.organisation_id = $1 AND c.status = 'DELETED'
    `;
    const delParams = [orgId];
    if (!userIsAdmin) {
      delQuery += ' AND c.created_by = $2';
      delParams.push(req.user.userId);
    }
    delQuery += ' ORDER BY c.deleted_at DESC';

    const deletedRes = await db.query(delQuery, delParams);
    const deletedCampaigns = deletedRes.rows;
    for (const dc of deletedCampaigns) {
      const respCount = await db.query('SELECT COUNT(*) FROM comments WHERE campaign_id = $1', [dc.id]);
      const partCount = await db.query('SELECT COUNT(*) FROM campaign_participants WHERE campaign_id = $1', [dc.id]);
      dc.response_count = parseInt(respCount.rows[0]?.count || '0', 10);
      dc.participant_count = parseInt(partCount.rows[0]?.count || '0', 10);
    }

    return res.json({
      campaigns,
      deletedCampaigns,
      isReadOnly: userIsAdmin && !isManager(req.user),
    });
  } catch (err) {
    console.error('Error fetching campaigns:', err);
    return res.status(500).json({ error: 'Failed to fetch campaigns.' });
  }
});

// ── 3. GET /api/campaigns/:id ──
router.get('/:id', async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id, 10);
    const orgId = req.user.organisationId;
    const userIsAdmin = isAdmin(req.user);
    const allowDeleted = req.query.allowDeleted === 'true';

    const campRes = await db.query(
      `SELECT c.id, c.organisation_id, c.campaign_code, c.title, c.description, c.objectives, c.additional_instructions,
              c.status, c.opening_date, c.closing_date, c.published_at, c.created_by, c.created_at, c.updated_at,
              c.deleted_by, c.deleted_at, c.deletion_reason,
              u.first_name as creator_first_name, u.last_name as creator_last_name, u.email as creator_email
       FROM campaigns c
       JOIN users u ON c.created_by = u.id
       WHERE c.id = $1 AND c.organisation_id = $2 ${allowDeleted ? '' : "AND c.status != 'DELETED'"}`,
      [campaignId, orgId]
    );

    if (campRes.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }

    const campaign = campRes.rows[0];
    const respCount = await db.query('SELECT COUNT(*) FROM comments WHERE campaign_id = $1', [campaignId]);
    campaign.response_count = parseInt(respCount.rows[0]?.count || '0', 10);

    // Manager ownership check: manager cannot view another manager's campaign
    if (!userIsAdmin && campaign.created_by !== req.user.userId) {
      return res.status(403).json({ error: 'You are not authorized to access this campaign.' });
    }

    // Fetch dynamic questions
    const questionsRes = await db.query(
      `SELECT id, question_text, question_order, question_type, is_required, options, min_value, max_value, min_length, max_length
       FROM campaign_questions
       WHERE campaign_id = $1
       ORDER BY question_order ASC`,
      [campaignId]
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

    // Fetch participants with rich directory details, submission status, and unique tokens
    const participantsRes = await db.query(
      `SELECT s.id, s.first_name, s.last_name, s.email, s.alternate_email, s.contact,
              s.department, s.designation, s.category, s.employee_id, s.is_active,
              cp.id as participation_id, cp.invited_at, cp.invitation_status, cp.submission_status, cp.invitation_token, cp.submitted_at
       FROM campaign_participants cp
       JOIN stakeholders s ON cp.stakeholder_id = s.id
       WHERE cp.campaign_id = $1
       ORDER BY s.first_name ASC`,
      [campaignId]
    );

    // Check which participants have submitted comments / feedback
    const submittedShRes = await db.query(
      'SELECT DISTINCT stakeholder_id FROM comments WHERE campaign_id = $1',
      [campaignId]
    );
    const submittedSet = new Set(submittedShRes.rows.map(r => r.stakeholder_id));

    // Ensure all participants have an invitation token
    const participants = [];
    for (const p of participantsRes.rows) {
      let token = p.invitation_token;
      if (!token) {
        token = cryptoUtils.generateInvitationToken();
        await db.query('UPDATE campaign_participants SET invitation_token = $1 WHERE id = $2', [token, p.participation_id]);
      }
      const hasSubmitted = submittedSet.has(p.id) || p.submission_status === 'SUBMITTED' || p.invitation_status === 'SUBMITTED';
      const invStatus = hasSubmitted
        ? 'Submitted'
        : campaign.status === 'DRAFT'
        ? 'Pending'
        : 'Sent';

      participants.push({
        ...p,
        invitation_token: token,
        access_url: `/participate?token=${token}`,
        full_name: `${p.first_name} ${p.last_name}`.trim(),
        department: p.department || 'General',
        designation: p.designation || 'Member',
        category: p.category || 'Employee',
        submission_status: hasSubmitted ? 'SUBMITTED' : (p.submission_status || 'PENDING'),
        invitation_status: userIsAdmin && !isManager(req.user)
          ? (campaign.status === 'DRAFT' ? 'Pending' : 'Invited')
          : invStatus,
        feedback_status: userIsAdmin && !isManager(req.user)
          ? undefined
          : (hasSubmitted ? 'Submitted' : 'Awaiting Feedback'),
        has_submitted: userIsAdmin && !isManager(req.user) ? undefined : hasSubmitted,
      });
    }

    return res.json({
      campaign: {
        ...campaign,
        response_count: parseInt(campaign.response_count || '0', 10),
        participant_count: participants.length,
        participated_count: submittedSet.size,
      },
      questions,
      participants,
      canEdit: !userIsAdmin && campaign.created_by === req.user.userId && campaign.status !== 'CLOSED' && campaign.status !== 'DELETED',
    });
  } catch (err) {
    console.error('Error fetching campaign details:', err);
    return res.status(500).json({ error: 'Failed to fetch campaign details.' });
  }
});

// ── 4. PUT /api/campaigns/:id ──
// Status-based edit rules. Admin gets 403.
router.put('/:id', async (req, res) => {
  try {
    // Admin cannot edit campaigns
    if (isAdmin(req.user) && !isManager(req.user)) {
      return res.status(403).json({ error: 'Administrators cannot edit campaigns. Only the Campaign Manager who created the campaign can edit it.' });
    }

    const campaignId = parseInt(req.params.id, 10);
    const orgId = req.user.organisationId;

    const campRes = await db.query(
      'SELECT * FROM campaigns WHERE id = $1 AND organisation_id = $2 AND status != \'DELETED\'',
      [campaignId, orgId]
    );

    if (campRes.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }

    const campaign = campRes.rows[0];

    // Must be creator
    if (campaign.created_by !== req.user.userId) {
      return res.status(403).json({ error: 'You cannot edit a campaign created by another manager.' });
    }

    if (campaign.status === 'CLOSED') {
      return res.status(400).json({ error: 'Closed campaigns are read-only and cannot be edited.' });
    }

    const commentCountRes = await db.query('SELECT COUNT(*) FROM comments WHERE campaign_id = $1', [campaignId]);
    const subCountRes = await db.query('SELECT COUNT(*) FROM feedback_submissions WHERE campaign_id = $1', [campaignId]);
    const hasResponses = parseInt(commentCountRes.rows[0].count, 10) > 0 || parseInt(subCountRes.rows[0].count, 10) > 0;

    if (campaign.status === 'OPEN') {
      const { closingDate, questions } = req.body;
      if (!closingDate) {
        return res.status(400).json({ error: 'When a campaign is OPEN, closing date is required.' });
      }

      if (hasResponses && questions && questions.length > 0) {
        return res.status(400).json({
          error: 'A published campaign with existing submissions cannot have its questions modified to preserve the integrity of previous responses.'
        });
      }

      await db.query(
        'UPDATE campaigns SET closing_date = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [new Date(closingDate), campaignId]
      );
      return res.json({ message: 'Campaign closing date updated successfully.' });
    }

    // If DRAFT: full edit
    const {
      title,
      description = '',
      objectives = '',
      additionalInstructions = '',
      openingDate,
      closingDate,
      questions = [],
      stakeholderIds,
    } = req.body;

    if (!title || !openingDate || !closingDate) {
      return res.status(400).json({ error: 'Title, opening date, and closing date are required.' });
    }

    const openD = new Date(openingDate);
    const closeD = new Date(closingDate);
    if (closeD < openD) {
      return res.status(400).json({ error: 'End/closing date must not be earlier than start/opening date.' });
    }

    if (questions.length < 1 || questions.length > 10) {
      return res.status(400).json({ error: 'A campaign must have between 1 and 10 questions.' });
    }

    // Validate questions
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const qText = typeof q === 'string' ? q : (q.questionText || q.text || '');
      if (!qText || !qText.trim()) {
        return res.status(400).json({ error: `Question ${i + 1} text cannot be empty.` });
      }

      const qType = typeof q === 'object' && q.questionType ? q.questionType.toUpperCase() : 'TEXT';
      if (['RADIO', 'CHECKBOX', 'DROPDOWN'].includes(qType)) {
        let opts = [];
        if (Array.isArray(q.options)) {
          opts = q.options.map(o => (typeof o === 'string' ? o.trim() : (o.label || o.value || '').trim())).filter(Boolean);
        } else if (typeof q.options === 'string') {
          try { opts = JSON.parse(q.options); } catch { opts = []; }
        }

        if (opts.length < 2) {
          return res.status(400).json({ error: `Question ${i + 1} (${qType}) must have at least 2 non-empty answer options.` });
        }
        const set = new Set(opts.map(o => o.toLowerCase()));
        if (set.size !== opts.length) {
          return res.status(400).json({ error: `Question ${i + 1} contains duplicate answer options.` });
        }
      }
    }

    await db.query(
      `UPDATE campaigns
       SET title = $1, description = $2, objectives = $3, additional_instructions = $4,
           opening_date = $5, closing_date = $6, updated_at = CURRENT_TIMESTAMP
       WHERE id = $7`,
      [
        title.trim(),
        description.trim(),
        (objectives || '').trim(),
        (additionalInstructions || '').trim(),
        openD,
        closeD,
        campaignId,
      ]
    );

    // Update questions: delete old, insert new
    await db.query('DELETE FROM campaign_questions WHERE campaign_id = $1', [campaignId]);
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const qText = typeof q === 'string' ? q.trim() : (q.questionText || q.text || '').trim();
      const qType = typeof q === 'object' && q.questionType ? q.questionType.toUpperCase() : 'TEXT';
      const isReq = typeof q === 'object' && typeof q.isRequired === 'boolean' ? q.isRequired : true;

      let optionsStr = '[]';
      if (typeof q === 'object' && q.options) {
        if (Array.isArray(q.options)) {
          optionsStr = JSON.stringify(q.options.map(o => (typeof o === 'string' ? o.trim() : (o.label || o.value || '').trim())).filter(Boolean));
        } else if (typeof q.options === 'string') {
          optionsStr = q.options;
        }
      }

      const minVal = typeof q === 'object' && q.minValue !== undefined ? parseInt(q.minValue, 10) : 1;
      const maxVal = typeof q === 'object' && q.maxValue !== undefined ? parseInt(q.maxValue, 10) : 5;
      const minLen = typeof q === 'object' && q.minLength !== undefined && q.minLength !== null ? parseInt(q.minLength, 10) : null;
      const maxLen = typeof q === 'object' && q.maxLength !== undefined && q.maxLength !== null ? parseInt(q.maxLength, 10) : null;

      await db.query(
        `INSERT INTO campaign_questions (
          campaign_id, question_text, question_order, question_type, is_required, options, min_value, max_value, min_length, max_length
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [campaignId, qText, i + 1, qType, isReq, optionsStr, minVal, maxVal, minLen, maxLen]
      );
    }

    // If stakeholderIds provided in DRAFT, replace participant roster with secure invitation tokens
    if (Array.isArray(stakeholderIds)) {
      const cleanShIds = Array.from(new Set(stakeholderIds.map(id => parseInt(id, 10)).filter(Boolean)));
      await db.query('DELETE FROM campaign_participants WHERE campaign_id = $1', [campaignId]);
      for (const shId of cleanShIds) {
        const token = cryptoUtils.generateInvitationToken();
        await db.query(
          `INSERT INTO campaign_participants (campaign_id, stakeholder_id, invitation_status, invitation_token)
           VALUES ($1, $2, 'PENDING', $3) ON CONFLICT DO NOTHING`,
          [campaignId, shId, token]
        );
      }
    }

    return res.json({ message: 'Campaign updated successfully.' });
  } catch (err) {
    console.error('Error updating campaign:', err);
    return res.status(500).json({ error: 'Failed to update campaign.' });
  }
});

// ── 5. PUT /api/campaigns/:id/participants ──
// Active stakeholders only; removal only allowed in DRAFT status.
router.put('/:id/participants', async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id, 10);
    const orgId = req.user.organisationId;
    const { stakeholderIds = [] } = req.body;

    const campRes = await db.query(
      'SELECT id, status, created_by FROM campaigns WHERE id = $1 AND organisation_id = $2 AND status != \'DELETED\'',
      [campaignId, orgId]
    );

    if (campRes.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }

    const campaign = campRes.rows[0];

    if (!isAdmin(req.user) && campaign.created_by !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to modify participants for this campaign.' });
    }

    const currentParticipantsRes = await db.query(
      'SELECT stakeholder_id FROM campaign_participants WHERE campaign_id = $1',
      [campaignId]
    );
    const currentIds = currentParticipantsRes.rows.map(r => r.stakeholder_id);

    // If campaign is OPEN or CLOSED, removal is NOT allowed
    if (campaign.status !== 'DRAFT') {
      const removed = currentIds.filter(id => !stakeholderIds.includes(id));
      if (removed.length > 0) {
        return res.status(400).json({
          error: 'Participants can only be removed while the campaign is in DRAFT status.',
        });
      }
    }

    // Verify all newly selected stakeholders are ACTIVE in this organisation
    const newToAdd = stakeholderIds.filter(id => !currentIds.includes(id));
    if (newToAdd.length > 0) {
      for (const shId of newToAdd) {
        const shCheck = await db.query(
          'SELECT id, is_active FROM stakeholders WHERE id = $1 AND organisation_id = $2',
          [shId, orgId]
        );
        if (shCheck.rows.length === 0 || !shCheck.rows[0].is_active) {
          return res.status(400).json({
            error: `Stakeholder ID ${shId} is not an active stakeholder in this organisation.`,
          });
        }
      }
    }

    // If in DRAFT, replace participant list
    if (campaign.status === 'DRAFT') {
      await db.query('DELETE FROM campaign_participants WHERE campaign_id = $1', [campaignId]);
      for (const shId of stakeholderIds) {
        const token = cryptoUtils.generateInvitationToken();
        await db.query(
          'INSERT INTO campaign_participants (campaign_id, stakeholder_id, invitation_status, invitation_token) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
          [campaignId, shId, 'PENDING', token]
        );
      }
    } else {
      // If OPEN, append new ones
      for (const shId of newToAdd) {
        const token = cryptoUtils.generateInvitationToken();
        await db.query(
          'INSERT INTO campaign_participants (campaign_id, stakeholder_id, invitation_status, invitation_token) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
          [campaignId, shId, 'SENT', token]
        );
      }
    }

    return res.json({ message: 'Campaign participants updated successfully.' });
  } catch (err) {
    console.error('Error updating participants:', err);
    return res.status(500).json({ error: 'Failed to update campaign participants.' });
  }
});

// ── 6. POST /api/campaigns/:id/open ──
// Sets status to OPEN and emails participants
router.post('/:id/open', async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id, 10);
    const orgId = req.user.organisationId;

    const campRes = await db.query(
      'SELECT * FROM campaigns WHERE id = $1 AND organisation_id = $2 AND status != \'DELETED\'',
      [campaignId, orgId]
    );

    if (campRes.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }

    const campaign = campRes.rows[0];

    if (!isAdmin(req.user) && campaign.created_by !== req.user.userId) {
      return res.status(403).json({ error: 'Only the creator can open this campaign.' });
    }

    if (campaign.status !== 'DRAFT') {
      return res.status(400).json({ error: `Cannot open campaign with status '${campaign.status}'.` });
    }

    // Check participants and questions count
    const qCount = await db.query('SELECT COUNT(*) FROM campaign_questions WHERE campaign_id = $1', [campaignId]);
    if (parseInt(qCount.rows[0].count, 10) === 0) {
      return res.status(400).json({ error: 'Cannot open a campaign with no questions. Please add questions first.' });
    }

    const pCount = await db.query('SELECT COUNT(*) FROM campaign_participants WHERE campaign_id = $1', [campaignId]);
    if (parseInt(pCount.rows[0].count, 10) === 0) {
      return res.status(400).json({ error: 'Cannot open a campaign with no participants. Please select stakeholders first.' });
    }

    // Update status to OPEN
    await db.query(
      'UPDATE campaigns SET status = \'OPEN\', previous_status = \'DRAFT\', updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [campaignId]
    );

    // Update participant invitation status to SENT
    await db.query(
      `UPDATE campaign_participants SET invitation_status = 'SENT' WHERE campaign_id = $1 AND invitation_status = 'PENDING'`,
      [campaignId]
    );

    // Fetch all participants to dispatch invitation emails
    const participants = await db.query(
      `SELECT s.first_name, s.email
       FROM campaign_participants cp
       JOIN stakeholders s ON cp.stakeholder_id = s.id
       WHERE cp.campaign_id = $1`,
      [campaignId]
    );

    const formattedClosingDate = new Date(campaign.closing_date).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    for (const p of participants.rows) {
      emailUtils.sendEmail({
        to: p.email,
        firstName: p.first_name,
        template: 'CAMPAIGN_INVITE',
        data: {
          title: campaign.title,
          campaignCode: campaign.campaign_code,
          closingDate: formattedClosingDate,
          participateUrl: `http://localhost:5173/participate?code=${campaign.campaign_code}`,
        },
      });
    }

    await logActivity(
      orgId,
      req.user.userId,
      'CAMPAIGN_OPENED',
      `Consultation "${campaign.title}" (${campaign.campaign_code}) opened and invitations dispatched to ${participants.rows.length} stakeholders.`
    );

    return res.json({
      message: `Campaign is now OPEN. Invitation emails dispatched to ${participants.rows.length} participants.`,
      status: 'OPEN',
    });
  } catch (err) {
    console.error('Error opening campaign:', err);
    return res.status(500).json({ error: 'Failed to open campaign.' });
  }
});

// ── 7. POST /api/campaigns/:id/close ──
router.post('/:id/close', async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id, 10);
    const orgId = req.user.organisationId;

    const campRes = await db.query(
      'SELECT * FROM campaigns WHERE id = $1 AND organisation_id = $2 AND status != \'DELETED\'',
      [campaignId, orgId]
    );

    if (campRes.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }

    const campaign = campRes.rows[0];

    if (!isAdmin(req.user) && campaign.created_by !== req.user.userId) {
      return res.status(403).json({ error: 'Only the creator can close this campaign.' });
    }

    if (campaign.status !== 'OPEN') {
      return res.status(400).json({ error: `Cannot close campaign with status '${campaign.status}'.` });
    }

    await db.query(
      'UPDATE campaigns SET status = \'CLOSED\', previous_status = \'OPEN\', updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [campaignId]
    );

    await logActivity(
      orgId,
      req.user.userId,
      'CAMPAIGN_COMPLETED',
      `Consultation "${campaign.title}" (${campaign.campaign_code}) marked as completed.`
    );

    return res.json({ message: 'Campaign closed successfully.', status: 'CLOSED' });
  } catch (err) {
    console.error('Error closing campaign:', err);
    return res.status(500).json({ error: 'Failed to close campaign.' });
  }
});

// ── 8. DELETE /api/campaigns/:id ──
// Soft deletion with reason and audit trail
router.delete('/:id', async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id, 10);
    const orgId = req.user.organisationId;
    const userIsAdmin = isAdmin(req.user);
    const deletionReason = (req.body?.reason || req.body?.deletionReason || req.query?.reason || 'Administrative / Manager action').trim();

    const campRes = await db.query(
      'SELECT * FROM campaigns WHERE id = $1 AND organisation_id = $2 AND status != \'DELETED\'',
      [campaignId, orgId]
    );

    if (campRes.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }

    const campaign = campRes.rows[0];

    // Check comment count
    const commentCountRes = await db.query(
      'SELECT COUNT(*) FROM comments WHERE campaign_id = $1',
      [campaignId]
    );
    const commentCount = parseInt(commentCountRes.rows[0].count, 10);

    // If Admin: can delete any campaign directly after confirmation dialog
    if (userIsAdmin) {
      await db.query(
        `UPDATE campaigns
         SET status = 'DELETED', previous_status = $1, deleted_by = $2, deleted_at = CURRENT_TIMESTAMP,
             deletion_reason = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [campaign.status, req.user.userId, deletionReason, campaignId]
      );

      await logActivity(
        orgId,
        req.user.userId,
        'CAMPAIGN_DELETED',
        `Campaign "${campaign.title}" (${campaign.campaign_code}) soft-deleted by Administrator. Reason: ${deletionReason}`
      );

      return res.json({ message: 'Campaign deleted successfully by administrator.' });
    }

    // If Manager:
    if (campaign.created_by !== req.user.userId) {
      return res.status(403).json({ error: 'You cannot delete another manager\'s campaign.' });
    }

    if (commentCount > 0 || campaign.status === 'CLOSED') {
      return res.status(409).json({
        error: 'Deleting a campaign that has responses needs administrator approval (available in the next stage)',
        needsApproval: true,
      });
    }

    // Allowed (DRAFT, or OPEN with 0 comments)
    await db.query(
      `UPDATE campaigns
       SET status = 'DELETED', previous_status = $1, deleted_by = $2, deleted_at = CURRENT_TIMESTAMP,
           deletion_reason = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [campaign.status, req.user.userId, deletionReason, campaignId]
    );

    await logActivity(
      orgId,
      req.user.userId,
      'CAMPAIGN_DELETED',
      `Campaign "${campaign.title}" (${campaign.campaign_code}) soft-deleted by Campaign Manager. Reason: ${deletionReason}`
    );

    return res.json({ message: 'Campaign deleted successfully.' });
  } catch (err) {
    console.error('Error deleting campaign:', err);
    return res.status(500).json({ error: 'Failed to delete campaign.' });
  }
});

// ── 9. GET /api/campaigns/:id/responses ──
// Paginated responses screen data with anonymised author & "Not analysed yet" placeholder
router.get('/:id/responses', async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id, 10);
    const orgId = req.user.organisationId;
    const userIsAdmin = isAdmin(req.user);

    const campRes = await db.query(
      'SELECT id, title, campaign_code, status, created_by FROM campaigns WHERE id = $1 AND organisation_id = $2 AND status != \'DELETED\'',
      [campaignId, orgId]
    );

    if (campRes.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }

    const campaign = campRes.rows[0];

    if (userIsAdmin && !isManager(req.user)) {
      return res.status(403).json({
        error: 'Administrators cannot view individual stakeholder feedback or sentiment classification. Only aggregate participation counts are visible to Administrators.',
      });
    }

    if (campaign.created_by !== req.user.userId) {
      return res.status(403).json({ error: 'You are not authorized to view responses for this campaign.' });
    }

    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '20', 10);
    const offset = (page - 1) * limit;

    // Total count
    const totalCountRes = await db.query(
      'SELECT COUNT(*) FROM comments WHERE campaign_id = $1',
      [campaignId]
    );
    const total = parseInt(totalCountRes.rows[0].count, 10);

    // Fetch comments
    const commentsRes = await db.query(
      `SELECT c.id, c.question_id, c.stakeholder_id, c.text, c.created_at,
              q.question_text, q.question_order,
              s.first_name, s.last_name
       FROM comments c
       JOIN campaign_questions q ON c.question_id = q.id
       JOIN stakeholders s ON c.stakeholder_id = s.id
       WHERE c.campaign_id = $1
       ORDER BY c.created_at DESC
       LIMIT $2 OFFSET $3`,
      [campaignId, limit, offset]
    );

    // Build deterministic anonymised mapping per stakeholder within this campaign
    // Query all distinct stakeholder IDs in this campaign ordered by first comment
    const distinctStakeholders = await db.query(
      `SELECT stakeholder_id, MIN(created_at) as first_seen
       FROM comments
       WHERE campaign_id = $1
       GROUP BY stakeholder_id
       ORDER BY first_seen ASC`,
      [campaignId]
    );

    const anonMap = new Map();
    distinctStakeholders.rows.forEach((row, idx) => {
      anonMap.set(row.stakeholder_id, `Stakeholder ${idx + 1}`);
    });

    const showIdentity = process.env.SHOW_COMMENTER_IDENTITY === 'true';

    const formattedComments = commentsRes.rows.map(cm => ({
      id: cm.id,
      questionId: cm.question_id,
      questionText: cm.question_text,
      questionOrder: cm.question_order,
      text: cm.text,
      author: showIdentity ? `${cm.first_name} ${cm.last_name}` : (anonMap.get(cm.stakeholder_id) || 'Stakeholder'),
      createdAt: cm.created_at,
      sentiment: 'Not analysed yet', // Placeholder for next stage
    }));

    return res.json({
      campaign: {
        id: campaign.id,
        title: campaign.title,
        campaignCode: campaign.campaign_code,
        status: campaign.status,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      responses: formattedComments,
    });
  } catch (err) {
    console.error('Error fetching campaign responses:', err);
    return res.status(500).json({ error: 'Failed to fetch campaign responses.' });
  }
});

export default router;
