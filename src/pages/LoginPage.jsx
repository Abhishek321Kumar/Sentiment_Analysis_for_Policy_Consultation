import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  Eye, EyeOff, LogIn, AlertCircle, ShieldCheck,
  TrendingUp, ArrowRight, ArrowLeft, CheckCircle2, Building2,
  Users, Sun, Moon, Sparkles, MessageSquare, RotateCw, X, KeyRound, Check
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import Footer from '../components/Footer';
import './AuthPages.css';

const DEMO_CREDENTIALS = {
  admin: { role: 'Administrator', email: 'admin@demo.org', password: 'Demo@1234' },
  manager: { role: 'Campaign Manager', email: 'manager@demo.org', password: 'Demo@1234' },
};

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const activeRole = searchParams.get('role'); // 'admin' | 'manager' | null

  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  // Forgot password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [forgotError, setForgotError] = useState('');

  const handleOpenForgot = e => {
    e.preventDefault();
    setForgotEmail(form.email || '');
    setForgotError('');
    setForgotSuccess('');
    setShowForgotModal(true);
  };

  const handleForgotSubmit = async e => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      setForgotError('Please enter your account email address.');
      return;
    }
    setForgotLoading(true);
    setForgotError('');
    setForgotSuccess('');
    try {
      const res = await api.post('/auth/forgot-password', {
        email: forgotEmail.trim(),
        role: activeRole === 'admin' ? 'ADMIN' : activeRole === 'manager' ? 'CAMPAIGN_MANAGER' : undefined,
      });
      setForgotSuccess(res.message || 'Password reset link sent! Check your inbox in PotentMail.');
    } catch (err) {
      setForgotError(err.data?.error || err.message || 'Failed to dispatch password reset link.');
    } finally {
      setForgotLoading(false);
    }
  };

  const showDemo = import.meta.env.VITE_SHOW_DEMO !== 'false';

  // Reset form errors when switching roles
  useEffect(() => {
    setErrors({});
    setApiError('');
  }, [activeRole]);

  const handleRoleSelect = roleKey => {
    setSearchParams({ role: roleKey });
    setForm({ email: '', password: '' });
    setErrors({});
    setApiError('');
  };

  const handleBackToRoles = () => {
    setSearchParams({});
    setForm({ email: '', password: '' });
    setErrors({});
    setApiError('');
  };

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(p => ({ ...p, [name]: value }));
    if (errors[name]) setErrors(p => ({ ...p, [name]: '' }));
    if (apiError) setApiError('');
  };

  const validate = () => {
    const errs = {};
    if (!form.email.trim())
      errs.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      errs.email = 'Enter a valid email address.';
    if (!form.password)
      errs.password = 'Password is required.';
    return errs;
  };

  const handleSubmit = async e => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setLoading(true);
    setApiError('');

    try {
      const res = await api.post('/auth/login', {
        email: form.email.trim(),
        password: form.password,
      });

      login(res.token, res.user);
      setLoading(false);

      const from = location.state?.from?.pathname || '/dashboard';
      navigate(from, { replace: true });
    } catch (err) {
      setLoading(false);
      setApiError(err.message || 'Invalid email or password. Please try again.');
    }
  };

  const fillDemo = cred => {
    setForm({ email: cred.email, password: cred.password });
    setErrors({});
    setApiError('');
  };

  // ══════════════════════════════════════════════════════════════
  // VIEW 1: ROLE SELECTION INTERFACE
  // ══════════════════════════════════════════════════════════════
  if (!activeRole || (activeRole !== 'admin' && activeRole !== 'manager')) {
    return (
      <div className="role-select-page animate-fade-in">
        {/* Top bar */}
        <div className="role-select-topbar">
          <Link to="/" className="auth-brand">
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="7" fill="var(--brand-accent)"/>
              <path d="M8 10h10a6 6 0 0 1 0 12H8V10z" fill="white" opacity="0.9"/>
              <rect x="8" y="14" width="7" height="4" rx="1" fill="var(--brand-accent)"/>
            </svg>
            <span>PotentPolicy</span>
          </Link>

          <div className="role-select-topbar__actions">
            <Link to="/" className="role-topbar-back-link" title="Return to Home Page">
              <ArrowLeft size={15} />
              <span>Back to Home</span>
            </Link>
            <button
              type="button"
              className="role-topbar-theme-btn"
              onClick={toggleTheme}
              aria-label="Toggle color theme"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </div>

        {/* Selection Container */}
        <div className="role-select-container">
          <div className="role-select-header">
            <div className="role-select-badge">
              <Sparkles size={13} />
              <span>Institutional Sign In</span>
            </div>
            <h1 className="role-select-title">Select Your Portal</h1>
            <p className="role-select-sub">
              Choose your role to access your dedicated workspace, governance tools, and consultation dashboards.
            </p>
          </div>

          {/* Role Cards Grid */}
          <div className="role-cards-grid">
            {/* Card 1: Administrator */}
            <div
              className="role-card-item"
              onClick={() => handleRoleSelect('admin')}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && handleRoleSelect('admin')}
            >
              <div className="role-card-img-wrap">
                <img
                  src="/role-admin.jpg"
                  alt="Administrator leading organizational governance"
                  className="role-card-img"
                  onError={e => {
                    e.target.src = '/register-panel.jpg';
                  }}
                />
                <div className="role-card-img-overlay">
                  <span className="role-card-tag">
                    <ShieldCheck size={14} style={{ color: 'var(--brand-accent)' }} />
                    Executive Governance
                  </span>
                </div>
              </div>

              <div className="role-card-content">
                <div className="role-card-header-row">
                  <div className="role-card-title-group">
                    <h3>Administrator</h3>
                    <span className="role-card-tagline">Tenant &amp; Member Governance</span>
                  </div>
                  <div className="role-card-icon-bubble">
                    <Building2 size={20} />
                  </div>
                </div>

                <p className="role-card-desc">
                  Oversee institutional governance, manage Campaign Managers, and maintain the central stakeholder directory.
                </p>

                <button type="button" className="role-card-btn">
                  Login as Administrator
                  <ArrowRight size={16} />
                </button>

                <p className="role-card-footer-note" style={{ textAlign: 'center', marginTop: '0.85rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Not registered?{' '}
                  <Link
                    to="/register"
                    onClick={e => e.stopPropagation()}
                    style={{ color: 'var(--brand-accent)', fontWeight: 600, textDecoration: 'underline' }}
                  >
                    Register your organisation
                  </Link>
                </p>
              </div>
            </div>

            {/* Card 2: Campaign Manager */}
            <div
              className="role-card-item"
              onClick={() => handleRoleSelect('manager')}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && handleRoleSelect('manager')}
            >
              <div className="role-card-img-wrap">
                <img
                  src="/role-manager.jpg"
                  alt="Campaign Manager collaborating on policy consultations"
                  className="role-card-img"
                  onError={e => {
                    e.target.src = '/register-panel.jpg';
                  }}
                />
                <div className="role-card-img-overlay">
                  <span className="role-card-tag">
                    <TrendingUp size={14} style={{ color: 'var(--sentiment-positive)' }} />
                    Consultation &amp; Deliberation
                  </span>
                </div>
              </div>

              <div className="role-card-content">
                <div className="role-card-header-row">
                  <div className="role-card-title-group">
                    <h3>Campaign Manager</h3>
                    <span className="role-card-tagline" style={{ color: 'var(--sentiment-positive)' }}>
                      Consultation Crafting &amp; Insights
                    </span>
                  </div>
                  <div className="role-card-icon-bubble" style={{ background: 'rgba(74, 124, 89, 0.1)', color: 'var(--sentiment-positive)' }}>
                    <Users size={20} />
                  </div>
                </div>

                <p className="role-card-desc">
                  Design consultation campaigns, invite stakeholder cohorts, and analyze participant policy feedback.
                </p>

                <button type="button" className="role-card-btn">
                  Login as Campaign Manager
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Home Page Footer */}
        <Footer />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // VIEW 2: ROLE-SPECIFIC LOGIN FORM
  // ══════════════════════════════════════════════════════════════
  const isAdminPortal = activeRole === 'admin';
  const demoCred = isAdminPortal ? DEMO_CREDENTIALS.admin : DEMO_CREDENTIALS.manager;

  return (
    <div className="auth-page animate-fade-in">
      {/* Left Panel — Login Form */}
      <div className="auth-panel auth-panel--left">
        <div className="auth-panel__inner">
          {/* Top navigation row */}
          <div className="role-form-top-nav">
            <button type="button" className="back-role-btn" onClick={handleBackToRoles}>
              <ArrowLeft size={15} />
              <span>Change role</span>
            </button>

            <span className={`role-badge-pill ${isAdminPortal ? 'role-badge-pill--admin' : 'role-badge-pill--manager'}`}>
              {isAdminPortal ? <ShieldCheck size={13} /> : <TrendingUp size={13} />}
              {isAdminPortal ? 'Administrator Portal' : 'Campaign Manager Portal'}
            </span>
          </div>

          <Link to="/" className="auth-brand" style={{ marginBottom: '0.5rem' }}>
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="7" fill="var(--brand-accent)"/>
              <path d="M8 10h10a6 6 0 0 1 0 12H8V10z" fill="white" opacity="0.9"/>
              <rect x="8" y="14" width="7" height="4" rx="1" fill="var(--brand-accent)"/>
            </svg>
            <span>PotentPolicy</span>
          </Link>

          <div className="auth-form-block animate-fade-in">
            <div className="auth-header">
              <h2>{isAdminPortal ? 'Administrator Sign In' : 'Campaign Manager Sign In'}</h2>
              <p>
                {isAdminPortal
                  ? 'Enter your institutional email to manage tenant governance and security.'
                  : 'Enter your credentials to craft consultations and view stakeholder insights.'}
              </p>
            </div>

            {/* API Error */}
            {apiError && (
              <div className="auth-alert">
                <AlertCircle size={15} />
                <span>{apiError}</span>
              </div>
            )}

            <form className="auth-form" onSubmit={handleSubmit} noValidate>
              {/* Email */}
              <div className="form-group">
                <label className="form-label" htmlFor="login-email">
                  {isAdminPortal ? 'Administrator Email' : 'Manager Email'}
                </label>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  className={`form-input ${errors.email ? 'error' : ''}`}
                  placeholder={isAdminPortal ? 'admin@organisation.com' : 'manager@organisation.com'}
                  value={form.email}
                  onChange={handleChange}
                  autoComplete="email"
                  autoFocus
                />
                {errors.email && <span className="form-error">{errors.email}</span>}
              </div>

              {/* Password */}
              <div className="form-group">
                <div className="auth-label-row">
                  <label className="form-label" htmlFor="login-password">
                    Password
                  </label>
                  <button
                    type="button"
                    className="auth-forgot"
                    onClick={handleOpenForgot}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="form-input-wrapper">
                  <input
                    id="login-password"
                    name="password"
                    type={showPass ? 'text' : 'password'}
                    className={`form-input ${errors.password ? 'error' : ''}`}
                    placeholder="Enter your password"
                    value={form.password}
                    onChange={handleChange}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="form-input-icon"
                    onClick={() => setShowPass(p => !p)}
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                  >
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.password && <span className="form-error">{errors.password}</span>}
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-lg btn-full"
                disabled={loading}
                id="login-submit-btn"
              >
                {loading ? (
                  <span className="auth-spinner" />
                ) : (
                  <>
                    <LogIn size={17} />
                    Sign In as {isAdminPortal ? 'Administrator' : 'Campaign Manager'}
                  </>
                )}
              </button>
            </form>

            {/* Quick Demo Credentials */}
            {showDemo && (
              <>
                <div className="divider-text">one-click demo credentials</div>
                <button
                  className="demo-card"
                  onClick={() => fillDemo(demoCred)}
                  type="button"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    {isAdminPortal ? <ShieldCheck size={16} color="var(--brand-accent)" /> : <TrendingUp size={16} color="var(--sentiment-positive)" />}
                    <span className="demo-card__role">Fill Demo {demoCred.role}</span>
                  </div>
                  <span className="demo-card__email">{demoCred.email}</span>
                </button>
              </>
            )}

            {/* Portal Switch Link */}
            <div style={{ textAlign: 'center', marginTop: '0.5rem', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>
                {isAdminPortal ? 'Need to manage consultation campaigns? ' : 'Need to manage institutional tenant? '}
              </span>
              <button
                type="button"
                onClick={() => handleRoleSelect(isAdminPortal ? 'manager' : 'admin')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--brand-accent)',
                  fontWeight: '600',
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline'
                }}
              >
                Switch to {isAdminPortal ? 'Campaign Manager' : 'Administrator'}
              </button>
            </div>

            <p className="auth-footer-text">
              Don't have an account?{' '}
              {isAdminPortal ? (
                <Link to="/register" className="auth-link">Register your organisation</Link>
              ) : (
                <Link to="/register/manager" className="auth-link">Join via Manager Onboarding</Link>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Right Panel — Role-Tailored Decorative Showcase */}
      <div className="auth-panel auth-panel--right">
        <div className="auth-panel__deco">
          {isAdminPortal ? (
            <>
              <div className="auth-deco-card">
                <p className="auth-deco-label">TENANT GOVERNANCE &amp; ISOLATION</p>
                <div className="auth-deco-stat-row">
                  <div className="auth-deco-stat" style={{ color: 'var(--brand-accent)' }}>
                    <span className="auth-deco-stat-val">100%</span>
                    <span>Tenant Scoped</span>
                  </div>
                  <div className="auth-deco-stat" style={{ color: 'var(--sentiment-positive)' }}>
                    <span className="auth-deco-stat-val">Zero</span>
                    <span>Cross-Org Leaks</span>
                  </div>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                  Every query, participant roster, and response stream is cryptographically isolated by your institutional organisation ID.
                </div>
              </div>
              <div className="auth-deco-quote">
                <p>"PotentPolicy gives leadership verifiable governance over internal consultations while protecting stakeholder trust."</p>
                <span>— Institutional Administration</span>
              </div>
            </>
          ) : (
            <>
              <div className="auth-deco-card">
                <p className="auth-deco-label">REAL-TIME SENTIMENT DISTRIBUTION</p>
                <div className="auth-deco-stat-row">
                  <div className="auth-deco-stat" style={{ color: 'var(--sentiment-positive)' }}>
                    <span className="auth-deco-stat-val">42%</span>
                    <span>Positive</span>
                  </div>
                  <div className="auth-deco-stat" style={{ color: 'var(--sentiment-negative)' }}>
                    <span className="auth-deco-stat-val">35%</span>
                    <span>Negative</span>
                  </div>
                  <div className="auth-deco-stat" style={{ color: 'var(--sentiment-neutral)' }}>
                    <span className="auth-deco-stat-val">23%</span>
                    <span>Neutral</span>
                  </div>
                </div>
                <div className="auth-deco-bar">
                  <div className="auth-deco-bar-fill" style={{ width: '42%', background: 'var(--sentiment-positive)' }} />
                  <div className="auth-deco-bar-fill" style={{ width: '35%', background: 'var(--sentiment-negative)' }} />
                  <div className="auth-deco-bar-fill" style={{ width: '23%', background: 'var(--sentiment-neutral)' }} />
                </div>
              </div>
              <div className="auth-deco-quote">
                <p>"Transforming unstructured feedback into quantifiable sentiment allows us to iterate policies before final ratification."</p>
                <span>— Policy Deliberation Lead</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── FORGOT PASSWORD MODAL ── */}
      {showForgotModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem',
          }}
          onClick={() => setShowForgotModal(false)}
        >
          <div
            style={{
              background: 'var(--bg-primary, #ffffff)',
              border: '1px solid var(--border-color, #e5e7eb)',
              borderRadius: '16px',
              maxWidth: '460px',
              width: '100%',
              padding: '2rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              position: 'relative',
            }}
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowForgotModal(false)}
              style={{
                position: 'absolute',
                top: '1.25rem',
                right: '1.25rem',
                background: 'none',
                border: 'none',
                color: 'var(--text-tertiary, #9ca3af)',
                cursor: 'pointer',
              }}
            >
              <X size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.5rem' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'rgba(194, 65, 12, 0.1)',
                  color: 'var(--brand-primary, #c2410c)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <KeyRound size={20} />
              </div>
              <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Reset Password
              </h3>
            </div>

            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              Enter your registered email address for your {activeRole === 'admin' ? 'Administrator' : 'Campaign Manager'} account. We will send a secure link to reset your password.
            </p>

            {forgotError && (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: '8px',
                  color: '#ef4444',
                  fontSize: '0.82rem',
                  marginBottom: '1rem',
                }}
              >
                {forgotError}
              </div>
            )}

            {forgotSuccess ? (
              <div
                style={{
                  padding: '1.25rem',
                  background: 'rgba(34, 197, 94, 0.08)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  borderRadius: '8px',
                  color: '#16a34a',
                  fontSize: '0.85rem',
                  lineHeight: 1.5,
                  marginBottom: '1.25rem',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Check size={16} strokeWidth={2.5} /> Reset Link Sent
                </div>
                <div>{forgotSuccess}</div>
                <div style={{ marginTop: '0.75rem' }}>
                  <a
                    href="http://localhost:5174"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--brand-primary, #c2410c)', fontWeight: 600, textDecoration: 'underline' }}
                  >
                    Open PotentMail Outbox &rarr;
                  </a>
                </div>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit}>
                <div style={{ marginBottom: '1.25rem' }}>
                  <label className="form-label" htmlFor="forgot-email" style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                    Registered Email Address *
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    className="form-input"
                    placeholder="user@domain.in"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    required
                    style={{ width: '100%' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    style={{
                      padding: '0.6rem 1.1rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color, #e5e7eb)',
                      background: 'transparent',
                      color: 'var(--text-secondary, #64748b)',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    style={{
                      padding: '0.6rem 1.25rem',
                      borderRadius: '8px',
                      border: 'none',
                      background: 'var(--btn-primary-bg, #1e293b)',
                      color: '#ffffff',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                    }}
                  >
                    {forgotLoading ? (
                      <>
                        <RotateCw size={14} className="spin" /> Sending Link...
                      </>
                    ) : (
                      <>
                        <span>Send Reset Link</span>
                        <ArrowRight size={14} />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {forgotSuccess && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  style={{
                    padding: '0.6rem 1.25rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--btn-primary-bg, #1e293b)',
                    color: '#ffffff',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                  }}
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
