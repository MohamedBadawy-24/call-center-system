import React, { useContext } from 'react';
import { SurveyBuilderContext } from '../SurveyBuilderContext';
import QuestionCard from './QuestionCard';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { toast } from 'react-toastify';

export default function SurveyCanvas() {
  const { surveyState, updateState, isAdmin } = useContext(SurveyBuilderContext);

  const updateSectionTitle = (sIdx, title) => {
    updateState(prev => {
      const s = [...prev.sections];
      s[sIdx] = { ...s[sIdx], title };
      return { ...prev, sections: s };
    });
  };

  const removeSection = (sIdx) => {
    if (!window.confirm("Are you sure you want to remove this entire section and all its questions?")) return;
    updateState(prev => ({
      ...prev,
      sections: prev.sections.filter((_, i) => i !== sIdx)
    }));
  };

  const addQuestion = (sIdx) => {
    updateState(prev => {
      const s = [...prev.sections];
      s[sIdx].questions.push({
        questionId: `q_${Date.now()}`,
        text: 'New Question',
        script: '',
        type: 'text',
        category: 'main',
        choices: [],
      });
      return { ...prev, sections: s };
    });
  };

  return (
    <div style={{ paddingRight: '0.5rem', paddingBottom: '4rem' }}>
      {surveyState.sections.map((sec, sIdx) => {
        // Flatten IDs for dnd-kit context
        const questionIds = sec.questions.map(q => q.questionId);

        return (
          <div key={sIdx} className="glass-card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <input 
                className="input-field" 
                style={{ fontSize: '1.25rem', fontWeight: 800, border: 'none', background: 'transparent', padding: 0, boxShadow: 'none' }}
                value={sec.title || ''}
                onChange={e => updateSectionTitle(sIdx, e.target.value)}
                placeholder="Section Title"
                readOnly={!isAdmin}
              />
              {isAdmin && (
                <button type="button" className="btn-secondary" style={{ color: '#ef4444', borderColor: 'transparent' }} onClick={() => removeSection(sIdx)}>
                  Delete Section
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <SortableContext items={questionIds} strategy={verticalListSortingStrategy}>
                {sec.questions.map((q, qIdx) => (
                  <QuestionCard 
                    key={q.questionId} 
                    question={q} 
                    sIdx={sIdx} 
                    qIdx={qIdx} 
                  />
                ))}
              </SortableContext>
            </div>

            {isAdmin && (
              <button 
                type="button" 
                className="btn-secondary" 
                style={{ width: '100%', marginTop: '1rem', borderStyle: 'dashed', display: 'flex', justifyContent: 'center', gap: '0.5rem', padding: '0.75rem' }}
                onClick={() => addQuestion(sIdx)}
              >
                <Plus size={16} /> Add Question
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
