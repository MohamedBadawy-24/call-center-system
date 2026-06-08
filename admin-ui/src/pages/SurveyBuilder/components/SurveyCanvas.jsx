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
      const newSections = prev.sections.map((sec, idx) => 
        idx === sIdx ? { ...sec, title } : sec
      );
      return { ...prev, sections: newSections };
    });
  };

  const removeSection = (sIdx) => {
    if (!window.confirm("Are you sure you want to remove this entire section and all its questions?")) return;
    updateState(prev => {
      const newSections = prev.sections.filter((_, idx) => idx !== sIdx);
      return { ...prev, sections: newSections };
    });
  };

  const addQuestion = (sIdx) => {
    updateState(prev => {
      const newSections = prev.sections.map((sec, idx) => {
        if (idx !== sIdx) return sec;
        return {
          ...sec,
          questions: [
            ...sec.questions,
            {
              questionId: crypto.randomUUID(),
              text: 'New Question',
              script: '',
              type: 'text',
              category: 'main',
              choices: [],
            }
          ]
        };
      });
      return { ...prev, sections: newSections };
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
