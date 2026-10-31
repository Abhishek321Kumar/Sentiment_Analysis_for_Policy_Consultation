import { useState } from 'react';
import {
  Plus, Trash2, Copy, ArrowUp, ArrowDown, Eye, Check, X,
  AlignLeft, CheckSquare, CircleDot, ListFilter, Star, AlertCircle
} from 'lucide-react';
import CampaignPreviewModal from './CampaignPreviewModal';

const QUESTION_TYPES = [
  { id: 'TEXT', label: 'Open-Ended Text', icon: AlignLeft, description: 'Written feedback in text area' },
  { id: 'RADIO', label: 'Radio Buttons (Single Choice)', icon: CircleDot, description: 'Select exactly one option' },
  { id: 'CHECKBOX', label: 'Checkboxes (Multiple Choice)', icon: CheckSquare, description: 'Select multiple options' },
  { id: 'DROPDOWN', label: 'Dropdown (Single Selection)', icon: ListFilter, description: 'Select from dropdown menu' },
  { id: 'RATING', label: 'Rating Scale', icon: Star, description: 'Configurable numerical rating' },
];

const DEFAULT_OPTIONS = {
  RADIO: ['Strongly Agree', 'Agree', 'Neutral', 'Disagree', 'Strongly Disagree'],
  CHECKBOX: ['Option A', 'Option B', 'Option C'],
  DROPDOWN: ['Option 1', 'Option 2', 'Option 3'],
};

export default function CampaignFormBuilder({
  questions = [],
  onChange,
  campaignDetails = {},
  readOnly = false,
  hasExistingSubmissions = false,
  orgName = 'PotentPolicy Institute',
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activeQuestionId, setActiveQuestionId] = useState(null);

  // Helper to trigger parent state update
  const updateQuestions = newQuestions => {
    if (readOnly || hasExistingSubmissions) return;
    onChange(newQuestions);
  };

  // Add new question
  const handleAddQuestion = (type = 'TEXT') => {
    if (questions.length >= 10) return;
    const newQ = {
      id: Date.now() + Math.random(),
      questionText: '',
      questionType: type,
      isRequired: true,
      options: DEFAULT_OPTIONS[type] ? [...DEFAULT_OPTIONS[type]] : [],
      minValue: 1,
      maxValue: 5,
      minLength: 5,
      maxLength: 2000,
    };
    updateQuestions([...questions, newQ]);
    setActiveQuestionId(newQ.id);
  };

  // Remove question
  const handleRemoveQuestion = index => {
    if (questions.length <= 1) return;
    const updated = questions.filter((_, i) => i !== index);
    updateQuestions(updated);
  };

  // Duplicate question
  const handleDuplicateQuestion = index => {
    if (questions.length >= 10) return;
    const target = questions[index];
    const duplicated = {
      ...target,
      id: Date.now() + Math.random(),
      questionText: `${target.questionText || 'Question'} (Copy)`,
      options: Array.isArray(target.options) ? [...target.options] : [],
    };
    const updated = [...questions];
    updated.splice(index + 1, 0, duplicated);
    updateQuestions(updated);
    setActiveQuestionId(duplicated.id);
  };

  // Move Up
  const handleMoveUp = index => {
    if (index === 0) return;
    const updated = [...questions];
    const temp = updated[index - 1];
    updated[index - 1] = updated[index];
    updated[index] = temp;
    updateQuestions(updated);
  };

  // Move Down
  const handleMoveDown = index => {
    if (index === questions.length - 1) return;
    const updated = [...questions];
    const temp = updated[index + 1];
    updated[index + 1] = updated[index];
    updated[index] = temp;
    updateQuestions(updated);
  };

  // Update specific question field
  const handleQuestionFieldChange = (index, field, value) => {
    const updated = [...questions];
    const current = { ...updated[index], [field]: value };

    // If question type changes, initialize default options if required
    if (field === 'questionType') {
      if (['RADIO', 'CHECKBOX', 'DROPDOWN'].includes(value)) {
        if (!current.options || current.options.length < 2) {
          current.options = DEFAULT_OPTIONS[value] ? [...DEFAULT_OPTIONS[value]] : ['Option 1', 'Option 2'];
        }
      }
    }

    updated[index] = current;
    updateQuestions(updated);
  };

  // Option management for RADIO, CHECKBOX, DROPDOWN
  const handleAddOption = qIndex => {
    const updated = [...questions];
    const q = { ...updated[qIndex] };
    const opts = Array.isArray(q.options) ? [...q.options] : [];
    opts.push(`Option ${opts.length + 1}`);
    q.options = opts;
    updated[qIndex] = q;
    updateQuestions(updated);
  };

  const handleUpdateOption = (qIndex, optIndex, val) => {
    const updated = [...questions];
    const q = { ...updated[qIndex] };
    const opts = Array.isArray(q.options) ? [...q.options] : [];
    opts[optIndex] = val;
    q.options = opts;
    updated[qIndex] = q;
    updateQuestions(updated);
  };

  const handleRemoveOption = (qIndex, optIndex) => {
    const updated = [...questions];
    const q = { ...updated[qIndex] };
    const opts = Array.isArray(q.options) ? [...q.options] : [];
    if (opts.length <= 2) return; // Keep at least 2 options
    opts.splice(optIndex, 1);
    q.options = opts;
    updated[qIndex] = q;
    updateQuestions(updated);
  };

  return (
    <div className="campaign-form-builder">
      {/* Top Banner / Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Dynamic Consultation Form Builder
          </h4>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {questions.length} of 10 questions configured &bull; 5 question types supported
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            type="button"
            className="dash-btn-secondary dash-btn-sm"
            onClick={() => setPreviewOpen(true)}
            title="Preview how stakeholders will see this form"
          >
            <Eye size={14} /> Preview Form
          </button>

          {!readOnly && !hasExistingSubmissions && questions.length < 10 && (
            <button
              type="button"
              className="dash-btn-primary dash-btn-sm"
              onClick={() => handleAddQuestion('TEXT')}
            >
              <Plus size={14} /> Add Question
            </button>
          )}
        </div>
      </div>

      {hasExistingSubmissions && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid var(--sentiment-negative)',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            fontSize: '0.82rem',
            color: 'var(--sentiment-negative)',
          }}
        >
          <AlertCircle size={16} />
          <span>
            <strong>Safe Restriction Active:</strong> This campaign already has submitted feedback. Questions and answer options are locked to prevent corrupting historical responses.
          </span>
        </div>
      )}

      {/* Questions Stack */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {questions.map((q, idx) => {
          const qType = (q.questionType || 'TEXT').toUpperCase();
          const options = Array.isArray(q.options) ? q.options : [];
          const isText = qType === 'TEXT';
          const isOptionBased = ['RADIO', 'CHECKBOX', 'DROPDOWN'].includes(qType);
          const isRating = qType === 'RATING';

          return (
            <div
              key={q.id || idx}
              style={{
                border: '1px solid var(--border-color)',
                borderRadius: '9px',
                background: 'var(--bg-card)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                padding: '1.15rem',
                transition: 'all 0.15s ease',
              }}
            >
              {/* Question Header: Number, Controls (Reorder, Duplicate, Delete) */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: 'var(--brand-accent)',
                      color: '#fff',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {idx + 1}
                  </span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Question {idx + 1}
                  </span>
                </div>

                {!readOnly && !hasExistingSubmissions && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    {/* Reorder Buttons */}
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMoveUp(idx)}
                      title="Move Question Up"
                      className="dash-btn-secondary dash-btn-sm"
                      style={{ padding: '0.25rem 0.45rem', opacity: idx === 0 ? 0.35 : 1 }}
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      type="button"
                      disabled={idx === questions.length - 1}
                      onClick={() => handleMoveDown(idx)}
                      title="Move Question Down"
                      className="dash-btn-secondary dash-btn-sm"
                      style={{ padding: '0.25rem 0.45rem', opacity: idx === questions.length - 1 ? 0.35 : 1 }}
                    >
                      <ArrowDown size={13} />
                    </button>

                    {/* Duplicate */}
                    {questions.length < 10 && (
                      <button
                        type="button"
                        onClick={() => handleDuplicateQuestion(idx)}
                        title="Duplicate Question"
                        className="dash-btn-secondary dash-btn-sm"
                        style={{ padding: '0.25rem 0.45rem' }}
                      >
                        <Copy size={13} />
                      </button>
                    )}

                    {/* Delete */}
                    {questions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveQuestion(idx)}
                        title="Delete Question"
                        className="dash-btn-secondary dash-btn-sm"
                        style={{ padding: '0.25rem 0.45rem', color: 'var(--sentiment-negative)' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Question Text and Question Type Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: '0.85rem', marginBottom: '0.85rem' }}>
                <div>
                  <label className="dash-label" style={{ fontSize: '0.78rem', marginBottom: '0.3rem' }}>
                    Question Text *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={readOnly || hasExistingSubmissions}
                    className="dash-input"
                    placeholder="e.g. What suggestions do you have regarding the proposed policy?"
                    value={q.questionText || ''}
                    onChange={e => handleQuestionFieldChange(idx, 'questionText', e.target.value)}
                  />
                </div>

                <div>
                  <label className="dash-label" style={{ fontSize: '0.78rem', marginBottom: '0.3rem' }}>
                    Question Type *
                  </label>
                  <select
                    disabled={readOnly || hasExistingSubmissions}
                    className="dash-select"
                    value={qType}
                    onChange={e => handleQuestionFieldChange(idx, 'questionType', e.target.value)}
                  >
                    {QUESTION_TYPES.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Sub-config by type */}
              {/* 1. Open-Ended Text Settings */}
              {isText && (
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', background: 'var(--bg-secondary)', padding: '0.65rem 0.85rem', borderRadius: '7px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Min Chars:</span>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      disabled={readOnly || hasExistingSubmissions}
                      className="dash-input"
                      style={{ width: '68px', padding: '0.25rem 0.45rem', fontSize: '0.78rem' }}
                      value={q.minLength || 5}
                      onChange={e => handleQuestionFieldChange(idx, 'minLength', parseInt(e.target.value, 10) || 5)}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Max Chars:</span>
                    <input
                      type="number"
                      min="100"
                      max="5000"
                      disabled={readOnly || hasExistingSubmissions}
                      className="dash-input"
                      style={{ width: '80px', padding: '0.25rem 0.45rem', fontSize: '0.78rem' }}
                      value={q.maxLength || 2000}
                      onChange={e => handleQuestionFieldChange(idx, 'maxLength', parseInt(e.target.value, 10) || 2000)}
                    />
                  </div>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    Sent to NLP Sentiment Analysis service on submission
                  </span>
                </div>
              )}

              {/* 2. Options for RADIO, CHECKBOX, DROPDOWN */}
              {isOptionBased && (
                <div style={{ background: 'var(--bg-secondary)', padding: '0.85rem', borderRadius: '7px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Configured Answer Options (Minimum 2):
                    </span>
                    {!readOnly && !hasExistingSubmissions && (
                      <button
                        type="button"
                        onClick={() => handleAddOption(idx)}
                        className="dash-btn-secondary dash-btn-sm"
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
                      >
                        <Plus size={11} /> Add Option
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    {options.map((opt, oIdx) => (
                      <div key={oIdx} style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: '16px' }}>
                          {oIdx + 1}.
                        </span>
                        <input
                          type="text"
                          required
                          disabled={readOnly || hasExistingSubmissions}
                          className="dash-input"
                          style={{ padding: '0.35rem 0.6rem', fontSize: '0.82rem' }}
                          placeholder={`Option ${oIdx + 1}`}
                          value={opt}
                          onChange={e => handleUpdateOption(idx, oIdx, e.target.value)}
                        />
                        {!readOnly && !hasExistingSubmissions && options.length > 2 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveOption(idx, oIdx)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--sentiment-negative)',
                              cursor: 'pointer',
                              padding: '0.2rem',
                            }}
                            title="Remove Option"
                          >
                            <X size={15} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. Rating Scale Settings */}
              {isRating && (
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', background: 'var(--bg-secondary)', padding: '0.65rem 0.85rem', borderRadius: '7px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Min Rating:</span>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      disabled={readOnly || hasExistingSubmissions}
                      className="dash-input"
                      style={{ width: '60px', padding: '0.25rem 0.45rem', fontSize: '0.78rem' }}
                      value={q.minValue ?? 1}
                      onChange={e => handleQuestionFieldChange(idx, 'minValue', parseInt(e.target.value, 10) || 1)}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Max Rating:</span>
                    <input
                      type="number"
                      min="3"
                      max="10"
                      disabled={readOnly || hasExistingSubmissions}
                      className="dash-input"
                      style={{ width: '60px', padding: '0.25rem 0.45rem', fontSize: '0.78rem' }}
                      value={q.maxValue ?? 5}
                      onChange={e => handleQuestionFieldChange(idx, 'maxValue', parseInt(e.target.value, 10) || 5)}
                    />
                  </div>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    Default range is 1 to 5
                  </span>
                </div>
              )}

              {/* Bottom footer: Required toggle */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-color)' }}>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    fontSize: '0.78rem',
                    color: 'var(--text-primary)',
                    cursor: readOnly || hasExistingSubmissions ? 'default' : 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    disabled={readOnly || hasExistingSubmissions}
                    checked={q.isRequired !== false}
                    onChange={e => handleQuestionFieldChange(idx, 'isRequired', e.target.checked)}
                    style={{ accentColor: 'var(--brand-accent)' }}
                  />
                  <span>Mandatory response required</span>
                </label>
              </div>
            </div>
          );
        })}
      </div>

      {/* Form Preview Modal */}
      <CampaignPreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        campaignDetails={campaignDetails}
        questions={questions}
        orgName={orgName}
      />
    </div>
  );
}

