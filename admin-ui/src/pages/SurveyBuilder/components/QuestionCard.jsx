import React, { useContext, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SurveyBuilderContext } from '../SurveyBuilderContext';
import { UIContext } from '../../../context/UIContext';
import ConditionBuilder from '../../../components/ConditionBuilder';
import { GripVertical, Copy, Trash2, ChevronDown, ChevronUp, Layers } from 'lucide-react';

/*
 * QuestionCard receives ALL mutation callbacks as props from SurveyCanvas.
 * It does NOT define any state updaters internally.
 *
 * WHY: QuestionCard instances are reused across renders by React's reconciler.
 * Any function defined inside QuestionCard closes over the props (sIdx, qIdx)
 * at mount time. When the questions array changes (add/delete/reorder), those
 * closed-over indices become stale and point to the wrong question.
 *
 * By defining all mutators in SurveyCanvas — which re-runs its .map() on every
 * render — and passing them as props, the indices are always fresh and correct.
 */
export default function QuestionCard({
  question,
  sIdx,
  qIdx,
  updateQ,
  updateChoice,
  addChoice,
  removeChoice,
  duplicateQ,
  deleteQ,
  selected,
  onToggleSelect,
}) {
  const { surveyState, isAdmin } = useContext(SurveyBuilderContext);
  const { language } = useContext(UIContext);
  const isRtl = language === 'ar';
  const [collapsed, setCollapsed] = useState(false);

  const sortableId = question._uid || question.questionId;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sortableId,
    data: { type: 'question', sIdx, qIdx },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  const allAvailableFieldsForLogic = surveyState.sections.flatMap(sec =>
    sec.questions.map(q => ({
      id: q.questionId,
      label: q.text || q.questionId,
      type: q.type,
      options: (q.choices || []).map(c => ({ value: c.text, label: c.text })),
    }))
  ).filter(f => f.id !== question.questionId); // Prevent self-reference

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: 'var(--surface)',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: isDragging ? 'var(--shadow-lg)' : 'none',
      }}
      id={`q-${sIdx}-${qIdx}`}
    >
      <div style={{ display: 'flex', alignItems: 'center', padding: '0.75rem', borderBottom: collapsed ? 'none' : '1px solid var(--border-color)', background: 'rgba(0,0,0,0.01)' }}>
        <div {...attributes} {...listeners} style={{ cursor: 'grab', padding: '0.25rem', color: 'var(--text-secondary)' }}>
          <GripVertical size={16} />
        </div>
        {onToggleSelect && (
          <div style={{ padding: '0 0.5rem', display: 'flex', alignItems: 'center' }}>
            <input dir="auto" 
              type="checkbox" 
              checked={!!selected} 
              onChange={onToggleSelect} 
              style={{ cursor: 'pointer', transform: 'scale(1.2)' }}
              data-testid={`select-q-${question.questionId}`}
            />
          </div>
        )}

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1rem', marginLeft: '0.5rem' }}>
          <span dir="auto" style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--primary)' }}>Q{qIdx + 1}</span>
          <div style={{ flex: 1, fontWeight: 600, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {question.text || <span dir="auto" style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Untitled Question</span>}
          </div>
          {question.visibility && (
            <span dir="auto" style={{ fontSize: '0.75rem', background: 'var(--danger, #ef4444)', color: 'white', padding: '0.2rem 0.6rem', borderRadius: '4px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              Skip Logic Active
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isAdmin && (
            <>
              <button dir="auto" type="button" className="btn-secondary" style={{ padding: '0.35rem', border: 'none' }} onClick={duplicateQ} title="Duplicate">
                <Copy size={16} />
              </button>
              <button dir="auto" type="button" className="btn-secondary" style={{ padding: '0.35rem', border: 'none', color: '#ef4444' }} onClick={deleteQ} title="Delete">
                <Trash2 size={16} />
              </button>
            </>
          )}
          <button dir="auto" type="button" className="btn-secondary" style={{ padding: '0.35rem', border: 'none' }} onClick={() => setCollapsed(!collapsed)} title="Toggle Collapse">
            {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label dir="auto" className="form-label" style={{ fontSize: '0.8rem' }}>Question ID</label>
              <input dir="auto" className="input-field" value={question.questionId} onChange={e => updateQ({ questionId: e.target.value.replace(/\s+/g, '_') })} readOnly={!isAdmin} />
            </div>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label dir="auto" className="form-label" style={{ fontSize: '0.8rem' }}>Question Type</label>
              <select className="input-field" value={question.type} onChange={e => updateQ({ type: e.target.value, choices: ['text', 'number', 'number_ratio', 'info', 'multi_input'].includes(e.target.value) ? [] : question.choices })} disabled={!isAdmin}>
                <option value="text">Text (Open Answer)</option>
                <option value="single_choice">Single Choice</option>
                <option value="multiple_choice">Multiple Choice</option>
                <option value="ranking">Ranking / Ordering</option>
                <option value="number">Number</option>
                <option value="number_ratio">Number (Ratio/Percentage)</option>
                <option value="info">Info / Notice (No Input)</option>
                <option value="multi_input">Multiple Inputs (Composite)</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '0.5rem' }}>
              <label dir="auto" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.9rem', cursor: isAdmin ? 'pointer' : 'default' }}>
                <input dir="auto" type="checkbox" checked={!!question.required} onChange={e => updateQ({ required: e.target.checked })} disabled={!isAdmin} />
                Required
              </label>
            </div>
          </div>

          <div>
            <label dir="auto" className="form-label">Question Text (Agent reads this)</label>
            <input dir="auto" className="input-field" value={question.text} onChange={e => updateQ({ text: e.target.value })} readOnly={!isAdmin} />
          </div>

          {question.type !== 'info' && (
            <div style={{ display: 'flex', alignItems: 'center', marginTop: '-0.25rem', marginBottom: '0.25rem' }}>
              <label dir="auto" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.9rem', cursor: isAdmin ? 'pointer' : 'default' }}>
                <input dir="auto" 
                  type="checkbox" 
                  checked={!!question.optional} 
                  onChange={() => updateQ({ optional: !question.optional })} 
                  disabled={!isAdmin} 
                />
                {isRtl ? "اختياري (يمكن للوكيل تخطيه)" : "Optional (agent can skip)"}
              </label>
            </div>
          )}

          <div>
            <label dir="auto" className="form-label">Internal Script / Instruction (Optional)</label>
            <textarea dir="auto" className="input-field" rows={2} value={question.script || ''} onChange={e => updateQ({ script: e.target.value })} readOnly={!isAdmin} />
          </div>

          {(question.type === 'single_choice' || question.type === 'multiple_choice' || question.type === 'ranking') && (
            <div style={{ background: 'rgba(0,0,0,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <label dir="auto" className="form-label" style={{ marginBottom: '0.25rem', display: 'block' }}>Choices</label>
              <p dir="auto" style={{ margin: '0 0 0.75rem', fontSize: '12px', color: 'var(--text-secondary)' }}>
                {question.type === 'ranking'
                  ? 'Define items to rank. Leave empty to enable dynamic free-listing (agents type and add items during the call).'
                  : 'Add export codes to each answer (optional)'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {(question.choices || []).map((choice, cIdx) => (
                  <div key={cIdx} style={{ display: 'flex', gap: '0.5rem' }}>
                    <input dir="auto"
                      className="input-field"
                      style={{ flex: 1 }}
                      value={choice.text}
                      onChange={e => updateChoice(cIdx, { text: e.target.value })}
                      placeholder="Option text"
                      readOnly={!isAdmin}
                    />
                    <input dir="auto"
                      className="input-field"
                      style={{ width: '30%', minWidth: '80px', maxWidth: '140px' }}
                      value={choice.value ?? ''}
                      onChange={e => updateChoice(cIdx, { value: e.target.value })}
                      placeholder="Value (optional)"
                      readOnly={!isAdmin}
                      title="Export code — exported instead of label text when set"
                    />
                    {isAdmin && (
                      <button dir="auto" type="button" className="btn-secondary" style={{ padding: '0.5rem', color: '#ef4444' }} onClick={() => removeChoice(cIdx)}>×</button>
                    )}
                  </div>
                ))}
              </div>
              {isAdmin && (
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: '0.75rem', flexWrap: 'wrap', gap: '1rem' }}>
                  <button dir="auto" type="button" className="btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }} onClick={addChoice}>
                    + Add Choice
                  </button>
                  {question.type !== 'ranking' && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <label dir="auto" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
                      <input dir="auto" type="checkbox" checked={!!question.allowOther} onChange={e => updateQ({ allowOther: e.target.checked })} />
                      Allow "Other" option (Text Input)
                    </label>
                    {question.allowOther && (
                      <label dir="auto" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', marginLeft: '1.5rem', color: 'var(--text-secondary)' }}>
                        <input dir="auto" type="checkbox" checked={!!question.allowMultipleOther} onChange={e => updateQ({ allowMultipleOther: e.target.checked })} />
                        Allow multiple Other entries
                      </label>
                    )}
                  </div>
                  )}
                </div>
              )}

              {question.type === 'ranking' && isAdmin && (
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                  <label dir="auto" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
                    <input dir="auto" type="checkbox" checked={!!question.selectBeforeRank} onChange={e => updateQ({ selectBeforeRank: e.target.checked })} />
                    Require agent to select items before ranking (Select & Rank)
                  </label>
                </div>
              )}

              {question.type === 'multiple_choice' && (
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                  <div style={{ flex: 1 }}>
                    <label dir="auto" className="form-label" style={{ fontSize: '0.8rem' }}>Min Selections</label>
                    <input dir="auto"
                      type="number"
                      className="input-field"
                      min="0"
                      max={(question.choices || []).length + (question.allowOther ? 1 : 0)}
                      value={question.minSelections || ''}
                      onChange={e => updateQ({ minSelections: e.target.value ? Number(e.target.value) : undefined })}
                      readOnly={!isAdmin}
                      placeholder="e.g. 1"
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label dir="auto" className="form-label" style={{ fontSize: '0.8rem' }}>Max Selections</label>
                    <input dir="auto"
                      type="number"
                      className="input-field"
                      min="1"
                      max={(question.choices || []).length + (question.allowOther ? 1 : 0)}
                      value={question.maxSelections || ''}
                      onChange={e => updateQ({ maxSelections: e.target.value ? Number(e.target.value) : undefined })}
                      readOnly={!isAdmin}
                      placeholder="e.g. 3"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {question.type === 'number' && (
            <div style={{ background: 'rgba(0,0,0,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <label className="form-label" style={{ marginBottom: '0.5rem', display: 'block' }}>Digit Length Constraints (Optional)</label>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Min Digits</label>
                  <input
                    type="number"
                    className="input-field"
                    min="1"
                    value={question.minLength || ''}
                    onChange={e => updateQ({ minLength: e.target.value ? Number(e.target.value) : undefined })}
                    readOnly={!isAdmin}
                    placeholder="e.g. 10"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Max Digits</label>
                  <input
                    type="number"
                    className="input-field"
                    min="1"
                    value={question.maxLength || ''}
                    onChange={e => updateQ({ maxLength: e.target.value ? Number(e.target.value) : undefined })}
                    readOnly={!isAdmin}
                    placeholder="e.g. 10"
                  />
                </div>
              </div>
            </div>
          )}

          {question.type === 'multi_input' && (
            <div style={{ background: 'rgba(0,0,0,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <label dir="auto" className="form-label" style={{ marginBottom: '0.25rem', display: 'block' }}>Sub-Inputs</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {(question.subInputs || []).map((sub, sIdx) => (
                  <div key={sub.id} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', background: '#fff', padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                    <input dir="auto"
                      className="input-field"
                      style={{ flex: 2, minWidth: '150px' }}
                      value={sub.label || ''}
                      onChange={e => {
                        const newSubs = [...(question.subInputs || [])];
                        newSubs[sIdx] = { ...newSubs[sIdx], label: e.target.value };
                        updateQ({ subInputs: newSubs });
                      }}
                      placeholder="Input Label"
                      readOnly={!isAdmin}
                    />
                    <select
                      className="input-field"
                      style={{ flex: 1, minWidth: '120px' }}
                      value={sub.inputType || 'short_text'}
                      onChange={e => {
                        const newSubs = [...(question.subInputs || [])];
                        newSubs[sIdx] = { ...newSubs[sIdx], inputType: e.target.value };
                        if (e.target.value !== 'dropdown' && e.target.value !== 'choice' && e.target.value !== 'multiple_choice') newSubs[sIdx] = { ...newSubs[sIdx], options: [] };
                        updateQ({ subInputs: newSubs });
                      }}
                      disabled={!isAdmin}
                    >
                      <option value="short_text">Short Text</option>
                      <option value="number">Number</option>
                      <option value="date">Date</option>
                      <option value="dropdown">Dropdown</option>
                      <option value="choice">Choice (Radio)</option>
                      <option value="multiple_choice">Multiple Choice (Checkbox)</option>
                    </select>
                    <label dir="auto" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', fontWeight: 600 }}>
                      <input dir="auto" 
                        type="checkbox" 
                        checked={!!sub.required} 
                        onChange={e => {
                          const newSubs = [...(question.subInputs || [])];
                          newSubs[sIdx] = { ...newSubs[sIdx], required: e.target.checked };
                          updateQ({ subInputs: newSubs });
                        }}
                        disabled={!isAdmin} 
                      />
                      Req.
                    </label>
                    {isAdmin && (
                      <button dir="auto" type="button" className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: 'var(--danger)' }} onClick={() => {
                        const newSubs = [...(question.subInputs || [])];
                        newSubs.splice(sIdx, 1);
                        updateQ({ subInputs: newSubs });
                      }}>Del</button>
                    )}
                    {(sub.inputType === 'dropdown' || sub.inputType === 'choice' || sub.inputType === 'multiple_choice') && (
                      <div style={{ width: '100%', marginTop: '0.25rem' }}>
                        {/* Mini Options Builder */}
                        {isAdmin && (
                          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                            <input dir="auto"
                              className="input-field"
                              style={{ flex: 2, minWidth: '130px' }}
                              placeholder="Label (e.g. Yes, Male)"
                              data-sub-opt-label={`${sIdx}`}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const labelInput = e.target;
                                  const codeInput = document.querySelector(`[data-sub-opt-code="${sIdx}"]`);
                                  const label = labelInput.value.trim();
                                  if (!label) return;
                                  const existingOpts = sub.options || [];
                                  const code = (codeInput?.value || '').trim() || label;
                                  const newOpt = { label, value: code, id: Math.random().toString(36).substring(2, 9) };
                                  const newSubs = [...(question.subInputs || [])];
                                  newSubs[sIdx] = { ...newSubs[sIdx], options: [...existingOpts, newOpt] };
                                  updateQ({ subInputs: newSubs });
                                  labelInput.value = '';
                                  if (codeInput) codeInput.value = '';
                                  labelInput.focus();
                                }
                              }}
                            />
                            <input dir="auto"
                              className="input-field"
                              style={{ flex: 1, minWidth: '90px' }}
                              placeholder="Value / Code"
                              data-sub-opt-code={`${sIdx}`}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const codeInput = e.target;
                                  const labelInput = document.querySelector(`[data-sub-opt-label="${sIdx}"]`);
                                  const label = (labelInput?.value || '').trim();
                                  if (!label) return;
                                  const existingOpts = sub.options || [];
                                  const code = codeInput.value.trim() || label;
                                  const newOpt = { label, value: code, id: Math.random().toString(36).substring(2, 9) };
                                  const newSubs = [...(question.subInputs || [])];
                                  newSubs[sIdx] = { ...newSubs[sIdx], options: [...existingOpts, newOpt] };
                                  updateQ({ subInputs: newSubs });
                                  if (labelInput) labelInput.value = '';
                                  codeInput.value = '';
                                  if (labelInput) labelInput.focus();
                                }
                              }}
                            />
                            <button dir="auto" type="button" className="btn-primary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                              onClick={() => {
                                const labelInput = document.querySelector(`[data-sub-opt-label="${sIdx}"]`);
                                const codeInput = document.querySelector(`[data-sub-opt-code="${sIdx}"]`);
                                if (!labelInput) return;
                                const label = labelInput.value.trim();
                                if (!label) return;
                                const existingOpts = sub.options || [];
                                const code = (codeInput?.value || '').trim() || label;
                                const newOpt = { label, value: code, id: Math.random().toString(36).substring(2, 9) };
                                const newSubs = [...(question.subInputs || [])];
                                newSubs[sIdx] = { ...newSubs[sIdx], options: [...existingOpts, newOpt] };
                                updateQ({ subInputs: newSubs });
                                labelInput.value = '';
                                if (codeInput) codeInput.value = '';
                                labelInput.focus();
                              }}
                            >+ Add</button>
                          </div>
                        )}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                          {(sub.options || []).map((opt, oIdx) => {
                            const norm = typeof opt === 'object' && opt !== null
                              ? { label: opt.label || opt.text || opt.value || '', value: opt.value != null ? String(opt.value) : (opt.label || '') }
                              : { label: String(opt), value: String(opt) };
                            return (
                              <span key={oIdx} style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                                background: 'var(--primary-low, rgba(59,130,246,0.1))', color: 'var(--primary)',
                                borderRadius: '999px', padding: '0.2rem 0.6rem', fontSize: '0.8rem', fontWeight: 600
                              }}>
                                {norm.label === norm.value ? norm.label : `${norm.label} (${norm.value})`}
                                {isAdmin && (
                                  <button type="button" style={{
                                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                                    color: 'var(--danger)', fontWeight: 'bold', fontSize: '0.9rem', lineHeight: 1
                                  }} onClick={() => {
                                    const newSubs = [...(question.subInputs || [])];
                                    const newOpts = [...(newSubs[sIdx].options || [])];
                                    newOpts.splice(oIdx, 1);
                                    newSubs[sIdx] = { ...newSubs[sIdx], options: newOpts };
                                    updateQ({ subInputs: newSubs });
                                  }}>&times;</button>
                                )}
                              </span>
                            );
                          })}
                          {(sub.options || []).length === 0 && (
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No options added yet</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {isAdmin && (
                  <button dir="auto" type="button" className="btn-secondary" style={{ padding: '0.5rem', alignSelf: 'flex-start' }} onClick={() => {
                    const newSubs = [...(question.subInputs || [])];
                    newSubs.push({ id: Math.random().toString(36).substring(2, 9), label: '', inputType: 'short_text', required: false, options: [] });
                    updateQ({ subInputs: newSubs });
                  }}>
                    + Add Sub-Input
                  </button>
                )}
              </div>
            </div>
          )}

          <div style={{ padding: '1rem', border: '1px dashed var(--border-color)', borderRadius: '12px', background: 'rgba(234, 179, 8, 0.05)', marginTop: '1rem' }}>
            <div style={{ fontWeight: 800, fontSize: '0.85rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--warning-dark, #a16207)' }}>
              Cross-Question Validation (Sum Validation)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <label dir="auto" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 600, cursor: isAdmin ? 'pointer' : 'default' }}>
                <input dir="auto" 
                  type="checkbox" 
                  checked={question.crossValidation?.ruleType === 'sum_equals'} 
                  onChange={e => {
                    const enabled = e.target.checked;
                    updateQ({
                      crossValidation: enabled 
                        ? { ruleType: 'sum_equals', targetQuestionIds: [], errorMessage: '' } 
                        : undefined
                    });
                  }}
                  disabled={!isAdmin}
                />
                Enable "Sum of inputs must equal another question's answer"
              </label>

              {question.crossValidation?.ruleType === 'sum_equals' && (
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginLeft: '1.5rem' }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <label dir="auto" className="form-label" style={{ fontSize: '0.8rem' }}>Target Question IDs</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '150px', overflowY: 'auto', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.5rem' }}>
                      {(() => {
                        const allQs = surveyState?.sections?.flatMap(s => (s.questions || []).flatMap(q => q.type === 'group' ? (q.questions || []) : [q])) || [];
                        const currentIdx = allQs.findIndex(q => (q.questionId || String(q._id)) === (question.questionId || String(question._id)));
                        const prevQs = currentIdx !== -1 ? allQs.slice(0, currentIdx) : allQs;
                        
                        // Handle legacy targetQuestionId gracefully by auto-migrating it to targetQuestionIds
                        const legacyId = question.crossValidation.targetQuestionId;
                        const targets = question.crossValidation.targetQuestionIds || (legacyId ? [legacyId] : []);
                        
                        return prevQs.map(prevQ => {
                          const id = prevQ.questionId || String(prevQ._id);
                          return (
                            <label dir="auto" key={id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', cursor: isAdmin ? 'pointer' : 'default' }}>
                              <input dir="auto" 
                                type="checkbox" 
                                checked={targets.includes(id)}
                                onChange={e => {
                                  const checked = e.target.checked;
                                  let newTargets = [...targets];
                                  if (checked) {
                                    newTargets.push(id);
                                  } else {
                                    newTargets = newTargets.filter(t => t !== id);
                                  }
                                  updateQ({ crossValidation: { ...question.crossValidation, targetQuestionIds: newTargets, targetQuestionId: undefined } });
                                }}
                                disabled={!isAdmin}
                              />
                              {id} - {prevQ.text?.substring(0, 30) || prevQ.label || 'Group'}
                            </label>
                          );
                        });
                      })()}
                    </div>
                  </div>
                  <div style={{ flex: 2, minWidth: '300px' }}>
                    <label dir="auto" className="form-label" style={{ fontSize: '0.8rem' }}>Error Message</label>
                    <input dir="auto" 
                      className="input-field" 
                      placeholder="e.g. The sum here must match the total in Q401" 
                      value={question.crossValidation.errorMessage || ''} 
                      onChange={e => updateQ({
                        crossValidation: { ...question.crossValidation, errorMessage: e.target.value }
                      })} 
                      readOnly={!isAdmin} 
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ padding: '1rem', border: '1px dashed var(--border-color)', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.02)', marginTop: '1rem' }}>
            <div style={{ fontWeight: 800, fontSize: '0.85rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}>
              <Layers size={16} /> Advanced Display Logic
            </div>
            <ConditionBuilder
              condition={question.visibility}
              onChange={cond => updateQ({ visibility: cond })}
              availableFields={allAvailableFieldsForLogic}
              readOnly={!isAdmin}
            />
          </div>
        </div>
      )}
    </div>
  );
}
