import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { motion } from 'framer-motion';
import { ClipboardList, Phone, User, Loader2, Check, AlertCircle } from 'lucide-react';

import { UIContext } from '../context/UIContext';
import { AuthContext } from '../context/AuthContext';
import {
  normalizeOutboundPrecall,
  metaLine,
  isFieldVisible,
  isFieldSatisfied,
  buildInitialAnswers,
} from '../utils/outboundPrecallConfig';
import { toast } from 'react-toastify';

export default function AuditPreCallChecklist() {
  const { agentId } = useParams();
  const [searchParams] = useSearchParams();
  const surveyIdParam = searchParams.get('surveyId');

  const { t } = useContext(UIContext);
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [surveyId, setSurveyId] = useState(surveyIdParam || null);
  const [surveyTitle, setSurveyTitle] = useState('');
  const [config, setConfig] = useState(() => normalizeOutboundPrecall(null));
  const [agentAnswers, setAgentAnswers] = useState({});
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [showErrors, setShowErrors] = useState(false);
  const [tick, setTick] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setTick(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch agent's active precall checklist data
  useEffect(() => {
    if (!agentId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/quality/agent-precall/${agentId}`);
        const data = res.data;

        if (!data || !data.precall) {
          toast.error('This agent does not have an active pre-call session to audit.');
          navigate('/quality/monitor');
          return;
        }

        const sid = data.precall.surveyId || surveyIdParam;
        setSurveyId(sid);
        setSurveyTitle(data.surveyTitle || 'Survey');

        const norm = normalizeOutboundPrecall(data.precallConfig);
        setConfig(norm);

        const agentPayload = data.precall.payload || {};
        setAgentAnswers(agentPayload);

        // Pre-populate auditor answers with agent payload, and quality name
        const initialAnswers = {
          ...agentPayload,
          quality_name: user?.name || '',
        };
        setAnswers(initialAnswers);
      } catch (e) {
        console.error(e);
        toast.error('Failed to load agent precall data');
        navigate('/quality/monitor');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [agentId, user, navigate, surveyIdParam]);

  const setAnswer = useCallback((id, val) => {
    setAnswers((prev) => ({ ...prev, [id]: val }));
  }, []);

  const getSectionTitle = useCallback((sec) => {
    const titleKey =
      sec === 'agent' ? 'sectionAgent' : sec === 'call' ? 'sectionCall' : 'sectionPhone';
    return metaLine(config.meta, titleKey, t);
  }, [config.meta, t]);

  const getFieldError = useCallback((field) => {
    if (!showErrors) return null;
    if (field.id === 'quality_name') {
      if (!answers.quality_name || !answers.quality_name.trim()) {
        return t('fieldRequired') || 'This field is required';
      }
      return null;
    }
    if (!isFieldVisible(field, answers)) return null;
    if (!field.required) return null;

    if (!isFieldSatisfied(field, answers[field.id])) {
      return t('fieldRequired') || 'This field is required';
    }

    return null;
  }, [showErrors, answers, t]);

  const onNext = () => {
    // Validate Quality Name
    if (!answers.quality_name || !answers.quality_name.trim()) {
      setShowErrors(true);
      toast.warning('Please enter the Quality Name.');
      return;
    }

    // Validate all other config fields
    let hasErrors = false;
    config.fields.forEach(f => {
      if (isFieldVisible(f, answers) && f.required) {
        if (!isFieldSatisfied(f, answers[f.id])) {
          hasErrors = true;
        }
      }
    });

    if (hasErrors) {
      setShowErrors(true);
      toast.warning(t('precallCompleteHint') || 'Please fill in all required fields.');
      return;
    }

    // Save auditor precall answers to sessionStorage for later submission
    sessionStorage.setItem(`auditPrecallAnswers:${agentId}`, JSON.stringify(answers));

    // Redirect to Audit Survey page
    const serialNumber = answers.serial_number || 'N/A';
    navigate(`/quality/audit-survey/${surveyId}/${agentId}/${serialNumber}`);
  };

  const renderAuditorFieldInput = (field, value, onChange, isReadOnly, errorText) => {
    const label = field.label || field.id;
    const isOtherSelected = typeof value === 'string' && value.startsWith('other:');
    const otherText = isOtherSelected ? value.slice(6) : '';
    const hasError = !!errorText;

    switch (field.type) {
      case 'readonly_date':
        return (
          <div className="precall-field" key={field.id}>
            <label className="precall-label">{label}</label>
            <input className="input-field" value={answers[field.id] || ''} readOnly />
          </div>
        );
      case 'readonly_time':
        return (
          <div className="precall-field" key={field.id}>
            <label className="precall-label">{label}</label>
            <input className="input-field" value={answers[field.id] || ''} readOnly />
          </div>
        );
      case 'text':
        return (
          <div className="precall-field" key={field.id}>
            <label className="precall-label">{label}</label>
            <input
              className={`input-field ${hasError ? 'has-error' : ''}`}
              value={value ?? ''}
              onChange={(e) => onChange(field.id, e.target.value)}
              placeholder={field.placeholder || ''}
              readOnly={isReadOnly}
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
                  className={`precall-seg-btn ${segValue === String(opt.value) ? 'active' : ''} ${hasError && segValue !== String(opt.value) && !segOtherActive ? 'has-error' : ''}`}
                  onClick={() => !isReadOnly && onChange(field.id, opt.value)}
                  disabled={isReadOnly}
                >
                  {opt.label || opt.value}
                </button>
              ))}
              {field.allowOther && (
                <button
                  type="button"
                  className={`precall-seg-btn ${segOtherActive ? 'active' : ''} ${hasError && !segOtherActive && !segValue ? 'has-error' : ''}`}
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
      case 'year': {
        return (
          <div className="precall-field" key={field.id}>
            <label className="precall-label">{label}</label>
            <select
              className={`input-field ${hasError ? 'has-error' : ''}`}
              value={value ?? ''}
              onChange={(e) => onChange(field.id, e.target.value)}
              disabled={isReadOnly}
            >
              <option value="">{t('selectYear') || 'Select Year...'}</option>
              {(() => {
                const opts = [];
                const from = field.yearRange?.from || 1900;
                const to = field.yearRange?.to || new Date().getFullYear();
                const start = Math.min(from, to);
                const end = Math.max(from, to);
                for (let y = end; y >= start; y--) {
                  opts.push(<option key={y} value={y}>{y}</option>);
                }
                return opts;
              })()}
            </select>
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
  };

  if (loading) {
    return (
      <div className="precall-shell" style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}>
        <Loader2 className="spin-icon" size={40} color="var(--primary)" />
      </div>
    );
  }

  const sectionOrder = config.sectionOrder || ['agent', 'call', 'phone'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="precall-shell"
    >
      {/* Hero Header */}
      <div className="precall-hero glass-card">
        <div className="precall-hero-top">
          <div className="precall-hero-title">
            <ClipboardList size={26} color="var(--primary)" />
            <div>
              <h1 style={{ margin: 0, fontSize: '1.35rem', letterSpacing: '-0.02em' }}>
                {t('auditOutboundCallChecklist') || 'Audit Outbound Call Checklist'} ({surveyTitle})
              </h1>
              <p className="precall-subtitle">
                {t('reviewAndVerifyAgentPrecallDetails') || 'Review and verify the agent\'s pre-call checklist details below.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Horizontal progress bar */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="precall-progress-bar">
          {sectionOrder.map((sec, idx) => {
            return (
              <React.Fragment key={sec}>
                <div className="precall-step">
                  <div className="precall-step-circle filled">
                    {idx + 1}
                  </div>
                  <span className="precall-step-label filled">
                    {getSectionTitle(sec)}
                  </span>
                </div>
                {idx < sectionOrder.length - 1 && (
                  <div className="precall-step-connector done" />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Sections Stack */}
      <div className="precall-sections-stack">
        {sectionOrder.map((sec, idx) => {
          let sectionFields = config.fields.filter((f) => f.section === sec);
          if (sec === 'agent') {
            // Inject Quality Name before Researcher Name
            const qualityNameField = {
              id: 'quality_name',
              label: t('qualityName') || 'Quality Name',
              type: 'text',
              required: true,
              section: 'agent',
            };
            sectionFields = [qualityNameField, ...sectionFields];
          }

          if (sectionFields.length === 0) return null;

          const sectionTitle = getSectionTitle(sec);
          const SectionIcon = sec === 'agent' ? User : sec === 'call' ? ClipboardList : Phone;

          return (
            <div key={sec} className="precall-card-wrap">
              <div className="glass-card" style={{ padding: 0 }}>
                {/* Header */}
                <div className="precall-card-header">
                  <div className="precall-card-badge">{idx + 1}</div>
                  <SectionIcon size={16} color="var(--text-secondary)" />
                  <span className="precall-card-header-title">{sectionTitle}</span>
                </div>

                {/* Body */}
                <div className="precall-card-body">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {sectionFields.map((field) => {
                      if (field.id !== 'quality_name' && !isFieldVisible(field, answers)) return null;

                      const agentVal = agentAnswers[field.id];
                      const auditorVal = answers[field.id];
                      const isFieldReadOnly = (field.id === 'phone' || field.id === 'serial_number');
                      const errorText = getFieldError(field);

                      return (
                        <div key={field.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '1rem' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'flex-start' }}>
                            {/* Agent Side */}
                            <div style={{ padding: '0.6rem 0.8rem', borderRadius: '8px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', minHeight: '68px' }}>
                              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.25rem' }}>
                                {field.id === 'quality_name' ? t('auditorLabel') || 'Auditor Role' : t('agentAnswer') || 'Agent Answer'}
                              </span>
                              <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                                {field.id === 'quality_name' ? (t('qualityDepartment') || 'Quality Assurance') : (agentVal !== undefined && agentVal !== null && agentVal !== '' ? String(agentVal).replace('other:', '') : '—')}
                              </strong>
                            </div>

                            {/* Auditor Side */}
                            <div>
                              {renderAuditorFieldInput(field, auditorVal, setAnswer, isFieldReadOnly, errorText)}
                            </div>
                          </div>

                          {/* Discrepancy indicator */}
                          {field.id !== 'quality_name' && String(auditorVal ?? '') !== String(agentVal ?? '') && (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--danger)', fontSize: '0.8rem', fontWeight: 700, marginTop: '0.25rem' }}>
                              <AlertCircle size={14} /> {t('qualityDiscrepancy') || 'Quality Difference / Discrepancy detected!'}
                            </div>
                          )}
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

      {/* Sticky Footer */}
      <div className="precall-footer glass-card">
        <div className="precall-footer-left">
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Auditing agent session...
          </span>
        </div>
        <div className="precall-footer-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={onNext}
            style={{ minWidth: '160px' }}
          >
            {t('next')}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
