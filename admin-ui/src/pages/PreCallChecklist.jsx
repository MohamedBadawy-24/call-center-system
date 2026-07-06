import React, { useCallback, useContext, useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, ClipboardList, Phone, User, Hash, CalendarClock, Loader2, UserPlus, Check, AlertTriangle, X } from 'lucide-react';

import { UIContext } from '../context/UIContext';
import { AuthContext } from '../context/AuthContext';
import { offlineDb } from '../utils/offlineDb';
import {
  normalizeOutboundPrecall,
  metaLine,
  isFieldVisible,
  isFieldSatisfied,
  buildInitialAnswers,
  precallNextValidation,
  precallNewFormValidation,
  evaluateCondition,
} from '../utils/outboundPrecallConfig';
import { EGYPTIAN_GOVERNORATES } from '../utils/governorates';
import HandoverModal from '../components/HandoverModal';
import { toast } from 'react-toastify';

/*
 * ─── STRUCTURE MAP (Step 1 audit) ────────────────────────────────────────────
 *
 * SECTIONS (from sectionOrder: ['agent', 'call', 'phone'])
 * ─────────────────────────────────────────────────────────
 * Section 0 — 'agent'  (titleKey: precallSectionAgent)
 *   Fields: researcher_name (text, req), researcher_code (text, req),
 *           serial_number (number, req), interview_date (readonly_date),
 *           interview_time (readonly_time), is_egyptian (segment, req),
 *           nationality (text, conditional on is_egyptian==no),
 *           age_years (number, req)
 *
 * Section 1 — 'call'   (titleKey: precallSectionCall)
 *   Fields: phone_type (segment, req), call_result (select, req),
 *           interview_result (select, req),
 *           outcome_reason (text, conditional on interview_result in partial/refused/postponed)
 *
 * Section 2 — 'phone'  (titleKey: precallSectionPhone)
 *   Fields: phone (text, req) + governorate picker + fetch-number button (custom UI)
 *
 * STATE VARIABLES (existing)
 * ─────────────────────────
 * - answers         : object keyed by field.id — all field values
 * - config          : normalizedPrecall (fields, meta, sectionOrder)
 * - currentNumber   : { number, serialNumber } | null
 * - selectedGov     : governorate filter string
 * - isEditMode      : boolean — editing an existing submission
 * - canProceed      : bool memo — gating "Next" button
 * - canSaveNew      : bool memo — gating "New Form" button
 *
 * NEW STATE VARIABLES
 * ──────────────────────
 * - showErrors          : bool — set true when agent clicks Next with validation failures
 *
 * COMPUTED (render-derived)
 * ──────────────────────────
 * - sectionStates       : { [secKey]: 'filled' | 'partially-filled' | 'empty' } — drives progress bar
 *
 * SUBMIT HANDLERS (unchanged locations)
 * ───────────────────────────────────────
 * - onNext()        : calls completePrecallSubmission() → navigates to survey
 * - onNewForm()     : calls completePrecallSubmission() → resets form → fetches next number
 *
 * LOGIC EVALUATION (unchanged)
 * ─────────────────────────────
 * - isFieldVisible(field, answers) — skip/hide logic via visibleWhen conditions
 * - isFieldSatisfied(field, value) — per-field validation
 * - validateOutboundAnswers(fields, answers) — full-form validation
 * - precallNextValidation / precallNewFormValidation — button gate memos
 *
 * FULL-WIDTH FIELDS (span both grid columns)
 * ────────────────────────────────────────────
 * segment types with ≥3 options, select fields, conditional text fields,
 * interview_date, interview_time (readonly), serial_number (prominent)
 * → determined by `isFullWidthField(field)` helper below
 * ─────────────────────────────────────────────────────────────────────────────
 */

function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatLocalTime(d) {
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Decide whether a field should span both grid columns. */
function isFullWidthField(field) {
  if (field.type === 'readonly_date' || field.type === 'readonly_time') return false;
  if (field.type === 'select') return true;
  if (field.type === 'segment' && (field.options || []).length >= 3) return true;
  // Fields that are conditionally visible (notes/reason, or logic-gated) go full width too
  if (field.visibleWhen || field.logic) return true;
  return false;
}

function renderFieldInput(field, value, onChange, tick, t, forceReadOnly = false, errorText = null) {
  const isReadOnly = forceReadOnly || field.id === 'phone';
  const label = field.label || field.id;
  const hasError = !!errorText;

  // Helper: is the current value the "Other" free-text mode?
  const isOtherSelected = typeof value === 'string' && value.startsWith('other:');
  const otherText = isOtherSelected ? value.slice(6) : '';

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
          <label className="precall-label" style={isReadOnly ? { display: 'flex', alignItems: 'center', gap: '0.35rem' } : undefined}>
            {label}
            {isReadOnly && <span style={{ fontSize: '0.7rem', background: 'var(--primary-low)', color: 'var(--primary)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 700 }}>AUTO</span>}
          </label>
          <input
            className={`input-field ${hasError ? 'has-error' : ''}`}
            data-testid={`precall-${field.id}-input`}
            value={value ?? ''}
            onChange={(e) => onChange(field.id, e.target.value)}
            placeholder={field.placeholder || ''}
            readOnly={isReadOnly}
            style={isReadOnly ? { background: 'var(--surface-2)', opacity: 0.85, cursor: 'default', pointerEvents: 'none' } : undefined}
            tabIndex={isReadOnly ? -1 : undefined}
          />
          {errorText && (
            <span style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '0.25rem', display: 'block' }}>
              {errorText}
            </span>
          )}
        </div>
      );
    case 'number':
      return (
        <div className="precall-field" key={field.id}>
          <label className="precall-label">{label}</label>
          <input
            className={`input-field ${hasError ? 'has-error' : ''}`}
            data-testid={`precall-${field.id}-input`}
            type="number"
            min={field.min != null ? field.min : undefined}
            value={value ?? ''}
            onChange={(e) => onChange(field.id, e.target.value)}
            readOnly={isReadOnly}
          />
          {errorText && (
            <span style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '0.25rem', display: 'block' }}>
              {errorText}
            </span>
          )}
        </div>
      );
    case 'segment': {
      const segOtherActive = isOtherSelected;
      const segValue = segOtherActive ? '__other__' : String(value ?? '');
      return (
        <div className="precall-field" key={field.id}>
          <label className="precall-label">{label}</label>
          <div className="precall-seg">
            {(field.options || []).map((opt) => (
              <button
                key={opt.value}
                type="button"
                data-testid={`precall-${field.id}-btn-${opt.value}`}
                className={`precall-seg-btn ${segValue === String(opt.value) ? 'active' : ''} ${hasError ? 'has-error' : ''}`}
                onClick={() => !isReadOnly && onChange(field.id, opt.value)}
                disabled={isReadOnly}
              >
                {opt.label || opt.value}
              </button>
            ))}
            {field.allowOther && (
              <button
                type="button"
                data-testid={`precall-${field.id}-btn-other`}
                className={`precall-seg-btn ${segOtherActive ? 'active' : ''} ${hasError ? 'has-error' : ''}`}
                onClick={() => !isReadOnly && onChange(field.id, segOtherActive ? '' : 'other:')}
                disabled={isReadOnly}
              >
                {t('other') || 'Other'}
              </button>
            )}
          </div>
          {segOtherActive && (
            <input
              className={`input-field ${hasError ? 'has-error' : ''}`}
              data-testid={`precall-${field.id}-other-input`}
              style={{ marginTop: '0.5rem' }}
              placeholder={t('otherPlaceholder') || 'Please specify…'}
              value={otherText}
              onChange={(e) => !isReadOnly && onChange(field.id, `other:${e.target.value}`)}
              readOnly={isReadOnly}
              autoFocus
            />
          )}
          {errorText && (
            <span style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '0.25rem', display: 'block' }}>
              {errorText}
            </span>
          )}
        </div>
      );
    }
    case 'select': {
      const selValue = isOtherSelected ? '__other__' : (value ?? '');
      return (
        <div className="precall-field" key={field.id}>
          <label className="precall-label">{label}</label>
          <select
            className={`input-field ${hasError ? 'has-error' : ''}`}
            data-testid={`precall-${field.id}-select`}
            value={selValue}
            onChange={(e) => {
              if (e.target.value === '__other__') {
                onChange(field.id, 'other:');
              } else {
                onChange(field.id, e.target.value);
              }
            }}
            disabled={isReadOnly}
          >
            <option value="">{t('precallSelectPlaceholder')}</option>
            {(field.options || []).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label || opt.value}
              </option>
            ))}
            {field.allowOther && (
              <option value="__other__">{t('other') || 'Other'}</option>
            )}
          </select>
          {isOtherSelected && (
            <input
              className={`input-field ${hasError ? 'has-error' : ''}`}
              data-testid={`precall-${field.id}-other-input`}
              style={{ marginTop: '0.5rem' }}
              placeholder={t('otherPlaceholder') || 'Please specify…'}
              value={otherText}
              onChange={(e) => !isReadOnly && onChange(field.id, `other:${e.target.value}`)}
              readOnly={isReadOnly}
              autoFocus
            />
          )}
          {errorText && (
            <span style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '0.25rem', display: 'block' }}>
              {errorText}
            </span>
          )}
        </div>
      );
    }
    default:
      return null;
  }
}

export default function PreCallChecklist() {
  const { t, isOnline } = useContext(UIContext);
  const { user, setUser } = useContext(AuthContext);
  const navigate = useNavigate();

  const [surveyId, setSurveyId] = useState(null);
  const [numberAssignmentMode, setNumberAssignmentMode] = useState('queue_only');
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualNumber, setManualNumber] = useState('');
  const [manualSaving, setManualSaving] = useState(false);
  const [config, setConfig] = useState(() => normalizeOutboundPrecall(null));
  const [answers, setAnswers] = useState(() => buildInitialAnswers(normalizeOutboundPrecall(null).fields, user?.name, user?.researcherCode));
  const [currentNumber, setCurrentNumber] = useState(null);
  const [numberLoading, setNumberLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  const [formsCount, setFormsCount] = useState(null);

  const [showErrors, setShowErrors] = useState(false);

  // ── Terminate-call detection ──────────────────────────────────────────────
  // Derived: which fields have logic.action=terminate_call AND whose condition
  // is currently matched (meaning the call must be stopped).
  const terminateCallField = useMemo(() => {
    if (!config?.fields) return null;
    for (const f of config.fields) {
      if (f.logic && f.logic.action === 'terminate_call') {
        const matched = evaluateCondition(f.logic, answers);
        if (matched) return f;
      }
    }
    return null;
  }, [config.fields, answers]);

  const isTerminated = !!terminateCallField;

  const draftKey = useMemo(() => {
    if (!user?.id) return null;
    return `precallDraft:${user.id}:${surveyId || 'default'}`;
  }, [user?.id, surveyId]);

  const [tick, setTick] = useState(() => new Date());
  const [submitting, setSubmitting] = useState(false);
  const [serialSearchTerm, setSerialSearchTerm] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedGov, setSelectedGov] = useState('All');
  const [targetGovernorate, setTargetGovernorate] = useState('All');
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
        setShowErrors(false);

        if (savedAnswers) {
          setAnswers(prev => {
            const newAns = { ...prev, ...savedAnswers };
            editAnswersRef.current = newAns;
            return newAns;
          });
        }

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

        toast.success(t('serialFound') || 'Form found and loaded.');
      } else {
        toast.error(t('serialNotFound') || 'Serial number not found.');
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Search failed');
    } finally {
      setSearchLoading(false);
    }
  };

  useEffect(() => {
    const id = setInterval(() => setTick(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (answers.phone && !submitting) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [answers.phone, submitting]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let cancelled = false;
    (async () => {
      setConfigLoading(true);
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const sidUrl = urlParams.get('surveyId');

        let precallData = null;
        if (isOnline) {
          try {
            const res = await api.get(`/agent/outbound-precall${sidUrl ? `?surveyId=${sidUrl}` : ''}`, { signal });
            precallData = res.data;
            await offlineDb.savePrecallConfig({
              surveyId: sidUrl || 'global',
              outboundPrecall: precallData.outboundPrecall,
              targetGovernorate: precallData.targetGovernorate,
              numberAssignmentMode: precallData.numberAssignmentMode || 'queue_only',
            });
          } catch (err) {
            console.error("Network outbound precall fetch failed, trying offline fallback...", err);
          }
        }

        if (!precallData) {
          const cachedConfig = await offlineDb.getPrecallConfig(sidUrl);
          if (cachedConfig) {
            precallData = {
              surveyId: cachedConfig.surveyId === 'global' ? null : cachedConfig.surveyId,
              outboundPrecall: cachedConfig.outboundPrecall,
              targetGovernorate: cachedConfig.targetGovernorate,
              numberAssignmentMode: cachedConfig.numberAssignmentMode || 'queue_only',
            };
          }
        }

        if (!precallData) {
          precallData = { surveyId: sidUrl, outboundPrecall: null, targetGovernorate: 'All', numberAssignmentMode: 'queue_only' };
        }

        const [numberRes] = await Promise.all([
          (isEditMode || editAnswersRef.current)
            ? Promise.resolve({ data: { number: editAnswersRef.current?.phone || currentNumber?.number, serialNumber: editAnswersRef.current?.serial_number || currentNumber?.serialNumber } })
            : Promise.resolve({ data: null })
        ]);
        if (cancelled) return;
        setSurveyId(precallData.surveyId || null);
        setNumberAssignmentMode(precallData.numberAssignmentMode || 'queue_only');

        const tg = precallData.targetGovernorate || 'All';
        setTargetGovernorate(tg);
        setSelectedGov(tg);

        const norm = normalizeOutboundPrecall(precallData.outboundPrecall);
        setConfig(norm);
        const nextNum = numberRes.data;
        setCurrentNumber(nextNum);
        const initial = buildInitialAnswers(norm.fields, user?.name, user?.researcherCode);

        let merged = initial;
        if (nextNum && nextNum.number) merged.phone = nextNum.number;
        if (nextNum && nextNum.serialNumber) merged.serial_number = nextNum.serialNumber;
        if (!isEditMode) setIsEditMode(false);

        if (editAnswersRef.current) {
          merged = { ...merged, ...editAnswersRef.current };
        } else if (draftKey) {
          try {
            const raw = sessionStorage.getItem(draftKey);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && typeof parsed === 'object') {
                merged = { ...merged, ...parsed };
                if (nextNum && nextNum.number && (!merged.phone || merged.phone !== nextNum.number)) {
                  merged.phone = nextNum.number;
                }
              }
            }
          } catch (_) { /* ignore bad draft */ }
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
          setAnswers(buildInitialAnswers(norm.fields, user?.name, user?.researcherCode));
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
      setAnswers(prev => ({ ...prev, phone: currentNumber.number }));
    }
  }, [currentNumber]);

  useEffect(() => {
    if (!draftKey || configLoading) return;
    const timer = setTimeout(() => {
      try {
        sessionStorage.setItem(draftKey, JSON.stringify(answers));
      } catch (_) { /* quota / private mode */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [answers, draftKey, configLoading]);

  const setAnswer = useCallback((id, val) => {
    // Prevent client-side tampering of auto-filled agent identity fields
    if (id === 'researcher_name' || id === 'researcher_code') return;
    setAnswers((prev) => ({ ...prev, [id]: val }));
  }, []);

  // ── Auto-clear skipped/hidden fields ────────────────────────────────────
  // When a field's logic action causes it to be hidden/skipped, clear its
  // value so stale data is never submitted.
  useEffect(() => {
    if (!config?.fields) return;
    let changed = false;
    const updates = {};
    for (const f of config.fields) {
      if (!f.logic) continue;
      const act = f.logic.action;
      if (act !== 'skip' && act !== 'hide') continue;
      const matched = evaluateCondition(f.logic, answers);
      // For 'skip' and 'hide': field is hidden when condition matches
      if (matched && answers[f.id] !== undefined && answers[f.id] !== '') {
        updates[f.id] = '';
        changed = true;
      }
    }
    if (changed) {
      setAnswers((prev) => ({ ...prev, ...updates }));
    }
    // We intentionally only re-run when answers change (not listing config.fields
    // as it is stable for a session).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);

  // Trigger prefetching when online, when the user is an agent, and targetGovernorate changes or online status restores
  useEffect(() => {
    if (isOnline && user?.role === 'agent' && targetGovernorate && !configLoading) {
      console.log(`[Offline Inventory] Online status detected/restored or target governorate updated to '${targetGovernorate}'. Initiating prefetch...`);
      prefetchNumbers(targetGovernorate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, targetGovernorate, user?.role, configLoading]);

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

    const finalSerial = payload.serial_number || `OFFLINE-precall-${user?.id || 'agent'}-${Date.now()}`;
    payload.serial_number = finalSerial;

    const checklistData = {
      surveyId,
      serialNumber: finalSerial,
      payload,
      interviewStartedAt: frozen.toISOString(),
      interviewDate: formatLocalDate(frozen),
      interviewStartDisplay: formatLocalTime(frozen),
    };

    if (isOnline) {
      try {
        await api.post('/agent/precall-complete', checklistData);
      } catch (err) {
        console.error("Online precall submission failed, saving offline:", err);
        await offlineDb.saveOfflinePrecall(checklistData);
        toast.warning(t('savedOffline') || 'Pre-call checklist saved locally due to connection error.');
      }
    } else {
      await offlineDb.saveOfflinePrecall(checklistData);
      toast.info(t('savedOffline') || 'Checklist saved locally.');
    }

    if (!isEditMode) {
      const updatedUser = { ...user, precallCompletedForActiveSession: true };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
    }

    return finalSerial;
  };

  const refreshFormsCount = async () => {
    try {
      const cr = await api.get('/agent/precall-session-count');
      if (typeof cr.data?.count === 'number') setFormsCount(cr.data.count);
    } catch (_) { /* keep previous */ }
  };

  const onNext = async () => {
    if (!user?.id) return;
    if (isTerminated) {
      toast.error(t('precallTerminateCallBlock') || 'This call must be terminated. Please use "New Form" to log the result.');
      return;
    }
    if (!canProceed) {
      setShowErrors(true);
      toast.warning(t('precallCompleteHint') || 'Please fill in all required fields.');
      return;
    }
    setSubmitting(true);
    try {
      const finalSerial = await completePrecallSubmission();
      if (draftKey) {
        try { sessionStorage.setItem(draftKey, JSON.stringify({ ...answers, serial_number: finalSerial })); } catch (_) { /* quota */ }
      }
      await refreshFormsCount();
      if (surveyId) {
        navigate(`/take-survey/${surveyId}?serial=${finalSerial}`, { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch (e) {
      console.error(e);
      toast.error(e.response?.data?.error || e.message || 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  };

  const onNewForm = async () => {
    if (!user?.id || !canSaveNew) {
      toast.warning('Please fill in all required fields including the Interview outcome before saving.');
      return;
    }
    setSubmitting(true);
    try {
      await completePrecallSubmission();
      if (draftKey) sessionStorage.removeItem(draftKey);
      setAnswers(buildInitialAnswers(config.fields, user?.name, user?.researcherCode));
      setTick(new Date());

      // Clear error highlights on reset
      setShowErrors(false);

      setNumberLoading(true);
      try {
        setCurrentNumber(null);
        setAnswers(prev => ({ ...prev, phone: '', serial_number: '' }));
        setIsEditMode(false);
      } catch (e) {
        console.error('Failed to reset number:', e);
      } finally {
        setNumberLoading(false);
      }

      await refreshFormsCount();
    } catch (e) {
      console.error(e);
      toast.error(e.response?.data?.error || e.message || 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  };

  const prefetchNumbers = async (gov) => {
    if (!isOnline) return;
    try {
      const cached = await offlineDb.getCachedNumbers();
      const currentCount = cached.length;
      console.log(`[Offline Inventory] Current cached numbers inventory count: ${currentCount}`);
      if (currentCount >= 20) {
        console.log(`[Offline Inventory] Inventory already full (${currentCount}/20). Skipping prefetch.`);
        return;
      }

      const needed = 20 - currentCount;
      console.log(`[Offline Inventory] Prefetching ${needed} numbers for governorate '${gov || selectedGov}'...`);
      const urlParams = new URLSearchParams(window.location.search);
      const sidUrl = urlParams.get('surveyId');
      
      let fetchedCount = 0;
      for (let i = 0; i < needed; i++) {
        const res = await api.get(`/agent/next-number?governorate=${encodeURIComponent(gov || selectedGov)}${sidUrl ? `&surveyId=${sidUrl}` : ''}`);
        if (res.data && res.data._id) {
          await offlineDb.saveCachedNumber(res.data);
          fetchedCount++;
        } else {
          console.log(`[Offline Inventory] No more numbers available from server for prefetch.`);
          break; // No more numbers available
        }
      }
      const updatedCached = await offlineDb.getCachedNumbers();
      console.log(`[Offline Inventory] Prefetched ${fetchedCount} numbers. New cached inventory count: ${updatedCached.length}`);
    } catch (err) {
      console.error('Failed to prefetch numbers:', err);
    }
  };

  const fetchNumber = async (govOverride) => {
    const govToFetch = typeof govOverride === 'string' ? govOverride : selectedGov;
    setNumberLoading(true);
    try {
      if (isOnline) {
        const urlParams = new URLSearchParams(window.location.search);
        const sidUrl = urlParams.get('surveyId');
        const nextNumRes = await api.get(`/agent/next-number?governorate=${encodeURIComponent(govToFetch)}${sidUrl ? `&surveyId=${sidUrl}` : ''}`);
        const nextNum = nextNumRes.data;

        setCurrentNumber(nextNum);
        if (nextNum && nextNum.number) {
          setAnswers(prev => ({ ...prev, phone: nextNum.number, serial_number: nextNum.serialNumber || '' }));
          const cachedBefore = await offlineDb.getCachedNumbers();
          console.log(`[Offline Inventory] Fetched number online. Current cached numbers count before prefetch check: ${cachedBefore.length}`);
          prefetchNumbers(govToFetch);
        } else {
          setAnswers(prev => ({ ...prev, phone: '', serial_number: '' }));
          if (numberAssignmentMode === 'queue_then_manual' || numberAssignmentMode === 'manual_allowed') {
            setIsManualModalOpen(true);
          } else {
            toast.warning('No numbers available for the selected region.');
          }
        }
      } else {
        const cached = await offlineDb.getCachedNumbers();
        const matched = cached.filter(n => govToFetch === 'All' || n.governorate === govToFetch);
        console.log(`[Offline Inventory] Offline retrieval requested for governorate '${govToFetch}'. Total cached numbers: ${cached.length}, Matched: ${matched.length}`);
        if (matched.length > 0) {
          const nextNum = matched[0];
          setCurrentNumber(nextNum);
          setAnswers(prev => ({ ...prev, phone: nextNum.number, serial_number: nextNum.serialNumber || '' }));
          await offlineDb.deleteCachedNumber(nextNum._id);
          const cachedAfter = await offlineDb.getCachedNumbers();
          console.log(`[Offline Inventory] Loaded number ${nextNum.number} from offline cache. Remaining cached numbers count: ${cachedAfter.length}`);
          toast.info(t('loadedFromCache') || 'Loaded number from local offline cache.');
        } else {
          setAnswers(prev => ({ ...prev, phone: '', serial_number: '' }));
          if (numberAssignmentMode === 'queue_then_manual' || numberAssignmentMode === 'manual_allowed') {
            setIsManualModalOpen(true);
          } else {
            toast.warning(t('noOfflineNumbers') || 'No cached numbers available offline for this region.');
          }
        }
      }
    } catch (e) {
      console.error('Failed to load next number:', e);
      toast.error('Failed to load number');
    } finally {
      setNumberLoading(false);
    }
  };

  const handleGovChange = (e) => {
    const newGov = e.target.value;
    setSelectedGov(newGov);
    fetchNumber(newGov);
  };

  const handleManualNumberSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!manualNumber || !manualNumber.trim()) {
      toast.error('Please enter a phone number');
      return;
    }
    const cleanNum = manualNumber.trim();
    const digitsOnly = cleanNum.replace(/\D/g, '');
    if (digitsOnly.length < 7 || digitsOnly.length > 15) {
      toast.error('Invalid phone number format (must be 7-15 digits)');
      return;
    }

    setManualSaving(true);
    try {
      if (isOnline) {
        const res = await api.post('/agent/assign-manual-number', {
          surveyId,
          number: cleanNum,
          governorate: selectedGov
        });
        const nextNum = res.data;
        setCurrentNumber(nextNum);
        setAnswers(prev => ({ ...prev, phone: nextNum.number, serial_number: nextNum.serialNumber || '' }));
        toast.success('Manual number assigned successfully.');
        setIsManualModalOpen(false);
        setManualNumber('');
      } else {
        // Offline generation
        const tempSerial = `OFFLINE-MANUAL-${Date.now()}`;
        const mockPhoneDoc = {
          _id: `temp-${Date.now()}`,
          surveyId,
          number: cleanNum,
          agentId: user?.id,
          status: 'pending',
          serialNumber: tempSerial,
          numberSource: 'manual',
          governorate: selectedGov,
          assignedAt: new Date().toISOString()
        };
        setCurrentNumber(mockPhoneDoc);
        setAnswers(prev => ({ ...prev, phone: mockPhoneDoc.number, serial_number: mockPhoneDoc.serialNumber }));
        toast.success('Manual number registered offline.');
        setIsManualModalOpen(false);
        setManualNumber('');
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to assign manual number');
    } finally {
      setManualSaving(false);
    }
  };

  const hintText = useMemo(() => {
    if (canProceed) return '';
    const callResult = answers.call_result;
    if (!callResult) return 'Select the call outcome to continue.';
    if (String(callResult) !== 'contacted') {
      if (!canSaveNew) return 'Fill in the Interview outcome, then click "New Form" to log this call and get the next number.';
      return 'Click "New Form" to save this result and get the next number.';
    }
    return (config.meta.completeHint && config.meta.completeHint.trim()) || t('precallCompleteHint');
  }, [canProceed, canSaveNew, answers.call_result, config.meta, t]);

  const sectionOrder = config.sectionOrder || ['agent', 'call', 'phone'];
  const totalSections = sectionOrder.length;

  const sectionStates = useMemo(() => {
    const states = {};
    sectionOrder.forEach((secKey) => {
      const secFields = config.fields.filter(
        (f) => f.section === secKey && isFieldVisible(f, answers)
      );
      const requiredFields = secFields.filter((f) => f.required);
      if (requiredFields.length === 0) {
        states[secKey] = 'filled';
        return;
      }
      const filledCount = requiredFields.filter((f) => {
        const val = answers[f.id];
        return val !== undefined && val !== null && val !== '';
      }).length;

      if (filledCount === requiredFields.length) {
        states[secKey] = 'filled';
      } else if (filledCount > 0) {
        states[secKey] = 'partially-filled';
      } else {
        states[secKey] = 'empty';
      }
    });
    return states;
  }, [config.fields, answers, sectionOrder]);

  const getFieldError = useCallback((field) => {
    if (!showErrors) return null;
    if (!isFieldVisible(field, answers)) return null;
    if (!field.required) return null;

    // For contacted call, interview_result is not validated for Next
    if (String(answers.call_result) === 'contacted' && field.id === 'interview_result') {
      return null;
    }

    if (!isFieldSatisfied(field, answers[field.id])) {
      return t('fieldRequired') || 'This field is required';
    }

    return null;
  }, [showErrors, answers, t]);

  const getSectionTitle = useCallback((sec) => {
    const titleKey =
      sec === 'agent' ? 'sectionAgent' : sec === 'call' ? 'sectionCall' : 'sectionPhone';
    return metaLine(config.meta, titleKey, t);
  }, [config.meta, t]);

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
      {/* ── Hero header ── */}
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
            {answers.serial_number && user?.role !== 'agent' && (
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

            {user?.role !== 'agent' && (
              <form onSubmit={handleSerialSearch} style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ position: 'relative' }}>
                  <Hash size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                  <input
                    type="text"
                    className="input-field"
                    placeholder={t('searchBySerial') || 'Search Serial...'}
                    style={{ paddingLeft: '35px', height: '40px', fontSize: '0.9rem', width: '160px' }}
                    value={serialSearchTerm}
                    onChange={(e) => setSerialSearchTerm(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn-secondary" style={{ height: '40px', padding: '0 1rem' }} disabled={searchLoading}>
                  {searchLoading ? <Loader2 size={16} className="spin-icon" /> : <Hash size={16} />}
                </button>
              </form>
            )}

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

      {/* ── Horizontal progress bar ── */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="precall-progress-bar">
          {sectionOrder.map((sec, idx) => {
            const stepState = sectionStates[sec]; // filled, partially-filled, empty
            const isFilled = stepState === 'filled';

            return (
              <React.Fragment key={sec}>
                <div className="precall-step">
                  <div className={`precall-step-circle ${stepState}`}>
                    {isFilled ? <Check size={16} strokeWidth={3} /> : idx + 1}
                  </div>
                  <span className={`precall-step-label ${isFilled ? 'filled' : ''}`}>
                    {getSectionTitle(sec)}
                  </span>
                </div>
                {idx < sectionOrder.length - 1 && (
                  <div className={`precall-step-connector ${isFilled ? 'done' : 'pending'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* ── Terminate-call banner ── */}
      {isTerminated && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="glass-card"
          style={{
            border: '1.5px solid var(--danger)',
            background: 'hsla(0, 75%, 50%, 0.08)',
            padding: '1.1rem 1.4rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.8rem',
          }}
        >
          <AlertTriangle size={20} color="var(--danger)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <div style={{ fontWeight: 700, color: 'var(--danger)', marginBottom: '0.2rem', fontSize: '0.95rem' }}>
              {t('precallTerminateCallTitle') || 'Call must be terminated'}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {t('precallTerminateCallDesc') || 'The respondent does not meet the eligibility criteria for this survey. Please end the call politely and use \'New Form\' to log the result.'}
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Section cards stack ── */}
      <div className="precall-sections-stack">
        {sectionOrder.map((sec, idx) => {
          const sectionFields = config.fields.filter((f) => f.section === sec);
          if (sectionFields.length === 0 && sec !== 'phone') return null;

          const sectionTitle = getSectionTitle(sec);
          const SectionIcon = sec === 'agent' ? User : sec === 'call' ? ClipboardList : Phone;

          return (
            <div
              key={sec}
              className="precall-card-wrap"
            >
              <div className="glass-card" style={{ padding: 0 }}>
                {/* Card header */}
                <div className="precall-card-header">
                  <div className="precall-card-badge">
                    {idx + 1}
                  </div>
                  <SectionIcon size={16} color="var(--text-secondary)" />
                  <span className="precall-card-header-title">{sectionTitle}</span>
                </div>

                {/* Card body */}
                <div className="precall-card-body">
                  {/* ── Phone section: governorate picker + fetch button ── */}
                  {sec === 'phone' && !isEditMode && (
                    <div className="precall-fields-grid" style={{ marginBottom: '1rem' }}>
                      <div className="precall-field precall-field-full"
                        style={{ padding: '1rem', background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '8px' }}>
                        <label className="precall-label" style={{ fontWeight: 600, color: 'var(--primary)' }}>Target Governorate</label>
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                          <select
                            className="input-field"
                            data-testid="precall-governorate-select"
                            style={{ flex: 1, minWidth: '200px' }}
                            value={selectedGov}
                            onChange={handleGovChange}
                            disabled={numberLoading || user?.role === 'agent'}
                          >
                            <option value="All">All Governorates (Random)</option>
                            {EGYPTIAN_GOVERNORATES.map(g => (
                              <option key={g} value={g}>{g}</option>
                            ))}
                          </select>
                          {!currentNumber && (
                            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', flex: 1, minWidth: '150px' }}>
                              <button
                                type="button"
                                className="btn-primary"
                                data-testid="precall-get-number-btn"
                                onClick={() => fetchNumber(selectedGov)}
                                disabled={numberLoading}
                                style={{ flex: 1 }}
                              >
                                {numberLoading ? <Loader2 size={16} className="spin-icon" /> : 'Get Number'}
                              </button>
                            </div>
                          )}
                        </div>
                        {!currentNumber && (
                          <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {user?.role === 'agent'
                              ? "Click 'Get Number' to fetch the next available lead from your assigned region."
                              : "Select a region and click 'Get Number' to fetch the next available lead."}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Fields grid */}
                  <div className="precall-fields-grid">
                    {sectionFields.map((field) => {
                      if (!isFieldVisible(field, answers)) return null;
                      const v = answers[field.id];
                      const isFieldReadOnly = (field.id === 'phone' || field.id === 'serial_number' || field.id === 'researcher_name' || field.id === 'researcher_code');
                      const fullWidth = isFullWidthField(field);
                      const errorText = getFieldError(field);

                      return (
                        <div
                          key={field.id}
                          className={fullWidth ? 'precall-field-full' : ''}
                        >
                          {renderFieldInput(field, v, setAnswer, tick, t, isFieldReadOnly, errorText)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Contextual hints ── */}
      {(!canProceed || !canSaveNew) && hintText && (
        <div className="precall-hint" style={{ marginTop: '0.5rem' }}>
          <Hash size={16} />
          <span>{hintText}</span>
        </div>
      )}
      {!canProceed && answers.call_result && String(answers.call_result) !== 'contacted' && canSaveNew && (
        <div className="precall-hint" style={{ marginTop: '0.25rem', borderColor: 'hsla(150, 70%, 40%, 0.4)', background: 'hsla(150, 70%, 40%, 0.06)' }}>
          <CheckCircle2 size={16} color="var(--success)" />
          <span style={{ color: 'var(--success)' }}>
            All required info is logged. Click <strong>New Form</strong> to save and get the next number.
          </span>
        </div>
      )}

      {/* ── Sticky footer ── */}
      <div className="precall-footer glass-card">
        <div className="precall-footer-left">
          <span className="precall-footer-label">{metaLine(config.meta, 'formsCountLabel', t)}</span>
          <span className="precall-footer-value">{formsCount != null ? formsCount : '—'}</span>
        </div>

        <div className="precall-footer-actions">
          <button
            type="button"
            className="btn-secondary"
            data-testid="precall-new-form-btn"
            onClick={onNewForm}
            disabled={submitting || !canSaveNew}
            title={!canSaveNew ? 'Fill all required fields (including Interview outcome) to save and get the next number' : 'Save result and get next number'}
          >
            {metaLine(config.meta, 'newFormLabel', t)}
          </button>
          <button
            type="button"
            className="btn-primary"
            data-testid="precall-next-btn"
            disabled={submitting}
            onClick={onNext}
            style={{ minWidth: '160px' }}
            title="Proceed to the survey questionnaire"
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

      <AnimatePresence>
        {isManualModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="drawer-overlay"
              style={{ zIndex: 4000 }}
              onClick={() => !manualSaving && setIsManualModalOpen(false)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, x: '-50%', y: '-50%' }}
              animate={{ scale: 1, opacity: 1, x: '-50%', y: '-50%' }}
              exit={{ scale: 0.9, opacity: 0, x: '-50%', y: '-50%' }}
              style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                width: '450px',
                maxWidth: '90vw',
                zIndex: 4001,
                background: 'var(--card-bg)',
                backdropFilter: 'blur(32px)',
                borderRadius: 'var(--radius-lg)',
                border: 'var(--glass-border)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
              }}
            >
              <div style={{ padding: '1.5rem', borderBottom: 'var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Phone size={20} color="var(--primary)" />
                  <h2 style={{ marginBottom: 0, fontSize: '1.25rem' }}>No Numbers Available</h2>
                </div>
                <button className="nav-action-btn" onClick={() => !manualSaving && setIsManualModalOpen(false)}><X size={20} /></button>
              </div>

              <form onSubmit={handleManualNumberSubmit}>
                <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>
                    No numbers are available in the campaign queue.
                  </p>
                  <div>
                    <label className="form-label" style={{ fontWeight: 600 }}>{t('precallPhone') || 'Phone Number'}</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="e.g. 01012345678"
                      value={manualNumber}
                      onChange={e => setManualNumber(e.target.value)}
                      disabled={manualSaving}
                      autoFocus
                    />
                  </div>
                </div>

                <div style={{ padding: '1.25rem', borderTop: 'var(--glass-border)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', background: 'rgba(0,0,0,0.1)' }}>
                  <button type="button" className="btn-secondary" onClick={() => setIsManualModalOpen(false)} disabled={manualSaving}>
                    {t('cancelManualEntry') || 'Cancel Manual Entry'}
                  </button>
                  <button type="submit" className="btn-primary" disabled={manualSaving || !manualNumber.trim()}>
                    {manualSaving ? <Loader2 size={16} className="spin-icon" /> : (t('enterNumberManually') || 'Enter Number Manually')}
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
