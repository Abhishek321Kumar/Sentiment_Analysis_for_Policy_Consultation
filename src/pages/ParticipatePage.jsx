import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, Link } from 'react-router-dom';
import {
  MessageSquare, Send, CheckCircle2, AlertCircle, ArrowLeft,
  Calendar, RotateCw, Lock, HelpCircle, ShieldCheck, UserCheck, Star,
  AlertTriangle, X, FileText
} from 'lucide-react';
import api from '../services/api';
import MarkdownViewer from '../components/common/MarkdownViewer';

function renderStructuredDescription(rawText) {
  return <MarkdownViewer content={rawText} />;
}

export default function ParticipatePage() {
  const [searchParams] = useSearchParams();
  const invitationTokenFromUrl = searchParams.get('token');

  // Step: 'entry' | 'questions' | 'success' | 'already_submitted' | 'cancelled'
  // Stakeholder must ALWAYS pass through the intermediate verification portal ('entry')
  const [step, setStep] = useState('entry');

  // Manual entry states (for campaign code + email flow)
  const [campaignCode, setCampaignCode] = useState(() => (searchParams.get('code') || '').toUpperCase());
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Consultation data states
  const [token, setToken] = useState('');
  const [jwtToken, setJwtToken] = useState('');
  const [campaign, setCampaign] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [stakeholder, setStakeholder] = useState(null);

  // User responses: { [questionId]: value }
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);

  const handleConfirmCancel = () => {
    setShowCancelModal(false);
    setAnswers({});
    setSubmitError('');
    setStep('cancelled');
  };

  // Pre-fill campaign code if provided in query params or resolve from token
  useEffect(() => {
    const code = searchParams.get('code');
    if (code) {
      setCampaignCode(code.toUpperCase());
    } else if (invitationTokenFromUrl) {
      api.get(`/participate/token/${encodeURIComponent(invitationTokenFromUrl.trim())}`)
        .then(res => {
          const fetchedCode = res.campaign?.campaignCode || res.campaign?.campaign_code;
          if (fetchedCode) {
            setCampaignCode(fetchedCode.toUpperCase());
          }
        })
        .catch(() => {});
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

      setToken(res.invitationToken || res.token || '');
      setJwtToken(res.jwtToken || res.token);
      setCampaign(res.campaign);
      setQuestions(res.questions || []);
      setStakeholder(res.stakeholder || null);

      const initial = {};
      (res.questions || []).forEach(q => {
        const type = (q.questionType || q.question_type || 'TEXT').toUpperCase();
        initial[q.id] = type === 'CHECKBOX' ? [] : '';
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
      const qType = (q.questionType || q.question_type || 'TEXT').toUpperCase();
      const isReq = q.isRequired !== false && q.is_required !== false;
      const qTitle = q.questionText || q.question_text || 'Question';

      if (isReq) {
        const val = answers[q.id];
        if (
          val === undefined ||
          val === null ||
          (typeof val === 'string' && !val.trim()) ||
          (Array.isArray(val) && val.length === 0)
        ) {
          setSubmitError(`Please provide a response for Question: "${qTitle}"`);
          return;
        }
      }

      // If open text, validate min/max characters if entered
      if (qType === 'TEXT') {
        const textVal = (answers[q.id] || '').trim();
        if (textVal.length > 0) {
          const min = Number(q.minLength ?? q.min_length ?? 5);
          const max = Number(q.maxLength ?? q.max_length ?? 2000);
          if (textVal.length < min) {
            setSubmitError(`Question ${idx + 1} ("${qTitle}") requires at least ${min} characters (currently ${textVal.length}).`);
            const targetEl = document.getElementById(`question-card-${q.id}`);
            if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
          }
          if (textVal.length > max) {
            setSubmitError(`Question ${idx + 1} ("${qTitle}") cannot exceed ${max} characters (currently ${textVal.length}).`);
            const targetEl = document.getElementById(`question-card-${q.id}`);
            if (targetEl) {
              targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
              const txt = targetEl.querySelector('textarea');
              if (txt) txt.focus();
            }
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
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                    <span style={{ fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)' }}>
                      Policy Overview &amp; Background
                    </span>
                    {campaign.description.length > 250 && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--brand-accent)', fontWeight: 600 }}>
                        &darr; Scroll down to view full clauses
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      maxHeight: '260px',
                      overflowY: 'auto',
                      background: 'var(--bg-card, #ffffff)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      padding: '1rem 1.15rem',
                      fontSize: '0.86rem',
                      color: 'var(--text-secondary)',
                      lineHeight: '1.6',
                      boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.03)',
                    }}
                  >
                    {renderStructuredDescription(campaign.description)}
                  </div>
                </div>
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
                  const qType = (q.questionType || q.question_type || 'TEXT').toUpperCase();
                  const isReq = q.isRequired !== false && q.is_required !== false;
                  const currentVal = answers[qId];
                  let options = [];
                  if (Array.isArray(q.options)) {
                    options = q.options;
                  } else if (typeof q.options === 'string') {
                    try {
                      options = JSON.parse(q.options);
                    } catch {
                      options = [];
                    }
                  }
                  const qText = q.questionText || q.question_text || `Question ${idx + 1}`;

                  return (
                    <div
                      key={qId}
                      id={`question-card-${qId}`}
                      style={{
                        padding: '1.25rem',
                        borderRadius: '9px',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div style={{ marginBottom: '0.75rem' }}>
                        <label style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.4 }}>
                          <span style={{ color: 'var(--brand-accent)', marginRight: '0.45rem' }}>Q{idx + 1}.</span>
                          {qText}
                          {isReq && <span style={{ color: 'var(--sentiment-negative)', marginLeft: '0.35rem' }}>*</span>}
                        </label>
                      </div>

                      {/* 1. Open-Ended Text Question */}
                      {qType === 'TEXT' && (() => {
                        const min = Number(q.minLength ?? q.min_length ?? 5);
                        const max = Number(q.maxLength ?? q.max_length ?? 2000);
                        const textVal = currentVal || '';
                        const charCount = textVal.length;
                        const isOverLimit = max > 0 && charCount > max;
                        const isUnderMin = isReq && charCount > 0 && charCount < min;

                        return (
                          <div>
                            <textarea
                              required={isReq}
                              className="dash-textarea"
                              placeholder="Enter your detailed feedback..."
                              value={textVal}
                              onChange={e => handleTextChange(qId, e.target.value)}
                              style={{
                                width: '100%',
                                maxWidth: '100%',
                                height: '130px',
                                minHeight: '130px',
                                maxHeight: '130px',
                                resize: 'none',
                                overflowY: 'auto',
                                boxSizing: 'border-box',
                                fontSize: '0.88rem',
                                borderColor: isOverLimit ? '#ef4444' : undefined,
                                boxShadow: isOverLimit ? '0 0 0 2px rgba(239, 68, 68, 0.15)' : undefined,
                              }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', marginTop: '0.35rem', flexWrap: 'wrap', gap: '0.3rem' }}>
                              <span style={{ color: isUnderMin ? '#ea580c' : 'var(--text-muted)' }}>
                                Minimum: {min} chars {isUnderMin && `(need ${min - charCount} more)`}
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {isOverLimit && (
                                  <button
                                    type="button"
                                    onClick={() => handleTextChange(qId, textVal.slice(0, max))}
                                    style={{
                                      fontSize: '0.72rem',
                                      color: 'var(--brand-accent)',
                                      background: 'none',
                                      border: 'none',
                                      cursor: 'pointer',
                                      textDecoration: 'underline',
                                      padding: 0,
                                    }}
                                  >
                                    Trim to {max}
                                  </button>
                                )}
                                <span style={{
                                  fontWeight: isOverLimit ? 700 : 500,
                                  color: isOverLimit ? '#ef4444' : charCount > max * 0.9 ? 'var(--brand-accent)' : 'var(--text-muted)'
                                }}>
                                  {charCount} / {max} chars {isOverLimit && `(${charCount - max} over limit)`}
                                </span>
                              </div>
                            </div>

                            {/* Real-time inline warning banner */}
                            {isOverLimit && (
                              <div
                                style={{
                                  marginTop: '0.5rem',
                                  padding: '0.45rem 0.75rem',
                                  background: 'rgba(239, 68, 68, 0.08)',
                                  border: '1px solid #ef4444',
                                  borderRadius: '6px',
                                  color: '#ef4444',
                                  fontSize: '0.78rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.45rem',
                                }}
                              >
                                <AlertCircle size={14} style={{ flexShrink: 0 }} />
                                <span>Response exceeds the maximum limit of {max} characters by {charCount - max} character{charCount - max === 1 ? '' : 's'}. Please shorten it before submitting.</span>
                              </div>
                            )}
                          </div>
                        );
                      })()}

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
                                padding: '0.6rem 0.85rem',
                                borderRadius: '7px',
                                background: currentVal === opt ? 'rgba(194, 65, 12, 0.08)' : 'var(--bg-secondary)',
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
                                  padding: '0.6rem 0.85rem',
                                  borderRadius: '7px',
                                  background: isChecked ? 'rgba(194, 65, 12, 0.08)' : 'var(--bg-secondary)',
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
                          style={{
                            width: '100%',
                            fontSize: '0.88rem',
                            padding: '0.65rem 0.85rem',
                            borderRadius: '7px',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                          }}
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
                              { length: (q.maxValue || q.max_value || 5) - (q.minValue || q.min_value || 1) + 1 },
                              (_, i) => (q.minValue || q.min_value || 1) + i
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
                            <span>Lowest ({q.minValue || q.min_value || 1})</span>
                            <span>Highest ({q.maxValue || q.max_value || 5})</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)', gap: '1rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setShowCancelModal(true)}
                  className="dash-btn-secondary"
                  style={{
                    padding: '0.75rem 1.4rem',
                    fontSize: '0.92rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  <ArrowLeft size={16} /> Cancel / Back
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="dash-btn-primary"
                  style={{
                    padding: '0.75rem 1.75rem',
                    fontSize: '0.95rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    cursor: 'pointer',
                  }}
                >
                  <Send size={15} /> {submitting ? 'Submitting Feedback...' : 'Submit Feedback'}
                </button>
              </div>
            </form>

            {/* Cancel / Discard Confirmation Modal */}
            {showCancelModal && createPortal(
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  width: '100vw',
                  height: '100vh',
                  background: 'rgba(15, 23, 42, 0.65)',
                  backdropFilter: 'blur(3px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 99999,
                  padding: '1rem',
                  boxSizing: 'border-box',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    maxWidth: '460px',
                    background: 'var(--bg-card, #ffffff)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '14px',
                    padding: '1.75rem',
                    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '50%',
                        background: 'rgba(239, 68, 68, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <AlertTriangle size={22} color="#ef4444" />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif' }}>
                        Discard Feedback &amp; Exit?
                      </h4>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Participation status will remain PENDING
                      </span>
                    </div>
                  </div>

                  <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.55, margin: '0 0 1.25rem 0' }}>
                    Are you sure you want to cancel? Any answers you have entered so far will be <strong>discarded</strong>.
                    <br /><br />
                    Your feedback will <strong>not</strong> be submitted, and your participation status will continue to be shown as <strong>Pending</strong>. You can return later using your invitation link.
                  </p>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button
                      type="button"
                      onClick={() => setShowCancelModal(false)}
                      className="dash-btn-secondary"
                      style={{ padding: '0.65rem 1.2rem', fontSize: '0.88rem', cursor: 'pointer' }}
                    >
                      Continue Answering
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmCancel}
                      style={{
                        padding: '0.65rem 1.25rem',
                        fontSize: '0.88rem',
                        borderRadius: '8px',
                        fontWeight: 600,
                        border: 'none',
                        background: '#ef4444',
                        color: '#fff',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      Yes, Discard &amp; Exit
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            CANCELLED / PENDING STEP
           ══════════════════════════════════════════════════════════════ */}
        {step === 'cancelled' && (
          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'rgba(234, 88, 12, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem',
              }}
            >
              <AlertCircle size={36} color="var(--brand-accent)" />
            </div>

            <span
              style={{
                display: 'inline-block',
                background: 'rgba(234, 88, 12, 0.12)',
                color: 'var(--brand-accent)',
                padding: '0.3rem 0.85rem',
                borderRadius: '20px',
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.75rem',
              }}
            >
              Status: Feedback Not Submitted (Pending)
            </span>

            <h3 style={{ fontSize: '1.35rem', fontFamily: 'Outfit, sans-serif', color: 'var(--text-primary)', margin: '0 0 0.6rem 0' }}>
              Consultation Exited
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 auto 1.5rem', maxWidth: '420px' }}>
              Your answers were discarded and no responses were recorded. Your invitation remains open and valid until the consultation window closes.
            </p>

            <div style={{ display: 'inline-flex', gap: '0.85rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => setStep('questions')}
                className="dash-btn-primary"
                style={{ padding: '0.65rem 1.4rem', fontSize: '0.9rem', cursor: 'pointer' }}
              >
                Resume Consultation
              </button>
              <Link to="/" className="dash-btn-secondary" style={{ textDecoration: 'none', padding: '0.65rem 1.2rem', fontSize: '0.9rem' }}>
                Return to Home
              </Link>
            </div>
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
