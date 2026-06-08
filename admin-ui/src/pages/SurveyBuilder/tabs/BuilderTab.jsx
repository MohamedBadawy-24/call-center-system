import React, { useContext, useState } from 'react';
import { SurveyBuilderContext } from '../SurveyBuilderContext';
import SurveySidebar from '../components/SurveySidebar';
import SurveyCanvas from '../components/SurveyCanvas';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';

export default function BuilderTab() {
  const { surveyState, updateState } = useContext(SurveyBuilderContext);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over) return;
    if (active.id === over.id) return;

    // We encode active/over IDs as `${sectionIndex}-${questionIndex}`
    // Or we handle flat IDs. Let's assume active.data and over.data contain section and question indices.
    const activeData = active.data.current;
    const overData = over.data.current;

    if (!activeData || !overData) return;

    if (activeData.type === 'question' && overData.type === 'question') {
      updateState(prev => {
        // Immutable drag reorder — no splice/mutation so StrictMode double-invocation is safe
        const movedItem = prev.sections[activeData.sIdx].questions[activeData.qIdx];

        const newSections = prev.sections.map((sec, si) => {
          // Remove from source
          let qs = sec.questions.filter((_, qi) =>
            !(si === activeData.sIdx && qi === activeData.qIdx)
          );
          // Insert at destination
          if (si === overData.sIdx) {
            // Adjust dest index if source and dest are in the same section and source came before dest
            const destIdx = (activeData.sIdx === overData.sIdx && activeData.qIdx < overData.qIdx)
              ? overData.qIdx - 1
              : overData.qIdx;
            qs = [
              ...qs.slice(0, destIdx),
              movedItem,
              ...qs.slice(destIdx),
            ];
          }
          return { ...sec, questions: qs };
        });

        return { ...prev, sections: newSections };
      });
    }
  };

  return (
    <div style={{ display: 'flex', gap: '1.5rem', height: 'calc(100vh - 140px)', overflow: 'hidden' }}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div style={{ flex: '0 0 280px', height: '100%', overflowY: 'auto' }}>
          <SurveySidebar />
        </div>
        <div style={{ flex: '1', height: '100%', overflowY: 'auto' }}>
          <SurveyCanvas />
        </div>
      </DndContext>
    </div>
  );
}
