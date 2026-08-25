import React, { useEffect, useState, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, SOCKET_BASE } from '../api/client';
import { motion, AnimatePresence } from 'framer-motion';
import { ClipboardList, Star, ArrowLeft } from 'lucide-react';
import { io } from 'socket.io-client';
import { toast } from 'react-toastify';

import { UIContext } from '../context/UIContext';
import { AuthContext } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import { offlineDb } from '../utils/offlineDb';

export default function AgentDashboard() {
  const { t } = useContext(UIContext);
  const { user } = useContext(AuthContext);
  const [surveys, setSurveys] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dailyGoal, setDailyGoal] = useState(50);
  const navigate = useNavigate();
  
  const [whisperMessage, setWhisperMessage] = useState(null);
  
  // Real-time Screen Sharing Refs
  const socketRef = useRef(null);
  const streamRef = useRef(null);
  const peerConnectionsRef = useRef({});

  useEffect(() => {
    if (
      user?.role === 'agent' &&
      user?.currentStatus === 'active' &&
      user?.precallCompletedForActiveSession !== true &&
      !loading &&
      (surveys || []).length > 0
    ) {
      const latestSid = surveys[0]?._id;
      const url = latestSid ? `/agent/precall?surveyId=${latestSid}` : '/agent/precall';
      navigate(url, { replace: true });
      return;
    }
  }, [navigate, user?.currentStatus, user?.id, user?._id, user?.role, user?.precallCompletedForActiveSession, surveys, loading]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [surveysRes, statsRes, goalRes] = await Promise.allSettled([
          api.get('/surveys'),
          api.get('/stats/agents'),
          api.get('/settings/dailyGoal')
        ]);
        
        if (surveysRes.status === 'fulfilled' && Array.isArray(surveysRes.value?.data)) {
          setSurveys(surveysRes.value.data);
          // CACHE FOR OFFLINE USE
          try {
            localStorage.setItem('cachedCampaigns', JSON.stringify(surveysRes.value.data));
            for (const s of surveysRes.value.data) {
              if (s?._id) {
                offlineDb.saveSurveyDef(s).catch(() => {});
              }
            }
          } catch (_) {}
        } else {
          const err = surveysRes.status === 'rejected' ? surveysRes.reason : null;
          // PREVENT FATAL CRASH: err.response is undefined if offline
          if (!navigator.onLine || !err?.response) {
            console.warn("Offline mode: Loading cached campaigns");
            try {
              const cached = localStorage.getItem('cachedCampaigns');
              if (cached) {
                const parsed = JSON.parse(cached);
                setSurveys(Array.isArray(parsed) ? parsed : []);
              } else {
                setSurveys([]); // Never set to null!
              }
            } catch (_) {
              setSurveys([]);
            }
          } else {
            console.error("Failed to load surveys:", err);
            setSurveys([]); // Guarantee an array to prevent .map crashes
          }
        }
        
        if (statsRes.status === 'fulfilled' && Array.isArray(statsRes.value?.data) && statsRes.value.data.length > 0) {
          const myStats = statsRes.value.data.find(a => String(a?._id) === String(user?.id || user?._id));
          if (myStats) setStats(myStats);
        }

        if (goalRes.status === 'fulfilled' && goalRes.value?.data) {
          setDailyGoal(goalRes.value.data.dailyGoal || 50);
        }
      } catch (err) {
        console.error("Agent Dashboard global fetch error:", err);
        if (!navigator.onLine || !err?.response) {
          console.warn("Offline mode: Loading cached campaigns fallback");
          try {
            const cached = localStorage.getItem('cachedCampaigns');
            if (cached) {
              const parsed = JSON.parse(cached);
              setSurveys(Array.isArray(parsed) ? parsed : []);
            } else {
              setSurveys([]);
            }
          } catch (_) {
            setSurveys([]);
          }
        } else {
          setSurveys([]);
        }
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [user?.id, user?._id]);

  // Handle Automatic Screen Sharing for Quality Auditing
  useEffect(() => {
    if (user?.role !== 'agent') return;

    if (user?.currentStatus === 'active') {
      const startStreaming = async () => {
        try {
          if (!navigator.onLine) {
            console.log("Offline mode: Skipping auto-monitoring screen sharing");
            return;
          }
          if (!navigator?.mediaDevices?.getDisplayMedia) {
            console.warn("getDisplayMedia not supported in this environment");
            return;
          }

          // Initialize Socket
          const token = localStorage.getItem('token');
          socketRef.current = io(SOCKET_BASE, {
            auth: { token },
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 500,
            reconnectionDelayMax: 5000,
            timeout: 20000
          });
          socketRef.current.on('connect_error', (err) => {
            console.error('Socket connect_error (agent streaming):', err?.message || err);
          });
          socketRef.current.emit('join-monitoring', { id: user?.id || user?._id, role: 'agent' });

          // Capture Screen
          const stream = await navigator.mediaDevices.getDisplayMedia({
            video: { 
              cursor: "always",
              displaySurface: "monitor",
              frameRate: { ideal: 15, max: 30 } 
            },
            audio: false
          });
          
          streamRef.current = stream;

          socketRef.current.on('request-stream', async ({ auditorId }) => {
            try {
              const pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]
              });
              peerConnectionsRef.current[auditorId] = pc;

              if (stream && typeof stream.getTracks === 'function') {
                stream.getTracks().forEach(track => pc.addTrack(track, stream));
              }

              pc.onicecandidate = (event) => {
                if (event.candidate) {
                  socketRef.current?.emit('webrtc-ice-candidate', {
                    target: auditorId,
                    candidate: event.candidate,
                    agentId: user?.id || user?._id
                  });
                }
              };

              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);

              socketRef.current?.emit('webrtc-offer', {
                target: auditorId,
                agentId: user?.id || user?._id,
                agentName: user?.name,
                offer
              });
            } catch (e) {
              console.error('Error handling request-stream:', e);
            }
          });

          socketRef.current.on('webrtc-answer', async ({ auditorId, answer }) => {
            const pc = peerConnectionsRef.current[auditorId];
            if (pc && pc.signalingState !== 'stable') {
              await pc.setRemoteDescription(new RTCSessionDescription(answer));
            }
          });

          socketRef.current.on('webrtc-ice-candidate', async ({ senderId, candidate }) => {
            const pc = peerConnectionsRef.current[senderId];
            if (pc) {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            }
          });

          socketRef.current.on('whisper', ({ message }) => {
            setWhisperMessage(message);
            setTimeout(() => setWhisperMessage(null), 8000);
          });

          socketRef.current.on('stop-stream', ({ auditorId }) => {
            const pc = peerConnectionsRef.current[auditorId];
            if (pc) {
              pc.close();
              delete peerConnectionsRef.current[auditorId];
            }
          });

        } catch (err) {
          console.error("Auto-monitoring failed to start:", err);
        }
      };

      startStreaming();
    } else {
      // Clean up when not active
      stopStreaming();
    }

    return () => stopStreaming();
  }, [user?.currentStatus, user?.id, user?._id, user?.role, user?.name]);

  const stopStreaming = () => {
    if (streamRef.current && typeof streamRef.current.getTracks === 'function') {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
    peerConnectionsRef.current = {};
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  };

  const handleStartSurvey = (e, surveyId) => {
    const isStaff = user?.role === 'admin' || user?.role === 'quality';
    if (!isStaff && user?.currentStatus !== 'active') {
      e.preventDefault();
      toast.warning(t('mustBeActive'));
      return;
    }
    if (user?.role === 'agent') {
      navigate(`/agent/precall?surveyId=${surveyId}`);
    } else {
      navigate(`/take-survey/${surveyId}`);
    }
  };

  if (loading) return <LoadingSpinner fullPage />;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 }
  };

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <AnimatePresence>
        {whisperMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            style={{
              position: 'fixed',
              top: '20px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 9999,
              background: 'var(--primary)',
              color: '#fff',
              padding: '1rem 2rem',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}
          >
            💬 {whisperMessage}
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <motion.div variants={itemVariants}>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <ClipboardList size={32} color="var(--primary)" />
            {t('agentPortal')}
          </h1>
        </motion.div>

        {user?.role === 'agent' && user?.currentStatus === 'active' && (
          <motion.div variants={itemVariants}>
            <button type="button" className="btn-secondary" onClick={() => navigate('/agent/precall')} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              <ArrowLeft size={18} />
              {t('backToChecklist')}
            </button>
          </motion.div>
        )}
        
        {stats && typeof stats.completed === 'number' && (
          <motion.div 
            variants={itemVariants}
            className="glass-card" 
            style={{ padding: '1rem 1.5rem', marginBottom: 0, flex: 1, minWidth: '300px', maxWidth: '400px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Star size={18} fill="var(--warning)" color="var(--warning)" />
                <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>{t('campaignGoal') || 'Daily Goal'}</span>
              </div>
              <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--success)' }}>{stats.completed} / {dailyGoal || 50}</span>
            </div>
            <div className="fulfillment-container" style={{ height: '8px' }}>
              <div className="fulfillment-bar" style={{ width: `${Math.min(((stats.completed || 0) / (dailyGoal || 50)) * 100, 100)}%`, background: 'var(--success)' }}></div>
            </div>
            {(stats.completed || 0) >= (dailyGoal || 50) && (
              <div style={{ fontSize: '0.75rem', color: 'var(--warning)', marginTop: '0.5rem', fontWeight: 700, textAlign: 'center' }}>
                🌟 {t('completed') || 'Goal Reached!'} 🌟
              </div>
            )}
          </motion.div>
        )}
      </div>

      <motion.div variants={itemVariants} className="choice-grid">
        {(surveys || []).map(s => {
          if (!s) return null;
          const isStaff = user?.role === 'admin' || user?.role === 'quality';
          const isActive = user?.currentStatus === 'active' || isStaff;
          return (
            <motion.div 
              variants={itemVariants}
              whileHover={isActive ? { scale: 1.02, y: -5 } : {}}
              whileTap={isActive ? { scale: 0.98 } : {}}
              key={s._id || s.id || Math.random()} 
              onClick={(e) => handleStartSurvey(e, s._id || s.id)} 
              className="choice-btn" 
              style={{ 
                cursor: isActive ? 'pointer' : 'not-allowed',
                opacity: isActive ? 1 : 0.6,
                filter: isActive ? 'none' : 'grayscale(0.5)'
              }}
            >
              <h3 style={{ marginBottom: '0.5rem' }}>{s.title || t('untitledSurvey') || 'Untitled Campaign'}</h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", fontWeight: 600 }}>
                {s.createdAt ? new Date(s.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : ''}
              </p>
              
              {!isActive && !isStaff && (
                <div style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  ⚠ {t('mustBeActive')}
                </div>
              )}
            </motion.div>
          );
        })}
        {(surveys || []).length === 0 && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '2rem', color: 'var(--text-secondary)' }}>
            <ClipboardList size={40} style={{ opacity: 0.2 }} />
            <span style={{ fontWeight: 600 }}>{t('emptyStateNoCampaigns') || 'No campaigns available.'}</span>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

