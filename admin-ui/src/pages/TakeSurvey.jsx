import React, { useState, useEffect, useLayoutEffect, useContext, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { AuthContext } from '../context/AuthContext';
import { UIContext } from '../context/UIContext';
import { toast } from 'react-toastify';
import { INTERVIEW_OUTCOME_OPTIONS, evaluateCondition } from '../utils/outboundPrecallConfig';
import HandoverModal from '../components/HandoverModal';
import { UserPlus, Menu, ChevronLeft, ChevronRight, Save, PhoneOff, AlertTriangle, ChevronDown, Check, Lock } from 'lucide-react';
import SectionedSurveyView from '../components/SectionedSurveyView';
import { offlineDb } from '../utils/offlineDb';

class DebugErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("SURVEY CRASH:", error);
    console.error("COMPONENT STACK:", info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '2rem', color: 'red', fontFamily: 'monospace' }}>
          <h2 dir="auto">Survey Render Error (debug only)</h2>
          <pre>{this.state.error?.message}</pre>
          <pre>{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const parseDynamicText = (text, answers) => {
    if (!text) return "";
    let parsed = String(text);
    const matches = parsed.match(/\{([^}]+)\}/g);
    if (matches) {
      matches.forEach(match => {
        const key = match.slice(1, -1);
        if (answers[key] !== undefined) {
          parsed = parsed.replace(match, String(answers[key]));
        }
      });
    }
    return parsed;
  };

const QuestionRenderer = React.memo(({ q, sIdx, qIdx, isLocked = false, questions, answers, isRtl, t, toggleChoiceForQuestion, setSingleChoiceForQuestion, handleAnswerChange, otherValues, setOtherValues, markInteracted, fieldErrors, setFieldErrors, scrollToNextInGroup, survey, handleNextQuestion, showInteractionError, activeInputIdRef }) => {
    const qId = q.id || q.questionId || String(q._id);
    const flatIdx = questions.findIndex(qst => (qst.id || qst.questionId || String(qst._id)) === qId);
    
    const dynamicQuestionText = parseDynamicText(q.text, answers);
    const dynamicScriptText = parseDynamicText(q.script, answers);

    const isSelected = (val) => {
      if (val === 'Other' && q.allowMultipleOther) {
        const arr = Array.isArray(answers[qId]) ? answers[qId] : [];
        return arr.some(v => typeof v === 'string' && v.startsWith('other:'));
      }
      if (q.type === 'multiple_choice') return (Array.isArray(answers[qId]) && answers[qId].includes(val));
      return answers[qId] === val;
    };

    const choices = [...(q.choices || [])];
    if (q.allowOther) choices.push({ text: 'Other', isOther: true });

    return (
      <div 
        key={qId}
        id={`question-card-${qId}`} 
        className="glass-card fade-enter-active" 
        style={{ 
          padding: '1.25rem', 
          border: '1px solid var(--border-color)', 
          borderRadius: '8px',
          ...(isLocked ? { opacity: 0.5, pointerEvents: 'none' } : {})
        }}
      >
        <h3 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
          {typeof q.category === 'string' ? q.category.toUpperCase() : t('question')} {flatIdx + 1}
        </h3>
        <h2>{dynamicQuestionText}</h2>

        {q.script && (
          <div className="agent-script-box" style={{ marginTop: '0.5rem' }}>
            <strong style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{t('agentReadAloud')}</strong>
            {dynamicScriptText}
          </div>
        )}

        {(q.type === 'single_choice' || q.type === 'multiple_choice') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
            <div className="choice-grid" style={{ marginTop: 0 }}>
              {choices.map((c, i) => (
                <button 
                  key={i} 
                  className={`choice-btn ${isSelected(c.text) ? 'active' : ''}`} 
                  onClick={() => q.type === 'multiple_choice' ? toggleChoiceForQuestion(q, c.text) : setSingleChoiceForQuestion(q, c.text, c.logic)}
                  style={isSelected(c.text) ? { backgroundColor: 'var(--primary)', color: 'white', borderColor: 'var(--primary)' } : {}}
                  type="button"
                >
                  {c.text}
                </button>
              ))}
            </div>

            {isSelected('Other') && (
              <div style={{ marginTop: '0.5rem' }}>
                {q.allowMultipleOther ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {(() => {
                        const arr = Array.isArray(answers[qId]) ? answers[qId] : [];
                        const others = arr.filter(v => typeof v === 'string' && v.startsWith('other:'));
                        if (others.length === 0) others.push('other:');
                        return others.map((val, idx) => {
                          const textVal = val.substring(6);
                          const otherId = `input-${qId}-other-${idx}`;
                          return (
                            <div key={idx} style={{ display: 'flex', gap: '0.5rem' }}>
                              <input dir="auto"
                                id={otherId}
                                type="text"
                                className="input-field"
                                placeholder="Please specify..."
                                value={textVal}
                                onChange={(e) => {
                                  if (activeInputIdRef) activeInputIdRef.current = e.target.id;
                                  const newText = e.target.value;
                                  const newAnswers = [...arr];
                                  let otherCounter = 0;
                                  for (let i = 0; i < newAnswers.length; i++) {
                                    if (typeof newAnswers[i] === 'string' && newAnswers[i].startsWith('other:')) {
                                      if (otherCounter === idx) {
                                        newAnswers[i] = `other:${newText}`;
                                        break;
                                      }
                                      otherCounter++;
                                    }
                                  }
                                  handleAnswerChange(qId, newAnswers);
                                }}
                              />
                              <button 
                                type="button" 
                                className="btn-secondary" 
                                style={{ padding: '0.5rem', color: '#ef4444' }} 
                                onClick={() => {
                                  const newAnswers = [...arr];
                                  let otherCounter = 0;
                                  for (let i = 0; i < newAnswers.length; i++) {
                                    if (typeof newAnswers[i] === 'string' && newAnswers[i].startsWith('other:')) {
                                      if (otherCounter === idx) {
                                        newAnswers.splice(i, 1);
                                        break;
                                      }
                                      otherCounter++;
                                    }
                                  }
                                  handleAnswerChange(qId, newAnswers);
                                }}
                                disabled={others.length <= 1}
                              >
                                −
                              </button>
                            </div>
                          );
                        });
                      })()}
                    </div>
                    <button 
                      type="button" 
                      className="btn-secondary" 
                      style={{ alignSelf: 'flex-start', fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                      onClick={() => {
                        const arr = Array.isArray(answers[qId]) ? answers[qId] : [];
                        handleAnswerChange(qId, [...arr, "other:"]);
                      }}
                    >
                      {t('addAnother') || '+ Add another'}
                    </button>
                  </div>
                ) : (
                  <input dir="auto"
                    id={`input-${qId}-other`}
                    type="text"
                    className="input-field"
                    placeholder="Please specify..."
                    value={otherValues[qId] || ''}
                    onChange={(e) => {
                      if (activeInputIdRef) activeInputIdRef.current = e.target.id;
                      setOtherValues(prev => ({ ...prev, [qId]: e.target.value }));
                      markInteracted(qId);
                      if (fieldErrors[qId]) {
                        setFieldErrors(prev => {
                          const next = { ...prev };
                          delete next[qId];
                          return next;
                        });
                      }
                    }}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {q.type === 'text' && (
          <div className="form-group" style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input dir="auto"
              id={`input-${qId}`}
              type="text"
              className="input-field"
              placeholder={t('typeAnswer')}
              value={answers[qId] || ''}
              onChange={(e) => {
                if (activeInputIdRef) activeInputIdRef.current = e.target.id;
                handleAnswerChange(qId, e.target.value);
              }}
              style={{ flex: 1 }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (q._groupId) {
                    scrollToNextInGroup(qId, answers);
                  } else if (survey?.layoutMode !== 'multi') {
                    handleNextQuestion();
                  }
                }
              }}
            />
          </div>
        )}

        {(q.type === 'number' || q.type === 'number_ratio') && (
          <div className="form-group" style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input dir="auto"
              id={`input-${qId}`}
              type="number"
              inputMode="numeric"
              className="input-field"
              placeholder={t('typeNumber') || t('typeAnswer')}
              value={answers[qId] ?? ''}
              onChange={(e) => {
                if (activeInputIdRef) activeInputIdRef.current = e.target.id;
                const raw = e.target.value;
                const cleaned = raw.replace(/[^0-9.\-]/g, '');
                handleAnswerChange(qId, cleaned);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (q._groupId) {
                    scrollToNextInGroup(qId, answers);
                  } else if (survey?.layoutMode !== 'multi') {
                    handleNextQuestion();
                  }
                  return;
                }
                const allowed = ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', '.', '-'];
                if (!allowed.includes(e.key) && !/^[0-9]$/.test(e.key)) {
                  e.preventDefault();
                }
              }}
              style={{ flex: 1 }}
            />
            {q.type === 'number_ratio' && (
              <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-secondary)' }}>%</span>
            )}
          </div>
        )}

        {q.type === 'ranking' && (() => {
          const choiceTexts = (q.choices || []).map(c => c.text || c);
          const isDynamic = choiceTexts.length === 0;
          const rankItems = Array.isArray(answers[qId]) ? answers[qId] : (isDynamic ? [] : [...choiceTexts]);
          // Auto-initialize static ranking if answer not set yet
          if (!isDynamic && (!Array.isArray(answers[qId]) || answers[qId].length === 0)) {
            setTimeout(() => handleAnswerChange(qId, [...choiceTexts]), 0);
          }
          const moveItem = (fromIdx, toIdx) => {
            const next = [...rankItems];
            const [moved] = next.splice(fromIdx, 1);
            next.splice(toIdx, 0, moved);
            handleAnswerChange(qId, next);
          };
          const removeItem = (idx) => {
            const next = rankItems.filter((_, i) => i !== idx);
            handleAnswerChange(qId, next);
          };
          const addDynamicItem = (text) => {
            const trimmed = (text || '').trim();
            if (!trimmed) return;
            const next = [...rankItems, trimmed];
            handleAnswerChange(qId, next);
          };

          // Shared button style builder
          const arrowBtnStyle = (disabled) => ({
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '2rem',
            height: '2rem',
            borderRadius: '6px',
            border: '1px solid var(--border-color, #d1d5db)',
            background: disabled ? 'var(--card-bg, #f3f4f6)' : 'var(--surface, #fff)',
            color: disabled ? 'var(--text-disabled, #9ca3af)' : 'var(--primary, #6366f1)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontWeight: 700,
            fontSize: '1rem',
            lineHeight: 1,
            padding: 0,
            transition: 'background 0.15s, color 0.15s',
          });

          return (
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {/* Dynamic free-listing input */}
              {isDynamic && (
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <input
                    id={`input-${qId}-ranking-add`}
                    type="text"
                    dir="auto"
                    placeholder={isRtl ? 'اكتب إجابة واضغط Enter للإضافة...' : 'Type an answer and press Enter to add...'}
                    className="input-field"
                    style={{ flex: 1 }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addDynamicItem(e.target.value);
                        e.target.value = '';
                      }
                    }}
                    onFocus={(e) => { if (activeInputIdRef) activeInputIdRef.current = e.target.id; }}
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 600, borderRadius: '8px', whiteSpace: 'nowrap' }}
                    onClick={() => {
                      const inp = document.getElementById(`input-${qId}-ranking-add`);
                      if (inp) {
                        addDynamicItem(inp.value);
                        inp.value = '';
                        inp.focus();
                      }
                    }}
                  >
                    {isRtl ? '+ إضافة' : '+ Add'}
                  </button>
                </div>
              )}

              {/* Ranking cards */}
              {rankItems.map((item, idx) => (
                <div
                  key={`rank-${idx}-${item}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    padding: '0.75rem 1rem',
                    background: 'var(--card-bg, #f9fafb)',
                    border: '1px solid var(--border-color, #e5e7eb)',
                    borderRadius: '8px',
                    transition: 'box-shadow 0.2s ease, transform 0.15s ease',
                  }}
                >
                  {/* Rank badge */}
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '2rem',
                    height: '2rem',
                    borderRadius: '50%',
                    background: 'var(--primary, #6366f1)',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    flexShrink: 0,
                  }}>
                    {idx + 1}
                  </span>

                  {/* Item label */}
                  <span style={{ flex: 1, fontWeight: 500, fontSize: '0.95rem', color: 'var(--text-primary, #1f2937)' }}>
                    {item}
                  </span>

                  {/* Move + Delete controls */}
                  <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveItem(idx, idx - 1)}
                      title={isRtl ? 'تحريك لأعلى' : 'Move Up'}
                      style={arrowBtnStyle(idx === 0)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={idx === rankItems.length - 1}
                      onClick={() => moveItem(idx, idx + 1)}
                      title={isRtl ? 'تحريك لأسفل' : 'Move Down'}
                      style={arrowBtnStyle(idx === rankItems.length - 1)}
                    >
                      ↓
                    </button>
                    {isDynamic && (
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        title={isRtl ? 'حذف' : 'Remove'}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '2rem',
                          height: '2rem',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color, #d1d5db)',
                          background: 'var(--surface, #fff)',
                          color: '#ef4444',
                          cursor: 'pointer',
                          fontWeight: 700,
                          fontSize: '0.9rem',
                          lineHeight: 1,
                          padding: 0,
                          transition: 'background 0.15s, color 0.15s',
                        }}
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Empty state hint for dynamic mode */}
              {isDynamic && rankItems.length === 0 && (
                <p style={{ textAlign: 'center', color: 'var(--text-secondary, #6b7280)', fontSize: '0.85rem', padding: '1rem 0', margin: 0 }}>
                  {isRtl ? 'لم تتم إضافة عناصر بعد. اكتب أعلاه واضغط Enter.' : 'No items added yet. Type above and press Enter.'}
                </p>
              )}
            </div>
          );
        })()}

        {q.type === 'multi_input' && (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {(q.subInputs || []).map((sub, subIdx) => {
              const ansObj = typeof answers[qId] === 'object' && answers[qId] !== null ? answers[qId] : {};
              const val = ansObj[sub.id] ?? '';
              const subInputId = `input-${qId}-${sub.id}`;
              return (
                <div key={sub.id || `sub-${subIdx}`} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label className="form-label" style={{ display: 'flex', gap: '0.25rem' }}>
                    {sub.label}
                    {sub.required && <span style={{ color: 'var(--danger)' }}>*</span>}
                  </label>
                  {sub.inputType === 'dropdown' ? (
                    <select
                      id={subInputId}
                      className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50 focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none text-gray-800"
                      value={val}
                      onChange={e => {
                        if (activeInputIdRef) activeInputIdRef.current = e.target.id;
                        handleAnswerChange(qId, { ...ansObj, [sub.id]: e.target.value });
                      }}
                    >
                      <option value="">-- Select --</option>
                      {(sub.options || []).map((opt, i) => (
                        <option key={i} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : sub.inputType === 'number' ? (
                    <input dir="auto"
                      id={subInputId}
                      type="number"
                      className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50 focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none text-gray-800"
                      value={val}
                      onChange={e => {
                        if (activeInputIdRef) activeInputIdRef.current = e.target.id;
                        const raw = e.target.value;
                        const cleaned = raw.replace(/[^0-9.\-]/g, '');
                        handleAnswerChange(qId, { ...ansObj, [sub.id]: cleaned });
                      }}
                    />
                  ) : sub.inputType === 'date' ? (
                    <input dir="auto"
                      id={subInputId}
                      type="date"
                      className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50 focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none text-gray-800"
                      value={val}
                      onChange={e => {
                        if (activeInputIdRef) activeInputIdRef.current = e.target.id;
                        handleAnswerChange(qId, { ...ansObj, [sub.id]: e.target.value });
                      }}
                    />
                  ) : (
                    <input dir="auto"
                      id={subInputId}
                      type="text"
                      className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50 focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none text-gray-800"
                      value={val}
                      onChange={e => {
                        if (activeInputIdRef) activeInputIdRef.current = e.target.id;
                        handleAnswerChange(qId, { ...ansObj, [sub.id]: e.target.value });
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {fieldErrors[qId] && (
          <div className="field-error-text" style={{ color: 'var(--danger)', marginTop: '0.75rem', fontWeight: 600, fontSize: '0.9rem' }}>
            {fieldErrors[qId]}
          </div>
        )}

        {showInteractionError && (
          <p className="field-error-text">
            {t('questionInteractionRequired')}
          </p>
        )}
      </div>
    );
  }, (prevProps, nextProps) => {
    const prevQId = prevProps.q.id || prevProps.q.questionId || String(prevProps.q._id);
    const nextQId = nextProps.q.id || nextProps.q.questionId || String(nextProps.q._id);

    return (
      prevQId === nextQId &&
      prevProps.answers[prevQId] === nextProps.answers[nextQId] &&
      prevProps.fieldErrors[prevQId] === nextProps.fieldErrors[nextQId] &&
      prevProps.otherValues[prevQId] === nextProps.otherValues[nextQId] &&
      prevProps.isLocked === nextProps.isLocked &&
      prevProps.isRtl === nextProps.isRtl &&
      prevProps.showInteractionError === nextProps.showInteractionError
    );
  });

export default function TakeSurvey({ mockSurvey }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, setUser } = useContext(AuthContext);
  const { t, language, isOnline } = useContext(UIContext);
  const isRtl = language === 'ar';
  const [survey, setSurvey] = useState(null);

  const [questions, setQuestions] = useState([]);
  /** intro | questions | interview */
  const [phase, setPhase] = useState('intro');
  const [answers, setAnswers] = useState({});
  const [otherValues, setOtherValues] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [startTime, setStartTime] = useState(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [currentSectionIdx, setCurrentSectionIdx] = useState(0);
  const [precallSerialNumber, setPrecallSerialNumber] = useState('');
  const [eligibility, setEligibility] = useState({ checked: false, canStart: false, reason: '' });
  const [eligLoading, setEligLoading] = useState(true);
  const [isHandoverOpen, setIsHandoverOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(() => typeof window !== 'undefined' && window.innerWidth > 768);
  const [showEndCallConfirm, setShowEndCallConfirm] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [defaultOpenSectionIdx, setDefaultOpenSectionIdx] = useState(0);
  const [openSections, setOpenSections] = useState({});
  const [maxReachedIdx, setMaxReachedIdx] = useState(0);
  const activeInputIdRef = useRef(null);

  useLayoutEffect(() => {
    if (activeInputIdRef.current) {
      const el = document.getElementById(activeInputIdRef.current);
      if (el && document.activeElement !== el) {
        el.focus();
      }
    }
  });

  // ─── Hooks must be above ALL early returns (Rules of Hooks) ──────────────
  const visibleQuestions = useMemo(() => {
    const map = {};
    questions.forEach(q => {
      const qId = q.id || q.questionId || String(q._id);
      if (!q.visibility) {
        map[qId] = true;
      } else {
        try {
          const matched = evaluateCondition(q.visibility, answers || {});
          const act = q.visibility.action || 'show';
          if (act === 'show') {
            map[qId] = matched;
          } else if (act === 'hide' || act === 'skip') {
            map[qId] = !matched;
          } else {
            map[qId] = matched;
          }
        } catch (e) {
          map[qId] = true;
        }
      }
    });
    return map;
  }, [questions, answers]);

  const isCurrentGroupComplete = useMemo(() => {
    const currentQ = questions[currentIdx];
    if (!currentQ || !currentQ._groupId) return true;
    const groupQs = questions.filter(q => q._groupId === currentQ._groupId);
    const visibleGroupQs = groupQs.filter(gq => {
      const gqId = gq.id || gq.questionId || String(gq._id);
      return visibleQuestions[gqId] !== false;
    });
    return visibleGroupQs.every(gq => {
      if (gq.type === 'info' || gq.type === 'notice' || gq.optional === true) return true;
      const gqId = gq.id || gq.questionId || String(gq._id);
      const val = answers[gqId];
      return val !== undefined && val !== null && val !== '';
    });
  }, [questions, currentIdx, visibleQuestions, answers]);

  // Compute completed sections
  const completedSections = useMemo(() => {
    const completed = {};
    if (!survey?.sections) return completed;
    survey.sections.forEach((sec, sIdx) => {
      // Flatten groups into individual questions for completion tracking
      const rawQs = sec.questions || [];
      const questionsInSec = rawQs.flatMap(item =>
        item.type === 'group' ? (item.questions || []).map(inner => ({ ...inner, _groupCrossValidation: item.crossValidation })) : [item]
      );
      const visibleQuestionsInSec = questionsInSec.filter((q) => {
        const qId = q.id || q.questionId || String(q._id);
        return visibleQuestions[qId] !== false;
      });

      if (visibleQuestionsInSec.length === 0) {
        completed[sIdx] = false;
        return;
      }

      const allAnswered = visibleQuestionsInSec.every((q) => {
        if (q.type === 'info' || q.type === 'notice' || q.optional === true) return true;
        const qId = q.id || q.questionId || String(q._id);
        const val = answers[qId];
        return val !== undefined && val !== null && val !== '';
      });

      completed[sIdx] = allAnswered;
    });

    return completed;
  }, [survey?.sections, visibleQuestions, answers]);

  // Collapse completed sections automatically
  useEffect(() => {
    setOpenSections(prev => {
      let changed = false;
      const next = { ...prev };
      Object.keys(completedSections).forEach(sIdx => {
        if (completedSections[sIdx] && next[sIdx] === true) {
          next[sIdx] = false;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [completedSections]);

  // Auto-expand the current section in the sidebar when reached
  useEffect(() => {
    if (survey?.sections) {
      setOpenSections(prev => ({
        ...prev,
        [currentSectionIdx]: true
      }));
    }
  }, [currentSectionIdx, survey?.sections]);

  // Auto-collapse section when all questions inside it are answered
  useEffect(() => {
    if (survey?.sections) {
      setOpenSections(prev => {
        let changed = false;
        const next = { ...prev };
        survey.sections.forEach((_, sIdx) => {
          if (completedSections[sIdx] && prev[sIdx] === true) {
            next[sIdx] = false;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }, [completedSections, survey?.sections]);

  // Compute maxReachedIdx based on current idx and answered questions
  useEffect(() => {
    let furthest = currentIdx;
    questions.forEach((q, idx) => {
      const qId = q.id || q.questionId || String(q._id);
      const hasAnswer = answers[qId] !== undefined && answers[qId] !== null && answers[qId] !== '';
      if (hasAnswer && idx > furthest) {
        furthest = idx;
      }
    });
    if (furthest > maxReachedIdx) {
      setMaxReachedIdx(furthest);
    }
  }, [currentIdx, questions, answers, maxReachedIdx]);

  const [interactedQuestions, setInteractedQuestions] = useState(new Set());
  // Ref mirrors the Set synchronously so canProceedFromQuestion never reads a
  // stale closure value when called inside a setTimeout (e.g. auto-advance on
  // single-choice click).
  const interactedRef = useRef(new Set());
  const [showInteractionError, setShowInteractionError] = useState(false);

  const markInteracted = (questionId) => {
    // Write to the ref immediately — visible to all closures right now.
    interactedRef.current.add(questionId);
    // Also update state so the UI re-renders when needed.
    setInteractedQuestions(prev => {
      const next = new Set(prev);
      next.add(questionId);
      return next;
    });
    setShowInteractionError(false);
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const hasSerialParam = !!urlParams.get('serial');
    if (
      !hasSerialParam &&
      user?.role === 'agent' &&
      user?.currentStatus === 'active' &&
      user?.precallCompletedForActiveSession !== true
    ) {
      navigate(`/agent/precall?surveyId=${id}`, { replace: true });
    }
  }, [navigate, user?.currentStatus, user?.precallCompletedForActiveSession, user?.role, id]);

  useEffect(() => {
    if (mockSurvey) {
      setSurvey(mockSurvey);
      let allQ = [];
      if (mockSurvey.sections) {
        mockSurvey.sections.forEach((sec) => {
          (sec.questions || []).forEach(item => {
            if (item.type === 'group') {
              (item.questions || []).forEach(innerQ => {
                allQ.push({ ...innerQ, _groupId: item.groupId, _groupLabel: item.label, _groupCrossValidation: item.crossValidation });
              });
            } else {
              allQ.push(item);
            }
          });
        });
      }
      setQuestions(allQ);
      return;
    }

    if (id) {
      const loadSurvey = async () => {
        let surveyData = null;
        if (isOnline) {
          try {
            const res = await api.get(`/survey/${id}`);
            surveyData = res.data;
            await offlineDb.saveSurveyDef(surveyData);
          } catch (err) {
            console.error("Network survey fetch failed, checking offline cache...", err);
          }
        }

        if (!surveyData) {
          surveyData = await offlineDb.getSurveyDef(id);
          if (surveyData) {
            toast.info(t('loadedSurveyFromCache') || 'Loaded survey structure from local offline cache.');
          }
        }

        if (surveyData) {
          setSurvey(surveyData);
          let allQ = [];
          if (surveyData.sections) {
            surveyData.sections.forEach((sec) => {
              (sec.questions || []).forEach(item => {
                if (item.type === 'group') {
                  (item.questions || []).forEach(innerQ => {
                    allQ.push({ ...innerQ, _groupId: item.groupId, _groupLabel: item.label, _groupCrossValidation: item.crossValidation });
                  });
                } else {
                  allQ.push(item);
                }
              });
            });
          } else if (surveyData.questions) {
            allQ = surveyData.questions;
          }
          setQuestions(allQ);
        } else {
          toast.error(t('surveyLoadFailed') || 'Failed to load survey structure.');
        }
      };

      loadSurvey();
    }
  }, [id, mockSurvey]);

  const refreshEligibility = async () => {
    if (mockSurvey) {
      setEligibility({ checked: true, canStart: true, reason: '' });
      setPrecallSerialNumber('PREVIEW_123');
      return { canStartSurvey: true, precallSerialNumber: 'PREVIEW_123' };
    }
    
    setEligLoading(true);
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const serialParam = urlParams.get('serial');

      if (isOnline) {
        const res = await api.get(`/agent/survey-eligibility?surveyId=${id}${serialParam ? `&serial=${serialParam}` : ''}`);
        const data = res.data;
        setEligibility({
          checked: true,
          canStart: data.canStartSurvey,
          reason: data.reason || '',
        });
        setPrecallSerialNumber(data.precallSerialNumber || '');
        return data;
      } else {
        if (serialParam) {
          const offlinePrecalls = await offlineDb.getOfflinePrecalls();
          const offlinePrecall = offlinePrecalls.find(p => p.serialNumber === serialParam);
          if (offlinePrecall || serialParam.startsWith('OFFLINE-') || serialParam) {
            const data = { canStartSurvey: true, precallSerialNumber: serialParam, payload: offlinePrecall?.payload || {} };
            setEligibility({
              checked: true,
              canStart: true,
              reason: '',
            });
            setPrecallSerialNumber(serialParam);
            return data;
          }
        }
        setEligibility({ checked: true, canStart: false, reason: 'offline_no_serial' });
        return { canStartSurvey: false, reason: 'offline_no_serial' };
      }
    } catch (e) {
      console.error(e);
      setEligibility({ checked: true, canStart: false, reason: 'error' });
      return null;
    } finally {
      setEligLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'agent' && user?.currentStatus === 'active') {
      refreshEligibility().then(async (data) => {
        if (data?.canStartSurvey && data?.precallSerialNumber) {
          try {
            let draftData = null;
            if (isOnline) {
              try {
                const draftRes = await api.get(`/agent/draft/${data.precallSerialNumber}`);
                draftData = draftRes.data;
              } catch (e) {
                console.error("Network draft fetch failed, trying localIndexedDB...");
              }
            }
            if (!draftData) {
              draftData = await offlineDb.getLocalDraft(data.precallSerialNumber);
            }
            if (draftData && draftData.answers && Object.keys(draftData.answers).length > 0) {
              handleStartCall(data, draftData);
            }
          } catch(e) {}
        }
      });
    }
  }, [user?.role, user?.currentStatus, user?.precallCompletedForActiveSession, isOnline]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (phase === 'questions' || phase === 'interview') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [phase]);

  // Persist answers to API as they change
  useEffect(() => {
    if (mockSurvey) return; // Disable autosave for preview mode
    
    if (phase === 'questions' && user?.id && precallSerialNumber) {
      const cleanedAnswers = { ...answers };
      questions.forEach(qst => {
        const qId = qst.id || qst.questionId || String(qst._id);
        if (qst.allowMultipleOther && cleanedAnswers[qId] && Array.isArray(cleanedAnswers[qId])) {
          cleanedAnswers[qId] = cleanedAnswers[qId].filter(v => typeof v !== 'string' || !v.startsWith('other:') || v.substring(6).trim() !== '');
          if (cleanedAnswers[qId].length === 0 && qst.type === 'single_choice') {
             delete cleanedAnswers[qId];
          }
        }
      });
      const draftData = {
        surveyId: id,
        serialNumber: precallSerialNumber,
        answers: cleanedAnswers,
        otherValues,
        currentIdx,
        currentSectionIdx: survey?.layoutMode === 'multi' ? currentSectionIdx : undefined,
      };
      
      const timeoutId = setTimeout(() => {
        if (isOnline) {
          api.post('/agent/draft', draftData)
            .then(() => setLastSaved(new Date()))
            .catch(async () => {
              await offlineDb.saveLocalDraft(draftData);
              setLastSaved(new Date());
            });
        } else {
          offlineDb.saveLocalDraft(draftData)
            .then(() => setLastSaved(new Date()));
        }
      }, 1000);
      
      return () => clearTimeout(timeoutId);
    }
  }, [answers, currentIdx, currentSectionIdx, phase, user?.id, id, precallSerialNumber, isOnline, survey?.layoutMode]);

  const handleStartCall = async (preloadedData = null, preloadedDraft = null) => {
    if (questions.length === 0) {
      toast.error('This survey has no questions!');
      return;
    }
    // Ignore synthetic React events passed from direct onClick binding
    const actualPreloaded = (preloadedData && (preloadedData.nativeEvent || preloadedData.target || typeof preloadedData.preventDefault === 'function')) ? null : preloadedData;
    const data = actualPreloaded || await refreshEligibility();
    if (!data?.canStartSurvey) {
      toast.error(data?.reason ? t('cannotStartSurveyGeneric') : t('cannotStartSurveyGeneric'));
      return;
    }

    setPrecallSerialNumber(data.precallSerialNumber || '');
    setStartTime(Date.now());
    
    // Merge pre-call answers AND existing survey answers so visibility logic and state are correct
    const initialAnswers = { 
      ...(data.payload || {}),
      ...(data.existingAnswers || {})
    };
    
    let draftAnswers = {};
    let draftIdx = null;
    let draftSecIdx = null;

    if (preloadedDraft) {
      draftAnswers = preloadedDraft.answers || {};
      draftIdx = preloadedDraft.currentIdx;
      draftSecIdx = preloadedDraft.currentSectionIdx;
    } else if (data?.precallSerialNumber) {
      try {
        let draftResData = null;
        if (isOnline) {
          try {
            const draftRes = await api.get(`/agent/draft/${data.precallSerialNumber}`);
            draftResData = draftRes.data;
          } catch (_) {}
        }
        if (!draftResData) {
          draftResData = await offlineDb.getLocalDraft(data.precallSerialNumber);
        }
        if (draftResData && draftResData.answers) {
          draftAnswers = draftResData.answers;
          if (draftResData.otherValues) setOtherValues(draftResData.otherValues);
          draftIdx = draftResData.currentIdx;
          draftSecIdx = draftResData.currentSectionIdx;
        }
      } catch (_) { /* ignore */ }
    }

    const mergedAnswers = { ...initialAnswers, ...draftAnswers };
    setAnswers(mergedAnswers);

    if (draftAnswers) {
      const preloaded = new Set(Object.keys(draftAnswers).filter(k => draftAnswers[k] !== '' && draftAnswers[k] !== null));
      interactedRef.current = preloaded;
      setInteractedQuestions(preloaded);
    }

    const firstIdx = findNextVisibleIdx(0, mergedAnswers);
    if (firstIdx === -1) {
      goToInterviewStep();
    } else {
      setPhase('questions');
      if (typeof draftIdx === 'number' && draftIdx < (questions?.length || 0)) {
        setCurrentIdx(draftIdx);
        if (typeof draftSecIdx === 'number') {
          setCurrentSectionIdx(draftSecIdx);
        } else if (survey?.sections) {
          const qId = questions[draftIdx]?.questionId || String(questions[draftIdx]?._id);
          const secIdx = survey.sections.findIndex(sec =>
            (sec.questions || []).some(q => (q.id || q.questionId || String(q._id)) === qId)
          );
          if (secIdx !== -1) {
            setCurrentSectionIdx(secIdx);
          }
        }
      } else {
        setCurrentIdx(firstIdx);
        if (survey?.sections) {
          const qId = questions[firstIdx]?.questionId || String(questions[firstIdx]?._id);
          const secIdx = survey.sections.findIndex(sec =>
            (sec.questions || []).some(q => (q.id || q.questionId || String(q._id)) === qId)
          );
          if (secIdx !== -1) {
            setCurrentSectionIdx(secIdx);
          }
        }
      }
    }
  };

  const findNextVisibleIdx = (startIndex, currentAnswers) => {
    if (!Array.isArray(questions)) return -1;
    for (let i = startIndex; i < questions.length; i++) {
      const qst = questions[i];
      if (!qst) continue;
      if (!qst.visibility) return i;
      try {
        if (evaluateCondition(qst.visibility, currentAnswers || {})) return i;
      } catch (err) {
        console.error("Condition evaluation error at index", i, err);
        // If visibility logic fails, we show the question to avoid blocking the survey
        return i;
      }
    }
    return -1;
  };

  const goToInterviewStep = () => {
    setPhase('interview');
  };

  const submitResponse = async () => {
    if (mockSurvey) {
      toast.success("Preview submitted successfully!");
      return;
    }

    const finalOutcome = answers.interview_result;
    if (!finalOutcome) {
      toast.error(t('mustSelectInterviewOutcome'));
      return;
    }
    const duration = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
    const finalReason = ['partial', 'refused', 'postponed'].includes(finalOutcome) 
      ? ((answers.outcome_reason || '').trim() || 'none') 
      : '';
      
    const payload = {
      surveyId: survey._id,
      durationSecs: duration,
      answers: Object.keys(answers)
        .filter((k) => {
          const qst = questions.find((q) => q.questionId === k || String(q._id) === k);
          if (!qst) return true; // Not a survey question (e.g. pre-call data)
          if (!qst.visibility) return true;
          try {
            const matched = evaluateCondition(qst.visibility, answers);
            const act = qst.visibility.action || 'show';
            if (act === 'show') return matched;
            if (act === 'hide' || act === 'skip') return !matched;
            return matched;
          } catch (e) {
            return true;
          }
        })
        .map((k) => {
          const qst = questions.find((q) => q.questionId === k || String(q._id) === k);
          let val = answers[k];
          if (qst && qst.allowMultipleOther) {
             if (Array.isArray(val)) {
                val = val.filter(v => typeof v !== 'string' || !v.startsWith('other:') || v.substring(6).trim() !== '');
             }
          } else {
            if (Array.isArray(val)) {
              val = val.map(v => v === 'Other' ? `Other: ${otherValues[k] || ''}` : v);
            } else if (val === 'Other') {
              val = `Other: ${otherValues[k] || ''}`;
            }
          }
          return { questionId: k, value: val };
        }),
      interviewOutcome: finalOutcome,
      outcomeReason: finalReason,
      precallSerialNumber: precallSerialNumber || '',
    };
    const offlinePayload = {
      ...payload,
      serialNumber: precallSerialNumber || '',
      isOfflineSync: true,
      offlineStartedAt: startTime ? new Date(startTime) : new Date(),
      offlineCompletedAt: new Date(),
    };

    if (isOnline) {
      try {
        await api.post('/response', payload);
        if (user?.id) {
          const draftKey = `precallDraft:${user.id}:${survey._id || 'default'}`;
          sessionStorage.removeItem(draftKey);
        }
        await offlineDb.deleteLocalDraft(precallSerialNumber);
        
        try {
          const me = await api.get('/auth/me');
          setUser(me.data.user);
          localStorage.setItem('user', JSON.stringify(me.data.user));
        } catch (_) {}
        toast.success(t('surveySubmittedSuccess') || 'Survey submitted successfully!');
        navigate(`/agent/precall?surveyId=${survey._id}`, { replace: true });
      } catch (err) {
        console.error(err);
        await offlineDb.saveOfflineResponse(offlinePayload);
        await offlineDb.deleteLocalDraft(precallSerialNumber);
        if (user?.id) {
          const draftKey = `precallDraft:${user.id}:${survey._id || 'default'}`;
          sessionStorage.removeItem(draftKey);
        }
        toast.info(t('surveySavedOffline') || 'Survey response saved offline. It will be synced when online.');
        navigate(`/agent/precall?surveyId=${survey._id}`, { replace: true });
      }
    } else {
      await offlineDb.saveOfflineResponse(offlinePayload);
      await offlineDb.deleteLocalDraft(precallSerialNumber);
      if (user?.id) {
        const draftKey = `precallDraft:${user.id}:${survey._id || 'default'}`;
        sessionStorage.removeItem(draftKey);
      }
      toast.info(t('surveySavedOffline') || 'Survey response saved offline. It will be synced when online.');
      navigate(`/agent/precall?surveyId=${survey._id}`, { replace: true });
    }
  };

  const OUTCOME_TKEY = {
    completed: 'precallInterviewCompleted',
    partial: 'precallInterviewPartial',
    refused: 'precallInterviewRefused',
    no_qualified: 'precallInterviewNoQualified',
    postponed: 'precallInterviewPostponed',
    not_contacted: 'precallInterviewNotContacted',
  };

  const toggleChoice = (val) => {
    const q = questions[currentIdx];
    const qId = q.questionId || `q_${currentIdx}`;
    const currArr = Array.isArray(answers[qId]) ? answers[qId] : [];
    
    if (val === 'Other' && q.allowMultipleOther) {
      const hasOther = currArr.some(v => typeof v === 'string' && v.startsWith('other:'));
      if (hasOther) {
        setAnswers({ ...answers, [qId]: currArr.filter(v => typeof v !== 'string' || !v.startsWith('other:')) });
      } else {
        setAnswers({ ...answers, [qId]: [...currArr, "other:"] });
      }
    } else {
      if (currArr.includes(val)) {
        setAnswers({ ...answers, [qId]: currArr.filter(v => v !== val) });
      } else {
        setAnswers({ ...answers, [qId]: [...currArr, val] });
      }
    }
    
    if (fieldErrors[qId]) {
      const newE = {...fieldErrors};
      delete newE[qId];
      setFieldErrors(newE);
    }
  };

  const setSingleChoice = (val, choiceLogic = null) => {
    const q = questions[currentIdx];
    const qId = q.questionId || `q_${currentIdx}`;
    
    if (val === 'Other' && q.allowMultipleOther) {
      setAnswers({ ...answers, [qId]: ["other:"] });
    } else {
      setAnswers({ ...answers, [qId]: val });
      
      // Auto-advance if no custom input is needed
      if (val !== 'Other' && (!choiceLogic || choiceLogic.action !== 'terminate')) {
         // Timeout helps UI feel responsive before jumping
         setTimeout(() => handleNextQuestion(choiceLogic, { ...answers, [qId]: val }), 150);
      }
    }
    
    if (fieldErrors[qId]) {
      const newE = {...fieldErrors};
      delete newE[qId];
      setFieldErrors(newE);
    }
  };

  const getQuestionValidationError = (q, providedAnswers = answers) => {
    // Explicitly bypass validation for informational questions requiring no input
    if (q.type === 'notice' || q.type === 'info') {
      return null;
    }

    const qId = q.id || q.questionId || String(q._id);
    const val = providedAnswers[qId];

    // Check if question is required
    if (q.required) {
      if (val === undefined || val === null || val === '') {
        return t('questionRequired') || 'This question requires an answer';
      }
      if (typeof val === 'string' && val.trim() === '') {
        return t('questionRequired') || 'This question requires an answer';
      }
      if (Array.isArray(val) && val.length === 0) {
        return t('questionRequired') || 'This question requires an answer';
      }
    }

    // Min selections check for multiple_choice
    if (q.type === 'multiple_choice') {
      const arr = Array.isArray(val) ? val : [];
      const validArr = arr.filter(v => !(typeof v === 'string' && v.startsWith('other:') && v.substring(6).trim() === ''));
      if (q.minSelections && validArr.length < q.minSelections) {
        return (t('selectAtLeastN') || 'Please select at least {n} options').replace('{n}', q.minSelections);
      }
      if (q.maxSelections && validArr.length > q.maxSelections) {
        return `Please select at most ${q.maxSelections} options.`;
      }
    }

    // Custom Other input validation
    const hasOtherSelected = q.allowMultipleOther
      ? (Array.isArray(val) && val.some(v => typeof v === 'string' && v.startsWith('other:')))
      : (q.type === 'multiple_choice' ? (Array.isArray(val) && val.includes('Other')) : val === 'Other');

    if (hasOtherSelected) {
      if (q.allowMultipleOther) {
        const arr = Array.isArray(val) ? val : [];
        const validOthers = arr.filter(v => typeof v === 'string' && v.startsWith('other:') && v.substring(6).trim() !== '');
        if (validOthers.length === 0) {
          return t('otherAnswerRequired') || 'Please specify the other answer';
        }
      } else {
        if (!(otherValues[qId] || '').trim()) {
          return t('otherAnswerRequired') || 'Please specify the other answer';
        }
      }
    }

    // Composite Multi-Input check
    if (q.type === 'multi_input') {
      const objVal = typeof val === 'object' && val !== null ? val : {};
      for (const sub of (q.subInputs || [])) {
        if (sub.required) {
          const subVal = objVal[sub.id];
          if (subVal === undefined || subVal === null || String(subVal).trim() === '') {
            return t('questionRequired') || 'Please fill all required sub-inputs';
          }
        }
      }
    }

    // Number digit constraints check
    if (q.type === 'number' && val !== undefined && val !== null && val !== '') {
      const digitCount = String(val).replace(/[^0-9]/g, '').length;
      if (q.minLength && digitCount < q.minLength) return `Must have at least ${q.minLength} digits`;
      if (q.maxLength && digitCount > q.maxLength) return `Must have at most ${q.maxLength} digits`;
    }

    if (q.crossValidation && q.crossValidation.ruleType === 'sum_equals') {
      const targetIds = q.crossValidation.targetQuestionIds || (q.crossValidation.targetQuestionId ? [q.crossValidation.targetQuestionId] : []);
      if (targetIds.length > 0) {
        let expected = 0;
        let hasValidTarget = false;
        for (const tid of targetIds) {
          const tVal = providedAnswers[tid];
          if (tVal !== undefined && tVal !== null && tVal !== '') {
            hasValidTarget = true;
            if (typeof tVal === 'object') {
              expected += Object.values(tVal).reduce((acc, v) => acc + (parseFloat(v) || 0), 0);
            } else {
              expected += parseFloat(tVal) || 0;
            }
          }
        }
        
        if (hasValidTarget) {
          let sumVal = 0;
          if (q.type === 'multi_input' && typeof val === 'object' && val !== null) {
            sumVal = Object.values(val).reduce((acc, v) => acc + (parseFloat(v) || 0), 0);
          } else {
            sumVal = parseFloat(val) || 0;
          }

          if (q.type === 'number_ratio') {
            const derivedSum = (sumVal / 100) * expected;
            if (derivedSum !== expected) {
              return q.crossValidation.errorMessage || `Total percentage must equal 100% (Derived total: ${derivedSum}, Target: ${expected})`;
            }
          } else {
            if (sumVal !== expected) {
              return q.crossValidation.errorMessage || `The sum must equal ${expected}`;
            }
          }
        }
      }
    }

    return null;
  };

  const canProceedFromQuestion = (question) => {
    const qId = question.questionId || String(question._id);
    // Exception 1: hidden by branching logic — never reached, but guard anyway
    if (!visibleQuestions[qId]) return true;

    // Exception 2: info/notice display type — always passable
    if (question.type === 'info' || question.type === 'notice') return true;

    // Exception 3: explicitly marked optional in builder
    if (question.optional === true) return true;

    // Read from the ref (not the state) to avoid stale-closure bugs when called
    // inside setTimeout callbacks (e.g. auto-advance after single-choice click).
    return interactedRef.current.has(qId);
  };

  const proceedToNext = (choiceLogic = null, providedAnswers = answers) => {
    const currentQ = questions[currentIdx];
    const qId = currentQ.questionId || String(currentQ._id);

    // Validate only the current question (existing logic)
    if (visibleQuestions[qId] !== false) {
      const err = getQuestionValidationError(currentQ, providedAnswers);
      if (err) {
        setFieldErrors(prev => ({ ...prev, [qId]: err }));
        return; // BLOCK ADVANCING
      }
    }

    setFieldErrors(prev => {
      const next = { ...prev };
      delete next[qId];
      return next;
    });

    const val = providedAnswers[qId];
    let activeChoiceLogic = choiceLogic;
    if (!activeChoiceLogic && currentQ.type === 'single_choice' && currentQ.choices) {
      const selectedChoice = currentQ.choices.find(c => c.text === val);
      if (selectedChoice?.logic) {
        activeChoiceLogic = selectedChoice.logic;
      }
    }

    if (activeChoiceLogic && activeChoiceLogic.action) {
      if (activeChoiceLogic.action === 'terminate') {
        goToInterviewStep();
        return;
      }
      if (activeChoiceLogic.action === 'skip' && activeChoiceLogic.skipToQuestionId) {
        const targetIdx = questions.findIndex((qst) => qst.questionId === activeChoiceLogic.skipToQuestionId);
        if (targetIdx !== -1) {
          const nextIdx = findNextVisibleIdx(targetIdx, providedAnswers);
          if (nextIdx !== -1) {
            setCurrentIdx(nextIdx);
          } else {
            goToInterviewStep();
          }
          return;
        }
      }
    }

    // If this question is in a group, validate ALL group members and jump past the entire group
    if (currentQ._groupId) {
      const groupQs = questions.filter(q => q._groupId === currentQ._groupId);
      // Validate all group questions
      let hasError = false;
      const newErrors = { ...fieldErrors };
      for (const gq of groupQs) {
        const gqId = gq.id || gq.questionId || String(gq._id);
        if (visibleQuestions[gqId] !== false) {
          const err = getQuestionValidationError(gq, providedAnswers);
          if (err) {
            newErrors[gqId] = err;
            hasError = true;
          }
        }
      }
      
      // Cross-Question Validation for Group
      const firstGq = groupQs[0];
      if (!hasError && firstGq?._groupCrossValidation && firstGq._groupCrossValidation.ruleType === 'sum_equals') {
        const targetIds = firstGq._groupCrossValidation.targetQuestionIds || (firstGq._groupCrossValidation.targetQuestionId ? [firstGq._groupCrossValidation.targetQuestionId] : []);
        if (targetIds.length > 0) {
          let expected = 0;
          let hasValidTarget = false;
          for (const tid of targetIds) {
            const tVal = providedAnswers[tid];
            if (tVal !== undefined && tVal !== null && tVal !== '') {
              hasValidTarget = true;
              if (typeof tVal === 'object') {
                expected += Object.values(tVal).reduce((acc, v) => acc + (parseFloat(v) || 0), 0);
              } else {
                expected += parseFloat(tVal) || 0;
              }
            }
          }
          
          if (hasValidTarget) {
            let currentSum = 0;
            for (const gq of groupQs) {
              const gqId = gq.id || gq.questionId || String(gq._id);
              if (visibleQuestions[gqId] !== false) {
                const val = providedAnswers[gqId];
                if (gq.type === 'multi_input' && typeof val === 'object' && val !== null) {
                  currentSum += Object.values(val).reduce((acc, v) => acc + (parseFloat(v) || 0), 0);
                } else {
                  currentSum += parseFloat(val) || 0;
                }
              }
            }
            if (currentSum !== expected) {
              // Apply error to the last visible question in the group so it renders at the bottom
              const lastVisibleGq = [...groupQs].reverse().find(gq => visibleQuestions[gq.id || gq.questionId || String(gq._id)] !== false);
              if (lastVisibleGq) {
                const lastGqId = lastVisibleGq.questionId || String(lastVisibleGq._id);
                newErrors[lastGqId] = firstGq._groupCrossValidation.errorMessage || `The sum of this group must equal ${expected}`;
                hasError = true;
              }
            }
          }
        }
      }
      if (hasError) {
        setFieldErrors(newErrors);
        return;
      }
      // Jump to the first question after the entire group
      const lastInGroup = questions.findLastIndex(q => q._groupId === currentQ._groupId);
      const nextIdx = findNextVisibleIdx(lastInGroup + 1, providedAnswers);
      if (nextIdx !== -1) {
        setCurrentIdx(nextIdx);
      } else {
        goToInterviewStep();
      }
      return;
    }

    const nextIdx = findNextVisibleIdx(currentIdx + 1, providedAnswers);
    if (nextIdx !== -1) {
      setCurrentIdx(nextIdx);
    } else {
      goToInterviewStep();
    }
  };

  const handleNextQuestion = (choiceLogic = null, providedAnswers = answers) => {
    const currentQ = questions[currentIdx];
    if (!currentQ) return;

    // Step 8: Quality and admin bypass
    if (user?.role === 'quality' || user?.role === 'admin') {
      proceedToNext(choiceLogic, providedAnswers);
      return;
    }

    // Step 4: Validate interaction
    if (canProceedFromQuestion(currentQ)) {
      proceedToNext(choiceLogic, providedAnswers);
    } else {
      setShowInteractionError(true);
    }
  };

  useEffect(() => {
    setShowInteractionError(false);
  }, [currentIdx]);
  const handlePrevious = () => {
    let prevIdx = currentIdx - 1;
    while (prevIdx >= 0) {
      if (questions[prevIdx]?.visibility) {
        try {
          if (evaluateCondition(questions[prevIdx].visibility, answers)) break;
        } catch (e) {
          break; // Show if error
        }
      } else {
        break; // No visibility logic = visible
      }
      prevIdx--;
    }
    if (prevIdx >= 0) {
      setCurrentIdx(prevIdx);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (phase !== 'questions') return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'ArrowLeft') {
          if (survey?.layoutMode === 'multi') {
            handlePreviousSection();
          } else {
            handlePrevious();
          }
        }
        if (e.key === 'ArrowRight') {
          if (survey?.layoutMode === 'multi') {
            proceedToNextSection();
          } else {
            handleNextQuestion();
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIdx, currentSectionIdx, phase, answers, questions, survey?.layoutMode]);



  const isSectionVisible = useCallback((secIdx, currentAnswers = answers) => {
    if (!survey?.sections || !survey.sections[secIdx]) return false;
    const sec = survey.sections[secIdx];
    return (sec.questions || []).some(q => {
      const qId = q.id || q.questionId || String(q._id);
      if (!q.visibility) return true;
      try {
        return evaluateCondition(q.visibility, currentAnswers);
      } catch (e) {
        return true;
      }
    });
  }, [survey, answers]);

  const visibleSectionIndices = useMemo(() => {
    const list = [];
    if (!survey?.sections) return list;
    survey.sections.forEach((_, idx) => {
      if (isSectionVisible(idx, answers)) {
        list.push(idx);
      }
    });
    return list;
  }, [survey, answers, isSectionVisible]);

  const pageStats = useMemo(() => {
    if (!survey?.sections) return { X: 1, Y: 1 };
    const visibleSecs = survey.sections.map((_, idx) => idx).filter(idx => isSectionVisible(idx, answers));
    const Y = visibleSecs.length;
    const currentPos = visibleSecs.indexOf(currentSectionIdx);
    const X = currentPos !== -1 ? currentPos + 1 : 1;
    return { X, Y };
  }, [survey, currentSectionIdx, answers, isSectionVisible]);

  const validateCurrentSection = () => {
    const errors = {};
    const currentSection = survey?.sections?.[currentSectionIdx];
    if (!currentSection) return errors;

    const questionsInSec = (currentSection.questions || []).flatMap(item =>
      item.type === 'group' ? (item.questions || []).map(inner => ({ ...inner, _groupCrossValidation: item.crossValidation })) : [item]
    );

    const visibleQuestionsInSec = questionsInSec.filter(q => {
      const qId = q.id || q.questionId || String(q._id);
      return visibleQuestions[qId] !== false;
    });

    visibleQuestionsInSec.forEach(q => {
      const qId = q.id || q.questionId || String(q._id);
      if (q.type === 'info' || q.type === 'notice' || q.optional === true) {
        return;
      }

      const isStaff = user?.role === 'quality' || user?.role === 'admin';
      if (!isStaff && !interactedRef.current.has(qId)) {
        errors[qId] = t('questionInteractionRequired') || 'Answer is required.';
        return;
      }

      const err = getQuestionValidationError(q, answers);
      if (err) {
        errors[qId] = err;
      }
    });

    return errors;
  };

  const proceedToNextSection = () => {
    const errors = validateCurrentSection();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(prev => ({ ...prev, ...errors }));
      return;
    }

    const currentSection = survey?.sections?.[currentSectionIdx];
    setFieldErrors(prev => {
      const next = { ...prev };
      (currentSection?.questions || []).forEach(q => {
        const qId = q.id || q.questionId || String(q._id);
        delete next[qId];
      });
      return next;
    });

    const visibleQuestionsInSec = (currentSection?.questions || []).filter(q => {
      const qId = q.id || q.questionId || String(q._id);
      return visibleQuestions[qId] !== false;
    });

    let activeChoiceLogic = null;
    for (const q of visibleQuestionsInSec) {
      const qId = q.id || q.questionId || String(q._id);
      const val = answers[qId];
      if (q.type === 'single_choice' && q.choices) {
        const selectedChoice = q.choices.find(c => c.text === val);
        if (selectedChoice?.logic) {
          activeChoiceLogic = selectedChoice.logic;
          break;
        }
      }
    }

    if (activeChoiceLogic && activeChoiceLogic.action) {
      if (activeChoiceLogic.action === 'terminate') {
        goToInterviewStep();
        return;
      }
      if (activeChoiceLogic.action === 'skip' && activeChoiceLogic.skipToQuestionId) {
        const targetIdx = questions.findIndex((qst) => qst.questionId === activeChoiceLogic.skipToQuestionId);
        if (targetIdx !== -1) {
          const targetQ = questions[targetIdx];
          const targetQId = targetQ.questionId || String(targetQ._id);
          const targetSecIdx = survey.sections.findIndex(sec => 
            (sec.questions || []).some(q => (q.id || q.questionId || String(q._id)) === targetQId)
          );
          
          if (targetSecIdx !== -1) {
            let nextSecIdx = targetSecIdx;
            while (nextSecIdx < survey.sections.length) {
              if (isSectionVisible(nextSecIdx, answers)) {
                setCurrentSectionIdx(nextSecIdx);
                const firstQOfSec = survey.sections[nextSecIdx].questions[0];
                if (firstQOfSec) {
                  const firstQId = firstQOfSec.questionId || String(firstQOfSec._id);
                  const flatIdx = questions.findIndex(q => (q.id || q.questionId || String(q._id)) === firstQId);
                  if (flatIdx !== -1) setCurrentIdx(flatIdx);
                }
                return;
              }
              nextSecIdx++;
            }
            goToInterviewStep();
            return;
          }
        }
      }
    }

    let nextSecIdx = currentSectionIdx + 1;
    while (nextSecIdx < survey.sections.length) {
      if (isSectionVisible(nextSecIdx, answers)) {
        setCurrentSectionIdx(nextSecIdx);
        const firstQOfSec = survey.sections[nextSecIdx].questions[0];
        if (firstQOfSec) {
          const firstQId = firstQOfSec.questionId || String(firstQOfSec._id);
          const flatIdx = questions.findIndex(q => (q.id || q.questionId || String(q._id)) === firstQId);
          if (flatIdx !== -1) setCurrentIdx(flatIdx);
        }
        return;
      }
      nextSecIdx++;
    }

    goToInterviewStep();
  };

  const handlePreviousSection = () => {
    let prevSecIdx = currentSectionIdx - 1;
    while (prevSecIdx >= 0) {
      if (isSectionVisible(prevSecIdx, answers)) {
        setCurrentSectionIdx(prevSecIdx);
        const firstQOfSec = survey.sections[prevSecIdx].questions[0];
        if (firstQOfSec) {
          const firstQId = firstQOfSec.questionId || String(firstQOfSec._id);
          const flatIdx = questions.findIndex(q => (q.id || q.questionId || String(q._id)) === firstQId);
          if (flatIdx !== -1) setCurrentIdx(flatIdx);
        }
        return;
      }
      prevSecIdx--;
    }
  };

  const jumpToQuestionIdx = (idx) => {
    const isStaff = user?.role === 'quality' || user?.role === 'admin';
    if (!isStaff && idx > maxReachedIdx) {
      return;
    }
    setCurrentIdx(idx);
    const targetQ = questions[idx];
    if (targetQ && survey?.sections) {
      const qId = targetQ.questionId || String(targetQ._id);
      const secIdx = survey.sections.findIndex(sec =>
        (sec.questions || []).some(q => (q.id || q.questionId || String(q._id)) === qId)
      );
      if (secIdx !== -1) {
        setCurrentSectionIdx(secIdx);
      }
    }
  };

  const progressStats = useMemo(() => {
    let totalVisible = 0;
    let answeredVisible = 0;

    questions.forEach(q => {
      const qId = q.id || q.questionId || String(q._id);
      if (visibleQuestions[qId] !== false) {
        totalVisible++;
        const ans = answers[qId];
        if (ans !== undefined && ans !== null && ans !== '') {
          if (Array.isArray(ans)) {
            const valid = ans.filter(v => typeof v !== 'string' || !v.startsWith('other:') || v.substring(6).trim() !== '');
            if (valid.length > 0) {
              answeredVisible++;
            }
          } else {
            answeredVisible++;
          }
        }
      }
    });

    const percentage = totalVisible > 0 ? Math.round((answeredVisible / totalVisible) * 100) : 0;
    return {
      X: answeredVisible,
      Y: totalVisible,
      percentage
    };
  }, [questions, answers, visibleQuestions]);

  const currentVisibleNumber = useMemo(() => {
    let num = 1;
    questions.forEach((q, idx) => {
      const qId = q.id || q.questionId || String(q._id);
      if (visibleQuestions[qId] !== false && idx < currentIdx) {
        num++;
      }
    });
    return num;
  }, [questions, visibleQuestions, currentIdx]);

  // Handle draft resume scrolling and default open section index
  // Must also live above all early returns — Rules of Hooks
  useEffect(() => {
    if (questions.length > 0 && survey?.sections && phase === 'questions') {
      const targetQ = questions[currentIdx];
      if (targetQ) {
        const qId = targetQ.questionId || String(targetQ._id);
        const secIdx = survey.sections.findIndex(sec =>
          (sec.questions || []).some(q => (q.id || q.questionId || String(q._id)) === qId)
        );
        if (secIdx !== -1) {
          setDefaultOpenSectionIdx(secIdx);
          setOpenSections(prev => ({ ...prev, [secIdx]: true }));
        }

        const timer = setTimeout(() => {
          const el = document.getElementById(`question-card-${qId}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 300);
        return () => clearTimeout(timer);
      }
    }
  }, [questions, survey, currentIdx, phase]);
  // ─────────────────────────────────────────────────────────────────────────

  if (!survey) return <div className="container">{t('loading')}</div>;

  // Intro
  if (phase === 'intro') {
    return (
      <div className="glass-card fade-enter-active">
        <h1 dir="auto">{survey.title}</h1>
        {survey.introScript && (
          <div className="agent-script-box">
            <strong style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{t('agentReadAloud')}</strong>
            {survey.introScript}
          </div>
        )}
        {user?.role === 'agent' && eligibility.checked && !eligibility.canStart && (
          <p dir="auto" style={{ color: 'var(--danger)', fontWeight: 700, marginBottom: '1rem' }}>{t('cannotStartSurveyGeneric')}</p>
        )}
        <button dir="auto"
          className="btn-primary"
          onClick={() => handleStartCall()}
          disabled={user?.role === 'agent' && (eligLoading || (eligibility.checked && !eligibility.canStart))}
        >
          {t('startQuestionnaire')}
        </button>
        {precallSerialNumber && (
          <button dir="auto"
            type="button"
            className="btn-secondary"
            onClick={() => setIsHandoverOpen(true)}
            style={{ marginTop: '1rem', marginInlineStart: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <UserPlus size={18} />
            {t('handover') || 'Handover Call'}
          </button>
        )}

        <HandoverModal 
            isOpen={isHandoverOpen} 
            onClose={() => setIsHandoverOpen(false)}
            serialNumber={precallSerialNumber}
            onSuccess={() => navigate('/', { replace: true })}
        />
      </div>
    );
  }

  // Final interview outcome (required)
  if (phase === 'interview') {
    return (
      <div className="glass-card fade-enter-active">
        <h2 dir="auto">{t('surveyInterviewOutcomeTitle')}</h2>
        <p dir="auto" style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>{t('surveyInterviewOutcomeHelp')}</p>
        <select
          className="input-field"
          style={{ marginBottom: '1rem', maxWidth: '100%' }}
          value={answers.interview_result || ''}
          onChange={(e) => setAnswers({ ...answers, interview_result: e.target.value })}
        >
          <option value="">{t('precallSelectPlaceholder')}</option>
          {INTERVIEW_OUTCOME_OPTIONS.map((v) => (
            <option key={v} value={v}>
              {t(OUTCOME_TKEY[v])}
            </option>
          ))}
        </select>
        {['partial', 'refused', 'postponed'].includes(answers.interview_result) && (
          <div style={{ marginBottom: '1rem' }}>
            <label dir="auto" style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
              {t('reason') || 'Reason'}
            </label>
            <textarea dir="auto"
              className="input-field"
              rows={3}
              placeholder={t('typeReasonPlaceholder') || 'Type reason here... (defaults to "none" if empty)'}
              value={answers.outcome_reason || ''}
              onChange={(e) => setAnswers({ ...answers, outcome_reason: e.target.value })}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          <button dir="auto" type="button" className="btn-primary" onClick={() => submitResponse()} disabled={!answers.interview_result}>
            {t('submitSurvey')}
          </button>
          <button dir="auto" type="button" className="btn-secondary" onClick={() => navigate('/agent/precall')}>
            {t('backToChecklist')}
          </button>
        </div>
      </div>
    );
  }

  // Questions phase rendering below

  const scrollToNextInGroup = (answeredQId, latestAnswers) => {
    const answeredQ = questions.find(q => (q.id || q.questionId || String(q._id)) === answeredQId);
    if (!answeredQ || !answeredQ._groupId) return;

    const groupQs = questions.filter(q => q._groupId === answeredQ._groupId);
    const visibleGroupQs = groupQs.filter(gq => {
      const gqId = gq.id || gq.questionId || String(gq._id);
      if (!gq.visibility) return true;
      try {
        return evaluateCondition(gq.visibility, latestAnswers);
      } catch (e) {
        return true;
      }
    });

    const answeredIdx = visibleGroupQs.findIndex(gq => (gq.id || gq.questionId || String(gq._id)) === answeredQId);
    if (answeredIdx === -1) return;

    if (answeredIdx < visibleGroupQs.length - 1) {
      const nextQ = visibleGroupQs[answeredIdx + 1];
      const nextQId = nextQ.questionId || String(nextQ._id);
      const element = document.getElementById(`question-card-${nextQId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const input = element.querySelector('input, select, textarea, button');
        if (input) input.focus({ preventScroll: true });
      }
    } else {
      const nextButton = document.querySelector('.survey-bottom-bar .btn-primary');
      if (nextButton) {
        nextButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
        nextButton.focus({ preventScroll: true });
      }
    }
  };

  const handleAnswerChange = (questionId, value) => {
    activeInputIdRef.current = document.activeElement?.id;
    setAnswers(prev => ({ ...prev, [questionId]: value }));
    markInteracted(questionId);
    if (fieldErrors[questionId]) {
      setFieldErrors(prev => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
    }

    // Auto-scroll on answering a group question
    const q = questions.find(qst => (qst.id || qst.questionId || String(qst._id)) === questionId);
    const autoScrollTypes = ['single_choice', 'boolean', 'rating', 'dropdown'];
    if (q && q._groupId && autoScrollTypes.includes(q.type) && value !== undefined && value !== null && value !== '') {
      const latestAnswers = { ...answers, [questionId]: value };
      setTimeout(() => {
        scrollToNextInGroup(questionId, latestAnswers);
      }, 100);
    }
  };

  const toggleChoiceForQuestion = (q, val) => {
    const qId = q.id || q.questionId || String(q._id);
    const currArr = Array.isArray(answers[qId]) ? answers[qId] : [];
    let updated;
    if (val === 'Other' && q.allowMultipleOther) {
      const hasOther = currArr.some(v => typeof v === 'string' && v.startsWith('other:'));
      if (hasOther) {
        updated = currArr.filter(v => typeof v !== 'string' || !v.startsWith('other:'));
      } else {
        updated = [...currArr, "other:"];
      }
    } else {
      if (currArr.includes(val)) {
        updated = currArr.filter(v => v !== val);
      } else {
        updated = [...currArr, val];
      }
    }
    
    handleAnswerChange(qId, updated);
    
    if (fieldErrors[qId]) {
      const newE = { ...fieldErrors };
      delete newE[qId];
      setFieldErrors(newE);
    }
  };

  const setSingleChoiceForQuestion = (q, val, choiceLogic = null) => {
    const qId = q.id || q.questionId || String(q._id);
    
    if (val === 'Other' && q.allowMultipleOther) {
      handleAnswerChange(qId, ["other:"]);
    } else {
      handleAnswerChange(qId, val);
      
      // Auto-advance if not choosing 'Other', layout is not multi, and logic isn't to terminate
      if (survey?.layoutMode !== 'multi' && !q._groupId) {
        if (val !== 'Other' && (!choiceLogic || choiceLogic.action !== 'terminate')) {
          setTimeout(() => handleNextQuestion(choiceLogic, { ...answers, [qId]: val }), 150);
        } else if (val !== 'Other' && choiceLogic?.action === 'terminate') {
          goToInterviewStep();
        }
      }
    }
    
    if (fieldErrors[qId]) {
      const newE = { ...fieldErrors };
      delete newE[qId];
      setFieldErrors(newE);
    }
  };

  

  

  return (
    <DebugErrorBoundary>
      <div className="survey-layout" dir={isRtl ? 'rtl' : 'ltr'}>
        {/* Sidebar Overlay */}
        {sidebarVisible && (
          <div className="survey-sidebar-overlay desktop-hidden" onClick={() => setSidebarVisible(false)} />
        )}

        {/* Sidebar */}
        <div className={`survey-sidebar ${sidebarVisible ? 'open' : 'collapsed'}`} style={{ width: '300px' }}>
          <h3 dir="auto" style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: 700 }}>{t('sections') || 'Sections'}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {survey.sections && survey.sections.map((sec, sIdx) => {
              // Flatten groups for sidebar visibility and count
              const rawQsInSec = sec.questions || [];
              const flatQsInSec = rawQsInSec.flatMap(item =>
                item.type === 'group' ? (item.questions || []).map(inner => ({ ...inner, _groupId: item.groupId, _groupLabel: item.label, _groupCrossValidation: item.crossValidation })) : [item]
              );
              const visibleQuestionsInSec = flatQsInSec.filter((q) => {
                const qId = q.id || q.questionId || String(q._id);
                return visibleQuestions[qId] !== false;
              });

              if (visibleQuestionsInSec.length === 0) return null;

              // Build sidebar items: groups become a single item
              const seenGroupIds = new Set();
              const sidebarItems = [];
              for (const q of visibleQuestionsInSec) {
                if (q._groupId) {
                  if (!seenGroupIds.has(q._groupId)) {
                    seenGroupIds.add(q._groupId);
                    sidebarItems.push({ _isGroup: true, _groupId: q._groupId, _groupLabel: q._groupLabel, _firstQ: q });
                  }
                } else {
                  sidebarItems.push(q);
                }
              }


              const isOpen = !!openSections[sIdx];
              const ArrowIcon = isOpen ? ChevronDown : (isRtl ? ChevronLeft : ChevronRight);

              return (
                <div key={sIdx} className="sidebar-section-card" style={{ marginBottom: '0.25rem' }}>
                  <div
                    className="sidebar-section-header"
                    onClick={() => setOpenSections(prev => ({ ...prev, [sIdx]: !prev[sIdx] }))}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      userSelect: 'none',
                      padding: '0.6rem 0.75rem',
                      background: 'var(--surface-hover)',
                      borderRadius: '6px',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                      <ArrowIcon size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                      <span dir="auto" style={{ fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sec.title}>
                        {sec.title || `${t('section') || 'Section'} ${sIdx + 1}`}
                      </span>
                    </div>
                    {completedSections[sIdx] ? (
                      <Check size={14} style={{ color: 'var(--success)', flexShrink: 0 }} />
                    ) : (
                      <span dir="auto" style={{ fontSize: '0.75rem', background: 'var(--primary-low)', color: 'var(--primary)', padding: '0.1rem 0.4rem', borderRadius: '10px', fontWeight: 'bold', flexShrink: 0 }}>
                        {sidebarItems.length}
                      </span>
                    )}
                  </div>

                  {isOpen && (
                    <div className="sidebar-section-content" style={{ padding: '0.25rem 0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', background: 'var(--surface)' }}>
                      {sidebarItems.map((qst, siIdx) => {
                        // Group node
                        if (qst._isGroup) {
                          const firstQ = qst._firstQ;
                          const firstQId = firstQ.questionId || String(firstQ._id);
                          const firstIdx = questions.findIndex(q => (q.id || q.questionId || String(q._id)) === firstQId);
                          const isCurrent = firstIdx === currentIdx || (questions[currentIdx]?._groupId === qst._groupId);
                          const isStaff = user?.role === 'quality' || user?.role === 'admin';
                          const isLocked = !isStaff && firstIdx > maxReachedIdx;
                          // Check if all group questions answered
                          const groupFlat = questions.filter(q => q._groupId === qst._groupId);
                          const allGroupAnswered = groupFlat.every(q => {
                            if (q.type === 'info' || q.type === 'notice' || q.optional === true) return true;
                            const gqId = q.id || q.questionId || String(q._id);
                            const v = answers[gqId];
                            return v !== undefined && v !== null && v !== '';
                          });

                          return (
                            <div
                              key={`grp-${qst._groupId}`}
                              className={`sidebar-question-item ${isCurrent ? 'current' : ''} ${allGroupAnswered ? 'answered' : ''} ${isLocked ? 'locked' : ''}`}
                              onClick={() => { if (!isLocked) jumpToQuestionIdx(firstIdx); }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.4rem 0.6rem',
                                borderRadius: '4px',
                                cursor: isLocked ? 'not-allowed' : 'pointer',
                                fontSize: '0.8rem',
                                color: isLocked ? 'var(--text-secondary)' : 'var(--primary)',
                                opacity: isLocked ? 0.6 : 1,
                                background: isCurrent ? 'var(--primary-low)' : 'transparent',
                                border: isCurrent ? '1px solid var(--primary)' : '1px dashed hsla(var(--p-h), var(--p-s), var(--p-l), 0.3)',
                                transition: 'all 0.2s ease',
                                fontWeight: isCurrent ? '700' : '600',
                              }}
                            >
                              <span dir="auto" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '16px', flexShrink: 0 }}>
                                {isLocked ? <Lock size={12} style={{ opacity: 0.5 }} /> : allGroupAnswered ? <Check size={12} style={{ color: 'var(--success)' }} /> : <span dir="auto" style={{ fontSize: '0.7rem' }}>⬡</span>}
                              </span>
                              <span dir="auto" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                {qst._groupLabel || (t('questionGroupLabel') || 'Group')}
                              </span>
                              <span dir="auto" style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>({groupFlat.length})</span>
                            </div>
                          );
                        }

                        // Regular question node
                        const qId = qst.id || qst.questionId || String(qst._id);
                        const idx = questions.findIndex(q => (q.id || q.questionId || String(q._id)) === qId);
                        const isCurrent = idx === currentIdx;
                        const isAnswered = answers[qId] !== undefined && answers[qId] !== null && answers[qId] !== '';
                        const isStaff = user?.role === 'quality' || user?.role === 'admin';
                        const isLocked = !isStaff && idx > maxReachedIdx;

                        let statusIcon = null;
                        if (isLocked) {
                          statusIcon = <Lock size={12} style={{ color: 'var(--text-secondary)', opacity: 0.5 }} />;
                        } else if (isAnswered) {
                          statusIcon = <Check size={12} style={{ color: 'var(--success)' }} />;
                        } else if (isCurrent) {
                          statusIcon = <span dir="auto" style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--primary)' }} />;
                        } else {
                          statusIcon = <span dir="auto" style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--border-color)' }} />;
                        }

                        const displayTitle = qst.text && qst.text.length > 40
                          ? qst.text.slice(0, 40) + '...'
                          : qst.text || `${t('question') || 'Question'} ${idx + 1}`;

                        return (
                          <div
                            key={idx}
                            className={`sidebar-question-item ${isCurrent ? 'current' : ''} ${isAnswered ? 'answered' : ''} ${isLocked ? 'locked' : ''}`}
                            onClick={() => {
                              if (!isLocked) jumpToQuestionIdx(idx);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              padding: '0.4rem 0.6rem',
                              borderRadius: '4px',
                              cursor: isLocked ? 'not-allowed' : 'pointer',
                              fontSize: '0.8rem',
                              color: isLocked ? 'var(--text-secondary)' : 'var(--text-primary)',
                              opacity: isLocked ? 0.6 : 1,
                              background: isCurrent ? 'var(--primary-low)' : 'transparent',
                              border: isCurrent ? '1px solid var(--primary)' : '1px solid transparent',
                              transition: 'all 0.2s ease',
                              fontWeight: isCurrent ? '600' : 'normal',
                            }}
                            title={qst.text}
                          >
                            <span dir="auto" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '16px', flexShrink: 0 }}>
                              {statusIcon}
                            </span>
                            <span dir="auto" style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              flex: 1,
                              textAlign: 'start'
                            }}>
                              {displayTitle}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Main Content */}
        <div className="survey-main">
          {/* Universal Toggle Button */}
          <div style={{ padding: '1rem 2rem 0', display: 'flex', alignItems: 'center' }}>
            <button dir="auto" 
              type="button"
              className="btn-secondary" 
              onClick={() => setSidebarVisible(!sidebarVisible)}
              title={sidebarVisible ? "Collapse Sidebar (Focus Mode)" : "Expand Sidebar"}
              style={{ padding: '0.5rem 0.75rem', display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}
            >
              <Menu size={20} />
              <span dir="auto" style={{ fontSize: '0.85rem', fontWeight: 600 }}>{sidebarVisible ? 'Focus Mode' : 'Show Sidebar'}</span>
            </button>
          </div>
          <div className="survey-content" style={{ paddingTop: '1rem' }}>
            <div className="survey-progress-container">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                {survey?.layoutMode === 'multi' ? (
                  <span dir="auto">{t('page') || 'Page'} {pageStats.X} {t('of') || 'of'} {pageStats.Y}</span>
                ) : (
                  <span dir="auto">Question {currentVisibleNumber} of {progressStats.Y}</span>
                )}
                <span dir="auto">{progressStats.percentage}% completed</span>
              </div>
              <div className="survey-progress-bar-bg">
                <div className="survey-progress-bar-fill" style={{ width: `${progressStats.percentage}%` }}></div>
              </div>
            </div>

            {survey?.layoutMode === 'multi' ? (
              (() => {
                const currentSection = survey.sections[currentSectionIdx];
                if (!currentSection) return <div>No valid section data found.</div>;
                
                return (
                  <div key={currentSectionIdx} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {currentSection.title && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'var(--primary-low)', color: 'var(--primary)', borderRadius: '6px', fontSize: '0.9rem', fontWeight: 700, alignSelf: 'flex-start' }}>
                        {currentSection.title}
                      </div>
                    )}
                    {(currentSection.questions || []).map((q, qIdx) => {
                      if (q.type === 'group') {
                        const visibleGroupQs = (q.questions || []).filter(gq => {
                          const gqId = gq.id || gq.questionId || String(gq._id);
                          return visibleQuestions[gqId] !== false;
                        });
                        if (visibleGroupQs.length === 0) return null;
                        return (
                          <div key={`grp-card-${q.groupId || qIdx}`} className="question-group-box">
                            <div className="question-group-header">
                              <span dir="auto">⬡</span>
                              <span dir="auto">{q.label || (t('questionGroupLabel') || 'Question Group')}</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>
                              {visibleGroupQs.map((gq, gi) => {
                                let isLocked = false;
                                if (gi > 0) {
                                  isLocked = visibleGroupQs.slice(0, gi).some(prevQ => {
                                    if (prevQ.type === 'info' || prevQ.type === 'notice') return false;
                                    const prevQId = prevQ.id || prevQ.questionId || String(prevQ._id);
                                    const val = answers[prevQId];
                                    return val === undefined || val === null || val === '';
                                  });
                                }
                                return <QuestionRenderer key={gq.id || gq.questionId || String(gq._id)} q={gq} sIdx={currentSectionIdx} qIdx={gi} isLocked={isLocked} questions={questions} answers={answers} isRtl={isRtl} t={t} toggleChoiceForQuestion={toggleChoiceForQuestion} setSingleChoiceForQuestion={setSingleChoiceForQuestion} handleAnswerChange={handleAnswerChange} otherValues={otherValues} setOtherValues={setOtherValues} markInteracted={markInteracted} fieldErrors={fieldErrors} setFieldErrors={setFieldErrors} scrollToNextInGroup={scrollToNextInGroup} survey={survey} handleNextQuestion={handleNextQuestion} showInteractionError={showInteractionError} activeInputIdRef={activeInputIdRef} />;
                              })}
                            </div>
                          </div>
                        );
                      } else {
                        const qId = q.id || q.questionId || String(q._id);
                        if (visibleQuestions[qId] === false) return null;
                        return <QuestionRenderer key={q.id || q.questionId || String(q._id)} q={q} sIdx={currentSectionIdx} qIdx={qIdx} questions={questions} answers={answers} isRtl={isRtl} t={t} toggleChoiceForQuestion={toggleChoiceForQuestion} setSingleChoiceForQuestion={setSingleChoiceForQuestion} handleAnswerChange={handleAnswerChange} otherValues={otherValues} setOtherValues={setOtherValues} markInteracted={markInteracted} fieldErrors={fieldErrors} setFieldErrors={setFieldErrors} scrollToNextInGroup={scrollToNextInGroup} survey={survey} handleNextQuestion={handleNextQuestion} showInteractionError={showInteractionError} activeInputIdRef={activeInputIdRef} />;
                      }
                    })}
                  </div>
                );
              })()
            ) : (
              (() => {
                const currentQ = questions[currentIdx];
                if (!currentQ) return <div>No valid question data format found.</div>;

                const qId = currentQ.questionId || String(currentQ._id);
                let sIdx = 0;
                let qIdx = 0;
                let sectionTitle = "";

                if (survey.sections) {
                  sIdx = survey.sections.findIndex(sec =>
                    (sec.questions || []).some(q => (q.id || q.questionId || String(q._id)) === qId)
                  );
                  if (sIdx !== -1) {
                    qIdx = survey.sections[sIdx].questions.findIndex(q => (q.id || q.questionId || String(q._id)) === qId);
                    sectionTitle = survey.sections[sIdx].title;
                  } else {
                    sIdx = 0;
                  }
                }

                return (() => {
                  // If question belongs to a group, render all group siblings together
                  if (currentQ._groupId) {
                    const groupQs = questions.filter(q => q._groupId === currentQ._groupId);
                    const firstInGroup = questions.findIndex(q => q._groupId === currentQ._groupId);
                    const visibleGroupQs = groupQs.filter(gq => {
                      const gqId = gq.id || gq.questionId || String(gq._id);
                      return visibleQuestions[gqId] !== false;
                    });
                    if (visibleGroupQs.length === 0) return null;
                    return (
                      <div key={currentIdx} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {sectionTitle && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'var(--primary-low)', color: 'var(--primary)', borderRadius: '6px', fontSize: '0.9rem', fontWeight: 700, alignSelf: 'flex-start' }}>
                            {sectionTitle}
                          </div>
                        )}
                        <div className="question-group-box">
                          <div className="question-group-header">
                            <span dir="auto">⬡</span>
                            <span dir="auto">{currentQ._groupLabel || (t('questionGroupLabel') || 'Question Group')}</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {visibleGroupQs.map((gq, gi) => {
                              const gqSIdx = survey?.sections ? survey.sections.findIndex(sec =>
                                (sec.questions || []).some(item => {
                                  if (item.type === 'group') return (item.questions || []).some(inner => (inner.id || inner.questionId || String(inner._id)) === (gq.id || gq.questionId || String(gq._id)));
                                  return (item.id || item.questionId || String(item._id)) === (gq.id || gq.questionId || String(gq._id));
                                })
                              ) : 0;
                              let isLocked = false;
                              if (gi > 0) {
                                isLocked = visibleGroupQs.slice(0, gi).some(prevQ => {
                                  if (prevQ.type === 'info' || prevQ.type === 'notice') return false;
                                  const prevQId = prevQ.id || prevQ.questionId || String(prevQ._id);
                                  const val = answers[prevQId];
                                  return val === undefined || val === null || val === '';
                                });
                              }
                              return <QuestionRenderer key={gq.id || gq.questionId || String(gq._id)} q={gq} sIdx={gqSIdx >= 0 ? gqSIdx : 0} qIdx={gi} isLocked={isLocked} questions={questions} answers={answers} isRtl={isRtl} t={t} toggleChoiceForQuestion={toggleChoiceForQuestion} setSingleChoiceForQuestion={setSingleChoiceForQuestion} handleAnswerChange={handleAnswerChange} otherValues={otherValues} setOtherValues={setOtherValues} markInteracted={markInteracted} fieldErrors={fieldErrors} setFieldErrors={setFieldErrors} scrollToNextInGroup={scrollToNextInGroup} survey={survey} handleNextQuestion={handleNextQuestion} showInteractionError={showInteractionError} activeInputIdRef={activeInputIdRef} />;
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={currentIdx} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {sectionTitle && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'var(--primary-low)', color: 'var(--primary)', borderRadius: '6px', fontSize: '0.9rem', fontWeight: 700, alignSelf: 'flex-start' }}>
                          {sectionTitle}
                        </div>
                      )}
                      <QuestionRenderer key={currentQ.id || currentQ.questionId || String(currentQ._id)} q={currentQ} sIdx={sIdx} qIdx={qIdx} questions={questions} answers={answers} isRtl={isRtl} t={t} toggleChoiceForQuestion={toggleChoiceForQuestion} setSingleChoiceForQuestion={setSingleChoiceForQuestion} handleAnswerChange={handleAnswerChange} otherValues={otherValues} setOtherValues={setOtherValues} markInteracted={markInteracted} fieldErrors={fieldErrors} setFieldErrors={setFieldErrors} scrollToNextInGroup={scrollToNextInGroup} survey={survey} handleNextQuestion={handleNextQuestion} showInteractionError={showInteractionError} activeInputIdRef={activeInputIdRef} />
                    </div>
                  );
                })()
              })()
            )}
            {/* Sticky Bottom Action Bar */}
            <div 
              className="survey-bottom-bar sticky bottom-0 z-50 bg-white"
              style={{ 
                position: 'sticky', 
                bottom: 0, 
                zIndex: 50, 
                backgroundColor: 'var(--card-bg)', 
                borderTop: '1px solid var(--border-color)',
                padding: '1rem 2rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                {survey?.layoutMode === 'multi' ? (
                  <>
                    <button dir="auto" className="btn-secondary" onClick={handlePreviousSection} disabled={currentSectionIdx === 0} style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {isRtl ? <ChevronRight size={18} /> : <ChevronLeft size={18} />} {t('previous') || 'Previous'}
                    </button>
                    <button dir="auto" className="btn-primary" onClick={proceedToNextSection} style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {t('next') || 'Next'} {isRtl ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
                    </button>
                  </>
                ) : (
                  <>
                    <button dir="auto" className="btn-secondary" onClick={handlePrevious} disabled={currentIdx === 0} style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {isRtl ? <ChevronRight size={18} /> : <ChevronLeft size={18} />} {t('previous') || 'Previous'}
                    </button>
                    <button dir="auto" className="btn-primary" onClick={() => handleNextQuestion()} disabled={!isCurrentGroupComplete} style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {t('next') || 'Next'} {isRtl ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
                    </button>
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                {lastSaved && (
                  <span dir="auto" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Save size={14} /> Saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                <button dir="auto" className="btn-secondary" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={() => setShowEndCallConfirm(true)}>
                  <PhoneOff size={18} /> End Call
                </button>
              </div>
            </div>
          </div>
          
          {/* End Call Confirmation Modal */}
          {showEndCallConfirm && (
            <div className="modal-overlay">
              <div className="modal-content glass-card fade-enter-active" style={{ maxWidth: '400px' }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem', color: 'var(--danger)' }}>
                  <AlertTriangle size={24} />
                  <h2 dir="auto" style={{ margin: 0 }}>{t('endCallConfirmTitle') || 'End Call?'}</h2>
                </div>
                <p dir="auto" style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                  {t('endCallConfirmDesc') || 'Are you sure you want to end this interview? You will be taken to the submission screen to finalize the outcome.'}
                </p>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                  <button dir="auto" className="btn-secondary" onClick={() => setShowEndCallConfirm(false)}>{t('stayInCall') || 'Stay in Call'}</button>
                  <button dir="auto" className="btn-primary" style={{ backgroundColor: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => { setShowEndCallConfirm(false); goToInterviewStep(); }}>
                    {t('endCallYes') || 'Yes, End Call'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </DebugErrorBoundary>
  );
}
