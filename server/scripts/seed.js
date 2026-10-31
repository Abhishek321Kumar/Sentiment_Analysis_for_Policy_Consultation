import db from '../db.js';
import cryptoUtils from '../utils/crypto.js';

export async function seedDb() {
  await db.initDb();

  // Check if organisation already exists
  const check = await db.query('SELECT id FROM organisations LIMIT 1');
  if (check.rows.length > 0) {
    console.log('Database already contains data, skipping seed.');
    return;
  }

  console.log('🌱 Seeding PotentPolicy demo data...');

  // 1. Create Organisation
  const orgRes = await db.query(
    `INSERT INTO organisations (
       name, display_name, org_code, profile_completed, industry, size, org_type,
       city, state, country, registered_address, postal_code,
       website, domain, contact_email, contact_number, year_established,
       employee_count, department_count, branch_count, primary_departments, organisation_structure,
       expected_stakeholders, description, status
     )
     VALUES (
       $1, 'PotentPolicy Institute', $2, true, 'Education', 'Large (251–1000 employees)', 'Educational Institution',
       'New Delhi', 'Delhi', 'India', 'Sector 14, Institutional Governance Park, New Delhi', '110016',
       'https://demo.org', 'demo.org', 'contact@demo.org', '+91 11 2659 7135', 1998,
       850, 12, 3, $3, 'Hybrid',
       1200, 'Premier academic institution piloting participatory policy consultations.', 'ACTIVE'
     )
     RETURNING id`,
    [
      'PotentPolicy Demo Institute',
      'DEMOORG2026',
      JSON.stringify([
        'Administration',
        'Research and Development',
        'Information Technology',
        'Human Resources',
        'Finance',
        'Operations',
      ]),
    ]
  );
  const orgId = orgRes.rows[0].id;

  // 2. Create Admin user (admin@demo.org / Demo@1234)
  const adminPass = await cryptoUtils.hashPassword('Demo@1234');
  const adminRes = await db.query(
    `INSERT INTO users (organisation_id, first_name, last_name, email, phone, department, designation, account_status, password_hash, email_verified)
     VALUES ($1, 'Aditi', 'Sharma', 'admin@demo.org', '+91 98765 00001', 'Executive Governance', 'System Administrator', 'ACTIVE', $2, true)
     RETURNING id`,
    [orgId, adminPass]
  );
  const adminId = adminRes.rows[0].id;
  await db.query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2)', [adminId, 'ADMIN']);

  // 3. Create Campaign Manager user (manager@demo.org / Demo@1234)
  const mgrPass = await cryptoUtils.hashPassword('Demo@1234');
  const mgrRes = await db.query(
    `INSERT INTO users (organisation_id, first_name, last_name, email, phone, department, designation, account_status, password_hash, email_verified)
     VALUES ($1, 'Rohan', 'Verma', 'manager@demo.org', '+91 98765 00002', 'Policy & Strategy', 'Senior Policy Lead', 'ACTIVE', $2, true)
     RETURNING id`,
    [orgId, mgrPass]
  );
  const mgrId = mgrRes.rows[0].id;
  await db.query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2)', [mgrId, 'CAMPAIGN_MANAGER']);

  // 4. Create 10 Rich Stakeholders in Central Directory
  const stakeholdersData = [
    {
      firstName: 'Ananya',
      lastName: 'Patel',
      email: 'stakeholder@demo.org',
      alternateEmail: 'ananya.personal@gmail.com',
      contact: '+91 98765 11111',
      department: 'School of Engineering',
      designation: 'Senior Professor',
      category: 'Faculty',
      employeeId: 'EMP-1001',
      notes: 'Lead coordinator for campus sustainability initiatives.',
    },
    {
      firstName: 'Priya',
      lastName: 'Nair',
      email: 'priya.nair@demo.org',
      alternateEmail: 'priya.n@gmail.com',
      contact: '+91 98765 22222',
      department: 'School of Business',
      designation: 'Associate Dean',
      category: 'Department Head',
      employeeId: 'EMP-1002',
      notes: 'Chairs the curriculum and academic operations board.',
    },
    {
      firstName: 'Vikram',
      lastName: 'Singh',
      email: 'vikram.singh@demo.org',
      alternateEmail: '',
      contact: '+91 98765 33333',
      department: 'School of Engineering',
      designation: 'Associate Professor',
      category: 'Faculty',
      employeeId: 'EMP-1003',
      notes: 'Specializes in renewable energy systems.',
    },
    {
      firstName: 'Sneha',
      lastName: 'Rao',
      email: 'sneha.rao@demo.org',
      alternateEmail: 'sneha.hr@gmail.com',
      contact: '+91 98765 44444',
      department: 'Human Resources',
      designation: 'HR Director',
      category: 'Department Head',
      employeeId: 'EMP-1004',
      notes: 'Oversees staff welfare and remote work policies.',
    },
    {
      firstName: 'Karan',
      lastName: 'Mehta',
      email: 'karan.mehta@demo.org',
      alternateEmail: '',
      contact: '+91 98765 55555',
      department: 'Student Affairs',
      designation: 'Student Council President',
      category: 'Student',
      employeeId: 'STU-2045',
      notes: 'Elected student body representative for 2026.',
    },
    {
      firstName: 'Dr. Aravind',
      lastName: 'Iyer',
      email: 'aravind.iyer@demo.org',
      alternateEmail: '',
      contact: '+91 98765 66666',
      department: 'School of Engineering',
      designation: 'Head of Department',
      category: 'Department Head',
      employeeId: 'EMP-1005',
      notes: 'Department chair for Computer Science & Engineering.',
    },
    {
      firstName: 'Meera',
      lastName: 'Krishnan',
      email: 'meera.krishnan@demo.org',
      alternateEmail: 'meera.k@outlook.com',
      contact: '+91 98765 77777',
      department: 'Legal & Compliance',
      designation: 'Legal Counsel',
      category: 'Employee',
      employeeId: 'EMP-1006',
      notes: 'Reviews statutory compliance of institutional policies.',
    },
    {
      firstName: 'Rahul',
      lastName: 'Deshmukh',
      email: 'rahul.deshmukh@demo.org',
      alternateEmail: '',
      contact: '+91 98765 88888',
      department: 'Campus Operations',
      designation: 'Facilities Manager',
      category: 'Employee',
      employeeId: 'EMP-1007',
      notes: 'Manages dining halls, energy grid, and waste management.',
    },
    {
      firstName: 'Zoya',
      lastName: 'Khan',
      email: 'zoya.khan@demo.org',
      alternateEmail: '',
      contact: '+91 98765 99999',
      department: 'Student Affairs',
      designation: 'Postgraduate Representative',
      category: 'Student',
      employeeId: 'STU-3012',
      notes: 'Represents research scholars and hostel residents.',
    },
    {
      firstName: 'Sandeep',
      lastName: 'Malhotra',
      email: 'sandeep.malhotra@ecovendors.in',
      alternateEmail: '',
      contact: '+91 98111 22334',
      department: 'Procurement & Supply',
      designation: 'Vendor Partner Lead',
      category: 'External Partner',
      employeeId: 'EXT-042',
      notes: ' Green solar equipment & sustainable catering supplier.',
    },
  ];

  const stakeholderIds = [];
  for (let idx = 0; idx < stakeholdersData.length; idx++) {
    const s = stakeholdersData[idx];
    // Seed first 8 as ACTIVE, 1 as NOT_REGISTERED, 1 as INACTIVE to showcase all 3 directory statuses
    const seedStatus = idx === 8 ? 'NOT_REGISTERED' : idx === 9 ? 'INACTIVE' : 'ACTIVE';
    const seedIsActive = seedStatus === 'ACTIVE';
    const res = await db.query(
      `INSERT INTO stakeholders (organisation_id, first_name, last_name, email, alternate_email, contact, department, designation, category, employee_id, notes, is_active, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [
        orgId,
        s.firstName,
        s.lastName,
        s.email,
        s.alternateEmail || null,
        s.contact,
        s.department,
        s.designation,
        s.category,
        s.employeeId,
        s.notes,
        seedIsActive,
        seedStatus,
      ]
    );
    stakeholderIds.push(res.rows[0].id);
  }

  // 5. Create OPEN Campaign with 3 Questions
  const now = new Date();
  const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
  const twentyDaysLater = new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000);

  const openCampRes = await db.query(
    `INSERT INTO campaigns (organisation_id, campaign_code, title, description, objectives, created_by, opening_date, closing_date, status)
     VALUES ($1, 'CAMP2026', 'Campus Sustainability & Green Energy Policy 2026',
             'Structured institutional consultation on transitioning university facilities to renewable solar energy, composting, and plastic-free dining zones.',
             'Achieve 60% clean energy adoption by Q4 2026 and eliminate single-use plastics across all academic and residential zones.',
             $2, $3, $4, 'OPEN')
     RETURNING id`,
    [orgId, mgrId, fiveDaysAgo, twentyDaysLater]
  );
  const openCampId = openCampRes.rows[0].id;

  const q1 = await db.query(
    'INSERT INTO campaign_questions (campaign_id, question_text, question_order) VALUES ($1, $2, 1) RETURNING id',
    [openCampId, 'What priority should be given to replacing single-use plastics across campus dining halls?']
  );
  const q2 = await db.query(
    'INSERT INTO campaign_questions (campaign_id, question_text, question_order) VALUES ($1, $2, 2) RETURNING id',
    [openCampId, 'How feasible is the proposed timeline for installing rooftop solar panels across department buildings?']
  );
  const q3 = await db.query(
    'INSERT INTO campaign_questions (campaign_id, question_text, question_order) VALUES ($1, $2, 3) RETURNING id',
    [openCampId, 'What additional sustainability initiatives should the administration consider incorporating?']
  );

  // Enroll first 6 stakeholders as participants in OPEN campaign
  for (let i = 0; i < 6; i++) {
    const shId = stakeholderIds[i];
    const isSubmitted = i < 3; // First 3 submitted comments
    await db.query(
      `INSERT INTO campaign_participants (campaign_id, stakeholder_id, invitation_status, submitted_at)
       VALUES ($1, $2, $3, $4)`,
      [openCampId, shId, isSubmitted ? 'SUBMITTED' : 'SENT', isSubmitted ? new Date() : null]
    );
  }

  // Add sample comments to OPEN campaign
  await db.query(
    `INSERT INTO comments (campaign_id, question_id, stakeholder_id, text, sentiment, created_at)
     VALUES ($1, $2, $3, 'Completely replacing single-use plastics is urgent and must happen before the next semester begins.', 'Positive', NOW() - INTERVAL '2 days')`,
    [openCampId, q1.rows[0].id, stakeholderIds[0]]
  );
  await db.query(
    `INSERT INTO comments (campaign_id, question_id, stakeholder_id, text, sentiment, created_at)
     VALUES ($1, $2, $3, 'The proposed solar installation schedule looks realistic, but exams periods should be avoided for noisy roof work.', 'Neutral', NOW() - INTERVAL '1 day')`,
    [openCampId, q2.rows[0].id, stakeholderIds[1]]
  );
  await db.query(
    `INSERT INTO comments (campaign_id, question_id, stakeholder_id, text, sentiment, created_at)
     VALUES ($1, $2, $3, 'We should introduce designated e-waste recycling bins and rainwater harvesting near the sports complex.', 'Positive', NOW() - INTERVAL '3 hours')`,
    [openCampId, q3.rows[0].id, stakeholderIds[2]]
  );

  // 6. Create DRAFT Campaign with 2 Questions
  const draftOpening = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const draftClosing = new Date(now.getTime() + 16 * 24 * 60 * 60 * 1000);

  const draftCampRes = await db.query(
    `INSERT INTO campaigns (organisation_id, campaign_code, title, description, objectives, created_by, opening_date, closing_date, status)
     VALUES ($1, 'DRAFT101', 'Hybrid Faculty Work & Flexible Consultation Hours',
             'Draft guidelines on department core operational hours, digital office hours, and hybrid work allowances.',
             'Establish balanced flexibility for faculty while ensuring consistent student advisory access.',
             $2, $3, $4, 'DRAFT')
     RETURNING id`,
    [orgId, mgrId, draftOpening, draftClosing]
  );
  const draftCampId = draftCampRes.rows[0].id;

  await db.query(
    'INSERT INTO campaign_questions (campaign_id, question_text, question_order) VALUES ($1, $2, 1)',
    [draftCampId, 'How many remote consultation hours per week would best balance student accessibility and research commitments?']
  );
  await db.query(
    'INSERT INTO campaign_questions (campaign_id, question_text, question_order) VALUES ($1, $2, 2)',
    [draftCampId, 'What core physical hours should departments maintain for laboratory and in-person advisory support?']
  );

  // Enroll 2 stakeholders into draft (PENDING status since draft not yet opened)
  await db.query(
    `INSERT INTO campaign_participants (campaign_id, stakeholder_id, invitation_status) VALUES ($1, $2, 'PENDING')`,
    [draftCampId, stakeholderIds[0]]
  );
  await db.query(
    `INSERT INTO campaign_participants (campaign_id, stakeholder_id, invitation_status) VALUES ($1, $2, 'PENDING')`,
    [draftCampId, stakeholderIds[1]]
  );

  // 7. Create a Completed (CLOSED) Campaign for realistic Admin Dashboard metrics
  const pastOpening = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const pastClosing = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

  const closedCampRes = await db.query(
    `INSERT INTO campaigns (organisation_id, campaign_code, title, description, objectives, created_by, opening_date, closing_date, status)
     VALUES ($1, 'ARCH2025', 'Annual Research Data Security & AI Usage Charter',
             'Completed institutional consultation regarding ethical generative AI usage in academic research and data privacy.',
             'Formulate clear institutional boundaries on AI tooling and research data storage.',
             $2, $3, $4, 'CLOSED')
     RETURNING id`,
    [orgId, mgrId, pastOpening, pastClosing]
  );
  const closedCampId = closedCampRes.rows[0].id;

  const cq1 = await db.query(
    'INSERT INTO campaign_questions (campaign_id, question_text, question_order) VALUES ($1, $2, 1) RETURNING id',
    [closedCampId, 'Should disclosure of AI assistance be mandatory in internal grant proposals and dissertations?']
  );

  await db.query(
    `INSERT INTO campaign_participants (campaign_id, stakeholder_id, invitation_status, submitted_at)
     VALUES ($1, $2, 'SUBMITTED', NOW() - INTERVAL '15 days')`,
    [closedCampId, stakeholderIds[5]]
  );
  await db.query(
    `INSERT INTO comments (campaign_id, question_id, stakeholder_id, text, sentiment, created_at)
     VALUES ($1, $2, $3, 'Mandatory disclosure ensures academic transparency without stifling productivity.', 'Positive', NOW() - INTERVAL '15 days')`,
    [closedCampId, cq1.rows[0].id, stakeholderIds[5]]
  );

  // 8. Seed Activity Logs for Administrator Dashboard
  const activities = [
    {
      userId: adminId,
      actionType: 'MANAGER_ADDED',
      description: 'Campaign Manager Rohan Verma (Policy & Strategy) enrolled into organisation.',
    },
    {
      userId: adminId,
      actionType: 'STAKEHOLDER_ADDED',
      description: '10 institutional stakeholders registered in Central Stakeholder Directory across 6 departments.',
    },
    {
      userId: mgrId,
      actionType: 'CAMPAIGN_COMPLETED',
      description: 'Consultation "Annual Research Data Security & AI Usage Charter" (ARCH2025) completed.',
    },
    {
      userId: mgrId,
      actionType: 'CAMPAIGN_CREATED',
      description: 'Consultation "Campus Sustainability & Green Energy Policy 2026" (CAMP2026) launched with 6 stakeholders.',
    },
    {
      userId: mgrId,
      actionType: 'CAMPAIGN_CREATED',
      description: 'Draft campaign "Hybrid Faculty Work & Flexible Consultation Hours" (DRAFT101) created.',
    },
  ];

  for (const act of activities) {
    await db.query(
      `INSERT INTO activity_logs (organisation_id, user_id, action_type, description)
       VALUES ($1, $2, $3, $4)`,
      [orgId, act.userId, act.actionType, act.description]
    );
  }

  console.log('✅ Seed completed successfully!');
  console.log('   Admin: admin@demo.org / Demo@1234');
  console.log('   Manager: manager@demo.org / Demo@1234');
  console.log('   Stakeholder: stakeholder@demo.org (Campaign Code: CAMP2026)');
  console.log('   Organisation Code: DEMOORG2026');
}

// Standalone execution
if (process.argv[1]?.endsWith('seed.js')) {
  seedDb().then(() => process.exit(0)).catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}

export default seedDb;
