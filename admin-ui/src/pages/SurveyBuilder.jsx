import React, { useState, useEffect, useCallback, useRef, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Phone, Upload, Loader2, Layers } from 'lucide-react';

import {
  OUTBOUND_FIELD_TYPES,
  OUTBOUND_TEMPLATE_PRESETS,
  normalizeOutboundPrecall,
  getDefaultOutboundClone,
  hasStoredOutboundCustom,
  newFieldTemplate,
} from '../utils/outboundPrecallConfig';
import { UIContext } from '../context/UIContext';
import { AuthContext } from '../context/AuthContext';
import ConditionBuilder from '../components/ConditionBuilder';

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

export default function SurveyBuilder() {
  const { t } = useContext(UIContext);
  const { user } = useContext(AuthContext);
  const isAdmin = user?.role === 'admin';
  const { id } = useParams();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [goal, setGoal] = useState(0);
  const [customizeOutbound, setCustomizeOutbound] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [outboundConfig, setOutboundConfig] = useState(() => getDefaultOutboundClone());
  const [sections, setSections] = useState([{
    title: 'Main Section',
    questions: []
  }]);
  
  // Numbers tab state
  const [numbers, setNumbers] = useState([]);
  const [numbersStats, setNumbersStats] = useState({ total: 0, pending: 0, called: 0, qualified: 0, disqualified: 0 });
  const [numbersLoading, setNumbersLoading] = useState(false);
  const [pendingCsv, setPendingCsv] = useState(null);
  const fileInputRef = useRef();

  useEffect(() => {
    if (id) {
      api.get(`/survey/${id}`).then(res => {
        setTitle(res.data.title || '');
        setIsActive(res.data.isActive !== false);
        setGoal(res.data.goal || 0);
        const norm = normalizeOutboundPrecall(res.data.outboundPrecall);
        setOutboundConfig(norm);
        setCustomizeOutbound(hasStoredOutboundCustom(res.data.outboundPrecall));
        if (res.data.sections && res.data.sections.length > 0) {
          setSections(res.data.sections);
        }
      }).catch(console.error);
    } else {
      setOutboundConfig(getDefaultOutboundClone());
      setCustomizeOutbound(false);
    }
  }, [id]);

  const loadNumbers = useCallback(async () => {
    if (!id) return;
    setNumbersLoading(true);
    try {
      const res = await api.get(`/admin/survey/${id}/numbers`);
      if (Array.isArray(res.data)) {
        setNumbers(res.data);
      } else {
        setNumbers(res.data.list || []);
        setNumbersStats(res.data.stats || { total: 0, qualified: 0, disqualified: 0 });
      }
    } catch (e) {
      console.error('Numbers load error:', e);
    } finally {
      setNumbersLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) loadNumbers();
  }, [id, loadNumbers]);

  const downloadDisqualified = async () => {
    try {
      const res = await api.get(`/admin/survey/${id}/numbers/disqualified/export`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `disqualified_${id}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      alert("Failed to download disqualified numbers.");
    }
  };

  const clearNumbers = async () => {
    if (!window.confirm("Are you sure you want to clear the entire numbers list for this campaign?")) return;
    try {
      await api.delete(`/admin/survey/${id}/numbers`);
      alert("Numbers list cleared.");
      loadNumbers();
    } catch(e) {
      alert("Failed to clear numbers.");
    }
  };

  const updateMeta = (key, val) => {
    setOutboundConfig((prev) => ({ ...prev, meta: { ...prev.meta, [key]: val } }));
  };

  const updateField = (idx, patch) => {
    setOutboundConfig((prev) => {
      const fields = [...prev.fields];
      fields[idx] = { ...fields[idx], ...patch };
      return { ...prev, fields };
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
    setOutboundConfig((prev) => {
      const fields = [...prev.fields];
      const opts = [...(fields[fIdx].options || [])];
      opts[oIdx] = { ...opts[oIdx], [key]: val };
      fields[fIdx] = { ...fields[fIdx], options: opts };
      return { ...prev, fields };
    });
  };

  const addOption = (fIdx) => {
    setOutboundConfig((prev) => {
      const fields = [...prev.fields];
      const opts = [...(fields[fIdx].options || []), { value: `v_${Date.now()}`, label: 'Option' }];
      fields[fIdx] = { ...fields[fIdx], options: opts };
      return { ...prev, fields };
    });
  };

  const removeOption = (fIdx, oIdx) => {
    setOutboundConfig((prev) => {
      const fields = [...prev.fields];
      const opts = (fields[fIdx].options || []).filter((_, i) => i !== oIdx);
      fields[fIdx] = { ...fields[fIdx], options: opts };
      return { ...prev, fields };
    });
  };

  const moveField = (idx, direction) => {
    const list = [...outboundConfig.fields];
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= list.length) return;
    const [item] = list.splice(idx, 1);
    list.splice(newIdx, 0, item);
    setOutboundConfig({ ...outboundConfig, fields: list });
  };

  const moveSection = (idx, direction) => {
    const list = [...(outboundConfig.sectionOrder || ['agent', 'call', 'phone'])];
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= list.length) return;
    const [item] = list.splice(idx, 1);
    list.splice(newIdx, 0, item);
    setOutboundConfig({ ...outboundConfig, sectionOrder: list });
  };

  const removeField = (idx) => {
    const field = outboundConfig.fields[idx];
    if (field && field.id === 'phone') {
      alert('The phone number field is system-managed and cannot be removed. You can move it to a different section instead.');
      return;
    }
    setOutboundConfig((prev) => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== idx),
    }));
  };

  const addField = () => {
    setOutboundConfig((prev) => ({
      ...prev,
      fields: [...prev.fields, newFieldTemplate()],
    }));
  };

  const applyTemplatePreset = (factory) => {
    setOutboundConfig(normalizeOutboundPrecall(factory()));
    setTemplatePickerOpen(false);
  };

  const saveSurvey = async () => {
    if (id && isActive) {
      alert('You cannot edit an active campaign. Please go back to the dashboard and End the Campaign first.');
      return;
    }

    try {
      const payload = {
        title,
        isActive,
        goal,
        introScript: '',
        sections,
        outboundPrecall: customizeOutbound ? outboundConfig : null,
      };
      
      let finalId = id;
      if (id) {
        await api.put(`/survey/${id}`, payload);
      } else {
        const response = await api.post('/survey', payload);
        finalId = response.data._id;
      }
      
      if (pendingCsv && finalId) {
        const formData = new FormData();
        formData.append('xlsx', pendingCsv);
        await api.post(`/admin/survey/${finalId}/numbers`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }

      alert('Survey saved successfully!');
      navigate('/admin');
    } catch (err) {
      alert(err.response?.data?.error || 'Error saving survey');
    }
  };

  const toggleCampaignStatus = async () => {
    if (!id) {
      setIsActive(!isActive);
      return;
    }
    try {
      await api.put(`/surveys/${id}/toggle`);
      setIsActive(!isActive);
    } catch (err) {
      alert("Failed to toggle campaign status");
    }
  };

  const addSection = () => {
    setSections([...sections, { title: 'New Section', questions: [] }]);
  };

  const addQuestion = (sIdx) => {
    const newSecs = [...sections];
    newSecs[sIdx].questions.push({
      questionId: `q_${Date.now().toString().slice(-6)}`,
      text: '',
      script: '',
      category: 'main',
      type: 'single_choice',
      choices: []
    });
    setSections(newSecs);
  };

  const updateQuestion = (sIdx, qIdx, field, val) => {
    const newSecs = [...sections];
    newSecs[sIdx].questions[qIdx][field] = val;
    setSections(newSecs);
  };

  const addChoice = (sIdx, qIdx) => {
    const newSecs = [...sections];
    newSecs[sIdx].questions[qIdx].choices.push({
      text: '',
      logic: { action: 'continue', skipToQuestionId: '' }
    });
    setSections(newSecs);
  };

  const updateChoice = (sIdx, qIdx, cIdx, field, val) => {
    const newSecs = [...sections];
    if (field === 'text') {
      newSecs[sIdx].questions[qIdx].choices[cIdx].text = val;
    } else {
      if (!newSecs[sIdx].questions[qIdx].choices[cIdx].logic) {
        newSecs[sIdx].questions[qIdx].choices[cIdx].logic = { action: 'continue' };
      }
      newSecs[sIdx].questions[qIdx].choices[cIdx].logic[field] = val;
    }
    setSections(newSecs);
  };

  // Returns all pre-call fields except the current one, with their type + options for smart value inputs
  const otherFieldIds = (idx) =>
    outboundConfig.fields
      .map((f, i) => i !== idx ? {
        id: f.id,
        label: f.label || f.id,
        type: f.type,
        options: f.options || [],
      } : null)
      .filter(Boolean);

  // Returns all survey questions before the current one, with their type + choices as options
  const getPreviousQuestions = (sIdx, qIdx) => {
    let prev = [];
    for (let i = 0; i <= sIdx; i++) {
      const qLimit = i === sIdx ? qIdx : sections[i].questions.length;
      for (let j = 0; j < qLimit; j++) {
        const q = sections[i].questions[j];
        if (q.questionId) {
          // Map choices to the { value, label } shape ConditionBuilder expects
          const opts = Array.isArray(q.choices)
            ? q.choices.map(c => ({ value: c.text, label: c.text }))
            : [];
          prev.push({
            id: q.questionId,
            label: q.text || q.questionId,
            type: q.type === 'text' ? 'text' : (q.type === 'info' ? 'text' : 'select'),
            options: opts,
          });
        }
      }
    }
    return prev;
  };

  return (
    <div className="fade-enter-active">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>{id ? (isAdmin ? 'Edit Call Script' : 'Audit Call Script') : 'Create Call Script'}</h1>
        {isAdmin && <button className="btn-primary" onClick={saveSurvey}>Save Survey</button>}
      </div>

      <div className="glass-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ flex: 1 }}>
          <label className="form-label">Campaign Title</label>
          <input className="input-field" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Health Awareness Poll 2026" readOnly={!isAdmin} />
        </div>
        <div style={{ marginLeft: '2rem', width: '120px' }}>
          <label className="form-label">{t('campaignGoal') || 'Campaign Goal'}</label>
          <input type="number" className="input-field" value={goal} onChange={e => setGoal(Number(e.target.value))} placeholder="Target count" readOnly={!isAdmin} />
        </div>
        <div style={{ marginLeft: '2rem' }}>
          <label className="form-label" style={{ display: 'block', marginBottom: '0.5rem' }}>Campaign Status</label>
          <button 
            type="button"
            className={isActive ? "btn-primary" : "btn-secondary"}
            onClick={isAdmin ? toggleCampaignStatus : undefined}
            disabled={!isAdmin}
          >
            {isActive ? 'Active' : 'Inactive'}
          </button>
        </div>
      </div>

      <div className="glass-card" style={{ marginTop: '1.25rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', marginBottom: '1rem' }}>Outbound Call List (XLSX)</h2>
        {id && (
          <>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <div style={{ background: 'var(--surface)', padding: '0.75rem 1.25rem', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>Total Numbers</span>
              <span style={{ fontWeight: 800, fontSize: '1.5rem', color: 'var(--text-primary)' }}>{numbersStats.total}</span>
            </div>
            <div style={{ background: 'var(--surface)', padding: '0.75rem 1.25rem', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>Uncalled</span>
              <span style={{ fontWeight: 800, fontSize: '1.5rem', color: 'var(--text-primary)' }}>{numbersStats.pending}</span>
            </div>
            <div style={{ background: 'rgba(59, 130, 246, 0.08)', padding: '0.75rem 1.25rem', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.2)', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
              <span style={{ fontSize: '0.75rem', color: '#1d4ed8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>Called</span>
              <span style={{ fontWeight: 800, fontSize: '1.5rem', color: '#1d4ed8' }}>{numbersStats.called}</span>
            </div>
            <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '0.75rem 1.25rem', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.2)', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
              <span style={{ fontSize: '0.75rem', color: '#047857', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>Qualified</span>
              <span style={{ fontWeight: 800, fontSize: '1.5rem', color: '#047857' }}>{numbersStats.qualified}</span>
            </div>
            <div style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '0.75rem 1.25rem', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.2)', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
              <span style={{ fontSize: '0.75rem', color: '#b91c1c', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>Disqualified</span>
              <span style={{ fontWeight: 800, fontSize: '1.5rem', color: '#b91c1c' }}>{numbersStats.disqualified}</span>
            </div>
            
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn-secondary" onClick={downloadDisqualified}>Download Disqualified</button>
              {isAdmin && <button type="button" className="btn-secondary" onClick={clearNumbers}>Clear List</button>}
            </div>
          </div>

          <div className="table-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Numbers Detail Table</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Showing last 200 activity logs</span>
          </div>
          </>
        )}
        {isAdmin && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem' }}>
            <input 
              type="file" 
              accept=".xlsx" 
              ref={fileInputRef}
              onChange={(e) => setPendingCsv(e.target.files[0])} 
              className="input-field" 
              style={{ maxWidth: '300px', cursor: 'pointer' }}
            />
            {pendingCsv && <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>File selected: {pendingCsv.name} (Will submit on Save)</span>}
          </div>
        )}
        
        {id && numbers && numbers.length > 0 && (
          <div style={{ marginTop: '1.5rem', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '0.75rem' }}>Number</th>
                  <th style={{ padding: '0.75rem' }}>Status</th>
                  <th style={{ padding: '0.75rem' }}>Reason</th>
                  <th style={{ padding: '0.75rem' }}>Updated At</th>
                </tr>
              </thead>
              <tbody>
                {numbers.map((n, i) => (
                  <tr key={n._id || i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 500 }}>{n.number}</td>
                    <td style={{ padding: '0.75rem' }}>
                      <span style={{ 
                        padding: '0.2rem 0.5rem', 
                        borderRadius: '4px', 
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        backgroundColor: n.status === 'completed' ? '#ecfdf5' : n.status === 'disqualified' ? '#fef2f2' : n.status === 'called' ? '#e0f2fe' : '#f3f4f6',
                        color: n.status === 'completed' ? '#047857' : n.status === 'disqualified' ? '#b91c1c' : n.status === 'called' ? '#0369a1' : '#4b5563',
                      }}>
                        {String(n.status).toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>
                      {n.outcomeReason ? String(n.outcomeReason).toUpperCase().replace(/_/g, ' ') : '-'}
                    </td>
                    <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>
                      {n.calledAt ? new Date(n.calledAt).toLocaleString() : (n.createdAt ? new Date(n.createdAt).toLocaleString() : '-')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {numbersStats.total > numbers.length && (
              <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Currently showing the first 100 recent rows out of {numbersStats.total} total synced numbers.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="glass-card" style={{ marginTop: '1.25rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: customizeOutbound ? '1rem' : 0 }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Outbound call checklist</h2>
          {isAdmin && <button
            type="button"
            className={customizeOutbound ? 'btn-primary' : 'btn-secondary'}
            onClick={() => {
              setCustomizeOutbound((prev) => {
                const next = !prev;
                if (next) {
                  setOutboundConfig((oc) => normalizeOutboundPrecall(oc));
                }
                return next;
              });
            }}
          >
            {customizeOutbound ? 'Use default checklist (discard custom editor)' : 'Customize checklist'}
          </button>}
        </div>

        {!isAdmin && (
           <div style={{ padding: '1rem', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.1)', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
             <p style={{ margin: 0 }}><strong>Note:</strong> You are in Audit mode. Questionnaire structure and checklist configurations are read-only.</p>
           </div>
        )}

        {customizeOutbound && (
          <>
            {isAdmin && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <button type="button" className="btn-secondary" onClick={() => setTemplatePickerOpen(true)}>
                  Reset to older template
                </button>
              </div>
            )}

            {templatePickerOpen && (
              <div
                role="dialog"
                aria-modal="true"
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 2000,
                  background: 'rgba(0,0,0,0.45)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '1rem',
                }}
                onClick={() => setTemplatePickerOpen(false)}
              >
                <div
                  className="glass-card"
                  style={{ maxWidth: '420px', width: '100%', padding: '1.25rem' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 style={{ marginTop: 0 }}>Choose an older template</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                    Pick a starting layout. You can still edit every field afterward.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {OUTBOUND_TEMPLATE_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="btn-secondary"
                        style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                        onClick={() => applyTemplatePreset(p.factory)}
                      >
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
                const label =
                  sec === 'agent'
                    ? 'Researcher / respondent'
                    : sec === 'call'
                    ? 'Call logistics'
                    : 'Phone distribution';
                return (
                  <div
                    key={sec}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                      padding: '0.75rem',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--input-bg)',
                    }}
                  >
                    <span style={{ fontWeight: 600, flex: 1 }}>{label}</span>
                    {isAdmin && (
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                          onClick={() => moveSection(sIdx, -1)}
                          disabled={sIdx === 0}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                          onClick={() => moveSection(sIdx, 1)}
                          disabled={sIdx === (outboundConfig.sectionOrder || ['agent', 'call', 'phone']).length - 1}
                        >
                          ↓
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <h3 className="form-label">Questions (order = agent form order)</h3>
            <p style={{ margin: '0 0 1rem', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
              Choose answer type and whether an answer is required before the agent can continue. Use "Conditional visibility" to show a field only when another field has a given value (e.g. nationality only if "Non-Egyptian").
            </p>

            <div style={{ display: 'grid', gap: '1.25rem' }}>
              {outboundConfig.fields.map((field, fIdx) => (
                <div
                  key={`${field.id}-${fIdx}`}
                  style={{
                    padding: '1rem',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--input-bg)',
                  }}
                >
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
                      <input
                        className="input-field"
                        value={field.id}
                        onChange={(e) => updateField(fIdx, { id: e.target.value.replace(/\s+/g, '_') })}
                        readOnly={!isAdmin}
                      />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Column</label>
                      <select
                        className="input-field"
                        value={field.section}
                        onChange={(e) => updateField(fIdx, { section: e.target.value })}
                        disabled={!isAdmin}
                      >
                        <option value="agent">Researcher / respondent</option>
                        <option value="call">Call logistics</option>
                        <option value="phone">Phone distribution</option>
                      </select>
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Answer type</label>
                      <select
                        className="input-field"
                        value={field.type}
                        onChange={(e) => setFieldType(fIdx, e.target.value)}
                        disabled={!isAdmin}
                      >
                        {OUTBOUND_FIELD_TYPES.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, marginTop: '1.5rem' }}>
                      <input
                        type="checkbox"
                        checked={!!field.required}
                        onChange={(e) => updateField(fIdx, { required: e.target.checked })}
                        disabled={!isAdmin}
                      />
                      Required to continue
                    </label>
                  </div>
                  <label className="form-label" style={{ marginTop: '0.75rem', display: 'block' }}>Question / label</label>
                  <input
                    className="input-field"
                    value={field.label}
                    onChange={(e) => updateField(fIdx, { label: e.target.value })}
                    readOnly={!isAdmin}
                  />
                  {field.type === 'text' && (
                    <>
                      <label className="form-label" style={{ marginTop: '0.5rem', display: 'block' }}>Placeholder (optional)</label>
                      <input
                        className="input-field"
                        value={field.placeholder || ''}
                        onChange={(e) => updateField(fIdx, { placeholder: e.target.value })}
                      />
                    </>
                  )}
                  {field.type === 'number' && (
                    <>
                      <label className="form-label" style={{ marginTop: '0.5rem', display: 'block' }}>Minimum (optional)</label>
                      <input
                        className="input-field"
                        type="number"
                        value={field.min != null ? field.min : ''}
                        onChange={(e) => updateField(fIdx, { min: e.target.value === '' ? undefined : Number(e.target.value) })}
                      />
                    </>
                  )}
                  {(field.type === 'segment' || field.type === 'select') && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <div className="form-label" style={{ marginBottom: '0.5rem' }}>Options (value + label)</div>
                      {(field.options || []).map((opt, oIdx) => (
                        <div key={oIdx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          <input
                            className="input-field"
                            placeholder="value"
                            value={opt.value}
                            onChange={(e) => updateOption(fIdx, oIdx, 'value', e.target.value)}
                            style={{ maxWidth: '140px' }}
                          />
                          <input
                            className="input-field"
                            placeholder="label"
                            value={opt.label}
                            onChange={(e) => updateOption(fIdx, oIdx, 'label', e.target.value)}
                          />
                          <button type="button" className="btn-secondary" onClick={() => removeOption(fIdx, oIdx)}>×</button>
                        </div>
                      ))}
                      <button type="button" className="btn-secondary" style={{ marginTop: '0.25rem' }} onClick={() => addOption(fIdx)}>+ Add option</button>
                    </div>
                  )}
                  <div style={{ marginTop: '0.75rem', padding: '1rem', border: '1px dashed var(--border-color)', borderRadius: '12px', background: 'rgba(var(--primary-rgb), 0.02)' }}>
                    <div style={{ fontWeight: 800, fontSize: '0.85rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}>
                      <Layers size={16} /> Visibility Logic
                    </div>
                    <ConditionBuilder 
                      condition={field.visibleWhen} 
                      onChange={(cond) => updateField(fIdx, { visibleWhen: cond })}
                      availableFields={otherFieldIds(fIdx)}
                      readOnly={!isAdmin}
                    />
                  </div>
                </div>
              ))}
            </div>
            {isAdmin && <button type="button" className="btn-secondary" style={{ width: '100%', marginTop: '1rem', borderStyle: 'dashed' }} onClick={addField}>
              + Add question
            </button>}
          </>
        )}
      </div>

      {sections.map((sec, sIdx) => (
        <div key={sIdx} className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <input 
              className="input-field" 
              style={{ fontWeight: 'bold', fontSize: '1.2rem', width: '50%' }}
              value={sec.title} 
              onChange={e => {
                if (!isAdmin) return;
                const newSecs = [...sections];
                newSecs[sIdx].title = e.target.value;
                setSections(newSecs);
              }} 
              readOnly={!isAdmin}
            />
          </div>

          <div>
            {sec.questions.map((q, qIdx) => (
              <div key={qIdx} style={{ padding: '1.5rem', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '1.5rem', background: '#fff', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                  <input className="input-field" placeholder="Question Text" value={q.text} onChange={e => updateQuestion(sIdx, qIdx, 'text', e.target.value)} style={{ flex: 1 }} readOnly={!isAdmin} />
                  <select className="input-field" style={{ width: '200px' }} value={q.type} onChange={e => updateQuestion(sIdx, qIdx, 'type', e.target.value)} disabled={!isAdmin}>
                    <option value="single_choice">Single Choice</option>
                    <option value="multiple_choice">Multiple Choice</option>
                    <option value="text">Text Input</option>
                    <option value="info">Info / Script Only</option>
                  </select>
                </div>
                
                <textarea className="input-field" placeholder="Agent Read-Aloud Script for this question (optional)" value={q.script || ''} onChange={e => updateQuestion(sIdx, qIdx, 'script', e.target.value)} rows={2} style={{ marginBottom: '1rem' }} readOnly={!isAdmin} />

                <div style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '12px', background: 'var(--bg-color)' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.85rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}>
                    <Layers size={16} /> Question Visibility (Nested Logic)
                  </div>
                  <ConditionBuilder 
                    condition={q.visibility}
                    onChange={(cond) => updateQuestion(sIdx, qIdx, 'visibility', cond)}
                    availableFields={getPreviousQuestions(sIdx, qIdx)}
                    readOnly={!isAdmin}
                  />
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Question will only be shown if these conditions are met based on previous answers.
                  </p>
                </div>

                {(q.type === 'single_choice' || q.type === 'multiple_choice') && (
                  <div style={{ padding: '1rem', background: 'var(--bg-color)', borderRadius: '8px' }}>
                    <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Choices & Skip Logic</h4>
                    {q.choices.map((c, cIdx) => (
                      <div key={cIdx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                        <input className="input-field" placeholder="Choice Text" value={c.text} onChange={e => updateChoice(sIdx, qIdx, cIdx, 'text', e.target.value)} style={{ flex: 1 }} readOnly={!isAdmin} />
                        <select className="input-field" style={{ width: '150px' }} value={c.logic?.action || 'continue'} onChange={e => updateChoice(sIdx, qIdx, cIdx, 'action', e.target.value)} disabled={!isAdmin}>
                          <option value="continue">Continue</option>
                          <option value="skip">Skip To...</option>
                          <option value="terminate">Terminate Call</option>
                        </select>
                        {c.logic?.action === 'skip' && (
                          <input className="input-field" placeholder="Target Question ID (e.g. q_123456)" value={c.logic?.skipToQuestionId || ''} onChange={e => updateChoice(sIdx, qIdx, cIdx, 'skipToQuestionId', e.target.value)} style={{ width: '220px' }} readOnly={!isAdmin} />
                        )}
                      </div>
                    ))}
                    {isAdmin && <button className="btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', marginTop: '0.5rem' }} onClick={() => addChoice(sIdx, qIdx)}>+ Add Choice</button>}
                  </div>
                )}
                <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'flex-end' }}>
                  Question ID: <strong style={{ color: 'var(--primary)', marginLeft: '0.25rem' }}>{q.questionId}</strong> 
                </div>
              </div>
            ))}
          </div>

          {isAdmin && <button className="btn-secondary" onClick={() => addQuestion(sIdx)} style={{ width: '100%', borderStyle: 'dashed' }}>+ Add Question</button>}
        </div>
      ))}

      {isAdmin && <button className="btn-secondary" style={{ width: '100%', marginBottom: '2rem', padding: '1rem' }} onClick={addSection}>+ Add New Section</button>}

    </div>
  );
};
