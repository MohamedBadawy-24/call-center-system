import React, { useEffect, useState, useContext } from 'react';
import { api } from '../api/client';
import { motion } from 'framer-motion';
import { MessageSquare, Plus } from 'lucide-react';
import { UIContext } from '../context/UIContext';
import { AuthContext } from '../context/AuthContext';
import { toast } from 'react-toastify';
import LoadingSpinner from '../components/LoadingSpinner';

export default function Feedbacks() {
  const { t } = useContext(UIContext);
  const { user } = useContext(AuthContext);
  const [feedbacks, setFeedbacks] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ agentId: '', type: 'Feedback', feedbackText: '' });

  useEffect(() => {
    fetchData();
    api.post('/reviews/mark-seen').catch(console.error);
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      if (user.role === 'agent') {
        const res = await api.get('/reviews/my-reviews');
        setFeedbacks(res.data);
      } else {
        const [revRes, agentsRes] = await Promise.all([
          api.get('/reviews'),
          api.get('/users/list')
        ]);
        setFeedbacks(revRes.data);
        const filteredAgents = user.role === 'quality' 
          ? agentsRes.data.filter(u => u.role !== 'admin')
          : agentsRes.data;
        setAgents(filteredAgents);
      }
    } catch (err) {
      toast.error(t('feedbackLoadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/reviews', formData);
      setFormData({ agentId: '', type: 'Feedback', feedbackText: '' });
      setShowForm(false);
      toast.success(t('feedbackSubmitted'));
      fetchData();
    } catch (err) {
      toast.error(t('feedbackSubmitFailed'));
    }
  };

  if (loading) return <LoadingSpinner fullPage />;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <MessageSquare size={32} color="var(--primary)" />
          {t('feedbacks')}
        </h1>
        {user.role !== 'agent' && (
          <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
            <Plus size={18} /> {t('addFeedback') || 'Add Feedback'}
          </button>
        )}
      </div>

      {showForm && (
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="glass-card">
          <h3>{t('addFeedback') || 'Add Feedback'}</h3>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
            <div className="form-group">
              <label className="form-label">{t('agentName')}</label>
              <select 
                className="input-field" 
                required 
                value={formData.agentId}
                onChange={e => setFormData({ ...formData, agentId: e.target.value })}
              >
                <option value="">{t('selectUser')}</option>
                <option value="none" style={{ fontWeight: 'bold' }}>{t('general')}</option>
                {agents.map(a => <option key={a._id} value={a._id}>{a.name} ({a.role})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('type') || 'Type'}</label>
              <select 
                className="input-field" 
                required 
                value={formData.type}
                onChange={e => setFormData({ ...formData, type: e.target.value })}
              >
                <option value="Feedback">{t('feedbackType') || 'Feedback'}</option>
                <option value="Comment">{t('commentType') || 'Comment'}</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('feedbackText') || 'Feedback'}</label>
              <textarea 
                className="input-field" 
                required 
                rows="4"
                value={formData.feedbackText}
                onChange={e => setFormData({ ...formData, feedbackText: e.target.value })}
              ></textarea>
            </div>
            <button type="submit" className="btn-primary" style={{ alignSelf: 'flex-start' }}>{t('addFeedback') || 'Add Feedback'}</button>
          </form>
        </motion.div>
      )}

      <div className="glass-card">
        {feedbacks.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem', color: 'var(--text-secondary)', gap: '0.5rem' }}>
            <MessageSquare size={36} style={{ opacity: 0.3 }} />
            <p style={{ margin: 0, fontWeight: 600 }}>{t('emptyStateFeedback') || 'No feedback submitted yet.'}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {feedbacks.map(f => (
              <div key={f._id} style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <strong style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {f.type || t('feedbackType')}: {f.agentId ? `${f.agentId.name}` : (t('general') || 'General')}
                    {user.role === 'agent' && f.seenBy?.includes(user.id) && (
                      <span title="Read" style={{ color: 'var(--success)', display: 'inline-flex', alignItems: 'center' }}>✓</span>
                    )}
                  </strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {new Date(f.createdAt).toLocaleString()}
                  </span>
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                  {t('submittedBy')}: {f.qualityId?.name || t('notAssigned')}
                </div>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{f.feedbackText}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
