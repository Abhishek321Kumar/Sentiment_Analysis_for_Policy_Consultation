import express from 'express';
import db from '../db.js';
import cryptoUtils from '../utils/crypto.js';
import emailUtils from '../utils/email.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

// Helper to parse name whether passed as fullName or firstName + lastName
function parseNameFields({ fullName, firstName, lastName }) {
  if (firstName && lastName) {
    return { firstName: firstName.trim(), lastName: lastName.trim() };
  }
  if (fullName && fullName.trim()) {
    const parts = fullName.trim().split(/\s+/);
    const fName = parts[0];
    const lName = parts.length > 1 ? parts.slice(1).join(' ') : '-';
    return { firstName: fName, lastName: lName };
  }
  if (firstName && firstName.trim()) {
    return { firstName: firstName.trim(), lastName: (lastName || '-').trim() };
  }
  return { firstName: '', lastName: '' };
}

// Validation helper: If email references company name/brand, it must match official organisation domain
function validateOrgEmailDomain(email, orgDomain, orgName) {
  if (!email || !email.includes('@')) {
    return { valid: false, error: 'Enter a valid email address.' };
  }
  const cleanEmail = email.toLowerCase().trim();
  const emailDomain = cleanEmail.split('@')[1];
  if (!emailDomain || !emailDomain.includes('.')) {
    return { valid: false, error: 'Email must contain a valid domain (e.g. name@domain.com).' };
  }

  const cleanOrgDomain = (orgDomain || '').toLowerCase().trim().replace(/^@/, '');
  if (!cleanOrgDomain) {
    return { valid: true };
  }

  // Base brand token from org domain (e.g. 'ibm.in' -> 'ibm')
  const orgDomainBase = cleanOrgDomain.split('.')[0];

  // Base name tokens from org name (e.g. 'IBM' -> 'ibm')
  const orgNameTokens = (orgName || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3 || (orgName && orgName.trim().length <= 3 && t.length >= 2));

  const brandKeys = Array.from(new Set([orgDomainBase, ...orgNameTokens].filter(Boolean)));
  const emailDomainBase = emailDomain.split('.')[0];
  let referencesCompany = false;

  for (const key of brandKeys) {
    if (emailDomainBase === key || emailDomain.startsWith(key + '.') || emailDomain.includes(key)) {
      referencesCompany = true;
      break;
    }
  }

  if (referencesCompany && emailDomain !== cleanOrgDomain) {
    return {
      valid: false,
      error: `Company email must follow the registered domain "@${cleanOrgDomain}". "@${emailDomain}" is not permitted.`
    };
  }

  return { valid: true };
}

// ── Public Manager Invitation Token Validation & Setup ──
// Accessed via activation link: /activate-manager?token=...
router.get('/managers/invitation/:token', async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) return res.status(400).json({ error: 'Invitation token is required.' });

    const inviteRes = await db.query(
      `SELECT mi.*, o.name as org_name, o.org_code, o.logo_url
       FROM manager_invitations mi
       JOIN organisations o ON mi.organisation_id = o.id
       WHERE mi.token = $1`,
      [token]
    );

    if (inviteRes.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired manager invitation link.' });
    }

    const invite = inviteRes.rows[0];

    if (invite.status === 'ACTIVATED') {
      return res.status(400).json({
        error: 'This invitation has already been activated. Please proceed to login.',
        alreadyActivated: true,
        email: invite.email,
      });
    }

    if (new Date() > new Date(invite.expires_at)) {
      return res.status(400).json({
        error: 'This invitation link has expired. Please contact your organisation administrator for a new invite.',
        expired: true,
      });
    }

    return res.json({
      invitation: {
        id: invite.id,
        firstName: invite.first_name,
        lastName: invite.last_name,
        fullName: `${invite.first_name} ${invite.last_name}`.trim(),
        email: invite.email,
        phone: invite.phone || '',
        department: invite.department || '',
        designation: invite.designation || '',
        orgName: invite.org_name,
        orgCode: invite.org_code,
        logoUrl: invite.logo_url,
      },
    });
  } catch (err) {
    console.error('Error fetching manager invitation:', err);
    return res.status(500).json({ error: 'Failed to verify invitation link.' });
  }
});

// Lookup Manager Invitation by Email + Org Code OR Token (Public Onboarding)
router.post('/managers/invitation-lookup', async (req, res) => {
  try {
    const { email, orgCode, token } = req.body;
    let inviteRes;

    if (token && token.trim()) {
      inviteRes = await db.query(
        `SELECT mi.*, o.name as org_name, o.org_code, o.logo_url
         FROM manager_invitations mi
         JOIN organisations o ON mi.organisation_id = o.id
         WHERE mi.token = $1`,
        [token.trim()]
      );
    } else if (email && orgCode) {
      inviteRes = await db.query(
        `SELECT mi.*, o.name as org_name, o.org_code, o.logo_url
         FROM manager_invitations mi
         JOIN organisations o ON mi.organisation_id = o.id
         WHERE LOWER(mi.email) = $1 AND LOWER(o.org_code) = $2`,
        [email.toLowerCase().trim(), orgCode.toLowerCase().trim()]
      );
    } else {
      return res.status(400).json({ error: 'Please provide either an activation token or your email and organisation code.' });
    }

    if (inviteRes.rows.length === 0) {
      if (orgCode) {
        const orgCheck = await db.query(`SELECT name FROM organisations WHERE LOWER(org_code) = $1`, [orgCode.toLowerCase().trim()]);
        if (orgCheck.rows.length === 0) {
          return res.status(404).json({
            error: `Organisation code "${orgCode.toUpperCase()}" does not match any registered institution in the system. Please verify the code with your administrator.`
          });
        }
      }
      return res.status(404).json({
        error: `No pending invitation found for "${email}". Please verify that this email was invited by your administrator.`
      });
    }

    const invite = inviteRes.rows[0];

    if (invite.status === 'ACTIVATED') {
      return res.status(400).json({ error: 'This invitation has already been activated. Please proceed to login.', alreadyActivated: true });
    }

    if (new Date() > new Date(invite.expires_at)) {
      return res.status(400).json({ error: 'This invitation link has expired. Please ask your administrator to click Resend in the dashboard.', expired: true });
    }

    return res.json({
      invitation: {
        id: invite.id,
        email: invite.email,
        fullName: `${invite.first_name} ${invite.last_name}`.trim(),
        firstName: invite.first_name,
        lastName: invite.last_name,
        department: invite.department,
        designation: invite.designation,
        phone: invite.phone,
        organisationId: invite.organisation_id,
        orgName: invite.org_name,
        orgCode: invite.org_code,
        token: invite.token,
        expiresAt: invite.expires_at,
        status: invite.status,
        logoUrl: invite.logo_url,
      }
    });
  } catch (err) {
    console.error('Error looking up manager invitation:', err);
    return res.status(500).json({ error: 'Failed to look up manager invitation.' });
  }
});

// Activate Campaign Manager Account via Invitation Token
router.post('/managers/activate/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { firstName, lastName, fullName, phone, department, designation, password } = req.body;

    if (!token) return res.status(400).json({ error: 'Invitation token is required.' });

    const inviteRes = await db.query(
      `SELECT mi.*, o.name as org_name, o.org_code
       FROM manager_invitations mi
       JOIN organisations o ON mi.organisation_id = o.id
       WHERE mi.token = $1`,
      [token]
    );

    if (inviteRes.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired manager invitation link.' });
    }

    const invite = inviteRes.rows[0];

    if (invite.status === 'ACTIVATED') {
      return res.status(400).json({
        error: 'This invitation has already been activated. Please proceed to login.',
        alreadyActivated: true,
      });
    }

    if (new Date() > new Date(invite.expires_at)) {
      return res.status(400).json({ error: 'This invitation link has expired. Please contact your administrator.' });
    }

    const { firstName: fName, lastName: lName } = parseNameFields({
      fullName,
      firstName: firstName || invite.first_name,
      lastName: lastName || invite.last_name,
    });

    if (!fName) {
      return res.status(400).json({ error: 'First name is required.' });
    }

    const cleanDept = (department || invite.department || 'General').trim();
    const cleanDesig = (designation || invite.designation || '').trim();
    if (!cleanDesig) {
      return res.status(400).json({ error: 'Designation is required.' });
    }

    const cleanPhone = (phone || invite.phone || '').trim().replace(/[^0-9]/g, '');
    if (!/^[0-9]{10}$/.test(cleanPhone)) {
      return res.status(400).json({ error: 'Contact number must be exactly 10 digits (numbers only).' });
    }

    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }
    if (!/[A-Z]/.test(password) || !/\d/.test(password) || !/[!@#$%^&*]/.test(password)) {
      return res.status(400).json({
        error: 'Password must contain at least 1 uppercase letter, 1 number, and 1 special character (!@#$%^&*).',
      });
    }

    const cleanEmail = invite.email.toLowerCase().trim();

    // Check if user already exists
    const existing = await db.query(
      'SELECT id FROM users WHERE organisation_id = $1 AND LOWER(email) = $2',
      [invite.organisation_id, cleanEmail]
    );
    let userId;
    const hashedPass = await cryptoUtils.hashPassword(password);

    if (existing.rows.length > 0) {
      userId = existing.rows[0].id;
      await db.query(
        `UPDATE users
         SET first_name = $1, last_name = $2, phone = $3, department = $4, designation = $5,
             password_hash = $6, email_verified = true, account_status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP
         WHERE id = $7`,
        [fName, lName, cleanPhone, cleanDept, cleanDesig, hashedPass, userId]
      );
    } else {
      const userRes = await db.query(
        `INSERT INTO users (
           organisation_id, first_name, last_name, email, phone,
           department, designation, account_status, password_hash, email_verified
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8, true)
         RETURNING id`,
        [invite.organisation_id, fName, lName, cleanEmail, cleanPhone, cleanDept, cleanDesig, hashedPass]
      );
      userId = userRes.rows[0].id;
    }

    // Ensure CAMPAIGN_MANAGER role
    await db.query(
      `INSERT INTO user_roles (user_id, role)
       VALUES ($1, 'CAMPAIGN_MANAGER')
       ON CONFLICT DO NOTHING`,
      [userId]
    );

    // Update invitation status
    await db.query(
      `UPDATE manager_invitations
       SET status = 'ACTIVATED'
       WHERE id = $1`,
      [invite.id]
    );

    await db.query(
      `INSERT INTO activity_logs (organisation_id, user_id, action_type, description)
       VALUES ($1, $2, 'MANAGER_ACTIVATED', $3)`,
      [
        invite.organisation_id,
        userId,
        `Campaign Manager ${fName} ${lName} activated account via invitation link.`,
      ]
    );

    return res.json({
      message: 'You are good to go! Your Campaign Manager account has been activated successfully.',
      email: cleanEmail,
    });
  } catch (err) {
    console.error('Error activating manager account:', err);
    return res.status(500).json({ error: 'Failed to activate account.' });
  }
});

// All following routes require authentication
router.use(authMiddleware.authenticate);

function isAdmin(user) {
  return user.roles && user.roles.includes('ADMIN');
}

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

// ── 1. GET /api/members/stats ──
// Summary counts for Administrator & Campaign Manager Dashboards
router.get('/stats', async (req, res) => {
  try {
    const orgId = req.user.organisationId;
    const userId = req.user.userId;

    const managersCountRes = await db.query(
      `SELECT COUNT(*) FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       WHERE u.organisation_id = $1 AND ur.role = 'CAMPAIGN_MANAGER'`,
      [orgId]
    );

    const activeManagersCountRes = await db.query(
      `SELECT COUNT(*) FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       WHERE u.organisation_id = $1 AND ur.role = 'CAMPAIGN_MANAGER' AND COALESCE(u.account_status, 'ACTIVE') = 'ACTIVE'`,
      [orgId]
    );

    const pendingInvitesRes = await db.query(
      `SELECT COUNT(*) FROM manager_invitations
       WHERE organisation_id = $1 AND status = 'PENDING' AND expires_at > $2`,
      [orgId, new Date()]
    );

    const totalStakeholdersRes = await db.query(
      `SELECT COUNT(*) FROM stakeholders WHERE organisation_id = $1`,
      [orgId]
    );

    const activeStakeholdersRes = await db.query(
      `SELECT COUNT(*) FROM stakeholders WHERE organisation_id = $1 AND is_active = true`,
      [orgId]
    );

    const totalCampaignsRes = await db.query(
      `SELECT COUNT(*) FROM campaigns WHERE organisation_id = $1 AND status != 'DELETED'`,
      [orgId]
    );

    const activeCampaignsRes = await db.query(
      `SELECT COUNT(*) FROM campaigns WHERE organisation_id = $1 AND status = 'OPEN'`,
      [orgId]
    );

    const completedCampaignsRes = await db.query(
      `SELECT COUNT(*) FROM campaigns WHERE organisation_id = $1 AND status = 'CLOSED'`,
      [orgId]
    );

    const draftCampaignsRes = await db.query(
      `SELECT COUNT(*) FROM campaigns WHERE organisation_id = $1 AND status = 'DRAFT'`,
      [orgId]
    );

    const deletedCampaignsRes = await db.query(
      `SELECT COUNT(*) FROM campaigns WHERE organisation_id = $1 AND status = 'DELETED'`,
      [orgId]
    );

    const totalFeedbackRes = await db.query(
      `SELECT COUNT(*) FROM comments cm
       JOIN campaigns c ON cm.campaign_id = c.id
       WHERE c.organisation_id = $1 AND c.status != 'DELETED'`,
      [orgId]
    );

    // Manager-specific stats
    const myCampaignsRes = await db.query(
      `SELECT status FROM campaigns WHERE organisation_id = $1 AND created_by = $2 AND status != 'DELETED'`,
      [orgId, userId]
    );
    const myRows = myCampaignsRes.rows;

    const myFeedbackRes = await db.query(
      `SELECT COUNT(*) FROM comments cm
       JOIN campaigns c ON cm.campaign_id = c.id
       WHERE c.organisation_id = $1 AND c.created_by = $2 AND c.status != 'DELETED'`,
      [orgId, userId]
    );

    return res.json({
      stats: {
        totalManagers: parseInt(managersCountRes.rows[0]?.count || '0', 10),
        totalCampaignManagers: parseInt(managersCountRes.rows[0]?.count || '0', 10),
        activeManagers: parseInt(activeManagersCountRes.rows[0]?.count || '0', 10),
        pendingInvites: parseInt(pendingInvitesRes.rows[0]?.count || '0', 10),
        totalStakeholders: parseInt(totalStakeholdersRes.rows[0]?.count || '0', 10),
        activeStakeholders: parseInt(activeStakeholdersRes.rows[0]?.count || '0', 10),
        inactiveStakeholders:
          parseInt(totalStakeholdersRes.rows[0]?.count || '0', 10) -
          parseInt(activeStakeholdersRes.rows[0]?.count || '0', 10),
        totalCampaigns: parseInt(totalCampaignsRes.rows[0]?.count || '0', 10),
        activeCampaigns: parseInt(activeCampaignsRes.rows[0]?.count || '0', 10),
        completedCampaigns: parseInt(completedCampaignsRes.rows[0]?.count || '0', 10),
        draftCampaigns: parseInt(draftCampaignsRes.rows[0]?.count || '0', 10),
        deletedCampaigns: parseInt(deletedCampaignsRes.rows[0]?.count || '0', 10),
        totalFeedback: parseInt(totalFeedbackRes.rows[0]?.count || '0', 10),
        totalFeedbackSubmissions: parseInt(totalFeedbackRes.rows[0]?.count || '0', 10),
        myTotalCampaigns: myRows.length,
        myActiveCampaigns: myRows.filter(r => r.status === 'OPEN').length,
        myCompletedCampaigns: myRows.filter(r => r.status === 'CLOSED').length,
        myDraftCampaigns: myRows.filter(r => r.status === 'DRAFT').length,
        myFeedbackSubmissions: parseInt(myFeedbackRes.rows[0]?.count || '0', 10),
      },
      myStats: {
        totalCampaigns: myRows.length,
        activeCampaigns: myRows.filter(r => r.status === 'OPEN').length,
        completedCampaigns: myRows.filter(r => r.status === 'CLOSED').length,
        draftCampaigns: myRows.filter(r => r.status === 'DRAFT').length,
        totalFeedback: parseInt(myFeedbackRes.rows[0]?.count || '0', 10),
      },
    });
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
    return res.status(500).json({ error: 'Failed to fetch dashboard statistics.' });
  }
});

// ── 2. GET /api/members/activity ──
// Recent activity logs from database
router.get('/activity', async (req, res) => {
  try {
    const orgId = req.user.organisationId;
    const activityRes = await db.query(
      `SELECT a.id, a.action_type, a.description, a.created_at,
              u.first_name, u.last_name, u.email
       FROM activity_logs a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.organisation_id = $1
       ORDER BY a.created_at DESC
       LIMIT 15`,
      [orgId]
    );

    return res.json({
      activities: activityRes.rows.map(row => ({
        id: row.id,
        actionType: row.action_type,
        description: row.description,
        createdAt: row.created_at,
        actorName: row.first_name ? `${row.first_name} ${row.last_name}` : 'System',
        actorEmail: row.email || '',
      })),
    });
  } catch (err) {
    console.error('Error fetching activity logs:', err);
    return res.status(500).json({ error: 'Failed to fetch recent activity.' });
  }
});

// ── 3. GET /api/members ──
// Admin gets full managers + stakeholders; Campaign Manager gets active stakeholders for directory selection
router.get('/', async (req, res) => {
  try {
    const orgId = req.user.organisationId;
    const userIsAdmin = isAdmin(req.user);

    let managersList = [];

    if (userIsAdmin) {
      // Registered campaign managers
      const activeManagersRes = await db.query(
        `SELECT u.id, u.first_name, u.last_name, u.email, u.phone,
                u.department, u.designation, u.account_status, u.created_at
         FROM users u
         JOIN user_roles ur ON u.id = ur.user_id
         WHERE u.organisation_id = $1 AND ur.role = 'CAMPAIGN_MANAGER'
         ORDER BY u.created_at DESC`,
        [orgId]
      );

      // Count campaigns created by each manager
      const managersWithCounts = [];
      for (const m of activeManagersRes.rows) {
        const cCount = await db.query(
          `SELECT COUNT(*) FROM campaigns WHERE organisation_id = $1 AND created_by = $2 AND status != 'DELETED'`,
          [orgId, m.id]
        );
        const acctStatus = (m.account_status || 'ACTIVE').toUpperCase();
        const cCountInt = parseInt(cCount.rows[0]?.count || '0', 10);
        managersWithCounts.push({
          ...m,
          full_name: `${m.first_name} ${m.last_name}`.trim(),
          department: m.department || 'General',
          designation: m.designation || 'Campaign Manager',
          account_status: acctStatus,
          status: acctStatus === 'ACTIVE' ? 'active' : 'inactive',
          type: 'active',
          campaigns_count: cCountInt,
          campaigns_created_count: cCountInt,
          hasParticipated: cCountInt > 0,
          canDelete: cCountInt === 0,
        });
      }

      // Pending manager invitations
      const pendingInvitesRes = await db.query(
        `SELECT id, first_name, last_name, email, phone, department, designation, status, token, expires_at, created_at
         FROM manager_invitations
         WHERE organisation_id = $1 AND status = 'PENDING' AND expires_at > $2
         ORDER BY created_at DESC`,
        [orgId, new Date()]
      );

      managersList = [
        ...managersWithCounts,
        ...pendingInvitesRes.rows.map(i => ({
          ...i,
          id: null,
          invitation_id: i.id,
          token: i.token,
          full_name: `${i.first_name} ${i.last_name}`.trim(),
          department: i.department || 'General',
          designation: i.designation || 'Invited Manager',
          account_status: 'INVITED',
          type: 'invited',
          status: 'pending_invite',
          campaigns_count: 0,
          campaigns_created_count: 0,
          hasParticipated: false,
          canDelete: true,
        })),
      ];
    }

    // Stakeholders query (Admin sees all with participation counts; Manager sees only active)
    const shQuery = userIsAdmin
      ? `SELECT s.id, s.first_name, s.last_name, s.email, s.alternate_email, s.contact,
                s.department, s.designation, s.category, s.employee_id, s.notes, s.is_active, s.status, s.created_at, s.updated_at,
                (SELECT COUNT(*) FROM campaign_participants cp WHERE cp.stakeholder_id = s.id) as campaign_count,
                (SELECT COUNT(*) FROM comments c WHERE c.stakeholder_id = s.id) as comment_count
         FROM stakeholders s
         WHERE s.organisation_id = $1
         ORDER BY s.created_at DESC`
      : `SELECT s.id, s.first_name, s.last_name, s.email, s.alternate_email, s.contact,
                s.department, s.designation, s.category, s.employee_id, s.notes, s.is_active, s.status, s.created_at, s.updated_at,
                (SELECT COUNT(*) FROM campaign_participants cp WHERE cp.stakeholder_id = s.id) as campaign_count,
                (SELECT COUNT(*) FROM comments c WHERE c.stakeholder_id = s.id) as comment_count
         FROM stakeholders s
         WHERE s.organisation_id = $1 AND s.is_active = true
         ORDER BY s.first_name ASC`;

    const stakeholdersRes = await db.query(shQuery, [orgId]);

    const stakeholders = stakeholdersRes.rows.map(s => {
      const normalizedStatus = s.status
        ? s.status.toLowerCase()
        : s.is_active
        ? 'active'
        : 'inactive';
      const campaignCount = parseInt(s.campaign_count || '0', 10);
      const commentCount = parseInt(s.comment_count || '0', 10);
      const hasParticipated = (campaignCount > 0 || commentCount > 0);
      return {
        ...s,
        full_name: `${s.first_name} ${s.last_name}`.trim(),
        department: s.department || 'General',
        designation: s.designation || 'Member',
        category: s.category || 'Employee',
        status: normalizedStatus,
        campaign_count: campaignCount,
        comment_count: commentCount,
        hasParticipated,
        canDelete: (normalizedStatus === 'not_registered' || !hasParticipated),
      };
    });

    return res.json({
      managers: managersList,
      stakeholders,
    });
  } catch (err) {
    console.error('Error fetching members:', err);
    return res.status(500).json({ error: 'Failed to fetch organisation members.' });
  }
});

// ── 4. GET /api/members/stakeholders ──
// Searchable and filterable central stakeholder directory
router.get('/stakeholders', async (req, res) => {
  try {
    const orgId = req.user.organisationId;
    const userIsAdmin = isAdmin(req.user);
    const { search = '', department = '', designation = '', category = '', status = 'all' } = req.query;

    // Discard unverified / unregistered stakeholder records older than 4 days
    await db.query(
      `DELETE FROM stakeholders
       WHERE organisation_id = $1
         AND is_active = false
         AND (status = 'NOT_REGISTERED' OR status = 'INACTIVE')
         AND created_at < CURRENT_TIMESTAMP - INTERVAL '4 days'`,
      [orgId]
    );

    const allRes = await db.query(
      `SELECT s.id, s.first_name, s.last_name, s.email, s.alternate_email, s.contact,
              s.department, s.designation, s.category, s.employee_id, s.notes, s.is_active, s.status, s.created_at, s.updated_at,
              (SELECT COUNT(*) FROM campaign_participants cp WHERE cp.stakeholder_id = s.id) as campaign_count,
              (SELECT COUNT(*) FROM comments c WHERE c.stakeholder_id = s.id) as comment_count
       FROM stakeholders s
       WHERE s.organisation_id = $1
       ORDER BY s.first_name ASC`,
      [orgId]
    );

    const rawRows = allRes.rows.map(s => {
      const normalizedStatus = s.status
        ? s.status.toLowerCase()
        : s.is_active
        ? 'active'
        : 'inactive';
      const campaignCount = parseInt(s.campaign_count || '0', 10);
      const commentCount = parseInt(s.comment_count || '0', 10);
      const hasParticipated = (campaignCount > 0 || commentCount > 0);
      return {
        ...s,
        full_name: `${s.first_name} ${s.last_name}`.trim(),
        department: s.department || 'General',
        designation: s.designation || 'Member',
        category: s.category || 'Employee',
        status: normalizedStatus,
        campaign_count: campaignCount,
        comment_count: commentCount,
        hasParticipated,
        canDelete: (normalizedStatus === 'not_registered' || !hasParticipated),
      };
    });

    // Extract distinct metadata for filter dropdowns and quick-cohort chips
    const departments = Array.from(new Set(rawRows.map(r => r.department).filter(Boolean))).sort();
    const designations = Array.from(new Set(rawRows.map(r => r.designation).filter(Boolean))).sort();
    const categories = Array.from(new Set(rawRows.map(r => r.category).filter(Boolean))).sort();

    // Filter rows
    const filtered = rawRows.filter(s => {
      // Non-admin managers can ONLY view active stakeholders
      if (!userIsAdmin && !s.is_active) return false;

      if (status === 'active' && s.status !== 'active') return false;
      if ((status === 'inactive' || status === 'removed') && s.status !== 'inactive') return false;
      if (status === 'not_registered' && s.status !== 'not_registered') return false;

      if (department && department !== 'ALL' && s.department.toLowerCase() !== department.toLowerCase()) {
        return false;
      }
      if (designation && designation !== 'ALL' && s.designation.toLowerCase() !== designation.toLowerCase()) {
        return false;
      }
      if (category && category !== 'ALL' && s.category.toLowerCase() !== category.toLowerCase()) {
        return false;
      }

      if (search && search.trim()) {
        const q = search.toLowerCase().trim();
        const matchName = s.full_name.toLowerCase().includes(q);
        const matchEmail = s.email.toLowerCase().includes(q);
        const matchAlt = (s.alternate_email || '').toLowerCase().includes(q);
        const matchEmpId = (s.employee_id || '').toLowerCase().includes(q);
        const matchDept = s.department.toLowerCase().includes(q);
        return matchName || matchEmail || matchAlt || matchEmpId || matchDept;
      }

      return true;
    });

    return res.json({
      stakeholders: filtered,
      filters: {
        departments,
        designations,
        categories,
      },
    });
  } catch (err) {
    console.error('Error querying stakeholder directory:', err);
    return res.status(500).json({ error: 'Failed to load stakeholder directory.' });
  }
});

// ── 5. POST /api/members/managers (ADMIN ONLY) ──
router.post('/managers', authMiddleware.requireRole('ADMIN'), async (req, res) => {
  try {
    const { fullName, firstName, lastName, email, phone, department, designation } = req.body;
    const orgId = req.user.organisationId;

    const { firstName: fName, lastName: lName } = parseNameFields({ fullName, firstName, lastName });

    if (!fName || !email) {
      return res.status(400).json({ error: 'Name and official email address are required.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Please provide a valid official email address.' });
    }

    const cleanDept = (department || '').trim();
    if (!cleanDept) {
      return res.status(400).json({ error: 'Department is required.' });
    }

    const cleanDesig = (designation || '').trim();
    if (!cleanDesig) {
      return res.status(400).json({ error: 'Designation is required and cannot be empty.' });
    }

    const cleanPhone = (phone || '').toString().trim().replace(/[^0-9]/g, '');
    if (!cleanPhone || !/^[0-9]{10}$/.test(cleanPhone)) {
      return res.status(400).json({ error: 'Contact number is required and must be exactly 10 digits (numbers only).' });
    }

    // Fetch org details for email and code
    const orgRes = await db.query('SELECT name, org_code, domain FROM organisations WHERE id = $1', [orgId]);
    const org = orgRes.rows[0];

    // Validate email domain: If referencing organisation name, must match official domain
    const domainCheck = validateOrgEmailDomain(cleanEmail, org?.domain, org?.name);
    if (!domainCheck.valid) {
      return res.status(400).json({ error: domainCheck.error });
    }

    // Check if email already belongs to an existing user in this org
    const existingUser = await db.query(
      'SELECT id FROM users WHERE organisation_id = $1 AND LOWER(email) = $2',
      [orgId, cleanEmail]
    );

    if (existingUser.rows.length > 0) {
      const existingUserId = existingUser.rows[0].id;

      // Strict Institutional Separation Rule: An Administrator cannot take the role of Campaign Manager
      const hasAdminRole = await db.query(
        `SELECT id FROM user_roles WHERE user_id = $1 AND role = 'ADMIN'`,
        [existingUserId]
      );
      if (hasAdminRole.rows.length > 0) {
        return res.status(400).json({
          error: 'An Administrator cannot take the role of Campaign Manager. Please invite a dedicated Campaign Manager account.',
        });
      }

      // Check if already has CAMPAIGN_MANAGER role
      const hasRole = await db.query(
        `SELECT id FROM user_roles WHERE user_id = $1 AND role = 'CAMPAIGN_MANAGER'`,
        [existingUserId]
      );

      if (hasRole.rows.length > 0) {
        return res.status(409).json({ error: 'This user is already a Campaign Manager in this organisation.' });
      }

      // Grant CAMPAIGN_MANAGER role directly (never ADMIN)
      await db.query(
        `INSERT INTO user_roles (user_id, role) VALUES ($1, 'CAMPAIGN_MANAGER')`,
        [existingUserId]
      );

      await logActivity(
        orgId,
        req.user.userId,
        'MANAGER_ADDED',
        `Campaign Manager role granted directly to ${fName} ${lName} (${cleanEmail}).`
      );

      return res.status(201).json({
        message: 'Campaign Manager role granted directly to the existing organisation user.',
        isDirect: true,
      });
    }

    // Check if an unexpired pending invitation already exists
    const existingInvite = await db.query(
      `SELECT id FROM manager_invitations
       WHERE organisation_id = $1 AND LOWER(email) = $2 AND status = 'PENDING' AND expires_at > $3`,
      [orgId, cleanEmail, new Date()]
    );

    if (existingInvite.rows.length > 0) {
      return res.status(409).json({ error: 'A pending invitation already exists for this email.' });
    }

    // Generate unique invitation token & expiry (7 days)
    const token = cryptoUtils.generateInvitationToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const inviteRes = await db.query(
      `INSERT INTO manager_invitations (
         organisation_id, first_name, last_name, email, phone,
         department, designation, status, invited_by, expires_at, token
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', $8, $9, $10) RETURNING id`,
      [
        orgId,
        fName,
        lName,
        cleanEmail,
        cleanPhone,
        cleanDept,
        cleanDesig,
        req.user.userId,
        expiresAt,
        token,
      ]
    );

    // Fetch administrator name for invitation email
    const adminUserRes = await db.query('SELECT first_name, last_name FROM users WHERE id = $1', [req.user.userId]);
    const adminName = adminUserRes.rows[0]
      ? `${adminUserRes.rows[0].first_name} ${adminUserRes.rows[0].last_name || ''}`.trim()
      : 'your administrator';

    const activationUrl = `http://localhost:5173/activate-manager?token=${token}`;

    // Send invitation email in background (with org code, activation link, and instructions)
    emailUtils.sendEmail({
      to: cleanEmail,
      firstName: fName,
      template: 'MANAGER_INVITE',
      data: {
        orgName: org.name,
        orgCode: org.org_code,
        adminName,
        token,
        activationUrl,
        verifyUrl: activationUrl,
        expiryDate: expiresAt.toLocaleDateString(),
      },
    });

    await logActivity(
      orgId,
      req.user.userId,
      'MANAGER_ADDED',
      `Campaign Manager invitation sent to ${fName} ${lName} (${cleanEmail}, ${cleanDept}, ${cleanDesig}).`
    );

    return res.status(201).json({
      message: `Invitation successfully sent to ${cleanEmail}.`,
      invitationId: inviteRes.rows[0].id,
      token,
      isDirect: false,
    });
  } catch (err) {
    console.error('Error inviting manager:', err);
    return res.status(500).json({ error: 'Failed to invite campaign manager.' });
  }
});

// ── 5B. POST /api/members/managers/bulk (ADMIN ONLY) ──
// Bulk CSV Import for Campaign Managers with full validation and invitation links
router.post('/managers/bulk', authMiddleware.requireRole('ADMIN'), async (req, res) => {
  try {
    const { managers = [] } = req.body;
    const orgId = req.user.organisationId;

    if (!Array.isArray(managers) || managers.length === 0) {
      return res.status(400).json({ error: 'No campaign manager records provided for bulk import.' });
    }

    const orgRes = await db.query('SELECT name, org_code, domain FROM organisations WHERE id = $1', [orgId]);
    const orgName = orgRes.rows[0]?.name || 'your organisation';
    const orgCode = orgRes.rows[0]?.org_code || '';
    const orgDomain = orgRes.rows[0]?.domain || '';

    const adminUserRes = await db.query('SELECT first_name, last_name FROM users WHERE id = $1', [req.user.userId]);
    const adminName = adminUserRes.rows[0]
      ? `${adminUserRes.rows[0].first_name} ${adminUserRes.rows[0].last_name || ''}`.trim()
      : 'your administrator';

    let importedCount = 0;
    let skippedCount = 0;
    const errors = [];

    for (let i = 0; i < managers.length; i++) {
      const m = managers[i];
      const rowNum = i + 1;
      const { firstName: fName, lastName: lName } = parseNameFields({
        fullName: m.fullName || m.name,
        firstName: m.firstName,
        lastName: m.lastName,
      });
      const cleanEmail = (m.email || m.officialEmail || '').toLowerCase().trim();
      const cleanDept = (m.department || 'General').trim();
      const cleanDesig = (m.designation || '').trim();
      const cleanPhone = (m.phone || m.contact || m.contactNumber || '').toString().trim().replace(/[^0-9]/g, '');

      if (!fName || !cleanEmail) {
        skippedCount++;
        errors.push(`Row ${rowNum}: Full name and email address are required.`);
        continue;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        skippedCount++;
        errors.push(`Row ${rowNum} (${cleanEmail}): Invalid email format.`);
        continue;
      }

      const domainCheck = validateOrgEmailDomain(cleanEmail, orgDomain, orgName);
      if (!domainCheck.valid) {
        skippedCount++;
        errors.push(`Row ${rowNum} (${cleanEmail}): ${domainCheck.error}`);
        continue;
      }

      if (!cleanDesig) {
        skippedCount++;
        errors.push(`Row ${rowNum} (${cleanEmail}): Designation is required and cannot be empty.`);
        continue;
      }

      if (!cleanPhone || !/^[0-9]{10}$/.test(cleanPhone)) {
        skippedCount++;
        errors.push(`Row ${rowNum} (${cleanEmail}): Contact number must be exactly 10 digits (numbers only).`);
        continue;
      }

      // Check if user already exists in this org
      const userExists = await db.query(
        'SELECT id FROM users WHERE organisation_id = $1 AND LOWER(email) = $2',
        [orgId, cleanEmail]
      );
      if (userExists.rows.length > 0) {
        skippedCount++;
        errors.push(`Row ${rowNum} (${cleanEmail}): Account already exists in organisation.`);
        continue;
      }

      // Check if unexpired invitation exists
      const inviteExists = await db.query(
        `SELECT id FROM manager_invitations WHERE organisation_id = $1 AND LOWER(email) = $2 AND status = 'PENDING' AND expires_at > $3`,
        [orgId, cleanEmail, new Date()]
      );
      if (inviteExists.rows.length > 0) {
        skippedCount++;
        errors.push(`Row ${rowNum} (${cleanEmail}): An active pending invitation already exists.`);
        continue;
      }

      const token = cryptoUtils.generateInvitationToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await db.query(
        `INSERT INTO manager_invitations (
           organisation_id, first_name, last_name, email, phone,
           department, designation, status, invited_by, expires_at, token
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', $8, $9, $10)`,
        [
          orgId,
          fName,
          lName,
          cleanEmail,
          cleanPhone,
          cleanDept,
          cleanDesig,
          req.user.userId,
          expiresAt,
          token,
        ]
      );

      const activationUrl = `http://localhost:5173/activate-manager?token=${token}`;
      emailUtils.sendEmail({
        to: cleanEmail,
        firstName: fName,
        template: 'MANAGER_INVITE',
        data: {
          orgName,
          orgCode,
          adminName,
          token,
          activationUrl,
          verifyUrl: activationUrl,
          expiryDate: expiresAt.toLocaleDateString(),
        },
      });

      importedCount++;
    }

    if (importedCount > 0) {
      await logActivity(
        orgId,
        req.user.userId,
        'MANAGER_ADDED',
        `Bulk CSV import completed: ${importedCount} Campaign Managers invited.`
      );
    }

    return res.status(201).json({
      message: `Successfully imported and invited ${importedCount} Campaign Manager${importedCount === 1 ? '' : 's'}${skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}.`,
      importedCount,
      skippedCount,
      errors,
    });
  } catch (err) {
    console.error('Error in bulk manager import:', err);
    return res.status(500).json({ error: 'Bulk manager import failed.' });
  }
});

// ── 6. PUT /api/members/managers/:id (ADMIN ONLY) ──
// Edit Campaign Manager details (Name, Email, Department, Designation, Phone)
router.put('/managers/:id', authMiddleware.requireRole('ADMIN'), async (req, res) => {
  try {
    const managerId = parseInt(req.params.id, 10);
    const orgId = req.user.organisationId;
    const { fullName, firstName, lastName, email, department, designation, phone } = req.body;

    const { firstName: fName, lastName: lName } = parseNameFields({ fullName, firstName, lastName });
    if (!fName || !email) {
      return res.status(400).json({ error: 'Name and official email are required.' });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Verify manager belongs to this org
    const checkRes = await db.query(
      `SELECT u.id FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       WHERE u.id = $1 AND u.organisation_id = $2 AND ur.role = 'CAMPAIGN_MANAGER'`,
      [managerId, orgId]
    );

    if (checkRes.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign Manager not found.' });
    }

    // Check duplicate email against other users in this org
    const dupRes = await db.query(
      'SELECT id FROM users WHERE organisation_id = $1 AND LOWER(email) = $2 AND id != $3',
      [orgId, cleanEmail, managerId]
    );

    if (dupRes.rows.length > 0) {
      return res.status(409).json({ error: 'Another user in this organisation already uses this email.' });
    }

    await db.query(
      `UPDATE users
       SET first_name = $1, last_name = $2, email = $3, department = $4, designation = $5, phone = $6, updated_at = CURRENT_TIMESTAMP
       WHERE id = $7`,
      [
        fName,
        lName,
        cleanEmail,
        (department || 'General').trim(),
        (designation || 'Campaign Manager').trim(),
        (phone || '').trim(),
        managerId,
      ]
    );

    await logActivity(
      orgId,
      req.user.userId,
      'MANAGER_UPDATED',
      `Campaign Manager ${fName} ${lName} (${cleanEmail}) details updated.`
    );

    return res.json({ message: 'Campaign Manager details updated successfully.' });
  } catch (err) {
    console.error('Error updating manager:', err);
    return res.status(500).json({ error: 'Failed to update Campaign Manager details.' });
  }
});

// ── 7. PATCH /api/members/managers/:id/status (ADMIN ONLY) ──
// Activate or Deactivate Campaign Manager (preserving existing campaigns and feedback)
router.patch('/managers/:id/status', authMiddleware.requireRole('ADMIN'), async (req, res) => {
  try {
    const managerId = parseInt(req.params.id, 10);
    const orgId = req.user.organisationId;
    const { status } = req.body; // 'ACTIVE' | 'INACTIVE'

    const checkRes = await db.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.account_status
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       WHERE u.id = $1 AND u.organisation_id = $2 AND ur.role = 'CAMPAIGN_MANAGER'`,
      [managerId, orgId]
    );

    if (checkRes.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign Manager not found.' });
    }

    const mgr = checkRes.rows[0];
    const currentStatus = (mgr.account_status || 'ACTIVE').toUpperCase();
    const nextStatus = status
      ? status.toUpperCase()
      : currentStatus === 'ACTIVE'
      ? 'INACTIVE'
      : 'ACTIVE';

    await db.query(
      `UPDATE users SET account_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [nextStatus, managerId]
    );

    await logActivity(
      orgId,
      req.user.userId,
      'MANAGER_UPDATED',
      `Campaign Manager ${mgr.first_name} ${mgr.last_name} account ${nextStatus === 'ACTIVE' ? 'activated' : 'deactivated'}.`
    );

    return res.json({
      message: `Campaign Manager account is now ${nextStatus}. Existing campaigns and feedback remain preserved.`,
      accountStatus: nextStatus,
    });
  } catch (err) {
    console.error('Error toggling manager status:', err);
    return res.status(500).json({ error: 'Failed to update manager account status.' });
  }
});

// ── 7B. DELETE /api/members/managers/invitations/:id (ADMIN ONLY) ──
// Revoke and delete a pending campaign manager invitation
router.delete('/managers/invitations/:id', authMiddleware.requireRole('ADMIN'), async (req, res) => {
  try {
    const rawId = req.params.id;
    const isNumeric = /^\d+$/.test(rawId);
    const inviteId = isNumeric ? parseInt(rawId, 10) : -1;
    const emailTarget = isNumeric ? (req.query.email || '').toLowerCase().trim() : rawId.toLowerCase().trim();
    const orgId = req.user.organisationId;

    const checkRes = await db.query(
      `SELECT id, first_name, last_name, email
       FROM manager_invitations
       WHERE (id = $1 OR LOWER(email) = $2) AND organisation_id = $3 AND status = 'PENDING'`,
      [inviteId, emailTarget, orgId]
    );

    if (checkRes.rows.length === 0) {
      return res.status(404).json({ error: 'Pending invitation not found or already activated.' });
    }

    const invite = checkRes.rows[0];

    await db.query('DELETE FROM manager_invitations WHERE id = $1', [invite.id]);

    await logActivity(
      orgId,
      req.user.userId,
      'MANAGER_INVITATION_REVOKED',
      `Invitation for ${invite.first_name} ${invite.last_name} (${invite.email}) was cancelled and removed.`
    );

    return res.json({
      message: `Invitation for ${invite.first_name} ${invite.last_name} has been revoked and removed.`,
    });
  } catch (err) {
    console.error('Error revoking manager invitation:', err);
    return res.status(500).json({ error: 'Failed to revoke invitation.' });
  }
});

// ── 7C. POST /api/members/managers/invitations/:id/resend (ADMIN ONLY) ──
// Resend activation email with valid link
router.post('/managers/invitations/:id/resend', authMiddleware.requireRole('ADMIN'), async (req, res) => {
  try {
    const rawId = req.params.id;
    const bodyEmail = (req.body?.email || '').toLowerCase().trim();
    const isNumeric = /^\d+$/.test(rawId);
    const inviteId = isNumeric ? parseInt(rawId, 10) : -1;
    const emailTarget = bodyEmail || (isNumeric ? '' : rawId.toLowerCase().trim());
    const orgId = req.user.organisationId;

    const checkRes = await db.query(
      `SELECT mi.*, o.name as org_name, o.org_code, u.first_name as admin_fname, u.last_name as admin_lname
       FROM manager_invitations mi
       JOIN organisations o ON mi.organisation_id = o.id
       LEFT JOIN users u ON u.id = mi.invited_by
       WHERE (mi.id = $1 OR LOWER(mi.email) = $2 OR LOWER(mi.email) = $3) AND mi.organisation_id = $4`,
      [inviteId, emailTarget, bodyEmail, orgId]
    );

    if (checkRes.rows.length === 0) {
      return res.status(404).json({ error: 'Pending invitation record not found for this manager in your organisation.' });
    }

    const inv = checkRes.rows[0];

    if (inv.status === 'ACTIVATED') {
      return res.status(400).json({ error: `Manager ${inv.first_name} ${inv.last_name} has already activated their account.` });
    }

    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const token = inv.token || cryptoUtils.generateInvitationToken();

    await db.query(
      `UPDATE manager_invitations SET token = $1, expires_at = $2, status = 'PENDING' WHERE id = $3`,
      [token, newExpiresAt, inv.id]
    );

    const activationUrl = `http://localhost:5173/register/manager?token=${token}`;
    const adminName = inv.admin_fname ? `${inv.admin_fname} ${inv.admin_lname || ''}`.trim() : 'Administrator';

    // Await sendEmail so it is written to dev_emails before sending response
    await emailUtils.sendEmail({
      to: inv.email,
      firstName: inv.first_name,
      template: 'MANAGER_INVITE',
      data: {
        orgName: inv.org_name,
        orgCode: inv.org_code,
        adminName,
        token,
        activationUrl,
        verifyUrl: activationUrl,
        expiryDate: newExpiresAt.toLocaleDateString(),
      },
    });

    return res.json({
      message: `Activation invitation re-sent to ${inv.email}. Check PotentMail outbox to view it.`,
      token,
      activationUrl,
    });
  } catch (err) {
    console.error('Error resending manager invitation:', err);
    return res.status(500).json({ error: 'Failed to resend invitation.' });
  }
});

// ── 7D. DELETE /api/members/managers/:id (ADMIN ONLY) ──
// Delete or permanently retire an activated Campaign Manager
router.delete('/managers/:id', authMiddleware.requireRole('ADMIN'), async (req, res) => {
  try {
    const managerId = parseInt(req.params.id, 10);
    const orgId = req.user.organisationId;

    if (managerId === req.user.userId) {
      return res.status(400).json({ error: 'You cannot delete your own administrative account.' });
    }

    const checkRes = await db.query(
      `SELECT u.id, u.first_name, u.last_name, u.email
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       WHERE u.id = $1 AND u.organisation_id = $2 AND ur.role = 'CAMPAIGN_MANAGER'`,
      [managerId, orgId]
    );

    if (checkRes.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign Manager not found.' });
    }

    const mgr = checkRes.rows[0];

    // Check if manager has created campaigns
    const campaignsRes = await db.query(
      `SELECT id, status FROM campaigns WHERE created_by = $1 AND organisation_id = $2`,
      [managerId, orgId]
    );

    if (campaignsRes.rows.length > 0) {
      // Manager has created consultations; deactivate instead of hard delete to preserve historical integrity
      await db.query(
        `UPDATE users SET account_status = 'INACTIVE', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [managerId]
      );

      await logActivity(
        orgId,
        req.user.userId,
        'MANAGER_DEACTIVATED',
        `Campaign Manager ${mgr.first_name} ${mgr.last_name} (${mgr.email}) was deactivated (historical campaigns preserved).`
      );

      return res.json({
        message: `Manager has ${campaignsRes.rows.length} recorded campaign(s). Account has been deactivated to preserve audit integrity.`,
        deactivated: true
      });
    }

    // No campaigns associated; safe to clean up
    await db.query(`DELETE FROM user_roles WHERE user_id = $1`, [managerId]);
    await db.query(`DELETE FROM users WHERE id = $1`, [managerId]);

    await logActivity(
      orgId,
      req.user.userId,
      'MANAGER_DELETED',
      `Campaign Manager ${mgr.first_name} ${mgr.last_name} (${mgr.email}) was removed from organisation.`
    );

    return res.json({
      message: `Campaign Manager ${mgr.first_name} ${mgr.last_name} deleted successfully.`,
      deleted: true
    });
  } catch (err) {
    console.error('Error deleting manager:', err);
    return res.status(500).json({ error: 'Failed to delete manager.' });
  }
});

// ── 8. POST /api/members/stakeholders (ADMIN ONLY) ──
// Add single stakeholder to Central Directory (defaults to NOT_REGISTERED until email verification)
router.post('/stakeholders', authMiddleware.requireRole('ADMIN'), async (req, res) => {
  try {
    const {
      fullName,
      firstName,
      lastName,
      email,
      alternateEmail = '',
      contact = '',
      department = 'General',
      designation = '',
      category = 'Employee',
      employeeId = '',
      notes = '',
    } = req.body;
    const orgId = req.user.organisationId;

    const { firstName: fName, lastName: lName } = parseNameFields({ fullName, firstName, lastName });

    if (!fName || !email) {
      return res.status(400).json({ error: 'Name and official work email are required.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanAltEmail = alternateEmail ? alternateEmail.toLowerCase().trim() : null;
    const cleanDept = (department || 'General').trim();
    const cleanDesig = (designation || 'Member').trim();
    const cleanCategory = (category || 'Employee').trim();

    // Fetch org details (name and org_code) for verification email
    const orgRes = await db.query('SELECT name, org_code, domain FROM organisations WHERE id = $1', [orgId]);
    const orgName = orgRes.rows[0]?.name || 'your organisation';
    const orgCode = orgRes.rows[0]?.org_code || '';
    const orgDomain = orgRes.rows[0]?.domain || '';

    // Validate email domain: If referencing organisation name, must match official domain
    const domainCheck = validateOrgEmailDomain(cleanEmail, orgDomain, orgName);
    if (!domainCheck.valid) {
      return res.status(400).json({ error: domainCheck.error });
    }
    if (cleanAltEmail) {
      const altDomainCheck = validateOrgEmailDomain(cleanAltEmail, orgDomain, orgName);
      if (!altDomainCheck.valid) {
        return res.status(400).json({ error: `Alternate email: ${altDomainCheck.error}` });
      }
    }

    // Fetch administrator name for verification emails
    const adminUserRes = await db.query('SELECT first_name, last_name FROM users WHERE id = $1', [req.user.userId]);
    const adminName = adminUserRes.rows[0]
      ? `${adminUserRes.rows[0].first_name} ${adminUserRes.rows[0].last_name || ''}`.trim()
      : 'your administrator';

    // Check if stakeholder already exists in this org
    const existing = await db.query(
      'SELECT id, is_active, status, employee_id FROM stakeholders WHERE organisation_id = $1 AND LOWER(email) = $2',
      [orgId, cleanEmail]
    );

    if (existing.rows.length > 0) {
      if (existing.rows[0].status === 'ACTIVE' || existing.rows[0].status === 'NOT_REGISTERED') {
        return res.status(409).json({ error: 'A stakeholder with this official email already exists in the directory.' });
      }
      const existingId = existing.rows[0].id;
      const resolvedEmpId = (employeeId || '').trim() || existing.rows[0].employee_id || `SH-${1000 + existingId}`;

      await db.query(
        `UPDATE stakeholders
         SET is_active = false, status = 'NOT_REGISTERED', first_name = $1, last_name = $2, alternate_email = $3,
             contact = $4, department = $5, designation = $6, category = $7,
             employee_id = $8, notes = $9, updated_at = CURRENT_TIMESTAMP
         WHERE id = $10`,
        [
          fName,
          lName,
          cleanAltEmail,
          (contact || '').trim(),
          cleanDept,
          cleanDesig,
          cleanCategory,
          resolvedEmpId,
          (notes || '').trim(),
          existingId,
        ]
      );

      emailUtils.sendEmail({
        to: cleanEmail,
        firstName: fName,
        template: 'STAKEHOLDER_ADDED',
        data: {
          orgName,
          orgCode,
          adminName,
          userId: resolvedEmpId,
          verifyUrl: `http://localhost:5173/verify-stakeholder?userId=${encodeURIComponent(resolvedEmpId)}`,
        },
      });

      await logActivity(
        orgId,
        req.user.userId,
        'STAKEHOLDER_ADDED',
        `Stakeholder ${fName} ${lName} (${cleanDept}) re-enrolled and verification email dispatched.`
      );

      return res.json({ message: 'Stakeholder updated and verification email dispatched.' });
    }

    const insertRes = await db.query(
      `INSERT INTO stakeholders (
         organisation_id, first_name, last_name, email, alternate_email, contact,
         department, designation, category, employee_id, notes, is_active, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false, 'NOT_REGISTERED') RETURNING id`,
      [
        orgId,
        fName,
        lName,
        cleanEmail,
        cleanAltEmail,
        (contact || '').trim(),
        cleanDept,
        cleanDesig,
        cleanCategory,
        (employeeId || '').trim(),
        (notes || '').trim(),
      ]
    );

    const newId = insertRes.rows[0].id;
    const assignedUserId = (employeeId || '').trim() || `SH-${1000 + newId}`;
    if (!employeeId || !employeeId.trim()) {
      await db.query('UPDATE stakeholders SET employee_id = $1 WHERE id = $2', [assignedUserId, newId]);
    }

    // Send confirmation/verification email with User ID, Org Code, and Verification Link
    emailUtils.sendEmail({
      to: cleanEmail,
      firstName: fName,
      template: 'STAKEHOLDER_ADDED',
      data: {
        orgName,
        orgCode,
        adminName,
        userId: assignedUserId,
        verifyUrl: `http://localhost:5173/verify-stakeholder?userId=${encodeURIComponent(assignedUserId)}`,
      },
    });

    await logActivity(
      orgId,
      req.user.userId,
      'STAKEHOLDER_ADDED',
      `Stakeholder ${fName} ${lName} (${cleanDept} · ${cleanCategory}) added (Awaiting Verification).`
    );

    return res.status(201).json({
      message: `Stakeholder added as 'Not Registered'. Verification email sent to ${cleanEmail}.`,
      stakeholder: {
        id: newId,
        firstName: fName,
        lastName: lName,
        full_name: `${fName} ${lName}`.trim(),
        email: cleanEmail,
        alternate_email: cleanAltEmail,
        contact: (contact || '').trim(),
        department: cleanDept,
        designation: cleanDesig,
        category: cleanCategory,
        employee_id: assignedUserId,
        notes: (notes || '').trim(),
        is_active: false,
        status: 'not_registered',
      },
    });
  } catch (err) {
    console.error('Error adding stakeholder:', err);
    return res.status(500).json({ error: 'Failed to add stakeholder.' });
  }
});

// ── 9. POST /api/members/stakeholders/bulk (ADMIN ONLY) ──
// Bulk CSV Import into Central Stakeholder Directory (sends verification mail to each added stakeholder)
router.post('/stakeholders/bulk', authMiddleware.requireRole('ADMIN'), async (req, res) => {
  try {
    const { stakeholders = [] } = req.body;
    const orgId = req.user.organisationId;

    if (!Array.isArray(stakeholders) || stakeholders.length === 0) {
      return res.status(400).json({ error: 'No stakeholder records provided for bulk import.' });
    }

    const orgRes = await db.query('SELECT name, org_code, domain FROM organisations WHERE id = $1', [orgId]);
    const orgName = orgRes.rows[0]?.name || 'your organisation';
    const orgCode = orgRes.rows[0]?.org_code || '';
    const orgDomain = orgRes.rows[0]?.domain || '';

    // Fetch administrator name for verification emails
    const adminUserRes = await db.query('SELECT first_name, last_name FROM users WHERE id = $1', [req.user.userId]);
    const adminName = adminUserRes.rows[0]
      ? `${adminUserRes.rows[0].first_name} ${adminUserRes.rows[0].last_name || ''}`.trim()
      : 'your administrator';

    let importedCount = 0;
    let skippedCount = 0;
    const errors = [];

    for (let i = 0; i < stakeholders.length; i++) {
      const row = stakeholders[i];
      const { firstName: fName, lastName: lName } = parseNameFields({
        fullName: row.fullName || row.name,
        firstName: row.firstName,
        lastName: row.lastName,
      });

      const rawEmail = (row.email || row.officialEmail || '').toLowerCase().trim();
      if (!fName || !rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
        skippedCount++;
        errors.push(`Row ${i + 1}: Missing name or invalid email (${rawEmail || 'empty'}).`);
        continue;
      }

      const domainCheck = validateOrgEmailDomain(rawEmail, orgDomain, orgName);
      if (!domainCheck.valid) {
        skippedCount++;
        errors.push(`Row ${i + 1} (${rawEmail}): ${domainCheck.error}`);
        continue;
      }

      // Check duplicate in org
      const existing = await db.query(
        'SELECT id FROM stakeholders WHERE organisation_id = $1 AND LOWER(email) = $2',
        [orgId, rawEmail]
      );

      if (existing.rows.length > 0) {
        skippedCount++;
        continue;
      }

      const insRes = await db.query(
        `INSERT INTO stakeholders (
           organisation_id, first_name, last_name, email, alternate_email, contact,
           department, designation, category, employee_id, notes, is_active, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false, 'NOT_REGISTERED') RETURNING id`,
        [
          orgId,
          fName,
          lName,
          rawEmail,
          row.alternateEmail ? row.alternateEmail.toLowerCase().trim() : null,
          (row.contact || row.phone || '').trim(),
          (row.department || 'General').trim(),
          (row.designation || 'Member').trim(),
          (row.category || 'Employee').trim(),
          (row.employeeId || '').trim(),
          (row.notes || '').trim(),
        ]
      );

      const newShId = insRes.rows[0].id;
      const assignedUserId = (row.employeeId || '').trim() || `SH-${1000 + newShId}`;
      if (!row.employeeId || !row.employeeId.trim()) {
        await db.query('UPDATE stakeholders SET employee_id = $1 WHERE id = $2', [assignedUserId, newShId]);
      }

      // Dispatch confirmation email for each imported stakeholder
      emailUtils.sendEmail({
        to: rawEmail,
        firstName: fName,
        template: 'STAKEHOLDER_ADDED',
        data: {
          orgName,
          orgCode,
          adminName,
          userId: assignedUserId,
          verifyUrl: `http://localhost:5173/verify-stakeholder?userId=${encodeURIComponent(assignedUserId)}`,
        },
      });

      importedCount++;
    }

    if (importedCount > 0) {
      await logActivity(
        orgId,
        req.user.userId,
        'STAKEHOLDER_ADDED',
        `Bulk CSV import completed: ${importedCount} stakeholders enrolled and verification emails dispatched.`
      );
    }

    return res.status(201).json({
      message: `Successfully imported ${importedCount} stakeholder${importedCount === 1 ? '' : 's'} (verification emails sent)${skippedCount > 0 ? ` (${skippedCount} duplicate/invalid skipped)` : ''}.`,
      importedCount,
      skippedCount,
      summary: {
        addedCount: importedCount,
        skippedCount,
        totalProcessed: stakeholders.length,
      },
      errors,
    });
  } catch (err) {
    console.error('Error in bulk stakeholder import:', err);
    return res.status(500).json({ error: 'Bulk stakeholder import failed.' });
  }
});

// ── 10. PUT /api/members/stakeholders/:id (ADMIN ONLY) ──
// Edit Stakeholder details while preserving participation records
router.put('/stakeholders/:id', authMiddleware.requireRole('ADMIN'), async (req, res) => {
  try {
    const stakeholderId = parseInt(req.params.id, 10);
    const orgId = req.user.organisationId;
    const {
      fullName,
      firstName,
      lastName,
      email,
      alternateEmail = '',
      contact = '',
      department = 'General',
      designation = '',
      category = 'Employee',
      employeeId = '',
      notes = '',
      isActive,
      status: rawStatus,
    } = req.body;

    const { firstName: fName, lastName: lName } = parseNameFields({ fullName, firstName, lastName });
    if (!fName || !email) {
      return res.status(400).json({ error: 'Stakeholder name and official email are required.' });
    }

    const cleanEmail = email.toLowerCase().trim();

    const checkRes = await db.query(
      'SELECT id, is_active, status FROM stakeholders WHERE id = $1 AND organisation_id = $2',
      [stakeholderId, orgId]
    );

    if (checkRes.rows.length === 0) {
      return res.status(404).json({ error: 'Stakeholder not found in directory.' });
    }

    // Check duplicate email against other stakeholders in org
    const dupRes = await db.query(
      'SELECT id FROM stakeholders WHERE organisation_id = $1 AND LOWER(email) = $2 AND id != $3',
      [orgId, cleanEmail, stakeholderId]
    );

    if (dupRes.rows.length > 0) {
      return res.status(409).json({ error: 'Another stakeholder in the directory already uses this official email.' });
    }

    let nextStatus = checkRes.rows[0].status || (checkRes.rows[0].is_active ? 'ACTIVE' : 'INACTIVE');
    let nextActive = checkRes.rows[0].is_active;

    if (rawStatus) {
      const upper = rawStatus.toUpperCase().replace(/\s+/g, '_');
      if (upper === 'ACTIVE') {
        nextStatus = 'ACTIVE';
        nextActive = true;
      } else if (upper === 'INACTIVE') {
        nextStatus = 'INACTIVE';
        nextActive = false;
      } else if (upper === 'NOT_REGISTERED') {
        nextStatus = 'NOT_REGISTERED';
        nextActive = false;
      }
    } else if (typeof isActive === 'boolean') {
      nextActive = isActive;
      nextStatus = isActive ? 'ACTIVE' : 'INACTIVE';
    }

    await db.query(
      `UPDATE stakeholders
       SET first_name = $1, last_name = $2, email = $3, alternate_email = $4,
           contact = $5, department = $6, designation = $7, category = $8,
           employee_id = $9, notes = $10, is_active = $11, status = $12, updated_at = CURRENT_TIMESTAMP
       WHERE id = $13`,
      [
        fName,
        lName,
        cleanEmail,
        alternateEmail ? alternateEmail.toLowerCase().trim() : null,
        (contact || '').trim(),
        (department || 'General').trim(),
        (designation || 'Member').trim(),
        (category || 'Employee').trim(),
        (employeeId || '').trim(),
        (notes || '').trim(),
        nextActive,
        nextStatus,
        stakeholderId,
      ]
    );

    await logActivity(
      orgId,
      req.user.userId,
      'STAKEHOLDER_UPDATED',
      `Stakeholder ${fName} ${lName} (${department || 'General'}) details updated.`
    );

    return res.json({ message: 'Stakeholder details updated successfully.' });
  } catch (err) {
    console.error('Error updating stakeholder:', err);
    return res.status(500).json({ error: 'Failed to update stakeholder details.' });
  }
});

// ── 11. PATCH /api/members/stakeholders/:id/status (ADMIN ONLY) ──
// Activate or Deactivate Stakeholder (Admin can only activate if inactive; not registered is blocked)
router.patch('/stakeholders/:id/status', authMiddleware.requireRole('ADMIN'), async (req, res) => {
  try {
    const stakeholderId = parseInt(req.params.id, 10);
    const orgId = req.user.organisationId;
    const { isActive, status: rawStatus } = req.body;

    const existing = await db.query(
      'SELECT id, first_name, last_name, is_active, status FROM stakeholders WHERE id = $1 AND organisation_id = $2',
      [stakeholderId, orgId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Stakeholder not found.' });
    }

    const sh = existing.rows[0];

    let nextActive = typeof isActive === 'boolean' ? isActive : !sh.is_active;
    let nextStatus = nextActive ? 'ACTIVE' : 'INACTIVE';

    if (rawStatus) {
      const upper = rawStatus.toUpperCase().replace(/\s+/g, '_');
      if (upper === 'NOT_REGISTERED') {
        nextStatus = 'NOT_REGISTERED';
        nextActive = false;
      } else if (upper === 'ACTIVE') {
        nextStatus = 'ACTIVE';
        nextActive = true;
      } else {
        nextStatus = 'INACTIVE';
        nextActive = false;
      }
    }

    // Admin rule: Can only activate when stakeholder is INACTIVE.
    // For NOT_REGISTERED, activation is forbidden until the stakeholder verifies via email link + org code.
    if (sh.status === 'NOT_REGISTERED' && (nextActive === true || nextStatus === 'ACTIVE')) {
      return res.status(400).json({
        error: 'Cannot activate a stakeholder with "Not Registered" status. The stakeholder must first verify their enrollment using the link sent to their email.'
      });
    }

    await db.query(
      'UPDATE stakeholders SET is_active = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND organisation_id = $4',
      [nextActive, nextStatus, stakeholderId, orgId]
    );

    await logActivity(
      orgId,
      req.user.userId,
      'STAKEHOLDER_UPDATED',
      `Stakeholder ${sh.first_name} ${sh.last_name} status changed to ${nextStatus} in directory.`
    );

    return res.json({
      message: `Stakeholder status updated to ${nextStatus.replace('_', ' ')} successfully.`,
      isActive: nextActive,
      status: nextStatus.toLowerCase(),
    });
  } catch (err) {
    console.error('Error toggling stakeholder status:', err);
    return res.status(500).json({ error: 'Failed to update stakeholder status.' });
  }
});

// ── 12. DELETE /api/members/stakeholders/:id (ADMIN ONLY) ──
// Delete if unverified / not registered or 0 campaign participation; otherwise soft-deactivate
router.delete('/stakeholders/:id', authMiddleware.requireRole('ADMIN'), async (req, res) => {
  try {
    const stakeholderId = parseInt(req.params.id, 10);
    const orgId = req.user.organisationId;

    const existing = await db.query(
      'SELECT id, first_name, last_name, status, is_active FROM stakeholders WHERE id = $1 AND organisation_id = $2',
      [stakeholderId, orgId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Stakeholder not found.' });
    }

    const sh = existing.rows[0];

    const partRes = await db.query(
      `SELECT 
         (SELECT COUNT(*) FROM campaign_participants WHERE stakeholder_id = $1) as campaign_count,
         (SELECT COUNT(*) FROM comments WHERE stakeholder_id = $1) as comment_count`,
      [stakeholderId]
    );
    const campaignCount = parseInt(partRes.rows[0]?.campaign_count || '0', 10);
    const commentCount = parseInt(partRes.rows[0]?.comment_count || '0', 10);
    const hasParticipated = (campaignCount > 0 || commentCount > 0);
    const isNotRegistered = (sh.status === 'NOT_REGISTERED' || !sh.is_active);

    if (isNotRegistered || !hasParticipated) {
      // Stakeholder has NOT participated in any campaigns (or not registered): allow hard delete
      await db.query('DELETE FROM stakeholders WHERE id = $1 AND organisation_id = $2', [stakeholderId, orgId]);

      await logActivity(
        orgId,
        req.user.userId,
        'STAKEHOLDER_DELETED',
        `Stakeholder ${sh.first_name} ${sh.last_name} was removed from organisation directory.`
      );

      return res.json({
        message: `Stakeholder ${sh.first_name} ${sh.last_name} deleted successfully.`,
        deleted: true
      });
    }

    // Stakeholder has historical campaign records: soft-deactivate instead of hard delete
    await db.query(
      "UPDATE stakeholders SET is_active = false, status = 'INACTIVE', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND organisation_id = $2",
      [stakeholderId, orgId]
    );

    await logActivity(
      orgId,
      req.user.userId,
      'STAKEHOLDER_UPDATED',
      `Stakeholder ${sh.first_name} ${sh.last_name} has participated in consultations; account was deactivated to preserve historical records.`
    );

    return res.json({
      message: 'Stakeholder has past campaign participation records. Account has been deactivated instead of deleted.',
      deactivated: true
    });
  } catch (err) {
    console.error('Error removing stakeholder:', err);
    return res.status(500).json({ error: 'Failed to remove stakeholder.' });
  }
});

export default router;
