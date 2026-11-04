import { useState, useMemo, useEffect, useRef } from 'react';
import {
  FileText, ListFilter, Users, CheckCircle2, AlertCircle, ArrowRight,
  ArrowLeft, Search, Filter, Plus, Save, Send, Calendar, CheckSquare, Square, Eye,
  Trash2, X, RefreshCw
} from 'lucide-react';
import CampaignFormBuilder from './CampaignFormBuilder';
import CampaignPreviewModal from './CampaignPreviewModal';

const STEPS = [
  { id: 1, label: '1. Campaign Details', description: 'Context & dates' },
  { id: 2, label: '2. Build Feedback Form', description: 'Dynamic questions' },
  { id: 3, label: '3. Select Stakeholders', description: 'Target cohort' },
  { id: 4, label: '4. Review & Publish', description: 'Final validation' },
];

export default function CampaignWizard({
  initialData = null,
  stakeholders = [],
  onSaveDraft,
  onPublish,
  onCancel,
  saving = false,
  orgName = 'PotentPolicy Institute',
}) {
  const [currentStep, setCurrentStep] = useState(1);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [validationError, setValidationError] = useState('');

  // Local draft progress persistence key
  const DRAFT_KEY = initialData?.id
    ? `potentpolicy_wizard_draft_edit_${initialData.id}`
    : `potentpolicy_wizard_draft_new`;

  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [draftRestoredNotice, setDraftRestoredNotice] = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const isLoadedRef = useRef(false);

  // 1. Details State
  const [title, setTitle] = useState(initialData?.title || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [objectives, setObjectives] = useState(initialData?.objectives || '');
  const [additionalInstructions, setAdditionalInstructions] = useState(initialData?.additional_instructions || initialData?.additionalInstructions || '');
  const [openingDate, setOpeningDate] = useState(
    initialData?.opening_date ? new Date(initialData.opening_date).toISOString().split('T')[0] : ''
  );
  const [closingDate, setClosingDate] = useState(
    initialData?.closing_date ? new Date(initialData.closing_date).toISOString().split('T')[0] : ''
  );

  // 2. Questions State (default 1 open-ended question)
  const [questions, setQuestions] = useState(() => {
    if (initialData?.questions && Array.isArray(initialData.questions) && initialData.questions.length > 0) {
      return initialData.questions.map((q, idx) => ({
        id: q.id || idx + 1,
        questionText: q.question_text || q.questionText || '',
        questionType: (q.question_type || q.questionType || 'TEXT').toUpperCase(),
        isRequired: q.is_required !== false && q.isRequired !== false,
        options: Array.isArray(q.options) ? q.options : (typeof q.options === 'string' ? JSON.parse(q.options || '[]') : []),
        minValue: q.min_value ?? q.minValue ?? 1,
        maxValue: q.max_value ?? q.maxValue ?? 5,
        minLength: q.min_length ?? q.minLength ?? 5,
        maxLength: q.max_length ?? q.maxLength ?? 2000,
      }));
    }
    return [
      {
        id: 1,
        questionText: '',
        questionType: 'TEXT',
        isRequired: true,
        options: [],
        minValue: 1,
        maxValue: 5,
        minLength: 5,
        maxLength: 2000,
      },
    ];
  });

  // 3. Stakeholder Selection State
  const [selectedStakeholderIds, setSelectedStakeholderIds] = useState(() => {
    if (initialData?.participants && Array.isArray(initialData.participants)) {
      return initialData.participants.map(p => p.id || p.stakeholder_id);
    }
    return [];
  });

  const [shSearch, setShSearch] = useState('');
  const [shDeptFilter, setShDeptFilter] = useState('ALL');
  const [shDesigFilter, setShDesigFilter] = useState('ALL');
  const [shCategoryFilter, setShCategoryFilter] = useState('ALL');
  const [shViewMode, setShViewMode] = useState('all'); // 'all' | 'selected_only'

  // Only active stakeholders can be selected for new campaigns
  const activeStakeholders = useMemo(() => {
    return (stakeholders || []).filter(s => s.is_active === true || s.is_active === 'true' || s.status?.toLowerCase() === 'active');
  }, [stakeholders]);

  // Derived filter options from active stakeholders
  const departments = useMemo(() => {
    const set = new Set(activeStakeholders.map(s => s.department).filter(Boolean));
    return Array.from(set).sort();
  }, [activeStakeholders]);

  const designations = useMemo(() => {
    const set = new Set(activeStakeholders.map(s => s.designation).filter(Boolean));
    return Array.from(set).sort();
  }, [activeStakeholders]);

  const categories = useMemo(() => {
    const set = new Set(activeStakeholders.map(s => s.category).filter(Boolean));
    return Array.from(set).sort();
  }, [activeStakeholders]);

  // Filtered stakeholders
  const filteredStakeholders = useMemo(() => {
    return activeStakeholders.filter(s => {
      if (shViewMode === 'selected_only' && !selectedStakeholderIds.includes(s.id)) {
        return false;
      }
      if (shDeptFilter !== 'ALL' && s.department !== shDeptFilter) return false;
      if (shDesigFilter !== 'ALL' && s.designation !== shDesigFilter) return false;
      if (shCategoryFilter !== 'ALL' && s.category !== shCategoryFilter) return false;
      if (shSearch.trim()) {
        const query = shSearch.toLowerCase();
        const fullName = `${s.first_name} ${s.last_name}`.toLowerCase();
        const email = (s.email || '').toLowerCase();
        const empId = (s.employee_id || '').toLowerCase();
        if (!fullName.includes(query) && !email.includes(query) && !empId.includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [activeStakeholders, selectedStakeholderIds, shSearch, shDeptFilter, shDesigFilter, shCategoryFilter, shViewMode]);

  // Stakeholder Selection Handlers
  const toggleStakeholder = id => {
    setSelectedStakeholderIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(x => x !== id);
      }
      return [...prev, id];
    });
  };

  const handleSelectAllFiltered = () => {
    const filteredIds = filteredStakeholders.map(s => s.id);
    setSelectedStakeholderIds(prev => Array.from(new Set([...prev, ...filteredIds])));
  };

  const handleDeselectAllFiltered = () => {
    const filteredSet = new Set(filteredStakeholders.map(s => s.id));
    setSelectedStakeholderIds(prev => prev.filter(id => !filteredSet.has(id)));
  };

  // ── Draft Progress Persistence (Auto-Save & Restore) ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          const hasSavedData = Boolean(
            (parsed.title && parsed.title.trim()) ||
            (parsed.description && parsed.description.trim()) ||
            (parsed.objectives && parsed.objectives.trim()) ||
            (parsed.additionalInstructions && parsed.additionalInstructions.trim()) ||
            parsed.openingDate ||
            parsed.closingDate ||
            (Array.isArray(parsed.selectedStakeholderIds) && parsed.selectedStakeholderIds.length > 0) ||
            (Array.isArray(parsed.questions) && parsed.questions.some(q => q.questionText && q.questionText.trim()))
          );

          if (hasSavedData) {
            if (parsed.title !== undefined) setTitle(parsed.title);
            if (parsed.description !== undefined) setDescription(parsed.description);
            if (parsed.objectives !== undefined) setObjectives(parsed.objectives);
            if (parsed.additionalInstructions !== undefined) setAdditionalInstructions(parsed.additionalInstructions);
            if (parsed.openingDate !== undefined) setOpeningDate(parsed.openingDate);
            if (parsed.closingDate !== undefined) setClosingDate(parsed.closingDate);
            if (Array.isArray(parsed.questions) && parsed.questions.length > 0) setQuestions(parsed.questions);
            if (Array.isArray(parsed.selectedStakeholderIds)) setSelectedStakeholderIds(parsed.selectedStakeholderIds);
            if (parsed.currentStep >= 1 && parsed.currentStep <= 4) setCurrentStep(parsed.currentStep);

            setLastSavedAt(parsed.savedAt || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            setHasDraft(true);
            setDraftRestoredNotice(true);
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load draft from localStorage:', err);
    } finally {
      isLoadedRef.current = true;
    }
  }, [DRAFT_KEY]);

  // Real-time debounced auto-save to localStorage
  useEffect(() => {
    if (!isLoadedRef.current) return;

    const hasAnyContent = Boolean(
      title.trim() ||
      description.trim() ||
      objectives.trim() ||
      additionalInstructions.trim() ||
      openingDate ||
      closingDate ||
      selectedStakeholderIds.length > 0 ||
      (questions.length > 1 || (questions[0] && questions[0].questionText.trim()))
    );

    if (!hasAnyContent) {
      return;
    }

    const timer = setTimeout(() => {
      try {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const snapshot = {
          title,
          description,
          objectives,
          additionalInstructions,
          openingDate,
          closingDate,
          questions,
          selectedStakeholderIds,
          currentStep,
          savedAt: timeStr,
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot));
        setLastSavedAt(timeStr);
        setHasDraft(true);
      } catch (err) {
        console.warn('Autosave to localStorage failed:', err);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [
    DRAFT_KEY,
    title,
    description,
    objectives,
    additionalInstructions,
    openingDate,
    closingDate,
    questions,
    selectedStakeholderIds,
    currentStep
  ]);

  // Discard changes & clear draft handler
  const handleDiscardChanges = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch (e) {}

    setShowDiscardModal(false);
    setShowExitModal(false);
    setHasDraft(false);
    setLastSavedAt(null);
    setDraftRestoredNotice(false);

    if (initialData) {
      // Revert to saved campaign in database
      setTitle(initialData.title || '');
      setDescription(initialData.description || '');
      setObjectives(initialData.objectives || '');
      setAdditionalInstructions(initialData.additional_instructions || initialData.additionalInstructions || '');
      setOpeningDate(
        initialData.opening_date ? new Date(initialData.opening_date).toISOString().split('T')[0] : ''
      );
      setClosingDate(
        initialData.closing_date ? new Date(initialData.closing_date).toISOString().split('T')[0] : ''
      );
      if (initialData.questions && Array.isArray(initialData.questions) && initialData.questions.length > 0) {
        setQuestions(
          initialData.questions.map((q, idx) => ({
            id: q.id || idx + 1,
            questionText: q.question_text || q.questionText || '',
            questionType: (q.question_type || q.questionType || 'TEXT').toUpperCase(),
            isRequired: q.is_required !== false && q.isRequired !== false,
            options: Array.isArray(q.options)
              ? q.options
              : typeof q.options === 'string'
              ? JSON.parse(q.options || '[]')
              : [],
            minValue: q.min_value ?? q.minValue ?? 1,
            maxValue: q.max_value ?? q.maxValue ?? 5,
            minLength: q.min_length ?? q.minLength ?? 5,
            maxLength: q.max_length ?? q.maxLength ?? 2000,
          }))
        );
      } else {
        setQuestions([
          {
            id: 1,
            questionText: '',
            questionType: 'TEXT',
            isRequired: true,
            options: [],
            minValue: 1,
            maxValue: 5,
            minLength: 5,
            maxLength: 2000,
          },
        ]);
      }
      if (initialData.participants && Array.isArray(initialData.participants)) {
        setSelectedStakeholderIds(initialData.participants.map(p => p.id || p.stakeholder_id));
      } else {
        setSelectedStakeholderIds([]);
      }
      setCurrentStep(1);
    } else {
      // New campaign: reset to blank and exit wizard back to dashboard
      setTitle('');
      setDescription('');
      setObjectives('');
      setAdditionalInstructions('');
      setOpeningDate('');
      setClosingDate('');
      setQuestions([
        {
          id: 1,
          questionText: '',
          questionType: 'TEXT',
          isRequired: true,
          options: [],
          minValue: 1,
          maxValue: 5,
          minLength: 5,
          maxLength: 2000,
        },
      ]);
      setSelectedStakeholderIds([]);
      setCurrentStep(1);
      if (onCancel) onCancel();
    }
  };

  const handleCancelClick = () => {
    if (hasDraft) {
      setShowExitModal(true);
    } else {
      onCancel();
    }
  };

  // Step 1 Validation
  const validateStep1 = () => {
    if (!title.trim()) {
      setValidationError('Campaign Title is required.');
      return false;
    }
    if (!description.trim()) {
      setValidationError('Campaign Description is required.');
      return false;
    }
    if (!objectives.trim()) {
      setValidationError('Consultation Objectives are required.');
      return false;
    }
    if (!openingDate) {
      setValidationError('Start / Opening Date is required.');
      return false;
    }
    if (!closingDate) {
      setValidationError('End / Closing Date is required.');
      return false;
    }
    const openD = new Date(openingDate);
    const closeD = new Date(closingDate);
    if (closeD < openD) {
      setValidationError('End / Closing Date must not be earlier than Start / Opening Date.');
      return false;
    }
    setValidationError('');
    return true;
  };

  // Step 2 Validation
  const validateStep2 = () => {
    if (!Array.isArray(questions) || questions.length < 1 || questions.length > 10) {
      setValidationError('A campaign must contain between 1 and 10 consultation questions.');
      return false;
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.questionText || !q.questionText.trim()) {
        setValidationError(`Question ${i + 1} text cannot be empty.`);
        return false;
      }

      const qType = (q.questionType || 'TEXT').toUpperCase();
      if (['RADIO', 'CHECKBOX', 'DROPDOWN'].includes(qType)) {
        const opts = (q.options || []).map(o => (typeof o === 'string' ? o.trim() : '')).filter(Boolean);
        if (opts.length < 2) {
          setValidationError(`Question ${i + 1} (${qType}) must have at least 2 non-empty answer options.`);
          return false;
        }
        const set = new Set(opts.map(o => o.toLowerCase()));
        if (set.size !== opts.length) {
          setValidationError(`Question ${i + 1} contains duplicate answer options.`);
          return false;
        }
      }
    }

    setValidationError('');
    return true;
  };

  // Step 3 Validation
  const validateStep3 = () => {
    setValidationError('');
    return true;
  };

  // Navigation handlers
  const goToNextStep = () => {
    if (currentStep === 1 && !validateStep1()) return;
    if (currentStep === 2 && !validateStep2()) return;
    if (currentStep === 3 && !validateStep3()) return;
    setValidationError('');
    setCurrentStep(s => Math.min(s + 1, 4));
  };

  const goToPrevStep = () => {
    setValidationError('');
    setCurrentStep(s => Math.max(s - 1, 1));
  };

  // Payload generator
  const getPayload = () => ({
    title: title.trim(),
    description: description.trim(),
    objectives: objectives.trim(),
    additionalInstructions: additionalInstructions.trim(),
    openingDate,
    closingDate,
    questions: questions.map((q, idx) => ({
      questionText: q.questionText.trim(),
      questionType: q.questionType || 'TEXT',
      isRequired: q.isRequired !== false,
      options: q.options || [],
      minValue: q.minValue ?? 1,
      maxValue: q.maxValue ?? 5,
      minLength: q.minLength ?? 5,
      maxLength: q.maxLength ?? 2000,
    })),
    stakeholderIds: selectedStakeholderIds,
  });

  const handleSaveDraftClick = () => {
    if (!title.trim()) {
      setValidationError('Campaign Title is required to save as Draft.');
      setCurrentStep(1);
      return;
    }
    setValidationError('');
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch (e) {}
    setHasDraft(false);
    onSaveDraft(getPayload());
  };

  const handlePublishClick = () => {
    if (!validateStep1()) {
      setCurrentStep(1);
      return;
    }
    if (!validateStep2()) {
      setCurrentStep(2);
      return;
    }
    if (selectedStakeholderIds.length === 0) {
      setValidationError('Cannot publish campaign without selecting at least one active stakeholder.');
      setCurrentStep(3);
      return;
    }
    setValidationError('');
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch (e) {}
    setHasDraft(false);
    onPublish(getPayload());
  };

  const campaignDetailsObj = {
    title,
    description,
    objectives,
    additionalInstructions,
    openingDate,
    closingDate,
  };

  return (
    <div className="campaign-wizard animate-fade-in">
      {/* Top Bar */}
      <div className="dash-action-bar" style={{ marginBottom: '1.25rem', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            <h2 className="dash-title" style={{ margin: 0 }}>
              {initialData ? 'Edit Consultation Campaign' : 'Create Consultation Campaign'}
            </h2>
            {lastSavedAt && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  color: 'var(--sentiment-positive, #16a34a)',
                  background: 'rgba(34, 197, 94, 0.08)',
                  border: '1px solid rgba(34, 197, 94, 0.25)',
                  padding: '0.2rem 0.55rem',
                  borderRadius: '12px',
                }}
                title="Your progress is automatically saved locally"
              >
                <CheckCircle2 size={12} /> Progress Saved ({lastSavedAt})
              </span>
            )}
          </div>
          <p className="dash-subtitle" style={{ marginTop: '0.25rem', marginBottom: 0 }}>
            Configure consultation policy questions and assign authorised participants from the Stakeholder Directory.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {(hasDraft || title.trim() || description.trim()) && (
            <button
              type="button"
              className="dash-btn-secondary"
              style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.35)' }}
              onClick={() => setShowDiscardModal(true)}
              title="Discard all unsaved progress and clear draft"
            >
              <Trash2 size={14} /> Discard Changes
            </button>
          )}
          <button
            type="button"
            className="dash-btn-secondary"
            onClick={handleCancelClick}
          >
            Cancel
          </button>
          <button
            type="button"
            className="dash-btn-secondary"
            disabled={saving}
            onClick={handleSaveDraftClick}
          >
            <Save size={14} /> Save as Draft
          </button>
        </div>
      </div>

      {/* Restored Draft Notice Banner */}
      {draftRestoredNotice && (
        <div
          style={{
            background: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid rgba(99, 102, 241, 0.25)',
            color: 'var(--text-primary)',
            padding: '0.65rem 0.95rem',
            borderRadius: '8px',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.6rem',
            fontSize: '0.82rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={16} style={{ color: 'var(--brand-accent)' }} />
            <span>
              <strong>Draft progress restored</strong> from your last session ({lastSavedAt || 'recent'}). Your edits are preserved.
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setShowDiscardModal(true)}
              style={{
                background: 'none',
                border: 'none',
                color: '#ef4444',
                fontSize: '0.78rem',
                cursor: 'pointer',
                fontWeight: 600,
                textDecoration: 'underline',
              }}
            >
              Discard changes
            </button>
            <button
              type="button"
              onClick={() => setDraftRestoredNotice(false)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '0.85rem',
                padding: '0 0.2rem',
              }}
              title="Dismiss notice"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Stepper Progress Indicator */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '0.75rem',
          marginBottom: '1.5rem',
          background: 'var(--bg-card)',
          padding: '0.85rem 1rem',
          borderRadius: '10px',
          border: '1px solid var(--border-color)',
        }}
      >
        {STEPS.map(st => {
          const isDone = currentStep > st.id;
          const isCurrent = currentStep === st.id;
          return (
            <div
              key={st.id}
              onClick={() => {
                if (st.id < currentStep || (st.id === 2 && validateStep1()) || (st.id === 3 && validateStep1() && validateStep2())) {
                  setCurrentStep(st.id);
                  setValidationError('');
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
                cursor: st.id <= currentStep ? 'pointer' : 'default',
                opacity: isCurrent ? 1 : (isDone ? 0.9 : 0.45),
                borderBottom: isCurrent ? '2px solid var(--brand-accent)' : '2px solid transparent',
                paddingBottom: '0.4rem',
                transition: 'all 0.15s ease',
              }}
            >
              <div
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  background: isCurrent ? 'var(--brand-accent)' : (isDone ? 'rgba(99, 102, 241, 0.15)' : 'var(--bg-secondary)'),
                  color: isCurrent ? '#fff' : (isDone ? 'var(--brand-accent)' : 'var(--text-muted)'),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                }}
              >
                {isDone ? <CheckCircle2 size={16} /> : st.id}
              </div>
              <div>
                <div style={{ fontSize: '0.84rem', fontWeight: isCurrent ? 700 : 600, color: isCurrent ? 'var(--brand-accent)' : 'var(--text-primary)' }}>
                  {st.label}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {st.description}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Validation Alert */}
      {validationError && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid var(--sentiment-negative)',
            color: 'var(--sentiment-negative)',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            fontSize: '0.85rem',
          }}
        >
          <AlertCircle size={16} />
          <span>{validationError}</span>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          STEP 1: CAMPAIGN DETAILS
         ══════════════════════════════════════════════════════════════ */}
      {currentStep === 1 && (
        <div className="dash-panel" style={{ maxWidth: '820px', margin: '0 auto' }}>
          <div className="dash-panel__title">Step 1: Campaign Details &amp; Objectives</div>

          <div style={{ marginBottom: '1.15rem' }}>
            <label className="dash-label">Campaign Title *</label>
            <input
              type="text"
              required
              className="dash-input"
              placeholder="e.g. Hybrid Work & Digital Governance Policy 2026"
              value={title}
              onChange={e => {
                setTitle(e.target.value);
                if (validationError) setValidationError('');
              }}
            />
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
              Clear, descriptive title presented to invited stakeholders.
            </span>
          </div>

          <div style={{ marginBottom: '1.15rem' }}>
            <label className="dash-label">Consultation Description *</label>
            <textarea
              required
              className="dash-textarea"
              style={{
                width: '100%',
                maxWidth: '100%',
                height: '120px',
                minHeight: '120px',
                maxHeight: '120px',
                resize: 'none',
                overflowY: 'auto',
                boxSizing: 'border-box',
              }}
              placeholder="Provide background context, rationale, and policy background for invited stakeholders..."
              value={description}
              onChange={e => {
                setDescription(e.target.value);
                if (validationError) setValidationError('');
              }}
            />
          </div>

          <div style={{ marginBottom: '1.15rem' }}>
            <label className="dash-label">Consultation Objectives *</label>
            <textarea
              required
              className="dash-textarea"
              style={{
                width: '100%',
                maxWidth: '100%',
                height: '110px',
                minHeight: '110px',
                maxHeight: '110px',
                resize: 'none',
                overflowY: 'auto',
                boxSizing: 'border-box',
              }}
              placeholder="e.g. Gather cross-departmental sentiment on proposed flexible work tiers and identify operational bottlenecks."
              value={objectives}
              onChange={e => {
                setObjectives(e.target.value);
                if (validationError) setValidationError('');
              }}
            />
          </div>

          <div className="dash-form-grid" style={{ marginBottom: '1.15rem' }}>
            <div>
              <label className="dash-label">Start / Opening Date *</label>
              <input
                type="date"
                required
                className="dash-input"
                value={openingDate}
                onChange={e => {
                  setOpeningDate(e.target.value);
                  if (validationError) setValidationError('');
                }}
              />
            </div>
            <div>
              <label className="dash-label">End / Closing Date *</label>
              <input
                type="date"
                required
                className="dash-input"
                value={closingDate}
                onChange={e => {
                  setClosingDate(e.target.value);
                  if (validationError) setValidationError('');
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label className="dash-label">Additional Instructions for Stakeholders (Optional)</label>
            <textarea
              className="dash-textarea"
              style={{
                width: '100%',
                maxWidth: '100%',
                height: '110px',
                minHeight: '110px',
                maxHeight: '110px',
                resize: 'none',
                overflowY: 'auto',
                boxSizing: 'border-box',
              }}
              placeholder="e.g. All responses are confidential and anonymised. Please complete all questions by 5:00 PM."
              value={additionalInstructions}
              onChange={e => setAdditionalInstructions(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              type="button"
              className="dash-btn-primary"
              onClick={goToNextStep}
            >
              Next: Build Feedback Form <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          STEP 2: BUILD FEEDBACK FORM (DYNAMIC CONSULTATION FORM BUILDER)
         ══════════════════════════════════════════════════════════════ */}
      {currentStep === 2 && (
        <div className="dash-panel" style={{ maxWidth: '860px', margin: '0 auto' }}>
          <CampaignFormBuilder
            questions={questions}
            onChange={qs => {
              setQuestions(qs);
              if (validationError) setValidationError('');
            }}
            campaignDetails={campaignDetailsObj}
            hasExistingSubmissions={Boolean(initialData && Number(initialData.response_count || initialData.responseCount) > 0)}
            orgName={orgName}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
            <button
              type="button"
              className="dash-btn-secondary"
              onClick={goToPrevStep}
            >
              <ArrowLeft size={14} /> Back: Details
            </button>
            <button
              type="button"
              className="dash-btn-primary"
              onClick={goToNextStep}
            >
              Next: Select Stakeholders <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          STEP 3: SELECT STAKEHOLDERS FROM CENTRAL DIRECTORY
         ══════════════════════════════════════════════════════════════ */}
      {currentStep === 3 && (
        <div className="dash-panel" style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <div className="dash-panel__title" style={{ margin: 0 }}>
                Step 3: Select Stakeholders from Central Directory
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Only active directory members are available for consultation campaigns.
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span
                style={{
                  background: 'rgba(99, 102, 241, 0.1)',
                  color: 'var(--brand-accent)',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '100px',
                }}
              >
                {selectedStakeholderIds.length} of {activeStakeholders.length} Selected
              </span>

              <button
                type="button"
                className="dash-btn-secondary dash-btn-sm"
                onClick={() => setShViewMode(m => (m === 'all' ? 'selected_only' : 'all'))}
              >
                {shViewMode === 'selected_only' ? 'View All Active' : `Review Selected (${selectedStakeholderIds.length})`}
              </button>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.5fr repeat(3, 1fr) auto',
              gap: '0.6rem',
              marginBottom: '1rem',
              alignItems: 'center',
            }}
          >
            <div className="dash-search-box">
              <Search size={14} />
              <input
                type="text"
                className="dash-search-input"
                placeholder="Search name, email, employee ID..."
                value={shSearch}
                onChange={e => setShSearch(e.target.value)}
              />
            </div>

            <select
              className="dash-select"
              value={shDeptFilter}
              onChange={e => setShDeptFilter(e.target.value)}
            >
              <option value="ALL">All Departments</option>
              {departments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <select
              className="dash-select"
              value={shDesigFilter}
              onChange={e => setShDesigFilter(e.target.value)}
            >
              <option value="ALL">All Designations</option>
              {designations.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <select
              className="dash-select"
              value={shCategoryFilter}
              onChange={e => setShCategoryFilter(e.target.value)}
            >
              <option value="ALL">All Categories</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <button
                type="button"
                className="dash-btn-secondary dash-btn-sm"
                onClick={handleSelectAllFiltered}
                title="Select all currently filtered stakeholders"
              >
                Select All
              </button>
              <button
                type="button"
                className="dash-btn-secondary dash-btn-sm"
                onClick={handleDeselectAllFiltered}
                title="Deselect all currently filtered stakeholders"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Directory Table */}
          <div className="dash-table-wrap" style={{ maxHeight: '380px', overflowY: 'auto' }}>
            <table className="dash-table">
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={
                        filteredStakeholders.length > 0 &&
                        filteredStakeholders.every(s => selectedStakeholderIds.includes(s.id))
                      }
                      onChange={e => {
                        if (e.target.checked) handleSelectAllFiltered();
                        else handleDeselectAllFiltered();
                      }}
                      style={{ accentColor: 'var(--brand-accent)', cursor: 'pointer' }}
                    />
                  </th>
                  <th>Full Name</th>
                  <th>Official Email</th>
                  <th>Department</th>
                  <th>Designation</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {filteredStakeholders.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                      No active stakeholders match the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredStakeholders.map(s => {
                    const isSelected = selectedStakeholderIds.includes(s.id);
                    return (
                      <tr
                        key={s.id}
                        onClick={() => toggleStakeholder(s.id)}
                        style={{
                          cursor: 'pointer',
                          background: isSelected ? 'rgba(99, 102, 241, 0.05)' : undefined,
                        }}
                      >
                        <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleStakeholder(s.id)}
                            style={{ accentColor: 'var(--brand-accent)', cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {s.first_name} {s.last_name}
                        </td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                          {s.email}
                        </td>
                        <td>
                          <span className="dash-pill">{s.department || 'General'}</span>
                        </td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                          {s.designation || 'Member'}
                        </td>
                        <td>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                            {s.category || 'Employee'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
            <button
              type="button"
              className="dash-btn-secondary"
              onClick={goToPrevStep}
            >
              <ArrowLeft size={14} /> Back: Form Builder
            </button>
            <button
              type="button"
              className="dash-btn-primary"
              onClick={goToNextStep}
            >
              Next: Review &amp; Publish <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          STEP 4: REVIEW AND PUBLISH
         ══════════════════════════════════════════════════════════════ */}
      {currentStep === 4 && (
        <div style={{ maxWidth: '880px', margin: '0 auto' }}>
          <div className="dash-overview-grid" style={{ gridTemplateColumns: '1.15fr 1fr', marginBottom: '1.5rem' }}>
            {/* Left Card: Campaign Summary */}
            <div className="dash-panel">
              <div className="dash-panel__title">Campaign Details</div>

              <div style={{ marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>
                  Title
                </span>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif' }}>
                  {title || 'Untitled Campaign'}
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>
                  Consultation Window
                </span>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Calendar size={14} color="var(--brand-accent)" />
                  <span>{openingDate} &mdash; {closingDate}</span>
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>
                  Description
                </span>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  {description}
                </p>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>
                  Objectives
                </span>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  {objectives}
                </p>
              </div>

              {additionalInstructions && (
                <div>
                  <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>
                    Instructions
                  </span>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
                    {additionalInstructions}
                  </p>
                </div>
              )}
            </div>

            {/* Right Card: Questions & Stakeholders Summary */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Questions Summary */}
              <div className="dash-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div className="dash-panel__title" style={{ margin: 0 }}>
                    Questions ({questions.length})
                  </div>
                  <button
                    type="button"
                    className="dash-btn-secondary dash-btn-sm"
                    onClick={() => setPreviewOpen(true)}
                  >
                    <Eye size={13} /> Preview
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto' }}>
                  {questions.map((q, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '0.55rem 0.75rem',
                        background: 'var(--bg-secondary)',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color)',
                        fontSize: '0.82rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {idx + 1}. {q.questionText || 'Question'}
                      </span>
                      <span className="dash-badge dash-badge--open" style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem' }}>
                        {q.questionType || 'TEXT'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stakeholders Summary */}
              <div className="dash-panel">
                <div className="dash-panel__title">
                  Selected Stakeholders ({selectedStakeholderIds.length})
                </div>

                {selectedStakeholderIds.length === 0 ? (
                  <div style={{ fontSize: '0.82rem', color: 'var(--sentiment-negative)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <AlertCircle size={15} />
                    <span>No stakeholders selected. You can save as Draft, or select stakeholders before publishing.</span>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>
                      {selectedStakeholderIds.length} active stakeholders will be assigned unique, secure invitation links upon publishing.
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', maxHeight: '100px', overflowY: 'auto' }}>
                      {activeStakeholders
                        .filter(s => selectedStakeholderIds.includes(s.id))
                        .slice(0, 15)
                        .map(s => (
                          <span
                            key={s.id}
                            style={{
                              fontSize: '0.74rem',
                              background: 'var(--bg-secondary)',
                              padding: '0.2rem 0.55rem',
                              borderRadius: '4px',
                              border: '1px solid var(--border-color)',
                              color: 'var(--text-primary)',
                            }}
                          >
                            {s.first_name} {s.last_name}
                          </span>
                        ))}
                      {selectedStakeholderIds.length > 15 && (
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                          +{selectedStakeholderIds.length - 15} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--bg-card)',
              padding: '1.25rem',
              borderRadius: '10px',
              border: '1px solid var(--border-color)',
            }}
          >
            <button
              type="button"
              className="dash-btn-secondary"
              onClick={() => setCurrentStep(1)}
            >
              <ArrowLeft size={14} /> Go Back and Edit
            </button>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                type="button"
                className="dash-btn-secondary"
                disabled={saving}
                onClick={handleSaveDraftClick}
              >
                <Save size={14} /> Save as Draft
              </button>
              <button
                type="button"
                className="dash-btn-primary"
                disabled={saving || selectedStakeholderIds.length === 0}
                onClick={handlePublishClick}
              >
                <Send size={14} /> {saving ? 'Publishing...' : 'Publish Campaign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Form Preview Modal */}
      <CampaignPreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        campaignDetails={campaignDetailsObj}
        questions={questions}
        orgName={orgName}
      />

      {/* ── Modal: Discard Changes Confirmation ── */}
      {showDiscardModal && (
        <div className="dash-modal-backdrop" style={{ zIndex: 9999 }}>
          <div className="dash-modal animate-fade-in" style={{ maxWidth: '480px' }}>
            <div className="dash-modal-header" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: '#ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Trash2 size={18} />
                </div>
                <h3 className="dash-modal-title" style={{ margin: 0, fontSize: '1.15rem' }}>
                  {initialData ? 'Discard Unsaved Changes?' : 'Discard Draft Consultation?'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDiscardModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: '1.25rem' }}>
              {initialData
                ? 'Are you sure you want to discard your unsaved modifications? All fields will be reverted back to the original saved campaign details.'
                : 'Are you sure you want to discard this draft? All entered consultation details, questions, and stakeholder selections will be permanently cleared.'}
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
              <button
                type="button"
                className="dash-btn-secondary"
                onClick={() => setShowDiscardModal(false)}
              >
                Keep Editing
              </button>
              <button
                type="button"
                className="dash-btn-primary"
                style={{ background: '#ef4444', borderColor: '#ef4444', color: '#fff' }}
                onClick={handleDiscardChanges}
              >
                <Trash2 size={14} /> Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Exit / Cancel Navigation Guard ── */}
      {showExitModal && (
        <div className="dash-modal-backdrop" style={{ zIndex: 9999 }}>
          <div className="dash-modal animate-fade-in" style={{ maxWidth: '480px' }}>
            <div className="dash-modal-header" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: 'rgba(99, 102, 241, 0.12)',
                  color: 'var(--brand-accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <AlertCircle size={18} />
                </div>
                <h3 className="dash-modal-title" style={{ margin: 0, fontSize: '1.15rem' }}>
                  Unsaved Consultation Progress
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowExitModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: '1.25rem' }}>
              You have in-progress edits for this consultation. Would you like to keep your draft saved so you can resume later, or discard your changes?
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="dash-btn-secondary"
                onClick={() => setShowExitModal(false)}
              >
                Keep Editing
              </button>
              <button
                type="button"
                className="dash-btn-secondary"
                style={{ color: '#ef4444' }}
                onClick={() => {
                  setShowExitModal(false);
                  handleDiscardChanges();
                }}
              >
                Discard &amp; Exit
              </button>
              <button
                type="button"
                className="dash-btn-primary"
                onClick={() => {
                  setShowExitModal(false);
                  onCancel();
                }}
              >
                Save Draft &amp; Exit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
