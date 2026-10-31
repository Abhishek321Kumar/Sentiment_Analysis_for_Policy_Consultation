import { useState, useEffect } from 'react';
import { Mail, RefreshCw, Trash2, ArrowLeft, ExternalLink, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../services/api';

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
            color: 'var(--brand-accent)',
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

export default function DevOutboxPage() {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSpinning, setIsSpinning] = useState(false);
  const [error, setError] = useState('');
  const [selectedEmail, setSelectedEmail] = useState(null);

  const fetchEmails = async () => {
    setIsSpinning(true);
    setLoading(true);
    setError('');
    const start = Date.now();
    try {
      const res = await api.get('/dev/emails');
      const list = res.emails || [];
      setEmails(list);
      if (list.length > 0) {
        setSelectedEmail(list[0]);
      }
    } catch (err) {
      setError(err.message || 'Failed to load dev outbox.');
    } finally {
      setLoading(false);
      const elapsed = Date.now() - start;
      const remain = Math.max(650 - elapsed, 0);
      setTimeout(() => setIsSpinning(false), remain);
    }
  };

  useEffect(() => {
    fetchEmails();
  }, []);

  const handleClearAll = async () => {
    if (!window.confirm('Clear all captured test emails from the outbox?')) return;
    try {
      await api.del('/dev/emails');
      setEmails([]);
      setSelectedEmail(null);
    } catch (err) {
      alert(err.message || 'Failed to clear emails.');
    }
  };

  const handleDeleteOne = async (id, e) => {
    e.stopPropagation();
    try {
      await api.del(`/dev/emails/${id}`);
      setEmails(prev => prev.filter(em => em.id !== id));
      if (selectedEmail?.id === id) {
        setSelectedEmail(emails.find(em => em.id !== id) || null);
      }
    } catch (err) {
      alert(err.message || 'Failed to delete email.');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      padding: '2rem',
      fontFamily: 'Inter, sans-serif',
      color: 'var(--text-primary)',
    }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>

        {/* Top Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(180, 83, 9, 0.12)', color: 'var(--brand-accent)', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '700', marginBottom: '0.35rem' }}>
              <ShieldAlert size={12} /> Local Development Only
            </div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: '800', fontFamily: 'Outfit, sans-serif', margin: 0 }}>
              Dev Outbox (Email Capture)
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
              Inspect simulated background emails (OTPs, Org Codes, Invitations) without requiring an SMTP mail server.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Link
              to="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.55rem 1rem',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                textDecoration: 'none',
                fontSize: '0.85rem',
                fontWeight: '600',
              }}
            >
              <ArrowLeft size={14} /> Back to Home
            </Link>

            <button
              onClick={fetchEmails}
              disabled={isSpinning || loading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.55rem 1rem',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={14} className={isSpinning || loading ? 'spin' : ''} /> Refresh
            </button>

            {emails.length > 0 && (
              <button
                onClick={handleClearAll}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.55rem 1rem',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px',
                  color: 'var(--sentiment-negative)',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                <Trash2 size={14} /> Clear All
              </button>
            )}
          </div>
        </div>

        {error && (
          <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--sentiment-negative)', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
            {error}
          </div>
        )}

        {/* Master / Detail Split View */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '380px 1fr',
          gap: '1.5rem',
          minHeight: '560px',
        }}>

          {/* Email List Column */}
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <div style={{ padding: '0.9rem 1.25rem', borderBottom: '1px solid var(--border-color)', fontWeight: '700', fontSize: '0.875rem', background: 'var(--bg-tertiary)' }}>
              Captured Messages ({emails.length})
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {emails.length === 0 ? (
                <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  <Mail size={32} style={{ opacity: 0.4, margin: '0 auto 0.75rem' }} />
                  <div>No emails captured yet.</div>
                  <div style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>Perform actions in the app to see them here!</div>
                </div>
              ) : (
                emails.map(em => {
                  const isSelected = selectedEmail?.id === em.id;
                  return (
                    <div
                      key={em.id}
                      onClick={() => setSelectedEmail(em)}
                      style={{
                        padding: '1rem 1.25rem',
                        borderBottom: '1px solid var(--border-color)',
                        background: isSelected ? 'rgba(194, 65, 12, 0.08)' : 'transparent',
                        borderLeft: isSelected ? '4px solid var(--brand-accent)' : '4px solid transparent',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <span style={{
                          fontSize: '0.7rem',
                          fontWeight: '700',
                          background: 'var(--bg-tertiary)',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '4px',
                          color: 'var(--brand-accent)',
                          textTransform: 'uppercase',
                        }}>
                          {em.template || 'NOTICE'}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {new Date(em.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div style={{ fontWeight: '600', fontSize: '0.875rem', color: 'var(--text-primary)', marginBottom: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {em.subject}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.775rem', color: 'var(--text-secondary)' }}>
                          To: {em.to_email}
                        </span>
                        <button
                          onClick={e => handleDeleteOne(em.id, e)}
                          title="Delete"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            padding: '2px',
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Email Preview Column */}
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '1.75rem',
            display: 'flex',
            flexDirection: 'column',
          }}>
            {selectedEmail ? (
              <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1.25rem', marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: '700', background: 'rgba(194, 65, 12, 0.15)', color: 'var(--brand-accent)', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>
                      {selectedEmail.template || 'SYSTEM NOTIFICATION'}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {new Date(selectedEmail.sent_at).toLocaleString()}
                    </span>
                  </div>

                  <h2 style={{ fontSize: '1.35rem', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 0.5rem 0', fontFamily: 'Outfit, sans-serif' }}>
                    {selectedEmail.subject}
                  </h2>

                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    <strong>Recipient:</strong> <span style={{ fontFamily: 'monospace' }}>{selectedEmail.to_email}</span>
                  </div>
                </div>

                <div style={{
                  flex: 1,
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '1.25rem',
                  fontFamily: 'monospace',
                  fontSize: '0.9rem',
                  whiteSpace: 'pre-wrap',
                  lineHeight: '1.65',
                  overflowY: 'auto',
                  color: 'var(--text-primary)',
                }}>
                  {renderEmailBodyWithLinks(selectedEmail.body)}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Select a message on the left to inspect its contents.
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
