import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { ShieldCheck, CheckCircle2, AlertCircle, Lock, UserCheck } from 'lucide-react';
import api from '../services/api';

export default function VerifyStakeholderPage() {
  const [searchParams] = useSearchParams();
  const [userId, setUserId] = useState(() => (searchParams.get('userId') || '').trim());
  const [orgCode, setOrgCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [verifiedData, setVerifiedData] = useState(null);

  useEffect(() => {
    const idFromUrl = searchParams.get('userId');
    if (idFromUrl) {
      setUserId(idFromUrl.trim());
    }
  }, [searchParams]);

  const handleVerify = async e => {
    e.preventDefault();
    if (!userId.trim() || !orgCode.trim()) {
      setError('Please enter both your User ID and the Organisation Code from your confirmation email.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await api.post('/participate/verify-stakeholder', {
        userId: userId.trim(),
        orgCode: orgCode.trim().toUpperCase(),
      });
      setVerifiedData(res.stakeholder || { userId: userId.trim(), status: 'ACTIVE' });
      setLoading(false);
    } catch (err) {
      setLoading(false);
      setError(err.message || 'Verification failed. Please verify your User ID and Organisation Code.');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '2.5rem 1.5rem',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: '500px',
          width: '100%',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '16px',
          padding: '2.5rem',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Brand header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '2rem',
          }}
        >
          <Link
            to="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.6rem',
              textDecoration: 'none',
              color: 'var(--text-primary)',
              fontWeight: '700',
              fontFamily: 'Outfit, sans-serif',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="7" fill="var(--brand-accent)" />
              <path d="M8 10h10a6 6 0 0 1 0 12H8V10z" fill="white" opacity="0.9" />
              <rect x="8" y="14" width="7" height="4" rx="1" fill="var(--brand-accent)" />
            </svg>
            <span>PotentPolicy</span>
          </Link>
          <span
            style={{
              fontSize: '0.78rem',
              color: 'var(--text-muted)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <Lock size={13} /> Stakeholder Verification
          </span>
        </div>

        {!verifiedData ? (
          <div className="animate-fade-in">
            <div style={{ marginBottom: '1.75rem' }}>
              <h1
                style={{
                  fontSize: '1.5rem',
                  fontWeight: '800',
                  color: 'var(--text-primary)',
                  fontFamily: 'Outfit, sans-serif',
                  marginBottom: '0.45rem',
                }}
              >
                Confirm Stakeholder Enrollment
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.5' }}>
                Verify your stakeholder directory enrollment using your pre-filled User ID and the confidential Organisation Code provided in your email.
              </p>
            </div>

            {error && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  padding: '0.85rem 1rem',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  color: 'var(--sentiment-negative)',
                  fontSize: '0.85rem',
                  marginBottom: '1.25rem',
                }}
              >
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleVerify}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.84rem',
                    fontWeight: '600',
                    marginBottom: '0.4rem',
                    color: 'var(--text-primary)',
                  }}
                >
                  Stakeholder User ID *
                </label>
                <input
                  type="text"
                  required
                  value={userId}
                  onChange={e => {
                    setUserId(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="e.g. EMP-1001 or SH-1011"
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    fontFamily: 'monospace',
                    fontSize: '1rem',
                    fontWeight: '700',
                  }}
                />
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.3rem', display: 'block' }}>
                  Pre-filled from your verification link.
                </span>
              </div>

              <div style={{ marginBottom: '1.6rem' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.84rem',
                    fontWeight: '600',
                    marginBottom: '0.4rem',
                    color: 'var(--text-primary)',
                  }}
                >
                  Organisation Code *
                </label>
                <input
                  type="text"
                  required
                  value={orgCode}
                  onChange={e => {
                    setOrgCode(e.target.value.toUpperCase());
                    if (error) setError('');
                  }}
                  placeholder="e.g. DEMOORG2026"
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                    fontFamily: 'monospace',
                    fontSize: '1rem',
                    fontWeight: '700',
                    letterSpacing: '0.06em',
                  }}
                />
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.3rem', display: 'block' }}>
                  Enter the Organisation Code included in your confirmation email.
                </span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary btn-full"
                style={{
                  padding: '0.85rem',
                  fontSize: '0.94rem',
                }}
              >
                {loading ? (
                  'Verifying Enrollment...'
                ) : (
                  <>
                    <ShieldCheck size={16} /> Verify &amp; Activate Status
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          /* Success state — stays on this page without redirecting */
          <div className="animate-fade-in" style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div
              style={{
                width: '62px',
                height: '62px',
                borderRadius: '50%',
                background: 'rgba(74, 124, 89, 0.15)',
                color: 'var(--sentiment-positive)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem',
              }}
            >
              <CheckCircle2 size={34} />
            </div>

            <h2
              style={{
                fontSize: '1.5rem',
                fontWeight: '800',
                color: 'var(--text-primary)',
                fontFamily: 'Outfit, sans-serif',
                marginBottom: '0.5rem',
              }}
            >
              Stakeholder Status Confirmed!
            </h2>
            <p
              style={{
                color: 'var(--text-secondary)',
                fontSize: '0.9rem',
                lineHeight: '1.6',
                marginBottom: '1.5rem',
              }}
            >
              Your enrollment for <strong>{verifiedData.orgName || 'your organisation'}</strong> has been verified. Your status in the Central Stakeholder Directory is now updated to{' '}
              <strong style={{ color: 'var(--sentiment-positive)' }}>Active</strong>.
            </p>

            <div
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '1rem',
                textAlign: 'left',
                fontSize: '0.84rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.45rem',
              }}
            >
              {verifiedData.fullName && (
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Stakeholder: </span>
                  <strong>{verifiedData.fullName}</strong>
                </div>
              )}
              <div>
                <span style={{ color: 'var(--text-muted)' }}>User ID: </span>
                <strong style={{ fontFamily: 'monospace' }}>{verifiedData.userId}</strong>
              </div>
              {verifiedData.department && (
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Department: </span>
                  <strong>{verifiedData.department}</strong>
                </div>
              )}
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Directory Status: </span>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '0.15rem 0.55rem',
                    borderRadius: '10px',
                    fontSize: '0.72rem',
                    fontWeight: '700',
                    background: 'rgba(74, 124, 89, 0.15)',
                    color: 'var(--sentiment-positive)',
                  }}
                >
                  ACTIVE
                </span>
              </div>
            </div>

            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '1.25rem' }}>
              You may now close this tab. You will receive direct campaign invitations whenever a consultation is opened for your department or cohort.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

