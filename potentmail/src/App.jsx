import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Mail, Inbox, Trash2, RefreshCw, Search,
  ArrowRight, ArrowLeft, Check, Copy,
  Sun, Moon, User, CheckCircle2
} from 'lucide-react';
import './App.css';

// Helper to render body text with auto-detected clickable links opening in a new tab
function renderEmailBodyWithLinks(text) {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: 'var(--pm-accent, #3b82f6)',
            textDecoration: 'underline',
            fontWeight: 600,
            wordBreak: 'break-all',
            cursor: 'pointer'
          }}
          onClick={e => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

export default function App() {
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [activeFilter, setActiveFilter] = useState('ALL'); // 'ALL' | email string
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSpinning, setIsSpinning] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [copiedText, setCopiedText] = useState(false);
  const [mobileView, setMobileView] = useState('list'); // 'list' | 'detail'
  const [darkMode, setDarkMode] = useState(false);

  const selectedEmailRef = useRef(selectedEmail);

  useEffect(() => {
    selectedEmailRef.current = selectedEmail;
  }, [selectedEmail]);

  // Compute base URL of System A (PotentPolicy) dynamically to support localhost, 127.0.0.1, or mobile Wi-Fi IP
  const potentPolicyUrl = useMemo(() => {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    return `${protocol}//${hostname}:5173`;
  }, []);

  // Fetch emails from API (/api/dev/emails proxied to backend:5000)
  const fetchEmails = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/dev/emails');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const raw = data.emails || [];
      // Explicitly sort descending: most recent mail on top followed by previous mail
      const fetched = raw
        .slice()
        .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime() || (b.id || 0) - (a.id || 0));
      setEmails(fetched);

      // Auto-select latest email if none selected or if new emails arrived
      if (fetched.length > 0) {
        if (!selectedEmailRef.current) {
          setSelectedEmail(fetched[0]);
        } else {
          const found = fetched.find(e => e.id === selectedEmailRef.current.id);
          setSelectedEmail(found || fetched[0]);
        }
      }
      if (!silent) setLoading(false);
      return fetched;
    } catch (err) {
      console.warn('Failed to fetch PotentMail emails:', err.message);
      if (!silent) setLoading(false);
      return [];
    }
  };

  const handleManualRefresh = async () => {
    setIsSpinning(true);
    const start = Date.now();
    try {
      const updated = await fetchEmails(false);
      if (updated && updated.length > 0) {
        setSelectedEmail(updated[0]);
      }
    } finally {
      const elapsed = Date.now() - start;
      const remain = Math.max(650 - elapsed, 0);
      setTimeout(() => setIsSpinning(false), remain);
    }
  };

  // Initial load
  useEffect(() => {
    fetchEmails();
  }, []);

  // Live Sync polling (every 3 seconds)
  useEffect(() => {
    if (!autoSync) return;
    const interval = setInterval(() => {
      fetchEmails(true);
    }, 3000);
    return () => clearInterval(interval);
  }, [autoSync]);

  // Extract unique stakeholder recipient emails
  const distinctRecipients = useMemo(() => {
    const set = new Set();
    emails.forEach(e => {
      if (e.to_email) set.add(e.to_email.toLowerCase());
    });
    return Array.from(set);
  }, [emails]);

  // Filtered emails list sorted with most recent on top
  const filteredEmails = useMemo(() => {
    return emails
      .filter(em => {
        if (activeFilter !== 'ALL' && em.to_email?.toLowerCase() !== activeFilter.toLowerCase()) {
          return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchesSubject = em.subject?.toLowerCase().includes(q);
          const matchesTo = em.to_email?.toLowerCase().includes(q);
          const matchesBody = em.body?.toLowerCase().includes(q);
          return matchesSubject || matchesTo || matchesBody;
        }
        return true;
      })
      .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime() || (b.id || 0) - (a.id || 0));
  }, [emails, activeFilter, searchQuery]);

  const handleClearAll = async () => {
    if (!window.confirm('Delete all messages from mailbox?')) return;
    try {
      const res = await fetch('/api/dev/emails', { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEmails([]);
      setSelectedEmail(null);
    } catch (err) {
      alert(err.message || 'Failed to clear mailbox.');
    }
  };

  const handleDeleteOne = async (id, e) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/dev/emails/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEmails(prev => prev.filter(em => em.id !== id));
      if (selectedEmail?.id === id) {
        const remaining = emails.filter(em => em.id !== id);
        setSelectedEmail(remaining.length > 0 ? remaining[0] : null);
      }
    } catch (err) {
      alert(err.message || 'Failed to delete email.');
    }
  };

  const copyToClipboard = text => {
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  // Helper to extract campaign code, OTP, or link from email body
  const parsedData = useMemo(() => {
    if (!selectedEmail?.body) return {};

    const body = selectedEmail.body;

    // Campaign Code
    const campMatch = body.match(/Campaign Code:\s*([A-Z0-9]+)/i);
    const campaignCode = campMatch ? campMatch[1] : null;

    // OTP Code
    const otpMatch = body.match(/verification code is:\s*([0-9]{6})/i) || body.match(/\b([0-9]{6})\b/);
    const otpCode = selectedEmail.template === 'OTP' && otpMatch ? otpMatch[1] : null;

    // Org Code
    const orgMatch = body.match(/Organisation Code:\s*([A-Z0-9]+)/i);
    const orgCode = orgMatch ? orgMatch[1] : null;

    // Direct Action / Activation URL
    const actMatch = body.match(/(?:Activation Link|Registration Link|Verification Link|Participation Link):\s*(https?:\/\/[^\s]+)/i);
    const urlMatch = body.match(/(https?:\/\/[^\s]+)/i);
    const activationUrl = actMatch ? actMatch[1] : urlMatch ? urlMatch[1] : null;

    return { campaignCode, otpCode, orgCode, activationUrl };
  }, [selectedEmail]);

  const getTagClass = template => {
    switch (template) {
      case 'CAMPAIGN_INVITE': return 'pm-tag--invite';
      case 'OTP': return 'pm-tag--otp';
      case 'ORG_CODE': return 'pm-tag--org';
      case 'MANAGER_INVITE': return 'pm-tag--manager';
      case 'PASSWORD_RESET': return 'pm-tag--otp';
      default: return 'pm-tag--default';
    }
  };

  const getTagLabel = template => {
    switch (template) {
      case 'CAMPAIGN_INVITE': return 'Consultation';
      case 'OTP': return 'Verification OTP';
      case 'ORG_CODE': return 'Org Code';
      case 'MANAGER_INVITE': return 'Manager Invitation';
      case 'STAKEHOLDER_ADDED': return 'Enrolled';
      case 'PASSWORD_RESET': return 'Password Reset';
      default: return 'Notice';
    }
  };

  return (
    <div className={`potentmail-app ${darkMode ? 'pm-theme-dark' : 'pm-theme-light'}`}>

      {/* ── CLEAN TOP HEADER ── */}
      <header className="pm-topbar">
        <div className="pm-topbar__left">
          <div className="pm-topbar__brand">
            <div className="pm-topbar__logo">
              <Mail size={18} />
            </div>
            <div className="pm-topbar__title-group">
              <span className="pm-topbar__name">PotentMail</span>
              <span className="pm-topbar__tag">Corporate Webmail</span>
            </div>
          </div>
        </div>

        {/* Global Search Bar */}
        <div className="pm-topbar__search">
          <Search size={15} />
          <input
            type="text"
            placeholder="Search messages by recipient, subject, or keyword..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Action Controls & Link to PotentPolicy */}
        <div className="pm-topbar__actions">
          <button
            type="button"
            className="pm-sync-status"
            onClick={() => setAutoSync(p => !p)}
            title="Toggle live polling"
          >
            <span className="pm-sync-dot" style={{ background: autoSync ? '#22c55e' : '#94a3b8' }} />
            <span>{autoSync ? 'Live Sync' : 'Paused'}</span>
          </button>

          <button
            type="button"
            className="pm-icon-btn"
            onClick={handleManualRefresh}
            title="Refresh messages"
            disabled={isSpinning}
          >
            <RefreshCw size={15} className={isSpinning || loading ? 'spin' : ''} />
          </button>

          {emails.length > 0 && (
            <button
              type="button"
              className="pm-icon-btn"
              onClick={handleClearAll}
              title="Clear all messages"
            >
              <Trash2 size={15} />
            </button>
          )}

          <button
            type="button"
            className="pm-icon-btn"
            onClick={() => setDarkMode(p => !p)}
            title="Toggle theme"
          >
            {darkMode ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {/* User Requested: Button to go to PotentPolicy main page */}
          <a
            href={potentPolicyUrl}
            target="_blank"
            rel="noreferrer"
            className="pm-btn-potentpolicy"
            title="Open PotentPolicy Platform (Port 5173)"
          >
            <span>Go to PotentPolicy</span>
            <ArrowRight size={14} />
          </a>
        </div>
      </header>

      {/* ── 3-COLUMN WORKSPACE ── */}
      <div className="pm-workspace">

        {/* ═════════ COLUMN 1: CLEAN MINIMAL SIDEBAR ═════════ */}
        <aside className="pm-sidebar">
          {/* Main Inboxes */}
          <div className="pm-nav-section">
            <span className="pm-nav-heading">Inboxes</span>
            <button
              type="button"
              className={`pm-nav-item ${activeFilter === 'ALL' ? 'pm-nav-item--active' : ''}`}
              onClick={() => setActiveFilter('ALL')}
            >
              <div className="pm-nav-item__left">
                <Inbox size={16} />
                <span>All Inboxes</span>
              </div>
              <span className="pm-nav-count">{emails.length}</span>
            </button>
          </div>

          {/* Accounts List */}
          <div className="pm-nav-section" style={{ flex: 1 }}>
            <span className="pm-nav-heading">Accounts</span>
            {distinctRecipients.length === 0 ? (
              <div className="pm-sidebar-empty">
                <span>No active recipient inboxes yet.</span>
              </div>
            ) : (
              <div className="pm-accounts-scroll">
                {distinctRecipients.map(recipient => {
                  const count = emails.filter(e => e.to_email?.toLowerCase() === recipient).length;
                  const isSelected = activeFilter.toLowerCase() === recipient;
                  return (
                    <button
                      key={recipient}
                      type="button"
                      className={`pm-inbox-user ${isSelected ? 'pm-inbox-user--active' : ''}`}
                      onClick={() => setActiveFilter(recipient)}
                    >
                      <div className="pm-inbox-user__row">
                        <div className="pm-inbox-user__avatar">
                          <User size={12} />
                        </div>
                        <span className="pm-inbox-user__email" title={recipient}>
                          {recipient}
                        </span>
                        <span className="pm-inbox-user__count">
                          {count}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* ═════════ COLUMN 2: MESSAGE STREAM ═════════ */}
        <section className="pm-message-list">
          <div className="pm-list-header">
            <div className="pm-list-header__left">
              <span className="pm-list-header__title">
                {activeFilter === 'ALL' ? 'All Messages' : activeFilter}
              </span>
              <span className="pm-list-header__count">
                ({filteredEmails.length})
              </span>
            </div>

            {activeFilter !== 'ALL' && (
              <button
                type="button"
                onClick={() => setActiveFilter('ALL')}
                className="pm-clear-filter-btn"
              >
                Clear filter
              </button>
            )}
          </div>

          <div className="pm-list-scroll">
            {filteredEmails.length === 0 ? (
              <div className="pm-empty-list">
                <div className="pm-empty-icon-wrap">
                  <Inbox size={32} />
                </div>
                <div className="pm-empty-title">Inbox is clear</div>
                <p className="pm-empty-desc">
                  Incoming stakeholder invitations and verification notices will appear here.
                </p>
              </div>
            ) : (
              filteredEmails.map(em => {
                const isSelected = selectedEmail?.id === em.id;
                return (
                  <div
                    key={em.id}
                    className={`pm-mail-item ${isSelected ? 'pm-mail-item--selected' : ''}`}
                    onClick={() => {
                      setSelectedEmail(em);
                      setMobileView('detail');
                    }}
                  >
                    <div className="pm-mail-item__top">
                      <span className={`pm-tag ${getTagClass(em.template)}`}>
                        {getTagLabel(em.template)}
                      </span>
                      <span className="pm-mail-time">
                        {new Date(em.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="pm-mail-subject" title={em.subject}>
                      {em.subject}
                    </div>

                    <div className="pm-mail-item__meta">
                      <span className="pm-mail-to">To: {em.to_email}</span>
                      <button
                        type="button"
                        onClick={e => handleDeleteOne(em.id, e)}
                        title="Delete message"
                        className="pm-delete-item-btn"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    <div className="pm-mail-snippet">
                      {em.body?.slice(0, 95)}...
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* ═════════ COLUMN 3: READING PANE ═════════ */}
        <main className={`pm-reading-pane ${mobileView === 'detail' ? 'pm-reading-pane--mobile-open' : ''}`}>
          {mobileView === 'detail' && (
            <button
              type="button"
              className="pm-mobile-back-btn"
              onClick={() => setMobileView('list')}
            >
              <ArrowLeft size={16} />
              <span>Back to Messages</span>
            </button>
          )}

          {!selectedEmail ? (
            <div className="pm-empty-reading-pane">
              <div className="pm-empty-icon-wrap" style={{ width: 54, height: 54 }}>
                <Mail size={28} />
              </div>
              <div className="pm-empty-title">No message selected</div>
              <p className="pm-empty-desc">
                Select an invitation or notice from the list to view its full details and participation link.
              </p>
            </div>
          ) : (
            <div className="pm-reading-content">
              {/* Reading Header */}
              <div className="pm-reading-header">
                <div className="pm-reading-title-row">
                  <h1 className="pm-reading-subject">
                    {selectedEmail.subject}
                  </h1>

                  <button
                    type="button"
                    onClick={e => handleDeleteOne(selectedEmail.id, e)}
                    className="pm-icon-btn"
                    title="Delete message"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                <div className="pm-reading-meta-row">
                  <div className="pm-sender-card">
                    <div className="pm-sender-avatar">
                      PP
                    </div>
                    <div className="pm-sender-info">
                      <div className="pm-sender-name">
                        PotentPolicy System &lt;noreply@potentpolicy.com&gt;
                      </div>
                      <div className="pm-recipient-badge">
                        Recipient: <strong>{selectedEmail.to_email}</strong>
                      </div>
                    </div>
                  </div>

                  <span className="pm-reading-date">
                    {new Date(selectedEmail.sent_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </div>
              </div>

              {/* ── CONTEXT-AWARE SMART ACTION BANNER ── */}
              {selectedEmail.template === 'CAMPAIGN_INVITE' && parsedData.campaignCode && (
                <div className="pm-action-banner pm-action-banner--campaign">
                  <div className="pm-action-banner__left">
                    <span className="pm-action-banner__title">
                      Stakeholder Policy Consultation Invitation
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                      <span className="pm-action-banner__desc">Campaign Code:</span>
                      <span className="pm-action-banner__code">{parsedData.campaignCode}</span>
                    </div>
                  </div>

                  <a
                    href={`${potentPolicyUrl}/participate?code=${parsedData.campaignCode}&email=${encodeURIComponent(selectedEmail.to_email)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="pm-action-banner__btn"
                  >
                    <span>Enter Consultation as Stakeholder</span>
                    <ArrowRight size={15} />
                  </a>
                </div>
              )}

              {selectedEmail.template === 'OTP' && parsedData.otpCode && (
                <div className="pm-action-banner pm-action-banner--otp">
                  <div className="pm-action-banner__left">
                    <span className="pm-action-banner__title">
                      Security Verification Code
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                      <span className="pm-action-banner__desc">6-Digit OTP:</span>
                      <span className="pm-action-banner__code">
                        {parsedData.otpCode}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => copyToClipboard(parsedData.otpCode)}
                    className="pm-action-banner__btn"
                  >
                    {copiedText ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedText ? 'Copied' : 'Copy OTP'}</span>
                  </button>
                </div>
              )}

              {selectedEmail.template === 'MANAGER_INVITE' && parsedData.orgCode && (
                <div className="pm-action-banner pm-action-banner--manager">
                  <div className="pm-action-banner__left">
                    <span className="pm-action-banner__title">
                      Campaign Manager Invitation
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                      <span className="pm-action-banner__desc">Organisation Code:</span>
                      <span className="pm-action-banner__code">
                        {parsedData.orgCode}
                      </span>
                    </div>
                  </div>

                  <a
                    href={parsedData.activationUrl || `${potentPolicyUrl}/register/manager`}
                    target="_blank"
                    rel="noreferrer"
                    className="pm-action-banner__btn"
                  >
                    <span>Onboard as Manager</span>
                    <ArrowRight size={15} />
                  </a>
                </div>
              )}

              {selectedEmail.template === 'PASSWORD_RESET' && parsedData.activationUrl && (
                <div className="pm-action-banner pm-action-banner--manager">
                  <div className="pm-action-banner__left">
                    <span className="pm-action-banner__title">
                      Password Reset Requested
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                      <span className="pm-action-banner__desc">Security Link (Valid 1 hr):</span>
                    </div>
                  </div>

                  <a
                    href={parsedData.activationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="pm-action-banner__btn"
                  >
                    <span>Set New Password</span>
                    <ArrowRight size={15} />
                  </a>
                </div>
              )}

              {/* Formatted Clean Email Body with Clickable Links */}
              <div className="pm-reading-body">
                {renderEmailBodyWithLinks(selectedEmail.body)}
              </div>
            </div>
          )}
        </main>
      </div>

    </div>
  );
}
