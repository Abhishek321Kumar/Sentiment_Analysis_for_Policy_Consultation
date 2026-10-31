import { Link } from 'react-router-dom';
import { Construction } from 'lucide-react';

export default function DashboardPlaceholder() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '1.25rem',
      textAlign: 'center',
      padding: '2rem',
      background: 'var(--bg-primary)',
    }}>
      <div style={{
        width: '72px', height: '72px', borderRadius: '50%',
        background: 'var(--decision-flag-bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--decision-flag)',
      }}>
        <Construction size={32} />
      </div>
      <h2 style={{ fontFamily: 'Outfit', fontSize: '1.5rem', color: 'var(--text-primary)' }}>
        Dashboard — Coming Soon
      </h2>
      <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', maxWidth: '400px', lineHeight: 1.7 }}>
        The full dashboard with campaigns, sentiment analysis, and stakeholder management is being built as part of Phase 1.
      </p>
      <Link to="/" className="btn btn-primary">
        ← Back to Home
      </Link>
    </div>
  );
}
