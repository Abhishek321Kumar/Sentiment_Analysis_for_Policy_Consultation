import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  Lock,
  Eye,
  EyeOff,
  Check,
  X,
  AlertCircle,
  ArrowRight,
  RotateCw,
  Mail,
  ShieldCheck,
  KeyRound,
} from 'lucide-react';
import api from '../services/api';
import './AuthPages.css';
import './RegisterPage.css';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryToken = searchParams.get('token') || '';

  // Token state & verification
  const [token, setToken] = useState(queryToken);
  const [verifying, setVerifying] = useState(!!queryToken);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenData, setTokenData] = useState(null);
  const [tokenError, setTokenError] = useState('');

  // Password form state
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);

  // Fallback: Request new link state (if token is missing or expired)
  const [requestEmail, setRequestEmail] = useState('');
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState('');
  const [requestError, setRequestError] = useState('');

  // Verify token on mount or when token changes
  useEffect(() => {
    if (!token) {
      setVerifying(false);
      setTokenValid(false);
      return;
    }

    let isMounted = true;
    const verifyToken = async () => {
      setVerifying(true);
      setTokenError('');
      try {
        const res = await api.get(`/auth/verify-reset-token/${encodeURIComponent(token.trim())}`);
        if (isMounted) {
          setTokenData(res);
          setTokenValid(true);
        }
      } catch (err) {
        if (isMounted) {
          setTokenValid(false);
          setTokenError(err.data?.error || err.message || 'Invalid or expired password reset link.');
        }
      } finally {
        if (isMounted) {
          setVerifying(false);
        }
      }
    };

    verifyToken();
    return () => {
      isMounted = false;
    };
  }, [token]);

  // Live password validation criteria
  const passwordCriteria = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'At least one uppercase letter (A-Z)', met: /[A-Z]/.test(password) },
    { label: 'At least one lowercase letter (a-z)', met: /[a-z]/.test(password) },
    { label: 'At least one number (0-9)', met: /[0-9]/.test(password) },
    { label: 'At least one special symbol (!@#$%^&*)', met: /[^A-Za-z0-9]/.test(password) },
  ];

  const allCriteriaMet = passwordCriteria.every(c => c.met);
  const passwordsMatch = password && confirmPassword && password === confirmPassword;

  // Handle password submit
  const handleResetSubmit = async e => {
    e.preventDefault();
    if (!allCriteriaMet) {
      setSubmitError('Please meet all password security requirements before saving.');
      return;
    }
    if (!passwordsMatch) {
      setSubmitError('Passwords do not match. Please re-enter.');
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      await api.post('/auth/reset-password', {
        token: token.trim(),
        newPassword: password,
      });
      setResetSuccess(true);
    } catch (err) {
      setSubmitError(err.data?.error || err.message || 'Failed to reset password. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle requesting a new reset link
  const handleRequestLink = async e => {
    e.preventDefault();
    if (!requestEmail.trim()) {
      setRequestError('Please enter your account email address.');
      return;
    }
    setRequestLoading(true);
    setRequestError('');
    setRequestSuccess('');

    try {
      const res = await api.post('/auth/forgot-password', {
        email: requestEmail.trim(),
      });
      setRequestSuccess(res.message || 'A password reset link has been dispatched to your email.');
    } catch (err) {
      setRequestError(err.data?.error || err.message || 'Failed to dispatch reset link.');
    } finally {
      setRequestLoading(false);
    }
  };

  const roleName = tokenData?.role === 'ADMIN' ? 'Administrator' : 'Campaign Manager';
  const loginRole = tokenData?.role === 'ADMIN' ? 'admin' : 'manager';

  return (
    <div className="auth-page animate-fade-in">
      {/* Left Panel: Content / Form */}
      <div className="auth-panel auth-panel--left">
        <div className="auth-panel__inner" style={{ maxWidth: '460px' }}>
          {/* Brand header */}
          <Link to="/" className="auth-brand" style={{ marginBottom: '0.75rem' }}>
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="7" fill="var(--brand-accent)"/>
              <path d="M8 10h10a6 6 0 0 1 0 12H8V10z" fill="white" opacity="0.9"/>
              <rect x="8" y="14" width="7" height="4" rx="1" fill="var(--brand-accent)"/>
            </svg>
            <span>PotentPolicy</span>
          </Link>

          {/* STATE 1: VERIFYING TOKEN */}
          {verifying && (
            <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <RotateCw size={36} className="spin" style={{ color: 'var(--brand-accent)', margin: '0 auto 1rem' }} />
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.4rem', color: 'var(--text-primary)' }}>
                Verifying Security Link...
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Checking token validity and expiry with database records.
              </p>
            </div>
          )}

          {/* STATE 2: SUCCESS VIEW */}
          {!verifying && resetSuccess && (
            <div className="animate-fade-in" style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: 'rgba(34, 197, 94, 0.12)',
                  color: '#16a34a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 1.25rem',
                }}
              >
                <Check size={28} strokeWidth={2.5} />
              </div>

              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                Password Updated!
              </h2>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1.75rem' }}>
                Your password has been successfully updated in the database. You can now log in securely with your new password.
              </p>

              <button
                type="button"
                className="btn btn-primary btn-lg btn-full"
                onClick={() => navigate(`/login?role=${loginRole}`)}
              >
                <span>Proceed to Sign In as {roleName}</span>
                <ArrowRight size={16} />
              </button>
            </div>
          )}

          {/* STATE 3: VALID TOKEN - ENTER NEW PASSWORD */}
          {!verifying && !resetSuccess && tokenValid && tokenData && (
            <div className="animate-fade-in">
              <div className="auth-header" style={{ marginBottom: '1.25rem' }}>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '0.2rem 0.65rem',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    background: 'rgba(194, 65, 12, 0.1)',
                    color: 'var(--brand-accent)',
                    marginBottom: '0.5rem',
                  }}
                >
                  {roleName} Security
                </span>
                <h2 style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Set New Password
                </h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                  Create a new secure password for <strong>{tokenData.email}</strong>.
                </p>
              </div>

              {submitError && (
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '8px',
                    color: '#ef4444',
                    fontSize: '0.82rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '1.25rem',
                  }}
                >
                  <AlertCircle size={16} />
                  <span>{submitError}</span>
                </div>
              )}

              <form onSubmit={handleResetSubmit} className="auth-form">
                {/* New Password */}
                <div className="form-group">
                  <label className="form-label" htmlFor="reset-new-password">
                    New Password *
                  </label>
                  <div className="form-input-wrapper">
                    <input
                      id="reset-new-password"
                      type={showPassword ? 'text' : 'password'}
                      className="form-input"
                      placeholder="Enter new password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="form-input-icon"
                      onClick={() => setShowPassword(p => !p)}
                      tabIndex={-1}
                      style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div className="form-group">
                  <label className="form-label" htmlFor="reset-confirm-password">
                    Confirm New Password *
                  </label>
                  <div className="form-input-wrapper">
                    <input
                      id="reset-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      className="form-input"
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="form-input-icon"
                      onClick={() => setShowConfirmPassword(p => !p)}
                      tabIndex={-1}
                      style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {confirmPassword && (
                    <span
                      style={{
                        display: 'block',
                        fontSize: '0.75rem',
                        marginTop: '0.3rem',
                        color: passwordsMatch ? '#16a34a' : '#ef4444',
                        fontWeight: 600,
                      }}
                    >
                      {passwordsMatch ? '✓ Passwords match' : '✗ Passwords do not match'}
                    </span>
                  )}
                </div>

                {/* Password Criteria Checklist */}
                <div
                  style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '0.85rem 1rem',
                    fontSize: '0.78rem',
                    margin: '0.5rem 0 1rem',
                  }}
                >
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                    Password Requirements:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    {passwordCriteria.map((crit, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          color: crit.met ? '#16a34a' : 'var(--text-tertiary)',
                          fontWeight: crit.met ? 600 : 400,
                          transition: 'color 0.2s',
                        }}
                      >
                        {crit.met ? (
                          <Check size={13} strokeWidth={3} />
                        ) : (
                          <span style={{ width: '13px', height: '13px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                            &bull;
                          </span>
                        )}
                        <span>{crit.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary btn-lg btn-full"
                  disabled={submitting || !allCriteriaMet || !passwordsMatch}
                  style={{ marginTop: '0.5rem' }}
                >
                  {submitting ? (
                    <>
                      <RotateCw size={15} className="spin" /> Updating Password...
                    </>
                  ) : (
                    <>
                      <KeyRound size={16} />
                      <span>Set New Password</span>
                    </>
                  )}
                </button>
              </form>

              <div style={{ textAlign: 'center', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', fontSize: '0.82rem' }}>
                <Link to={`/login?role=${loginRole}`} style={{ color: 'var(--brand-accent)', fontWeight: 600, textDecoration: 'none' }}>
                  &larr; Return to Sign In
                </Link>
              </div>
            </div>
          )}

          {/* STATE 4: INVALID / EXPIRED TOKEN OR NO TOKEN (REQUEST FORM) */}
          {!verifying && !resetSuccess && (!tokenValid || !token) && (
            <div className="animate-fade-in">
              <div className="auth-header" style={{ marginBottom: '1.25rem' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '10px',
                    background: 'rgba(194, 65, 12, 0.1)',
                    color: 'var(--brand-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '0.75rem',
                  }}
                >
                  <KeyRound size={22} />
                </div>
                <h2 style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Forgot Password?
                </h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                  Enter your registered institutional email to receive a password reset link.
                </p>
              </div>

              {tokenError && (
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    borderRadius: '8px',
                    color: '#ef4444',
                    fontSize: '0.82rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '1.25rem',
                  }}
                >
                  <AlertCircle size={16} />
                  <span>{tokenError}</span>
                </div>
              )}

              {requestSuccess ? (
                <div
                  style={{
                    padding: '1.25rem',
                    background: 'rgba(34, 197, 94, 0.08)',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    borderRadius: '8px',
                    color: '#16a34a',
                    fontSize: '0.85rem',
                    lineHeight: 1.5,
                    marginBottom: '1.5rem',
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Check size={16} strokeWidth={2.5} /> Check Your Inbox
                  </div>
                  <div>{requestSuccess}</div>
                  <div style={{ marginTop: '0.75rem' }}>
                    <a
                      href="http://localhost:5174"
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: 'var(--brand-accent)', fontWeight: 600, textDecoration: 'underline' }}
                    >
                      Open PotentMail Outbox &rarr;
                    </a>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleRequestLink} className="auth-form">
                  {requestError && (
                    <div
                      style={{
                        padding: '0.7rem 0.9rem',
                        background: 'rgba(239, 68, 68, 0.08)',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                        borderRadius: '8px',
                        color: '#ef4444',
                        fontSize: '0.82rem',
                        marginBottom: '0.5rem',
                      }}
                    >
                      {requestError}
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label" htmlFor="request-email">
                      Official Account Email Address *
                    </label>
                    <div className="form-input-wrapper">
                      <input
                        id="request-email"
                        type="email"
                        className="form-input"
                        placeholder="user@domain.in"
                        value={requestEmail}
                        onChange={e => setRequestEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary btn-lg btn-full"
                    disabled={requestLoading}
                    style={{ marginTop: '0.75rem' }}
                  >
                    {requestLoading ? (
                      <>
                        <RotateCw size={15} className="spin" /> Sending Link...
                      </>
                    ) : (
                      <>
                        <Mail size={16} />
                        <span>Send Password Reset Link</span>
                      </>
                    )}
                  </button>
                </form>
              )}

              <div style={{ textAlign: 'center', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', fontSize: '0.82rem' }}>
                <Link to="/login" style={{ color: 'var(--brand-accent)', fontWeight: 600, textDecoration: 'none' }}>
                  &larr; Back to Login
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel: Security & Brand Showcase */}
      <div className="auth-panel auth-panel--right">
        <div className="auth-panel__deco">
          <div className="auth-deco-card">
            <p className="auth-deco-label">ENTERPRISE ACCESS GOVERNANCE</p>
            <div className="auth-deco-stat-row">
              <div className="auth-deco-stat" style={{ color: 'var(--brand-accent)' }}>
                <span className="auth-deco-stat-val">bcrypt</span>
                <span>10 Salt Rounds</span>
              </div>
              <div className="auth-deco-stat" style={{ color: 'var(--sentiment-positive)' }}>
                <span className="auth-deco-stat-val">60 Min</span>
                <span>Automated Expiry</span>
              </div>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              Reset tokens are single-use, time-bound cryptographic credentials. Upon password renewal, all session tokens are re-issued and token entries are securely marked as consumed.
            </div>
          </div>
          <div className="auth-deco-quote">
            <p>"Verifiable authentication standards protect institutional policy consultations and assure participant integrity."</p>
            <span>— PotentPolicy Security Governance</span>
          </div>
        </div>
      </div>
    </div>
  );
}

