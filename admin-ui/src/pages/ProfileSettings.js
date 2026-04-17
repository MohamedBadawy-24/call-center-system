import React, { useState, useContext, useEffect } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { UIContext } from '../context/UIContext';

export default function ProfileSettings() {
  const { user, setUser } = useContext(AuthContext); 
  const { theme, toggleTheme, language, setLanguage, t } = useContext(UIContext);
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);
  const [requests, setRequests] = useState([]);
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  const [vCode, setVCode] = useState('');

  const isAgent = user.role === 'agent';

  useEffect(() => {
    // Fetch stats
    axios.get('http://localhost:3000/stats/agents').then(res => {
      const myStats = res.data.find(s => s._id === user.id);
      if (myStats) setStats(myStats);
    }).catch(console.error);

    // Fetch own requests
    if (isAgent) {
      axios.get('http://localhost:3000/auth/my-profile-requests')
        .then(res => setRequests(res.data))
        .catch(console.error);
    }
  }, [user.id, isAgent]);

  const formatTime = (secs) => {
    if (!secs) return "0s";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    let parts = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0 || h > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  };

  const handleSendEmailCode = async () => {
    try {
      setError('');
      setMessage('');
      if (!email || email === user.email) return;
      const res = await axios.post('http://localhost:3000/auth/request-email-change-code', { newEmail: email });
      setMessage(res.data.message);
      setIsVerifyingEmail(true);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to send code");
    }
  };

  const handleVerifyEmailAndSubmit = async () => {
    try {
      setError('');
      setMessage('');
      const res = await axios.post('http://localhost:3000/auth/verify-email-change-code', { 
        code: vCode,
        newEmail: email 
      });
      setMessage(res.data.message);
      setIsVerifyingEmail(false);
      setVCode('');
      setEmail('');
      // Refresh requests
      const reqs = await axios.get('http://localhost:3000/auth/my-profile-requests');
      setRequests(reqs.data);
    } catch (err) {
      setError(err.response?.data?.error || "Verification failed");
    }
  };

  const handleRequestChange = async (type, val) => {
    try {
      setError('');
      setMessage('');
      const res = await axios.post('http://localhost:3000/auth/request-profile-change', {
        type,
        requestedValue: val
      });
      setMessage(res.data.message);
      // Refresh requests
      const reqs = await axios.get('http://localhost:3000/auth/my-profile-requests');
      setRequests(reqs.data);
    } catch (err) {
      setError(err.response?.data?.error || "Request failed");
    }
  };

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const targetField = e?.target?.name; // Optional: identify which button was clicked

    try {
      setError('');
      setMessage('');
      
      // If agent, they use the specific individual buttons which call handleRequestChange directly.
      // E-mail for agent is now handled via handleSendEmailCode -> handleVerifyEmailAndSubmit
      if (isAgent) {
        if ((!targetField || targetField === 'name') && name !== user.name) {
          await handleRequestChange('name', name);
          setName(user.name);
        }
      }

      const payload = {};
      if (!isAgent) {
        if ((!targetField || targetField === 'name') && name !== user.name) payload.name = name;
        if ((!targetField || targetField === 'email') && email) payload.email = email;
      }
      
      // Password is only in the main form at the bottom
      if (!targetField && password) {
        payload.password = password;
        payload.oldPassword = oldPassword;
      }

      if (Object.keys(payload).length > 0) {
        const res = await axios.put('http://localhost:3000/auth/profile', payload);
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
        setUser(res.data.user);
        setMessage('Profile updated! ' + (payload.password ? 'Password changed.' : ''));
        if (!targetField || targetField === 'email') setEmail('');
        if (!targetField) {
          setOldPassword('');
          setPassword('');
        }
      } else if (!isAgent && !targetField) {
        setMessage('No changes detected.');
      }
      
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update profile');
    }
  };

  const getStatusColor = (s) => {
    if (s === 'approved') return 'var(--success)';
    if (s === 'rejected') return 'var(--danger)';
    return 'var(--primary)';
  };

  return (
    <div className="fade-enter-active">
      <h2>{t('accountSettings')}</h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem', marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Stats Section - ONLY for Agents */}
          {isAgent && stats && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="glass-card" style={{ padding: '1.5rem', textAlign: 'center', marginBottom: '0' }}>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--primary)' }}>{stats.totalSurveys || 0}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t('lifetimeSurveys')}</div>
              </div>
              <div className="glass-card" style={{ padding: '1.5rem', textAlign: 'center', marginBottom: '0' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--accent)', marginTop: '0.3rem', marginBottom: '0.2rem' }}>{formatTime(stats.totalDurationSecs)}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t('estCallTime')}</div>
              </div>
            </div>
          )}

          {/* Preferences Section */}
          <div className="glass-card" style={{ marginBottom: '0' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '1.5rem' }}>{t('theme')} & {t('language')}</h3>
            <div className="form-group">
              <label className="form-label">{t('theme')}</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  className={`btn-secondary ${theme === 'light' ? 'active' : ''}`} 
                  onClick={() => theme !== 'light' && toggleTheme()}
                  style={{ flex: 1, borderColor: theme === 'light' ? 'var(--accent)' : '' }}
                >
                  {t('light')}
                </button>
                <button 
                  className={`btn-secondary ${theme === 'dark' ? 'active' : ''}`} 
                  onClick={() => theme !== 'dark' && toggleTheme()}
                  style={{ flex: 1, borderColor: theme === 'dark' ? 'var(--accent)' : '' }}
                >
                  {t('dark')}
                </button>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">{t('language')}</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  className={`btn-secondary ${language === 'en' ? 'active' : ''}`} 
                  onClick={() => setLanguage('en')}
                  style={{ flex: 1, borderColor: language === 'en' ? 'var(--accent)' : '' }}
                >
                  {t('english')}
                </button>
                <button 
                  className={`btn-secondary ${language === 'ar' ? 'active' : ''}`} 
                  onClick={() => setLanguage('ar')}
                  style={{ flex: 1, borderColor: language === 'ar' ? 'var(--accent)' : '' }}
                >
                  {t('arabic')}
                </button>
              </div>
            </div>
          </div>

          {/* Requests History Section for Agent */}
          {isAgent && requests.length > 0 && (
            <div className="glass-card" style={{ marginBottom: '0' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>{t('requestHistory')}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {requests.map(r => (
                  <div key={r._id} style={{ padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.9rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <strong style={{ textTransform: 'uppercase', fontSize: '0.75rem' }}>{r.type}</strong>
                      <span style={{ fontWeight: '700', color: getStatusColor(r.status), fontSize: '0.75rem', textTransform: 'uppercase' }}>{t(r.status)}</span>
                    </div>
                    <div style={{ fontWeight: '500' }}>{r.requestedValue}</div>
                    {r.adminNote && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{t('adminNote')}: {r.adminNote}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Profile Form */}
        <div className="glass-card" style={{ marginBottom: '0' }}>
          <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
            {isAgent ? t('requestChange') : t('updateProfileMsg')}
          </p>
          
          {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem', background: 'rgba(225,45,57,0.1)', padding: '0.75rem', borderRadius: '8px' }}>{error}</div>}
          {message && <div style={{ color: 'var(--success)', marginBottom: '1rem', background: 'rgba(62,171,214,0.1)', padding: '0.75rem', borderRadius: '8px' }}>{message}</div>}
          
          <div className="form-group" style={{ marginBottom: '2rem' }}>
            <label className="form-label">{t('displayName')}</label>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <input required className="input-field" value={name} onChange={e => setName(e.target.value)} style={{ flex: 1 }} />
              <button 
                onClick={() => isAgent ? handleRequestChange('name', name) : handleSubmit({ preventDefault: () => {}, target: { name: 'name' } })} 
                className="btn-primary" 
                style={{ whiteSpace: 'nowrap', padding: '0.5rem 1rem' }}
                disabled={name === user.name}
              >
                {isAgent ? t('requestChange') : t('saveChanges')}
              </button>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '2.5rem' }}>
            <label className="form-label">{t('emailAddress')}</label>
            
            {!isVerifyingEmail ? (
              <div style={{ display: 'flex', gap: '1rem' }}>
                <input type="email" className="input-field" value={email} onChange={e => setEmail(e.target.value)} placeholder={user.email} style={{ flex: 1 }} />
                {isAgent ? (
                  <button 
                    onClick={handleSendEmailCode} 
                    className="btn-primary" 
                    style={{ whiteSpace: 'nowrap', padding: '0.5rem 1rem' }}
                    disabled={!email || email === user.email}
                  >
                    {t('sendVerificationCode')}
                  </button>
                ) : (
                  <button 
                    onClick={() => handleSubmit({ preventDefault: () => {}, target: { name: 'email' } })} 
                    className="btn-primary" 
                    style={{ whiteSpace: 'nowrap', padding: '0.5rem 1rem' }}
                    disabled={!email || email === user.email}
                  >
                    {t('saveChanges')}
                  </button>
                )}
              </div>
            ) : (
              <div style={{ background: 'rgba(79, 70, 229, 0.05)', padding: '1rem', borderRadius: '12px', border: '1px dashed var(--accent)' }}>
                <div style={{ fontSize: '0.85rem', marginBottom: '0.75rem', color: 'var(--accent)' }}>{t('verificationCodeSent')} ({email})</div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input 
                    className="input-field" 
                    value={vCode} 
                    onChange={e => setVCode(e.target.value)} 
                    placeholder="6-digit code" 
                    style={{ flex: 1, letterSpacing: '4px', textAlign: 'center', fontWeight: 'bold' }} 
                  />
                  <button onClick={handleVerifyEmailAndSubmit} className="btn-primary" style={{ padding: '0.5rem 1.5rem' }}>{t('verifyAndSubmit')}</button>
                </div>
                <button 
                  onClick={() => {setIsVerifyingEmail(false); setVCode('');}} 
                  className="btn-secondary" 
                  style={{ display: 'block', margin: '0.75rem auto 0', fontSize: '0.8rem', border: 'none', background: 'transparent', color: 'var(--text-secondary)' }}
                >
                  {t('backToLogin') /* Reusing text for cancel */}
                </button>
              </div>
            )}
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '2rem 0' }} />
          
          <form onSubmit={handleSubmit}>
            <h4 style={{ marginBottom: '1rem' }}>{t('newPassword')}</h4>
            <div className="form-group">
              <label className="form-label">{t('oldPassword')}</label>
              <input type="password" reversed className="input-field" value={oldPassword} onChange={e => setOldPassword(e.target.value)} placeholder={t('oldPassword')} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('newPassword')}</label>
              <input type="password" reversed className="input-field" value={password} onChange={e => setPassword(e.target.value)} placeholder={t('newPassword')} />
            </div>
            <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '1rem' }}>{t('saveChanges')}</button>
          </form>
        </div>
      </div>
    </div>
  );
}
