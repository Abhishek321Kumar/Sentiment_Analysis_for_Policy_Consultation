import db from '../db.js';
import { seedDb } from './seed.js';

export async function resetDb() {
  await db.initDb();
  console.log('🔄 Resetting database tables...');

  const tables = [
    'activity_logs',
    'comments',
    'campaign_participants',
    'campaign_questions',
    'campaigns',
    'stakeholders',
    'manager_invitations',
    'email_otps',
    'user_roles',
    'users',
    'organisations',
    'dev_emails',
  ];

  for (const table of tables) {
    try {
      await db.query(`DELETE FROM ${table}`);
    } catch (e) {
      // Ignore if table doesn't exist yet
    }
  }

  console.log('Tables emptied. Re-running seed...');
  await seedDb();
  console.log('✅ Database reset complete.');
}

if (process.argv[1]?.endsWith('reset.js')) {
  resetDb().then(() => process.exit(0)).catch(err => {
    console.error('Reset failed:', err);
    process.exit(1);
  });
}

export default resetDb;
