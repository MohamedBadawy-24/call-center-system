import React, { useContext, useState } from 'react';
import { SurveyBuilderContext } from '../SurveyBuilderContext';
import {
  OUTBOUND_FIELD_TYPES,
  OUTBOUND_TEMPLATE_PRESETS,
  SYSTEM_TAG_OPTIONS,
  normalizeOutboundPrecall,
  newFieldTemplate,
  nextSequentialPrecallId
} from '../../../utils/outboundPrecallConfig';
import ConditionBuilder from '../../../components/ConditionBuilder';
import { Layers, Copy, HelpCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import { UIContext } from '../../../context/UIContext';

const META_KEYS = [
  { key: 'title', label: 'Page title' },
  { key: 'subtitle', label: 'Subtitle' },
  { key: 'scriptLabel', label: 'Label above introduction script' },
  { key: 'script', label: 'Introduction script ({{name}} = agent name)' },
  { key: 'sectionAgent', label: 'Researcher / respondent group heading' },
  { key: 'sectionCall', label: 'Call logistics group heading' },
  { key: 'sectionPhone', label: 'Phone distribution group heading' },
  { key: 'formsCountLabel', label: 'Footer: forms count label' },
  { key: 'newFormLabel', label: 'Footer: new form button' },
  { key: 'completeHint', label: 'Hint when required answers missing (empty = app default)' },
];

export default function PrecallTab() {
  const { isAdmin, surveyState, updateState } = useContext(SurveyBuilderContext);
  const { t } = useContext(UIContext);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);

  const outboundConfig = surveyState.outboundConfig;

  const updateMeta = (key, val) => {
    updateState(prev => ({
      ...prev,
      outboundConfig: { ...prev.outboundConfig, meta: { ...prev.outboundConfig.meta, [key]: val } }
    }));
  };

  const updateField = (idx, patch) => {
    updateState(prev => {
      const fields = [...prev.outboundConfig.fields];
      fields[idx] = { ...fields[idx], ...patch };
      return { ...prev, outboundConfig: { ...prev.outboundConfig, fields } };
    });
  };

  const setFieldType = (idx, type) => {
    const base = { type };
    if (type === 'segment' || type === 'select') {
      base.options = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }];
    } else {
      base.options = undefined;
    }
    if (type !== 'text') base.placeholder = undefined;
    if (type !== 'number') {
      base.min = undefined;
      base.minLength = undefined;
      base.maxLength = undefined;
    }
    if (type === 'year') {
      base.yearRange = { from: 1900, to: new Date().getFullYear() };
    } else {
      base.yearRange = undefined;
    }
    updateField(idx, base);
  };

  const updateOption = (fIdx, oIdx, key, val) => {
    updateState(prev => {
      const fields = [...prev.outboundConfig.fields];
      const opts = [...(fields[fIdx].options || [])];
      opts[oIdx] = { ...opts[oIdx], [key]: val };
      fields[fIdx] = { ...fields[fIdx], options: opts };
      return { ...prev, outboundConfig: { ...prev.outboundConfig, fields } };
    });
  };

  const addOption = (fIdx) => {
    updateState(prev => {
      const fields = [...prev.outboundConfig.fields];
      const opts = [...(fields[fIdx].options || []), { value: `v_${Date.now()}`, label: 'Option' }];
      fields[fIdx] = { ...fields[fIdx], options: opts };
      return { ...prev, outboundConfig: { ...prev.outboundConfig, fields } };
    });
  };

  const removeOption = (fIdx, oIdx) => {
    if (!window.confirm("Are you sure you want to remove this option?")) return;
    updateState(prev => {
      const fields = [...prev.outboundConfig.fields];
      const opts = (fields[fIdx].options || []).filter((_, i) => i !== oIdx);
      fields[fIdx] = { ...fields[fIdx], options: opts };
      return { ...prev, outboundConfig: { ...prev.outboundConfig, fields } };
    });
  };

  const moveField = (idx, direction) => {
    updateState(prev => {
      const list = [...prev.outboundConfig.fields];
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= list.length) return prev;
      const [item] = list.splice(idx, 1);
      list.splice(newIdx, 0, item);
      return { ...prev, outboundConfig: { ...prev.outboundConfig, fields: list } };
    });
  };

  const cloneField = (idx) => {
    updateState(prev => {
      const fields = [...prev.outboundConfig.fields];
      const source = fields[idx];
      if (!source) return prev;
      const cloned = JSON.parse(JSON.stringify(source));
      cloned.id = nextSequentialPrecallId(fields);
      cloned.label = `${cloned.label || 'Question'} (Copy)`;
      fields.splice(idx + 1, 0, cloned);
      return {
        ...prev,
        outboundConfig: { ...prev.outboundConfig, fields }
      };
    });
  };

  const moveSection = (idx, direction) => {
    updateState(prev => {
      const list = [...(prev.outboundConfig.sectionOrder || ['agent', 'call', 'phone'])];
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= list.length) return prev;
      const [item] = list.splice(idx, 1);
      list.splice(newIdx, 0, item);
      return { ...prev, outboundConfig: { ...prev.outboundConfig, sectionOrder: list } };
    });
  };

  const removeField = (idx) => {
    const field = outboundConfig.fields[idx];

    if (!window.confirm("Are you sure you want to remove this field?")) return;
    updateState(prev => ({
      ...prev,
      outboundConfig: { ...prev.outboundConfig, fields: prev.outboundConfig.fields.filter((_, i) => i !== idx) }
    }));
  };

  const addField = () => {
    updateState(prev => ({
      ...prev,
      outboundConfig: { ...prev.outboundConfig, fields: [...prev.outboundConfig.fields, newFieldTemplate(prev.outboundConfig.fields)] }
    }));
  };

  const applyTemplatePreset = (factory) => {
    updateState(prev => ({
      ...prev,
      outboundConfig: normalizeOutboundPrecall(factory())
    }));
    setTemplatePickerOpen(false);
  };

  const otherFieldIds = (idx) =>
    outboundConfig.fields
      .map((f, i) => i !== idx ? {
        id: f.id,
        label: f.label || f.id,
        type: (f.type === 'segment' || f.type === 'select') ? 'single_choice' 
              : f.type === 'year' ? 'number' 
              : f.type,
        options: f.options || [],
      } : null)
      .filter(Boolean);

  return (
    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
        <h2 dir="auto" style={{ margin: 0, fontSize: '1.25rem' }}>Outbound Pre-Call Checklist</h2>
        {isAdmin && (
          <button dir="auto"
            type="button"
            className={surveyState.customizeOutbound ? 'btn-primary' : 'btn-secondary'}
            onClick={() => updateState(prev => ({ 
              ...prev, 
              customizeOutbound: !prev.customizeOutbound,
              outboundConfig: !prev.customizeOutbound ? normalizeOutboundPrecall(prev.outboundConfig) : prev.outboundConfig 
            }))}
          >
            {surveyState.customizeOutbound ? 'Use default checklist (discard custom editor)' : 'Customize checklist'}
          </button>
        )}
      </div>

      {surveyState.customizeOutbound && (
        <>
          {isAdmin && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <button dir="auto" type="button" className="btn-secondary" onClick={() => setTemplatePickerOpen(true)}>
                Reset to older template
              </button>
            </div>
          )}

          {templatePickerOpen && (
            <div className="modal-overlay" onClick={() => setTemplatePickerOpen(false)}>
              <div className="modal-content glass-card w-[95%] sm:w-full max-w-lg md:max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <h3 dir="auto" style={{ marginTop: 0 }}>{t('chooseOlderTemplate') || 'Choose an older template'}</h3>
                <p dir="auto" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                  {t('chooseOlderTemplateDesc') || 'Pick a starting layout. You can still edit every field afterward.'}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {OUTBOUND_TEMPLATE_PRESETS.map((p) => (
                    <button dir="auto" key={p.id} type="button" className="btn-secondary" style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => applyTemplatePreset(p.factory)}>
                      {p.name}
                    </button>
                  ))}
                </div>
                <button dir="auto" type="button" className="btn-primary" style={{ marginTop: '1rem', width: '100%' }} onClick={() => setTemplatePickerOpen(false)}>
                  {t('cancelTemplateSelection') || 'Cancel Template Selection'}
                </button>
              </div>
            </div>
          )}

          <h3 dir="auto" className="form-label" style={{ marginTop: 0 }}>Page copy</h3>
          <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
            {META_KEYS.map(({ key, label }) => (
              <div key={key}>
                <label dir="auto" className="form-label" style={{ marginBottom: '0.35rem', display: 'block' }}>{label}</label>
                <textarea dir="auto"
                  className="input-field"
                  rows={key === 'script' ? 4 : 2}
                  value={outboundConfig.meta[key] ?? ''}
                  onChange={(e) => updateMeta(key, e.target.value)}
                  readOnly={!isAdmin}
                />
              </div>
            ))}
          </div>

          <h3 dir="auto" className="form-label">Section order</h3>
          <p dir="auto" style={{ margin: '0 0 1rem', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Drag or use arrows to choose which group of questions appears first on the agent's page.
          </p>
          <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {(outboundConfig.sectionOrder || ['agent', 'call', 'phone']).map((sec, sIdx) => {
              const label = sec === 'agent' ? 'Researcher / respondent' : sec === 'call' ? 'Call logistics' : 'Phone distribution';
              return (
                <div key={sec} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', background: 'var(--input-bg)' }}>
                  <span dir="auto" style={{ fontWeight: 600, flex: 1 }}>{label}</span>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <button dir="auto" type="button" className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }} onClick={() => moveSection(sIdx, -1)} disabled={sIdx === 0}>↑</button>
                      <button dir="auto" type="button" className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }} onClick={() => moveSection(sIdx, 1)} disabled={sIdx === (outboundConfig.sectionOrder || ['agent', 'call', 'phone']).length - 1}>↓</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <h3 dir="auto" className="form-label">Questions (order = agent form order)</h3>
          <div style={{ display: 'grid', gap: '1.25rem' }}>
            {outboundConfig.fields.map((field, fIdx) => (
              <div key={`${field.id}-${fIdx}`} style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: 'var(--input-bg)' }}>
                {isAdmin && (
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
                    <button dir="auto" type="button" className="btn-secondary" style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }} onClick={() => moveField(fIdx, -1)} disabled={fIdx === 0}>↑</button>
                    <button dir="auto" type="button" className="btn-secondary" style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }} onClick={() => moveField(fIdx, 1)} disabled={fIdx === outboundConfig.fields.length - 1}>↓</button>
                    <button dir="auto" type="button" className="btn-secondary" style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }} onClick={() => cloneField(fIdx)} title={t('cloneField') || 'Clone Field'}>
                      <Copy size={13} /> {t('clone') || 'Clone'}
                    </button>
                    <button dir="auto" type="button" className="btn-secondary" style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }} onClick={() => removeField(fIdx)}>{t('remove') || 'Remove'}</button>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.25rem' }}>
                      <label dir="auto" className="form-label" style={{ fontSize: '0.8rem', margin: 0 }}>Field ID (stable)</label>
                      <span
                        title={t('fieldIdStableTooltip') || "This is the column name for database and SPSS exports. It must remain stable to prevent data splitting."}
                        style={{ cursor: 'help', display: 'inline-flex', alignItems: 'center', color: 'var(--text-secondary)' }}
                      >
                        <HelpCircle size={14} />
                      </span>
                    </div>
                    <input dir="auto" className="input-field" value={field.id} onChange={(e) => updateField(fIdx, { id: e.target.value.replace(/\s+/g, '_') })} readOnly={!isAdmin} />
                  </div>
                  <div>
                    <label dir="auto" className="form-label" style={{ fontSize: '0.8rem' }}>
                      {t('systemTag') || 'System Role / Tag'}
                    </label>
                    <select
                      className="input-field"
                      value={field.systemTag || ''}
                      onChange={(e) => updateField(fIdx, { systemTag: e.target.value })}
                      disabled={!isAdmin}
                    >
                      {SYSTEM_TAG_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label dir="auto" className="form-label" style={{ fontSize: '0.8rem' }}>Column</label>
                    <select className="input-field" value={field.section} onChange={(e) => updateField(fIdx, { section: e.target.value })} disabled={!isAdmin}>
                      <option value="agent">Researcher / respondent</option>
                      <option value="call">Call logistics</option>
                      <option value="phone">Phone distribution</option>
                    </select>
                  </div>
                  <div>
                    <label dir="auto" className="form-label" style={{ fontSize: '0.8rem' }}>Answer type</label>
                    <select className="input-field" value={field.type} onChange={(e) => setFieldType(fIdx, e.target.value)} disabled={!isAdmin}>
                      {OUTBOUND_FIELD_TYPES.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <label dir="auto" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, marginTop: '1.5rem' }}>
                    <input dir="auto" type="checkbox" checked={!!field.required} onChange={(e) => updateField(fIdx, { required: e.target.checked })} disabled={!isAdmin} />
                    Required to continue
                  </label>
                </div>
                <label dir="auto" className="form-label" style={{ marginTop: '0.75rem', display: 'block' }}>Question / label</label>
                <input dir="auto" className="input-field" value={field.label} onChange={(e) => updateField(fIdx, { label: e.target.value })} readOnly={!isAdmin} />
                {field.type === 'text' && (
                  <>
                    <label dir="auto" className="form-label" style={{ marginTop: '0.5rem', display: 'block' }}>Placeholder (optional)</label>
                    <input dir="auto" className="input-field" value={field.placeholder || ''} onChange={(e) => updateField(fIdx, { placeholder: e.target.value })} readOnly={!isAdmin} />
                  </>
                )}
                {field.type === 'number' && (
                  <>
                    <label dir="auto" className="form-label" style={{ marginTop: '0.5rem', display: 'block' }}>{t('digitLengthConstraints') || 'Digit Length Constraints (Optional)'}</label>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <div style={{ flex: 1 }}>
                        <label dir="auto" className="form-label" style={{ fontSize: '0.8rem' }}>{t('minDigits') || 'Min Digits'}</label>
                        <input
                          dir="auto"
                          className="input-field"
                          type="number"
                          min="1"
                          value={field.minLength != null ? field.minLength : ''}
                          onChange={(e) => updateField(fIdx, { minLength: e.target.value === '' ? undefined : Number(e.target.value) })}
                          readOnly={!isAdmin}
                          placeholder="e.g. 10"
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label dir="auto" className="form-label" style={{ fontSize: '0.8rem' }}>{t('maxDigits') || 'Max Digits'}</label>
                        <input
                          dir="auto"
                          className="input-field"
                          type="number"
                          min="1"
                          value={field.maxLength != null ? field.maxLength : ''}
                          onChange={(e) => updateField(fIdx, { maxLength: e.target.value === '' ? undefined : Number(e.target.value) })}
                          readOnly={!isAdmin}
                          placeholder="e.g. 10"
                        />
                      </div>
                    </div>
                  </>
                )}
                {field.type === 'year' && (
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem' }}>
                    <div style={{ flex: 1 }}>
                      <label dir="auto" className="form-label" style={{ display: 'block' }}>From Year</label>
                      <input dir="auto" className="input-field" type="number" value={field.yearRange?.from ?? ''} onChange={(e) => updateField(fIdx, { yearRange: { ...field.yearRange, from: e.target.value === '' ? undefined : parseInt(e.target.value, 10) } })} readOnly={!isAdmin} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label dir="auto" className="form-label" style={{ display: 'block' }}>To Year</label>
                      <input dir="auto" className="input-field" type="number" value={field.yearRange?.to ?? ''} onChange={(e) => updateField(fIdx, { yearRange: { ...field.yearRange, to: e.target.value === '' ? undefined : parseInt(e.target.value, 10) } })} readOnly={!isAdmin} />
                    </div>
                  </div>
                )}
                {(field.type === 'segment' || field.type === 'select') && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <div className="form-label" style={{ marginBottom: '0.5rem' }}>Options (value + label)</div>
                    {(field.options || []).map((opt, oIdx) => (
                      <div key={oIdx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <input dir="auto" className="input-field" placeholder="value" value={opt.value} onChange={(e) => updateOption(fIdx, oIdx, 'value', e.target.value)} style={{ maxWidth: '140px' }} readOnly={!isAdmin} />
                        <input dir="auto" className="input-field" placeholder="label" value={opt.label} onChange={(e) => updateOption(fIdx, oIdx, 'label', e.target.value)} readOnly={!isAdmin} />
                        {isAdmin && <button dir="auto" type="button" className="btn-secondary" onClick={() => removeOption(fIdx, oIdx)}>×</button>}
                      </div>
                    ))}
                    {isAdmin && <button dir="auto" type="button" className="btn-secondary" style={{ marginTop: '0.25rem' }} onClick={() => addOption(fIdx)}>+ Add option</button>}
                    <label dir="auto" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, marginTop: '0.75rem' }}>
                      <input dir="auto" type="checkbox" checked={!!field.allowOther} onChange={(e) => updateField(fIdx, { allowOther: e.target.checked })} disabled={!isAdmin} />
                      Allow Other answer / السماح بإجابة أخرى
                    </label>
                    {field.allowOther && (
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          dir="auto"
                          className="input-field"
                          style={{ maxWidth: '200px' }}
                          placeholder={t('customLabelPlaceholder') || "Custom label (e.g. 'Other')"}
                          value={field.otherLabel || ''}
                          onChange={(e) => updateField(fIdx, { otherLabel: e.target.value })}
                          readOnly={!isAdmin}
                        />
                        <input
                          dir="auto"
                          className="input-field"
                          style={{ maxWidth: '120px' }}
                          placeholder="Value / Code"
                          value={field.otherValue || ''}
                          onChange={(e) => updateField(fIdx, { otherValue: e.target.value })}
                          readOnly={!isAdmin}
                          title="Export code for Other answer"
                        />
                      </div>
                    )}
                  </div>
                )}
                <div style={{ marginTop: '0.75rem', padding: '1rem', border: '1px dashed var(--border-color)', borderRadius: '12px', background: 'rgba(var(--primary-rgb), 0.02)' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.85rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}>
                    <Layers size={16} /> Visibility Logic
                  </div>
                  <ConditionBuilder 
                    condition={field.logic} 
                    onChange={(cond) => updateField(fIdx, { logic: cond })}
                    availableFields={otherFieldIds(fIdx)}
                    readOnly={!isAdmin}
                  />
                </div>
              </div>
            ))}
          </div>
          {isAdmin && <button dir="auto" type="button" className="btn-secondary" style={{ width: '100%', marginTop: '1rem', borderStyle: 'dashed' }} onClick={addField}>
            + Add pre-call field
          </button>}
        </>
      )}
    </div>
  );
}
