import { useState } from 'react';
import {
  X, Copy, Check, Calendar, Users, FileText, ExternalLink,
  Search, CheckCircle2, Clock, AlertCircle, HelpCircle
} from 'lucide-react';

export default function CampaignDetailsModal({
  isOpen,
  onClose,
  campaign = null,
  questions = [],
  participants = [],
  onEditDraft,
  onDelete,
}) {
  if (!isOpen || !campaign) return null;

  const [activeTab, setActiveTab] = useState('roster'); // 'roster' | 'questions' | 'details'
  const [copiedToken, setCopiedToken] = useState(null);
  const [rosterSearch, setRosterSearch] = useState('');

  const handleCopyLink = (token, pId) => {
    const fullUrl = `${window.location.origin}/participate?token=${token}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedToken(pId);
    setTimeout(() => setCopiedToken(null), 2500);
  };

  const filteredParticipants = participants.filter(p => {
    if (!rosterSearch.trim()) return true;
    const q = rosterSearch.toLowerCase();
    const name = `${p.first_name} ${p.last_name}`.toLowerCase();
    const email = (p.email || '').toLowerCase();
    const dept = (p.department || '').toLowerCase();
    return name.includes(q) || email.includes(q) || dept.includes(q);
  });

  const isDraft = campaign.status === 'DRAFT';
  const isOpenStatus = campaign.status === 'OPEN';
  const isClosed = campaign.status === 'CLOSED';
  const isDeleted = campaign.status === 'DELETED';

  return (
    <div className="dash-modal-backdrop" onClick={onClose}>
      <div
        className="dash-modal dash-modal--wide"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '920px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div className="dash-modal-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.85rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
              <span className={`dash-badge dash-badge--${campaign.status.toLowerCase()}`}>
                {campaign.status}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                Code: {campaign.campaign_code}
              </span>
            </div>
            <h3 className="dash-modal-title" style={{ fontSize: '1.25rem' }}>
              {campaign.title}
            </h3>
          </div>
          <button type="button" className="dash-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Sub-tabs Navigation */}
        <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
          <button
            type="button"
            className={`dash-btn-secondary dash-btn-sm ${activeTab === 'roster' ? 'active' : ''}`}
            onClick={() => setActiveTab('roster')}
            style={{
              background: activeTab === 'roster' ? 'var(--brand-accent)' : undefined,
              color: activeTab === 'roster' ? '#fff' : undefined,
              borderColor: activeTab === 'roster' ? 'var(--brand-accent)' : undefined,
            }}
          >
            <Users size={13} /> Stakeholder Roster &amp; Links ({participants.length})
          </button>

          <button
            type="button"
            className={`dash-btn-secondary dash-btn-sm ${activeTab === 'questions' ? 'active' : ''}`}
            onClick={() => setActiveTab('questions')}
            style={{
              background: activeTab === 'questions' ? 'var(--brand-accent)' : undefined,
              color: activeTab === 'questions' ? '#fff' : undefined,
              borderColor: activeTab === 'questions' ? 'var(--brand-accent)' : undefined,
            }}
          >
            <FileText size={13} /> Consultation Questions ({questions.length})
          </button>

          <button
            type="button"
            className={`dash-btn-secondary dash-btn-sm ${activeTab === 'details' ? 'active' : ''}`}
            onClick={() => setActiveTab('details')}
            style={{
              background: activeTab === 'details' ? 'var(--brand-accent)' : undefined,
              color: activeTab === 'details' ? '#fff' : undefined,
              borderColor: activeTab === 'details' ? 'var(--brand-accent)' : undefined,
            }}
          >
            <Calendar size={13} /> Policy Details &amp; Dates
          </button>
        </div>

        {/* Body Content */}
        <div className="dash-modal-body" style={{ overflowY: 'auto', padding: '1.25rem', flex: 1 }}>
          {/* TAB 1: STAKEHOLDER ROSTER & UNIQUE INVITATION LINKS */}
          {activeTab === 'roster' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Each participant has a unique, secure access link. Stakeholders do not need to register or log in.
                </div>
                <div className="dash-search-box" style={{ maxWidth: '280px' }}>
                  <Search size={14} />
                  <input
                    type="text"
                    className="dash-search-input"
                    placeholder="Search participant roster..."
                    value={rosterSearch}
                    onChange={e => setRosterSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="dash-table-wrap" style={{ maxHeight: '420px', overflowY: 'auto' }}>
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Participant Name</th>
                      <th>Email &amp; Department</th>
                      <th>Status</th>
                      <th>Submission Status</th>
                      <th style={{ textAlign: 'right' }}>Unique Access Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredParticipants.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                          No participants match the search query.
                        </td>
                      </tr>
                    ) : (
                      filteredParticipants.map(p => {
                        const isSubmitted = p.submission_status === 'SUBMITTED' || p.has_submitted || p.submitted_at;
                        const isCopied = copiedToken === p.id;
                        return (
                          <tr key={p.id}>
                            <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {p.full_name || `${p.first_name} ${p.last_name}`}
                              {p.category && (
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', fontWeight: 400 }}>
                                  {p.category}
                                </span>
                              )}
                            </td>
                            <td>
                              <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>{p.email}</div>
                              <span className="dash-pill" style={{ fontSize: '0.7rem' }}>{p.department || 'General'}</span>
                            </td>
                            <td>
                              <span
                                style={{
                                  fontSize: '0.74rem',
                                  padding: '0.2rem 0.5rem',
                                  borderRadius: '100px',
                                  background: isSubmitted ? 'rgba(16, 185, 129, 0.1)' : 'rgba(99, 102, 241, 0.1)',
                                  color: isSubmitted ? '#10b981' : 'var(--brand-accent)',
                                  fontWeight: 600,
                                }}
                              >
                                {isSubmitted ? 'Completed' : (isDraft ? 'Pending' : 'Sent')}
                              </span>
                            </td>
                            <td>
                              {isSubmitted ? (
                                <span style={{ fontSize: '0.76rem', color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600 }}>
                                  <CheckCircle2 size={13} /> Submitted
                                </span>
                              ) : (
                                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                  <Clock size={13} /> Awaiting Feedback
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {p.invitation_token ? (
                                <button
                                  type="button"
                                  onClick={() => handleCopyLink(p.invitation_token, p.id)}
                                  className="dash-btn-secondary dash-btn-sm"
                                  title="Copy unique consultation link"
                                  style={{
                                    fontSize: '0.75rem',
                                    padding: '0.25rem 0.6rem',
                                    background: isCopied ? 'rgba(16, 185, 129, 0.1)' : undefined,
                                    borderColor: isCopied ? '#10b981' : undefined,
                                    color: isCopied ? '#10b981' : undefined,
                                  }}
                                >
                                  {isCopied ? (
                                    <>
                                      <Check size={12} /> Copied!
                                    </>
                                  ) : (
                                    <>
                                      <Copy size={12} /> Copy Link
                                    </>
                                  )}
                                </button>
                              ) : (
                                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                  Available on publish
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: CONSULTATION QUESTIONS */}
          {activeTab === 'questions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {questions.map((q, idx) => {
                const qType = (q.question_type || q.questionType || 'TEXT').toUpperCase();
                const options = Array.isArray(q.options) ? q.options : [];
                return (
                  <div
                    key={q.id || idx}
                    style={{
                      padding: '1rem',
                      background: 'var(--bg-secondary)',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.45rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                        <span style={{ color: 'var(--brand-accent)', marginRight: '0.4rem' }}>Q{idx + 1}.</span>
                        {q.question_text || q.questionText}
                        {q.is_required !== false && <span style={{ color: 'var(--sentiment-negative)', marginLeft: '0.3rem' }}>*</span>}
                      </span>
                      <span className="dash-badge dash-badge--open" style={{ fontSize: '0.68rem' }}>
                        {qType}
                      </span>
                    </div>

                    {['RADIO', 'CHECKBOX', 'DROPDOWN'].includes(qType) && options.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
                        {options.map((opt, oIdx) => (
                          <span
                            key={oIdx}
                            style={{
                              fontSize: '0.74rem',
                              background: 'var(--bg-card)',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px',
                              border: '1px solid var(--border-color)',
                              color: 'var(--text-primary)',
                            }}
                          >
                            {opt}
                          </span>
                        ))}
                      </div>
                    )}

                    {qType === 'RATING' && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                        Configured Rating Range: {q.min_value ?? 1} to {q.max_value ?? 5}
                      </div>
                    )}

                    {qType === 'TEXT' && (
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                        Character limit: {q.min_length ?? 5} to {q.max_length ?? 2000} chars &bull; Sentiment Analysis Enabled
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 3: POLICY DETAILS & DATES */}
          {activeTab === 'details' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="dash-profile-display-grid">
                <div className="dash-profile-display-item">
                  <span className="dash-profile-display-label">Consultation Objectives</span>
                  <span className="dash-profile-display-value">{campaign.objectives || 'None specified'}</span>
                </div>

                <div className="dash-profile-display-item">
                  <span className="dash-profile-display-label">Start Date</span>
                  <span className="dash-profile-display-value">
                    {new Date(campaign.opening_date).toLocaleDateString()}
                  </span>
                </div>

                <div className="dash-profile-display-item">
                  <span className="dash-profile-display-label">Closing Date</span>
                  <span className="dash-profile-display-value">
                    {new Date(campaign.closing_date).toLocaleDateString()}
                  </span>
                </div>

                <div className="dash-profile-display-item">
                  <span className="dash-profile-display-label">Created By</span>
                  <span className="dash-profile-display-value">
                    {campaign.creator_first_name} {campaign.creator_last_name} ({campaign.creator_email})
                  </span>
                </div>
              </div>

              {campaign.description && (
                <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px' }}>
                  <span style={{ fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                    Background &amp; Description
                  </span>
                  <p style={{ fontSize: '0.86rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.5 }}>
                    {campaign.description}
                  </p>
                </div>
              )}

              {campaign.additional_instructions && (
                <div style={{ background: 'rgba(99, 102, 241, 0.05)', padding: '1rem', borderRadius: '8px', borderLeft: '3px solid var(--brand-accent)' }}>
                  <span style={{ fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--brand-accent)', display: 'block', marginBottom: '0.35rem' }}>
                    Stakeholder Instructions
                  </span>
                  <p style={{ fontSize: '0.84rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.5 }}>
                    {campaign.additional_instructions}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="dash-modal-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {isDraft && onEditDraft && (
              <button
                type="button"
                className="dash-btn-primary dash-btn-sm"
                onClick={() => {
                  onClose();
                  onEditDraft(campaign);
                }}
              >
                Edit Draft Campaign
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {!isDeleted && onDelete && (
              <button
                type="button"
                className="dash-btn-secondary dash-btn-sm"
                style={{ color: 'var(--sentiment-negative)' }}
                onClick={() => {
                  onClose();
                  onDelete(campaign);
                }}
              >
                Delete Campaign
              </button>
            )}
            <button type="button" className="dash-btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

