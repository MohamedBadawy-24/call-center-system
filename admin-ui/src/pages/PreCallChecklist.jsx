import React, { useCallback, useContext, useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { motion } from 'framer-motion';
import { CheckCircle2, ClipboardList, Phone, User, Hash, CalendarClock, Loader2, UserPlus } from 'lucide-react';

import { UIContext } from '../context/UIContext';
import { AuthContext } from '../context/AuthContext';
import {
  normalizeOutboundPrecall,
  metaLine,
  isFieldVisible,
  validateOutboundAnswers,
  buildInitialAnswers,
  precallNextValidation,
  precallNewFormValidation,
} from '../utils/outboundPrecallConfig';
import HandoverModal from '../components/HandoverModal';

function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatLocalTime(d) {
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function renderFieldInput(field, value, onChange, tick, t, forceReadOnly = false) {
  const isReadOnly = forceReadOnly || field.id === 'phone';
  const label = field.label || field.id;

  switch (field.type) {
    case 'readonly_date':
      return (
        <div className="precall-field" key={field.id}>
          <label className="precall-label">{label}</label>
          <input className="input-field" value={formatLocalDate(tick)} readOnly />
        </div>
      );
    case 'readonly_time':
      return (
        <div className="precall-field" key={field.id}>
          <label className="precall-label">{label}</label>
          <input className="input-field" value={formatLocalTime(tick)} readOnly />
        </div>
      );
    case 'text':
      return (
        <div className="precall-field" key={field.id}>
          <label className="precall-label">{label}</label>
          <input
            className="input-field"
            value={value ?? ''}
            onChange={(e) => onChange(field.id, e.target.value)}
            placeholder={field.placeholder || ''}
            readOnly={isReadOnly}
          />
        </div>
      );
    case 'number':
      return (
        <div className="precall-field" key={field.id}>
          <label className="precall-label">{label}</label>
          <input
            className="input-field"
            type="number"
            min={field.min != null ? field.min : undefined}
            value={value ?? ''}
            onChange={(e) => onChange(field.id, e.target.value)}
            readOnly={isReadOnly}
          />
        </div>
      );
    case 'segment':
      return (
        <div className="precall-field" key={field.id}>
          <label className="precall-label">{label}</label>
          <div className="precall-seg">
            {(field.options || []).map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`precall-seg-btn ${String(value) === String(opt.value) ? 'active' : ''}`}
                onClick={() => !isReadOnly && onChange(field.id, opt.value)}
                disabled={isReadOnly}
              >
                {opt.label || opt.value}
              </button>
            ))}
          </div>
        </div>
      );
    case 'select':
      return (
        <div className="precall-field" key={field.id}>
          <label className="precall-label">{label}</label>
          <select
            className="input-field"
            value={value ?? ''}
            onChange={(e) => onChange(field.id, e.target.value)}
            disabled={isReadOnly}
          >
            <option value="">{t('precallSelectPlaceholder')}</option>
            {(field.options || []).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label || opt.value}
              </option>
            ))}
          </select>
        </div>
      );
    default:
      return null;
  }
}

export default function PreCallChecklist() {
  const { t } = useContext(UIContext);
  const { user, setUser } = useContext(AuthContext);
  const navigate = useNavigate();

const [surveyId, setSurveyId] = useState(null);
  const [config, setConfig] = useState(() => normalizeOutboundPrecall(null));
  const [answers, setAnswers] = useState(() => buildInitialAnswers(normalizeOutboundPrecall(null).fields, user?.name));
  const [currentNumber, setCurrentNumber] = useState(null);
  const [numberLoading, setNumberLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  const [formsCount, setFormsCount] = useState(null);

  const draftKey = useMemo(() => {
    if (!user?.id) return null;
    return `precallDraft:${user.id}:${surveyId || 'default'}`;
  }, [user?.id, surveyId]);

  const [tick, setTick] = useState(() => new Date());
  const [submitting, setSubmitting] = useState(false);
  const [serialSearchTerm, setSerialSearchTerm] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const editAnswersRef = useRef(null);
  const [isHandoverOpen, setIsHandoverOpen] = useState(false);

  const handleSerialSearch = async (e) => {
    if (e) e.preventDefault();
    if (!serialSearchTerm.trim()) return;
    setSearchLoading(true);
    try {
      const res = await api.get(`/agent/search-serial/${serialSearchTerm.trim()}`);
      if (res.data) {
        const { phoneNumber, answers: savedAnswers, surveyId: sid, isEditMode: editMode } = res.data;
        if (sid) setSurveyId(sid);
        if (phoneNumber) setCurrentNumber(phoneNumber);
        setIsEditMode(!!editMode);

        if (savedAnswers) {
          setAnswers(prev => {
            const newAns = { ...prev, ...savedAnswers };
            editAnswersRef.current = newAns;
            return newAns;
          });
        }

        
        // If we found a phone number, update the answer field
        if (phoneNumber?.number) {
            setAnswers(prev => {
              const newAns = { ...prev, phone: phoneNumber.number };
              editAnswersRef.current = newAns;
              return newAns;
            });
        }
        if (phoneNumber?.serialNumber) {
            setAnswers(prev => {
              const newAns = { ...prev, serial_number: phoneNumber.serialNumber };
              editAnswersRef.current = newAns;
              return newAns;
            });
        }
        
        alert(t('serialFound') || 'Form found and loaded.');
      } else {
        alert(t('serialNotFound') || 'Serial number not found.');
      }
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Search failed');
    } finally {
      setSearchLoading(false);
    }
  };

  useEffect(() => {
    const id = setInterval(() => setTick(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let cancelled = false;
    (async () => {
      setConfigLoading(true);
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const sidUrl = urlParams.get('surveyId');
        
        const [precallRes, numberRes] = await Promise.all([
          api.get(`/agent/outbound-precall${sidUrl ? `?surveyId=${sidUrl}` : ''}`, { signal }),
          // ONLY fetch next number if we aren't already in an edit/search state
          (isEditMode || editAnswersRef.current) 
            ? Promise.resolve({ data: { number: editAnswersRef.current?.phone || currentNumber?.number, serialNumber: editAnswersRef.current?.serial_number || currentNumber?.serialNumber } }) 
            : api.get(`/agent/next-number${sidUrl ? `?surveyId=${sidUrl}` : ''}`, { signal })
        ]);
        if (cancelled) return;
        setSurveyId(precallRes.data.surveyId || null);
        const norm = normalizeOutboundPrecall(precallRes.data.outboundPrecall);
        setConfig(norm);
        const nextNum = numberRes.data;
        setCurrentNumber(nextNum);
        const initial = buildInitialAnswers(norm.fields, user?.name);
        
        let merged = initial;
        if (nextNum && nextNum.number) {
            merged.phone = nextNum.number;
        }
        if (nextNum && nextNum.serialNumber) {
            merged.serial_number = nextNum.serialNumber;
        }
        // Don't reset edit mode if we were already editing (e.g. on a search-triggered re-fetch)
        if (!isEditMode) setIsEditMode(false);

        // If we are actively editing an existing form, use the loaded answers instead of the draft
        if (editAnswersRef.current) {
          merged = { ...merged, ...editAnswersRef.current };
        } else if (draftKey) {
          try {
            const raw = sessionStorage.getItem(draftKey);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && typeof parsed === 'object') {
                merged = { ...merged, ...parsed };
                // ONLY enforce the actively fetched phone number if the draft is empty or for a DIFFERENT number
                if (nextNum && nextNum.number && (!merged.phone || merged.phone !== nextNum.number)) {
                    merged.phone = nextNum.number; 
                }
              }
            }
          } catch (_) {
            /* ignore bad draft */
          }
        }
        setAnswers(merged);
        try {
          const cr = await api.get('/agent/precall-session-count', { signal });
          if (!cancelled && typeof cr.data?.count === 'number') setFormsCount(cr.data.count);
        } catch (_) {
          if (!cancelled) setFormsCount(0);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          const norm = normalizeOutboundPrecall(null);
          setConfig(norm);
          setAnswers(buildInitialAnswers(norm.fields, user?.name));
        }
      } finally {
        if (!cancelled) setConfigLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.name, draftKey]);

  useEffect(() => {
    if (currentNumber && currentNumber.number) {
      setAnswers(prev => ({
        ...prev,
        phone: currentNumber.number
      }));
    }
  }, [currentNumber]);

  useEffect(() => {
    if (!draftKey || configLoading) return;
    const t = setTimeout(() => {
      try {
        sessionStorage.setItem(draftKey, JSON.stringify(answers));
      } catch (_) {
        /* quota / private mode */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [answers, draftKey, configLoading]);

  const setAnswer = useCallback((id, val) => {
    setAnswers((prev) => ({ ...prev, [id]: val }));
  }, []);

  const scriptText = useMemo(() => {
    const raw = metaLine(config.meta, 'script', t);
    const name = (answers.researcher_name || user?.name || '').trim();
    return raw.split('{{name}}').join(name || '…');
  }, [answers.researcher_name, config.meta, t, user?.name]);

  const interviewDateStr = formatLocalDate(tick);
  const interviewTimeStr = formatLocalTime(tick);

  const canProceed = useMemo(() => {
    return precallNextValidation(config.fields, answers);
  }, [answers, config.fields]);

  // New Form: ALL required fields (incl. interview_result) must be filled
  const canSaveNew = useMemo(() => {
    return precallNewFormValidation(config.fields, answers);
  }, [answers, config.fields]);

  const completePrecallSubmission = async () => {
    const frozen = new Date();
    const payload = { ...answers };
    config.fields.forEach((f) => {
      if (f.type === 'readonly_date') payload[f.id] = formatLocalDate(frozen);
      if (f.type === 'readonly_time') payload[f.id] = formatLocalTime(frozen);
    });
    await api.post('/agent/precall-complete', {
      surveyId,
      payload,
      interviewStartedAt: frozen.toISOString(),
      interviewDate: formatLocalDate(frozen),
      interviewStartDisplay: formatLocalTime(frozen),
    });
    // ONLY refresh user if NOT in edit mode (to avoid breaking the local edit state)
    if (!isEditMode) {
      const me = await api.get('/auth/me');
      setUser(me.data.user);
      localStorage.setItem('user', JSON.stringify(me.data.user));
    }
  };

  const refreshFormsCount = async () => {
    try {
      const cr = await api.get('/agent/precall-session-count');
      if (typeof cr.data?.count === 'number') setFormsCount(cr.data.count);
    } catch (_) {
      /* keep previous */
    }
  };

  const onNext = async () => {
    if (!user?.id || !canProceed) return;
    setSubmitting(true);
    try {
      await completePrecallSubmission();
      // Keep draft so "Back to call checklist" restores the same fields for editing; cleared on New form.
      if (draftKey) {
        try {
          sessionStorage.setItem(draftKey, JSON.stringify(answers));
        } catch (_) {
          /* quota */
        }
      }
      await refreshFormsCount();
      if (isEditMode && surveyId) {
        navigate(`/take-survey/${surveyId}?serial=${answers.serial_number}`, { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch (e) {
      console.error(e);
      alert(e.response?.data?.error || e.message || 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  };

  const onNewForm = async () => {
    if (!user?.id || !canSaveNew) {
      alert('Please fill in all required fields including the Interview outcome before saving.');
      return;
    }
    setSubmitting(true);
    try {
      await completePrecallSubmission();
      if (draftKey) sessionStorage.removeItem(draftKey);
      setAnswers(buildInitialAnswers(config.fields, user?.name));
      setTick(new Date());
      
      setNumberLoading(true);
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const sidUrl = urlParams.get('surveyId');
        const nextNumRes = await api.get(`/agent/next-number${sidUrl ? `?surveyId=${sidUrl}` : ''}`);
        const nextNum = nextNumRes.data;
        setCurrentNumber(nextNum);
        if (nextNum && nextNum.number) {
          setAnswers(prev => ({ ...prev, phone: nextNum.number }));
        }
        if (nextNum && nextNum.serialNumber) {
          setAnswers(prev => ({ ...prev, serial_number: nextNum.serialNumber }));
        }
        setIsEditMode(false);
      } catch (e) {
        console.error("Failed to load next number:", e);
      } finally {
        setNumberLoading(false);
      }

      await refreshFormsCount();
    } catch (e) {
      console.error(e);
      alert(e.response?.data?.error || e.message || 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  };

  const hintText = useMemo(() => {
    if (canProceed) return ''; // Next is unlocked — no hint needed
    const callResult = answers.call_result;
    if (!callResult) return 'Select the call outcome to continue.';
    if (String(callResult) !== 'contacted') {
      // Non-contacted: guide agent to fill interview_result and use New Form
      if (!canSaveNew) return 'Fill in the Interview outcome, then click "New Form" to log this call and get the next number.';
      return 'Click "New Form" to save this result and get the next number.';
    }
    // Contacted but something else is missing
    return (config.meta.completeHint && config.meta.completeHint.trim()) || t('precallCompleteHint');
  }, [canProceed, canSaveNew, answers.call_result, config.meta, t]);

  const sectionOrder = config.sectionOrder || ['agent', 'call', 'phone'];

  if (configLoading) {
    return (
      <div className="precall-shell" style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}>
        <Loader2 className="spin-icon" size={40} color="var(--primary)" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="precall-shell"
    >
      <div className="precall-hero glass-card">
        <div className="precall-hero-top">
        <div className="precall-hero-title">
            <ClipboardList size={26} color="var(--primary)" />
            <div>
              <h1 style={{ margin: 0, fontSize: '1.35rem', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {metaLine(config.meta, 'title', t)}
                {numberLoading && <Loader2 size={16} className="spin-icon ml-2" />}
              </h1>
              <p className="precall-subtitle">{metaLine(config.meta, 'subtitle', t)}</p>
            </div>
          </div>
          <div className="precall-pill" style={{ display: 'flex', gap: '1rem', background: 'transparent', border: 'none', padding: 0 }}>
            {answers.serial_number && (
              <button 
                type="button" 
                className="btn-secondary" 
                style={{ height: '40px', gap: '0.5rem', borderColor: 'var(--primary)', color: 'var(--primary)' }}
                onClick={() => setIsHandoverOpen(true)}
              >
                <UserPlus size={16} />
                {t('handover') || 'Handover'}
              </button>
            )}
            
            <form onSubmit={handleSerialSearch} style={{ display: 'flex', gap: '0.5rem' }}>
              <div style={{ position: 'relative' }}>
                <Hash size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder={t('searchBySerial') || "Search Serial..."} 
                  style={{ paddingLeft: '35px', height: '40px', fontSize: '0.9rem', width: '160px' }}
                  value={serialSearchTerm}
                  onChange={(e) => setSerialSearchTerm(e.target.value)}
                />
              </div>
              <button type="submit" className="btn-secondary" style={{ height: '40px', padding: '0 1rem' }} disabled={searchLoading}>
                {searchLoading ? <Loader2 size={16} className="spin-icon" /> : <Hash size={16} />}
              </button>
            </form>

            <div className="precall-pill">
              <CalendarClock size={16} />
              <span style={{ fontWeight: 900 }}>{interviewDateStr}</span>
              <span style={{ opacity: 0.65, fontWeight: 800 }}>•</span>
              <span style={{ fontWeight: 900 }}>{interviewTimeStr}</span>
            </div>
          </div>
        </div>

        <div className="precall-script">
          <div className="precall-script-label">{metaLine(config.meta, 'scriptLabel', t)}</div>
          <div className="precall-script-text">{scriptText}</div>
        </div>
      </div>

      <div className="precall-grid">
        {sectionOrder.map((sec) => {
          const sectionFields = config.fields.filter((f) => f.section === sec);
          if (sectionFields.length === 0) return null;

          const titleKey =
            sec === 'agent' ? 'sectionAgent' : sec === 'call' ? 'sectionCall' : 'sectionPhone';
          const Icon = sec === 'agent' ? User : sec === 'call' ? ClipboardList : Phone;

          return (
            <section key={sec} className="glass-card precall-card">
              <div className="precall-section-title">
                <Icon size={18} color="var(--primary)" />
                <span>{metaLine(config.meta, titleKey, t)}</span>
              </div>
              {sectionFields.map((field) => {
                if (!isFieldVisible(field, answers)) return null;
                const v = answers[field.id];
                // Phone number and Serial number are strictly read-only
                const isFieldReadOnly = (field.id === 'phone' || field.id === 'serial_number');
                return renderFieldInput(field, v, setAnswer, tick, t, isFieldReadOnly);
              })}
            </section>
          );
        })}
      </div>

      {/* Contextual hints: show relevant guidance based on call outcome */}
      {(!canProceed || !canSaveNew) && hintText && (
        <div className="precall-hint" style={{ marginTop: '0.5rem' }}>
          <Hash size={16} />
          <span>{hintText}</span>
        </div>
      )}
      {/* When call is NOT contacted: clarify New Form is the right action */}
      {!canProceed && answers.call_result && String(answers.call_result) !== 'contacted' && canSaveNew && (
        <div className="precall-hint" style={{ marginTop: '0.25rem', borderColor: 'hsla(160, 70%, 40%, 0.4)', background: 'hsla(160, 70%, 40%, 0.06)' }}>
          <CheckCircle2 size={16} color="var(--success, #10b981)" />
          <span style={{ color: 'var(--success, #10b981)' }}>
            All required info is logged. Click <strong>New Form</strong> to save and get the next number.
          </span>
        </div>
      )}

      <div className="precall-footer glass-card">
        <div className="precall-footer-left">
          <span className="precall-footer-label">{metaLine(config.meta, 'formsCountLabel', t)}</span>
          <span className="precall-footer-value">{formsCount != null ? formsCount : '—'}</span>
        </div>

        <div className="precall-footer-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={onNewForm}
            disabled={submitting || !canSaveNew}
            title={!canSaveNew ? 'Fill all required fields (including Interview outcome) to save and get the next number' : 'Save result and get next number'}
          >
            {metaLine(config.meta, 'newFormLabel', t)}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!canProceed || submitting}
            onClick={onNext}
            style={{ minWidth: '160px' }}
            title={!canProceed ? 'Call outcome must be "Contacted" and all fields (except Interview outcome) must be filled' : 'Proceed to the survey questionnaire'}
          >
            {submitting ? <Loader2 size={18} className="spin-icon" /> : <CheckCircle2 size={18} />}
            {isEditMode ? (t('editForm') || 'Edit Form') : t('next')}
          </button>
        </div>
      </div>

      <HandoverModal 
        isOpen={isHandoverOpen} 
        onClose={() => setIsHandoverOpen(false)}
        serialNumber={answers.serial_number}
        onSuccess={() => navigate('/', { replace: true })}
      />
    </motion.div>
  );
}
