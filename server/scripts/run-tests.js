import authMiddleware from '../middleware/auth.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runTestSuite() {
  console.log('🧪 Running PotentPolicy Stage 1 Verification Tests against API Server...\n');

  const BASE_URL = 'http://localhost:5000/api';

  // 1. Log in as Seeded Admin
  const adminLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@demo.org', password: 'Demo@1234' }),
  });
  const adminLoginJson = await adminLoginRes.json();
  const adminToken = adminLoginJson.token;
  const orgCode = adminLoginJson.user.orgCode || 'DEMOORG2026';

  // 2. Log in as Seeded Manager
  const mgrLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'manager@demo.org', password: 'Demo@1234' }),
  });
  const mgrLoginJson = await mgrLoginRes.json();
  const mgrToken = mgrLoginJson.token;

  // ── TEST 1: Manager registration works only with a matching pending invitation (and is single-use) ──
  console.log('Test 1: Manager registration validation and single-use enforcement');
  try {
    // Attempt registration with uninvited email
    const uninvitedRes = await fetch(`${BASE_URL}/auth/register-manager`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Hacker',
        lastName: 'User',
        email: 'uninvited@attacker.com',
        phone: '1234567890',
        password: 'Password@123',
        orgCode: orgCode,
      }),
    });
    const uninvitedJson = await uninvitedRes.json();
    assert(uninvitedRes.status === 400 && uninvitedJson.error.includes('Invalid registration details'),
      'Uninvited email refused with generic error even with valid org code');

    // Admin invites a new manager via POST /api/members/managers
    const inviteEmail = `test.manager.${Date.now()}@demo.org`;
    const inviteRes = await fetch(`${BASE_URL}/members/managers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        firstName: 'Invited',
        lastName: 'Person',
        email: inviteEmail,
        phone: '9876543210',
      }),
    });
    assert(inviteRes.status === 201, 'Admin successfully invites new manager');

    // Register with matching invitation
    const validReg = await fetch(`${BASE_URL}/auth/register-manager`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Invited',
        lastName: 'Person',
        email: inviteEmail,
        phone: '9876543210',
        password: 'ValidPassword@123',
        orgCode: orgCode,
      }),
    });
    const validJson = await validReg.json();
    assert(validReg.status === 201 && validJson.token && validJson.user.roles.includes('CAMPAIGN_MANAGER'),
      'Invited manager registers successfully with valid token');

    // Attempt to register again with same invitation (single-use check)
    const reuseReg = await fetch(`${BASE_URL}/auth/register-manager`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Invited',
        lastName: 'Person',
        email: inviteEmail,
        phone: '9876543210',
        password: 'AnotherPassword@123',
        orgCode: orgCode,
      }),
    });
    assert(reuseReg.status === 400, 'Re-using already accepted invitation is strictly refused');
  } catch (e) {
    console.error('Test 1 error:', e.message);
    failed++;
  }

  // ── TEST 2: Admin gets 403 creating or editing campaigns ──
  console.log('\nTest 2: Role restrictions (Admin cannot create or edit campaigns)');
  try {
    const createAttempt = await fetch(`${BASE_URL}/campaigns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Admin Created Campaign',
        openingDate: new Date(),
        closingDate: new Date(Date.now() + 86400000),
        questions: [{ text: 'Question 1?' }],
      }),
    });
    assert(createAttempt.status === 403, 'Admin gets 403 Forbidden attempting to create a campaign');

    // Find existing campaign
    const campsRes = await fetch(`${BASE_URL}/campaigns`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const campsJson = await campsRes.json();
    const camp = campsJson.campaigns[0];

    const editAttempt = await fetch(`${BASE_URL}/campaigns/${camp.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Admin Modified Title',
        openingDate: new Date(),
        closingDate: new Date(Date.now() + 86400000),
        questions: [{ text: 'Modified question?' }],
      }),
    });
    assert(editAttempt.status === 403, 'Admin gets 403 Forbidden attempting to edit a campaign');
  } catch (e) {
    console.error('Test 2 error:', e.message);
    failed++;
  }

  // ── TEST 3: Manager cannot access another manager's campaign ──
  console.log("\nTest 3: Manager ownership boundary (Cannot access another manager's campaign)");
  try {
    // Invite and register Manager 2
    const mgr2Email = `manager2.${Date.now()}@demo.org`;
    await fetch(`${BASE_URL}/members/managers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        firstName: 'Second',
        lastName: 'Manager',
        email: mgr2Email,
        phone: '1122334455',
      }),
    });

    const regMgr2 = await fetch(`${BASE_URL}/auth/register-manager`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Second',
        lastName: 'Manager',
        email: mgr2Email,
        phone: '1122334455',
        password: 'Demo@1234',
        orgCode: orgCode,
      }),
    });
    const regMgr2Json = await regMgr2.json();
    const mgr2Token = regMgr2Json.token;

    // Manager 1 creates a campaign
    const createCampRes = await fetch(`${BASE_URL}/campaigns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mgrToken}`,
      },
      body: JSON.stringify({
        title: "Manager 1's Private Campaign",
        openingDate: new Date(),
        closingDate: new Date(Date.now() + 86400000),
        questions: [{ text: 'Is this private?' }],
      }),
    });
    const createdCamp = (await createCampRes.json()).campaign;

    // Manager 2 tries to access Manager 1's campaign
    const accessRes = await fetch(`${BASE_URL}/campaigns/${createdCamp.id}`, {
      headers: { Authorization: `Bearer ${mgr2Token}` },
    });
    assert(accessRes.status === 403, "Manager 2 gets 403 Forbidden accessing Manager 1's campaign");

    // Manager 2 tries to delete Manager 1's campaign
    const delRes = await fetch(`${BASE_URL}/campaigns/${createdCamp.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${mgr2Token}` },
    });
    assert(delRes.status === 403, "Manager 2 gets 403 Forbidden deleting Manager 1's campaign");
  } catch (e) {
    console.error('Test 3 error:', e.message);
    failed++;
  }

  // ── TEST 4: Entry check (listed vs unlisted email, closed campaign, removed stakeholder) ──
  console.log('\nTest 4: Consultation entry checks & stakeholder eligibility');
  try {
    // Listed email on OPEN campaign (CAMP2026)
    const listedRes = await fetch(`${BASE_URL}/participate/enter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignCode: 'CAMP2026',
        email: 'stakeholder@demo.org',
      }),
    });
    const listedJson = await listedRes.json();
    assert(listedRes.status === 200 && listedJson.token && listedJson.questions.length > 0,
      'Listed stakeholder receives participation token and questions');

    // Unlisted email on OPEN campaign
    const unlistedRes = await fetch(`${BASE_URL}/participate/enter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignCode: 'CAMP2026',
        email: 'stranger@outside.com',
      }),
    });
    assert(unlistedRes.status === 400, 'Unlisted email is refused with generic error');

    // Attempt entry to DRAFT campaign (DRAFT101)
    const draftRes = await fetch(`${BASE_URL}/participate/enter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignCode: 'DRAFT101',
        email: 'stakeholder@demo.org',
      }),
    });
    assert(draftRes.status === 400, 'Entry to non-OPEN (DRAFT) campaign is refused');

    // Rule: "A stakeholder later removed from the org (is_active=false) stays eligible for campaigns they were already selected for"
    // Fetch members to find stakeholder@demo.org id
    const membersRes = await fetch(`${BASE_URL}/members`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const membersJson = await membersRes.json();
    const targetSh = membersJson.stakeholders.find(s => s.email === 'stakeholder@demo.org');

    // Admin soft-removes stakeholder
    const removeRes = await fetch(`${BASE_URL}/members/stakeholders/${targetSh.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(removeRes.status === 200, 'Admin deactivates stakeholder from org');

    // Stakeholder should STILL be allowed to enter the campaign they were already selected for!
    const removedStillAllowed = await fetch(`${BASE_URL}/participate/enter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignCode: 'CAMP2026',
        email: 'stakeholder@demo.org',
      }),
    });
    assert(removedStillAllowed.status === 200, 'Stakeholder removed from org (is_active=false) stays eligible for already-selected campaign');
  } catch (e) {
    console.error('Test 4 error:', e.message);
    failed++;
  }

  // ── TEST 5: Tenant isolation (Org A cannot read Org B) ──
  console.log('\nTest 5: Multi-tenant isolation');
  try {
    // Register a new independent organisation and admin: Org B
    const orgBEmail = `admin.orgb.${Date.now()}@corporate-test.org`;
    const orgBName = `Independent Org B ${Date.now()}`;
    const regOrgBRes = await fetch(`${BASE_URL}/auth/register-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgName: orgBName,
        firstName: 'Barbara',
        lastName: 'Smith',
        email: orgBEmail,
        phone: '1122334455',
        password: 'Password@123',
      }),
    });
    assert(regOrgBRes.status === 201, 'Org B admin registered');

    // Fetch OTP from dev outbox (allow background email capture write)
    await new Promise(r => setTimeout(r, 250));
    const devEmailsRes = await fetch(`${BASE_URL}/dev/emails`);
    const devEmailsJson = await devEmailsRes.json();
    const otpEmail = (devEmailsJson.emails || []).find(e => e.to_email === orgBEmail);
    const otpMatch = otpEmail ? otpEmail.body.match(/\b\d{6}\b/) : null;
    const otp = otpMatch ? otpMatch[0] : '123456';

    // Verify OTP for Org B
    const verifyBRes = await fetch(`${BASE_URL}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: orgBEmail, otp }),
    });
    const verifyBJson = await verifyBRes.json();
    const orgBToken = verifyBJson.token;

    // Complete Org B profile
    await fetch(`${BASE_URL}/organisation/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${orgBToken}`,
      },
      body: JSON.stringify({
        industry: 'Technology',
        size: 'Medium',
        orgType: 'Corporate',
        city: 'Mumbai',
        country: 'India',
      }),
    });

    // Org B admin fetches campaigns (should be 0, isolated from Org A)
    const orgBCampaigns = await fetch(`${BASE_URL}/campaigns`, {
      headers: { Authorization: `Bearer ${orgBToken}` },
    });
    const orgBJson = await orgBCampaigns.json();
    assert(orgBCampaigns.status === 200 && orgBJson.campaigns.length === 0,
      'Org B cannot read any campaigns belonging to Org A (Strict tenant isolation)');

    // Org B admin attempts to read Org A campaign directly by ID
    const directRead = await fetch(`${BASE_URL}/campaigns/1`, {
      headers: { Authorization: `Bearer ${orgBToken}` },
    });
    assert(directRead.status === 404, 'Direct access across tenant boundary returns 404 Not Found');
  } catch (e) {
    console.error('Test 5 error:', e.message);
    failed++;
  }

  // ── TEST 6: Manager 409 when deleting campaign with responses ──
  console.log('\nTest 6: Interim deletion rules');
  try {
    // Seeded campaign CAMP2026 has responses
    const campsRes = await fetch(`${BASE_URL}/campaigns`, {
      headers: { Authorization: `Bearer ${mgrToken}` },
    });
    const campsJson = await campsRes.json();
    const campWithResponses = campsJson.campaigns.find(c => c.campaign_code === 'CAMP2026');

    const delRes = await fetch(`${BASE_URL}/campaigns/${campWithResponses.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${mgrToken}` },
    });
    const delJson = await delRes.json();
    assert(delRes.status === 409 && delJson.error.includes('administrator approval'),
      'Manager gets 409 with approval message when deleting campaign with comments');
  } catch (e) {
    console.error('Test 6 error:', e.message);
    failed++;
  }

  // ── TEST 7: Administrator Module — Stats, Bulk CSV Import, Manager Status, Stakeholder Selection ──
  console.log('\nTest 7: Administrator Module & Central Stakeholder Directory integration');
  try {
    // 7a. Admin fetches dashboard summary metrics
    const statsRes = await fetch(`${BASE_URL}/members/stats`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const statsJson = await statsRes.json();
    assert(
      statsRes.status === 200 &&
      typeof statsJson.stats.totalCampaignManagers === 'number' &&
      typeof statsJson.stats.totalStakeholders === 'number' &&
      typeof statsJson.stats.totalFeedbackSubmissions === 'number',
      'Admin dashboard summary metrics return valid database counts'
    );

    // 7b. Bulk CSV Stakeholder Import
    const bulkRes = await fetch(`${BASE_URL}/members/stakeholders/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        stakeholders: [
          {
            fullName: 'Dr. Bulk Imported',
            email: `bulk1.${Date.now()}@demo.org`,
            department: 'Data Science',
            designation: 'Lead Scientist',
            category: 'Faculty',
            employeeId: 'BULK-01',
          },
          {
            fullName: 'Custom Cat Member',
            email: `bulk2.${Date.now()}@demo.org`,
            department: 'Legal',
            designation: 'Advisory Counsel',
            category: 'External Legal Counsel',
            employeeId: 'BULK-02',
          },
        ],
      }),
    });
    const bulkJson = await bulkRes.json();
    assert(
      bulkRes.status === 201 && bulkJson.summary.addedCount === 2,
      'Bulk CSV import enrolls multiple stakeholders including custom categories'
    );

    // 7b-verify. Verify newly added stakeholder starts as not_registered and transitions to active via /participate/verify-stakeholder
    const verifyShRes = await fetch(`${BASE_URL}/participate/verify-stakeholder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'BULK-01',
        orgCode: orgCode,
      }),
    });
    const verifyShJson = await verifyShRes.json();
    assert(
      verifyShRes.status === 200 && verifyShJson.stakeholder.status.toUpperCase() === 'ACTIVE',
      'Stakeholder verification link + Org Code transitions stakeholder from Not Registered to Active'
    );

    // 7b-privacy. Admin cannot view individual stakeholder feedback or sentiment classification (GET /campaigns/1/responses -> 403)
    const adminRespAttempt = await fetch(`${BASE_URL}/campaigns/1/responses`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(
      adminRespAttempt.status === 403,
      'Administrator is strictly blocked (403) from viewing individual stakeholder feedback & sentiment classification'
    );

    // 7c. Campaign Manager can read active-only directory stakeholders (and cannot create stakeholders)
    const mgrShRes = await fetch(`${BASE_URL}/members/stakeholders`, {
      headers: { Authorization: `Bearer ${mgrToken}` },
    });
    const mgrShJson = await mgrShRes.json();
    const allActive = mgrShJson.stakeholders.every(s => s.is_active === true);
    assert(
      mgrShRes.status === 200 && allActive && mgrShJson.stakeholders.length > 0,
      'Campaign Manager can browse active stakeholders from central directory'
    );

    const mgrAddShAttempt = await fetch(`${BASE_URL}/members/stakeholders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mgrToken}`,
      },
      body: JSON.stringify({
        fullName: 'Unauthorized Stakeholder',
        email: 'unauth@demo.org',
      }),
    });
    assert(
      mgrAddShAttempt.status === 403,
      'Campaign Manager is strictly forbidden (403) from creating central directory stakeholders'
    );
  } catch (e) {
    console.error('Test 7 error:', e.message);
    failed++;
  }

  // ── TEST 8: 4-Step Organisation Registration, Profile Management & Duplicate Safeguards ──
  console.log('\nTest 8: 4-Step Organisation Registration, Profile Management & Duplicate Safeguards');
  try {
    // 8a. Fetch & update existing Organisation Profile via GET/PUT /api/organisation/profile
    const getOrgRes = await fetch(`${BASE_URL}/organisation/profile`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const getOrgJson = await getOrgRes.json();
    assert(
      getOrgRes.status === 200 &&
        getOrgJson.organisation.name === 'PotentPolicy Demo Institute' &&
        Array.isArray(getOrgJson.organisation.primaryDepartments),
      'GET /api/organisation/profile returns complete institutional metadata and primaryDepartments array'
    );

    const updateOrgRes = await fetch(`${BASE_URL}/organisation/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'PotentPolicy Demo Institute',
        displayName: 'PotentPolicy Institute',
        orgType: 'Educational Institution',
        industry: 'Education',
        website: 'https://demo.org',
        yearEstablished: 1998,
        country: 'India',
        state: 'Delhi',
        city: 'New Delhi',
        contactEmail: 'contact@demo.org',
        domain: 'demo.org',
        size: 'Large (251–1000 employees)',
        employeeCount: 900,
        departmentCount: 14,
        branchCount: 4,
        primaryDepartments: ['Administration', 'Information Technology', 'Human Resources', 'Policy Lab'],
        organisationStructure: 'Hybrid',
      }),
    });
    const updateOrgJson = await updateOrgRes.json();
    assert(
      updateOrgRes.status === 200 &&
        updateOrgJson.organisation.departmentCount === 14 &&
        updateOrgJson.organisation.primaryDepartments.includes('Policy Lab'),
      'PUT /api/organisation/profile updates 4-step wizard fields including custom primary departments'
    );

    // 8b. Atomic 4-step Organisation + Initial Administrator registration (POST /api/organisation/register)
    const uniqueSuffix = Date.now();
    const newOrgEmail = `founder.${uniqueSuffix}@zenith-corp.com`;
    const newOrgDomain = `zenith-${uniqueSuffix}.com`;
    const newOrgName = `Zenith Global Systems ${uniqueSuffix}`;

    const atomicRegRes = await fetch(`${BASE_URL}/organisation/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organisationName: newOrgName,
        displayName: 'Zenith Global',
        organisationType: 'Private Company',
        industry: 'Information Technology',
        website: 'https://zenith.example.com',
        yearEstablished: 2015,
        country: 'India',
        state: 'Karnataka',
        city: 'Bengaluru',
        registeredAddress: '100 Tech Park Road',
        postalCode: '560001',
        contactEmail: newOrgEmail,
        contactNumber: '+91 98888 77777',
        domain: newOrgDomain,
        companySize: 'Medium (51–250 employees)',
        employeeCount: 180,
        departmentCount: 6,
        branchCount: 2,
        primaryDepartments: ['Information Technology', 'Operations', 'Human Resources'],
        organisationStructure: 'Centralised',
        fullName: 'Vikramaditya Rao',
        designation: 'Chief Executive & Admin',
        email: newOrgEmail,
        phone: '+91 98888 77777',
        password: 'Password@123',
      }),
    });
    const atomicRegJson = await atomicRegRes.json();
    assert(
      atomicRegRes.status === 201 &&
        atomicRegJson.token &&
        atomicRegJson.user.roles.includes('ADMIN') &&
        atomicRegJson.organisation.domain === newOrgDomain,
      'POST /api/organisation/register creates Organisation + Initial Administrator with ADMIN role'
    );

    // 8c. Duplicate Organisation Name or Domain is rejected (409)
    const dupOrgAttempt = await fetch(`${BASE_URL}/organisation/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organisationName: newOrgName,
        organisationType: 'Private Company',
        industry: 'Information Technology',
        country: 'India',
        state: 'Karnataka',
        city: 'Bengaluru',
        contactEmail: `other.${uniqueSuffix}@zenith-corp.com`,
        domain: newOrgDomain,
        companySize: 'Medium (51–250 employees)',
        employeeCount: 100,
        departmentCount: 4,
        fullName: 'Another Person',
        designation: 'Director',
        email: `other.${uniqueSuffix}@zenith-corp.com`,
        password: 'Password@123',
      }),
    });
    assert(
      dupOrgAttempt.status === 409,
      'Duplicate organisation registration (same name or domain) is rejected with 409 Conflict'
    );

    // 8d. Login with newly created Administrator credentials succeeds
    const loginNewAdmin = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: newOrgEmail,
        password: 'Password@123',
      }),
    });
    const loginNewAdminJson = await loginNewAdmin.json();
    assert(
      loginNewAdmin.status === 200 &&
        loginNewAdminJson.user.orgName === newOrgName &&
        loginNewAdminJson.user.departmentCount === 6,
      'Newly registered Administrator can sign in and receives complete organisation metadata'
    );
  } catch (e) {
    console.error('Test 8 error:', e.message);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`📊 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(e => {
  console.error('Test suite failed:', e);
  process.exit(1);
});
