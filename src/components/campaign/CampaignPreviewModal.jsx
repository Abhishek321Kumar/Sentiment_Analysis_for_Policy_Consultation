import { useState } from 'react';
import { X, CheckCircle2, Star, HelpCircle, AlertCircle, FileText, Calendar } from 'lucide-react';

export default function CampaignPreviewModal({
  isOpen,
  onClose,
  campaignDetails = {},
  questions = [],
  orgName = 'PotentPolicy Institute',
}) {
  if (!isOpen) return null;

  // Local state to simulate stakeholder interaction during preview
  const [dummyAnswers, setDummyAnswers] = useState({});

  const handleRadioChange = (qId, option) => {
    setDummyAnswers(p => ({ ...p, [qId]: option }));
  };

  const handleCheckboxToggle = (qId, option) => {
    setDummyAnswers(p => {
      const current = Array.isArray(p[qId]) ? p[qId] : [];
      if (current.includes(option)) {
        return { ...p, [qId]: current.filter(x => x !== option) };
      }
      return { ...p, [qId]: [...current, option] };
    });
  };

  const handleRatingClick = (qId, rating) => {
    setDummyAnswers(p => ({ ...p, [qId]: rating }));
  };

  return (
    <div className="dash-modal-backdrop" onClick={onClose}>
      <div
        className="dash-modal dash-modal--wide"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '820px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        <div className="dash-modal-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.85rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
              <span className="dash-badge dash-badge--open" style={{ fontSize: '0.72rem' }}>
                Stakeholder View Preview
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                (Interactive Simulation)
              </span>
            </div>
            <h3 className="dash-modal-title" style={{ fontSize: '1.15rem' }}>
              {campaignDetails.title || 'Untitled Consultation Campaign'}
            </h3>
          </div>
          <button
            type="button"
            className="dash-modal-close"
            onClick={onClose}
            aria-label="Close Preview"
          >
            <X size={18} />
          </button>
        </div>

        <div className="dash-modal-body" style={{ overflowY: 'auto', padding: '1.25rem' }}>
          {/* Institution Header Card */}
          <div
            style={{
              padding: '1.25rem',
              borderRadius: '10px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              marginBottom: '1.25rem',
            }}
          >
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--brand-accent)', fontWeight: 700, marginBottom: '0.25rem' }}>
              {orgName}
            </div>
            <h2 style={{ fontSize: '1.35rem', fontFamily: 'Outfit, sans-serif', margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>
              {campaignDetails.title || 'Consultation Title'}
            </h2>
            {campaignDetails.description && (
              <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 0.75rem 0' }}>
                {campaignDetails.description}
              </p>
            )}

            {/* Metadata Pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginTop: '0.6rem' }}>
              {campaignDetails.objectives && (
                <div style={{ fontSize: '0.78rem', background: 'var(--bg-card)', padding: '0.35rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
                  <strong>Objective:</strong> {campaignDetails.objectives}
                </div>
              )}
              {campaignDetails.openingDate && campaignDetails.closingDate && (
                <div style={{ fontSize: '0.78rem', background: 'var(--bg-card)', padding: '0.35rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-color)', color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Calendar size={13} color="var(--brand-accent)" />
                  <span>
                    Consultation Window: {new Date(campaignDetails.openingDate).toLocaleDateString()} &mdash; {new Date(campaignDetails.closingDate).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>

            {campaignDetails.additionalInstructions && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)', background: 'rgba(99, 102, 241, 0.05)', padding: '0.6rem 0.8rem', borderRadius: '6px', borderLeft: '3px solid var(--brand-accent)' }}>
                <strong>Instructions:</strong> {campaignDetails.additionalInstructions}
              </div>
            )}
          </div>

          {/* Consultation Questions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
            {questions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                No questions added yet. Add questions in the form builder to preview them here.
              </div>
            ) : (
              questions.map((q, idx) => {
                const qId = q.id || idx;
                const qType = (q.questionType || 'TEXT').toUpperCase();
                const isReq = q.isRequired !== false;
                const options = Array.isArray(q.options) ? q.options : [];
                const currentVal = dummyAnswers[qId];

                return (
                  <div
                    key={qId}
                    style={{
                      padding: '1.15rem',
                      borderRadius: '8px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-color)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.65rem', gap: '0.5rem' }}>
                      <label style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.4 }}>
                        <span style={{ color: 'var(--brand-accent)', marginRight: '0.4rem' }}>{idx + 1}.</span>
                        {q.questionText || `Question ${idx + 1}`}
                        {isReq && <span style={{ color: 'var(--sentiment-negative)', marginLeft: '0.3rem' }}>*</span>}
                      </label>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '100px',
                          background: 'var(--bg-secondary)',
                          color: 'var(--text-muted)',
                          whiteSpace: 'nowrap',
                          textTransform: 'uppercase',
                          fontWeight: 600,
                          letterSpacing: '0.04em',
                        }}
                      >
                        {qType}
                      </span>
                    </div>

                    {/* Question Input rendering based on Type */}
                    {qType === 'TEXT' && (
                      <div>
                        <textarea
                          rows={3}
                          className="dash-textarea"
                          placeholder="Type your feedback here..."
                          value={currentVal || ''}
                          onChange={e => setDummyAnswers(p => ({ ...p, [qId]: e.target.value }))}
                          style={{ width: '100%', fontSize: '0.86rem' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                          <span>Minimum: {q.minLength || 5} chars</span>
                          <span>Maximum: {q.maxLength || 2000} chars</span>
                        </div>
                      </div>
                    )}

                    {qType === 'RADIO' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {options.map((opt, oIdx) => (
                          <label
                            key={oIdx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.6rem',
                              fontSize: '0.86rem',
                              color: 'var(--text-primary)',
                              cursor: 'pointer',
                              padding: '0.4rem 0.6rem',
                              borderRadius: '6px',
                              background: currentVal === opt ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                              border: currentVal === opt ? '1px solid var(--brand-accent)' : '1px solid transparent',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <input
                              type="radio"
                              name={`preview-radio-${qId}`}
                              checked={currentVal === opt}
                              onChange={() => handleRadioChange(qId, opt)}
                              style={{ accentColor: 'var(--brand-accent)', cursor: 'pointer' }}
                            />
                            <span>{opt}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    {qType === 'CHECKBOX' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {options.map((opt, oIdx) => {
                          const checked = Array.isArray(currentVal) && currentVal.includes(opt);
                          return (
                            <label
                              key={oIdx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.6rem',
                                fontSize: '0.86rem',
                                color: 'var(--text-primary)',
                                cursor: 'pointer',
                                padding: '0.4rem 0.6rem',
                                borderRadius: '6px',
                                background: checked ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                                border: checked ? '1px solid var(--brand-accent)' : '1px solid transparent',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => handleCheckboxToggle(qId, opt)}
                                style={{ accentColor: 'var(--brand-accent)', cursor: 'pointer' }}
                              />
                              <span>{opt}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {qType === 'DROPDOWN' && (
                      <select
                        className="dash-select"
                        value={currentVal || ''}
                        onChange={e => setDummyAnswers(p => ({ ...p, [qId]: e.target.value }))}
                        style={{ width: '100%', fontSize: '0.86rem' }}
                      >
                        <option value="">-- Select an option --</option>
                        {options.map((opt, oIdx) => (
                          <option key={oIdx} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    )}

                    {qType === 'RATING' && (
                      <div>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          {Array.from(
                            { length: (q.maxValue || 5) - (q.minValue || 1) + 1 },
                            (_, i) => (q.minValue || 1) + i
                          ).map(num => (
                            <button
                              key={num}
                              type="button"
                              onClick={() => handleRatingClick(qId, num)}
                              style={{
                                width: '42px',
                                height: '42px',
                                borderRadius: '8px',
                                border: currentVal === num ? '2px solid var(--brand-accent)' : '1px solid var(--border-color)',
                                background: currentVal === num ? 'var(--brand-accent)' : 'var(--bg-secondary)',
                                color: currentVal === num ? '#fff' : 'var(--text-primary)',
                                fontWeight: 700,
                                fontSize: '0.95rem',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {num}
                            </button>
                          ))}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.4rem', maxWidth: '300px' }}>
                          <span>Lowest ({q.minValue || 1})</span>
                          <span>Highest ({q.maxValue || 5})</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="dash-modal-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
            This is an accurate representation of what assigned stakeholders will see.
          </span>
          <button type="button" className="dash-btn-secondary" onClick={onClose}>
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
}

