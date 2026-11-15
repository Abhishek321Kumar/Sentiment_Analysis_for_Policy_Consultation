import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  CheckCircle2,
  Clock,
  Sparkles,
  Zap,
  Play,
  RotateCcw,
  Settings,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  FileText,
  Send,
  Eye,
  ExternalLink,
  Bot,
  RefreshCw,
  X,
  Key,
} from 'lucide-react';
import {
  fetchEmails,
  verifyStakeholder,
  fetchTokenDetails,
  submitFeedback,
  deleteEmail,
} from './services/api.js';
import {
  ARCHETYPES,
  assignStakeholderPersona,
  generateOfflineAnswer,
  generateAIAnswer,
} from './services/personaEngine.js';

export default function App() {
  const [emails, setEmails] = useState([]);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [activeTab, setActiveTab] = useState('campaigns'); // 'campaigns' | 'registration' | 'logs'
  const [statusMessage, setStatusMessage] = useState(null);

  // Settings
  const [geminiApiKey, setGeminiApiKey] = useState(() => localStorage.getItem('potentsim_gemini_key') || '');
  const [useAI, setUseAI] = useState(() => localStorage.getItem('potentsim_use_ai') === 'true');
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Dismissed Campaign Codes (manually removed from simulation workspace)
  const [dismissedCodes, setDismissedCodes] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('potentsim_dismissed_codes') || '[]');
    } catch {
      return [];
    }
  });

  // Registration State
  const [verifyingMap, setVerifyingMap] = useState({});
  const [verifiedIds, setVerifiedIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('potentsim_verified_ids') || '[]');
    } catch {
      return [];
    }
  });

  // Campaign Simulation State
  const [campaignDetailsMap, setCampaignDetailsMap] = useState({});
  const [simulatingMap, setSimulatingMap] = useState({});
  const [batchSimulating, setBatchSimulating] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, campaignCode: null });

  // Inspection / Preview Modal
  const [previewData, setPreviewData] = useState(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Activity Logs
  const [activityLogs, setActivityLogs] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('potentsim_activity_logs') || '[]');
    } catch {
      return [];
    }
  });

  const pollIntervalRef = useRef(null);

  // Save state helpers
  const recordLog = (type, title, details = {}) => {
    const entry = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toLocaleTimeString(),
      type,
      title,
      details,
    };
    setActivityLogs(prev => {
      const updated = [entry, ...prev].slice(0, 50);
      try {
        localStorage.setItem('potentsim_activity_logs', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const markVerified = userId => {
    setVerifiedIds(prev => {
      const updated = Array.from(new Set([...prev, userId]));
      try {
        localStorage.setItem('potentsim_verified_ids', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  // ── 1. Auto-polling emails from PotentPolicy Dev Outbox ──
  const refreshEmails = async (silent = false) => {
    if (!silent) setLoadingEmails(true);
    try {
      const list = await fetchEmails();
      setEmails(list);
    } catch (err) {
      console.warn('Failed to poll emails:', err.message);
    } finally {
      if (!silent) setLoadingEmails(false);
    }
  };

  useEffect(() => {
    refreshEmails();
    pollIntervalRef.current = setInterval(() => {
      refreshEmails(true);
    }, 3000);
    return () => clearInterval(pollIntervalRef.current);
  }, []);

  // ── 2. Parse Stakeholder Registration Emails (STAKEHOLDER_ADDED) ──
  const parsedRegistrations = React.useMemo(() => {
    const regEmails = emails.filter(e => e.template === 'STAKEHOLDER_ADDED');
    const list = [];
    for (const em of regEmails) {
      const body = em.body || '';
      const userIdMatch = body.match(/Stakeholder ID:\s*([^\r\n]+)/i);
      const orgCodeMatch = body.match(/Organisation Code:\s*([^\r\n]+)/i);
      const firstNameMatch = body.match(/Hello\s+([^,]+),/i);

      if (userIdMatch && orgCodeMatch) {
        const userId = userIdMatch[1].trim();
        const orgCode = orgCodeMatch[1].trim();
        const firstName = firstNameMatch ? firstNameMatch[1].trim() : 'Stakeholder';
        const isVerified = verifiedIds.includes(userId);

        list.push({
          emailId: em.id,
          toEmail: em.to_email,
          firstName,
          userId,
          orgCode,
          sentAt: em.sent_at,
          isVerified,
        });
      }
    }
    return list;
  }, [emails, verifiedIds]);

  const pendingRegistrations = parsedRegistrations.filter(r => !r.isVerified);

  // ── 3. Parse Campaign Invitation Emails (CAMPAIGN_INVITE) ──
  const parsedCampaignInvites = React.useMemo(() => {
    const inviteEmails = emails.filter(e => e.template === 'CAMPAIGN_INVITE');
    const campaignsByCode = {};

    for (const em of inviteEmails) {
      const body = em.body || '';
      const subject = em.subject || '';
      const campCodeMatch = body.match(/Campaign Code:\s*([A-Z0-9]+)/i);
      const tokenMatch = body.match(/token=([a-f0-9]+)/i);
      const titleMatch = subject.replace('Consultation Invitation: ', '').trim();
      const closingDateMatch = body.match(/Closing Date:\s*([^\r\n]+)/i);
      const nameMatch = body.match(/Hello\s+([^,\r\n]+),/i);
      const parsedFirstName = nameMatch ? nameMatch[1].trim() : '';

      if (campCodeMatch && tokenMatch) {
        const code = campCodeMatch[1].trim();
        const token = tokenMatch[1].trim();
        const title = titleMatch || 'Policy Consultation';
        const closingDate = closingDateMatch ? closingDateMatch[1].trim() : '';

        if (!campaignsByCode[code]) {
          campaignsByCode[code] = {
            campaignCode: code,
            title,
            closingDate,
            participants: [],
          };
        }

        // Avoid duplicate token entries
        if (!campaignsByCode[code].participants.some(p => p.token === token)) {
          campaignsByCode[code].participants.push({
            emailId: em.id,
            toEmail: em.to_email,
            token,
            firstName: parsedFirstName,
            sentAt: em.sent_at,
          });
        }
      }
    }

    return Object.values(campaignsByCode);
  }, [emails]);

  // ── Sync / poll token details for consultation participants ──
  // Regularly queries participant tokens so PotentSim immediately detects:
  // 1. When a consultation transitions from DRAFT to OPEN
  // 2. When a stakeholder manually submits their feedback in PotentPolicy
  const syncParticipantTokens = React.useCallback(async (force = false) => {
    if (!parsedCampaignInvites || parsedCampaignInvites.length === 0) return;

    for (const camp of parsedCampaignInvites) {
      for (const p of camp.participants) {
        const existing = campaignDetailsMap[p.token];
        // If already submitted and not forcing, skip re-querying
        if (!force && existing && (existing.alreadySubmitted || existing.submission_status === 'SUBMITTED')) {
          continue;
        }

        try {
          const data = await fetchTokenDetails(p.token);
          setCampaignDetailsMap(prev => ({
            ...prev,
            [p.token]: data,
          }));
        } catch (err) {
          const errMsg = (err.message || '').toLowerCase();
          let inferredStatus = err.status || null;
          if (errMsg.includes('draft') || errMsg.includes('not yet been published')) {
            inferredStatus = 'DRAFT';
          } else if (errMsg.includes('deleted') || errMsg.includes('no longer available') || errMsg.includes('invalid or expired')) {
            inferredStatus = 'DELETED';
          } else if (errMsg.includes('closed') || errMsg.includes('expired')) {
            inferredStatus = 'CLOSED';
          }

          const isAlreadySub = errMsg.includes('already submitted') || err.data?.alreadySubmitted;
          setCampaignDetailsMap(prev => ({
            ...prev,
            [p.token]: {
              error: isAlreadySub ? null : err.message,
              status: inferredStatus || (isAlreadySub ? 'OPEN' : null),
              alreadySubmitted: isAlreadySub,
              submission_status: isAlreadySub ? 'SUBMITTED' : (prev[p.token]?.submission_status || 'PENDING'),
              stakeholder: err.data?.stakeholder || prev[p.token]?.stakeholder || null,
              campaign: err.data?.campaign || prev[p.token]?.campaign || null,
            },
          }));
        }
      }
    }
  }, [parsedCampaignInvites, campaignDetailsMap]);

  // Initial and reactive fetch of token details
  useEffect(() => {
    syncParticipantTokens(false);
  }, [parsedCampaignInvites]);

  // Periodic polling interval to detect live manual submissions and campaign status changes
  useEffect(() => {
    const tokenPollTimer = setInterval(() => {
      syncParticipantTokens(false);
    }, 4000);
    return () => clearInterval(tokenPollTimer);
  }, [syncParticipantTokens]);

  const dismissCampaign = (code) => {
    setDismissedCodes(prev => {
      const updated = Array.from(new Set([...prev, code]));
      try {
        localStorage.setItem('potentsim_dismissed_codes', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    setStatusMessage({ type: 'info', text: `Campaign (${code}) dismissed from simulation workspace.` });
  };

  // ── Filter: STRICTLY SHOW ONLY ACTIVE (OPEN) CONSULTATIONS ──
  // Only campaigns verified as OPEN and accepting stakeholder responses appear in the active simulation view
  const activeCampaigns = React.useMemo(() => {
    return parsedCampaignInvites.filter(camp => {
      // 1. Manually dismissed by user
      if (dismissedCodes.includes(camp.campaignCode)) return false;

      const participants = camp.participants;
      if (participants.length === 0) return false;

      // 2. Inspect participant token verification states
      let hasConfirmedOpen = false;
      let hasDraft = false;
      let hasClosed = false;
      let hasDeleted = false;
      let loadedCount = 0;

      for (const p of participants) {
        const det = campaignDetailsMap[p.token];
        if (!det) continue;
        loadedCount++;

        const err = (det.error || '').toLowerCase();
        const status = (det.campaign?.status || det.status || '').toUpperCase();

        // If token loaded valid consultation questions/campaign metadata, or alreadySubmitted,
        // or explicitly reports status 'OPEN': it is guaranteed OPEN & ACTIVE!
        const isValidOpenData = !det.error && (det.campaign || det.questions || det.stakeholder);
        if (isValidOpenData || status === 'OPEN' || det.alreadySubmitted) {
          hasConfirmedOpen = true;
          break; // Confirmed open!
        }

        if (status === 'DRAFT' || err.includes('draft') || err.includes('not yet been published')) {
          hasDraft = true;
        } else if (status === 'CLOSED' || (err.includes('closed') && !err.includes('link'))) {
          hasClosed = true;
        } else if (status === 'DELETED') {
          hasDeleted = true;
        }
      }

      // If at least one participant confirms the campaign is OPEN, display it!
      if (hasConfirmedOpen) {
        return true;
      }

      // Only hide if ALL loaded participants confirm it is DRAFT, CLOSED, or DELETED
      if (loadedCount > 0) {
        if (hasDraft || hasClosed || hasDeleted) {
          return false;
        }
      }

      return true;
    });
  }, [parsedCampaignInvites, campaignDetailsMap, dismissedCodes]);

  // ── 4. Stakeholder Auto-Registration Handler ──
  const handleVerifySingle = async reg => {
    setVerifyingMap(prev => ({ ...prev, [reg.userId]: true }));
    try {
      const res = await verifyStakeholder({ userId: reg.userId, orgCode: reg.orgCode });
      markVerified(reg.userId);
      recordLog('VERIFY_SUCCESS', `Verified Stakeholder ${reg.firstName} (${reg.toEmail})`, {
        userId: reg.userId,
        orgCode: reg.orgCode,
        message: res.message,
      });
      setStatusMessage({ type: 'success', text: `Verified ${reg.firstName} successfully!` });
    } catch (err) {
      recordLog('VERIFY_FAILED', `Failed to verify ${reg.toEmail}`, { error: err.message });
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setVerifyingMap(prev => ({ ...prev, [reg.userId]: false }));
    }
  };

  const handleVerifyAllPending = async () => {
    if (pendingRegistrations.length === 0) return;
    setStatusMessage({ type: 'info', text: `Starting auto-registration for ${pendingRegistrations.length} stakeholders...` });

    for (let i = 0; i < pendingRegistrations.length; i++) {
      const reg = pendingRegistrations[i];
      setVerifyingMap(prev => ({ ...prev, [reg.userId]: true }));
      try {
        await verifyStakeholder({ userId: reg.userId, orgCode: reg.orgCode });
        markVerified(reg.userId);
        recordLog('VERIFY_SUCCESS', `Auto-registered ${reg.firstName} (${reg.toEmail})`, {
          userId: reg.userId,
          orgCode: reg.orgCode,
        });
      } catch (err) {
        recordLog('VERIFY_FAILED', `Failed auto-register for ${reg.toEmail}`, { error: err.message });
      } finally {
        setVerifyingMap(prev => ({ ...prev, [reg.userId]: false }));
      }
      // Brief pause to give clean visual feedback
      await new Promise(r => setTimeout(r, 250));
    }

    setStatusMessage({ type: 'success', text: `All ${pendingRegistrations.length} stakeholders successfully registered and active!` });
  };

  // ── 5. Feedback Simulation Generation & Submission ──
  const prepareAnswersForToken = async (token, details) => {
    const { campaign, stakeholder, questions } = details;
    const persona = assignStakeholderPersona(stakeholder);

    const answers = [];
    for (const q of questions) {
      let val;
      if (useAI && geminiApiKey.trim()) {
        val = await generateAIAnswer(geminiApiKey, q, stakeholder, persona, campaign);
      } else {
        val = generateOfflineAnswer(q, stakeholder, persona, campaign);
      }

      answers.push({
        questionId: q.id,
        questionText: q.questionText,
        questionType: q.questionType,
        value: val,
      });
    }

    return { persona, answers };
  };

  const handleSimulateSingle = async (token, details) => {
    if (!details || details.error) return;
    setSimulatingMap(prev => ({ ...prev, [token]: true }));

    try {
      const { persona, answers } = await prepareAnswersForToken(token, details);

      const res = await submitFeedback(token, answers);

      // Update map to mark submitted
      setCampaignDetailsMap(prev => ({
        ...prev,
        [token]: { ...prev[token], alreadySubmitted: true },
      }));

      const stName = `${details.stakeholder?.first_name || details.stakeholder?.firstName || 'Stakeholder'} ${details.stakeholder?.last_name || details.stakeholder?.lastName || ''}`.trim();
      const stFirst = details.stakeholder?.first_name || details.stakeholder?.firstName || 'Stakeholder';
      const stDesig = details.stakeholder?.designation || 'Member';

      recordLog('SUBMIT_SUCCESS', `Submitted feedback for ${stName}`, {
        campaign: details.campaign.title,
        stakeholder: `${stFirst} (${stDesig})`,
        persona: persona.name,
        answersCount: answers.length,
        answers,
      });

      setStatusMessage({
        type: 'success',
        text: `Feedback recorded for ${stFirst} as '${persona.name}'!`,
      });
    } catch (err) {
      recordLog('SUBMIT_FAILED', `Submission failed for token ${token.slice(0, 8)}...`, { error: err.message });
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setSimulatingMap(prev => ({ ...prev, [token]: false }));
    }
  };

  const handleSimulateAllInCampaign = async camp => {
    setBatchSimulating(true);
    const validParticipants = camp.participants.filter(p => {
      const det = campaignDetailsMap[p.token];
      return det && !det.error && !det.alreadySubmitted;
    });

    setBatchProgress({ current: 0, total: validParticipants.length, campaignCode: camp.campaignCode });
    setStatusMessage({ type: 'info', text: `Simulating feedback for ${validParticipants.length} stakeholders in ${camp.title}...` });

    for (let i = 0; i < validParticipants.length; i++) {
      const p = validParticipants[i];
      const details = campaignDetailsMap[p.token];
      setSimulatingMap(prev => ({ ...prev, [p.token]: true }));

      try {
        const { persona, answers } = await prepareAnswersForToken(p.token, details);
        await submitFeedback(p.token, answers);

        setCampaignDetailsMap(prev => ({
          ...prev,
          [p.token]: { ...prev[p.token], alreadySubmitted: true },
        }));

        const simName = details.stakeholder?.first_name || details.stakeholder?.firstName || 'Stakeholder';
        const simDesig = details.stakeholder?.designation || 'Member';
        recordLog('SUBMIT_SUCCESS', `Simulated: ${simName} (${simDesig})`, {
          campaign: details.campaign.title,
          persona: persona.name,
          answers,
        });
      } catch (err) {
        recordLog('SUBMIT_FAILED', `Failed for ${p.toEmail}`, { error: err.message });
      } finally {
        setSimulatingMap(prev => ({ ...prev, [p.token]: false }));
      }

      setBatchProgress(prev => ({ ...prev, current: i + 1 }));
      await new Promise(r => setTimeout(r, 400));
    }

    setBatchSimulating(false);
    setStatusMessage({
      type: 'success',
      text: `Successfully simulated and submitted feedback for all stakeholders in "${camp.title}"!`,
    });
  };

  // Preview before submitting
  const handleOpenPreview = async (token, details) => {
    try {
      const { persona, answers } = await prepareAnswersForToken(token, details);
      setPreviewData({
        token,
        details,
        persona,
        answers,
      });
      setShowPreviewModal(true);
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Failed to prepare preview: ' + err.message });
    }
  };

  const handleSaveSettings = () => {
    localStorage.setItem('potentsim_gemini_key', geminiApiKey.trim());
    localStorage.setItem('potentsim_use_ai', String(useAI));
    setShowSettingsModal(false);
    setStatusMessage({ type: 'success', text: 'PotentSim settings updated successfully.' });
  };

  return (
    <div className="sim-app">
      {/* ── HEADER ── */}
      <header className="sim-header">
        <div className="sim-brand">
          <div className="sim-logo-icon">
            <Bot size={22} />
          </div>
          <div>
            <div className="sim-brand-title">
              PotentSim <span className="sim-badge-tag">Stakeholder Bot Engine</span>
            </div>
            <div className="sim-brand-desc">
              Automated feedback participation & stakeholder registration for live demonstrations
            </div>
          </div>
        </div>

        <div className="sim-header-actions">
          {/* Mode Pill */}
          <div
            className={`sim-pill ${useAI && geminiApiKey ? 'sim-pill--purple' : 'sim-pill--info'}`}
            title="Toggle generator mode in settings"
          >
            {useAI && geminiApiKey ? <Sparkles size={13} /> : <Zap size={13} />}
            <span>{useAI && geminiApiKey ? 'AI Hybrid (Gemini Active)' : 'Smart Offline Mode'}</span>
          </div>

          <button
            type="button"
            className="sim-btn-secondary sim-btn-sm"
            onClick={() => {
              refreshEmails(false);
              syncParticipantTokens(true);
            }}
            title="Poll dev outbox for new invitations & re-sync consultation statuses"
          >
            <RefreshCw size={13} className={loadingEmails ? 'spin' : ''} /> Refresh Outbox
          </button>

          <button
            type="button"
            className="sim-btn-secondary sim-btn-sm"
            onClick={() => setShowSettingsModal(true)}
            title="Configure AI & Generation Settings"
          >
            <Settings size={13} /> Settings
          </button>

          <a
            href="http://localhost:5173"
            target="_blank"
            rel="noopener noreferrer"
            className="sim-btn-secondary sim-btn-sm"
            style={{ color: 'var(--brand-accent)' }}
            title="Open PotentPolicy Platform in a new tab"
          >
            <ExternalLink size={13} /> Open PotentPolicy
          </a>
        </div>
      </header>

      {/* ── TABS ── */}
      <nav className="sim-tabs-bar">
        <button
          type="button"
          className={`sim-tab-btn ${activeTab === 'campaigns' ? 'active' : ''}`}
          onClick={() => setActiveTab('campaigns')}
        >
          <Send size={15} /> Consultation Feedback Bot
          <span className="sim-tab-pill">{activeCampaigns.length} Active</span>
        </button>

        <button
          type="button"
          className={`sim-tab-btn ${activeTab === 'registration' ? 'active' : ''}`}
          onClick={() => setActiveTab('registration')}
        >
          <ShieldCheck size={15} /> Stakeholder Registration
          <span className="sim-tab-pill">
            {pendingRegistrations.length > 0 ? `${pendingRegistrations.length} Pending` : 'All Verified'}
          </span>
        </button>

        <button
          type="button"
          className={`sim-tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => setActiveTab('logs')}
        >
          <FileText size={15} /> Live Submission Inspector
          <span className="sim-tab-pill">{activityLogs.length}</span>
        </button>
      </nav>

      {/* ── STATUS BANNER ── */}
      {statusMessage && (
        <div
          style={{
            background:
              statusMessage.type === 'error'
                ? 'rgba(239, 68, 68, 0.15)'
                : statusMessage.type === 'info'
                ? 'rgba(56, 189, 248, 0.15)'
                : 'rgba(16, 185, 129, 0.15)',
            borderBottom: '1px solid var(--border-color)',
            padding: '0.6rem 1.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.84rem',
            color: '#fff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {statusMessage.type === 'error' ? (
              <AlertCircle size={15} color="#ef4444" />
            ) : statusMessage.type === 'info' ? (
              <Sparkles size={15} color="#38bdf8" />
            ) : (
              <CheckCircle2 size={15} color="#10b981" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      <main className="sim-main">
        {/* ══════════════════════════════════════════════════════════════
            TAB 1: CONSULTATION FEEDBACK BOT
           ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'campaigns' && (
          <div>
            <div className="sim-panel">
              <div className="sim-panel-header">
                <div>
                  <h2 className="sim-panel-title">
                    <Send size={18} style={{ color: 'var(--brand-accent)' }} />
                    Active Consultation Campaigns for Simulation
                  </h2>
                  <p className="sim-panel-desc">
                    Detected from PotentPolicy consultation invitations. Automatically populates realistic, persona-aligned answers without opening individual links.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {dismissedCodes.length > 0 && (
                    <button
                      type="button"
                      className="sim-btn-secondary sim-btn-sm"
                      onClick={() => {
                        setDismissedCodes([]);
                        localStorage.removeItem('potentsim_dismissed_codes');
                        setStatusMessage({ type: 'info', text: 'Restored dismissed campaigns to simulation workspace.' });
                      }}
                      style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', color: 'var(--brand-accent)' }}
                      title="Show campaigns previously dismissed from view"
                    >
                      Restore Dismissed ({dismissedCodes.length})
                    </button>
                  )}
                  <span className="sim-pill sim-pill--info">
                    {useAI && geminiApiKey ? '✨ AI Generative Mode (Unique per persona)' : '⚡ Smart Contextual Synthesis (Offline)'}
                  </span>
                </div>
              </div>

              {/* Batch progress indicator if running */}
              {batchSimulating && (
                <div style={{ background: 'var(--bg-card)', padding: '1rem', borderRadius: '8px', marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 600 }}>
                    <span>Simulating Stakeholder Feedback ({batchProgress.campaignCode})...</span>
                    <span>{batchProgress.current} of {batchProgress.total} Completed</span>
                  </div>
                  <div className="sim-progress-track">
                    <div
                      className="sim-progress-fill"
                      style={{
                        width: `${(batchProgress.current / Math.max(1, batchProgress.total)) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {activeCampaigns.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--text-muted)' }}>
                  {parsedCampaignInvites.length > 0 ? (
                    <>
                      <CheckCircle2 size={36} style={{ margin: '0 auto 0.75rem', color: '#10b981', opacity: 0.9 }} />
                      <div style={{ fontWeight: 700, color: '#fff', marginBottom: '0.35rem', fontSize: '1.05rem' }}>
                        All Active Campaigns Simulated & Completed!
                      </div>
                      <p style={{ fontSize: '0.84rem', maxWidth: '480px', margin: '0 auto 1.25rem', color: 'var(--text-secondary)' }}>
                        All detected consultation campaigns have been fully submitted or closed. You can inspect aggregate feedback, sentiment charts, and word clouds directly in PotentPolicy.
                      </p>
                      <a
                        href="http://localhost:5173"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="sim-btn-primary"
                        style={{ display: 'inline-flex' }}
                      >
                        <ExternalLink size={14} /> View Analytics in PotentPolicy
                      </a>
                    </>
                  ) : (
                    <>
                      <Send size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
                      <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                        No Consultation Invitations Detected Yet
                      </div>
                      <p style={{ fontSize: '0.82rem', maxWidth: '480px', margin: '0 auto' }}>
                        Publish a consultation campaign in <strong>PotentPolicy</strong> and select stakeholders. Invitation emails will appear here automatically for one-click simulation.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className="sim-grid">
                  {activeCampaigns.map(camp => {
                    const readyCount = camp.participants.filter(p => {
                      const det = campaignDetailsMap[p.token];
                      return det && !det.error && !det.alreadySubmitted && det.submission_status !== 'SUBMITTED';
                    }).length;

                    const submittedCount = camp.participants.filter(p => {
                      const det = campaignDetailsMap[p.token];
                      return det && (det.alreadySubmitted || det.submission_status === 'SUBMITTED');
                    }).length;

                    return (
                      <div key={camp.campaignCode} className="sim-campaign-card">
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                            <div>
                              <h3 className="sim-campaign-title">{camp.title}</h3>
                              <span className="sim-pill sim-pill--purple font-mono" style={{ fontSize: '0.72rem' }}>
                                {camp.campaignCode}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => dismissCampaign(camp.campaignCode)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                padding: '0.25rem',
                                borderRadius: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                transition: 'color 0.15s ease',
                              }}
                              onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                              title="Dismiss this campaign from simulation workspace"
                            >
                              <X size={16} />
                            </button>
                          </div>

                          <div className="sim-campaign-meta">
                            <span><Clock size={12} /> Closes: {camp.closingDate || 'Open'}</span>
                            <span>&bull;</span>
                            <span>{camp.participants.length} Invited Stakeholders</span>
                          </div>

                          {/* Participant Cards */}
                          <div style={{ maxHeight: '280px', overflowY: 'auto', marginBottom: '1rem', paddingRight: '0.25rem' }}>
                            {camp.participants.map((p, pIdx) => {
                              const details = campaignDetailsMap[p.token];
                              const isSubmitted = details?.alreadySubmitted || details?.submission_status === 'SUBMITTED';
                              const isSimulating = simulatingMap[p.token];
                              const persona = details?.stakeholder
                                ? assignStakeholderPersona(details.stakeholder, pIdx)
                                : assignStakeholderPersona({ first_name: p.firstName || 'Stakeholder', department: 'General', designation: 'Participant' }, pIdx);

                              const stFullName = details?.stakeholder
                                ? `${details.stakeholder.first_name || details.stakeholder.firstName || ''} ${details.stakeholder.last_name || details.stakeholder.lastName || ''}`.trim()
                                : '';
                              const displayName = stFullName || p.firstName || p.toEmail;
                              const departmentAndRole = details?.stakeholder
                                ? `${details.stakeholder.designation || 'Member'} • ${details.stakeholder.department || 'General'}`
                                : (p.firstName ? p.toEmail : 'Verified Stakeholder');

                              return (
                                <div key={p.token} className="sim-participant-item">
                                  <div style={{ flex: 1, minWidth: 0, paddingRight: '0.5rem' }}>
                                    <div style={{ fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {displayName}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                      {departmentAndRole}
                                    </div>
                                    {persona && (
                                      <div style={{ marginTop: '0.25rem' }}>
                                        <span
                                          style={{
                                            fontSize: '0.68rem',
                                            padding: '0.1rem 0.4rem',
                                            borderRadius: '4px',
                                            background: persona.bg,
                                            color: persona.color,
                                            fontWeight: 700,
                                          }}
                                          title={persona.description}
                                        >
                                          Persona: {persona.name}
                                        </span>
                                      </div>
                                    )}
                                  </div>

                                  <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                                    {isSubmitted ? (
                                      <span className="sim-pill sim-pill--success" style={{ fontSize: '0.72rem' }}>
                                        <CheckCircle2 size={11} /> Submitted
                                      </span>
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          className="sim-btn-secondary sim-btn-sm"
                                          disabled={!details || details.error || isSimulating || batchSimulating}
                                          onClick={() => handleOpenPreview(p.token, details)}
                                          title="Preview generated answers before sending"
                                        >
                                          <Eye size={12} />
                                        </button>
                                        <button
                                          type="button"
                                          className="sim-btn-primary sim-btn-sm"
                                          disabled={!details || details.error || isSimulating || batchSimulating}
                                          onClick={() => handleSimulateSingle(p.token, details)}
                                          title="Simulate submission for this stakeholder"
                                        >
                                          {isSimulating ? <RefreshCw size={12} className="spin" /> : <Play size={12} />}
                                          Submit
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Card Footer Actions */}
                        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                            {submittedCount} / {camp.participants.length} Participated
                          </span>

                          <button
                            type="button"
                            className="sim-btn-primary sim-btn-sm"
                            disabled={readyCount === 0 || batchSimulating}
                            onClick={() => handleSimulateAllInCampaign(camp)}
                          >
                            <Sparkles size={13} />
                            {readyCount === 0 ? 'All Completed' : `Simulate All (${readyCount})`}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB 2: STAKEHOLDER AUTO-REGISTRATION
           ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'registration' && (
          <div>
            <div className="sim-panel">
              <div className="sim-panel-header">
                <div>
                  <h2 className="sim-panel-title">
                    <ShieldCheck size={18} style={{ color: 'var(--brand-accent)' }} />
                    Automated Stakeholder Verification & Enrollment
                  </h2>
                  <p className="sim-panel-desc">
                    When administrators add or import stakeholders into PotentPolicy, verification emails are captured. This bot automates verification without needing to click individual email links.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="sim-btn-primary"
                    disabled={pendingRegistrations.length === 0}
                    onClick={handleVerifyAllPending}
                  >
                    <Zap size={14} /> Auto-Register All Pending ({pendingRegistrations.length})
                  </button>
                </div>
              </div>

              {parsedRegistrations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--text-muted)' }}>
                  <Users size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
                  <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                    No Pending Stakeholder Enrollments Detected
                  </div>
                  <p style={{ fontSize: '0.82rem', maxWidth: '480px', margin: '0 auto' }}>
                    Add or import stakeholders from the <strong>Company Admin Central Directory</strong> in PotentPolicy. Captured verification emails will appear here instantly.
                  </p>
                </div>
              ) : (
                <div className="sim-table-wrap">
                  <table className="sim-table">
                    <thead>
                      <tr>
                        <th>Stakeholder Name</th>
                        <th>Email Address</th>
                        <th>User ID</th>
                        <th>Org Code</th>
                        <th>Received At</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRegistrations.map(reg => {
                        const isVerifying = verifyingMap[reg.userId];
                        return (
                          <tr key={reg.userId}>
                            <td style={{ fontWeight: 600 }}>{reg.firstName}</td>
                            <td style={{ color: 'var(--text-secondary)' }}>{reg.toEmail}</td>
                            <td className="font-mono" style={{ fontSize: '0.78rem' }}>{reg.userId}</td>
                            <td className="font-mono" style={{ fontSize: '0.78rem', color: 'var(--brand-accent)' }}>
                              {reg.orgCode}
                            </td>
                            <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                              {new Date(reg.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td>
                              {reg.isVerified ? (
                                <span className="sim-pill sim-pill--success">
                                  <CheckCircle2 size={11} /> Active / Verified
                                </span>
                              ) : (
                                <span className="sim-pill sim-pill--warning">
                                  <Clock size={11} /> Pending Enrollment
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {reg.isVerified ? (
                                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Ready</span>
                              ) : (
                                <button
                                  type="button"
                                  className="sim-btn-primary sim-btn-sm"
                                  disabled={isVerifying}
                                  onClick={() => handleVerifySingle(reg)}
                                >
                                  {isVerifying ? <RefreshCw size={12} className="spin" /> : <Zap size={12} />}
                                  Verify Now
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB 3: LIVE SUBMISSION INSPECTOR
           ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'logs' && (
          <div>
            <div className="sim-panel">
              <div className="sim-panel-header">
                <div>
                  <h2 className="sim-panel-title">
                    <FileText size={18} style={{ color: 'var(--brand-accent)' }} />
                    Live Activity Stream & Response Audit Log
                  </h2>
                  <p className="sim-panel-desc">
                    Audit trail of all simulated stakeholder responses sent to PotentPolicy. Inspect the exact wording and sentiment generated.
                  </p>
                </div>

                <button
                  type="button"
                  className="sim-btn-secondary sim-btn-sm"
                  onClick={() => {
                    setActivityLogs([]);
                    localStorage.removeItem('potentsim_activity_logs');
                  }}
                  title="Clear session history"
                >
                  <RotateCcw size={12} /> Clear Logs
                </button>
              </div>

              {activityLogs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--text-muted)' }}>
                  <FileText size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
                  <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>No Activity Recorded In This Session</div>
                  <p style={{ fontSize: '0.82rem' }}>Submissions and verifications will be logged here in real time.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {activityLogs.map(log => (
                    <div
                      key={log.id}
                      style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        padding: '1rem',
                        fontSize: '0.84rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: '#fff' }}>
                          {log.type.includes('SUCCESS') ? (
                            <CheckCircle2 size={14} color="#10b981" />
                          ) : (
                            <AlertCircle size={14} color="#ef4444" />
                          )}
                          <span>{log.title}</span>
                          {log.details.persona && (
                            <span className="sim-pill sim-pill--purple" style={{ fontSize: '0.68rem' }}>
                              Persona: {log.details.persona}
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{log.timestamp}</span>
                      </div>

                      {log.details.answers && Array.isArray(log.details.answers) && (
                        <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' }}>
                          {log.details.answers.map((ans, aIdx) => (
                            <div key={aIdx} style={{ marginBottom: '0.5rem', fontSize: '0.8rem' }}>
                              <div style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                                Q: {ans.questionText}
                              </div>
                              <div style={{ color: 'var(--text-primary)', marginTop: '0.15rem', fontStyle: ans.questionType === 'TEXT' ? 'italic' : 'normal' }}>
                                A: {Array.isArray(ans.value) ? ans.value.join(', ') : String(ans.value)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ── PREVIEW & EDIT MODAL ── */}
      {showPreviewModal && previewData && (
        <div className="sim-modal-overlay" onClick={() => setShowPreviewModal(false)}>
          <div className="sim-modal-content" onClick={e => e.stopPropagation()}>
            <div className="sim-modal-header">
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
                  Preview Simulated Answers
                </h3>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                  {previewData.details.stakeholder?.first_name || previewData.details.stakeholder?.firstName || 'Stakeholder'} {previewData.details.stakeholder?.last_name || previewData.details.stakeholder?.lastName || ''} &bull; Persona: {previewData.persona.name}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              {previewData.answers.map((ans, idx) => (
                <div key={idx} style={{ background: 'var(--bg-card)', padding: '0.85rem', borderRadius: '8px' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '0.4rem' }}>
                    Q{idx + 1}. {ans.questionText}
                  </label>
                  {ans.questionType === 'TEXT' ? (
                    <textarea
                      className="sim-input"
                      rows={3}
                      value={ans.value}
                      onChange={e => {
                        const updated = [...previewData.answers];
                        updated[idx].value = e.target.value;
                        setPreviewData({ ...previewData, answers: updated });
                      }}
                    />
                  ) : (
                    <div style={{ fontSize: '0.84rem', color: 'var(--brand-accent)', fontWeight: 600 }}>
                      Selected: {Array.isArray(ans.value) ? ans.value.join(', ') : String(ans.value)}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="sim-btn-secondary"
                onClick={() => setShowPreviewModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sim-btn-primary"
                onClick={async () => {
                  setShowPreviewModal(false);
                  setSimulatingMap(prev => ({ ...prev, [previewData.token]: true }));
                  try {
                    await submitFeedback(previewData.token, previewData.answers);
                    setCampaignDetailsMap(prev => ({
                      ...prev,
                      [previewData.token]: { ...prev[previewData.token], alreadySubmitted: true },
                    }));
                    const prevFirst = previewData.details.stakeholder?.first_name || previewData.details.stakeholder?.firstName || 'Stakeholder';
                    const prevLast = previewData.details.stakeholder?.last_name || previewData.details.stakeholder?.lastName || '';
                    recordLog('SUBMIT_SUCCESS', `Submitted: ${prevFirst} ${prevLast}`.trim(), {
                      campaign: previewData.details.campaign.title,
                      persona: previewData.persona.name,
                      answers: previewData.answers,
                    });
                    setStatusMessage({ type: 'success', text: `Feedback submitted for ${prevFirst}!` });
                  } catch (err) {
                    setStatusMessage({ type: 'error', text: err.message });
                  } finally {
                    setSimulatingMap(prev => ({ ...prev, [previewData.token]: false }));
                  }
                }}
              >
                <Send size={14} /> Submit Feedback
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SETTINGS MODAL ── */}
      {showSettingsModal && (
        <div className="sim-modal-overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="sim-modal-content" onClick={e => e.stopPropagation()}>
            <div className="sim-modal-header">
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Settings size={18} style={{ color: 'var(--brand-accent)' }} />
                PotentSim Generator Settings
              </h3>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ fontSize: '0.84rem', fontWeight: 700, color: '#fff', display: 'block', marginBottom: '0.4rem' }}>
                  Generation Engine Mode
                </label>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <label
                    style={{
                      flex: 1,
                      background: useAI ? 'rgba(249, 115, 22, 0.15)' : 'var(--bg-card)',
                      border: `1px solid ${useAI ? 'var(--brand-accent)' : 'var(--border-color)'}`,
                      borderRadius: '8px',
                      padding: '0.75rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontSize: '0.82rem',
                    }}
                  >
                    <input
                      type="radio"
                      name="engine_mode"
                      checked={useAI}
                      onChange={() => setUseAI(true)}
                    />
                    <div>
                      <div style={{ fontWeight: 700, color: '#fff' }}>🤖 AI Hybrid (Gemini API)</div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                        Highly realistic, human-level distinct answers with automatic offline fallback.
                      </div>
                    </div>
                  </label>

                  <label
                    style={{
                      flex: 1,
                      background: !useAI ? 'rgba(249, 115, 22, 0.15)' : 'var(--bg-card)',
                      border: `1px solid ${!useAI ? 'var(--brand-accent)' : 'var(--border-color)'}`,
                      borderRadius: '8px',
                      padding: '0.75rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontSize: '0.82rem',
                    }}
                  >
                    <input
                      type="radio"
                      name="engine_mode"
                      checked={!useAI}
                      onChange={() => setUseAI(false)}
                    />
                    <div>
                      <div style={{ fontWeight: 700, color: '#fff' }}>⚡ Smart Offline Templates</div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                        Instant (0 ms), zero cost, 100% offline, persona-based combinatorial text.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {useAI && (
                <div>
                  <label style={{ fontSize: '0.84rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                    <Key size={14} style={{ color: 'var(--brand-accent)' }} /> Google Gemini API Key
                  </label>
                  <input
                    type="password"
                    className="sim-input font-mono"
                    placeholder="AIzaSy..."
                    value={geminiApiKey}
                    onChange={e => setGeminiApiKey(e.target.value)}
                  />
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                    Stored securely in your local browser storage. If absent, the engine falls back to smart offline templates automatically.
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="sim-btn-secondary"
                onClick={() => setShowSettingsModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sim-btn-primary"
                onClick={handleSaveSettings}
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

