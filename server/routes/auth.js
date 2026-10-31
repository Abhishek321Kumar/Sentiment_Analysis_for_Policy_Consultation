import express from 'express';
import db from '../db.js';
import cryptoUtils from '../utils/crypto.js';
import emailUtils from '../utils/email.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

const PUBLIC_EMAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'];

// Helper to get roles for a user
async function getUserRoles(userId) {
  const result = await db.query('SELECT role FROM user_roles WHERE user_id = $1', [userId]);
  return result.rows.map(r => r.role);
}

// ── 1. POST /api/auth/register-admin ──
router.post('/register-admin', async (req, res) => {
  try {
    const { orgName, firstName, lastName, email, phone, password, designation } = req.body;

    if (!orgName || !firstName || !lastName || !email || !phone || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanOrgName = orgName.trim();
    const cleanDesignation = (designation || 'Organisation Administrator').trim();

    // Check public email domain flag
    const allowPublicDomains = process.env.ALLOW_PUBLIC_EMAIL_DOMAINS !== 'false';
    const domain = cleanEmail.split('@')[1];
    if (!allowPublicDomains && PUBLIC_EMAIL_DOMAINS.includes(domain)) {
      return res.status(400).json({
        error: 'Please use a valid organisation or corporate work email address (public domains are not allowed).',
      });
    }

    // Check if an active/completed organisation with the exact same name already exists
    const existingOrg = await db.query(
      'SELECT id FROM organisations WHERE LOWER(name) = LOWER($1) AND profile_completed = true',
      [cleanOrgName]
    );
    if (existingOrg.rows.length > 0) {
      return res.status(409).json({
        error: 'An organisation with this name is already registered on PotentPolicy.',
      });
    }

    // Check if user already exists
    const existing = await db.query('SELECT id, email_verified FROM users WHERE LOWER(email) = $1', [cleanEmail]);
    if (existing.rows.length > 0 && existing.rows[0].email_verified) {
      return res.status(409).json({ error: 'An account with this email address already exists. Please sign in.' });
    }

    let orgId;
    let userId;

    if (existing.rows.length > 0) {
      // Re-use unverified user and update details
      userId = existing.rows[0].id;
      const userRes = await db.query('SELECT organisation_id FROM users WHERE id = $1', [userId]);
      orgId = userRes.rows[0].organisation_id;

      await db.query('UPDATE organisations SET name = $1 WHERE id = $2', [cleanOrgName, orgId]);
      const hashedPass = await cryptoUtils.hashPassword(password);
      await db.query(
        'UPDATE users SET first_name = $1, last_name = $2, phone = $3, designation = $4, password_hash = $5 WHERE id = $6',
        [firstName.trim(), lastName.trim(), phone.trim(), cleanDesignation, hashedPass, userId]
      );
    } else {
      // Create new organisation
      const orgRes = await db.query(
        'INSERT INTO organisations (name) VALUES ($1) RETURNING id',
        [cleanOrgName]
      );
      orgId = orgRes.rows[0].id;

      // Hash password and create user
      const hashedPass = await cryptoUtils.hashPassword(password);
      const userRes = await db.query(
        `INSERT INTO users (organisation_id, first_name, last_name, email, phone, department, designation, password_hash, email_verified)
         VALUES ($1, $2, $3, $4, $5, 'Executive Governance', $6, $7, false) RETURNING id`,
        [orgId, firstName.trim(), lastName.trim(), cleanEmail, phone.trim(), cleanDesignation, hashedPass]
      );
      userId = userRes.rows[0].id;

      // Add ADMIN role
      await db.query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2)', [userId, 'ADMIN']);
    }

    // Generate 6-digit OTP
    const otp = cryptoUtils.generateOtp();
    const otpHash = await cryptoUtils.hashOtp(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store in email_otps
    await db.query(
      'INSERT INTO email_otps (email, otp_hash, attempts, expires_at) VALUES ($1, $2, 0, $3)',
      [cleanEmail, otpHash, expiresAt]
    );

    // Send email in background
    emailUtils.sendEmail({
      to: cleanEmail,
      firstName: firstName.trim(),
      template: 'OTP',
      data: { otp },
    });

    return res.status(201).json({
      message: 'Registration initiated. Verification OTP sent to your email.',
      email: cleanEmail,
    });
  } catch (err) {
    console.error('Error in register-admin:', err);
    return res.status(500).json({ error: 'Failed to register organisation administrator.' });
  }
});

// ── 2. POST /api/auth/verify-otp ──
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanOtp = otp.toString().trim();

    // Fetch the latest OTP record for this email
    const otpRes = await db.query(
      'SELECT id, otp_hash, attempts, expires_at FROM email_otps WHERE email = $1 ORDER BY id DESC LIMIT 1',
      [cleanEmail]
    );

    if (otpRes.rows.length === 0) {
      return res.status(400).json({ error: 'No verification request found for this email.' });
    }

    const record = otpRes.rows[0];

    // Check expiration
    if (new Date() > new Date(record.expires_at)) {
      return res.status(400).json({ error: 'Verification code has expired. Please request a new code.' });
    }

    // Check max attempts
    if (record.attempts >= 5) {
      return res.status(429).json({ error: 'Too many incorrect attempts. Please request a new verification code.' });
    }

    // Verify OTP hash
    const isValid = await cryptoUtils.compareOtp(cleanOtp, record.otp_hash);
    if (!isValid) {
      await db.query('UPDATE email_otps SET attempts = attempts + 1 WHERE id = $1', [record.id]);
      const remaining = 5 - (record.attempts + 1);
      return res.status(400).json({
        error: `Invalid verification code. ${remaining > 0 ? `${remaining} attempts remaining.` : 'Code locked.'}`,
      });
    }

    // Mark user as verified
    await db.query('UPDATE users SET email_verified = true WHERE LOWER(email) = $1', [cleanEmail]);

    // Clean up OTPs
    await db.query('DELETE FROM email_otps WHERE email = $1', [cleanEmail]);

    // Fetch user and org details
    const userRes = await db.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.designation, u.organisation_id,
              o.name as org_name, o.profile_completed, o.org_code
       FROM users u
       JOIN organisations o ON u.organisation_id = o.id
       WHERE LOWER(u.email) = $1`,
      [cleanEmail]
    );

    const user = userRes.rows[0];
    const roles = await getUserRoles(user.id);

    const token = authMiddleware.generateToken({
      userId: user.id,
      organisation_id: user.organisation_id,
      roles,
      email: user.email,
    });

    return res.json({
      token,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        phone: user.phone,
        designation: user.designation,
        organisationId: user.organisation_id,
        orgName: user.org_name,
        orgCode: user.org_code,
        roles,
        profileCompleted: user.profile_completed,
      },
      requiresProfile: !user.profile_completed,
      message: 'Email successfully verified.',
    });
  } catch (err) {
    console.error('Error in verify-otp:', err);
    return res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

// ── 3. POST /api/auth/resend-otp ──
router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const cleanEmail = email.toLowerCase().trim();

    const userRes = await db.query('SELECT id, first_name FROM users WHERE LOWER(email) = $1', [cleanEmail]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found.' });
    }

    // Check 60-second cooldown
    const lastOtp = await db.query(
      'SELECT created_at FROM email_otps WHERE email = $1 ORDER BY id DESC LIMIT 1',
      [cleanEmail]
    );

    if (lastOtp.rows.length > 0) {
      const diffSeconds = (Date.now() - new Date(lastOtp.rows[0].created_at).getTime()) / 1000;
      if (diffSeconds < 60) {
        const waitTime = Math.ceil(60 - diffSeconds);
        return res.status(429).json({ error: `Please wait ${waitTime} seconds before requesting a new code.` });
      }
    }

    const otp = cryptoUtils.generateOtp();
    const otpHash = await cryptoUtils.hashOtp(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.query(
      'INSERT INTO email_otps (email, otp_hash, attempts, expires_at) VALUES ($1, $2, 0, $3)',
      [cleanEmail, otpHash, expiresAt]
    );

    emailUtils.sendEmail({
      to: cleanEmail,
      firstName: userRes.rows[0].first_name,
      template: 'OTP',
      data: { otp },
    });

    return res.json({ message: 'A new verification code has been sent to your email.' });
  } catch (err) {
    console.error('Error in resend-otp:', err);
    return res.status(500).json({ error: 'Failed to resend verification code.' });
  }
});

// ── 4. POST /api/auth/login ──
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const cleanEmail = email.toLowerCase().trim();

    const userRes = await db.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.department, u.designation, u.account_status,
              u.password_hash, u.email_verified,
              u.organisation_id, o.name as org_name, o.display_name, o.profile_completed, o.org_code,
              o.industry, o.size, o.org_type, o.city, o.state, o.country, o.website, o.domain,
              o.logo_url, o.description, o.year_established, o.department_count, o.employee_count,
              o.branch_count, o.primary_departments, o.organisation_structure, o.created_at as org_created_at
       FROM users u
       JOIN organisations o ON u.organisation_id = o.id
       WHERE LOWER(u.email) = $1`,
      [cleanEmail]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = userRes.rows[0];

    // Rejection of deactivated accounts
    if (user.account_status === 'INACTIVE') {
      return res.status(403).json({
        error: 'Your account has been deactivated by your organisation administrator.',
      });
    }

    // Rejection of unverified emails
    if (!user.email_verified) {
      return res.status(403).json({
        error: 'Your email address is not verified. Please verify your email before signing in.',
        needsVerification: true,
        email: cleanEmail,
      });
    }

    // Verify password
    const valid = await cryptoUtils.comparePassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const roles = await getUserRoles(user.id);

    const token = authMiddleware.generateToken({
      userId: user.id,
      organisation_id: user.organisation_id,
      roles,
      email: user.email,
    });

    return res.json({
      token,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        phone: user.phone,
        department: user.department || 'General',
        designation: user.designation || '',
        accountStatus: user.account_status || 'ACTIVE',
        organisationId: user.organisation_id,
        orgName: user.org_name,
        displayName: user.display_name || '',
        orgCode: user.org_code,
        roles,
        profileCompleted: user.profile_completed,
        industry: user.industry,
        size: user.size,
        orgType: user.org_type,
        city: user.city,
        state: user.state,
        country: user.country,
        website: user.website,
        domain: user.domain,
        logoUrl: user.logo_url || '',
        description: user.description,
        yearEstablished: user.year_established,
        departmentCount: user.department_count,
        employeeCount: user.employee_count,
        branchCount: user.branch_count,
        organisationStructure: user.organisation_structure,
        orgCreatedAt: user.org_created_at,
      },
      message: 'Signed in successfully.',
    });
  } catch (err) {
    console.error('Error in login:', err);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ── 5. POST /api/auth/register-manager ──
router.post('/register-manager', async (req, res) => {
  // Product rule: Return one generic error for any failure
  const GENERIC_ERROR = 'Invalid registration details or invitation has expired.';

  try {
    const { firstName, lastName, email, phone, password, orgCode } = req.body;

    if (!firstName || !lastName || !email || !phone || !password || !orgCode) {
      return res.status(400).json({ error: GENERIC_ERROR });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanOrgCode = orgCode.toUpperCase().trim();

    // 1. Find organisation by org code (case-insensitive)
    const orgRes = await db.query(
      'SELECT id, name FROM organisations WHERE UPPER(org_code) = $1',
      [cleanOrgCode]
    );

    if (orgRes.rows.length === 0) {
      return res.status(400).json({ error: GENERIC_ERROR });
    }

    const org = orgRes.rows[0];

    // 2. Check for PENDING, unexpired invitation for this exact email in this org
    const inviteRes = await db.query(
      `SELECT id, department, designation FROM manager_invitations
       WHERE organisation_id = $1
         AND LOWER(email) = $2
         AND status = 'PENDING'
         AND expires_at > $3`,
      [org.id, cleanEmail, new Date()]
    );

    if (inviteRes.rows.length === 0) {
      return res.status(400).json({ error: GENERIC_ERROR });
    }

    const invitation = inviteRes.rows[0];
    const mgrDepartment = invitation.department || 'General';
    const mgrDesignation = invitation.designation || 'Campaign Manager';

    // 3. Create or update user account
    let userId;
    const existingUser = await db.query(
      'SELECT id FROM users WHERE organisation_id = $1 AND LOWER(email) = $2',
      [org.id, cleanEmail]
    );

    if (existingUser.rows.length > 0) {
      userId = existingUser.rows[0].id;
      // Add CAMPAIGN_MANAGER role if not already present
      await db.query(
        `INSERT INTO user_roles (user_id, role) VALUES ($1, 'CAMPAIGN_MANAGER')
         ON CONFLICT DO NOTHING`,
        [userId]
      );
    } else {
      const passwordHash = await cryptoUtils.hashPassword(password);
      const newUser = await db.query(
        `INSERT INTO users (organisation_id, first_name, last_name, email, phone, department, designation, account_status, password_hash, email_verified)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8, true) RETURNING id`,
        [org.id, firstName.trim(), lastName.trim(), cleanEmail, phone.trim(), mgrDepartment, mgrDesignation, passwordHash]
      );
      userId = newUser.rows[0].id;

      await db.query(
        `INSERT INTO user_roles (user_id, role) VALUES ($1, 'CAMPAIGN_MANAGER')`,
        [userId]
      );
    }

    // 4. Mark invitation as ACCEPTED (single-use)
    await db.query(
      `UPDATE manager_invitations SET status = 'ACCEPTED' WHERE id = $1`,
      [invitation.id]
    );

    // 5. Log activity
    await db.query(
      `INSERT INTO activity_logs (organisation_id, user_id, action_type, description)
       VALUES ($1, $2, 'MANAGER_ADDED', $3)`,
      [org.id, userId, `Campaign Manager ${firstName.trim()} ${lastName.trim()} (${mgrDepartment}) activated their account.`]
    );

    const roles = await getUserRoles(userId);

    const token = authMiddleware.generateToken({
      userId,
      organisation_id: org.id,
      roles,
      email: cleanEmail,
    });

    return res.status(201).json({
      token,
      user: {
        id: userId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: cleanEmail,
        phone: phone.trim(),
        department: mgrDepartment,
        designation: mgrDesignation,
        accountStatus: 'ACTIVE',
        organisationId: org.id,
        orgName: org.name,
        roles,
        profileCompleted: true,
      },
      message: 'Campaign Manager account successfully created.',
    });
  } catch (err) {
    console.error('Error in register-manager:', err);
    return res.status(400).json({ error: GENERIC_ERROR });
  }
});

// ── 6. GET /api/auth/me ──
router.get('/me', authMiddleware.authenticate, async (req, res) => {
  try {
    const userRes = await db.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.department, u.designation, u.account_status,
              u.organisation_id,
              o.name as org_name, o.display_name, o.profile_completed, o.org_code, o.industry, o.size, o.org_type,
              o.city, o.state, o.country, o.website, o.domain, o.logo_url, o.description,
              o.year_established, o.department_count, o.employee_count, o.branch_count,
              o.primary_departments, o.organisation_structure, o.created_at as org_created_at
       FROM users u
       JOIN organisations o ON u.organisation_id = o.id
       WHERE u.id = $1`,
      [req.user.userId]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const user = userRes.rows[0];
    const roles = await getUserRoles(user.id);

    return res.json({
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        phone: user.phone,
        department: user.department || 'General',
        designation: user.designation || '',
        accountStatus: user.account_status || 'ACTIVE',
        organisationId: user.organisation_id,
        orgName: user.org_name,
        displayName: user.display_name || '',
        orgCode: user.org_code,
        roles,
        profileCompleted: user.profile_completed,
        industry: user.industry,
        size: user.size,
        orgType: user.org_type,
        city: user.city,
        state: user.state,
        country: user.country,
        website: user.website,
        domain: user.domain,
        logoUrl: user.logo_url || '',
        description: user.description,
        yearEstablished: user.year_established,
        departmentCount: user.department_count,
        employeeCount: user.employee_count,
        branchCount: user.branch_count,
        organisationStructure: user.organisation_structure,
        orgCreatedAt: user.org_created_at,
      },
    });
  } catch (err) {
    console.error('Error in /auth/me:', err);
    return res.status(500).json({ error: 'Failed to fetch user details.' });
  }
});

// ── 7. PUT /api/auth/profile ──
router.put('/profile', authMiddleware.authenticate, async (req, res) => {
  try {
    const { firstName, lastName, phone, department, designation } = req.body;
    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'First name and last name are required.' });
    }

    await db.query(
      `UPDATE users
       SET first_name = $1, last_name = $2, phone = $3, department = $4, designation = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6`,
      [
        firstName.trim(),
        lastName.trim(),
        (phone || '').trim(),
        (department || 'General').trim(),
        (designation || '').trim(),
        req.user.userId,
      ]
    );

    return res.json({
      message: 'Profile updated successfully.',
    });
  } catch (err) {
    console.error('Error updating profile:', err);
    return res.status(500).json({ error: 'Failed to update profile.' });
  }
});

// ── 8. POST /api/auth/forgot-password ──
router.post('/forgot-password', async (req, res) => {
  try {
    const { email, role } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Query user and their organisation
    const userRes = await db.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.organisation_id, o.name as org_name
       FROM users u
       LEFT JOIN organisations o ON u.organisation_id = o.id
       WHERE LOWER(u.email) = $1`,
      [cleanEmail]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({
        error: `No registered account found with email "${cleanEmail}". Please check your email or register your organisation.`
      });
    }

    const user = userRes.rows[0];
    const roles = await getUserRoles(user.id);

    // If role was explicitly specified in request (e.g. 'ADMIN' or 'CAMPAIGN_MANAGER'), verify role match
    if (role && !roles.includes(role.toUpperCase())) {
      const roleName = role.toUpperCase() === 'ADMIN' ? 'Administrator' : 'Campaign Manager';
      return res.status(400).json({
        error: `The account associated with "${cleanEmail}" is not registered as a ${roleName}. Please check your login role.`
      });
    }

    // Generate unique token
    const token = 'rst_' + cryptoUtils.generateInvitationToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Invalidate any existing unused reset tokens for this user
    await db.query(
      'UPDATE password_reset_tokens SET used = true WHERE user_id = $1 AND used = false',
      [user.id]
    );

    // Insert new token
    await db.query(
      `INSERT INTO password_reset_tokens (user_id, email, token, role, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, cleanEmail, token, role || roles[0], expiresAt]
    );

    const resetUrl = `http://localhost:5173/reset-password?token=${token}`;
    const primaryRole = roles.includes('ADMIN') ? 'Administrator' : 'Campaign Manager';

    // Dispatch email
    await emailUtils.sendEmail({
      to: cleanEmail,
      firstName: user.first_name,
      template: 'PASSWORD_RESET',
      data: {
        email: cleanEmail,
        roleName: primaryRole,
        orgName: user.org_name || 'PotentPolicy',
        resetUrl,
      },
    });

    return res.json({
      message: `Password reset instructions have been dispatched to ${cleanEmail}. Check PotentMail outbox to view your reset link.`,
      resetUrl,
      token,
    });
  } catch (err) {
    console.error('Error in forgot-password:', err);
    return res.status(500).json({ error: 'Failed to process password reset request.' });
  }
});

// ── 9. GET /api/auth/verify-reset-token/:token ──
router.get('/verify-reset-token/:token', async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({ error: 'Reset token is required.' });
    }

    const tokenRes = await db.query(
      `SELECT prt.*, u.first_name, u.last_name, o.name as org_name
       FROM password_reset_tokens prt
       JOIN users u ON prt.user_id = u.id
       LEFT JOIN organisations o ON u.organisation_id = o.id
       WHERE prt.token = $1`,
      [token.trim()]
    );

    if (tokenRes.rows.length === 0) {
      return res.status(404).json({ error: 'This password reset link is invalid or does not exist.' });
    }

    const row = tokenRes.rows[0];

    if (row.used) {
      return res.status(400).json({ error: 'This password reset link has already been used. Please request a new one if needed.' });
    }

    if (new Date() > new Date(row.expires_at)) {
      return res.status(400).json({ error: 'This password reset link has expired (links expire after 1 hour). Please request a new reset link.' });
    }

    return res.json({
      valid: true,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      orgName: row.org_name,
      role: row.role,
    });
  } catch (err) {
    console.error('Error verifying reset token:', err);
    return res.status(500).json({ error: 'Failed to verify reset token.' });
  }
});

// ── 10. POST /api/auth/reset-password ──
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Reset token is required.' });
    }
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const tokenRes = await db.query(
      `SELECT prt.*, u.id as user_id, u.organisation_id, u.first_name, u.last_name
       FROM password_reset_tokens prt
       JOIN users u ON prt.user_id = u.id
       WHERE prt.token = $1`,
      [token.trim()]
    );

    if (tokenRes.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid password reset token.' });
    }

    const row = tokenRes.rows[0];

    if (row.used) {
      return res.status(400).json({ error: 'This password reset link has already been used.' });
    }

    if (new Date() > new Date(row.expires_at)) {
      return res.status(400).json({ error: 'This password reset link has expired.' });
    }

    // Hash new password
    const hashedPassword = await cryptoUtils.hashPassword(newPassword);

    // Update user's password in database
    await db.query(
      `UPDATE users
       SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [hashedPassword, row.user_id]
    );

    // Mark token as used
    await db.query(
      `UPDATE password_reset_tokens SET used = true WHERE id = $1`,
      [row.id]
    );

    // Log activity
    await db.query(
      `INSERT INTO activity_logs (organisation_id, user_id, action_type, description)
       VALUES ($1, $2, 'PASSWORD_RESET', $3)`,
      [row.organisation_id, row.user_id, `Password was successfully reset for user ${row.first_name} ${row.last_name} (${row.email}).`]
    );

    return res.json({
      message: 'Your password has been successfully reset. You can now log in with your new password.',
      email: row.email,
      role: row.role,
    });
  } catch (err) {
    console.error('Error resetting password:', err);
    return res.status(500).json({ error: 'Failed to reset password.' });
  }
});

export default router;
