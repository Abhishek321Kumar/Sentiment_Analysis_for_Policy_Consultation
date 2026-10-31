import express from 'express';
import db from '../db.js';
import cryptoUtils from '../utils/crypto.js';
import emailUtils from '../utils/email.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

function parsePrimaryDepartments(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(raw)
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }
}

function formatOrgResponse(org) {
  return {
    id: org.id,
    organisationId: org.id,
    name: org.name,
    organisationName: org.name,
    displayName: org.display_name || '',
    orgCode: org.org_code,
    profileCompleted: Boolean(org.profile_completed),
    orgType: org.org_type || '',
    organisationType: org.org_type || '',
    industry: org.industry || '',
    website: org.website || '',
    logoUrl: org.logo_url || '',
    logo: org.logo_url || '',
    description: org.description || '',
    yearEstablished: org.year_established || null,
    domain: org.domain || '',
    country: org.country || '',
    state: org.state || '',
    city: org.city || '',
    registeredAddress: org.registered_address || '',
    postalCode: org.postal_code || '',
    contactEmail: org.contact_email || '',
    contactNumber: org.contact_number || '',
    size: org.size || '',
    companySize: org.size || '',
    employeeCount: org.employee_count ?? org.expected_stakeholders ?? null,
    departmentCount: org.department_count ?? null,
    branchCount: org.branch_count ?? null,
    primaryDepartments: parsePrimaryDepartments(org.primary_departments),
    organisationStructure: org.organisation_structure || 'Centralised',
    expectedStakeholders: org.expected_stakeholders ?? org.employee_count ?? null,
    status: org.status || 'ACTIVE',
    createdAt: org.created_at,
    updatedAt: org.updated_at,
  };
}

// ── 1. GET /api/organisation/profile ──
router.get('/profile', authMiddleware.authenticate, async (req, res) => {
  try {
    const orgId = req.user.organisationId;
    const result = await db.query('SELECT * FROM organisations WHERE id = $1', [orgId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Organisation not found.' });
    }

    return res.json({
      organisation: formatOrgResponse(result.rows[0]),
    });
  } catch (err) {
    console.error('Error fetching organisation profile:', err);
    return res.status(500).json({ error: 'Failed to fetch organisation profile.' });
  }
});

// ── 2. PUT /api/organisation/profile ──
// Completes or updates the organisation profile (used by both the 4-step registration wizard and the Admin Organisation Profile editor)
router.put(
  '/profile',
  authMiddleware.authenticate,
  authMiddleware.requireRole('ADMIN'),
  async (req, res) => {
    try {
      const orgId = req.user.organisationId;

      const currentOrgRes = await db.query('SELECT * FROM organisations WHERE id = $1', [orgId]);
      if (currentOrgRes.rows.length === 0) {
        return res.status(404).json({ error: 'Organisation not found.' });
      }
      const org = currentOrgRes.rows[0];
      const wasCompleted = Boolean(org.profile_completed);

      const {
        name,
        orgName,
        organisationName,
        displayName,
        orgType,
        organisationType,
        industry,
        website,
        logo,
        logoUrl,
        description,
        yearEstablished,
        domain,
        country,
        state,
        city,
        registeredAddress,
        postalCode,
        contactEmail,
        contactNumber,
        size,
        companySize,
        employeeCount,
        departmentCount,
        branchCount,
        primaryDepartments,
        organisationStructure,
        expectedStakeholders,
        // Optional Admin fields from Step 4 review/update
        adminFullName,
        adminDesignation,
        adminPhone,
      } = req.body;

      const resolvedName = (name ?? orgName ?? organisationName ?? org.name ?? '').toString().trim();
      if (!resolvedName) {
        return res.status(400).json({ error: 'Organisation Name is required.' });
      }

      const resolvedDisplayName = (displayName ?? org.display_name ?? '').toString().trim();
      const resolvedOrgType = (orgType ?? organisationType ?? org.org_type ?? '').toString().trim();
      const resolvedIndustry = (industry ?? org.industry ?? '').toString().trim();
      const resolvedWebsite = (website ?? org.website ?? '').toString().trim();
      const resolvedLogo = logo !== undefined ? logo : logoUrl !== undefined ? logoUrl : org.logo_url || '';
      const resolvedDescription = (description ?? org.description ?? '').toString().trim();
      const resolvedDomain = (domain ?? org.domain ?? '')
        .toString()
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/.*$/, '');

      if (resolvedDomain && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(resolvedDomain)) {
        return res.status(400).json({
          error: 'Please enter a valid organisation domain (e.g. company.com or university.edu).',
        });
      }

      const resolvedCountry = (country ?? org.country ?? '').toString().trim();
      const resolvedState = (state ?? org.state ?? '').toString().trim();
      const resolvedCity = (city ?? org.city ?? '').toString().trim();
      const resolvedAddress = (registeredAddress ?? org.registered_address ?? '').toString().trim();
      const resolvedPostal = (postalCode ?? org.postal_code ?? '').toString().trim();
      const resolvedContactEmail = (contactEmail ?? org.contact_email ?? '').toString().trim().toLowerCase();
      const resolvedContactNumber = (contactNumber ?? org.contact_number ?? '').toString().trim();
      const resolvedSize = (size ?? companySize ?? org.size ?? '').toString().trim();
      const resolvedStructure = (organisationStructure ?? org.organisation_structure ?? 'Centralised')
        .toString()
        .trim();

      if (resolvedContactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resolvedContactEmail)) {
        return res.status(400).json({ error: 'Please enter a valid Official Contact Email address.' });
      }

      // Check duplicate organisation name or domain against OTHER organisations
      const dupOrgCheck = await db.query(
        `SELECT id, name, domain FROM organisations
         WHERE id != $1 AND profile_completed = true AND LOWER(name) = LOWER($2)`,
        [orgId, resolvedName]
      );
      if (dupOrgCheck.rows.length > 0) {
        return res.status(409).json({
          error: 'An organisation with this exact name is already registered on the platform.',
        });
      }

      if (resolvedDomain) {
        const dupDomainCheck = await db.query(
          `SELECT id FROM organisations
           WHERE id != $1 AND profile_completed = true AND LOWER(COALESCE(domain, '')) = LOWER($2)`,
          [orgId, resolvedDomain]
        );
        if (dupDomainCheck.rows.length > 0) {
          return res.status(409).json({
            error: `The organisation domain "${resolvedDomain}" is already registered by another institution.`,
          });
        }
      }

      const parsedYear =
        yearEstablished !== undefined && yearEstablished !== '' && yearEstablished !== null
          ? parseInt(yearEstablished, 10)
          : org.year_established ?? null;

      const parsedEmpCount =
        employeeCount !== undefined && employeeCount !== '' && employeeCount !== null
          ? parseInt(employeeCount, 10)
          : expectedStakeholders !== undefined && expectedStakeholders !== '' && expectedStakeholders !== null
          ? parseInt(expectedStakeholders, 10)
          : org.employee_count ?? org.expected_stakeholders ?? null;

      const parsedDeptCount =
        departmentCount !== undefined && departmentCount !== '' && departmentCount !== null
          ? parseInt(departmentCount, 10)
          : org.department_count ?? null;

      const parsedBranchCount =
        branchCount !== undefined && branchCount !== '' && branchCount !== null
          ? parseInt(branchCount, 10)
          : org.branch_count ?? null;

      const resolvedPrimaryDepts =
        primaryDepartments !== undefined
          ? JSON.stringify(parsePrimaryDepartments(primaryDepartments))
          : org.primary_departments || '[]';

      // Generate unique orgCode if not yet generated
      let orgCode = org.org_code;
      if (!orgCode) {
        let isUnique = false;
        while (!isUnique) {
          orgCode = cryptoUtils.generateOrgCode();
          const check = await db.query('SELECT id FROM organisations WHERE org_code = $1', [orgCode]);
          if (check.rows.length === 0) isUnique = true;
        }
      }

      await db.query(
        `UPDATE organisations
         SET name = $1,
             display_name = $2,
             org_type = $3,
             industry = $4,
             website = $5,
             logo_url = $6,
             description = $7,
             year_established = $8,
             domain = $9,
             country = $10,
             state = $11,
             city = $12,
             registered_address = $13,
             postal_code = $14,
             contact_email = $15,
             contact_number = $16,
             size = $17,
             employee_count = $18,
             department_count = $19,
             branch_count = $20,
             primary_departments = $21,
             organisation_structure = $22,
             expected_stakeholders = $23,
             org_code = $24,
             profile_completed = true,
             status = 'ACTIVE',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $25`,
        [
          resolvedName,
          resolvedDisplayName,
          resolvedOrgType,
          resolvedIndustry,
          resolvedWebsite,
          resolvedLogo,
          resolvedDescription,
          isNaN(parsedYear) ? null : parsedYear,
          resolvedDomain,
          resolvedCountry,
          resolvedState,
          resolvedCity,
          resolvedAddress,
          resolvedPostal,
          resolvedContactEmail,
          resolvedContactNumber,
          resolvedSize,
          isNaN(parsedEmpCount) ? null : parsedEmpCount,
          isNaN(parsedDeptCount) ? null : parsedDeptCount,
          isNaN(parsedBranchCount) ? null : parsedBranchCount,
          resolvedPrimaryDepts,
          resolvedStructure,
          isNaN(parsedEmpCount) ? null : parsedEmpCount,
          orgCode,
          orgId,
        ]
      );

      // Update Administrator's designation / name / phone if provided
      if (adminDesignation || adminFullName || adminPhone) {
        const userRes = await db.query('SELECT first_name, last_name, designation, phone FROM users WHERE id = $1', [
          req.user.userId,
        ]);
        if (userRes.rows.length > 0) {
          const curUser = userRes.rows[0];
          let fName = curUser.first_name;
          let lName = curUser.last_name;
          if (adminFullName && adminFullName.trim()) {
            const parts = adminFullName.trim().split(/\s+/);
            fName = parts[0];
            lName = parts.length > 1 ? parts.slice(1).join(' ') : '-';
          }
          await db.query(
            `UPDATE users
             SET first_name = $1, last_name = $2, designation = $3, phone = $4, updated_at = CURRENT_TIMESTAMP
             WHERE id = $5`,
            [
              fName,
              lName,
              adminDesignation ? adminDesignation.trim() : curUser.designation || 'System Administrator',
              adminPhone ? adminPhone.trim() : curUser.phone || '',
              req.user.userId,
            ]
          );
        }
      }

      // Send secret orgCode email only when completing onboarding for the first time
      if (!wasCompleted) {
        const adminRes = await db.query('SELECT first_name, email FROM users WHERE id = $1', [req.user.userId]);
        if (adminRes.rows.length > 0) {
          const admin = adminRes.rows[0];
          emailUtils.sendEmail({
            to: admin.email,
            firstName: admin.first_name,
            template: 'ORG_CODE',
            data: {
              orgName: resolvedName,
              orgCode,
            },
          });
        }
      }

      // Log activity
      try {
        await db.query(
          `INSERT INTO activity_logs (organisation_id, user_id, action_type, description)
           VALUES ($1, $2, 'ORG_PROFILE_UPDATED', $3)`,
          [
            orgId,
            req.user.userId,
            wasCompleted
              ? `Organisation profile for "${resolvedName}" was updated by Administrator.`
              : `Organisation "${resolvedName}" completed full institutional registration and activated workspace.`,
          ]
        );
      } catch (logErr) {
        console.warn('Activity log warning:', logErr.message);
      }

      const updatedOrgRes = await db.query('SELECT * FROM organisations WHERE id = $1', [orgId]);

      return res.json({
        message: wasCompleted
          ? 'Organisation profile updated successfully.'
          : 'Organisation profile successfully completed. Your secret organisation code has been generated.',
        organisation: formatOrgResponse(updatedOrgRes.rows[0]),
      });
    } catch (err) {
      console.error('Error updating organisation profile:', err);
      return res.status(500).json({ error: 'Failed to update organisation profile.' });
    }
  }
);

// ── 3. POST /api/organisation/register ──
// Atomic 4-step Organisation + Initial Administrator Registration endpoint
router.post('/register', async (req, res) => {
  try {
    const {
      organisationName,
      orgName,
      displayName = '',
      organisationType,
      orgType,
      industry,
      website = '',
      logo = '',
      description = '',
      yearEstablished = null,
      country,
      state,
      city,
      registeredAddress = '',
      postalCode = '',
      contactEmail,
      contactNumber = '',
      domain,
      companySize,
      size,
      employeeCount,
      departmentCount,
      branchCount = null,
      primaryDepartments = [],
      organisationStructure = 'Centralised',
      // Step 4 Administrator Details
      fullName,
      firstName,
      lastName,
      designation = 'Organisation Administrator',
      email,
      phone = '',
      password,
    } = req.body;

    const finalOrgName = (organisationName || orgName || '').trim();
    const finalOrgType = (organisationType || orgType || '').trim();
    const finalIndustry = (industry || '').trim();
    const finalCountry = (country || '').trim();
    const finalState = (state || '').trim();
    const finalCity = (city || '').trim();
    const finalContactEmail = (contactEmail || email || '').trim().toLowerCase();
    const finalDomain = (domain || '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '');
    const finalSize = (companySize || size || 'Medium').trim();
    const finalAdminEmail = (email || '').trim().toLowerCase();

    let fName = (firstName || '').trim();
    let lName = (lastName || '').trim();
    if (!fName && fullName && fullName.trim()) {
      const parts = fullName.trim().split(/\s+/);
      fName = parts[0];
      lName = parts.length > 1 ? parts.slice(1).join(' ') : '-';
    }

    if (!finalOrgName || !finalOrgType || !finalIndustry) {
      return res.status(400).json({
        error: 'Step 1 Incomplete: Organisation Name, Organisation Type, and Industry are required.',
      });
    }
    if (!finalCountry || !finalState || !finalCity || !finalContactEmail || !finalDomain) {
      return res.status(400).json({
        error: 'Step 2 Incomplete: Country, State/Province, City, Official Contact Email, and Organisation Domain are required.',
      });
    }
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(finalDomain)) {
      return res.status(400).json({ error: 'Please enter a valid Organisation Domain (e.g. company.com).' });
    }
    if (employeeCount === undefined || employeeCount === '' || departmentCount === undefined || departmentCount === '') {
      return res.status(400).json({
        error: 'Step 3 Incomplete: Approximate Employee Count and Number of Departments are required.',
      });
    }
    if (!fName || !finalAdminEmail || !password || !designation.trim()) {
      return res.status(400).json({
        error: 'Step 4 Incomplete: Administrator Full Name, Designation, Official Email, and Password are required.',
      });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(finalAdminEmail)) {
      return res.status(400).json({ error: 'Please enter a valid Administrator email address.' });
    }

    // Check duplicate organisation name or domain
    const dupOrg = await db.query(
      `SELECT id FROM organisations WHERE LOWER(name) = LOWER($1) OR (domain IS NOT NULL AND domain != '' AND LOWER(domain) = LOWER($2))`,
      [finalOrgName, finalDomain]
    );
    if (dupOrg.rows.length > 0) {
      return res.status(409).json({
        error: 'An organisation with this name or domain is already registered.',
      });
    }

    // Check duplicate admin email
    const dupUser = await db.query('SELECT id FROM users WHERE LOWER(email) = $1', [finalAdminEmail]);
    if (dupUser.rows.length > 0) {
      return res.status(409).json({
        error: 'An account with this Administrator email address already exists.',
      });
    }

    // Generate unique orgCode
    let orgCode = '';
    let isUnique = false;
    while (!isUnique) {
      orgCode = cryptoUtils.generateOrgCode();
      const check = await db.query('SELECT id FROM organisations WHERE org_code = $1', [orgCode]);
      if (check.rows.length === 0) isUnique = true;
    }

    const parsedYear = yearEstablished ? parseInt(yearEstablished, 10) : null;
    const parsedEmp = parseInt(employeeCount, 10) || 0;
    const parsedDept = parseInt(departmentCount, 10) || 1;
    const parsedBranch = branchCount ? parseInt(branchCount, 10) : null;

    // Create Organisation
    const newOrgRes = await db.query(
      `INSERT INTO organisations (
         name, display_name, org_code, profile_completed, org_type, industry,
         website, logo_url, description, year_established, domain,
         country, state, city, registered_address, postal_code,
         contact_email, contact_number, size, employee_count, department_count,
         branch_count, primary_departments, organisation_structure, expected_stakeholders, status
       )
       VALUES (
         $1, $2, $3, true, $4, $5,
         $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15,
         $16, $17, $18, $19, $20,
         $21, $22, $23, $19, 'ACTIVE'
       )
       RETURNING *`,
      [
        finalOrgName,
        displayName.trim(),
        orgCode,
        finalOrgType,
        finalIndustry,
        website.trim(),
        logo,
        description.trim(),
        isNaN(parsedYear) ? null : parsedYear,
        finalDomain,
        finalCountry,
        finalState,
        finalCity,
        registeredAddress.trim(),
        postalCode.trim(),
        finalContactEmail,
        contactNumber.trim(),
        finalSize,
        parsedEmp,
        parsedDept,
        isNaN(parsedBranch) ? null : parsedBranch,
        JSON.stringify(parsePrimaryDepartments(primaryDepartments)),
        organisationStructure,
      ]
    );

    const createdOrg = newOrgRes.rows[0];

    // Create Initial Administrator Account safely (rollback org if user insert fails)
    let adminUserId;
    try {
      const hashedPass = await cryptoUtils.hashPassword(password);
      const userInsert = await db.query(
        `INSERT INTO users (
           organisation_id, first_name, last_name, email, phone,
           department, designation, account_status, password_hash, email_verified
         )
         VALUES ($1, $2, $3, $4, $5, 'Executive Governance', $6, 'ACTIVE', $7, true)
         RETURNING id`,
        [
          createdOrg.id,
          fName,
          lName,
          finalAdminEmail,
          (phone || contactNumber || '').trim(),
          designation.trim(),
          hashedPass,
        ]
      );
      adminUserId = userInsert.rows[0].id;
      await db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'ADMIN')`, [adminUserId]);
    } catch (userErr) {
      await db.query('DELETE FROM organisations WHERE id = $1', [createdOrg.id]);
      throw userErr;
    }

    // Log activity
    await db.query(
      `INSERT INTO activity_logs (organisation_id, user_id, action_type, description)
       VALUES ($1, $2, 'ORG_REGISTERED', $3)`,
      [
        createdOrg.id,
        adminUserId,
        `Organisation "${finalOrgName}" registered with initial Administrator ${fName} ${lName}.`,
      ]
    );

    // Dispatch successful registration email with Organisation Code to Administrator
    emailUtils.sendEmail({
      to: finalAdminEmail,
      firstName: fName,
      template: 'ORG_CODE',
      data: {
        orgName: finalOrgName,
        orgCode,
        email: finalAdminEmail,
      },
    });

    const token = authMiddleware.generateToken({
      userId: adminUserId,
      organisation_id: createdOrg.id,
      roles: ['ADMIN'],
      email: finalAdminEmail,
    });

    return res.status(201).json({
      message: 'Organisation and Administrator account created successfully.',
      token,
      user: {
        id: adminUserId,
        firstName: fName,
        lastName: lName,
        email: finalAdminEmail,
        phone: (phone || contactNumber || '').trim(),
        department: 'Executive Governance',
        designation: designation.trim(),
        accountStatus: 'ACTIVE',
        organisationId: createdOrg.id,
        orgName: createdOrg.name,
        displayName: createdOrg.display_name,
        orgCode: createdOrg.org_code,
        roles: ['ADMIN'],
        profileCompleted: true,
        industry: createdOrg.industry,
        size: createdOrg.size,
        orgType: createdOrg.org_type,
        city: createdOrg.city,
        state: createdOrg.state,
        country: createdOrg.country,
        website: createdOrg.website,
        domain: createdOrg.domain,
        logoUrl: createdOrg.logo_url,
        description: createdOrg.description,
        departmentCount: createdOrg.department_count,
        employeeCount: createdOrg.employee_count,
        orgCreatedAt: createdOrg.created_at,
      },
      organisation: formatOrgResponse(createdOrg),
    });
  } catch (err) {
    console.error('Error in POST /api/organisation/register:', err);
    return res.status(500).json({ error: 'Failed to register organisation and administrator.' });
  }
});

export default router;
