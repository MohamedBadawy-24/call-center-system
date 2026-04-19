import React, { useEffect, useState, useContext, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { io } from 'socket.io-client';
import { Monitor, Maximize2, X, Activity } from 'lucide-react';
import { UIContext } from '../context/UIContext';
import { AuthContext } from '../context/AuthContext';

export default function LiveMonitoring() {
  const { t } = useContext(UIContext);
  const { user } = useContext(AuthContext);
  const [activeStreams, setActiveStreams] = useState({});
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    // Only auditors and admins can listen to monitor streams
    if (!user?.role) return;
    if (user.role !== 'admin' && user.role !== 'quality') return;

    socketRef.current = io('http://localhost:3000', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      timeout: 20000
    });
    socketRef.current.on('connect_error', (err) => {
      console.error('Socket connect_error (live monitoring):', err?.message || err);
    });
    
    // Join the centralized auditors room for real-time monitoring
    socketRef.current.emit('join-monitoring', { id: user.id, role: user.role });

    socketRef.current.on('stream-data', (data) => {
      setActiveStreams(prev => ({
        ...prev,
        [data.agentId]: {
          ...data,
          lastSeen: Date.now()
        }
      }));
    });

    // Cleanup stale streams every 5 seconds
    const cleanup = setInterval(() => {
      const now = Date.now();
      setActiveStreams(prev => {
        const next = { ...prev };
        let changed = false;
        Object.keys(next).forEach(id => {
          if (now - next[id].lastSeen > 5000) {
            delete next[id];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 5000);

    return () => {
      socketRef.current?.disconnect();
      clearInterval(cleanup);
    };
  }, [user?.id, user?.role]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { scale: 0.9, opacity: 0 },
    visible: { scale: 1, opacity: 1 }
  };

  const streamArray = Object.values(activeStreams);
  const selectedStream = selectedAgentId ? activeStreams[selectedAgentId] : null;

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Monitor size={32} color="var(--primary)" />
          {t('liveMonitor')}
        </h1>
        <div className="glass-card" style={{ padding: '0.5rem 1.5rem', marginBottom: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Activity size={18} color="var(--success)" className="status-dot active" />
          <span style={{ fontWeight: 800 }}>{streamArray.length} {t('active')}</span>
        </div>
      </div>

      {streamArray.length === 0 ? (
        <motion.div 
          variants={itemVariants} 
          className="glass-card" 
          style={{ textAlign: 'center', padding: '5rem 2rem', color: 'var(--text-secondary)' }}
        >
          <Monitor size={48} style={{ opacity: 0.2, marginBottom: '1.5rem' }} />
          <p>{t('noStreamingAgents')}</p>
        </motion.div>
      ) : (
        <motion.div className="choice-grid">
          {streamArray.map(stream => (
            <motion.div 
              key={stream.agentId}
              variants={itemVariants}
              className="glass-card"
              style={{ padding: '0.5rem', cursor: 'pointer', overflow: 'hidden' }}
              onClick={() => setSelectedAgentId(stream.agentId)}
            >
              <div style={{ 
                width: '100%', 
                aspectRatio: '16/9', 
                background: '#000', 
                borderRadius: 'var(--radius-sm)', 
                overflow: 'hidden',
                position: 'relative'
              }}>
                <img 
                  src={stream.frame} 
                  alt={stream.agentName} 
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                />
                <div style={{ 
                  position: 'absolute', 
                  bottom: 0, 
                  left: 0, 
                  right: 0, 
                  padding: '0.75rem', 
                  background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 700 }}>{stream.agentName}</span>
                  <Maximize2 size={14} color="#fff" />
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Fullscreen Spectator Modal */}
      <AnimatePresence>
        {selectedStream && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="drawer-overlay"
              style={{ zIndex: 3000 }}
              onClick={() => setSelectedAgentId(null)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, x: '-50%', y: '-50%' }}
              animate={{ scale: 1, opacity: 1, x: '-50%', y: '-50%' }}
              exit={{ scale: 0.9, opacity: 0, x: '-50%', y: '-50%' }}
              style={{ 
                position: 'fixed', 
                top: '50%', 
                left: '50%', 
                width: '90vw', 
                height: '85vh', 
                zIndex: 3001,
                background: 'var(--card-bg)',
                backdropFilter: 'blur(32px)',
                borderRadius: 'var(--radius-lg)',
                border: 'var(--glass-border)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}
            >
              <div style={{ padding: '1.5rem', borderBottom: 'var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div className="status-dot active" style={{ width: '10px', height: '10px' }}></div>
                  <h2 style={{ marginBottom: 0 }}>{t('spectating')}: {selectedStream.agentName}</h2>
                </div>
                <button 
                  className="nav-action-btn" 
                  onClick={() => setSelectedAgentId(null)}
                >
                  <X size={20} />
                </button>
              </div>
              <div style={{ flex: 1, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img 
                  src={selectedStream.frame} 
                  alt={selectedStream.agentName} 
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} 
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
