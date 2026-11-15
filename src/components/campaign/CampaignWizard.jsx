import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  FileText, ListFilter, Users, CheckCircle2, AlertCircle, ArrowRight,
  ArrowLeft, Search, Filter, Plus, Save, Send, Calendar, CheckSquare, Square, Eye,
  Trash2, X, RefreshCw, Edit3, Clock, ShieldCheck, Info
} from 'lucide-react';
import CampaignFormBuilder from './CampaignFormBuilder';
import CampaignPreviewModal from './CampaignPreviewModal';
import MarkdownEditor from '../common/MarkdownEditor';
import MarkdownViewer from '../common/MarkdownViewer';

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

  // Derived Review Cohort Summaries & Pre-flight validations
  const selectedStakeholders = useMemo(() => {
    return activeStakeholders.filter(s => selectedStakeholderIds.includes(s.id));
  }, [activeStakeholders, selectedStakeholderIds]);

  const selectedCategoryCounts = useMemo(() => {
    const counts = {};
    selectedStakeholders.forEach(s => {
      const cat = s.category || 'Employee';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [selectedStakeholders]);

  const selectedDeptCounts = useMemo(() => {
    const counts = {};
    selectedStakeholders.forEach(s => {
      const dept = s.department || 'General';
      counts[dept] = (counts[dept] || 0) + 1;
    });
    return counts;
  }, [selectedStakeholders]);

  const isTitleValid = Boolean(title && title.trim());
  const isDatesValid = Boolean(openingDate && closingDate && new Date(closingDate) >= new Date(openingDate));
  const isQuestionsValid = Array.isArray(questions) && questions.length > 0 && questions.every(q => q.questionText && q.questionText.trim());
  const isStakeholdersValid = selectedStakeholderIds.length > 0;
  const isReadyToPublish = isTitleValid && isDatesValid && isQuestionsValid && isStakeholdersValid;

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
    if (hasDraft || title.trim() || description.trim() || questions.length > 1 || selectedStakeholderIds.length > 0) {
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
    if (!Array.isArray(questions) || questions.length < 1) {
      setValidationError('A campaign must contain at least 1 consultation question.');
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
      minValue: Number(q.minValue) || 1,
      maxValue: Number(q.maxValue) || 5,
      minLength: Number(q.minLength) || 5,
      maxLength: Number(q.maxLength) || 2000,
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
          <div className="dash-panel__title">Step 1: Campaign Details &amp; Timeline</div>

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

          <div style={{ marginBottom: '1.25rem' }}>
            <MarkdownEditor
              required
              label="Consultation Description & Policy Text"
              placeholder="Provide background context, policy clauses, and objectives for invited stakeholders..."
              value={description}
              minHeight="150px"
              maxHeight="320px"
              onChange={val => {
                setDescription(val);
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
            hasExistingSubmissions={Boolean(
              initialData &&
              initialData.status !== 'DRAFT' &&
              Number(initialData.response_count || initialData.responseCount) > 0
            )}
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
          STEP 4: REVIEW AND PUBLISH (CLEAN, INTUITIVE & EXECUTIVE)
         ══════════════════════════════════════════════════════════════ */}
      {currentStep === 4 && (
        <div style={{ maxWidth: '980px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* 1. Header Banner & Key Metrics */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(35, 39, 42, 0.04) 0%, rgba(194, 65, 12, 0.07) 100%)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '1.5rem 1.75rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                  <span className="status-pill status-pill--draft" style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Consultation Summary
                  </span>
                  {isReadyToPublish && (
                    <span style={{ fontSize: '0.74rem', color: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600 }}>
                      <CheckCircle2 size={13} /> Ready to Publish
                    </span>
                  )}
                </div>
                <h2 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif' }}>
                  {title || 'Untitled Consultation Campaign'}
                </h2>
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                  Review your consultation details, question flow, and participant cohort before launching.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="dash-btn-secondary"
                  onClick={() => setPreviewOpen(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem' }}
                >
                  <Eye size={14} /> Interactive Preview
                </button>
              </div>
            </div>

            {/* Quick Metrics Strip */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '0.75rem',
                background: 'var(--bg-card)',
                padding: '1rem',
                borderRadius: '9px',
                border: '1px solid var(--border-color)',
              }}
            >
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                  Consultation Window
                </span>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Calendar size={13} color="var(--brand-accent)" />
                  <span>{openingDate || 'TBD'} &rarr; {closingDate || 'TBD'}</span>
                </div>
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                  Feedback Questions
                </span>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <FileText size={13} color="var(--brand-accent)" />
                  <span>{questions.length} Question{questions.length !== 1 ? 's' : ''}</span>
                </div>
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                  Target Stakeholders
                </span>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: selectedStakeholderIds.length > 0 ? 'var(--text-primary)' : 'var(--sentiment-negative)', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Users size={13} color={selectedStakeholderIds.length > 0 ? 'var(--brand-accent)' : 'var(--sentiment-negative)'} />
                  <span>{selectedStakeholderIds.length} Stakeholder{selectedStakeholderIds.length !== 1 ? 's' : ''}</span>
                </div>
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                  Access Security
                </span>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <ShieldCheck size={13} color="#16a34a" />
                  <span>Unique Tokens &bull; 1-Vote Cap</span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Review Section 1: Campaign Details & Context */}
          <div className="dash-panel" style={{ padding: '1.5rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.15rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  1. Policy Context &amp; Consultation Window
                </h4>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Background rationale, policy provisions, and consultation details</span>
              </div>
              <button
                type="button"
                className="dash-btn-secondary dash-btn-sm"
                onClick={() => setCurrentStep(1)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem' }}
              >
                <Edit3 size={12} /> Edit Details
              </button>
            </div>

            {/* Clean, Full-width Structured Overview Layout */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Full-width Consultation Description / Policy Document */}
              <div style={{ background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-color)', padding: '1.2rem 1.35rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.75rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                  <FileText size={15} style={{ color: 'var(--brand-accent)' }} />
                  <span style={{ fontSize: '0.76rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-primary)' }}>
                    Consultation Description &amp; Policy Text
                  </span>
                </div>
                <div style={{ maxHeight: '420px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                  <MarkdownViewer content={description} />
                </div>
              </div>

              {/* Objectives block (if provided) */}
              {objectives && objectives.trim() && (
                <div style={{ background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-color)', padding: '1rem 1.25rem' }}>
                  <span style={{ fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--brand-accent)', display: 'block', marginBottom: '0.35rem' }}>
                    Consultation Objectives
                  </span>
                  <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.55, margin: 0, whiteSpace: 'pre-wrap' }}>
                    {objectives}
                  </p>
                </div>
              )}

              {/* Stakeholder Instructions (Full-width distinct callout banner) */}
              {additionalInstructions && additionalInstructions.trim() && (
                <div style={{ background: 'rgba(234, 88, 12, 0.05)', borderLeft: '4px solid var(--brand-accent)', borderRadius: '0 8px 8px 0', padding: '0.9rem 1.2rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
                    <Info size={15} style={{ color: 'var(--brand-accent)' }} />
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--brand-accent)' }}>
                      Stakeholder Guidance &amp; Instructions
                    </span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                    {additionalInstructions}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 3. Review Section 2: Feedback Form Questions */}
          <div className="dash-panel" style={{ padding: '1.35rem 1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  2. Consultation Questions ({questions.length})
                </h4>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Configured dynamic questions presented to respondents</span>
              </div>
              <div style={{ display: 'flex', gap: '0.45rem' }}>
                <button
                  type="button"
                  className="dash-btn-secondary dash-btn-sm"
                  onClick={() => setPreviewOpen(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem' }}
                >
                  <Eye size={12} /> Preview Form
                </button>
                <button
                  type="button"
                  className="dash-btn-secondary dash-btn-sm"
                  onClick={() => setCurrentStep(2)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem' }}
                >
                  <Edit3 size={12} /> Edit Questions
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {questions.map((q, idx) => {
                const qType = (q.questionType || 'TEXT').toUpperCase();
                const isReq = q.isRequired !== false;
                const opts = Array.isArray(q.options) ? q.options : [];

                const typeLabels = {
                  TEXT: 'Open Text',
                  RADIO: 'Single Choice',
                  CHECKBOX: 'Multiple Choice',
                  DROPDOWN: 'Dropdown Selection',
                  RATING: 'Rating Scale',
                };

                return (
                  <div
                    key={q.id || idx}
                    style={{
                      padding: '1rem 1.25rem',
                      background: 'var(--bg-secondary)',
                      borderRadius: '9px',
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.65rem',
                    }}
                  >
                    {/* Top Row: Q Number, Question Text, Type & Required Status */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', flex: 1, minWidth: 0 }}>
                        <span
                          style={{
                            width: '32px',
                            height: '26px',
                            borderRadius: '6px',
                            background: 'rgba(194, 65, 12, 0.12)',
                            color: 'var(--brand-accent)',
                            fontWeight: 700,
                            fontSize: '0.78rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            marginTop: '1px',
                          }}
                        >
                          Q{idx + 1}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.45 }}>
                            {q.questionText || 'Untitled Question'}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', flexShrink: 0 }}>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            padding: '0.2rem 0.55rem',
                            fontWeight: 600,
                            borderRadius: '6px',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                          }}
                        >
                          {typeLabels[qType] || qType}
                        </span>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            padding: '0.2rem 0.5rem',
                            fontWeight: 600,
                            borderRadius: '6px',
                            background: isReq ? 'rgba(239, 68, 68, 0.1)' : 'rgba(148, 163, 184, 0.12)',
                            color: isReq ? '#ef4444' : 'var(--text-muted)',
                            border: isReq ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid var(--border-color)',
                          }}
                        >
                          {isReq ? 'Required' : 'Optional'}
                        </span>
                      </div>
                    </div>

                    {/* Sub-details preview: Options or parameters */}
                    {['RADIO', 'CHECKBOX', 'DROPDOWN'].includes(qType) && opts.length > 0 && (
                      <div style={{ paddingLeft: '2.65rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.4rem' }}>
                          {opts.map((opt, oIdx) => (
                            <div
                              key={oIdx}
                              style={{
                                fontSize: '0.76rem',
                                padding: '0.35rem 0.65rem',
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '6px',
                                color: 'var(--text-secondary)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                              }}
                            >
                              <span style={{ color: 'var(--brand-accent)', fontWeight: 700, fontSize: '0.72rem' }}>
                                {oIdx + 1}.
                              </span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {opt}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {qType === 'RATING' && (
                      <div style={{ paddingLeft: '2.65rem', display: 'flex', alignItems: 'center', gap: '0.65rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.2rem 0.55rem',
                            background: 'var(--bg-card)',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-secondary)',
                            fontWeight: 600,
                          }}
                        >
                          Scale: {q.minValue || 1} &rarr; {q.maxValue || 5} Stars
                        </span>
                      </div>
                    )}

                    {qType === 'TEXT' && (
                      <div style={{ paddingLeft: '2.65rem', display: 'flex', alignItems: 'center', gap: '0.65rem', fontSize: '0.78rem', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            padding: '0.2rem 0.55rem',
                            background: 'var(--bg-card)',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-secondary)',
                            fontSize: '0.74rem',
                          }}
                        >
                          Min: <strong>{q.minLength || 5}</strong> &bull; Max: <strong>{q.maxLength || 2000}</strong> characters
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. Review Section 3: Target Stakeholders Cohort */}
          <div className="dash-panel" style={{ padding: '1.35rem 1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  3. Target Stakeholder Cohort ({selectedStakeholderIds.length} Selected)
                </h4>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                  Stakeholders from institutional directory who receive secure consultation links
                </span>
              </div>
              <button
                type="button"
                className="dash-btn-secondary dash-btn-sm"
                onClick={() => setCurrentStep(3)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem' }}
              >
                <Edit3 size={12} /> Edit Cohort
              </button>
            </div>

            {selectedStakeholderIds.length === 0 ? (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid var(--sentiment-negative)',
                  padding: '1rem 1.25rem',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  color: 'var(--sentiment-negative)',
                  fontSize: '0.84rem',
                }}
              >
                <AlertCircle size={18} />
                <div>
                  <strong>No Stakeholders Selected:</strong> You can save this campaign as a <strong>Draft</strong> anytime. To publish now, please return to Step 3 and select at least one active stakeholder.
                </div>
              </div>
            ) : (
              <div>
                {/* Cohort Composition Summary */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                  {Object.entries(selectedCategoryCounts).map(([cat, count]) => (
                    <span
                      key={cat}
                      style={{
                        fontSize: '0.75rem',
                        padding: '0.25rem 0.6rem',
                        borderRadius: '6px',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        fontWeight: 600,
                      }}
                    >
                      {cat}: <strong>{count}</strong>
                    </span>
                  ))}
                  {Object.entries(selectedDeptCounts).slice(0, 5).map(([dept, count]) => (
                    <span
                      key={dept}
                      style={{
                        fontSize: '0.75rem',
                        padding: '0.25rem 0.6rem',
                        borderRadius: '6px',
                        background: 'rgba(194, 65, 12, 0.08)',
                        border: '1px solid rgba(194, 65, 12, 0.25)',
                        color: 'var(--brand-accent)',
                        fontWeight: 600,
                      }}
                    >
                      {dept}: {count}
                    </span>
                  ))}
                </div>

                {/* Stakeholder Cards Scroll Area */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.65rem', maxHeight: '240px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                  {selectedStakeholders.map(s => (
                    <div
                      key={s.id}
                      style={{
                        padding: '0.65rem 0.85rem',
                        background: 'var(--bg-secondary)',
                        borderRadius: '7px',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.82rem',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {s.first_name} {s.last_name}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                          {s.designation || 'Member'} &bull; {s.department || 'General'}
                        </div>
                      </div>
                      <span className="dash-badge dash-badge--open" style={{ fontSize: '0.66rem', padding: '0.15rem 0.45rem' }}>
                        {s.category || 'Employee'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 5. Pre-flight Readiness Checklist */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              padding: '1rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.85rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.82rem' }}>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <CheckSquare size={15} color="var(--brand-accent)" /> Pre-flight Verification:
              </span>
              <span style={{ color: isTitleValid ? '#16a34a' : 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                <CheckCircle2 size={13} /> Title &amp; Context
              </span>
              <span style={{ color: isDatesValid ? '#16a34a' : 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                <CheckCircle2 size={13} /> Dates Defined
              </span>
              <span style={{ color: isQuestionsValid ? '#16a34a' : 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                <CheckCircle2 size={13} /> {questions.length} Question(s)
              </span>
              <span style={{ color: isStakeholdersValid ? '#16a34a' : 'var(--sentiment-negative)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                {isStakeholdersValid ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                {selectedStakeholderIds.length} Stakeholder(s)
              </span>
            </div>

            <span style={{ fontSize: '0.78rem', color: isReadyToPublish ? '#16a34a' : 'var(--text-muted)', fontWeight: 600 }}>
              {isReadyToPublish ? 'All systems ready for launch' : 'Can be saved as Draft'}
            </span>
          </div>

          {/* 6. Clean Navigation & Action Footer */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--bg-card)',
              padding: '1.25rem 1.5rem',
              borderRadius: '10px',
              border: '1px solid var(--border-color)',
              flexWrap: 'wrap',
              gap: '0.85rem',
            }}
          >
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="dash-btn-secondary"
                onClick={() => setCurrentStep(3)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <ArrowLeft size={14} /> Back to Stakeholders
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button
                type="button"
                className="dash-btn-secondary"
                disabled={saving}
                onClick={handleSaveDraftClick}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Save size={14} /> Save as Draft
              </button>
              <button
                type="button"
                className="dash-btn-primary"
                disabled={saving || !isReadyToPublish}
                onClick={handlePublishClick}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.65rem 1.4rem' }}
                title={!isReadyToPublish ? 'Select at least one stakeholder and complete required fields to publish' : undefined}
              >
                <Send size={14} /> {saving ? 'Publishing...' : 'Publish Consultation Campaign'}
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
      {showDiscardModal && typeof document !== 'undefined' && createPortal(
        <div className="dash-modal-backdrop" style={{ zIndex: 99999 }}>
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
        </div>,
        document.body
      )}

      {/* ── Modal: Exit / Cancel Navigation Guard ── */}
      {showExitModal && typeof document !== 'undefined' && createPortal(
        <div className="dash-modal-backdrop" style={{ zIndex: 99999 }}>
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
        </div>,
        document.body
      )}
    </div>
  );
}
