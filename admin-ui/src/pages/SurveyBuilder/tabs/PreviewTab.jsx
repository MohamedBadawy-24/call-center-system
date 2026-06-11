import React, { useContext, useState, useMemo } from 'react';
import { SurveyBuilderContext } from '../SurveyBuilderContext';
import { UIContext } from '../../../context/UIContext';
import SectionedSurveyView from '../../../components/SectionedSurveyView';
import { evaluateCondition } from '../../../utils/outboundPrecallConfig';
import { Monitor, Smartphone, Tablet } from 'lucide-react';

export default function PreviewTab() {
  const { surveyState } = useContext(SurveyBuilderContext);
  const { t } = useContext(UIContext);
  const [device, setDevice] = useState('desktop');

  // Preview Mode local state for testing branching
  const [answers, setAnswers] = useState({});
  const [otherValues, setOtherValues] = useState({});

  const widthMap = {
    desktop: '100%',
    tablet: '768px',
    mobile: '375px',
  };

  // Compute visibility map for preview questions
  const visibleQuestions = useMemo(() => {
    const map = {};
    (surveyState.sections || []).forEach(sec => {
      (sec.questions || []).forEach(q => {
        const qId = q.questionId || String(q._id);
        if (!q.visibility) {
          map[qId] = true;
        } else {
          try {
            map[qId] = evaluateCondition(q.visibility, answers || {});
          } catch (e) {
            map[qId] = true;
          }
        }
      });
    });
    return map;
  }, [surveyState.sections, answers]);

  // Check if a section is fully answered (all visible questions have a value)
  const isSectionAnswered = (sec) => {
    const questionsInSec = sec.questions || [];
    const visibleQs = questionsInSec.filter(q => {
      const qId = q.questionId || String(q._id);
      return visibleQuestions[qId] !== false;
    });

    if (visibleQs.length === 0) return false;

    return visibleQs.every(q => {
      const qId = q.questionId || String(q._id);
      const ans = answers[qId];
      if (ans === undefined || ans === null || ans === '') return false;
      if (Array.isArray(ans)) {
        const valid = ans.filter(v => typeof v !== 'string' || !v.startsWith('other:') || v.substring(6).trim() !== '');
        return valid.length > 0;
      }
      return true;
    });
  };

  const renderQuestion = (q, sIdx, qIdx) => {
    const qId = q.questionId || String(q._id);
    
    // Evaluate dynamic text
    const parseDynamicText = (text) => {
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

    const dynamicQuestionText = parseDynamicText(q.text);
    const dynamicScriptText = parseDynamicText(q.script);

    const isSelected = (val) => {
      if (val === 'Other' && q.allowMultipleOther) {
        const arr = Array.isArray(answers[qId]) ? answers[qId] : [];
        return arr.some(v => typeof v === 'string' && v.startsWith('other:'));
      }
      if (q.type === 'multiple_choice') return (Array.isArray(answers[qId]) && answers[qId].includes(val));
      return answers[qId] === val;
    };

    const handleToggleChoice = (val) => {
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
      setAnswers(prev => ({ ...prev, [qId]: updated }));
    };

    const handleSetSingleChoice = (val) => {
      if (val === 'Other' && q.allowMultipleOther) {
        setAnswers(prev => ({ ...prev, [qId]: ["other:"] }));
      } else {
        setAnswers(prev => ({ ...prev, [qId]: val }));
      }
    };

    const choices = [...(q.choices || [])];
    if (q.allowOther) choices.push({ text: 'Other', isOther: true });

    return (
      <div className="glass-card" style={{ padding: '1.25rem', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
        <h3 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
          {typeof q.category === 'string' ? q.category.toUpperCase() : t('question')}
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
                  onClick={() => q.type === 'multiple_choice' ? handleToggleChoice(c.text) : handleSetSingleChoice(c.text)}
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
                          return (
                            <div key={idx} style={{ display: 'flex', gap: '0.5rem' }}>
                              <input
                                type="text"
                                className="input-field"
                                placeholder="Please specify..."
                                value={textVal}
                                onChange={(e) => {
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
                                  setAnswers(prev => ({ ...prev, [qId]: newAnswers }));
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
                                  setAnswers(prev => ({ ...prev, [qId]: newAnswers }));
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
                        setAnswers(prev => ({ ...prev, [qId]: [...arr, "other:"] }));
                      }}
                    >
                      {t('addAnother') || '+ Add another'}
                    </button>
                  </div>
                ) : (
                  <input
                     type="text"
                     className="input-field"
                     placeholder="Please specify..."
                     value={otherValues[qId] || ''}
                     onChange={(e) => {
                       setOtherValues(prev => ({ ...prev, [qId]: e.target.value }));
                     }}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {q.type === 'text' && (
          <div className="form-group" style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="text"
              className="input-field"
              placeholder={t('typeAnswer')}
              value={answers[qId] || ''}
              onChange={(e) => setAnswers(prev => ({ ...prev, [qId]: e.target.value }))}
              style={{ flex: 1 }}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%', minHeight: '80vh' }}>
      <div className="glass-card" style={{ display: 'flex', justifyContent: 'center', gap: '1rem', padding: '0.75rem' }}>
        <button 
          className={`btn-secondary ${device === 'desktop' ? 'active' : ''}`}
          onClick={() => setDevice('desktop')}
          style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: device === 'desktop' ? 'var(--primary)' : '', color: device === 'desktop' ? 'white' : '' }}
        >
          <Monitor size={18} /> Desktop
        </button>
        <button 
          className={`btn-secondary ${device === 'tablet' ? 'active' : ''}`}
          onClick={() => setDevice('tablet')}
          style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: device === 'tablet' ? 'var(--primary)' : '', color: device === 'tablet' ? 'white' : '' }}
        >
          <Tablet size={18} /> Tablet
        </button>
        <button 
          className={`btn-secondary ${device === 'mobile' ? 'active' : ''}`}
          onClick={() => setDevice('mobile')}
          style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: device === 'mobile' ? 'var(--primary)' : '', color: device === 'mobile' ? 'white' : '' }}
        >
          <Smartphone size={18} /> Mobile
        </button>
      </div>

      <div style={{ 
        flex: 1, 
        display: 'flex', 
        justifyContent: 'center', 
        background: 'repeating-conic-gradient(#f3f4f6 0% 25%, transparent 0% 50%) 50% / 20px 20px',
        border: '1px solid var(--border-color)', 
        borderRadius: '8px', 
        overflow: 'hidden',
        padding: '2rem 0'
      }}>
        <div style={{ 
          width: widthMap[device], 
          height: '100%', 
          maxHeight: '800px',
          overflowY: 'auto',
          background: 'var(--bg-color)',
          boxShadow: 'var(--shadow-lg)',
          transition: 'width 0.3s ease',
          borderRadius: device !== 'desktop' ? '32px' : '0px',
          border: device !== 'desktop' ? '12px solid #1f2937' : 'none',
          position: 'relative'
        }}>
          <div className="survey-layout" style={{ height: '100%' }}>
            {/* Sections Mini-Map Sidebar */}
            <div className="survey-sidebar open" style={{ borderRight: '1px solid var(--border-color)' }}>
              <h3 style={{ marginBottom: '1rem', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                {t('sections') || 'Sections'}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {(surveyState.sections || []).map((sec, sIdx) => {
                  const isAnswered = isSectionAnswered(sec);
                  return (
                    <button
                      key={sIdx}
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        const el = document.getElementById(`survey-section-${sIdx}`);
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        padding: '0.65rem 0.85rem',
                        fontSize: '0.85rem',
                        textAlign: 'left',
                        borderRadius: 'var(--radius-sm)',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '0.5rem' }}>
                        {sec.title || `${t('section') || 'Section'} ${sIdx + 1}`}
                      </span>
                      {isAnswered && (
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--success)', flexShrink: 0 }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Main Content Area */}
            <div className="survey-main" style={{ height: '100%', overflowY: 'auto' }}>
              <div style={{ padding: '2rem' }}>
                <SectionedSurveyView
                  sections={surveyState.sections || []}
                  answers={answers}
                  visibleQuestions={visibleQuestions}
                  onAnswerChange={() => {}}
                  renderQuestion={renderQuestion}
                  readOnly={true}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
