/**
 * DIAGNOSTIC - UserManagement.jsx
 * Displays user list: name, email, role, status, actions.
 * Delete action calls DELETE /admin/users/:id.
 *
 * Changes:
 * - Add "Researcher Code" column.
 * - Add InlineResearcherCodeEdit component to handle PATCH /admin/users/:id/researcher-code.
 */
import React, { useEffect, useState, useContext } from 'react';
import { api } from '../api/client';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Users, Trash2, UserPlus, ArrowLeft } from 'lucide-react';

import { UIContext } from '../context/UIContext';
import { AuthContext } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

const InlineResearcherCodeEdit = ({ user, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(user.researcherCode || '');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await api.patch(`/admin/users/${user._id}/researcher-code`, { researcherCode: val });
      setIsEditing(false);
      onUpdate(res.data);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update researcher code');
    } finally {
      setLoading(false);
    }
  };

  if (isEditing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        <input 
          type="text" 
          value={val} 
          onChange={e => setVal(e.target.value)} 
          style={{ 
            padding: '0.25rem 0.5rem', 
            fontSize: '0.8rem', 
            width: '90px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--primary)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)'
          }}
          autoFocus
        />
        <button 
          className="btn-primary" 
          onClick={handleSave} 
          disabled={loading}
          style={{ padding: '0.25rem 0.5rem', height: 'auto', fontSize: '0.75rem' }}
        >
          ✓
        </button>
        <button 
          className="btn-secondary" 
          onClick={() => { setIsEditing(false); setVal(user.researcherCode || ''); }} 
          style={{ padding: '0.25rem 0.5rem', height: 'auto', fontSize: '0.75rem' }}
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <span 
      onClick={() => setIsEditing(true)} 
      style={{ 
        cursor: 'pointer', 
        borderBottom: '1px dashed var(--text-secondary)',
        color: user.researcherCode ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontStyle: user.researcherCode ? 'normal' : 'italic',
        fontWeight: user.researcherCode ? 800 : 500,
      }}
      title="Click to edit researcher code"
    >
      {user.researcherCode || '—'}
    </span>
  );
};

export default function UserManagement() {
  const { t } = useContext(UIContext);
  const { user } = useContext(AuthContext);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/users');
      setUsers(res.data || []);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const adminCount = users.filter(u => u.role === 'admin').length;

  const handleDelete = async (u) => {
    if (!u?._id) return;
    if (u._id === user?.id) {
      alert(t('cannotDeleteSelf'));
      return;
    }
    if (u.role === 'admin' && adminCount <= 1) {
      alert(t('cannotDeleteLastAdmin'));
      return;
    }

    if (!window.confirm(t('confirmDeleteUser'))) return;

    setDeletingId(u._id);
    try {
      await api.delete(`/admin/users/${u._id}`);
      setUsers(prev => prev.filter(x => x._id !== u._id));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete user');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <LoadingSpinner fullPage />;

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Users size={32} color="var(--primary)" />
          <h1 style={{ margin: 0 }}>{t('teamMembers')}</h1>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link to="/admin" className="btn-secondary">
            <ArrowLeft size={16} /> {t('backToDashboard')}
          </Link>
          <Link to="/admin/register" className="btn-primary">
            <UserPlus size={16} /> {t('addTeamMember')}
          </Link>
        </div>
      </div>

      <div className="glass-card" style={{ padding: '1rem', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 0.5rem' }}>
          <thead>
            <tr>
              <th>{t('displayName')}</th>
              <th>{t('emailAddress')}</th>
              <th>{t('role')}</th>
              <th>{t('researcherCode')}</th>
              <th>{t('status')}</th>
              <th style={{ width: '140px' }}>{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => {
              const isSelf = u._id === user?.id;
              const disableDelete = isSelf || (u.role === 'admin' && adminCount <= 1);
              return (
                <tr key={u._id}>
                  <td style={{ fontWeight: 800 }}>{u.name}</td>
                  <td style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>{u.email}</td>
                  <td style={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem' }}>{u.role}</td>
                  <td>
                    <InlineResearcherCodeEdit user={u} onUpdate={(updatedUser) => {
                      setUsers(prev => prev.map(x => x._id === updatedUser._id ? { ...x, researcherCode: updatedUser.researcherCode } : x));
                    }} />
                  </td>
                  <td style={{ fontWeight: 800, fontSize: '0.85rem' }}>{u.currentStatus || '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderColor: 'hsla(0, 85%, 60%, 0.35)',
                        color: 'var(--danger)',
                        opacity: disableDelete ? 0.45 : 1,
                        cursor: disableDelete ? 'not-allowed' : 'pointer'
                      }}
                      disabled={disableDelete || deletingId === u._id}
                      onClick={() => handleDelete(u)}
                      title={disableDelete ? (isSelf ? t('cannotDeleteSelf') : t('cannotDeleteLastAdmin')) : t('deleteAccount')}
                    >
                      {deletingId === u._id ? (
                        <div className="spinner" style={{ width: '14px', height: '14px' }} />
                      ) : (
                        <><Trash2 size={16} /> {t('delete')}</>
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {users.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 700 }}>
            {t('noUsersFound')}
          </div>
        )}
      </div>
    </motion.div>
  );
}
