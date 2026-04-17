import React, { useEffect, useState, useContext } from 'react';
import axios from 'axios';
import { UIContext } from '../context/UIContext';

export default function ProfileRequests() {
  const { t } = useContext(UIContext);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adminNote, setAdminNote] = useState({});

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const res = await axios.get('http://localhost:3000/admin/profile-requests');
      setRequests(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (id, status) => {
    try {
      await axios.post(`http://localhost:3000/admin/resolve-profile-request/${id}`, {
        status,
        adminNote: adminNote[id] || ''
      });
      fetchRequests();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to resolve request");
    }
  };

  const handleNoteChange = (id, val) => {
    setAdminNote({ ...adminNote, [id]: val });
  };

  if (loading) return <div className="container">{t('loading')}</div>;

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const historyRequests = requests.filter(r => r.status !== 'pending');

  return (
    <div className="fade-enter-active">
      <h1>{t('changeRequests')}</h1>

      <section style={{ marginTop: '2rem' }}>
        <h2>{t('pendingRequests')}</h2>
        <div className="glass-card" style={{ padding: '0', overflowX: 'auto', marginTop: '1rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.02)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '1rem' }}>{t('requestedBy')}</th>
                <th style={{ padding: '1rem' }}>{t('requestedName')} / {t('requestedEmail')}</th>
                <th style={{ padding: '1rem' }}>{t('date')}</th>
                <th style={{ padding: '1rem' }}>{t('adminNote')}</th>
                <th style={{ padding: '1rem' }}>{t('resolve')}</th>
              </tr>
            </thead>
            <tbody>
              {pendingRequests.map(r => (
                <tr key={r._id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ fontWeight: '500' }}>{r.userId?.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{r.userId?.email}</div>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{r.type}</div>
                    <div style={{ fontWeight: '600', color: 'var(--accent)' }}>{r.requestedValue}</div>
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.9rem' }}>
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <input 
                      className="input-field" 
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }} 
                      placeholder={t('adminNote')}
                      value={adminNote[r._id] || ''}
                      onChange={(e) => handleNoteChange(r._id, e.target.value)}
                    />
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => handleResolve(r._id, 'approved')} className="btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>{t('approve')}</button>
                      <button onClick={() => handleResolve(r._id, 'rejected')} className="btn-danger" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', backgroundColor: '#ef4444' }}>{t('reject')}</button>
                    </div>
                  </td>
                </tr>
              ))}
              {pendingRequests.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>{t('noPendingRequests')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginTop: '3rem' }}>
        <h2>{t('requestHistory')}</h2>
        <div className="glass-card" style={{ padding: '0', overflowX: 'auto', marginTop: '1rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.02)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '1rem' }}>{t('requestedBy')}</th>
                <th style={{ padding: '1rem' }}>{t('requestedName')} / {t('requestedEmail')}</th>
                <th style={{ padding: '1rem' }}>{t('status')}</th>
                <th style={{ padding: '1rem' }}>{t('adminNote')}</th>
                <th style={{ padding: '1rem' }}>{t('date')}</th>
              </tr>
            </thead>
            <tbody>
              {historyRequests.map(r => (
                <tr key={r._id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ fontWeight: '500' }}>{r.userId?.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{r.userId?.email}</div>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{r.type}</div>
                    <div style={{ fontWeight: '600' }}>{r.requestedValue}</div>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ 
                      padding: '0.25rem 0.6rem', 
                      borderRadius: '20px', 
                      fontSize: '0.75rem', 
                      fontWeight: '700', 
                      textTransform: 'uppercase',
                      background: r.status === 'approved' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                      color: r.status === 'approved' ? 'var(--success)' : 'var(--danger)'
                    }}>
                      {t(r.status)}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.9rem' }}>
                    {r.adminNote || '-'}
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <div>{t('resolve')}: {new Date(r.resolvedAt).toLocaleString()}</div>
                    <div>{t('date')}: {new Date(r.createdAt).toLocaleString()}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
