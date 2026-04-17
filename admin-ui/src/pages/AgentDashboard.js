import React, { useEffect, useState, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'framer-motion';
import { ClipboardList, Star } from 'lucide-react';
import { io } from 'socket.io-client';

import { UIContext } from '../context/UIContext';
import { AuthContext } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

export default function AgentDashboard() {
  const { t } = useContext(UIContext);
  const { user } = useContext(AuthContext);
  const [surveys, setSurveys] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  
  // Real-time Screen Sharing Refs
  const socketRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const videoRef = useRef(document.createElement('video'));

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [surveysRes, statsRes] = await Promise.allSettled([
          axios.get('http://localhost:3000/surveys'),
          axios.get('http://localhost:3000/stats/agents')
        ]);
        
        if (surveysRes.status === 'fulfilled') {
          setSurveys(surveysRes.value.data);
        } else {
          console.error("Failed to load surveys:", surveysRes.reason);
        }
        
        if (statsRes.status === 'fulfilled' && statsRes.value.data && statsRes.value.data.length > 0) {
          const myStats = statsRes.value.data.find(a => a._id === user.id);
          if (myStats) setStats(myStats);
        }
      } catch (err) {
        console.error("Agent Dashboard global fetch error:", err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [user.id]);

  // Handle Automatic Screen Sharing for Quality Auditing
  useEffect(() => {
    if (user.role !== 'agent') return;

    if (user.currentStatus === 'active') {
      const startStreaming = async () => {
        try {
          // Initialize Socket
          socketRef.current = io('http://localhost:3000');
          socketRef.current.emit('join-monitoring', { id: user.id, role: 'agent' });

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
          videoRef.current.srcObject = stream;
          videoRef.current.play();

          // Canvas for frame capturing
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');

          // High-bandwidth Frame Emission
          intervalRef.current = setInterval(() => {
            if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
              // Target HD Resolution while maintaining scale
              const width = videoRef.current.videoWidth;
              const height = videoRef.current.videoHeight;
              canvas.width = width;
              canvas.height = height;
              
              context.drawImage(videoRef.current, 0, 0, width, height);
              // Send high-quality JPEG chunks
              const frame = canvas.toDataURL('image/jpeg', 0.7); 
              socketRef.current.emit('screen-data', {
                agentId: user.id,
                agentName: user.name,
                frame
              });
            }
          }, 333); // ~3 FPS - optimized for clear screen monitoring without crashing browser

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
  }, [user.currentStatus, user.id, user.role, user.name]);

  const stopStreaming = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  };

  const handleStartSurvey = (e, surveyId) => {
    const isAdmin = user.role === 'admin';
    if (!isAdmin && user.currentStatus !== 'active') {
      e.preventDefault();
      alert(t('mustBeActive'));
      return;
    }
    navigate(`/take-survey/${surveyId}`);
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <motion.div variants={itemVariants}>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <ClipboardList size={32} color="var(--primary)" />
            {t('agentPortal')}
          </h1>
        </motion.div>
        
        {stats && (
          <motion.div 
            variants={itemVariants}
            className="glass-card" 
            style={{ padding: '0.5rem 1.5rem', marginBottom: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}
          >
            <Star size={18} fill="var(--warning)" color="var(--warning)" />
            <span style={{ fontWeight: 800 }}>{t('completed')}: {stats.completed}</span>
          </motion.div>
        )}
      </div>

      <motion.div variants={itemVariants} className="choice-grid">
        {surveys.map(s => {
          const isAdmin = user.role === 'admin';
          const isActive = user.currentStatus === 'active' || isAdmin;
          return (
            <motion.div 
              variants={itemVariants}
              whileHover={isActive ? { scale: 1.02, y: -5 } : {}}
              whileTap={isActive ? { scale: 0.98 } : {}}
              key={s._id} 
              onClick={(e) => handleStartSurvey(e, s._id)} 
              className="choice-btn" 
              style={{ 
                cursor: isActive ? 'pointer' : 'not-allowed',
                opacity: isActive ? 1 : 0.6,
                filter: isActive ? 'none' : 'grayscale(0.5)'
              }}
            >
              <h3 style={{ marginBottom: '0.5rem' }}>{s.title}</h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", fontWeight: 600 }}>
                {new Date(s.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
              
              {!isActive && !isAdmin && (
                <div style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  ⚠ {t('mustBeActive')}
                </div>
              )}
            </motion.div>
          );
        })}
        {surveys.length === 0 && !loading && (
          <motion.div variants={itemVariants} style={{ color: "var(--text-secondary)", fontStyle: 'italic' }}>
            No campaigns available at this time.
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}
