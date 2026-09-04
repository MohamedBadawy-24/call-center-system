import React, { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogIn, Mail, Lock, ShieldCheck } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { UIContext } from '../context/UIContext';
import { api } from '../api/client';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { login } = useContext(AuthContext);
  const { t } = useContext(UIContext);
  const [hasUsers, setHasUsers] = useState(true);

  useEffect(() => {
    api.get('/auth/has-users')
      .then(res => {
        setHasUsers(res.data.hasUsers);
        console.log('hasUsers response:', res.data.hasUsers);
      })
      .catch(err => console.error('Failed to check users:', err));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 25, scale: 0.98 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.45,
        ease: [0.16, 1, 0.3, 1],
        staggerChildren: 0.1,
        delayChildren: 0.08
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.35,
        ease: [0.16, 1, 0.3, 1]
      }
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
      <motion.div 
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        className="glass-card" 
        style={{ width: '100%', maxWidth: '420px', padding: '3rem' }}
      >
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          className="w-full flex flex-col items-center justify-center text-center mb-6"
        >
          <img 
            src="/logo.png" 
            alt="Baseera" 
            className="w-48 sm:w-64 h-auto object-contain dark:drop-shadow-[0_0_15px_rgba(255,255,255,0.6)]" 
          />
        </motion.div>
        <h1 className="sr-only">Login</h1>
        <p className="text-center w-full" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 600, marginBottom: '2rem' }}>{t('welcomeBack')}</p>

        {error && (
          <motion.div 
            role="alert"
            data-testid="login-error-message"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            style={{ 
              background: 'hsla(0, 85%, 60%, 0.1)', 
              color: 'var(--danger)', 
              padding: '1rem', 
              borderRadius: '12px', 
              marginBottom: '1.5rem',
              fontSize: '0.85rem',
              fontWeight: 700,
              border: '1px solid hsla(0, 85%, 60%, 0.2)'
            }}
          >
            {error}
          </motion.div>
        )}

        <form onSubmit={handleSubmit}>
          <motion.div variants={itemVariants} className="form-group">
            <label className="form-label">{t('emailAddress')}</label>
            <div className="input-wrapper focus-within:ring-2 transition-all duration-200" style={{ position: 'relative', borderRadius: 'var(--radius-md)' }}>
              <Mail size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
              <input 
                type="email" 
                data-testid="baseera-email-input"
                className="input-field" 
                style={{ paddingLeft: '3rem' }}
                placeholder="name@company.com"
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                required 
              />
            </div>
          </motion.div>
          
          <motion.div variants={itemVariants} className="form-group" style={{ marginBottom: '2.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <label className="form-label" style={{ marginBottom: 0 }}>{t('password')}</label>
              <Link to="/forgot-password" style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', textDecoration: 'none' }}>
                {t('forgotPassword')}
              </Link>
            </div>
            <div className="input-wrapper focus-within:ring-2 transition-all duration-200" style={{ position: 'relative', borderRadius: 'var(--radius-md)' }}>
              <Lock size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
              <input 
                type="password" 
                data-testid="baseera-password-input"
                className="input-field" 
                style={{ paddingLeft: '3rem' }}
                placeholder="••••••••"
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required 
              />
            </div>
          </motion.div>

          <motion.div variants={itemVariants}>
            <button 
              type="submit" 
              data-testid="baseera-login-button"
              className="btn-primary transition-all duration-200 active:scale-95 hover:brightness-110" 
              style={{ width: '100%', padding: '1rem', marginBottom: !hasUsers ? '1rem' : '0' }}
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="spinner" style={{ width: '20px', height: '20px', borderWidth: '2px' }}></div>
              ) : (
                <><LogIn size={20} /> {t('signIn')}</>
              )}
            </button>
          </motion.div>
          
          {!hasUsers && (
            <motion.div variants={itemVariants} style={{ marginTop: '1rem' }}>
              <Link to="/register" style={{ display: 'block', textAlign: 'center', color: 'var(--primary)', fontWeight: 'bold', textDecoration: 'none' }}>
                {t('createInitialAdmin')}
              </Link>
            </motion.div>
          )}
        </form>
      </motion.div>
    </div>
  );
}
