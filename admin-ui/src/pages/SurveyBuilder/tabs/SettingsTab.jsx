import React, { useContext, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { SurveyBuilderContext } from '../SurveyBuilderContext';
import { EGYPTIAN_GOVERNORATES } from '../../../utils/governorates';
import { api } from '../../../api/client';
import { toast } from 'react-toastify';
import { motion } from 'framer-motion';
import { UploadCloud, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

const AgentMultiSelect = ({ agents, assignedAgents, setAssignedAgents, disabled }) => {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const [dropdownCoords, setDropdownCoords] = useState(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        const portalNode = document.getElementById('agent-multiselect-portal');
        if (portalNode && portalNode.contains(event.target)) return;
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && containerRef.current) {
      const updateCoords = () => {
        const rect = containerRef.current.getBoundingClientRect();
        setDropdownCoords({
          top: rect.bottom,
          left: rect.left,
          width: rect.width
        });
      };
      updateCoords();
      window.addEventListener('resize', updateCoords);
      window.addEventListener('scroll', updateCoords, true);
      return () => {
        window.removeEventListener('resize', updateCoords);
        window.removeEventListener('scroll', updateCoords, true);
      };
    }
  }, [isOpen]);

  const filteredAgents = agents.filter(a => 
    (a.name || '').toLowerCase().includes(search.toLowerCase()) || 
    (a.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleToggleAgent = (agentId) => {
    if (assignedAgents.includes(agentId)) {
      setAssignedAgents(assignedAgents.filter(id => id !== agentId));
    } else {
      setAssignedAgents([...assignedAgents, agentId]);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <button type="button" className="btn-secondary" disabled={disabled || agents.length === 0} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => setAssignedAgents(agents.map(a => a._id))}>
          Select All
        </button>
        <button type="button" className="btn-secondary" disabled={disabled || assignedAgents.length === 0} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => setAssignedAgents([])}>
          Clear All
        </button>
      </div>

      <div style={{ position: 'relative' }} ref={containerRef}>
        <div 
          className="input-field" 
          style={{ 
            minHeight: '44px', 
            height: 'auto', 
            padding: '0.4rem 0.6rem', 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: '0.5rem',
            alignItems: 'center',
            cursor: disabled ? 'not-allowed' : 'text',
            backgroundColor: disabled ? 'var(--surface)' : 'var(--bg-primary)'
          }}
          onClick={() => {
            if (!disabled) setIsOpen(true);
          }}
        >
          {assignedAgents.map(id => {
            const agent = agents.find(a => a._id === id);
            if (!agent) return null;
            return (
              <span key={id} style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                backgroundColor: 'rgba(59, 130, 246, 0.12)',
                color: 'var(--primary)',
                padding: '0.25rem 0.6rem',
                borderRadius: '16px',
                fontSize: '0.85rem',
                fontWeight: 600,
                border: '1px solid rgba(59, 130, 246, 0.2)'
              }}>
                {agent.name}
                {!disabled && (
                  <button type="button" style={{
                    background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.7
                  }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.7} onClick={(e) => { e.stopPropagation(); handleToggleAgent(id); }}>✕</button>
                )}
              </span>
            );
          })}
          {!disabled && (
            <input 
              type="text" 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              placeholder={assignedAgents.length === 0 ? "Search and assign agents..." : ""}
              style={{
                flex: 1, minWidth: '150px', border: 'none', outline: 'none', background: 'transparent',
                color: 'var(--text-primary)', fontSize: '0.9rem', padding: '0.25rem'
              }}
              onFocus={() => setIsOpen(true)}
            />
          )}
        </div>

        {isOpen && !disabled && dropdownCoords && createPortal(
          <>
            <style>{`
              .agent-multiselect-dropdown {
                background-color: var(--bg-color, #ffffff) !important;
                backdrop-filter: none !important;
                -webkit-backdrop-filter: none !important;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3) !important;
                border: 1px solid var(--border-color, #ccc) !important;
              }
              .agent-multiselect-item {
                border-bottom: 1px solid var(--border-color, #ccc) !important;
              }
            `}</style>
            <div id="agent-multiselect-portal" className="agent-multiselect-dropdown" style={{
              position: 'fixed', top: `${dropdownCoords.top}px`, left: `${dropdownCoords.left}px`, width: `${dropdownCoords.width}px`, zIndex: 99999,
              marginTop: '0.4rem', borderRadius: '8px', maxHeight: '220px', overflowY: 'auto'
            }}>
              {filteredAgents.length === 0 ? (
                <div style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center' }}>No agents found.</div>
              ) : (
                filteredAgents.map(agent => {
                  const isSelected = assignedAgents.includes(agent._id);
                  return (
                    <div 
                      key={agent._id}
                      className="agent-multiselect-item"
                      onClick={() => handleToggleAgent(agent._id)}
                      style={{
                        padding: '0.75rem 1rem', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                        transition: 'background-color 0.15s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isSelected ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.08)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isSelected ? 'rgba(59, 130, 246, 0.08)' : 'transparent'}
                    >
                      <div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>{agent.name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{agent.email}</div>
                      </div>
                      {isSelected && <CheckCircle size={18} color="var(--primary)" />}
                    </div>
                  );
                })
              )}
            </div>
          </>,
          document.body
        )}
      </div>
    </div>
  );
};

export default function SettingsTab() {
  const { 
    surveyId, isAdmin, surveyState, updateState, 
    numbers, numbersStats, numbersGovFilter, setNumbersGovFilter, loadNumbers
  } = useContext(SurveyBuilderContext);

  // Standalone upload state variables
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadGov, setUploadGov] = useState('');
  const [uploadStatus, setUploadStatus] = useState('idle'); // idle | uploading | success | error
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [agents, setAgents] = useState([]);
  
  const [assignmentMode, setAssignmentMode] = useState(
    (surveyState.assignedAgents && surveyState.assignedAgents.length > 0) ? 'custom' : 'public'
  );

  // Sync mode if surveyState.assignedAgents updates externally (e.g., initial load)
  React.useEffect(() => {
    if (surveyState.assignedAgents && surveyState.assignedAgents.length > 0) {
      setAssignmentMode('custom');
    }
  }, [surveyState.assignedAgents]);

  const uploadFileInputRef = useRef();

  React.useEffect(() => {
    if (isAdmin) {
      api.get('/admin/users')
        .then(res => {
          setAgents(res.data.filter(u => u.role === 'agent'));
        })
        .catch(console.error);
    }
  }, [isAdmin]);

  const toggleCampaignStatus = async () => {
    if (!surveyId) {
      updateState(s => ({ ...s, isActive: !s.isActive }));
      return;
    }
    try {
      await api.put(`/surveys/${surveyId}/toggle`, {});
      updateState(s => ({ ...s, isActive: !s.isActive }));
      toast.success("Status toggled");
    } catch (err) {
      toast.error("Failed to toggle campaign status");
    }
  };

  const downloadDisqualified = async () => {
    try {
      const res = await api.get(`/admin/survey/${surveyId}/numbers/disqualified/export`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `disqualified_${surveyId}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      toast.error("Failed to download disqualified numbers.");
    }
  };

  const clearNumbers = async () => {
    if (!window.confirm("Are you sure you want to clear the entire numbers list for this campaign?")) return;
    try {
      await api.delete(`/admin/survey/${surveyId}/numbers`);
      toast.success("Numbers list cleared.");
      loadNumbers();
    } catch(e) {
      toast.error("Failed to clear numbers.");
    }
  };

  const handleUploadClick = () => {
    if (uploadFileInputRef.current) {
      uploadFileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setUploadFile(file);
      setUploadStatus('idle');
      setUploadResult(null);
      setUploadError('');
    }
  };

  const handleUploadSubmit = async () => {
    if (!uploadFile || !surveyId) return;
    setUploadStatus('uploading');
    setUploadError('');
    setUploadResult(null);

    const formData = new FormData();
    formData.append('file', uploadFile);
    if (uploadGov) {
      formData.append('governorate', uploadGov);
    }

    try {
      const res = await api.post(`/admin/campaigns/${surveyId}/upload-numbers`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setUploadStatus('success');
      setUploadResult(res.data);
      setUploadFile(null);
      if (uploadFileInputRef.current) {
        uploadFileInputRef.current.value = '';
      }
      loadNumbers();
      
      // Auto-clear success state back to idle after 5 seconds
      setTimeout(() => {
        setUploadStatus('idle');
        setUploadResult(null);
      }, 5000);
    } catch (err) {
      setUploadStatus('error');
      setUploadError(err.response?.data?.error || err.message || 'Upload failed');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div className="glass-card" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem', overflow: 'visible', zIndex: 20 }}>
        {/* Row 1 */}
        <div style={{ width: '100%' }}>
          <label className="form-label">Campaign Title</label>
          <input className="input-field" value={surveyState.title} onChange={e => updateState({ title: e.target.value })} placeholder="e.g. Health Awareness Poll 2026" readOnly={!isAdmin} style={{ margin: 0 }} />
        </div>

        {/* Row 2 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
          <div>
            <label className="form-label">Campaign Goal</label>
            <input type="number" className="input-field" value={surveyState.goal} onChange={e => updateState({ goal: Number(e.target.value) })} placeholder="Target count" readOnly={!isAdmin} style={{ margin: 0 }} />
          </div>
          <div>
            <label className="form-label">Target Governorate</label>
            <select className="input-field" value={surveyState.targetGovernorate} onChange={e => updateState({ targetGovernorate: e.target.value })} disabled={!isAdmin} style={{ margin: 0 }}>
              <option value="All">All Governorates</option>
              {EGYPTIAN_GOVERNORATES.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Survey Layout Mode</label>
            <select className="input-field" value={surveyState.layoutMode || 'single'} onChange={e => updateState({ layoutMode: e.target.value })} disabled={!isAdmin} style={{ margin: 0 }}>
              <option value="single">Single Question Per Screen</option>
              <option value="multi">Multiple Questions (Page-by-Section)</option>
            </select>
          </div>
        </div>

        {/* Row 3 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
          <div>
            <label className="form-label">Number Assignment Mode</label>
            <select className="input-field" value={surveyState.numberAssignmentMode || 'queue_only'} onChange={e => updateState({ numberAssignmentMode: e.target.value })} disabled={!isAdmin} style={{ margin: 0 }}>
              <option value="queue_only">Queue Only</option>
              <option value="queue_then_manual">Queue then Manual</option>
              <option value="manual_allowed">Manual Allowed</option>
            </select>
          </div>
          <div>
            <label className="form-label" style={{ display: 'block', marginBottom: '0.4rem' }}>Campaign Status</label>
            <button 
              type="button"
              onClick={isAdmin ? toggleCampaignStatus : undefined}
              disabled={!isAdmin}
              style={{
                padding: '0.65rem 1.2rem',
                borderRadius: '8px',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: isAdmin ? 'pointer' : 'not-allowed',
                backgroundColor: surveyState.isActive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                color: surveyState.isActive ? 'var(--success)' : 'var(--danger)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                width: '100%',
                transition: 'all 0.2s ease',
                boxShadow: surveyState.isActive ? 'inset 0 0 0 1px rgba(16, 185, 129, 0.3)' : 'inset 0 0 0 1px rgba(239, 68, 68, 0.3)',
                margin: 0
              }}
            >
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: surveyState.isActive ? 'var(--success)' : 'var(--danger)',
                boxShadow: surveyState.isActive ? '0 0 8px var(--success)' : '0 0 8px var(--danger)'
              }}></div>
              {surveyState.isActive ? 'ACTIVE' : 'INACTIVE'}
            </button>
          </div>
        </div>

        {/* Row 4 */}
        {isAdmin && (
          <div style={{ width: '100%', padding: '1.25rem', background: 'var(--bg-primary)', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <label className="form-label" style={{ fontSize: '1rem', marginBottom: '1rem' }}>Agent Visibility Assignment</label>
            
            <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.25rem', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600, color: 'var(--text-primary)' }}>
                <input 
                  type="radio" 
                  name="visibilityMode" 
                  checked={assignmentMode === 'public'}
                  onChange={() => {
                    setAssignmentMode('public');
                    updateState({ assignedAgents: [] });
                  }}
                  style={{ accentColor: 'var(--primary)', transform: 'scale(1.1)' }}
                />
                All Agents (Public)
              </label>
              
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600, color: 'var(--text-primary)' }}>
                <input 
                  type="radio" 
                  name="visibilityMode" 
                  checked={assignmentMode === 'custom'}
                  onChange={() => {
                    setAssignmentMode('custom');
                  }}
                  style={{ accentColor: 'var(--primary)', transform: 'scale(1.1)' }}
                />
                Specific Agents (Custom)
              </label>
            </div>

            {assignmentMode === 'custom' && (
              <AgentMultiSelect 
                agents={agents} 
                assignedAgents={surveyState.assignedAgents || []} 
                setAssignedAgents={(updatedAgents) => updateState({ assignedAgents: updatedAgents })} 
                disabled={!isAdmin} 
              />
            )}
          </div>
        )}
      </div>

      <div className="glass-card">
        <h2 style={{ margin: 0, fontSize: '1.25rem', marginBottom: '0.5rem' }}>Governorate Goals</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          Target sum: <strong>{surveyState.governorateGoals.reduce((sum, g) => sum + (Number(g.goal) || 0), 0)}</strong> / {surveyState.goal || 0}
          {surveyState.governorateGoals.reduce((sum, g) => sum + (Number(g.goal) || 0), 0) > surveyState.goal && (
            <span style={{ color: 'red', marginLeft: '0.5rem', fontWeight: 'bold' }}>Error: Exceeds campaign goal!</span>
          )}
        </p>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
          {surveyState.governorateGoals.map((govObj, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--surface)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 600, flex: 1 }}>{govObj.governorate}</span>
              <input 
                type="number" 
                className="input-field" 
                style={{ width: '80px', padding: '0.4rem' }} 
                value={govObj.goal} 
                onChange={e => {
                  if (!isAdmin) return;
                  const newGoals = [...surveyState.governorateGoals];
                  newGoals[i].goal = Number(e.target.value) || 0;
                  updateState({ governorateGoals: newGoals });
                }}
                readOnly={!isAdmin}
              />
              {isAdmin && (
                <button type="button" className="btn-secondary" style={{ padding: '0.4rem 0.6rem' }} onClick={() => {
                  if (!window.confirm("Are you sure you want to remove this governorate target?")) return;
                  updateState({ governorateGoals: surveyState.governorateGoals.filter((_, idx) => idx !== i) });
                }}>✕</button>
              )}
            </div>
          ))}
        </div>

        {isAdmin && (
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '1rem' }}>
            <select className="input-field" style={{ maxWidth: '200px' }} id="add-gov-select">
              <option value="">Select Governorate...</option>
              {EGYPTIAN_GOVERNORATES.filter(g => !surveyState.governorateGoals.find(existing => existing.governorate === g)).map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <button type="button" className="btn-secondary" onClick={() => {
              const sel = document.getElementById('add-gov-select');
              if (sel && sel.value) {
                updateState({ governorateGoals: [...surveyState.governorateGoals, { governorate: sel.value, goal: 0 }] });
                sel.value = '';
              }
            }}>Add Goal</button>
          </div>
        )}
      </div>

      <div className="glass-card">
        <h2 style={{ margin: 0, fontSize: '1.25rem', marginBottom: '1rem' }}>Outbound Call List Queue</h2>
        {surveyId && (
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
            <div style={{ background: 'rgba(59, 130, 246, 0.08)', padding: '0.75rem 1.25rem', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
              <span style={{ fontSize: '0.75rem', color: '#1d4ed8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>Called</span>
              <span style={{ fontWeight: 800, fontSize: '1.5rem', color: '#1d4ed8' }}>{numbersStats.called}</span>
            </div>
            <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '0.75rem 1.25rem', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
              <span style={{ fontSize: '0.75rem', color: '#047857', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>Qualified</span>
              <span style={{ fontWeight: 800, fontSize: '1.5rem', color: '#047857' }}>{numbersStats.qualified}</span>
            </div>
            <div style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '0.75rem 1.25rem', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <span style={{ fontSize: '0.75rem', color: '#b91c1c', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>Disqualified</span>
              <span style={{ fontWeight: 800, fontSize: '1.5rem', color: '#b91c1c' }}>{numbersStats.disqualified}</span>
            </div>
            
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn-secondary" onClick={downloadDisqualified}>Download Disqualified</button>
              {isAdmin && <button type="button" className="btn-secondary" onClick={clearNumbers}>Clear List</button>}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Numbers Detail Table</h3>
            <select className="input-field" style={{ minWidth: '150px', padding: '0.25rem 0.5rem' }} value={numbersGovFilter} onChange={e => setNumbersGovFilter(e.target.value)}>
              <option value="All">All Governorates</option>
              {EGYPTIAN_GOVERNORATES.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          </>
        )}

        {isAdmin && (
          <div style={{ 
            marginTop: '1.5rem', 
            padding: '1.5rem', 
            background: 'var(--surface)', 
            borderRadius: '12px',
            border: '1px solid var(--border)',
            boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.02)'
          }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.05rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <UploadCloud size={20} color="var(--primary)" />
              Upload Campaign Numbers
            </h3>
            
            {!surveyId ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0, fontStyle: 'italic' }}>
                Please save this new campaign first before uploading numbers.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '1.25rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: '1 1 200px' }}>
                    <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>Assign to Governorate</label>
                    <select 
                      className="input-field" 
                      value={uploadGov} 
                      onChange={e => setUploadGov(e.target.value)} 
                      style={{ width: '100%', minWidth: '180px' }}
                      disabled={uploadStatus === 'uploading'}
                    >
                      <option value="">None / Unknown</option>
                      {EGYPTIAN_GOVERNORATES.map(g => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: '2 1 250px' }}>
                    <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>Phone Numbers File</label>
                    <input 
                      type="file" 
                      accept=".xlsx,.csv,.txt" 
                      ref={uploadFileInputRef}
                      onChange={handleFileChange} 
                      style={{ display: 'none' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleUploadClick}
                        className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}
                        disabled={uploadStatus === 'uploading'}
                      >
                        Choose File
                      </motion.button>
                      <span style={{ 
                        color: uploadFile ? 'var(--text-primary)' : 'var(--text-secondary)', 
                        fontSize: '0.85rem',
                        fontWeight: uploadFile ? 700 : 500,
                        textOverflow: 'ellipsis', 
                        overflow: 'hidden', 
                        whiteSpace: 'nowrap',
                        maxWidth: '220px'
                      }}>
                        {uploadFile ? uploadFile.name : 'No file selected'}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: '1 1 220px', minWidth: '220px' }}>
                    {uploadStatus === 'idle' && (
                      <motion.button
                        type="button"
                        whileHover={uploadFile ? { scale: 1.02 } : {}}
                        whileTap={uploadFile ? { scale: 0.98 } : {}}
                        onClick={handleUploadSubmit}
                        disabled={!uploadFile}
                        style={{
                          background: uploadFile ? 'linear-gradient(135deg, #10b981, #059669)' : 'var(--border)',
                          color: '#fff',
                          border: 'none',
                          padding: '0.6rem 1.25rem',
                          borderRadius: '8px',
                          fontWeight: 700,
                          cursor: uploadFile ? 'pointer' : 'not-allowed',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          width: '100%',
                          justifyContent: 'center',
                          boxShadow: uploadFile ? '0 4px 12px rgba(16, 185, 129, 0.2)' : 'none'
                        }}
                      >
                        <UploadCloud size={16} />
                        Upload Numbers
                      </motion.button>
                    )}

                    {uploadStatus === 'uploading' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 700 }}>
                        <Loader2 className="spin-icon" size={18} />
                        Uploading...
                      </div>
                    )}

                    {uploadStatus === 'success' && uploadResult && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981', fontSize: '0.85rem', fontWeight: 700 }}>
                        <CheckCircle size={18} />
                        <div>
                          <div>{uploadResult.uploaded} added, {uploadResult.skipped} skipped</div>
                          {uploadResult.rejected > 0 && <div style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>{uploadResult.rejected} invalid numbers rejected</div>}
                        </div>
                      </div>
                    )}

                    {uploadStatus === 'error' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)', fontSize: '0.85rem', fontWeight: 700 }}>
                          <AlertCircle size={18} />
                          {uploadError}
                        </div>
                        <button 
                          type="button" 
                          onClick={handleUploadSubmit} 
                          style={{ 
                            background: 'none', border: 'none', color: 'var(--primary)', 
                            fontSize: '0.8rem', fontWeight: 700, textDecoration: 'underline', 
                            cursor: 'pointer', textAlign: 'left', padding: 0 
                          }}
                        >
                          Retry
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600, display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.25rem' }}>
                  <span>Accepts .csv, .xlsx, .txt — one number per row</span>
                  {uploadStatus === 'success' && uploadResult && uploadResult.rejectedSamples && uploadResult.rejectedSamples.length > 0 && (
                    <span style={{ color: 'var(--danger)' }}>
                      Rejected samples: {uploadResult.rejectedSamples.join(', ')}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        
        {surveyId && numbers && numbers.length > 0 && (
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
                        padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 700, fontSize: '0.75rem',
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
          </div>
        )}
      </div>
    </div>
  );
}
