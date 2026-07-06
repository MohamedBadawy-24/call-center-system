import React, { useEffect, useState, useContext, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { io } from 'socket.io-client';
import { Monitor, Maximize2, X, Activity, MessageSquare, Send } from 'lucide-react';
import { api, SOCKET_BASE } from '../api/client';
import { UIContext } from '../context/UIContext';
import { AuthContext } from '../context/AuthContext';
import { toast } from 'react-toastify';

export default function LiveMonitoring() {
  const { t } = useContext(UIContext);
  const { user } = useContext(AuthContext);
  const [activeAgents, setActiveAgents] = useState([]);
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [whisperText, setWhisperText] = useState("");
  
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const videoRef = useRef(null);

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
        setActiveAgents(res.data.filter(a => a.role === 'agent' && a.currentStatus === 'active'));
      } catch(e) {}
    };
    fetchAgents();
    const interval = setInterval(fetchAgents, 5000);

    socketRef.current.on('webrtc-offer', async (data) => {
      if (data.agentId !== selectedAgentId) return;

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
        if (event.candidate) {
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
      if (pcRef.current && data.senderId === selectedAgentId) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    });

    return () => {
      clearInterval(interval);
      socketRef.current?.disconnect();
      if (pcRef.current) pcRef.current.close();
    };
  }, [user, selectedAgentId]);

  const handleSpectate = (agentId) => {
    setSelectedAgentId(agentId);
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    socketRef.current.emit('request-stream', { agentId });
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

  const selectedAgentName = activeAgents.find(a => a._id === selectedAgentId)?.agentName || "Agent";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Monitor size={32} color="var(--primary)" />
          {t('liveMonitor')}
        </h1>
        <div className="glass-card" style={{ padding: '0.5rem 1.5rem', marginBottom: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Activity size={18} color="var(--success)" className="status-dot active" />
          <span style={{ fontWeight: 800 }}>{activeAgents.length} {t('active')}</span>
        </div>
      </div>

      {activeAgents.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '5rem 2rem', color: 'var(--text-secondary)' }}>
          <Monitor size={48} style={{ opacity: 0.2, marginBottom: '1.5rem' }} />
          <p>{t('noStreamingAgents') || 'No active agents available for monitoring.'}</p>
        </div>
      ) : (
        <div className="choice-grid">
          {activeAgents.map(agent => (
            <motion.div 
              key={agent._id}
              className="glass-card"
              style={{ padding: '1.5rem', cursor: 'pointer', textAlign: 'center' }}
              onClick={() => handleSpectate(agent._id)}
            >
              <Monitor size={48} color="var(--primary)" style={{ opacity: 0.5, marginBottom: '1rem' }} />
              <h3 style={{ marginBottom: 0 }}>{agent.agentName}</h3>
              <p style={{ color: 'var(--success)', fontSize: '0.8rem', fontWeight: 700, marginTop: '0.5rem' }}>
                Online & Ready
              </p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Fullscreen Spectator Modal */}
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
    </motion.div>
  );
}
