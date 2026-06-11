import React, { useContext, useState } from 'react';
import { SurveyBuilderContext } from '../SurveyBuilderContext';
import { OUTBOUND_FIELD_TYPES, OUTBOUND_TEMPLATE_PRESETS, normalizeOutboundPrecall, newFieldTemplate } from '../../../utils/outboundPrecallConfig';
import ConditionBuilder from '../../../components/ConditionBuilder';
import { Layers } from 'lucide-react';
import { toast } from 'react-toastify';

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
    if (type !== 'number') base.min = undefined;
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
    if (field && field.id === 'phone') {
      toast.warning('The phone number field is system-managed and cannot be removed.');
      return;
    }
    if (!window.confirm("Are you sure you want to remove this field?")) return;
    updateState(prev => ({
      ...prev,
      outboundConfig: { ...prev.outboundConfig, fields: prev.outboundConfig.fields.filter((_, i) => i !== idx) }
    }));
  };

  const addField = () => {
    updateState(prev => ({
      ...prev,
      outboundConfig: { ...prev.outboundConfig, fields: [...prev.outboundConfig.fields, newFieldTemplate()] }
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
        type: f.type,
        options: f.options || [],
      } : null)
      .filter(Boolean);

  return (
    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Outbound Pre-Call Checklist</h2>
        {isAdmin && (
          <button
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
              <button type="button" className="btn-secondary" onClick={() => setTemplatePickerOpen(true)}>
                Reset to older template
              </button>
            </div>
          )}

          {templatePickerOpen && (
            <div className="modal-overlay" onClick={() => setTemplatePickerOpen(false)}>
              <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
                <h3 style={{ marginTop: 0 }}>Choose an older template</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                  Pick a starting layout. You can still edit every field afterward.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {OUTBOUND_TEMPLATE_PRESETS.map((p) => (
                    <button key={p.id} type="button" className="btn-secondary" style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => applyTemplatePreset(p.factory)}>
                      {p.name}
                    </button>
                  ))}
                </div>
                <button type="button" className="btn-primary" style={{ marginTop: '1rem', width: '100%' }} onClick={() => setTemplatePickerOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <h3 className="form-label" style={{ marginTop: 0 }}>Page copy</h3>
          <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
            {META_KEYS.map(({ key, label }) => (
              <div key={key}>
                <label className="form-label" style={{ marginBottom: '0.35rem', display: 'block' }}>{label}</label>
                <textarea
                  className="input-field"
                  rows={key === 'script' ? 4 : 2}
                  value={outboundConfig.meta[key] ?? ''}
                  onChange={(e) => updateMeta(key, e.target.value)}
                  readOnly={!isAdmin}
                />
              </div>
            ))}
          </div>

          <h3 className="form-label">Section order</h3>
          <p style={{ margin: '0 0 1rem', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Drag or use arrows to choose which group of questions appears first on the agent's page.
          </p>
          <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {(outboundConfig.sectionOrder || ['agent', 'call', 'phone']).map((sec, sIdx) => {
              const label = sec === 'agent' ? 'Researcher / respondent' : sec === 'call' ? 'Call logistics' : 'Phone distribution';
              return (
                <div key={sec} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', background: 'var(--input-bg)' }}>
                  <span style={{ fontWeight: 600, flex: 1 }}>{label}</span>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <button type="button" className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }} onClick={() => moveSection(sIdx, -1)} disabled={sIdx === 0}>↑</button>
                      <button type="button" className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }} onClick={() => moveSection(sIdx, 1)} disabled={sIdx === (outboundConfig.sectionOrder || ['agent', 'call', 'phone']).length - 1}>↓</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <h3 className="form-label">Questions (order = agent form order)</h3>
          <div style={{ display: 'grid', gap: '1.25rem' }}>
            {outboundConfig.fields.map((field, fIdx) => (
              <div key={`${field.id}-${fIdx}`} style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: 'var(--input-bg)' }}>
                {isAdmin && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <button type="button" className="btn-secondary" style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }} onClick={() => moveField(fIdx, -1)} disabled={fIdx === 0}>↑</button>
                    <button type="button" className="btn-secondary" style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }} onClick={() => moveField(fIdx, 1)} disabled={fIdx === outboundConfig.fields.length - 1}>↓</button>
                    <button type="button" className="btn-secondary" style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }} onClick={() => removeField(fIdx)}>Remove</button>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Field ID (stable)</label>
                    <input className="input-field" value={field.id} onChange={(e) => updateField(fIdx, { id: e.target.value.replace(/\s+/g, '_') })} readOnly={!isAdmin} />
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Column</label>
                    <select className="input-field" value={field.section} onChange={(e) => updateField(fIdx, { section: e.target.value })} disabled={!isAdmin}>
                      <option value="agent">Researcher / respondent</option>
                      <option value="call">Call logistics</option>
                      <option value="phone">Phone distribution</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Answer type</label>
                    <select className="input-field" value={field.type} onChange={(e) => setFieldType(fIdx, e.target.value)} disabled={!isAdmin}>
                      {OUTBOUND_FIELD_TYPES.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, marginTop: '1.5rem' }}>
                    <input type="checkbox" checked={!!field.required} onChange={(e) => updateField(fIdx, { required: e.target.checked })} disabled={!isAdmin} />
                    Required to continue
                  </label>
                </div>
                <label className="form-label" style={{ marginTop: '0.75rem', display: 'block' }}>Question / label</label>
                <input className="input-field" value={field.label} onChange={(e) => updateField(fIdx, { label: e.target.value })} readOnly={!isAdmin} />
                {field.type === 'text' && (
                  <>
                    <label className="form-label" style={{ marginTop: '0.5rem', display: 'block' }}>Placeholder (optional)</label>
                    <input className="input-field" value={field.placeholder || ''} onChange={(e) => updateField(fIdx, { placeholder: e.target.value })} readOnly={!isAdmin} />
                  </>
                )}
                {field.type === 'number' && (
                  <>
                    <label className="form-label" style={{ marginTop: '0.5rem', display: 'block' }}>Minimum (optional)</label>
                    <input className="input-field" type="number" value={field.min != null ? field.min : ''} onChange={(e) => updateField(fIdx, { min: e.target.value === '' ? undefined : Number(e.target.value) })} readOnly={!isAdmin} />
                  </>
                )}
                {(field.type === 'segment' || field.type === 'select') && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <div className="form-label" style={{ marginBottom: '0.5rem' }}>Options (value + label)</div>
                    {(field.options || []).map((opt, oIdx) => (
                      <div key={oIdx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <input className="input-field" placeholder="value" value={opt.value} onChange={(e) => updateOption(fIdx, oIdx, 'value', e.target.value)} style={{ maxWidth: '140px' }} readOnly={!isAdmin} />
                        <input className="input-field" placeholder="label" value={opt.label} onChange={(e) => updateOption(fIdx, oIdx, 'label', e.target.value)} readOnly={!isAdmin} />
                        {isAdmin && <button type="button" className="btn-secondary" onClick={() => removeOption(fIdx, oIdx)}>×</button>}
                      </div>
                    ))}
                    {isAdmin && <button type="button" className="btn-secondary" style={{ marginTop: '0.25rem' }} onClick={() => addOption(fIdx)}>+ Add option</button>}
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, marginTop: '0.75rem' }}>
                      <input type="checkbox" checked={!!field.allowOther} onChange={(e) => updateField(fIdx, { allowOther: e.target.checked })} disabled={!isAdmin} />
                      Allow Other answer / السماح بإجابة أخرى
                    </label>
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
          {isAdmin && <button type="button" className="btn-secondary" style={{ width: '100%', marginTop: '1rem', borderStyle: 'dashed' }} onClick={addField}>
            + Add pre-call field
          </button>}
        </>
      )}
    </div>
  );
}
