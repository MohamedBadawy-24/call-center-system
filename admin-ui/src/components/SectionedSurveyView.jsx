import React, { useState, useEffect, useContext } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, ChevronLeft } from 'lucide-react';
import { UIContext } from '../context/UIContext';

export default function SectionedSurveyView({
  sections,
  answers,
  visibleQuestions,
  onAnswerChange,
  renderQuestion,
  readOnly = false,
  defaultOpenSectionIdx = 0,
}) {
  const { t, language } = useContext(UIContext);
  const isRtl = language === 'ar';

  const [openSections, setOpenSections] = useState({});

  useEffect(() => {
    if (sections) {
      setOpenSections(
        Object.fromEntries(sections.map((_, i) => [i, i === (defaultOpenSectionIdx ?? 0)]))
      );
    }
  }, [sections, defaultOpenSectionIdx]);

  const toggleSection = (i) => {
    setOpenSections((prev) => ({ ...prev, [i]: !prev[i] }));
  };

  const handleExpandAll = () => {
    setOpenSections(Object.fromEntries(sections.map((_, i) => [i, true])));
  };

  const handleCollapseAll = () => {
    setOpenSections(Object.fromEntries(sections.map((_, i) => [i, false])));
  };

  return (
    <div className="sectioned-survey-view" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Expand/Collapse All buttons */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
        <button
          type="button"
          className="btn-secondary"
          style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem', height: 'auto', background: 'transparent' }}
          onClick={handleExpandAll}
        >
          {t('expandAll')}
        </button>
        <button
          type="button"
          className="btn-secondary"
          style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem', height: 'auto', background: 'transparent' }}
          onClick={handleCollapseAll}
        >
          {t('collapseAll')}
        </button>
      </div>

      {sections.map((sec, sIdx) => {
        const questionsInSec = sec.questions || [];
        // Count visible questions in this section
        const visibleQuestionsInSec = questionsInSec.filter((q) => {
          const qId = q.questionId || String(q._id);
          return visibleQuestions[qId] !== false;
        });

        const isOpen = !!openSections[sIdx];
        const ArrowIcon = isOpen ? ChevronDown : (isRtl ? ChevronLeft : ChevronRight);

        return (
          <div
            key={sIdx}
            id={`survey-section-${sIdx}`}
            className="glass-card"
            style={{
              padding: '1.25rem',
              marginBottom: '1rem',
              border: '1px solid var(--border-color)',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                userSelect: 'none',
              }}
              onClick={() => toggleSection(sIdx)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <ArrowIcon size={18} style={{ color: 'var(--text-secondary)' }} />
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
                  {sec.title || `${t('section') || 'Section'} ${sIdx + 1}`}
                </h3>
              </div>

              {/* Question Count Pill */}
              <div
                className="precall-pill"
                style={{
                  fontSize: '0.8rem',
                  padding: '0.25rem 0.5rem',
                  background: 'var(--primary-low)',
                  color: 'var(--primary)',
                  fontWeight: 700,
                  border: 'none',
                }}
              >
                {visibleQuestionsInSec.length} {t('questionsCount')}
              </div>
            </div>

            {/* Collapsible Panel */}
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  style={{ overflow: 'hidden' }}
                >
                  <div style={{ paddingTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {visibleQuestionsInSec.length === 0 ? (
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontStyle: 'italic', padding: '0.5rem 0' }}>
                        {t('noVisibleQuestions')}
                      </div>
                    ) : (
                      visibleQuestionsInSec.map((question) => {
                        const originalQIdx = questionsInSec.findIndex((q) => (q.questionId || String(q._id)) === (question.questionId || String(question._id)));
                        return (
                          <div
                            key={question.questionId || String(question._id)}
                            id={`question-card-${question.questionId || String(question._id)}`}
                          >
                            {renderQuestion(question, sIdx, originalQIdx)}
                          </div>
                        );
                      })
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

SectionedSurveyView.propTypes = {
  sections: PropTypes.array.isRequired,
  answers: PropTypes.object.isRequired,
  visibleQuestions: PropTypes.object.isRequired,
  onAnswerChange: PropTypes.func.isRequired,
  renderQuestion: PropTypes.func.isRequired,
  readOnly: PropTypes.bool,
  defaultOpenSectionIdx: PropTypes.number,
};
