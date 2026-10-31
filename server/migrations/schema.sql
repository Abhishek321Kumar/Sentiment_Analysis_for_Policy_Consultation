-- PotentPolicy Database Schema (Interim Demo Build - Stage 1)
-- Multi-tenant architecture with tenant isolation via organisation_id

CREATE TABLE IF NOT EXISTS organisations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  org_code VARCHAR(16) UNIQUE,
  profile_completed BOOLEAN DEFAULT FALSE,
  industry VARCHAR(100),
  size VARCHAR(100),
  org_type VARCHAR(100),
  website VARCHAR(255),
  logo_url TEXT,
  description TEXT,
  year_established INT,
  domain VARCHAR(255),
  country VARCHAR(100),
  state VARCHAR(100),
  city VARCHAR(100),
  registered_address TEXT,
  postal_code VARCHAR(50),
  contact_email VARCHAR(255),
  contact_number VARCHAR(50),
  employee_count INT,
  department_count INT,
  branch_count INT,
  primary_departments TEXT,
  organisation_structure VARCHAR(50),
  expected_stakeholders INT,
  status VARCHAR(30) DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  organisation_id INT REFERENCES organisations(id) ON DELETE CASCADE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  department VARCHAR(100) DEFAULT 'General',
  designation VARCHAR(100),
  account_status VARCHAR(20) DEFAULT 'ACTIVE',
  password_hash VARCHAR(255) NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_org_user_email UNIQUE (organisation_id, email)
);

CREATE TABLE IF NOT EXISTS user_roles (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL,
  CONSTRAINT unique_user_role UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS email_otps (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  otp_hash VARCHAR(255) NOT NULL,
  attempts INT DEFAULT 0,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(50),
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS manager_invitations (
  id SERIAL PRIMARY KEY,
  organisation_id INT REFERENCES organisations(id) ON DELETE CASCADE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  department VARCHAR(100) DEFAULT 'General',
  designation VARCHAR(100),
  status VARCHAR(50) DEFAULT 'PENDING',
  invited_by INT REFERENCES users(id),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stakeholders (
  id SERIAL PRIMARY KEY,
  organisation_id INT REFERENCES organisations(id) ON DELETE CASCADE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  alternate_email VARCHAR(255),
  contact VARCHAR(50),
  department VARCHAR(100) DEFAULT 'General',
  designation VARCHAR(100),
  category VARCHAR(100) DEFAULT 'Employee',
  employee_id VARCHAR(50),
  notes TEXT,
  is_active BOOLEAN DEFAULT FALSE,
  status VARCHAR(30) DEFAULT 'NOT_REGISTERED',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_org_stakeholder_email UNIQUE (organisation_id, email)
);

CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  organisation_id INT REFERENCES organisations(id) ON DELETE CASCADE,
  campaign_code VARCHAR(16) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  objectives TEXT,
  created_by INT REFERENCES users(id),
  opening_date TIMESTAMP NOT NULL,
  closing_date TIMESTAMP NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED', 'DELETION_REQUESTED', 'DELETED')),
  previous_status VARCHAR(50),
  deletion_requested_by INT,
  deletion_requested_at TIMESTAMP,
  deleted_by INT,
  deleted_at TIMESTAMP,
  deletion_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaign_questions (
  id SERIAL PRIMARY KEY,
  campaign_id INT REFERENCES campaigns(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_order INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaign_participants (
  id SERIAL PRIMARY KEY,
  campaign_id INT REFERENCES campaigns(id) ON DELETE CASCADE,
  stakeholder_id INT REFERENCES stakeholders(id) ON DELETE CASCADE,
  invitation_token VARCHAR(64),
  invitation_status VARCHAR(20) DEFAULT 'SENT',
  invited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  submitted_at TIMESTAMP,
  CONSTRAINT unique_campaign_participant UNIQUE (campaign_id, stakeholder_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY,
  campaign_id INT REFERENCES campaigns(id) ON DELETE CASCADE,
  question_id INT REFERENCES campaign_questions(id) ON DELETE CASCADE,
  stakeholder_id INT REFERENCES stakeholders(id),
  text TEXT NOT NULL,
  sentiment VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  organisation_id INT REFERENCES organisations(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  action_type VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dev_emails (
  id SERIAL PRIMARY KEY,
  to_email VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  template VARCHAR(100),
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Safe forward-compatible migrations for existing databases
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS display_name VARCHAR(255);
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS year_established INT;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS domain VARCHAR(255);
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS state VARCHAR(100);
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS registered_address TEXT;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS postal_code VARCHAR(50);
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS contact_number VARCHAR(50);
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS employee_count INT;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS department_count INT;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS branch_count INT;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS primary_departments TEXT;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS organisation_structure VARCHAR(50);
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'ACTIVE';

ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(100) DEFAULT 'General';
ALTER TABLE users ADD COLUMN IF NOT EXISTS designation VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) DEFAULT 'ACTIVE';

ALTER TABLE manager_invitations ADD COLUMN IF NOT EXISTS department VARCHAR(100) DEFAULT 'General';
ALTER TABLE manager_invitations ADD COLUMN IF NOT EXISTS designation VARCHAR(100);
ALTER TABLE manager_invitations ADD COLUMN IF NOT EXISTS token VARCHAR(255);

ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS alternate_email VARCHAR(255);
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS department VARCHAR(100) DEFAULT 'General';
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS designation VARCHAR(100);
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'Employee';
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS employee_id VARCHAR(50);
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'NOT_REGISTERED';

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS objectives TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS additional_instructions TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS policy_document TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS published_at TIMESTAMP;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

ALTER TABLE campaign_questions ADD COLUMN IF NOT EXISTS question_type VARCHAR(50) DEFAULT 'TEXT';
ALTER TABLE campaign_questions ADD COLUMN IF NOT EXISTS is_required BOOLEAN DEFAULT TRUE;
ALTER TABLE campaign_questions ADD COLUMN IF NOT EXISTS options TEXT;
ALTER TABLE campaign_questions ADD COLUMN IF NOT EXISTS min_value INT DEFAULT 1;
ALTER TABLE campaign_questions ADD COLUMN IF NOT EXISTS max_value INT DEFAULT 5;
ALTER TABLE campaign_questions ADD COLUMN IF NOT EXISTS min_length INT;
ALTER TABLE campaign_questions ADD COLUMN IF NOT EXISTS max_length INT;
ALTER TABLE campaign_questions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE campaign_participants ADD COLUMN IF NOT EXISTS invitation_token VARCHAR(64);
ALTER TABLE campaign_participants ADD COLUMN IF NOT EXISTS invitation_status VARCHAR(20) DEFAULT 'SENT';
ALTER TABLE campaign_participants ADD COLUMN IF NOT EXISTS submission_status VARCHAR(20) DEFAULT 'PENDING';
ALTER TABLE campaign_participants ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP;

ALTER TABLE comments ADD COLUMN IF NOT EXISTS sentiment VARCHAR(50);

CREATE TABLE IF NOT EXISTS feedback_submissions (
  id SERIAL PRIMARY KEY,
  campaign_id INT REFERENCES campaigns(id) ON DELETE CASCADE,
  stakeholder_id INT REFERENCES stakeholders(id) ON DELETE CASCADE,
  participation_id INT REFERENCES campaign_participants(id) ON DELETE SET NULL,
  organisation_id INT REFERENCES organisations(id) ON DELETE CASCADE,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  submission_status VARCHAR(50) DEFAULT 'COMPLETED'
);

CREATE TABLE IF NOT EXISTS feedback_answers (
  id SERIAL PRIMARY KEY,
  submission_id INT REFERENCES feedback_submissions(id) ON DELETE CASCADE,
  question_id INT REFERENCES campaign_questions(id) ON DELETE CASCADE,
  response_type VARCHAR(50),
  answer_value TEXT,
  sentiment VARCHAR(50),
  sentiment_processing_status VARCHAR(50) DEFAULT 'PENDING',
  sentiment_processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
