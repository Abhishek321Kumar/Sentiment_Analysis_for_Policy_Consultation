import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import db from './db.js';
import { seedDb } from './scripts/seed.js';

import authRoutes from './routes/auth.js';
import orgRoutes from './routes/organisation.js';
import membersRoutes from './routes/members.js';
import campaignsRoutes from './routes/campaigns.js';
import participateRoutes from './routes/participate.js';
import devRoutes from './routes/dev.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for frontend (PotentPolicy :5173 & Standalone PotentMail :5174)
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+):(5173|5174)$/.test(origin)) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: '5mb' }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/organisation', orgRoutes);
app.use('/api/members', membersRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/participate', participateRoutes);
app.use('/api/dev', devRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    mode: process.env.NODE_ENV || 'development',
    database: db.isUsingInMemory() ? 'in-memory (pg-mem)' : 'postgresql',
    emailMode: process.env.EMAIL_MODE || 'capture',
    timestamp: new Date().toISOString(),
  });
});

// Central Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'An unexpected internal server error occurred.',
  });
});

// Start Server
async function startServer() {
  try {
    await db.initDb();
    await seedDb(); // Auto-seed if empty

    app.listen(PORT, () => {
      console.log(`=======================================================`);
      console.log(`🚀 PotentPolicy Backend Server listening on port ${PORT}`);
      console.log(`   API URL: http://localhost:${PORT}/api`);
      console.log(`   Database: ${db.isUsingInMemory() ? 'In-Memory PostgreSQL (pg-mem)' : 'PostgreSQL'}`);
      console.log(`   Email Mode: ${process.env.EMAIL_MODE || 'capture'}`);
      console.log(`=======================================================`);
    });
  } catch (err) {
    console.error('Fatal server startup error:', err);
    process.exit(1);
  }
}

startServer();

export default app;
