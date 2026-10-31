import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Eye, EyeOff, ShieldCheck, KeyRound, RotateCw, CheckCircle2,
  AlertCircle, Building2, User, Phone, Briefcase, Mail, ArrowRight,
  Sparkles, Lock, ArrowLeft
} from 'lucide-react';
import api from '../services/api';
import './RegisterPage.css';

const PASSWORD_RULES = [
  { label: 'At least 8 characters',        test: v => v.length >= 8 },
  { label: 'One uppercase letter',          test: v => /[A-Z]/.test(v) },
  { label: 'One number',                    test: v => /\d/.test(v) },
  { label: 'One special character (!@#$)',  test: v => /[!@#$%^&*]/.test(v) },
];

export default function RegisterManagerPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryToken = searchParams.get('token') || '';

  // Step 1: Lookup state
  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupOrgCode, setLookupOrgCode] = useState('');
  const [lookupToken, setLookupToken] = useState(queryToken);
  const [showTokenField, setShowTokenField] = useState(Boolean(queryToken));
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');

  // Step 2: Form state (once invitation is verified)
  const [invitationData, setInvitationData] = useState(null);
  const [activeToken, setActiveToken] = useState(queryToken);
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    department: '',
    designation: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });

  const [formErrors, setFormErrors] = useState({});
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState(false);

  // Auto-fetch if token query param exists
  useEffect(() => {
    if (queryToken) {
      handleLookup({ token: queryToken });
    }
  }, [queryToken]);

  const handleLookup = async (overrideParams = null) => {
    setLookupLoading(true);
    setLookupError('');

    const tokenToUse = overrideParams?.token || lookupToken.trim();
    const emailToUse = overrideParams?.email || lookupEmail.trim();
    const orgCodeToUse = overrideParams?.orgCode || lookupOrgCode.trim();

    try {
      let res;
      if (tokenToUse) {
        res = await api.get(`/members/managers/invitation/${encodeURIComponent(tokenToUse)}`);
      } else {
        if (!emailToUse || !orgCodeToUse) {
          setLookupError('Please enter both your invited email address and organisation code.');
          setLookupLoading(false);
          return;
        }
        res = await api.post('/members/managers/invitation-lookup', {
          email: emailToUse,
          orgCode: orgCodeToUse,
        });
      }

      const inv = res.invitation;
      setInvitationData(inv);
      setActiveToken(inv.token || tokenToUse);
      setForm({
        fullName: inv.fullName || `${inv.firstName || ''} ${inv.lastName || ''}`.trim(),
        email: inv.email || '',
        department: inv.department || '',
        designation: inv.designation || '',
        phone: inv.phone || '',
        password: '',
        confirmPassword: '',
      });
    } catch (err) {
      const rawMsg = err.data?.error || err.message || '';
      let friendlyMsg = rawMsg;
      if (!rawMsg || rawMsg.includes('404') || rawMsg.includes('failed with status')) {
        friendlyMsg = `No pending invitation found for "${emailToUse || 'this email'}" under organisation code "${orgCodeToUse || ''}". Please verify with your administrator.`;
      }
      setLookupError(friendlyMsg);
    } finally {
      setLookupLoading(false);
    }
  };

  const handleLookupSubmit = e => {
    e.preventDefault();
    if (showTokenField) {
      if (!lookupToken.trim()) {
        setLookupError('Please enter your activation token.');
        return;
      }
      handleLookup({ token: lookupToken.trim() });
    } else {
      if (!lookupEmail.trim() || !lookupOrgCode.trim()) {
        setLookupError('Both Official Email and Organisation Code are required.');
        return;
      }
      handleLookup({ email: lookupEmail.trim(), orgCode: lookupOrgCode.trim() });
    }
  };

  const handleFormChange = e => {
    const { name, value } = e.target;
    setForm(p => ({ ...p, [name]: value }));
    if (formErrors[name]) setFormErrors(p => ({ ...p, [name]: '' }));
    if (submitError) setSubmitError('');
  };

  const validateForm = () => {
    const errs = {};
    if (!form.fullName.trim()) errs.fullName = 'Full Name is required.';
    if (!form.department.trim()) errs.department = 'Department is required.';
    if (!form.designation.trim()) errs.designation = 'Designation is required.';

    const phoneClean = (form.phone || '').trim().replace(/\D/g, '');
    if (!phoneClean) {
      errs.phone = 'Contact number is required.';
    } else if (!/^[0-9]{10}$/.test(phoneClean)) {
      errs.phone = 'Contact number must be exactly 10 digits.';
    }

    const pwFails = PASSWORD_RULES.filter(r => !r.test(form.password));
    if (!form.password) {
      errs.password = 'Password is required.';
    } else if (pwFails.length > 0) {
      errs.password = 'Password must meet all security requirements.';
    }

    if (!form.confirmPassword) {
      errs.confirmPassword = 'Confirming your password is required.';
    } else if (form.password !== form.confirmPassword) {
      errs.confirmPassword = 'Passwords do not match.';
    }

    return errs;
  };

  const handleActivationSubmit = async e => {
    e.preventDefault();
    const errs = validateForm();
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      await api.post(`/members/managers/activate/${encodeURIComponent(activeToken)}`, {
        fullName: form.fullName.trim(),
        department: form.department.trim(),
        designation: form.designation.trim(),
        phone: form.phone.trim().replace(/\D/g, ''),
        password: form.password,
      });

      setSuccess(true);
    } catch (err) {
      setSubmitError(err.message || 'Failed to activate Campaign Manager account.');
    } finally {
      setSubmitting(false);
    }
  };

  // 1. Success state: "You are good to go!"
  if (success) {
    return (
      <div className="reg-page" style={{ justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--bg-canvas)' }}>
        <div style={{
          maxWidth: '560px',
          width: '90%',
          margin: '2rem auto',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-color)',
          borderRadius: '16px',
          padding: '2.5rem 2rem',
          textAlign: 'center',
          boxShadow: 'var(--shadow-lg)'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(34, 197, 94, 0.12)',
            color: '#16a34a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem'
          }}>
            <CheckCircle2 size={36} />
          </div>

          <h2 style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
            You are good to go!
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
            Your Campaign Manager account has been configured and activated successfully. You now have full access to your consultation workspace.
          </p>

          <div style={{
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '1.25rem',
            textAlign: 'left',
            marginBottom: '1.75rem',
            fontSize: '0.875rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-tertiary)' }}>Name:</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{form.fullName}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-tertiary)' }}>Official Email:</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{form.email}</span>
            </div>
            {invitationData?.orgName && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-tertiary)' }}>Organisation:</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{invitationData.orgName} ({invitationData.orgCode})</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-tertiary)' }}>Designation &amp; Dept:</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{form.designation} &bull; {form.department}</span>
            </div>
          </div>

          <button
            type="button"
            className="reg-submit-btn"
            onClick={() => navigate('/login?role=manager')}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.85rem' }}
          >
            <span>Proceed to Login</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="reg-page">
      {/* ── LEFT — Branded Institutional Visual Panel ── */}
      <div className="reg-image-panel">
        <img
          src="/role-manager.jpg"
          alt="Campaign Manager collaborating on institutional policy"
          className="reg-image-panel__img"
          onError={e => { e.target.src = '/register-panel.jpg'; }}
        />
        <div className="reg-image-panel__overlay">
          <Link to="/" className="reg-image-panel__brand">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="7" fill="var(--brand-accent)" />
              <path d="M8 10h10a6 6 0 0 1 0 12H8V10z" fill="white" opacity="0.9" />
              <rect x="8" y="14" width="7" height="4" rx="1" fill="var(--brand-accent)" />
            </svg>
            <span>PotentPolicy</span>
          </Link>

          <div className="reg-image-panel__tagline">
            <h2>Campaign Manager Workspace Setup</h2>
            <p>
              Your administrator has invited you to lead consultative campaigns. Complete your onboarding to build feedback forms, invite stakeholders, and govern submissions.
            </p>
            <div className="reg-image-panel__pills">
              <span className="reg-pill"><CheckCircle2 size={12} /> Invite-only onboarding</span>
              <span className="reg-pill"><CheckCircle2 size={12} /> Role governance</span>
              <span className="reg-pill"><CheckCircle2 size={12} /> Cryptographic isolation</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT — Form Workflow Panel ── */}
      <div className="reg-form-panel">
        <div className="reg-form-panel__inner">

          {/* STEP 1: INVITATION LOOKUP (when no verified invitation is loaded) */}
          {!invitationData ? (
            <div>
              <div className="reg-form-header">
                <div className="step-badge" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#2563eb' }}>
                  Manager Onboarding
                </div>
                <h1 className="reg-form-header__title">Verify Your Invitation</h1>
                <p className="reg-form-header__sub">
                  Enter your official invited email and organisation code provided by your administrator.
                </p>
              </div>

              {lookupError && (
                <div className="reg-alert" style={{ marginBottom: '1.25rem' }}>
                  <AlertCircle size={15} />
                  <span>{lookupError}</span>
                </div>
              )}

              <form className="reg-form" onSubmit={handleLookupSubmit} noValidate>
                {!showTokenField ? (
                  <>
                    <div className="reg-section-label">
                      <Mail size={13} /> Invitation Credentials
                    </div>

                    <div className="reg-row reg-row--full">
                      <div className="form-group">
                        <label className="form-label" htmlFor="lookup-email">Official Invited Email Address *</label>
                        <input
                          id="lookup-email"
                          type="email"
                          className="form-input"
                          placeholder="user@domain.in"
                          value={lookupEmail}
                          onChange={e => {
                            setLookupEmail(e.target.value);
                            if (lookupError) setLookupError('');
                          }}
                          autoFocus
                        />
                      </div>
                    </div>

                    <div className="reg-row reg-row--full">
                      <div className="form-group">
                        <label className="form-label" htmlFor="lookup-org-code">Confidential Organisation Code *</label>
                        <input
                          id="lookup-org-code"
                          type="text"
                          className="form-input"
                          placeholder="Enter organisation code"
                          value={lookupOrgCode}
                          onChange={e => {
                            setLookupOrgCode(e.target.value);
                            if (lookupError) setLookupError('');
                          }}
                          style={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.08em' }}
                        />
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', marginTop: '-0.3rem', marginBottom: '0.8rem' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setShowTokenField(true);
                          setLookupError('');
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--brand-accent)',
                          fontSize: '0.82rem',
                          cursor: 'pointer',
                          textDecoration: 'underline'
                        }}
                      >
                        Or verify using an activation token / link code
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="reg-section-label">
                      <KeyRound size={13} /> Activation Token
                    </div>

                    <div className="reg-row reg-row--full">
                      <div className="form-group">
                        <label className="form-label" htmlFor="lookup-token">Paste Activation Token *</label>
                        <input
                          id="lookup-token"
                          type="text"
                          className="form-input"
                          placeholder="Enter activation token"
                          value={lookupToken}
                          onChange={e => {
                            setLookupToken(e.target.value);
                            if (lookupError) setLookupError('');
                          }}
                          style={{ fontFamily: 'monospace' }}
                          autoFocus
                        />
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', marginTop: '-0.3rem', marginBottom: '0.8rem' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setShowTokenField(false);
                          setLookupError('');
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--brand-accent)',
                          fontSize: '0.82rem',
                          cursor: 'pointer',
                          textDecoration: 'underline'
                        }}
                      >
                        Verify with Email and Organisation Code instead
                      </button>
                    </div>
                  </>
                )}

                <button
                  type="submit"
                  className="reg-submit-btn"
                  disabled={lookupLoading}
                  style={{ marginTop: '0.5rem' }}
                >
                  {lookupLoading ? (
                    <span className="reg-submit-btn__inner">
                      <RotateCw size={15} className="spin" /> Verifying Invitation...
                    </span>
                  ) : (
                    <span className="reg-submit-btn__inner">
                      <span>Verify &amp; Access Consultation Portal</span>
                      <ArrowRight size={15} />
                    </span>
                  )}
                </button>
              </form>

              <div className="reg-footer-links" style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                Already activated? <Link to="/login?role=manager">Sign in here</Link>
              </div>
            </div>
          ) : (
            /* STEP 2: PROFILE REVIEW & PASSWORD CONFIGURATION */
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setInvitationData(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                >
                  <ArrowLeft size={13} /> Change credentials
                </button>
                <span className="step-badge" style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#16a34a' }}>
                  Invitation Verified
                </span>
              </div>

              <div className="reg-form-header">
                <h1 className="reg-form-header__title">Complete Account Setup</h1>
                <p className="reg-form-header__sub">
                  Verify or edit your profile details below and configure your secure password.
                </p>
              </div>

              {/* Organisation Banner */}
              <div style={{
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '0.85rem 1rem',
                marginBottom: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.5rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Building2 size={18} style={{ color: 'var(--brand-accent)' }} />
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {invitationData.orgName || 'Organisation'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                      Authorised Consultation Lead
                    </div>
                  </div>
                </div>
                <div style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  color: 'var(--text-primary)'
                }}>
                  Org Code: {invitationData.orgCode}
                </div>
              </div>

              {submitError && (
                <div className="reg-alert" style={{ marginBottom: '1.25rem' }}>
                  <AlertCircle size={15} />
                  <span>{submitError}</span>
                </div>
              )}

              <form className="reg-form" onSubmit={handleActivationSubmit} noValidate>
                <div className="reg-section-label">
                  <User size={13} /> Personal &amp; Organisational Details
                </div>

                <div className="reg-row reg-row--two">
                  <div className="form-group">
                    <label className="form-label" htmlFor="mgr-fullname">Full Name *</label>
                    <input
                      id="mgr-fullname"
                      name="fullName"
                      type="text"
                      className={`form-input ${formErrors.fullName ? 'error' : ''}`}
                      placeholder="Enter full name"
                      value={form.fullName}
                      onChange={handleFormChange}
                      autoComplete="name"
                    />
                    {formErrors.fullName && <span className="form-error">{formErrors.fullName}</span>}
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="mgr-email">Official Email (Assigned by Admin)</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        id="mgr-email"
                        name="email"
                        type="email"
                        className="form-input"
                        value={form.email}
                        disabled
                        style={{ background: 'var(--bg-subtle)', cursor: 'not-allowed', color: 'var(--text-secondary)' }}
                      />
                      <Mail size={14} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                    </div>
                  </div>
                </div>

                <div className="reg-row reg-row--two">
                  <div className="form-group">
                    <label className="form-label" htmlFor="mgr-dept">Department *</label>
                    <input
                      id="mgr-dept"
                      name="department"
                      type="text"
                      className={`form-input ${formErrors.department ? 'error' : ''}`}
                      placeholder="Enter department"
                      value={form.department}
                      onChange={handleFormChange}
                    />
                    {formErrors.department && <span className="form-error">{formErrors.department}</span>}
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="mgr-desig">Designation *</label>
                    <input
                      id="mgr-desig"
                      name="designation"
                      type="text"
                      className={`form-input ${formErrors.designation ? 'error' : ''}`}
                      placeholder="Enter designation"
                      value={form.designation}
                      onChange={handleFormChange}
                    />
                    {formErrors.designation && <span className="form-error">{formErrors.designation}</span>}
                  </div>
                </div>

                <div className="reg-row reg-row--full">
                  <div className="form-group">
                    <label className="form-label" htmlFor="mgr-phone">Contact Number * (10 Digits)</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        id="mgr-phone"
                        name="phone"
                        type="tel"
                        maxLength={10}
                        className={`form-input ${formErrors.phone ? 'error' : ''}`}
                        placeholder="Enter 10-digit phone number"
                        value={form.phone}
                        onChange={handleFormChange}
                        autoComplete="tel"
                      />
                      <Phone size={14} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                    </div>
                    {formErrors.phone && <span className="form-error">{formErrors.phone}</span>}
                  </div>
                </div>

                <div className="reg-section-label" style={{ marginTop: '0.75rem' }}>
                  <KeyRound size={13} /> Security &amp; Password
                </div>

                <div className="reg-row reg-row--two">
                  <div className="form-group">
                    <label className="form-label" htmlFor="mgr-pass">Create Password *</label>
                    <div className="form-input-wrap">
                      <input
                        id="mgr-pass"
                        name="password"
                        type={showPass ? 'text' : 'password'}
                        className={`form-input ${formErrors.password ? 'error' : ''}`}
                        placeholder="Create strong password"
                        value={form.password}
                        onChange={handleFormChange}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="pass-toggle"
                        onClick={() => setShowPass(p => !p)}
                        tabIndex={-1}
                      >
                        {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="mgr-cpass">Confirm Password *</label>
                    <div className="form-input-wrap">
                      <input
                        id="mgr-cpass"
                        name="confirmPassword"
                        type={showConfirm ? 'text' : 'password'}
                        className={`form-input ${formErrors.confirmPassword ? 'error' : ''}`}
                        placeholder="Repeat password"
                        value={form.confirmPassword}
                        onChange={handleFormChange}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="pass-toggle"
                        onClick={() => setShowConfirm(p => !p)}
                        tabIndex={-1}
                      >
                        {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                </div>

                {formErrors.password && <span className="form-error" style={{ marginBottom: '0.35rem' }}>{formErrors.password}</span>}
                {formErrors.confirmPassword && <span className="form-error" style={{ marginBottom: '0.35rem' }}>{formErrors.confirmPassword}</span>}

                {form.password && (
                  <div className="pw-rules" style={{ marginTop: '0.25rem', marginBottom: '0.75rem' }}>
                    {PASSWORD_RULES.map((r, i) => {
                      const ok = r.test(form.password);
                      return (
                        <div key={i} className={`pw-rule ${ok ? 'pass' : 'fail'}`}>
                          <span className="pw-rule__dot" />
                          <span>{r.label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                <button
                  type="submit"
                  className="reg-submit-btn"
                  disabled={submitting}
                  style={{ marginTop: '0.75rem' }}
                >
                  {submitting ? (
                    <span className="reg-submit-btn__inner">
                      <RotateCw size={15} className="spin" /> Activating Workspace...
                    </span>
                  ) : (
                    <span className="reg-submit-btn__inner">
                      <ShieldCheck size={16} /> Complete Setup &amp; Activate Account
                    </span>
                  )}
                </button>
              </form>

              <div className="reg-footer-links" style={{ marginTop: '1.25rem' }}>
                Already activated? <Link to="/login?role=manager">Sign in here</Link>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
