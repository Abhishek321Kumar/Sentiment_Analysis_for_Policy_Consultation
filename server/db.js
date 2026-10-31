import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

let pool;
let isInMemory = false;
let memDbInstance = null;

const schemaSql = fs.readFileSync(path.join(__dirname, 'migrations', 'schema.sql'), 'utf-8');

async function createDatabaseConnection() {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    try {
      let cleanDisplayHost = 'specified host';
      try {
        const u = new URL(databaseUrl);
        cleanDisplayHost = `${u.hostname}:${u.port || 5432}`;
      } catch {
        cleanDisplayHost = databaseUrl.split('@').pop() || 'specified host';
      }

      console.log('Attempting connection to PostgreSQL database at:', cleanDisplayHost);
      const isCloudOrSsl = databaseUrl.includes('sslmode=') ||
        databaseUrl.includes('neon.tech') ||
        databaseUrl.includes('supabase.co') ||
        databaseUrl.includes('pooler.supabase.com') ||
        databaseUrl.includes('render.com') ||
        databaseUrl.includes('aivencloud.com');

      // Strip sslmode from the connection string so pg doesn't override our custom ssl config
      let cleanedUrl = databaseUrl;
      try {
        const parsed = new URL(databaseUrl);
        parsed.searchParams.delete('sslmode');
        cleanedUrl = parsed.toString();
      } catch {}

      const realPool = new pg.Pool({
        connectionString: cleanedUrl,
        connectionTimeoutMillis: 15000,
        ssl: isCloudOrSsl ? { rejectUnauthorized: false } : undefined,
      });
      // Test connection with retry
      try {
        await realPool.query('SELECT 1');
      } catch (firstErr) {
        console.warn('Initial PostgreSQL connection attempt failed, retrying in 1.5s...', firstErr.message);
        await new Promise(r => setTimeout(r, 1500));
        await realPool.query('SELECT 1');
      }
      console.log('✅ Connected to real PostgreSQL database');
      pool = realPool;
      return;
    } catch (err) {
      console.warn('⚠️ Could not connect to PostgreSQL via DATABASE_URL:', err.message);
      if (process.argv.some(arg => arg.includes('seed') || arg.includes('reset'))) {
        throw new Error(`[Database Error] Could not connect to your PostgreSQL database: ${err.message}\nMake sure your password is URL-encoded (e.g. '@' becomes '%40') and use the Supabase Connection Pooler URI if your network uses IPv4.`);
      }
      console.log('Falling back to built-in in-memory PostgreSQL emulator (pg-mem)...');
    }
  }

  // Fallback to pg-mem
  const { newDb } = await import('pg-mem');
  memDbInstance = newDb({ noAstCoverageCheck: true });

  // Register common postgres functions if needed
  memDbInstance.public.registerFunction({
    name: 'now',
    returns: memDbInstance.public.getType('timestamp'),
    implementation: () => new Date(),
  });

  const pgAdapter = memDbInstance.adapters.createPg();
  pool = new pgAdapter.Pool();
  isInMemory = true;
  console.log('✅ Using in-memory PostgreSQL adapter (pg-mem) for local zero-config operation');
}

export async function initDb() {
  if (!pool) {
    await createDatabaseConnection();
  }

  // Strip comments first, then split by semicolon
  const cleanSql = schemaSql.replace(/--.*$/gm, '');
  const statements = cleanSql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const statement of statements) {
    try {
      await pool.query(statement);
    } catch (err) {
      if (!err.message.includes('already exists')) {
        console.error('Error executing schema statement:', err.message, '\nStatement:', statement);
      }
    }
  }
}

export async function query(text, params) {
  if (!pool) {
    await initDb();
  }
  return pool.query(text, params);
}

export function getPool() {
  return pool;
}

export function isUsingInMemory() {
  return isInMemory;
}

export default {
  query,
  initDb,
  getPool,
  isUsingInMemory,
};
