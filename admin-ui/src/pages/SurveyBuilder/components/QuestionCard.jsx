import React, { useContext, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SurveyBuilderContext } from '../SurveyBuilderContext';
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
}) {
  const { surveyState, isAdmin } = useContext(SurveyBuilderContext);
  const [collapsed, setCollapsed] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: question.questionId,
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

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1rem', marginLeft: '0.5rem' }}>
          <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--primary)' }}>Q{qIdx + 1}</span>
          <div style={{ flex: 1, fontWeight: 600, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {question.text || <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Untitled Question</span>}
          </div>
          {question.visibility && (
            <span style={{ fontSize: '0.75rem', background: '#fef3c7', color: '#b45309', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 700 }}>
              Has Logic
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isAdmin && (
            <>
              <button type="button" className="btn-secondary" style={{ padding: '0.35rem', border: 'none' }} onClick={duplicateQ} title="Duplicate">
                <Copy size={16} />
              </button>
              <button type="button" className="btn-secondary" style={{ padding: '0.35rem', border: 'none', color: '#ef4444' }} onClick={deleteQ} title="Delete">
                <Trash2 size={16} />
              </button>
            </>
          )}
          <button type="button" className="btn-secondary" style={{ padding: '0.35rem', border: 'none' }} onClick={() => setCollapsed(!collapsed)} title="Toggle Collapse">
            {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>Question ID</label>
              <input className="input-field" value={question.questionId} onChange={e => updateQ({ questionId: e.target.value.replace(/\s+/g, '_') })} readOnly={!isAdmin} />
            </div>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>Question Type</label>
              <select className="input-field" value={question.type} onChange={e => updateQ({ type: e.target.value, choices: e.target.value === 'text' || e.target.value === 'number' ? [] : question.choices })} disabled={!isAdmin}>
                <option value="text">Text (Open Answer)</option>
                <option value="single_choice">Single Choice</option>
                <option value="multiple_choice">Multiple Choice</option>
                <option value="number">Number</option>
                <option value="info">Info / Notice (No Input)</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.9rem', cursor: isAdmin ? 'pointer' : 'default' }}>
                <input type="checkbox" checked={!!question.required} onChange={e => updateQ({ required: e.target.checked })} disabled={!isAdmin} />
                Required
              </label>
            </div>
          </div>

          <div>
            <label className="form-label">Question Text (Agent reads this)</label>
            <input className="input-field" value={question.text} onChange={e => updateQ({ text: e.target.value })} readOnly={!isAdmin} />
          </div>

          <div>
            <label className="form-label">Internal Script / Instruction (Optional)</label>
            <textarea className="input-field" rows={2} value={question.script || ''} onChange={e => updateQ({ script: e.target.value })} readOnly={!isAdmin} />
          </div>

          {(question.type === 'single_choice' || question.type === 'multiple_choice') && (
            <div style={{ background: 'rgba(0,0,0,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <label className="form-label" style={{ marginBottom: '0.25rem', display: 'block' }}>Choices</label>
              <p style={{ margin: '0 0 0.75rem', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Add export codes to each answer (optional)
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {(question.choices || []).map((choice, cIdx) => (
                  <div key={cIdx} style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      className="input-field"
                      style={{ flex: 1 }}
                      value={choice.text}
                      onChange={e => updateChoice(cIdx, { text: e.target.value })}
                      placeholder="Option text"
                      readOnly={!isAdmin}
                    />
                    <input
                      className="input-field"
                      style={{ width: '30%', minWidth: '80px', maxWidth: '140px' }}
                      value={choice.value ?? ''}
                      onChange={e => updateChoice(cIdx, { value: e.target.value })}
                      placeholder="Value (optional)"
                      readOnly={!isAdmin}
                      title="Export code — exported instead of label text when set"
                    />
                    {isAdmin && (
                      <button type="button" className="btn-secondary" style={{ padding: '0.5rem', color: '#ef4444' }} onClick={() => removeChoice(cIdx)}>×</button>
                    )}
                  </div>
                ))}
              </div>
              {isAdmin && (
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: '0.75rem', flexWrap: 'wrap', gap: '1rem' }}>
                  <button type="button" className="btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }} onClick={addChoice}>
                    + Add Choice
                  </button>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!question.allowOther} onChange={e => updateQ({ allowOther: e.target.checked })} />
                      Allow "Other" option (Text Input)
                    </label>
                    {question.allowOther && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', marginLeft: '1.5rem', color: 'var(--text-secondary)' }}>
                        <input type="checkbox" checked={!!question.allowMultipleOther} onChange={e => updateQ({ allowMultipleOther: e.target.checked })} />
                        Allow multiple Other entries
                      </label>
                    )}
                  </div>
                </div>
              )}

              {question.type === 'multiple_choice' && (
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                  <div style={{ flex: 1 }}>
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Min Selections</label>
                    <input
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
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Max Selections</label>
                    <input
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

          <div style={{ padding: '1rem', border: '1px dashed var(--border-color)', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.02)', marginTop: '0.5rem' }}>
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
