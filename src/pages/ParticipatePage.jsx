import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  MessageSquare, Send, CheckCircle2, AlertCircle, ArrowLeft,
  Calendar, RotateCw, Lock, HelpCircle, ShieldCheck, UserCheck, Star
} from 'lucide-react';
import api from '../services/api';

export default function ParticipatePage() {
  const [searchParams] = useSearchParams();
  const invitationTokenFromUrl = searchParams.get('token');

  // Step: 'entry' | 'questions' | 'success' | 'already_submitted'
  const [step, setStep] = useState(invitationTokenFromUrl ? 'loading_token' : 'entry');

  // Manual entry states (for campaign code + email flow)
  const [campaignCode, setCampaignCode] = useState(() => (searchParams.get('code') || '').toUpperCase());
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Consultation data states
  const [token, setToken] = useState(invitationTokenFromUrl || '');
  const [jwtToken, setJwtToken] = useState('');
  const [campaign, setCampaign] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [stakeholder, setStakeholder] = useState(null);

  // User responses: { [questionId]: value }
  // value can be string (for TEXT, RADIO, DROPDOWN, RATING) or string[] (for CHECKBOX)
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // 1. Auto-fetch consultation if invitation token is in URL
  useEffect(() => {
    if (!invitationTokenFromUrl) return;

    let isMounted = true;
    setLoading(true);
    setError('');

    api.get(`/participate/token/${encodeURIComponent(invitationTokenFromUrl.trim())}`)
      .then(res => {
        if (!isMounted) return;
        setToken(invitationTokenFromUrl.trim());
        setCampaign(res.campaign);
        setQuestions(res.questions || []);
        setStakeholder(res.stakeholder || null);

        // Initialize empty answers map
        const initial = {};
        (res.questions || []).forEach(q => {
          initial[q.id] = q.questionType === 'CHECKBOX' ? [] : '';
        });
        setAnswers(initial);
        setStep('questions');
      })
      .catch(err => {
        if (!isMounted) return;
        if (err.status === 409 || err.data?.alreadySubmitted) {
          setStep('already_submitted');
        } else {
          setError(err.message || 'Invalid or expired consultation access link.');
          setStep('entry');
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [invitationTokenFromUrl]);

  // Pre-fill code if code param in URL
  useEffect(() => {
    const code = searchParams.get('code');
    if (code && !invitationTokenFromUrl) {
      setCampaignCode(code.toUpperCase());
    }
  }, [searchParams, invitationTokenFromUrl]);

  // Manual entry submit
  const handleEntrySubmit = async e => {
    e.preventDefault();
    if (!campaignCode.trim() || !email.trim()) {
      setError('Please provide both the campaign code and your registered official email.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await api.post('/participate/enter', {
        campaignCode: campaignCode.trim(),
        email: email.trim(),
      });

      setJwtToken(res.token);
      setCampaign(res.campaign);
      setQuestions(res.questions || []);
      setStakeholder(res.stakeholder || null);

      const initial = {};
      (res.questions || []).forEach(q => {
        initial[q.id] = q.questionType === 'CHECKBOX' ? [] : '';
      });
      setAnswers(initial);

      setLoading(false);
      setStep('questions');
    } catch (err) {
      setLoading(false);
      setError(err.message || 'Invalid campaign code, consultation is closed, or email is not on the participant list.');
    }
  };

  // Answer change handlers
  const handleTextChange = (qId, val) => {
    setAnswers(prev => ({ ...prev, [qId]: val }));
    if (submitError) setSubmitError('');
  };

  const handleRadioChange = (qId, opt) => {
    setAnswers(prev => ({ ...prev, [qId]: opt }));
    if (submitError) setSubmitError('');
  };

  const handleCheckboxToggle = (qId, opt) => {
    setAnswers(prev => {
      const current = Array.isArray(prev[qId]) ? prev[qId] : [];
      const updated = current.includes(opt)
        ? current.filter(x => x !== opt)
        : [...current, opt];
      return { ...prev, [qId]: updated };
    });
    if (submitError) setSubmitError('');
  };

  const handleRatingSelect = (qId, rating) => {
    setAnswers(prev => ({ ...prev, [qId]: String(rating) }));
    if (submitError) setSubmitError('');
  };

  // Submit Feedback
  const handleSubmitFeedback = async e => {
    e.preventDefault();
    setSubmitError('');

    // Validate required questions
    for (const q of questions) {
      if (q.isRequired) {
        const val = answers[q.id];
        if (
          val === undefined ||
          val === null ||
          (typeof val === 'string' && !val.trim()) ||
          (Array.isArray(val) && val.length === 0)
        ) {
          setSubmitError(`Please provide a response for Question: "${q.questionText}"`);
          return;
        }
      }

      // If open text, validate min/max characters if entered
      if ((q.questionType || 'TEXT').toUpperCase() === 'TEXT') {
        const textVal = (answers[q.id] || '').trim();
        if (textVal.length > 0) {
          const min = q.minLength || 5;
          const max = q.maxLength || 2000;
          if (textVal.length < min) {
            setSubmitError(`Question "${q.questionText}" requires at least ${min} characters.`);
            return;
          }
          if (textVal.length > max) {
            setSubmitError(`Question "${q.questionText}" cannot exceed ${max} characters.`);
            return;
          }
        }
      }
    }

    setSubmitting(true);

    try {
      // 1. If accessed via unique token
      if (token) {
        const payloadAnswers = Object.entries(answers).map(([qId, val]) => ({
          questionId: parseInt(qId, 10),
          value: val,
          text: typeof val === 'string' ? val : '',
        }));

        await api.post(`/participate/submit/${encodeURIComponent(token)}`, {
          answers: payloadAnswers,
        });
      } else {
        // 2. If accessed via manual JWT code entry
        const textAnswersList = Object.entries(answers)
          .map(([qId, val]) => ({
            questionId: parseInt(qId, 10),
            text: Array.isArray(val) ? val.join(', ') : String(val).trim(),
          }))
          .filter(a => a.text.length > 0);

        await api.post('/participate/comments', { answers: textAnswersList }, {
          headers: { Authorization: `Bearer ${jwtToken}` },
        });
      }

      setSubmitting(false);
      setStep('success');
    } catch (err) {
      setSubmitting(false);
      setSubmitError(err.message || 'Failed to submit responses. The consultation may have closed.');
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
          maxWidth: step === 'questions' ? '760px' : '520px',
          width: '100%',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '16px',
          padding: '2.5rem',
          boxShadow: 'var(--shadow-lg)',
          transition: 'all 0.3s ease',
        }}
      >
        {/* Brand header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
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

          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <ShieldCheck size={14} color="var(--brand-accent)" />
            Private Institutional Consultation
          </span>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            LOADING TOKEN STATE
           ══════════════════════════════════════════════════════════════ */}
        {step === 'loading_token' && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <RotateCw size={28} className="spin" color="var(--brand-accent)" style={{ margin: '0 auto 1rem' }} />
            <h3 style={{ fontSize: '1.15rem', color: 'var(--text-primary)', margin: '0 0 0.5rem 0' }}>
              Validating Invitation Link...
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Connecting to your organisation's consultation portal.
            </p>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            ALREADY SUBMITTED STATE
           ══════════════════════════════════════════════════════════════ */}
        {step === 'already_submitted' && (
          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem',
              }}
            >
              <CheckCircle2 size={36} color="#10b981" />
            </div>
            <h3 style={{ fontSize: '1.35rem', fontFamily: 'Outfit, sans-serif', color: 'var(--text-primary)', margin: '0 0 0.6rem 0' }}>
              Feedback Already Recorded
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 auto 1.5rem', maxWidth: '400px' }}>
              You have already submitted your response for this consultation. Each stakeholder is permitted one submission to preserve voting integrity.
            </p>
            <Link to="/" className="dash-btn-secondary" style={{ textDecoration: 'none' }}>
              Return to Home
            </Link>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            MANUAL ENTRY STEP
           ══════════════════════════════════════════════════════════════ */}
        {step === 'entry' && (
          <div>
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.5rem', fontFamily: 'Outfit, sans-serif', margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>
                Stakeholder Consultation Portal
              </h2>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                Enter the private 8-character consultation code and your registered official email to access the questions.
              </p>
            </div>

            {error && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid var(--sentiment-negative)',
                  color: 'var(--sentiment-negative)',
                  padding: '0.8rem 1rem',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  marginBottom: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                }}
              >
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleEntrySubmit}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label className="dash-label">Consultation Code *</label>
                <input
                  type="text"
                  required
                  maxLength={16}
                  className="dash-input"
                  placeholder="e.g. CAMP2026"
                  value={campaignCode}
                  onChange={e => setCampaignCode(e.target.value.toUpperCase())}
                  style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label className="dash-label">Your Registered Email Address *</label>
                <input
                  type="email"
                  required
                  className="dash-input"
                  placeholder="name@organisation.edu"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="dash-btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '0.75rem' }}
              >
                {loading ? 'Validating Access...' : 'Enter Consultation'}
              </button>
            </form>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            QUESTIONS STEP (DYNAMIC 5-TYPE QUESTION RENDERER)
           ══════════════════════════════════════════════════════════════ */}
        {step === 'questions' && campaign && (
          <div>
            {/* Consultation Banner */}
            <div
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '1.25rem',
                marginBottom: '1.75rem',
              }}
            >
              <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--brand-accent)', fontWeight: 700, marginBottom: '0.25rem' }}>
                {campaign.organisationName || 'Official Policy Consultation'}
              </div>
              <h2 style={{ fontSize: '1.4rem', fontFamily: 'Outfit, sans-serif', margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>
                {campaign.title}
              </h2>
              {campaign.description && (
                <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 0.75rem 0' }}>
                  {campaign.description}
                </p>
              )}

              {campaign.objectives && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                  <strong>Objective:</strong> {campaign.objectives}
                </div>
              )}

              {campaign.additionalInstructions && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'rgba(99, 102, 241, 0.05)', padding: '0.6rem 0.8rem', borderRadius: '6px', borderLeft: '3px solid var(--brand-accent)' }}>
                  <strong>Instructions:</strong> {campaign.additionalInstructions}
                </div>
              )}

              {stakeholder?.firstName && (
                <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <UserCheck size={14} color="var(--brand-accent)" />
                  <span>Participant: {stakeholder.firstName} {stakeholder.lastName || ''} ({stakeholder.department || 'General'})</span>
                </div>
              )}
            </div>

            {submitError && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid var(--sentiment-negative)',
                  color: 'var(--sentiment-negative)',
                  padding: '0.8rem 1rem',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  marginBottom: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                }}
              >
                <AlertCircle size={16} />
                <span>{submitError}</span>
              </div>
            )}

            {/* Questions Form */}
            <form onSubmit={handleSubmitFeedback}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.35rem', marginBottom: '2rem' }}>
                {questions.map((q, idx) => {
                  const qId = q.id;
                  const qType = (q.questionType || 'TEXT').toUpperCase();
                  const isReq = q.isRequired !== false;
                  const currentVal = answers[qId];
                  const options = Array.isArray(q.options) ? q.options : [];

                  return (
                    <div
                      key={qId}
                      style={{
                        padding: '1.25rem',
                        borderRadius: '9px',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                      }}
                    >
                      <div style={{ marginBottom: '0.75rem' }}>
                        <label style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.4 }}>
                          <span style={{ color: 'var(--brand-accent)', marginRight: '0.45rem' }}>Q{idx + 1}.</span>
                          {q.questionText}
                          {isReq && <span style={{ color: 'var(--sentiment-negative)', marginLeft: '0.35rem' }}>*</span>}
                        </label>
                      </div>

                      {/* 1. Open-Ended Text Question */}
                      {qType === 'TEXT' && (
                        <div>
                          <textarea
                            rows={4}
                            required={isReq}
                            className="dash-textarea"
                            placeholder="Enter your detailed feedback..."
                            value={currentVal || ''}
                            onChange={e => handleTextChange(qId, e.target.value)}
                            style={{ width: '100%', fontSize: '0.88rem' }}
                          />
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                            <span>Minimum: {q.minLength || 5} chars</span>
                            <span>{(currentVal || '').length} / {q.maxLength || 2000} chars</span>
                          </div>
                        </div>
                      )}

                      {/* 2. Radio Buttons – Single Choice */}
                      {qType === 'RADIO' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                          {options.map((opt, oIdx) => (
                            <label
                              key={oIdx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.65rem',
                                fontSize: '0.88rem',
                                color: 'var(--text-primary)',
                                cursor: 'pointer',
                                padding: '0.5rem 0.75rem',
                                borderRadius: '7px',
                                background: currentVal === opt ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-secondary)',
                                border: currentVal === opt ? '1px solid var(--brand-accent)' : '1px solid var(--border-color)',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              <input
                                type="radio"
                                name={`q-radio-${qId}`}
                                required={isReq && !currentVal}
                                checked={currentVal === opt}
                                onChange={() => handleRadioChange(qId, opt)}
                                style={{ accentColor: 'var(--brand-accent)', cursor: 'pointer' }}
                              />
                              <span>{opt}</span>
                            </label>
                          ))}
                        </div>
                      )}

                      {/* 3. Checkboxes – Multiple Choice */}
                      {qType === 'CHECKBOX' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                          {options.map((opt, oIdx) => {
                            const isChecked = Array.isArray(currentVal) && currentVal.includes(opt);
                            return (
                              <label
                                key={oIdx}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.65rem',
                                  fontSize: '0.88rem',
                                  color: 'var(--text-primary)',
                                  cursor: 'pointer',
                                  padding: '0.5rem 0.75rem',
                                  borderRadius: '7px',
                                  background: isChecked ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-secondary)',
                                  border: isChecked ? '1px solid var(--brand-accent)' : '1px solid var(--border-color)',
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleCheckboxToggle(qId, opt)}
                                  style={{ accentColor: 'var(--brand-accent)', cursor: 'pointer' }}
                                />
                                <span>{opt}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}

                      {/* 4. Dropdown – Single Selection */}
                      {qType === 'DROPDOWN' && (
                        <select
                          required={isReq}
                          className="dash-select"
                          value={currentVal || ''}
                          onChange={e => handleTextChange(qId, e.target.value)}
                          style={{ width: '100%', fontSize: '0.88rem' }}
                        >
                          <option value="">-- Select an option --</option>
                          {options.map((opt, oIdx) => (
                            <option key={oIdx} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      )}

                      {/* 5. Rating Scale */}
                      {qType === 'RATING' && (
                        <div>
                          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            {Array.from(
                              { length: (q.maxValue || 5) - (q.minValue || 1) + 1 },
                              (_, i) => (q.minValue || 1) + i
                            ).map(num => {
                              const isSelected = String(currentVal) === String(num);
                              return (
                                <button
                                  key={num}
                                  type="button"
                                  onClick={() => handleRatingSelect(qId, num)}
                                  style={{
                                    width: '46px',
                                    height: '46px',
                                    borderRadius: '8px',
                                    border: isSelected ? '2px solid var(--brand-accent)' : '1px solid var(--border-color)',
                                    background: isSelected ? 'var(--brand-accent)' : 'var(--bg-secondary)',
                                    color: isSelected ? '#fff' : 'var(--text-primary)',
                                    fontWeight: 700,
                                    fontSize: '1rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  {num}
                                </button>
                              );
                            })}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.45rem', maxWidth: '320px' }}>
                            <span>Lowest ({q.minValue || 1})</span>
                            <span>Highest ({q.maxValue || 5})</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button
                  type="submit"
                  disabled={submitting}
                  className="dash-btn-primary"
                  style={{ padding: '0.75rem 1.75rem', fontSize: '0.95rem' }}
                >
                  <Send size={15} /> {submitting ? 'Submitting Feedback...' : 'Submit Feedback'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            SUCCESS CONFIRMATION STEP
           ══════════════════════════════════════════════════════════════ */}
        {step === 'success' && (
          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem',
              }}
            >
              <CheckCircle2 size={36} color="#10b981" />
            </div>

            <h2 style={{ fontSize: '1.45rem', fontFamily: 'Outfit, sans-serif', color: 'var(--text-primary)', margin: '0 0 0.6rem 0' }}>
              Feedback Submitted Successfully!
            </h2>
            <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 auto 1.5rem', maxWidth: '420px' }}>
              Thank you for contributing to <strong>{campaign?.title || 'this consultation'}</strong>. Your responses have been securely recorded.
            </p>

            <div style={{ display: 'inline-flex', gap: '0.75rem' }}>
              <Link to="/" className="dash-btn-secondary" style={{ textDecoration: 'none' }}>
                Return to Home
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
