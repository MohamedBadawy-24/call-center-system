import React, { useEffect, useState, useContext } from 'react';
import { api } from '../api/client';
import { motion } from 'framer-motion';
import { BookOpen, Plus } from 'lucide-react';
import { UIContext } from '../context/UIContext';
import { AuthContext } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import { toast } from 'react-toastify';

export default function SopUpdates() {
  const { t } = useContext(UIContext);
  const { user } = useContext(AuthContext);
  const [sops, setSops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ title: '', content: '' });

  const isStaff = user?.role === 'admin' || user?.role === 'quality';

  useEffect(() => {
    fetchData();
    // Mark as seen if agent
    if (!isStaff) {
      api.post('/sops/mark-seen').catch(console.error);
    }
  }, [isStaff]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/sops');
      setSops(res.data);
    } catch (err) {
      toast.error(t('sopLoadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/sops', formData);
      setFormData({ title: '', content: '' });
      setShowForm(false);
      toast.success(t('sopSubmitSuccess'));
      fetchData();
    } catch (err) {
      toast.error(t('sopSubmitFailed'));
    }
  };

  if (loading) return <LoadingSpinner fullPage />;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <BookOpen size={32} color="var(--primary)" />
          {t('sopUpdates') || 'SOP Updates'}
        </h1>
        {isStaff && (
          <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
            <Plus size={18} /> {t('addSopUpdate') || 'Add Update'}
          </button>
        )}
      </div>

      {showForm && isStaff && (
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="glass-card">
          <h3>{t('addSopUpdate') || 'Add Update'}</h3>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
            <div className="form-group">
              <label className="form-label">{t('title') || 'Title'}</label>
              <input 
                className="input-field" 
                required 
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('content') || 'Content'}</label>
              <textarea 
                className="input-field" 
                required 
                rows="6"
                value={formData.content}
                onChange={e => setFormData({ ...formData, content: e.target.value })}
              ></textarea>
            </div>
            <button type="submit" className="btn-primary" style={{ alignSelf: 'flex-start' }}>{t('addSopUpdate') || 'Publish Update'}</button>
          </form>
        </motion.div>
      )}

      <div className="glass-card">
        {sops.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem', color: 'var(--text-secondary)', gap: '0.5rem' }}>
            <BookOpen size={36} style={{ opacity: 0.3 }} />
            <p style={{ margin: 0, fontWeight: 600 }}>{t('emptyStateSop') || 'No SOP updates published yet.'}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {sops.map(s => (
              <div key={s._id} style={{ padding: '1.5rem', border: '1px solid var(--border-color)', borderRadius: '12px', background: 'var(--bg-secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0, color: 'var(--primary)' }}>{s.title}</h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'var(--bg-primary)', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>
                    {new Date(s.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem', fontWeight: 'bold' }}>
                  {t('postedBy')}: {s.createdBy?.name || t('notAssigned')}
                </div>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{s.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
