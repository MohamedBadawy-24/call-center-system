/**
 * DIAGNOSTIC - LiveMonitorAudit.jsx
 * Unified page for real-time agent status monitoring, WebRTC screen streaming, and quality auditing.
 * Replaces separate LiveMonitoring and ShadowReview pages.
 *
 * Components & Layout:
 * - Agent Grid: shows status, timer, campaign, and buttons (Monitor, Audit).
 * - Spectator Modal: renders agent WebRTC screen stream + whisper input.
 * - Audit Drawer/Modal:
 *   - Tab 1 (Status): logs timeline + call stats (handled, completed, disqualified) + screen stream.
 *   - Tab 2 (Checklist): agent select dropdown + pre-filled read-only checklist fields + quality evaluation (Notes, Outcome, Submit).
 */
import React, { useEffect, useState, useContext, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { io } from 'socket.io-client';
import { Monitor, Maximize2, X, Activity, MessageSquare, Send, ClipboardList, CheckCircle, Shield, Clock, PhoneCall, AlertTriangle, AlertCircle } from 'lucide-react';
import { api, SOCKET_BASE } from '../api/client';
import { UIContext } from '../context/UIContext';
import { AuthContext } from '../context/AuthContext';
import { toast } from 'react-toastify';
import { normalizeOutboundPrecall } from '../utils/outboundPrecallConfig';

export default function LiveMonitorAudit() {
  const { t, language } = useContext(UIContext);
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [agents, setAgents] = useState([]);
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [whisperText, setWhisperText] = useState("");
  
  // WebRTC & Streaming Refs
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const videoRef = useRef(null);

  // Modal / Tab States
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditAgentId, setAuditAgentId] = useState('');
  const [activeTab, setActiveTab] = useState('status'); // 'status' | 'audit'

  // Tab 1: Live Status & Stats
  const [statusLog, setStatusLog] = useState([]);
  const [sessionStats, setSessionStats] = useState({ handled: 0, completed: 0, disqualified: 0 });
  const [statsLoading, setStatsLoading] = useState(false);

  // Tab 2: Quality Checklist
  const [auditPrecallData, setAuditPrecallData] = useState(null);
  const [precallLoading, setPrecallLoading] = useState(false);
  const [evaluationOutcome, setEvaluationOutcome] = useState('passed'); // 'passed' | 'failed' | 'needs_follow_up'
  const [notes, setNotes] = useState('');
  const [submittingAudit, setSubmittingAudit] = useState(false);
  const [auditSuccess, setAuditSuccess] = useState(false);

  // Poll agents list every 5s & setup Socket connection
  useEffect(() => {
    if (!user?.role) return;
    if (user.role !== 'admin' && user.role !== 'quality') return;

    const token = localStorage.getItem('token');
    socketRef.current = io(SOCKET_BASE, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    socketRef.current.emit('join-monitoring', { id: user.id, role: user.role });

    const fetchAgents = async () => {
      try {
        const res = await api.get('/stats/agents');
        setAgents(res.data || []);
      } catch (e) {
        console.error('Failed to fetch agents', e);
      }
    };
    fetchAgents();
    const interval = setInterval(fetchAgents, 5000);

    // Socket listeners for WebRTC screen stream
    socketRef.current.on('webrtc-offer', async (data) => {
      if (data.agentId !== selectedAgentId && data.agentId !== auditAgentId) return;

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]
      });
      pcRef.current = pc;

      pc.ontrack = (event) => {
        if (videoRef.current) {
          videoRef.current.srcObject = event.streams[0];
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit('webrtc-ice-candidate', { target: data.agentId, candidate: event.candidate });
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socketRef.current.emit('webrtc-answer', { target: data.agentId, answer });
    });

    socketRef.current.on('stream-error', (data) => {
      toast.error(data.message);
      handleCloseSpectate();
    });

    socketRef.current.on('webrtc-ice-candidate', async (data) => {
      const activeId = selectedAgentId || auditAgentId;
      if (pcRef.current && data.senderId === activeId) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    });

    return () => {
      clearInterval(interval);
      socketRef.current?.disconnect();
      if (pcRef.current) pcRef.current.close();
    };
  }, [user, selectedAgentId, auditAgentId]);

  // Live status duration timer logic
  const [timers, setTimers] = useState({});
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const nextTimers = {};
      agents.forEach(a => {
        if (a.statusStartedAt && a.currentStatus !== 'off-duty') {
          const diff = Math.floor((now - new Date(a.statusStartedAt).getTime()) / 1000);
          if (diff >= 0) {
            const h = Math.floor(diff / 3600).toString().padStart(2, '0');
            const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
            const s = (diff % 60).toString().padStart(2, '0');
            nextTimers[a._id] = `${h}:${m}:${s}`;
          }
        }
      });
      setTimers(nextTimers);
    }, 1000);
    return () => clearInterval(interval);
  }, [agents]);

  // Handle Spectate (WebRTC Stream)
  const handleSpectate = (agentId) => {
    setSelectedAgentId(agentId);
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.emit('request-stream', { agentId });
    }
  };

  const handleCloseSpectate = () => {
    if (selectedAgentId && socketRef.current) {
      socketRef.current.emit('stop-stream', { agentId: selectedAgentId });
    }
    setSelectedAgentId(null);
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const sendWhisper = () => {
    if (!whisperText.trim() || !selectedAgentId) return;
    socketRef.current.emit('whisper', { target: selectedAgentId, message: whisperText.trim() });
    setWhisperText("");
  };

  // Open Audit Workflow
  const handleOpenAudit = (agentId) => {
    navigate(`/quality/audit-precall/${agentId}`);
  };

  const fetchAuditStats = async (agentId) => {
    setStatsLoading(true);
    try {
      // 1. Fetch agent performance details
      const statsRes = await api.get('/stats/agents');
      const myStats = statsRes.data.find(s => s._id === agentId);
      if (myStats) {
        setSessionStats({
          handled: myStats.totalSurveys || 0,
          completed: myStats.completed || 0,
          disqualified: myStats.disqualified || 0
        });
      }

      // 2. Fetch agent status log
      const agentDetails = await api.get('/users/list');
      const curAgent = agentDetails.data.find(u => u._id === agentId);
      if (curAgent) {
        // Just show a simple current timeline
        setStatusLog([
          { status: curAgent.role, time: new Date() }
        ]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setStatsLoading(false);
    }
  };

  // Fetch Precall Checklist for Audit
  useEffect(() => {
    if (!auditAgentId || activeTab !== 'audit') {
      setAuditPrecallData(null);
      return;
    }

    const fetchPrecall = async () => {
      setPrecallLoading(true);
      setAuditSuccess(false);
      try {
        const res = await api.get(`/quality/agent-precall/${auditAgentId}`);
        setAuditPrecallData(res.data);
      } catch (e) {
        toast.error('Failed to load agent precall data');
      } finally {
        setPrecallLoading(false);
      }
    };
    fetchPrecall();
  }, [auditAgentId, activeTab]);

  const handleAuditSubmit = async (e) => {
    e.preventDefault();
    if (!auditAgentId) return;
    setSubmittingAudit(true);
    try {
      await api.post('/quality/audit', {
        agentId: auditAgentId,
        evaluationOutcome,
        notes
      });
      setAuditSuccess(true);
      setEvaluationOutcome('passed');
      setNotes('');
      toast.success(t('auditSubmitted') || 'Audit submitted successfully');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit audit');
    } finally {
      setSubmittingAudit(false);
    }
  };

  const getStatusLabel = (st) => {
    switch (st) {
      case 'active': return t('active');
      case 'preparing': return t('preparing');
      case 'break': return t('onBreak');
      case 'off-duty': return t('offDuty');
      default: return st;
    }
  };

  const selectedAgentName = agents.find(a => a._id === selectedAgentId)?.agentName || "Agent";
  const auditAgentName = agents.find(a => a._id === auditAgentId)?.agentName || "Agent";

  // Split agents into online/dead
  const sortedAgents = useMemo(() => {
    const online = agents.filter(a => a.currentStatus !== 'off-duty');
    const offline = agents.filter(a => a.currentStatus === 'off-duty');
    return [...online, ...offline];
  }, [agents]);

  // Read-only checklist fields renderer
  const renderReadOnlyChecklist = () => {
    if (!auditPrecallData || !auditPrecallData.precall) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No pre-call data available for this agent's active session.
        </div>
      );
    }

    const normConfig = normalizeOutboundPrecall(auditPrecallData.precallConfig);
    const payload = auditPrecallData.precall.payload || {};

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1rem' }}>
        {normConfig.fields.map(f => {
          const val = payload[f.id];
          let displayVal = val !== undefined && val !== null ? String(val) : '—';
          if (displayVal.startsWith('other:')) {
            displayVal = displayVal.substring(6);
          }
          return (
            <div key={f.id} className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {f.label || f.id}
              </label>
              <input
                type="text"
                className="input-field"
                value={displayVal}
                disabled
                style={{
                  background: 'var(--bg-secondary)',
                  opacity: 0.85,
                  fontWeight: 700,
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)'
                }}
              />
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: 0 }}>
          <Monitor size={32} color="var(--primary)" />
          {t('liveMonitorAudit') || 'Live Monitor & Audit'}
        </h1>
        <div className="glass-card" style={{ padding: '0.5rem 1.5rem', marginBottom: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Activity size={18} color="var(--success)" className="status-dot active" />
          <span style={{ fontWeight: 800 }}>
            {agents.filter(a => a.currentStatus !== 'off-duty').length} {t('activeStaffMsg') || 'agents online'}
          </span>
        </div>
      </div>

      {/* Agents Card Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
        {sortedAgents.map(agent => {
          const isOffDuty = agent.currentStatus === 'off-duty';
          return (
            <motion.div
              key={agent._id}
              className="glass-card"
              style={{
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                opacity: isOffDuty ? 0.6 : 1,
                border: isOffDuty ? '1px dashed var(--border-color)' : '1px solid var(--border-color)',
                height: '100%',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>{agent.agentName}</h3>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 700 }}>
                      Code: {agent.researcherCode || '—'}
                    </span>
                  </div>
                  <span className={`status-pill mini`} style={{ background: agent.currentStatus === 'active' ? 'var(--success-low)' : 'var(--primary-low)', color: agent.currentStatus === 'active' ? 'var(--success)' : 'var(--primary)', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800 }}>
                    {getStatusLabel(agent.currentStatus)}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
                    <Clock size={16} />
                    <span>Duration: <strong style={{ color: 'var(--text-primary)' }}>{timers[agent._id] || '00:00:00'}</strong></span>
                  </div>
                  {!isOffDuty && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
                      <PhoneCall size={16} />
                      <span>Surveys: <strong style={{ color: 'var(--text-primary)' }}>{agent.completed || 0}</strong></span>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: 'auto' }}>
                <button
                  onClick={() => handleSpectate(agent._id)}
                  className="btn-secondary"
                  disabled={isOffDuty}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.85rem', padding: '0.5rem' }}
                >
                  <Monitor size={16} /> Monitor
                </button>
                <button
                  onClick={() => handleOpenAudit(agent._id)}
                  className="btn-primary"
                  disabled={isOffDuty}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.85rem', padding: '0.5rem' }}
                >
                  <ClipboardList size={16} /> Audit
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Fullscreen Spectator Modal (WebRTC) */}
      <AnimatePresence>
        {selectedAgentId && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="drawer-overlay" style={{ zIndex: 3000 }} onClick={handleCloseSpectate}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, x: '-50%', y: '-50%' }}
              animate={{ scale: 1, opacity: 1, x: '-50%', y: '-50%' }}
              exit={{ scale: 0.9, opacity: 0, x: '-50%', y: '-50%' }}
              style={{
                position: 'fixed', top: '50%', left: '50%', width: '90vw', height: '85vh',
                zIndex: 3001, background: 'var(--card-bg)', backdropFilter: 'blur(32px)',
                borderRadius: 'var(--radius-lg)', border: 'var(--glass-border)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden'
              }}
            >
              <div style={{ padding: '1.5rem', borderBottom: 'var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div className="status-dot active" style={{ width: '10px', height: '10px' }}></div>
                  <h2 style={{ marginBottom: 0 }}>{t('spectating') || 'Spectating'}: {selectedAgentName}</h2>
                </div>
                <button className="nav-action-btn" onClick={handleCloseSpectate}><X size={20} /></button>
              </div>

              <div style={{ flex: 1, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <video ref={videoRef} autoPlay playsInline style={{ maxWidth: '100%', maxHeight: '100%' }} />
              </div>

              <div style={{ padding: '1rem', borderTop: 'var(--glass-border)', display: 'flex', gap: '1rem' }}>
                <input
                  type="text"
                  placeholder="Type whisper message to agent..."
                  value={whisperText}
                  onChange={e => setWhisperText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendWhisper()}
                  style={{ flex: 1, padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                />
                <button className="btn-primary" onClick={sendWhisper} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Send size={16} /> Whisper
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Side Drawer Modal for Quality Audit */}
      <AnimatePresence>
        {showAuditModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="drawer-overlay" style={{ zIndex: 2000 }} onClick={() => setShowAuditModal(false)}
            />
            <motion.div
              initial={{ x: language === 'ar' ? '-100%' : '100%' }}
              animate={{ x: 0 }}
              exit={{ x: language === 'ar' ? '-100%' : '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              style={{
                position: 'fixed', top: 0, right: language === 'ar' ? 'auto' : 0, left: language === 'ar' ? 0 : 'auto',
                width: '100%', maxWidth: '550px', height: '100vh',
                zIndex: 2001, background: 'var(--card-bg)', backdropFilter: 'blur(32px)',
                borderLeft: language === 'ar' ? 'none' : 'var(--glass-border)',
                borderRight: language === 'ar' ? 'var(--glass-border)' : 'none',
                display: 'flex', flexDirection: 'column', overflow: 'hidden'
              }}
            >
              {/* Drawer Header */}
              <div style={{ padding: '1.5rem', borderBottom: 'var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800 }}>
                  Audit Review: {auditAgentName}
                </h2>
                <button className="nav-action-btn" onClick={() => setShowAuditModal(false)}>
                  <X size={20} />
                </button>
              </div>

              {/* Tabs Buttons */}
              <div style={{ display: 'flex', borderBottom: 'var(--glass-border)', background: 'rgba(255,255,255,0.02)' }}>
                <button
                  onClick={() => setActiveTab('status')}
                  style={{
                    flex: 1, padding: '1rem', background: 'transparent', border: 'none',
                    fontWeight: 800, fontSize: '0.9rem',
                    color: activeTab === 'status' ? 'var(--primary)' : 'var(--text-secondary)',
                    borderBottom: activeTab === 'status' ? '2px solid var(--primary)' : 'none',
                    cursor: 'pointer'
                  }}
                >
                  {t('monitorTab') || 'Live Status'}
                </button>
                <button
                  onClick={() => setActiveTab('audit')}
                  style={{
                    flex: 1, padding: '1rem', background: 'transparent', border: 'none',
                    fontWeight: 800, fontSize: '0.9rem',
                    color: activeTab === 'audit' ? 'var(--primary)' : 'var(--text-secondary)',
                    borderBottom: activeTab === 'audit' ? '2px solid var(--primary)' : 'none',
                    cursor: 'pointer'
                  }}
                >
                  {t('auditTab') || 'Audit Checklist'}
                </button>
              </div>

              {/* Drawer Content */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
                {activeTab === 'status' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* Session Stats */}
                    <div>
                      <h4 style={{ margin: '0 0 0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                        Session Stats Today
                      </h4>
                      {statsLoading ? (
                        <p>Loading stats...</p>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                          <div className="glass-card" style={{ padding: '0.75rem', textAlign: 'center', margin: 0 }}>
                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary)' }}>{sessionStats.handled}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Handled</div>
                          </div>
                          <div className="glass-card" style={{ padding: '0.75rem', textAlign: 'center', margin: 0 }}>
                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--success)' }}>{sessionStats.completed}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Completed</div>
                          </div>
                          <div className="glass-card" style={{ padding: '0.75rem', textAlign: 'center', margin: 0 }}>
                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--danger)' }}>{sessionStats.disqualified}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Disqualified</div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Status Timeline */}
                    <div>
                      <h4 style={{ margin: '0 0 0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                        Timeline Logs
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {statusLog.map((log, idx) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.85rem' }}>
                            <span style={{ fontWeight: 700, textTransform: 'uppercase' }}>{log.status}</span>
                            <span style={{ color: 'var(--text-secondary)' }}>{log.time.toLocaleTimeString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'audit' && (
                  <div>
                    {/* Pre-selected dropdown */}
                    <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                      <label className="form-label">{t('selectAgentToAudit')}</label>
                      <select
                        className="input-field"
                        value={auditAgentId}
                        onChange={(e) => setAuditAgentId(e.target.value)}
                      >
                        {agents.map(a => (
                          <option key={a._id} value={a._id}>{a.agentName}</option>
                        ))}
                      </select>
                    </div>

                    {precallLoading ? (
                      <p>Loading precall checklist...</p>
                    ) : (
                      <>
                        {/* Labeled badges */}
                        {auditPrecallData && (
                          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                            <div className="precall-pill" style={{ background: 'var(--primary-low)', color: 'var(--primary)', border: 'none', margin: 0, padding: '0.35rem 0.75rem' }}>
                              <strong>Serial:</strong> #{auditPrecallData?.precall?.serialNumber || 'N/A'}
                            </div>
                            <div className="precall-pill" style={{ background: 'var(--primary-low)', color: 'var(--primary)', border: 'none', margin: 0, padding: '0.35rem 0.75rem' }}>
                              <strong>Agent:</strong> {auditPrecallData?.agentName || 'N/A'}
                            </div>
                            <div className="precall-pill" style={{ background: 'var(--primary-low)', color: 'var(--primary)', border: 'none', margin: 0, padding: '0.35rem 0.75rem' }}>
                              <strong>Code:</strong> {auditPrecallData?.researcherCode || t('notAssigned')}
                            </div>
                          </div>
                        )}

                        {/* Checklist Content */}
                        <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '2rem', marginBottom: '2rem' }}>
                          <h4 style={{ margin: '0 0 1rem 0' }}>{t('auditChecklist') || 'Audit Checklist'}</h4>
                          {renderReadOnlyChecklist()}
                        </div>

                        {/* Quality Evaluation Section */}
                        {auditPrecallData && auditPrecallData.precall && (
                          <form onSubmit={handleAuditSubmit}>
                            <h4 style={{ margin: '0 0 1rem 0' }}>Evaluation Outcome</h4>
                            
                            <AnimatePresence>
                              {auditSuccess && (
                                <motion.div
                                  initial={{ opacity: 0, y: -10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0 }}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                                    color: 'var(--success)', marginBottom: '1.5rem',
                                    background: 'rgba(16,185,129,0.1)', padding: '0.875rem 1rem',
                                    borderRadius: '10px', fontWeight: 600
                                  }}
                                >
                                  <CheckCircle size={18} />
                                  {t('auditSubmitted') || 'Audit submitted successfully'}
                                </motion.div>
                              )}
                            </AnimatePresence>

                            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                              <label className="form-label">{t('auditOutcome') || 'Outcome'}</label>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600 }}>
                                  <input
                                    type="radio"
                                    name="outcome"
                                    value="passed"
                                    checked={evaluationOutcome === 'passed'}
                                    onChange={(e) => setEvaluationOutcome(e.target.value)}
                                  />
                                  {t('auditPassed') || 'Passed'}
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600 }}>
                                  <input
                                    type="radio"
                                    name="outcome"
                                    value="failed"
                                    checked={evaluationOutcome === 'failed'}
                                    onChange={(e) => setEvaluationOutcome(e.target.value)}
                                  />
                                  {t('auditFailed') || 'Failed'}
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600 }}>
                                  <input
                                    type="radio"
                                    name="outcome"
                                    value="needs_follow_up"
                                    checked={evaluationOutcome === 'needs_follow_up'}
                                    onChange={(e) => setEvaluationOutcome(e.target.value)}
                                  />
                                  {t('auditNeedsFollowUp') || 'Needs Follow-up'}
                                </label>
                              </div>
                            </div>

                            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                              <label className="form-label">Notes</label>
                              <textarea
                                className="input-field"
                                rows="3"
                                maxLength="500"
                                placeholder="Audit notes (max 500 chars)..."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                style={{ width: '100%', resize: 'vertical' }}
                              />
                            </div>

                            <button
                              type="submit"
                              className="btn-primary"
                              disabled={submittingAudit}
                              style={{ width: '100%' }}
                            >
                              {submittingAudit ? 'Submitting...' : t('submitAudit') || 'Submit Audit'}
                            </button>
                          </form>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
