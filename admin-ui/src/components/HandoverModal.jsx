import React, { useState, useEffect, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserPlus, Search, Loader2 } from 'lucide-react';
import { api } from '../api/client';
import { UIContext } from '../context/UIContext';

export default function HandoverModal({ isOpen, onClose, serialNumber, onSuccess }) {
  const { t } = useContext(UIContext);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      api.get('/agent/handover-candidates')
        .then(res => {
          // Filter out admins and current user? Actually any agent/quality can receive a handover.
          setAgents(res.data.filter(u => u.role === 'agent' || u.role === 'quality'));
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  const handleHandover = async (targetAgentId, targetName) => {
    if (!window.confirm(`Are you sure you want to handover this call to ${targetName}?`)) return;
    
    setSubmitting(true);
    try {
      await api.post('/agent/handover', { serialNumber, targetAgentId });
      alert(`Successfully handed over to ${targetName}`);
      onSuccess();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || "Handover failed");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredAgents = agents.filter(a => 
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    a.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="drawer-overlay" style={{ zIndex: 4000 }} onClick={onClose}
          />
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, x: '-50%', y: '-50%' }}
            animate={{ scale: 1, opacity: 1, x: '-50%', y: '-50%' }}
            exit={{ scale: 0.9, opacity: 0, x: '-50%', y: '-50%' }}
            style={{ 
              position: 'fixed', top: '50%', left: '50%', width: '450px', maxWidth: '90vw', 
              zIndex: 4001, background: 'var(--card-bg)', backdropFilter: 'blur(32px)',
              borderRadius: 'var(--radius-lg)', border: 'var(--glass-border)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }}
          >
            <div style={{ padding: '1.5rem', borderBottom: 'var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <UserPlus size={22} color="var(--primary)" />
                <h2 style={{ marginBottom: 0, fontSize: '1.25rem' }}>{t('handoverCall') || 'Handover Call'}</h2>
              </div>
              <button className="nav-action-btn" onClick={onClose}><X size={20} /></button>
            </div>

            <div style={{ padding: '1rem', borderBottom: 'var(--glass-border)' }}>
                <div style={{ position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                    <input 
                        type="text" 
                        className="input-field" 
                        placeholder={t('searchAgents') || "Search agents..."}
                        style={{ paddingLeft: '40px' }}
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div style={{ flex: 1, maxHeight: '400px', overflowY: 'auto', padding: '0.5rem' }}>
              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                    <Loader2 size={32} className="spin-icon" color="var(--primary)" />
                </div>
              ) : filteredAgents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                    {t('noAgentsFound') || 'No agents found.'}
                </div>
              ) : (
                filteredAgents.map(agent => (
                    <div 
                        key={agent._id} 
                        className="glass-card" 
                        style={{ 
                            padding: '1rem', marginBottom: '0.5rem', display: 'flex', 
                            justifyContent: 'space-between', alignItems: 'center',
                            cursor: submitting ? 'not-allowed' : 'pointer'
                        }}
                        onClick={() => !submitting && handleHandover(agent._id, agent.name)}
                    >
                        <div>
                            <div style={{ fontWeight: 800 }}>{agent.name}</div>
                            <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>{agent.role.toUpperCase()}</div>
                        </div>
                        <UserPlus size={18} opacity={0.5} />
                    </div>
                ))
              )}
            </div>

            <div style={{ padding: '1.25rem', borderTop: 'var(--glass-border)', textAlign: 'right', background: 'rgba(0,0,0,0.2)' }}>
                <button className="btn-secondary" onClick={onClose} disabled={submitting}>
                    {t('cancel')}
                </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
