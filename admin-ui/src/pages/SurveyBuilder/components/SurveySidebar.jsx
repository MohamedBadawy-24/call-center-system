import React, { useContext } from 'react';
import { SurveyBuilderContext } from '../SurveyBuilderContext';
import { Hash, AlignLeft, List, CheckSquare, Settings2 } from 'lucide-react';

export default function SurveySidebar() {
  const { surveyState, updateState, isAdmin } = useContext(SurveyBuilderContext);

  const getIcon = (type) => {
    switch(type) {
      case 'text': return <AlignLeft size={14} />;
      case 'single_choice': return <List size={14} />;
      case 'multiple_choice': return <CheckSquare size={14} />;
      case 'number': return <Hash size={14} />;
      default: return <Settings2 size={14} />;
    }
  };

  const scrollToQuestion = (id) => {
    const el = document.getElementById(`q-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="glass-card" style={{ padding: '1rem', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Survey Structure</h3>
        {isAdmin && (
          <button 
            type="button" 
            className="btn-secondary" 
            style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
            onClick={() => updateState(s => ({ ...s, sections: [...s.sections, { title: 'New Section', questions: [] }] }))}
          >
            + Section
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {surveyState.sections.map((sec, sIdx) => (
          <div key={sIdx}>
            <div style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem' }}>
              {sec.title || `Section ${sIdx + 1}`}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', paddingLeft: '0.5rem' }}>
              {sec.questions.length === 0 && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Empty section</div>
              )}
              {sec.questions.map((q, qIdx) => (
                <button
                  key={q.questionId}
                  type="button"
                  onClick={() => scrollToQuestion(q.questionId)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.4rem 0.5rem', border: 'none', background: 'transparent',
                    textAlign: 'left', borderRadius: '4px', cursor: 'pointer',
                    fontSize: '0.8rem', color: 'var(--text-primary)',
                    width: '100%',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ color: 'var(--primary)', opacity: 0.8 }}>{getIcon(q.type)}</span>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {q.questionId} - {q.text || 'Untitled'}
                  </span>
                  {q.required && <span style={{ color: '#ef4444', fontWeight: 'bold' }}>*</span>}
                  {q.visibility && <span style={{ marginLeft: 'auto', display: 'flex', width: '6px', height: '6px', background: '#eab308', borderRadius: '50%' }} title="Has Logic" />}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
