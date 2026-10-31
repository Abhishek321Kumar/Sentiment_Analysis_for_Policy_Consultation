import { Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function UnauthorisedPage() {
  const { user } = useAuth();

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '80vh',
      padding: '2rem',
      background: 'var(--bg-primary)',
    }}>
      <div style={{
        maxWidth: '480px',
        width: '100%',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        padding: '2.5rem',
        textAlign: 'center',
        boxShadow: 'var(--shadow-md)',
      }}>
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'rgba(239, 68, 68, 0.12)',
          color: 'var(--sentiment-negative)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1.5rem',
        }}>
          <ShieldAlert size={30} />
        </div>

        <h1 style={{
          fontSize: '1.5rem',
          fontWeight: '700',
          marginBottom: '0.75rem',
          color: 'var(--text-primary)',
          fontFamily: 'Outfit, sans-serif'
        }}>
          Access Restricted
        </h1>

        <p style={{
          color: 'var(--text-secondary)',
          fontSize: '0.925rem',
          lineHeight: '1.5',
          marginBottom: '1.75rem',
        }}>
          Your current account roles ({user?.roles?.join(', ') || 'None'}) do not have permission to view or manage this section.
        </p>

        <Link
          to="/dashboard"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.5rem',
            background: 'var(--brand-accent)',
            color: '#ffffff',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: '600',
            fontSize: '0.9rem',
          }}
        >
          <ArrowLeft size={16} /> Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
