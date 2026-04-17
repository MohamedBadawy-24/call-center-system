import React, { useState, useContext } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { UIContext } from '../context/UIContext';

export default function ForgotPassword() {
  const { t } = useContext(UIContext);
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleRequestCode = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setMessage('');
      const res = await axios.post('http://localhost:3000/auth/forgot-password', { email });
      setMessage(res.data.message || 'Code sent. Check your email.');
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to request code');
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setMessage('');
      const res = await axios.post('http://localhost:3000/auth/reset-password', { email, code, newPassword });
      alert(res.data.message);
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reset password');
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10vh' }}>
      <div className="glass-card fade-enter-active" style={{ maxWidth: '400px', width: '100%' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '2rem' }}>{t('forgotPassword')}</h2>
        
        {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem', background: 'rgba(225,45,57,0.1)', padding: '0.75rem', borderRadius: '8px' }}>{error}</div>}
        {message && <div style={{ color: 'var(--success)', marginBottom: '1rem', background: 'rgba(62,171,214,0.1)', padding: '0.75rem', borderRadius: '8px' }}>{message}</div>}

        {step === 1 ? (
          <form onSubmit={handleRequestCode}>
            <div className="form-group">
              <label className="form-label">{t('emailAddress')}</label>
              <input type="email" required className="input-field" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <button type="submit" className="btn-primary" style={{ width: '100%' }}>{t('sendCode')}</button>
            <Link to="/login" style={{ display: 'block', textAlign: 'center', marginTop: '1rem', color: 'var(--text-secondary)', fontSize: '0.9rem', textDecoration: 'none' }}>{t('backToLogin')}</Link>
          </form>
        ) : (
          <form onSubmit={handleResetPassword}>
            <div className="form-group">
              <label className="form-label">Verification Code</label>
              <input required className="input-field" placeholder="6-digit code" value={code} onChange={e => setCode(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('newPassword')}</label>
              <input type="password" required className="input-field" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            </div>
            <button type="submit" className="btn-primary" style={{ width: '100%' }}>{t('verifyCode')}</button>
          </form>
        )}
      </div>
    </div>
  );
}
