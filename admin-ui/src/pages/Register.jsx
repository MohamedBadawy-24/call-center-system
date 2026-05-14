import React, { useState, useContext } from 'react';
import { api } from '../api/client';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, User, Mail, Lock, Shield, CheckCircle, AlertCircle, Headphones, ClipboardCheck, ShieldCheck } from 'lucide-react';
import { UIContext } from '../context/UIContext';

const ROLES = [
  {
    value: 'agent',
    label: 'Call Center Agent',
    labelAr: 'موظف مركز الاتصال',
    description: 'Handles customer calls and completes survey campaigns.',
    descriptionAr: 'يتعامل مع مكالمات العملاء وينجز حملات الاستطلاع.',
    icon: Headphones,
    color: '#3b82f6',
  },
  {
    value: 'quality',
    label: 'Quality Agent',
    labelAr: 'وكيل الجودة',
    description: 'Monitors agent performance and audits live campaigns.',
    descriptionAr: 'يراقب أداء الموظفين ويراجع الحملات الحية.',
    icon: ClipboardCheck,
    color: '#8b5cf6',
  },
  {
    value: 'admin',
    label: 'Admin',
    labelAr: 'مدير النظام',
    description: 'Full system access to manage users, surveys, and settings.',
    descriptionAr: 'صلاحية كاملة لإدارة المستخدمين والاستطلاعات والإعدادات.',
    icon: ShieldCheck,
    color: '#f59e0b',
  },
];

export default function Register() {
  const { t, language } = useContext(UIContext);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('agent');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedRole = ROLES.find(r => r.value === role);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      setError('');
      setMessage('');
      await api.post('/auth/register', { name, email, password, role });
      setMessage(`${name} has been added as a ${selectedRole.label}.`);
      setName(''); setEmail(''); setPassword(''); setRole('agent');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2.5rem' }}>
        <UserPlus size={32} color="var(--primary)" />
        <h1 style={{ marginBottom: 0 }}>{t('addTeamMember')}</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', maxWidth: '960px', alignItems: 'start' }}>

        {/* Left: Form */}
        <div className="glass-card">
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--danger)', marginBottom: '1.5rem', background: 'rgba(239,68,68,0.1)', padding: '0.875rem 1rem', borderRadius: '10px', fontWeight: 600 }}
              >
                <AlertCircle size={18} />
                {error}
              </motion.div>
            )}
            {message && (
              <motion.div
                key="success"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--success)', marginBottom: '1.5rem', background: 'rgba(16,185,129,0.1)', padding: '0.875rem 1rem', borderRadius: '10px', fontWeight: 600 }}
              >
                <CheckCircle size={18} />
                {message}
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Name */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <User size={14} color="var(--primary)" /> {t('displayName')}
              </label>
              <input
                required
                className="input-field"
                value={name}
                placeholder=""
                onChange={e => setName(e.target.value)}
              />
            </div>

            {/* Email */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Mail size={14} color="var(--primary)" /> {t('emailAddress')}
              </label>
              <input
                type="email"
                required
                className="input-field"
                value={email}
                placeholder=""
                onChange={e => setEmail(e.target.value)}
              />
            </div>

            {/* Password */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Lock size={14} color="var(--primary)" /> {t('password')}
              </label>
              <input
                type="password"
                required
                className="input-field"
                value={password}
                placeholder="Min. 8 characters"
                onChange={e => setPassword(e.target.value)}
              />
            </div>

            {/* Role Selector */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Shield size={14} color="var(--primary)" /> {t('role')}
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginTop: '0.25rem' }}>
                {ROLES.map((r) => {
                  const Icon = r.icon;
                  const isSelected = role === r.value;
                  return (
                    <motion.button
                      key={r.value}
                      type="button"
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => setRole(r.value)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        padding: '0.875rem 1rem',
                        borderRadius: '12px',
                        border: `2px solid ${isSelected ? r.color : 'var(--card-border, rgba(255,255,255,0.1))'}`,
                        background: isSelected ? `${r.color}18` : 'var(--input-bg)',
                        cursor: 'pointer',
                        textAlign: language === 'ar' ? 'right' : 'left',
                        transition: 'all 0.2s ease',
                        width: '100%',
                      }}
                    >
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        background: isSelected ? `${r.color}30` : 'var(--card-bg)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        border: `1px solid ${isSelected ? r.color + '50' : 'transparent'}`,
                      }}>
                        <Icon size={18} color={isSelected ? r.color : 'var(--text-secondary)'} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: isSelected ? r.color : 'var(--text-primary)' }}>
                          {language === 'ar' ? r.labelAr : r.label}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.1rem', lineHeight: 1.4 }}>
                          {language === 'ar' ? r.descriptionAr : r.description}
                        </div>
                      </div>
                      {isSelected && (
                        <CheckCircle size={18} color={r.color} style={{ flexShrink: 0 }} />
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </div>

            <motion.button
              type="submit"
              className="btn-primary"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={loading}
              style={{ width: '100%', marginTop: '0.5rem', gap: '0.75rem' }}
            >
              {loading ? (
                <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
              ) : (
                <><UserPlus size={16} /> {t('addTeamMember')}</>
              )}
            </motion.button>
          </form>
        </div>

        {/* Right: Live Role Preview */}
        <motion.div
          className="glass-card"
          key={role}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          style={{ position: 'sticky', top: '6rem' }}
        >
          {(() => {
            const Icon = selectedRole.icon;
            return (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '1rem 0 1.5rem' }}>
                  <div style={{
                    width: '72px',
                    height: '72px',
                    borderRadius: '20px',
                    background: `${selectedRole.color}22`,
                    border: `2px solid ${selectedRole.color}44`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '1.25rem',
                  }}>
                    <Icon size={32} color={selectedRole.color} />
                  </div>
                  <h2 style={{ marginBottom: '0.5rem', color: selectedRole.color }}>
                    {language === 'ar' ? selectedRole.labelAr : selectedRole.label}
                  </h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', maxWidth: '260px', lineHeight: 1.6 }}>
                    {language === 'ar' ? selectedRole.descriptionAr : selectedRole.description}
                  </p>
                </div>

                <div style={{ borderTop: '1px solid var(--glass-border, rgba(255,255,255,0.08))', paddingTop: '1.25rem' }}>
                  <p style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
                    Access Permissions
                  </p>
                  {[
                    { label: 'Agent Portal', roles: ['agent', 'quality', 'admin'] },
                    { label: 'Take Surveys', roles: ['agent', 'admin'] },
                    { label: 'Performance Dashboard', roles: ['quality', 'admin'] },
                    { label: 'Live Monitoring', roles: ['quality', 'admin'] },
                    { label: 'Create Campaigns', roles: ['admin'] },
                    { label: 'Manage Team', roles: ['admin'] },
                  ].map(item => {
                    const allowed = item.roles.includes(selectedRole.value);
                    return (
                      <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', fontSize: '0.85rem' }}>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{item.label}</span>
                        <span style={{ fontWeight: 700, fontSize: '0.75rem', color: allowed ? 'var(--success)' : 'var(--text-secondary)', opacity: allowed ? 1 : 0.4 }}>
                          {allowed ? '✓ Allowed' : '✗ Restricted'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </motion.div>
      </div>
    </motion.div>
  );
}
